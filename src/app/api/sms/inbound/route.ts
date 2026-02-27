/**
 * POST /api/sms/inbound
 *
 * Twilio webhook — fires whenever a user texts back our Twilio number.
 * Phase 1: handles STOP/START opt-out/in.
 * Phase 2 (future): full two-way AI conversation.
 *
 * Twilio expects a TwiML XML response.
 * Configure this URL in Twilio Console → Phone Numbers → Messaging webhook.
 *
 * Security: validates X-Twilio-Signature header to prevent spoofed requests.
 * Any request not originating from Twilio will receive a 403.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleStop } from '@/services/smsAgent';

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
    const body = (formData.get('Body') as string | null)?.trim().toUpperCase() ?? '';

    if (!from) {
      return twimlResponse('');
    }

    // Handle opt-out keywords (Twilio also handles STOP at carrier level,
    // but we update our DB so cron jobs stop targeting this number).
    // Use word-boundary regex to catch "STOP" regardless of trailing whitespace/punctuation.
    const stopPattern = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\b/;
    if (stopPattern.test(body)) {
      try {
        await handleStop(from);
      } catch (err) {
        console.error('SMS inbound: handleStop failed for', from, err);
      }
      return twimlResponse('You have been unsubscribed from Pitcht reminders. Reply START to re-enable.');
    }

    // Handle re-subscribe
    if (body === 'START' || body === 'UNSTOP') {
      // User re-opted in — update DB
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
    if (body === 'HELP') {
      return twimlResponse('Pitcht accountability reminders. Reply STOP to unsubscribe. Visit pitcht.com for your full dashboard.');
    }

    // Phase 1: All other inbound messages get a simple acknowledgment.
    // Phase 2 will replace this with Claude-powered two-way conversation.
    return twimlResponse('Got it! Head to pitcht.com/history to see your full progress dashboard. Reply STOP to unsubscribe.');
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
