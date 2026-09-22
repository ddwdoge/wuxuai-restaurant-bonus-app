import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium, webkit } from '/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const sql=input=>execFileSync('docker',['exec','-i','supabase_db_wuxuai-phase7b4d-local','psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const status=JSON.parse(execFileSync('npx',['supabase','status','--output','json'],{encoding:'utf8',stdio:['pipe','pipe','pipe']}));
assert.equal(status.API_URL,'http://127.0.0.1:56121');
assert.equal(sql('select count(*) from supabase_migrations.schema_migrations'),'164');
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const email=`catalog-${randomUUID()}@example.invalid`,password=randomUUID()+randomUUID();
const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
assert.equal(created.error,null);
const signed=await client.auth.signInWithPassword({email,password});
assert.equal(signed.error,null);
const owner=created.data.user.id;
const writeOnly=process.env.PHASE7C6B3_WRITE_ONLY==='1';
const tenant=writeOnly?randomUUID():'7c500000-0000-4000-8000-000000000011';
let fixture=readFileSync(new URL('./phase-7c5-owner-capacity-contract.local.sql',import.meta.url),'utf8').split('set local role authenticated;')[0];
fixture=fixture.replace(/insert into auth.users[\s\S]*?;\n/,'').replaceAll('7c500000-0000-4000-8000-000000000001',owner);
if(writeOnly){
 fixture=fixture.replaceAll('7c500000-0000-4000-8000-000000000011',tenant).replaceAll('phase-7c5-local','catalog-'+tenant);
 for(const suffix of ['10','12','13'])fixture=fixture.replaceAll('7c500000-0000-4000-8000-0000000000'+suffix,randomUUID());
}
sql(fixture+`select set_config('request.jwt.claim.sub','${owner}',true);
select public.accept_kassa_separation_acknowledgement('${tenant}','kassa-separation-de-v1','de',gen_random_uuid());
insert into public.loyalty_settings(restaurant_id,loyalty_mode) values('${tenant}','menu_points');
commit;`);
const fingerprint=()=>sql(`create function pg_temp.fp() returns jsonb language plpgsql as $$
declare t record; h text; r jsonb:='{}'; begin
for t in select tablename from pg_tables where schemaname='public' order by tablename loop
execute format('select md5(coalesce(string_agg(to_jsonb(x)::text,chr(10) order by to_jsonb(x)::text),'''')) from public.%I x',t.tablename) into h;
r:=r||jsonb_build_object(t.tablename,h); end loop; return r; end $$; select pg_temp.fp();`);
const before=fingerprint();
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','56126','--strictPort'],{
 env:{...process.env,VITE_SUPABASE_URL:status.API_URL,VITE_SUPABASE_ANON_KEY:status.ANON_KEY},stdio:'ignore'});
console.log('TASK_VITE_STARTED',server.pid);
let browser,checks=0;
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:56126')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const [name,launcher] of (writeOnly?[['chromium',chromium]]:[['chromium',chromium],['webkit',webkit]])){
  browser=await launcher.launch({headless:true});
  const context=await browser.newContext();
  await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await context.addInitScript(({session,tenant})=>{
   localStorage.setItem('sb-127-auth-token',JSON.stringify(session));
   localStorage.setItem(`wuxuai:onboarding-how-it-works-dismissed:${tenant}`,'true');
   if(!localStorage.getItem('wuxuai.ui-language'))localStorage.setItem('wuxuai.ui-language','de');
  },{session:signed.data.session,tenant});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',()=>errors.push('runtime-error'));
  for(const language of (writeOnly?['de']:['de','en','fr','it','es','zh','ko'])){
   const widths=writeOnly?[390]:language==='de'?[320,375,390,430,767,768,1024,1440]:[390,1440];
   for(const width of widths){
    await page.setViewportSize({width,height:900});
    for(const path of ['/admin/settings/tarif-kapazitaet','/admin/settings/konto-testphase']){
     await page.goto('http://127.0.0.1:56126'+path,{waitUntil:'networkidle'});
     await page.evaluate(language=>localStorage.setItem('wuxuai.ui-language',language),language);
     await page.reload({waitUntil:'networkidle'});
     const catalog=page.locator('section.card[data-i18n-skip="true"]');
     await catalog.filter({hasText:'149'}).waitFor();
     const text=await catalog.filter({hasText:'149'}).innerText();
     for(const value of ['BASIC','PRO','149','59','365'])assert.ok(text.includes(value),name+' '+language+' '+value);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} ${language} ${width} overflow`);
     assert.equal(await catalog.filter({hasText:'149'}).locator('button,a[href],input').count(),0,'catalog must not expose a purchase action');
     assert.equal(await page.locator('html').getAttribute('lang'),language);
     checks++;
    }
   }
  }
  assert.deepEqual(errors,[]);
  await browser.close();browser=null;
  console.log('BILLING_BROWSER_PASS',name);
 }
 const after=JSON.parse(fingerprint()),original=JSON.parse(before);
 assert.deepEqual(Object.keys(original).filter(k=>after[k]!==original[k]),[],'Page views must not write public data');
 console.log('BILLING_BROWSER_CHECKS',checks,'PAGE_VIEW_WRITES=0');
} finally {
 if(browser)await browser.close();
 server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));
 await client.auth.signOut();
 console.log('TASK_VITE_STOPPED',server.pid);
}
