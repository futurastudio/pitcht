import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import { normalizeSubscription } from '../src/server/billingPolicy';
import { loadSource } from './module-loader';

// Opt in only against the existing isolated rehearsal; never reset its schema.
const endpoint = process.env.PITCHT_TEST_POSTGREST_URL;
const enabled = !!endpoint;
if (enabled && endpoint !== 'http://127.0.0.1:55421') {
  throw new Error('Billing REST regression requires the dedicated loopback rehearsal');
}

test('PostgREST: stale revisions return promptly and concurrent verification refreshes state once',
  { skip: !enabled, timeout: 20_000 }, async () => {
    const serviceKey = process.env.PITCHT_TEST_POSTGREST_SERVICE_KEY;
    const anonKey = process.env.PITCHT_TEST_POSTGREST_ANON_KEY;
    assert.ok(serviceKey && anonKey, 'Dedicated local credentials are required');
    const options = {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(4_000) }) },
    };
    const admin = createClient(endpoint!, serviceKey, options);
    const anon = createClient(endpoint!, anonKey, options);
    const suffix = randomUUID().replaceAll('-', '');
    const email = `billing-rest-${suffix}@example.test`;
    const password = randomUUID() + 'aA1!';
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { billing_rest_regression: suffix } });
    assert.equal(created.error, null);
    const userId = created.data.user!.id;
    const subscriptionId = `sub_rest${suffix}`;
    const customerId = `cus_rest${suffix}`;
    const sessionId = `cs_rest${suffix}`;
    const eventId = `evt_rest${suffix}`;
    const now = Math.floor(Date.now() / 1000);
    const price = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY;
    assert.ok(price, 'A configured rehearsal price is required');
    let releaseBarrier: () => void = () => {};
    let barrierTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const login = await anon.auth.signInWithPassword({ email, password });
      assert.equal(login.error, null);
      const token = login.data.session!.access_token;
      const stripeSubscription = (fresh = false) => ({ id: subscriptionId, customer: customerId,
        metadata: { userId }, status: fresh ? 'active' : 'trialing', canceled_at: null,
        items: { data: [{ price: { id: price }, current_period_start: now - 1_000,
          current_period_end: now + (fresh ? 172_800 : 86_400) }] },
      } as unknown as Stripe.Subscription);
      const snapshot = normalizeSubscription(stripeSubscription(), userId);
      const purchase = { session_id: sessionId, amount_total: 2_700, currency: 'usd' };
      const seed = await admin.rpc('sync_billing_subscription', {
        p_snapshot: snapshot, p_expected_revision: null,
      });
      assert.equal(seed.error, null);
      assert.equal(seed.data.subscription.billing_revision, 1);

      const staleStarted = performance.now();
      const stale = await admin.rpc('sync_billing_subscription', {
        p_snapshot: snapshot, p_expected_revision: 0, p_event_id: eventId,
        p_event_created: now, p_purchase: purchase,
      });
      assert.equal(stale.status, 409);
      assert.equal(stale.error?.code, 'PT409');
      assert.ok(performance.now() - staleStarted < 3_000, 'Stale conflict must return within three seconds');
      const ledger = async () => {
        const result = await admin.from('billing_events').select('id').eq('subscription_id', subscriptionId);
        assert.equal(result.error, null);
        return result.data!;
      };
      const outbox = async () => {
        const result = await admin.from('billing_analytics_outbox').select('*').eq('subscription_id', subscriptionId);
        assert.equal(result.error, null);
        return result.data!;
      };
      const binding = async () => {
        const result = await admin.from('subscriptions').select('*').eq('stripe_subscription_id', subscriptionId).single();
        assert.equal(result.error, null);
        return result.data!;
      };
      assert.equal((await binding()).billing_revision, 1);
      assert.equal((await ledger()).length, 0);
      assert.equal((await outbox()).length, 0);

      // Both requests read revision 1 before either can persist. The loser must
      // re-read revision 2 AND retrieve the newer provider snapshot.
      let stripeReads = 0;
      const barrier = new Promise<void>((resolve, reject) => {
        releaseBarrier = resolve;
        barrierTimer = setTimeout(() => reject(new Error('Concurrent verification barrier timed out')), 3_000);
      });
      const stripe = {
        checkout: { sessions: { retrieve: async () => ({ id: sessionId, client_reference_id: userId,
          customer: customerId, subscription: subscriptionId, status: 'complete', mode: 'subscription',
          payment_status: 'paid', amount_total: 2_700, currency: 'usd' }) } },
        subscriptions: { retrieve: async () => {
          const call = ++stripeReads;
          if (call <= 2) {
            if (call === 2) { clearTimeout(barrierTimer); releaseBarrier(); }
            await barrier;
          }
          return stripeSubscription(call > 2);
        } },
      };
      const clients = { getAdmin: () => admin, getStripe: () => stripe };
      const route = loadSource<typeof import('../src/app/api/verify-subscription/route')>(
        'src/app/api/verify-subscription/route.ts', {
          './clients': clients, '@/server/clients': clients,
          '@/utils/posthog-server': { trackDurableEvent: async () => false },
        });
      const request = () => new Request('http://127.0.0.1/api/verify-subscription', {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const concurrentStarted = performance.now();
      const responses = await Promise.all([route.POST(request()), route.POST(request())]);
      assert.deepEqual(responses.map(response => response.status), [200, 200]);
      assert.ok(performance.now() - concurrentStarted < 5_000, 'Verification must finish within five seconds');
      assert.equal(stripeReads, 3);
      const saved = await binding();
      assert.equal(saved.billing_revision, 3);
      assert.equal(saved.user_id, userId);
      assert.equal(saved.stripe_customer_id, customerId);
      assert.equal(saved.status, 'active');
      assert.equal(Date.parse(saved.current_period_end), (now + 172_800) * 1_000);
      const purchases = await outbox();
      assert.equal(purchases.length, 1);
      assert.equal(purchases[0].id, `checkout:${sessionId}`);
      assert.equal(purchases[0].delivered_at, null);

      // A subsequent genuine-event-shaped retry is acknowledged once even when
      // the duplicate carries a stale revision; purchase identity stays stable.
      const args = { p_snapshot: normalizeSubscription(stripeSubscription(true), userId),
        p_expected_revision: 3, p_event_id: eventId, p_event_created: now, p_purchase: purchase };
      const applied = await admin.rpc('sync_billing_subscription', args);
      assert.equal(applied.error, null);
      assert.equal(applied.data.result, 'applied');
      const duplicate = await admin.rpc('sync_billing_subscription', args);
      assert.equal(duplicate.error, null);
      assert.equal(duplicate.data.result, 'duplicate');
      assert.equal((await binding()).billing_revision, 4);
      assert.equal((await ledger()).length, 1);
      assert.equal((await outbox()).length, 1);
    } finally {
      clearTimeout(barrierTimer);
      releaseBarrier();
      // Only this run's newly created local fixture; never touch the preserved
      // real sandbox subscription or any other rehearsal data.
      const removedEvents = await admin.from('billing_events').delete().eq('subscription_id', subscriptionId);
      assert.equal(removedEvents.error, null);
      const removedUser = await admin.auth.admin.deleteUser(userId);
      assert.equal(removedUser.error, null);
    }
  });
