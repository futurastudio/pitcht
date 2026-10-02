import { NextResponse } from 'next/server';
import { transcribeAudio } from '@/services/whisper';
import { analyzeSpeech } from '@/services/speechAnalyzer';
import { authenticate, fail, requireRecordingId } from '@/server/http';
import { ApiError } from '@/server/errors';
import { getAdmin } from '@/server/clients';
import { ownedRecording, reserveOperation, releaseOperation } from '@/server/practice';

export const maxDuration = 60;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  let token: string | null = null;
  let userId: string | undefined;
  try {
    const user = await authenticate(request);
    userId = user.id;
    if (Number(request.headers.get('content-length')) > MAX_AUDIO_BYTES + 64_000) throw new ApiError(413, 'Audio upload is too large.');
    const form = await request.formData();
    const id = requireRecordingId(form.get('recordingId'));
    let { recording, question } = await ownedRecording(id, user.id);
    const audio = form.get('audio');
    if (!(audio instanceof File) || audio.size < 1) throw new ApiError(400, 'An audio file is required.');
    if (audio.size > MAX_AUDIO_BYTES) throw new ApiError(413, 'Audio must be at most 4 MiB. Open the saved answer from History and retry to compress its audio.', 'audio_too_large');
    const mime = audio.type.split(';')[0].trim().toLowerCase();
    if (!['audio/webm','audio/mpeg','audio/mp4','audio/wav','audio/ogg','video/webm'].includes(mime)) {
      throw new ApiError(400, 'Unsupported audio format.');
    }
    let result: { text: string; duration?: number; language?: string };
    if (recording.transcript?.trim() && recording.duration > 0) {
      result = { text: recording.transcript, duration: recording.duration };
    } else {
      token = await reserveOperation(user.id, 'transcribe', id);
      ({ recording, question } = await ownedRecording(id, user.id));
      if (recording.transcript?.trim() && recording.duration > 0) {
        result = { text: recording.transcript, duration: recording.duration };
      } else {
      const language = form.get('language');
      if (language !== null && (typeof language !== 'string' || !/^[a-zA-Z-]{2,12}$/.test(language))) throw new ApiError(400, 'Invalid language.');
      result = await transcribeAudio(audio, {
        language: typeof language === 'string' ? language : undefined,
        // The prompt is tied to the owned question, never arbitrary client text.
        prompt: String(question.question_text).slice(0, 2_000),
      });
      if (!result.text?.trim() || !Number.isFinite(result.duration) || !result.duration || result.duration <= 0 || result.duration > 3600) {
        throw new ApiError(502, 'Transcription did not return a usable answer.');
      }
      const metrics = analyzeSpeech(result.text, result.duration);
      const { data, error } = await getAdmin().from('recordings').update({
        transcript: result.text, duration: Math.max(1, Math.round(result.duration)),
        words_per_minute: Math.max(0, Math.min(400, Math.round(metrics.wordsPerMinute))),
        filler_word_count: Math.max(0, Math.round(metrics.fillerWordCount)),
        clarity_score: Math.max(0, Math.min(100, Math.round(metrics.clarityScore))),
        pacing_score: Math.max(0, Math.min(100, Math.round(metrics.pacingScore))),
      }).eq('id', id).eq('session_id', recording.session_id).select('id').single();
      if (error || data?.id !== id) throw new Error('Transcript persistence failed');
      }
    }
    const metrics = analyzeSpeech(result.text, result.duration);
    return NextResponse.json({ transcript: result.text, duration: result.duration, language: result.language,
      speechMetrics: { wordsPerMinute: metrics.wordsPerMinute, fillerWordCount: metrics.fillerWordCount,
        clarityScore: metrics.clarityScore, pacingScore: metrics.pacingScore }, transcribedAt: new Date().toISOString() });
  } catch (error) { return fail(error); }
  finally { if (userId) await releaseOperation(userId, token); }
}
export async function GET() { return NextResponse.json({ error: 'Use POST.' }, { status: 405 }); }
