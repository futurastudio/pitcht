/**
 * Signup Notification Endpoint
 *
 * 1. Sends an alert to contact@pitcht.us (Jose's notification)
 * 2. Sends a welcome email to the new user
 *
 * Called from AuthContext.tsx (email/password) and auth/callback (OAuth).
 *
 * POST /api/notify-signup
 * Requires a Bearer session; recipient and signup details come from verified Auth data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdmin } from '@/server/clients';
import { ApiError } from '@/server/errors';
import { authenticate, fail, readJson } from '@/server/http';

const SIGNUP_WINDOW_MS = 24 * 60 * 60 * 1000;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function buildAdminEmail(email: string, signupMethod: string, userId: string, timestamp: string, ip: string, userAgent: string) {
  return {
    from: 'Pitcht Alerts <alerts@pitcht.us>' as const,
    to: 'contact@pitcht.us' as const,
    subject: `New signup: ${email} via ${signupMethod}`,
    html: `
      <h2>New Pitcht Signup</h2>
      <table style="font-family: monospace; border-collapse: collapse;">
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Email</strong></td><td>${escapeHtml(email)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Method</strong></td><td>${escapeHtml(signupMethod)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>User ID</strong></td><td>${escapeHtml(userId)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Time</strong></td><td>${escapeHtml(timestamp)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>IP</strong></td><td>${escapeHtml(ip)}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>UA</strong></td><td>${escapeHtml(userAgent)}</td></tr>
      </table>
    `,
    text: `New Pitcht Signup\n=================\nEmail: ${email}\nMethod: ${signupMethod}\nUser ID: ${userId}\nTime: ${timestamp}\nIP: ${ip}\nUA: ${userAgent}`.trim(),
  };
}

function buildWelcomeEmail(email: string) {
  return {
    from: 'Jose from Pitcht <contact@pitcht.us>' as const,
    to: email,
    subject: 'Welcome to Pitcht — 3 free sessions inside',
    html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Pitcht</title>
</head>
<body style="margin:0; padding:0; background:#0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;">
  <tr>
    <td align="center" style="padding: 40px 20px;">
      <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px; width:100%; background:#111111; border-radius:16px; border:1px solid #1a1a1a;">
        <tr>
          <td style="padding: 48px 40px 32px;">
            <h1 style="margin:0 0 16px; font-size:28px; font-weight:700; color:#ffffff; letter-spacing:-0.5px;">Welcome to Pitcht</h1>
            <p style="margin:0 0 24px; font-size:16px; line-height:1.6; color:#a1a1a1;">
              You now have <strong style="color:#ffffff;">3 free practice sessions</strong>. No credit card. No strings.
            </p>
            <p style="margin:0 0 24px; font-size:16px; line-height:1.6; color:#a1a1a1;">
              Pitcht is an AI interviewer that records your answers and gives you real feedback on what you actually said — not what you wish you said. Think eye contact, clarity, structure, and how you handle curveball follow-ups. You’ll get real answer frameworks tailored to your role, not generic scripts that sound like everyone else.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px 32px;">
            <a href="https://app.pitcht.us" style="display:inline-block; padding:14px 28px; background:#ffffff; color:#0a0a0a; text-decoration:none; border-radius:8px; font-weight:600; font-size:15px;">Start Your First Session →</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px 32px;">
            <h2 style="margin:0 0 16px; font-size:18px; font-weight:600; color:#ffffff;">What's worked for others</h2>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d0d; border-radius:12px; border:1px solid #1a1a1a;">
              <tr>
                <td style="padding: 24px;">
                  <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#d4d4d4; font-style:italic;">
                    "I used Pitcht to prep for my internship interviews at 3 companies. Being able to see my eye contact and get actual feedback on my answers made me way less nervous. Landed the offer."
                  </p>
                  <p style="margin:0; font-size:14px; color:#808080;">
                    <strong style="color:#a1a1a1;">Fabiana Artigas</strong>, College Student
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 0 40px 40px;">
            <h2 style="margin:0 0 16px; font-size:18px; font-weight:600; color:#ffffff;">How to get the most out of it</h2>
            <ul style="margin:0; padding:0 0 0 20px; color:#a1a1a1; font-size:15px; line-height:1.8;">
              <li>Pick a real role you're interviewing for (the more specific, the better)</li>
              <li>Use your actual webcam — the feedback on eye contact and body language is worth it</li>
              <li>Don't script your answers. The AI will challenge you with follow-ups</li>
              <li>Review the recording. Most people spot their own filler words and weak transitions immediately</li>
            </ul>
            <p style="margin:24px 0 0; font-size:14px; color:#666666; line-height:1.6;">
              Questions? Just reply to this email. I'm the founder and I read every one.
            </p>
            <p style="margin:8px 0 0; font-size:14px; color:#666666; line-height:1.6;">
              — Jose, Founder of Pitcht
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
    `,
    text: `Welcome to Pitcht

You now have 3 free practice sessions. No credit card. No strings.

Pitcht is an AI interviewer that records your answers and gives you real feedback on what you actually said — not what you wish you said. Think eye contact, clarity, structure, and how you handle curveball follow-ups.

Start your first session: https://app.pitcht.us

What's worked for others:
"I used Pitcht to prep for my internship interviews at 3 companies. Being able to see my eye contact and get actual feedback on my answers made me way less nervous. Landed the offer." — Fabiana Artigas, College Student

How to get the most out of it:
- Pick a real role you're interviewing for (the more specific, the better)
- Use your actual webcam — the feedback on eye contact and body language is worth it
- Don't script your answers. The AI will challenge you with follow-ups
- Review the recording. Most people spot their own filler words and weak transitions immediately

Questions? Just reply to this email. I'm the founder and I read every one.

— Jose, Founder of Pitcht`.trim(),
  };
}

async function sendEmail(resendApiKey: string, payload: object, idempotencyKey: string, deadline: number) {
  // Retry an uncertain response with the exact same payload/key. Resend retains keys
  // for 24 hours, matching the maximum Auth signup window enforced below.
  const body = JSON.stringify(payload);
  for (let attempt = 0; attempt < 3; attempt++) {
    // Leave room for the provider timeout; never retry beyond the eligibility/key window.
    if (Date.now() + 5000 >= deadline) break;
    let retryable = true;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const result = await response.json();
        if (typeof result?.id === 'string' && result.id) return;
      } else {
        retryable = response.status >= 500 || response.status === 429 || response.status === 409;
        await response.body?.cancel();
      }
    } catch {
      // A timeout/network error may follow a successful send; keep the key unchanged.
    }
    if (!retryable || attempt === 2) break;
    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error('Notification delivery unavailable');
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticate(request);
    // Accept old caller fields for compatibility, but never use their identity or email.
    await readJson(request, 2048);
    const createdAt = Date.parse(user.created_at);
    const age = Date.now() - createdAt;
    if (!Number.isFinite(createdAt) || age < 0 || age >= SIGNUP_WINDOW_MS) {
      throw new ApiError(403, 'Signup notification is no longer available.', 'signup_window_closed');
    }
    if (!user.email_confirmed_at || !user.email || user.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
      throw new ApiError(403, 'Confirm your email before requesting a welcome message.', 'email_unconfirmed');
    }
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) throw new Error('Notification provider unavailable');

    // This private RPC serializes limits across server instances. Do not use the
    // practice wrapper: notifications do not require a Stripe refresh or paid access.
    const { data: budget, error } = await getAdmin().rpc('consume_ai_budget', {
      p_user_id: user.id, p_operation: 'notify_signup', p_recording_id: null,
    });
    if (error || !budget || typeof budget.allowed !== 'boolean') throw new Error('Notification budget unavailable');
    if (!budget.allowed) {
      throw new ApiError(429, 'A signup notification has already been requested.', 'rate_limited');
    }

    const signupMethod = user.app_metadata.provider === 'google' ? 'google' : 'email';
    // Request headers and the current time would change the idempotent payload on
    // retries. Use the Auth creation time and omit caller-controlled request details.
    const results = await Promise.allSettled([
      sendEmail(resendApiKey, buildAdminEmail(user.email, signupMethod, user.id,
        new Date(createdAt).toISOString(), 'Not collected', 'Not collected'), `signup-admin/${user.id}`, createdAt + SIGNUP_WINDOW_MS),
      sendEmail(resendApiKey, buildWelcomeEmail(user.email), `signup-welcome/${user.id}`, createdAt + SIGNUP_WINDOW_MS),
    ]);
    if (results.some(result => result.status === 'rejected')) throw new Error('Notification delivery unavailable');
    return NextResponse.json({ success: true });
  } catch (error) {
    return fail(error);
  }
}
