/**
 * Session Manager Service
 * Handles all database operations for sessions, questions, recordings, and analyses
 */

import { supabase, uploadVideo, getVideoUrl as getVideoUrlFromStorage } from './supabase';
import type { SessionType, Question } from '@/types/interview';

// Re-export getVideoUrl for convenience
export { getVideoUrl } from './supabase';

/**
 * Analysis/Feedback data structure
 * Matches the structure from generate-feedback API
 */
export interface FeedbackData {
  overallScore: number;
  contentScore?: number;          // NEW: Content quality score
  communicationScore?: number;    // NEW: Communication effectiveness score
  deliveryScore?: number;         // NEW: Delivery score
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
    example?: string;             // NEW: Framework examples
    priority: 'high' | 'medium' | 'low';
  }>;
  nextSteps: string[];
}

/**
 * Recording metrics structure
 */
export interface RecordingMetrics {
  // Speech metrics
  wordsPerMinute?: number;
  fillerWordCount?: number;
  clarityScore?: number;
  pacingScore?: number;
  // Video metrics (Sprint 4/5A)
  eyeContactPercentage?: number;
  gazeStability?: number;
  dominantEmotion?: string;
  emotionConfidence?: number;
  presenceScore?: number;
}

/**
 * Create new practice session
 * @param userId - User ID from Supabase Auth
 * @param sessionType - Type of session (job-interview, presentation, sales-pitch)
 * @param context - Context/description for the session
 * @param questions - Generated questions for this session
 * @returns Session ID
 */
export async function createSession(
  userId: string,
  sessionType: SessionType,
  context: string,
  questions: Question[]
): Promise<string> {
  console.log(`📝 Creating session: ${sessionType}`);

  // Insert session
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      session_type: sessionType,
      context: context,
      status: 'in_progress',
    })
    .select('id')
    .single();

  if (sessionError) {
    console.error('Session creation error:', sessionError);
    throw new Error(`Failed to create session: ${sessionError.message}`);
  }

  const sessionId = session.id;
  console.log(`✅ Session created: ${sessionId}`);

  // Insert questions
  if (questions.length > 0) {
    const questionsData = questions.map((q, index) => ({
      id: q.id, // CRITICAL: Use the UUID from client-side question (generated in claude.ts)
      session_id: sessionId,
      question_text: q.text,
      question_type: q.type,
      difficulty: q.difficulty || 3,
      position: index,
    }));

    const { error: questionsError } = await supabase
      .from('questions')
      .insert(questionsData);

    if (questionsError) {
      console.error('Questions insert error:', questionsError);
      throw new Error(`Failed to save questions: ${questionsError.message}`);
    }

    console.log(`✅ ${questions.length} questions saved with IDs:`, questionsData.map(q => q.id));
  }

  return sessionId;
}

/**
 * Save recording with video and metrics
 * @param userId - User ID
 * @param sessionId - Session ID
 * @param questionId - Question ID
 * @param videoBlob - Video blob to upload
 * @param transcript - Transcript text
 * @param duration - Recording duration in seconds
 * @param metrics - All metrics (speech + video)
 * @returns Object with recording ID and video URL (for analysis page playback)
 */
export async function saveRecording(
  userId: string,
  sessionId: string,
  questionId: string,
  videoBlob: Blob,
  transcript: string,
  duration: number,
  metrics: RecordingMetrics
): Promise<{ id: string; videoUrl: string }> {
  console.log(`💾 Saving recording for question: ${questionId}`);

  // Upload video to storage
  const videoPath = await uploadVideo(userId, sessionId, videoBlob);

  // Insert recording with all metrics
  // Round all numeric values to integers (database expects INTEGER not FLOAT)
  const { data: recording, error } = await supabase
    .from('recordings')
    .insert({
      session_id: sessionId,
      question_id: questionId,
      video_url: videoPath,
      transcript: transcript,
      duration: Math.round(duration),
      // Speech metrics (round to integers)
      words_per_minute: metrics.wordsPerMinute ? Math.round(metrics.wordsPerMinute) : null,
      filler_word_count: metrics.fillerWordCount ? Math.round(metrics.fillerWordCount) : null,
      clarity_score: metrics.clarityScore ? Math.round(metrics.clarityScore) : null,
      pacing_score: metrics.pacingScore ? Math.round(metrics.pacingScore) : null,
      // Video metrics (round to integers)
      eye_contact_percentage: metrics.eyeContactPercentage ? Math.round(metrics.eyeContactPercentage) : null,
      gaze_stability: metrics.gazeStability ? Math.round(metrics.gazeStability) : null,
      dominant_emotion: metrics.dominantEmotion,
      emotion_confidence: metrics.emotionConfidence ? Math.round(metrics.emotionConfidence) : null,
      presence_score: metrics.presenceScore ? Math.round(metrics.presenceScore) : null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Recording save error:', error);
    throw new Error(`Failed to save recording: ${error.message}`);
  }

  console.log(`✅ Recording saved: ${recording.id}, video URL: ${videoPath}`);
  // Return both ID and video URL - videoUrl is CRITICAL for analysis page playback
  return { id: recording.id, videoUrl: videoPath };
}

/**
 * Save AI analysis/feedback for a recording
 * @param recordingId - Recording ID
 * @param feedback - Feedback data from Claude
 */
export async function saveAnalysis(
  recordingId: string,
  feedback: FeedbackData
): Promise<void> {
  console.log(`📊 Saving analysis for recording: ${recordingId}`);

  const { error } = await supabase
    .from('analyses')
    .insert({
      recording_id: recordingId,
      overall_score: feedback.overallScore,
      content_score: feedback.contentScore || null,           // NEW
      communication_score: feedback.communicationScore || null, // NEW
      delivery_score: feedback.deliveryScore || null,          // NEW
      summary: feedback.summary,
      communication_patterns: feedback.communicationPatterns || null, // NEW
      strengths: feedback.strengths,
      improvements: feedback.improvements,
      next_steps: feedback.nextSteps,
    });

  if (error) {
    console.error('Analysis save error:', error);
    throw new Error(`Failed to save analysis: ${error.message}`);
  }

  console.log(`✅ Analysis saved with communication coaching fields`);
}

/**
 * Mark session as completed
 * @param sessionId - Session ID
 */
export async function completeSession(sessionId: string): Promise<void> {
  console.log(`✅ Completing session: ${sessionId}`);

  const { error } = await supabase
    .from('sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Session completion error:', error);
    throw new Error(`Failed to complete session: ${error.message}`);
  }

  console.log(`✅ Session marked as completed`);
}

/**
 * Get user's session history
 * @param userId - User ID
 * @param limit - Number of sessions to fetch (default: 50)
 * @returns Array of sessions with counts
 */
export async function getUserSessions(userId: string, limit: number = 50) {
  console.log(`📚 Fetching sessions for user: ${userId}`);

  const { data, error } = await supabase
    .from('sessions')
    .select(`
      id,
      session_type,
      context,
      status,
      created_at,
      completed_at,
      questions:questions(count),
      recordings:recordings(count)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Sessions fetch error:', error);
    throw new Error(`Failed to fetch sessions: ${error.message}`);
  }

  console.log(`✅ Found ${data.length} sessions`);
  return data;
}

/**
 * Get full session details with all recordings and analyses
 * @param sessionId - Session ID
 * @returns Session with questions, recordings, and analyses
 */
export async function getSessionDetails(sessionId: string) {
  console.log(`📖 Fetching session details: ${sessionId}`);

  const { data, error } = await supabase
    .from('sessions')
    .select(`
      *,
      questions (*),
      recordings (
        *,
        analyses (*)
      )
    `)
    .eq('id', sessionId)
    .single();

  if (error) {
    console.error('Session details fetch error:', error);
    throw new Error(`Failed to fetch session: ${error.message}`);
  }

  console.log(`✅ Session details loaded`);
  return data;
}

/**
 * Get a single recording with its analysis
 * @param recordingId - Recording ID
 * @returns Recording with analysis
 */
export async function getRecording(recordingId: string) {
  const { data, error } = await supabase
    .from('recordings')
    .select(`
      *,
      question:questions(*),
      analysis:analyses(*)
    `)
    .eq('id', recordingId)
    .single();

  if (error) {
    console.error('Recording fetch error:', error);
    throw new Error(`Failed to fetch recording: ${error.message}`);
  }

  // Get signed URL for video playback
  if (data.video_url) {
    const signedUrl = await getVideoUrlFromStorage(data.video_url);
    return {
      ...data,
      video_signed_url: signedUrl,
    };
  }

  return data;
}

/**
 * Delete a session and all associated data
 * (cascades to questions, recordings, analyses due to foreign keys)
 * @param sessionId - Session ID
 */
export async function deleteSession(sessionId: string): Promise<void> {
  console.log(`🗑️  Deleting session: ${sessionId}`);

  // Get all recordings to delete videos from storage
  const { data: recordings } = await supabase
    .from('recordings')
    .select('video_url')
    .eq('session_id', sessionId);

  // Delete session (cascades to all related records)
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    console.error('Session deletion error:', error);
    throw new Error(`Failed to delete session: ${error.message}`);
  }

  // Delete videos from storage
  if (recordings && recordings.length > 0) {
    const videoPaths = recordings
      .filter(r => r.video_url)
      .map(r => r.video_url as string);

    if (videoPaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('recordings')
        .remove(videoPaths);

      if (storageError) {
        console.error('Video deletion error:', storageError);
        // Don't throw - session is already deleted from database
      }
    }
  }

  console.log(`✅ Session deleted`);
}

/**
 * Get session statistics for a user
 * @param userId - User ID
 * @returns Statistics object
 */
export async function getUserStats(userId: string) {
  console.log(`📈 Fetching stats for user: ${userId}`);

  // Get total sessions
  const { count: totalSessions } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Get completed sessions
  const { count: completedSessions } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'completed');

  // Get total recordings
  const { count: totalRecordings } = await supabase
    .from('recordings')
    .select('*, sessions!inner(*)', { count: 'exact', head: true })
    .eq('sessions.user_id', userId);

  // Get average scores (from analyses)
  const { data: analyses } = await supabase
    .from('analyses')
    .select('overall_score, recordings!inner(session_id), sessions!inner(user_id)')
    .eq('sessions.user_id', userId);

  const avgScore = analyses && analyses.length > 0
    ? Math.round(analyses.reduce((sum, a) => sum + (a.overall_score || 0), 0) / analyses.length)
    : 0;

  return {
    totalSessions: totalSessions || 0,
    completedSessions: completedSessions || 0,
    totalRecordings: totalRecordings || 0,
    averageScore: avgScore,
  };
}

/**
 * Get user progress data (all recordings with metrics for charts)
 * @param userId - User ID
 * @returns Array of recordings with metrics
 */
export async function getUserProgressData(userId: string) {
  console.log(`📊 Fetching progress data for user: ${userId}`);

  const { data, error } = await supabase
    .from('recordings')
    .select(`
      created_at,
      clarity_score,
      pacing_score,
      eye_contact_percentage,
      presence_score,
      filler_word_count,
      words_per_minute,
      sessions!inner(user_id)
    `)
    .eq('sessions.user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Progress data fetch error:', error);
    throw new Error(`Failed to fetch progress data: ${error.message}`);
  }

  console.log(`✅ Found ${data.length} recordings for progress tracking`);
  return data;
}
