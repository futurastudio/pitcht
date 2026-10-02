import { NextResponse } from 'next/server';
import { generateFeedback } from '@/services/claude';
import { analyzeSpeech } from '@/services/speechAnalyzer';
import type { SessionType } from '@/types/interview';
import type { Diagnosis } from '@/utils/diagnosisTaxonomy';
import { authenticate, fail, readJson, requireRecordingId } from '@/server/http';
import { ApiError } from '@/server/errors';
import { getAdmin } from '@/server/clients';
import { ownedRecording, reserveOperation, releaseOperation } from '@/server/practice';

export const maxDuration = 60;

export interface GenerateFeedbackRequest {
  recordingId: string;
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
  diagnosis?: Diagnosis;
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


export async function POST(request: Request) {
  let token: string | null = null;
  let userId: string | undefined;
  try {
    const user = await authenticate(request);
    userId = user.id;
    const body = await readJson(request);
    const id = requireRecordingId(body.recordingId);
    const { recording, session, question } = await ownedRecording(id, user.id);
    const { data: saved, error: savedError } = await getAdmin().from('analyses').select('*').eq('recording_id', id).maybeSingle();
    if (savedError) throw new Error('Analysis lookup failed');
    const speech = analyzeSpeech(recording.transcript ?? '', recording.duration);
    const metrics = { wordsPerMinute: speech.wordsPerMinute, fillerWordCount: speech.fillerWordCount,
      clarityScore: speech.clarityScore, pacingScore: speech.pacingScore, totalWords: speech.totalWords,
      eyeContactPercentage: recording.eye_contact_percentage ?? undefined,
      dominantEmotion: recording.dominant_emotion ?? undefined, presenceScore: recording.presence_score ?? undefined };
    const savedResponse = (saved: Record<string, unknown>) => {
      return NextResponse.json({ overallScore: saved.overall_score, contentScore: saved.content_score,
        communicationScore: saved.communication_score, deliveryScore: saved.delivery_score, summary: saved.summary,
        communicationPatterns: saved.communication_patterns, strengths: saved.strengths, improvements: saved.improvements,
        nextSteps: saved.next_steps, diagnosis: saved.diagnosis ?? undefined, metrics, generatedAt: saved.created_at });
    };
    if (saved) return savedResponse(saved);
    if (typeof recording.transcript !== 'string' || !recording.transcript.trim()) throw new ApiError(409, 'Transcript is not ready.');
    if (recording.transcript.length > 50_000 || String(session.context ?? '').length > 20_000) throw new ApiError(400, 'Answer context is too large.');
    token = await reserveOperation(user.id, 'feedback', id);
    const { data: completed, error: cacheError } = await getAdmin().from('analyses').select('*').eq('recording_id', id).maybeSingle();
    if (cacheError) throw new Error('Analysis lookup failed');
    if (completed) return savedResponse(completed);
    // Client legacy fields remain accepted; saved session/answer context is authoritative.
    const feedback = await generateFeedback({ sessionType: session.session_type as SessionType,
      question: question.question_text, transcript: recording.transcript, context: session.context ?? '',
      analysisData: { wordsPerMinute: speech.wordsPerMinute, fillerWordCount: speech.fillerWordCount,
        eyeContactPercentage: metrics.eyeContactPercentage, dominantEmotion: metrics.dominantEmotion, presenceScore: metrics.presenceScore } });
    validateFeedback(feedback);
    const response: GenerateFeedbackResponse = { ...feedback, metrics, generatedAt: new Date().toISOString() };
    const { data, error } = await getAdmin().from('analyses').insert({
      recording_id: id, overall_score: feedback.overallScore, content_score: feedback.contentScore ?? null,
      communication_score: feedback.communicationScore ?? null, delivery_score: feedback.deliveryScore ?? null,
      summary: feedback.summary, communication_patterns: feedback.communicationPatterns ?? null,
      strengths: feedback.strengths, improvements: feedback.improvements, next_steps: feedback.nextSteps,
      diagnosis: feedback.diagnosis ?? null,
    }).select('recording_id').single();
    if (error || data?.recording_id !== id) throw new Error('Analysis persistence failed');
    return NextResponse.json(response);
  } catch (error) { return fail(error); }
  finally { if (userId) await releaseOperation(userId, token); }
}

function validateFeedback(value: Omit<GenerateFeedbackResponse, 'metrics' | 'generatedAt'>) {
  for (const score of [value.overallScore, value.contentScore, value.communicationScore, value.deliveryScore]) {
    if (score !== undefined && (!Number.isFinite(score) || score < 0 || score > 100)) throw new ApiError(502, 'Invalid feedback returned.');
  }
  if (typeof value.overallScore !== 'number' || typeof value.summary !== 'string' ||
      !Array.isArray(value.strengths) || !Array.isArray(value.improvements) || !Array.isArray(value.nextSteps) ||
      value.strengths.some(s => !s || typeof s.area !== 'string' || typeof s.detail !== 'string') ||
      value.improvements.some(s => !s || typeof s.area !== 'string' || typeof s.detail !== 'string' || typeof s.suggestion !== 'string') ||
      value.nextSteps.some(s => typeof s !== 'string')) throw new ApiError(502, 'Invalid feedback returned.');
}
export async function GET() { return NextResponse.json({ error: 'Use POST.' }, { status: 405 }); }
