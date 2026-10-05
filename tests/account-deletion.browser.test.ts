import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';

test('Settings explains deletion unavailability and keeps subscription management working', {
  skip: !existsSync(chromium.executablePath()), timeout: 60_000,
}, async () => {
  const mocks: Record<string, string> = {
    'next/navigation': `export const useRouter=()=>({push:path=>window.fixture.navigation.push(path)});`,
    'next/link': `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
    '@/components/Header': `export default function Header(){return null}`,
    '@/context/AuthContext': `export const useAuth=()=>({user:{id:'fixture-user',email:'fixture@example.test'},subscriptionStatus:{isPremium:true,isTrialing:false,entitlementSource:'stripe'},signOut:async()=>{window.fixture.signOuts++},refreshSubscriptionStatus:async()=>{}});`,
    '@/services/subscriptionManager': `export const TRIAL_SESSION_LIMIT=3;`,
    '@/services/supabase': `export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'fixture-token'}},error:null})},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null})};return q}};`,
    '@/utils/api': `export const apiFetch=async(url,options)=>{window.fixture.requests.push({url,method:options.method});return Response.json({url:'http://pitcht-fixture.test/settings#billing'})};`,
    sonner: `export const toast={error:message=>window.fixture.messages.push(message),success:message=>window.fixture.messages.push(message)};`,
  };
  const built = await build({
    write: false, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';import Settings from './src/app/settings/page';
      window.fixture={requests:[],messages:[],navigation:[],signOuts:0};
      createRoot(document.getElementById('root')).render(<Settings/>);
    ` },
    plugins: [{ name: 'offline-settings', setup(plugin) {
      plugin.onResolve({ filter: /.*/ }, args => Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: process.cwd() }));
    } }],
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // No live application, Supabase, Stripe, or other provider is contacted.
    await page.route('**/*', route => route.request().isNavigationRequest()
      ? route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }) : route.abort());
    await page.goto('http://pitcht-fixture.test/settings');
    await page.addScriptTag({ content: 'window.__name=value=>value;' + built.outputFiles[0].text });
    await page.getByText(/Account deletion is temporarily unavailable/).waitFor();
    assert.equal(await page.getByRole('button', { name: /Delete My Account|Delete Forever/ }).count(), 0);
    assert.equal(await page.getByPlaceholder('DELETE', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Your account has been permanently deleted.', { exact: true }).count(), 0);
    const billing = page.getByRole('button', { name: 'Manage Subscription & Billing' });
    assert.equal(await billing.isEnabled(), true);
    await billing.click();
    await page.waitForURL('http://pitcht-fixture.test/settings#billing');
    // A same-document portal URL retains the fixture while exercising navigation.
    const state = await page.evaluate(() => (window as unknown as { fixture: {
      requests: Array<{ url: string; method: string }>; messages: string[]; signOuts: number;
    } }).fixture);
    assert.deepEqual(state.requests, [{ url: '/api/create-portal-session', method: 'POST' }]);
    assert.deepEqual(state.messages, []);
    assert.equal(state.signOuts, 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
