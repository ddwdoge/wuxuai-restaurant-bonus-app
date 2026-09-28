-- BASIC V1 security split:
-- 1. Paid activation requires a current accepted contract plus Seller, Tax,
--    provider and price readiness at checkout and immediately before active/paid.
-- 2. A free Austrian pilot may omit only payment-specific billing/Stripe checks.
--    Public country release remains untouched and the pilot remains fail-closed.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260928002000',0));

create table if not exists public.country_basic_pilot_policy_versions (
  country_code text not null references public.country_launch_policy(country_code),
  revision integer not null check (revision > 0),
  state text not null check (state in ('BLOCKED','APPROVED')),
  evidence_reference text not null check (length(trim(evidence_reference)) >= 10),
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  created_by text not null default session_user,
  revision_reason text not null check (length(trim(revision_reason)) >= 10),
  primary key (country_code,revision),
  check (valid_until is null or valid_until > valid_from)
);
alter table public.country_basic_pilot_policy_versions enable row level security;
revoke all on public.country_basic_pilot_policy_versions from public,anon,authenticated,service_role;
drop trigger if exists basic_pilot_policy_immutable on public.country_basic_pilot_policy_versions;
create trigger basic_pilot_policy_immutable before update or delete or truncate
  on public.country_basic_pilot_policy_versions for each statement
  execute function public.block_basic_billing_evidence_mutation();

insert into public.country_basic_pilot_policy_versions(
  country_code,revision,state,evidence_reference,valid_from,revision_reason
) values (
  'AT',1,'BLOCKED','FOUNDER_LEGAL_TAX_REVIEW_REQUIRED',statement_timestamp(),
  'Free-pilot policy remains blocked until legal and tax review is evidenced'
) on conflict do nothing;

create or replace function public.country_basic_pilot_readiness_snapshot(input_country text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  country_value text:=upper(trim(coalesce(input_country,'')));
  policy public.country_basic_pilot_policy_versions%rowtype;
  launch public.country_launch_policy%rowtype;
  required_keys constant text[]:=array[
    'legal','privacy','tax','translation','technical_smoke','required_documents'
  ];
  ready_checks integer:=0;
  checks jsonb:='[]'::jsonb;
  blockers text[]:=array[]::text[];
begin
  select * into launch from public.country_launch_policy where country_code=country_value;
  select * into policy from public.country_basic_pilot_policy_versions
    where country_code=country_value and valid_from<=statement_timestamp()
      and (valid_until is null or valid_until>statement_timestamp())
    order by revision desc limit 1;

  select count(*) filter (where status='ready'
      and length(trim(coalesce(evidence_ref,'')))>0
      and (valid_until is null or valid_until>statement_timestamp())
      and (check_key<>'required_documents' or (
        cardinality(document_version_refs)>0
        and not exists(select 1 from unnest(document_version_refs) ref
          where length(trim(coalesce(ref,'')))=0))))::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'key',check_key,
      'status',case when valid_until<=statement_timestamp() then 'expired' else status end,
      'document_version_refs',document_version_refs,
      'valid_until',valid_until,
      'updated_at',updated_at
    ) order by check_key),'[]'::jsonb)
  into ready_checks,checks
  from public.country_launch_readiness
  where country_code=country_value and check_key=any(required_keys);

  if country_value<>'AT' then blockers:=array_append(blockers,'PILOT_COUNTRY_NOT_AT'); end if;
  if launch.country_code is null or not launch.enabled then
    blockers:=array_append(blockers,'PILOT_TECHNICAL_REGISTRATION_NOT_READY');
  end if;
  if launch.market_status not in ('prepared','live') then
    blockers:=array_append(blockers,'PILOT_COUNTRY_STATE_BLOCKED');
  end if;
  if policy.country_code is null or policy.state<>'APPROVED' then
    blockers:=array_append(blockers,'PILOT_POLICY_NOT_APPROVED');
  end if;
  if coalesce(ready_checks,0)<>cardinality(required_keys) then
    blockers:=array_append(blockers,'PILOT_NONPAYMENT_READINESS_INCOMPLETE');
  end if;

  return jsonb_build_object(
    'ready',cardinality(blockers)=0,
    'country_code',country_value,
    'market_status',launch.market_status,
    'public_country_release_changed',false,
    'policy_revision',policy.revision,
    'policy_state',coalesce(policy.state,'BLOCKED'),
    'required_checks',required_keys,
    'checks',checks,
    'billing_configuration_required',false,
    'stripe_configuration_required',false,
    'blockers',to_jsonb(blockers)
  );
end
$function$;
revoke all on function public.country_basic_pilot_readiness_snapshot(text)
  from public,anon,authenticated,service_role;

create or replace function public.vienna_calendar_month_boundary_internal(
  input_started_at timestamptz,input_months smallint
) returns timestamptz language sql immutable security definer
set search_path=pg_catalog,pg_temp as $function$
  select case when input_started_at is null or input_months not in (1,3) then null
    else ((input_started_at at time zone 'Europe/Vienna')
      + make_interval(months=>input_months)) at time zone 'Europe/Vienna' end
$function$;
revoke all on function public.vienna_calendar_month_boundary_internal(timestamptz,smallint)
  from public,anon,authenticated,service_role;

create or replace function public.vienna_calendar_day_boundary_internal(
  input_started_at timestamptz,input_days integer
) returns timestamptz language sql immutable security definer
set search_path=pg_catalog,pg_temp as $function$
  select case when input_started_at is null or input_days<=0 then null
    else ((input_started_at at time zone 'Europe/Vienna')
      + make_interval(days=>input_days)) at time zone 'Europe/Vienna' end
$function$;
revoke all on function public.vienna_calendar_day_boundary_internal(timestamptz,integer)
  from public,anon,authenticated,service_role;

alter table public.manual_basic_trial_decisions
  add column if not exists pilot_readiness_snapshot jsonb,
  add column if not exists boundary_timezone text
    check (boundary_timezone is null or boundary_timezone='Europe/Vienna');

do $ddl$
begin
  if exists(select 1 from pg_catalog.pg_constraint
    where conrelid='public.manual_basic_trial_decisions'::regclass
      and conname='manual_basic_trial_decisions_check') then
    alter table public.manual_basic_trial_decisions
      drop constraint manual_basic_trial_decisions_check;
  end if;
  if not exists(select 1 from pg_catalog.pg_constraint
    where conrelid='public.manual_basic_trial_decisions'::regclass
      and conname='manual_basic_trial_vienna_boundary_contract') then
    alter table public.manual_basic_trial_decisions
      add constraint manual_basic_trial_vienna_boundary_contract check (
        ends_at>starts_at and (
          (boundary_timezone is null
            and ends_at=starts_at+make_interval(months=>calendar_months::integer))
          or (boundary_timezone='Europe/Vienna'
            and ends_at=public.vienna_calendar_month_boundary_internal(starts_at,calendar_months))
        )
      ) not valid;
  end if;
end
$ddl$;

alter table public.basic_post_trial_redemption_grace
  add column if not exists boundary_timezone text
    check (boundary_timezone is null or boundary_timezone='Europe/Vienna');

do $ddl$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname from pg_catalog.pg_constraint c
    where c.conrelid='public.basic_post_trial_redemption_grace'::regclass
      and c.contype='c'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%ends_at%starts_at%60 days%'
  loop
    execute format('alter table public.basic_post_trial_redemption_grace drop constraint %I',constraint_name);
  end loop;
  if not exists(select 1 from pg_catalog.pg_constraint
    where conrelid='public.basic_post_trial_redemption_grace'::regclass
      and conname='basic_grace_vienna_boundary_contract') then
    alter table public.basic_post_trial_redemption_grace
      add constraint basic_grace_vienna_boundary_contract check (
        (boundary_timezone is null and ends_at=starts_at+interval '60 days')
        or (boundary_timezone='Europe/Vienna'
          and ends_at=public.vienna_calendar_day_boundary_internal(starts_at,60))
      ) not valid;
  end if;
end
$ddl$;

create or replace function public.create_basic_trial_grace_internal()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
begin
  insert into public.basic_post_trial_redemption_grace(
    trial_decision_id,restaurant_id,organization_id,branch_id,starts_at,ends_at,boundary_timezone
  ) values (
    new.id,new.restaurant_id,new.organization_id,new.branch_id,new.ends_at,
    public.vienna_calendar_day_boundary_internal(new.ends_at,60),'Europe/Vienna'
  ) on conflict (trial_decision_id) do nothing;
  return new;
end
$function$;
revoke all on function public.create_basic_trial_grace_internal()
  from public,anon,authenticated,service_role;
drop trigger if exists create_basic_trial_grace on public.manual_basic_trial_decisions;
create trigger create_basic_trial_grace
  after insert on public.manual_basic_trial_decisions
  for each row execute function public.create_basic_trial_grace_internal();

insert into public.basic_post_trial_redemption_grace(
  trial_decision_id,restaurant_id,organization_id,branch_id,starts_at,ends_at,boundary_timezone
)
select d.id,d.restaurant_id,d.organization_id,d.branch_id,d.ends_at,
  public.vienna_calendar_day_boundary_internal(d.ends_at,60),'Europe/Vienna'
from public.manual_basic_trial_decisions d
where not exists(select 1 from public.basic_post_trial_redemption_grace g
  where g.trial_decision_id=d.id)
on conflict do nothing;

create or replace function public.get_platform_basic_pilot_readiness(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  role_value text:=public.current_platform_role();
  r public.restaurants%rowtype;
  b public.branches%rowtype;
  s public.branch_subscriptions%rowtype;
  country_snapshot jsonb;
  blockers text[]:=array[]::text[];
  legal_ready boolean:=false;
  kassa_ready boolean:=false;
begin
  if auth.uid() is null or role_value not in ('platform_owner','platform_admin') then
    raise exception 'PLATFORM_BASIC_PILOT_READ_REQUIRED' using errcode='42501';
  end if;
  select * into r from public.restaurants where id=input_restaurant_id;
  select * into b from public.branches where id=r.primary_branch_id
    and restaurant_id=r.id and organization_id=r.organization_id;
  select * into s from public.branch_subscriptions where branch_id=b.id
    and organization_id=r.organization_id;
  if r.id is null or b.id is null or s.id is null then
    return jsonb_build_object('ready',false,'blockers',jsonb_build_array('PILOT_TENANT_NOT_FOUND'));
  end if;
  country_snapshot:=public.country_basic_pilot_readiness_snapshot(upper(b.country));
  legal_ready:=public.legal_operator_publication_ready_internal(r.id,statement_timestamp());
  kassa_ready:=exists(select 1 from public.kassa_compliance_acknowledgements a
    join public.restaurant_members m on m.restaurant_id=a.restaurant_id and m.user_id=a.user_id
      and m.role in ('owner','admin')
    where a.restaurant_id=r.id and a.text_version='kassa-separation-de-v1');
  if upper(b.country)<>'AT' then blockers:=array_append(blockers,'PILOT_COUNTRY_NOT_AT'); end if;
  if coalesce((country_snapshot->>'ready')::boolean,false) is not true then
    blockers:=blockers||array(select jsonb_array_elements_text(country_snapshot->'blockers'));
  end if;
  if not legal_ready then blockers:=array_append(blockers,'PILOT_LEGAL_KYB_NOT_READY'); end if;
  if not kassa_ready then blockers:=array_append(blockers,'PILOT_KASSA_NOT_READY'); end if;
  if r.activation_status is distinct from 'pending_activation' or r.status<>'draft'
    or s.status<>'pending_activation' or s.subscription_status<>'pending_activation'
    or s.plan_key<>'BASIC' or s.selected_plan is distinct from 'BASIC'
    or s.payment_status<>'not_required' or s.trial_started_at is not null
    or s.trial_ends_at is not null or s.stripe_customer_id is not null
    or s.stripe_subscription_id is not null then
    blockers:=array_append(blockers,'PILOT_PENDING_BASELINE_REQUIRED');
  end if;
  return jsonb_build_object(
    'ready',cardinality(blockers)=0,
    'restaurant_id',r.id,
    'restaurant_name',r.name,
    'country_code',upper(b.country),
    'subscription_status',s.subscription_status,
    'payment_status',s.payment_status,
    'legal_operator_ready',legal_ready,
    'kassa_ready',kassa_ready,
    'country_readiness',country_snapshot,
    'blockers',to_jsonb(blockers)
  );
end
$function$;
revoke all on function public.get_platform_basic_pilot_readiness(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_basic_pilot_readiness(uuid) to authenticated;

create or replace function public.activate_v1_manual_basic_trial(
  input_restaurant_id uuid,input_calendar_months smallint,input_reason text,
  input_confirmation text,input_request_id uuid,input_correlation_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  actor uuid:=auth.uid(); role_value text:=public.current_platform_role();
  started timestamptz:=statement_timestamp(); finished timestamptz;
  r public.restaurants%rowtype; b public.branches%rowtype; s public.branch_subscriptions%rowtype;
  existing public.manual_basic_trial_decisions%rowtype;
  decision public.manual_basic_trial_decisions%rowtype;
  before_value jsonb; after_value jsonb; readiness jsonb;
begin
  if actor is null or role_value not in ('platform_owner','platform_admin') then
    raise exception 'MANUAL_TRIAL_NOT_AUTHORIZED' using errcode='42501';
  end if;
  perform public.require_recent_platform_auth_internal();
  if input_restaurant_id is null or input_calendar_months not in (1,3)
    or input_request_id is null or input_correlation_id is null
    or length(trim(coalesce(input_reason,'')))<10 then
    raise exception 'MANUAL_TRIAL_REQUEST_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('manual-basic-trial:'||input_restaurant_id::text,0));
  select * into r from public.restaurants where id=input_restaurant_id for update;
  if r.id is null or input_confirmation is distinct from
    'BASIC-TRIAL '||r.name||' '||input_calendar_months::text||' MONATE AKTIVIEREN' then
    raise exception 'MANUAL_TRIAL_CONFIRMATION_REQUIRED' using errcode='22023';
  end if;
  select * into existing from public.manual_basic_trial_decisions
    where request_id=input_request_id or restaurant_id=r.id order by created_at limit 1;
  if existing.id is not null then
    if existing.request_id=input_request_id and existing.restaurant_id=r.id
      and existing.calendar_months=input_calendar_months
      and existing.reason=trim(input_reason) then
      return existing.after_state||jsonb_build_object('idempotent',true);
    end if;
    raise exception 'MANUAL_TRIAL_ALREADY_DECIDED' using errcode='23505';
  end if;
  select * into b from public.branches where id=r.primary_branch_id and restaurant_id=r.id
    and organization_id=r.organization_id for update;
  select * into s from public.branch_subscriptions where branch_id=b.id
    and organization_id=r.organization_id for update;
  if upper(b.country)<>'AT' then
    raise exception 'MANUAL_TRIAL_AT_REQUIRED' using errcode='42501';
  end if;
  if r.activation_status is distinct from 'pending_activation' or r.status<>'draft'
    or b.id is null or s.id is null or s.status<>'pending_activation'
    or s.subscription_status<>'pending_activation' or s.plan_key<>'BASIC'
    or s.selected_plan is distinct from 'BASIC' or s.payment_status<>'not_required'
    or s.trial_started_at is not null or s.trial_ends_at is not null
    or s.current_period_start is not null or s.current_period_end is not null
    or s.current_period_ends_at is not null or s.stripe_customer_id is not null
    or s.stripe_subscription_id is not null
    or exists(select 1 from public.billing_trial_claims c
      where c.organization_id=r.organization_id or c.restaurant_id=r.id) then
    raise exception 'MANUAL_TRIAL_PENDING_BASELINE_REQUIRED' using errcode='42501';
  end if;
  readiness:=public.country_basic_pilot_readiness_snapshot('AT');
  if coalesce((readiness->>'ready')::boolean,false) is not true then
    raise exception 'MANUAL_TRIAL_PILOT_READINESS_NOT_READY' using errcode='42501';
  end if;
  if not public.legal_operator_publication_ready_internal(r.id,statement_timestamp()) then
    raise exception 'MANUAL_TRIAL_LEGAL_KYB_NOT_READY' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.kassa_compliance_acknowledgements a
    join public.restaurant_members m on m.restaurant_id=a.restaurant_id and m.user_id=a.user_id
      and m.role in ('owner','admin')
    where a.restaurant_id=r.id and a.text_version='kassa-separation-de-v1'
  ) then
    raise exception 'KASSA_ACKNOWLEDGEMENT_REQUIRED' using errcode='42501';
  end if;
  finished:=public.vienna_calendar_month_boundary_internal(started,input_calendar_months);
  before_value:=jsonb_build_object('restaurant',to_jsonb(r),'subscription',to_jsonb(s),
    'pilot_readiness',readiness);
  after_value:=jsonb_build_object('restaurant_id',r.id,'organization_id',r.organization_id,
    'branch_id',b.id,'subscription_id',s.id,'plan_key','BASIC','subscription_status','trialing',
    'payment_status','not_required','calendar_months',input_calendar_months,
    'starts_at',started,'ends_at',finished,'boundary_timezone','Europe/Vienna',
    'paid_followup_acceptance_required',true,
    'post_trial_points_rewards_contract','REDEMPTION_ONLY_60_CALENDAR_DAYS',
    'stripe_required',false,'public_country_release_changed',false);
  insert into public.manual_basic_trial_decisions(restaurant_id,organization_id,branch_id,
    subscription_id,calendar_months,starts_at,ends_at,actor_id,request_id,correlation_id,
    reason,before_state,after_state,pilot_readiness_snapshot,boundary_timezone)
  values(r.id,r.organization_id,b.id,s.id,input_calendar_months,started,finished,actor,
    input_request_id,input_correlation_id,trim(input_reason),before_value,after_value,readiness,
    'Europe/Vienna')
  returning * into decision;
  insert into public.country_launch_creation_context(
    transaction_id,actor_id,country_code,purpose,restaurant_id
  ) values(txid_current(),actor,'AT','ONBOARDING',r.id);
  perform set_config('wuxuai.manual_trial_activation_restaurant',r.id::text,true);
  update public.restaurants set activation_status=null,status='active',operational_ready=true,
    security_ready=true,legal_ready=true,onboarding_status='completed' where id=r.id;
  update public.branches set status='active' where id=b.id;
  update public.branch_subscriptions set status='trialing',subscription_status='trialing',
    plan_key='BASIC',selected_plan='BASIC',payment_status='not_required',
    trial_started_at=started,trial_ends_at=finished,current_period_start=started,
    current_period_end=finished,current_period_ends_at=finished where id=s.id;
  insert into public.billing_trial_claims(
    organization_id,restaurant_id,provider_event_reference,claimed_at,created_by
  ) values(r.organization_id,r.id,'manual-aal2:'||decision.id::text,started,actor::text);
  delete from public.country_launch_creation_context
    where transaction_id=txid_current() and actor_id=actor and purpose='ONBOARDING'
      and restaurant_id=r.id;
  return after_value||jsonb_build_object('decision_id',decision.id,'idempotent',false);
end
$function$;
revoke all on function public.activate_v1_manual_basic_trial(uuid,smallint,text,text,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.activate_v1_manual_basic_trial(uuid,smallint,text,text,uuid,uuid)
  to authenticated;

create or replace function public.basic_paid_activation_readiness_internal(
  input_acceptance_id uuid,input_environment text,input_price_id text,input_livemode boolean
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  a public.basic_paid_offer_acceptances%rowtype;
  r public.restaurants%rowtype; b public.branches%rowtype;
  catalog public.billing_catalog_internal%rowtype;
  seller public.billing_seller_versions%rowtype;
  tax public.billing_tax_readiness_versions%rowtype;
  binding public.billing_provider_binding_versions%rowtype;
  blockers text[]:=array[]::text[];
begin
  select * into a from public.basic_paid_offer_acceptances where id=input_acceptance_id;
  select * into r from public.restaurants where id=a.restaurant_id;
  select * into b from public.branches where id=a.branch_id and restaurant_id=r.id
    and organization_id=r.organization_id;
  select * into catalog from public.billing_catalog_internal
    where product_code='BASIC' and product_kind='PLAN' and version=a.catalog_version
      and active and valid_from<=statement_timestamp();
  select * into seller from public.billing_seller_versions
    where valid_from<=statement_timestamp() order by version desc limit 1;
  select * into tax from public.billing_tax_readiness_versions
    where seller_version=seller.version and provider='STRIPE' and environment=input_environment
    order by revision desc limit 1;
  select * into binding from public.billing_provider_binding_versions
    where product_code='BASIC' and catalog_version=a.catalog_version and provider='STRIPE'
      and environment=input_environment and valid_from<=statement_timestamp()
    order by revision desc limit 1;

  if input_environment not in ('TEST','LIVE')
    or input_livemode is distinct from (input_environment='LIVE') then
    blockers:=array_append(blockers,'PAID_ENVIRONMENT_MISMATCH');
  end if;
  if input_environment='TEST' and not exists(
    select 1 from public.platform_test_tenant_registry marker
    where marker.restaurant_id=r.id and marker.deleted_at is null
  ) then
    blockers:=array_append(blockers,'PAID_TEST_ONLY_REQUIRED');
  end if;
  if a.id is null or a.terms_version<>'basic-paid-v1-2026-09-28'
    or a.amount_minor<>5900 or a.currency<>'EUR' or a.billing_interval<>'MONTH'
    or a.organization_id is distinct from r.organization_id
    or a.branch_id is distinct from b.id
    or not exists(select 1 from public.restaurant_members m
      where m.restaurant_id=r.id and m.organization_id=r.organization_id
        and m.user_id=a.actor_id and m.role='owner')
    or r.owner_id is distinct from a.actor_id then
    blockers:=array_append(blockers,'PAID_ACCEPTED_CONTRACT_INVALID');
  end if;
  if catalog.product_code is null or catalog.monthly_price_minor<>a.amount_minor
    or catalog.currency<>a.currency then
    blockers:=array_append(blockers,'PAID_CATALOG_INVALID');
  end if;
  if (input_environment='TEST' and seller.readiness not in ('TEST_READY','LIVE_READY'))
    or (input_environment='LIVE' and seller.readiness<>'LIVE_READY') then
    blockers:=array_append(blockers,'PAID_SELLER_NOT_READY');
  end if;
  if tax.readiness_status is distinct from 'VERIFIED'
    or tax.account_country is distinct from upper(b.country)
    or tax.observed_provider_tax_behavior='UNSPECIFIED'
    or tax.verified_at is null or nullif(trim(tax.verified_by),'') is null then
    blockers:=array_append(blockers,'PAID_TAX_NOT_READY');
  end if;
  if binding.binding_status is distinct from 'VERIFIED'
    or binding.price_id is distinct from input_price_id
    or binding.price_livemode is distinct from input_livemode
    or binding.price_currency is distinct from a.currency
    or binding.price_interval is distinct from a.billing_interval
    or binding.price_amount_minor is distinct from a.amount_minor
    or binding.price_usage_type is distinct from 'licensed'
    or binding.price_billing_scheme is distinct from 'per_unit'
    or nullif(trim(binding.lookup_key),'') is null then
    blockers:=array_append(blockers,'PAID_PROVIDER_PRICE_BINDING_INVALID');
  end if;
  if coalesce((public.country_launch_readiness_snapshot(upper(b.country))->>'ready')::boolean,false)
    is not true then
    blockers:=array_append(blockers,'PAID_COUNTRY_NOT_READY');
  end if;
  if not public.legal_operator_publication_ready_internal(r.id,statement_timestamp()) then
    blockers:=array_append(blockers,'PAID_LEGAL_KYB_NOT_READY');
  end if;
  if not exists(select 1 from public.kassa_compliance_acknowledgements k
    join public.restaurant_members m on m.restaurant_id=k.restaurant_id and m.user_id=k.user_id
      and m.role in ('owner','admin')
    where k.restaurant_id=r.id and k.text_version='kassa-separation-de-v1') then
    blockers:=array_append(blockers,'PAID_KASSA_NOT_READY');
  end if;
  return jsonb_build_object(
    'ready',cardinality(blockers)=0,
    'acceptance_id',a.id,
    'restaurant_id',r.id,
    'environment',input_environment,
    'livemode',input_livemode,
    'seller_readiness',seller.readiness,
    'tax_readiness',tax.readiness_status,
    'provider_binding_status',binding.binding_status,
    'blockers',to_jsonb(blockers)
  );
end
$function$;
revoke all on function public.basic_paid_activation_readiness_internal(uuid,text,text,boolean)
  from public,anon,authenticated,service_role;

create or replace function public.prepare_basic_test_checkout(
  input_acceptance_id uuid,input_request_id uuid,input_return_route text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare actor uuid:=auth.uid(); a public.basic_paid_offer_acceptances%rowtype;
  existing public.basic_test_checkout_requests%rowtype; s public.branch_subscriptions%rowtype;
  d public.manual_basic_trial_decisions%rowtype;
  binding public.billing_provider_binding_versions%rowtype;
  request_hash text; created public.basic_test_checkout_requests%rowtype; readiness jsonb;
begin
  if actor is null or auth.role() is distinct from 'authenticated' or input_acceptance_id is null
    or input_request_id is null or input_return_route is distinct from '/admin/settings/konto-testphase' then
    raise exception 'BASIC_TEST_CHECKOUT_INVALID' using errcode='42501';
  end if;
  select acceptance.* into a from public.basic_paid_offer_acceptances acceptance
    join public.restaurants r on r.id=acceptance.restaurant_id and r.owner_id=actor
    join public.restaurant_members m on m.restaurant_id=r.id and m.user_id=actor and m.role='owner'
    where acceptance.id=input_acceptance_id;
  if a.id is null then raise exception 'BASIC_TEST_CHECKOUT_OWNER_REQUIRED' using errcode='42501'; end if;
  select * into s from public.branch_subscriptions where id=a.subscription_id for update;
  select * into d from public.manual_basic_trial_decisions where id=a.trial_decision_id;
  if a.acceptance_kind='INITIAL' and (d.ends_at>statement_timestamp()
      or s.subscription_status<>'trialing' or s.payment_status<>'not_required') then
    raise exception 'BASIC_TEST_CHECKOUT_TRIAL_ACTIVE' using errcode='42501';
  elsif a.acceptance_kind='REACTIVATION' and (s.subscription_status<>'cancelled'
      or s.status<>'cancelled' or s.stripe_subscription_id is distinct from a.prior_provider_subscription_id) then
    raise exception 'BASIC_TEST_CHECKOUT_REACTIVATION_STATE_INVALID' using errcode='42501';
  end if;
  select * into binding from public.billing_provider_binding_versions
    where product_code='BASIC' and catalog_version=a.catalog_version and provider='STRIPE'
      and environment='TEST' and valid_from<=statement_timestamp()
    order by revision desc limit 1;
  readiness:=public.basic_paid_activation_readiness_internal(a.id,'TEST',binding.price_id,false);
  if coalesce((readiness->>'ready')::boolean,false) is not true then
    raise exception 'BASIC_PAID_READINESS_BLOCKED' using errcode='42501';
  end if;
  request_hash:=encode(extensions.digest(a.id::text||':'||input_return_route,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('basic-test-checkout:'||a.restaurant_id::text||':'||input_request_id::text,0));
  select * into existing from public.basic_test_checkout_requests
    where restaurant_id=a.restaurant_id and request_id=input_request_id;
  if existing.id is not null then
    if existing.acceptance_id<>a.id or existing.actor_id<>actor or existing.payload_sha256<>request_hash then
      raise exception 'BASIC_TEST_CHECKOUT_PAYLOAD_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('checkout_request_id',existing.id,'status',existing.status,
      'price_id',existing.price_id,'restaurant_id',existing.restaurant_id,
      'acceptance_id',existing.acceptance_id,'correlation_id',a.correlation_id,'idempotent',true,
      'acceptance_kind',a.acceptance_kind);
  end if;
  insert into public.basic_test_checkout_requests(acceptance_id,restaurant_id,subscription_id,
    actor_id,request_id,return_route,payload_sha256,price_id)
  values(a.id,a.restaurant_id,a.subscription_id,actor,input_request_id,input_return_route,
    request_hash,binding.price_id) returning * into created;
  return jsonb_build_object('checkout_request_id',created.id,'status','PREPARED',
    'price_id',created.price_id,'restaurant_id',created.restaurant_id,
    'acceptance_id',created.acceptance_id,'correlation_id',a.correlation_id,'idempotent',false,
    'acceptance_kind',a.acceptance_kind);
end
$function$;

create or replace function public.complete_basic_test_checkout(
  input_checkout_request_id uuid,input_provider_session_id text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare c public.basic_test_checkout_requests%rowtype; readiness jsonb;
begin
  if auth.role() is distinct from 'service_role' or input_checkout_request_id is null
    or input_provider_session_id!~'^cs_test_[A-Za-z0-9_]{8,160}$' then
    raise exception 'BASIC_TEST_CHECKOUT_SERVICE_REQUIRED' using errcode='42501';
  end if;
  select * into c from public.basic_test_checkout_requests where id=input_checkout_request_id for update;
  if c.id is null then raise exception 'BASIC_TEST_CHECKOUT_NOT_FOUND' using errcode='P0002'; end if;
  readiness:=public.basic_paid_activation_readiness_internal(c.acceptance_id,'TEST',c.price_id,false);
  if coalesce((readiness->>'ready')::boolean,false) is not true then
    raise exception 'BASIC_PAID_READINESS_BLOCKED' using errcode='42501';
  end if;
  if c.provider_session_id is not null and c.provider_session_id<>input_provider_session_id then
    raise exception 'BASIC_TEST_CHECKOUT_SESSION_CONFLICT' using errcode='23505';
  end if;
  update public.basic_test_checkout_requests set provider_session_id=input_provider_session_id,
    status='SESSION_CREATED',updated_at=clock_timestamp() where id=c.id;
  return jsonb_build_object('checkout_request_id',c.id,'status','SESSION_CREATED');
end
$function$;

create or replace function public.guard_billing_activation_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare tenant uuid; actions jsonb; context_record public.basic_test_billing_write_context%rowtype;
  checkout_record public.basic_test_checkout_requests%rowtype; readiness jsonb;
  activation_context text:=current_setting('wuxuai.manual_trial_activation_restaurant',true);
begin
  select restaurant_id into tenant from public.branches where id=coalesce(new.branch_id,old.branch_id);
  select * into context_record from public.basic_test_billing_write_context where transaction_id=txid_current();
  if tg_op='UPDATE' and context_record.subscription_id=old.id and auth.role()='service_role'
    and new.id=old.id and new.branch_id=old.branch_id and new.organization_id=old.organization_id
    and new.plan_key='BASIC' and new.selected_plan='BASIC'
    and new.trial_started_at is not distinct from old.trial_started_at
    and new.trial_ends_at is not distinct from old.trial_ends_at then
    if context_record.action in ('CHECKOUT_BOUND','PAYMENT_CONFIRMED') then
      select * into checkout_record from public.basic_test_checkout_requests
        where subscription_id=old.id order by created_at desc,id desc limit 1;
      readiness:=public.basic_paid_activation_readiness_internal(
        checkout_record.acceptance_id,'TEST',checkout_record.price_id,false);
      if coalesce((readiness->>'ready')::boolean,false) is not true then
        raise exception 'BASIC_PAID_READINESS_BLOCKED' using errcode='42501';
      end if;
    end if;
    if context_record.action='CHECKOUT_BOUND' and new.subscription_status=old.subscription_status
      and new.status=old.status and new.payment_status='pending'
      and new.stripe_customer_id is not null and new.stripe_subscription_id is not null then return new; end if;
    if context_record.action='PAYMENT_CONFIRMED' and new.subscription_status='active'
      and new.status='active' and new.payment_status='paid' and new.current_period_start is not null
      and new.current_period_end>new.current_period_start
      and new.current_period_ends_at=new.current_period_end
      and new.stripe_customer_id is not null and new.stripe_subscription_id is not null then return new; end if;
    if context_record.action='PAYMENT_FAILED' and new.subscription_status='past_due'
      and new.status='past_due' and new.payment_status='failed' then return new; end if;
    if context_record.action='CANCELLED' and new.subscription_status='cancelled'
      and new.status='cancelled' and new.payment_status in ('failed','paid') then return new; end if;
    raise exception 'BASIC_TEST_PROVIDER_TRANSITION_INVALID' using errcode='42501';
  end if;
  if tg_op='UPDATE' and activation_context=tenant::text
    and public.current_platform_role() in ('platform_owner','platform_admin')
    and public.platform_totp_aal2_verified_internal() then
    if old.status='pending_activation' and old.subscription_status='pending_activation'
      and old.payment_status='not_required' and old.trial_started_at is null
      and old.trial_ends_at is null and old.stripe_customer_id is null
      and old.stripe_subscription_id is null and new.id=old.id
      and new.branch_id=old.branch_id and new.organization_id=old.organization_id
      and new.status='trialing' and new.subscription_status='trialing'
      and new.plan_key='BASIC' and new.selected_plan='BASIC'
      and new.payment_status='not_required' and new.trial_started_at is not null
      and new.trial_ends_at in (
        public.vienna_calendar_month_boundary_internal(new.trial_started_at,1::smallint),
        public.vienna_calendar_month_boundary_internal(new.trial_started_at,3::smallint))
      and new.current_period_start=new.trial_started_at and new.current_period_end=new.trial_ends_at
      and new.current_period_ends_at=new.trial_ends_at and new.stripe_customer_id is null
      and new.stripe_subscription_id is null
      and exists(select 1 from public.manual_basic_trial_decisions d where d.restaurant_id=tenant
        and d.subscription_id=new.id and d.starts_at=new.trial_started_at and d.ends_at=new.trial_ends_at
        and coalesce((d.pilot_readiness_snapshot->>'ready')::boolean,false)) then
      return new;
    end if;
    raise exception 'MANUAL_TRIAL_BILLING_TRANSITION_INVALID' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    if new.subscription_status is distinct from 'pending_activation' or new.status is distinct from 'pending_activation'
      or new.payment_status is distinct from 'not_required' or new.trial_started_at is not null
      or new.trial_ends_at is not null or new.stripe_customer_id is not null
      or new.stripe_subscription_id is not null or new.current_period_start is not null
      or new.current_period_end is not null or new.current_period_ends_at is not null then
      raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501';
    end if; return new;
  end if;
  if new.id is distinct from old.id or new.branch_id is distinct from old.branch_id
    or new.organization_id is distinct from old.organization_id
    or new.payment_status is distinct from old.payment_status
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.current_period_start is distinct from old.current_period_start
    or new.current_period_end is distinct from old.current_period_end
    or new.current_period_ends_at is distinct from old.current_period_ends_at
    or new.trial_started_at is distinct from old.trial_started_at
    or (new.plan_key is distinct from old.plan_key and new.plan_key<>'BASIC')
    or (new.subscription_status is distinct from old.subscription_status and new.subscription_status not in ('paused','cancelled','unpaid'))
    or (new.status is distinct from old.status and new.status not in ('paused','cancelled','unpaid')) then
    raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501';
  end if;
  if new.trial_ends_at is distinct from old.trial_ends_at then
    actions:=public.billing_admin_actions_internal(tenant);
    if coalesce((actions->>'extend_trial')::boolean,false) is not true
      or new.status<>'trialing' or new.subscription_status<>'trialing'
      or new.plan_key is distinct from old.plan_key or new.trial_ends_at is null
      or not isfinite(new.trial_ends_at) or new.trial_ends_at<=old.trial_ends_at
      or not exists(select 1 from public.billing_admin_write_context c where c.transaction_id=txid_current()
        and c.subscription_id=old.id and c.actor_id=auth.uid() and c.expected_trial_end=new.trial_ends_at) then
      raise exception 'BILLING_HISTORICAL_TRIAL_REQUIRED' using errcode='42501';
    end if;
  end if;
  return new;
end
$function$;

create or replace function public.record_basic_stripe_test_event(
  input_event_id text,input_payload_sha256 text,input_event_type text,input_event_created_at timestamptz,
  input_provider_session_id text,input_provider_customer_id text,input_provider_subscription_id text,
  input_restaurant_id uuid,input_acceptance_id uuid,input_provider_status text,
  input_period_start timestamptz,input_period_end timestamptz,input_request_id uuid,input_correlation_id uuid,
  input_livemode boolean
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare prior public.basic_stripe_test_event_inbox%rowtype; c public.basic_test_checkout_requests%rowtype;
  a public.basic_paid_offer_acceptances%rowtype; s public.branch_subscriptions%rowtype;
  d public.manual_basic_trial_decisions%rowtype; readiness jsonb;
  result text:='UNMATCHED'; action_value text; result_code text:='CHECKOUT_NOT_FOUND';
  state_valid boolean:=false;
begin
  if auth.role() is distinct from 'service_role' or input_livemode is distinct from false
    or input_event_id!~'^evt_[A-Za-z0-9_]{8,160}$' or input_payload_sha256!~'^[0-9a-f]{64}$'
    or input_event_type not in ('checkout.session.completed','customer.subscription.created',
      'customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed')
    or input_event_created_at is null then
    raise exception 'BASIC_TEST_WEBHOOK_INVALID' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('basic-stripe-event:'||input_event_id,0));
  select * into prior from public.basic_stripe_test_event_inbox where event_id=input_event_id;
  if prior.event_id is not null then
    if prior.payload_sha256<>input_payload_sha256 then
      raise exception 'BASIC_TEST_WEBHOOK_HASH_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('event_id',input_event_id,'status',prior.processing_status,'replay',true);
  end if;
  if input_provider_session_id is not null then
    select * into c from public.basic_test_checkout_requests where provider_session_id=input_provider_session_id for update;
  elsif input_provider_subscription_id is not null then
    select * into c from public.basic_test_checkout_requests where provider_subscription_id=input_provider_subscription_id for update;
  end if;
  if c.id is null and input_acceptance_id is not null then
    select * into c from public.basic_test_checkout_requests
      where acceptance_id=input_acceptance_id and status in ('PREPARED','SESSION_CREATED','COMPLETED')
      order by created_at desc,id desc limit 1 for update;
  end if;
  if c.id is not null then
    select * into a from public.basic_paid_offer_acceptances where id=c.acceptance_id;
    select * into s from public.branch_subscriptions where id=c.subscription_id for update;
    select * into d from public.manual_basic_trial_decisions where id=a.trial_decision_id;
    readiness:=public.basic_paid_activation_readiness_internal(a.id,'TEST',c.price_id,false);
    state_valid:=(a.acceptance_kind='INITIAL' and d.ends_at<=statement_timestamp()
        and ((s.subscription_status='trialing' and s.payment_status in ('not_required','pending'))
          or (s.subscription_status='past_due' and s.payment_status='failed')))
      or (a.acceptance_kind='REACTIVATION'
        and ((s.subscription_status='cancelled' and s.status='cancelled')
          or (s.subscription_status='past_due' and s.payment_status='failed')));
  end if;
  if c.id is not null and a.id=input_acceptance_id and a.restaurant_id=input_restaurant_id then
    if exists(select 1 from public.basic_stripe_test_event_inbox event
      where event.provider_subscription_id=input_provider_subscription_id
        and event.event_created_at>input_event_created_at and event.processing_status='PROCESSED') then
      result:='STALE'; result_code:='OLDER_THAN_PROCESSED_EVENT';
    elsif input_event_type in ('checkout.session.completed','invoice.paid')
      and coalesce((readiness->>'ready')::boolean,false) is not true then
      result:='REJECTED'; result_code:='BASIC_PAID_READINESS_BLOCKED';
    elsif input_event_type='checkout.session.completed' and state_valid
      and input_provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$'
      and input_provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'
      and (c.provider_subscription_id is null or c.provider_subscription_id=input_provider_subscription_id)
      and (c.provider_customer_id is null or c.provider_customer_id=input_provider_customer_id) then
      action_value:='CHECKOUT_BOUND'; result:='PROCESSED'; result_code:='CHECKOUT_BOUND';
    elsif input_event_type='invoice.paid' and state_valid
      and input_provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$'
      and input_provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'
      and (c.provider_subscription_id is null or c.provider_subscription_id=input_provider_subscription_id)
      and (c.provider_customer_id is null or c.provider_customer_id=input_provider_customer_id)
      and input_period_start is not null and input_period_end>input_period_start then
      action_value:='PAYMENT_CONFIRMED'; result:='PROCESSED'; result_code:='BASIC_PAYMENT_CONFIRMED';
    elsif input_event_type='invoice.payment_failed'
      and input_provider_subscription_id is not null
      and c.provider_subscription_id=input_provider_subscription_id then
      action_value:='PAYMENT_FAILED'; result:='PROCESSED'; result_code:='BASIC_PAYMENT_FAILED';
    elsif input_event_type='customer.subscription.deleted'
      and input_provider_subscription_id is not null
      and c.provider_subscription_id=input_provider_subscription_id then
      action_value:='CANCELLED'; result:='PROCESSED'; result_code:='BASIC_SUBSCRIPTION_CANCELLED';
    else result:='REJECTED'; result_code:='EVENT_NOT_STATE_CHANGING';
    end if;
  end if;
  if action_value is not null then
    insert into public.basic_test_billing_write_context(transaction_id,subscription_id,event_id,action)
    values(txid_current(),s.id,input_event_id,action_value);
    if action_value='CHECKOUT_BOUND' then
      update public.basic_test_checkout_requests set provider_customer_id=input_provider_customer_id,
        provider_subscription_id=input_provider_subscription_id,status='COMPLETED',updated_at=clock_timestamp()
        where id=c.id;
      update public.branch_subscriptions set payment_status='pending',
        stripe_customer_id=input_provider_customer_id,stripe_subscription_id=input_provider_subscription_id where id=s.id;
    elsif action_value='PAYMENT_CONFIRMED' then
      update public.basic_test_checkout_requests set
        provider_customer_id=coalesce(provider_customer_id,input_provider_customer_id),
        provider_subscription_id=coalesce(provider_subscription_id,input_provider_subscription_id),
        status='COMPLETED',updated_at=clock_timestamp() where id=c.id;
      update public.branch_subscriptions set status='active',subscription_status='active',payment_status='paid',
        stripe_customer_id=input_provider_customer_id,stripe_subscription_id=input_provider_subscription_id,
        current_period_start=input_period_start,current_period_end=input_period_end,
        current_period_ends_at=input_period_end where id=s.id;
    elsif action_value='PAYMENT_FAILED' then
      update public.branch_subscriptions set status='past_due',subscription_status='past_due',payment_status='failed' where id=s.id;
    elsif action_value='CANCELLED' then
      update public.branch_subscriptions set status='cancelled',subscription_status='cancelled',
        payment_status=case when payment_status='paid' then 'paid' else 'failed' end where id=s.id;
      update public.basic_test_checkout_requests set status='CANCELLED',updated_at=clock_timestamp() where id=c.id;
    end if;
    delete from public.basic_test_billing_write_context where transaction_id=txid_current();
  end if;
  insert into public.basic_stripe_test_event_inbox(event_id,payload_sha256,event_type,event_created_at,
    provider_session_id,provider_customer_id,provider_subscription_id,restaurant_id,acceptance_id,
    provider_status,period_start,period_end,processing_status,result_code,request_id,correlation_id,
    livemode,environment)
  values(input_event_id,input_payload_sha256,input_event_type,input_event_created_at,
    input_provider_session_id,input_provider_customer_id,input_provider_subscription_id,
    input_restaurant_id,input_acceptance_id,input_provider_status,input_period_start,input_period_end,
    result,result_code,input_request_id,input_correlation_id,false,'TEST');
  if c.id is not null then
    insert into public.audit_log(restaurant_id,actor_type,action,target_table,target_id,metadata)
    values(c.restaurant_id,'system',result_code,'basic_stripe_test_event_inbox',null,
      jsonb_build_object('event_id',input_event_id,'event_type',input_event_type,
        'processing_status',result,'request_id',input_request_id,'correlation_id',input_correlation_id));
  end if;
  return jsonb_build_object('event_id',input_event_id,'status',result,'result_code',result_code,'replay',false);
end
$function$;

revoke all on function public.prepare_basic_test_checkout(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_basic_test_checkout(uuid,uuid,text) to authenticated;
revoke all on function public.complete_basic_test_checkout(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.complete_basic_test_checkout(uuid,text) to service_role;
revoke all on function public.guard_billing_activation_write()
  from public,anon,authenticated,service_role;
revoke all on function public.record_basic_stripe_test_event(text,text,text,timestamptz,text,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid,uuid,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.record_basic_stripe_test_event(text,text,text,timestamptz,text,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid,uuid,boolean)
  to service_role;

comment on function public.country_basic_pilot_readiness_snapshot(text) is
  'Free BASIC pilot readiness excludes only billing and Stripe. Legal, privacy, tax, translation, technical smoke and document evidence remain mandatory.';
comment on function public.basic_paid_activation_readiness_internal(uuid,text,text,boolean) is
  'Fail-closed paid BASIC readiness checked at checkout and immediately before active/paid provider writes.';
comment on function public.activate_v1_manual_basic_trial(uuid,smallint,text,text,uuid,uuid) is
  'AAL2 AT-only free BASIC pilot for one or three Vienna calendar months. It never changes public country release or creates payment/Stripe state.';

notify pgrst,'reload schema';
commit;
