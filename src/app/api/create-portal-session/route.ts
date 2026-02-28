import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 30;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  maxNetworkRetries: 1,
});

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * Create Stripe Customer Portal session
 * Allows users to manage their subscription and billing
 */
export async function POST(request: Request) {
  try {
    const { userId, returnOrigin } = await request.json();

    // Validate returnOrigin against an allowlist so Stripe always redirects back
    // to the origin that initiated the request (critical for Electron dev at localhost:3000).
    const ALLOWED_ORIGINS = [
      'https://app.pitcht.us',
      'https://pitchtcom.vercel.app',
      'http://localhost:3000',
    ];
    const validatedOrigin = ALLOWED_ORIGINS.includes(returnOrigin)
      ? returnOrigin
      : (process.env.NEXT_PUBLIC_URL || 'https://app.pitcht.us');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
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
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

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

    // Get user's subscription to find their Stripe customer ID
    const { data: subscription, error } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !subscription) {
      return NextResponse.json(
        { error: 'No active subscription found. Please subscribe to a plan first.' },
        { status: 404 }
      );
    }

    // Verify the customer exists in Stripe before creating portal session
    try {
      await stripe.customers.retrieve(subscription.stripe_customer_id);
    } catch (stripeError: unknown) {
      console.error('Stripe customer not found:', stripeError);
      return NextResponse.json(
        {
          error: 'Your billing account needs to be set up. Please contact support or resubscribe.',
          details: 'Customer ID mismatch - this usually happens when switching between test/live Stripe accounts.'
        },
        { status: 404 }
      );
    }

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${validatedOrigin}/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: unknown) {
    console.error('Error creating portal session:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
