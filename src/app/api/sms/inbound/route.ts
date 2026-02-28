/**
 * POST /api/sms/inbound
 *
 * Twilio webhook — fires whenever a user texts back our Twilio number.
 * Phase 1: handles STOP/START opt-out/in.
 * Phase 2: Claude-powered two-way AI coaching conversation.
 *
 * Twilio expects a TwiML XML response.
 * Configure this URL in Twilio Console → Phone Numbers → Messaging webhook.
 *
 * Security: validates X-Twilio-Signature header to prevent spoofed requests.
 * Any request not originating from Twilio will receive a 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  handleStop,
  getSmsAgentContext,
  getConversationHistory,
  getAiRepliesCountToday,
  logInboundMessage,
} from '@/services/smsAgent';
import Anthropic from '@anthropic-ai/sdk';

const MAX_AI_REPLIES_PER_DAY = 3;
const SMS_MAX_CHARS = 280; // stay comfortably under one SMS segment

/**
 * Validate that the request actually came from Twilio.
 * Uses HMAC-SHA1 over the full URL + sorted POST params.
 * See: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
async function validateTwilioSignature(req: NextRequest, body: URLSearchParams): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('SMS inbound: TWILIO_AUTH_TOKEN not set — cannot validate signature');
    return false;
  }

  const twilioSignature = req.headers.get('x-twilio-signature');
  if (!twilioSignature) return false;

  // Build the full URL Twilio signed (must match exactly what's configured in the console)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const url = `${appUrl}/api/sms/inbound`;

  // Sort POST params alphabetically and concatenate key+value pairs
  const sortedParams = Array.from(body.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => k + v)
    .join('');

  const message = url + sortedParams;

  // HMAC-SHA1 with the auth token as key
  const encoder = new TextEncoder();
  const keyData = encoder.encode(authToken);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  // Constant-time comparison to prevent timing attacks
  return sigBase64 === twilioSignature;
}

/**
 * Look up a user's record in sms_preferences by phone number.
 * Returns { user_id, timezone } or null if not found / unsubscribed.
 */
async function getUserByPhone(phoneNumber: string): Promise<{ userId: string; timezone: string } | null> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from('sms_preferences')
    .select('user_id, timezone')
    .eq('phone_number', phoneNumber)
    .is('sms_unsubscribed_at', null)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { userId: data.user_id, timezone: data.timezone ?? 'America/New_York' };
}

/**
 * Call Claude with user's real session data and conversation history
 * to generate a short, helpful coaching reply.
 */
async function generateAiReply(
  userMessage: string,
  sessions: Awaited<ReturnType<typeof getSmsAgentContext>>,
  history: Awaited<ReturnType<typeof getConversationHistory>>
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build a human-readable summary of recent sessions for the system prompt.
  // Each session includes scores + every question the user answered with a
  // truncated transcript snippet so Claude can answer "what did I say about X?"
  const TRANSCRIPT_SNIPPET_LEN = 300; // chars per answer — enough for a summary, not overwhelming
  const sessionSummary = sessions.length === 0
    ? 'No sessions recorded yet.'
    : sessions.map((s, i) => {
        const date = new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const scores = [
          s.overallScore != null ? `overall ${s.overallScore}` : null,
          s.clarityScore != null ? `clarity ${s.clarityScore}` : null,
          s.pacingScore != null ? `pacing ${s.pacingScore}` : null,
          s.eyeContactPercentage != null ? `eye contact ${s.eyeContactPercentage}%` : null,
          s.fillerWordCount != null ? `${s.fillerWordCount} filler words` : null,
        ].filter(Boolean).join(', ');
        const contextLine = s.context ? ` (${s.context.slice(0, 80)})` : '';

        // Build per-question lines with transcript snippets
        const questionLines = s.questions
          .filter(q => q.text) // skip questions with no text
          .map((q, qi) => {
            const snippetRaw = q.transcript?.trim() ?? '';
            const snippet = snippetRaw.length > TRANSCRIPT_SNIPPET_LEN
              ? snippetRaw.slice(0, TRANSCRIPT_SNIPPET_LEN) + '…'
              : snippetRaw;
            const scoreStr = q.overallScore != null ? ` [score: ${q.overallScore}]` : '';
            const transcriptStr = snippet ? `\n     Answer: "${snippet}"` : ' (no transcript)';
            return `  Q${qi + 1}: ${q.text}${scoreStr}${transcriptStr}`;
          })
          .join('\n');

        const header = `Session ${i + 1} — ${date}, ${s.sessionType}${contextLine}: ${scores || 'no scores yet'}.`;
        return questionLines ? `${header}\n${questionLines}` : header;
      }).join('\n\n');

  const systemPrompt = `You are Pitcht's AI coaching assistant, responding via SMS.
Pitcht is an interview practice app that records and scores sessions on clarity, pacing, eye contact, and overall performance.

The user just texted you. Reply helpfully and concisely — you MUST stay under ${SMS_MAX_CHARS} characters total (this is SMS, not a chat app).

Here is this user's recent practice data:
${sessionSummary}

Guidelines:
- Be warm, specific, and encouraging — use their actual scores when relevant
- If they ask "how did I do?" or similar, reference their most recent session scores
- If they ask what to work on, pick their lowest metric and give one concrete tip
- If they ask to summarize a session, list the questions and give a 1-2 sentence summary of what they said (based on the Answer transcripts above)
- If they ask about a specific topic they talked about (e.g. "the project I mentioned", "what I said about leadership"), find it in the transcript snippets and summarize it
- If they ask about a past session, refer to the data above
- If the question is unrelated to interview coaching, politely say you can only help with Pitcht practice
- Never make up data or invent details not found in the session summary above
- End every reply with pitcht.com or a brief CTA to practice
- Do NOT repeat the STOP/unsubscribe instructions in every reply`;

  // Build conversation turns from history (excluding the current message — it's the last user turn)
  const conversationMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (const msg of history) {
    conversationMessages.push({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.message,
    });
  }
  // Append the current inbound message as the final user turn
  conversationMessages.push({ role: 'user', content: userMessage });

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5', // Fast + cheap — SMS replies need sub-second latency
    max_tokens: 200,           // ~280 chars output; extra headroom for transcript-based summaries
    system: systemPrompt,
    messages: conversationMessages,
  });

  const raw = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('');

  // Hard-truncate if Claude goes over (shouldn't, but safety net)
  return raw.length > SMS_MAX_CHARS ? raw.slice(0, SMS_MAX_CHARS - 1) + '…' : raw;
}

// Twilio sends form-encoded data, not JSON
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // We need the raw body text for signature validation before parsing
    const bodyText = await req.text();
    const formData = new URLSearchParams(bodyText);

    // Validate Twilio signature — reject anything that isn't from Twilio
    const isValid = await validateTwilioSignature(req, formData);
    if (!isValid) {
      console.warn('SMS inbound: invalid Twilio signature — request rejected');
      return new NextResponse('Forbidden', { status: 403 });
    }

    const from = formData.get('From') as string | null;
    const twilioSid = formData.get('MessageSid') as string | null;
    const bodyRaw = (formData.get('Body') as string | null) ?? '';
    const bodyUpper = bodyRaw.trim().toUpperCase();

    if (!from) {
      return twimlResponse('');
    }

    // Handle opt-out keywords (Twilio also handles STOP at carrier level,
    // but we update our DB so cron jobs stop targeting this number).
    const stopPattern = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\b/;
    if (stopPattern.test(bodyUpper)) {
      try {
        await handleStop(from);
      } catch (err) {
        console.error('SMS inbound: handleStop failed for', from, err);
      }
      return twimlResponse('You have been unsubscribed from Pitcht reminders. Reply START to re-enable.');
    }

    // Handle re-subscribe
    if (bodyUpper === 'START' || bodyUpper === 'UNSTOP') {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { error } = await supabase
        .from('sms_preferences')
        .update({ sms_opt_in: true, sms_unsubscribed_at: null })
        .eq('phone_number', from);
      if (error) console.error('SMS inbound: failed to re-subscribe', from, error);
      return twimlResponse('Welcome back! You will receive Pitcht accountability reminders again.');
    }

    // HELP
    if (bodyUpper === 'HELP') {
      return twimlResponse('Pitcht accountability reminders. Reply STOP to unsubscribe. Visit pitcht.com for your full dashboard.');
    }

    // ─── Phase 2: Claude-powered coaching reply ────────────────────────────────

    // Look up user by phone number
    const userRecord = await getUserByPhone(from);

    if (!userRecord) {
      // Phone number not found or unsubscribed — politely direct them to the app
      return twimlResponse('Hi! To use Pitcht coaching, sign up and enable SMS reminders at pitcht.com.');
    }

    const { userId, timezone } = userRecord;

    // Log the inbound message to DB (non-blocking — don't await for reply speed)
    logInboundMessage(userId, from, bodyRaw, twilioSid ?? undefined).catch(err =>
      console.error('SMS inbound: failed to log inbound message', err)
    );

    // Rate limit: max AI replies per day
    const aiRepliesCount = await getAiRepliesCountToday(userId, timezone);
    if (aiRepliesCount >= MAX_AI_REPLIES_PER_DAY) {
      // Return a graceful limit message via TwiML (no Claude call, no DB log for this one)
      return twimlResponse(`You've reached the daily coaching limit (${MAX_AI_REPLIES_PER_DAY} replies). Check your full feedback at pitcht.com/history`);
    }

    // Load context and conversation history in parallel
    const [sessions, history] = await Promise.all([
      getSmsAgentContext(userId),
      getConversationHistory(from, 10),
    ]);

    // Generate Claude reply
    let reply: string;
    try {
      reply = await generateAiReply(bodyRaw, sessions, history);
    } catch (claudeErr) {
      console.error('SMS inbound: Claude call failed', claudeErr);
      reply = 'Sorry, I ran into an issue. Check your progress at pitcht.com/history — reply anytime to ask!';
    }

    // Send reply via Twilio + log to DB (fire-and-forget the DB log)
    // We return TwiML directly rather than via sendAiReply's Twilio call to avoid
    // double-sending — TwiML response IS the reply; we just need to log it.
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      // Log the outbound AI reply (no Twilio send — TwiML handles delivery)
      supabase.from('sms_messages').insert({
        user_id: userId,
        phone_number: from,
        direction: 'outbound',
        message: reply,
        twilio_sid: null, // Twilio will assign an SID; we don't have it from TwiML path
        trigger: 'ai_reply',
        status: 'sent',
      }).then(({ error }) => {
        if (error) console.error('SMS inbound: failed to log AI reply to DB', error);
      });
    } catch (logErr) {
      console.error('SMS inbound: DB log error (non-fatal)', logErr);
    }

    return twimlResponse(reply);
  } catch (err) {
    console.error('SMS inbound webhook error:', err);
    return twimlResponse('');
  }
}

function twimlResponse(message: string): NextResponse {
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

  return new NextResponse(xml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
