/**
 * API Route: Update Recording
 * PATCH /api/update-recording
 *
 * Updates a recording with transcript and speech metrics after async transcription completes
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/services/supabase';

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { recordingId, transcript, duration, speechMetrics } = body;

    // Validate required fields
    if (!recordingId) {
      return NextResponse.json(
        { error: 'Missing recordingId' },
        { status: 400 }
      );
    }

    // Update recording with transcript and speech metrics
    const { error } = await supabase
      .from('recordings')
      .update({
        transcript: transcript || null,
        duration: duration ? Math.round(duration) : null,
        // Speech metrics (round to integers)
        words_per_minute: speechMetrics?.wordsPerMinute ? Math.round(speechMetrics.wordsPerMinute) : null,
        filler_word_count: speechMetrics?.fillerWordCount ? Math.round(speechMetrics.fillerWordCount) : null,
        clarity_score: speechMetrics?.clarityScore ? Math.round(speechMetrics.clarityScore) : null,
        pacing_score: speechMetrics?.pacingScore ? Math.round(speechMetrics.pacingScore) : null,
      })
      .eq('id', recordingId);

    if (error) {
      console.error('Recording update error:', error);
      return NextResponse.json(
        { error: `Failed to update recording: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`✅ Recording ${recordingId} updated with transcript`);

    return NextResponse.json(
      { success: true, message: 'Recording updated successfully' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error in update-recording API:', error);

    const errorMessage = error instanceof Error
      ? error.message
      : 'An unexpected error occurred while updating recording';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use PATCH to update recordings.' },
    { status: 405 }
  );
}
