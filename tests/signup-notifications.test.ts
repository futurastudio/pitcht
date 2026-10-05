import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Session } from '@supabase/supabase-js';
import { loadSource, USER_A, USER_B, type Row } from './module-loader';

process.env.RESEND_API_KEY = 'offline-notification-fixture';
const freshUser = (extra: Row = {}): Row => ({
  id: USER_A, email: 'owner@example.test', created_at: new Date(Date.now() - 1000).toISOString(),
  email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, ...extra,
});
type Send = { headers: Record<string, string>; body: string };
type Provider = (url: string, send: Send) => Promise<Response>;
type Route = { POST(request: Request): Promise<Response> };
const request = (body: unknown = {}, token: string | null = 'valid', headers = {}) => new Request('http://localhost/api/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
  body: JSON.stringify(body),
});
function signup(options: { user?: Row; provider?: Provider; rpc?: () => { data: unknown; error: unknown } } = {}) {
  const calls: Send[] = []; const budgets: Row[] = [];
  const clients = { getAdmin: () => ({
      auth: { getUser: async (token: string) => ({ data: { user: token === 'valid' ? options.user ?? freshUser() : null }, error: null }) },
      rpc: async (name: string, args: Row) => {
        assert.equal(name, 'consume_ai_budget'); budgets.push(args);
        return options.rpc?.() ?? { data: { allowed: true }, error: null };
      },
    }) };
  const api = loadSource<Route>('src/app/api/notify-signup/route.ts', {
    '@/server/clients': clients, './clients': clients,
    __fetch: async (url: string, send: Send) => {
      assert.equal(url, 'https://api.resend.com/emails'); calls.push(send);
      return options.provider?.(url, send) ?? new Response(JSON.stringify({ id: 'email_offline' }));
    },
  });
  return { api, calls, budgets };
}

test('signup notification rejects missing/invalid/anonymous authentication before budget or provider', async () => {
  const { api, calls, budgets } = signup();
  for (const token of [null, 'expired']) assert.equal((await api.POST(request({}, token))).status, 401);
  const anonymous = signup({ user: freshUser({ is_anonymous: true }) });
  assert.equal((await anonymous.api.POST(request())).status, 401);
  assert.equal(calls.length + anonymous.calls.length + budgets.length + anonymous.budgets.length, 0);
});

test('signup recipient, user ID, method and time come from verified Auth; HTML is escaped', async () => {
  const user = freshUser({ email: '<b>@example.test', app_metadata: { provider: 'google' } });
  const { api, calls, budgets } = signup({ user });
  const response = await api.POST(request({ userId: USER_B, email: 'victim@example.test', signupMethod: '<script>evil</script>' }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  const payloads = calls.map(call => JSON.parse(call.body));
  assert.equal(payloads[1].to, user.email);
  assert.equal(payloads[0].to, 'contact@pitcht.us');
  assert.match(payloads[0].html, /&lt;b&gt;@example.test/);
  assert.match(payloads[0].text, /via|Method: google/);
  assert.match(payloads[0].text, new RegExp(String(user.created_at)));
  assert.ok(!JSON.stringify(payloads).includes(USER_B));
  assert.ok(!JSON.stringify(payloads).includes('victim@example.test'));
  assert.equal(budgets[0].p_user_id, USER_A);
  assert.equal(budgets[0].p_operation, 'notify_signup');
  assert.equal(budgets[0].p_recording_id, null);
});

test('unconfirmed, invalid, future and old Auth identities cannot request signup emails', async () => {
  for (const extra of [
    { email_confirmed_at: null }, { email: 'bad\r\naddress@example.test' }, { email: `${'a'.repeat(250)}@example.test` },
    { created_at: 'invalid' }, { created_at: new Date(Date.now() + 60_000).toISOString() },
    { created_at: new Date(Date.now() - 24 * 3600_000).toISOString() },
  ]) {
    const { api, calls, budgets } = signup({ user: freshUser(extra) });
    assert.equal((await api.POST(request())).status, 403);
    assert.equal(calls.length + budgets.length, 0);
  }
});

test('signup input is bounded and malformed JSON never consumes budget', async () => {
  const { api, calls, budgets } = signup();
  assert.equal((await api.POST(request({ ignored: 'x'.repeat(2048) }))).status, 413);
  assert.equal((await api.POST(request([]))).status, 400);
  const malformed = new Request('http://localhost/test', { method: 'POST', headers: { Authorization: 'Bearer valid' }, body: '{' });
  assert.equal((await api.POST(malformed)).status, 400);
  assert.equal(calls.length + budgets.length, 0);
});

test('signup budget errors and malformed responses fail closed', async () => {
  for (const result of [
    { data: null, error: { message: 'private database detail' } },
    { data: null, error: null }, { data: { allowed: 'true' }, error: null },
  ]) {
    const { api, calls } = signup({ rpc: () => result });
    const response = await api.POST(request());
    assert.equal(response.status, 503); assert.equal(calls.length, 0);
    assert.ok(!(await response.text()).includes('private database detail'));
  }
});

test('concurrent signup requests across route instances use the shared durable budget', async () => {
  let claims = 0;
  const rpc = () => ({ data: { allowed: ++claims === 1, reason: 'rate_limited' }, error: null });
  const first = signup({ rpc }); const second = signup({ rpc });
  const responses = await Promise.all([first.api.POST(request()), second.api.POST(request())]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 429]);
  assert.equal(first.calls.length + second.calls.length, 2);
});

test('uncertain provider response retries identical keys/payloads without duplicate delivery', async () => {
  const delivered = new Map<string, string>(); let lostResponse = false;
  const { api, calls } = signup({ provider: async (_url, send) => {
    const key = send.headers['Idempotency-Key'];
    if (delivered.has(key)) assert.equal(send.body, delivered.get(key));
    else delivered.set(key, send.body);
    if (key.startsWith('signup-admin/') && !lostResponse) {
      lostResponse = true; throw new Error('Response lost after accepted send');
    }
    return new Response(JSON.stringify({ id: 'email_offline' }));
  } });
  assert.equal((await api.POST(request())).status, 200);
  assert.equal(calls.length, 3); assert.equal(delivered.size, 2);
  assert.ok(delivered.has(`signup-admin/${USER_A}`));
  assert.ok(delivered.has(`signup-welcome/${USER_A}`));
});

test('signup payloads stay deterministic across a budget bucket rollover and changing request headers', async () => {
  const user = freshUser(); const { api, calls } = signup({ user });
  await api.POST(request({}, 'valid', { 'user-agent': 'first', 'x-forwarded-for': '192.0.2.1' }));
  await api.POST(request({ email: 'another@example.test' }, 'valid', { 'user-agent': '<img>', 'x-forwarded-for': '192.0.2.2' }));
  assert.equal(calls[0].body, calls[2].body); assert.equal(calls[1].body, calls[3].body);
  assert.equal(calls[0].headers['Idempotency-Key'], calls[2].headers['Idempotency-Key']);
});

test('provider attempts cannot run past the signup/idempotency deadline after a delayed budget lookup', async () => {
  const { api, calls } = signup({ user: freshUser({ created_at: new Date(Date.now() - 24 * 3600_000 + 4000).toISOString() }) });
  assert.equal((await api.POST(request())).status, 503);
  assert.equal(calls.length, 0);
});

test('provider failure has bounded retries and never exposes provider credentials or bodies', async () => {
  const { api, calls } = signup({ provider: async () => new Response('private provider response', { status: 503 }) });
  const response = await api.POST(request());
  assert.equal(response.status, 503); assert.equal(calls.length, 6);
  const body = await response.text();
  assert.ok(!body.includes('private provider response')); assert.ok(!body.includes('offline-notification-fixture'));
  const permanent = signup({ provider: async () => new Response('private provider response', { status: 401 }) });
  assert.equal((await permanent.api.POST(request())).status, 503); assert.equal(permanent.calls.length, 2);
});

function waitlist(options: { provider?: Provider; dbError?: string } = {}) {
  const enrolled = new Set<string>(); const calls: Send[] = []; let writes = 0;
  const api = loadSource<Route>('src/app/api/waitlist/route.ts', {
    '@/server/clients': { getAdmin: () => ({ from: (table: string) => {
      assert.equal(table, 'waitlist');
      return { insert: (row: Row) => {
        writes++; assert.equal(row.source, 'mobile_download');
        const email = String(row.email);
        const code = options.dbError ?? (enrolled.has(email) ? '23505' : undefined);
        if (!code) enrolled.add(email);
        return { select: () => ({ single: async () => ({ error: code ? { code } : null }) }) };
      } };
    } }) },
    __fetch: async (url: string, send: Send) => {
      assert.equal(url, 'https://api.resend.com/emails'); calls.push(send);
      return options.provider?.(url, send) ?? new Response(JSON.stringify({ id: 'waitlist_offline' }));
    },
  });
  return { api, enrolled, calls, writes: () => writes };
}

test('concurrent normalized waitlist duplicates return the same success and send only once', async () => {
  const { api, enrolled, calls } = waitlist();
  const responses = await Promise.all([
    api.POST(request({ email: ' Owner@Example.test ' }, null)), api.POST(request({ email: 'owner@example.test' }, null)),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true });
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://pitcht.us');
  }
  assert.equal(enrolled.size, 1); assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].body).to, 'owner@example.test');
});

test('waitlist validates size/email and fails closed on database error before sending', async () => {
  const { api, calls, writes } = waitlist();
  for (const email of [null, 12, 'invalid', 'person@example.test\r\nBcc:other@example.test', `${'a'.repeat(250)}@example.test`]) {
    assert.equal((await api.POST(request({ email }, null))).status, 400);
  }
  assert.equal((await api.POST(request({ email: 'x'.repeat(2048) }, null))).status, 413);
  assert.equal((await api.POST(request(null, null))).status, 400);
  assert.equal(writes() + calls.length, 0);
  const failed = waitlist({ dbError: '42501' });
  assert.equal((await failed.api.POST(request({ email: 'owner@example.test' }, null))).status, 503);
  assert.equal(failed.calls.length, 0);
});

test('waitlist transport failure preserves enrollment and a replay cannot resend', async () => {
  const { api, calls } = waitlist({ provider: async () => { throw new Error('Uncertain send'); } });
  for (let index = 0; index < 2; index++) {
    const response = await api.POST(request({ email: 'owner@example.test' }, null));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true });
  }
  assert.equal(calls.length, 1);
});

test('new confirmed client sessions forward only the Bearer token and never block sign-in', async () => {
  const calls: Send[] = [];
  const helper = loadSource<typeof import('../src/services/signupNotification')>('src/services/signupNotification.ts', {
    __fetch: async (url: string, send: Send) => {
      assert.equal(url, '/api/notify-signup'); calls.push(send); throw new Error('Offline');
    },
  });
  const session = { access_token: 'private-token', user: freshUser() } as unknown as Session;
  await helper.notifyNewSignup(null);
  await helper.notifyNewSignup({ ...session, user: { ...session.user, email_confirmed_at: undefined } });
  await helper.notifyNewSignup({ ...session, user: { ...session.user, created_at: '2020-01-01T00:00:00Z' } });
  assert.equal(calls.length, 0);
  await helper.notifyNewSignup(session);
  assert.equal(calls.length, 1); assert.equal(calls[0].headers.Authorization, 'Bearer private-token');
  assert.equal(calls[0].body, '{}');
});
