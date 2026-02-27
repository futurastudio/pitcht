/**
 * POST /api/sms/send
 *
 * Internal endpoint — sends a proactive SMS to a single opted-in user.
 * Called by the cron job (/api/cron/sms-check).
 * Protected by CRON_SECRET so only the scheduler can call it.
 *
 * Body: { userId, trigger }
 *
 * Response shape (always 200 unless auth/input error):
 *   { sent: boolean, skipped?: boolean, reason?: string, message?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getUserRecentMetrics,
  getDaysSinceLastSession,
  buildMessage,
  sendSms,
  isWithinSendWindow,
} from '@/services/smsAgent';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Verify internal cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let userId: string, trigger: string;
  try {
    const body = await req.json();
    userId = body.userId;
    trigger = body.trigger;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!userId || !trigger) {
    return NextResponse.json({ error: 'Missing userId or trigger' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // Fetch SMS preferences for this user
  const { data: prefs, error: prefsError } = await supabase
    .from('sms_preferences')
    .select('phone_number, sms_opt_in, sms_unsubscribed_at, timezone')
    .eq('user_id', userId)
    .maybeSingle(); // Returns null (not error) when no row — avoids crash on first-time users

  if (prefsError) {
    console.error('sms/send: DB error fetching prefs for', userId, prefsError);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!prefs) {
    return NextResponse.json({ sent: false, skipped: true, reason: 'no_prefs_row' });
  }

  // Guard: user must be opted in and have a phone number
  if (!prefs.sms_opt_in || prefs.sms_unsubscribed_at || !prefs.phone_number) {
    return NextResponse.json({ sent: false, skipped: true, reason: 'not_opted_in' });
  }

  // Guard: respect timezone send window (9 AM – 8 PM local time)
  if (!isWithinSendWindow(prefs.timezone)) {
    return NextResponse.json({ sent: false, skipped: true, reason: 'outside_send_window' });
  }

  // Fetch user's session data
  const [metrics, daysSinceLast] = await Promise.all([
    getUserRecentMetrics(userId, 5),
    getDaysSinceLastSession(userId),
  ]);

  // Get first name from email (e.g. "jose@..." → "Jose") — best-effort
  let displayName: string | undefined;
  try {
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (!authError && authUser?.user?.email) {
      const firstName = authUser.user.email.split('@')[0].split('.')[0];
      displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    }
  } catch {
    // Non-fatal — buildMessage handles undefined gracefully
  }

  // Build the message
  const message = buildMessage(
    trigger as Parameters<typeof buildMessage>[0],
    metrics,
    daysSinceLast,
    displayName
  );

  if (!message) {
    return NextResponse.json({ sent: false, skipped: true, reason: 'no_message_generated' });
  }

  // Send it
  const sent = await sendSms(userId, prefs.phone_number, message, trigger as Parameters<typeof sendSms>[3]);

  return NextResponse.json({ sent, skipped: !sent, message });
}
