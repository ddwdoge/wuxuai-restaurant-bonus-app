-- Isolated TEST_ONLY PRO in-app notification path for the bound staging-v2
-- tenant. This migration installs no grant, consent, notification, scheduler
-- or mail delivery and never mutates the real PRO entitlement resolver.
begin;

select pg_advisory_xact_lock(hashtextextended('migration:20261013094045', 0));

create table public.test_only_pro_in_app_access_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  account_id uuid not null references public.customer_accounts(id) on delete restrict,
  guest_auth_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('GRANT', 'REVOKE')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  previous_receipt_id uuid references public.test_only_pro_in_app_access_receipts(id) on delete restrict,
  starts_at timestamptz,
  expires_at timestamptz,
  reason text not null check (length(trim(reason)) between 10 and 300),
  snapshot jsonb not null,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  decision_payload jsonb not null,
  auth_evidence jsonb not null,
  result jsonb not null,
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  check (
    (action = 'GRANT' and starts_at is not null and expires_at is not null and expires_at > starts_at)
    or (action = 'REVOKE' and starts_at is null and expires_at is null)
  )
);

create index test_only_pro_in_app_access_tenant_idx
  on public.test_only_pro_in_app_access_receipts(restaurant_id, created_at desc, id desc);

create table public.test_only_pro_in_app_access_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  receipt_id uuid not null unique references public.test_only_pro_in_app_access_receipts(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  action text not null check (action in ('GRANT', 'REVOKE')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in ('TEST_ONLY_PRO_IN_APP_GRANTED', 'TEST_ONLY_PRO_IN_APP_REVOKED')),
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create table public.test_only_pro_in_app_consent_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  account_id uuid not null references public.customer_accounts(id) on delete restrict,
  guest_auth_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('ACCEPT', 'WITHDRAW')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  access_receipt_id uuid references public.test_only_pro_in_app_access_receipts(id) on delete restrict,
  request_id uuid not null unique,
  previous_receipt_id uuid references public.test_only_pro_in_app_consent_receipts(id) on delete restrict,
  consent_version text not null check (consent_version = 'TEST_ONLY_PRO_IN_APP_V1'),
  consent_content_sha256 text not null check (
    consent_content_sha256 = '91ef364b74afdb9884feed55c712692181fbf70bbd3df58b325947a68dd7ad97'
  ),
  decision_payload jsonb not null,
  result jsonb not null,
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create index test_only_pro_in_app_consent_tenant_idx
  on public.test_only_pro_in_app_consent_receipts(restaurant_id, customer_id, created_at desc, id desc);

create table public.test_only_pro_in_app_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  account_id uuid not null references public.customer_accounts(id) on delete restrict,
  guest_auth_user_id uuid not null references auth.users(id) on delete restrict,
  offer_id uuid not null references public.restaurant_offers(id) on delete restrict,
  offer_publication_receipt_id uuid not null unique references public.test_only_basic_offer_publication_receipts(id) on delete restrict,
  access_receipt_id uuid not null references public.test_only_pro_in_app_access_receipts(id) on delete restrict,
  consent_receipt_id uuid not null references public.test_only_pro_in_app_consent_receipts(id) on delete restrict,
  event_key text not null unique check (length(event_key) between 3 and 240),
  payload jsonb not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create index test_only_pro_in_app_notifications_guest_idx
  on public.test_only_pro_in_app_notifications(guest_auth_user_id, created_at desc, id desc);

create table public.test_only_pro_in_app_notification_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid not null unique references public.test_only_pro_in_app_notifications(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  offer_id uuid not null references public.restaurant_offers(id) on delete restrict,
  access_receipt_id uuid not null references public.test_only_pro_in_app_access_receipts(id) on delete restrict,
  consent_receipt_id uuid not null references public.test_only_pro_in_app_consent_receipts(id) on delete restrict,
  event_type text not null check (event_type = 'TEST_ONLY_PRO_IN_APP_OFFER_ENQUEUED'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create table public.test_only_pro_in_app_open_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_id uuid not null references public.test_only_pro_in_app_notifications(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  account_id uuid not null references public.customer_accounts(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  access_receipt_id uuid not null references public.test_only_pro_in_app_access_receipts(id) on delete restrict,
  consent_receipt_id uuid not null references public.test_only_pro_in_app_consent_receipts(id) on delete restrict,
  result jsonb not null,
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  opened_at timestamptz not null default clock_timestamp(),
  unique(notification_id, actor_id)
);

alter table public.test_only_pro_in_app_access_receipts enable row level security;
alter table public.test_only_pro_in_app_access_audit enable row level security;
alter table public.test_only_pro_in_app_consent_receipts enable row level security;
alter table public.test_only_pro_in_app_notifications enable row level security;
alter table public.test_only_pro_in_app_notification_audit enable row level security;
alter table public.test_only_pro_in_app_open_receipts enable row level security;

revoke all on public.test_only_pro_in_app_access_receipts,
  public.test_only_pro_in_app_access_audit,
  public.test_only_pro_in_app_consent_receipts,
  public.test_only_pro_in_app_notifications,
  public.test_only_pro_in_app_notification_audit,
  public.test_only_pro_in_app_open_receipts
from public, anon, authenticated, service_role;

create trigger test_only_pro_in_app_access_receipts_immutable
before update or delete or truncate on public.test_only_pro_in_app_access_receipts
for each statement execute function public.protect_business_verification_append_only();
create trigger test_only_pro_in_app_access_audit_immutable
before update or delete or truncate on public.test_only_pro_in_app_access_audit
for each statement execute function public.protect_business_verification_append_only();
create trigger test_only_pro_in_app_consent_receipts_immutable
before update or delete or truncate on public.test_only_pro_in_app_consent_receipts
for each statement execute function public.protect_business_verification_append_only();
create trigger test_only_pro_in_app_notifications_immutable
before update or delete or truncate on public.test_only_pro_in_app_notifications
for each statement execute function public.protect_business_verification_append_only();
create trigger test_only_pro_in_app_notification_audit_immutable
before update or delete or truncate on public.test_only_pro_in_app_notification_audit
for each statement execute function public.protect_business_verification_append_only();
create trigger test_only_pro_in_app_open_receipts_immutable
before update or delete or truncate on public.test_only_pro_in_app_open_receipts
for each statement execute function public.protect_business_verification_append_only();

create function public.test_only_pro_in_app_snapshot_internal(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  basic_snapshot jsonb;
  entitlement jsonb;
  guest_binding public.platform_terms_test_identities%rowtype;
  guest_account public.customer_accounts%rowtype;
  guest_membership public.customer_account_memberships%rowtype;
  guest_customer public.customers%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(true);
  basic_snapshot := public.test_only_basic_access_snapshot_internal(input_restaurant_id);
  if basic_snapshot is null then return null; end if;
  entitlement := public.resolve_restaurant_entitlements_internal(input_restaurant_id);
  if entitlement->>'effective_plan' is not null
    or coalesce((entitlement#>>'{effective,offer_notifications}')::boolean, false)
    or exists (
      select 1 from public.commercial_pro_access_grants grant_row
      where grant_row.restaurant_id = input_restaurant_id
        and grant_row.revoked_at is null
        and grant_row.starts_at <= statement_timestamp()
        and grant_row.expires_at > statement_timestamp()
    ) then
    return null;
  end if;
  select * into guest_binding from public.platform_terms_test_identities binding
  where binding.restaurant_id = input_restaurant_id
    and binding.auth_user_id = (
      select account.auth_user_id
      from public.customer_test_only_join_receipts receipt
      join public.customer_accounts account on account.id = receipt.account_id
      where receipt.request_id = (basic_snapshot->>'customer_join_receipt_id')::uuid
    );
  select * into guest_account from public.customer_accounts account
  where account.auth_user_id = guest_binding.auth_user_id and account.disabled_at is null;
  select * into guest_membership from public.customer_account_memberships membership
  where membership.account_id = guest_account.id
    and membership.restaurant_id = input_restaurant_id
    and membership.customer_id = (basic_snapshot->>'customer_id')::uuid;
  select * into guest_customer from public.customers customer
  where customer.id = guest_membership.customer_id
    and customer.restaurant_id = input_restaurant_id
    and customer.organization_id = (basic_snapshot->>'organization_id')::uuid
    and customer.branch_id = (basic_snapshot->>'branch_id')::uuid
    and customer.is_test_customer is true
    and customer.membership_status = 'active'
    and customer.test_session_id = basic_snapshot->>'test_session_id';
  if guest_binding.auth_user_id is null or guest_account.id is null
    or guest_membership.id is null or guest_customer.id is null
    or guest_binding.branch_id is distinct from guest_customer.branch_id then
    return null;
  end if;
  return jsonb_build_object(
    'schema_version', 1,
    'purpose', 'SYNTHETIC_TEST_ONLY_PRO_IN_APP',
    'project', basic_snapshot->'project',
    'restaurant_id', basic_snapshot->>'restaurant_id',
    'organization_id', basic_snapshot->>'organization_id',
    'branch_id', basic_snapshot->>'branch_id',
    'test_session_id', basic_snapshot->>'test_session_id',
    'readiness_receipt_id', basic_snapshot->>'readiness_receipt_id',
    'readiness_snapshot_sha256', basic_snapshot->>'readiness_snapshot_sha256',
    'customer_join_receipt_id', basic_snapshot->>'customer_join_receipt_id',
    'customer_id', guest_customer.id,
    'account_id', guest_account.id,
    'guest_auth_user_id', guest_binding.auth_user_id,
    'consent_version', 'TEST_ONLY_PRO_IN_APP_V1',
    'consent_content_sha256', '91ef364b74afdb9884feed55c712692181fbf70bbd3df58b325947a68dd7ad97',
    'real_pro_entitlement', false,
    'real_offer_notifications', false,
    'email_delivery', false,
    'push_delivery', false
  );
exception when others then
  return null;
end;
$function$;

create function public.test_only_pro_in_app_access_active_internal(input_restaurant_id uuid)
returns boolean language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare snapshot_value jsonb; snapshot_hash text;
  latest public.test_only_pro_in_app_access_receipts%rowtype;
begin
  snapshot_value := public.test_only_pro_in_app_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then return false; end if;
  snapshot_hash := encode(extensions.digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex');
  select * into latest from public.test_only_pro_in_app_access_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.created_at desc, receipt.id desc limit 1;
  return latest.id is not null and latest.action = 'GRANT'
    and latest.starts_at <= statement_timestamp() and latest.expires_at > statement_timestamp()
    and latest.snapshot_sha256 = snapshot_hash
    and latest.customer_id = (snapshot_value->>'customer_id')::uuid
    and latest.account_id = (snapshot_value->>'account_id')::uuid
    and latest.guest_auth_user_id = (snapshot_value->>'guest_auth_user_id')::uuid;
exception when others then return false;
end;
$function$;

create function public.test_only_pro_in_app_customer_context_internal(input_restaurant_id uuid)
returns table(restaurant_id uuid, organization_id uuid, branch_id uuid, customer_id uuid,
  account_id uuid, guest_auth_user_id uuid, access_receipt_id uuid, access_expires_at timestamptz)
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare snapshot_value jsonb; access_receipt public.test_only_pro_in_app_access_receipts%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(true);
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not public.test_only_pro_in_app_access_active_internal(input_restaurant_id) then
    raise exception 'TEST_ONLY_PRO_IN_APP_ACCESS_DENIED' using errcode='42501';
  end if;
  snapshot_value := public.test_only_pro_in_app_snapshot_internal(input_restaurant_id);
  if snapshot_value is null or snapshot_value->>'guest_auth_user_id' is distinct from auth.uid()::text then
    raise exception 'TEST_ONLY_PRO_IN_APP_GUEST_DENIED' using errcode='42501';
  end if;
  select * into access_receipt from public.test_only_pro_in_app_access_receipts receipt
  where receipt.restaurant_id=input_restaurant_id order by receipt.created_at desc,receipt.id desc limit 1;
  return query select input_restaurant_id,(snapshot_value->>'organization_id')::uuid,
    (snapshot_value->>'branch_id')::uuid,(snapshot_value->>'customer_id')::uuid,
    (snapshot_value->>'account_id')::uuid,(snapshot_value->>'guest_auth_user_id')::uuid,
    access_receipt.id,access_receipt.expires_at;
end;
$function$;

create function public.test_only_pro_in_app_consent_active_internal(
  input_restaurant_id uuid, input_customer_id uuid, input_account_id uuid
) returns boolean language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare latest public.test_only_pro_in_app_consent_receipts%rowtype;
begin
  select * into latest from public.test_only_pro_in_app_consent_receipts receipt
  where receipt.restaurant_id=input_restaurant_id and receipt.customer_id=input_customer_id
    and receipt.account_id=input_account_id
  order by receipt.created_at desc,receipt.id desc limit 1;
  return latest.id is not null and latest.action='ACCEPT'
    and latest.guest_auth_user_id=(select auth_user_id from public.customer_accounts where id=input_account_id)
    and latest.consent_version='TEST_ONLY_PRO_IN_APP_V1'
    and latest.consent_content_sha256='91ef364b74afdb9884feed55c712692181fbf70bbd3df58b325947a68dd7ad97';
exception when others then return false;
end;
$function$;

create function public.get_platform_test_only_pro_in_app_access(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare snapshot_value jsonb; latest public.test_only_pro_in_app_access_receipts%rowtype;
  consent_value boolean;
begin
  perform project_bootstrap.require_runtime_binding(true);
  perform public.require_legal_bundle_admin_internal();
  snapshot_value := public.test_only_pro_in_app_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then raise exception 'TEST_ONLY_PRO_IN_APP_CONTEXT_INVALID' using errcode='42501'; end if;
  select * into latest from public.test_only_pro_in_app_access_receipts receipt
  where receipt.restaurant_id=input_restaurant_id order by receipt.created_at desc,receipt.id desc limit 1;
  consent_value := public.test_only_pro_in_app_consent_active_internal(input_restaurant_id,
    (snapshot_value->>'customer_id')::uuid,(snapshot_value->>'account_id')::uuid);
  return jsonb_build_object(
    'synthetic_test_only',true,'real_pro_entitlement',false,'email_delivery',false,'push_delivery',false,
    'snapshot',snapshot_value,
    'snapshot_sha256',encode(extensions.digest(convert_to(snapshot_value::text,'UTF8'),'sha256'),'hex'),
    'previous_receipt_id',latest.id,'previous_action',latest.action,
    'active',public.test_only_pro_in_app_access_active_internal(input_restaurant_id),
    'starts_at',latest.starts_at,'expires_at',latest.expires_at,
    'consent_active',consent_value,
    'notification_count',(select count(*) from public.test_only_pro_in_app_notifications n where n.restaurant_id=input_restaurant_id),
    'unread_count',(select count(*) from public.test_only_pro_in_app_notifications n
      where n.restaurant_id=input_restaurant_id and not exists(select 1 from public.test_only_pro_in_app_open_receipts opened where opened.notification_id=n.id)),
    'next_action',case when latest.id is null or latest.action='REVOKE' or latest.expires_at<=statement_timestamp() then 'GRANT' else 'REVOKE' end
  );
end;
$function$;

create function public.decide_platform_test_only_pro_in_app_access(
  input_restaurant_id uuid,input_action text,input_expected_snapshot_sha256 text,
  input_expected_previous_receipt_id uuid,input_expires_at timestamptz,input_reason text,
  input_confirmation text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare snapshot_value jsonb; snapshot_hash text; previous public.test_only_pro_in_app_access_receipts%rowtype;
  prior public.test_only_pro_in_app_access_receipts%rowtype; payload_value jsonb; auth_value jsonb;
  result_value jsonb; receipt_id_value uuid:=extensions.gen_random_uuid(); receipt_hash text;
  starts_value timestamptz; expires_value timestamptz; totp_value timestamptz;
begin
  perform project_bootstrap.require_runtime_binding(true); perform public.require_legal_bundle_admin_internal();
  if input_restaurant_id is null or input_action not in ('GRANT','REVOKE')
    or coalesce(input_expected_snapshot_sha256,'') !~ '^[0-9a-f]{64}$' or input_request_id is null
    or length(trim(coalesce(input_reason,''))) not between 10 and 300 then
    raise exception 'TEST_ONLY_PRO_IN_APP_REQUEST_INVALID' using errcode='22023';
  end if;
  payload_value:=jsonb_build_object('restaurant_id',input_restaurant_id,'action',input_action,
    'snapshot_sha256',input_expected_snapshot_sha256,'previous_receipt_id',input_expected_previous_receipt_id,
    'expires_at',input_expires_at,'reason',trim(input_reason),'confirmation',input_confirmation);
  perform pg_advisory_xact_lock(hashtextextended('test-only-pro-in-app-request:'||input_request_id::text,0));
  select * into prior from public.test_only_pro_in_app_access_receipts where request_id=input_request_id;
  if prior.id is not null then
    if prior.actor_id is distinct from auth.uid() or prior.decision_payload is distinct from payload_value then
      raise exception 'TEST_ONLY_PRO_IN_APP_REPLAY_CONFLICT' using errcode='22023'; end if;
    return prior.result||jsonb_build_object('idempotent',true,'historical_receipt',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-pro-in-app:'||input_restaurant_id::text,0));
  perform project_bootstrap.require_runtime_binding(true); perform public.require_legal_bundle_admin_internal();
  snapshot_value:=public.test_only_pro_in_app_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then raise exception 'TEST_ONLY_PRO_IN_APP_CONTEXT_INVALID' using errcode='42501'; end if;
  snapshot_hash:=encode(extensions.digest(convert_to(snapshot_value::text,'UTF8'),'sha256'),'hex');
  if snapshot_hash is distinct from input_expected_snapshot_sha256 then
    raise exception 'TEST_ONLY_PRO_IN_APP_STALE' using errcode='P0001'; end if;
  select * into previous from public.test_only_pro_in_app_access_receipts receipt
  where receipt.restaurant_id=input_restaurant_id order by receipt.created_at desc,receipt.id desc limit 1;
  if previous.id is distinct from input_expected_previous_receipt_id then
    raise exception 'TEST_ONLY_PRO_IN_APP_STALE' using errcode='P0001'; end if;
  if input_confirmation is distinct from 'TEST_ONLY PRO IN_APP '||input_action||' '||input_restaurant_id::text then
    raise exception 'TEST_ONLY_PRO_IN_APP_CONFIRMATION_REQUIRED' using errcode='22023'; end if;
  if input_action='GRANT' then
    if previous.id is not null and previous.action='GRANT' and previous.expires_at>statement_timestamp() then
      raise exception 'TEST_ONLY_PRO_IN_APP_ALREADY_ACTIVE' using errcode='42501'; end if;
    starts_value:=clock_timestamp(); expires_value:=input_expires_at;
    if expires_value is null or expires_value<starts_value+interval '15 minutes' or expires_value>starts_value+interval '4 hours' then
      raise exception 'TEST_ONLY_PRO_IN_APP_WINDOW_INVALID' using errcode='22023'; end if;
  else
    if previous.id is null or previous.action<>'GRANT' or previous.expires_at<=statement_timestamp() then
      raise exception 'TEST_ONLY_PRO_IN_APP_NOT_ACTIVE' using errcode='42501'; end if;
    if input_expires_at is not null then raise exception 'TEST_ONLY_PRO_IN_APP_REVOKE_EXPIRY_FORBIDDEN' using errcode='22023'; end if;
  end if;
  select max(to_timestamp((method->>'timestamp')::double precision)) into totp_value
  from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) method
  where jsonb_typeof(method)='object' and method->>'method'='totp'
    and coalesce(method->>'timestamp','')~'^[0-9]+([.][0-9]+)?$';
  auth_value:=jsonb_build_object('aal','aal2','amr_method','totp','totp_at',totp_value,
    'role',public.current_platform_role(),'actor_id',auth.uid(),
    'session_sha256',encode(extensions.digest(convert_to(auth.jwt()->>'session_id','UTF8'),'sha256'),'hex'));
  result_value:=jsonb_build_object('receipt_id',receipt_id_value,'action',input_action,
    'restaurant_id',input_restaurant_id,'customer_id',(snapshot_value->>'customer_id')::uuid,
    'guest_auth_user_id',(snapshot_value->>'guest_auth_user_id')::uuid,
    'starts_at',starts_value,'expires_at',expires_value,'synthetic_test_only',true,
    'real_pro_entitlement',false,'email_delivery',false,'push_delivery',false,'idempotent',false);
  receipt_hash:=encode(extensions.digest(convert_to(jsonb_build_object('receipt_id',receipt_id_value,
    'actor_id',auth.uid(),'request_id',input_request_id,'previous_receipt_id',previous.id,
    'snapshot_sha256',snapshot_hash,'payload',payload_value,'auth_evidence',auth_value,'result',result_value)::text,'UTF8'),'sha256'),'hex');
  insert into public.test_only_pro_in_app_access_receipts(id,restaurant_id,organization_id,branch_id,
    customer_id,account_id,guest_auth_user_id,action,actor_id,request_id,previous_receipt_id,
    starts_at,expires_at,reason,snapshot,snapshot_sha256,decision_payload,auth_evidence,result,receipt_sha256)
  values(receipt_id_value,input_restaurant_id,(snapshot_value->>'organization_id')::uuid,
    (snapshot_value->>'branch_id')::uuid,(snapshot_value->>'customer_id')::uuid,
    (snapshot_value->>'account_id')::uuid,(snapshot_value->>'guest_auth_user_id')::uuid,
    input_action,auth.uid(),input_request_id,previous.id,starts_value,expires_value,trim(input_reason),
    snapshot_value,snapshot_hash,payload_value,auth_value,result_value,receipt_hash);
  insert into public.test_only_pro_in_app_access_audit(receipt_id,restaurant_id,action,actor_id,
    request_id,snapshot_sha256,event_type,receipt_sha256)
  values(receipt_id_value,input_restaurant_id,input_action,auth.uid(),input_request_id,snapshot_hash,
    case input_action when 'GRANT' then 'TEST_ONLY_PRO_IN_APP_GRANTED' else 'TEST_ONLY_PRO_IN_APP_REVOKED' end,receipt_hash);
  return result_value;
end;
$function$;

create function public.set_test_only_pro_in_app_consent(
  input_restaurant_id uuid,input_action text,input_expected_version text,
  input_expected_content_sha256 text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare context_value record; previous public.test_only_pro_in_app_consent_receipts%rowtype;
  prior public.test_only_pro_in_app_consent_receipts%rowtype; payload_value jsonb; result_value jsonb;
  receipt_id_value uuid:=extensions.gen_random_uuid(); receipt_hash text;
begin
  if input_action not in ('ACCEPT','WITHDRAW') or input_expected_version<>'TEST_ONLY_PRO_IN_APP_V1'
    or input_expected_content_sha256<>'91ef364b74afdb9884feed55c712692181fbf70bbd3df58b325947a68dd7ad97'
    or input_request_id is null then raise exception 'TEST_ONLY_PRO_IN_APP_CONSENT_INVALID' using errcode='22023'; end if;
  select * into context_value from public.test_only_pro_in_app_customer_context_internal(input_restaurant_id);
  payload_value:=jsonb_build_object('restaurant_id',input_restaurant_id,'action',input_action,
    'version',input_expected_version,'content_sha256',input_expected_content_sha256);
  perform pg_advisory_xact_lock(hashtextextended('test-only-pro-in-app-consent-request:'||input_request_id::text,0));
  select * into prior from public.test_only_pro_in_app_consent_receipts where request_id=input_request_id;
  if prior.id is not null then
    if prior.actor_id is distinct from auth.uid() or prior.decision_payload is distinct from payload_value then
      raise exception 'TEST_ONLY_PRO_IN_APP_CONSENT_REPLAY_CONFLICT' using errcode='22023'; end if;
    return prior.result||jsonb_build_object('idempotent',true,'historical_receipt',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-pro-in-app-consent:'||input_restaurant_id::text,0));
  select * into context_value from public.test_only_pro_in_app_customer_context_internal(input_restaurant_id);
  select * into previous from public.test_only_pro_in_app_consent_receipts receipt
  where receipt.restaurant_id=input_restaurant_id and receipt.customer_id=context_value.customer_id
  order by receipt.created_at desc,receipt.id desc limit 1;
  if input_action='ACCEPT' and previous.id is not null and previous.action='ACCEPT' then
    raise exception 'TEST_ONLY_PRO_IN_APP_CONSENT_ALREADY_ACTIVE' using errcode='42501'; end if;
  if input_action='WITHDRAW' and (previous.id is null or previous.action<>'ACCEPT') then
    raise exception 'TEST_ONLY_PRO_IN_APP_CONSENT_NOT_ACTIVE' using errcode='42501'; end if;
  result_value:=jsonb_build_object('receipt_id',receipt_id_value,'action',input_action,
    'restaurant_id',input_restaurant_id,'customer_id',context_value.customer_id,
    'consent_active',input_action='ACCEPT','consent_version',input_expected_version,
    'consent_content_sha256',input_expected_content_sha256,'synthetic_test_only',true,'idempotent',false);
  receipt_hash:=encode(extensions.digest(convert_to(jsonb_build_object('receipt_id',receipt_id_value,
    'actor_id',auth.uid(),'request_id',input_request_id,'previous_receipt_id',previous.id,
    'payload',payload_value,'result',result_value)::text,'UTF8'),'sha256'),'hex');
  insert into public.test_only_pro_in_app_consent_receipts(id,restaurant_id,customer_id,account_id,
    guest_auth_user_id,action,actor_id,access_receipt_id,request_id,previous_receipt_id,
    consent_version,consent_content_sha256,decision_payload,result,receipt_sha256)
  values(receipt_id_value,input_restaurant_id,context_value.customer_id,context_value.account_id,
    context_value.guest_auth_user_id,input_action,auth.uid(),context_value.access_receipt_id,
    input_request_id,previous.id,input_expected_version,input_expected_content_sha256,payload_value,result_value,receipt_hash);
  return result_value;
end;
$function$;

create function public.enqueue_test_only_pro_in_app_offer_internal()
returns trigger language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare access_receipt public.test_only_pro_in_app_access_receipts%rowtype;
  consent_receipt public.test_only_pro_in_app_consent_receipts%rowtype; offer_record public.restaurant_offers%rowtype;
  payload_value jsonb; payload_hash text; notification_id_value uuid;
begin
  if not public.test_only_pro_in_app_access_active_internal(new.restaurant_id) then return new; end if;
  select * into access_receipt from public.test_only_pro_in_app_access_receipts receipt
  where receipt.restaurant_id=new.restaurant_id order by receipt.created_at desc,receipt.id desc limit 1;
  select * into consent_receipt from public.test_only_pro_in_app_consent_receipts receipt
  where receipt.restaurant_id=new.restaurant_id and receipt.customer_id=access_receipt.customer_id
    and receipt.account_id=access_receipt.account_id order by receipt.created_at desc,receipt.id desc limit 1;
  if consent_receipt.id is null or consent_receipt.action<>'ACCEPT' then return new; end if;
  select * into offer_record from public.restaurant_offers offer
  where offer.id=new.offer_id and offer.restaurant_id=new.restaurant_id and offer.branch_id=new.branch_id
    and offer.status='PUBLISHED' and offer.is_active and offer.publication_version=(new.result->>'publication_version')::integer
    and offer.valid_to>statement_timestamp();
  if offer_record.id is null then return new; end if;
  payload_value:=jsonb_build_object('event_type','OFFER_PUBLISHED','offer_id',offer_record.id,
    'title',offer_record.title,'restaurant_id',new.restaurant_id,'publication_version',offer_record.publication_version,
    'synthetic_test_only',true,'email_delivery',false,'push_delivery',false);
  payload_hash:=encode(extensions.digest(convert_to(payload_value::text,'UTF8'),'sha256'),'hex');
  insert into public.test_only_pro_in_app_notifications(restaurant_id,organization_id,branch_id,
    customer_id,account_id,guest_auth_user_id,offer_id,offer_publication_receipt_id,access_receipt_id,
    consent_receipt_id,event_key,payload,payload_sha256)
  values(new.restaurant_id,new.organization_id,new.branch_id,access_receipt.customer_id,access_receipt.account_id,
    access_receipt.guest_auth_user_id,offer_record.id,new.id,access_receipt.id,consent_receipt.id,
    offer_record.id::text||':'||offer_record.publication_version::text,payload_value,payload_hash)
  on conflict (offer_publication_receipt_id) do nothing returning id into notification_id_value;
  if notification_id_value is not null then
    insert into public.test_only_pro_in_app_notification_audit(notification_id,restaurant_id,customer_id,
      offer_id,access_receipt_id,consent_receipt_id,event_type,payload_sha256)
    values(notification_id_value,new.restaurant_id,access_receipt.customer_id,offer_record.id,
      access_receipt.id,consent_receipt.id,'TEST_ONLY_PRO_IN_APP_OFFER_ENQUEUED',payload_hash);
  end if;
  return new;
end;
$function$;

create trigger enqueue_test_only_pro_in_app_offer
after insert on public.test_only_basic_offer_publication_receipts
for each row execute function public.enqueue_test_only_pro_in_app_offer_internal();

create function public.get_test_only_pro_in_app_inbox(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare context_value record; consent_value boolean; result_value jsonb;
begin
  select * into context_value from public.test_only_pro_in_app_customer_context_internal(input_restaurant_id);
  consent_value:=public.test_only_pro_in_app_consent_active_internal(input_restaurant_id,
    context_value.customer_id,context_value.account_id);
  with visible as materialized (
    select n.id,n.created_at,n.payload,n.payload_sha256,o.id offer_id,o.title,o.short_description,
      o.valid_to,opened.opened_at read_at
    from public.test_only_pro_in_app_notifications n
    join public.restaurant_offers o on o.id=n.offer_id and o.restaurant_id=n.restaurant_id
      and o.branch_id=n.branch_id and o.status='PUBLISHED' and o.is_active and o.valid_to>statement_timestamp()
    left join public.test_only_pro_in_app_open_receipts opened
      on opened.notification_id=n.id and opened.actor_id=context_value.guest_auth_user_id
    where consent_value and n.restaurant_id=input_restaurant_id
      and n.customer_id=context_value.customer_id and n.account_id=context_value.account_id
      and n.guest_auth_user_id=context_value.guest_auth_user_id
    order by n.created_at desc,n.id desc
  ) select jsonb_build_object('synthetic_test_only',true,'available',true,'active',true,
    'access_receipt_id',context_value.access_receipt_id,'expires_at',context_value.access_expires_at,
    'consent_active',consent_value,'consent_version','TEST_ONLY_PRO_IN_APP_V1',
    'consent_content_sha256','91ef364b74afdb9884feed55c712692181fbf70bbd3df58b325947a68dd7ad97',
    'unread_count',count(*) filter(where read_at is null),
    'items',coalesce(jsonb_agg(jsonb_build_object('id',id,'created_at',created_at,'read_at',read_at,
      'payload_sha256',payload_sha256,'offer',jsonb_build_object('id',offer_id,'title',title,
        'short_description',short_description,'valid_to',valid_to,'synthetic_test_only',true))
      order by created_at desc,id desc),'[]'::jsonb),
    'email_delivery',false,'push_delivery',false) into result_value from visible;
  return result_value;
end;
$function$;

create function public.open_test_only_pro_in_app_notification(
  input_restaurant_id uuid,input_notification_id uuid,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare context_value record; notification public.test_only_pro_in_app_notifications%rowtype;
  existing public.test_only_pro_in_app_open_receipts%rowtype; result_value jsonb; hash_value text;
begin
  if input_notification_id is null or input_request_id is null then
    raise exception 'TEST_ONLY_PRO_IN_APP_OPEN_INVALID' using errcode='22023'; end if;
  select * into context_value from public.test_only_pro_in_app_customer_context_internal(input_restaurant_id);
  if not public.test_only_pro_in_app_consent_active_internal(input_restaurant_id,context_value.customer_id,context_value.account_id) then
    raise exception 'TEST_ONLY_PRO_IN_APP_CONSENT_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('test-only-pro-in-app-open-request:'||input_request_id::text,0));
  select * into existing from public.test_only_pro_in_app_open_receipts where request_id=input_request_id;
  if existing.id is not null then
    if existing.actor_id is distinct from auth.uid() or existing.notification_id is distinct from input_notification_id then
      raise exception 'TEST_ONLY_PRO_IN_APP_OPEN_REPLAY_CONFLICT' using errcode='22023'; end if;
    return existing.result||jsonb_build_object('idempotent',true,'historical_receipt',true);
  end if;
  select n.* into notification from public.test_only_pro_in_app_notifications n
  join public.restaurant_offers o on o.id=n.offer_id and o.restaurant_id=n.restaurant_id
    and o.branch_id=n.branch_id and o.status='PUBLISHED' and o.is_active and o.valid_to>clock_timestamp()
  where n.id=input_notification_id and n.restaurant_id=input_restaurant_id
    and n.customer_id=context_value.customer_id and n.account_id=context_value.account_id
    and n.guest_auth_user_id=context_value.guest_auth_user_id for update of n;
  if notification.id is null then raise exception 'TEST_ONLY_PRO_IN_APP_NOTIFICATION_UNAVAILABLE' using errcode='42501'; end if;
  select * into existing from public.test_only_pro_in_app_open_receipts opened
  where opened.notification_id=notification.id and opened.actor_id=auth.uid();
  result_value:=jsonb_build_object('notification_id',notification.id,'restaurant_id',input_restaurant_id,
    'offer_id',notification.offer_id,'read_at',coalesce(existing.opened_at,clock_timestamp()),
    'synthetic_test_only',true,'idempotent',existing.id is not null);
  if existing.id is null then
    hash_value:=encode(extensions.digest(convert_to(jsonb_build_object('actor_id',auth.uid(),
      'request_id',input_request_id,'notification_id',notification.id,'result',result_value)::text,'UTF8'),'sha256'),'hex');
    insert into public.test_only_pro_in_app_open_receipts(notification_id,restaurant_id,customer_id,
      account_id,actor_id,request_id,access_receipt_id,consent_receipt_id,result,receipt_sha256)
    values(notification.id,input_restaurant_id,context_value.customer_id,context_value.account_id,
      auth.uid(),input_request_id,context_value.access_receipt_id,notification.consent_receipt_id,
      result_value,hash_value);
  end if;
  return result_value;
end;
$function$;

revoke all on function public.test_only_pro_in_app_snapshot_internal(uuid),
  public.test_only_pro_in_app_access_active_internal(uuid),
  public.test_only_pro_in_app_customer_context_internal(uuid),
  public.test_only_pro_in_app_consent_active_internal(uuid,uuid,uuid),
  public.enqueue_test_only_pro_in_app_offer_internal()
from public,anon,authenticated,service_role;

revoke all on function public.get_platform_test_only_pro_in_app_access(uuid),
  public.decide_platform_test_only_pro_in_app_access(uuid,text,text,uuid,timestamptz,text,text,uuid),
  public.set_test_only_pro_in_app_consent(uuid,text,text,text,uuid),
  public.get_test_only_pro_in_app_inbox(uuid),
  public.open_test_only_pro_in_app_notification(uuid,uuid,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.get_platform_test_only_pro_in_app_access(uuid),
  public.decide_platform_test_only_pro_in_app_access(uuid,text,text,uuid,timestamptz,text,text,uuid),
  public.set_test_only_pro_in_app_consent(uuid,text,text,text,uuid),
  public.get_test_only_pro_in_app_inbox(uuid),
  public.open_test_only_pro_in_app_notification(uuid,uuid,uuid)
to authenticated;

comment on table public.test_only_pro_in_app_notifications is
  'Private synthetic TEST_ONLY in-app notification receipts. Never a real PRO entitlement, email, push or marketing queue.';
comment on function public.get_test_only_pro_in_app_inbox(uuid) is
  'Reads only the bound synthetic guest inbox while the isolated TEST_ONLY PRO grant and dedicated consent are current.';

notify pgrst,'reload schema';
commit;
