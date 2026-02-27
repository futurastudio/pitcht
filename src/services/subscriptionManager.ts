/**
 * Subscription Manager Service
 * Handles premium subscriptions, trial periods, and free tier limits
 */

import { supabase } from './supabase';

export interface SubscriptionCheckResult {
  allowed: boolean;
  reason?: string;
  isPremium: boolean;
  isTrialing: boolean;
  trialEndsAt: Date | null;
  sessionsThisMonth: number;
  sessionsRemaining: number;
}

/**
 * Check if user can start a new session
 * Enforces: 1 session/month for free tier, unlimited for trial/premium
 */
export async function canUserStartSession(userId: string): Promise<SubscriptionCheckResult> {
  try {
    // Check if user has active premium subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (subscription) {
      return {
        allowed: true,
        isPremium: true,
        isTrialing: false,
        trialEndsAt: null,
        sessionsThisMonth: 0,
        sessionsRemaining: -1, // Unlimited
      };
    }

    // Check if user has an active trial via the subscriptions table
    // (Stripe writes status='trialing' via webhook when trial_period_days is set)
    const { data: trialSubscription } = await supabase
      .from('subscriptions')
      .select('current_period_end')
      .eq('user_id', userId)
      .eq('status', 'trialing')
      .single();

    if (trialSubscription) {
      return {
        allowed: true,
        isPremium: false,
        isTrialing: true,
        trialEndsAt: new Date(trialSubscription.current_period_end),
        sessionsThisMonth: 0,
        sessionsRemaining: -1, // Unlimited during trial
      };
    }

    // Free trial: 1 completed session lifetime.
    // Only count completed sessions — an abandoned/in-progress session does not
    // consume the trial so users aren't permanently locked out by a refresh or crash.
    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed');

    const sessionsThisMonth = count || 0;
    // Trial users get exactly 1 session total (counted lifetime, not per-month)
    const TRIAL_SESSION_LIMIT = 1;

    if (sessionsThisMonth >= TRIAL_SESSION_LIMIT) {
      return {
        allowed: false,
        reason: `Your free trial session has been used. Upgrade to Pro for unlimited practice.`,
        isPremium: false,
        isTrialing: false,
        trialEndsAt: null,
        sessionsThisMonth,
        sessionsRemaining: 0,
      };
    }

    return {
      allowed: true,
      isPremium: false,
      isTrialing: false,
      trialEndsAt: null,
      sessionsThisMonth,
      sessionsRemaining: TRIAL_SESSION_LIMIT - sessionsThisMonth,
    };
  } catch (error) {
    console.error('Error checking session limit:', error);
    // Fail open - allow session but log error
    return {
      allowed: true,
      isPremium: false,
      isTrialing: false,
      trialEndsAt: null,
      sessionsThisMonth: 0,
      sessionsRemaining: 1,
    };
  }
}

/**
 * Create premium subscription for user
 * Called after successful Stripe payment
 */
export async function createPremiumSubscription(
  userId: string,
  stripeSubscriptionId: string,
  stripeCustomerId: string,
  priceId: string
): Promise<void> {
  const { error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    stripe_subscription_id: stripeSubscriptionId,
    stripe_customer_id: stripeCustomerId,
    stripe_price_id: priceId,
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  });

  if (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }
}

/**
 * Cancel premium subscription
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

/**
 * Get user's subscription details
 */
export async function getSubscriptionDetails(userId: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows returned (user has no subscription)
    console.error('Error fetching subscription:', error);
    throw error;
  }

  return data;
}

/**
 * Update subscription status from Stripe webhook
 * Used when subscription is updated (renewal, status change, etc.)
 */
export async function updateSubscriptionStatus(
  stripeSubscriptionId: string,
  status: 'active' | 'canceled' | 'past_due' | 'trialing',
  currentPeriodEnd: Date
): Promise<void> {
  console.log(`🔄 Updating subscription status: ${stripeSubscriptionId} → ${status}`);

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status,
      current_period_end: currentPeriodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', stripeSubscriptionId);

  if (error) {
    console.error('Subscription update error:', error);
    throw new Error(`Failed to update subscription: ${error.message}`);
  }

  console.log(`✅ Subscription status updated to: ${status}`);
}
