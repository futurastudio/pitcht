import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Extend Vercel function timeout beyond the default 10s.
// Stripe calls can take 3-5s on cold starts; with 2 retries that exceeds 10s.
export const maxDuration = 30;

// Validate required env vars at module load time so misconfiguration is
// immediately visible in Vercel Function logs rather than as a cryptic Stripe error.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_URL;

if (!STRIPE_SECRET_KEY) {
  console.error('[create-checkout-session] FATAL: STRIPE_SECRET_KEY is not set');
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('[create-checkout-session] FATAL: Supabase env vars are missing');
}
if (!APP_URL) {
  console.warn('[create-checkout-session] WARNING: NEXT_PUBLIC_URL is not set — success/cancel URLs will be broken');
}

// maxNetworkRetries: 1 (not 0) — allow one retry for transient errors,
// but the default of 2 retries × ~4s each = 12s+ which exceeds Vercel's
// default 10s timeout, causing StripeConnectionError on cold starts.
const stripe = new Stripe(STRIPE_SECRET_KEY ?? '', {
  maxNetworkRetries: 1,
});

const supabase = createClient(
  SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {

    const { priceId, userId, returnOrigin } = await request.json();

    // Validate returnOrigin against an allowlist — never trust arbitrary client URLs.
    // This ensures Stripe always redirects back to the origin that initiated checkout
    // (critical for Electron dev where the app lives at localhost:3000, not app.pitcht.us).
    const ALLOWED_ORIGINS = [
      'https://app.pitcht.us',
      'https://pitchtcom.vercel.app',
      'http://localhost:3000',
    ];
    const validatedOrigin = ALLOWED_ORIGINS.includes(returnOrigin)
      ? returnOrigin
      : (process.env.NEXT_PUBLIC_URL || 'https://app.pitcht.us');

    if (!priceId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: priceId or userId' },
        { status: 400 }
      );
    }

    // Guard against the case where the NEXT_PUBLIC_STRIPE_PRICE_* env var was not
    // set at build time — Next.js bakes NEXT_PUBLIC_ vars into the client bundle,
    // so a missing var becomes the literal string "undefined" after substitution.
    if (priceId === 'undefined' || !priceId.startsWith('price_')) {
      console.error('[create-checkout-session] Invalid priceId received:', priceId, '— NEXT_PUBLIC_STRIPE_PRICE_MONTHLY or NEXT_PUBLIC_STRIPE_PRICE_ANNUAL may not be set in Vercel env vars');
      return NextResponse.json(
        { error: 'Invalid price configuration. Please contact support.' },
        { status: 400 }
      );
    }

    // SECURITY: Verify the authenticated user matches the userId in the request
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Missing authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authUser) {
      return NextResponse.json(
        { error: 'Invalid or expired authentication token' },
        { status: 401 }
      );
    }

    // CRITICAL: Verify userId matches authenticated user
    if (authUser.id !== userId) {
      return NextResponse.json(
        { error: 'Unauthorized - user ID mismatch' },
        { status: 403 }
      );
    }

    // Get user email from Supabase
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user already has an active or trialing subscription
    const { data: existingSubscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSubscription) {
      return NextResponse.json(
        { error: 'You already have an active subscription' },
        { status: 400 }
      );
    }

    // Reuse existing Stripe customer ID if the user has a prior (cancelled) subscription,
    // otherwise create a new customer via email. This prevents duplicate Stripe customers.
    const { data: anyPriorSubscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const customerParam = anyPriorSubscription?.stripe_customer_id
      ? { customer: anyPriorSubscription.stripe_customer_id }
      : { customer_email: user.email };

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      ...customerParam,
      client_reference_id: userId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          userId: userId,
        },
      },
      success_url: `${validatedOrigin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${validatedOrigin}/pricing`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: unknown) {
    // Log the full Stripe error details so they appear in Vercel Function logs
    if (error instanceof Stripe.errors.StripeError) {
      console.error('[create-checkout-session] Stripe error:', {
        type: error.type,
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        requestId: error.requestId,
      });
      return NextResponse.json(
        { error: `Stripe error (${error.type}): ${error.message}` },
        { status: 500 }
      );
    }

    console.error('[create-checkout-session] Unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
