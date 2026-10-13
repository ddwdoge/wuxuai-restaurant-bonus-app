-- Make SMTP handoff terminal before the provider call. A timeout or a lost
-- completion acknowledgement must never return an offer mail to an automatic
-- retryable state, because the provider may already have accepted it.

alter table public.customer_transactional_email_deliveries
  add column if not exists provider_started_at timestamptz,
  add column if not exists provider_accepted_at timestamptz;

alter table public.customer_transactional_email_deliveries
  drop constraint if exists customer_transactional_email_deliveries_status_check;
alter table public.customer_transactional_email_deliveries
  add constraint customer_transactional_email_deliveries_status_check
  check (status in (
    'PENDING', 'PROCESSING', 'SUBMITTING', 'SENT', 'FAILED', 'SKIPPED', 'UNKNOWN'
  ));

create or replace function public.begin_customer_transactional_email_delivery(
  input_delivery_id uuid
)
returns table (authorized boolean, reason_code text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  delivery_record public.customer_transactional_email_deliveries%rowtype;
  block_reason text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501',
      message = 'CUSTOMER_EMAIL_DISPATCH_ACCESS_DENIED';
  end if;

  select * into delivery_record
  from public.customer_transactional_email_deliveries
  where id = input_delivery_id
  for update;

  if delivery_record.id is null then
    return query select false, 'DELIVERY_NOT_FOUND'::text;
    return;
  end if;
  if delivery_record.status <> 'PROCESSING' then
    return query select false, 'DELIVERY_NOT_PROCESSING'::text;
    return;
  end if;

  block_reason := public.customer_transactional_email_dispatch_block_reason(
    delivery_record.id
  );
  if block_reason is not null then
    update public.customer_transactional_email_deliveries
    set status = 'SKIPPED', failed_at = clock_timestamp(),
        processing_started_at = null, last_error_code = block_reason,
        last_error = block_reason, updated_at = clock_timestamp()
    where id = delivery_record.id and status = 'PROCESSING';
    return query select false, block_reason;
    return;
  end if;

  update public.customer_transactional_email_deliveries
  set status = 'SUBMITTING', provider_started_at = clock_timestamp(),
      processing_started_at = null, failed_at = null,
      last_error_code = null, last_error = null,
      updated_at = clock_timestamp()
  where id = delivery_record.id and status = 'PROCESSING';

  return query select found, case when found then null::text
    else 'DELIVERY_STATE_CHANGED'::text end;
end;
$function$;

revoke all on function public.begin_customer_transactional_email_delivery(uuid)
  from public, anon, authenticated;
grant execute on function public.begin_customer_transactional_email_delivery(uuid)
  to service_role;

create or replace function public.complete_customer_transactional_email_delivery_v2(
  input_delivery_id uuid,
  input_outcome text,
  input_provider_message_id text default null,
  input_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  delivery_record public.customer_transactional_email_deliveries%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501',
      message = 'CUSTOMER_EMAIL_DISPATCH_ACCESS_DENIED';
  end if;
  if input_outcome is null
    or input_outcome not in ('ACCEPTED', 'UNKNOWN') then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_EMAIL_PROVIDER_OUTCOME_INVALID';
  end if;

  select * into delivery_record
  from public.customer_transactional_email_deliveries
  where id = input_delivery_id
  for update;

  if delivery_record.id is null then return false; end if;
  if (delivery_record.status = 'SENT' and input_outcome = 'ACCEPTED')
    or (delivery_record.status = 'UNKNOWN' and input_outcome = 'UNKNOWN') then
    return true;
  end if;
  if delivery_record.status <> 'SUBMITTING' then return false; end if;

  update public.customer_transactional_email_deliveries
  set status = case when input_outcome = 'ACCEPTED' then 'SENT' else 'UNKNOWN' end,
      provider_message_id = coalesce(
        nullif(trim(input_provider_message_id), ''), provider_message_id
      ),
      provider_accepted_at = case when input_outcome = 'ACCEPTED'
        then clock_timestamp() else provider_accepted_at end,
      sent_at = case when input_outcome = 'ACCEPTED'
        then clock_timestamp() else sent_at end,
      failed_at = case when input_outcome = 'UNKNOWN'
        then clock_timestamp() else null end,
      processing_started_at = null,
      last_error_code = case when input_outcome = 'UNKNOWN'
        then left(coalesce(nullif(trim(input_error_code), ''),
          'PROVIDER_OUTCOME_UNKNOWN'), 120) else null end,
      last_error = case when input_outcome = 'UNKNOWN'
        then left(coalesce(nullif(trim(input_error_code), ''),
          'PROVIDER_OUTCOME_UNKNOWN'), 120) else null end,
      updated_at = clock_timestamp()
  where id = delivery_record.id and status = 'SUBMITTING';
  return found;
end;
$function$;

revoke all on function public.complete_customer_transactional_email_delivery_v2(
  uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.complete_customer_transactional_email_delivery_v2(
  uuid, text, text, text
) to service_role;

comment on function public.begin_customer_transactional_email_delivery(uuid) is
  'Service-only final consent/source/entitlement check. Moves a reserved row to terminal-no-retry SUBMITTING immediately before SMTP handoff.';
comment on function public.complete_customer_transactional_email_delivery_v2(uuid,text,text,text) is
  'Records ACCEPTED or terminal UNKNOWN after SMTP handoff. UNKNOWN is never automatically retried.';

notify pgrst, 'reload schema';
