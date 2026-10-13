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
  vm.runInNewContext(transpiled,{exports,URL,Error,require(name){
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

test('TEST_ONLY panel is separate from real BASIC acceptance and appears only in pending setup',()=>{
  assert.match(panel,/Ich starte bewusst genau einen isolierten Stripe-TEST-Checkout/);
  assert.match(panel,/if \(!confirmed \|\| !active \|\| busy \|\| inFlight\.current\) return/);
  assert.match(settings,/isPendingActivation\(activeRestaurant\)\s*\? <TestOnlyStripeCheckoutPanel/);
  assert.match(realBilling,/supabase\.functions\.invoke\("billing-basic-test-checkout"/);
  assert.doesNotMatch(realBilling,/test-only-stripe-checkout/);
});
