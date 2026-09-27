-- V1 manual BASIC trial activation.
-- There is deliberately no coded pilot-cohort limit. "First ten" remains a
-- landing-page/offer condition administered outside this billing authority.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260927004000',0));

create table if not exists public.manual_basic_trial_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete restrict,
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  branch_id uuid not null unique references public.branches(id) on delete restrict,
  subscription_id uuid not null unique references public.branch_subscriptions(id) on delete restrict,
  calendar_months smallint not null check (calendar_months in (1,3)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  correlation_id uuid not null,
  reason text not null check (length(trim(reason)) between 10 and 500),
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  check (ends_at=starts_at+make_interval(months=>calendar_months) and ends_at>starts_at)
);
alter table public.manual_basic_trial_decisions enable row level security;
revoke all on public.manual_basic_trial_decisions from public,anon,authenticated,service_role;

create or replace function public.block_manual_basic_trial_decision_mutation()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $function$
begin raise exception 'MANUAL_TRIAL_DECISION_IMMUTABLE' using errcode='42501'; end
$function$;
revoke all on function public.block_manual_basic_trial_decision_mutation()
  from public,anon,authenticated,service_role;
drop trigger if exists manual_basic_trial_decisions_immutable on public.manual_basic_trial_decisions;
create trigger manual_basic_trial_decisions_immutable
  before update or delete or truncate on public.manual_basic_trial_decisions
  for each statement execute function public.block_manual_basic_trial_decision_mutation();

-- 1/4: pending activation guard. Only the exact tenant named by the private,
-- transaction-local context and a verified AAL2 Platform Admin may transition.
create or replace function public.guard_pending_activation_transition()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare r public.restaurants%rowtype;
  activation_context text:=current_setting('wuxuai.manual_trial_activation_restaurant',true);
  target_restaurant uuid; authorized_transition boolean:=false;
begin
  if tg_table_name='restaurants' then target_restaurant:=coalesce(new.id,old.id);
  else
    select restaurant.id into target_restaurant from public.restaurants restaurant
    join public.branches b on b.restaurant_id=restaurant.id
    where b.id=coalesce(new.branch_id,old.branch_id);
  end if;
  authorized_transition:=activation_context=target_restaurant::text
    and public.current_platform_role() in ('platform_owner','platform_admin')
    and public.platform_totp_aal2_verified_internal();
  if authorized_transition then return case when tg_op='DELETE' then old else new end; end if;
  if tg_table_name='restaurants' then
    if tg_op='INSERT' then
      if exists(select 1 from public.country_launch_creation_context c
        where c.transaction_id=txid_current() and c.actor_id=auth.uid()
          and c.actor_id=new.owner_id and c.purpose='REGISTRATION') then
        new.activation_status:='pending_activation'; new.status:='draft';
        new.operational_ready:=false; new.security_ready:=false; new.legal_ready:=false;
      elsif new.activation_status is not null then
        raise exception 'PENDING_REGISTRATION_CONTEXT_REQUIRED' using errcode='42501';
      end if;
      return new;
    end if;
    if old.activation_status='pending_activation' then
      if tg_op='DELETE' or new.activation_status is distinct from old.activation_status
        or new.status<>'draft' or new.operational_ready or new.legal_ready or new.security_ready
        or new.onboarding_status in ('ready','completed') then
        raise exception 'PENDING_ACTIVATION_SERVER_ONLY' using errcode='42501';
      end if;
    elsif tg_op='UPDATE' and new.activation_status is distinct from old.activation_status then
      raise exception 'ACTIVATION_STATE_SERVER_ONLY' using errcode='42501';
    end if;
  else
    select restaurant.* into r from public.restaurants restaurant join public.branches b
      on b.restaurant_id=restaurant.id where b.id=coalesce(new.branch_id,old.branch_id);
    if r.activation_status='pending_activation' then
      if tg_op='DELETE' or new.status<>'pending_activation'
        or new.subscription_status<>'pending_activation' or new.plan_key<>'BASIC'
        or new.selected_plan is distinct from 'BASIC' or new.payment_status<>'not_required'
        or new.trial_started_at is not null or new.trial_ends_at is not null
        or new.current_period_start is not null or new.current_period_end is not null
        or new.current_period_ends_at is not null or new.stripe_customer_id is not null
        or new.stripe_subscription_id is not null then
        raise exception 'PENDING_ACTIVATION_SERVER_ONLY' using errcode='42501';
      end if;
    elsif tg_op<>'DELETE' and new.subscription_status='pending_activation' then
      raise exception 'PENDING_REGISTRATION_CONTEXT_REQUIRED' using errcode='42501';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end
$function$;
revoke all on function public.guard_pending_activation_transition()
  from public,anon,authenticated,service_role;

-- 2/4: Kassa acknowledgement guard. The manual Platform-Admin transition
-- still requires a prior acknowledgement by an owner/admin of this tenant.
create or replace function public.require_kassa_acknowledgement_for_activation()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare activation_context text:=current_setting('wuxuai.manual_trial_activation_restaurant',true);
  accepted boolean:=false;
begin
  if (new.onboarding_status='completed' or new.operational_ready=true)
    and (old.onboarding_status is distinct from 'completed' or old.operational_ready is distinct from true) then
    if activation_context=new.id::text
      and public.current_platform_role() in ('platform_owner','platform_admin')
      and public.platform_totp_aal2_verified_internal() then
      select exists(
        select 1 from public.kassa_compliance_acknowledgements a
        join public.restaurant_members m on m.restaurant_id=a.restaurant_id and m.user_id=a.user_id
          and m.role in ('owner','admin')
        where a.restaurant_id=new.id and a.text_version='kassa-separation-de-v1'
      ) into accepted;
    else
      accepted:=exists(select 1 from public.kassa_compliance_acknowledgements a
        where a.restaurant_id=new.id and a.user_id=auth.uid()
          and a.text_version='kassa-separation-de-v1');
    end if;
    if not accepted then
      raise exception 'KASSA_ACKNOWLEDGEMENT_REQUIRED' using errcode='42501';
    end if;
  end if;
  return new;
end
$function$;
revoke all on function public.require_kassa_acknowledgement_for_activation()
  from public,anon,authenticated,service_role;

-- 3/4: canonical billing guard. The only newly permitted positive write is
-- pending BASIC -> BASIC trialing for an immutable 1/3-month decision in the
-- same transaction. Stripe/payment/provider fields must remain empty.
create or replace function public.guard_billing_activation_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare tenant uuid; actions jsonb;
  activation_context text:=current_setting('wuxuai.manual_trial_activation_restaurant',true);
begin
  select restaurant_id into tenant from public.branches where id=coalesce(new.branch_id,old.branch_id);
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
      and new.trial_ends_at in (new.trial_started_at+interval '1 month',new.trial_started_at+interval '3 months')
      and new.current_period_start=new.trial_started_at
      and new.current_period_end=new.trial_ends_at
      and new.current_period_ends_at=new.trial_ends_at
      and new.stripe_customer_id is null and new.stripe_subscription_id is null
      and exists(select 1 from public.manual_basic_trial_decisions d
        where d.restaurant_id=tenant and d.subscription_id=new.id
          and d.starts_at=new.trial_started_at and d.ends_at=new.trial_ends_at) then
      return new;
    end if;
    raise exception 'MANUAL_TRIAL_BILLING_TRANSITION_INVALID' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    if new.subscription_status is distinct from 'pending_activation'
      or new.status is distinct from 'pending_activation'
      or new.payment_status is distinct from 'not_required'
      or new.trial_started_at is not null or new.trial_ends_at is not null
      or new.stripe_customer_id is not null or new.stripe_subscription_id is not null
      or new.current_period_start is not null or new.current_period_end is not null
      or new.current_period_ends_at is not null then
      raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501';
    end if;
    return new;
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
    or (new.subscription_status is distinct from old.subscription_status
      and new.subscription_status not in ('paused','cancelled','unpaid'))
    or (new.status is distinct from old.status and new.status not in ('paused','cancelled','unpaid')) then
    raise exception 'BILLING_PROVIDER_ACTIVATION_REQUIRED' using errcode='42501';
  end if;
  if new.trial_ends_at is distinct from old.trial_ends_at then
    actions:=public.billing_admin_actions_internal(tenant);
    if coalesce((actions->>'extend_trial')::boolean,false) is not true
      or new.status<>'trialing' or new.subscription_status<>'trialing'
      or new.plan_key is distinct from old.plan_key or new.trial_ends_at is null
      or not isfinite(new.trial_ends_at) or new.trial_ends_at<=old.trial_ends_at
      or not exists(select 1 from public.billing_admin_write_context c
        where c.transaction_id=txid_current() and c.subscription_id=old.id
          and c.actor_id=auth.uid() and c.expected_trial_end=new.trial_ends_at) then
      raise exception 'BILLING_HISTORICAL_TRIAL_REQUIRED' using errcode='42501';
    end if;
  end if;
  return new;
end
$function$;
revoke all on function public.guard_billing_activation_write()
  from public,anon,authenticated,service_role;

create or replace function public.activate_v1_manual_basic_trial(
  input_restaurant_id uuid,input_calendar_months smallint,input_reason text,
  input_confirmation text,input_request_id uuid,input_correlation_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare actor uuid:=auth.uid(); role_value text:=public.current_platform_role();
  started timestamptz:=clock_timestamp(); finished timestamptz;
  r public.restaurants%rowtype; b public.branches%rowtype; s public.branch_subscriptions%rowtype;
  existing public.manual_basic_trial_decisions%rowtype;
  decision public.manual_basic_trial_decisions%rowtype; before_value jsonb; after_value jsonb;
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
  if coalesce((public.country_launch_readiness_snapshot(upper(b.country))->>'ready')::boolean,false)
    is not true then
    raise exception 'MANUAL_TRIAL_COUNTRY_NOT_READY' using errcode='42501';
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
  finished:=started+make_interval(months=>input_calendar_months);
  before_value:=jsonb_build_object('restaurant',to_jsonb(r),'subscription',to_jsonb(s));
  after_value:=jsonb_build_object('restaurant_id',r.id,'organization_id',r.organization_id,
    'branch_id',b.id,'subscription_id',s.id,'plan_key','BASIC','subscription_status','trialing',
    'payment_status','not_required','calendar_months',input_calendar_months,
    'starts_at',started,'ends_at',finished,'paid_followup_acceptance_required',true,
    'post_trial_points_rewards_contract','LEGAL_DECISION_OPEN_60_DAY_REDEMPTION');
  insert into public.manual_basic_trial_decisions(restaurant_id,organization_id,branch_id,
    subscription_id,calendar_months,starts_at,ends_at,actor_id,request_id,correlation_id,
    reason,before_state,after_state)
  values(r.id,r.organization_id,b.id,s.id,input_calendar_months,started,finished,actor,
    input_request_id,input_correlation_id,trim(input_reason),before_value,after_value)
  returning * into decision;
  insert into public.country_launch_creation_context(
    transaction_id,actor_id,country_code,purpose,restaurant_id
  ) values(txid_current(),actor,upper(b.country),'ONBOARDING',r.id);
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

-- 4/4: activation read model. Expiry never charges or silently extends. A
-- future paid period must be separately accepted and provider-confirmed.
create or replace function public.restaurant_activation_state_internal(input_restaurant_id uuid)
returns jsonb language plpgsql security definer stable set search_path=pg_catalog,public,pg_temp as $function$
declare r public.restaurants%rowtype; b public.branches%rowtype; s public.branch_subscriptions%rowtype;
  d public.manual_basic_trial_decisions%rowtype; pending boolean; bound boolean;
  country_allowed boolean; paid_current boolean; trial_expired boolean;
begin
  select * into r from public.restaurants where id=input_restaurant_id;
  select * into b from public.branches where id=r.primary_branch_id and restaurant_id=r.id
    and organization_id=r.organization_id;
  select * into s from public.branch_subscriptions where branch_id=b.id
    and organization_id=r.organization_id;
  select * into d from public.manual_basic_trial_decisions where restaurant_id=r.id;
  pending:=coalesce(r.activation_status='pending_activation',false)
    or coalesce(s.subscription_status='pending_activation',false);
  bound:=r.id is not null and b.id is not null and s.id is not null;
  country_allowed:=exists(select 1 from public.country_launch_policy
    where country_code=b.country and enabled)
    or (not pending and exists(select 1 from public.country_launch_existing_businesses
      where restaurant_id=r.id));
  paid_current:=s.subscription_status='active' and s.payment_status='paid'
    and coalesce(s.current_period_end,s.current_period_ends_at)>statement_timestamp();
  trial_expired:=d.id is not null and d.ends_at<=statement_timestamp() and not paid_current;
  return jsonb_build_object('restaurant_id',input_restaurant_id,
    'status',case when pending then 'PENDING_ACTIVATION' when not bound then 'UNAVAILABLE'
      when trial_expired then 'TRIAL_ENDED_PAYMENT_ACCEPTANCE_REQUIRED' else 'ACTIVE' end,
    'selected_plan',case when pending then 'BASIC' else s.plan_key end,'setup_allowed',bound,
    'operational',coalesce(bound and not pending and not trial_expired and country_allowed
      and r.status='active' and b.status='active',false),
    'country_released',coalesce(country_allowed,false),
    'reason_code',case when pending then 'PENDING_ACTIVATION'
      when not bound then 'ACTIVATION_STATE_UNAVAILABLE'
      when trial_expired then 'TRIAL_ENDED_PAYMENT_ACCEPTANCE_REQUIRED'
      when not country_allowed then 'COUNTRY_NOT_LAUNCHED' else null end,
    'manual_trial_calendar_months',d.calendar_months,
    'manual_trial_starts_at',d.starts_at,'manual_trial_ends_at',d.ends_at,
    'automatic_charge',false,'automatic_extension',false,
    'paid_followup_acceptance_required',true,
    'post_trial_points_rewards_contract','LEGAL_DECISION_OPEN_60_DAY_REDEMPTION');
end
$function$;
revoke all on function public.restaurant_activation_state_internal(uuid)
  from public,anon,authenticated,service_role;

comment on table public.manual_basic_trial_decisions is
  'Immutable AAL2 Platform-Admin decisions for one- or three-calendar-month BASIC trials; no global cohort cap.';
comment on function public.activate_v1_manual_basic_trial(uuid,smallint,text,text,uuid,uuid) is
  'Starts BASIC only after Country, KYB, Legal and Kassa gates. No payment method, Stripe ID or charge.';

notify pgrst,'reload schema';
commit;
