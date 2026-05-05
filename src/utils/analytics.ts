import posthog from 'posthog-js';

/**
 * Lightweight analytics wrapper around PostHog.
 * Falls back silently if PostHog isn't initialized (e.g. missing API key).
 */

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Silently fail if PostHog isn't loaded
  }
}

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    posthog.identify(userId, traits);
  } catch {
    // Silently fail
  }
}

export function resetUser() {
  if (typeof window === 'undefined') return;
  try {
    posthog.reset();
  } catch {
    // Silently fail
  }
}

// Pre-defined events for consistency
export const AnalyticsEvents = {
  // Auth
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  LOGIN_STARTED: 'login_started',
  LOGIN_COMPLETED: 'login_completed',
  LOGOUT: 'logout',

  // Onboarding
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_SKIPPED: 'onboarding_skipped',

  // Session / Interview
  SESSION_STARTED: 'session_started',
  SESSION_COMPLETED: 'session_completed',
  SESSION_ABANDONED: 'session_abandoned',
  QUESTION_ANSWERED: 'question_answered',
  RECORDING_PERMISSION_GRANTED: 'recording_permission_granted',
  RECORDING_PERMISSION_DENIED: 'recording_permission_denied',

  // Upgrade / Pricing
  UPGRADE_CLICKED: 'upgrade_clicked',
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
  CHECKOUT_COMPLETED_PAGE_VIEW: 'checkout_completed_page_view',
  CHECKOUT_CANCELLED: 'checkout_cancelled',
  PAYWALL_SHOWN: 'paywall_shown',

  // Subscription lifecycle (server-side from Stripe webhook)
  SUBSCRIPTION_CREATED: 'subscription_created',
  SUBSCRIPTION_UPDATED: 'subscription_updated',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_SUCCEEDED: 'payment_succeeded',

  // Navigation
  PAGE_VIEW: 'page_view',
  CTA_CLICKED: 'cta_clicked',
} as const;
