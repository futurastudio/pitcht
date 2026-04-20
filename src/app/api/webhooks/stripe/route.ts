import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  createPremiumSubscription,
  cancelSubscription,
  updateSubscriptionStatus,
} from '@/services/subscriptionManager';

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

        // Missing client_reference_id means our checkout creation didn't attach
        // the Supabase user ID. Stripe retrying this event won't change the
        // session payload, so 500 would just burn retry budget. Log every piece
        // of correlating context we have (session id, customer id, email) so
        // on-call can reconcile the payment to a user manually, then 200 to
        // stop retries.
        if (!userId) {
          console.error('[STRIPE_WEBHOOK_ALERT] checkout.session.completed missing client_reference_id — cannot auto-provision, manual reconcile required', {
            sessionId: session.id,
            customerId,
            subscriptionId,
            customerEmail: session.customer_details?.email ?? null,
          });
          return NextResponse.json({ received: true, warning: 'missing_user_id' });
        }

        // Verify the Stripe customer exists in the same environment we're
        // running in. This is a defensive check against test events hitting a
        // live endpoint (or vice versa). There are two sub-cases:
        //
        //   (a) retrieve() throws  — could be transient (network flake) or
        //       permanent (env mismatch / deleted customer that 404s). Return
        //       500 so Stripe retries; a transient error will clear on its
        //       own, and a genuine env mismatch will exhaust retries and
        //       surface in the Stripe dashboard where we can see + fix it.
        //       Previously this branch silently returned 200, meaning a
        //       paying user could lose their subscription with no retry.
        //
        //   (b) customer.deleted === true  — the customer object was
        //       explicitly deleted from Stripe between payment and this
        //       event firing. Very rare. The payment already succeeded, so
        //       the user is owed their Pro access. Log loudly for manual
        //       review and fall through to provisioning. Previously this
        //       branch silently returned 200, same silent-failure problem.
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
          console.error('[STRIPE_WEBHOOK_ALERT] stripe.customers.retrieve failed — returning 500 so Stripe retries. Persistent failure usually indicates a test/live environment mismatch.', {
            sessionId: session.id,
            customerId,
            error: customerError instanceof Error ? customerError.message : String(customerError),
          });
          return NextResponse.json(
            { error: 'Customer verification failed, Stripe will retry' },
            { status: 500 }
          );
        }

        // Get the price ID and billing period from the subscription.
        // NOTE: In Stripe SDK v20, current_period_start/end moved from the
        // top-level subscription object to items.data[0] — always read from there.
        // Any throw below (subscriptions.retrieve, createPremiumSubscription)
        // bubbles to the outer catch which returns 500, which is the correct
        // behaviour: Stripe's retry queue handles transient DB/API blips and
        // createPremiumSubscription is idempotent.
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

        console.log(`✅ Subscription ${customerDeleted ? 'provisioned (customer deleted in Stripe — review)' : 'created'} for user: ${userId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription updated:', subscription.id);

        // In Stripe SDK v20, current_period_end lives on items.data[0], not the top-level object.
        const updatedItem = subscription.items.data[0] as unknown as { current_period_end: number };
        await updateSubscriptionStatus(
          subscription.id,
          subscription.status as 'active' | 'canceled' | 'past_due' | 'trialing',
          new Date(updatedItem.current_period_end * 1000)
        );

        console.log(`✅ Subscription updated: ${subscription.id} → ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription deleted:', subscription.id);

        const userId = subscription.metadata?.userId;
        if (userId) {
          await cancelSubscription(userId);
          console.log(`✅ Subscription cancelled for user: ${userId}`);
        } else {
          console.error('No user ID found in subscription metadata');
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as unknown as { id: string; subscription: string | null; period_end: number };
        console.log('Payment failed for invoice:', invoice.id);

        if (invoice.subscription) {
          await updateSubscriptionStatus(
            invoice.subscription,
            'past_due',
            new Date(invoice.period_end * 1000)
          );
          console.log(`⚠️ Subscription marked as past_due: ${invoice.subscription}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as unknown as { id: string; subscription: string | null; period_end: number };
        console.log('Payment succeeded for invoice:', invoice.id);

        if (invoice.subscription) {
          await updateSubscriptionStatus(
            invoice.subscription,
            'active',
            new Date(invoice.period_end * 1000)
          );
          console.log(`✅ Subscription renewed: ${invoice.subscription}`);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: unknown) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
