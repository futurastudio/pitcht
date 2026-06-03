import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('VideoFeed is scoped to /interview instead of mounted globally in the root layout', () => {
  const layout = read('src/app/layout.tsx');
  const interview = read('src/app/interview/page.tsx');

  assert.doesNotMatch(layout, /import\s+VideoFeed\s+from/);
  assert.doesNotMatch(layout, /<VideoFeed\s*\/?\s*>/);
  assert.match(interview, /import\s+VideoFeed\s+from\s+['"]@\/components\/VideoFeed['"]/);
  assert.match(interview, /<VideoFeed\s*\/?\s*>/);
});

test('analytics constants include permission retry and skip events', () => {
  const analytics = read('src/utils/analytics.ts');

  assert.match(analytics, /RECORDING_PERMISSION_RETRY_CLICKED:\s*['"]recording_permission_retry_clicked['"]/);
  assert.match(analytics, /RECORDING_PERMISSION_SKIPPED:\s*['"]recording_permission_skipped['"]/);
});

test('VideoFeed records denial diagnostics and retry/skip analytics', () => {
  const videoFeed = read('src/components/VideoFeed.tsx');

  assert.match(videoFeed, /getPermissionState/);
  assert.match(videoFeed, /permission_error_name/);
  assert.match(videoFeed, /permission_error_message/);
  assert.match(videoFeed, /browser:/);
  assert.match(videoFeed, /pathname:/);
  assert.match(videoFeed, /path:/);
  assert.match(videoFeed, /current_url:/);
  assert.match(videoFeed, /user_agent:/);
  assert.match(videoFeed, /camera_permission_state/);
  assert.match(videoFeed, /microphone_permission_state/);
  assert.match(videoFeed, /permission_prompt_trigger/);
  assert.match(videoFeed, /AnalyticsEvents\.RECORDING_PERMISSION_RETRY_CLICKED/);
  assert.match(videoFeed, /AnalyticsEvents\.RECORDING_PERMISSION_SKIPPED/);
});
