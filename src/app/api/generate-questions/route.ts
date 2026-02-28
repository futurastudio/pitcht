/**
 * API Route: Generate Questions
 * POST /api/generate-questions
 *
 * Generates AI-powered interview questions based on user context
 *
 * Security:
 * - CSRF Protection: Validates origin/referer headers
 * - Rate Limiting: 10 requests per hour per user
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateQuestions } from '@/services/claude';
import { SessionContext, GenerateQuestionsResponse } from '@/types/interview';
import { withCSRFProtection } from '@/middleware/csrfProtection';
import rateLimiter, { RateLimitPresets, getUserIdentifier, formatResetTime } from '@/middleware/rateLimiter';

export async function POST(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfError = withCSRFProtection(request);
    if (csrfError) return csrfError;

    // Rate Limiting (10 requests per hour)
    const userKey = getUserIdentifier(request);
    const rateLimit = rateLimiter.check(userKey, RateLimitPresets.AI_ENDPOINT);

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
            'X-RateLimit-Limit': String(RateLimitPresets.AI_ENDPOINT.maxRequests),
            'X-RateLimit-Remaining': String(rateLimit.remaining),
            'X-RateLimit-Reset': String(rateLimit.resetAt),
          },
        }
      );
    }

    // Parse request body
    const body: SessionContext = await request.json();

    // Validate required fields (context is optional — users can leave it blank)
    if (!body.sessionType) {
      return NextResponse.json(
        {
          error: 'Missing required field: sessionType is required',
          questions: []
        },
        { status: 400 }
      );
    }

    // Validate session type
    const validTypes = ['job-interview', 'internship-interview', 'presentation'];
    if (!validTypes.includes(body.sessionType)) {
      return NextResponse.json(
        {
          error: `Invalid session type. Must be one of: ${validTypes.join(', ')}`,
          questions: []
        },
        { status: 400 }
      );
    }

    // Generate questions using Claude
    const questions = await generateQuestions(body);

    // Prepare response
    const response: GenerateQuestionsResponse = {
      questions,
      sessionType: body.sessionType,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response, { status: 200 });

  } catch (error) {
    console.error('Error in generate-questions API:', error);

    // Determine error message
    const errorMessage = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while generating questions';

    return NextResponse.json(
      {
        error: errorMessage,
        questions: [],
        generatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to generate questions.' },
    { status: 405 }
  );
}
