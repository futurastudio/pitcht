/**
 * API Route: Transcribe Audio
 * POST /api/transcribe
 *
 * Transcribes audio recordings to text using OpenAI Whisper
 *
 * Security:
 * - CSRF Protection: Validates origin/referer headers
 * - Rate Limiting: 10 requests per hour per user
 */

import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/services/whisper';
import { analyzeSpeech } from '@/services/speechAnalyzer';
import { withCSRFProtection } from '@/middleware/csrfProtection';
import rateLimiter, { RateLimitPresets, getUserIdentifier, formatResetTime } from '@/middleware/rateLimiter';

export async function POST(request: NextRequest) {
  try {
    // CSRF Protection
    const csrfError = withCSRFProtection(request);
    if (csrfError) return csrfError;

    // Rate Limiting (20 requests per hour)
    const userKey = getUserIdentifier(request);
    const rateLimit = rateLimiter.check(userKey, RateLimitPresets.TRANSCRIBE);

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

    // Parse form data containing the audio file
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const language = formData.get('language') as string | null;
    const prompt = formData.get('prompt') as string | null;

    // Validate audio file
    if (!audioFile) {
      return NextResponse.json(
        {
          error: 'Missing required field: audio file is required',
          transcript: '',
        },
        { status: 400 }
      );
    }

    // Validate file type
    const validMimeTypes = [
      'audio/webm',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'audio/ogg',
      'video/webm', // Some browsers record video with audio
    ];

    if (!validMimeTypes.includes(audioFile.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type: ${audioFile.type}. Supported types: ${validMimeTypes.join(', ')}`,
          transcript: '',
        },
        { status: 400 }
      );
    }

    // Transcribe audio using Whisper
    const result = await transcribeAudio(audioFile, {
      language: language || undefined,
      prompt: prompt || undefined,
    });

    // Analyze speech metrics from transcript
    const speechMetrics = analyzeSpeech(result.text, result.duration || 0);

    // Return transcription result with speech metrics
    return NextResponse.json(
      {
        transcript: result.text,
        duration: result.duration,
        language: result.language,
        speechMetrics: {
          wordsPerMinute: speechMetrics.wordsPerMinute,
          fillerWordCount: speechMetrics.fillerWordCount,
          clarityScore: speechMetrics.clarityScore,
          pacingScore: speechMetrics.pacingScore,
        },
        transcribedAt: new Date().toISOString(),
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in transcribe API:', error);

    // Determine error message
    const errorMessage = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while transcribing audio';

    return NextResponse.json(
      {
        error: errorMessage,
        transcript: '',
        transcribedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to transcribe audio.' },
    { status: 405 }
  );
}
