-- Narrow, expiring TEST_ONLY BASIC runtime for the bound staging-v2 tenant.
-- This contract never mutates real activation, trial, billing, legal, KYB,
-- commercial entitlement, country release or catalog state.
begin;

select pg_advisory_xact_lock(hashtextextended('migration:20261011225244', 0));

create table public.test_only_basic_access_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  action text not null check (action in ('GRANT', 'REVOKE')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  previous_receipt_id uuid references public.test_only_basic_access_receipts(id) on delete restrict,
  readiness_receipt_id uuid not null references public.test_only_activation_trial_receipts(id) on delete restrict,
  readiness_snapshot_sha256 text not null check (readiness_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  customer_join_receipt_id uuid not null references public.customer_test_only_join_receipts(request_id) on delete restrict,
  starts_at timestamptz,
  expires_at timestamptz,
  reason text not null check (length(trim(reason)) between 10 and 300),
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

create index test_only_basic_access_receipts_tenant_idx
  on public.test_only_basic_access_receipts(restaurant_id, created_at desc, id desc);

create table public.test_only_basic_access_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  receipt_id uuid not null unique references public.test_only_basic_access_receipts(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  action text not null check (action in ('GRANT', 'REVOKE')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  previous_receipt_id uuid references public.test_only_basic_access_receipts(id) on delete restrict,
  readiness_snapshot_sha256 text not null check (readiness_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in ('TEST_ONLY_BASIC_GRANTED', 'TEST_ONLY_BASIC_REVOKED')),
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create index test_only_basic_access_audit_tenant_idx
  on public.test_only_basic_access_audit(restaurant_id, created_at desc, id desc);

alter table public.test_only_basic_access_receipts enable row level security;
alter table public.test_only_basic_access_audit enable row level security;
revoke all on public.test_only_basic_access_receipts,
  public.test_only_basic_access_audit from public, anon, authenticated, service_role;

create trigger test_only_basic_access_receipts_immutable
before update or delete or truncate on public.test_only_basic_access_receipts
for each statement execute function public.protect_business_verification_append_only();

create trigger test_only_basic_access_audit_immutable
before update or delete or truncate on public.test_only_basic_access_audit
for each statement execute function public.protect_business_verification_append_only();

create function public.test_only_basic_access_snapshot_internal(input_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  readiness_snapshot jsonb;
  readiness_hash text;
  readiness_receipt public.test_only_activation_trial_receipts%rowtype;
  join_receipt public.customer_test_only_join_receipts%rowtype;
  marker public.platform_test_tenant_registry%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(true);
  readiness_snapshot := public.test_only_activation_trial_snapshot_internal(input_restaurant_id);
  if readiness_snapshot is null then return null; end if;
  readiness_hash := encode(
    extensions.digest(convert_to(readiness_snapshot::text, 'UTF8'), 'sha256'), 'hex'
  );
  select * into readiness_receipt
  from public.test_only_activation_trial_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.created_at desc, receipt.id desc
  limit 1;
  select * into marker
  from public.platform_test_tenant_registry row
  where row.restaurant_id = input_restaurant_id and row.deleted_at is null;
  select receipt.* into join_receipt
  from public.customer_test_only_join_receipts receipt
  join public.customers customer
    on customer.id = receipt.customer_id
   and customer.restaurant_id = receipt.restaurant_id
   and customer.branch_id = receipt.branch_id
   and customer.is_test_customer is true
   and customer.test_session_id = receipt.test_session_id
  join public.customer_account_memberships membership
    on membership.account_id = receipt.account_id
   and membership.restaurant_id = receipt.restaurant_id
   and membership.customer_id = receipt.customer_id
  where receipt.restaurant_id = input_restaurant_id
    and receipt.test_session_id = marker.test_session_id
  order by receipt.accepted_at desc, receipt.request_id desc
  limit 1;
  if readiness_receipt.id is null
    or readiness_receipt.action is distinct from 'TRIAL_READINESS_TEST'
    or readiness_receipt.snapshot_sha256 is distinct from readiness_hash
    or readiness_receipt.result->>'synthetic_chain_complete' is distinct from 'true'
    or readiness_receipt.result->>'real_activation' is distinct from 'false'
    or readiness_receipt.result->>'real_trial' is distinct from 'false'
    or join_receipt.request_id is null
    or marker.restaurant_id is null then
    return null;
  end if;
  return jsonb_build_object(
    'schema_version', 1,
    'purpose', 'SYNTHETIC_TEST_ONLY_BASIC_OPERATIONAL_ACCESS',
    'project', readiness_snapshot->'project',
    'restaurant_id', readiness_snapshot->>'restaurant_id',
    'organization_id', readiness_snapshot->>'organization_id',
    'branch_id', readiness_snapshot->>'branch_id',
    'test_session_id', marker.test_session_id,
    'readiness_receipt_id', readiness_receipt.id,
    'readiness_snapshot_sha256', readiness_hash,
    'customer_join_receipt_id', join_receipt.request_id,
    'customer_id', join_receipt.customer_id,
    'basic', jsonb_build_object(
      'plan_key', 'BASIC',
      'offer_limit', 5,
      'offer_notifications', false,
      'reward_notifications', false,
      'catalog_access', false
    ),
    'real_state', readiness_snapshot->'baseline',
    'real_activation', false,
    'real_trial', false,
    'real_kyb_verified', false,
    'real_legal_ready', false
  );
end;
$function$;

revoke all on function public.test_only_basic_access_snapshot_internal(uuid)
from public, anon, authenticated, service_role;

create function public.test_only_basic_access_active_internal(input_restaurant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  current_snapshot jsonb;
  current_hash text;
  latest public.test_only_basic_access_receipts%rowtype;
begin
  current_snapshot := public.test_only_basic_access_snapshot_internal(input_restaurant_id);
  if current_snapshot is null then return false; end if;
  current_hash := current_snapshot->>'readiness_snapshot_sha256';
  select * into latest
  from public.test_only_basic_access_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.created_at desc, receipt.id desc
  limit 1;
  return latest.id is not null
    and latest.action = 'GRANT'
    and latest.starts_at <= statement_timestamp()
    and latest.expires_at > statement_timestamp()
    and latest.readiness_receipt_id = (current_snapshot->>'readiness_receipt_id')::uuid
    and latest.readiness_snapshot_sha256 = current_hash
    and latest.customer_join_receipt_id = (current_snapshot->>'customer_join_receipt_id')::uuid;
exception when others then
  return false;
end;
$function$;

revoke all on function public.test_only_basic_access_active_internal(uuid)
from public, anon, authenticated, service_role;

create function public.get_platform_test_only_basic_access(input_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  snapshot_value jsonb;
  latest public.test_only_basic_access_receipts%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(true);
  perform public.require_legal_bundle_admin_internal();
  snapshot_value := public.test_only_basic_access_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then
    raise exception 'TEST_ONLY_BASIC_CONTEXT_INVALID' using errcode = '42501';
  end if;
  select * into latest
  from public.test_only_basic_access_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.created_at desc, receipt.id desc
  limit 1;
  return jsonb_build_object(
    'synthetic_test_only', true,
    'real_activation', false,
    'real_trial', false,
    'real_entitlement', false,
    'snapshot', snapshot_value,
    'snapshot_sha256', encode(
      extensions.digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex'
    ),
    'previous_receipt_id', latest.id,
    'previous_action', latest.action,
    'active', public.test_only_basic_access_active_internal(input_restaurant_id),
    'starts_at', latest.starts_at,
    'expires_at', latest.expires_at,
    'next_action', case
      when latest.id is null or latest.action = 'REVOKE' or latest.expires_at <= statement_timestamp()
        then 'GRANT'
      else 'REVOKE'
    end
  );
end;
$function$;

revoke all on function public.get_platform_test_only_basic_access(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_platform_test_only_basic_access(uuid) to authenticated;

create function public.decide_platform_test_only_basic_access(
  input_restaurant_id uuid,
  input_action text,
  input_expected_snapshot_sha256 text,
  input_expected_previous_receipt_id uuid,
  input_expires_at timestamptz,
  input_reason text,
  input_confirmation text,
  input_request_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  snapshot_value jsonb;
  snapshot_sha256_value text;
  previous public.test_only_basic_access_receipts%rowtype;
  prior_request public.test_only_basic_access_receipts%rowtype;
  readiness_receipt public.test_only_activation_trial_receipts%rowtype;
  payload_value jsonb;
  auth_evidence_value jsonb;
  result_value jsonb;
  receipt_id_value uuid := extensions.gen_random_uuid();
  receipt_sha256_value text;
  starts_at_value timestamptz;
  expires_at_value timestamptz;
  totp_at_value timestamptz;
begin
  perform project_bootstrap.require_runtime_binding(true);
  perform public.require_legal_bundle_admin_internal();
  if input_restaurant_id is null
    or input_action not in ('GRANT', 'REVOKE')
    or coalesce(input_expected_snapshot_sha256, '') !~ '^[0-9a-f]{64}$'
    or input_request_id is null
    or length(trim(coalesce(input_reason, ''))) not between 10 and 300 then
    raise exception 'TEST_ONLY_BASIC_REQUEST_INVALID' using errcode = '22023';
  end if;
  payload_value := jsonb_build_object(
    'restaurant_id', input_restaurant_id,
    'action', input_action,
    'snapshot_sha256', input_expected_snapshot_sha256,
    'previous_receipt_id', input_expected_previous_receipt_id,
    'expires_at', input_expires_at,
    'reason', trim(input_reason),
    'confirmation', input_confirmation
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-basic-request:' || input_request_id::text, 0
  ));
  select * into prior_request
  from public.test_only_basic_access_receipts receipt
  where receipt.request_id = input_request_id;
  if prior_request.id is not null then
    if prior_request.actor_id is distinct from auth.uid()
      or prior_request.decision_payload is distinct from payload_value then
      raise exception 'TEST_ONLY_BASIC_REPLAY_CONFLICT' using errcode = '22023';
    end if;
    return prior_request.result || jsonb_build_object('idempotent', true, 'historical_receipt', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-basic:' || input_restaurant_id::text, 0
  ));
  perform project_bootstrap.require_runtime_binding(true);
  perform public.require_legal_bundle_admin_internal();
  snapshot_value := public.test_only_basic_access_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then
    raise exception 'TEST_ONLY_BASIC_CONTEXT_INVALID' using errcode = '42501';
  end if;
  snapshot_sha256_value := encode(
    extensions.digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex'
  );
  if snapshot_sha256_value is distinct from input_expected_snapshot_sha256 then
    raise exception 'TEST_ONLY_BASIC_STALE' using errcode = 'P0001';
  end if;
  select * into readiness_receipt
  from public.test_only_activation_trial_receipts
  where id = (snapshot_value->>'readiness_receipt_id')::uuid
    and action = 'TRIAL_READINESS_TEST';
  if readiness_receipt.id is null then
    raise exception 'TEST_ONLY_BASIC_READINESS_REQUIRED' using errcode = '42501';
  end if;
  select * into previous
  from public.test_only_basic_access_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.created_at desc, receipt.id desc
  limit 1;
  if previous.id is distinct from input_expected_previous_receipt_id then
    raise exception 'TEST_ONLY_BASIC_STALE' using errcode = 'P0001';
  end if;
  if input_confirmation is distinct from
    'TEST_ONLY BASIC ' || input_action || ' ' || input_restaurant_id::text then
    raise exception 'TEST_ONLY_BASIC_CONFIRMATION_REQUIRED' using errcode = '22023';
  end if;
  if input_action = 'GRANT' then
    if previous.id is not null and previous.action = 'GRANT'
      and previous.expires_at > statement_timestamp() then
      raise exception 'TEST_ONLY_BASIC_ALREADY_ACTIVE' using errcode = '42501';
    end if;
    starts_at_value := clock_timestamp();
    expires_at_value := input_expires_at;
    if expires_at_value is null
      or expires_at_value < starts_at_value + interval '15 minutes'
      or expires_at_value > starts_at_value + interval '4 hours' then
      raise exception 'TEST_ONLY_BASIC_WINDOW_INVALID' using errcode = '22023';
    end if;
  else
    if previous.id is null or previous.action <> 'GRANT'
      or previous.expires_at <= statement_timestamp() then
      raise exception 'TEST_ONLY_BASIC_NOT_ACTIVE' using errcode = '42501';
    end if;
    if input_expires_at is not null then
      raise exception 'TEST_ONLY_BASIC_REVOKE_EXPIRY_FORBIDDEN' using errcode = '22023';
    end if;
  end if;
  select max(to_timestamp((method->>'timestamp')::double precision))
  into totp_at_value
  from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) method
  where jsonb_typeof(method) = 'object'
    and method->>'method' = 'totp'
    and coalesce(method->>'timestamp', '') ~ '^[0-9]+([.][0-9]+)?$';
  auth_evidence_value := jsonb_build_object(
    'aal', 'aal2',
    'amr_method', 'totp',
    'totp_at', totp_at_value,
    'role', public.current_platform_role(),
    'actor_id', auth.uid(),
    'session_sha256', encode(
      extensions.digest(convert_to(auth.jwt()->>'session_id', 'UTF8'), 'sha256'), 'hex'
    )
  );
  result_value := jsonb_build_object(
    'receipt_id', receipt_id_value,
    'action', input_action,
    'restaurant_id', input_restaurant_id,
    'organization_id', (snapshot_value->>'organization_id')::uuid,
    'branch_id', (snapshot_value->>'branch_id')::uuid,
    'starts_at', starts_at_value,
    'expires_at', expires_at_value,
    'synthetic_test_only', true,
    'effective_plan', case when input_action = 'GRANT' then 'BASIC' else null end,
    'real_activation', false,
    'real_trial', false,
    'real_entitlement', false,
    'offer_notifications', false,
    'reward_notifications', false,
    'catalog_access', false,
    'idempotent', false
  );
  receipt_sha256_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'receipt_id', receipt_id_value,
    'restaurant_id', input_restaurant_id,
    'action', input_action,
    'actor_id', auth.uid(),
    'request_id', input_request_id,
    'previous_receipt_id', previous.id,
    'snapshot_sha256', snapshot_sha256_value,
    'starts_at', starts_at_value,
    'expires_at', expires_at_value,
    'auth_evidence', auth_evidence_value,
    'result', result_value
  )::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.test_only_basic_access_receipts (
    id, restaurant_id, organization_id, branch_id, action, actor_id, request_id,
    previous_receipt_id, readiness_receipt_id, readiness_snapshot_sha256,
    customer_join_receipt_id, starts_at, expires_at, reason, decision_payload,
    auth_evidence, result, receipt_sha256
  ) values (
    receipt_id_value, input_restaurant_id,
    (snapshot_value->>'organization_id')::uuid,
    (snapshot_value->>'branch_id')::uuid,
    input_action, auth.uid(), input_request_id, previous.id,
    (snapshot_value->>'readiness_receipt_id')::uuid,
    snapshot_value->>'readiness_snapshot_sha256',
    (snapshot_value->>'customer_join_receipt_id')::uuid,
    starts_at_value, expires_at_value, trim(input_reason), payload_value,
    auth_evidence_value, result_value, receipt_sha256_value
  );
  insert into public.test_only_basic_access_audit (
    receipt_id, restaurant_id, organization_id, branch_id, action, actor_id,
    request_id, previous_receipt_id, readiness_snapshot_sha256, event_type,
    receipt_sha256
  ) values (
    receipt_id_value, input_restaurant_id,
    (snapshot_value->>'organization_id')::uuid,
    (snapshot_value->>'branch_id')::uuid,
    input_action, auth.uid(), input_request_id, previous.id,
    snapshot_value->>'readiness_snapshot_sha256',
    case input_action when 'GRANT' then 'TEST_ONLY_BASIC_GRANTED'
      else 'TEST_ONLY_BASIC_REVOKED' end,
    receipt_sha256_value
  );
  return result_value;
end;
$function$;

revoke all on function public.decide_platform_test_only_basic_access(
  uuid, text, text, uuid, timestamptz, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.decide_platform_test_only_basic_access(
  uuid, text, text, uuid, timestamptz, text, text, uuid
) to authenticated;

create function public.test_only_basic_customer_authorized_internal(input_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.customer_accounts account
    join public.customer_account_memberships membership
      on membership.account_id = account.id
     and membership.restaurant_id = input_restaurant_id
    join public.customers customer
      on customer.id = membership.customer_id
     and customer.restaurant_id = membership.restaurant_id
     and customer.is_test_customer is true
     and customer.membership_status = 'active'
    join public.customer_test_only_join_receipts receipt
      on receipt.auth_user_id = account.auth_user_id
     and receipt.account_id = account.id
     and receipt.restaurant_id = membership.restaurant_id
     and receipt.customer_id = membership.customer_id
     and receipt.test_session_id = customer.test_session_id
    where account.auth_user_id = auth.uid() and account.disabled_at is null
  );
$function$;

revoke all on function public.test_only_basic_customer_authorized_internal(uuid)
from public, anon, authenticated, service_role;

create function public.begin_test_only_basic_operation_internal(
  input_restaurant_id uuid,
  input_action text
) returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if input_action not in (
    'OFFER_WRITE', 'CUSTOMER_POINTS_QR', 'POINTS_PREVIEW',
    'POINTS_CONFIRM', 'DAILY_PIN'
  ) or not public.test_only_basic_access_active_internal(input_restaurant_id) then
    raise exception 'TEST_ONLY_BASIC_OPERATION_DENIED' using errcode = '42501';
  end if;
  if input_action = 'CUSTOMER_POINTS_QR' then
    if auth.role() is distinct from 'authenticated'
      or not public.test_only_basic_customer_authorized_internal(input_restaurant_id) then
      raise exception 'TEST_ONLY_BASIC_CUSTOMER_DENIED' using errcode = '42501';
    end if;
  elsif input_action = 'OFFER_WRITE' then
    if not public.is_restaurant_admin(input_restaurant_id) then
      raise exception 'TEST_ONLY_BASIC_OWNER_DENIED' using errcode = '42501';
    end if;
  elsif not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'TEST_ONLY_BASIC_MEMBER_DENIED' using errcode = '42501';
  end if;
  perform set_config('wuxuai.test_only_basic_restaurant_id', input_restaurant_id::text, true);
  perform set_config('wuxuai.test_only_basic_action', input_action, true);
  perform set_config('wuxuai.test_only_basic_actor_id', auth.uid()::text, true);
end;
$function$;

revoke all on function public.begin_test_only_basic_operation_internal(uuid, text)
from public, anon, authenticated, service_role;

create function public.test_only_basic_operation_scope_active_internal(
  input_restaurant_id uuid,
  input_action text default null
) returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  scoped_restaurant text := current_setting('wuxuai.test_only_basic_restaurant_id', true);
  scoped_action text := current_setting('wuxuai.test_only_basic_action', true);
  scoped_actor text := current_setting('wuxuai.test_only_basic_actor_id', true);
begin
  return scoped_restaurant = input_restaurant_id::text
    and scoped_actor = auth.uid()::text
    and (input_action is null or scoped_action = input_action)
    and public.test_only_basic_access_active_internal(input_restaurant_id);
exception when others then
  return false;
end;
$function$;

revoke all on function public.test_only_basic_operation_scope_active_internal(uuid, text)
from public, anon, authenticated, service_role;

create function public.test_only_basic_operational_write_allowed_internal(
  input_table text,
  input_operation text,
  input_restaurant_id uuid,
  input_new jsonb,
  input_old jsonb
) returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  action_value text := current_setting('wuxuai.test_only_basic_action', true);
begin
  if not public.test_only_basic_operation_scope_active_internal(input_restaurant_id, action_value) then
    return false;
  end if;
  if action_value = 'OFFER_WRITE' then
    return input_table = 'restaurant_offers'
      and input_operation in ('INSERT', 'UPDATE')
      and (input_new->>'restaurant_id')::uuid = input_restaurant_id
      and public.is_restaurant_admin(input_restaurant_id);
  elsif action_value = 'CUSTOMER_POINTS_QR' then
    return input_table = 'customer_points_qr_references'
      and input_operation in ('INSERT', 'UPDATE')
      and (input_new->>'restaurant_id')::uuid = input_restaurant_id
      and public.test_only_basic_customer_authorized_internal(input_restaurant_id)
      and exists (
        select 1 from public.customer_account_memberships membership
        join public.customer_accounts account on account.id = membership.account_id
        join public.customers customer
          on customer.id = membership.customer_id
         and customer.restaurant_id = membership.restaurant_id
         and customer.is_test_customer is true
        where account.auth_user_id = auth.uid()
          and membership.restaurant_id = input_restaurant_id
          and membership.customer_id = (input_new->>'customer_id')::uuid
      );
  elsif action_value = 'DAILY_PIN' then
    return input_table = 'restaurant_daily_pins'
      and input_operation = 'INSERT'
      and (input_new->>'restaurant_id')::uuid = input_restaurant_id
      and public.is_restaurant_member(input_restaurant_id);
  elsif action_value = 'POINTS_PREVIEW' then
    return input_table = 'restaurant_points_credit_attempts'
      and input_operation = 'INSERT'
      and (input_new->>'restaurant_id')::uuid = input_restaurant_id
      and public.is_restaurant_member(input_restaurant_id);
  elsif action_value = 'POINTS_CONFIRM' then
    if not public.is_restaurant_member(input_restaurant_id) then return false; end if;
    if input_table = 'customers' and input_operation = 'UPDATE' then
      return (input_new->>'id')::uuid = (input_old->>'id')::uuid
        and (input_new->>'restaurant_id')::uuid = input_restaurant_id
        and (input_new - 'points_balance' - 'updated_at') = (input_old - 'points_balance' - 'updated_at')
        and exists (
          select 1 from public.customers customer
          where customer.id = (input_new->>'id')::uuid
            and customer.restaurant_id = input_restaurant_id
            and customer.is_test_customer is true
        );
    end if;
    return input_table in (
      'points_idempotency_claims', 'points_transactions',
      'customer_points_qr_references', 'daily_pin_attempts',
      'restaurant_points_credit_attempts'
    ) and input_operation in ('INSERT', 'UPDATE', 'DELETE')
      and coalesce((case when input_operation = 'DELETE' then input_old else input_new end)->>'restaurant_id', '') = input_restaurant_id::text;
  end if;
  return false;
exception when others then
  return false;
end;
$function$;

revoke all on function public.test_only_basic_operational_write_allowed_internal(
  text, text, uuid, jsonb, jsonb
) from public, anon, authenticated, service_role;

create or replace function public.require_restaurant_operational(input_restaurant_id uuid,input_action text)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare state jsonb; grace public.basic_post_trial_redemption_grace%rowtype;
begin
  state:=public.restaurant_activation_state_internal(input_restaurant_id);
  if coalesce((state->>'operational')::boolean,false) then return; end if;
  if input_action='resolve_customer_from_public_token'
    and public.platform_test_join_permit_active_internal(input_restaurant_id) then return; end if;
  if input_action in ('create_customer_points_credit_qr','get_today_restaurant_pin',
      'preview_restaurant_controlled_points','confirm_restaurant_controlled_points',
      'save_restaurant_offer','change_restaurant_offer_status')
    and public.test_only_basic_access_active_internal(input_restaurant_id) then
    perform public.begin_test_only_basic_operation_internal(input_restaurant_id, case input_action
      when 'create_customer_points_credit_qr' then 'CUSTOMER_POINTS_QR'
      when 'get_today_restaurant_pin' then 'DAILY_PIN'
      when 'preview_restaurant_controlled_points' then 'POINTS_PREVIEW'
      when 'confirm_restaurant_controlled_points' then 'POINTS_CONFIRM'
      else 'OFFER_WRITE' end);
    return;
  end if;
  if input_action in ('secure_redemption_start','secure_redemption_finalize') then
    select * into grace from public.basic_post_trial_redemption_grace
      where restaurant_id=input_restaurant_id and starts_at<=statement_timestamp()
        and ends_at>statement_timestamp();
    if grace.restaurant_id is not null then return; end if;
  end if;
  raise exception 'RESTAURANT_NOT_OPERATIONAL' using errcode='42501';
end $function$;

revoke all on function public.require_restaurant_operational(uuid,text)
from public,anon,authenticated,service_role;

create or replace function public.guard_pending_activation_operational_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare j jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  oldj jsonb:=to_jsonb(old); tenant uuid; previous_tenant uuid; r public.restaurants%rowtype;
  setup_table boolean; safe boolean:=false;
begin
  if tg_table_name='organizations' then
    select restaurant.id into tenant from public.restaurants restaurant
      where restaurant.organization_id=(j->>'id')::uuid and restaurant.activation_status='pending_activation' limit 1;
  elsif tg_table_name='branches' then tenant:=(j->>'restaurant_id')::uuid;
  elsif j ? 'restaurant_id' then tenant:=(j->>'restaurant_id')::uuid;
  elsif j ? 'subscription_id' then
    select b.restaurant_id into tenant from public.branch_subscriptions s join public.branches b on b.id=s.branch_id
      where s.id=(j->>'subscription_id')::uuid;
  elsif j ? 'organization_id' then
    select restaurant.id into tenant from public.restaurants restaurant
      where restaurant.organization_id=(j->>'organization_id')::uuid and restaurant.activation_status='pending_activation' limit 1;
  end if;
  if tg_op='UPDATE' and oldj ? 'restaurant_id' then
    previous_tenant:=(oldj->>'restaurant_id')::uuid;
    if previous_tenant is distinct from tenant and exists(select 1 from public.restaurants
      where id in (previous_tenant,tenant) and activation_status='pending_activation') then
      raise exception 'PENDING_TENANT_MOVE_FORBIDDEN' using errcode='42501';
    end if;
  end if;
  if tg_op='UPDATE' and oldj ? 'organization_id'
    and j->>'organization_id' is distinct from oldj->>'organization_id'
    and exists(select 1 from public.restaurants where activation_status='pending_activation'
      and organization_id in ((j->>'organization_id')::uuid,(oldj->>'organization_id')::uuid)) then
    raise exception 'PENDING_TENANT_MOVE_FORBIDDEN' using errcode='42501';
  end if;
  select * into r from public.restaurants where id=tenant;
  if r.activation_status is distinct from 'pending_activation' then
    if tg_op='DELETE' then return old; end if; return new;
  end if;
  if tg_op='INSERT' and public.platform_test_join_operational_insert_internal(tg_table_name,j) then
    return new;
  end if;
  if public.test_only_basic_operational_write_allowed_internal(
    tg_table_name, tg_op, tenant, to_jsonb(new), to_jsonb(old)
  ) then
    if tg_op='DELETE' then return old; end if; return new;
  end if;
  setup_table:=tg_table_name in ('restaurant_branding','restaurant_onboarding_drafts','loyalty_settings',
    'loyalty_rules','restaurant_legal_profiles','organization_legal_profiles');
  if setup_table then safe:=true;
  elsif tg_table_name='branches' then
    safe:=tg_op<>'DELETE' and j->>'status'='draft' and coalesce((j->>'is_discoverable')::boolean,false)=false;
    if tg_op='UPDATE' and (j->'id' is distinct from oldj->'id' or j->'organization_id' is distinct from oldj->'organization_id') then safe:=false; end if;
  elsif tg_table_name='organizations' then
    safe:=tg_op<>'DELETE' and j->>'status'='draft';
    if tg_op='UPDATE' and (j->'id' is distinct from oldj->'id' or j->'owner_id' is distinct from oldj->'owner_id') then safe:=false; end if;
  elsif tg_table_name='restaurant_members' then
    safe:=tg_op<>'DELETE' and j->>'role'='owner' and (j->>'user_id')::uuid=r.owner_id;
  elsif tg_table_name='rewards' then safe:=coalesce((j->>'active')::boolean,true)=false;
  elsif tg_table_name='coupons' then safe:=j->>'status'='draft';
  elsif tg_table_name='restaurant_offers' then safe:=j->>'status'='DRAFT'
    and coalesce((j->>'is_active')::boolean,false)=false and j->>'published_at' is null;
  elsif tg_table_name='legal_documents' then safe:=j->>'current_published_version_id' is null;
  elsif tg_table_name='legal_document_versions' then safe:=j->>'status'='draft';
  end if;
  if not safe or auth.uid() is distinct from r.owner_id then
    raise exception 'PENDING_ACTIVATION_OPERATION_BLOCKED' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $function$;

revoke all on function public.guard_pending_activation_operational_write()
from public,anon,authenticated,service_role;

create or replace function public.save_restaurant_offer(
  input_restaurant_id uuid, input_offer_id uuid, input_branch_id uuid,
  input_offer_type text, input_title text, input_short_description text,
  input_description text, input_image_url text, input_current_price numeric,
  input_previous_price numeric, input_valid_from timestamptz,
  input_valid_to timestamptz, input_weekdays integer[], input_time_from time,
  input_time_to time, input_button_label text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare offer_record public.restaurant_offers%rowtype; event_type_value text;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode='42501',message='OFFER_ACCESS_DENIED';
  end if;
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION'
    and public.test_only_basic_access_active_internal(input_restaurant_id) then
    perform public.require_restaurant_operational(input_restaurant_id,'save_restaurant_offer');
  end if;
  if input_offer_id is null then
    insert into public.restaurant_offers(restaurant_id,branch_id,offer_type,title,short_description,
      description,image_url,current_price,previous_price,valid_from,valid_to,weekdays,time_from,time_to,button_label)
    values(input_restaurant_id,input_branch_id,input_offer_type,input_title,input_short_description,
      input_description,input_image_url,input_current_price,input_previous_price,input_valid_from,input_valid_to,
      input_weekdays,input_time_from,input_time_to,input_button_label) returning * into offer_record;
    event_type_value:='OFFER_CREATED';
  else
    update public.restaurant_offers set branch_id=input_branch_id,offer_type=input_offer_type,
      title=input_title,short_description=input_short_description,description=input_description,
      image_url=input_image_url,current_price=input_current_price,previous_price=input_previous_price,
      valid_from=input_valid_from,valid_to=input_valid_to,weekdays=input_weekdays,
      time_from=input_time_from,time_to=input_time_to,button_label=input_button_label
    where id=input_offer_id and restaurant_id=input_restaurant_id returning * into offer_record;
    if offer_record.id is null then raise exception using errcode='P0002',message='OFFER_NOT_FOUND'; end if;
    event_type_value:='OFFER_UPDATED';
  end if;
  perform public.write_audit_event(input_restaurant_id,null,'admin',auth.uid(),event_type_value,
    'success','owner_portal','restaurant_offer',offer_record.id,null,
    jsonb_build_object('offer_type',offer_record.offer_type,'status',offer_record.status,
      'synthetic_test_only',public.test_only_basic_operation_scope_active_internal(input_restaurant_id,'OFFER_WRITE')));
  return to_jsonb(offer_record);
end;
$function$;

create or replace function public.change_restaurant_offer_status(
  input_restaurant_id uuid,input_offer_id uuid,input_action text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare offer_record public.restaurant_offers%rowtype; event_type_value text;
  was_published_active boolean:=false; recipient_record record;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode='42501',message='OFFER_ACCESS_DENIED';
  end if;
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION' then
    perform public.require_restaurant_operational(input_restaurant_id,'change_restaurant_offer_status');
  end if;
  if input_action='PUBLISH' then
    select * into offer_record from public.restaurant_offers
      where id=input_offer_id and restaurant_id=input_restaurant_id for update;
    if offer_record.id is null then raise exception using errcode='P0002',message='OFFER_NOT_FOUND'; end if;
    if offer_record.valid_to<=now() then raise exception using errcode='P0001',message='OFFER_PERIOD_EXPIRED'; end if;
    was_published_active:=offer_record.status='PUBLISHED' and offer_record.is_active;
    update public.restaurant_offers set status='PUBLISHED',is_active=true,
      published_at=case when was_published_active then published_at else now() end,
      published_by=auth.uid(),archived_at=null,
      publication_version=case when was_published_active then publication_version else publication_version+1 end
    where id=input_offer_id and restaurant_id=input_restaurant_id returning * into offer_record;
    event_type_value:='OFFER_PUBLISHED';
    if not was_published_active and public.restaurant_entitlement_enabled(input_restaurant_id,'offer_notifications') then
      for recipient_record in
        select distinct consent.customer_id from public.customer_offer_email_consents consent
        join public.customers customer on customer.id=consent.customer_id and customer.restaurant_id=consent.restaurant_id
        where consent.restaurant_id=input_restaurant_id and consent.status='ACTIVE'
          and consent.email_confirmed_at is not null and customer.membership_status='active'
      loop
        perform public.enqueue_customer_transactional_email(input_restaurant_id,recipient_record.customer_id,
          'OFFER_PUBLISHED',offer_record.id::text||':'||offer_record.publication_version::text||':'||recipient_record.customer_id::text,
          null,null,jsonb_build_object('offer_title',offer_record.title),now());
      end loop;
    end if;
  elsif input_action='DISABLE' then
    update public.restaurant_offers set status='DISABLED',is_active=false
      where id=input_offer_id and restaurant_id=input_restaurant_id returning * into offer_record;
    event_type_value:='OFFER_DISABLED';
  elsif input_action='ARCHIVE' then
    update public.restaurant_offers set status='ARCHIVED',is_active=false,archived_at=now()
      where id=input_offer_id and restaurant_id=input_restaurant_id returning * into offer_record;
    event_type_value:='OFFER_ARCHIVED';
  else raise exception using errcode='22023',message='OFFER_ACTION_INVALID'; end if;
  if offer_record.id is null then raise exception using errcode='P0002',message='OFFER_NOT_FOUND'; end if;
  perform public.write_audit_event(input_restaurant_id,null,'admin',auth.uid(),event_type_value,
    'success','owner_portal','restaurant_offer',offer_record.id,null,
    jsonb_build_object('offer_type',offer_record.offer_type,'status',offer_record.status,
      'publication_version',offer_record.publication_version,'synthetic_test_only',
      public.test_only_basic_operation_scope_active_internal(input_restaurant_id,'OFFER_WRITE')));
  return to_jsonb(offer_record);
end;
$function$;

create or replace function public.validate_restaurant_offer_row()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare at_value timestamptz:=statement_timestamp(); old_consumes_capacity boolean:=false;
  new_consumes_capacity boolean:=false; capacity_snapshot jsonb; capacity_usage bigint; capacity_limit bigint;
begin
  new.title:=trim(new.title); new.short_description:=trim(new.short_description);
  new.description:=nullif(trim(coalesce(new.description,'')),'');
  new.image_url:=nullif(trim(coalesce(new.image_url,'')),'');
  new.button_label:=coalesce(nullif(trim(new.button_label),''),'Angebot ansehen'); new.updated_at:=at_value;
  if tg_op='UPDATE' and new.restaurant_id is distinct from old.restaurant_id then
    raise exception using errcode='P0001',message='OFFER_TENANT_IMMUTABLE';
  end if;
  if new.branch_id is not null and not exists(select 1 from public.branches branch
    where branch.id=new.branch_id and branch.restaurant_id=new.restaurant_id) then
    raise exception using errcode='P0001',message='OFFER_BRANCH_INVALID';
  end if;
  if new.offer_type='LUNCH_MENU' and (coalesce(cardinality(new.weekdays),0)=0
    or new.time_from is null or new.time_to is null) then
    raise exception using errcode='P0001',message='OFFER_LUNCH_WINDOW_REQUIRED';
  end if;
  new_consumes_capacity:=new.status='PUBLISHED' and new.is_active=true and new.valid_to>at_value;
  if tg_op='UPDATE' then old_consumes_capacity:=old.status='PUBLISHED' and old.is_active=true and old.valid_to>at_value; end if;
  if new_consumes_capacity and not old_consumes_capacity then
    perform pg_advisory_xact_lock(hashtextextended(new.restaurant_id::text,0));
    if public.test_only_basic_operation_scope_active_internal(new.restaurant_id,'OFFER_WRITE') then
      select count(*)::bigint into capacity_usage from public.restaurant_offers offer
      where offer.restaurant_id=new.restaurant_id and offer.id is distinct from new.id
        and offer.status='PUBLISHED' and offer.is_active=true and offer.valid_to>at_value;
      capacity_limit:=5;
    else
      capacity_snapshot:=public.resolve_restaurant_capacity_internal(new.restaurant_id,at_value);
      capacity_usage:=(capacity_snapshot#>>'{offers,usage}')::bigint;
      capacity_limit:=(capacity_snapshot#>>'{offers,effective_limit}')::bigint;
    end if;
    if capacity_limit is null or capacity_usage is null then
      raise exception using errcode='P0001',message='OFFER_CAPACITY_UNAVAILABLE';
    end if;
    if capacity_usage>=capacity_limit then
      raise exception using errcode='P0001',message='OFFER_CAPACITY_REACHED',
        detail=jsonb_build_object('usage',capacity_usage,'effective_limit',capacity_limit,
          'remaining',greatest(capacity_limit-capacity_usage,0),'plan_key','BASIC','addon_units',0,
          'over_limit',capacity_usage>capacity_limit)::text;
    end if;
  end if;
  return new;
end;
$function$;

create or replace function public.get_public_restaurant_offers(
  input_restaurant_slug text default null,input_limit integer default 20
) returns jsonb language sql stable security definer set search_path=public,pg_temp as $function$
  select coalesce(jsonb_agg(payload order by priority,published_at desc),'[]'::jsonb)
  from (
    select jsonb_build_object('id',o.id,'restaurant_id',o.restaurant_id,'restaurant_name',r.name,
      'restaurant_slug',r.slug,'branch_id',o.branch_id,'branch_name',b.name,'offer_type',o.offer_type,
      'title',o.title,'short_description',o.short_description,'description',o.description,
      'image_url',o.image_url,'image_zoom',o.image_zoom,'image_position_x',o.image_position_x,
      'image_position_y',o.image_position_y,'image_aspect_ratio',o.image_aspect_ratio,
      'image_crop_version',o.image_crop_version,'current_price',o.current_price,
      'previous_price',o.previous_price,'currency',o.currency,'valid_from',o.valid_from,
      'valid_to',o.valid_to,'weekdays',o.weekdays,'time_from',o.time_from,'time_to',o.time_to,
      'button_label',o.button_label,'published_at',o.published_at,'synthetic_test_only',r.status='draft') payload,
      case o.offer_type when 'LUNCH_MENU' then 1 when 'WEEKLY_OFFER' then 2
        when 'MONTHLY_OFFER' then 3 when 'SEASONAL_OFFER' then 4
        when 'NEW_DISH' then 5 when 'EVENT' then 6 else 7 end priority,o.published_at
    from public.restaurant_offers o
    join public.restaurants r on r.id=o.restaurant_id and (
      r.status='active' or (
        r.status='draft' and input_restaurant_slug is not null and r.slug=trim(input_restaurant_slug)
        and public.test_only_basic_access_active_internal(r.id)
        and public.test_only_basic_customer_authorized_internal(r.id)
      )
    )
    join public.branches b on b.id=o.branch_id and b.restaurant_id=r.id and (
      b.status='active' or (b.status='draft' and r.status='draft'
        and public.test_only_basic_access_active_internal(r.id))
    )
    where o.status='PUBLISHED' and o.is_active=true and o.valid_to>now()
      and ((input_restaurant_slug is not null and r.slug=trim(input_restaurant_slug))
        or (input_restaurant_slug is null and r.status='active' and b.is_discoverable=true))
    order by priority,o.published_at desc
    limit least(greatest(coalesce(input_limit,20),1),100)
  ) visible_offers;
$function$;

create or replace function public.create_customer_points_credit_qr(
  input_restaurant_slug text,input_customer_token text
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $function$
declare restaurant_record public.restaurants%rowtype; customer_record public.customers%rowtype;
  mode_value text; raw_token text; raw_code text; expiry_value timestamptz:=now()+interval '5 minutes';
  test_only_value boolean:=false;
begin
  select * into restaurant_record from public.restaurants where slug=trim(input_restaurant_slug);
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  if public.restaurant_activation_state_internal(restaurant_record.id)->>'status'='PENDING_ACTIVATION' then
    perform public.require_restaurant_operational(restaurant_record.id,'create_customer_points_credit_qr');
    test_only_value:=public.test_only_basic_operation_scope_active_internal(
      restaurant_record.id,'CUSTOMER_POINTS_QR');
  end if;
  if restaurant_record.status<>'active' and not (restaurant_record.status='draft' and test_only_value) then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;
  select points_collection_mode into mode_value from public.loyalty_settings
    where restaurant_id=restaurant_record.id and active=true;
  if mode_value not in ('restaurant_controlled_only','both') then
    raise exception 'Dieser Sammelweg ist nicht aktiviert.';
  end if;
  select c.* into customer_record from public.customer_qr_tokens t
  join public.customers c on c.id=t.customer_id
  where t.restaurant_id=restaurant_record.id
    and t.token_hash=public.hash_public_token(input_customer_token)
    and t.active=true and (t.expires_at is null or t.expires_at>now())
    and c.restaurant_id=restaurant_record.id and c.membership_status='active'
    and (not test_only_value or (
      c.is_test_customer is true and exists (
        select 1 from public.customer_account_memberships membership
        join public.customer_accounts account on account.id=membership.account_id
        join public.customer_test_only_join_receipts receipt
          on receipt.account_id=account.id and receipt.restaurant_id=membership.restaurant_id
         and receipt.customer_id=membership.customer_id and receipt.auth_user_id=account.auth_user_id
        where account.auth_user_id=auth.uid() and membership.restaurant_id=restaurant_record.id
          and membership.customer_id=c.id and receipt.test_session_id=c.test_session_id
      )
    )) limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  if (select count(*) from public.customer_points_qr_references q where q.customer_id=customer_record.id
    and q.created_at>now()-interval '1 minute')>=5 then raise exception 'Bitte warte kurz und versuche es erneut.'; end if;
  update public.customer_points_qr_references set revoked_at=now()
    where restaurant_id=restaurant_record.id and customer_id=customer_record.id
      and consumed_at is null and revoked_at is null and expires_at>now();
  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  loop raw_code:=public.generate_numeric_code(8);
    exit when not exists(select 1 from public.customer_points_qr_references q
      where q.manual_code_hash=public.hash_public_token(raw_code)); end loop;
  insert into public.customer_points_qr_references(restaurant_id,organization_id,branch_id,customer_id,
    token_hash,manual_code_hash,expires_at) values(restaurant_record.id,restaurant_record.organization_id,
    coalesce(customer_record.branch_id,restaurant_record.primary_branch_id,public.restaurant_primary_branch_id(restaurant_record.id)),
    customer_record.id,public.hash_public_token(raw_token),public.hash_public_token(raw_code),expiry_value);
  return jsonb_build_object('qr_token',raw_token,'manual_code',raw_code,'expires_at',expiry_value,
    'synthetic_test_only',test_only_value);
end;
$function$;

create or replace function public.ensure_today_restaurant_pin(
  input_restaurant_id uuid,input_branch_id uuid default null
) returns public.restaurant_daily_pins language plpgsql security definer set search_path=public as $function$
declare restaurant_record public.restaurants%rowtype; branch_id_value uuid;
  pin_record public.restaurant_daily_pins%rowtype; next_pin text; local_today date;
  local_day_start timestamptz; local_next_day_start timestamptz; attempts integer:=0;
  test_only_value boolean:=false;
begin
  select * into restaurant_record from public.restaurants where id=input_restaurant_id;
  test_only_value:=restaurant_record.status='draft' and (
    public.test_only_basic_operation_scope_active_internal(input_restaurant_id,'DAILY_PIN')
    or public.test_only_basic_operation_scope_active_internal(input_restaurant_id,'POINTS_CONFIRM'));
  if restaurant_record.id is null or (restaurant_record.status<>'active' and not test_only_value) then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;
  branch_id_value:=coalesce(input_branch_id,restaurant_record.primary_branch_id,
    public.restaurant_primary_branch_id(restaurant_record.id));
  local_today:=timezone(restaurant_record.timezone_name,now())::date;
  local_day_start:=local_today::timestamp at time zone restaurant_record.timezone_name;
  local_next_day_start:=(local_today+1)::timestamp at time zone restaurant_record.timezone_name;
  select * into pin_record from public.restaurant_daily_pins
    where restaurant_id=restaurant_record.id and branch_id is not distinct from branch_id_value
      and valid_date=local_today limit 1;
  if pin_record.id is not null then return pin_record; end if;
  loop
    attempts:=attempts+1; next_pin:=public.generate_daily_pin_code();
    begin
      insert into public.restaurant_daily_pins(restaurant_id,branch_id,pin_code,valid_date,valid_from,valid_until)
      values(restaurant_record.id,branch_id_value,next_pin,local_today,local_day_start,local_next_day_start)
      returning * into pin_record;
      return pin_record;
    exception when unique_violation then
      select * into pin_record from public.restaurant_daily_pins
        where restaurant_id=restaurant_record.id and branch_id is not distinct from branch_id_value
          and valid_date=local_today limit 1;
      if pin_record.id is not null then return pin_record; end if;
      if attempts>=8 then raise exception 'Tages-PIN konnte nicht erstellt werden.'; end if;
    end;
  end loop;
end;
$function$;

create or replace function public.get_today_restaurant_pin(input_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare pin_record public.restaurant_daily_pins%rowtype;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION' then
    perform public.require_restaurant_operational(input_restaurant_id,'get_today_restaurant_pin');
  end if;
  pin_record:=public.ensure_today_restaurant_pin(input_restaurant_id,null);
  return jsonb_build_object('pin_code',pin_record.pin_code,'valid_until',pin_record.valid_until,
    'synthetic_test_only',public.test_only_basic_operation_scope_active_internal(
      input_restaurant_id,'DAILY_PIN'));
end;
$function$;

create function public.preview_test_only_basic_points_internal(
  input_restaurant_id uuid,input_qr_reference text,input_amount_cents integer
) returns jsonb language plpgsql volatile security definer set search_path=public,extensions,pg_temp as $function$
declare qr_record public.customer_points_qr_references%rowtype; customer_record public.customers%rowtype;
  settings_record public.loyalty_settings%rowtype; hashed_reference text; calculation jsonb; last_visit timestamptz;
begin
  perform public.require_restaurant_operational(input_restaurant_id,'preview_restaurant_controlled_points');
  if input_amount_cents is null or input_amount_cents<100 then
    return jsonb_build_object('success',false,'error_code','POINTS_AMOUNT_BELOW_MINIMUM',
      'error_message','Der Mindestbetrag für eine Punktegutschrift beträgt 1,00 €.');
  end if;
  select * into settings_record from public.loyalty_settings
    where restaurant_id=input_restaurant_id and active=true;
  if settings_record.id is null or settings_record.points_collection_mode not in ('restaurant_controlled_only','both') then
    raise exception 'Dieser Sammelweg ist nicht aktiviert.';
  end if;
  if input_amount_cents>settings_record.points_collection_max_amount_cents then
    return jsonb_build_object('success',false,'error_code','POINTS_AMOUNT_LIMIT_EXCEEDED',
      'error_message','Der Betrag überschreitet das für dieses Restaurant festgelegte Limit.');
  end if;
  hashed_reference:=public.hash_public_token(regexp_replace(coalesce(input_qr_reference,''),'\\s','','g'));
  select * into qr_record from public.customer_points_qr_references q
    where q.restaurant_id=input_restaurant_id
      and (q.token_hash=hashed_reference or q.manual_code_hash=hashed_reference) limit 1;
  if qr_record.id is null then
    insert into public.restaurant_points_credit_attempts(restaurant_id,actor_user_id,reference_hash,status,reason_code)
    values(input_restaurant_id,auth.uid(),hashed_reference,'blocked','QR_NOT_FOUND');
    return jsonb_build_object('success',false,'error_code','QR_NOT_FOUND','error_message','QR-Code wurde nicht gefunden.');
  end if;
  if qr_record.consumed_at is not null or qr_record.revoked_at is not null or qr_record.expires_at<=now() then
    raise exception 'QR-Code ist abgelaufen.';
  end if;
  select * into customer_record from public.customers c
    where c.id=qr_record.customer_id and c.restaurant_id=input_restaurant_id
      and c.membership_status='active' and c.is_test_customer=true;
  if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;
  calculation:=public.calculate_points_award_v1(input_restaurant_id,customer_record.id,input_amount_cents);
  select max(created_at) into last_visit from public.points_transactions
    where restaurant_id=input_restaurant_id and customer_id=customer_record.id and type='earn' and points>0;
  insert into public.restaurant_points_credit_attempts(restaurant_id,customer_id,actor_user_id,reference_hash,amount_cents,status)
    values(input_restaurant_id,customer_record.id,auth.uid(),hashed_reference,input_amount_cents,'previewed');
  return calculation||jsonb_build_object('customer_label',customer_record.name,
    'points_balance',customer_record.points_balance,'last_visit_at',last_visit,
    'amount_cents',input_amount_cents,'expected_points',(calculation->>'final_points')::integer,
    'high_amount_warning',input_amount_cents>=floor(settings_record.points_collection_max_amount_cents*0.8),
    'expires_at',qr_record.expires_at,'synthetic_test_only',true);
end;
$function$;

revoke all on function public.preview_test_only_basic_points_internal(uuid,text,integer)
from public,anon,authenticated,service_role;

create or replace function public.preview_restaurant_controlled_points(
  input_restaurant_id uuid,input_qr_reference text,input_amount_cents integer
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
declare validation jsonb;
begin
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION'
    and public.test_only_basic_access_active_internal(input_restaurant_id) then
    return public.preview_test_only_basic_points_internal(input_restaurant_id,input_qr_reference,input_amount_cents);
  end if;
  validation:=public.validate_minimum_points_amount_v1(input_amount_cents);
  if not coalesce((validation->>'success')::boolean,false) then return validation; end if;
  return public.preview_restaurant_controlled_points_before_minimum_guard(
    input_restaurant_id,input_qr_reference,input_amount_cents);
end;
$function$;

create function public.confirm_test_only_basic_points_internal(
  input_restaurant_id uuid,input_qr_reference text,input_amount_cents integer,
  input_daily_pin text,input_idempotency_key uuid
) returns jsonb language plpgsql volatile security definer
set search_path=public,extensions,pg_temp as $function$
declare
  qr_record public.customer_points_qr_references%rowtype;
  customer_record public.customers%rowtype;
  settings_record public.loyalty_settings%rowtype;
  pin_record public.restaurant_daily_pins%rowtype;
  existing_claim public.points_idempotency_claims%rowtype;
  calculation jsonb; result_payload_value jsonb; pin_failure jsonb;
  hashed_reference text; fingerprint_value text; transaction_id_value uuid;
  base_points_value integer; final_points_value integer; multiplier_value numeric(8,2);
  next_balance integer; local_date_value date; local_day_start timestamptz; local_next_day_start timestamptz;
  timezone_value text;
begin
  perform public.require_restaurant_operational(input_restaurant_id,'confirm_restaurant_controlled_points');
  if input_idempotency_key is null then raise exception 'Buchungs-ID fehlt.'; end if;
  if input_amount_cents is null or input_amount_cents<100 then
    return jsonb_build_object('success',false,'error_code','POINTS_AMOUNT_BELOW_MINIMUM',
      'error_message','Der Mindestbetrag für eine Punktegutschrift beträgt 1,00 €.');
  end if;
  select * into settings_record from public.loyalty_settings
    where restaurant_id=input_restaurant_id and active=true;
  if settings_record.id is null or settings_record.points_collection_mode not in ('restaurant_controlled_only','both') then
    raise exception 'Dieser Sammelweg ist nicht aktiviert.';
  end if;
  if input_amount_cents>settings_record.points_collection_max_amount_cents then
    return jsonb_build_object('success',false,'error_code','POINTS_AMOUNT_LIMIT_EXCEEDED',
      'error_message','Der Betrag überschreitet das für dieses Restaurant festgelegte Limit.');
  end if;
  hashed_reference:=public.hash_public_token(regexp_replace(coalesce(input_qr_reference,''),'\\s','','g'));
  select * into qr_record from public.customer_points_qr_references q
    where q.restaurant_id=input_restaurant_id
      and (q.token_hash=hashed_reference or q.manual_code_hash=hashed_reference) limit 1;
  if qr_record.id is null then return jsonb_build_object('success',false,'error_code','QR_NOT_FOUND',
    'error_message','QR-Code wurde nicht gefunden.'); end if;
  fingerprint_value:=public.compute_points_request_fingerprint_v1(input_restaurant_id,qr_record.customer_id,
    'restaurant_controlled',input_amount_cents,null,qr_record.id,'earn','test_only_basic_confirm_v1');
  perform pg_advisory_xact_lock(hashtextextended(
    'points-idempotency:'||input_restaurant_id::text||':'||input_idempotency_key::text,0));
  select * into existing_claim from public.points_idempotency_claims claim
    where claim.restaurant_id=input_restaurant_id and claim.idempotency_key=input_idempotency_key for update;
  if existing_claim.idempotency_key is not null then
    if existing_claim.payload_fingerprint<>fingerprint_value
      or existing_claim.action_type<>'restaurant_controlled_earn' then
      return jsonb_build_object('success',false,'error_code','IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'error_message','Diese Buchungs-ID wurde bereits für einen anderen Vorgang verwendet.');
    end if;
    if existing_claim.status='completed' then
      return existing_claim.result_payload||jsonb_build_object('already_completed',true,'synthetic_test_only',true);
    end if;
    return jsonb_build_object('success',false,'error_code','POINTS_REQUEST_IN_PROGRESS',
      'error_message','Diese Buchung wird bereits verarbeitet.');
  end if;
  select * into qr_record from public.customer_points_qr_references q
    where q.id=qr_record.id and q.restaurant_id=input_restaurant_id for update;
  if qr_record.consumed_at is not null then raise exception 'QR-Code wurde bereits verwendet.'; end if;
  if qr_record.revoked_at is not null or qr_record.expires_at<=now() then raise exception 'QR-Code ist abgelaufen.'; end if;
  select * into customer_record from public.customers customer
    where customer.id=qr_record.customer_id and customer.restaurant_id=input_restaurant_id
      and customer.membership_status='active' and customer.is_test_customer=true for update;
  if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;
  if exists(select 1 from public.referrals referral where referral.restaurant_id=input_restaurant_id
    and referral.referred_customer_id=customer_record.id and referral.status='pending_registered') then
    raise exception 'TEST_ONLY_BASIC_REFERRAL_OUT_OF_SCOPE' using errcode='42501';
  end if;
  select coalesce(restaurant.timezone_name,'Europe/Vienna'),
    timezone(coalesce(restaurant.timezone_name,'Europe/Vienna'),now())::date
    into timezone_value,local_date_value
    from public.restaurants restaurant where restaurant.id=input_restaurant_id;
  local_day_start:=local_date_value::timestamp at time zone timezone_value;
  local_next_day_start:=(local_date_value+1)::timestamp at time zone timezone_value;
  if (select count(*) from public.points_transactions transaction_row
    where transaction_row.restaurant_id=input_restaurant_id and transaction_row.customer_id=customer_record.id
      and transaction_row.type='earn' and transaction_row.points>0
      and transaction_row.created_at>=local_day_start and transaction_row.created_at<local_next_day_start)>=2 then
    return jsonb_build_object('success',false,'error_code','POINTS_DAILY_LIMIT',
      'error_message','Für diesen Gast wurde das heutige Buchungslimit erreicht.');
  end if;
  pin_record:=public.ensure_today_restaurant_pin(input_restaurant_id,qr_record.branch_id);
  if pin_record.valid_until<=now() then raise exception 'Die Tages-PIN ist nicht mehr gültig.'; end if;
  if pin_record.pin_code<>trim(coalesce(input_daily_pin,'')) then
    pin_failure:=public.persist_daily_pin_rejection(input_restaurant_id,customer_record.id,
      qr_record.branch_id,null,'staff_portal','staff',input_idempotency_key);
    return pin_failure;
  end if;
  insert into public.points_idempotency_claims(
    restaurant_id,idempotency_key,action_type,payload_fingerprint
  ) values(input_restaurant_id,input_idempotency_key,
    'restaurant_controlled_earn',fingerprint_value);
  calculation:=public.calculate_points_award_v1(input_restaurant_id,customer_record.id,input_amount_cents);
  base_points_value:=(calculation->>'base_points')::integer;
  final_points_value:=(calculation->>'final_points')::integer;
  multiplier_value:=(calculation->>'boost_multiplier')::numeric;
  if final_points_value<=0 then raise exception 'Der Betrag ergibt noch keinen Punkt.'; end if;
  insert into public.points_transactions(restaurant_id,organization_id,branch_id,customer_id,type,points,
    reason,idempotency_key,amount_cents,rule_version,applied_rate,collection_source,receipt_number,
    staff_user_id,base_points,boost_multiplier,boost_source,boost_expires_at,bonus_rule_version,request_fingerprint)
  select input_restaurant_id,restaurant.organization_id,qr_record.branch_id,customer_record.id,'earn',
    final_points_value,'TEST_ONLY BASIC: synthetische Punktebuchung',input_idempotency_key,input_amount_cents,
    calculation->>'bonus_rule_version',(calculation->>'applied_rate')::numeric,'restaurant_controlled',null,
    auth.uid(),base_points_value,multiplier_value,calculation->>'boost_source',
    (calculation->>'boost_expires_at')::timestamptz,calculation->>'bonus_rule_version',fingerprint_value
  from public.restaurants restaurant where restaurant.id=input_restaurant_id
  returning id into transaction_id_value;
  update public.customers customer set points_balance=customer.points_balance+final_points_value
    where customer.id=customer_record.id and customer.restaurant_id=input_restaurant_id
      and customer.membership_status='active' and customer.is_test_customer=true
    returning customer.points_balance into next_balance;
  if next_balance is null then raise exception 'Gast wurde nicht gefunden.'; end if;
  update public.customer_points_qr_references reference set consumed_at=now(),
    consumed_transaction_id=transaction_id_value
    where reference.id=qr_record.id and reference.consumed_at is null;
  if not found then raise exception 'QR-Code wurde bereits verwendet.'; end if;
  insert into public.restaurant_points_credit_attempts(
    restaurant_id,customer_id,actor_user_id,reference_hash,amount_cents,status
  ) values(input_restaurant_id,customer_record.id,auth.uid(),hashed_reference,input_amount_cents,'completed');
  result_payload_value:=calculation||jsonb_build_object('transaction_id',transaction_id_value,
    'points_added',final_points_value,'points_balance',next_balance,'amount_cents',input_amount_cents,
    'already_completed',false,'synthetic_test_only',true,
    'first_successful_points',false,'referral_qualified',false,'welcome_gift_unlocked',false);
  update public.points_idempotency_claims claim set status='completed',transaction_id=transaction_id_value,
    result_payload=result_payload_value,completed_at=now()
    where claim.restaurant_id=input_restaurant_id and claim.idempotency_key=input_idempotency_key;
  perform public.write_audit_event(input_restaurant_id,customer_record.id,'staff',auth.uid(),
    'TEST_ONLY_BASIC_POINTS_ADDED','completed','staff_portal','points_transactions',
    transaction_id_value,input_idempotency_key,jsonb_build_object('synthetic_test_only',true,
      'amount_cents',input_amount_cents,'final_points',final_points_value));
  return result_payload_value;
end;
$function$;

revoke all on function public.confirm_test_only_basic_points_internal(uuid,text,integer,text,uuid)
from public,anon,authenticated,service_role;

create or replace function public.confirm_restaurant_controlled_points(
  input_restaurant_id uuid,input_qr_reference text,input_amount_cents integer,
  input_daily_pin text,input_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $function$
begin
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status'='PENDING_ACTIVATION'
    and public.test_only_basic_access_active_internal(input_restaurant_id) then
    return public.confirm_test_only_basic_points_internal(input_restaurant_id,input_qr_reference,
      input_amount_cents,input_daily_pin,input_idempotency_key);
  end if;
  return public.confirm_restaurant_controlled_points_with_legacy_receipt_v1(
    input_restaurant_id,input_qr_reference,input_amount_cents,input_daily_pin,input_idempotency_key,null);
end;
$function$;

create function public.get_test_only_basic_runtime(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $function$
declare snapshot_value jsonb; latest public.test_only_basic_access_receipts%rowtype;
  actor_allowed boolean:=false;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'TEST_ONLY_BASIC_RUNTIME_DENIED' using errcode='42501';
  end if;
  actor_allowed:=public.is_restaurant_member(input_restaurant_id)
    or public.test_only_basic_customer_authorized_internal(input_restaurant_id)
    or coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false);
  if not actor_allowed then raise exception 'TEST_ONLY_BASIC_RUNTIME_DENIED' using errcode='42501'; end if;
  snapshot_value:=public.test_only_basic_access_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then raise exception 'TEST_ONLY_BASIC_CONTEXT_INVALID' using errcode='42501'; end if;
  select * into latest from public.test_only_basic_access_receipts receipt
    where receipt.restaurant_id=input_restaurant_id order by receipt.created_at desc,receipt.id desc limit 1;
  return jsonb_build_object('synthetic_test_only',true,
    'active',public.test_only_basic_access_active_internal(input_restaurant_id),
    'effective_plan',case when public.test_only_basic_access_active_internal(input_restaurant_id) then 'BASIC' else null end,
    'offer_limit',case when public.test_only_basic_access_active_internal(input_restaurant_id) then 5 else 0 end,
    'offer_notifications',false,'reward_notifications',false,'catalog_access',false,
    'real_activation',false,'real_trial',false,'starts_at',latest.starts_at,'expires_at',latest.expires_at,
    'receipt_id',latest.id,'readiness_receipt_id',snapshot_value->>'readiness_receipt_id');
end;
$function$;

revoke all on function public.get_test_only_basic_runtime(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.get_test_only_basic_runtime(uuid) to authenticated;

comment on table public.test_only_basic_access_receipts is
  'Immutable, expiring TEST_ONLY BASIC operation receipts. They are not real activation, trial, billing, KYB, legal or commercial entitlement evidence.';
comment on function public.decide_platform_test_only_basic_access(uuid,text,text,uuid,timestamptz,text,text,uuid) is
  'Grants or revokes a four-hour maximum synthetic BASIC runtime after the exact completed TEST_ONLY chain; real activation and entitlement resolvers remain unchanged.';

notify pgrst,'reload schema';
commit;
