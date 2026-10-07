-- One accepted BASIC contract has one TEST Checkout attempt. A deliberately
-- new contract has a different acceptance_id and may start its own attempt.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261007123213',0));

create unique index basic_test_checkout_one_per_acceptance
  on public.basic_test_checkout_requests(acceptance_id);

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
  perform pg_advisory_xact_lock(hashtextextended('basic-test-checkout-acceptance:'||a.id::text,0));
  select * into existing from public.basic_test_checkout_requests
    where acceptance_id=a.id;
  if existing.id is not null then
    if existing.restaurant_id<>a.restaurant_id or existing.actor_id<>actor
      or existing.payload_sha256<>request_hash or existing.return_route<>input_return_route
      or existing.price_id<>binding.price_id then
      raise exception 'BASIC_TEST_CHECKOUT_PAYLOAD_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('checkout_request_id',existing.id,'status',existing.status,
      'price_id',existing.price_id,'restaurant_id',existing.restaurant_id,
      'acceptance_id',existing.acceptance_id,'request_id',existing.request_id,
      'provider_session_id',existing.provider_session_id,'created_at',existing.created_at,
      'correlation_id',a.correlation_id,'idempotent',true,
      'acceptance_kind',a.acceptance_kind);
  end if;
  insert into public.basic_test_checkout_requests(acceptance_id,restaurant_id,subscription_id,
    actor_id,request_id,return_route,payload_sha256,price_id)
  values(a.id,a.restaurant_id,a.subscription_id,actor,input_request_id,input_return_route,
    request_hash,binding.price_id) returning * into created;
  return jsonb_build_object('checkout_request_id',created.id,'status','PREPARED',
    'price_id',created.price_id,'restaurant_id',created.restaurant_id,
    'acceptance_id',created.acceptance_id,'request_id',created.request_id,
    'provider_session_id',null,'created_at',created.created_at,
    'correlation_id',a.correlation_id,'idempotent',false,
    'acceptance_kind',a.acceptance_kind);
end
$function$;

revoke all on function public.prepare_basic_test_checkout(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.prepare_basic_test_checkout(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
