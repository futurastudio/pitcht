import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSource, USER_A, USER_B, RECORDING, SESSION, QUESTION } from './module-loader';
import type { RecordingSaveCheckpoint } from '../src/services/sessionManager';
import { STORAGE_RESTRICTED_MESSAGE } from '../src/utils/recordingContract';

type RecordingRow = { id: string; session_id: string; question_id: string; video_url: string };
type Failure = 'upload_response_lost' | 'upload_and_read_lost' | 'insert_failure' | 'insert_response_lost' | 'insert_and_read_lost' | 'session_restricted' | 'reconcile_restricted' | 'none';
function fixture(failure: Failure = 'none') {
  const objects = new Map<string, Blob>(); const rows = new Map<string, RecordingRow>();
  let uploads = 0; let inserts = 0; let reads = 0; let ownership = USER_A;
  let uploadFailed = false; let insertFailed = false; let readFailed = false;
  const api = {
    storage: { from: () => ({
      upload: async (path: string, blob: Blob, options: { upsert: boolean }) => {
        uploads++; assert.equal(options.upsert, false);
        if (objects.has(path)) return { data: null, error: { message: 'Object exists' } };
        objects.set(path, blob);
        if (!uploadFailed && failure.startsWith('upload_')) { uploadFailed = true; throw new Error('Committed upload response lost'); }
        return { data: { path }, error: null };
      },
      download: async (path: string) => {
        if (failure === 'upload_and_read_lost' && !readFailed) { readFailed = true; throw new Error('Uncertain object read'); }
        return { data: objects.get(path) ?? null, error: null };
      },
    }) },
    from: (table: string) => {
      let id = ''; let inserted: RecordingRow | undefined;
      const query = {
        select: () => query, eq: (_key: string, value: string) => { id = value; return query; },
        insert: (row: RecordingRow) => { inserted = row; return query; },
        single: async () => {
          if (table === 'sessions' && failure === 'session_restricted') return { data: null, error: { message: 'Service restricted' }, status: 402 };
          if (table === 'sessions') return { data: { user_id: ownership }, error: null };
          assert.ok(inserted); inserts++;
          if (failure === 'insert_failure' && !insertFailed) { insertFailed = true; return { data: null, error: { message: 'Temporary insert rejection' } }; }
          if (rows.has(inserted.id)) return { data: null, error: { message: 'Duplicate id' } };
          rows.set(inserted.id, inserted);
          if (!insertFailed && failure.startsWith('insert_')) { insertFailed = true; throw new Error('Committed insert response lost'); }
          return { data: inserted, error: null };
        },
        maybeSingle: async () => {
          reads++;
          if (failure === 'reconcile_restricted') return { data: null, error: { message: 'Service restricted' }, status: 402 };
          if (failure === 'insert_and_read_lost' && insertFailed && !readFailed) { readFailed = true; return { data: null, error: { message: 'Reconciliation unavailable' } }; }
          return { data: rows.get(id) ?? null, error: null };
        },
      };
      return query;
    },
  };
  const env = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline-test';
  let service: typeof import('../src/services/sessionManager');
  try { service = loadSource('src/services/sessionManager.ts', { '@supabase/supabase-js': { createClient: () => api } }); }
  finally {
    for (const [i, key] of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].entries()) {
      if (env[i] === undefined) delete process.env[key]; else process.env[key] = env[i];
    }
  }
  const blob = new Blob([new Uint8Array(110_000).fill(42)], { type: 'video/webm;codecs=vp8,opus' });
  const checkpoint: RecordingSaveCheckpoint = { captureId: RECORDING };
  return {
    checkpoint, blob, objects, rows, expectedPath: `${USER_A}/${SESSION}/${RECORDING}.webm`,
    counters: () => ({ uploads, inserts, reads }), setOwner: (owner: string) => { ownership = owner; },
    save: () => service.saveRecording(USER_A, SESSION, QUESTION, blob, '', 0, {}, checkpoint),
  };
}

for (const failure of ['upload_response_lost', 'upload_and_read_lost', 'insert_failure', 'insert_response_lost', 'insert_and_read_lost'] as const) {
  test(`${failure}: actual save service reconciles one immutable object/row before confirming the provider may run`, async () => {
    const f = fixture(failure); let providerCalls = 0;
    const saveThenProcess = async () => { const saved = await f.save(); assert.equal(saved.id, RECORDING); providerCalls++; return saved; };
    if (['upload_and_read_lost', 'insert_failure', 'insert_and_read_lost'].includes(failure)) {
      await assert.rejects(saveThenProcess()); assert.equal(providerCalls, 0);
      if (!failure.startsWith('upload')) assert.equal(f.checkpoint.uploadedPath, f.expectedPath);
    }
    const saved = await saveThenProcess();
    assert.deepEqual({ ...saved }, { id: RECORDING, videoUrl: f.expectedPath });
    assert.equal(providerCalls, 1); assert.equal(f.objects.size, 1); assert.equal(f.rows.size, 1);
    assert.equal(f.objects.get(f.expectedPath), f.blob);
    const before = f.counters(); await f.save();
    assert.equal(f.counters().uploads, before.uploads); assert.equal(f.counters().inserts, before.inserts);
    if (failure === 'insert_failure') { assert.equal(before.uploads, 1); assert.equal(before.inserts, 2); }
    if (failure.startsWith('insert_') && failure !== 'insert_failure') assert.equal(before.inserts, 1);
  });
}

test('capture conflict, wrong session ownership and altered existing media fail closed without overwrites', async () => {
  for (const field of ['session_id', 'question_id', 'video_url'] as const) {
    const f = fixture();
    f.rows.set(RECORDING, { id: RECORDING, session_id: SESSION, question_id: QUESTION, video_url: f.expectedPath, [field]: 'different' });
    await assert.rejects(f.save(), /different answer/);
    assert.equal(f.counters().uploads, 0); assert.equal(f.counters().inserts, 0);
  }
  const foreign = fixture(); foreign.setOwner(USER_B);
  await assert.rejects(foreign.save(), /ownership/); assert.equal(foreign.counters().uploads, 0);
  const changed = fixture(); const wrongBytes = new Blob([new Uint8Array(110_000).fill(7)], { type: 'video/webm' });
  changed.objects.set(changed.expectedPath, wrongBytes);
  await assert.rejects(changed.save(), /Could not confirm this video upload/);
  assert.equal(changed.objects.get(changed.expectedPath), wrongBytes); assert.equal(changed.rows.size, 0);
});

test('provider restriction during recording preflight is not presented as a sign-in or connection problem', async () => {
  for (const failure of ['session_restricted', 'reconcile_restricted'] as const) {
    const f = fixture(failure);
    await assert.rejects(f.save(), { message: STORAGE_RESTRICTED_MESSAGE });
    assert.equal(f.counters().uploads, 0); assert.equal(f.counters().inserts, 0);
    assert.equal(f.checkpoint.captureId, RECORDING); assert.equal(f.checkpoint.uploadedPath, undefined);
    assert.equal(f.blob.size, 110_000);
  }
});
