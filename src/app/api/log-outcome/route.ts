/**
 * API Route: Log Outcome
 * POST /api/log-outcome
 *
 * Records the interview outcome submitted via a single-use email token link.
 * No user session auth required — the token IS the auth (stateless email link).
 *
 * Security:
 * - Token-based auth (single-use, looked up from session_outcomes.email_token)
 * - Rate Limiting: 20 requests per hour per IP
 * - NO CSRF check (cross-origin is expected — link comes from email)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import rateLimiter, { getUserIdentifier, formatResetTime } from '@/middleware/rateLimiter';

const VALID_OUTCOMES = ['offer', 'next_round', 'rejected', 'no_response'] as const;
type Outcome = typeof VALID_OUTCOMES[number];

// Inline rate limit config — 20 requests per hour per IP
const LOG_OUTCOME_RATE_LIMIT = {
  maxRequests: 20,
  windowMs: 60 * 60 * 1000,
} as const;

interface LogOutcomeBody {
  token: string;
  outcome: Outcome;
  notes?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting — keyed by IP, 20 req/hr
    const userKey = getUserIdentifier(request);
    const rateLimit = rateLimiter.check(userKey, LOG_OUTCOME_RATE_LIMIT);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `Too many requests. Please try again in ${formatResetTime(rateLimit.resetAt)}`,
          retryAfter: rateLimit.resetAt,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(LOG_OUTCOME_RATE_LIMIT.maxRequests),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': String(rateLimit.resetAt),
          },
        }
      );
    }

    // Parse and validate body
    let body: LogOutcomeBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { token, outcome, notes } = body;

    if (!token || typeof token !== 'string' || token.trim() === '') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (!outcome || !(VALID_OUTCOMES as readonly string[]).includes(outcome)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Build service-role Supabase client (token IS the auth — no user session needed)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Look up the row by email_token; verify it exists and hasn't been responded to yet
    const { data: row, error: lookupError } = await supabase
      .from('session_outcomes')
      .select('id, responded_at')
      .eq('email_token', token.trim())
      .maybeSingle();

    if (lookupError) {
      console.error('[log-outcome] Lookup error:', lookupError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!row || row.responded_at !== null) {
      return NextResponse.json(
        { error: 'Token not found or already used' },
        { status: 404 }
      );
    }

    // Update the row with the outcome and mark as responded
    const { error: updateError } = await supabase
      .from('session_outcomes')
      .update({
        outcome,
        notes: notes ?? null,
        responded_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (updateError) {
      console.error('[log-outcome] Update error:', updateError);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    return NextResponse.json({ success: true, outcome }, { status: 200 });

  } catch (error) {
    console.error('[log-outcome] Unhandled error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to log an outcome.' },
    { status: 405 }
  );
}
