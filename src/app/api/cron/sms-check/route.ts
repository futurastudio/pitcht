/**
 * GET /api/cron/sms-check
 *
 * Vercel Cron Job — runs daily at 17:00 UTC (5 PM UTC / noon Eastern).
 * Scans all opted-in users and decides which (if any) deserve a message today.
 *
 * Decision logic per user:
 *   1. Inactivity nudge   — hasn't practiced in 3+ days
 *   2. Score milestone    — latest session has a personal best (any metric ≥ 85)
 *   3. Score decline      — latest clarity score dropped 10+ points vs. prior session
 *   4. Weekly recap       — Monday only, summarizes last 7 days
 *   (At most ONE message per user per day — checked via sms_messages table)
 *
 * Send logic is inlined here (not delegated via HTTP) to avoid Vercel
 * serverless self-referential fetch timeouts and DNS resolution delays.
 *
 * Protected by Vercel's cron secret (Authorization: Bearer CRON_SECRET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getUserRecentMetrics,
  getDaysSinceLastSession,
  buildMessage,
  sendSms,
  isWithinSendWindow,
  SmsMessageTrigger,
} from '@/services/smsAgent';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel cron jobs send this header automatically when CRON_SECRET is set
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const results = { sent: 0, skipped: 0, errors: 0, total: 0 };

  // Get all opted-in users with phone numbers
  const { data: optedIn, error } = await supabase
    .from('sms_preferences')
    .select('user_id, phone_number, timezone')
    .eq('sms_opt_in', true)
    .is('sms_unsubscribed_at', null)
    .not('phone_number', 'is', null);

  if (error || !optedIn) {
    console.error('SMS cron: failed to fetch opted-in users', error);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  results.total = optedIn.length;
  const isMonday = new Date().getDay() === 1;

  for (const user of optedIn) {
    try {
      // Respect timezone send window (9 AM – 8 PM local time) — skip if outside
      if (!isWithinSendWindow(user.timezone)) {
        results.skipped++;
        continue;
      }

      // Check if we already sent this user a message today using their LOCAL calendar date.
      // The cron now runs 4x/day — without this fix a user at UTC-10 could be texted just
      // after midnight UTC (which is still "yesterday" in their timezone).
      //
      // Strategy: derive the start of "today" in the user's timezone by formatting the
      // current UTC instant as a YYYY-MM-DD string in their local tz, then converting
      // that date back to a UTC ISO string. Any outbound message with sent_at ≥ that
      // value means we've already texted them today.
      let localTodayStart: Date;
      try {
        // e.g. "2025-02-28" for the user's current calendar date
        const localDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: user.timezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date()); // "YYYY-MM-DD" format

        // Reparse as midnight UTC of that local date for the DB query threshold
        localTodayStart = new Date(`${localDateStr}T00:00:00Z`);
      } catch {
        // Fallback: use UTC midnight if timezone parsing fails
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        localTodayStart = todayStart;
      }

      const { data: todayMessages } = await supabase
        .from('sms_messages')
        .select('id')
        .eq('user_id', user.user_id)
        .eq('direction', 'outbound')
        .gte('sent_at', localTodayStart.toISOString())
        .limit(1);

      if (todayMessages && todayMessages.length > 0) {
        results.skipped++;
        continue; // Already texted today — skip
      }

      // Fetch session data for this user
      const [metrics, daysSinceLast] = await Promise.all([
        getUserRecentMetrics(user.user_id, 5),
        getDaysSinceLastSession(user.user_id),
      ]);

      // Determine trigger type — evaluated in priority order, first match wins
      let trigger: SmsMessageTrigger | null = null;

      if (daysSinceLast !== null && daysSinceLast >= 5) {
        // Priority 1: Inactivity nudge (5+ days without a session)
        trigger = 'inactivity_nudge';
      } else if (metrics.length >= 1) {
        const latest = metrics[0];
        const hasMilestone = [
          latest.clarityScore,
          latest.eyeContactPercentage,
          latest.pacingScore,
        ].some(v => v !== null && v >= 85);

        if (hasMilestone) {
          // Priority 2: Score milestone
          trigger = 'score_milestone';
        } else if (metrics.length >= 2) {
          // Priority 3: Score decline (clarity dropped 10+ pts from prior session)
          const prior = metrics[1];
          const drop = (prior.clarityScore ?? 0) - (latest.clarityScore ?? 0);
          if (drop >= 10) trigger = 'score_decline';
        }
      }

      // Priority 4: Weekly recap on Mondays (only if no higher-priority trigger)
      if (!trigger && isMonday) {
        trigger = 'weekly_recap';
      }

      if (!trigger) {
        results.skipped++;
        continue;
      }

      // Derive display name from Supabase auth (best-effort — fall back to empty)
      let displayName: string | undefined;
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(user.user_id);
        const email = authUser?.user?.email ?? '';
        const firstName = email.split('@')[0].split('.')[0];
        displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
      } catch {
        // Non-fatal — buildMessage handles undefined firstName gracefully
      }

      // Build and send the message inline (no HTTP self-call)
      const message = buildMessage(trigger, metrics, daysSinceLast, displayName);
      if (!message) {
        results.skipped++;
        continue;
      }

      const sent = await sendSms(user.user_id, user.phone_number, message, trigger);
      if (sent) results.sent++;
      else results.errors++;

    } catch (err) {
      console.error(`SMS cron: error processing user ${user.user_id}`, err);
      results.errors++;
    }
  }

  console.log('SMS cron complete:', results);
  return NextResponse.json(results);
}
