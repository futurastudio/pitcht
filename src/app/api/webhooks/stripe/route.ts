import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import {
  createPremiumSubscription,
  cancelSubscription,
  updateSubscriptionStatus,
} from '@/services/subscriptionManager';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

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
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return NextResponse.json(
        { error: `Webhook Error: ${err.message}` },
        { status: 400 }
      );
    }

    console.log(`🔔 Webhook received: ${event.type}`);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout session completed:', session.id);

        // Get subscription details
        const subscriptionId = session.subscription as string;
        const customerId = session.customer as string;
        const userId = session.client_reference_id;

        if (!userId) {
          console.error('No user ID found in session');
          break;
        }

        // SECURITY: Verify customer exists in current Stripe environment before saving
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer.deleted) {
            console.error(`❌ Customer ${customerId} is deleted - skipping subscription creation`);
            break;
          }
          console.log(`✅ Verified customer exists: ${customerId}`);
        } catch (customerError: any) {
          console.error(`❌ Customer validation failed for ${customerId}:`, customerError.message);
          console.error('⚠️  This usually means test/live environment mismatch - subscription NOT saved to database');
          // Do not create subscription if customer doesn't exist
          break;
        }

        // Get the price ID from the subscription
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0].price.id;

        // Create subscription in database
        await createPremiumSubscription(
          userId,
          subscriptionId,
          customerId,
          priceId
        );

        console.log(`✅ Subscription created for user: ${userId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;
        console.log('Subscription updated:', subscription.id);

        await updateSubscriptionStatus(
          subscription.id,
          subscription.status as any,
          new Date(subscription.current_period_end * 1000)
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
        const invoice = event.data.object as any;
        console.log('Payment failed for invoice:', invoice.id);

        if (invoice.subscription) {
          await updateSubscriptionStatus(
            invoice.subscription as string,
            'past_due',
            new Date(invoice.period_end * 1000)
          );
          console.log(`⚠️ Subscription marked as past_due: ${invoice.subscription}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as any;
        console.log('Payment succeeded for invoice:', invoice.id);

        if (invoice.subscription) {
          await updateSubscriptionStatus(
            invoice.subscription as string,
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
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
