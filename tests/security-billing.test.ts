import assert from 'node:assert/strict';
import { test } from 'node:test';
import type Stripe from 'stripe';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { validateCheckout, normalizeSubscription, paidAccess, invoiceSubscriptionId, requireApprovedPrice } from '../src/server/billingPolicy';
import { loadSource, mockDb, USER_A, USER_B, RECORDING, SESSION, QUESTION, type Row } from './module-loader';

process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY = 'price_monthly';
process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL = 'price_annual';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_offline_fixture';
const now = Date.now();
const subscription = (overrides: Row = {}) => ({ id: 'sub_owned', customer: 'cus_owned', metadata: { userId: USER_A }, status: 'active',
  canceled_at: null, items: { data: [{ price: { id: 'price_monthly' }, current_period_start: Math.floor(now/1000)-1000,
    current_period_end: Math.floor(now/1000)+1000 }] }, ...overrides } as unknown as Stripe.Subscription);
const checkout = (overrides: Row = {}) => ({ id: 'cs_owned', client_reference_id: USER_A, customer: 'cus_owned',
  subscription: 'sub_owned', status: 'complete', mode: 'subscription', payment_status: 'paid', ...overrides } as unknown as Stripe.Checkout.Session);

test('paid checkout binds caller, subscription metadata and customer; rejects stolen/incomplete checkout', () => {
  validateCheckout(checkout(), subscription(), USER_A);
  for (const session of [checkout({ client_reference_id: USER_B }), checkout({ customer: 'cus_other' }),
    checkout({ payment_status: 'unpaid' }), checkout({ status: 'open' })]) {
    assert.throws(() => validateCheckout(session, subscription(), USER_A));
  }
  assert.throws(() => validateCheckout(checkout(), subscription({ metadata: { userId: USER_B } }), USER_A));
});

test('only approved configured prices, valid periods and actual Stripe status are persisted', () => {
  assert.throws(() => requireApprovedPrice('price_other_product'));
  assert.equal(normalizeSubscription(subscription({ status: 'past_due' }), USER_A).status, 'past_due');
  assert.throws(() => normalizeSubscription(subscription({ items: { data: [] } }), USER_A));
});

test('grace is bounded; canceled, expired trials and unverified/stale rows never get unlimited access', () => {
  const row = { status: 'active', current_period_end: new Date(now-60_000).toISOString(), stripe_synced_at: new Date(now-60_000).toISOString() };
  assert.equal(paidAccess(row, now), true);
  assert.equal(paidAccess({ ...row, status: 'canceled' }, now), false);
  assert.equal(paidAccess({ ...row, status: 'trialing' }, now), false);
  assert.equal(paidAccess({ ...row, stripe_synced_at: null }, now), false);
  assert.equal(paidAccess({ ...row, stripe_synced_at: new Date(now-73*3600_000).toISOString() }, now), false);
  assert.equal(paidAccess({ ...row, current_period_end: new Date(now-73*3600_000).toISOString() }, now), false);
});

test('invoice subscription IDs support endpoint-version parent and legacy shapes', () => {
  assert.equal(invoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_new' } } } as Stripe.Invoice), 'sub_new');
  assert.equal(invoiceSubscriptionId({ subscription: 'sub_old' } as unknown as Stripe.Invoice), 'sub_old');
  assert.equal(invoiceSubscriptionId({} as Stripe.Invoice), null);
});

test('verification refuses existing owner conflict before any write', async () => {
  let writes = 0;
  const db = mockDb({ subscriptions: [{ stripe_subscription_id: 'sub_owned', user_id: USER_B }] }, () => { writes++; return {}; });
  const service = loadSource<typeof import('../src/server/billing')>('src/server/billing.ts', {
    '@/utils/posthog-server': { trackDurableEvent: async () => true }, './clients': { getAdmin: () => db, getStripe: () => ({ subscriptions: { retrieve: async () => subscription() } }) },
  });
  await assert.rejects(service.syncSubscription('sub_owned', USER_A), /ownership conflict/i);
  assert.equal(writes, 0);
});

test('billing revision conflicts re-fetch current Stripe state; failed/empty persistence never succeeds', async () => {
  let reads = 0; let calls = 0;
  const tables = { subscriptions: [{ ...normalizeSubscription(subscription(), USER_A), billing_revision: 1 }] };
  const db = mockDb(tables, (_name, args) => {
    assert.equal(args.p_expected_revision, 2);
    assert.equal((args.p_snapshot as Row).status, 'past_due');
    return { result: 'applied', subscription: args.p_snapshot };
  });
  const rpc = db.rpc;
  db.rpc = async (name, args) => {
    if (++calls !== 1) return rpc(name, args);
    assert.equal(args.p_expected_revision, 1);
    tables.subscriptions[0].billing_revision = 2;
    return { data: null, error: { code: 'PT409' } };
  };
  const service = loadSource<typeof import('../src/server/billing')>('src/server/billing.ts', {
    '@/utils/posthog-server': { trackDurableEvent: async () => true }, './clients': { getAdmin: () => db,
      getStripe: () => ({ subscriptions: { retrieve: async () => subscription({ status: ++reads === 1 ? 'active' : 'past_due' }) } }) },
  });
  const saved = await service.syncSubscription('sub_owned', USER_A);
  assert.equal(saved.user_id, USER_A);
  assert.equal(saved.status, 'past_due');
  assert.equal(reads, 2);
  db.rpc = async () => ({ data: null, error: null });
  await assert.rejects(service.syncSubscription('sub_owned', USER_A), /persistence failed/i);
});

test('persistent billing conflicts stop after three fresh reads without delivering a purchase', async () => {
  let reads = 0; let writes = 0; let deliveries = 0;
  const db = mockDb({ subscriptions: [] }, () => null);
  db.rpc = async () => { writes++; return { data: null, error: { code: 'PT409' } }; };
  const service = loadSource<typeof import('../src/server/billing')>('src/server/billing.ts', {
    '@/utils/posthog-server': { trackDurableEvent: async () => { deliveries++; return true; } },
    './clients': { getAdmin: () => db, getStripe: () => ({
      checkout: { sessions: { retrieve: async () => checkout() } },
      subscriptions: { retrieve: async () => { reads++; return subscription(); } },
    }) },
  });
  await assert.rejects(service.verifyCheckout('cs_owned', USER_A), /Concurrent billing update/);
  assert.equal(reads, 3);
  assert.equal(writes, 3);
  assert.equal(deliveries, 0);
});

function fixtures(owner = USER_A) {
  return { sessions: [{ id: SESSION, user_id: owner, session_type: 'job-interview', context: 'Stored role requirements' }],
    questions: [{ id: QUESTION, session_id: SESSION, question_text: 'Stored question?' }],
    recordings: [{ id: RECORDING, session_id: SESSION, question_id: QUESTION, transcript: '', duration: 0 }], analyses: [] } as Record<string, Row[]>;
}
function route(file: string, tables: Record<string, Row[]>, providers: Record<string, unknown>, budget: Row = { allowed: true, token: null }) {
  const db = mockDb(tables, () => budget);
  return loadSource<{ POST(request: Request): Promise<Response> }>(file, {
    '@/server/clients': { getAdmin: () => db }, './clients': { getAdmin: () => db },
    './billing': { refreshUserBilling: async () => {} }, ...providers,
  });
}
const request = (body: unknown, authenticated = true) => new Request('http://localhost/api/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer valid' } : {}) }, body: JSON.stringify(body),
});
function audioRequest(authenticated = true, id = RECORDING, size = 3) {
  const form = new FormData(); form.append('recordingId',id);
  form.append('audio', new File([new Uint8Array(size)], 'answer.webm', { type: 'audio/webm;codecs=opus' }));
  return new Request('http://localhost/api/transcribe', { method:'POST', headers: authenticated ? { Authorization:'Bearer valid', 'x-user-id':'spoofed' } : {}, body: form });
}

test('unauthenticated/unowned/oversized transcription never reaches paid provider', async () => {
  let calls = 0;
  const provider = { '@/services/whisper': { transcribeAudio: async () => { calls++; return { text:'answer', duration:1 }; } } };
  const valid = route('src/app/api/transcribe/route.ts', fixtures(), provider);
  assert.equal((await valid.POST(audioRequest(false))).status,401);
  assert.equal((await route('src/app/api/transcribe/route.ts',fixtures(USER_B),provider).POST(audioRequest())).status,404);
  assert.equal((await valid.POST(audioRequest(true,RECORDING,4*1024*1024+1))).status,413);
  assert.equal(calls,0);
});

test('paid caller shape with recordingId and codec MIME transcribes and persists, regardless of spoofed header', async () => {
  const tables = fixtures(); let prompt = '';
  const api = route('src/app/api/transcribe/route.ts',tables,{ '@/services/whisper': { transcribeAudio: async (_audio: File, options: Row) => {
    prompt = String(options.prompt); return { text:'A saved answer with evidence.', duration:5, language:'en' }; } } });
  const response = await api.POST(audioRequest());
  assert.equal(response.status,200);
  assert.equal((await response.json()).transcript,'A saved answer with evidence.');
  assert.equal(tables.recordings[0].transcript,'A saved answer with evidence.');
  assert.equal(prompt,'Stored question?');
});

test('durable budget denial fails closed before transcription', async () => {
  let calls = 0;
  const api = route('src/app/api/transcribe/route.ts',fixtures(),{ '@/services/whisper': { transcribeAudio: async () => { calls++; } } },
    { allowed:false,reason:'quota_exhausted' });
  assert.equal((await api.POST(audioRequest())).status,402); assert.equal(calls,0);
});

const feedback = { overallScore:50,contentScore:0,communicationScore:50,deliveryScore:40,summary:'Specific coaching.',
  strengths:[{area:'Example',detail:'Supported example.'}],improvements:[{area:'Structure',detail:'Missing result.',suggestion:'State the result.',priority:'high'}],nextSteps:['Retry once.'] };

test('valid paid legacy feedback fields remain accepted; owned stored context wins and zero scores persist', async () => {
  const tables = fixtures(); tables.recordings[0].transcript = 'The actual saved answer.'; tables.recordings[0].duration = 5;
  let input: Row | undefined;
  const api = route('src/app/api/generate-feedback/route.ts',tables,{ '@/services/claude': { generateFeedback: async (value: Row) => { input=value; return feedback; } } });
  const response = await api.POST(request({ recordingId:RECORDING,sessionType:'presentation',questionText:'untrusted',transcript:'untrusted',context:'untrusted' }));
  assert.equal(response.status,200); assert.equal(input?.transcript,'The actual saved answer.');
  assert.equal(input?.context,'Stored role requirements'); assert.equal(input?.sessionType,'job-interview');
  assert.equal(tables.analyses[0].content_score,0);
});

test('feedback requires recording ownership; malformed output is not persisted', async () => {
  const tables=fixtures(); tables.recordings[0].transcript='Saved answer.';
  const api=route('src/app/api/generate-feedback/route.ts',tables,{ '@/services/claude': { generateFeedback:async()=>({overallScore:999,summary:'invalid'}) } });
  assert.equal((await api.POST(request({ transcript:'unbound' }))).status,409);
  assert.equal((await api.POST(request({recordingId:RECORDING}))).status,502); assert.equal(tables.analyses.length,0);
});

test('existing saved feedback is readable without a new paid generation', async () => {
  const tables=fixtures(); tables.analyses.push({recording_id:RECORDING,overall_score:60,summary:'Saved',strengths:[],improvements:[],next_steps:[]});
  const api=route('src/app/api/generate-feedback/route.ts',tables,{ '@/services/claude': { generateFeedback:async()=>{ throw new Error('Must not generate'); } } },{allowed:false,reason:'quota_exhausted'});
  assert.equal((await api.POST(request({recordingId:RECORDING}))).status,200);
});

test('question generation requires authentication and server allowance before provider invocation', async () => {
  let calls=0;
  const api=route('src/app/api/generate-questions/route.ts',{}, { '@/services/claude': { generateQuestions:async()=>{calls++; return [];} } },{allowed:false,reason:'quota_exhausted'});
  assert.equal((await api.POST(request({sessionType:'job-interview',context:''},false))).status,401);
  assert.equal((await api.POST(request({sessionType:'job-interview',context:''}))).status,402); assert.equal(calls,0);
});

test('webhook signature/unpaid guards prevent persistence; invoice events reconcile instead of forcing active', async () => {
  let calls=0; let signedEvent: Row={id:'evt_offline',created:1,type:'checkout.session.completed',data:{object:checkout({payment_status:'unpaid'})}};
  const api=loadSource<{POST(r:Request):Promise<Response>}>('src/app/api/webhooks/stripe/route.ts',{
    '@/server/clients':{getStripe:()=>({webhooks:{constructEvent:()=>signedEvent}})},
    '@/server/billing':{syncSubscription:async(id:string)=>{calls++; assert.equal(id,'sub_invoice');},deliverPurchaseEvents:async()=>{}},
  });
  assert.equal((await api.POST(request({}))).status,400);
  const signed=()=>new Request('http://localhost/webhook',{method:'POST',headers:{'stripe-signature':'offline'},body:'{}'});
  assert.equal((await api.POST(signed())).status,200); assert.equal(calls,0);
  signedEvent={id:'evt_invoice',created:2,type:'invoice.payment_failed',data:{object:{parent:{subscription_details:{subscription:'sub_invoice'}}}}};
  assert.equal((await api.POST(signed())).status,200); assert.equal(calls,1);
});

test('final/partial session completion accepts Bearer and existing beacon shapes and verifies ownership', async () => {
  for(const beacon of [false,true]) {
    const tables=fixtures();tables.sessions[0].status='in_progress';
    const api=route('src/app/api/complete-session/route.ts',tables,{});
    const response=await api.POST(request({sessionId:SESSION,...(beacon?{token:'valid'}:{})},!beacon));
    assert.equal(response.status,200);assert.equal(tables.sessions[0].status,'completed');
    assert.equal((await response.json()).consumed,true);
  }
  const foreign=fixtures(USER_B);foreign.sessions[0].status='in_progress';
  assert.equal((await route('src/app/api/complete-session/route.ts',foreign,{}).POST(request({sessionId:SESSION}))).status,404);
  assert.equal(foreign.sessions[0].status,'in_progress');
});

test('feedback and transcription recheck saved results after delayed reservation; provider is not double-called', async () => {
  let calls=0;
  const tables=fixtures();tables.recordings[0].transcript='Saved answer.';tables.recordings[0].duration=5;
  const api=route('src/app/api/generate-feedback/route.ts',tables,{
    './billing':{refreshUserBilling:async()=>{await Promise.resolve();tables.analyses.push({recording_id:RECORDING,overall_score:60,summary:'Other worker result',strengths:[],improvements:[],next_steps:[]});}},
    '@/services/claude':{generateFeedback:async()=>{calls++;return feedback;}},
  });
  assert.equal((await api.POST(request({recordingId:RECORDING}))).status,200);
  assert.equal(calls,0);assert.equal(tables.analyses.length,1);
  const audioTables=fixtures();
  const audioApi=route('src/app/api/transcribe/route.ts',audioTables,{
    './billing':{refreshUserBilling:async()=>{await Promise.resolve();audioTables.recordings[0].transcript='Completed elsewhere';audioTables.recordings[0].duration=5;}},
    '@/services/whisper':{transcribeAudio:async()=>{calls++;return {text:'wrong',duration:5};}},
  });
  const response=await audioApi.POST(audioRequest());assert.equal(response.status,200);
  assert.equal((await response.json()).transcript,'Completed elsewhere');assert.equal(calls,0);
});

test('durable analytics await ingestion acknowledgement, preserve stable identity and fail safely', async () => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY='phc_offline_fixture';
  const occurredAt='2026-09-29T12:34:56.789Z';
  let status=400;let payload: Row={};let calls=0;
  const api=loadSource<typeof import('../src/utils/posthog-server')>('src/utils/posthog-server.ts',{
    __fetch:async(_url:URL,options:{body:string})=>{calls++;payload=JSON.parse(options.body);return new Response(JSON.stringify({status:status===200?1:0}),{status});},
  });
  assert.equal(await api.trackDurableEvent('checkout_completed',USER_A,{},'checkout:cs_synthetic',occurredAt),false);
  status=200;
  assert.equal(await api.trackDurableEvent('checkout_completed',USER_A,{},'checkout:cs_synthetic',occurredAt),true);const uuid=payload.uuid;
  assert.equal(await api.trackDurableEvent('checkout_completed',USER_A,{},'checkout:cs_synthetic',occurredAt),true);
  assert.equal(payload.uuid,uuid);assert.equal((payload.properties as Row).$insert_id,'checkout:cs_synthetic');
  assert.equal(payload.timestamp,occurredAt);
  const priorCalls=calls;
  for(const invalid of ['', 'invalid', undefined]) {
    assert.equal(await api.trackDurableEvent('checkout_completed',USER_A,{},'checkout:cs_synthetic',invalid as string),false);
  }
  assert.equal(calls,priorCalls);
  const failing=loadSource<typeof import('../src/utils/posthog-server')>('src/utils/posthog-server.ts',{__fetch:async()=>{throw new Error('offline ingestion failure');}});
  assert.equal(await failing.trackDurableEvent('checkout_completed',USER_A,{},'checkout:cs_synthetic',occurredAt),false);
});

test('outbox delivery forwards original creation time and acknowledges only a successful send', async () => {
  const row={id:'checkout:cs_time',subscription_id:'sub_owned',user_id:USER_A,properties:{},created_at:'2026-09-29T12:34:56.789Z'};
  const tables={billing_analytics_outbox:[row]} as Record<string,Row[]>;
  const db=mockDb(tables,()=>null);
  let observed:unknown[]=[];
  const service=loadSource<typeof import('../src/server/billing')>('src/server/billing.ts',{
    './clients':{getAdmin:()=>db},'@/utils/posthog-server':{trackDurableEvent:async(...args:unknown[])=>{observed=args;return true;}},
  });
  await service.deliverPurchaseEvents('sub_owned');
  assert.deepEqual(observed,['checkout_completed',USER_A,{},row.id,row.created_at]);
  assert.equal(typeof tables.billing_analytics_outbox[0].delivered_at,'string');
});

test('outbox retry after lost database acknowledgement sends the identical durable payload', async () => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY='phc_offline_fixture';
  const tables={billing_analytics_outbox:[{id:'checkout:cs_uncertain',subscription_id:'sub_owned',user_id:USER_A,properties:{amount_total:1000},created_at:'2026-09-29T12:34:56.789Z'}]} as Record<string,Row[]>;
  const base=mockDb(tables,()=>null);
  let failAcknowledgement=true;
  const db={...base,from:(table:string)=>{
    const query=base.from(table);
    const update=query.update;
    query.update=(value:Row)=>{
      if(!failAcknowledgement)return update(value);
      const failed={eq:()=>failed,is:()=>failed,select:async()=>({data:null,error:{code:'08006'}})};
      return failed as unknown as typeof query;
    };
    return query;
  }};
  const sent:Row[]=[];
  const service=loadSource<typeof import('../src/server/billing')>('src/server/billing.ts',{
    './clients':{getAdmin:()=>db},
    __fetch:async(_url:URL,options:{body:string})=>{sent.push(JSON.parse(options.body));return new Response('{"status":1}',{status:200});},
  });
  await service.deliverPurchaseEvents('sub_owned');
  assert.equal(tables.billing_analytics_outbox[0].delivered_at,undefined);
  failAcknowledgement=false;
  await service.deliverPurchaseEvents('sub_owned');
  assert.equal(sent.length,2);assert.deepEqual(sent[0],sent[1]);
  assert.equal(sent[1].timestamp,'2026-09-29T12:34:56.789Z');
  assert.equal(typeof tables.billing_analytics_outbox[0].delivered_at,'string');
});

test('analytics delivery failure keeps outbox pending and cannot fail verified paid access', async () => {
  const tables={subscriptions:[],billing_analytics_outbox:[{id:'checkout:cs_synthetic',subscription_id:'sub_owned',user_id:USER_A,properties:{}}]} as Record<string,Row[]>;
  const db=mockDb(tables,()=>({result:'applied',subscription:normalizeSubscription(subscription(),USER_A)}));
  const service=loadSource<typeof import('../src/server/billing')>('src/server/billing.ts',{
    './clients':{getAdmin:()=>db,getStripe:()=>({subscriptions:{retrieve:async()=>subscription()},checkout:{sessions:{retrieve:async()=>checkout()}}})},
    '@/utils/posthog-server':{trackDurableEvent:async()=>false},
  });
  assert.equal((await service.verifyCheckout('cs_owned',USER_A)).user_id,USER_A);
  assert.equal(tables.billing_analytics_outbox[0].delivered_at,undefined);
});

test('checkout creates only an approved price for the authenticated owner and blocks existing subscriptions', async () => {
  let calls=0;let input:Row={};let options:Row={};let existing=false;
  const db=mockDb({},()=>({allowed:true}));
  const clients={getAdmin:()=>db,getStripe:()=>({
      prices:{retrieve:async()=>({active:true,type:'recurring',recurring:{interval:'month'}})},
      checkout:{sessions:{create:async(value:Row,opts:Row)=>{calls++;input=value;options=opts;return {url:'https://checkout.stripe.test/synthetic'};}}},
    })};
  const api=loadSource<{POST(r:Request):Promise<Response>}>('src/app/api/create-checkout-session/route.ts',{
    '@/server/clients':clients,'./clients':clients,
    '@/server/practice':{getPracticeAccess:async()=>({isPremium:existing,isTrialing:false}),reserveOperation:async()=>null},
  });
  assert.equal((await api.POST(request({priceId:'price_monthly'},false))).status,401);
  assert.equal((await api.POST(request({priceId:'price_monthly',userId:USER_B}))).status,403);
  assert.equal((await api.POST(request({priceId:'price_arbitrary'}))).status,400);
  assert.equal(calls,0);
  assert.equal((await api.POST(request({priceId:'price_monthly',userId:USER_A,returnOrigin:'https://attacker.invalid'}))).status,200);
  assert.equal(input.client_reference_id,USER_A);
  assert.equal(((input.subscription_data as Row).metadata as Row).userId,USER_A);
  assert.match(String(input.success_url),/^https:\/\/app\.pitcht\.us\//);
  assert.match(String(options.idempotencyKey),new RegExp(USER_A));
  existing=true;
  assert.equal((await api.POST(request({priceId:'price_monthly'}))).status,409);assert.equal(calls,1);
});

test('protected analytics cron rejects missing/wrong credentials and drains pending identities', async () => {
  const db=mockDb({billing_analytics_outbox:[{subscription_id:'sub_owned'},{subscription_id:'sub_owned'}]},()=>null);
  const delivered:string[]=[];
  const api=loadSource<{GET(r:Request):Promise<Response>}>('src/app/api/cron/billing-analytics/route.ts',{
    '@/server/clients':{getAdmin:()=>db},'@/server/billing':{deliverPurchaseEvents:async(id:string)=>{delivered.push(id);}},
  });
  delete process.env.CRON_SECRET;
  assert.equal((await api.GET(new Request('http://localhost/cron'))).status,503);
  process.env.CRON_SECRET='synthetic-cron';
  assert.equal((await api.GET(new Request('http://localhost/cron'))).status,401);
  assert.equal((await api.GET(new Request('http://localhost/cron',{headers:{authorization:'Bearer wrong'}}))).status,401);
  assert.equal(delivered.length,0);
  assert.equal((await api.GET(new Request('http://localhost/cron',{headers:{authorization:'Bearer synthetic-cron'}}))).status,200);
  assert.deepEqual(delivered,['sub_owned']);
});

test('completion fails on recording-count errors and missing update rows instead of reporting success', async () => {
  for(const failure of ['count','update']) {
    const db=mockDb({},()=>null);
    const failedDb={...db,from:(table:string)=>{
      let updating=false;
      const chain={select:()=>chain,eq:()=>chain,update:()=>{updating=true;return chain;},
        maybeSingle:async()=>({data:updating?null:{id:SESSION,status:'in_progress'},error:null}),
        then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({count:1,error:failure==='count'?{code:'08006'}:null}).then(resolve)};
      if(table==='recordings'||table==='sessions')return chain;
      return db.from(table);
    }};
    const clients={getAdmin:()=>failedDb};
    const api=loadSource<{POST(r:Request):Promise<Response>}>('src/app/api/complete-session/route.ts',{'@/server/clients':clients,'./clients':clients});
    assert.equal((await api.POST(request({sessionId:SESSION}))).status,503);
  }
});

test('actual final-question and skip completion branches do not navigate after failure and permit successful retry', async () => {
  const source=ts.createSourceFile('interview.tsx',readFileSync('src/app/interview/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const paths:string[]=[];
  const visit=(node:ts.Node)=>{
    if(ts.isIfStatement(node)&&node.expression.getText(source)==='sessionId'&&node.thenStatement.getText(source).includes('await completeSession(sessionId)')&&ts.isBlock(node.parent)) {
      const index=node.parent.statements.indexOf(node);
      paths.push(node.parent.statements.slice(index).map(s=>s.getText(source)).join('\n'));
    }
    ts.forEachChild(node,visit);
  };
  visit(source);assert.equal(paths.length,2);
  for(const path of paths) {
    let failing=true;const navigations:string[]=[];const errors:string[]=[];
    const compiled=ts.transpileModule('(async()=>{'+path+'})',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    const invoke=runInNewContext(compiled,{sessionId:SESSION,currentQuestionIndex:0,
      completeSession:async()=>{if(failing)throw new Error('Injected failure');},
      toast:{error:(value:string)=>errors.push(value)},Sentry:{captureException:()=>{}},console:{error:()=>{}},
      router:{push:(value:string)=>navigations.push(value)},trackEvent:()=>{},AnalyticsEvents:{SESSION_COMPLETED:'complete'},
    }) as ()=>Promise<void>;
    await invoke();assert.equal(navigations.length,0);assert.equal(errors.length,1);
    failing=false;await invoke();assert.deepEqual(navigations,[`/analysis?sessionId=${SESSION}`]);
  }
});
