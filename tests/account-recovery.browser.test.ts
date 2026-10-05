import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { USER_A, USER_B, SESSION, RECORDING, QUESTION } from './module-loader';

// Actual React providers, History card/detail and analysis page; only SDK/router
// boundaries are synthetic. Every browser request is intercepted or denied.
async function bundle() {
  const mocks: Record<string, string> = {
    'next/navigation': `export const useRouter=()=>window.fixture.router; export const useSearchParams=()=>new URLSearchParams(location.search);`,
    'next/link': `import React from 'react'; export default function Link({href,children,...props}){return <a {...props} href={href} onClick={e=>{e.preventDefault();window.fixture.router.push(href)}}>{children}</a>}`,
    '@/services/supabase': `export const supabase={storage:{from:()=>({createSignedUrl:async path=>{window.fixture.media.push(path);return {data:{signedUrl:'data:video/webm;base64,'},error:null}}})},auth:{getSession:async()=>({data:{session:window.fixture.session}}),onAuthStateChange:cb=>{window.fixture.auth=cb;queueMicrotask(()=>cb('INITIAL_SESSION',window.fixture.session));return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>{window.fixture.emit(null);return {error:null}}},from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>({data:[],error:null})};return q}};`,
    '@/services/signupNotification': `export const notifyNewSignup=async()=>{};`,
    '@/services/subscriptionManager': `export const canUserStartSession=async id=>window.fixture.access(id);`,
    '@/services/sessionManager': `export const getSessionDetails=async()=>structuredClone(window.fixture.details);export const getVideoUrl=async path=>{window.fixture.media.push(path);return 'data:video/webm;base64,'};export const saveAnalysis=async()=>{};export const createSession=async()=>{throw Error('Unexpected session creation')};export const saveRecording=async()=>{throw Error('Unexpected upload')};export const deleteSession=async()=>{};`,
    '@/utils/api': `export const apiFetch=async (url,options)=>{window.fixture.requests.push({url,id:options.body instanceof FormData?options.body.get('recordingId'):JSON.parse(options.body).recordingId});return Response.json(url.includes('transcribe')?{transcript:'My recovered synthetic answer.',duration:10}:{overallScore:80,summary:'Recovery complete.',strengths:[],improvements:[],nextSteps:[],metrics:{wordsPerMinute:20,fillerWordCount:0,clarityScore:80,pacingScore:80,totalWords:4},generatedAt:new Date().toISOString()})};`,
    '@/utils/audioRecovery': `export const extractRecordingAudio=async source=>{await source();return new Blob(['synthetic audio'],{type:'audio/webm'})};`,
    '@/utils/analytics': `export const resetUser=()=>window.fixture.analytics.push(['reset']);export const identifyUser=id=>window.fixture.analytics.push(['identify',id]);export const trackEvent=()=>{};export const AnalyticsEvents={};`,
    sonner: `export const toast={error:message=>window.fixture.messages.push(message),info(){}};`,
    '@sentry/nextjs': `export const addBreadcrumb=()=>{};export const captureException=()=>{};`,
  };
  const result = await build({ write: false, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_DIAGNOSIS_CALLOUT': '"true"' },
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
      import {AuthProvider,useAuth} from './src/context/AuthContext';import {InterviewProvider,useInterview} from './src/context/InterviewContext';
      import SessionCard from './src/components/SessionCard';import Details from './src/app/session/[id]/page';import Analysis from './src/app/analysis/page';
      const A='${USER_A}',B='${USER_B}',S='${SESSION}',R='${RECORDING}',Q='${QUESTION}';
      const access={allowed:true,isPremium:false,isTrialing:false,trialEndsAt:null,sessionsThisMonth:0};
      const f=window.fixture={session:{user:{id:A}},requests:[],media:[],analytics:[],messages:[],access:async()=>access,
        emit(user){f.session=user?{user}:null;f.auth(user?'SIGNED_IN':'SIGNED_OUT',f.session)},
        router:{push(path){history.pushState({},'',path);window.dispatchEvent(new Event('popstate'))},replace(path){f.router.push(path)}},
        details:{id:S,user_id:A,session_type:'job-interview',context:'Owned synthetic context',created_at:new Date().toISOString(),status:'completed',
          questions:[{id:'q-first',question_text:'First answer',position:0},{id:Q,question_text:'Failed second answer',position:1}],
          recordings:[{id:'first',question_id:'q-first',video_url:A+'/first.webm',duration:10,transcript:null,analyses:[]},{id:R,question_id:Q,video_url:A+'/second.webm',duration:10,transcript:null,analyses:[]}]}};
      const params=Promise.resolve({id:S});
      function View(){const auth=useAuth(),interview=useInterview();const [path,setPath]=useState(location.pathname);
        React.useEffect(()=>{const listener=()=>setPath(location.pathname+location.search);window.addEventListener('popstate',listener);return()=>window.removeEventListener('popstate',listener)},[]);
        f.seed=()=>{interview.setSessionContext('A private context');interview.addRecording({questionId:Q,questionText:'Private A question',transcript:'A private transcript',videoPath:'',timestamp:1})};
        f.unsaved=()=>interview.addRecording({questionId:Q,questionText:'Unsaved',videoPath:'',timestamp:2,videoBlob:new Blob(['capture']),saveCheckpoint:{captureId:R}});
        f.discard=()=>interview.discardUnsavedRecording(R);f.logout=()=>auth.signOut();f.refresh=()=>auth.refreshSubscriptionStatus();
        return <><pre data-testid="state">{JSON.stringify({owner:auth.user?.id,context:interview.sessionContext,recordings:interview.recordings,premium:auth.subscriptionStatus.isPremium})}</pre>
        {path.startsWith('/session/')?<Details params={params}/>:path.startsWith('/analysis')?<Analysis/>:<SessionCard session={{...f.details,questions:[{count:2}],recordings:[{count:2}],completed_at:null}} onDelete={()=>{}}/>}</>}
      createRoot(document.getElementById('root')).render(<AuthProvider><InterviewProvider><React.Suspense fallback="Loading"><View/></React.Suspense></InterviewProvider></AuthProvider>);
    ` }, plugins: [{ name: 'offline-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: process.cwd() }));
    } }],
  });
  return result.outputFiles[0].text;
}

test('History recovery reaches the exact saved answer; account switches reset private React/browser/analytics state and fence late entitlement responses', { skip: !existsSync(chromium.executablePath()), timeout: 60_000 }, async () => {
  const source = await bundle(); const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage(); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.log('Fixture browser:', message.text()); });
    await page.route('**/*', route => route.request().isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
    await page.goto('http://pitcht-fixture.test/history');
    await page.addScriptTag({ content: 'window.__name=value=>value;window.process={env:{}};' + source });
    await page.getByRole('link', { name: /view/i }).click();
    await page.getByRole('button', { name: /Failed second answer/ }).click();
    const recovery = page.getByRole('link', { name: 'Recover this answer' });
    assert.equal(await recovery.getAttribute('href'), `/analysis?sessionId=${SESSION}&recordingId=${RECORDING}`);
    await recovery.click();
    await page.getByRole('button', { name: 'Retry Transcription' }).click();
    try { await page.getByText('Recovery complete.', { exact: true }).first().waitFor({ timeout: 5000 }); }
    catch(error) { console.log(await page.locator('body').innerText()); console.log(errors); throw error; }
    const requests = await page.evaluate(() => (window as unknown as { fixture: { requests: Array<{url: string;id: string}> } }).fixture.requests);
    assert.ok(requests.some(request => request.url.includes('transcribe')));
    assert.ok(requests.every(request => request.id === RECORDING));

    // Shared-browser state and asynchronous entitlement test uses the actual providers.
    await page.evaluate(() => { const f = (window as unknown as { fixture: { router: {push(s:string):void};seed():void } }).fixture; f.router.push('/history'); f.seed(); });
    await page.waitForFunction(() => localStorage.getItem('pitcht_recovery:11111111-1111-4111-8111-111111111111')?.includes('A private transcript'));
    const blocked = await page.evaluate(async () => {
      const f = (window as unknown as { fixture: { unsaved():void;logout():Promise<void> } }).fixture;
      f.unsaved(); await new Promise(resolve => setTimeout(resolve, 25));
      try { await f.logout(); return false; } catch { return true; }
    });
    assert.equal(blocked, true);
    await page.evaluate(() => {
      const f = (window as unknown as { fixture: { access: unknown;late?:unknown; refresh():Promise<void>;emit(user:{id:string}):void;discard():void } }).fixture;
      f.discard(); f.access=()=>new Promise(resolve=>{f.late=resolve}); void f.refresh(); f.access=async()=>({allowed:true,isPremium:false,isTrialing:false,trialEndsAt:null,sessionsThisMonth:0}); f.emit({id:'22222222-2222-4222-8222-222222222222'});
    });
    await page.waitForFunction(() => document.querySelector('[data-testid=state]')?.textContent?.includes('22222222-2222-4222-8222-222222222222'));
    const privacy = await page.evaluate(() => ({ state: document.querySelector('[data-testid=state]')!.textContent!, a: localStorage.getItem('pitcht_recovery:11111111-1111-4111-8111-111111111111'), analytics: (window as unknown as {fixture:{analytics:unknown[]}}).fixture.analytics }));
    assert.doesNotMatch(privacy.state, /A private|Private A|Unsaved/); assert.equal(privacy.a, null);
    assert.deepEqual(privacy.analytics.slice(-2), [['reset'], ['identify', USER_B]]);
    await page.evaluate(() => (window as unknown as {fixture:{router:{push(path:string):void}}}).fixture.router.push('/session/44444444-4444-4444-8444-444444444444'));
    await page.getByText('Session not found', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Recover this answer' }).count(), 0);
    assert.equal(await page.evaluate(() => (window as unknown as {fixture:{requests:unknown[]}}).fixture.requests.length), requests.length);

    // Trigger a late A request without letting it mark B paid.
    await page.evaluate(() => { const f = (window as unknown as { fixture: { late: (v:unknown)=>void } }).fixture; f.late({allowed:true,isPremium:true,isTrialing:false,trialEndsAt:null,sessionsThisMonth:9}); });
    // Verify after React has processed promise continuations.
    await page.waitForTimeout(50);
    assert.equal(JSON.parse(await page.getByTestId('state').textContent() ?? '{}').premium, false);
    await page.evaluate(async () => { await (window as unknown as {fixture:{logout():Promise<void>}}).fixture.logout(); });
    await page.waitForFunction(() => !document.querySelector('[data-testid=state]')?.textContent?.includes('22222222-2222-4222-8222-222222222222'));
    assert.deepEqual(await page.evaluate(() => (window as unknown as {fixture:{analytics:unknown[]}}).fixture.analytics.at(-1)), ['reset']);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key=>key.startsWith('pitcht_recovery:'))), false);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
