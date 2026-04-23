/**
 * DB-level assertions for the audit agent.
 *
 * The previous audit relied on string-matching the rendered /history page to
 * decide whether a session had persisted. That check passed for Fabiana's
 * account even though her recordings never wrote to the database — because
 * the UI showed the shell of a session card regardless.
 *
 * These helpers query Supabase directly via the service role so the audit
 * fails loudly the moment a recording is lost in flight.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error('Audit DB assertions: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getUserIdByEmail(email: string): Promise<string | null> {
  const sb = admin();
  const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = (data?.users ?? []).find((u: { email?: string }) => u.email === email);
  return user?.id ?? null;
}

export interface PersistedState {
  sessions: number;
  completedSessions: number;
  recordings: number;
  recordingsWithVideoUrl: number;
  recordingsWithTranscript: number;
  analyses: number;
  sampleRecording?: {
    id: string;
    video_url: string | null;
    transcript: string | null;
    duration: number | null;
    words_per_minute: number | null;
    filler_word_count: number | null;
    clarity_score: number | null;
    pacing_score: number | null;
  };
}

/**
 * Query the DB state for a given user, restricted to rows created at or after
 * `sinceIso`. This is called after the audit journey finishes to verify
 * that the full save pipeline (blob upload → recordings row → session row)
 * actually wrote data.
 */
export async function getPersistedState(
  userId: string,
  sinceIso: string
): Promise<PersistedState> {
  const sb = admin();

  const [sessionsRes, recordingsRes] = await Promise.all([
    sb
      .from('sessions')
      .select('id, status, created_at')
      .eq('user_id', userId)
      .gte('created_at', sinceIso),
    sb
      .from('recordings')
      .select(
        'id, video_url, transcript, duration, words_per_minute, filler_word_count, clarity_score, pacing_score, created_at'
      )
      .eq('user_id', userId)
      .gte('created_at', sinceIso),
  ]);

  const sessions = sessionsRes.data ?? [];
  const recordings = recordingsRes.data ?? [];

  let analyses = 0;
  if (recordings.length > 0) {
    const { count } = await sb
      .from('analyses')
      .select('id', { count: 'exact', head: true })
      .in('recording_id', recordings.map((r) => r.id as string));
    analyses = count ?? 0;
  }

  const sample = recordings[0];
  return {
    sessions: sessions.length,
    completedSessions: sessions.filter((s) => s.status === 'completed').length,
    recordings: recordings.length,
    recordingsWithVideoUrl: recordings.filter((r) => Boolean(r.video_url)).length,
    recordingsWithTranscript: recordings.filter((r) => Boolean(r.transcript)).length,
    analyses,
    sampleRecording: sample
      ? {
          id: sample.id as string,
          video_url: (sample.video_url as string | null) ?? null,
          transcript: (sample.transcript as string | null) ?? null,
          duration: (sample.duration as number | null) ?? null,
          words_per_minute: (sample.words_per_minute as number | null) ?? null,
          filler_word_count: (sample.filler_word_count as number | null) ?? null,
          clarity_score: (sample.clarity_score as number | null) ?? null,
          pacing_score: (sample.pacing_score as number | null) ?? null,
        }
      : undefined,
  };
}
