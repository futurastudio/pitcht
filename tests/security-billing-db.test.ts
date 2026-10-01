import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, basename } from 'node:path';
import { USER_A, USER_B } from './module-loader';

type Row = Record<string, unknown>;
type PgClient = { connect():Promise<void>; end():Promise<void>; query<T extends Row = Row>(sql:string,args?:unknown[]):Promise<{rows:T[]}> };
const { Client } = createRequire(import.meta.url)('pg') as { Client:new(config:Row)=>PgClient };
const socket = process.env.PITCHT_TEST_PG_SOCKET;
const enabled = !!socket;
if (enabled && !isAbsolute(socket!)) throw new Error('Only an absolute Unix socket path is allowed');
const proposal = readFileSync('docs/security-billing/database-proposal.sql','utf8');
async function connection(name = 'security-test') {
  const client = new Client({ host:socket,port:54379,user:'pitcht_test',database:'pitcht_security_test',application_name:name });
  await client.connect(); return client;
}
async function query(sql:string,args?:unknown[], role = 'service_role') {
  const client=await connection();
  try { if(role) await client.query('SET ROLE '+role); return (await client.query(sql,args)).rows; }
  finally { await client.end(); }
}
async function access() { return (await query('SELECT public.practice_access_status($1) AS result',[USER_A]))[0].result as Row; }
const question = () => [{id:randomUUID(),text:'A synthetic question?',type:'behavioral',difficulty:3}];
async function create() { return (await query("SELECT public.create_practice_session($1,'job-interview','context',$2::jsonb) AS id",[USER_A,JSON.stringify(question())]))[0].id as string; }
function snapshot(id='sub_old',user=USER_A,status='active') {
  return {user_id:user,stripe_subscription_id:id,stripe_customer_id:'cus_synthetic',stripe_price_id:'price_monthly',status,
    current_period_start:new Date(Date.now()-3600_000).toISOString(),current_period_end:new Date(Date.now()+86400_000).toISOString(),canceled_at:null};
}
async function sync(value:Row,revision:number|null,event:string|null=null,purchase:Row|null=null) {
  return (await query('SELECT public.sync_billing_subscription($1::jsonb,$2,$3,100,$4::jsonb) AS result',
    [JSON.stringify(value),revision,event,purchase?JSON.stringify(purchase):null]))[0].result as Row;
}
async function legacy(ageHours=1,expiry:string|null=null) {
  const sid=randomUUID(),qid=randomUUID(),rid=randomUUID();
  await query("INSERT INTO sessions(id,user_id,session_type,context,status,created_at,access_expires_at) VALUES($1,$2,'job-interview','context','in_progress',clock_timestamp()-$3*interval '1 hour',$4)",[sid,USER_A,ageHours,expiry]);
  await query("INSERT INTO questions(id,session_id,question_text,question_type,difficulty,position) VALUES($1,$2,'Question?','behavioral',3,0)",[qid,sid]);
  await query('INSERT INTO recordings(id,session_id,question_id) VALUES($1,$2,$3)',[rid,sid,qid]);
  return {sid,rid};
}
async function completeThree() {
  for(let i=0;i<3;i++) {
    const id=await create(); await query("UPDATE sessions SET status='completed' WHERE id=$1",[id]);
  }
}
before(async()=>{
  if(!enabled)return;
  const db=await connection();
  try {
    const directory=String((await db.query('SHOW data_directory')).rows[0].data_directory);
    if (basename(directory) !== 'repair-test-postgres' && !basename(directory).startsWith('pitcht-security-test-')) {
      throw new Error('Refusing to reset a database outside a dedicated security test cluster');
    }
    await db.query('DROP SCHEMA public CASCADE; DROP SCHEMA auth CASCADE; CREATE SCHEMA public;');
    await db.query(readFileSync('tests/security-billing-fixture.sql','utf8'));
    await db.query(readFileSync('create_subscriptions_table.sql','utf8'));
    await db.query(readFileSync('add_rls_policies.sql','utf8'));
    await db.query(proposal);
  } finally { await db.end(); }
});
beforeEach(async()=>{
  if(enabled) await query('TRUNCATE subscriptions,sessions,questions,recordings,analyses,billing_events,billing_analytics_outbox,ai_usage_windows,ai_operation_leases,practice_completed_usage CASCADE',[], '');
});

test('SQL: duplicate webhook ledger and distinct events for same purchase yield one canonical outbox row',{skip:!enabled},async()=>{
  const purchase={session_id:'cs_synthetic',amount_total:1499,currency:'usd'};
  assert.equal((await sync(snapshot(),null,'evt_first',purchase)).result,'applied');
  assert.equal((await sync(snapshot(),0,'evt_first',purchase)).result,'duplicate');
  assert.equal((await sync(snapshot(),1,'evt_second',purchase)).result,'applied');
  assert.equal(Number((await query('SELECT count(*) AS n FROM billing_events'))[0].n),2);
  assert.equal(Number((await query('SELECT count(*) AS n FROM billing_analytics_outbox'))[0].n),1);
});
test('SQL: binding is immutable in RPC and direct update; customer cannot bind to a second user',{skip:!enabled},async()=>{
  await sync(snapshot(),null);
  await assert.rejects(sync(snapshot('sub_old',USER_B),1),{code:'42501'});
  await assert.rejects(sync(snapshot('sub_new',USER_B),null),{code:'42501'});
  await assert.rejects(query('UPDATE subscriptions SET user_id=$1',[USER_B]),{code:'42501'});
  assert.equal((await query('SELECT user_id FROM subscriptions'))[0].user_id,USER_A);
});
test('SQL: old subscription cancellation cannot cancel the newer subscription for same user',{skip:!enabled},async()=>{
  await sync(snapshot(),null); await sync(snapshot('sub_new'),null);
  await sync(snapshot('sub_old',USER_A,'canceled'),1,'evt_cancel');
  const rows=await query('SELECT stripe_subscription_id,status FROM subscriptions ORDER BY stripe_subscription_id');
  assert.deepEqual(rows,[{stripe_subscription_id:'sub_new',status:'active'},{stripe_subscription_id:'sub_old',status:'canceled'}]);
});
test('SQL: concurrent stale revisions permit one update; losing event is not acknowledged',{skip:!enabled},async()=>{
  await sync(snapshot(),null);
  const results=await Promise.allSettled([sync(snapshot(),1,'evt_race_a'),sync(snapshot(),1,'evt_race_b')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const rejected=results.find(r=>r.status==='rejected'); assert.equal(rejected?.status==='rejected' && rejected.reason.code,'40001');
  assert.equal(Number((await query('SELECT count(*) AS n FROM billing_events'))[0].n),1);
});
test('SQL: anonymous/authenticated cannot invoke privileged RPCs or write subscription/session bindings',{skip:!enabled},async()=>{
  for(const role of ['anon','authenticated']) {
    await assert.rejects(query('SELECT public.practice_access_status($1)',[USER_A],role),{code:'42501'});
    await assert.rejects(query("INSERT INTO sessions(user_id,status) VALUES($1,'in_progress')",[USER_A],role),{code:'42501'});
    await assert.rejects(query("UPDATE subscriptions SET status='active'",[],role),{code:'42501'});
    await assert.rejects(query("UPDATE sessions SET status='completed'",[],role),{code:'42501'});
  }
});
test('SQL: free allowance reserves only three concurrent sessions and retries reuse the original session',{skip:!enabled},async()=>{
  const questions=question();
  const original=(await query("SELECT create_practice_session($1,'job-interview','context',$2::jsonb) AS id",[USER_A,JSON.stringify(questions)]))[0].id;
  assert.equal((await query("SELECT create_practice_session($1,'job-interview','context',$2::jsonb) AS id",[USER_A,JSON.stringify(questions)]))[0].id,original);
  const results=await Promise.allSettled(Array.from({length:6},()=>create()));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
  assert.equal(Number((await query('SELECT count(*) AS n FROM sessions'))[0].n),3);
});
test('SQL: deleting completed history cannot reset lifetime allowance; repeated completion counts once',{skip:!enabled},async()=>{
  await completeThree();
  await query("UPDATE sessions SET status='completed'");
  await query('DELETE FROM sessions');
  const result=await access();assert.equal(result.allowed,false);assert.equal(result.sessionsThisMonth,3);
});
test('SQL: exhausted legacy NULL-expiry denies AI work; recent transition and valid admitted work remain usable',{skip:!enabled},async()=>{
  const recent=await legacy();
  const allowed=(await query("SELECT consume_ai_budget($1,'transcribe',$2) AS result",[USER_A,recent.rid]))[0].result as Row;
  assert.equal(allowed.allowed,true);
  await query('DELETE FROM ai_operation_leases');
  const old=await legacy(48);
  assert.equal(((await query("SELECT consume_ai_budget($1,'feedback',$2) AS result",[USER_A,old.rid]))[0].result as Row).allowed,false);
  await completeThree();
  for(const op of ['transcribe','feedback']) {
    const denied=(await query('SELECT consume_ai_budget($1,$2,$3) AS result',[USER_A,op,recent.rid]))[0].result as Row;
    assert.equal(denied.reason,'quota_exhausted');
  }
  await query("UPDATE sessions SET access_expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1",[recent.sid]);
  assert.equal(((await query("SELECT consume_ai_budget($1,'feedback',$2) AS result",[USER_A,recent.rid]))[0].result as Row).allowed,true);
});
test('SQL: durable budgets and leases serialize across concurrent connections',{skip:!enabled},async()=>{
  const results=await Promise.all(Array.from({length:22},()=>query("SELECT consume_ai_budget($1,'questions') AS result",[USER_A])));
  assert.equal(results.filter(r=>(r[0].result as Row).allowed).length,10);
  const {rid}=await legacy();
  const leases=await Promise.all(Array.from({length:4},()=>query("SELECT consume_ai_budget($1,'feedback',$2) AS result",[USER_A,rid])));
  assert.equal(leases.filter(r=>(r[0].result as Row).allowed).length,1);
  assert.equal(leases.filter(r=>(r[0].result as Row).reason==='work_in_progress').length,3);
});
test('SQL: completion cannot interleave between used and active counts to admit a fourth free session',{skip:!enabled},async()=>{
  const ids=[await create(),await create(),await create()];
  await query("UPDATE sessions SET status='completed' WHERE id=ANY($1::uuid[])",[ids.slice(0,2)]);
  const start=proposal.indexOf('CREATE FUNCTION public.practice_access_status');
  const end=proposal.indexOf('CREATE FUNCTION public.consume_ai_budget',start);
  const original=proposal.slice(start,end).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
  const instrumented=original.replace('  SELECT count(*) INTO active', '  PERFORM pg_advisory_xact_lock(8100,1);\n  SELECT count(*) INTO active');
  const blocker=await connection('barrier'),creator=await connection('creator-race'),completer=await connection('completion-race');
  const waitFor=async(name:string)=>{
    for(let i=0;i<200;i++) {
      const rows=await query("SELECT 1 AS waiting FROM pg_stat_activity WHERE application_name=$1 AND wait_event='advisory'",[name],'');
      if(rows.length)return;
      await new Promise(r=>setTimeout(r,10));
    }
    throw new Error('Controlled race barrier was not reached');
  };
  try {
    await query(instrumented,[],''); await blocker.query('SELECT pg_advisory_lock(8100,1)');
    await creator.query('SET ROLE service_role');await completer.query('SET ROLE service_role');
    const creating=creator.query("SELECT create_practice_session($1,'job-interview','context',$2::jsonb)",[USER_A,JSON.stringify(question())]).then(()=>({code:'unexpected_success'}),e=>({code:e.code}));
    await waitFor('creator-race');
    const completing=completer.query("UPDATE sessions SET status='completed' WHERE id=$1",[ids[2]]);
    await waitFor('completion-race');
    await blocker.query('SELECT pg_advisory_unlock(8100,1)');
    assert.equal((await creating).code,'P0001');await completing;
    assert.equal(Number((await query('SELECT count(*) AS n FROM sessions'))[0].n),3);
    assert.equal(Number((await query('SELECT count(*) AS n FROM practice_completed_usage'))[0].n),3);
  } finally {
    await blocker.end();await creator.end();await completer.end();await query(original,[],'');
  }
});
