import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config used ONLY by the audit (scripts/audit-e2e.ts).
 *
 * Design choices:
 *   - Single worker. The test account pool is small and rate-limited per user,
 *     so running in parallel just means one account burns its 10/hr quota faster.
 *   - Fake media flags let Chromium auto-accept camera/mic without a real device.
 *   - Trace + video captured on failure so the digest email can link to evidence.
 *   - No retries in CI — a retry often masks a real bug by the time a human looks.
 */

const BASE_URL = process.env.AUDIT_BASE_URL || 'https://app.pitcht.us';

export default defineConfig({
  testDir: './scripts',
  testMatch: /audit-e2e\.ts$/,
  timeout: 180_000, // 3 min — questions gen + transcription + feedback can be slow
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'audit-results.json' }],
  ],
  outputDir: 'audit-artifacts',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['camera', 'microphone'],
      },
    },
  ],
});
