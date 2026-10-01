import type Stripe from 'stripe';
import { ApiError } from './errors';

export const BILLING_REFRESH_MS = 60 * 60 * 1000;
export const BILLING_GRACE_MS = 72 * 60 * 60 * 1000;
export const FREE_SESSION_LIMIT = 3;

export function allowedPriceIds(env = process.env): Set<string> {
  const ids = [env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY, env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL,
    ...(env.STRIPE_ALLOWED_PRICE_IDS ?? '').split(',')].filter((id): id is string => !!id?.trim());
  if (!ids.length || ids.some(id => !/^price_[a-zA-Z0-9]+$/.test(id.trim()))) {
    throw new Error('Approved billing prices are not configured');
  }
  return new Set(ids.map(id => id.trim()));
}

export function requireApprovedPrice(id: unknown) {
  if (typeof id !== 'string' || !allowedPriceIds().has(id)) {
    throw new ApiError(400, 'This price is not available.', 'invalid_price');
  }
  return id;
}

export function stripeId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id ?? null;
}

export function validateCheckout(session: Stripe.Checkout.Session, subscription: Stripe.Subscription, userId: string) {
  if (session.client_reference_id !== userId || subscription.metadata.userId !== userId) {
    throw new ApiError(403, 'Checkout does not belong to this account.', 'billing_owner_mismatch');
  }
  if (session.mode !== 'subscription' || session.status !== 'complete' ||
      !['paid', 'no_payment_required'].includes(session.payment_status) ||
      stripeId(session.subscription) !== subscription.id ||
      stripeId(session.customer) !== stripeId(subscription.customer)) {
    throw new ApiError(409, 'Checkout payment is not complete.', 'checkout_pending');
  }
  normalizeSubscription(subscription, userId);
}

export function normalizeSubscription(subscription: Stripe.Subscription, userId: string) {
  if (subscription.metadata.userId && subscription.metadata.userId !== userId) {
    throw new ApiError(403, 'Subscription ownership conflict.', 'billing_owner_mismatch');
  }
  if (subscription.items.data.length !== 1) throw new ApiError(409, 'Unsupported subscription configuration.');
  const item = subscription.items.data[0];
  requireApprovedPrice(item.price.id);
  const customer = stripeId(subscription.customer);
  if (!customer || !Number.isFinite(item.current_period_start) || !Number.isFinite(item.current_period_end) ||
      item.current_period_end <= item.current_period_start) throw new Error('Invalid subscription period');
  return {
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customer,
    stripe_price_id: item.price.id,
    status: subscription.status,
    current_period_start: new Date(item.current_period_start * 1000).toISOString(),
    current_period_end: new Date(item.current_period_end * 1000).toISOString(),
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
  };
}

export interface EntitlementRow {
  status: string;
  current_period_end: string | null;
  stripe_synced_at: string | null;
}

export function paidAccess(row: EntitlementRow, now = Date.now()) {
  const end = Date.parse(row.current_period_end ?? '');
  const synced = Date.parse(row.stripe_synced_at ?? '');
  if (!['active', 'trialing'].includes(row.status) || !Number.isFinite(end) || !Number.isFinite(synced) || now - synced > BILLING_GRACE_MS) return false;
  // Grace is bounded by both expiry and a recent successful Stripe verification.
  // Unverified legacy rows and canceled/past_due subscriptions never receive grace.
  return end > now || (row.status === 'active' && now - end <= BILLING_GRACE_MS && now - synced <= BILLING_GRACE_MS);
}

export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = invoice as Stripe.Invoice & { subscription?: string | { id: string } | null };
  return stripeId(invoice.parent?.subscription_details?.subscription) ?? stripeId(legacy.subscription);
}

export function returnOrigin(value: unknown) {
  const origins = ['https://app.pitcht.us', 'https://pitcht.us', 'https://www.pitcht.us', 'https://pitcht.vercel.app'];
  if (process.env.NODE_ENV !== 'production') origins.push('http://localhost:3000');
  const configured = process.env.NEXT_PUBLIC_URL;
  if (configured) origins.push(new URL(configured).origin);
  return typeof value === 'string' && origins.includes(value) ? value : origins[0];
}
