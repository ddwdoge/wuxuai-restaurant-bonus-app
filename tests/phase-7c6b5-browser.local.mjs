import {execFileSync,spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {chromium,webkit} from '/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {billingReadinessMessages} from '../src/modules/platform/billingReadinessMessages.mjs';
const runtime=process.env.PHASE7C6B5_RUNTIME;
assert.ok(runtime?.startsWith('/private/tmp/wuxuai-7c6b5.'));
const sql=input=>{try{return execFileSync('docker',['exec','-i','supabase_db_wuxuai-phase7b4d-local','psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}catch{throw new Error('Local SQL failed; no auth output logged');}};
const status=JSON.parse(execFileSync('./node_modules/.bin/supabase',['status','--workdir',runtime,'--output','json'],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));
assert.equal(status.API_URL,'http://127.0.0.1:56121');
assert.equal(sql('select count(*) from supabase_migrations.schema_migrations'),'165');
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const email=`readiness-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
if(created.error)throw new Error('Local auth fixture failed');
const actor=created.data.user.id;
let browser,server;
let fixture=readFileSync(new URL('./phase-7c5-owner-capacity-contract.local.sql',import.meta.url),'utf8').split('set local role authenticated;')[0];
fixture=fixture.replace(/insert into auth.users[\s\S]*?;\n/,'').replaceAll('7c500000-0000-4000-8000-000000000001',actor)
 .replaceAll('7c500000','7c65b000').replaceAll('phase-7c5-local','phase-7c6b5-browser');
const tenant='7c65b000-0000-4000-8000-000000000011';
try {
 sql(fixture+`insert into public.platform_admins(user_id,role,active) values('${actor}','platform_owner',true);commit;`);
 const signed=await client.auth.signInWithPassword({email,password});
 if(signed.error)throw new Error('Local sign-in failed');
 const fingerprint=()=>sql(`create function pg_temp.fp() returns jsonb language plpgsql as $$
 declare t record; h text; v jsonb:='{}'; begin for t in select tablename from pg_tables where schemaname='public' order by tablename loop
 execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,chr(10) order by to_jsonb(x)::text),'''')) from public.%I x',t.tablename) into h;
 v:=v||jsonb_build_object(t.tablename,h); end loop; return v; end $$;select pg_temp.fp();`);
 const before=fingerprint();
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','56126','--strictPort'],{
  env:{...process.env,VITE_SUPABASE_URL:status.API_URL,VITE_SUPABASE_ANON_KEY:status.ANON_KEY},stdio:'ignore'});
 console.log('TASK_VITE_STARTED',server.pid);
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:56126')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 let checks=0;
 for(const [name,launcher] of [['chromium',chromium],['webkit',webkit]]){
  browser=await launcher.launch({headless:true});const context=await browser.newContext();
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await context.addInitScript(session=>{localStorage.setItem('sb-127-auth-token',JSON.stringify(session));if(!localStorage.getItem('wuxuai.ui-language'))localStorage.setItem('wuxuai.ui-language','de');},signed.data.session);
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const language of ['de','en','fr','it','es','zh','ko'])for(const width of [320,375,390,430,767,768,1024,1440]){
   await page.setViewportSize({width,height:900});
   await page.goto('http://127.0.0.1:56126/admin/platform/pro',{waitUntil:'networkidle'});
   await page.evaluate(l=>localStorage.setItem('wuxuai.ui-language',l),language);
   await page.reload({waitUntil:'networkidle'});
   const card=page.getByTestId('billing-readiness');
   try { await card.getByText('WUXUAI Digital & Trading GmbH',{exact:true}).waitFor(); }
   catch { console.log('LOCAL_UI_DIAGNOSTIC',new URL(page.url()).pathname,errors,(await page.locator('body').innerText()).replace(/[\w.+-]+@[\w.-]+/g,'[redacted]').slice(0,2200));throw new Error('READINESS_UI_NOT_VISIBLE'); }
   const text=await card.innerText();for(const token of ['59','149','365','PLANNED','UNBOUND','BLOCKED',billingReadinessMessages(language).title])assert.ok(text.includes(token),name+' '+language+' '+token);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}/${language}/${width}: overflow`);
   assert.equal(await card.locator('button:not([disabled])').evaluateAll(es=>es.some(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44;})),false,'touch target');
   assert.equal(await page.locator('html').getAttribute('lang'),language);
   await card.getByRole('button',{name:billingReadinessMessages(language).refresh,exact:true}).click();
   await card.getByText('WUXUAI Digital & Trading GmbH',{exact:true}).waitFor();await page.waitForLoadState('networkidle');checks++;
  }
  await page.evaluate(()=>localStorage.setItem('wuxuai.ui-language','de'));
  await page.goto('http://127.0.0.1:56126/admin/platform/pro',{waitUntil:'networkidle'});
  for(const dismiss of ['cancel','x','escape']){
   await page.locator('.pro-country-grid button').first().click();const dialog=page.getByRole('dialog');await dialog.waitFor();
   assert.equal(await dialog.locator('button.primary').isDisabled(),true);
   if(dismiss==='cancel')await dialog.locator('.app-drawer-footer button.secondary').click();
   else if(dismiss==='x')await dialog.locator('.app-drawer-close').click();else await page.keyboard.press('Escape');
   await dialog.waitFor({state:'hidden'});checks++;
  }
  assert.deepEqual(errors,[]);await browser.close();browser=null;console.log('BROWSER_PASS',name);
 }
 assert.equal(fingerprint(),before,'public page/drawer/reload/locale/resize writes');
 console.log('BROWSER_CHECKS',checks,'PUBLIC_WRITES_0');
} finally {
 if(browser)await browser.close();
 if(server){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r));console.log('TASK_VITE_STOPPED',server.pid);}
 await client.auth.signOut();
 sql(`begin;set local session_replication_role=replica;
 delete from public.branch_subscriptions where branch_id='7c65b000-0000-4000-8000-000000000012';
 delete from public.restaurant_members where restaurant_id='${tenant}';
 delete from public.branches where restaurant_id='${tenant}';
 delete from public.restaurants where id='${tenant}';
 delete from public.organizations where id='7c65b000-0000-4000-8000-000000000010';
 delete from public.platform_admins where user_id='${actor}';commit;`);
 const removed=await admin.auth.admin.deleteUser(actor);if(removed.error)throw new Error('Local auth cleanup failed');
 console.log('SYNTHETIC_BROWSER_FIXTURE_REMOVED');
}
