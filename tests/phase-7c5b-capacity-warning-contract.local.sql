\set ON_ERROR_STOP on
begin;

create function pg_temp.assert_true(condition boolean, message text)
returns void language plpgsql as $function$
begin
  if not coalesce(condition, false) then raise exception '%', message; end if;
end;
$function$;

set local session_replication_role = replica;

insert into auth.users (id, email, email_confirmed_at, created_at, updated_at) values
  ('7c5b0000-0000-4000-8000-000000000001', 'phase7c5b-owner@example.invalid', now(), now(), now()),
  ('7c5b0000-0000-4000-8000-000000000002', 'phase7c5b-stranger@example.invalid', now(), now(), now()),
  ('7c5b0000-0000-4000-8000-000000000003', 'phase7c5b-staff@example.invalid', now(), now(), now()),
  ('7c5b0000-0000-4000-8000-000000000004', 'phase7c5b-customer@example.invalid', now(), now(), now());

insert into public.organizations (id, owner_id, name) values
  ('7c5b0000-0000-4000-8000-000000000010', '7c5b0000-0000-4000-8000-000000000001', 'Phase 7C.5B Local');
insert into public.restaurants (
  id, owner_id, name, slug, organization_id, language, timezone_name, status
) values (
  '7c5b0000-0000-4000-8000-000000000011', '7c5b0000-0000-4000-8000-000000000001',
  'Phase 7C.5B Local', 'phase-7c5b-local', '7c5b0000-0000-4000-8000-000000000010',
  'de', 'Europe/Vienna', 'active'
);
insert into public.branches (id, organization_id, restaurant_id, name, slug, country) values
  ('7c5b0000-0000-4000-8000-000000000012', '7c5b0000-0000-4000-8000-000000000010',
   '7c5b0000-0000-4000-8000-000000000011', 'Phase 7C.5B Local', 'phase-7c5b-local', 'AT');
update public.restaurants set primary_branch_id = '7c5b0000-0000-4000-8000-000000000012'
where id = '7c5b0000-0000-4000-8000-000000000011';
insert into public.restaurant_members (restaurant_id, organization_id, branch_id, user_id, role) values
  ('7c5b0000-0000-4000-8000-000000000011', '7c5b0000-0000-4000-8000-000000000010', '7c5b0000-0000-4000-8000-000000000012', '7c5b0000-0000-4000-8000-000000000001', 'owner'),
  ('7c5b0000-0000-4000-8000-000000000011', '7c5b0000-0000-4000-8000-000000000010', '7c5b0000-0000-4000-8000-000000000012', '7c5b0000-0000-4000-8000-000000000003', 'staff');
insert into public.branch_subscriptions (
  id, organization_id, branch_id, status, plan_key, subscription_status,
  payment_status, current_period_end, created_at
) values (
  '7c5b0000-0000-4000-8000-000000000013', '7c5b0000-0000-4000-8000-000000000010',
  '7c5b0000-0000-4000-8000-000000000012', 'active', 'BASIC', 'active',
  'manual', '2027-01-01 00:00:00+00', '2026-09-01 00:00:00+00'
);
insert into public.restaurant_capacity_addon_entitlements (
  entitlement_key, revision, restaurant_id, organization_id, branch_id,
  addon_key, addon_version, units, status, effective_from, source, request_id, reason
) values (
  '7c5b0000-0000-4000-8000-000000000020', 1,
  '7c5b0000-0000-4000-8000-000000000011', '7c5b0000-0000-4000-8000-000000000010',
  '7c5b0000-0000-4000-8000-000000000012', 'OFFER_CAPACITY', 1, 1, 'ACTIVE',
  '2026-09-01 00:00:00+00', 'TEST_FIXTURE', '7c5b0000-0000-4000-8000-000000000021',
  'Local Phase 7C.5B capacity warning fixture'
);

insert into public.restaurant_offers (
  id, restaurant_id, branch_id, offer_type, title, short_description,
  valid_from, valid_to, status, is_active
)
select md5('phase7c5b-offer-' || series.value)::uuid,
  '7c5b0000-0000-4000-8000-000000000011', '7c5b0000-0000-4000-8000-000000000012',
  'NEWS', 'Capacity ' || series.value, 'Local warning fixture',
  '2026-09-01 00:00:00+00', '2027-01-01 00:00:00+00', 'PUBLISHED', true
from generate_series(1, 7) series(value);

set local session_replication_role = origin;

select pg_temp.assert_true(public.capacity_warning_level_for_usage(79,100) is null,'79 percent warned');
select pg_temp.assert_true(public.capacity_warning_level_for_usage(80,100)='80','80 percent missing');
select pg_temp.assert_true(public.capacity_warning_level_for_usage(89,100)='80','89 percent wrong level');
select pg_temp.assert_true(public.capacity_warning_level_for_usage(90,100)='90','90 percent missing');
select pg_temp.assert_true(public.capacity_warning_level_for_usage(100,100)='100','100 percent missing');
select pg_temp.assert_true(public.capacity_warning_level_for_usage(101,100)='OVER_LIMIT','over-limit missing');

do $test$
declare result jsonb;
begin
  result := public.evaluate_restaurant_capacity_warning_internal(
    '7c5b0000-0000-4000-8000-000000000011', 'offer',
    '2026-09-21 10:00:00+00', 'MANUAL_TEST', false
  );
  perform pg_temp.assert_true(result->>'actual_level' is null, '79 percent equivalent unexpectedly warned');
  perform pg_temp.assert_true((select count(*) = 0 from public.capacity_warning_episodes), 'episode created below 80 percent');
end;
$test$;

set local session_replication_role = replica;
insert into public.restaurant_offers (
  id, restaurant_id, branch_id, offer_type, title, short_description,
  valid_from, valid_to, status, is_active
) values (
  '7c5b0000-0000-4000-8000-000000000108', '7c5b0000-0000-4000-8000-000000000011',
  '7c5b0000-0000-4000-8000-000000000012', 'NEWS', 'Capacity 8', 'Local warning fixture',
  '2026-09-01 00:00:00+00', '2027-01-01 00:00:00+00', 'PUBLISHED', true
);
set local session_replication_role = origin;

select public.evaluate_restaurant_capacity_warning_internal(
  '7c5b0000-0000-4000-8000-000000000011', 'offer',
  '2026-09-21 10:01:00+00', 'MANUAL_TEST', false
);
select public.evaluate_restaurant_capacity_warning_internal(
  '7c5b0000-0000-4000-8000-000000000011', 'offer',
  '2026-09-21 10:02:00+00', 'MANUAL_TEST', false
);
select pg_temp.assert_true((select count(*) = 1 from public.capacity_warning_episodes where warning_level='80'), '80 percent dedup failed');
select pg_temp.assert_true((select count(*) = 1 from public.capacity_warning_deliveries where channel='app'), 'app delivery missing or duplicated');
select pg_temp.assert_true((select count(*) = 1 from public.capacity_warning_deliveries where channel='email'), 'email delivery missing or duplicated');

-- The existing transactional worker contract reserves each email once, retries
-- without a second row, and never performs a real send in this local test.
update public.capacity_warning_deliveries
set available_at=statement_timestamp()-interval '1 minute'
where channel='email';
set local role service_role;
do $test$
declare reserved_count integer;
begin
  select count(*) into reserved_count from public.reserve_capacity_warning_emails(25);
  perform pg_temp.assert_true(reserved_count=1,'first email reservation did not return exactly one row');
  select count(*) into reserved_count from public.reserve_capacity_warning_emails(25);
  perform pg_temp.assert_true(reserved_count=0,'parallel-safe email reservation returned the leased row twice');
end;
$test$;
reset role;
select pg_temp.assert_true(
  (select count(*)=1 from public.capacity_warning_deliveries where channel='email' and status='PROCESSING' and attempt_count=1),
  'email lease state mismatch'
);
select set_config(
  'phase7c5b.email_delivery_id',
  (select id::text from public.capacity_warning_deliveries where channel='email'),
  true
);
set local role service_role;
select public.complete_capacity_warning_email(
  current_setting('phase7c5b.email_delivery_id')::uuid,
  false, null, 'LOCAL_EXPECTED_FAILURE'
);
reset role;
select pg_temp.assert_true(
  (select count(*)=1 from public.capacity_warning_deliveries where channel='email' and status='FAILED' and attempt_count=1),
  'email retry state mismatch'
);
update public.capacity_warning_deliveries
set available_at=statement_timestamp()-interval '1 minute'
where channel='email';
set local role service_role;
do $test$
declare delivery_id_value uuid; reserved_count integer;
begin
  select delivery_id into delivery_id_value from public.reserve_capacity_warning_emails(25);
  perform pg_temp.assert_true(delivery_id_value is not null,'email retry was not reserved');
  perform public.complete_capacity_warning_email(delivery_id_value,true,'local-contract-message-id',null);
  select count(*) into reserved_count from public.reserve_capacity_warning_emails(25);
  perform pg_temp.assert_true(reserved_count=0,'sent email was reserved again');
end;
$test$;
reset role;
select pg_temp.assert_true(
  (select count(*)=1 from public.capacity_warning_deliveries where channel='email' and status='SENT' and attempt_count=2),
  'email completion or retry dedup mismatch'
);

set local session_replication_role = replica;
insert into public.restaurant_offers (
  id, restaurant_id, branch_id, offer_type, title, short_description,
  valid_from, valid_to, status, is_active
) values
  ('7c5b0000-0000-4000-8000-000000000109', '7c5b0000-0000-4000-8000-000000000011', '7c5b0000-0000-4000-8000-000000000012', 'NEWS', 'Capacity 9', 'Local warning fixture', '2026-09-01', '2027-01-01', 'PUBLISHED', true);
set local session_replication_role = origin;
select public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-21 10:03+00','MANUAL_TEST',false);
select pg_temp.assert_true((select count(*) = 1 from public.capacity_warning_episodes where warning_level='90'), '90 percent escalation missing');

set local session_replication_role = replica;
insert into public.restaurant_offers (id,restaurant_id,branch_id,offer_type,title,short_description,valid_from,valid_to,status,is_active) values
  ('7c5b0000-0000-4000-8000-000000000110','7c5b0000-0000-4000-8000-000000000011','7c5b0000-0000-4000-8000-000000000012','NEWS','Capacity 10','Local warning fixture','2026-09-01','2027-01-01','PUBLISHED',true);
set local session_replication_role = origin;
select public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-21 10:04+00','MANUAL_TEST',false);
select pg_temp.assert_true((select count(*) = 1 from public.capacity_warning_episodes where warning_level='100'), '100 percent episode missing');

set local session_replication_role = replica;
insert into public.restaurant_offers (id,restaurant_id,branch_id,offer_type,title,short_description,valid_from,valid_to,status,is_active) values
  ('7c5b0000-0000-4000-8000-000000000111','7c5b0000-0000-4000-8000-000000000011','7c5b0000-0000-4000-8000-000000000012','NEWS','Capacity 11','Local warning fixture','2026-09-01','2027-01-01','PUBLISHED',true);
set local session_replication_role = origin;
select public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-21 10:05+00','MANUAL_TEST',false);
select pg_temp.assert_true((select count(*) = 1 from public.capacity_warning_episodes where warning_level='OVER_LIMIT'), 'over-limit episode missing');
select pg_temp.assert_true((select usage=11 and effective_limit=10 from public.capacity_warning_episodes where warning_level='OVER_LIMIT'), 'over-limit values incorrect');

-- Critical reminders are blocked before seven days and allowed at seven days.
update public.capacity_warning_deliveries delivery set status='SENT', sent_at='2026-09-21 10:05+00'
from public.capacity_warning_episodes episode
where episode.id=delivery.warning_episode_id and episode.warning_level='OVER_LIMIT' and delivery.channel='email';
select public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-28 10:04+00','MANUAL_TEST',false);
select pg_temp.assert_true((select delivery.status='SENT' from public.capacity_warning_deliveries delivery join public.capacity_warning_episodes episode on episode.id=delivery.warning_episode_id where episode.warning_level='OVER_LIMIT' and delivery.channel='email'), 'critical reminder ran too early');
select public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-28 10:05+00','MANUAL_TEST',false);
select pg_temp.assert_true((select delivery.status='PENDING' from public.capacity_warning_deliveries delivery join public.capacity_warning_episodes episode on episode.id=delivery.warning_episode_id where episode.warning_level='OVER_LIMIT' and delivery.channel='email'), 'critical reminder missing after seven days');

-- Quiet hours and timezone fallback are deterministic.
select pg_temp.assert_true(
  public.capacity_warning_email_available_at('2026-09-21 21:30+00','Europe/Vienna') = '2026-09-22 06:00+00',
  'quiet-hours release is not next local 08:00'
);
select pg_temp.assert_true(public.capacity_warning_timezone('Invalid/Timezone')='Europe/Vienna','timezone fallback mismatch');

-- Forecast: fewer than 28 complete days means no forecast.
delete from public.capacity_usage_daily_snapshots where restaurant_id='7c5b0000-0000-4000-8000-000000000011';
insert into public.capacity_usage_daily_snapshots (restaurant_id,capacity_type,snapshot_date,usage,effective_limit,timezone_name,captured_at)
select '7c5b0000-0000-4000-8000-000000000011','customer','2026-09-21'::date-series.value,0,3000,'Europe/Vienna','2026-09-22 06:00+00'
from generate_series(1,27) series(value);
do $test$ declare result jsonb; begin
  result:=public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','customer','2026-09-22 10:00+00','MANUAL_TEST',false);
  perform pg_temp.assert_true(result->>'projected_usage_7d' is null,'forecast used fewer than 28 days');
end $test$;

-- Exact 28-day contiguous basis activates forecast.
insert into public.capacity_usage_daily_snapshots (restaurant_id,capacity_type,snapshot_date,usage,effective_limit,timezone_name,captured_at)
values ('7c5b0000-0000-4000-8000-000000000011','customer','2026-09-21',0,3000,'Europe/Vienna','2026-09-22 06:00+00')
on conflict (restaurant_id,capacity_type,snapshot_date) do update set usage=excluded.usage;
do $test$ declare result jsonb; begin
  result:=public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','customer','2026-09-22 10:00+00','MANUAL_TEST',false);
  perform pg_temp.assert_true(result->>'projected_usage_7d'='0','zero-growth forecast mismatch');
end $test$;

-- Forecast levels use ceil and never extrapolate negative growth below current usage.
set local session_replication_role = replica;
update public.restaurant_offers set status='DISABLED',is_active=false
where restaurant_id='7c5b0000-0000-4000-8000-000000000011';
update public.restaurant_offers set status='PUBLISHED',is_active=true
where id in (select id from public.restaurant_offers where restaurant_id='7c5b0000-0000-4000-8000-000000000011' order by id limit 6);
delete from public.capacity_usage_daily_snapshots
where restaurant_id='7c5b0000-0000-4000-8000-000000000011' and capacity_type='offer';
insert into public.capacity_usage_daily_snapshots (restaurant_id,capacity_type,snapshot_date,usage,effective_limit,timezone_name,captured_at)
select '7c5b0000-0000-4000-8000-000000000011','offer','2026-09-22'::date-series.value,0,10,'Europe/Vienna','2026-09-22 06:00+00'
from generate_series(1,28) series(value);
set local session_replication_role = origin;
do $test$ declare result jsonb; begin
  result:=public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-22 10:00+00','MANUAL_TEST',false);
  perform pg_temp.assert_true(result->>'projected_usage_7d'='8' and result->>'forecast_level'='80','80 forecast or ceil mismatch');
end $test$;
set local session_replication_role = replica;
update public.restaurant_offers set status='PUBLISHED',is_active=true
where id=(select id from public.restaurant_offers where restaurant_id='7c5b0000-0000-4000-8000-000000000011' and not is_active order by id limit 1);
set local session_replication_role = origin;
do $test$ declare result jsonb; begin
  result:=public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-22 10:01+00','MANUAL_TEST',false);
  perform pg_temp.assert_true(result->>'projected_usage_7d'='9' and result->>'forecast_level'='90','90 forecast mismatch');
end $test$;
set local session_replication_role = replica;
update public.restaurant_offers set status='PUBLISHED',is_active=true
where id=(select id from public.restaurant_offers where restaurant_id='7c5b0000-0000-4000-8000-000000000011' and not is_active order by id limit 1);
set local session_replication_role = origin;
do $test$ declare result jsonb; begin
  result:=public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-22 10:02+00','MANUAL_TEST',false);
  if not (result->>'projected_usage_7d'='10' and result->>'forecast_level'='100') then raise exception '100 forecast mismatch: %', result; end if;
end $test$;
set local session_replication_role = replica;
update public.restaurant_offers set status='DISABLED',is_active=false
where restaurant_id='7c5b0000-0000-4000-8000-000000000011';
update public.restaurant_offers set status='PUBLISHED',is_active=true
where id in (select id from public.restaurant_offers where restaurant_id='7c5b0000-0000-4000-8000-000000000011' order by id limit 6);
update public.capacity_usage_daily_snapshots set usage=10
where restaurant_id='7c5b0000-0000-4000-8000-000000000011' and capacity_type='offer' and snapshot_date='2026-08-25';
set local session_replication_role = origin;
do $test$ declare result jsonb; begin
  result:=public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-22 10:03+00','MANUAL_TEST',false);
  perform pg_temp.assert_true(result->>'projected_usage_7d'='6','negative growth reduced forecast below current usage');
end $test$;

-- Six days below do not rearm; seven complete days do.
select public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-28 10:03+00','MANUAL_TEST',false);
select pg_temp.assert_true((select count(*)>0 from public.capacity_warning_episodes where warning_level='80' and status='OPEN'),'80 episode rearmed before seven complete days');
select public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-29 10:03+00','MANUAL_TEST',false);
select pg_temp.assert_true((select count(*)>0 from public.capacity_warning_episodes where warning_level='80' and status='RESOLVED' and resolve_reason='SEVEN_COMPLETE_DAYS_BELOW'),'seven-day rearm resolution missing');

set local session_replication_role = replica;
update public.restaurant_offers set status='PUBLISHED',is_active=true
where id in (select id from public.restaurant_offers where restaurant_id='7c5b0000-0000-4000-8000-000000000011' and not is_active order by id limit 2);
set local session_replication_role = origin;
select public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-29 10:04+00','MANUAL_TEST',false);
select pg_temp.assert_true((select count(*)=2 from public.capacity_warning_episodes where warning_level='80'),'80 warning did not rearm into one new episode');

-- A capacity increase resolves immediately while staying below the threshold.
set local session_replication_role = replica;
insert into public.restaurant_capacity_addon_entitlements (
  entitlement_key,revision,restaurant_id,organization_id,branch_id,addon_key,addon_version,
  units,status,effective_from,source,request_id,reason
) values (
  '7c5b0000-0000-4000-8000-000000000020',2,'7c5b0000-0000-4000-8000-000000000011',
  '7c5b0000-0000-4000-8000-000000000010','7c5b0000-0000-4000-8000-000000000012',
  'OFFER_CAPACITY',1,2,'ACTIVE','2026-09-29 10:05+00','TEST_FIXTURE',
  '7c5b0000-0000-4000-8000-000000000022','Local Phase 7C.5B capacity increase fixture'
);
set local session_replication_role = origin;
select public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-29 10:06+00','MANUAL_TEST',false);
select pg_temp.assert_true((select count(*)>0 from public.capacity_warning_episodes where warning_level='80' and status='RESOLVED' and resolve_reason='CAPACITY_INCREASE'),'capacity-increase rearm missing');

-- Restore a ten-slot fixture and create an open warning for owner acknowledgement.
set local session_replication_role = replica;
insert into public.restaurant_capacity_addon_entitlements (
  entitlement_key,revision,restaurant_id,organization_id,branch_id,addon_key,addon_version,
  units,status,effective_from,source,request_id,reason
) values (
  '7c5b0000-0000-4000-8000-000000000020',3,'7c5b0000-0000-4000-8000-000000000011',
  '7c5b0000-0000-4000-8000-000000000010','7c5b0000-0000-4000-8000-000000000012',
  'OFFER_CAPACITY',1,1,'ACTIVE','2026-09-29 10:07+00','TEST_FIXTURE',
  '7c5b0000-0000-4000-8000-000000000023','Local Phase 7C.5B restored capacity fixture'
);
set local session_replication_role = origin;
select public.evaluate_restaurant_capacity_warning_internal('7c5b0000-0000-4000-8000-000000000011','offer','2026-09-29 10:08+00','MANUAL_TEST',false);

-- Acknowledge is owner-only, idempotent, and page reads are write-free.
select set_config(
  'phase7c5b.audit_before_owner_read',
  (select count(*)::text from public.capacity_warning_audit),
  true
);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"7c5b0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $test$
declare warnings_before jsonb; warnings_after jsonb; episode_id_value uuid;
begin
  warnings_before:=public.get_owner_capacity_warnings('7c5b0000-0000-4000-8000-000000000011');
  warnings_after:=public.get_owner_capacity_warnings('7c5b0000-0000-4000-8000-000000000011');
  perform pg_temp.assert_true(warnings_before=warnings_after,'repeated owner reads were not stable');
  perform pg_temp.assert_true(jsonb_array_length(warnings_before)>0,'owner warning read returned no open app warning');
  select (item->>'episode_id')::uuid into episode_id_value from jsonb_array_elements(warnings_before) item limit 1;
  perform pg_temp.assert_true(public.acknowledge_owner_capacity_warning('7c5b0000-0000-4000-8000-000000000011',episode_id_value),'owner acknowledge failed');
  perform pg_temp.assert_true(public.acknowledge_owner_capacity_warning('7c5b0000-0000-4000-8000-000000000011',episode_id_value),'owner acknowledge replay failed');
end;
$test$;

select set_config('request.jwt.claims','{"sub":"7c5b0000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $test$ begin
  begin perform public.get_owner_capacity_warnings('7c5b0000-0000-4000-8000-000000000011'); raise exception 'staff read succeeded';
  exception when insufficient_privilege then null; end;
end $test$;
select set_config('request.jwt.claims','{"sub":"7c5b0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $test$ begin
  begin perform public.get_owner_capacity_warnings('7c5b0000-0000-4000-8000-000000000011'); raise exception 'cross-tenant read succeeded';
  exception when insufficient_privilege then null; end;
end $test$;
reset role;

select pg_temp.assert_true(
  (select count(*) from public.capacity_warning_audit)
    = current_setting('phase7c5b.audit_before_owner_read')::bigint + 1,
  'page read wrote state or acknowledge replay was not idempotent'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.capacity_warning_audit where event_type='APP_ACKNOWLEDGED'),
  'owner acknowledge audit was not exactly-once'
);
select pg_temp.assert_true(
  exists (
    select 1
    from public.capacity_warning_states state
    join public.capacity_warning_episodes episode on episode.id=state.active_episode_id
    join public.capacity_warning_deliveries delivery on delivery.warning_episode_id=episode.id
    where episode.status='OPEN' and delivery.channel='app' and delivery.status='ACKNOWLEDGED'
  ),
  'acknowledge changed the active warning or rearm state'
);

-- Repeated scheduler invocations for the same local business day are idempotent.
select public.run_capacity_warning_daily('2026-09-30 06:00+00');
select set_config(
  'phase7c5b.snapshot_count_after_daily',
  (select count(*)::text from public.capacity_usage_daily_snapshots
   where restaurant_id='7c5b0000-0000-4000-8000-000000000011'),
  true
);
select public.run_capacity_warning_daily('2026-09-30 06:00+00');
select pg_temp.assert_true(
  (select count(*) from public.capacity_usage_daily_snapshots
   where restaurant_id='7c5b0000-0000-4000-8000-000000000011')
    = current_setting('phase7c5b.snapshot_count_after_daily')::bigint,
  'repeated daily scheduler run duplicated snapshots'
);

select pg_temp.assert_true(not has_function_privilege('anon','public.get_owner_capacity_warnings(uuid)','execute'),'anonymous warning read execute present');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.evaluate_restaurant_capacity_warning_internal(uuid,text,timestamptz,text,boolean)','execute'),'internal evaluator exposed');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.capacity_warning_episodes','select'),'direct episode select exposed');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.capacity_warning_deliveries','insert'),'direct delivery insert exposed');

rollback;
select 'PHASE_7C5B_CAPACITY_WARNING_LOCAL_SQL_PASS';
