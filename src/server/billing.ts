import 'server-only';
import Stripe from 'stripe';
import { getAdmin, getStripe } from './clients';
import { ApiError } from './errors';
import { BILLING_REFRESH_MS, normalizeSubscription, paidAccess, stripeId, validateCheckout } from './billingPolicy';
import { trackDurableEvent } from '@/utils/posthog-server';
import { hasInternalTestAccess } from './internalTest';

type BillingEvent = { id: string; created: number };

async function binding(subscriptionId: string) {
  const { data, error } = await getAdmin().from('subscriptions').select('*')
    .eq('stripe_subscription_id', subscriptionId).maybeSingle();
  if (error) throw new Error('Billing lookup failed');
  return data;
}

/** Revision fencing protects fresh Stripe reads against concurrent stale writers. */
export async function syncSubscription(subscriptionId: string, expectedUserId?: string, event?: BillingEvent,
  checkout?: Stripe.Checkout.Session) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await binding(subscriptionId);
    if (expectedUserId && existing && existing.user_id !== expectedUserId) {
      throw new ApiError(403, 'Subscription ownership conflict.', 'billing_owner_mismatch');
    }
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    const userId = expectedUserId ?? existing?.user_id ?? subscription.metadata.userId;
    if (!userId) throw new Error('Subscription requires ownership reconciliation');
    if (checkout) validateCheckout(checkout, subscription, userId);
    const snapshot = normalizeSubscription(subscription, userId);
    const { data, error } = await getAdmin().rpc('sync_billing_subscription', {
      p_snapshot: snapshot,
      p_expected_revision: existing?.billing_revision ?? null,
      p_event_id: event?.id ?? null,
      p_event_created: event?.created ?? null,
      p_purchase: checkout ? { session_id: checkout.id, amount_total: checkout.amount_total,
        currency: checkout.currency } : null,
    });
    // PT409 is an application conflict, not a transaction-level 40001 that older
    // PostgREST versions retry indefinitely without refreshing the snapshot.
    if (error?.code === 'PT409') continue;
    if (error?.code === '42501') throw new ApiError(403, 'Subscription ownership conflict.', 'billing_owner_mismatch');
    if (error || !data || !['applied', 'duplicate'].includes(data.result)) throw new Error('Billing persistence failed');
    if (data.subscription?.user_id !== userId || data.subscription?.stripe_subscription_id !== subscriptionId) {
      throw new Error('Billing persistence returned an unexpected binding');
    }
    return data.subscription;
  }
  throw new Error('Concurrent billing update; retry required');
}

export async function verifyCheckout(sessionId: string, userId: string) {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id !== userId) throw new ApiError(403, 'Checkout does not belong to this account.', 'billing_owner_mismatch');
  const id = stripeId(session.subscription);
  if (!id) throw new ApiError(409, 'Checkout subscription is not ready.', 'checkout_pending');
  const subscription = await syncSubscription(id, userId, undefined, session);
  if (!['active', 'trialing'].includes(subscription.status)) throw new ApiError(409, 'Subscription is not active.', 'checkout_pending');
  await deliverPurchaseEvents(id);
  return subscription;
}

export async function refreshUserBilling(userId: string) {
  // Internal testing is separate from Stripe state, including historical demo IDs.
  // Revoked/expired/missing grants still take the ordinary verified billing path.
  if (await hasInternalTestAccess(userId)) return;
  const { data, error } = await getAdmin().from('subscriptions').select('*').eq('user_id', userId);
  if (error) throw new Error('Entitlement lookup failed');
  const rows = data ?? [];
  for (const row of rows) {
    if (!['active', 'trialing', 'past_due', 'incomplete', 'unpaid', 'paused'].includes(row.status)) continue;
    if (!row.stripe_synced_at || Date.now() - Date.parse(row.stripe_synced_at) > BILLING_REFRESH_MS ||
        Date.parse(row.current_period_end ?? '') <= Date.now()) {
      try { await syncSubscription(row.stripe_subscription_id, userId); }
      catch (error) {
        // Only previously verified active access can survive a bounded outage.
        const transient = error instanceof Stripe.errors.StripeConnectionError ||
          error instanceof Stripe.errors.StripeAPIError || error instanceof Stripe.errors.StripeRateLimitError;
        if (!transient || !paidAccess(row)) throw error;
      }
    }
  }
}

export async function deliverPurchaseEvents(subscriptionId: string) {
  try {
  const { data, error } = await getAdmin().from('billing_analytics_outbox').select('*')
    .eq('subscription_id', subscriptionId).is('delivered_at', null);
  if (error) throw new Error('Billing analytics lookup failed');
  for (const row of data ?? []) {
    if (!await trackDurableEvent('checkout_completed', row.user_id, row.properties, row.id, row.created_at)) continue;
    const { data: updated, error: updateError } = await getAdmin().from('billing_analytics_outbox')
      .update({ delivered_at: new Date().toISOString() }).eq('id', row.id).is('delivered_at', null).select('id');
    if (updateError || !updated) throw new Error('Billing analytics acknowledgement failed');
    // A concurrent sender may have acknowledged first; every sender reuses identity/time.
  }
  } catch {
    // Billing is already committed. The protected cron drain retries analytics.
    console.error('[billing] Purchase analytics remains pending');
  }
}
