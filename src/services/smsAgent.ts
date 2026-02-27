/**
 * SMS Accountability Agent — Core Service
 *
 * Handles:
 * - Building personalized messages from user's Pitcht session data
 * - Sending outbound SMS via Twilio
 * - Logging every message to sms_messages table (TCPA audit trail)
 * - Deciding WHICH type of message to send (inactivity / weekly recap / score alert)
 */

import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client (uses service role key — bypasses RLS for server queries)
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserSmsContext {
  userId: string;
  phoneNumber: string;
  timezone: string;
  firstName?: string; // Optional — we'll derive from email if not set
  email?: string;
}

export interface SessionMetrics {
  clarityScore: number | null;
  pacingScore: number | null;
  eyeContactPercentage: number | null;
  fillerWordCount: number | null;
  sessionType: string;
  createdAt: string;
}

export type SmsMessageTrigger =
  | 'inactivity_nudge'
  | 'weekly_recap'
  | 'score_milestone'
  | 'score_decline';

// ─── Data Fetching ─────────────────────────────────────────────────────────────

/**
 * Get the last N sessions and their recordings for a user.
 * Uses a two-step query because Supabase JS client cannot filter on
 * joined table columns via .eq() — we fetch session IDs first.
 */
export async function getUserRecentMetrics(userId: string, limit = 5): Promise<SessionMetrics[]> {
  const supabase = getSupabaseAdmin();

  // Step 1: Get the user's session IDs (most recent first)
  const { data: sessions, error: sessionsError } = await supabase
    .from('sessions')
    .select('id, session_type')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50); // fetch more than needed; recordings will be the limiting factor

  if (sessionsError || !sessions || sessions.length === 0) return [];

  const sessionIds = sessions.map(s => s.id);
  const sessionTypeMap: Record<string, string> = {};
  for (const s of sessions) sessionTypeMap[s.id] = s.session_type;

  // Step 2: Get the most recent recordings for those sessions
  const { data, error } = await supabase
    .from('recordings')
    .select('clarity_score, pacing_score, eye_contact_percentage, filler_word_count, created_at, session_id')
    .in('session_id', sessionIds)
    .not('clarity_score', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((r: Record<string, unknown>) => ({
    clarityScore: r.clarity_score as number | null,
    pacingScore: r.pacing_score as number | null,
    eyeContactPercentage: r.eye_contact_percentage as number | null,
    fillerWordCount: r.filler_word_count as number | null,
    sessionType: sessionTypeMap[r.session_id as string] ?? 'interview',
    createdAt: r.created_at as string,
  }));
}

/**
 * Get the most recent session date for a user
 */
export async function getDaysSinceLastSession(userId: string): Promise<number | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('sessions')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  const lastSession = new Date(data.created_at);
  const now = new Date();
  const diffMs = now.getTime() - lastSession.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ─── Message Building ──────────────────────────────────────────────────────────

/**
 * Build the message text based on trigger type and user's real data.
 * All messages are short (under 160 chars when possible), personal, and actionable.
 */
export function buildMessage(
  trigger: SmsMessageTrigger,
  metrics: SessionMetrics[],
  daysSinceLast: number | null,
  firstName?: string
): string {
  const name = firstName ? `${firstName}` : 'Hey';

  if (trigger === 'inactivity_nudge') {
    const days = daysSinceLast ?? 5;
    const last = metrics[0];

    if (!last) {
      return `${name}, it's been ${days} days since your last Pitcht session. A quick 10-min practice now keeps momentum going. pitcht.com`;
    }

    // Find their weakest metric from last session to give a specific nudge
    const scores: Array<{ label: string; value: number | null }> = [
      { label: 'clarity', value: last.clarityScore },
      { label: 'pacing', value: last.pacingScore },
      { label: 'eye contact', value: last.eyeContactPercentage },
    ];
    const weakest = scores
      .filter(s => s.value !== null)
      .sort((a, b) => (a.value ?? 100) - (b.value ?? 100))[0];

    if (weakest && (weakest.value ?? 100) < 70) {
      return `${name}, ${days} days since your last session. Last time your ${weakest.label} was ${Math.round(weakest.value ?? 0)}. One session today can move that needle. pitcht.com`;
    }

    return `${name}, it's been ${days} days. Quick practice session? Your last scores were solid — keep the streak. pitcht.com`;
  }

  if (trigger === 'weekly_recap') {
    if (metrics.length === 0) {
      return `${name}, weekly check-in: no sessions this week. Even one 10-min session makes a difference before your next interview. pitcht.com`;
    }

    // Average the last week's clarity and eye contact
    const avgClarity = Math.round(
      metrics.reduce((sum, m) => sum + (m.clarityScore ?? 0), 0) / metrics.length
    );
    const avgEyeContact = Math.round(
      metrics.reduce((sum, m) => sum + (m.eyeContactPercentage ?? 0), 0) / metrics.length
    );

    // Find trend: compare first half vs second half if we have 4+ sessions
    let trendLine = '';
    if (metrics.length >= 3) {
      const recent = metrics.slice(0, Math.ceil(metrics.length / 2));
      const older = metrics.slice(Math.ceil(metrics.length / 2));
      const recentAvg = recent.reduce((s, m) => s + (m.clarityScore ?? 0), 0) / recent.length;
      const olderAvg = older.reduce((s, m) => s + (m.clarityScore ?? 0), 0) / older.length;
      const diff = Math.round(recentAvg - olderAvg);
      if (diff >= 3) trendLine = ` Clarity is up ${diff} pts.`;
      else if (diff <= -3) trendLine = ` Clarity dipped ${Math.abs(diff)} pts — worth a practice.`;
    }

    return `${name}, this week: ${metrics.length} session${metrics.length > 1 ? 's' : ''}, avg clarity ${avgClarity}/100, eye contact ${avgEyeContact}%.${trendLine} Keep going. pitcht.com`;
  }

  if (trigger === 'score_milestone') {
    const latest = metrics[0];
    if (!latest) return `${name}, you just hit a new personal best on Pitcht! Check your results. pitcht.com`;

    // Find the best metric in the latest session
    const scores: Array<{ label: string; value: number | null }> = [
      { label: 'Clarity', value: latest.clarityScore },
      { label: 'Eye contact', value: latest.eyeContactPercentage },
      { label: 'Pacing', value: latest.pacingScore },
    ];
    const best = scores
      .filter(s => s.value !== null)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];

    if (best && (best.value ?? 0) >= 80) {
      return `${name}, new personal best! ${best.label}: ${Math.round(best.value ?? 0)}/100. That's your strongest session yet. pitcht.com`;
    }
    return `${name}, strong session just logged! Check your feedback and keep the momentum. pitcht.com`;
  }

  if (trigger === 'score_decline') {
    const latest = metrics[0];
    const previous = metrics[1];
    if (!latest || !previous) return '';

    const clarityDrop = (previous.clarityScore ?? 0) - (latest.clarityScore ?? 0);
    if (clarityDrop >= 10) {
      return `${name}, clarity dropped ${Math.round(clarityDrop)} pts this session. That happens — one more practice today usually bounces it back. pitcht.com`;
    }
    return '';
  }

  return '';
}

// ─── Sending ───────────────────────────────────────────────────────────────────

/**
 * Send an SMS via Twilio and log it to the database.
 * Returns true on success, false on failure.
 */
export async function sendSms(
  userId: string,
  phoneNumber: string,
  message: string,
  trigger: SmsMessageTrigger
): Promise<boolean> {
  if (!message) return false;

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error('SMS: Missing Twilio environment variables');
    return false;
  }

  try {
    // Dynamically import twilio (server-only)
    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);

    const msg = await client.messages.create({
      body: message,
      from: fromNumber,
      to: phoneNumber,
    });

    // Log to database
    const supabase = getSupabaseAdmin();
    await supabase.from('sms_messages').insert({
      user_id: userId,
      phone_number: phoneNumber,
      direction: 'outbound',
      message,
      twilio_sid: msg.sid,
      trigger,
      status: 'sent',
    });

    return true;
  } catch (err) {
    console.error('SMS send failed:', err);
    return false;
  }
}

// ─── Timezone Helpers ──────────────────────────────────────────────────────────

/**
 * Check whether current time is within the allowed send window
 * for the user's timezone (9 AM – 8 PM local time).
 *
 * Returns false on any error (invalid timezone, parse failure) so we never
 * accidentally text someone outside their preferred window.
 */
export function isWithinSendWindow(timezone: string): boolean {
  if (!timezone || typeof timezone !== 'string') return false;
  try {
    // Validate the timezone string first by constructing the formatter —
    // an invalid IANA identifier throws a RangeError here.
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hourStr = formatter.format(new Date());
    const hour = parseInt(hourStr, 10);
    if (isNaN(hour)) return false;
    return hour >= 9 && hour < 20; // 9 AM to 8 PM
  } catch {
    return false; // Default to NOT allowed — never text outside window on bad timezone
  }
}

// ─── Opt-out Handler ───────────────────────────────────────────────────────────

/**
 * Mark user as unsubscribed. Called when Twilio delivers a STOP reply.
 */
export async function handleStop(phoneNumber: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('sms_preferences')
    .update({
      sms_opt_in: false,
      sms_unsubscribed_at: new Date().toISOString(),
    })
    .eq('phone_number', phoneNumber);
}
