-- Phase 7D KYB Phase 3: read-only Platform Admin document review.
-- No approval, rejection, activation, trial, entitlement, grant or Stripe write.

begin;

select pg_advisory_xact_lock(hashtextextended('migration:20260926004000', 0));

create or replace function public.platform_kyb_reviewer_internal()
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select coalesce(
    auth.uid() is not null
    and auth.role() = 'authenticated'
    and public.platform_totp_aal2_verified_internal()
    and public.current_platform_role() in ('platform_owner', 'platform_admin'),
    false
  );
$function$;

revoke all on function public.platform_kyb_reviewer_internal()
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
          or public.platform_kyb_reviewer_internal()
        )
    ), false
  );
$function$;

revoke all on function public.business_verification_document_access_internal(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.business_verification_document_access_internal(uuid, uuid)
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
        and document.status <> 'DELETED'
        and public.business_verification_document_access_internal(document.id, input_actor_id)
    ), false
  );
$function$;

revoke all on function public.business_verification_storage_read_allowed_internal(text, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.business_verification_storage_read_allowed_internal(text, text, uuid)
to authenticated;

drop policy if exists "business verification document authorized read" on storage.objects;
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

create or replace function public.list_platform_kyb_review_queue()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
begin
  if not public.platform_kyb_reviewer_internal() then
    raise exception 'PLATFORM_KYB_AAL2_REQUIRED' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'case_id', verification_case.id,
      'restaurant_id', verification_case.restaurant_id,
      'restaurant_name', restaurant.name,
      'country', verification_case.country_code,
      'method', verification_case.verification_method,
      'status', verification_case.status,
      'submitted_at', verification_case.requested_at,
      'document_count', document_summary.document_count,
      'latest_document_at', document_summary.latest_document_at
    ) order by document_summary.latest_document_at desc, verification_case.id), '[]'::jsonb)
    from public.business_verification_cases verification_case
    join public.restaurants restaurant on restaurant.id = verification_case.restaurant_id
    join lateral (
      select count(*)::integer as document_count,
        max(coalesce(document.uploaded_at, document.reserved_at)) as latest_document_at
      from public.business_verification_documents document
      where document.case_id = verification_case.id and document.status <> 'DELETED'
    ) document_summary on document_summary.document_count > 0
  );
end;
$function$;

revoke all on function public.list_platform_kyb_review_queue()
from public, anon, authenticated, service_role;
grant execute on function public.list_platform_kyb_review_queue() to authenticated;

create or replace function public.get_platform_kyb_review_detail(input_case_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare answer jsonb;
begin
  if not public.platform_kyb_reviewer_internal() then
    raise exception 'PLATFORM_KYB_AAL2_REQUIRED' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'case_id', verification_case.id,
    'restaurant_id', verification_case.restaurant_id,
    'restaurant_name', restaurant.name,
    'country', verification_case.country_code,
    'method', verification_case.verification_method,
    'status', verification_case.status,
    'submitted_at', verification_case.requested_at,
    'review_started_at', verification_case.review_started_at,
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
      'document_id', document.id, 'document_type', document.document_type,
      'version', document.version, 'status', document.status,
      'mime_type', document.mime_type, 'byte_size', document.byte_size,
      'reserved_at', document.reserved_at, 'uploaded_at', document.uploaded_at,
      'superseded_at', document.superseded_at,
      'deletion_requested_at', document.deletion_requested_at
    ) order by document.document_type, document.version desc)
      from public.business_verification_documents document
      where document.case_id = verification_case.id), '[]'::jsonb),
    'document_events', coalesce((select jsonb_agg(jsonb_build_object(
      'document_id', event.document_id, 'event_type', event.event_type,
      'previous_status', event.previous_status, 'new_status', event.new_status,
      'reason_code', event.reason_code, 'created_at', event.created_at
    ) order by event.created_at, event.id)
      from public.business_verification_document_events event
      where event.case_id = verification_case.id), '[]'::jsonb)
  ) into answer
  from public.business_verification_cases verification_case
  join public.restaurants restaurant on restaurant.id = verification_case.restaurant_id
  where verification_case.id = input_case_id;
  if answer is null then
    raise exception 'PLATFORM_KYB_CASE_NOT_FOUND' using errcode = 'P0002';
  end if;
  return answer;
end;
$function$;

revoke all on function public.get_platform_kyb_review_detail(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_platform_kyb_review_detail(uuid) to authenticated;

create or replace function public.get_platform_kyb_document_object(input_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare document_row public.business_verification_documents%rowtype;
begin
  if not public.platform_kyb_reviewer_internal() then
    raise exception 'PLATFORM_KYB_AAL2_REQUIRED' using errcode = '42501';
  end if;
  select * into document_row from public.business_verification_documents document
  where document.id = input_document_id and document.status <> 'DELETED';
  if document_row.id is null then
    raise exception 'PLATFORM_KYB_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'document_id', document_row.id, 'bucket', document_row.storage_bucket,
    'object_name', document_row.storage_object_name, 'mime_type', document_row.mime_type,
    'status', document_row.status
  );
end;
$function$;

revoke all on function public.get_platform_kyb_document_object(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_platform_kyb_document_object(uuid) to authenticated;

comment on function public.list_platform_kyb_review_queue() is
  'Read-only KYB document queue requiring a current Platform Owner/Admin TOTP/AAL2 session. Documents do not imply completeness or approval.';
comment on function public.get_platform_kyb_review_detail(uuid) is
  'Read-only KYB versions and append-only audit metadata requiring current Platform Owner/Admin TOTP/AAL2.';
comment on function public.get_platform_kyb_document_object(uuid) is
  'Resolves one private KYB object only after explicit Platform Owner/Admin TOTP/AAL2 authorization; Storage RLS independently rechecks access.';

notify pgrst, 'reload schema';
commit;
