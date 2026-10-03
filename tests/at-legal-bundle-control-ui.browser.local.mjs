// Opt-in isolated component harness: synthetic authority, no backend or Auth HTTP.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
assert.equal(process.env.ALLOW_LOCAL_LEGAL_UI_TESTS,'1');
assert.ok(process.env.LEGAL_UI_PLAYWRIGHT_MODULE,'explicit locally installed browser runtime required');
const { chromium, webkit } = require(process.env.LEGAL_UI_PLAYWRIGHT_MODULE);
const root = fileURLToPath(new URL('../',import.meta.url));
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import{PlatformLegalBundleControl}from'./src/modules/platform/PlatformLegalBundleControl';const root=createRoot(document.getElementById('root'));let generation=0;window.__remount=()=>root.render(<PlatformLegalBundleControl key={++generation} restaurantId="71000000-0000-4000-8000-000000000001" canWrite={true}/>);window.__remount();`;
const bundled=await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,write:false,outfile:'synthetic.js',format:'iife',jsx:'automatic',plugins:[{name:'synthetic-authority',setup(plugin){
  plugin.onResolve({filter:/\/AuthProvider$/},()=>({path:'auth',namespace:'synthetic'}));
  plugin.onResolve({filter:/\/lib\/supabase$/},()=>({path:'client',namespace:'synthetic'}));
  plugin.onResolve({filter:/\/I18nProvider$/},()=>({path:'i18n',namespace:'synthetic'}));
  plugin.onLoad({filter:/.*/,namespace:'synthetic'},({path})=>({contents:path==='auth'?`export const useAuth=()=>window.__auth;`:path==='client'?`export const supabase=window.__client;`:`export const useI18n=()=>({translateKey:k=>k});`,loader:'js'}));
}}]});
const js=bundled.outputFiles.find(file=>file.path.endsWith('.js')||file.path==='<stdout>')?.text;
const extraCss=bundled.outputFiles.find(file=>file.path.endsWith('.css'))?.text??readFileSync(new URL('../src/modules/platform/platform-legal-bundle-control.css',import.meta.url),'utf8');
assert.ok(js);
const mock=`
const p=new URLSearchParams(location.search),scenario=p.get('scenario')||'blocked';
const id=n=>'71000000-0000-4000-8000-'+String(n).padStart(12,'0');
const hash='a'.repeat(64),bundle='bundle-'+hash;
window.__calls=[];window.__auth={user:{id:id(5)},platformRole:['customer','owner','manager','staff'].includes(scenario)?scenario:'platform_admin'};
let status=scenario==='blocked'?'BLOCKED':scenario==='withdraw'?'PUBLISHED':scenario==='stale'?'STALE':'READY';
const context=()=>({restaurant_id:id(1),country:'AT',locale:'de-AT',technical_status:scenario==='blocked'?'BLOCKED':'READY',effective_status:status,
 candidate:{bundle_id:bundle,bundle_sha256:hash,country:'AT',locale:'de-AT',technical_status:scenario==='blocked'?'BLOCKED':'READY',terms:{id:id(2),version:'SYNTHETIC-1',sha256:'b'.repeat(64),status:'published'},privacy:{id:id(3),version:'SYNTHETIC-1',sha256:'c'.repeat(64),status:'published'},policy_revision:{revision_id:'1'}},
 snapshot:{bundle_id:bundle,bundle_sha256:hash,effective_status:status,terms:{id:id(2),version:'SYNTHETIC-1',sha256:'b'.repeat(64),status:'published'},privacy:{id:id(3),version:'SYNTHETIC-1',sha256:'c'.repeat(64),status:'published'}},blocking_reasons:scenario==='blocked'?['TERMS_LEGAL_REVIEW_REQUIRED','PRIVACY_LEGAL_REVIEW_REQUIRED','LEGAL_STATUS_BLOCKED','RETENTION_STATUS_BLOCKED']:status==='STALE'?['SNAPSHOT_STALE']:[],allowed_actions:status==='BLOCKED'||status==='STALE'?['snapshot']:status==='PUBLISHED'?['snapshot','withdraw']:['snapshot','publish']});
let stored=null,proof=scenario!=='mfa';
window.__client={auth:{getSession:async()=>({data:{session:{user:scenario==='actorchange'?{id:id(9)}:window.__auth.user}},error:null}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:proof?'aal2':'aal1',currentAuthenticationMethods:proof?[{method:'totp'}]:[]},error:null}),listFactors:async()=>({data:{totp:[{id:id(6),status:'verified'}]},error:null}),challengeAndVerify:async()=>{window.__calls.push({name:'synthetic_recent_totp'});proof=true;if(scenario==='remount')window.__remount();return {error:null};}}},rpc(name,parameters){
 window.__calls.push({name,parameters});
 const promise=(async()=>{
  if(name==='get_platform_at_legal_bundle_control')return {data:context(),error:null};
  if(name==='create_platform_legal_bundle_snapshot'||name==='set_platform_legal_bundle_publication'){
   const action=name==='create_platform_legal_bundle_snapshot'?'snapshot':parameters.input_action;
   stored={operation:action,bundle_id:bundle,bundle_sha256:hash,effective_status:action==='publish'?'PUBLISHED':action==='withdraw'?'WITHDRAWN':status,event_id:id(8)};
   status=stored.effective_status;await new Promise(resolve=>setTimeout(resolve,80));
   if(scenario==='timeout'||scenario==='missing'||scenario==='conflict'||scenario==='unclear')throw new Error('synthetic transport interruption');
   return {data:stored,error:null};
  }
  if(name==='get_platform_legal_bundle_receipt'){
   if(scenario==='missing'||scenario==='actorchange')return {data:{found:false},error:null};
   if(scenario==='unclear')throw new Error('synthetic receipt timeout');
   return {data:{found:true,committed_at:'2026-10-03T00:00:00Z',current_effective_status:status,receipt:scenario==='conflict'?{...stored,bundle_sha256:'f'.repeat(64)}:stored},error:null};
  }
  throw new Error('unexpected RPC');
 })();promise.abortSignal=()=>promise;return promise;
}};`;
const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8')+'\n'+extraCss;
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="de"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><body style="padding:12px"><main id="root"></main><script>${mock}</script><script>${js}</script></body></html>`);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let cases=0;
try {
 for(const [engine,launcher] of [['Chromium',chromium],['WebKit',webkit]]) {
  const browser=await launcher.launch({headless:true});
  try {
   for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:900}]) {
    const page=await browser.newPage({viewport});const errors=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    async function load(scenario){await page.goto(origin+'/?scenario='+scenario);await page.getByRole('heading',{name:'AT Legal-Bundle',exact:true}).waitFor();}
    async function layout(){
     const measure=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>window.innerWidth,targets:[...document.querySelectorAll('.platform-legal-bundle button,.platform-legal-bundle-drawer button,.platform-legal-bundle-drawer select,.platform-legal-bundle-drawer input:not([type=checkbox]),.platform-legal-bundle-choice')].filter(e=>e.offsetParent!==null).map(e=>e.getBoundingClientRect().height)}));
     assert.equal(measure.overflow,false);assert.ok(measure.targets.every(height=>height>=44));
    }
    async function confirm(action){
     await page.getByRole('button',{name:action,exact:true}).click();const drawer=page.getByRole('dialog');await drawer.waitFor();await layout();
     await page.waitForFunction(()=>document.querySelector('[role=dialog]')?.contains(document.activeElement));
     await drawer.getByLabel('Aktueller sechsstelliger Bestätigungscode').fill('123456');
     if(action!=='Bundle-Snapshot erstellen')await drawer.getByLabel('Datensparsame Freigabereferenz').fill('SYNTHETIC_REF');
     if(action==='Bundle veröffentlichen')await drawer.getByRole('checkbox').first().check();
     await drawer.getByRole('checkbox').last().check();
     await drawer.getByRole('button',{name:'Einmalig bestätigen'}).evaluate(button=>{button.click();button.click();});
    }
    await load('blocked');await page.getByText('Die rechtliche Prüfung der Teilnahmebedingungen ist offen; Entwürfe bleiben gesperrt.').waitFor();
    assert.equal(await page.getByRole('button',{name:'Bundle veröffentlichen',exact:true}).isDisabled(),true);await layout();
    await page.getByRole('button',{name:'Bundle-Snapshot erstellen',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog').count(),0);
    assert.equal(await page.getByRole('button',{name:'Bundle-Snapshot erstellen',exact:true}).evaluate(e=>e===document.activeElement),true);
    for(const [scenario,action] of [['snapshot','Bundle-Snapshot erstellen'],['publish','Bundle veröffentlichen'],['withdraw','Veröffentlichung zurückziehen'],['actorchange','Bundle veröffentlichen'],['remount','Bundle veröffentlichen'],['timeout','Bundle veröffentlichen'],['missing','Bundle veröffentlichen'],['conflict','Bundle veröffentlichen'],['unclear','Bundle veröffentlichen']]) {
     await load(scenario);await page.getByRole('button',{name:action,exact:true}).waitFor();await confirm(action);
     const terminal=['missing','actorchange'].includes(scenario)?'Nicht gefunden':scenario==='conflict'?'Widersprüchlicher Beleg':scenario==='unclear'?'Unklarer Ausgang':'Letzter Receipt-Status: Bestätigt';
     await page.getByRole('status').filter({hasText:terminal}).waitFor();
     const calls=await page.evaluate(()=>window.__calls);
     assert.equal(calls.filter(c=>['create_platform_legal_bundle_snapshot','set_platform_legal_bundle_publication'].includes(c.name)).length,scenario==='actorchange'?0:1);
     assert.equal(calls.filter(c=>c.name==='get_platform_legal_bundle_receipt').length,1);
     const mutation=calls.find(c=>['create_platform_legal_bundle_snapshot','set_platform_legal_bundle_publication'].includes(c.name));
     const read=calls.find(c=>c.name==='get_platform_legal_bundle_receipt');if(mutation)assert.equal(read.parameters.input_idempotency_key,mutation.parameters.input_idempotency_key);
     if(['missing','conflict','unclear','actorchange'].includes(scenario)) {
      await page.getByRole('button',{name:'Status erneut prüfen',exact:true}).click();await page.getByText('Technisch vollständig',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Bundle-Snapshot erstellen',exact:true}).isDisabled(),true);
     }
     await layout();cases++;
    }
    for(const role of ['customer','owner','manager','staff']){await load(role);assert.equal(await page.getByRole('button').count(),0);assert.equal((await page.evaluate(()=>window.__calls)).length,0);cases++;}
    await load('mfa');await page.getByText(/Zusätzliche Authentifizierung erforderlich/).waitFor();
    assert.equal((await page.evaluate(()=>window.__calls)).length,0);
    await page.getByLabel('Aktueller sechsstelliger Bestätigungscode').fill('123456');await page.getByRole('button',{name:'Sicherheitsnachweis bestätigen und Status lesen'}).click();await page.getByText('Technisch vollständig',{exact:true}).waitFor();cases++;
    await load('stale');await page.getByText('Veraltet',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Bundle veröffentlichen',exact:true}).isDisabled(),true);cases++;
    assert.deepEqual(errors,[]);await page.close();
   }
  } finally {await browser.close();}
  console.log(engine+' local UI matrix PASS');
 }
 console.log(JSON.stringify({status:'PASS',cases,viewports:['390x844','844x390','1280x900'],engines:2,real_backend_requests:0,cloud_requests:0,console_errors:0}));
} finally {await new Promise(resolve=>server.close(resolve));}
