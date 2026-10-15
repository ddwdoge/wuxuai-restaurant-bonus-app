-- Bind every new TEST_ONLY subscription checkout to a Stripe TEST customer
-- that was born on an isolated Test Clock. This migration creates no Stripe
-- object, checkout, subscription, entitlement, trial, scheduler or business
-- mutation. The provider writes remain behind the existing closed Edge gate.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261015174851',0));

create table test_only_checkout.customer_preparations (
  request_ref uuid primary key references test_only_checkout.requests(id) on delete restrict,
  project_ref text not null check (project_ref~'^[a-z]{20}$'),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  provider_account_id text not null check (provider_account_id~'^acct_[A-Za-z0-9_]{8,160}$'),
  provider_test_clock_id text not null unique check (provider_test_clock_id~'^clock_[A-Za-z0-9_]{8,160}$'),
  provider_customer_id text not null unique check (provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$'),
  frozen_time timestamptz not null,
  livemode boolean not null check (livemode=false),
  evidence_sha256 text not null check (evidence_sha256~'^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

alter table test_only_checkout.customer_preparations enable row level security;
revoke all on test_only_checkout.customer_preparations from public,anon,authenticated,service_role;
create trigger test_only_checkout_customer_preparations_immutable before update or delete or truncate
on test_only_checkout.customer_preparations for each statement execute function test_only_checkout.protect_append_only();

alter table test_only_checkout.audit drop constraint audit_action_check;
alter table test_only_checkout.audit add constraint audit_action_check
  check (action in ('REQUEST_PREPARED','TEST_CLOCK_CUSTOMER_BOUND','SESSION_CREATED',
    'REQUEST_CANCELLED','CHECKOUT_SESSION_COMPLETED'));

create function public.get_test_only_stripe_customer_preparation(input_checkout_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare preparation test_only_checkout.customer_preparations%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(false);
  if auth.role()<>'service_role' then
    raise exception 'TEST_ONLY_TEST_CUSTOMER_READ_DENIED' using errcode='42501';
  end if;
  select * into preparation from test_only_checkout.customer_preparations
    where request_ref=input_checkout_request_id;
  if preparation.request_ref is null then return null; end if;
  return jsonb_build_object('checkout_request_id',preparation.request_ref,
    'provider_account_id',preparation.provider_account_id,
    'provider_test_clock_id',preparation.provider_test_clock_id,
    'provider_customer_id',preparation.provider_customer_id,
    'frozen_time',preparation.frozen_time,'livemode',false);
end $function$;
revoke all on function public.get_test_only_stripe_customer_preparation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_test_only_stripe_customer_preparation(uuid) to service_role;

create function public.bind_test_only_stripe_test_clock_customer(input_checkout_request_id uuid,
  input_provider_account_id text,input_provider_test_clock_id text,input_provider_customer_id text,
  input_frozen_time timestamptz,input_livemode boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare req test_only_checkout.requests%rowtype; existing test_only_checkout.customer_preparations%rowtype;
  evidence text;
begin
  perform project_bootstrap.require_runtime_binding(false);
  if auth.role()<>'service_role' or input_provider_account_id!~'^acct_[A-Za-z0-9_]{8,160}$'
    or input_provider_test_clock_id!~'^clock_[A-Za-z0-9_]{8,160}$'
    or input_provider_customer_id!~'^cus_[A-Za-z0-9_]{8,160}$'
    or input_frozen_time is null or input_livemode is distinct from false then
    raise exception 'TEST_ONLY_TEST_CUSTOMER_SERVICE_REQUIRED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-test-customer:'||input_checkout_request_id::text,0));
  select * into req from test_only_checkout.requests where id=input_checkout_request_id for update;
  if req.id is null then raise exception 'TEST_ONLY_CHECKOUT_NOT_FOUND' using errcode='P0002'; end if;
  select * into existing from test_only_checkout.customer_preparations where request_ref=req.id;
  if existing.request_ref is not null then
    if existing.provider_account_id<>input_provider_account_id
      or existing.provider_test_clock_id<>input_provider_test_clock_id
      or existing.provider_customer_id<>input_provider_customer_id
      or existing.frozen_time<>input_frozen_time or existing.livemode is distinct from false then
      raise exception 'TEST_ONLY_TEST_CUSTOMER_REPLAY_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('status','TEST_CLOCK_CUSTOMER_BOUND','idempotent',true,
      'provider_test_clock_id',existing.provider_test_clock_id,'provider_customer_id',existing.provider_customer_id);
  end if;
  if req.status<>'PREPARED' or abs(extract(epoch from input_frozen_time-req.created_at))>600
    or not test_only_checkout.access_active(req.restaurant_id,req.access_receipt_id) then
    raise exception 'TEST_ONLY_TEST_CUSTOMER_BINDING_CONFLICT' using errcode='42501';
  end if;
  evidence:=encode(extensions.digest(convert_to(req.id::text||':'||input_provider_account_id||':'||
    input_provider_test_clock_id||':'||input_provider_customer_id||':'||input_frozen_time::text,'UTF8'),'sha256'),'hex');
  insert into test_only_checkout.customer_preparations(request_ref,project_ref,restaurant_id,organization_id,branch_id,
    provider_account_id,provider_test_clock_id,provider_customer_id,frozen_time,livemode,evidence_sha256)
  values(req.id,req.project_ref,req.restaurant_id,req.organization_id,req.branch_id,input_provider_account_id,
    input_provider_test_clock_id,input_provider_customer_id,input_frozen_time,false,evidence);
  insert into test_only_checkout.audit(request_ref,restaurant_id,action,actor_ref,request_id,evidence_sha256)
  values(req.id,req.restaurant_id,'TEST_CLOCK_CUSTOMER_BOUND','service_role',req.request_id,evidence);
  return jsonb_build_object('status','TEST_CLOCK_CUSTOMER_BOUND','idempotent',false,
    'provider_test_clock_id',input_provider_test_clock_id,'provider_customer_id',input_provider_customer_id);
end $function$;
revoke all on function public.bind_test_only_stripe_test_clock_customer(uuid,text,text,text,timestamptz,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.bind_test_only_stripe_test_clock_customer(uuid,text,text,text,timestamptz,boolean)
to service_role;

create function public.bind_test_only_stripe_checkout_session_v2(input_checkout_request_id uuid,
  input_provider_account_id text,input_provider_session_id text,input_provider_test_clock_id text,
  input_provider_customer_id text,input_price_id text,input_livemode boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare preparation test_only_checkout.customer_preparations%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(false);
  if auth.role()<>'service_role' then
    raise exception 'TEST_ONLY_CHECKOUT_SERVICE_REQUIRED' using errcode='42501';
  end if;
  select * into preparation from test_only_checkout.customer_preparations
    where request_ref=input_checkout_request_id for share;
  if preparation.request_ref is null or preparation.provider_account_id<>input_provider_account_id
    or preparation.provider_test_clock_id<>input_provider_test_clock_id
    or preparation.provider_customer_id<>input_provider_customer_id
    or preparation.livemode is distinct from false then
    raise exception 'TEST_ONLY_TEST_CUSTOMER_BINDING_MISMATCH' using errcode='42501';
  end if;
  return public.bind_test_only_stripe_checkout_session(input_checkout_request_id,input_provider_account_id,
    input_provider_session_id,input_price_id,input_livemode);
end $function$;
revoke all on function public.bind_test_only_stripe_checkout_session_v2(uuid,text,text,text,text,text,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.bind_test_only_stripe_checkout_session_v2(uuid,text,text,text,text,text,boolean)
to service_role;

create function test_only_checkout.require_anchor_customer_preparation() returns trigger
language plpgsql set search_path=pg_catalog,public,test_only_checkout as $function$
declare preparation test_only_checkout.customer_preparations%rowtype;
begin
  select * into preparation from test_only_checkout.customer_preparations where request_ref=new.request_ref;
  if preparation.request_ref is null or preparation.project_ref<>(select project_ref from test_only_checkout.requests where id=new.request_ref)
    or preparation.restaurant_id<>new.restaurant_id or preparation.organization_id<>new.organization_id
    or preparation.branch_id<>new.branch_id or preparation.provider_account_id<>new.provider_account_id
    or preparation.provider_customer_id<>new.provider_customer_id or preparation.livemode is distinct from false then
    raise exception 'TEST_ONLY_SUBSCRIPTION_TEST_CLOCK_CUSTOMER_REQUIRED' using errcode='42501';
  end if;
  return new;
end $function$;
revoke all on function test_only_checkout.require_anchor_customer_preparation() from public,anon,authenticated,service_role;
create trigger test_only_subscription_anchor_requires_test_clock_customer before insert
on test_only_checkout.subscription_anchors for each row execute function test_only_checkout.require_anchor_customer_preparation();

notify pgrst,'reload schema';
commit;
