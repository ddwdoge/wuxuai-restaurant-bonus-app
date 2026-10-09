import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import * as bindingModule from '../supabase/functions/_shared/projectBinding.mjs';
import * as deliveryModule from '../supabase/functions/_shared/offerEmailConfirmationDelivery.mjs';

const ref='a'.repeat(20), origin='https://new-app.example.invalid';
const binding={binding_id:'synthetic-binding',project_ref:ref,backend_url:`https://${ref}.supabase.co`,
  auth_issuer:`https://${ref}.supabase.co/auth/v1`,app_origin:origin};
const defaults={SUPABASE_URL:binding.backend_url,SUPABASE_SERVICE_ROLE_KEY:'local-adapter',
  WUXUAI_PROJECT_REF:ref,WUXUAI_AUTH_ISSUER:binding.auth_issuer,WUXUAI_APP_ORIGIN:origin,
  DENO_DEPLOYMENT_ID:`${ref}_00000000-0000-4000-8000-000000000000_1`,
  OFFER_EMAIL_CONFIRMATION_MODE:'enabled',OFFER_EMAIL_CONFIRMATION_SCHEDULER_SECRET:'local-adapter',
  SMTP_HOST:'capture.invalid',SMTP_PORT:'587',SMTP_USERNAME:'capture',SMTP_PASSWORD:'local-adapter',
  SMTP_FROM_EMAIL:'confirmation@example.invalid',SMTP_REPLY_TO:'reply@example.invalid'};

function worker({env={},registry=()=>binding,begin=true}={}) {
  let handler,claimed=false; const calls=[],messages=[];
  const service={rpc:async name=>{
    calls.push(name);
    if(name==='get_server_project_binding')return {data:registry(),error:null};
    if(name==='claim_customer_offer_email_confirmation_delivery') {
      if(claimed)return {data:{claimed:false}}; claimed=true;
      return {data:{claimed:true,request_id:'request',claim_id:'claim',token:'a'.repeat(64),email:'customer@example.invalid'}};
    }
    if(name==='begin_customer_offer_email_confirmation_delivery')return {data:{authorized:begin}};
    if(name==='complete_customer_offer_email_confirmation_delivery')return {data:true};
    throw Error('UNEXPECTED_RPC');
  }};
  const modules={'npm:@supabase/supabase-js@2.50.3':{createClient:()=>service},
    'npm:nodemailer@6.9.16':{default:{createTransport:()=>({sendMail:async message=>{
      messages.push(message);return {accepted:[message.to]};}})}},
    '../_shared/projectBinding.mjs':bindingModule,'../_shared/offerEmailConfirmationDelivery.mjs':deliveryModule};
  const source=readFileSync(new URL('../supabase/functions/customer-offer-email-confirmation-dispatch/index.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
    exports:{},require:key=>{assert.ok(modules[key]);return modules[key];},
    Deno:{env:{get:key=>({...defaults,...env})[key]},serve:fn=>{handler=fn;}},
    Response,Request,URL,TextEncoder,Uint8Array,crypto:webcrypto,
  });
  return {calls,messages,invoke:()=>handler(new Request('https://worker.example.invalid/?app_origin=https://evil.invalid',{
    method:'POST',headers:{'x-wuxuai-offer-confirmation-secret':'local-adapter',origin:'https://evil.invalid'},
    body:JSON.stringify({app_origin:'https://evil.invalid',APP_BASE_URL:'https://evil.invalid'})}))};
}

test('link uses only the installed origin; request and legacy environment cannot redirect it',async()=>{
  const w=worker({env:{APP_BASE_URL:'https://staging-app.bonus.wuxuaisbi.com'}});
  const replies=await Promise.all(Array.from({length:6},()=>w.invoke()));
  assert.ok(replies.every(r=>r.status===200));assert.equal(w.messages.length,1);
  const link=new URL(w.messages[0].text.match(/https:\/\/\S+/)[0]);
  assert.equal(link.origin,origin);assert.equal(link.pathname,'/customer/email/confirm');
  assert.equal(link.searchParams.get('code'),'a'.repeat(64));
  assert.ok(w.calls.indexOf('get_server_project_binding')<w.calls.indexOf('claim_customer_offer_email_confirmation_delivery'));
});
for(const [label,options] of [
  ['missing binding',{registry:()=>null}],
  ['wrong issuer',{env:{WUXUAI_AUTH_ISSUER:'https://other.example.invalid/auth/v1'}}],
  ['wrong project',{env:{WUXUAI_PROJECT_REF:'b'.repeat(20)}}],
  ['foreign origin',{env:{WUXUAI_APP_ORIGIN:'https://foreign.example.invalid'}}],
  ['old staging origin',{env:{WUXUAI_APP_ORIGIN:'https://staging-app.bonus.wuxuaisbi.com'}}],
  ['wrong deployment',{env:{DENO_DEPLOYMENT_ID:`${'b'.repeat(20)}_00000000-0000-4000-8000-000000000000_1`}}],
  ['missing deployment',{env:{DENO_DEPLOYMENT_ID:undefined}}],
])test(`${label} blocks before claim and SMTP`,async()=>{
  const w=worker(options);const r=await w.invoke();assert.equal(r.status,503);
  assert.equal((await r.json()).error,'PROJECT_BINDING_REQUIRED');
  assert.equal(w.messages.length,0);assert.ok(!w.calls.some(x=>x.startsWith('claim_')));
});
test('binding changed between claim and final recheck prevents handoff',async()=>{
  let reads=0;const w=worker({registry:()=>++reads===1?binding:{...binding,binding_id:'different'}});
  assert.equal((await w.invoke()).status,200);assert.equal(w.messages.length,0);
  assert.ok(!w.calls.includes('begin_customer_offer_email_confirmation_delivery'));
});
test('unchanged consent/revocation final gate still prevents handoff',async()=>{
  const w=worker({begin:false});assert.equal((await w.invoke()).status,200);assert.equal(w.messages.length,0);
});
