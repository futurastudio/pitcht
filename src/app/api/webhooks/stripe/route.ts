import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  createPremiumSubscription,
  cancelSubscription,
  updateSubscriptionStatus,
} from '@/services/subscriptionManager';
import { trackServerEvent, flushPostHog } from '@/utils/posthog-server';

export const maxDuration = 30;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  maxNetworkRetries: 1,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: Request) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('No signature found in request');
      return NextResponse.json(
        { error: 'No signature found' },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: unknown) {
      console.error('Webhook signature verification failed:', err instanceof Error ? err.message : err);
      return NextResponse.json(
        { error: `Webhook Error: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 }
      );
    }

    console.log(`🔔 Webhook received: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout session completed:', session.id);

        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;
        const userId = session.client_reference_id;
        const amountTotal = session.amount_total ? session.amount_total / 100 : undefined;
        const currency = session.currency;

        if (!userId) {
          console.error('[STRIPE_WEBHOOK_ALERT] checkout.session.completed missing client_reference_id — cannot auto-provision, manual reconcile required', {
            sessionId: session.id,
            customerId,
            subscriptionId,
            customerEmail: session.customer_details?.email ?? null,
          });
          // Still track the event even if we can't link to a user — use email or customerId
          trackServerEvent('checkout_completed', customerId || 'unknown', {
            session_id: session.id,
            subscription_id: subscriptionId,
            customer_id: customerId,
            customer_email: session.customer_details?.email ?? null,
            amount_total: amountTotal,
            currency,
            user_linked: false,
          });
          await flushPostHog();
          return NextResponse.json({ received: true, warning: 'missing_user_id' });
        }

        // Track checkout completion BEFORE provisioning (so event fires even if DB fails)
        trackServerEvent('checkout_completed', userId, {
          session_id: session.id,
          subscription_id: subscriptionId,
          customer_id: customerId,
          customer_email: session.customer_details?.email ?? null,
          amount_total: amountTotal,
          currency,
          user_linked: true,
        });

        let customerDeleted = false;
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer.deleted) {
            customerDeleted = true;
            console.error('[STRIPE_WEBHOOK_ALERT] Stripe customer is deleted but payment succeeded — provisioning subscription anyway, manual review recommended', {
              sessionId: session.id,
              customerId,
              subscriptionId,
              userId,
            });
          } else {
            console.log(`✅ Verified customer exists: ${customerId}`);
          }
        } catch (customerError: unknown) {
          console.error('[STRIPE_WEBHOOK_ALERT] stripe.customers.retrieve failed — returning 500 so Stripe retries.', {
            sessionId: session.id,
            customerId,
            error: customerError instanceof Error ? customerError.message : String(customerError),
          });
          await flushPostHog();
          return NextResponse.json(
            { error: 'Customer verification failed, Stripe will retry' },
            { status: 500 }
          );
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0].price.id;
        const item = subscription.items.data[0] as unknown as { current_period_start: number; current_period_end: number };
        const periodStart = new Date(item.current_period_start * 1000);
        const periodEnd = new Date(item.current_period_end * 1000);

        await createPremiumSubscription(
          userId,
          subscriptionId,
          customerId,
          priceId,
          periodStart,
          periodEnd
        );

        // Track subscription creation
        trackServerEvent('subscription_created', userId, {
          subscription_id: subscriptionId,
          customer_id: customerId,
          price_id: priceId,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          customer_deleted_in_stripe: customerDeleted,
        });

        console.log(`✅ Subscription ${customerDeleted ? 'provisioned (customer deleted in Stripe — review)' : 'created'} for user: ${userId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription updated:', subscription.id);

        const updatedItem = subscription.items.data[0] as unknown as { current_period_end: number };
        await updateSubscriptionStatus(
          subscription.id,
          subscription.status as 'active' | 'canceled' | 'past_due' | 'trialing',
          new Date(updatedItem.current_period_end * 1000)
        );

        // Try to get userId from metadata for tracking
        const userId = subscription.metadata?.userId || subscription.customer as string;
        trackServerEvent('subscription_updated', userId, {
          subscription_id: subscription.id,
          status: subscription.status,
          current_period_end: new Date(updatedItem.current_period_end * 1000).toISOString(),
          cancel_at_period_end: subscription.cancel_at_period_end,
        });

        console.log(`✅ Subscription updated: ${subscription.id} → ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription deleted:', subscription.id);

        const userId = subscription.metadata?.userId;
        if (userId) {
          await cancelSubscription(userId);
          trackServerEvent('subscription_cancelled', userId, {
            subscription_id: subscription.id,
            cancellation_reason: subscription.cancellation_details?.reason || 'unknown',
          });
          console.log(`✅ Subscription cancelled for user: ${userId}`);
        } else {
          console.error('No user ID found in subscription metadata');
          trackServerEvent('subscription_cancelled', subscription.customer as string, {
            subscription_id: subscription.id,
            user_id_missing: true,
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as unknown as { id: string; subscription: string | null; period_end: number; amount_due: number; currency: string };
        console.log('Payment failed for invoice:', invoice.id);

        if (invoice.subscription) {
          await updateSubscriptionStatus(
            invoice.subscription,
            'past_due',
            new Date(invoice.period_end * 1000)
          );

          // Try to lookup user from subscription metadata
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const userId = subscription.metadata?.userId || subscription.customer as string;
          trackServerEvent('payment_failed', userId, {
            invoice_id: invoice.id,
            subscription_id: invoice.subscription,
            amount_due: invoice.amount_due ? invoice.amount_due / 100 : undefined,
            currency: invoice.currency,
          });

          console.log(`⚠️ Subscription marked as past_due: ${invoice.subscription}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as unknown as { id: string; subscription: string | null; period_end: number; amount_paid: number; currency: string };
        console.log('Payment succeeded for invoice:', invoice.id);

        if (invoice.subscription) {
          await updateSubscriptionStatus(
            invoice.subscription,
            'active',
            new Date(invoice.period_end * 1000)
          );

          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const userId = subscription.metadata?.userId || subscription.customer as string;
          trackServerEvent('payment_succeeded', userId, {
            invoice_id: invoice.id,
            subscription_id: invoice.subscription,
            amount_paid: invoice.amount_paid ? invoice.amount_paid / 100 : undefined,
            currency: invoice.currency,
            is_renewal: true,
          });

          console.log(`✅ Subscription renewed: ${invoice.subscription}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    await flushPostHog();
    return NextResponse.json({ received: true });

  } catch (error: unknown) {
    console.error('Webhook handler error:', error);
    await flushPostHog();
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}