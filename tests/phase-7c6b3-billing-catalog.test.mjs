import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { billingCatalogMessages } from '../src/modules/capacity/billingCatalogMessages.mjs';
const sql = readFileSync(new URL('../supabase/migrations/20260922007000_billing_catalog_reconciliation.sql',import.meta.url),'utf8');
test('billing reuses immutable capacity prices, not the historical commercial catalog',()=>{
 assert.match(sql,/references public\.commercial_capacity_plan_versions/);
 assert.match(sql,/references public\.commercial_capacity_addon_versions/);
 assert.doesNotMatch(sql,/public\.commercial_plan_catalog|9900|wuxuai_bonus_pro_monthly/);
 assert.match(sql,/effective_offer_unlimited := false/);
 assert.doesNotMatch(sql,/effective_offer_unlimited := true/);
});
test('private immutable catalog, seller, provider and trial claim contracts',()=>{
 for(const t of ['billing_product_versions','billing_seller_versions','billing_provider_binding_versions','billing_trial_claims']) assert.match(sql,new RegExp('create table if not exists public\\.'+t));
 assert.match(sql,/before update or delete or truncate/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/organization_id uuid primary key/);
 assert.match(sql,/restaurant_id uuid not null unique/);
 assert.doesNotMatch(sql,/insert into public\.billing_trial_claims/);
});
test('pending and commercial access branches preserved; no writes to existing business data',()=>{
 assert.match(sql,/'effective_plan',null/);
 assert.match(sql,/commercial_pro_released and subscription_pro_valid/);
 assert.match(sql,/platform_test_tenant_registry/);
 assert.doesNotMatch(sql,/(?:insert into|update|delete from) public\.(?:restaurants|branch_subscriptions|commercial_pro_access_grants|restaurant_capacity_addon_entitlements)/i);
});
test('provider environments are explicit, unbound and not an activation authority',()=>{
 assert.match(sql,/input_environment not in \('TEST','LIVE'\)/);
 assert.match(sql,/environment=input_environment/);
 assert.match(sql,/'activation_implemented',false/);
 assert.match(sql,/'purchase_allowed',false/);
 assert.match(sql,/price_id is not null/);
 assert.match(sql,/readiness <> 'LIVE_READY'/);
});
test('365 day customer window is separate from UTC calendar-month trial',()=>{
 assert.match(sql,/'customer_window_days',365/);
 assert.match(sql,/at time zone 'UTC'\) \+ interval '1 month'/);
 assert.doesNotMatch(sql,/interval '30 days'/);
 assert.match(sql,/trial_calendar_months=0/);
});
test('all seven catalog translations are complete and use 365, with no purchase UI',()=>{
 for(const language of ['de','en','fr','it','es','zh','ko']){
  const copy=billingCatalogMessages(language);
  assert.equal(Object.keys(copy).length,10);
  assert.ok(Object.values(copy).every(v=>typeof v==='string' && v.length));
  assert.match(copy.window,/365/);
 }
 const ui=readFileSync(new URL('../src/modules/capacity/BillingCatalogInfo.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/<button|\.insert\(|\.update\(|functions\.invoke|checkout\(/);
 assert.match(ui,/rpc\("get_restaurant_billing_catalog"/);
});
