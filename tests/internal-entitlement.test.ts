import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSource, mockDb, INTERNAL_TEST_USER, USER_A, type Row } from './module-loader';

process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY='price_monthly';

test('internal test access requires the exact server identity and a valid private grant; lookup errors fail closed',async()=>{
  let data:unknown=true;let error:Row|null=null;let calls=0;
  const service=loadSource<typeof import('../src/server/internalTest')>('src/server/internalTest.ts',{
    './clients':{getAdmin:()=>({rpc:async(_name:string,args:Row)=>{
      calls++;assert.equal(args.p_user_id,INTERNAL_TEST_USER);return {data,error};
    }})},
  });
  assert.equal(service.INTERNAL_TEST_USER_ID,INTERNAL_TEST_USER);
  for(const id of [USER_A,'joseartigas281@gmail.com','anything@pitcht.test','']) {
    assert.equal(await service.hasInternalTestAccess(id),false);
  }
  assert.equal(calls,0);assert.equal(await service.hasInternalTestAccess(INTERNAL_TEST_USER),true);
  data=false;assert.equal(await service.hasInternalTestAccess(INTERNAL_TEST_USER),false);
  data=null;await assert.rejects(service.hasInternalTestAccess(INTERNAL_TEST_USER),/entitlement unavailable/i);
  data=true;error={code:'offline'};await assert.rejects(service.hasInternalTestAccess(INTERNAL_TEST_USER),/entitlement unavailable/i);
});

test('approved internal Pro avoids fabricated billing refresh without altering subscriptions; revocation restores ordinary refresh',async()=>{
  let grant=true;let stripeReads=0;
  const tables={subscriptions:[{user_id:INTERNAL_TEST_USER,stripe_subscription_id:'sub_demo_synthetic',
    stripe_customer_id:'cus_demo_synthetic',status:'active',stripe_synced_at:null}]} as Record<string,Row[]>;
  const before=JSON.stringify(tables);
  const db=mockDb(tables,()=>grant);
  const service=loadSource<typeof import('../src/server/billing')>('src/server/billing.ts',{
    './clients':{getAdmin:()=>db,getStripe:()=>({subscriptions:{retrieve:async()=>{
      stripeReads++;throw new Error('Synthetic missing Stripe binding');
    }}})},
    '@/utils/posthog-server':{trackDurableEvent:async()=>{throw new Error('No purchase analytics expected');}},
  });
  await service.refreshUserBilling(INTERNAL_TEST_USER);
  assert.equal(stripeReads,0);assert.equal(JSON.stringify(tables),before);
  grant=false;await assert.rejects(service.refreshUserBilling(INTERNAL_TEST_USER),/missing Stripe binding/);
  assert.equal(stripeReads,1);assert.equal(JSON.stringify(tables),before);
});

test('access ignores caller-supplied test identity and internal Pro operations retain budget denial',async()=>{
  let signedUser=USER_A;let grantReads=0;const lookedUp:string[]=[];
  const db=mockDb({},(name,args)=>{
    lookedUp.push(String(args.p_user_id));
    if(name==='internal_test_access'){grantReads++;return true;}
    if(name==='consume_ai_budget')return {allowed:false,reason:'rate_limited'};
    const internal=args.p_user_id===INTERNAL_TEST_USER;
    return {allowed:true,isPremium:internal,isTrialing:false,entitlementSource:internal?'internal_test':'free'};
  });
  db.auth.getUser=async()=>({data:{user:{id:signedUser,email:'synthetic@example.test'}},error:null});
  const clients={getAdmin:()=>db,getStripe:()=>{throw new Error('No Stripe provider expected');}};
  const mocks={'./clients':clients,'@/server/clients':clients,'@/utils/posthog-server':{trackDurableEvent:async()=>true}};
  const api=loadSource<{GET(r:Request):Promise<Response>}>('src/app/api/practice-access/route.ts',mocks);
  const spoofed=new Request('http://localhost/api/practice-access?userId='+INTERNAL_TEST_USER,{headers:{authorization:'Bearer valid','x-user-id':INTERNAL_TEST_USER}});
  const response=await api.GET(spoofed);assert.equal(response.status,200);
  const access=await response.json();assert.equal(access.userId,USER_A);assert.equal(access.isPremium,false);
  assert.equal(grantReads,0);assert.deepEqual(lookedUp,[USER_A]);
  signedUser=INTERNAL_TEST_USER;
  const own=await (await api.GET(spoofed)).json();assert.equal(own.userId,INTERNAL_TEST_USER);assert.equal(own.entitlementSource,'internal_test');
  const practice=loadSource<typeof import('../src/server/practice')>('src/server/practice.ts',mocks);
  await assert.rejects(practice.reserveOperation(INTERNAL_TEST_USER,'questions'),err=>{
    assert.equal((err as {status:number}).status,429);return true;
  });
});

test('internal test checkout and portal reject billing creation after verified auth, with no Stripe calls',async()=>{
  let stripeCalls=0;
  const db=mockDb({},name=>name==='internal_test_access'?true:{allowed:true,isPremium:true,isTrialing:false,entitlementSource:'internal_test'});
  db.auth.getUser=async()=>({data:{user:{id:INTERNAL_TEST_USER,email:'synthetic@example.test'}},error:null});
  const clients={getAdmin:()=>db,getStripe:()=>{stripeCalls++;throw new Error('No Stripe call expected');}};
  const mocks={'./clients':clients,'@/server/clients':clients,'@/utils/posthog-server':{trackDurableEvent:async()=>true}};
  const checkout=loadSource<{POST(r:Request):Promise<Response>}>('src/app/api/create-checkout-session/route.ts',mocks);
  const request=(body:Row,auth=true)=>new Request('http://localhost/api/test',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{authorization:'Bearer valid'}:{})},body:JSON.stringify(body)});
  const response=await checkout.POST(request({priceId:'price_monthly'}));
  assert.equal(response.status,409);assert.match((await response.json()).error,/internal test Pro/i);
  class StripeFixture {
    customers={retrieve:async()=>{stripeCalls++;throw new Error('No Stripe call expected');}};
    billingPortal={sessions:{create:async()=>{stripeCalls++;throw new Error('No Stripe call expected');}}};
  }
  const portal=loadSource<{POST(r:Request):Promise<Response>}>('src/app/api/create-portal-session/route.ts',{
    ...mocks,stripe:StripeFixture,'@supabase/supabase-js':{createClient:()=>db},
  });
  assert.equal((await portal.POST(request({userId:INTERNAL_TEST_USER},false))).status,401);
  assert.equal((await portal.POST(request({userId:USER_A}))).status,403);
  const result=await portal.POST(request({userId:INTERNAL_TEST_USER}));
  assert.equal(result.status,409);assert.match((await result.json()).error,/no Stripe billing subscription/i);
  assert.equal(stripeCalls,0);
});
