\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica;

create function pg_temp.u(label text) returns uuid language sql immutable as $$
  select (substr(md5(label),1,8)||'-'||substr(md5(label),9,4)||'-4'||substr(md5(label),14,3)
    ||'-8'||substr(md5(label),18,3)||'-'||substr(md5(label),21,12))::uuid
$$;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(pg_temp.u('pre-owner'),'authenticated','authenticated','pre-owner@example.invalid','',now(),now(),now());
insert into public.organizations(id,owner_id,name,status)
values(pg_temp.u('pre-org'),pg_temp.u('pre-owner'),'SYNTHETIC PREEXPIRY','active');
insert into public.restaurants(id,owner_id,name,slug,status,organization_id,activation_status,
  operational_ready,security_ready,legal_ready,onboarding_status)
values(pg_temp.u('pre-restaurant'),pg_temp.u('pre-owner'),'SYNTHETIC PREEXPIRY','synthetic-preexpiry',
  'active',pg_temp.u('pre-org'),null,true,true,true,'completed');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,status)
values(pg_temp.u('pre-branch'),pg_temp.u('pre-org'),pg_temp.u('pre-restaurant'),
  'SYNTHETIC PREEXPIRY','synthetic-preexpiry-main','AT','active');
update public.restaurants set primary_branch_id=pg_temp.u('pre-branch') where id=pg_temp.u('pre-restaurant');
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
values(pg_temp.u('pre-restaurant'),pg_temp.u('pre-org'),pg_temp.u('pre-branch'),pg_temp.u('pre-owner'),'owner');
insert into public.branch_subscriptions(id,organization_id,branch_id,status,subscription_status,
  plan_key,selected_plan,payment_status,trial_started_at,trial_ends_at,current_period_start,
  current_period_end,current_period_ends_at)
values(pg_temp.u('pre-subscription'),pg_temp.u('pre-org'),pg_temp.u('pre-branch'),
  'trialing','trialing','BASIC','BASIC','not_required',(now()+interval '6 days')-interval '1 month',
  now()+interval '6 days',(now()+interval '6 days')-interval '1 month',now()+interval '6 days',now()+interval '6 days');
insert into public.manual_basic_trial_decisions(id,restaurant_id,organization_id,branch_id,
  subscription_id,calendar_months,starts_at,ends_at,actor_id,request_id,correlation_id,
  reason,before_state,after_state)
values(pg_temp.u('pre-trial'),pg_temp.u('pre-restaurant'),pg_temp.u('pre-org'),pg_temp.u('pre-branch'),
  pg_temp.u('pre-subscription'),1,(now()+interval '6 days')-interval '1 month',now()+interval '6 days',
  pg_temp.u('pre-owner'),pg_temp.u('pre-trial-request'),pg_temp.u('pre-trial-correlation'),
  'Synthetic final seven days','{}','{}');
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,
  owner_user_id,test_session_id,marked_by)
values(pg_temp.u('pre-restaurant'),'SYNTHETIC PREEXPIRY',pg_temp.u('pre-org'),
  pg_temp.u('pre-owner'),'basic-preexpiry-local',pg_temp.u('pre-owner'));
set local session_replication_role=origin;

select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.u('pre-owner'),
  'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $test$ declare result jsonb; begin
  result:=public.accept_basic_paid_offer(pg_temp.u('pre-restaurant'),'basic-v1-preexpiry',
    'BASIC KOSTENPFLICHTIG BESTELLEN',pg_temp.u('pre-accept-request'),pg_temp.u('pre-correlation'));
  if coalesce((result->>'checkout_allowed')::boolean,true) then
    raise exception 'PREEXPIRY_CHECKOUT_WAS_ALLOWED'; end if;
  begin
    perform public.prepare_basic_test_checkout((result->>'acceptance_id')::uuid,
      pg_temp.u('pre-checkout-request'),'/admin/settings/konto-testphase');
    raise exception 'PREEXPIRY_CHECKOUT_WAS_PREPARED';
  exception when sqlstate '42501' then
    if sqlerrm<>'BASIC_TEST_CHECKOUT_TRIAL_ACTIVE' then raise; end if;
  end;
end $test$;
reset role;

set local session_replication_role=replica;
update public.branch_subscriptions set status='cancelled',subscription_status='cancelled',
  payment_status='paid',stripe_customer_id='cus_SYNTHETICREACT01',
  stripe_subscription_id='sub_SYNTHETICREACT01' where id=pg_temp.u('pre-subscription');
set local session_replication_role=origin;

set local role authenticated;
do $test$ declare first_result jsonb; replay_result jsonb; begin
  first_result:=public.accept_basic_paid_reactivation(pg_temp.u('pre-restaurant'),'basic-v1-reactivation',
    'BASIC ERNEUT KOSTENPFLICHTIG BESTELLEN',pg_temp.u('react-accept-request'),pg_temp.u('react-correlation'));
  replay_result:=public.accept_basic_paid_reactivation(pg_temp.u('pre-restaurant'),'basic-v1-reactivation',
    'BASIC ERNEUT KOSTENPFLICHTIG BESTELLEN',pg_temp.u('react-accept-request'),pg_temp.u('react-correlation'));
  if (first_result->>'acceptance_kind')<>'REACTIVATION'
    or coalesce((first_result->>'checkout_allowed')::boolean,false) is not true
    or coalesce((replay_result->>'idempotent')::boolean,false) is not true then
    raise exception 'REACTIVATION_ACCEPTANCE_CONTRACT_FAILED'; end if;
  perform public.prepare_basic_test_checkout((first_result->>'acceptance_id')::uuid,
    pg_temp.u('react-checkout-request'),'/admin/settings/konto-testphase');
end $test$;
reset role;

do $test$ begin
  if (select count(*) from public.basic_paid_offer_acceptances
      where restaurant_id=pg_temp.u('pre-restaurant') and acceptance_kind='INITIAL')<>1 then
    raise exception 'INITIAL_ACCEPTANCE_COUNT_INVALID'; end if;
  if (select count(*) from public.basic_paid_offer_acceptances
      where restaurant_id=pg_temp.u('pre-restaurant') and acceptance_kind='REACTIVATION')<>1 then
    raise exception 'REACTIVATION_ACCEPTANCE_COUNT_INVALID'; end if;
  if (select count(*) from public.basic_test_checkout_requests
      where restaurant_id=pg_temp.u('pre-restaurant'))<>1 then
    raise exception 'REACTIVATION_CHECKOUT_COUNT_INVALID'; end if;
end $test$;

rollback;
select 'LOCAL_BASIC_PREEXPIRY_REACTIVATION_PASS';
