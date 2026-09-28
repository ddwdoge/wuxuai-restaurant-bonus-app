-- BASIC V1 release-candidate hardening:
-- - final seven days are Europe/Vienna calendar days;
-- - a saved pre-expiry acceptance can be resumed after the exclusive trial end.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260928003000',0));

create function public.basic_owner_trial_timing_internal(
  input_ends_at timestamptz,input_now timestamptz
) returns jsonb language sql immutable security definer
set search_path=pg_catalog,pg_temp as $function$
  select case when input_ends_at is null or input_now is null then
    jsonb_build_object('decision_opens_at',null,'decision_available',false,
      'trial_active',false,'checkout_allowed',false,'remaining_calendar_days',null)
  else jsonb_build_object(
    'decision_opens_at',((input_ends_at at time zone 'Europe/Vienna')-interval '7 days') at time zone 'Europe/Vienna',
    'decision_available',input_now>=(((input_ends_at at time zone 'Europe/Vienna')-interval '7 days') at time zone 'Europe/Vienna'),
    'trial_active',input_now<input_ends_at,
    'checkout_allowed',input_now>=input_ends_at,
    'remaining_calendar_days',greatest(0,
      (input_ends_at at time zone 'Europe/Vienna')::date-(input_now at time zone 'Europe/Vienna')::date)
  ) end
$function$;
revoke all on function public.basic_owner_trial_timing_internal(timestamptz,timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.accept_basic_paid_offer(
  input_restaurant_id uuid,input_terms_version text,input_confirmation text,
  input_request_id uuid,input_correlation_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare actor uuid:=auth.uid(); r public.restaurants%rowtype; b public.branches%rowtype;
  s public.branch_subscriptions%rowtype; d public.manual_basic_trial_decisions%rowtype;
  p public.billing_catalog_internal%rowtype; existing public.basic_paid_offer_acceptances%rowtype;
  accepted public.basic_paid_offer_acceptances%rowtype; timing jsonb; checkout_allowed boolean;
begin
  if actor is null or auth.role() is distinct from 'authenticated' then
    raise exception 'BASIC_OFFER_OWNER_REQUIRED' using errcode='42501';
  end if;
  if input_restaurant_id is null or input_request_id is null or input_correlation_id is null
    or length(trim(coalesce(input_terms_version,''))) not between 8 and 80
    or input_confirmation is distinct from 'BASIC KOSTENPFLICHTIG BESTELLEN' then
    raise exception 'BASIC_OFFER_ACCEPTANCE_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('basic-offer:'||input_restaurant_id::text,0));
  select restaurant.* into r from public.restaurants restaurant
    join public.restaurant_members m on m.restaurant_id=restaurant.id
      and m.user_id=actor and m.role='owner'
    where restaurant.id=input_restaurant_id and restaurant.owner_id=actor for update of restaurant;
  if r.id is null then raise exception 'BASIC_OFFER_OWNER_REQUIRED' using errcode='42501'; end if;
  select * into b from public.branches where id=r.primary_branch_id and restaurant_id=r.id
    and organization_id=r.organization_id;
  select * into s from public.branch_subscriptions where branch_id=b.id
    and organization_id=r.organization_id for update;
  select * into d from public.manual_basic_trial_decisions where restaurant_id=r.id;
  timing:=public.basic_owner_trial_timing_internal(d.ends_at,statement_timestamp());
  if d.id is null or s.id is null or s.plan_key<>'BASIC' or s.subscription_status<>'trialing'
    or s.payment_status<>'not_required'
    or coalesce((timing->>'decision_available')::boolean,false) is not true
    or s.stripe_customer_id is not null or s.stripe_subscription_id is not null then
    raise exception 'BASIC_OFFER_FINAL_SEVEN_DAYS_REQUIRED' using errcode='42501';
  end if;
  checkout_allowed:=coalesce((timing->>'checkout_allowed')::boolean,false);
  select * into p from public.billing_catalog_internal where product_code='BASIC'
    and product_kind='PLAN' and active and valid_from<=statement_timestamp()
    order by version desc limit 1;
  if p.product_code is null or p.monthly_price_minor<>5900 or p.currency<>'EUR' then
    raise exception 'BASIC_OFFER_CATALOG_INVALID' using errcode='55000';
  end if;
  select * into existing from public.basic_paid_offer_acceptances
    where request_id=input_request_id or (trial_decision_id=d.id and acceptance_kind='INITIAL')
    order by accepted_at limit 1;
  if existing.id is not null then
    if existing.request_id=input_request_id and existing.restaurant_id=r.id
      and existing.actor_id=actor and existing.terms_version=trim(input_terms_version) then
      return jsonb_build_object('acceptance_id',existing.id,'status','ACCEPTED','idempotent',true,
        'checkout_allowed',checkout_allowed,'acceptance_kind','INITIAL');
    end if;
    raise exception 'BASIC_OFFER_ALREADY_ACCEPTED' using errcode='23505';
  end if;
  insert into public.basic_paid_offer_acceptances(restaurant_id,organization_id,branch_id,
    subscription_id,trial_decision_id,actor_id,catalog_version,amount_minor,currency,
    billing_interval,terms_version,request_id,correlation_id,acceptance_kind)
  values(r.id,r.organization_id,b.id,s.id,d.id,actor,p.version,p.monthly_price_minor,p.currency,
    'MONTH',trim(input_terms_version),input_request_id,input_correlation_id,'INITIAL')
  returning * into accepted;
  insert into public.audit_log(restaurant_id,actor_type,actor_id,action,target_table,target_id,metadata)
  values(r.id,'admin',actor,'BASIC_PAID_OFFER_ACCEPTED','basic_paid_offer_acceptances',accepted.id,
    jsonb_build_object('terms_version',accepted.terms_version,'catalog_version',accepted.catalog_version,
      'amount_minor',accepted.amount_minor,'currency',accepted.currency,'checkout_allowed',checkout_allowed,
      'request_id',accepted.request_id,'correlation_id',accepted.correlation_id));
  return jsonb_build_object('acceptance_id',accepted.id,'status','ACCEPTED','idempotent',false,
    'amount_minor',accepted.amount_minor,'currency',accepted.currency,'billing_interval','MONTH',
    'checkout_allowed',checkout_allowed,'acceptance_kind','INITIAL');
end
$function$;
revoke all on function public.accept_basic_paid_offer(uuid,text,text,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.accept_basic_paid_offer(uuid,text,text,uuid,uuid) to authenticated;

create function public.get_owner_basic_contract_snapshot(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare actor uuid:=auth.uid(); r public.restaurants%rowtype; b public.branches%rowtype;
  s public.branch_subscriptions%rowtype; d public.manual_basic_trial_decisions%rowtype;
  a public.basic_paid_offer_acceptances%rowtype; g public.basic_post_trial_redemption_grace%rowtype;
  timing jsonb;
begin
  if actor is null or auth.role() is distinct from 'authenticated' then
    raise exception 'BASIC_OWNER_CONTRACT_READ_REQUIRED' using errcode='42501';
  end if;
  select restaurant.* into r from public.restaurants restaurant
    join public.restaurant_members m on m.restaurant_id=restaurant.id
      and m.organization_id=restaurant.organization_id and m.user_id=actor and m.role='owner'
    where restaurant.id=input_restaurant_id and restaurant.owner_id=actor;
  if r.id is null then raise exception 'BASIC_OWNER_CONTRACT_READ_REQUIRED' using errcode='42501'; end if;
  select * into b from public.branches where id=r.primary_branch_id and restaurant_id=r.id
    and organization_id=r.organization_id;
  select * into s from public.branch_subscriptions where branch_id=b.id
    and organization_id=r.organization_id;
  select * into d from public.manual_basic_trial_decisions where restaurant_id=r.id;
  select * into g from public.basic_post_trial_redemption_grace where restaurant_id=r.id;
  if s.subscription_status='cancelled' then
    select * into a from public.basic_paid_offer_acceptances
      where restaurant_id=r.id and acceptance_kind='REACTIVATION'
        and prior_provider_subscription_id=s.stripe_subscription_id
      order by accepted_at desc,id desc limit 1;
  else
    select * into a from public.basic_paid_offer_acceptances
      where trial_decision_id=d.id and acceptance_kind='INITIAL'
      order by accepted_at desc,id desc limit 1;
  end if;
  timing:=public.basic_owner_trial_timing_internal(d.ends_at,statement_timestamp());
  return jsonb_build_object(
    'restaurant_id',r.id,'plan_key',s.plan_key,'subscription_status',s.subscription_status,
    'payment_status',s.payment_status,'trial_calendar_months',d.calendar_months,
    'trial_starts_at',d.starts_at,'trial_ends_at',d.ends_at,'boundary_timezone','Europe/Vienna',
    'decision_opens_at',timing->'decision_opens_at',
    'decision_available',coalesce((timing->>'decision_available')::boolean,false),
    'trial_active',coalesce((timing->>'trial_active')::boolean,false),
    'checkout_allowed',coalesce((timing->>'checkout_allowed')::boolean,false),
    'remaining_calendar_days',(timing->>'remaining_calendar_days')::integer,
    'acceptance_id',a.id,'acceptance_kind',a.acceptance_kind,
    'acceptance_terms_version',a.terms_version,'accepted_at',a.accepted_at,
    'post_trial_grace_starts_at',g.starts_at,'post_trial_grace_ends_at',g.ends_at,
    'post_trial_grace_active',coalesce(g.starts_at<=statement_timestamp()
      and g.ends_at>statement_timestamp(),false),
    'automatic_charge',false,'automatic_extension',false
  );
end
$function$;
revoke all on function public.get_owner_basic_contract_snapshot(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_owner_basic_contract_snapshot(uuid) to authenticated;

comment on function public.basic_owner_trial_timing_internal(timestamptz,timestamptz) is
  'Europe/Vienna calendar-day timing for the BASIC owner decision window; trial end is exclusive.';
comment on function public.get_owner_basic_contract_snapshot(uuid) is
  'Owner-only BASIC contract presentation; read-only and resumable after a pre-expiry acceptance.';

notify pgrst,'reload schema';
commit;
