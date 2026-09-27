-- BASIC V1: allow an explicit paid decision during the final seven trial days
-- and require a new explicit contract acceptance after a cancellation.
-- Checkout remains TEST_ONLY and cannot start before the trial has ended.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260928001000',0));

alter table public.basic_paid_offer_acceptances
  add column acceptance_kind text not null default 'INITIAL'
    check (acceptance_kind in ('INITIAL','REACTIVATION')),
  add column prior_provider_subscription_id text
    check (prior_provider_subscription_id is null or prior_provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$');

alter table public.basic_paid_offer_acceptances
  drop constraint if exists basic_paid_offer_acceptances_trial_decision_id_key,
  drop constraint if exists basic_paid_offer_acceptances_restaurant_id_trial_decision_id_key,
  drop constraint if exists basic_paid_offer_acceptances_restaurant_id_trial_decision_i_key;

create unique index basic_paid_offer_initial_trial_unique
  on public.basic_paid_offer_acceptances(trial_decision_id)
  where acceptance_kind='INITIAL';
create unique index basic_paid_offer_reactivation_contract_unique
  on public.basic_paid_offer_acceptances(restaurant_id,prior_provider_subscription_id)
  where acceptance_kind='REACTIVATION';
alter table public.basic_paid_offer_acceptances add constraint basic_paid_offer_kind_shape_check check (
  (acceptance_kind='INITIAL' and prior_provider_subscription_id is null)
  or (acceptance_kind='REACTIVATION' and prior_provider_subscription_id is not null)
);

create or replace function public.accept_basic_paid_offer(
  input_restaurant_id uuid,input_terms_version text,input_confirmation text,
  input_request_id uuid,input_correlation_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare actor uuid:=auth.uid(); r public.restaurants%rowtype; b public.branches%rowtype;
  s public.branch_subscriptions%rowtype; d public.manual_basic_trial_decisions%rowtype;
  p public.billing_catalog_internal%rowtype; existing public.basic_paid_offer_acceptances%rowtype;
  accepted public.basic_paid_offer_acceptances%rowtype; checkout_allowed boolean;
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
  if d.id is null or s.id is null or s.plan_key<>'BASIC' or s.subscription_status<>'trialing'
    or s.payment_status<>'not_required' or d.ends_at-statement_timestamp()>interval '7 days'
    or s.stripe_customer_id is not null or s.stripe_subscription_id is not null then
    raise exception 'BASIC_OFFER_FINAL_SEVEN_DAYS_REQUIRED' using errcode='42501';
  end if;
  checkout_allowed:=d.ends_at<=statement_timestamp();
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
end $function$;

create function public.accept_basic_paid_reactivation(
  input_restaurant_id uuid,input_terms_version text,input_confirmation text,
  input_request_id uuid,input_correlation_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare actor uuid:=auth.uid(); r public.restaurants%rowtype; b public.branches%rowtype;
  s public.branch_subscriptions%rowtype; d public.manual_basic_trial_decisions%rowtype;
  p public.billing_catalog_internal%rowtype; existing public.basic_paid_offer_acceptances%rowtype;
  accepted public.basic_paid_offer_acceptances%rowtype;
begin
  if actor is null or auth.role() is distinct from 'authenticated' then
    raise exception 'BASIC_REACTIVATION_OWNER_REQUIRED' using errcode='42501';
  end if;
  if input_restaurant_id is null or input_request_id is null or input_correlation_id is null
    or length(trim(coalesce(input_terms_version,''))) not between 8 and 80
    or input_confirmation is distinct from 'BASIC ERNEUT KOSTENPFLICHTIG BESTELLEN' then
    raise exception 'BASIC_REACTIVATION_ACCEPTANCE_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('basic-reactivation:'||input_restaurant_id::text,0));
  select restaurant.* into r from public.restaurants restaurant
    join public.restaurant_members m on m.restaurant_id=restaurant.id
      and m.user_id=actor and m.role='owner'
    where restaurant.id=input_restaurant_id and restaurant.owner_id=actor for update of restaurant;
  if r.id is null then raise exception 'BASIC_REACTIVATION_OWNER_REQUIRED' using errcode='42501'; end if;
  select * into b from public.branches where id=r.primary_branch_id and restaurant_id=r.id
    and organization_id=r.organization_id;
  select * into s from public.branch_subscriptions where branch_id=b.id
    and organization_id=r.organization_id for update;
  select * into d from public.manual_basic_trial_decisions where restaurant_id=r.id;
  if d.id is null or s.id is null or s.plan_key<>'BASIC' or s.subscription_status<>'cancelled'
    or s.status<>'cancelled' or s.stripe_subscription_id is null then
    raise exception 'BASIC_REACTIVATION_CANCELLED_CONTRACT_REQUIRED' using errcode='42501';
  end if;
  select * into p from public.billing_catalog_internal where product_code='BASIC'
    and product_kind='PLAN' and active and valid_from<=statement_timestamp()
    order by version desc limit 1;
  if p.product_code is null or p.monthly_price_minor<>5900 or p.currency<>'EUR' then
    raise exception 'BASIC_REACTIVATION_CATALOG_INVALID' using errcode='55000';
  end if;
  select * into existing from public.basic_paid_offer_acceptances
    where request_id=input_request_id or (restaurant_id=r.id and acceptance_kind='REACTIVATION'
      and prior_provider_subscription_id=s.stripe_subscription_id)
    order by accepted_at limit 1;
  if existing.id is not null then
    if existing.request_id=input_request_id and existing.restaurant_id=r.id
      and existing.actor_id=actor and existing.terms_version=trim(input_terms_version) then
      return jsonb_build_object('acceptance_id',existing.id,'status','ACCEPTED','idempotent',true,
        'checkout_allowed',true,'acceptance_kind','REACTIVATION');
    end if;
    raise exception 'BASIC_REACTIVATION_ALREADY_ACCEPTED' using errcode='23505';
  end if;
  insert into public.basic_paid_offer_acceptances(restaurant_id,organization_id,branch_id,
    subscription_id,trial_decision_id,actor_id,catalog_version,amount_minor,currency,
    billing_interval,terms_version,request_id,correlation_id,acceptance_kind,
    prior_provider_subscription_id)
  values(r.id,r.organization_id,b.id,s.id,d.id,actor,p.version,p.monthly_price_minor,p.currency,
    'MONTH',trim(input_terms_version),input_request_id,input_correlation_id,'REACTIVATION',
    s.stripe_subscription_id) returning * into accepted;
  insert into public.audit_log(restaurant_id,actor_type,actor_id,action,target_table,target_id,metadata)
  values(r.id,'admin',actor,'BASIC_PAID_REACTIVATION_ACCEPTED','basic_paid_offer_acceptances',accepted.id,
    jsonb_build_object('terms_version',accepted.terms_version,'catalog_version',accepted.catalog_version,
      'amount_minor',accepted.amount_minor,'currency',accepted.currency,
      'request_id',accepted.request_id,'correlation_id',accepted.correlation_id));
  return jsonb_build_object('acceptance_id',accepted.id,'status','ACCEPTED','idempotent',false,
    'amount_minor',accepted.amount_minor,'currency',accepted.currency,'billing_interval','MONTH',
    'checkout_allowed',true,'acceptance_kind','REACTIVATION');
end $function$;
revoke all on function public.accept_basic_paid_reactivation(uuid,text,text,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.accept_basic_paid_reactivation(uuid,text,text,uuid,uuid) to authenticated;

create or replace function public.prepare_basic_test_checkout(
  input_acceptance_id uuid,input_request_id uuid,input_return_route text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare actor uuid:=auth.uid(); a public.basic_paid_offer_acceptances%rowtype;
  existing public.basic_test_checkout_requests%rowtype; s public.branch_subscriptions%rowtype;
  d public.manual_basic_trial_decisions%rowtype;
  binding public.billing_provider_binding_versions%rowtype; marker public.platform_test_tenant_registry%rowtype;
  request_hash text; created public.basic_test_checkout_requests%rowtype;
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
  select * into marker from public.platform_test_tenant_registry
    where restaurant_id=a.restaurant_id and deleted_at is null;
  if marker.restaurant_id is null then
    raise exception 'BASIC_TEST_CHECKOUT_TEST_ONLY_REQUIRED' using errcode='42501';
  end if;
  select * into binding from public.billing_provider_binding_versions
    where product_code='BASIC' and catalog_version=a.catalog_version and provider='STRIPE'
      and environment='TEST' and binding_status='VERIFIED' and price_livemode=false
      and price_currency='EUR' and price_interval='MONTH' and price_amount_minor=a.amount_minor
      and price_usage_type='licensed' and price_billing_scheme='per_unit'
      and valid_from<=statement_timestamp() order by revision desc limit 1;
  if binding.price_id is null then raise exception 'BASIC_TEST_BINDING_UNAVAILABLE' using errcode='55000'; end if;
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
end $function$;

comment on function public.accept_basic_paid_offer(uuid,text,text,uuid,uuid) is
  'Explicit owner decision during the final seven trial days; checkout remains blocked until trial end.';
comment on function public.accept_basic_paid_reactivation(uuid,text,text,uuid,uuid) is
  'New explicit owner contract acceptance after provider-confirmed BASIC cancellation.';

notify pgrst,'reload schema';
commit;
