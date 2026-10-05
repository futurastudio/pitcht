import 'server-only';
import { getAdmin } from './clients';
import { refreshUserBilling } from './billing';
import { ApiError } from './errors';
import type { SessionType } from '@/types/interview';

export async function getPracticeAccess(userId: string) {
  await refreshUserBilling(userId);
  const { data, error } = await getAdmin().rpc('practice_access_status', { p_user_id: userId });
  if (error || !data || typeof data.allowed !== 'boolean') throw new Error('Entitlement lookup failed');
  return data;
}

export async function reserveOperation(userId: string, operation: string, recordingId?: string) {
  await refreshUserBilling(userId);
  const { data, error } = await getAdmin().rpc('consume_ai_budget', {
    p_user_id: userId, p_operation: operation, p_recording_id: recordingId ?? null,
  });
  if (error || !data || typeof data.allowed !== 'boolean') throw new Error('Operation budget unavailable');
  if (!data.allowed) {
    const statuses: Record<string, number> = { not_owned: 404, quota_exhausted: 402, work_in_progress: 409, rate_limited: 429 };
    const messages: Record<string, string> = {
      not_owned: 'Recording not found.', quota_exhausted: 'Your practice allowance is used. Upgrade to continue.',
      work_in_progress: 'This answer is already processing. Please wait and try again.',
      rate_limited: 'Too many requests. Please try again later.',
    };
    throw new ApiError(statuses[data.reason] ?? 503, messages[data.reason] ?? 'Operation unavailable.', data.reason);
  }
  return data.token as string | null;
}

export async function releaseOperation(userId: string, token: string | null) {
  if (!token) return;
  try {
    const { error } = await getAdmin().from('ai_operation_leases').delete().eq('user_id', userId).eq('token', token);
    if (error) throw new Error('Lease release failed');
  } catch {
    console.error('[practice] Lease release failed; bounded expiry will release it');
  }
}

export async function ownedRecording(recordingId: string, userId: string) {
  const db = getAdmin();
  const { data: recording, error } = await db.from('recordings').select('*').eq('id', recordingId).maybeSingle();
  if (error) throw new Error('Recording lookup failed');
  if (!recording) throw new ApiError(404, 'Recording not found.');
  const { data: session, error: sessionError } = await db.from('sessions').select('*')
    .eq('id', recording.session_id).eq('user_id', userId).maybeSingle();
  if (sessionError) throw new Error('Session lookup failed');
  if (!session) throw new ApiError(404, 'Recording not found.');
  const { data: question, error: questionError } = await db.from('questions').select('*')
    .eq('id', recording.question_id).eq('session_id', session.id).maybeSingle();
  if (questionError) throw new Error('Question lookup failed');
  if (!question) throw new ApiError(409, 'Recording question is unavailable.');
  return { recording, session, question };
}

export function sessionContext(body: Record<string, unknown>) {
  const types = ['job-interview', 'internship-interview', 'presentation'];
  if (typeof body.sessionType !== 'string' || !types.includes(body.sessionType)) throw new ApiError(400, 'Invalid session type.');
  const context = body.context ?? '';
  if (typeof context !== 'string' || context.length > 20_000) throw new ApiError(400, 'Context must be at most 20,000 characters.');
  const difficulty = body.difficulty ?? 'intermediate';
  if (!['beginner', 'intermediate', 'advanced'].includes(String(difficulty))) throw new ApiError(400, 'Invalid difficulty.');
  return { sessionType: body.sessionType as SessionType, context, difficulty: difficulty as 'beginner' | 'intermediate' | 'advanced' };
}
