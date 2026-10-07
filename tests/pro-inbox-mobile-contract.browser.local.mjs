// Actual CustomerPortal and services; controlled read-model responses, NOT DB E2E.
// No real identity, token, network provider or entitlement is created.
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { customerPresentationText } from '../src/modules/customer/customerRewardPresentation.mjs';
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium, webkit } = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const root = fileURLToPath(new URL('..', import.meta.url));
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {BrowserRouter,useLocation} from 'react-router-dom';
import {I18nProvider} from '/src/shared/i18n/I18nProvider';
import {CustomerPortal} from '/src/modules/customer/CustomerPortal';
import '/src/styles.css';import '/src/shared/ui/ui-system.css';
function App(){const l=useLocation();return <CustomerPortal restaurantSlug={l.pathname.split('/').pop()} isBonusCollection={false}/>}
createRoot(document.getElementById('root')).render(<BrowserRouter><I18nProvider><App/></I18nProvider></BrowserRouter>);`;
const server = await createServer({root, configFile:false, plugins:[{
  name:'inbox-synthetic-read-model',enforce:'pre',
  resolveId(id){if(id==='/inbox-test.tsx')return '\0inbox-test.tsx';},
  async load(id){if(id==='\0inbox-test.tsx')return (await transformWithEsbuild(entry,'inbox-test.tsx',{loader:'tsx',jsx:'automatic'})).code;},
  transform(_code,id){
    if(id.endsWith('/auth/AuthProvider.tsx'))return `import {useState,useEffect} from 'react';export const useAuth=()=>{const [id,setId]=useState('synthetic-customer');useEffect(()=>{const listener=e=>setId(e.detail);window.addEventListener('synthetic-identity',listener);return()=>window.removeEventListener('synthetic-identity',listener);},[]);window.syntheticIdentity=id;return {user:{id},portalAccess:{customer:true},signOut(){throw Error('unexpected signout')}};};`;
    if(id.endsWith('/shared/lib/supabase.ts'))return `export const isSupabaseConfigured=true,liveDataUnavailableMessage='unavailable';export const supabase={rpc:async(name,args)=>{try{const r=await fetch('/test-rpc',{method:'POST',body:JSON.stringify({name,args,identity:window.syntheticIdentity})});return await r.json();}catch{return {data:null,error:{message:'synthetic transport interrupted'}};}}};`;
  },
  configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/inbox/'))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/inbox-test.tsx"></script></body></html>'));});},
},react()],server:{host:'127.0.0.1',port:0},logLevel:'error'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let cases=0;
try{
 await server.listen();const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
 for(const [engineName,engine] of Object.entries({chromium,webkit})){
  const browser=await engine.launch({headless:true});
  try{for(const width of (process.env.INBOX_FOCUSED==='1'?[320]:[320,390,430]))for(const language of (process.env.INBOX_FOCUSED==='1'?['de']:['de','en','fr','it','es','zh','ko'])){
   const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'});
   const errors=[],unexpected=[];let mode='normal',markError=false,markCalls=0,loadDelay=0,legalDelay=0;
   const read=new Set();const requests=[];
   const inbox=()=>({available:!['basic','revoked','expired'].includes(mode),legal_mode:'SYNTHETIC_TEST_ONLY_ONLY',
    unread_count:mode==='empty'?0:2-read.size,items:mode==='empty'?[]:['OFFER_PUBLISHED','POINT_REWARD_AVAILABLE'].map((event_type,i)=>({id:String(i),event_type,title:i?'Synthetic Reward':'Synthetic Offer '+ 'A'.repeat(90),created_at:'2026-10-08T08:00:00Z',read_at:read.has(String(i))?'2026-10-08T09:00:00Z':null}))});
   await context.addInitScript(lang=>{localStorage.setItem('wuxuai.ui-language',lang);for(const s of ['a','b','c'])localStorage.setItem('wuxuai-customer-token:synthetic-'+s,'synthetic-'+s+'-not-secret');},language);
   await context.route('**/*',async route=>{
    const req=route.request();if(!req.url().startsWith(origin+'/')){unexpected.push('external request');return route.abort();}
    if(new URL(req.url()).pathname!=='/test-rpc'){if(!['GET','HEAD'].includes(req.method()))unexpected.push('unexpected write');return route.continue();}
    const {name,args,identity}=req.postDataJSON();requests.push(name);let data=null,error=null;
    const slug=args?.input_restaurant_slug;
    switch(name){
     case 'get_public_customer_portal':data={restaurant:{name:'TEST ONLY',slug,status:'active'},branding:{},settings:{loyalty_mode:'amount_based',amount_per_point:1,stamps_required:10},customer:{name:'Synthetic',customer_code:slug,points_balance:62,stamp_balance:0},offers:[]};break;
     case 'get_customer_gift_metadata':case 'get_public_restaurant_offers':data=[];break;
     case 'get_public_points_collection_mode':data='restaurant_controlled';break;
     case 'get_customer_retention_status':data={reminders:[],birthday:{eligible:false,gift:null},referral:{successful_referrals:0,active_until:null},push:{subscribed:false}};break;
     case 'get_customer_identity_summary':data={phone_masked:null,birthday_masked:null};break;
     case 'get_customer_referral_invite_status':data={available:false};break;
     case 'get_public_legal_center':data={documents:[],consents:[],restaurant:{name:'TEST ONLY'},acceptance_required:false};if(slug==='synthetic-a')await delay(legalDelay);break;
     case 'get_public_at_legal_bundle_identity':data={available:false};break;
     case 'get_customer_gift_presentation':case 'get_customer_points_presentation':case 'get_secure_redemption_status':data={active:false};break;
     case 'get_customer_pro_in_app_inbox':data=slug==='synthetic-b'||identity!=='synthetic-customer'||args.input_customer_token==='synthetic-denied'?{available:false,items:[],unread_count:0}:inbox();if(mode==='error')error={message:'synthetic unavailable'};await delay(loadDelay);break;
     case 'mark_customer_pro_in_app_notification_read':markCalls++;await delay(120);if(markError)error={message:'synthetic mark failure'};else read.add(args.input_notification_id);data=inbox();break;
     default:unexpected.push(name);error={message:'unexpected RPC'};
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data,error})});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   const trigger=page.locator('.customer-pro-inbox-trigger'),dialog=page.getByRole('dialog');
   const load=async()=>{await page.goto(origin+'/inbox/synthetic-a');try{await trigger.waitFor({timeout:10000});}catch(e){console.log({errors,unexpected,requests,body:(await page.locator('body').innerText()).slice(0,500)});throw e;}};
   const open=async()=>{await trigger.focus();await page.keyboard.press('Enter');await dialog.waitFor();await page.waitForFunction(()=>document.querySelector('[role=dialog]')?.contains(document.activeElement));};
   const fit=async()=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert.ok(await dialog.evaluate(el=>getComputedStyle(el).getPropertyValue('--premium-primary').trim()),'portalled Inbox must retain Customer design tokens');};
   await load();assert.equal(await trigger.getAttribute('aria-label'),customerPresentationText('inboxOpen',language,{count:2}));
   await open();assert.equal(await dialog.locator('article').count(),2);await fit();
   if(process.env.INBOX_SCREENSHOTS&&width===320&&language==='de'){await mkdir(process.env.INBOX_SCREENSHOTS,{recursive:true});await delay(300);console.log({engine:engineName,drawer:await dialog.evaluate(el=>({background:getComputedStyle(el).backgroundColor,opacity:getComputedStyle(el).opacity}))});await page.screenshot({path:process.env.INBOX_SCREENSHOTS+'/'+engineName+'-320-inbox.png',animations:'disabled'});}
   assert.ok((await dialog.innerText()).includes(customerPresentationText('inboxOffer',language)));
   assert.ok((await dialog.innerText()).includes(customerPresentationText('inboxReward',language)));
   await page.keyboard.press('Shift+Tab');assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
   markError=true;await dialog.locator('article button').first().evaluate(b=>{b.click();b.click();});
   await page.locator('.customer-pro-inbox-error').waitFor();assert.equal(markCalls,1);assert.equal(read.size,0);assert.equal(await trigger.count(),0);
   markError=false;await page.locator('.customer-pro-inbox-error button').click();await open();
   await dialog.locator('article button').first().click();await page.waitForFunction(()=>document.querySelectorAll('article.is-read').length===1);
   await page.keyboard.press('Escape');assert.ok(await trigger.evaluate(el=>document.activeElement===el));
   await page.reload();await trigger.waitFor();assert.equal(await trigger.getAttribute('aria-label'),customerPresentationText('inboxOpen',language,{count:1}));
   mode='empty';await page.reload();await open();assert.equal(await dialog.locator('article').count(),0);assert.ok((await dialog.innerText()).includes(customerPresentationText('inboxEmpty',language)));await fit();
   mode='error';await page.reload();await page.locator('.customer-pro-inbox-error').waitFor();assert.equal(await trigger.count(),0);
   mode='normal';loadDelay=350;await page.locator('.customer-pro-inbox-error button').click();await page.locator('.customer-pro-inbox-state[role=status]').waitFor();assert.equal(await trigger.count(),0);await trigger.waitFor();loadDelay=0;
   for(mode of ['basic','revoked','expired']){await page.reload();await page.locator('#customer-home-title').waitFor();await delay(120);assert.equal(await trigger.count(),0);assert.equal(await dialog.count(),0);}
   mode='normal';await load();loadDelay=350;await page.reload();await page.locator('.customer-pro-inbox-state[role=status]').waitFor();
   await page.evaluate(()=>{history.pushState({},'','/inbox/synthetic-b');dispatchEvent(new PopStateEvent('popstate'));});
   await delay(600);assert.equal(await trigger.count(),0);assert.equal(await dialog.count(),0);
   if(width===320&&language==='de'){
    // An old legal read finishing after a tenant switch must not invalidate
    // the newer tenant's completed Inbox load.
    loadDelay=0;legalDelay=800;
    const oldLegal=page.waitForRequest(r=>r.url().endsWith('/test-rpc')&&r.postDataJSON()?.name==='get_public_legal_center');
    await page.goto(origin+'/inbox/synthetic-a');await oldLegal;
    await page.evaluate(()=>{history.pushState({},'','/inbox/synthetic-c');dispatchEvent(new PopStateEvent('popstate'));});
    await trigger.waitFor();await delay(1100);
    assert.equal(await trigger.count(),1,engineName+' late old legal response must preserve new Inbox');
    await open();assert.equal(await dialog.locator('article').count(),2);await page.keyboard.press('Escape');
    loadDelay=300;
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('synthetic-identity',{detail:'synthetic-foreign'})));
    await delay(500);assert.equal(await trigger.count(),0,engineName+' identity switch hides old Inbox');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('synthetic-identity',{detail:'synthetic-customer'})));
    await trigger.waitFor();loadDelay=0;
    await page.evaluate(()=>{history.pushState({},'','/inbox/synthetic-c?token=synthetic-denied');dispatchEvent(new PopStateEvent('popstate'));});
    await delay(500);assert.equal(await trigger.count(),0,engineName+' token switch hides old Inbox');
   }
   assert.deepEqual(errors,[],engineName+' page errors');assert.deepEqual(unexpected,[],engineName+' unexpected calls');
   assert.equal(markCalls,2);cases++;console.log(JSON.stringify({engine:engineName,width,language,status:'PASS'}));await context.close();
  }}finally{await browser.close();}
  console.log(JSON.stringify({engine:engineName,cumulativeCases:cases,status:'PASS'}));
 }
 console.log(JSON.stringify({status:'PASS',cases,evidence:'UI/service component only; no DB entitlement claim'}));
}finally{await server.close();}
