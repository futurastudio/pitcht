import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Create Supabase client with service role key for server-side operations
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
 * Verify and sync subscription from Stripe
 * This is a safety net in case webhooks fail or are delayed
 */
export async function POST(request: Request) {
  try {
    const { sessionId, userId } = await request.json();

    if (!sessionId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
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

    // Check if subscription already exists in database (using admin client)
    const { data: existingSubscription, error: checkError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Log for debugging
    if (checkError) {
      console.log('⚠️  Error checking existing subscription:', checkError);
    }

    if (existingSubscription) {
      console.log('✅ Subscription already exists in database:', existingSubscription.id);
      return NextResponse.json({
        success: true,
        message: 'Subscription already exists',
        subscription: existingSubscription,
      });
    }

    // Retrieve the checkout session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    if (!session.subscription) {
      return NextResponse.json(
        { error: 'No subscription found in session' },
        { status: 404 }
      );
    }

    const subscription = session.subscription as Stripe.Subscription;

    // Only create if subscription is active or trialing
    if (subscription.status === 'active' || subscription.status === 'trialing') {
      const priceId = subscription.items.data[0].price.id;
      const customerId = session.customer as string;

      // SECURITY: Verify customer exists in current Stripe environment before saving
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
          return NextResponse.json(
            { error: 'Customer account is deleted. Please contact support.' },
            { status: 400 }
          );
        }
        console.log(`✅ Verified customer exists: ${customerId}`);
      } catch (customerError: unknown) {
        console.error(`❌ Customer validation failed for ${customerId}:`, customerError instanceof Error ? customerError.message : customerError);
        return NextResponse.json(
          {
            error: 'Unable to verify billing account. This may indicate a test/live environment mismatch.',
            details: 'Please contact support or resubscribe from the Pricing page.'
          },
          { status: 400 }
        );
      }

      console.log(`📝 Creating subscription in database for user: ${userId}`);

      // Create subscription in database (using admin client to bypass RLS)
      // Note: Using bracket notation to access properties that exist at runtime but may not be in TypeScript types
      const subscriptionData = subscription as unknown as { current_period_start: number; current_period_end: number };
      const { data: newSubscription, error: insertError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: userId,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: customerId,
          stripe_price_id: priceId,
          status: subscription.status,
          current_period_start: new Date(subscriptionData.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscriptionData.current_period_end * 1000).toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('❌ Error creating subscription:', insertError);
        throw insertError;
      }

      console.log(`✅ Subscription synced via verify endpoint for user: ${userId}`);

      return NextResponse.json({
        success: true,
        message: 'Subscription created successfully',
        subscription: newSubscription,
      });
    }

    return NextResponse.json(
      { error: `Subscription status is ${subscription.status}` },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error('Error verifying subscription:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
