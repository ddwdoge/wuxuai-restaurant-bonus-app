\set ON_ERROR_STOP on
begin;
set local timezone='UTC';
set local session_replication_role=replica;

create function pg_temp.u(label text) returns uuid language sql immutable as $$
  select (substr(md5(label),1,8)||'-'||substr(md5(label),9,4)||'-4'||substr(md5(label),14,3)
    ||'-8'||substr(md5(label),18,3)||'-'||substr(md5(label),21,12))::uuid
$$;

-- Deterministic boundary contract. Production uses the same inclusive-start
-- and exclusive-end predicates with statement_timestamp().
create function pg_temp.window_open(starts_at timestamptz,ends_at timestamptz,evaluated_at timestamptz)
returns boolean language sql immutable as $$
  select starts_at<=evaluated_at and ends_at>evaluated_at
$$;

do $test$ declare
  trial_start constant timestamptz:='2028-01-31 12:00:00+00';
  trial_end constant timestamptz:=trial_start+interval '1 month';
  grace_end constant timestamptz:=trial_end+interval '60 days';
begin
  if trial_end<>'2028-02-29 12:00:00+00'::timestamptz then
    raise exception 'LEAP_YEAR_MONTH_END_INVALID'; end if;
  if not pg_temp.window_open(trial_start,trial_end,trial_end-interval '1 microsecond')
    or pg_temp.window_open(trial_start,trial_end,trial_end)
    or pg_temp.window_open(trial_start,trial_end,trial_end+interval '1 microsecond') then
    raise exception 'TRIAL_END_BOUNDARY_INVALID'; end if;
  if not pg_temp.window_open(trial_end,grace_end,trial_end)
    or not pg_temp.window_open(trial_end,grace_end,trial_end+interval '1 microsecond')
    or not pg_temp.window_open(trial_end,grace_end,grace_end-interval '1 microsecond')
    or pg_temp.window_open(trial_end,grace_end,grace_end)
    or pg_temp.window_open(trial_end,grace_end,grace_end+interval '1 microsecond') then
    raise exception 'REDEMPTION_GRACE_BOUNDARY_INVALID'; end if;
  if ('2027-01-31 23:30:00+00'::timestamptz+interval '1 month')
      <>'2027-02-28 23:30:00+00'::timestamptz then
    raise exception 'NON_LEAP_MONTH_END_INVALID'; end if;
  if ('2027-03-28 01:30:00 Europe/Vienna'::timestamptz+interval '60 days')
      <>'2027-05-27 00:30:00+00'::timestamptz then
    raise exception 'UTC_DURATION_ACROSS_DST_INVALID'; end if;
end $test$;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  (pg_temp.u('basic-owner'),'authenticated','authenticated','basic-owner@example.invalid','',now(),now(),now()),
  (pg_temp.u('basic-admin'),'authenticated','authenticated','basic-admin@example.invalid','',now(),now(),now());
insert into public.platform_admins(user_id,role,active)
values(pg_temp.u('basic-admin'),'platform_admin',true);
insert into public.organizations(id,owner_id,name,status)
values(pg_temp.u('basic-org'),pg_temp.u('basic-owner'),'SYNTHETIC BASIC','active');
insert into public.restaurants(id,owner_id,name,slug,status,organization_id,activation_status,
  operational_ready,security_ready,legal_ready,onboarding_status)
values(pg_temp.u('basic-restaurant'),pg_temp.u('basic-owner'),'SYNTHETIC BASIC','synthetic-basic',
  'active',pg_temp.u('basic-org'),null,true,true,true,'completed');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,status)
values(pg_temp.u('basic-branch'),pg_temp.u('basic-org'),pg_temp.u('basic-restaurant'),
  'SYNTHETIC BASIC','synthetic-basic-main','AT','active');
update public.restaurants set primary_branch_id=pg_temp.u('basic-branch') where id=pg_temp.u('basic-restaurant');
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
values(pg_temp.u('basic-restaurant'),pg_temp.u('basic-org'),pg_temp.u('basic-branch'),pg_temp.u('basic-owner'),'owner');
insert into public.branch_subscriptions(id,organization_id,branch_id,status,subscription_status,
  plan_key,selected_plan,payment_status,trial_started_at,trial_ends_at,current_period_start,
  current_period_end,current_period_ends_at)
values(pg_temp.u('basic-subscription'),pg_temp.u('basic-org'),pg_temp.u('basic-branch'),
  'trialing','trialing','BASIC','BASIC','not_required',now()-interval '2 months',
  now()-interval '1 month',now()-interval '2 months',now()-interval '1 month',now()-interval '1 month');
insert into public.manual_basic_trial_decisions(id,restaurant_id,organization_id,branch_id,
  subscription_id,calendar_months,starts_at,ends_at,actor_id,request_id,correlation_id,
  reason,before_state,after_state)
values(pg_temp.u('basic-trial'),pg_temp.u('basic-restaurant'),pg_temp.u('basic-org'),
  pg_temp.u('basic-branch'),pg_temp.u('basic-subscription'),1,now()-interval '2 months',
  now()-interval '1 month',pg_temp.u('basic-admin'),pg_temp.u('basic-trial-request'),
  pg_temp.u('basic-trial-correlation'),'Synthetic expired BASIC trial','{}','{}');
insert into public.basic_post_trial_redemption_grace(trial_decision_id,restaurant_id,
  organization_id,branch_id,starts_at,ends_at)
select id,restaurant_id,organization_id,branch_id,ends_at,ends_at+interval '60 days'
from public.manual_basic_trial_decisions where id=pg_temp.u('basic-trial');
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,
  owner_user_id,test_session_id,marked_by)
values(pg_temp.u('basic-restaurant'),'SYNTHETIC BASIC',pg_temp.u('basic-org'),
  pg_temp.u('basic-owner'),'basic-paid-local',pg_temp.u('basic-admin'));
insert into public.customers(id,restaurant_id,organization_id,branch_id,name,customer_code,phone,normalized_phone)
values(pg_temp.u('basic-customer'),pg_temp.u('basic-restaurant'),pg_temp.u('basic-org'),
  pg_temp.u('basic-branch'),'Synthetic Customer','SYN-BASIC-01','+436600000001','+436600000001');
set local session_replication_role=origin;

-- Expired trial permits only redemption actions during the bounded grace.
do $test$ begin
  perform public.require_restaurant_operational(pg_temp.u('basic-restaurant'),'secure_redemption_start');
  perform public.require_restaurant_operational(pg_temp.u('basic-restaurant'),'secure_redemption_finalize');
  begin
    perform public.require_restaurant_operational(pg_temp.u('basic-restaurant'),'create_customer_points_credit_qr');
    raise exception 'NEW_POINTS_WERE_NOT_BLOCKED';
  exception when sqlstate '42501' then
    if sqlerrm<>'RESTAURANT_NOT_OPERATIONAL' then raise; end if;
  end;
  begin
    insert into public.customers(restaurant_id,organization_id,branch_id,name,customer_code,phone,normalized_phone)
    values(pg_temp.u('basic-restaurant'),pg_temp.u('basic-org'),pg_temp.u('basic-branch'),
      'Blocked Customer','SYN-BASIC-BLOCKED','+436600000002','+436600000002');
    raise exception 'POST_TRIAL_CUSTOMER_REGISTRATION_WAS_NOT_BLOCKED';
  exception when sqlstate '42501' then
    if sqlerrm<>'POST_TRIAL_GROWTH_BLOCKED' then raise; end if;
  end;
  begin
    insert into public.points_transactions(restaurant_id,organization_id,branch_id,customer_id,type,points,reason)
    values(pg_temp.u('basic-restaurant'),pg_temp.u('basic-org'),pg_temp.u('basic-branch'),
      pg_temp.u('basic-customer'),'earn',10,'Blocked post-trial earn');
    raise exception 'POST_TRIAL_POINTS_WERE_NOT_BLOCKED';
  exception when sqlstate '42501' then
    if sqlerrm<>'POST_TRIAL_NEW_POINTS_BLOCKED' then raise; end if;
  end;
  begin
    insert into public.restaurant_offers(restaurant_id,branch_id,offer_type,title,short_description,
      valid_from,valid_to,status,is_active)
    values(pg_temp.u('basic-restaurant'),pg_temp.u('basic-branch'),'NEWS','Blocked offer',
      'Must not be created after trial expiry',now(),now()+interval '1 day','DRAFT',false);
    raise exception 'POST_TRIAL_OFFER_WAS_NOT_BLOCKED';
  exception when sqlstate '42501' then
    if sqlerrm<>'POST_TRIAL_NEW_OFFER_BLOCKED' then raise; end if;
  end;
end $test$;

select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.u('basic-owner'),
  'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select public.accept_basic_paid_offer(pg_temp.u('basic-restaurant'),'basic-v1-local',
  'BASIC KOSTENPFLICHTIG BESTELLEN',pg_temp.u('basic-accept-request'),
  pg_temp.u('basic-correlation'));
select public.accept_basic_paid_offer(pg_temp.u('basic-restaurant'),'basic-v1-local',
  'BASIC KOSTENPFLICHTIG BESTELLEN',pg_temp.u('basic-accept-request'),
  pg_temp.u('basic-correlation'));
reset role;
select public.prepare_basic_test_checkout((select id from public.basic_paid_offer_acceptances
  where restaurant_id=pg_temp.u('basic-restaurant')),pg_temp.u('basic-checkout-request'),
  '/admin/settings/konto-testphase');

select set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
select public.complete_basic_test_checkout((select id from public.basic_test_checkout_requests
  where restaurant_id=pg_temp.u('basic-restaurant')),'cs_test_SYNTHETIC123456');
-- Stripe may deliver invoice.paid before the older checkout event. The signed
-- acceptance reference must still bind the payment exactly once.
select public.record_basic_stripe_test_event('evt_SYNTHETICPAID000001',repeat('b',64),
  'invoice.paid',now()+interval '1 second',null,'cus_SYNTHETIC123456','sub_SYNTHETIC123456',
  pg_temp.u('basic-restaurant'),(select id from public.basic_paid_offer_acceptances
    where restaurant_id=pg_temp.u('basic-restaurant')),'paid',now(),now()+interval '1 month',
  pg_temp.u('basic-event-request-2'),pg_temp.u('basic-event-correlation-2'),false);
select public.record_basic_stripe_test_event('evt_SYNTHETICCHECKOUT01',repeat('a',64),
  'checkout.session.completed',now(),'cs_test_SYNTHETIC123456','cus_SYNTHETIC123456',
  'sub_SYNTHETIC123456',pg_temp.u('basic-restaurant'),
  (select id from public.basic_paid_offer_acceptances where restaurant_id=pg_temp.u('basic-restaurant')),
  'complete',null,null,pg_temp.u('basic-event-request-1'),pg_temp.u('basic-event-correlation-1'),false);
-- Replay is idempotent, while the same id with another payload hash conflicts.
select public.record_basic_stripe_test_event('evt_SYNTHETICPAID000001',repeat('b',64),
  'invoice.paid',now()+interval '1 second',null,'cus_SYNTHETIC123456','sub_SYNTHETIC123456',
  pg_temp.u('basic-restaurant'),(select id from public.basic_paid_offer_acceptances
    where restaurant_id=pg_temp.u('basic-restaurant')),'paid',now(),now()+interval '1 month',
  pg_temp.u('basic-event-request-2'),pg_temp.u('basic-event-correlation-2'),false);

do $test$ begin
  if (select count(*) from public.basic_paid_offer_acceptances where restaurant_id=pg_temp.u('basic-restaurant'))<>1 then
    raise exception 'BASIC_ACCEPTANCE_IDEMPOTENCY_FAILED'; end if;
  if (select count(*) from public.basic_test_checkout_requests where restaurant_id=pg_temp.u('basic-restaurant'))<>1 then
    raise exception 'BASIC_CHECKOUT_IDEMPOTENCY_FAILED'; end if;
  if (select count(*) from public.basic_stripe_test_event_inbox where restaurant_id=pg_temp.u('basic-restaurant'))<>2 then
    raise exception 'BASIC_EVENT_REPLAY_FAILED'; end if;
  if not exists(select 1 from public.basic_stripe_test_event_inbox
    where event_id='evt_SYNTHETICCHECKOUT01' and processing_status='STALE') then
    raise exception 'BASIC_OUT_OF_ORDER_CHECKOUT_NOT_CLASSIFIED_STALE'; end if;
  if not exists(select 1 from public.branch_subscriptions where id=pg_temp.u('basic-subscription')
    and status='active' and subscription_status='active' and payment_status='paid'
    and stripe_customer_id='cus_SYNTHETIC123456' and stripe_subscription_id='sub_SYNTHETIC123456') then
    raise exception 'BASIC_PAYMENT_ACTIVATION_FAILED'; end if;
  perform public.require_restaurant_operational(pg_temp.u('basic-restaurant'),'secure_redemption_start');
end $test$;

-- Failed payment and cancellation are server-confirmed state changes only.
select public.record_basic_stripe_test_event('evt_SYNTHETICFAILED0001',repeat('c',64),
  'invoice.payment_failed',now()+interval '2 seconds',null,'cus_SYNTHETIC123456','sub_SYNTHETIC123456',
  pg_temp.u('basic-restaurant'),(select id from public.basic_paid_offer_acceptances
    where restaurant_id=pg_temp.u('basic-restaurant')),'open',null,null,
  pg_temp.u('basic-event-request-3'),pg_temp.u('basic-event-correlation-3'),false);
select public.record_basic_stripe_test_event('evt_SYNTHETICCANCEL0001',repeat('d',64),
  'customer.subscription.deleted',now()+interval '3 seconds',null,'cus_SYNTHETIC123456','sub_SYNTHETIC123456',
  pg_temp.u('basic-restaurant'),(select id from public.basic_paid_offer_acceptances
    where restaurant_id=pg_temp.u('basic-restaurant')),'canceled',null,null,
  pg_temp.u('basic-event-request-4'),pg_temp.u('basic-event-correlation-4'),false);

do $test$ begin
  if not exists(select 1 from public.branch_subscriptions where id=pg_temp.u('basic-subscription')
    and status='cancelled' and subscription_status='cancelled') then
    raise exception 'BASIC_CANCELLATION_FAILED'; end if;
  if exists(select 1 from public.basic_post_trial_redemption_grace
    where restaurant_id=pg_temp.u('basic-restaurant') and (forfeiture_authorized or deletion_authorized)) then
    raise exception 'LEGAL_EXPIRY_OR_DELETION_WAS_AUTHORIZED'; end if;
end $test$;

set local session_replication_role=replica;
update public.basic_post_trial_redemption_grace set starts_at=starts_at-interval '90 days',
  ends_at=ends_at-interval '90 days' where restaurant_id=pg_temp.u('basic-restaurant');
set local session_replication_role=origin;
do $test$ begin
  begin
    perform public.require_restaurant_operational(pg_temp.u('basic-restaurant'),'secure_redemption_start');
    raise exception 'POST_GRACE_REDEMPTION_WAS_NOT_BLOCKED';
  exception when sqlstate '42501' then
    if sqlerrm<>'RESTAURANT_NOT_OPERATIONAL' then raise; end if;
  end;
end $test$;

rollback;
select 'LOCAL_BASIC_POST_TRIAL_STRIPE_TEST_PASS';
