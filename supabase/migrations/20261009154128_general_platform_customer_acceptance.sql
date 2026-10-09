-- One atomic candidate. No approved documents, decisions or test seeds.
begin;

alter table public.platform_legal_document_versions
  add column platform_provider_snapshot text;
alter table public.platform_legal_document_versions
  drop constraint platform_legal_document_versions_publication_check;
alter table public.platform_legal_document_versions
  add constraint platform_legal_document_versions_publication_check check (
    (document_type not in ('offer_email_consent','platform_terms')
      and source_origin='COUNSEL_REVIEW_PACKAGE'
      and review_status='DRAFT_LEGAL_REVIEW_REQUIRED' and published_at is null
      and approval_reference is null and approved_by is null)
    or (document_type in ('offer_email_consent','platform_terms') and (
      (review_status='DRAFT_LEGAL_REVIEW_REQUIRED' and published_at is null
        and approval_reference is null and approved_by is null)
      or (review_status='REVIEWED' and published_at is not null
        and approval_reference ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
        and approved_by is not null and source_origin='COUNSEL_APPROVED')))),
  add constraint platform_terms_provider_required check (
    document_type<>'platform_terms' or review_status<>'REVIEWED'
    or (platform_provider_snapshot is not null and length(trim(platform_provider_snapshot)) between 1 and 4000));

create table public.platform_terms_publication_events (
  event_sequence bigint generated always as identity primary key,
  document_version_id uuid not null references public.platform_legal_document_versions(id) on delete restrict,
  action text not null check(action in ('PUBLISH','WITHDRAW')),
  request_id uuid not null unique,
  actor_id uuid not null references auth.users(id) on delete restrict,
  expected_event_sequence bigint,
  approval_reference text not null,
  request_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.platform_terms_publication_events enable row level security;
revoke all on public.platform_terms_publication_events from public,anon,authenticated,service_role;
revoke all on sequence public.platform_terms_publication_events_event_sequence_seq from public,anon,authenticated,service_role;
create trigger platform_terms_publication_events_immutable
  before update or delete or truncate on public.platform_terms_publication_events
  for each statement execute function public.protect_legal_bundle_append_only();

-- Old TEST_ONLY records are deliberately outside this index.
create unique index platform_terms_general_acceptance_once
  on public.platform_customer_terms_receipts(auth_user_id,real_document_id)
  where real_document_id is not null;
-- Different retries may have different request IDs but share one decision.
create table public.platform_terms_acceptance_requests (
  request_id uuid primary key,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  receipt_id uuid not null references public.platform_customer_terms_receipts(id) on delete restrict,
  request_payload jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.platform_terms_acceptance_requests enable row level security;
revoke all on public.platform_terms_acceptance_requests from public,anon,authenticated,service_role;
create trigger platform_terms_acceptance_requests_immutable
  before update or delete or truncate on public.platform_terms_acceptance_requests
  for each statement execute function public.protect_legal_bundle_append_only();

create function public.publish_platform_customer_terms(
  input_version text,input_body text,input_sha256 text,input_source_packet_sha256 text,
  input_source_entry text,input_provider_snapshot text,input_external_approval_confirmed boolean,
  input_approval_reference text,input_expected_event_sequence bigint,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $f$
declare prior public.platform_terms_publication_events%rowtype;
  payload jsonb; doc_id uuid; event_id bigint;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_request_id is null or input_external_approval_confirmed is distinct from true
    or input_version is null or input_version !~ '^[A-Za-z0-9_.-]{3,80}$'
    or input_body is null or length(input_body) not between 1 and 100000
    or input_sha256 is null or input_sha256 is distinct from encode(extensions.digest(convert_to(input_body,'UTF8'),'sha256'),'hex')
    or input_source_packet_sha256 is null or input_source_packet_sha256 !~ '^[0-9a-f]{64}$'
    or nullif(trim(input_source_entry),'') is null
    or input_provider_snapshot is null or length(trim(input_provider_snapshot)) not between 1 and 4000
    or input_approval_reference is null or input_approval_reference !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$' then
    raise exception 'PLATFORM_TERMS_APPROVAL_INVALID' using errcode='22023';
  end if;
  payload:=jsonb_build_array(input_version,input_body,input_sha256,input_source_packet_sha256,
    input_source_entry,input_provider_snapshot,input_external_approval_confirmed,input_approval_reference,input_expected_event_sequence);
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-general-publication',0));
  select * into prior from public.platform_terms_publication_events where request_id=input_request_id;
  if prior.event_sequence is not null then
    if prior.action<>'PUBLISH' or prior.actor_id<>auth.uid() or prior.request_payload is distinct from payload then
      raise exception 'PLATFORM_TERMS_REQUEST_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('event_sequence',prior.event_sequence,'document_id',prior.document_version_id,'idempotent',true);
  end if;
  if (select max(event_sequence) from public.platform_terms_publication_events) is distinct from input_expected_event_sequence then
    raise exception 'PLATFORM_TERMS_PUBLICATION_STALE' using errcode='40001';
  end if;
  insert into public.platform_legal_document_versions(document_type,version,locale,
    source_zip_sha256,source_entry,source_origin,body_markdown,content_sha256,
    review_status,published_at,approval_reference,approved_by,platform_provider_snapshot)
  values('platform_terms',input_version,'de-AT',input_source_packet_sha256,input_source_entry,
    'COUNSEL_APPROVED',input_body,input_sha256,'REVIEWED',clock_timestamp(),input_approval_reference,
    auth.uid(),input_provider_snapshot) returning id into doc_id;
  insert into public.platform_terms_publication_events(document_version_id,action,request_id,
    actor_id,expected_event_sequence,approval_reference,request_payload)
  values(doc_id,'PUBLISH',input_request_id,auth.uid(),input_expected_event_sequence,input_approval_reference,payload)
  returning event_sequence into event_id;
  return jsonb_build_object('event_sequence',event_id,'document_id',doc_id,'version',input_version,'sha256',input_sha256,'idempotent',false);
end $f$;

create function public.withdraw_platform_customer_terms(
  input_expected_event_sequence bigint,input_approval_reference text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $f$
declare prior public.platform_terms_publication_events%rowtype;
  current_event public.platform_terms_publication_events%rowtype; payload jsonb; event_id bigint;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_request_id is null or input_expected_event_sequence is null or input_approval_reference is null
    or input_approval_reference !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$' then
    raise exception 'PLATFORM_TERMS_WITHDRAW_INVALID' using errcode='22023';
  end if;
  payload:=jsonb_build_array(input_expected_event_sequence,input_approval_reference);
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-general-publication',0));
  select * into prior from public.platform_terms_publication_events where request_id=input_request_id;
  if prior.event_sequence is not null then
    if prior.action<>'WITHDRAW' or prior.actor_id<>auth.uid() or prior.request_payload is distinct from payload then
      raise exception 'PLATFORM_TERMS_REQUEST_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('event_sequence',prior.event_sequence,'document_id',prior.document_version_id,'idempotent',true);
  end if;
  select * into current_event from public.platform_terms_publication_events order by event_sequence desc limit 1;
  if current_event.event_sequence is distinct from input_expected_event_sequence or current_event.action is distinct from 'PUBLISH' then
    raise exception 'PLATFORM_TERMS_PUBLICATION_STALE' using errcode='40001';
  end if;
  insert into public.platform_terms_publication_events(document_version_id,action,request_id,
    actor_id,expected_event_sequence,approval_reference,request_payload)
  values(current_event.document_version_id,'WITHDRAW',input_request_id,auth.uid(),input_expected_event_sequence,input_approval_reference,payload)
  returning event_sequence into event_id;
  return jsonb_build_object('event_sequence',event_id,'document_id',current_event.document_version_id,'idempotent',false);
end $f$;

create function public.current_general_platform_terms_document_internal()
returns jsonb language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
  select jsonb_build_object('scope','GENERAL','test_only',false,'document_id',d.id,
    'version',d.version,'sha256',d.content_sha256,'language',d.locale,
    'provider_snapshot',d.platform_provider_snapshot,'body_markdown',d.body_markdown)
  from public.platform_terms_publication_events e
  join public.platform_legal_document_versions d on d.id=e.document_version_id
  where e.event_sequence=(select max(event_sequence) from public.platform_terms_publication_events)
    and e.action='PUBLISH' and d.document_type='platform_terms'
    and d.review_status='REVIEWED' and d.source_origin='COUNSEL_APPROVED'
    and d.published_at<=statement_timestamp() and d.approved_by=e.actor_id
    and d.approval_reference=e.approval_reference and d.locale='de-AT'
    and d.content_sha256=encode(extensions.digest(convert_to(d.body_markdown,'UTF8'),'sha256'),'hex');
$f$;

-- Protected CAS preflight and authoritative readback after a lost response.
create function public.get_platform_customer_terms_publication_status(input_request_id uuid default null)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $f$
declare current_event public.platform_terms_publication_events%rowtype;
  receipt public.platform_terms_publication_events%rowtype;
begin
  perform public.require_legal_bundle_admin_internal();
  select * into current_event from public.platform_terms_publication_events order by event_sequence desc limit 1;
  select * into receipt from public.platform_terms_publication_events
    where request_id=input_request_id and actor_id=auth.uid();
  return jsonb_build_object('current_event_sequence',current_event.event_sequence,
    'current_action',current_event.action,'document',public.current_general_platform_terms_document_internal(),
    'receipt',case when receipt.event_sequence is null then null else jsonb_build_object(
      'event_sequence',receipt.event_sequence,'document_id',receipt.document_version_id,
      'action',receipt.action,'request_id',receipt.request_id,'actor_id',receipt.actor_id,
      'approval_reference',receipt.approval_reference,'created_at',receipt.created_at) end);
end $f$;

-- Preserve the complete old TEST_ONLY implementation and its guards. Its new
-- name makes every caller choose the scope explicitly; no scope conversion.
alter function public.get_platform_customer_terms_status() rename to get_platform_customer_test_terms_status;
alter function public.accept_platform_customer_terms(uuid,text,text,text,uuid) rename to accept_platform_customer_test_terms_internal;
alter function public.get_platform_customer_terms_receipt(uuid) rename to platform_customer_terms_receipt_internal;

create function public.get_platform_customer_terms_status()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $f$
declare doc jsonb; receipt public.platform_customer_terms_receipts%rowtype; has_account boolean;
begin
  if auth.role() is distinct from 'authenticated' then raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501'; end if;
  perform public.customer_verified_session_id();
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'CUSTOMER_EMAIL_CONFIRMATION_REQUIRED' using errcode='42501';
  end if;
  select exists(select 1 from public.customer_accounts where auth_user_id=auth.uid() and disabled_at is null) into has_account;
  doc:=public.current_general_platform_terms_document_internal();
  if doc is not null then
    select * into receipt from public.platform_customer_terms_receipts r where r.auth_user_id=auth.uid()
      and r.real_document_id=(doc->>'document_id')::uuid and r.test_document_id is null
      and r.document_version=doc->>'version' and r.document_sha256=doc->>'sha256'
      and r.language=doc->>'language' and r.provider_snapshot=doc->>'provider_snapshot';
  end if;
  return jsonb_build_object('scope','GENERAL','status',case when doc is null then 'UNAVAILABLE'
    when receipt.id is null then 'ACCEPTANCE_REQUIRED' else 'ACCEPTED' end,
    'account_exists',has_account,'document',doc,
    'test_context_available',public.current_platform_terms_document_internal(auth.uid()) is not null,
    'test_account_setup_allowed',coalesce(public.get_platform_customer_test_terms_status()->>'status'='ACCEPTED',false),
    'next_step',case when doc is null then 'WAIT_FOR_APPROVED_TERMS' when receipt.id is null then 'ACCEPT_CURRENT_TERMS' else 'CONTINUE' end,
    'receipt',case when receipt.id is null then null else jsonb_build_object('scope','GENERAL','id',receipt.id,
      'request_id',receipt.request_id,'document_id',receipt.real_document_id,'version',receipt.document_version,
      'sha256',receipt.document_sha256,'language',receipt.language,'provider_snapshot',receipt.provider_snapshot,
      'accepted_at',receipt.accepted_at,'source',receipt.acceptance_source) end);
end $f$;

create function public.get_platform_customer_terms_receipt(input_request_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $f$
declare request_row public.platform_terms_acceptance_requests%rowtype; result jsonb;
begin
  perform public.customer_verified_session_id();
  select * into request_row from public.platform_terms_acceptance_requests
    where request_id=input_request_id and auth_user_id=auth.uid();
  if request_row.request_id is not null then
    select public.platform_customer_terms_receipt_internal(r.request_id) into result
      from public.platform_customer_terms_receipts r where r.id=request_row.receipt_id and r.auth_user_id=auth.uid();
    return result||jsonb_build_object('request_id',input_request_id,'scope','GENERAL');
  end if;
  result:=public.platform_customer_terms_receipt_internal(input_request_id);
  return result||jsonb_build_object('scope',case when exists(select 1 from public.platform_customer_terms_receipts
    where request_id=input_request_id and auth_user_id=auth.uid() and real_document_id is not null) then 'GENERAL'
    when (result->>'found')::boolean then 'TENANT_TEST' else null end);
end $f$;

create function public.accept_platform_customer_terms(
  input_document_id uuid,input_sha256 text,input_language text,input_source text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $f$
declare doc jsonb; prior public.platform_customer_terms_receipts%rowtype;
  request_row public.platform_terms_acceptance_requests%rowtype; payload jsonb;
begin
  if auth.role() is distinct from 'authenticated' then raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501'; end if;
  perform public.customer_verified_session_id();
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'CUSTOMER_EMAIL_CONFIRMATION_REQUIRED' using errcode='42501';
  end if;
  if input_request_id is null or input_document_id is null or input_sha256 is null or input_language is null
    or input_source is null or input_source not in ('customer_registration','existing_account','test_only') then
    raise exception 'PLATFORM_TERMS_ACCEPTANCE_INVALID' using errcode='22023';
  end if;
  -- Global request lock precedes publication and identity locks in both arms.
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-request:'||input_request_id::text,0));
  if exists(select 1 from public.platform_terms_test_publications where id=input_document_id) then
    if exists(select 1 from public.platform_legal_document_versions where id=input_document_id)
      or exists(select 1 from public.platform_terms_acceptance_requests where request_id=input_request_id) then
      raise exception 'PLATFORM_TERMS_RECEIPT_CONFLICT' using errcode='22023';
    end if;
    return public.accept_platform_customer_test_terms_internal(input_document_id,input_sha256,input_language,input_source,input_request_id)
      ||jsonb_build_object('scope','TENANT_TEST');
  end if;
  payload:=jsonb_build_array(input_document_id,input_sha256,input_language,input_source);
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-general-publication',0));
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-acceptance:'||auth.uid()::text,0));
  select * into request_row from public.platform_terms_acceptance_requests where request_id=input_request_id;
  if request_row.request_id is not null then
    if request_row.auth_user_id<>auth.uid() or request_row.request_payload is distinct from payload then
      raise exception 'PLATFORM_TERMS_RECEIPT_CONFLICT' using errcode='22023';
    end if;
    return public.get_platform_customer_terms_receipt(input_request_id)||jsonb_build_object('idempotent',true);
  end if;
  select * into prior from public.platform_customer_terms_receipts where request_id=input_request_id;
  if prior.id is not null then
    if prior.auth_user_id<>auth.uid() or prior.real_document_id is distinct from input_document_id
      or prior.document_sha256<>input_sha256 or prior.language<>input_language or prior.acceptance_source<>input_source then
      raise exception 'PLATFORM_TERMS_RECEIPT_CONFLICT' using errcode='22023';
    end if;
    return public.get_platform_customer_terms_receipt(input_request_id)||jsonb_build_object('idempotent',true);
  end if;
  doc:=public.current_general_platform_terms_document_internal();
  if doc is null or (doc->>'document_id')::uuid is distinct from input_document_id
    or doc->>'sha256' is distinct from input_sha256 or doc->>'language' is distinct from input_language then
    raise exception 'PLATFORM_TERMS_DOCUMENT_STALE_OR_UNAVAILABLE' using errcode='42501';
  end if;
  select * into prior from public.platform_customer_terms_receipts where auth_user_id=auth.uid() and real_document_id=input_document_id;
  if prior.id is null then
    insert into public.platform_customer_terms_receipts(request_id,auth_user_id,real_document_id,
      document_version,document_sha256,language,provider_snapshot,acceptance_source)
    values(input_request_id,auth.uid(),input_document_id,doc->>'version',doc->>'sha256',doc->>'language',doc->>'provider_snapshot',input_source)
    returning * into prior;
  end if;
  insert into public.platform_terms_acceptance_requests(request_id,auth_user_id,receipt_id,request_payload)
    values(input_request_id,auth.uid(),prior.id,payload);
  return public.get_platform_customer_terms_receipt(input_request_id)||jsonb_build_object('idempotent',prior.request_id<>input_request_id);
end $f$;

create or replace function public.require_platform_terms_for_join_internal(input_restaurant_id uuid)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $f$
declare terms_status jsonb; document jsonb;
begin
  if auth.uid() is null or input_restaurant_id is null then raise exception 'PLATFORM_TERMS_ACCEPTANCE_REQUIRED' using errcode='42501'; end if;
  perform public.customer_verified_session_id();
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-general-publication',0));
  terms_status:=public.get_platform_customer_terms_status();
  if terms_status->>'status'='ACCEPTED' then return; end if;
  -- Historical test authorization remains explicitly confined to its tenant.
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-test-publication:'||input_restaurant_id::text,0));
  terms_status:=public.get_platform_customer_test_terms_status();
  if terms_status->>'status' is distinct from 'ACCEPTED' then
    raise exception 'PLATFORM_TERMS_ACCEPTANCE_REQUIRED' using errcode='42501';
  end if;
  document:=terms_status->'document';
  if coalesce((document->>'test_only')::boolean,false) is not true
    or (document->>'restaurant_id')::uuid is distinct from input_restaurant_id
    or not exists(select 1 from public.platform_terms_test_identities where auth_user_id=auth.uid()
      and restaurant_id=input_restaurant_id and test_session_id=document->>'test_session_id') then
    raise exception 'PLATFORM_TERMS_TEST_TENANT_DENIED' using errcode='42501';
  end if;
end $f$;

create or replace function public.require_current_platform_customer_terms_internal()
returns void language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $f$
begin
  perform public.customer_verified_session_id();
  if public.get_platform_customer_terms_status()->>'status'='ACCEPTED' then return; end if;
  -- Existing test account setup only; no general receipt is synthesized.
  if public.get_platform_customer_test_terms_status()->>'status'='ACCEPTED' then return; end if;
  raise exception 'PLATFORM_TERMS_ACCEPTANCE_REQUIRED' using errcode='42501';
end $f$;

-- The two active TEST_ONLY callers retain their entire bodies except the
-- explicitly scoped status call. Fail atomically if their expected shape differs.
do $patch$
declare signature regprocedure; body text;
begin
  foreach signature in array array[
    'public.require_platform_test_only_join_scope_internal(uuid,uuid,text,text)'::regprocedure,
    'public.join_customer_account_test_only_at_legal(text,uuid,boolean,boolean,text,text,uuid)'::regprocedure
  ] loop
    body:=pg_get_functiondef(signature);
    if (length(body)-length(replace(body,'public.get_platform_customer_terms_status()','')))/length('public.get_platform_customer_terms_status()')<>1 then
      raise exception 'PLATFORM_TERMS_TEST_CALLER_SHAPE_CHANGED: %',signature;
    end if;
    execute replace(body,'public.get_platform_customer_terms_status()','public.get_platform_customer_test_terms_status()');
  end loop;
end $patch$;

-- Exact ACL manifest: no browser table access and no callable internal copy.
do $acl$
declare signature regprocedure;
begin
  foreach signature in array array[
    'public.publish_platform_customer_terms(text,text,text,text,text,text,boolean,text,bigint,uuid)'::regprocedure,
    'public.withdraw_platform_customer_terms(bigint,text,uuid)'::regprocedure,
    'public.current_general_platform_terms_document_internal()'::regprocedure,
    'public.get_platform_customer_terms_publication_status(uuid)'::regprocedure,
    'public.get_platform_customer_terms_status()'::regprocedure,
    'public.get_platform_customer_test_terms_status()'::regprocedure,
    'public.accept_platform_customer_terms(uuid,text,text,text,uuid)'::regprocedure,
    'public.accept_platform_customer_test_terms_internal(uuid,text,text,text,uuid)'::regprocedure,
    'public.get_platform_customer_terms_receipt(uuid)'::regprocedure,
    'public.platform_customer_terms_receipt_internal(uuid)'::regprocedure,
    'public.require_platform_terms_for_join_internal(uuid)'::regprocedure,
    'public.require_current_platform_customer_terms_internal()'::regprocedure
  ] loop
    execute format('alter function %s owner to postgres',signature);
    execute format('revoke all on function %s from public,anon,authenticated,service_role',signature);
  end loop;
end $acl$;
grant execute on function public.publish_platform_customer_terms(text,text,text,text,text,text,boolean,text,bigint,uuid),
  public.get_platform_customer_terms_publication_status(uuid),
  public.withdraw_platform_customer_terms(bigint,text,uuid),public.get_platform_customer_terms_status(),
  public.get_platform_customer_test_terms_status(),public.accept_platform_customer_terms(uuid,text,text,text,uuid),
  public.get_platform_customer_terms_receipt(uuid) to authenticated;
commit;
