-- Isolated Stripe TEST subscription lifecycle evidence. Applying this
-- migration creates no checkout, grant, subscription, entitlement, trial,
-- scheduler, outbound request or business mutation.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261015170349',0));

create table test_only_checkout.subscription_anchors (
  request_ref uuid primary key references test_only_checkout.requests(id) on delete restrict,
  checkout_event_id text not null unique references test_only_checkout.events(event_id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  request_id uuid not null unique,
  provider_account_id text not null check (provider_account_id~'^acct_[A-Za-z0-9_]{8,160}$'),
  provider_session_id text not null unique check (provider_session_id~'^cs_test_[A-Za-z0-9_]{8,160}$'),
  provider_customer_id text not null check (provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$'),
  provider_subscription_id text not null unique check (provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'),
  product_id text not null check (product_id~'^prod_[A-Za-z0-9]+$'),
  price_id text not null check (price_id~'^price_[A-Za-z0-9]+$'),
  checkout_payload_sha256 text not null check (checkout_payload_sha256~'^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create table test_only_checkout.subscription_events (
  event_id text primary key check (event_id~'^evt_[A-Za-z0-9_]{8,160}$'),
  request_ref uuid not null references test_only_checkout.subscription_anchors(request_ref) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  provider_account_id text not null check (provider_account_id~'^acct_[A-Za-z0-9_]{8,160}$'),
  provider_customer_id text not null check (provider_customer_id~'^cus_[A-Za-z0-9_]{8,160}$'),
  provider_subscription_id text not null check (provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'),
  provider_object_id text not null,
  event_type text not null check (event_type in ('invoice.paid','invoice.payment_failed',
    'customer.subscription.updated','customer.subscription.deleted')),
  livemode boolean not null check (livemode=false),
  price_id text not null check (price_id~'^price_[A-Za-z0-9]+$'),
  amount_minor integer not null check (amount_minor=5900),
  currency text not null check (currency='EUR'),
  provider_status text not null check (length(provider_status) between 1 and 80),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end>period_start),
  cancel_at_period_end boolean not null,
  payload_sha256 text not null check (payload_sha256~'^[0-9a-f]{64}$'),
  event_created_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  projection_applied boolean not null,
  result_code text not null check (result_code='TEST_ONLY_SUBSCRIPTION_EVENT_RECORDED'),
  check ((event_type like 'invoice.%' and provider_object_id~'^in_[A-Za-z0-9_]{8,160}$')
    or (event_type like 'customer.subscription.%' and provider_object_id=provider_subscription_id))
);

create table test_only_checkout.subscription_state (
  request_ref uuid primary key references test_only_checkout.subscription_anchors(request_ref) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  provider_subscription_id text not null unique check (provider_subscription_id~'^sub_[A-Za-z0-9_]{8,160}$'),
  synthetic_state text not null check (synthetic_state in ('CHECKOUT_COMPLETED_TEST','ACTIVE_TEST','PAST_DUE_TEST',
    'CANCEL_AT_PERIOD_END_TEST','CANCELLED_TEST')),
  last_event_id text references test_only_checkout.subscription_events(event_id) on delete restrict,
  last_event_created_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table test_only_checkout.subscription_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  request_ref uuid not null references test_only_checkout.subscription_anchors(request_ref) on delete restrict,
  event_id text not null unique,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  action text not null check (action in ('SUBSCRIPTION_ANCHORED','LIFECYCLE_EVENT_RECORDED')),
  projection_applied boolean not null,
  evidence_sha256 text not null check (evidence_sha256~'^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

alter table test_only_checkout.subscription_anchors enable row level security;
alter table test_only_checkout.subscription_events enable row level security;
alter table test_only_checkout.subscription_state enable row level security;
alter table test_only_checkout.subscription_audit enable row level security;
revoke all on test_only_checkout.subscription_anchors,test_only_checkout.subscription_events,
  test_only_checkout.subscription_state,test_only_checkout.subscription_audit from public,anon,authenticated,service_role;
revoke all on all sequences in schema test_only_checkout from public,anon,authenticated,service_role;

create trigger test_only_subscription_anchors_immutable before update or delete or truncate
on test_only_checkout.subscription_anchors for each statement execute function test_only_checkout.protect_append_only();
create trigger test_only_subscription_events_immutable before update or delete or truncate
on test_only_checkout.subscription_events for each statement execute function test_only_checkout.protect_append_only();
create trigger test_only_subscription_audit_immutable before update or delete or truncate
on test_only_checkout.subscription_audit for each statement execute function test_only_checkout.protect_append_only();

create function test_only_checkout.guard_subscription_state() returns trigger
language plpgsql set search_path=pg_catalog as $function$
begin
  if current_setting('wuxuai.test_only_subscription_write',true) is distinct from 'on'
    or new.request_ref<>old.request_ref or new.restaurant_id<>old.restaurant_id
    or new.provider_subscription_id<>old.provider_subscription_id then
    raise exception 'TEST_ONLY_SUBSCRIPTION_STATE_MUTATION_DENIED' using errcode='42501';
  end if;
  if old.synthetic_state='CANCELLED_TEST' and new.synthetic_state<>'CANCELLED_TEST' then
    raise exception 'TEST_ONLY_SUBSCRIPTION_TERMINAL_STATE' using errcode='23514';
  end if;
  return new;
end $function$;
revoke all on function test_only_checkout.guard_subscription_state() from public,anon,authenticated,service_role;
create trigger test_only_subscription_state_guard before update on test_only_checkout.subscription_state
for each row execute function test_only_checkout.guard_subscription_state();
create trigger test_only_subscription_state_no_delete before delete or truncate on test_only_checkout.subscription_state
for each statement execute function test_only_checkout.protect_append_only();

create function public.record_test_only_stripe_checkout_completed_v2(input_event_id text,input_payload_sha256 text,
  input_event_created_at timestamptz,input_provider_account_id text,input_provider_session_id text,
  input_provider_customer_id text,input_provider_subscription_id text,input_restaurant_id uuid,input_request_id uuid,
  input_price_id text,input_amount_total integer,input_currency text,input_livemode boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare checkout_result jsonb; req test_only_checkout.requests%rowtype; checkout_event test_only_checkout.events%rowtype;
  existing test_only_checkout.subscription_anchors%rowtype; evidence text;
begin
  perform project_bootstrap.require_runtime_binding(false);
  if auth.role()<>'service_role' or input_provider_customer_id!~'^cus_[A-Za-z0-9_]{8,160}$'
    or input_provider_subscription_id!~'^sub_[A-Za-z0-9_]{8,160}$' then
    raise exception 'TEST_ONLY_SUBSCRIPTION_ANCHOR_INVALID' using errcode='22023';
  end if;
  select public.record_test_only_stripe_checkout_completed(input_event_id,input_payload_sha256,input_event_created_at,
    input_provider_account_id,input_provider_session_id,input_restaurant_id,input_request_id,input_price_id,
    input_amount_total,input_currency,input_livemode) into checkout_result;
  perform pg_advisory_xact_lock(hashtextextended('test-only-subscription-anchor:'||input_provider_subscription_id,0));
  select * into req from test_only_checkout.requests where provider_session_id=input_provider_session_id for update;
  select * into checkout_event from test_only_checkout.events where event_id=input_event_id;
  if req.id is null or req.status<>'COMPLETED' or checkout_event.event_id is null
    or checkout_event.request_ref<>req.id or checkout_event.payload_sha256<>input_payload_sha256
    or req.restaurant_id<>input_restaurant_id or req.request_id<>input_request_id
    or req.provider_account_id<>input_provider_account_id or req.price_id<>input_price_id then
    raise exception 'TEST_ONLY_SUBSCRIPTION_ANCHOR_BINDING_MISMATCH' using errcode='42501';
  end if;
  select * into existing from test_only_checkout.subscription_anchors where request_ref=req.id;
  if existing.request_ref is not null then
    if existing.checkout_event_id<>input_event_id or existing.provider_account_id<>input_provider_account_id
      or existing.provider_session_id<>input_provider_session_id or existing.provider_customer_id<>input_provider_customer_id
      or existing.provider_subscription_id<>input_provider_subscription_id or existing.price_id<>input_price_id
      or existing.checkout_payload_sha256<>input_payload_sha256 then
      raise exception 'TEST_ONLY_SUBSCRIPTION_ANCHOR_REPLAY_CONFLICT' using errcode='23505';
    end if;
    return checkout_result||jsonb_build_object('subscription_anchor',true,'anchor_idempotent',true,
      'real_subscription',false,'real_entitlement',false,'real_activation',false);
  end if;
  evidence:=encode(extensions.digest(convert_to(req.id::text||':'||input_provider_subscription_id||':'||input_payload_sha256,'UTF8'),'sha256'),'hex');
  insert into test_only_checkout.subscription_anchors(request_ref,checkout_event_id,restaurant_id,organization_id,branch_id,
    request_id,provider_account_id,provider_session_id,provider_customer_id,provider_subscription_id,product_id,price_id,
    checkout_payload_sha256)
  values(req.id,input_event_id,req.restaurant_id,req.organization_id,req.branch_id,req.request_id,input_provider_account_id,
    input_provider_session_id,input_provider_customer_id,input_provider_subscription_id,req.product_id,req.price_id,input_payload_sha256);
  insert into test_only_checkout.subscription_state(request_ref,restaurant_id,provider_subscription_id,synthetic_state)
  values(req.id,req.restaurant_id,input_provider_subscription_id,'CHECKOUT_COMPLETED_TEST');
  insert into test_only_checkout.subscription_audit(request_ref,event_id,restaurant_id,action,projection_applied,evidence_sha256)
  values(req.id,input_event_id,req.restaurant_id,'SUBSCRIPTION_ANCHORED',true,evidence);
  return checkout_result||jsonb_build_object('subscription_anchor',true,'anchor_idempotent',false,
    'real_subscription',false,'real_entitlement',false,'real_activation',false);
end $function$;
revoke all on function public.record_test_only_stripe_checkout_completed_v2(text,text,timestamptz,text,text,text,text,uuid,uuid,text,integer,text,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.record_test_only_stripe_checkout_completed_v2(text,text,timestamptz,text,text,text,text,uuid,uuid,text,integer,text,boolean)
to service_role;

create function public.record_test_only_stripe_subscription_event(input_event_id text,input_event_type text,
  input_payload_sha256 text,input_event_created_at timestamptz,input_provider_account_id text,input_provider_object_id text,
  input_provider_customer_id text,input_provider_subscription_id text,input_checkout_request_id uuid,
  input_restaurant_id uuid,input_request_id uuid,input_price_id text,input_amount_minor integer,input_currency text,
  input_provider_status text,input_period_start timestamptz,input_period_end timestamptz,
  input_cancel_at_period_end boolean,input_livemode boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare prior test_only_checkout.subscription_events%rowtype; anchor_row test_only_checkout.subscription_anchors%rowtype;
  state_row test_only_checkout.subscription_state%rowtype; next_state text; apply_projection boolean; evidence text;
begin
  perform project_bootstrap.require_runtime_binding(false);
  if auth.role()<>'service_role' or input_event_id!~'^evt_[A-Za-z0-9_]{8,160}$'
    or input_event_type not in ('invoice.paid','invoice.payment_failed','customer.subscription.updated','customer.subscription.deleted')
    or input_payload_sha256!~'^[0-9a-f]{64}$' or input_event_created_at is null
    or input_provider_account_id!~'^acct_[A-Za-z0-9_]{8,160}$'
    or input_provider_customer_id!~'^cus_[A-Za-z0-9_]{8,160}$'
    or input_provider_subscription_id!~'^sub_[A-Za-z0-9_]{8,160}$'
    or input_price_id!~'^price_[A-Za-z0-9]+$' or input_amount_minor<>5900
    or upper(input_currency)<>'EUR' or input_livemode is distinct from false
    or input_period_start is null or input_period_end is null or input_period_end<=input_period_start
    or input_provider_status is null or length(input_provider_status) not between 1 and 80 then
    raise exception 'TEST_ONLY_SUBSCRIPTION_EVENT_INVALID' using errcode='22023';
  end if;
  if (input_event_type like 'invoice.%' and input_provider_object_id!~'^in_[A-Za-z0-9_]{8,160}$')
    or (input_event_type like 'customer.subscription.%' and input_provider_object_id<>input_provider_subscription_id)
    or (input_event_type='invoice.paid' and input_provider_status<>'paid')
    or (input_event_type='invoice.payment_failed' and input_provider_status not in ('open','uncollectible'))
    or (input_event_type='customer.subscription.updated' and input_provider_status not in ('active','past_due'))
    or (input_event_type='customer.subscription.deleted' and input_provider_status<>'canceled') then
    raise exception 'TEST_ONLY_SUBSCRIPTION_EVENT_SEMANTICS_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-subscription-event:'||input_event_id,0));
  select * into prior from test_only_checkout.subscription_events where event_id=input_event_id;
  if prior.event_id is not null then
    if prior.payload_sha256<>input_payload_sha256 then
      raise exception 'TEST_ONLY_SUBSCRIPTION_EVENT_REPLAY_CONFLICT' using errcode='23505';
    end if;
    select * into state_row from test_only_checkout.subscription_state where request_ref=prior.request_ref;
    return jsonb_build_object('status',prior.result_code,'idempotent',true,'event_id',prior.event_id,
      'projection_applied',prior.projection_applied,'synthetic_state',state_row.synthetic_state,
      'real_subscription',false,'real_entitlement',false,'real_activation',false,'trial_claim',false);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-subscription:'||input_provider_subscription_id,0));
  select * into anchor_row from test_only_checkout.subscription_anchors where request_ref=input_checkout_request_id for share;
  if anchor_row.request_ref is null or anchor_row.restaurant_id<>input_restaurant_id
    or anchor_row.request_id<>input_request_id or anchor_row.provider_account_id<>input_provider_account_id
    or anchor_row.provider_customer_id<>input_provider_customer_id
    or anchor_row.provider_subscription_id<>input_provider_subscription_id or anchor_row.price_id<>input_price_id then
    raise exception 'TEST_ONLY_SUBSCRIPTION_EVENT_BINDING_MISMATCH' using errcode='42501';
  end if;
  select * into state_row from test_only_checkout.subscription_state where request_ref=anchor_row.request_ref for update;
  if input_event_type='invoice.paid' then next_state:='ACTIVE_TEST';
  elsif input_event_type='invoice.payment_failed' then next_state:='PAST_DUE_TEST';
  elsif input_event_type='customer.subscription.deleted' then next_state:='CANCELLED_TEST';
  elsif input_cancel_at_period_end then next_state:='CANCEL_AT_PERIOD_END_TEST';
  elsif input_provider_status='past_due' then next_state:='PAST_DUE_TEST';
  else next_state:='ACTIVE_TEST'; end if;
  apply_projection:=state_row.synthetic_state<>'CANCELLED_TEST' and
    (state_row.last_event_created_at is null or (input_event_created_at,input_event_id)>(state_row.last_event_created_at,state_row.last_event_id));
  insert into test_only_checkout.subscription_events(event_id,request_ref,restaurant_id,provider_account_id,
    provider_customer_id,provider_subscription_id,provider_object_id,event_type,livemode,price_id,amount_minor,currency,
    provider_status,period_start,period_end,cancel_at_period_end,payload_sha256,event_created_at,projection_applied,result_code)
  values(input_event_id,anchor_row.request_ref,anchor_row.restaurant_id,input_provider_account_id,input_provider_customer_id,
    input_provider_subscription_id,input_provider_object_id,input_event_type,false,input_price_id,5900,'EUR',
    input_provider_status,input_period_start,input_period_end,input_cancel_at_period_end,input_payload_sha256,
    input_event_created_at,apply_projection,'TEST_ONLY_SUBSCRIPTION_EVENT_RECORDED');
  if apply_projection then
    perform set_config('wuxuai.test_only_subscription_write','on',true);
    update test_only_checkout.subscription_state set synthetic_state=next_state,last_event_id=input_event_id,
      last_event_created_at=input_event_created_at,current_period_start=input_period_start,current_period_end=input_period_end,
      cancel_at_period_end=input_cancel_at_period_end,updated_at=clock_timestamp() where request_ref=anchor_row.request_ref;
    state_row.synthetic_state:=next_state;
  end if;
  evidence:=encode(extensions.digest(convert_to(input_event_id||':'||input_payload_sha256||':'||apply_projection::text,'UTF8'),'sha256'),'hex');
  insert into test_only_checkout.subscription_audit(request_ref,event_id,restaurant_id,action,projection_applied,evidence_sha256)
  values(anchor_row.request_ref,input_event_id,anchor_row.restaurant_id,'LIFECYCLE_EVENT_RECORDED',apply_projection,evidence);
  return jsonb_build_object('status','TEST_ONLY_SUBSCRIPTION_EVENT_RECORDED','idempotent',false,
    'event_id',input_event_id,'projection_applied',apply_projection,'synthetic_state',state_row.synthetic_state,
    'real_subscription',false,'real_entitlement',false,'real_activation',false,'trial_claim',false);
end $function$;
revoke all on function public.record_test_only_stripe_subscription_event(text,text,text,timestamptz,text,text,text,text,uuid,uuid,uuid,text,integer,text,text,timestamptz,timestamptz,boolean,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.record_test_only_stripe_subscription_event(text,text,text,timestamptz,text,text,text,text,uuid,uuid,uuid,text,integer,text,text,timestamptz,timestamptz,boolean,boolean)
to service_role;

create function public.get_test_only_stripe_subscription_lifecycle(input_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare anchor_row test_only_checkout.subscription_anchors%rowtype; state_row test_only_checkout.subscription_state%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(false);
  if auth.role()<>'service_role' then raise exception 'TEST_ONLY_SUBSCRIPTION_READ_DENIED' using errcode='42501'; end if;
  select * into anchor_row from test_only_checkout.subscription_anchors where request_id=input_request_id;
  if anchor_row.request_ref is null then return null; end if;
  select * into state_row from test_only_checkout.subscription_state where request_ref=anchor_row.request_ref;
  return jsonb_build_object('request_ref',anchor_row.request_ref,'restaurant_id',anchor_row.restaurant_id,
    'provider_account_id',anchor_row.provider_account_id,'provider_session_id',anchor_row.provider_session_id,
    'provider_customer_id',anchor_row.provider_customer_id,'provider_subscription_id',anchor_row.provider_subscription_id,
    'price_id',anchor_row.price_id,'synthetic_state',state_row.synthetic_state,
    'current_period_start',state_row.current_period_start,'current_period_end',state_row.current_period_end,
    'cancel_at_period_end',state_row.cancel_at_period_end,
    'event_count',(select count(*) from test_only_checkout.subscription_events e where e.request_ref=anchor_row.request_ref),
    'audit_count',(select count(*) from test_only_checkout.subscription_audit a where a.request_ref=anchor_row.request_ref),
    'real_subscription',false,'real_entitlement',false,'real_activation',false,'trial_claim',false);
end $function$;
revoke all on function public.get_test_only_stripe_subscription_lifecycle(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_test_only_stripe_subscription_lifecycle(uuid) to service_role;

notify pgrst,'reload schema';
commit;
