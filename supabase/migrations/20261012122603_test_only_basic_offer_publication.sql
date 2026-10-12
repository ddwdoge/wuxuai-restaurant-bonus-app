-- Separate, immutable TEST_ONLY publication contract for a bound pending tenant.
-- The real offer status RPC remains fail-closed for PENDING_ACTIVATION and is
-- never used as a fallback by this synthetic path.
begin;

select pg_advisory_xact_lock(hashtextextended('migration:20261012122603', 0));

create table public.test_only_basic_offer_publication_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  offer_id uuid not null references public.restaurant_offers(id) on delete restrict,
  access_receipt_id uuid not null references public.test_only_basic_access_receipts(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  expected_status text not null check (expected_status in ('DRAFT', 'DISABLED')),
  expected_publication_version integer not null check (expected_publication_version >= 0),
  request_payload jsonb not null,
  material_snapshot_sha256 text not null check (material_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create index test_only_basic_offer_publication_receipts_tenant_idx
  on public.test_only_basic_offer_publication_receipts(restaurant_id, created_at desc, id desc);
create index test_only_basic_offer_publication_receipts_offer_idx
  on public.test_only_basic_offer_publication_receipts(offer_id, created_at desc, id desc);

create table public.test_only_basic_offer_publication_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  receipt_id uuid not null unique references public.test_only_basic_offer_publication_receipts(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  offer_id uuid not null references public.restaurant_offers(id) on delete restrict,
  access_receipt_id uuid not null references public.test_only_basic_access_receipts(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  event_type text not null check (event_type = 'TEST_ONLY_BASIC_OFFER_PUBLISHED'),
  material_snapshot_sha256 text not null check (material_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create index test_only_basic_offer_publication_audit_tenant_idx
  on public.test_only_basic_offer_publication_audit(restaurant_id, created_at desc, id desc);

alter table public.test_only_basic_offer_publication_receipts enable row level security;
alter table public.test_only_basic_offer_publication_audit enable row level security;
revoke all on public.test_only_basic_offer_publication_receipts,
  public.test_only_basic_offer_publication_audit from public, anon, authenticated, service_role;

create trigger test_only_basic_offer_publication_receipts_immutable
before update or delete or truncate on public.test_only_basic_offer_publication_receipts
for each statement execute function public.protect_business_verification_append_only();

create trigger test_only_basic_offer_publication_audit_immutable
before update or delete or truncate on public.test_only_basic_offer_publication_audit
for each statement execute function public.protect_business_verification_append_only();

create function public.publish_test_only_basic_offer(
  input_restaurant_id uuid,
  input_offer_id uuid,
  input_expected_access_receipt_id uuid,
  input_expected_status text,
  input_expected_publication_version integer,
  input_request_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  restaurant_record public.restaurants%rowtype;
  offer_record public.restaurant_offers%rowtype;
  access_receipt public.test_only_basic_access_receipts%rowtype;
  prior_request public.test_only_basic_offer_publication_receipts%rowtype;
  request_payload_value jsonb;
  material_snapshot jsonb;
  material_snapshot_sha256_value text;
  result_value jsonb;
  receipt_id_value uuid := extensions.gen_random_uuid();
  receipt_sha256_value text;
  audit_id_value uuid;
begin
  perform project_bootstrap.require_runtime_binding(true);
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'TEST_ONLY_BASIC_OWNER_DENIED' using errcode = '42501';
  end if;
  if input_restaurant_id is null or input_offer_id is null
    or input_expected_access_receipt_id is null or input_request_id is null
    or input_expected_status not in ('DRAFT', 'DISABLED')
    or input_expected_publication_version is null or input_expected_publication_version < 0 then
    raise exception 'TEST_ONLY_BASIC_OFFER_REQUEST_INVALID' using errcode = '22023';
  end if;
  request_payload_value := jsonb_build_object(
    'restaurant_id', input_restaurant_id,
    'offer_id', input_offer_id,
    'access_receipt_id', input_expected_access_receipt_id,
    'expected_status', input_expected_status,
    'expected_publication_version', input_expected_publication_version
  );

  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-basic-offer-request:' || input_request_id::text, 0
  ));
  select * into prior_request
  from public.test_only_basic_offer_publication_receipts receipt
  where receipt.request_id = input_request_id;
  if prior_request.id is not null then
    if prior_request.actor_id is distinct from auth.uid()
      or prior_request.request_payload is distinct from request_payload_value then
      raise exception 'TEST_ONLY_BASIC_OFFER_REPLAY_CONFLICT' using errcode = '22023';
    end if;
    return prior_request.result || jsonb_build_object(
      'idempotent', true,
      'historical_receipt', true
    );
  end if;

  -- The same tenant lock is used by GRANT/REVOKE, so a revoke cannot interleave
  -- between this fresh authorization read and the scoped offer update.
  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-basic:' || input_restaurant_id::text, 0
  ));
  perform project_bootstrap.require_runtime_binding(true);
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'TEST_ONLY_BASIC_OWNER_DENIED' using errcode = '42501';
  end if;
  select * into restaurant_record from public.restaurants
  where id = input_restaurant_id for share;
  if restaurant_record.id is null
    or restaurant_record.activation_status is distinct from 'pending_activation'
    or restaurant_record.status is distinct from 'draft' then
    raise exception 'TEST_ONLY_BASIC_CONTEXT_INVALID' using errcode = '42501';
  end if;
  select * into access_receipt
  from public.test_only_basic_access_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.created_at desc, receipt.id desc
  limit 1;
  if access_receipt.id is distinct from input_expected_access_receipt_id
    or access_receipt.action is distinct from 'GRANT'
    or access_receipt.starts_at > statement_timestamp()
    or access_receipt.expires_at <= statement_timestamp()
    or not public.test_only_basic_access_active_internal(input_restaurant_id) then
    raise exception 'TEST_ONLY_BASIC_OFFER_GRANT_INVALID' using errcode = '42501';
  end if;
  select * into offer_record from public.restaurant_offers offer
  where offer.id = input_offer_id
    and offer.restaurant_id = input_restaurant_id
  for update;
  if offer_record.id is null then
    raise exception 'OFFER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if offer_record.branch_id is distinct from access_receipt.branch_id
    or not exists (
      select 1 from public.branches branch
      where branch.id = offer_record.branch_id
        and branch.restaurant_id = input_restaurant_id
        and branch.organization_id = restaurant_record.organization_id
    ) then
    raise exception 'OFFER_BRANCH_INVALID' using errcode = 'P0001';
  end if;
  if offer_record.status is distinct from input_expected_status
    or offer_record.publication_version is distinct from input_expected_publication_version then
    raise exception 'TEST_ONLY_BASIC_OFFER_STALE' using errcode = 'P0001';
  end if;
  if offer_record.status not in ('DRAFT', 'DISABLED') then
    raise exception 'TEST_ONLY_BASIC_OFFER_STATUS_INVALID' using errcode = '22023';
  end if;
  if offer_record.valid_to <= statement_timestamp() then
    raise exception 'OFFER_PERIOD_EXPIRED' using errcode = 'P0001';
  end if;

  material_snapshot := jsonb_build_object(
    'restaurant_id', offer_record.restaurant_id,
    'organization_id', restaurant_record.organization_id,
    'branch_id', offer_record.branch_id,
    'offer_id', offer_record.id,
    'offer_type', offer_record.offer_type,
    'title', offer_record.title,
    'short_description', offer_record.short_description,
    'valid_from', offer_record.valid_from,
    'valid_to', offer_record.valid_to,
    'status', offer_record.status,
    'publication_version', offer_record.publication_version,
    'access_receipt_id', access_receipt.id,
    'access_expires_at', access_receipt.expires_at
  );
  material_snapshot_sha256_value := encode(extensions.digest(
    convert_to(material_snapshot::text, 'UTF8'), 'sha256'
  ), 'hex');

  perform public.begin_test_only_basic_operation_internal(input_restaurant_id, 'OFFER_WRITE');
  update public.restaurant_offers set
    status = 'PUBLISHED',
    is_active = true,
    published_at = clock_timestamp(),
    published_by = auth.uid(),
    archived_at = null,
    publication_version = publication_version + 1
  where id = input_offer_id and restaurant_id = input_restaurant_id
  returning * into offer_record;

  result_value := jsonb_build_object(
    'receipt_id', receipt_id_value,
    'restaurant_id', input_restaurant_id,
    'offer_id', offer_record.id,
    'access_receipt_id', access_receipt.id,
    'status', offer_record.status,
    'publication_version', offer_record.publication_version,
    'published_at', offer_record.published_at,
    'material_snapshot_sha256', material_snapshot_sha256_value,
    'synthetic_test_only', true,
    'real_activation', false,
    'real_trial', false,
    'real_entitlement', false,
    'notifications_enqueued', false,
    'catalog_access', false,
    'idempotent', false
  );
  receipt_sha256_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'receipt_id', receipt_id_value,
    'actor_id', auth.uid(),
    'request_id', input_request_id,
    'request_payload', request_payload_value,
    'material_snapshot_sha256', material_snapshot_sha256_value,
    'result', result_value
  )::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.test_only_basic_offer_publication_receipts (
    id, restaurant_id, organization_id, branch_id, offer_id, access_receipt_id,
    actor_id, request_id, expected_status, expected_publication_version,
    request_payload, material_snapshot_sha256, result, receipt_sha256
  ) values (
    receipt_id_value, input_restaurant_id, restaurant_record.organization_id,
    offer_record.branch_id, offer_record.id, access_receipt.id, auth.uid(),
    input_request_id, input_expected_status, input_expected_publication_version,
    request_payload_value, material_snapshot_sha256_value, result_value,
    receipt_sha256_value
  );
  insert into public.test_only_basic_offer_publication_audit (
    receipt_id, restaurant_id, organization_id, branch_id, offer_id,
    access_receipt_id, actor_id, request_id, event_type,
    material_snapshot_sha256, receipt_sha256
  ) values (
    receipt_id_value, input_restaurant_id, restaurant_record.organization_id,
    offer_record.branch_id, offer_record.id, access_receipt.id, auth.uid(),
    input_request_id, 'TEST_ONLY_BASIC_OFFER_PUBLISHED',
    material_snapshot_sha256_value, receipt_sha256_value
  ) returning id into audit_id_value;
  perform public.write_audit_event(
    input_restaurant_id, null, 'admin', auth.uid(),
    'TEST_ONLY_BASIC_OFFER_PUBLISHED', 'success', 'owner_portal',
    'restaurant_offer', offer_record.id, input_request_id,
    jsonb_build_object(
      'synthetic_test_only', true,
      'publication_receipt_id', receipt_id_value,
      'publication_audit_id', audit_id_value,
      'access_receipt_id', access_receipt.id,
      'material_snapshot_sha256', material_snapshot_sha256_value,
      'publication_version', offer_record.publication_version,
      'notifications_enqueued', false,
      'real_activation', false,
      'real_trial', false,
      'catalog_access', false
    )
  );
  return result_value;
end;
$function$;

revoke all on function public.publish_test_only_basic_offer(uuid, uuid, uuid, text, integer, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.publish_test_only_basic_offer(uuid, uuid, uuid, text, integer, uuid)
to authenticated;

-- Restore the real writer as a real-only path. Its original table trigger keeps
-- PENDING_ACTIVATION closed; this explicit check makes that contract obvious
-- and independent of any synthetic operation scope.
create or replace function public.change_restaurant_offer_status(
  input_restaurant_id uuid, input_offer_id uuid, input_action text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  offer_record public.restaurant_offers%rowtype;
  event_type_value text;
  was_published_active boolean := false;
  recipient_record record;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'OFFER_ACCESS_DENIED';
  end if;
  if public.restaurant_activation_state_internal(input_restaurant_id)->>'status' = 'PENDING_ACTIVATION' then
    raise exception 'RESTAURANT_NOT_OPERATIONAL' using errcode = '42501';
  end if;
  if input_action = 'PUBLISH' then
    select * into offer_record from public.restaurant_offers
    where id = input_offer_id and restaurant_id = input_restaurant_id for update;
    if offer_record.id is null then raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND'; end if;
    if offer_record.valid_to <= now() then raise exception using errcode = 'P0001', message = 'OFFER_PERIOD_EXPIRED'; end if;
    was_published_active := offer_record.status = 'PUBLISHED' and offer_record.is_active;
    update public.restaurant_offers set
      status = 'PUBLISHED', is_active = true,
      published_at = case when was_published_active then published_at else now() end,
      published_by = auth.uid(), archived_at = null,
      publication_version = case when was_published_active then publication_version else publication_version + 1 end
    where id = input_offer_id and restaurant_id = input_restaurant_id returning * into offer_record;
    event_type_value := 'OFFER_PUBLISHED';
    if not was_published_active and public.restaurant_entitlement_enabled(input_restaurant_id, 'offer_notifications') then
      for recipient_record in
        select distinct consent.customer_id from public.customer_offer_email_consents consent
        join public.customers customer on customer.id = consent.customer_id and customer.restaurant_id = consent.restaurant_id
        where consent.restaurant_id = input_restaurant_id and consent.status = 'ACTIVE'
          and consent.email_confirmed_at is not null and customer.membership_status = 'active'
      loop
        perform public.enqueue_customer_transactional_email(
          input_restaurant_id, recipient_record.customer_id, 'OFFER_PUBLISHED',
          offer_record.id::text || ':' || offer_record.publication_version::text || ':' || recipient_record.customer_id::text,
          null, null, jsonb_build_object('offer_title', offer_record.title), now()
        );
      end loop;
    end if;
  elsif input_action = 'DISABLE' then
    update public.restaurant_offers set status = 'DISABLED', is_active = false
    where id = input_offer_id and restaurant_id = input_restaurant_id returning * into offer_record;
    event_type_value := 'OFFER_DISABLED';
  elsif input_action = 'ARCHIVE' then
    update public.restaurant_offers set status = 'ARCHIVED', is_active = false, archived_at = now()
    where id = input_offer_id and restaurant_id = input_restaurant_id returning * into offer_record;
    event_type_value := 'OFFER_ARCHIVED';
  else raise exception using errcode = '22023', message = 'OFFER_ACTION_INVALID'; end if;
  if offer_record.id is null then raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND'; end if;
  perform public.write_audit_event(
    input_restaurant_id, null, 'admin', auth.uid(), event_type_value,
    'success', 'owner_portal', 'restaurant_offer', offer_record.id, null,
    jsonb_build_object('offer_type', offer_record.offer_type, 'status', offer_record.status, 'publication_version', offer_record.publication_version)
  );
  return to_jsonb(offer_record);
end;
$function$;

comment on function public.publish_test_only_basic_offer(uuid, uuid, uuid, text, integer, uuid) is
  'Publishes one bound synthetic offer under the exact current TEST_ONLY BASIC grant. It never calls or falls back to the real status RPC and never enqueues mail.';

notify pgrst, 'reload schema';
commit;
