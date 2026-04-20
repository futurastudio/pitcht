/**
 * Smoke Test Suite — Pitcht
 *
 * Runs end-to-end checks against the app's API endpoints and key pages.
 * Works against local dev (default) or production.
 *
 * Usage:
 *   npx tsx scripts/smoke-test.ts                           # local (localhost:3000)
 *   BASE_URL=https://app.pitcht.us npx tsx scripts/smoke-test.ts  # production
 *
 * Exit code 0 = all tests passed, 1 = one or more failed.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Config — load .env.local for Supabase credentials
// ---------------------------------------------------------------------------

function loadEnv(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  const env: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv();
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

async function test(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, message: 'ok', duration });
    console.log(`  ${GREEN}✓${RESET} ${name} ${DIM}(${duration}ms)${RESET}`);
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, message, duration });
    console.log(`  ${RED}✗${RESET} ${name} ${DIM}(${duration}ms)${RESET}`);
    console.log(`    ${RED}${message}${RESET}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertStatus(actual: number, expected: number, context = ''): void {
  assert(
    actual === expected,
    `Expected HTTP ${expected}, got ${actual}${context ? ` (${context})` : ''}`
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAnonToken(): Promise<string> {
  assert(!!SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL missing from .env.local');
  assert(!!SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env.local');

  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({}),
  });
  assert(res.ok, `Supabase signup failed: ${res.status}`);
  const data = await res.json() as { access_token?: string };
  assert(!!data.access_token, 'No access_token in Supabase signup response');
  return data.access_token!;
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

async function runHealthSuite(): Promise<void> {
  console.log(`\n${CYAN}${BOLD}Health Check${RESET}`);

  await test('GET /api/health returns 200', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assertStatus(res.status, 200);
  });

  await test('Health: database = pass', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json() as { checks: { database: { status: string } } };
    assert(data.checks.database.status === 'pass', `database status: ${data.checks.database.status}`);
  });

  await test('Health: storage = pass', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json() as { checks: { storage: { status: string } } };
    assert(data.checks.storage.status === 'pass', `storage status: ${data.checks.storage.status}`);
  });

  await test('Health: Anthropic (Claude) = pass', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json() as { checks: { anthropic: { status: string } } };
    assert(data.checks.anthropic.status === 'pass', `anthropic status: ${data.checks.anthropic.status}`);
  });

  await test('Health: OpenAI (Whisper) = pass', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    const data = await res.json() as { checks: { openai: { status: string } } };
    assert(data.checks.openai.status === 'pass', `openai status: ${data.checks.openai.status}`);
  });
}

async function runAuthSuite(): Promise<void> {
  console.log(`\n${CYAN}${BOLD}Auth & Supabase${RESET}`);

  await test('Supabase anonymous signup returns access_token', async () => {
    const token = await getAnonToken();
    assert(token.length > 50, 'Token too short — likely invalid');
  });

  await test('Supabase: Google OAuth provider is enabled', async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    assert(res.ok, `Settings endpoint failed: ${res.status}`);
    const data = await res.json() as { external: { google?: boolean } };
    assert(data.external?.google === true, 'Google OAuth is not enabled in Supabase settings');
  });

  await test('Supabase: Google OAuth redirect goes to accounts.google.com', async () => {
    const url = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${BASE_URL}/auth/callback`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY },
      redirect: 'manual',
    });
    assert(res.status === 302 || res.status === 301, `Expected redirect, got ${res.status}`);
    const location = res.headers.get('location') || '';
    assert(location.includes('accounts.google.com'), `Redirect not to Google: ${location}`);
  });
}

async function runPagesSuite(): Promise<void> {
  console.log(`\n${CYAN}${BOLD}Pages${RESET}`);

  await test('GET / returns 200', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assertStatus(res.status, 200);
  });

  await test("GET / contains 'Pitcht'", async () => {
    const res = await fetch(`${BASE_URL}/`);
    const body = await res.text();
    assert(body.toLowerCase().includes('pitcht'), "Homepage doesn't mention 'Pitcht'");
  });

  await test('GET /auth/callback returns 200 (client-side page)', async () => {
    const res = await fetch(`${BASE_URL}/auth/callback`);
    assertStatus(res.status, 200);
  });

  await test("GET /auth/callback contains 'Signing you in' spinner", async () => {
    const res = await fetch(`${BASE_URL}/auth/callback`);
    const body = await res.text();
    assert(body.includes('Signing you in'), "Callback page missing 'Signing you in' text");
  });

  await test('GET /auth/callback?error=access_denied returns 200 (JS handles error)', async () => {
    const res = await fetch(`${BASE_URL}/auth/callback?error=access_denied`);
    assertStatus(res.status, 200);
  });
}

async function runGenerateQuestionsSuite(token: string): Promise<void> {
  console.log(`\n${CYAN}${BOLD}POST /api/generate-questions${RESET}`);

  await test('Without token → 401', async () => {
    const res = await fetch(`${BASE_URL}/api/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionType: 'job-interview' }),
    });
    assertStatus(res.status, 401, 'should reject unauthenticated requests');
  });

  await test('GET method → 405', async () => {
    const res = await fetch(`${BASE_URL}/api/generate-questions`);
    assertStatus(res.status, 405);
  });

  await test('Missing sessionType → 400', async () => {
    const res = await fetch(`${BASE_URL}/api/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assertStatus(res.status, 400, 'should reject missing sessionType');
  });

  await test('Invalid sessionType → 400', async () => {
    const res = await fetch(`${BASE_URL}/api/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionType: 'invalid-type' }),
    });
    assertStatus(res.status, 400, 'should reject invalid sessionType');
  });

  await test('job-interview → 200, returns questions array', async () => {
    const res = await fetch(`${BASE_URL}/api/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionType: 'job-interview', context: 'Senior Software Engineer at a startup' }),
    });
    assertStatus(res.status, 200);
    const data = await res.json() as { questions?: unknown[] };
    assert(Array.isArray(data.questions), 'Response missing questions array');
    assert((data.questions?.length ?? 0) > 0, 'Questions array is empty');
  });

  await test('presentation → 200, returns questions array', async () => {
    const res = await fetch(`${BASE_URL}/api/generate-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionType: 'presentation', context: 'Q4 Product Roadmap' }),
    });
    assertStatus(res.status, 200);
    const data = await res.json() as { questions?: unknown[] };
    assert(Array.isArray(data.questions), 'Response missing questions array');
    assert((data.questions?.length ?? 0) > 0, 'Questions array is empty');
  });
}

async function runGenerateFeedbackSuite(token: string): Promise<void> {
  console.log(`\n${CYAN}${BOLD}POST /api/generate-feedback${RESET}`);

  await test('Without token → 401', async () => {
    const res = await fetch(`${BASE_URL}/api/generate-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionType: 'job-interview', questionText: 'test', transcript: 'test' }),
    });
    assertStatus(res.status, 401);
  });

  await test('Missing required fields → 400', async () => {
    const res = await fetch(`${BASE_URL}/api/generate-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionType: 'job-interview' }), // missing questionText + transcript
    });
    assertStatus(res.status, 400);
  });

  await test('Valid request → 200, returns overallScore + metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/generate-feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sessionType: 'job-interview',
        questionText: 'Tell me about yourself.',
        transcript: 'I have five years of experience as a software engineer. I enjoy building products and solving hard problems.',
        context: 'Senior Engineer role',
        duration: 30,
      }),
    });
    assertStatus(res.status, 200);
    const data = await res.json() as {
      overallScore?: number;
      metrics?: { wordsPerMinute?: number; fillerWordCount?: number };
      strengths?: unknown[];
      improvements?: unknown[];
    };
    assert(typeof data.overallScore === 'number', 'Missing overallScore');
    assert(typeof data.metrics?.wordsPerMinute === 'number', 'Missing metrics.wordsPerMinute');
    assert(typeof data.metrics?.fillerWordCount === 'number', 'Missing metrics.fillerWordCount');
    assert(Array.isArray(data.strengths), 'Missing strengths array');
    assert(Array.isArray(data.improvements), 'Missing improvements array');
  });
}

async function runCompleteSessionSuite(token: string): Promise<void> {
  console.log(`\n${CYAN}${BOLD}POST /api/complete-session${RESET}`);

  await test('Without token → 401', async () => {
    const res = await fetch(`${BASE_URL}/api/complete-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'test-id' }),
    });
    assertStatus(res.status, 401);
  });

  await test('Missing sessionId → 400', async () => {
    const res = await fetch(`${BASE_URL}/api/complete-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    assertStatus(res.status, 400);
  });

  await test('Valid token + non-existent sessionId → 200 (no-op update)', async () => {
    // The route does UPDATE WHERE id = ? AND status = 'in_progress'
    // A non-existent session matches 0 rows — succeeds silently
    const res = await fetch(`${BASE_URL}/api/complete-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: '00000000-0000-0000-0000-000000000000', token }),
    });
    assertStatus(res.status, 200);
    const data = await res.json() as { success?: boolean };
    assert(data.success === true, `Expected success:true, got: ${JSON.stringify(data)}`);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const isProduction = BASE_URL.includes('pitcht.us');
  const env_label = isProduction ? `${YELLOW}PRODUCTION${RESET}` : `${GREEN}LOCAL${RESET}`;

  console.log(`\n${BOLD}Pitcht Smoke Test${RESET}`);
  console.log(`${DIM}Target: ${BASE_URL} [${env_label}${DIM}]${RESET}`);
  console.log(`${DIM}${'─'.repeat(50)}${RESET}`);

  // Obtain a real auth token once — reused across auth-gated suites
  let token = '';
  try {
    console.log(`\n${DIM}Obtaining anonymous auth token...${RESET}`);
    token = await getAnonToken();
    console.log(`${DIM}Token obtained ✓${RESET}`);
  } catch (err) {
    console.log(`\n${RED}${BOLD}Cannot obtain Supabase token — skipping auth-gated tests${RESET}`);
    console.log(`${RED}${err instanceof Error ? err.message : String(err)}${RESET}`);
  }

  await runHealthSuite();
  await runAuthSuite();
  await runPagesSuite();

  if (token) {
    await runGenerateQuestionsSuite(token);
    await runGenerateFeedbackSuite(token);
    await runCompleteSessionSuite(token);
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const totalMs = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n${DIM}${'─'.repeat(50)}${RESET}`);
  console.log(`${BOLD}Results: ${passed}/${total} passed ${DIM}(${totalMs}ms total)${RESET}`);

  if (failed > 0) {
    console.log(`\n${RED}${BOLD}Failed tests:${RESET}`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ${RED}✗${RESET} ${r.name}`);
        console.log(`    ${DIM}${r.message}${RESET}`);
      });
    console.log('');
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}All tests passed!${RESET}\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`\n${RED}Smoke test crashed:${RESET}`, err);
  process.exit(1);
});
