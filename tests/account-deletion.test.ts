import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSource, USER_A, USER_B } from './module-loader';

type Failure = 'billingInventory' | 'recordingInventory' | 'storageInventory' | 'stripe' | 'storage' | 'sessions' | 'auth' | undefined;
function fixture(options: { failure?: Failure; wrongOwner?: boolean; foreignPath?: boolean; many?: boolean; lostCancel?: boolean } = {}) {
  let failure = options.failure;
  let accountExists = true; let bindingsExist = true; let sessionExists = true; let lost = options.lostCancel;
  const calls: string[] = [];
  const subscriptions = Array.from({ length: options.many ? 103 : 2 }, (_, i) => ({ id: `sub_${i}`, customer: 'cus_owned', status: i === 0 ? 'canceled' : 'active', metadata: { userId: options.wrongOwner ? USER_B : USER_A } }));
  const objects = new Set(Array.from({ length: options.many ? 205 : 2 }, (_, i) => `${USER_A}/nested/${i}.webm`));
  objects.add(`${USER_A}/orphan/deeper/unsaved.webm`);
  objects.add(`${USER_B}/keep.webm`);
  const db = {
    auth: { getUser: async (token: string) => ({ data: { user: token === 'valid' && accountExists ? { id: USER_A } : null }, error: null }),
      admin: { deleteUser: async (id: string) => { assert.equal(id, USER_A); calls.push('auth'); if (failure === 'auth') return { error: {} }; accountExists = false; bindingsExist = false; return { error: null }; } } },
    storage: { from: () => ({
      list: async (folder: string, { offset, limit }: { offset: number; limit: number }) => {
        calls.push('list'); if (failure === 'storageInventory') return { data: null, error: {} };
        const entries = new Map<string, { name: string; id: string | null }>();
        for (const path of objects) if (path.startsWith(folder + '/')) {
          const rest = path.slice(folder.length + 1); const name = rest.split('/')[0]; entries.set(name, { name, id: rest.includes('/') ? null : name });
        }
        return { data: [...entries.values()].sort((a,b) => a.name.localeCompare(b.name)).slice(offset, offset + limit), error: null };
      },
      remove: async (paths: string[]) => { calls.push('remove'); if (failure === 'storage') return { error: {} };
        for (const path of paths) { assert.ok(path.startsWith(USER_A + '/')); objects.delete(path); } return { error: null }; },
    }) },
    from: (table: string) => {
      let offset = 0; let end = 0; let mutation = false;
      const query = {
        select: (columns: string) => { if (table === 'recordings') assert.equal(columns, 'video_url,sessions!inner(user_id)'); return query; },
        eq: (column: string, value: string) => { assert.equal(value, USER_A); assert.equal(column, table === 'recordings' ? 'sessions.user_id' : 'user_id'); return query; },
        order: () => query, range: (start: number, finish: number) => { offset = start; end = finish; return query; }, delete: () => { mutation = true; return query; },
        then: (resolve: (value: unknown) => void) => {
          if (table === 'sessions') { assert.ok(mutation); calls.push('sessions'); if (failure === 'sessions') return resolve({ error: {} }); sessionExists = false; return resolve({ error: null }); }
          assert.ok(!mutation, 'Local billing bindings must only cascade with final Auth deletion');
          if (failure === (table === 'subscriptions' ? 'billingInventory' : 'recordingInventory')) return resolve({ data: null, error: {} });
          const rows = table === 'subscriptions' ? subscriptions.map(s => ({ stripe_subscription_id: s.id, stripe_customer_id: s.customer })) : [{ video_url: `${options.foreignPath ? USER_B : USER_A}/nested/0.webm` }];
          return resolve({ data: rows.slice(offset, end + 1), error: null });
        },
      };
      return query;
    },
  };
  const clients = { getAdmin: () => db, getStripe: () => ({ subscriptions: {
    retrieve: async (id: string) => { calls.push('retrieve'); return subscriptions.find(s => s.id === id); },
    cancel: async (id: string, options: unknown) => { calls.push('cancel'); assert.deepEqual(JSON.parse(JSON.stringify(options)), { invoice_now: false, prorate: false });
      if (failure === 'stripe') throw new Error('private provider error'); const row = subscriptions.find(s => s.id === id)!; row.status = 'canceled';
      if (lost) { lost = false; throw new Error('lost accepted response'); } return row; },
  } }) };
  const route = loadSource<{ POST(request: Request): Promise<Response> }>('src/app/api/delete-account/route.ts', { '@/server/clients': clients, './clients': clients });
  return { calls, objects, subscriptions, state: () => ({ accountExists, bindingsExist, sessionExists }), recover: () => { failure = undefined; },
    run: (token = 'valid') => route.POST(new Request('http://localhost/delete', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })) };
}

test('deletion inventories paginated history/nested and orphan uploads; cancels every live subscription before identity removal', async () => {
  const f = fixture({ many: true }); assert.equal((await f.run()).status, 200);
  assert.equal(f.calls.filter(c => c === 'cancel').length, 102);
  assert.ok(f.calls.lastIndexOf('retrieve') < f.calls.indexOf('cancel'));
  assert.ok(f.calls.lastIndexOf('cancel') < f.calls.indexOf('remove'));
  assert.ok(f.calls.lastIndexOf('remove') < f.calls.indexOf('sessions'));
  assert.equal(f.calls.at(-1), 'auth'); assert.deepEqual([...f.objects], [`${USER_B}/keep.webm`]);
  assert.deepEqual(f.state(), { accountExists: false, bindingsExist: false, sessionExists: false });
});

for (const failure of ['billingInventory', 'recordingInventory', 'storageInventory', 'stripe', 'storage', 'sessions', 'auth'] as const) {
  test(`${failure} failure preserves identity/bindings, reports failure without secrets, and permits idempotent retry`, async () => {
    const f = fixture({ failure }); const response = await f.run(); assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private provider error/);
    assert.equal(f.state().accountExists, true); assert.equal(f.state().bindingsExist, true);
    if (!['sessions', 'auth'].includes(failure)) assert.equal(f.state().sessionExists, true);
    f.recover(); assert.equal((await f.run()).status, 200);
    assert.deepEqual([...f.objects], [`${USER_B}/keep.webm`]);
  });
}

test('uncertain accepted cancellation retries without charging or cancelling twice', async () => {
  const f = fixture({ lostCancel: true }); assert.equal((await f.run()).status, 503);
  assert.equal((await f.run()).status, 200); assert.equal(f.calls.filter(c => c === 'cancel').length, 1);
});

test('unauthenticated, foreign media and inconsistent Stripe ownership cannot delete data', async () => {
  const noAuth = fixture(); assert.equal((await noAuth.run('invalid')).status, 401); assert.equal(noAuth.calls.length, 0);
  for (const options of [{ foreignPath: true }, { wrongOwner: true }]) {
    const f = fixture(options); assert.ok((await f.run()).status >= 400);
    assert.ok(!f.calls.some(c => ['cancel', 'remove', 'sessions', 'auth'].includes(c)));
    assert.equal(f.state().accountExists, true);
  }
});
