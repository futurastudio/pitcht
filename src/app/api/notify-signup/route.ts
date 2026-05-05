/**
 * Signup Notification Endpoint
 *
 * 1. Sends an alert to contact@pitcht.us (Jose's notification)
 * 2. Sends a welcome email to the new user
 *
 * Called from AuthContext.tsx (email/password) and auth/callback (OAuth).
 *
 * POST /api/notify-signup
 * Body: { userId, email, signupMethod }
 */

import { NextRequest, NextResponse } from 'next/server';

interface NotifySignupBody {
  userId: string;
  email: string;
  signupMethod: 'email' | 'google';
}

function buildAdminEmail(email: string, signupMethod: string, userId: string, timestamp: string, ip: string, userAgent: string) {
  return {
    from: 'Pitcht Alerts <alerts@pitcht.us>' as const,
    to: 'contact@pitcht.us' as const,
    subject: `New signup: ${email} via ${signupMethod}`,
    html: `
      <h2>New Pitcht Signup</h2>
      <table style="font-family: monospace; border-collapse: collapse;">
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Email</strong></td><td>${email}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Method</strong></td><td>${signupMethod}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>User ID</strong></td><td>${userId}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Time</strong></td><td>${timestamp}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>IP</strong></td><td>${ip}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>UA</strong></td><td>${userAgent}</td></tr>
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
              Pitcht is an AI interviewer that records your answers and gives you real feedback on what you actually said — not what you wish you said. Think eye contact, clarity, structure, and how you handle curveball follow-ups.
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

async function sendEmail(resendApiKey: string, payload: object) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend ${res.status}: ${text}`);
  }
  return res.json();
}

export async function POST(request: NextRequest) {
  try {
    const body: NotifySignupBody = await request.json();
    const { userId, email, signupMethod } = body;

    if (!userId || !email || !signupMethod) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, email, signupMethod' },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('[notify-signup] RESEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Resend not configured' },
        { status: 500 }
      );
    }

    const timestamp = new Date().toISOString();
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Send both emails in parallel (non-blocking relative to each other)
    const [adminResult, welcomeResult] = await Promise.allSettled([
      sendEmail(resendApiKey, buildAdminEmail(email, signupMethod, userId, timestamp, ip, userAgent)),
      sendEmail(resendApiKey, buildWelcomeEmail(email)),
    ]);

    const sent: string[] = [];
    const errors: string[] = [];

    if (adminResult.status === 'fulfilled') {
      sent.push(`admin:${adminResult.value.id}`);
      console.log('[notify-signup] Admin alert sent:', adminResult.value.id);
    } else {
      errors.push(`admin:${adminResult.reason}`);
      console.error('[notify-signup] Admin alert failed:', adminResult.reason);
    }

    if (welcomeResult.status === 'fulfilled') {
      sent.push(`welcome:${welcomeResult.value.id}`);
      console.log('[notify-signup] Welcome email sent:', welcomeResult.value.id);
    } else {
      errors.push(`welcome:${welcomeResult.reason}`);
      console.error('[notify-signup] Welcome email failed:', welcomeResult.reason);
    }

    return NextResponse.json({ success: true, sent, errors: errors.length ? errors : undefined });

  } catch (error) {
    console.error('[notify-signup] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
