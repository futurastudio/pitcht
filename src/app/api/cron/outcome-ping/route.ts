/**
 * GET /api/cron/outcome-ping
 *
 * Vercel Cron Job — runs daily at 10:00 UTC.
 * Finds sessions completed exactly 3 days ago (by UTC date) that have not yet
 * received an outcome-ping email, inserts a row into session_outcomes, and
 * sends the email via sendOutcomeEmail().
 *
 * Feature-flagged: does nothing unless OUTCOME_PING_ENABLED=true.
 * Protected by Vercel's cron secret (Authorization: Bearer <CRON_SECRET>).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendOutcomeEmail } from '@/services/outcomeEmail';
import type { SendOutcomeEmailParams } from '@/services/outcomeEmail';

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // 1. Feature flag bail — MUST be the very first check. No DB calls before this.
    if (process.env.OUTCOME_PING_ENABLED !== 'true') {
      return NextResponse.json(
        { skipped: true, reason: 'flag_disabled' },
        { status: 200 }
      );
    }

    // 2. Vercel cron auth check
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3. Service-role Supabase client
    const supabase = getSupabaseAdmin();

    // 4. Build the UTC date window for "exactly 3 days ago"
    const threeDaysAgo = new Date();
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    const startUTC = new Date(
      Date.UTC(
        threeDaysAgo.getUTCFullYear(),
        threeDaysAgo.getUTCMonth(),
        threeDaysAgo.getUTCDate(),
        0, 0, 0, 0
      )
    );
    const endUTC = new Date(
      Date.UTC(
        threeDaysAgo.getUTCFullYear(),
        threeDaysAgo.getUTCMonth(),
        threeDaysAgo.getUTCDate(),
        23, 59, 59, 999
      )
    );

    // Step 4a: Get session IDs already pinged
    // TODO(scale): This pulls the entire session_outcomes table into memory to
    // build a dedup Set. Fine at low volume but won't scale past ~5K rows.
    // Fix when needed: filter by `.gte('email_sent_at', startUTC.toISOString())`
    // or fetch candidate session IDs first and pass them via `.in('session_id', [...])`.
    const { data: existingOutcomes, error: outcomesError } = await supabase
      .from('session_outcomes')
      .select('session_id');

    if (outcomesError) {
      console.error('[outcome-ping] failed to fetch existing outcomes', outcomesError);
      return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
    }

    const pingedIds = new Set((existingOutcomes ?? []).map((r: { session_id: string }) => r.session_id));

    // Step 4b: Get candidate sessions completed 3 days ago
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('id, user_id, type, created_at')
      .eq('status', 'completed')
      .gte('created_at', startUTC.toISOString())
      .lte('created_at', endUTC.toISOString());

    if (sessionsError) {
      console.error('[outcome-ping] failed to fetch sessions', sessionsError);
      return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
    }

    // Filter out sessions already pinged
    const toSend = (sessions ?? []).filter((s: { id: string }) => !pingedIds.has(s.id));

    // 5. Send emails
    let sentCount = 0;
    let errorCount = 0;

    for (const session of toSend) {
      try {
        // Get user email via admin API
        const { data: authData, error: userError } = await supabase.auth.admin.getUserById(
          session.user_id
        );

        if (userError || !authData?.user?.email) {
          console.warn('[outcome-ping] no email for user', session.user_id, userError ?? 'email missing');
          continue;
        }

        const userEmail = authData.user.email;

        // Generate a 64-hex-char single-use token (Node 19+ crypto built-in)
        const token =
          crypto.randomUUID().replace(/-/g, '') +
          crypto.randomUUID().replace(/-/g, '');

        // Insert row into session_outcomes before sending email (fail-safe ordering)
        const { error: insertError } = await supabase.from('session_outcomes').insert({
          session_id: session.id,
          user_id: session.user_id,
          email_token: token,
          email_sent_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error('[outcome-ping] failed to insert outcome row for session', session.id, insertError);
          errorCount++;
          continue;
        }

        // Normalise sessionType to the union expected by sendOutcomeEmail
        const allowedTypes: ReadonlyArray<SendOutcomeEmailParams['sessionType']> = [
          'job-interview',
          'internship-interview',
          'presentation',
        ];
        const sessionType: SendOutcomeEmailParams['sessionType'] = allowedTypes.includes(
          session.type as SendOutcomeEmailParams['sessionType']
        )
          ? (session.type as SendOutcomeEmailParams['sessionType'])
          : 'job-interview'; // safe fallback

        // Send the outcome email
        await sendOutcomeEmail({
          userEmail,
          sessionId: session.id,
          sessionType,
          token,
          recordedAt: new Date(session.created_at),
        });

        sentCount++;
      } catch (err) {
        console.error('[outcome-ping] failed for session', session.id, err);
        errorCount++;
      }
    }

    console.log('[outcome-ping] complete:', {
      sent: sentCount,
      errors: errorCount,
      total_candidates: toSend.length,
    });

    // 6. Return summary
    return NextResponse.json({
      sent: sentCount,
      skipped: 0,
      errors: errorCount,
      total_candidates: toSend.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[outcome-ping] catastrophic failure:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 8. Unsupported method handler
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
