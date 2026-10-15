import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const service=readFileSync(new URL('../src/modules/billing/testOnlyStripeCheckoutService.ts',import.meta.url),'utf8');
const panel=readFileSync(new URL('../src/modules/billing/TestOnlyStripeCheckoutPanel.tsx',import.meta.url),'utf8');
const settings=readFileSync(new URL('../src/modules/admin/pages/SettingsPage.tsx',import.meta.url),'utf8');
const realBilling=readFileSync(new URL('../src/modules/billing/basicBillingService.ts',import.meta.url),'utf8');

function loadService(active=true,response={data:{code:'TEST_ONLY_CHECKOUT_SESSION_CREATED',details:{url:'https://checkout.stripe.com/c/pay/synthetic'}},error:null}){
  const calls=[];
  const transpiled=ts.transpileModule(service,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(transpiled,{exports,URL,Error,Response,require(name){
    if(name==='../../shared/lib/supabase')return {supabase:{functions:{invoke:async(...args)=>{calls.push(args);return response;}}}};
    if(name==='../offers/restaurantOfferService')return {loadTestOnlyBasicRuntime:async()=>({active,receipt_id:active?'synthetic-receipt':null})};
    throw Error('UNEXPECTED_IMPORT');
  }});
  return {open:exports.openIsolatedTestOnlyStripeCheckout,calls};
}

test('explicit TEST_ONLY Owner invocation calls only isolated Edge function',async()=>{
  const {open,calls}=loadService();
  assert.equal(await open('restaurant-synthetic','request-synthetic'),'https://checkout.stripe.com/c/pay/synthetic');
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'test-only-stripe-checkout');
  assert.equal(calls[0][1].body.restaurant_id,'restaurant-synthetic');
  assert.equal(calls[0][1].body.request_id,'request-synthetic');
  assert.equal(calls[0][1].body.return_route,'/admin/settings/konto-testphase');
  assert.doesNotMatch(service,/billing-basic-test-checkout|accept_basic_paid_offer|accept_basic_paid_reactivation/);
});

test('closed TEST_ONLY grant, failed Edge response and foreign redirect fail closed',async()=>{
  const closed=loadService(false);
  await assert.rejects(closed.open('restaurant-synthetic','request-synthetic'),/TEST_ONLY_ACCESS_CLOSED/);
  assert.equal(closed.calls.length,0);
  for(const response of [
    {data:{code:'BASIC_TEST_CHECKOUT_CREATED',details:{url:'https://checkout.stripe.com/c/pay/synthetic'}},error:null},
    {data:null,error:new Error('denied')},
    {data:{code:'TEST_ONLY_CHECKOUT_SESSION_CREATED',details:{url:'https://checkout.stripe.com.evil.invalid/steal'}},error:null},
  ]){
    const fixture=loadService(true,response);
    await assert.rejects(fixture.open('restaurant-synthetic','request-synthetic'),/TEST_ONLY_CHECKOUT_(FAILED|URL_INVALID)/);
  }
});

test('only fixed sanitized Edge subcodes reach the Owner UI contract',async()=>{
  const exposed=[
    'PROJECT_BINDING_REQUIRED','METHOD_NOT_ALLOWED','TEST_ONLY_CHECKOUT_ORIGIN_DENIED',
    'TEST_ONLY_CHECKOUT_DISABLED','AUTH_REQUIRED','PROJECT_SESSION_REQUIRED',
    'TEST_ONLY_CHECKOUT_REQUEST_INVALID','TEST_ONLY_STRIPE_ACCOUNT_READBACK_FAILED',
    'TEST_ONLY_STRIPE_ACCOUNT_BINDING_INVALID','TEST_ONLY_CHECKOUT_OWNER_REQUIRED',
    'TEST_ONLY_CHECKOUT_ACCESS_DENIED','TEST_ONLY_CHECKOUT_REPLAY_CONFLICT',
    'TEST_ONLY_CHECKOUT_PREPARE_FAILED','TEST_ONLY_CHECKOUT_PREPARATION_INVALID',
    'TEST_ONLY_CHECKOUT_PROVIDER_FAILED','TEST_ONLY_CHECKOUT_PROVIDER_READBACK_INVALID',
    'TEST_ONLY_CHECKOUT_BIND_FAILED',
  ];
  for(const code of exposed){
    const error=Object.assign(new Error('Edge Function returned a non-2xx status code'),{
      context:new Response(JSON.stringify({code,details:{internal:'must-not-be-forwarded'}}),{
        status:409,headers:{'content-type':'application/json'}}),
    });
    const fixture=loadService(true,{data:null,error});
    await assert.rejects(fixture.open('restaurant-synthetic','request-synthetic'),
      value=>value?.name==='TestOnlyStripeCheckoutError'&&value?.code===code&&value?.message===code);
  }

  for(const payload of [
    {code:'TEST_ONLY_CHECKOUT_RAW_DATABASE_MESSAGE'},
    {code:'sk_test_must_never_surface'},
    {message:'internal stack and personal data'},
    null,
  ]){
    const error=Object.assign(new Error('private internal error'),{
      context:new Response(payload===null?'not-json':JSON.stringify(payload),{
        status:500,headers:{'content-type':payload===null?'text/plain':'application/json'}}),
    });
    const fixture=loadService(true,{data:null,error});
    await assert.rejects(fixture.open('restaurant-synthetic','request-synthetic'),
      value=>value?.code==='TEST_ONLY_CHECKOUT_FAILED'&&!String(value?.message).includes('private'));
  }
});

test('TEST_ONLY panel is separate from real BASIC acceptance and appears only in pending setup',()=>{
  assert.match(panel,/Ich starte bewusst genau einen isolierten Stripe-TEST-Checkout/);
  assert.match(panel,/Diagnosecode: \$\{code\}/);
  assert.match(panel,/instanceof TestOnlyStripeCheckoutError/);
  assert.match(panel,/if \(!confirmed \|\| !active \|\| busy \|\| inFlight\.current\) return/);
  assert.match(settings,/isPendingActivation\(activeRestaurant\)\s*\? <TestOnlyStripeCheckoutPanel/);
  assert.match(realBilling,/supabase\.functions\.invoke\("billing-basic-test-checkout"/);
  assert.doesNotMatch(realBilling,/test-only-stripe-checkout/);
});
