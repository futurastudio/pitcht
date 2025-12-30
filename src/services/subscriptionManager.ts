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

    // Get user to check trial status
    const { data: { user } } = await supabase.auth.getUser();
    const trialEnd = user?.user_metadata?.trial_end;

    // Check if user is in trial period
    if (trialEnd && new Date(trialEnd) > new Date()) {
      return {
        allowed: true,
        isPremium: false,
        isTrialing: true,
        trialEndsAt: new Date(trialEnd),
        sessionsThisMonth: 0,
        sessionsRemaining: -1, // Unlimited during trial
      };
    }

    // Free tier: Check monthly limit (1 session per month)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString());

    const sessionsThisMonth = count || 0;
    const FREE_TIER_LIMIT = 1;

    if (sessionsThisMonth >= FREE_TIER_LIMIT) {
      return {
        allowed: false,
        reason: `You've used your ${FREE_TIER_LIMIT} free session this month. Upgrade to Premium for unlimited practice.`,
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
      sessionsRemaining: FREE_TIER_LIMIT - sessionsThisMonth,
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
