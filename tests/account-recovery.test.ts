import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clearOtherRecovery, readRecovery, writeRecovery } from '../src/utils/accountRecovery';
import { loadSource, USER_A, USER_B, RECORDING, QUESTION, SESSION } from './module-loader';

function memoryStorage() {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }, clear: () => data.clear() } satisfies Storage;
}
const value = { sessionType: 'job-interview', sessionContext: 'Private context', questions: [], sessionId: SESSION,
  recordings: [{ questionId: QUESTION, questionText: 'Private question', videoPath: '', recordingId: RECORDING, timestamp: 1, transcript: 'Private transcript', videoBlob: new Blob(['video']), audioBlob: new Blob(['audio']) }] };

test('recovery keeps only verified owner metadata and never restores serialized media', () => {
  const storage = memoryStorage(); writeRecovery(storage, USER_A, value);
  const recovered = readRecovery(storage, USER_A)!;
  assert.equal(recovered.recordings[0].transcript, 'Private transcript'); assert.equal(recovered.recordings[0].recordingId, RECORDING);
  assert.equal(recovered.recordings[0].videoBlob, undefined); assert.equal(recovered.recordings[0].audioBlob, undefined);
  assert.equal(readRecovery(storage, USER_B), null);
  storage.setItem(`pitcht_recovery:${USER_B}`, storage.getItem(`pitcht_recovery:${USER_A}`)!);
  assert.equal(readRecovery(storage, USER_B), null);
  clearOtherRecovery(storage, USER_B); assert.equal(readRecovery(storage, USER_A), null);
});

test('unowned legacy transcripts are discarded, current-owner refresh survives, logout removes private metadata', () => {
  const storage = memoryStorage(); writeRecovery(storage, USER_A, value);
  storage.setItem('pitcht_recordings', JSON.stringify(value.recordings)); storage.setItem('pitcht_session_context', 'Unknown owner'); storage.setItem('unrelated-preference', 'retain');
  clearOtherRecovery(storage, USER_A);
  assert.ok(readRecovery(storage, USER_A)); assert.equal(storage.getItem('pitcht_recordings'), null); assert.equal(storage.getItem('pitcht_session_context'), null);
  clearOtherRecovery(storage, null); assert.equal(readRecovery(storage, USER_A), null); assert.equal(storage.getItem('unrelated-preference'), 'retain');
  storage.setItem(`pitcht_recovery:${USER_A}`, '{broken'); assert.equal(readRecovery(storage, USER_A), null);
});

// Public content must still server-render while the Auth client resolves identity.
test('account isolation preserves public rendering during initial auth resolution', () => {
  const Provider = loadSource<{ InterviewProvider: React.ComponentType<{children?: React.ReactNode}> }>('src/context/InterviewContext.tsx', {
    '@/context/AuthContext': { useAuth: () => ({ user: null, loading: true }) },
    '@/services/sessionManager': {}, '@sentry/nextjs': {}, sonner: { toast: {} },
  }).InterviewProvider;
  assert.equal(renderToStaticMarkup(React.createElement(Provider, null, React.createElement('p', {}, 'Public landing content'))), '<p>Public landing content</p>');
});
