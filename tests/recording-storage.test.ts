import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { loadSource, USER_A, RECORDING, SESSION, QUESTION } from './module-loader';
import { MAX_VIDEO_BYTES, MAX_TRANSCRIPTION_BYTES, STORAGE_RESTRICTED_MESSAGE, transcriptionForm } from '../src/utils/recordingContract';

function uploadFixture(uploadError?: unknown, recoveryError?: unknown) {
  let uploads = 0; let downloads = 0; let uploaded: Blob | undefined;
  const previous = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline-placeholder';
  try {
    const service = loadSource<typeof import('../src/services/supabase')>('src/services/supabase.ts', {
      '@supabase/supabase-js': { createClient: () => ({ storage: { from: () => ({
        upload: async (path: string, blob: Blob) => {
          uploads++; uploaded = blob;
          return { data: uploadError ? null : { path }, error: uploadError ?? null };
        },
        download: async () => { downloads++; return { data: null, error: recoveryError ?? null }; },
      }) } }) },
    });
    return { service, counts: () => ({ uploads, downloads }), uploaded: () => uploaded };
  } finally {
    for (const [index, name] of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].entries()) {
      if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index];
    }
  }
}

test('video upload accepts the documented Free byte boundary and refuses one byte more before Storage calls', async () => {
  assert.equal(MAX_VIDEO_BYTES, 52_428_800);
  const f = uploadFixture();
  const exact = new Blob([new Uint8Array(MAX_VIDEO_BYTES)], { type: 'video/webm;codecs=vp8,opus' });
  await f.service.uploadVideo(USER_A, SESSION, exact, RECORDING);
  assert.equal(f.uploaded(), exact);
  const oversized = new Blob([exact, new Uint8Array(1)], { type: exact.type });
  await assert.rejects(f.service.uploadVideo(USER_A, SESSION, oversized, RECORDING), /50 MB.*download the original/);
  assert.deepEqual(f.counts(), { uploads: 1, downloads: 0 });
  assert.equal(oversized.size, MAX_VIDEO_BYTES + 1);
});

test('Storage restrictions and size rejections remain actionable and do not trigger a reconciliation download', async () => {
  const blob = new Blob([new Uint8Array(110_000)], { type: 'video/mp4' });
  for (const error of [{ status: 402, statusCode: '402' }, { statusCode: '402' }]) {
    const f = uploadFixture({ ...error, message: 'provider details must not reach the UI' });
    await assert.rejects(f.service.uploadVideo(USER_A, SESSION, blob, RECORDING), { message: STORAGE_RESTRICTED_MESSAGE });
    assert.deepEqual(f.counts(), { uploads: 1, downloads: 0 });
    assert.equal(f.uploaded(), blob);
  }
  for (const error of [{ status: 413 }, { code: 'EntityTooLarge' }, { status: 400, message: 'The object exceeded the maximum allowed size' }]) {
    const f = uploadFixture(error);
    await assert.rejects(f.service.uploadVideo(USER_A, SESSION, blob, RECORDING), /storage service rejected this video as too large.*Download the original/);
    assert.deepEqual(f.counts(), { uploads: 1, downloads: 0 });
  }
});

test('an uncertain upload followed by restricted Storage reports restriction while preserving the captured source', async () => {
  const f = uploadFixture(new Error('Response lost'), { status: 402, statusCode: '402' });
  const blob = new Blob([new Uint8Array(110_000)], { type: 'video/webm' });
  await assert.rejects(f.service.uploadVideo(USER_A, SESSION, blob, RECORDING), { message: STORAGE_RESTRICTED_MESSAGE });
  assert.deepEqual(f.counts(), { uploads: 1, downloads: 1 });
  assert.equal(f.uploaded(), blob);
  const denied = uploadFixture({ status: 403, message: 'Access denied' });
  await assert.rejects(denied.service.uploadVideo(USER_A, SESSION, blob, RECORDING), /Could not confirm this video upload/);
});

function sourceNode(file: string, pick: (node: ts.Node, source: ts.SourceFile) => boolean): string {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result = '';
  const visit = (node: ts.Node) => {
    if (pick(node, source)) result = node.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(result);
  return result;
}

test('the actual recording context returns the save failure without losing captured media or earlier feedback', async () => {
  const declaration = sourceNode('src/context/InterviewContext.tsx', (node, source) =>
    ts.isVariableDeclaration(node) && node.name.getText(source) === 'addRecording');
  const compiled = ts.transpileModule(`const ${declaration}; addRecording;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const old = { questionId: QUESTION, timestamp: 1, recordingId: 'earlier-answer', transcript: 'Existing transcript', feedback: 'Existing feedback' };
  const blob = new Blob(['original video']); const audio = new Blob(['original audio']);
  let rows: object[] = [old];
  const capture = { questionId: QUESTION, timestamp: 2, videoBlob: blob, audioBlob: audio, saveCheckpoint: { captureId: RECORDING } };
  const invoke = runInNewContext(compiled, {
    Error, MAX_TRANSCRIPTION_BYTES, user: { id: USER_A }, sessionId: SESSION,
    setRecordings: (update: (rows: object[]) => object[]) => { rows = update(rows); },
    saveRecordingToSupabase: async () => { throw new Error(STORAGE_RESTRICTED_MESSAGE); },
    console: { error: () => {} }, Sentry: { captureException: () => {} },
  }) as (capture: object) => Promise<{ recordingId?: string; error?: string }>;
  const result = await invoke(capture);
  assert.equal(result.error, STORAGE_RESTRICTED_MESSAGE); assert.equal(result.recordingId, undefined);
  assert.equal(rows[0], old);
  const retained = rows[1] as typeof capture;
  assert.equal(retained.videoBlob, blob); assert.equal(retained.audioBlob, audio);
  assert.equal(retained.saveCheckpoint, capture.saveCheckpoint);
});

test('the real recovery panel renders the specific restriction with download and retry controls', () => {
  const panel = sourceNode('src/app/interview/page.tsx', (node, source) => ts.isJsxElement(node)
    && node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === 'role' && prop.initializer?.getText(source) === '"status"'));
  const compiled = ts.transpileModule(`const panel = (${panel}); panel;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const element = runInNewContext(compiled, {
    require: createRequire(import.meta.url), exports: {}, isSavingRecording: false, saveFailed: true, saveError: STORAGE_RESTRICTED_MESSAGE,
    handleToggleRecording: () => {}, downloadCapturedOriginal: () => {}, discardCapturedAnswer: () => {},
  });
  const html = renderToStaticMarkup(element);
  assert.match(html, /role="status"/);
  assert.ok(html.includes(STORAGE_RESTRICTED_MESSAGE));
  assert.match(html, /Download original/); assert.match(html, /Retry saving/);
  assert.doesNotMatch(html, /check your connection|upgrade.*plan/i);
});

test('client and transcription route share the audio byte limit, including direct oversized submissions', async () => {
  let owned = 0;
  const forbidden = () => { throw new Error('No provider or mutation is needed for an already transcribed recording'); };
  const clients = { getAdmin: () => ({ auth: { getUser: async () => ({ data: { user: { id: USER_A } }, error: null }) }, from: forbidden }) };
  const route = loadSource<{ POST(request: Request): Promise<Response> }>('src/app/api/transcribe/route.ts', {
    '@/server/clients': clients, './clients': clients,
    '@/server/practice': {
      ownedRecording: async () => { owned++; return { recording: { transcript: 'An existing answer for this question.', duration: 5 }, question: { question_text: 'Question?' } }; },
      reserveOperation: forbidden, releaseOperation: async () => {},
    },
    '@/services/whisper': { transcribeAudio: forbidden },
  });
  const audio = new Blob([new Uint8Array(MAX_TRANSCRIPTION_BYTES)], { type: 'audio/webm' });
  const request = (body: FormData) => new Request('http://localhost/api/transcribe', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body });
  const accepted = await route.POST(request(transcriptionForm(audio, RECORDING)));
  assert.equal(accepted.status, 200);
  const oversized = new Blob([audio, new Uint8Array(1)], { type: audio.type });
  assert.throws(() => transcriptionForm(oversized, RECORDING), /4 MiB/);
  const direct = new FormData(); direct.append('recordingId', RECORDING); direct.append('audio', oversized, 'answer.webm');
  const rejected = await route.POST(request(direct));
  assert.equal(rejected.status, 413);
  assert.equal((await rejected.json()).code, 'audio_too_large');
  assert.equal(owned, 2);
});
