import { NextResponse } from 'next/server';
import { authenticate, fail, readJson } from '@/server/http';
import { ApiError } from '@/server/errors';
import { getAdmin, getStripe } from '@/server/clients';
import { requireApprovedPrice, returnOrigin } from '@/server/billingPolicy';
import { getPracticeAccess, reserveOperation } from '@/server/practice';
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const user = await authenticate(request);
    const body = await readJson(request, 4_000);
    if (body.userId !== undefined && body.userId !== user.id) throw new ApiError(403, 'Account mismatch.');
    const priceId = requireApprovedPrice(body.priceId);
    const access = await getPracticeAccess(user.id);
    if (access.isPremium || access.isTrialing) throw new ApiError(409, 'You already have a subscription. Manage billing in settings.');
    await reserveOperation(user.id, 'checkout');
    const { data: prior, error } = await getAdmin().from('subscriptions').select('stripe_customer_id')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error('Customer binding lookup failed');
    const stripe = getStripe();
    if (prior) {
      const subscriptions = await stripe.subscriptions.list({ customer: prior.stripe_customer_id, status: 'all', limit: 100 });
      if (subscriptions.data.some(s => !['canceled', 'incomplete_expired'].includes(s.status))) {
        throw new ApiError(409, 'Use the billing portal to manage your existing subscription.');
      }
    }
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || !price.recurring || price.type !== 'recurring') throw new ApiError(400, 'This price is not available.');
    const origin = returnOrigin(body.returnOrigin);
    const session = await stripe.checkout.sessions.create({
      ...(prior ? { customer: prior.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: user.id, mode: 'subscription', line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { metadata: { userId: user.id } },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${origin}/pricing`, allow_promotion_codes: true,
    }, { idempotencyKey: `pitcht-checkout:${user.id}:${priceId}:${Math.floor(Date.now() / 900_000)}` });
    return NextResponse.json({ url: session.url });
  } catch (error) { return fail(error); }
}
