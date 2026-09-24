import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20260924001000_test_provider_binding_tax_readiness.sql',import.meta.url),'utf8');
const expected=[
 ['BASIC','prod_VJULxwnQMyqxRc','price_1UIrMd59e5GrFXdMfnSrKlRA',5900],
 ['PRO','prod_VJUQIPslrlZ8oU','price_1UIrRF59e5GrFXdMIsLU7NJQ',14900],
 ['OFFER_CAPACITY','prod_VJUTVTF7nMLSTC','price_1UIraZ59e5GrFXdMfvHDBObO',1900],
 ['CUSTOMER_CAPACITY','prod_VJUahjCB0v86iL','price_1UIrbj59e5GrFXdMOhTeYaVj',2900],
];

test('only the four read-only verified Sandbox Product/Price pairs are bound',()=>{
 for(const [code,product,price,amount] of expected){
  assert.match(sql,new RegExp(`'${code}',1,'STRIPE','TEST',2,'${product}','${price}'`));
  assert.match(sql,new RegExp(`'EUR','MONTH',${amount},false,'licensed','per_unit'`));
 }
 assert.doesNotMatch(sql,/\('(?:BASIC|PRO|OFFER_CAPACITY|CUSTOMER_CAPACITY)',1,'STRIPE','LIVE',2/);
 assert.match(sql,/binding_status,verification_reference/);
});

test('tax readiness is separate, pending, fail-closed and never an activation grant',()=>{
 assert.match(sql,/create table if not exists public\.billing_tax_readiness_versions/);
 assert.match(sql,/PENDING_CONFIGURATION','VERIFIED','BLOCKED/);
 assert.match(sql,/PENDING_CONFIGURATION','UNSPECIFIED',false/);
 assert.match(sql,/t\.readiness_status is distinct from 'PENDING_CONFIGURATION'/);
 assert.match(sql,/'commercial_activation_allowed',false/);
 assert.match(sql,/'purchase_allowed',false/);
 assert.doesNotMatch(sql,/(?:insert into|update|delete from) public\.(?:branch_subscriptions|restaurants|restaurant_capacity_addon_entitlements|billing_seller_versions)/i);
});

test('private server-only binding resolver rejects LIVE and mismatch inputs',()=>{
 assert.match(sql,/input_environment is distinct from 'TEST'/);
 assert.match(sql,/input_price_id is distinct from b\.price_id/);
 assert.match(sql,/input_amount_minor is distinct from b\.price_amount_minor/);
 assert.match(sql,/input_currency is distinct from b\.price_currency/);
 assert.match(sql,/input_lookup_key is distinct from b\.lookup_key/);
 assert.match(sql,/input_livemode is distinct from false/);
 assert.match(sql,/set search_path=pg_catalog,public,pg_temp/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(sql,/enable row level security/);
});
