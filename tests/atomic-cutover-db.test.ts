import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, basename } from 'node:path';

type Row = Record<string, unknown>;
type PgClient = { connect():Promise<void>; end():Promise<void>; query<T extends Row = Row>(sql:string,args?:unknown[]):Promise<{rows:T[]}> };
const { Client } = createRequire(import.meta.url)('pg') as { Client:new(config:Row)=>PgClient };
// A distinct explicit opt-in and database prevent this suite from resetting the
// application, rehearsal or existing security-billing suite's database.
const socket=process.env.PITCHT_CUTOVER_TEST_PG_SOCKET;
if(socket && !isAbsolute(socket)) throw new Error('Only an absolute Unix socket path is allowed');
const enabled=!!socket;
const migration=readFileSync('docs/security-billing/atomic-cutover.sql','utf8');
const proposal=readFileSync('docs/security-billing/database-proposal.sql','utf8');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const OWNER='dc869fa0-8652-4df1-bede-93a776ed70eb';
async function connection(name='cutover-test') {
  const client=new Client({host:socket,port:54379,user:'pitcht_test',database:'pitcht_cutover_test',application_name:name});
  await client.connect();return client;
}
async function query(sql:string,args:unknown[]=[],role='',uid=A) {
  const client=await connection();
  try {
    if(role) { await client.query('SET ROLE '+role);await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[uid]); }
    return (await client.query(sql,args)).rows;
  } finally { await client.end(); }
}
async function apply(sql=migration) {
  const client=await connection('cutover-migrator');
  try { await client.query(sql); }
  finally { await client.end(); } // Disconnect also rolls back every failed migration.
}
async function seed(status='in_progress',hours=1,questions=1,user=A) {
  const sid=randomUUID(),qid=randomUUID();
  await query("INSERT INTO sessions(id,user_id,session_type,context,status,created_at,completed_at) VALUES($1,$2,'job-interview','synthetic',$3,clock_timestamp()-$4*interval '1 hour',CASE WHEN $3='completed' THEN clock_timestamp()-$4*interval '1 hour' END)",[sid,user,status,hours]);
  for(let i=0;i<questions;i++) await query("INSERT INTO questions(id,session_id,question_text,question_type,difficulty,position) VALUES($1,$2,'Synthetic?','behavioral',3,$3)",[i===0?qid:randomUUID(),sid,i]);
  return {sid,qid};
}
async function recording(s:{sid:string;qid:string},role='',uid=A) {
  const id=randomUUID();
  await query("INSERT INTO recordings(id,session_id,question_id,video_url) VALUES($1,$2,$3,$4)",[id,s.sid,s.qid,uid+'/'+s.sid+'/saved.webm'],role,uid);
  return id;
}
async function access(user=A) { return (await query('SELECT practice_access_status($1) AS result',[user],'service_role'))[0].result as Row; }
async function budget(id:string,user=A) { return (await query("SELECT consume_ai_budget($1,'feedback',$2) AS result",[user,id],'service_role'))[0].result as Row; }
async function waiting(name:string,event:string) {
  for(let i=0;i<300;i++) {
    if((await query('SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event=$2',[name,event])).length) return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Controlled barrier was not reached: '+name+'/'+event);
}
async function pristine() {
  assert.equal((await query("SELECT to_regclass('public.security_billing_cutover') AS marker"))[0].marker,null);
  assert.equal((await query("SELECT count(*) AS n FROM pg_attribute WHERE attrelid='sessions'::regclass AND attname='access_expires_at'"))[0].n,'0');
  assert.equal((await query("SELECT has_table_privilege('authenticated','sessions','INSERT') AS allowed"))[0].allowed,true);
}
beforeEach(async()=>{
  if(!enabled)return;
  const db=await connection();
  try {
    const directory=String((await db.query('SHOW data_directory')).rows[0].data_directory);
    const target=String((await db.query('SELECT current_database() AS name')).rows[0].name);
    if(!basename(directory).startsWith('pitcht-security-test-') || target!=='pitcht_cutover_test') {
      throw new Error('Refusing to reset anything except the dedicated disposable cutover database');
    }
    await db.query('DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; CREATE SCHEMA public;');
    await db.query(readFileSync('tests/security-billing-fixture.sql','utf8'));
    await db.query(readFileSync('create_subscriptions_table.sql','utf8'));
    await db.query(readFileSync('add_rls_policies.sql','utf8'));
    // Broad legacy ACLs and direct column grants must not survive contraction.
    await db.query('GRANT ALL ON sessions,questions,subscriptions TO PUBLIC,anon,authenticated; GRANT UPDATE(status) ON subscriptions TO authenticated;');
    await db.query("CREATE SCHEMA storage; CREATE TABLE storage.objects(id uuid PRIMARY KEY,metadata jsonb); INSERT INTO storage.objects VALUES(gen_random_uuid(),'{\"synthetic\":true}');");
  } finally { await db.end(); }
});

test('Cutover source: reviewed RPCs remain identical except explicit legacy admission',{skip:!enabled},()=>{
  const functions=(source:string)=>new Map([...source.matchAll(/CREATE FUNCTION public\.(\w+)[\s\S]*?\$\$;/g)].map(match=>[match[1],match[0]]));
  const old=functions(proposal),current=functions(migration);
  assert.equal(current.size,7);
  for(const [name,body] of old) if(name!=='consume_ai_budget') assert.equal(current.get(name),body,name);
  assert.doesNotMatch(current.get('consume_ai_budget')!,/owned\.created_at/);
  assert.doesNotMatch(migration,/(?:ALTER|UPDATE|DELETE FROM|INSERT INTO|LOCK TABLE)\s+(?:auth|storage)\./i);
});

test('Cutover: preserves records, canonical billing, owner grant and all completed usage',{skip:!enabled},async()=>{
  const historical=await seed('completed',72,1),third=await seed('completed',1,1);
  const rid=await recording(third);
  await query("INSERT INTO subscriptions(user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,current_period_end) VALUES($1,'cus_synthetic','sub_synthetic','price_synthetic','active',clock_timestamp()+interval '30 days')",[A]);
  const before=await query("SELECT jsonb_build_object('sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM sessions s),'questions',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM questions q),'recordings',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM recordings r),'subscriptions',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM subscriptions b),'auth',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM auth.users u),'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o)) AS data");
  await apply();
  const after=await query("SELECT jsonb_build_object('sessions',(SELECT jsonb_agg(to_jsonb(s)-'access_expires_at' ORDER BY id) FROM sessions s),'questions',(SELECT jsonb_agg(to_jsonb(q) ORDER BY id) FROM questions q),'recordings',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM recordings r),'subscriptions',(SELECT jsonb_agg(to_jsonb(b)-'stripe_synced_at'-'billing_revision' ORDER BY id) FROM subscriptions b),'auth',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM auth.users u),'storage',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM storage.objects o)) AS data");
  assert.deepEqual(after,before);
  assert.equal((await access()).sessionsThisMonth,2);assert.equal((await access()).isPremium,false);
  assert.equal((await access(OWNER)).entitlementSource,'internal_test');
  assert.equal((await budget(rid)).allowed,true);
  assert.equal((await query('SELECT access_expires_at FROM sessions WHERE id=$1',[historical.sid]))[0].access_expires_at,null);
  assert.equal((await query('SELECT count(*) AS n FROM billing_events'))[0].n,'0');
  assert.equal((await query('SELECT count(*) AS n FROM billing_analytics_outbox'))[0].n,'0');
});

test('Cutover: completed third session can finish but cannot start a fourth or reset usage by deletion',{skip:!enabled},async()=>{
  await seed('completed',70);await seed('completed',50);const third=await seed('completed',1);
  const rid=await recording(third);await apply();
  assert.equal((await budget(rid)).allowed,true);assert.equal((await access()).allowed,false);
  await query('DELETE FROM sessions WHERE id=$1',[third.sid],'authenticated');
  assert.equal((await access()).sessionsThisMonth,3);assert.equal((await access()).allowed,false);
});

test('Cutover: fixed selection caps active reservations and denies recent excluded/half-created/future work',{skip:!enabled},async()=>{
  await seed('completed',70);const first=await seed('in_progress',3),second=await seed('in_progress',2),excess=await seed('in_progress',1);
  const half=await seed('in_progress',1,0),future=await seed('in_progress',-1),old=await seed('in_progress',25);
  const overShape=await seed('in_progress',1,11,B);const overRid=await recording(overShape,'',B);
  const excessRid=await recording(excess);await apply();
  const selected=await query('SELECT id FROM sessions WHERE access_expires_at IS NOT NULL ORDER BY id');
  assert.deepEqual(selected.map(r=>r.id),[first.sid,second.sid].sort());
  for(const s of [half,future,old]) assert.equal((await query('SELECT access_expires_at FROM sessions WHERE id=$1',[s.sid]))[0].access_expires_at,null);
  assert.equal((await access()).allowed,false);assert.equal((await access(B)).allowed,true);
  assert.equal((await budget(excessRid)).reason,'quota_exhausted');
  assert.equal((await budget(overRid,B)).reason,'quota_exhausted'); // No implicit spare-quota fallback.
  assert.equal((await budget(overRid,A)).reason,'not_owned');
});

test('Cutover: maximum three eligible completions, fixed expiry, immutable marker, one-shot rerun',{skip:!enabled},async()=>{
  const sessions=[];for(let i=0;i<5;i++) sessions.push(await seed('completed',5-i));
  await apply();
  const selected=await query('SELECT id,access_expires_at FROM sessions WHERE access_expires_at IS NOT NULL ORDER BY created_at');
  assert.deepEqual(selected.map(r=>r.id),sessions.slice(0,3).map(s=>s.sid));
  const marker=await query('SELECT *,extract(epoch FROM legacy_expires_at-cutover_at) AS seconds FROM security_billing_cutover');
  assert.equal(Number(marker[0].seconds),86400);
  assert.ok(selected.every(r=>String(r.access_expires_at)===String(marker[0].legacy_expires_at)));
  await assert.rejects(apply(),/Cutover already applied/);
  assert.deepEqual(await query('SELECT *,extract(epoch FROM legacy_expires_at-cutover_at) AS seconds FROM security_billing_cutover'),marker);
  for(const role of ['anon','authenticated','service_role']) await assert.rejects(query("UPDATE security_billing_cutover SET legacy_expires_at=legacy_expires_at+interval '1 day'",[],role),{code:'42501'});
  const rid=await recording(sessions[0]);
  await query("UPDATE sessions SET access_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[sessions[0].sid]);
  assert.equal((await budget(rid)).reason,'quota_exhausted');
});

test('Cutover: queued old completion is denied, recording insert resumes, and history deletion retains captured usage',{skip:!enabled},async()=>{
  const done=await seed('completed'),active=await seed();
  const barrier=await connection('cutover-barrier'),writer=await connection('old-completion'),upload=await connection('recording-insert'),deletion=await connection('history-delete');
  let migrationResult:Promise<unknown>|undefined;
  try {
    await barrier.query('SELECT pg_advisory_lock(8176,1)');
    migrationResult=apply(migration.replace('DO $preflight$','SELECT pg_advisory_xact_lock(8176,1);\nDO $preflight$'));
    void migrationResult.catch(()=>{});
    await waiting('cutover-migrator','advisory');
    for(const client of [writer,upload,deletion]) { await client.query('SET ROLE authenticated');await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[A]); }
    const writing=writer.query("UPDATE sessions SET status='completed' WHERE id=$1",[active.sid]).then(()=>null,(e:Error&{code:string})=>e.code);
    const inserting=upload.query("INSERT INTO recordings(session_id,question_id,video_url) VALUES($1,$2,'synthetic/saved.webm') RETURNING id",[active.sid,active.qid]);
    const deleting=deletion.query('DELETE FROM sessions WHERE id=$1',[done.sid]);
    void inserting.catch(()=>{});void deleting.catch(()=>{});
    await waiting('old-completion','relation');await waiting('recording-insert','relation');await waiting('history-delete','relation');
    await barrier.query('SELECT pg_advisory_unlock(8176,1)');await migrationResult;
    assert.equal(await writing,'42501');assert.equal((await inserting).rows.length,1);await deleting;
    assert.equal((await query('SELECT count(*) AS n FROM practice_completed_usage WHERE session_id=$1',[done.sid]))[0].n,'1');
    await query("UPDATE sessions SET status='completed' WHERE id=$1",[active.sid],'service_role');
    await query("UPDATE sessions SET status='completed' WHERE id=$1",[active.sid],'service_role');
    assert.equal((await access()).sessionsThisMonth,2);
  } finally { await barrier.end();await Promise.allSettled([writer.end(),upload.end(),deletion.end()]);await migrationResult?.catch(()=>{}); }
});

test('Cutover: a completion committed before lock acquisition enters the atomic backfill',{skip:!enabled},async()=>{
  const s=await seed(),writer=await connection('prior-writer');
  try {
    await writer.query('BEGIN');await writer.query('SET LOCAL ROLE authenticated');await writer.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[A]);
    await writer.query("UPDATE sessions SET status='completed' WHERE id=$1",[s.sid]);
    const applying=apply();await waiting('cutover-migrator','relation');await writer.query('COMMIT');await applying;
    assert.equal((await query('SELECT count(*) AS n FROM practice_completed_usage WHERE session_id=$1',[s.sid]))[0].n,'1');
  } finally { await writer.end(); }
});

test('Cutover: lock timeout leaves no schema/permission fragment',{skip:!enabled},async()=>{
  const holder=await connection('lock-holder');
  try {
    await holder.query('BEGIN; LOCK TABLE sessions IN ROW EXCLUSIVE MODE');
    const start=Date.now();await assert.rejects(apply(),{code:'55P03'});
    assert.ok(Date.now()-start<8000,'bounded migration wait');
  } finally { await holder.end(); }
  await pristine();
});

test('Cutover: unexpected entitlement columns and inherited writes abort atomically',{skip:!enabled},async()=>{
  await query('ALTER TABLE sessions ADD COLUMN access_expires_at timestamptz');
  await assert.rejects(apply(),/Unexpected preexisting entitlement columns/);
  await query('ALTER TABLE sessions DROP COLUMN access_expires_at');await pristine();
  await query('CREATE ROLE cutover_unexpected_writer NOLOGIN; GRANT INSERT ON sessions TO cutover_unexpected_writer; GRANT cutover_unexpected_writer TO authenticated');
  try {
    await assert.rejects(apply(),/Unexpected effective legacy write privilege/);await pristine();
  } finally { await query('REVOKE cutover_unexpected_writer FROM authenticated; DROP OWNED BY cutover_unexpected_writer; DROP ROLE cutover_unexpected_writer'); }
});

test('Cutover: a non-bypass owner under FORCE RLS cannot silently backfill filtered history',{skip:!enabled},async()=>{
  await seed('completed');
  await query('CREATE ROLE cutover_filtered_owner NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT pitcht_test TO cutover_filtered_owner; GRANT USAGE,CREATE ON SCHEMA public TO cutover_filtered_owner; GRANT USAGE ON SCHEMA auth TO cutover_filtered_owner; ALTER TABLE sessions OWNER TO cutover_filtered_owner; ALTER TABLE sessions FORCE ROW LEVEL SECURITY');
  try {
    assert.equal((await query('SELECT count(*) AS n FROM sessions',[],'cutover_filtered_owner',B))[0].n,'0');
    await assert.rejects(apply('SET ROLE cutover_filtered_owner;\n'+migration),/query would be affected by row-level security policy for table "sessions"/);
    await pristine();
    assert.equal((await query('SELECT count(*) AS n FROM sessions'))[0].n,'1');
  } finally {
    await query('ALTER TABLE sessions OWNER TO pitcht_test; ALTER TABLE sessions NO FORCE ROW LEVEL SECURITY; REVOKE pitcht_test FROM cutover_filtered_owner; DROP OWNED BY cutover_filtered_owner; DROP ROLE cutover_filtered_owner');
  }
});

test('Cutover: freshly verified paid and trial users can process excluded legacy recordings',{skip:!enabled},async()=>{
  const legacy=await seed('in_progress',48),rid=await recording(legacy);await apply();
  assert.equal((await query('SELECT access_expires_at FROM sessions WHERE id=$1',[legacy.sid]))[0].access_expires_at,null);
  assert.equal((await budget(rid)).reason,'quota_exhausted');
  for(const [index,status] of ['active','trialing'].entries()) {
    const snapshot={user_id:A,stripe_customer_id:'cus_synthetic',stripe_subscription_id:'sub_synthetic',stripe_price_id:'price_synthetic',status,current_period_start:new Date().toISOString(),current_period_end:new Date(Date.now()+86400000).toISOString()};
    await query('SELECT sync_billing_subscription($1::jsonb,$2)',[JSON.stringify(snapshot),index===0?null:index],'service_role');
    assert.equal((await budget(rid)).allowed,true);
    await query('DELETE FROM ai_operation_leases WHERE recording_id=$1',[rid],'service_role');
  }
});

test('Cutover: final private permissions, canonical Stripe revision/outbox and concurrent admission remain intact',{skip:!enabled},async()=>{
  await apply();
  for(const role of ['anon','authenticated']) {
    await assert.rejects(query('SELECT practice_access_status($1)',[A],role),{code:'42501'});
    await assert.rejects(query("UPDATE sessions SET access_expires_at=clock_timestamp()+interval '100 years'",[],role),{code:'42501'});
    await assert.rejects(query("UPDATE subscriptions SET stripe_synced_at=clock_timestamp(),billing_revision=99",[],role),{code:'42501'});
    await assert.rejects(query('TRUNCATE subscriptions',[],role),{code:'42501'});
  }
  const starts=await Promise.allSettled(Array.from({length:6},()=>query("SELECT create_practice_session($1,'job-interview','context',$2::jsonb)",[B,JSON.stringify([{id:randomUUID(),text:'Synthetic?',type:'behavioral',difficulty:3}])],'service_role')));
  assert.equal(starts.filter(r=>r.status==='fulfilled').length,3);
  const snapshot={user_id:A,stripe_customer_id:'cus_synthetic',stripe_subscription_id:'sub_synthetic',stripe_price_id:'price_synthetic',status:'active',current_period_start:new Date().toISOString(),current_period_end:new Date(Date.now()+86400000).toISOString()};
  const sync=(s:Row,revision:number|null,event:string)=>query('SELECT sync_billing_subscription($1::jsonb,$2,$3,123,$4::jsonb) AS result',[JSON.stringify(s),revision,event,JSON.stringify({session_id:'cs_synthetic',amount_total:100,currency:'usd'})],'service_role');
  await sync(snapshot,null,'evt_one');await sync(snapshot,0,'evt_one');await sync(snapshot,1,'evt_two');
  assert.equal((await access()).isPremium,true);
  await assert.rejects(sync({...snapshot,user_id:B},2,'evt_bad'),{code:'42501'});
  assert.equal((await query('SELECT count(*) AS n FROM billing_events'))[0].n,'2');
  assert.equal((await query('SELECT count(*) AS n FROM billing_analytics_outbox'))[0].n,'1');
});
