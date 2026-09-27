-- Phase 7D KYB Phase 1: Austrian manual verification evidence and private storage.
--
-- This migration deliberately does not activate a restaurant. Migration 163's
-- PENDING_ACTIVATION transition guard remains the authoritative operational
-- backstop, and confirm_real_business_verification() remains fail-closed until
-- the separately reviewed manual approval contract is released.

begin;

select pg_advisory_xact_lock(hashtextextended('migration:20260926002000', 0));

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'business-verification-documents',
  'business-verification-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.business_verification_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_type text not null check (document_type in (
    'GISA_EXTRACT',
    'COMPANY_REGISTER_EXTRACT',
    'TRADE_LICENSE',
    'TAX_REGISTRATION',
    'REPRESENTATIVE_ID',
    'POWER_OF_ATTORNEY'
  )),
  version integer not null check (version > 0),
  replaces_document_id uuid references public.business_verification_documents(id) on delete restrict,
  storage_bucket text not null default 'business-verification-documents'
    check (storage_bucket = 'business-verification-documents'),
  storage_object_name text not null unique
    check (storage_object_name !~ '^(https?://|/)' and length(storage_object_name) <= 300),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  byte_size bigint check (byte_size is null or byte_size between 1 and 10485760),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'PENDING_UPLOAD' check (status in (
    'PENDING_UPLOAD', 'UPLOADED', 'SUPERSEDED', 'DELETION_REQUESTED', 'DELETED'
  )),
  reservation_request_id uuid not null unique,
  completion_request_id uuid unique,
  deletion_request_id uuid unique,
  correlation_id uuid not null,
  completion_correlation_id uuid,
  deletion_correlation_id uuid,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  reserved_at timestamptz not null default clock_timestamp(),
  uploaded_at timestamptz,
  superseded_at timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  check ((status = 'PENDING_UPLOAD' and uploaded_at is null and content_sha256 is null and byte_size is null)
    or (status <> 'PENDING_UPLOAD' and uploaded_at is not null and content_sha256 is not null and byte_size is not null)),
  check ((status = 'SUPERSEDED' and superseded_at is not null)
    or status <> 'SUPERSEDED'),
  check (superseded_at is null or status in ('SUPERSEDED', 'DELETION_REQUESTED', 'DELETED')),
  check ((status in ('DELETION_REQUESTED', 'DELETED')) = (deletion_requested_at is not null)),
  check ((status = 'DELETED') = (deleted_at is not null)),
  unique (case_id, document_type, version)
);

create index if not exists business_verification_documents_case_status_idx
  on public.business_verification_documents(case_id, status, document_type, version desc);
create index if not exists business_verification_documents_restaurant_idx
  on public.business_verification_documents(restaurant_id, status, reserved_at desc);

create table if not exists public.business_verification_document_events (
  id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.business_verification_documents(id) on delete restrict,
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null check (event_type in (
    'UPLOAD_RESERVED', 'UPLOAD_COMPLETED', 'SUPERSEDED',
    'DELETION_REQUESTED', 'DELETED'
  )),
  previous_status text,
  new_status text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  correlation_id uuid not null,
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists business_verification_document_events_case_idx
  on public.business_verification_document_events(case_id, created_at, id);

alter table public.business_verification_documents enable row level security;
alter table public.business_verification_document_events enable row level security;
revoke all on public.business_verification_documents,
  public.business_verification_document_events from public, anon, authenticated, service_role;

drop trigger if exists business_verification_document_events_immutable
  on public.business_verification_document_events;
create trigger business_verification_document_events_immutable
  before update or delete or truncate on public.business_verification_document_events
  for each statement execute function public.protect_business_verification_append_only();

create or replace function public.business_verification_owner_internal(
  input_restaurant_id uuid,
  input_actor_id uuid
) returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select coalesce(
    input_actor_id is not null
    and input_actor_id = auth.uid()
    and exists (
      select 1
      from public.restaurants restaurant
      join public.restaurant_members membership
        on membership.restaurant_id = restaurant.id
       and membership.organization_id = restaurant.organization_id
       and membership.user_id = input_actor_id
       and membership.role = 'owner'
      where restaurant.id = input_restaurant_id
        and restaurant.owner_id = input_actor_id
    ),
    false
  );
$function$;

revoke all on function public.business_verification_owner_internal(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.business_verification_document_access_internal(
  input_document_id uuid,
  input_actor_id uuid
) returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select coalesce(
    input_actor_id is not null
    and input_actor_id = auth.uid()
    and exists (
      select 1
      from public.business_verification_documents document
      where document.id = input_document_id
        and document.status <> 'DELETED'
        and (
          public.business_verification_owner_internal(document.restaurant_id, input_actor_id)
          or (
            input_actor_id = auth.uid()
            and coalesce(
              public.current_platform_role() in ('platform_owner', 'platform_admin'), false
            )
          )
        )
    ),
    false
  );
$function$;

revoke all on function public.business_verification_document_access_internal(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.business_verification_document_access_internal(uuid, uuid)
to authenticated;

create or replace function public.business_verification_document_upload_allowed_internal(
  input_bucket_id text,
  input_object_name text,
  input_actor_id uuid
) returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select coalesce(
    input_actor_id is not null
    and exists (
      select 1
      from public.business_verification_documents document
      where document.storage_bucket = input_bucket_id
        and document.storage_object_name = input_object_name
        and document.status = 'PENDING_UPLOAD'
        and document.uploaded_by = input_actor_id
        and public.business_verification_owner_internal(document.restaurant_id, input_actor_id)
    ),
    false
  );
$function$;

revoke all on function public.business_verification_document_upload_allowed_internal(text, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.business_verification_document_upload_allowed_internal(text, text, uuid)
to authenticated;

create or replace function public.business_verification_storage_read_allowed_internal(
  input_bucket_id text,
  input_object_name text,
  input_actor_id uuid
) returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select coalesce(
    input_actor_id is not null
    and input_actor_id = auth.uid()
    and exists (
      select 1
      from public.business_verification_documents document
      where document.storage_bucket = input_bucket_id
        and document.storage_object_name = input_object_name
        and public.business_verification_document_access_internal(document.id, input_actor_id)
    ),
    false
  );
$function$;

revoke all on function public.business_verification_storage_read_allowed_internal(text, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.business_verification_storage_read_allowed_internal(text, text, uuid)
to authenticated;

drop policy if exists "business verification document owner upload" on storage.objects;
drop policy if exists "business verification document authorized read" on storage.objects;
drop policy if exists "business verification document immutable update" on storage.objects;
drop policy if exists "business verification document immutable delete" on storage.objects;

create policy "business verification document owner upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'business-verification-documents'
  and auth.uid() is not null
  and public.business_verification_document_upload_allowed_internal(
    storage.objects.bucket_id, storage.objects.name, auth.uid()
  )
);

create policy "business verification document authorized read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'business-verification-documents'
  and auth.uid() is not null
  and public.business_verification_storage_read_allowed_internal(
    storage.objects.bucket_id, storage.objects.name, auth.uid()
  )
);

create or replace function public.reserve_business_verification_document_upload(
  input_restaurant_id uuid,
  input_document_type text,
  input_mime_type text,
  input_request_id uuid,
  input_correlation_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  restaurant_row public.restaurants%rowtype;
  case_row public.business_verification_cases%rowtype;
  prior_row public.business_verification_documents%rowtype;
  prior_version_row public.business_verification_documents%rowtype;
  document_id_value uuid := extensions.gen_random_uuid();
  document_type_value text := upper(trim(coalesce(input_document_type, '')));
  mime_type_value text := lower(trim(coalesce(input_mime_type, '')));
  extension_value text;
  version_value integer;
  object_name_value text;
begin
  if actor_id_value is null
    or auth.role() is distinct from 'authenticated'
    or input_restaurant_id is null
    or input_request_id is null
    or input_correlation_id is null
    or document_type_value not in (
      'GISA_EXTRACT', 'COMPANY_REGISTER_EXTRACT', 'TRADE_LICENSE',
      'TAX_REGISTRATION', 'REPRESENTATIVE_ID', 'POWER_OF_ATTORNEY'
    )
    or mime_type_value not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_REQUEST_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('business-verification-document:' || input_restaurant_id::text, 0)
  );

  select * into prior_row
  from public.business_verification_documents
  where reservation_request_id = input_request_id;

  if prior_row.id is not null then
    if prior_row.restaurant_id is distinct from input_restaurant_id
      or prior_row.uploaded_by is distinct from actor_id_value
      or prior_row.document_type is distinct from document_type_value
      or prior_row.mime_type is distinct from mime_type_value
      or prior_row.correlation_id is distinct from input_correlation_id then
      raise exception 'BUSINESS_VERIFICATION_DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'document_id', prior_row.id,
      'bucket', prior_row.storage_bucket,
      'object_name', prior_row.storage_object_name,
      'status', prior_row.status,
      'idempotent', true
    );
  end if;

  select * into restaurant_row
  from public.restaurants
  where id = input_restaurant_id
  for update;

  if restaurant_row.id is null
    or not public.business_verification_owner_internal(restaurant_row.id, actor_id_value) then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if public.restaurant_activation_state_internal(restaurant_row.id)->>'status'
      is distinct from 'PENDING_ACTIVATION' then
    raise exception 'BUSINESS_VERIFICATION_PENDING_REQUIRED' using errcode = '42501';
  end if;

  select * into case_row
  from public.business_verification_cases
  where restaurant_id = restaurant_row.id
  for update;

  if case_row.id is null
    or case_row.country_code is distinct from 'AT'
    or case_row.verification_method is distinct from 'MANUAL'
    or case_row.status not in ('PENDING_ACTIVATION', 'IN_REVIEW', 'REJECTED') then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_CASE_NOT_UPLOADABLE' using errcode = '42501';
  end if;

  select * into prior_version_row
  from public.business_verification_documents
  where case_id = case_row.id
    and document_type = document_type_value
  order by version desc
  limit 1;

  version_value := coalesce(prior_version_row.version, 0) + 1;
  extension_value := case mime_type_value
    when 'application/pdf' then 'pdf'
    when 'image/jpeg' then 'jpg'
    else 'png'
  end;
  object_name_value := restaurant_row.id::text || '/' || case_row.id::text || '/'
    || document_id_value::text || '/document.' || extension_value;

  insert into public.business_verification_documents (
    id, case_id, restaurant_id, organization_id, document_type, version,
    replaces_document_id, storage_object_name, mime_type,
    reservation_request_id, correlation_id, uploaded_by
  ) values (
    document_id_value, case_row.id, restaurant_row.id, restaurant_row.organization_id,
    document_type_value, version_value, prior_version_row.id, object_name_value,
    mime_type_value, input_request_id, input_correlation_id, actor_id_value
  );

  insert into public.business_verification_document_events (
    document_id, case_id, restaurant_id, organization_id, event_type,
    previous_status, new_status, actor_id, request_id, correlation_id, reason_code
  ) values (
    document_id_value, case_row.id, restaurant_row.id, restaurant_row.organization_id,
    'UPLOAD_RESERVED', null, 'PENDING_UPLOAD', actor_id_value,
    input_request_id, input_correlation_id, 'OWNER_UPLOAD_RESERVED'
  );

  return jsonb_build_object(
    'document_id', document_id_value,
    'bucket', 'business-verification-documents',
    'object_name', object_name_value,
    'status', 'PENDING_UPLOAD',
    'idempotent', false
  );
end;
$function$;

revoke all on function public.reserve_business_verification_document_upload(
  uuid, text, text, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.reserve_business_verification_document_upload(
  uuid, text, text, uuid, uuid
) to authenticated;

create or replace function public.complete_business_verification_document_upload(
  input_document_id uuid,
  input_content_sha256 text,
  input_request_id uuid,
  input_correlation_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, storage, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  document_row public.business_verification_documents%rowtype;
  prior_row public.business_verification_documents%rowtype;
  object_row storage.objects%rowtype;
  content_hash_value text := lower(trim(coalesce(input_content_sha256, '')));
  object_mime_type text;
  object_size bigint;
  now_value timestamptz := clock_timestamp();
  supersede_request_id uuid;
begin
  if actor_id_value is null
    or auth.role() is distinct from 'authenticated'
    or input_document_id is null
    or input_request_id is null
    or input_correlation_id is null
    or content_hash_value !~ '^[0-9a-f]{64}$' then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_COMPLETION_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('business-verification-document-id:' || input_document_id::text, 0)
  );

  select * into document_row
  from public.business_verification_documents
  where id = input_document_id
  for update;

  if document_row.id is null
    or document_row.uploaded_by is distinct from actor_id_value
    or not public.business_verification_owner_internal(document_row.restaurant_id, actor_id_value) then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if document_row.completion_request_id = input_request_id then
    if document_row.completion_correlation_id is distinct from input_correlation_id
      or document_row.content_sha256 is distinct from content_hash_value then
      raise exception 'BUSINESS_VERIFICATION_DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'document_id', document_row.id,
      'status', document_row.status,
      'idempotent', true
    );
  end if;

  if document_row.status is distinct from 'PENDING_UPLOAD'
    or document_row.completion_request_id is not null then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_NOT_COMPLETABLE' using errcode = '42501';
  end if;

  if public.restaurant_activation_state_internal(document_row.restaurant_id)->>'status'
      is distinct from 'PENDING_ACTIVATION' then
    raise exception 'BUSINESS_VERIFICATION_PENDING_REQUIRED' using errcode = '42501';
  end if;

  select * into object_row
  from storage.objects
  where bucket_id = document_row.storage_bucket
    and name = document_row.storage_object_name
  for update;

  if object_row.id is null then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_OBJECT_MISSING' using errcode = 'P0002';
  end if;

  object_mime_type := lower(coalesce(
    object_row.metadata->>'mimetype', object_row.metadata->>'contentType', ''
  ));
  if coalesce(object_row.metadata->>'size', '') !~ '^[0-9]+$' then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_SIZE_INVALID' using errcode = '22023';
  end if;
  object_size := (object_row.metadata->>'size')::bigint;

  if object_mime_type is distinct from document_row.mime_type
    or object_size not between 1 and 10485760 then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_OBJECT_INVALID' using errcode = '22023';
  end if;

  select * into prior_row
  from public.business_verification_documents
  where case_id = document_row.case_id
    and document_type = document_row.document_type
    and id <> document_row.id
    and status = 'UPLOADED'
  order by version desc
  limit 1
  for update;

  if prior_row.id is not null then
    supersede_request_id := extensions.gen_random_uuid();
    update public.business_verification_documents
    set status = 'SUPERSEDED', superseded_at = now_value
    where id = prior_row.id;

    insert into public.business_verification_document_events (
      document_id, case_id, restaurant_id, organization_id, event_type,
      previous_status, new_status, actor_id, request_id, correlation_id, reason_code
    ) values (
      prior_row.id, prior_row.case_id, prior_row.restaurant_id, prior_row.organization_id,
      'SUPERSEDED', 'UPLOADED', 'SUPERSEDED', actor_id_value,
      supersede_request_id, input_correlation_id, 'OWNER_REPLACEMENT_COMPLETED'
    );
  end if;

  update public.business_verification_documents
  set status = 'UPLOADED',
      byte_size = object_size,
      content_sha256 = content_hash_value,
      completion_request_id = input_request_id,
      completion_correlation_id = input_correlation_id,
      uploaded_at = now_value
  where id = document_row.id;

  insert into public.business_verification_evidence_metadata (
    case_id, evidence_type, storage_reference, content_hash, mime_type,
    retention_class, uploaded_at
  ) values (
    document_row.case_id, document_row.document_type, document_row.storage_object_name,
    content_hash_value, document_row.mime_type, 'KYB_MANUAL_REVIEW', now_value
  );

  insert into public.business_verification_document_events (
    document_id, case_id, restaurant_id, organization_id, event_type,
    previous_status, new_status, actor_id, request_id, correlation_id, reason_code
  ) values (
    document_row.id, document_row.case_id, document_row.restaurant_id,
    document_row.organization_id, 'UPLOAD_COMPLETED', 'PENDING_UPLOAD', 'UPLOADED',
    actor_id_value, input_request_id, input_correlation_id, 'OWNER_UPLOAD_COMPLETED'
  );

  return jsonb_build_object(
    'document_id', document_row.id,
    'status', 'UPLOADED',
    'idempotent', false
  );
end;
$function$;

revoke all on function public.complete_business_verification_document_upload(
  uuid, text, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.complete_business_verification_document_upload(
  uuid, text, uuid, uuid
) to authenticated;

create or replace function public.request_business_verification_document_deletion(
  input_document_id uuid,
  input_request_id uuid,
  input_correlation_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  document_row public.business_verification_documents%rowtype;
  now_value timestamptz := clock_timestamp();
begin
  if actor_id_value is null
    or auth.role() is distinct from 'authenticated'
    or input_document_id is null
    or input_request_id is null
    or input_correlation_id is null then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_DELETION_INVALID' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('business-verification-document-id:' || input_document_id::text, 0)
  );

  select * into document_row
  from public.business_verification_documents
  where id = input_document_id
  for update;

  if document_row.id is null
    or not public.business_verification_owner_internal(document_row.restaurant_id, actor_id_value) then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_OWNER_REQUIRED' using errcode = '42501';
  end if;

  if document_row.deletion_request_id = input_request_id then
    if document_row.deletion_correlation_id is distinct from input_correlation_id then
      raise exception 'BUSINESS_VERIFICATION_DOCUMENT_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'document_id', document_row.id,
      'status', document_row.status,
      'physical_delete_pending', true,
      'idempotent', true
    );
  end if;

  if document_row.status not in ('UPLOADED', 'SUPERSEDED')
    or document_row.deletion_request_id is not null then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_DELETION_NOT_ALLOWED' using errcode = '42501';
  end if;

  update public.business_verification_documents
  set status = 'DELETION_REQUESTED',
      deletion_request_id = input_request_id,
      deletion_correlation_id = input_correlation_id,
      deletion_requested_at = now_value
  where id = document_row.id;

  insert into public.business_verification_document_events (
    document_id, case_id, restaurant_id, organization_id, event_type,
    previous_status, new_status, actor_id, request_id, correlation_id, reason_code
  ) values (
    document_row.id, document_row.case_id, document_row.restaurant_id,
    document_row.organization_id, 'DELETION_REQUESTED', document_row.status,
    'DELETION_REQUESTED', actor_id_value, input_request_id, input_correlation_id,
    'OWNER_DELETION_REQUESTED'
  );

  return jsonb_build_object(
    'document_id', document_row.id,
    'status', 'DELETION_REQUESTED',
    'physical_delete_pending', true,
    'idempotent', false
  );
end;
$function$;

revoke all on function public.request_business_verification_document_deletion(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.request_business_verification_document_deletion(
  uuid, uuid, uuid
) to authenticated;

create or replace function public.list_business_verification_documents(
  input_restaurant_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
begin
  if actor_id_value is null
    or auth.role() is distinct from 'authenticated'
    or not (
      public.business_verification_owner_internal(input_restaurant_id, actor_id_value)
      or coalesce(
        public.current_platform_role() in ('platform_owner', 'platform_admin'), false
      )
    ) then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_READ_DENIED' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'document_id', document.id,
      'document_type', document.document_type,
      'version', document.version,
      'status', document.status,
      'mime_type', document.mime_type,
      'byte_size', document.byte_size,
      'reserved_at', document.reserved_at,
      'uploaded_at', document.uploaded_at,
      'deletion_requested_at', document.deletion_requested_at
    ) order by document.document_type, document.version desc), '[]'::jsonb)
    from public.business_verification_documents document
    where document.restaurant_id = input_restaurant_id
  );
end;
$function$;

revoke all on function public.list_business_verification_documents(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.list_business_verification_documents(uuid) to authenticated;

create or replace function public.get_business_verification_document_object(
  input_document_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  document_row public.business_verification_documents%rowtype;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not public.business_verification_document_access_internal(input_document_id, auth.uid()) then
    raise exception 'BUSINESS_VERIFICATION_DOCUMENT_READ_DENIED' using errcode = '42501';
  end if;

  select * into document_row
  from public.business_verification_documents
  where id = input_document_id;

  return jsonb_build_object(
    'document_id', document_row.id,
    'bucket', document_row.storage_bucket,
    'object_name', document_row.storage_object_name,
    'mime_type', document_row.mime_type,
    'status', document_row.status
  );
end;
$function$;

revoke all on function public.get_business_verification_document_object(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_business_verification_document_object(uuid) to authenticated;

comment on table public.business_verification_documents is
  'Private Austrian V1 KYB document registry. Objects are immutable; replacement creates a new version and deletion is a separately audited request.';
comment on table public.business_verification_document_events is
  'Append-only audit trail for KYB document lifecycle transitions. It never contains raw document bytes or download credentials.';
comment on function public.reserve_business_verification_document_upload(uuid, text, text, uuid, uuid) is
  'Creates one owner-bound private upload slot for an Austrian pending-verification case; it does not activate the restaurant.';
comment on function public.request_business_verification_document_deletion(uuid, uuid, uuid) is
  'Records an owner deletion request without deleting evidence. Physical deletion requires a separately authorized retention-aware executor.';

notify pgrst, 'reload schema';

commit;
