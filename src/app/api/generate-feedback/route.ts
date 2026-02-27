/**
 * API Route: Generate Feedback
 * POST /api/generate-feedback
 *
 * Generates AI-powered coaching feedback based on transcript and performance metrics
 *
 * Security:
 * - CSRF Protection: Validates origin/referer headers
 * - Rate Limiting: 20 requests per hour per user
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateFeedback } from '@/services/claude';
import { analyzeSpeech } from '@/services/speechAnalyzer';
import type { SessionType } from '@/types/interview';
import { withCSRFProtection } from '@/middleware/csrfProtection';
import rateLimiter, { RateLimitPresets, getUserIdentifier, formatResetTime } from '@/middleware/rateLimiter';
import { createClient } from '@supabase/supabase-js';

export interface GenerateFeedbackRequest {
  sessionType: SessionType;
  questionText: string;
  transcript: string;
  context: string; // Original job description/presentation topic
  duration?: number;
  // Sprint 4: Video Analysis Metrics
  eyeContactPercentage?: number;
  dominantEmotion?: string;
  presenceScore?: number;
}

export interface GenerateFeedbackResponse {
  overallScore: number;
  contentScore?: number;          // NEW: Content quality score
  communicationScore?: number;    // NEW: Communication effectiveness score
  deliveryScore?: number;         // NEW: Delivery score (pace, presence, etc.)
  summary: string;
  communicationPatterns?: {       // NEW: Communication pattern analysis
    usedStructure?: string;
    clarityLevel?: string;
    concisenessLevel?: string;
    exampleQuality?: string;
  };
  strengths: Array<{ area: string; detail: string }>;
  improvements: Array<{
    area: string;
    detail: string;
    suggestion: string;
    example?: string;             // NEW: Framework-based examples
    priority: 'high' | 'medium' | 'low';
  }>;
  nextSteps: string[];
  metrics: {
    wordsPerMinute: number;
    fillerWordCount: number;
    clarityScore: number;
    pacingScore: number;
    totalWords: number;
    // Sprint 4: Video metrics
    eyeContactPercentage?: number;
    dominantEmotion?: string;
    presenceScore?: number;
  };
  generatedAt: string;
}

export async function POST(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfError = withCSRFProtection(request);
    if (csrfError) return csrfError;

    // Auth check — require a valid Supabase session token
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate Limiting (20 requests per hour)
    const userKey = getUserIdentifier(request);
    const rateLimit = rateLimiter.check(userKey, RateLimitPresets.GENERATE_FEEDBACK);

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
            'X-RateLimit-Limit': String(RateLimitPresets.GENERATE_FEEDBACK.maxRequests),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': String(rateLimit.resetAt),
          },
        }
      );
    }

    // Parse request body
    const body: GenerateFeedbackRequest = await request.json();

    // Validate required fields
    if (!body.sessionType || !body.questionText || !body.transcript) {
      return NextResponse.json(
        {
          error: 'Missing required fields: sessionType, questionText, and transcript are required',
        },
        { status: 400 }
      );
    }

    // Analyze speech metrics
    const speechMetrics = analyzeSpeech(body.transcript, body.duration);

    // Generate AI feedback using Claude (with video metrics if available)
    const feedback = await generateFeedback({
      sessionType: body.sessionType,
      question: body.questionText,
      transcript: body.transcript,
      context: body.context || '',
      analysisData: {
        wordsPerMinute: speechMetrics.wordsPerMinute,
        fillerWordCount: speechMetrics.fillerWordCount,
        // Sprint 4: Include video metrics if provided
        eyeContactPercentage: body.eyeContactPercentage,
        dominantEmotion: body.dominantEmotion,
        presenceScore: body.presenceScore,
      },
    });

    // Prepare response
    const response: GenerateFeedbackResponse = {
      ...feedback,
      metrics: {
        wordsPerMinute: speechMetrics.wordsPerMinute,
        fillerWordCount: speechMetrics.fillerWordCount,
        clarityScore: speechMetrics.clarityScore,
        pacingScore: speechMetrics.pacingScore,
        totalWords: speechMetrics.totalWords,
        // Sprint 4: Include video metrics if provided
        eyeContactPercentage: body.eyeContactPercentage,
        dominantEmotion: body.dominantEmotion,
        presenceScore: body.presenceScore,
      },
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Error in generate-feedback API:', error);

    // Determine error message
    const errorMessage = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while generating feedback';

    return NextResponse.json(
      {
        error: errorMessage,
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to generate feedback.' },
    { status: 405 }
  );
}
