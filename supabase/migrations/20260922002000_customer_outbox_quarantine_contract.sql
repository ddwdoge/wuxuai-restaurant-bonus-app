-- Phase 7C.5E: controlled quarantine contract for fingerprint-bound staging test data.
-- The migration installs the contract only. It never quarantines rows by itself.

create table if not exists public.customer_transactional_email_quarantine_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  reason text not null check (reason = 'HISTORICAL_STAGING_TEST_DATA'),
  target_count integer not null check (target_count > 0),
  before_fingerprint text not null check (before_fingerprint ~ '^[0-9a-f]{32}$'),
  target_delivery_ids uuid[] not null,
  quarantined_at timestamptz not null,
  executed_by_database_role text not null,
  executed_by_auth_uid uuid,
  created_at timestamptz not null default statement_timestamp(),
  check (cardinality(target_delivery_ids) = target_count)
);

alter table public.customer_transactional_email_quarantine_audit enable row level security;
revoke all on table public.customer_transactional_email_quarantine_audit
from public, anon, authenticated, service_role;

create or replace function public.protect_customer_transactional_email_quarantine_audit()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'CUSTOMER_TRANSACTIONAL_EMAIL_QUARANTINE_AUDIT_IMMUTABLE'
    using errcode = '55000';
end;
$function$;

revoke execute on function public.protect_customer_transactional_email_quarantine_audit()
from public, anon, authenticated, service_role;

drop trigger if exists customer_transactional_email_quarantine_audit_immutable
  on public.customer_transactional_email_quarantine_audit;
create trigger customer_transactional_email_quarantine_audit_immutable
before update or delete on public.customer_transactional_email_quarantine_audit
for each row execute function public.protect_customer_transactional_email_quarantine_audit();

create or replace function public.quarantine_historical_staging_customer_outbox(
  input_expected_count integer,
  input_expected_fingerprint text
)
returns table (
  audit_id uuid,
  quarantined_count integer,
  before_fingerprint text
)
language plpgsql
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  target_ids uuid[];
  actual_count integer;
  actual_fingerprint text;
  created_audit_id uuid;
  changed_count integer;
begin
  if input_expected_count is distinct from 21
     or input_expected_fingerprint is distinct from 'd77ca91c88b1d288bc30ea3c40981ec5' then
    raise exception 'CUSTOMER_OUTBOX_QUARANTINE_EXPECTATION_REJECTED'
      using errcode = '22023';
  end if;

  with locked as (
    select delivery.*
    from public.customer_transactional_email_deliveries delivery
    where delivery.status = 'PENDING'
    order by delivery.id
    for update
  )
  select
    array_agg(locked.id order by locked.id),
    count(*)::integer,
    pg_catalog.md5(coalesce(string_agg(to_jsonb(locked)::text, '|' order by locked.id), ''))
  into target_ids, actual_count, actual_fingerprint
  from locked;

  if actual_count is distinct from input_expected_count
     or actual_fingerprint is distinct from input_expected_fingerprint then
    raise exception 'CUSTOMER_OUTBOX_QUARANTINE_PREFLIGHT_MISMATCH'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from public.customer_transactional_email_deliveries delivery
    where delivery.id = any(target_ids)
      and (
        delivery.status <> 'PENDING'
        or delivery.attempt_count <> 0
        or delivery.processing_started_at is not null
      )
  ) then
    raise exception 'CUSTOMER_OUTBOX_QUARANTINE_ROW_STATE_MISMATCH'
      using errcode = '40001';
  end if;

  update public.customer_transactional_email_deliveries delivery
  set
    status = 'SKIPPED',
    processing_started_at = null,
    failed_at = statement_timestamp(),
    last_error_code = 'HISTORICAL_STAGING_TEST_DATA',
    last_error = 'HISTORICAL_STAGING_TEST_DATA',
    updated_at = statement_timestamp()
  where delivery.id = any(target_ids)
    and delivery.status = 'PENDING'
    and delivery.attempt_count = 0
    and delivery.processing_started_at is null;

  get diagnostics changed_count = row_count;
  if changed_count <> actual_count then
    raise exception 'CUSTOMER_OUTBOX_QUARANTINE_ATOMIC_UPDATE_MISMATCH'
      using errcode = '40001';
  end if;

  insert into public.customer_transactional_email_quarantine_audit (
    reason,
    target_count,
    before_fingerprint,
    target_delivery_ids,
    quarantined_at,
    executed_by_database_role,
    executed_by_auth_uid
  ) values (
    'HISTORICAL_STAGING_TEST_DATA',
    actual_count,
    actual_fingerprint,
    target_ids,
    statement_timestamp(),
    session_user,
    auth.uid()
  )
  returning id into created_audit_id;

  return query select created_audit_id, changed_count, actual_fingerprint;
end;
$function$;

revoke execute on function public.quarantine_historical_staging_customer_outbox(integer, text)
from public, anon, authenticated, service_role;
