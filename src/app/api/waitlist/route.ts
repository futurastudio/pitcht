/**
 * API Route: Waitlist / Mobile Lead Capture
 * POST /api/waitlist
 *
 * Called when a mobile visitor taps "Download" on the landing page.
 * 1. Saves their email to the `waitlist` table in Supabase
 * 2. Sends them a welcome email via Resend with download links
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SITE_URL = 'https://pitcht.us';
const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://app.pitcht.us';

// CORS headers — allow requests from the Framer marketing site (pitcht.us)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://pitcht.us',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle preflight requests from the browser
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    // Basic validation
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400, headers: CORS_HEADERS });
    }

    const normalized = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400, headers: CORS_HEADERS });
    }

    // Insert into waitlist (ignore duplicate — user may have already signed up)
    const { error: dbError } = await supabase
      .from('waitlist')
      .insert({ email: normalized, source: 'mobile_download' })
      .select()
      .single();

    if (dbError && dbError.code !== '23505') {
      // 23505 = unique_violation (already on list) — not a real error
      console.error('Waitlist DB error:', dbError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500, headers: CORS_HEADERS });
    }

    // Send email via Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const emailHtml = buildEmailHtml({ email: normalized });
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Pitcht <contact@pitcht.us>',
          to: normalized,
          subject: 'Your Pitcht download link is here 🎤',
          html: emailHtml,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('Resend error:', err);
        // Don't fail the request — email is a nice-to-have, DB insert is the critical part
      }
    } else {
      console.warn('RESEND_API_KEY not set — skipping email send');
    }

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error('Waitlist route error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500, headers: CORS_HEADERS });
  }
}

function buildEmailHtml({ email }: { email: string }): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Pitcht download link</title>
</head>
<body style="margin:0;padding:0;background:#0a0908;font-family:'Inter',Arial,sans-serif;color:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0908;padding:48px 24px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

          <!-- Logo -->
          <tr>
            <td style="padding-bottom:32px;" align="center">
              <table cellpadding="0" cellspacing="0" style="display:inline-table;">
                <tr>
                  <td style="vertical-align:middle;padding-right:8px;">
                    <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M3 13 C6 8, 13 8, 16 13 C13 18, 6 18, 3 13 Z" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                      <path d="M16 13 C19 8, 26 8, 29 13 C26 18, 19 18, 16 13 Z" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                      <path d="M10 23 Q16 27 22 23" stroke="#ffffff" stroke-width="2" stroke-linecap="round" fill="none"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Pitcht</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="background:#17161 5;border-radius:16px;padding:40px 36px;">
              <h1 style="margin:0 0 12px 0;font-size:28px;font-weight:700;line-height:1.2;color:#ffffff;letter-spacing:-0.5px;">
                You're one download away from your best interview.
              </h1>
              <p style="margin:0 0 32px 0;font-size:16px;line-height:1.6;color:rgba(255,255,255,0.65);">
                Pitcht is your AI interview coach for Mac and Windows. It records your answers,
                tracks eye contact in real time, and gives you honest — brutally useful — feedback
                after every session. No fluff. No empty praise. Just real coaching.
              </p>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td>
                    <a href="${SITE_URL}"
                       style="display:inline-block;padding:14px 28px;background:#ffffff;color:#0f0f0f;
                              font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;
                              white-space:nowrap;">
                      Get Pitcht — pitcht.us
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Instruction -->
              <p style="margin:0 0 8px 0;font-size:15px;line-height:1.6;color:rgba(255,255,255,0.65);">
                Open <a href="${SITE_URL}" style="color:#ffffff;font-weight:600;text-decoration:underline;">pitcht.us</a> on your Mac or Windows computer to download the app and get started — it only takes 60 seconds. No credit card. <a href="${APP_URL}/signup" style="color:#ffffff;font-weight:600;text-decoration:underline;">Create your free account</a> and start practicing today.
              </p>
            </td>
          </tr>

          <!-- Feature highlights -->
          <tr>
            <td style="padding:32px 0 0 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:16px;background:#171615;border-radius:10px;margin-bottom:8px;">
                    <p style="margin:0;font-size:14px;color:rgba(255,255,255,0.5);">What you get with Pitcht</p>
                  </td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="12">
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;color:rgba(255,255,255,0.75);">
                    → Role-specific questions generated from your actual job description
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;color:rgba(255,255,255,0.75);">
                    → Eye contact tracking, filler word counts, and pacing scores — automatically
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;color:rgba(255,255,255,0.75);">
                    → STAR-framework coaching: your words, structured for you
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0;font-size:14px;color:rgba(255,255,255,0.75);">
                    → An AI agent that texts you insights and recaps from every session
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;">
                You're getting this because you requested the Pitcht download link.<br/>
                © ${new Date().getFullYear()} Pitcht. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405, headers: CORS_HEADERS });
}
