import { apiFetch } from '@/utils/api';

export const TRIAL_SESSION_LIMIT = 3;

export interface SubscriptionCheckResult {
  allowed: boolean;
  reason?: string;
  isPremium: boolean;
  isTrialing: boolean;
  entitlementSource?: 'stripe' | 'internal_test' | 'free';
  trialEndsAt: Date | null;
  sessionsThisMonth: number;
  sessionsRemaining: number;
}

/** Display state comes from the same server policy that guards paid operations. */
export async function canUserStartSession(userId: string): Promise<SubscriptionCheckResult> {
  const response = await apiFetch('/api/practice-access', { method: 'GET' });
  const result = await response.json();
  if (!response.ok || result.userId !== userId || typeof result.allowed !== 'boolean') {
    throw new Error(result.error || 'Access could not be verified. Please try again.');
  }
  return { ...result, trialEndsAt: result.trialEndsAt ? new Date(result.trialEndsAt) : null };
}
