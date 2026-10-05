import { recordingMetadata } from './recordingContract';
import type { Recording } from '@/context/InterviewContext';
import type { Question } from '@/types/interview';

const prefix = 'pitcht_recovery:';
const legacy = ['pitcht_session_type', 'pitcht_session_context', 'pitcht_recordings', 'pitcht_questions', 'pitcht_session_id', 'pitcht_anonymous_user_id'];
export const ACCOUNT_CHANGE_EVENT = 'pitcht:before-account-change';
export const UNSAVED_ACCOUNT_MESSAGE = 'Save or download your captured answer, or choose Discard, before signing out or changing accounts.';

export type Recovery = { sessionType: string | null; sessionContext: string; recordings: Recording[]; questions: Question[]; sessionId: string | null };

/** Legacy data has no provable owner. Never adopt it into the next account. */
export function clearOtherRecovery(storage: Storage, ownerId: string | null) {
  for (const key of legacy) storage.removeItem(key);
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) if (key?.startsWith(prefix) && key !== (ownerId ? prefix + ownerId : null)) storage.removeItem(key);
}

export function readRecovery(storage: Storage, ownerId: string): Recovery | null {
  try {
    const value = JSON.parse(storage.getItem(prefix + ownerId) ?? 'null');
    if (!value || value.ownerId !== ownerId || value.version !== 1 ||
        !(value.sessionType === null || typeof value.sessionType === 'string') || typeof value.sessionContext !== 'string' ||
        !(value.sessionId === null || typeof value.sessionId === 'string') || !Array.isArray(value.questions) || !Array.isArray(value.recordings)) return null;
    // Blobs are memory-only. Old serialized objects must never masquerade as media.
    return { sessionType: value.sessionType, sessionContext: value.sessionContext, sessionId: value.sessionId,
      questions: value.questions.filter((q: Question) => q && typeof q.id === 'string' && typeof q.text === 'string'),
      recordings: value.recordings.filter((r: Recording) => r && typeof r.questionId === 'string' && typeof r.questionText === 'string' && typeof r.timestamp === 'number').map(recordingMetadata) };
  } catch { return null; }
}

export function writeRecovery(storage: Storage, ownerId: string, value: Recovery) {
  storage.setItem(prefix + ownerId, JSON.stringify({ version: 1, ownerId, ...value, recordings: value.recordings.map(recordingMetadata) }));
}

export function clearRecovery(storage: Storage, ownerId: string) { storage.removeItem(prefix + ownerId); }
