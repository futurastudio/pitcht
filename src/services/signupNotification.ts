import type { Session } from '@supabase/supabase-js';

/** Best-effort welcome for new, confirmed accounts; the server enforces eligibility. */
export async function notifyNewSignup(session: Session | null) {
  if (!session?.access_token || !session.user.email_confirmed_at) return;
  const age = Date.now() - Date.parse(session.user.created_at);
  if (!Number.isFinite(age) || age < 0 || age >= 24 * 60 * 60 * 1000) return;
  try {
    await fetch('/api/notify-signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: '{}',
      keepalive: true,
    });
  } catch {
    // Delivery must never prevent signup, confirmation, or sign-in.
    console.error('[auth] Signup notification unavailable');
  }
}
