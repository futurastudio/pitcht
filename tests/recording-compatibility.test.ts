import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { loadSource, USER_A, RECORDING } from './module-loader';
import { CLIENT_UPGRADE_MESSAGE, MAX_TRANSCRIPTION_BYTES, recordingMetadata, transcriptionForm } from '../src/utils/recordingContract';
import { supportedAudioMime } from '../src/utils/audioRecovery';

for (const endpoint of ['transcribe', 'generate-feedback']) {
  test(`${endpoint}: authenticated legacy shape gets actionable upgrade before ownership/quota/provider calls`, async () => {
    let calls = 0;
    const forbidden = () => { calls++; throw new Error('Must not reach provider or database'); };
    const clients = { getAdmin: () => ({ auth: { getUser: async () => ({ data: { user: { id: USER_A } } }) }, from: forbidden }) };
    const route = loadSource<{ POST(request: Request): Promise<Response> }>(`src/app/api/${endpoint}/route.ts`, {
      '@/server/clients': clients, './clients': clients,
      '@/server/practice': { ownedRecording: forbidden, reserveOperation: forbidden, releaseOperation: async () => {} },
      '@/services/whisper': { transcribeAudio: forbidden }, '@/services/claude': { generateFeedback: forbidden },
    });
    const form = new FormData(); form.append('audio', new Blob(['audio'], { type: 'audio/webm' }), 'answer.webm');
    const body = endpoint === 'transcribe' ? form : JSON.stringify({ transcript: 'legacy', questionText: 'question' });
    const response = await route.POST(new Request('http://localhost/test', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body }));
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: 'client_upgrade_required', error: CLIENT_UPGRADE_MESSAGE });
    assert.equal(calls, 0);
    const unauthenticated = await route.POST(new Request('http://localhost/test', { method: 'POST', body }));
    assert.equal(unauthenticated.status, 401);
    assert.equal(calls, 0);
  });
}

test('transcription form preserves owned ID, actual MIME/extension and bounded audio; rejects full video, empty and oversized bytes', () => {
  for (const [mime, extension] of [['audio/webm;codecs=opus', 'webm'], ['audio/mp4', 'm4a'], ['audio/ogg;codecs=opus', 'ogg']]) {
    const form = transcriptionForm(new Blob(['bytes'], { type: mime }), RECORDING);
    const audio = form.get('audio') as File;
    assert.equal(form.get('recordingId'), RECORDING);
    assert.equal(audio.type, mime); assert.equal(audio.name, `answer.${extension}`);
  }
  assert.throws(() => transcriptionForm(new Blob(['x'], { type: 'video/webm' }), RECORDING), /audio format/);
  assert.throws(() => transcriptionForm(new Blob(), RECORDING), /No audio/);
  assert.throws(() => transcriptionForm(new Blob([new Uint8Array(MAX_TRANSCRIPTION_BYTES + 1)], { type: 'audio/webm' }), RECORDING), /4 MiB/);
  assert.throws(() => transcriptionForm(new Blob(['x']), ''), /Wait until your recording finishes saving/);
  const accepted = transcriptionForm(new Blob([new Uint8Array(MAX_TRANSCRIPTION_BYTES)], { type: 'audio/webm' }), RECORDING);
  assert.equal((accepted.get('audio') as File).size, MAX_TRANSCRIPTION_BYTES);
});

test('local recovery metadata retains stable IDs/path and never claims JSON preserves media bytes', () => {
  const recording = { recordingId: RECORDING, videoUrl: `${USER_A}/session/video.webm`, timestamp: 10, videoBlob: new Blob(['video']), audioBlob: new Blob(['audio']) };
  assert.deepEqual(JSON.parse(JSON.stringify(recordingMetadata(recording))), { recordingId: RECORDING, videoUrl: recording.videoUrl, timestamp: 10 });
  assert.equal(recording.audioBlob.size, 5);
  assert.equal(supportedAudioMime(mime => mime === 'audio/mp4'), 'audio/mp4');
  assert.equal(supportedAudioMime(() => false), undefined);
});

// Execute the actual effects with delayed boundaries, rather than testing a duplicate guard implementation.
function pageEffect(marker: string) {
  const source = ts.createSourceFile('page.tsx', readFileSync('src/app/analysis/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes(marker)) callback = node.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(callback);
  return ts.transpileModule(`(${callback})`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('changing answer cancels the old video response before it can overwrite the new selection', async () => {
  const pending: Array<(value: unknown) => void> = []; const rendered: unknown[] = [];
  const state = { selectedRecording: { recordingId: 'A', videoPath: 'A' }, user: { id: USER_A }, window: { electron: { readVideo: () => new Promise(resolve => pending.push(resolve)) } }, setVideoSrc: (v: unknown) => rendered.push(v), console };
  const effect = runInNewContext(pageEffect('const loadVideo'), state) as () => () => void;
  const cleanup = effect(); cleanup(); state.selectedRecording = { recordingId: 'B', videoPath: 'B' }; effect();
  pending[1]({ success: true, data: 'video-B' }); await flush();
  pending[0]({ success: true, data: 'video-A' }); await flush();
  assert.equal(rendered.at(-1), 'video-B'); assert.ok(!rendered.includes('video-A'));
});

test('changing answer cancels the old feedback response and loading state', async () => {
  const pending: Array<(value: unknown) => void> = []; const rendered: unknown[] = []; const loading: unknown[] = [];
  const query = { select: () => query, eq: () => query, order: () => query, limit: () => new Promise(resolve => pending.push(resolve)) };
  const state = { selectedRecording: { recordingId: 'A', transcript: 'A' }, setFeedback: (v: unknown) => rendered.push(v), setFeedbackError: () => {}, setIsGeneratingFeedback: (v: unknown) => loading.push(v), require: () => ({ supabase: { from: () => query } }), console };
  const effect = runInNewContext(pageEffect('const loadOrGenerateFeedback'), state) as () => () => void;
  const cleanup = effect(); await flush(); cleanup(); state.selectedRecording = { recordingId: 'B', transcript: 'B' }; effect(); await flush();
  pending[1]({ data: [{ summary: 'feedback-B' }] }); await flush();
  pending[0]({ data: [{ summary: 'feedback-A' }] }); await flush();
  assert.equal((rendered.at(-1) as { summary: string }).summary, 'feedback-B');
  assert.ok(!rendered.some(value => (value as { summary?: string })?.summary === 'feedback-A'));
  assert.equal(loading.at(-1), false);
});

test('video upload accepts actual recorder codec MIME and stores matching file type without altering the source bytes', async () => {
  const previous = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY];
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'offline-placeholder';
  const uploads: Array<{ path: string; blob: Blob; options: { contentType: string; upsert: boolean } }> = [];
  try {
    const storage = loadSource<typeof import('../src/services/supabase')>('src/services/supabase.ts', {
      '@supabase/supabase-js': { createClient: () => ({ storage: { from: () => ({ upload: async (path: string, blob: Blob, options: { contentType: string; upsert: boolean }) => {
        uploads.push({ path, blob, options }); return { data: { path }, error: null };
      } }) } }) },
    });
    for (const mime of ['video/webm;codecs=vp8,opus', 'video/mp4;codecs=avc1.42001f,mp4a.40.2']) {
      const blob = new Blob([new Uint8Array(110_000)], { type: mime });
      await storage.uploadVideo(USER_A, RECORDING, blob, RECORDING);
      const saved = uploads.at(-1)!;
      assert.equal(saved.blob, blob);
      assert.equal(saved.options.contentType, mime.split(';')[0]);
      assert.equal(saved.options.upsert, false);
      assert.ok(saved.path.endsWith(mime.startsWith('video/mp4') ? '.mp4' : '.webm'));
    }
    await assert.rejects(storage.uploadVideo(USER_A, RECORDING, new Blob(['invalid'], { type: 'text/plain' }), RECORDING), /Invalid file type/);
    assert.equal(uploads.length, 2);
  } finally {
    for (const [i, name] of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'].entries()) {
      if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i];
    }
  }
});

test('upload failure retains captured bytes, blocks advance/provider work, and retries the same answer before advancing', async () => {
  const source = ts.createSourceFile('page.tsx', readFileSync('src/app/interview/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleToggleRecording') callback = node.initializer!.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(callback);
  const video = new Blob(['retained video']); const audio = new Blob(['retained audio']);
  let stops = 0; let providerCalls = 0; let attempts = 0; let advances = 0;
  const captured: Array<{ videoBlob: Blob; audioBlob: Blob; timestamp: number; saveCheckpoint: { captureId: string } }> = [];
  const state = {
    crypto: { randomUUID: () => RECORDING },
    isRecording: true, sessionId: 'session', currentQuestionIndex: 0, questions: [{}, {}], currentQuestion: { id: 'question', text: 'Question?' },
    savingRecordingRef: { current: false }, recordingInProgressRef: { current: true }, pendingCaptureRef: { current: null as unknown }, pendingTranscriptionsRef: { current: 0 }, pendingDbUpdatesRef: { current: [] as unknown[] },
    setIsSavingRecording: () => {}, setSaveFailed: () => {}, setIsRecording: (v: boolean) => { state.isRecording = v; }, setCountdown: () => {}, setIsTranscribing: () => {},
    setCurrentQuestionIndex: () => { advances++; }, window: { stopRecording: async () => { stops++; return { blob: video, audioBlob: audio, eyeTracking: null }; } },
    analyzeVideoPath: async () => null, addRecording: async (recording: { videoBlob: Blob; audioBlob: Blob; timestamp: number; saveCheckpoint: { captureId: string } }) => { captured.push(recording); return ++attempts === 1 ? {} : { recordingId: RECORDING }; },
    transcribeRecording: async () => { providerCalls++; return { transcript: '', duration: 0 }; }, console,
    toast: { error: () => {}, info: () => {} }, Sentry: { captureException: () => {} },
  };
  const compiled = ts.transpileModule(`(${callback})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const invoke = runInNewContext(compiled, state) as () => Promise<void>;
  await invoke();
  assert.equal(advances, 0); assert.equal(providerCalls, 0); assert.equal(stops, 1); assert.ok(state.pendingCaptureRef.current);
  await invoke(); await flush();
  assert.equal(advances, 1); assert.equal(providerCalls, 1); assert.equal(stops, 1); assert.equal(state.pendingCaptureRef.current, null);
  assert.equal(captured[0].videoBlob, video); assert.equal(captured[1].videoBlob, video);
  assert.equal(captured[0].audioBlob, audio); assert.equal(captured[0].timestamp, captured[1].timestamp);
  assert.equal(captured[0].saveCheckpoint, captured[1].saveCheckpoint); assert.equal(captured[0].saveCheckpoint.captureId, RECORDING);
});

test('transcription retry keeps compressed audio on API failure and discards a late result after selection changes', async () => {
  const source = ts.createSourceFile('page.tsx', readFileSync('src/app/analysis/page.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'retryTranscription') callback = node.initializer!.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(callback);
  for (const switchAnswer of [false, true]) {
    const audio = new Blob(['compressed audio'], { type: 'audio/webm' });
    const pending: Array<(response: Response) => void> = []; const writes: Array<{ id: string; updates: Record<string, unknown> }> = []; const errors: unknown[] = [];
    const state = {
      Blob, AbortController, MAX_TRANSCRIPTION_BYTES, transcriptionForm, CLIENT_UPGRADE_MESSAGE,
      contextRecordings: [], retryControllerRef: { current: null as AbortController | null }, retryAudioRef: { current: null as { id: string; audio: Blob } | null },
      setIsRetryingTranscription: () => {}, setRetryError: (error: unknown) => errors.push(error), setRetryProgress: () => {},
      updateRecording: (id: string, updates: Record<string, unknown>) => writes.push({ id, updates }),
      setHydratedRecordings: () => {}, setSelectedRecording: () => { throw new Error('Must not update selected answer'); },
      apiFetch: async (_url: string, options: RequestInit) => {
        assert.equal((options.body as FormData).get('recordingId'), RECORDING);
        return new Promise<Response>(resolve => pending.push(resolve));
      },
    };
    const compiled = ts.transpileModule(`(${callback})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const invoke = runInNewContext(compiled, state) as (recording: unknown) => Promise<void>;
    const result = invoke({ recordingId: RECORDING, audioBlob: audio });
    await flush();
    if (switchAnswer) { state.retryControllerRef.current!.abort(); state.retryControllerRef.current = null; }
    pending[0](Response.json(switchAnswer ? { transcript: 'late A', duration: 5 } : { error: 'Try again later' }, { status: switchAnswer ? 200 : 503 }));
    await result;
    assert.equal(writes.length, 1); assert.equal(writes[0].id, RECORDING); assert.equal(writes[0].updates.audioBlob, audio);
    assert.equal(state.retryAudioRef.current?.audio, audio);
    if (switchAnswer) assert.deepEqual(errors, [null]);
    else assert.equal(errors.at(-1), 'Try again later');
  }
});

function sourceCallback(file: string, name: string): string {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback = '';
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) callback = node.initializer!.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source); assert.ok(callback);
  return ts.transpileModule(`(${callback})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

test('permanent save failure allows explicit discard only after confirmation, removes only its unsaved entry and stays on the question', () => {
  const failed = { saveCheckpoint: { captureId: RECORDING } };
  const saved = { saveCheckpoint: { captureId: RECORDING }, recordingId: RECORDING };
  const other = { saveCheckpoint: { captureId: 'another-capture' } };
  let recordings: object[] = [failed, saved, other];
  const discardUnsavedRecording = runInNewContext(sourceCallback('src/context/InterviewContext.tsx', 'discardUnsavedRecording'), {
    setRecordings: (update: (prev: object[]) => object[]) => { recordings = update(recordings); },
  }) as (captureId: string) => void;
  let confirmed = false; let prompts = 0; let cleared = false;
  const state = {
    pendingCaptureRef: { current: failed as object | null }, savingRecordingRef: { current: false },
    window: { confirm: (message: string) => { assert.match(message, /Download the original first/); prompts++; return confirmed; } },
    discardUnsavedRecording, setSaveFailed: (value: boolean) => { cleared = !value; }, setIsRecording: () => {}, setRecordingDuration: () => {},
    router: { push: () => { throw new Error('Must stay on this question'); } },
    setCurrentQuestionIndex: () => { throw new Error('Must not advance'); },
  };
  const discard = runInNewContext(sourceCallback('src/app/interview/page.tsx', 'discardCapturedAnswer'), state) as () => void;
  state.savingRecordingRef.current = true; confirmed = true; discard();
  assert.equal(prompts, 0); assert.equal(state.pendingCaptureRef.current, failed);
  state.savingRecordingRef.current = false; confirmed = false;
  discard(); assert.equal(state.pendingCaptureRef.current, failed); assert.equal(recordings.length, 3); assert.equal(cleared, false);
  confirmed = true; discard(); assert.equal(state.pendingCaptureRef.current, null); assert.equal(cleared, true);
  assert.deepEqual(recordings, [saved, other]); assert.equal(prompts, 2);
});

test('download original preserves exact captured bytes and MIME extension, revokes its URL and never discards or advances', () => {
  for (const [mime, extension] of [['video/webm;codecs=vp8,opus', 'webm'], ['video/mp4;codecs=avc1', 'mp4'], ['unknown/type', 'bin']]) {
    const blob = new Blob(['original captured bytes'], { type: mime }); let clicks = 0; let revoked = false;
    const link = { href: '', download: '', click: () => { clicks++; }, remove: () => {} };
    const state = {
      pendingCaptureRef: { current: { blob, saveCheckpoint: { captureId: RECORDING } } }, savingRecordingRef: { current: false },
      URL: { createObjectURL: (value: Blob) => { assert.equal(value, blob); return 'blob:original'; }, revokeObjectURL: (url: string) => { assert.equal(url, 'blob:original'); revoked = true; } },
      document: { createElement: () => link, body: { appendChild: () => {} } }, setTimeout: (callback: () => void) => callback(),
    };
    const download = runInNewContext(sourceCallback('src/app/interview/page.tsx', 'downloadCapturedOriginal'), state) as () => void;
    state.savingRecordingRef.current = true; download(); assert.equal(clicks, 0);
    state.savingRecordingRef.current = false;
    download(); assert.equal(clicks, 1); assert.equal(revoked, true); assert.ok(state.pendingCaptureRef.current);
    assert.equal(link.download, `pitcht-answer-${RECORDING}.${extension}`);
  }
});
