-- Isolated TEST_ONLY Stripe Checkout evidence. This migration creates no
-- request, session, event, subscription, entitlement, trial or activation.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261013154250',0));

create schema test_only_checkout;
revoke all on schema test_only_checkout from public,anon,authenticated,service_role;

create table test_only_checkout.requests (
  id uuid primary key default extensions.gen_random_uuid(),
  project_ref text not null check (project_ref ~ '^[a-z]{20}$'),
  binding_id uuid not null,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  access_receipt_id uuid not null references public.test_only_basic_access_receipts(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  return_route text not null check (return_route='/admin/settings/konto-testphase'),
  product_code text not null check (product_code='BASIC'),
  catalog_version integer not null check (catalog_version>0),
  binding_revision integer not null check (binding_revision>0),
  provider text not null check (provider='STRIPE'),
  environment text not null check (environment='TEST'),
  livemode boolean not null check (livemode=false),
  product_id text not null check (product_id~'^prod_[A-Za-z0-9]+$'),
  price_id text not null check (price_id~'^price_[A-Za-z0-9]+$'),
  lookup_key text not null check (lookup_key~'^wuxuai_bonus_[a-z0-9_]+$'),
  amount_minor integer not null check (amount_minor=5900),
  currency text not null check (currency='EUR'),
  billing_interval text not null check (billing_interval='MONTH'),
  payload_sha256 text not null check (payload_sha256~'^[0-9a-f]{64}$'),
  provider_account_id text check (provider_account_id~'^acct_[A-Za-z0-9_]{8,160}$'),
  provider_session_id text unique check (provider_session_id~'^cs_test_[A-Za-z0-9_]{8,160}$'),
  status text not null default 'PREPARED' check (status in ('PREPARED','SESSION_CREATED','CANCELLED','COMPLETED')),
  created_at timestamptz not null default clock_timestamp(),
  session_created_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  check ((status='PREPARED' and provider_session_id is null and session_created_at is null and cancelled_at is null and completed_at is null)
    or (status='SESSION_CREATED' and provider_session_id is not null and provider_account_id is not null and session_created_at is not null and cancelled_at is null and completed_at is null)
    or (status='CANCELLED' and cancelled_at is not null and completed_at is null)
    or (status='COMPLETED' and provider_session_id is not null and provider_account_id is not null and session_created_at is not null and completed_at is not null and cancelled_at is null))
);

create table test_only_checkout.events (
  event_id text primary key check (event_id~'^evt_[A-Za-z0-9_]{8,160}$'),
  request_ref uuid not null unique references test_only_checkout.requests(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  provider_account_id text not null check (provider_account_id~'^acct_[A-Za-z0-9_]{8,160}$'),
  provider_session_id text not null check (provider_session_id~'^cs_test_[A-Za-z0-9_]{8,160}$'),
  event_type text not null check (event_type='checkout.session.completed'),
  livemode boolean not null check (livemode=false),
  price_id text not null check (price_id~'^price_[A-Za-z0-9]+$'),
  amount_total integer not null check (amount_total=5900),
  currency text not null check (currency='EUR'),
  payload_sha256 text not null check (payload_sha256~'^[0-9a-f]{64}$'),
  event_created_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  result_code text not null check (result_code='TEST_ONLY_CHECKOUT_COMPLETED')
);

create table test_only_checkout.audit (
  id uuid primary key default extensions.gen_random_uuid(),
  request_ref uuid not null references test_only_checkout.requests(id) on delete restrict,
  event_id text references test_only_checkout.events(event_id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  action text not null check (action in ('REQUEST_PREPARED','SESSION_CREATED','REQUEST_CANCELLED','CHECKOUT_SESSION_COMPLETED')),
  actor_ref text not null,
  request_id uuid not null,
  evidence_sha256 text not null check (evidence_sha256~'^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique(request_ref,action)
);

alter table test_only_checkout.requests enable row level security;
alter table test_only_checkout.events enable row level security;
alter table test_only_checkout.audit enable row level security;
revoke all on all tables in schema test_only_checkout from public,anon,authenticated,service_role;
revoke all on all sequences in schema test_only_checkout from public,anon,authenticated,service_role;

create function test_only_checkout.protect_append_only() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'TEST_ONLY_CHECKOUT_EVIDENCE_IMMUTABLE' using errcode='42501'; end $$;
revoke all on function test_only_checkout.protect_append_only() from public,anon,authenticated,service_role;
create trigger test_only_checkout_events_immutable before update or delete or truncate on test_only_checkout.events
for each statement execute function test_only_checkout.protect_append_only();
create trigger test_only_checkout_audit_immutable before update or delete or truncate on test_only_checkout.audit
for each statement execute function test_only_checkout.protect_append_only();

create function test_only_checkout.guard_request_update() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
  if current_setting('wuxuai.test_only_checkout_write',true) is distinct from 'on'
    or new.id<>old.id or new.project_ref<>old.project_ref or new.binding_id<>old.binding_id
    or new.restaurant_id<>old.restaurant_id or new.organization_id<>old.organization_id
    or new.branch_id<>old.branch_id or new.access_receipt_id<>old.access_receipt_id
    or new.actor_id<>old.actor_id or new.request_id<>old.request_id or new.return_route<>old.return_route
    or new.product_code<>old.product_code or new.catalog_version<>old.catalog_version
    or new.binding_revision<>old.binding_revision or new.provider<>old.provider
    or new.environment<>old.environment or new.livemode<>old.livemode
    or new.product_id<>old.product_id or new.price_id<>old.price_id or new.lookup_key<>old.lookup_key
    or new.amount_minor<>old.amount_minor or new.currency<>old.currency
    or new.billing_interval<>old.billing_interval or new.payload_sha256<>old.payload_sha256
    or new.created_at<>old.created_at then
    raise exception 'TEST_ONLY_CHECKOUT_REQUEST_MUTATION_DENIED' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function test_only_checkout.guard_request_update() from public,anon,authenticated,service_role;
create trigger test_only_checkout_requests_guard before update on test_only_checkout.requests
for each row execute function test_only_checkout.guard_request_update();
create trigger test_only_checkout_requests_no_delete before delete or truncate on test_only_checkout.requests
for each statement execute function test_only_checkout.protect_append_only();

create function test_only_checkout.snapshot(input_restaurant_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare r public.restaurants%rowtype; branch_record public.branches%rowtype;
  access_record public.test_only_basic_access_receipts%rowtype;
  catalog public.billing_catalog_internal%rowtype; binding public.billing_provider_binding_versions%rowtype;
  project jsonb;
begin
  perform project_bootstrap.require_runtime_binding(auth.role()='authenticated');
  project:=public.get_server_project_binding();
  if project is null or not exists(select 1 from public.business_verification_environment where singleton and environment='STAGING') then return null; end if;
  select * into r from public.restaurants where id=input_restaurant_id;
  select * into branch_record from public.branches where id=r.primary_branch_id and restaurant_id=r.id and organization_id=r.organization_id;
  select * into access_record from public.test_only_basic_access_receipts receipt
    where receipt.restaurant_id=r.id order by receipt.created_at desc,receipt.id desc limit 1;
  if r.id is null or r.activation_status<>'pending_activation' or branch_record.id is null
    or not exists(select 1 from public.platform_test_tenant_registry marker where marker.restaurant_id=r.id and marker.deleted_at is null)
    or access_record.action is distinct from 'GRANT' or access_record.expires_at<=statement_timestamp()
    or not public.test_only_basic_access_active_internal(r.id) then return null; end if;
  select * into catalog from public.billing_catalog_internal where product_code='BASIC' and product_kind='PLAN'
    and active and valid_from<=statement_timestamp() order by version desc limit 1;
  select * into binding from public.billing_provider_binding_versions where product_code='BASIC'
    and catalog_version=catalog.version and provider='STRIPE' and environment='TEST'
    and valid_from<=statement_timestamp() order by revision desc limit 1;
  if catalog.monthly_price_minor<>5900 or catalog.currency<>'EUR' or catalog.billing_interval<>'MONTH'
    or binding.binding_status<>'VERIFIED' or binding.price_livemode is distinct from false
    or binding.price_currency<>'EUR' or binding.price_interval<>'MONTH'
    or binding.price_amount_minor<>5900 or binding.price_usage_type<>'licensed'
    or binding.price_billing_scheme<>'per_unit' or binding.product_id is null or binding.price_id is null then return null; end if;
  return jsonb_build_object('project_ref',project->>'project_ref','binding_id',project->>'binding_id',
    'restaurant_id',r.id,'organization_id',r.organization_id,'branch_id',branch_record.id,
    'access_receipt_id',access_record.id,'product_code','BASIC','catalog_version',catalog.version,
    'binding_revision',binding.revision,'product_id',binding.product_id,'price_id',binding.price_id,
    'lookup_key',binding.lookup_key,'amount_minor',5900,'currency','EUR','billing_interval','MONTH',
    'environment','TEST','livemode',false,'real_activation',false,'real_entitlement',false);
end $function$;
revoke all on function test_only_checkout.snapshot(uuid) from public,anon,authenticated,service_role;

-- Service writers cannot use the authenticated-session resolver: its project
-- binding deliberately requires the Owner JWT. Re-evaluate the same immutable
-- receipt chain here without weakening or replacing that real resolver.
create function test_only_checkout.access_active(input_restaurant_id uuid,input_access_receipt_id uuid) returns boolean
language plpgsql stable security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare readiness_snapshot jsonb; readiness_hash text;
  readiness_receipt public.test_only_activation_trial_receipts%rowtype;
  join_receipt public.customer_test_only_join_receipts%rowtype;
  marker public.platform_test_tenant_registry%rowtype;
  latest public.test_only_basic_access_receipts%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(false);
  readiness_snapshot:=public.test_only_activation_trial_snapshot_internal(input_restaurant_id);
  if readiness_snapshot is null then return false; end if;
  readiness_hash:=encode(extensions.digest(convert_to(readiness_snapshot::text,'UTF8'),'sha256'),'hex');
  select * into readiness_receipt from public.test_only_activation_trial_receipts receipt
    where receipt.restaurant_id=input_restaurant_id order by receipt.created_at desc,receipt.id desc limit 1;
  select * into marker from public.platform_test_tenant_registry row
    where row.restaurant_id=input_restaurant_id and row.deleted_at is null;
  select receipt.* into join_receipt from public.customer_test_only_join_receipts receipt
    join public.customers customer on customer.id=receipt.customer_id and customer.restaurant_id=receipt.restaurant_id
      and customer.branch_id=receipt.branch_id and customer.is_test_customer and customer.test_session_id=receipt.test_session_id
    join public.customer_account_memberships membership on membership.account_id=receipt.account_id
      and membership.restaurant_id=receipt.restaurant_id and membership.customer_id=receipt.customer_id
    where receipt.restaurant_id=input_restaurant_id and receipt.test_session_id=marker.test_session_id
    order by receipt.accepted_at desc,receipt.request_id desc limit 1;
  select * into latest from public.test_only_basic_access_receipts receipt
    where receipt.restaurant_id=input_restaurant_id order by receipt.created_at desc,receipt.id desc limit 1;
  return coalesce(readiness_receipt.id is not null and readiness_receipt.action='TRIAL_READINESS_TEST'
    and readiness_receipt.snapshot_sha256=readiness_hash
    and readiness_receipt.result->>'synthetic_chain_complete'='true'
    and readiness_receipt.result->>'real_activation'='false' and readiness_receipt.result->>'real_trial'='false'
    and marker.restaurant_id is not null and join_receipt.request_id is not null
    and latest.id=input_access_receipt_id and latest.action='GRANT'
    and latest.starts_at<=statement_timestamp() and latest.expires_at>statement_timestamp()
    and latest.readiness_receipt_id=readiness_receipt.id and latest.readiness_snapshot_sha256=readiness_hash
    and latest.customer_join_receipt_id=join_receipt.request_id,false);
exception when others then return false;
end $function$;
revoke all on function test_only_checkout.access_active(uuid,uuid) from public,anon,authenticated,service_role;

create function public.prepare_test_only_stripe_checkout(input_restaurant_id uuid,input_request_id uuid,input_return_route text)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare snapshot_value jsonb; existing test_only_checkout.requests%rowtype; created test_only_checkout.requests%rowtype; hash_value text;
begin
  perform project_bootstrap.require_runtime_binding(true);
  if auth.uid() is null or auth.role()<>'authenticated' or input_restaurant_id is null or input_request_id is null
    or input_return_route is distinct from '/admin/settings/konto-testphase'
    or not public.is_restaurant_admin(input_restaurant_id) then raise exception 'TEST_ONLY_CHECKOUT_OWNER_REQUIRED' using errcode='42501'; end if;
  snapshot_value:=test_only_checkout.snapshot(input_restaurant_id);
  if snapshot_value is null then raise exception 'TEST_ONLY_CHECKOUT_ACCESS_DENIED' using errcode='42501'; end if;
  hash_value:=encode(extensions.digest(convert_to(jsonb_build_object('restaurant_id',input_restaurant_id,'request_id',input_request_id,
    'return_route',input_return_route,'snapshot',snapshot_value)::text,'UTF8'),'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('test-only-checkout-request:'||input_request_id::text,0));
  select * into existing from test_only_checkout.requests where request_id=input_request_id;
  if existing.id is not null then
    if existing.restaurant_id<>input_restaurant_id or existing.actor_id<>auth.uid() or existing.payload_sha256<>hash_value then
      raise exception 'TEST_ONLY_CHECKOUT_REPLAY_CONFLICT' using errcode='23505'; end if;
    return to_jsonb(existing)-array['actor_id','payload_sha256']||jsonb_build_object('idempotent',true);
  end if;
  insert into test_only_checkout.requests(project_ref,binding_id,restaurant_id,organization_id,branch_id,access_receipt_id,
    actor_id,request_id,return_route,product_code,catalog_version,binding_revision,provider,environment,livemode,
    product_id,price_id,lookup_key,amount_minor,currency,billing_interval,payload_sha256)
  values(snapshot_value->>'project_ref',(snapshot_value->>'binding_id')::uuid,input_restaurant_id,
    (snapshot_value->>'organization_id')::uuid,(snapshot_value->>'branch_id')::uuid,(snapshot_value->>'access_receipt_id')::uuid,
    auth.uid(),input_request_id,input_return_route,'BASIC',(snapshot_value->>'catalog_version')::integer,
    (snapshot_value->>'binding_revision')::integer,'STRIPE','TEST',false,snapshot_value->>'product_id',snapshot_value->>'price_id',
    snapshot_value->>'lookup_key',5900,'EUR','MONTH',hash_value) returning * into created;
  insert into test_only_checkout.audit(request_ref,restaurant_id,action,actor_ref,request_id,evidence_sha256)
    values(created.id,created.restaurant_id,'REQUEST_PREPARED',auth.uid()::text,input_request_id,hash_value);
  return to_jsonb(created)-array['actor_id','payload_sha256']||jsonb_build_object('idempotent',false);
end $function$;
revoke all on function public.prepare_test_only_stripe_checkout(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_test_only_stripe_checkout(uuid,uuid,text) to authenticated;

create function public.bind_test_only_stripe_checkout_session(input_checkout_request_id uuid,input_provider_account_id text,
  input_provider_session_id text,input_price_id text,input_livemode boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare req test_only_checkout.requests%rowtype; evidence text;
begin
  perform project_bootstrap.require_runtime_binding(false);
  if auth.role()<>'service_role' or input_provider_account_id!~'^acct_[A-Za-z0-9_]{8,160}$'
    or input_provider_session_id!~'^cs_test_[A-Za-z0-9_]{8,160}$' or input_livemode is distinct from false then
    raise exception 'TEST_ONLY_CHECKOUT_SERVICE_REQUIRED' using errcode='42501'; end if;
  select * into req from test_only_checkout.requests where id=input_checkout_request_id for update;
  if req.id is null then raise exception 'TEST_ONLY_CHECKOUT_NOT_FOUND' using errcode='P0002'; end if;
  if req.status='SESSION_CREATED' and req.provider_session_id=input_provider_session_id and req.provider_account_id=input_provider_account_id
    and req.price_id=input_price_id then return jsonb_build_object('status',req.status,'idempotent',true); end if;
  if req.status<>'PREPARED' or req.price_id<>input_price_id
    or not test_only_checkout.access_active(req.restaurant_id,req.access_receipt_id) then
    raise exception 'TEST_ONLY_CHECKOUT_SESSION_CONFLICT' using errcode='42501'; end if;
  evidence:=encode(extensions.digest(convert_to(req.id::text||':'||input_provider_account_id||':'||input_provider_session_id||':'||input_price_id,'UTF8'),'sha256'),'hex');
  perform set_config('wuxuai.test_only_checkout_write','on',true);
  update test_only_checkout.requests set provider_account_id=input_provider_account_id,provider_session_id=input_provider_session_id,
    status='SESSION_CREATED',session_created_at=clock_timestamp() where id=req.id;
  insert into test_only_checkout.audit(request_ref,restaurant_id,action,actor_ref,request_id,evidence_sha256)
    values(req.id,req.restaurant_id,'SESSION_CREATED','service_role',req.request_id,evidence);
  return jsonb_build_object('status','SESSION_CREATED','idempotent',false);
end $function$;
revoke all on function public.bind_test_only_stripe_checkout_session(uuid,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.bind_test_only_stripe_checkout_session(uuid,text,text,text,boolean) to service_role;

create function public.cancel_test_only_stripe_checkout(input_checkout_request_id uuid,input_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare req test_only_checkout.requests%rowtype; prior_cancel_request_id uuid; evidence text;
begin
  perform project_bootstrap.require_runtime_binding(true);
  select * into req from test_only_checkout.requests where id=input_checkout_request_id for update;
  if req.id is null or req.actor_id<>auth.uid() or not public.is_restaurant_admin(req.restaurant_id)
    or input_request_id is null then raise exception 'TEST_ONLY_CHECKOUT_CANCEL_DENIED' using errcode='42501'; end if;
  if req.status='CANCELLED' then
    select request_id into prior_cancel_request_id from test_only_checkout.audit
      where request_ref=req.id and action='REQUEST_CANCELLED';
    if prior_cancel_request_id is distinct from input_request_id then
      raise exception 'TEST_ONLY_CHECKOUT_CANCEL_REPLAY_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('status','CANCELLED','idempotent',true);
  end if;
  if req.status not in ('PREPARED','SESSION_CREATED') then raise exception 'TEST_ONLY_CHECKOUT_CANCEL_CONFLICT' using errcode='23505'; end if;
  evidence:=encode(extensions.digest(convert_to(req.id::text||':CANCEL:'||input_request_id::text,'UTF8'),'sha256'),'hex');
  perform set_config('wuxuai.test_only_checkout_write','on',true);
  update test_only_checkout.requests set status='CANCELLED',cancelled_at=clock_timestamp() where id=req.id;
  insert into test_only_checkout.audit(request_ref,restaurant_id,action,actor_ref,request_id,evidence_sha256)
    values(req.id,req.restaurant_id,'REQUEST_CANCELLED',auth.uid()::text,input_request_id,evidence);
  return jsonb_build_object('status','CANCELLED','idempotent',false);
end $function$;
revoke all on function public.cancel_test_only_stripe_checkout(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.cancel_test_only_stripe_checkout(uuid,uuid) to authenticated;

create function public.record_test_only_stripe_checkout_completed(input_event_id text,input_payload_sha256 text,
  input_event_created_at timestamptz,input_provider_account_id text,input_provider_session_id text,input_restaurant_id uuid,
  input_request_id uuid,input_price_id text,input_amount_total integer,input_currency text,input_livemode boolean)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare prior test_only_checkout.events%rowtype; req test_only_checkout.requests%rowtype; evidence text;
begin
  perform project_bootstrap.require_runtime_binding(false);
  if auth.role()<>'service_role' or input_event_id!~'^evt_[A-Za-z0-9_]{8,160}$'
    or input_payload_sha256!~'^[0-9a-f]{64}$' or input_provider_account_id!~'^acct_[A-Za-z0-9_]{8,160}$'
    or input_provider_session_id!~'^cs_test_[A-Za-z0-9_]{8,160}$' or input_livemode is distinct from false
    or input_event_created_at is null then raise exception 'TEST_ONLY_CHECKOUT_EVENT_INVALID' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-checkout-event:'||input_event_id,0));
  select * into prior from test_only_checkout.events where event_id=input_event_id;
  if prior.event_id is not null then
    if prior.payload_sha256<>input_payload_sha256 then raise exception 'TEST_ONLY_CHECKOUT_EVENT_REPLAY_CONFLICT' using errcode='23505'; end if;
    return jsonb_build_object('status',prior.result_code,'idempotent',true,'event_id',prior.event_id);
  end if;
  select * into req from test_only_checkout.requests where provider_session_id=input_provider_session_id for update;
  if req.id is null or req.status<>'SESSION_CREATED' or req.restaurant_id<>input_restaurant_id or req.request_id<>input_request_id
    or req.provider_account_id<>input_provider_account_id or req.price_id<>input_price_id
    or input_amount_total<>req.amount_minor or upper(input_currency)<>req.currency
    or not test_only_checkout.access_active(req.restaurant_id,req.access_receipt_id) then
    raise exception 'TEST_ONLY_CHECKOUT_EVENT_BINDING_MISMATCH' using errcode='42501'; end if;
  evidence:=encode(extensions.digest(convert_to(input_event_id||':'||input_payload_sha256||':'||req.id::text,'UTF8'),'sha256'),'hex');
  insert into test_only_checkout.events(event_id,request_ref,restaurant_id,provider_account_id,provider_session_id,event_type,
    livemode,price_id,amount_total,currency,payload_sha256,event_created_at,result_code)
  values(input_event_id,req.id,req.restaurant_id,input_provider_account_id,input_provider_session_id,'checkout.session.completed',
    false,input_price_id,input_amount_total,upper(input_currency),input_payload_sha256,input_event_created_at,'TEST_ONLY_CHECKOUT_COMPLETED');
  perform set_config('wuxuai.test_only_checkout_write','on',true);
  update test_only_checkout.requests set status='COMPLETED',completed_at=clock_timestamp() where id=req.id;
  insert into test_only_checkout.audit(request_ref,event_id,restaurant_id,action,actor_ref,request_id,evidence_sha256)
    values(req.id,input_event_id,req.restaurant_id,'CHECKOUT_SESSION_COMPLETED','service_role',req.request_id,evidence);
  return jsonb_build_object('status','TEST_ONLY_CHECKOUT_COMPLETED','idempotent',false,'event_id',input_event_id,
    'real_subscription',false,'real_entitlement',false,'real_activation',false,'trial_claim',false);
end $function$;
revoke all on function public.record_test_only_stripe_checkout_completed(text,text,timestamptz,text,text,uuid,uuid,text,integer,text,boolean)
from public,anon,authenticated,service_role;
grant execute on function public.record_test_only_stripe_checkout_completed(text,text,timestamptz,text,text,uuid,uuid,text,integer,text,boolean)
to service_role;

create function public.get_test_only_stripe_checkout_result(input_request_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,test_only_checkout as $function$
declare req test_only_checkout.requests%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(auth.role()='authenticated');
  select * into req from test_only_checkout.requests where request_id=input_request_id;
  if req.id is null or not (auth.role()='service_role' or (req.actor_id=auth.uid() and public.is_restaurant_admin(req.restaurant_id))) then
    raise exception 'TEST_ONLY_CHECKOUT_READ_DENIED' using errcode='42501'; end if;
  return jsonb_build_object('checkout_request_id',req.id,'restaurant_id',req.restaurant_id,'request_id',req.request_id,
    'status',req.status,'price_id',req.price_id,'livemode',false,'event_count',(select count(*) from test_only_checkout.events e where e.request_ref=req.id),
    'audit_count',(select count(*) from test_only_checkout.audit a where a.request_ref=req.id),
    'real_subscription',false,'real_entitlement',false,'real_activation',false,'trial_claim',false);
end $function$;
revoke all on function public.get_test_only_stripe_checkout_result(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_test_only_stripe_checkout_result(uuid) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
