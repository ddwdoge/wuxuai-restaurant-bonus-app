-- LOCAL ONLY: upgrade path with preserved synthetic PRO state.
\set ON_ERROR_STOP on
\ir pro-commercial-release-lock-base.sql

insert into auth.users(id) values
  ('70000000-0000-4000-8000-000000000098'),
  ('72000000-0000-4000-8000-000000000099');
insert into public.restaurants(id,organization_id,primary_branch_id,name,owner_id) values
  ('72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000010','72000000-0000-4000-8000-000000000002','AT Upgrade Bistro','70000000-0000-4000-8000-000000000098'),
  ('72000000-0000-4000-8000-000000000011','72000000-0000-4000-8000-000000000020','72000000-0000-4000-8000-000000000012','DE Upgrade Bistro','70000000-0000-4000-8000-000000000098');
insert into public.branches values
  ('72000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000010','AT'),
  ('72000000-0000-4000-8000-000000000012','72000000-0000-4000-8000-000000000011','72000000-0000-4000-8000-000000000020','DE');
insert into public.branch_subscriptions(
  id,organization_id,branch_id,status,plan_key,subscription_status,payment_status,
  trial_started_at,trial_ends_at,current_period_end,created_at
) values
  ('72000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000010','72000000-0000-4000-8000-000000000002',
    'active','PRO','active','paid',null,null,now()+interval '1 month',now()-interval '1 month'),
  ('72000000-0000-4000-8000-000000000013','72000000-0000-4000-8000-000000000020','72000000-0000-4000-8000-000000000012',
    'trialing','PRO','trialing','not_required',now()-interval '1 day',now()+interval '1 month',null,now()-interval '1 day');
insert into public.branch_entitlement_overrides(
  subscription_id,offer_limit,offer_limit_unlimited,offer_notifications,reward_notifications,
  effective_from,expires_at,reason,changed_by,changed_at,
  plan_override_key,plan_override_id,plan_effective_from,plan_effective_until
) values (
  '72000000-0000-4000-8000-000000000003',null,true,true,true,
  now()-interval '1 day',now()+interval '1 month','Synthetic legacy PRO state',
  '72000000-0000-4000-8000-000000000099',now()-interval '1 day',
  'PRO','72000000-0000-4000-8000-000000000004',now()-interval '1 day',now()+interval '1 month'
);
insert into public.platform_admin_operations(
  id,platform_admin_user_id,platform_admin_role,action_type,entity_type,entity_id,
  tenant_id,severity,reason,before_state,after_state,result,idempotency_key
) values (
  '72000000-0000-4000-8000-000000000005','72000000-0000-4000-8000-000000000099',
  'platform_admin','PLAN_OVERRIDE_ACTIVATED','plan_override','72000000-0000-4000-8000-000000000004',
  '72000000-0000-4000-8000-000000000001','SENSITIVE','Synthetic legacy PRO state','{}',
  jsonb_build_object('plan_override_request',jsonb_build_object(
    'plan','PRO','starts_at',null,'expires_at',null,'reason','Synthetic legacy PRO state')),
  'SUCCESS','72000000-0000-4000-8000-000000000090'
);

create table public.pro_lock_subscription_before as
select id, to_jsonb(subscription) snapshot
from public.branch_subscriptions subscription order by id;
create table public.pro_lock_override_before as
select subscription_id, to_jsonb(override_row) snapshot
from public.branch_entitlement_overrides override_row order by subscription_id;

\ir ../supabase/migrations/20260915001000_pro_commercial_release_lock.sql

select public.test_assert(
  not exists(
    select 1 from public.branch_subscriptions current_row
    full join public.pro_lock_subscription_before prior using(id)
    where to_jsonb(current_row) is distinct from prior.snapshot
  ), 'upgrade preserves every stored subscription byte-state'
);
select public.test_assert(
  not exists(
    select 1 from public.branch_entitlement_overrides current_row
    full join public.pro_lock_override_before prior using(subscription_id)
    where to_jsonb(current_row) is distinct from prior.snapshot
  ), 'upgrade preserves every stored override byte-state'
);

select public.test_assert(
  public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000001')->>'stored_plan_key' = 'PRO'
  and public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000001')#>>'{override,plan_key}' = 'PRO'
  and public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000001')->>'plan_key' = 'BASIC'
  and public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000001')->>'entitlement_source' = 'COMMERCIAL_RELEASE_LOCK'
  and public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000001')#>>'{effective,offer_limit}' = '5'
  and public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000001')#>>'{effective,offer_limit_unlimited}' = 'false'
  and public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000001')#>>'{effective,offer_notifications}' = 'false'
  and public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000001')#>>'{effective,reward_notifications}' = 'false',
  'paid subscription admin and feature overrides are effectively Basic while locked'
);
select public.test_assert(
  public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000011')->>'stored_plan_key' = 'PRO'
  and public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000011')->>'plan_key' = 'BASIC'
  and public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000011')#>>'{commercial_release,release_state}' = 'LOCKED',
  'trial PRO and locked DE policy fail closed to Basic'
);

set role authenticated;
set test.actor = '72000000-0000-4000-8000-000000000099';
do $block$
declare role_name text;
begin
  foreach role_name in array array['platform_owner','platform_admin','billing_admin'] loop
    perform set_config('test.platform_role',role_name,true);
    perform public.test_block(
      $$select public.set_platform_restaurant_plan_override(
        '72000000-0000-4000-8000-000000000001','PRO',now()+interval '2 months',
        'Synthetic locked activation','CONFIRMED','72000000-0000-4000-8000-000000000090',null)$$,
      '42501', role_name||' cannot activate or replay PRO while locked'
    );
  end loop;
end
$block$;
reset role;

set role service_role;
select public.test_block(
  $$update public.branch_entitlement_overrides
    set plan_effective_until=plan_effective_until+interval '1 day'
    where subscription_id='72000000-0000-4000-8000-000000000003'$$,
  '42501', 'direct existing PRO override extension blocked'
);
update public.branch_entitlement_overrides
set offer_notifications=false, reward_notifications=false,
    plan_effective_until=now()
where subscription_id='72000000-0000-4000-8000-000000000003';
select public.test_assert(true,'reducing and ending stored PRO override remains allowed');
select public.test_block(
  $$update public.branch_entitlement_overrides set offer_notifications=true
    where subscription_id='72000000-0000-4000-8000-000000000003'$$,
  '42501', 're-enabling PRO notification feature blocked'
);
reset role;

select public.test_assert(
  public.resolve_restaurant_entitlements_internal('72000000-0000-4000-8000-000000000001')->>'plan_key' = 'BASIC',
  'effective plan remains Basic after all bypass attempts'
);
