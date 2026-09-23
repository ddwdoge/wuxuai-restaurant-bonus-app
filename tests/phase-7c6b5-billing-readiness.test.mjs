import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {billingReadinessMessages} from '../src/modules/platform/billingReadinessMessages.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20260923001000_platform_admin_billing_readiness_reads.sql');
test('existing subscriptions return under canonical row lock before creation authority or INSERT',()=>{
 const helper=sql.split('create or replace function public.ensure_restaurant_branch')[1].split('end $$;')[0];
 assert.match(helper,/where id=input_restaurant_id for update/);
 assert.ok(helper.indexOf('for update')<helper.indexOf('select * into subscription_record'));
 assert.ok(helper.indexOf('return branch_record.id')<helper.indexOf('resolve_branch_creation_lifecycle_internal'));
 assert.match(helper,/subscription_record.organization_id is distinct from restaurant_record.organization_id/);
 assert.match(helper,/'pending_activation','BASIC','pending_activation'/);
 assert.doesNotMatch(helper,/on conflict|session_replication_role|disable trigger|request.jwt/);
});
test('legacy snapshot is sealed even when empty and inaccessible to all API roles',()=>{
 assert.match(sql,/if not exists\(select 1 from public.billing_legacy_seal\)/);
 assert.match(sql,/before insert or update or delete or truncate/);
 assert.match(sql,/revoke all on public.billing_legacy_eligibility, public.billing_legacy_seal from public,anon,authenticated,service_role/);
});
test('trial extension needs the historical running trial and private transaction intent',()=>{
 for(const text of ["e.subscription_status='trialing'","s.trial_started_at=e.trial_started_at","s.trial_ends_at>statement_timestamp()","c.transaction_id=txid_current()","c.expected_trial_end=new.trial_ends_at"])
  assert.ok(sql.includes(text),text);
 assert.match(sql,/require_recent_platform_auth_internal/);
});
test('all writers retain new activation and payment restrictions',()=>{
 assert.match(sql,/before insert or update on public.branch_subscriptions/);
 assert.match(sql,/new.payment_status is distinct from old.payment_status/);
 assert.match(sql,/new.stripe_subscription_id is distinct from old.stripe_subscription_id/);
 assert.match(sql,/input_subscription_status not in \('paused','cancelled','unpaid'\)/);
});
test('readiness RPC is stable, role checked, paginated and contains no DML',()=>{
 const rpc=sql.split('create or replace function public.get_platform_billing_readiness')[1].split('end $$;')[0];
 assert.match(rpc,/stable security definer/);
 assert.match(rpc,/platform_owner','platform_admin/);
 assert.match(rpc,/limit 50 offset input_offset/);
 assert.doesNotMatch(rpc,/\b(insert into|update public|delete from)\b/i);
 assert.doesNotMatch(rpc,/stripe_customer_id|stripe_subscription_id|owner_id|email/);
});
test('all seven locales have complete distinct localized readiness text',()=>{
 const expected=Object.keys(billingReadinessMessages('de'));
 for(const locale of ['de','en','fr','it','es','zh','ko']){
  const t=billingReadinessMessages(locale);
  assert.deepEqual(Object.keys(t),expected);
  assert.ok(Object.values(t).every(v=>typeof v==='string'&&v.length>0));
  assert.match(t.window,/365/);
  if(locale!=='en')assert.notEqual(t.trialNote,billingReadinessMessages('en').trialNote);
 }
});
test('UI is read-only and legacy controls consume server action authority',()=>{
 const ui=read('src/modules/platform/PlatformBillingReadiness.tsx');
 assert.match(read('src/modules/platform/useBillingReadiness.ts'),/get_platform_billing_readiness/);
 assert.doesNotMatch(ui,/\.insert\(|\.update\(|\.delete\(|update_platform_restaurant_subscription/);
 const legacy=read('src/modules/platform/PlatformRestaurantControlCenter.tsx');
 assert.match(legacy,/billingActions\?\.extend_trial/);
 assert.doesNotMatch(legacy,/subscriptionStatus: "active"/);
});
