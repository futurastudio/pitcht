import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/server/clients';
import { deliverPurchaseEvents, syncSubscription } from '@/server/billing';
import { invoiceSubscriptionId, stripeId } from '@/server/billingPolicy';
export const maxDuration = 30;

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  if (!secret) return NextResponse.json({ error: 'Webhook unavailable' }, { status: 503 });
  let event: Stripe.Event;
  try { event = getStripe().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return NextResponse.json({ error: 'Invalid signature' }, { status: 400 }); }
  try {
    let id: string | null = null;
    let checkout: Stripe.Checkout.Session | undefined;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        checkout = event.data.object as Stripe.Checkout.Session;
        if (checkout.mode !== 'subscription' || !['paid', 'no_payment_required'].includes(checkout.payment_status)) {
          return NextResponse.json({ received: true, pending: true });
        }
        id = stripeId(checkout.subscription);
        if (!id || !checkout.client_reference_id) throw new Error('Checkout requires reconciliation');
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        id = (event.data.object as Stripe.Subscription).id;
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        id = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
        break;
      default: return NextResponse.json({ received: true, ignored: true });
    }
    if (!id) return NextResponse.json({ received: true, ignored: true });
    // Fetch current state; never infer subscription status from an invoice alone.
    await syncSubscription(id, checkout?.client_reference_id ?? undefined, { id: event.id, created: event.created }, checkout);
    await deliverPurchaseEvents(id);
    return NextResponse.json({ received: true });
  } catch {
    console.error('[stripe-webhook] Persistence failed; event must be retried');
    return NextResponse.json({ error: 'Webhook processing failed; retry required' }, { status: 500 });
  }
}
