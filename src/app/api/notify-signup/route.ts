/**
 * Signup Notification Endpoint
 *
 * Sends an email to contact@pitcht.us every time a new user signs up.
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

    const emailHtml = `
      <h2>New Pitcht Signup</h2>
      <table style="font-family: monospace; border-collapse: collapse;">
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Email</strong></td><td>${email}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Method</strong></td><td>${signupMethod}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>User ID</strong></td><td>${userId}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>Time</strong></td><td>${timestamp}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>IP</strong></td><td>${ip}</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;"><strong>UA</strong></td><td>${userAgent}</td></tr>
      </table>
    `;

    const emailText = `
New Pitcht Signup
=================
Email: ${email}
Method: ${signupMethod}
User ID: ${userId}
Time: ${timestamp}
IP: ${ip}
UA: ${userAgent}
    `.trim();

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Pitcht Alerts <alerts@pitcht.us>',
        to: 'contact@pitcht.us',
        subject: `New signup: ${email} via ${signupMethod}`,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error('[notify-signup] Resend error:', resendResponse.status, errorText);
      return NextResponse.json(
        { error: 'Failed to send notification email' },
        { status: 500 }
      );
    }

    const resendData = await resendResponse.json();
    console.log('[notify-signup] Email sent:', resendData.id);

    return NextResponse.json({ success: true, emailId: resendData.id });

  } catch (error) {
    console.error('[notify-signup] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
