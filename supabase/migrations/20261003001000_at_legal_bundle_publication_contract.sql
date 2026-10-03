-- Migration 192: independent AT legal bundle identity and publication ledger.
-- No seed, legal approval, operator/KYB decision or document mutation.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20261003001000',0));
do $encoding$ begin
  if getdatabaseencoding()<>'UTF8' then raise exception 'LEGAL_BUNDLE_UTF8_DATABASE_REQUIRED'; end if;
end $encoding$;

-- V1 canonical JSON scalar/tree encoding: tagged, UTF-8 byte-length prefixed.
-- Database UTF8 is required above, so octet_length(text) is immutable and
-- measures the exact UTF-8 bytes. Object keys sort by C collation; array order is retained; SQL NULL is forbidden.
-- This handles nested existing document content without relying on JSON key order.
create or replace function public.legal_bundle_canonical_value_v1(value jsonb)
returns text language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $f$
declare kind text:=jsonb_typeof(value); result text; item record; atom text;
begin
  if value is null then raise exception 'LEGAL_BUNDLE_CANONICAL_NULL' using errcode='22023'; end if;
  if kind='object' then
    result:='o';
    for item in select key,val from jsonb_each(value) as e(key,val) order by key collate "C" loop
      result:=result||octet_length(item.key)::text||':'||item.key
        ||public.legal_bundle_canonical_value_v1(item.val);
    end loop;
    return result||';';
  elsif kind='array' then
    result:='a';
    for item in select val from jsonb_array_elements(value) as e(val) loop
      result:=result||public.legal_bundle_canonical_value_v1(item.val);
    end loop;
    return result||';';
  end if;
  atom:=case when kind='string' then value#>>'{}' else value::text end;
  return left(kind,1)||octet_length(atom)::text||':'||atom;
end $f$;

-- Fixed outer field order, domain and schema version. The manifest itself is
-- stored alongside these exact bytes. Bundle IDs retain all 256 hash bits.
create or replace function public.legal_bundle_canonical_manifest_v1(manifest jsonb)
returns text language plpgsql immutable set search_path=pg_catalog,public,pg_temp as $f$
declare result text:='WUXUAI_LEGAL_BUNDLE_V1'; field text;
begin
  if manifest->>'schema_version' is distinct from '1' then
    raise exception 'LEGAL_BUNDLE_SCHEMA_INVALID' using errcode='22023';
  end if;
  foreach field in array array['schema_version','restaurant_id','country','locale','terms','privacy','policy'] loop
    result:=result||public.legal_bundle_canonical_value_v1(manifest->field);
  end loop;
  return result;
end $f$;

create table public.legal_bundle_snapshots (
  bundle_id text primary key check(bundle_id ~ '^bundle-[0-9a-f]{64}$'),
  schema_version integer not null default 1 check(schema_version=1),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  country text not null check(country='AT'), locale text not null check(locale='de-AT'),
  terms_version_id uuid not null references public.legal_document_versions(id) on delete restrict,
  terms_version text not null, terms_sha256 text not null check(terms_sha256 ~ '^[0-9a-f]{64}$'),
  privacy_version_id uuid not null references public.legal_document_versions(id) on delete restrict,
  privacy_version text not null, privacy_sha256 text not null check(privacy_sha256 ~ '^[0-9a-f]{64}$'),
  policy_revision jsonb not null,
  manifest jsonb not null, canonical_manifest text not null,
  bundle_sha256 text not null unique check(bundle_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id) on delete restrict,
  check(bundle_id='bundle-'||bundle_sha256),
  check(canonical_manifest=public.legal_bundle_canonical_manifest_v1(manifest)),
  check(bundle_sha256=encode(extensions.digest(convert_to(canonical_manifest,'UTF8'),'sha256'),'hex')),
  check(manifest->>'restaurant_id'=restaurant_id::text and manifest->>'country'=country
    and manifest->>'locale'=locale and (manifest->>'schema_version')::integer=schema_version
    and manifest->'policy'=policy_revision
    and manifest->'terms'->>'id'=terms_version_id::text and manifest->'terms'->>'version'=terms_version
    and manifest->'terms'->>'sha256'=terms_sha256
    and manifest->'privacy'->>'id'=privacy_version_id::text and manifest->'privacy'->>'version'=privacy_version
    and manifest->'privacy'->>'sha256'=privacy_sha256)
);
create index legal_bundle_snapshots_restaurant_idx on public.legal_bundle_snapshots(restaurant_id);

create table public.legal_bundle_publication_events (
  id uuid primary key default extensions.gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  bundle_id text not null references public.legal_bundle_snapshots(bundle_id) on delete restrict,
  idempotency_key uuid not null unique,
  action text not null check(action in ('publish','withdraw')),
  expected_status text not null,
  external_approval_confirmed boolean not null,
  approval_reference text not null check(approval_reference ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'),
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_role text not null check(actor_role in ('platform_owner','platform_admin')),
  created_at timestamptz not null default clock_timestamp(),
  check(action<>'publish' or external_approval_confirmed)
);
create index legal_bundle_publication_events_latest_idx
  on public.legal_bundle_publication_events(bundle_id,event_sequence desc);

-- A second key for the same deterministic snapshot needs its own actor-bound
-- receipt; therefore request receipts are independent of snapshot identity.
create table public.legal_bundle_request_receipts (
  idempotency_key uuid primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check(operation in ('snapshot','publish','withdraw')),
  bundle_id text not null references public.legal_bundle_snapshots(bundle_id) on delete restrict,
  request_payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

-- Technical history of the already-consumed policy row, not a new policy.
-- A->B->A yields three revisions; old publication cannot silently revive.
create table public.legal_bundle_policy_revisions (
  revision_id bigint generated always as identity primary key,
  country_code text not null check(country_code='AT'),
  policy_state jsonb not null,
  observed_at timestamptz not null default clock_timestamp()
);
create or replace function public.record_legal_bundle_policy_revision()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp set timezone='UTC' as $f$
begin
  if new.country_code='AT' and (tg_op='INSERT' or to_jsonb(new) is distinct from to_jsonb(old)) then
    insert into public.legal_bundle_policy_revisions(country_code,policy_state) values('AT',to_jsonb(new));
  end if;
  return new;
end $f$;
create trigger legal_bundle_policy_revision after insert or update on public.country_kyb_intake_policies
for each row execute function public.record_legal_bundle_policy_revision();
set local timezone='UTC';
insert into public.legal_bundle_policy_revisions(country_code,policy_state)
select 'AT',to_jsonb(p) from public.country_kyb_intake_policies p where country_code='AT';

create or replace function public.protect_legal_bundle_append_only()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $f$
begin raise exception 'LEGAL_BUNDLE_APPEND_ONLY' using errcode='42501'; end $f$;

do $ddl$
declare relation text;
begin
  foreach relation in array array['legal_bundle_snapshots','legal_bundle_publication_events','legal_bundle_request_receipts','legal_bundle_policy_revisions'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',relation);
    execute format('create trigger legal_bundle_append_only before update or delete or truncate on public.%I for each statement execute function public.protect_legal_bundle_append_only()',relation);
  end loop;
end $ddl$;

create or replace function public.require_legal_bundle_admin_internal()
returns void language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $f$
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false) is not true then
    raise exception 'LEGAL_BUNDLE_ACCESS_DENIED' using errcode='42501';
  end if;
  perform public.require_recent_platform_auth_internal();
end $f$;

-- Only dependencies of the existing legal readiness contract are captured.
-- KYB/operator decisions remain separate and are never copied or mutated.
-- policy change_ref + UTC updated_at + the full existing row values identify
-- its observed revision; changed values invalidate the snapshot even if an
-- external writer forgets to advance updated_at or change_ref.
create or replace function public.legal_bundle_manifest_internal(
  input_restaurant_id uuid,input_terms_id uuid,input_privacy_id uuid
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp set timezone='UTC' as $f$
declare
  policy public.country_kyb_intake_policies%rowtype; manifest jsonb;
  doc public.legal_document_versions%rowtype; template public.legal_master_templates%rowtype;
  item jsonb; kind text; policy_revision bigint;
begin
  if public.resolve_restaurant_legal_jurisdiction(input_restaurant_id)->>'country' is distinct from 'AT' then
    raise exception 'LEGAL_BUNDLE_COUNTRY_INVALID' using errcode='22023';
  end if;
  select * into policy from public.country_kyb_intake_policies where country_code='AT';
  if policy.country_code is null or nullif(trim(policy.change_ref),'') is null or policy.updated_at is null then
    raise exception 'LEGAL_BUNDLE_POLICY_REVISION_REQUIRED' using errcode='42501';
  end if;
  select r.revision_id into policy_revision from public.legal_bundle_policy_revisions r
    where r.country_code='AT' and r.policy_state=to_jsonb(policy)
    order by r.revision_id desc limit 1;
  if policy_revision is null then
    raise exception 'LEGAL_BUNDLE_POLICY_REVISION_REQUIRED' using errcode='42501';
  end if;
  manifest:=jsonb_build_object('schema_version',1,'restaurant_id',input_restaurant_id,'country','AT','locale','de-AT',
    'policy',jsonb_build_object('source','country_kyb_intake_policies','revision_id',policy_revision::text,'country_code',policy.country_code,
      'change_ref',policy.change_ref,'updated_at',to_char(policy.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'real_intake_status',policy.real_intake_status,'test_only_intake_status',policy.test_only_intake_status,
      'legal_status',policy.legal_status,'privacy_status',policy.privacy_status,
      'document_catalog_status',policy.document_catalog_status,'retention_status',policy.retention_status));
  foreach kind in array array['terms','privacy'] loop
    select * into doc from public.legal_document_versions
      where id=case when kind='terms' then input_terms_id else input_privacy_id end
        and restaurant_id=input_restaurant_id;
    if doc.id is null or doc.language is distinct from 'de-AT' or doc.status='archived'
      or lower(doc.document_hash) !~ '^[0-9a-f]{64}$'
      or not exists(select 1 from public.legal_documents d where d.id=doc.document_id
        and d.restaurant_id=input_restaurant_id
        and d.document_type=case when kind='terms' then 'participation_terms' else 'privacy' end)
      or not exists(select 1 from public.legal_document_version_jurisdictions j
        where j.document_version_id=doc.id and j.restaurant_id=input_restaurant_id and j.legal_country='AT') then
      raise exception 'LEGAL_BUNDLE_DOCUMENT_INVALID' using errcode='22023';
    end if;
    if exists(select 1 from public.legal_document_versions newer where newer.document_id=doc.document_id
      and (newer.created_at,newer.id)>(doc.created_at,doc.id)) then
      raise exception 'LEGAL_BUNDLE_DOCUMENT_STALE' using errcode='42501';
    end if;
    select * into template from public.legal_master_templates where id=doc.master_template_id;
    if template.id is null or template.document_type is distinct from
      (case when kind='terms' then 'participation_terms' else 'privacy' end)
      or template.language is distinct from 'de-AT' then
      raise exception 'LEGAL_BUNDLE_TEMPLATE_REQUIRED' using errcode='42501';
    end if;
    if exists(select 1 from public.legal_master_templates newer where newer.document_type=template.document_type
      and newer.language=template.language and newer.active
      and (newer.created_at,newer.id)>(template.created_at,template.id)) then
      raise exception 'LEGAL_BUNDLE_TEMPLATE_STALE' using errcode='42501';
    end if;
    item:=jsonb_build_object('id',doc.id,'document_id',doc.document_id,'version',doc.version,
      'sha256',lower(doc.document_hash),'language',doc.language,'status',doc.status,
      'effective_date',to_char(doc.effective_date,'YYYY-MM-DD'),'content',doc.content,
      'rendered_text',doc.rendered_text,'reacceptance_required',doc.reacceptance_required,
      'template',jsonb_build_object('id',template.id,'version',template.version,'language',template.language,
        'review_status',template.review_status,'active',template.active,'content',template.content_template,
        'rendered_text',template.rendered_text_template));
    manifest:=manifest||jsonb_build_object(kind,item);
  end loop;
  return manifest;
end $f$;

create or replace function public.legal_bundle_manifest_ready_internal(input_manifest jsonb)
returns boolean language sql stable set search_path=pg_catalog,public,pg_temp as $f$
  select coalesce(not (input_manifest->'terms'->>'status' is distinct from 'published'
    or input_manifest->'privacy'->>'status' is distinct from 'published'
    or input_manifest->'terms'->'template'->>'review_status' is distinct from 'REVIEWED'
    or input_manifest->'privacy'->'template'->>'review_status' is distinct from 'REVIEWED'
    or (input_manifest->'terms'->'template'->>'active')::boolean is not true
    or (input_manifest->'privacy'->'template'->>'active')::boolean is not true
    or coalesce(input_manifest->'terms'->'content'->>'template_review_status','REVIEWED') is distinct from 'REVIEWED'
    or coalesce(input_manifest->'privacy'->'content'->>'template_review_status','REVIEWED') is distinct from 'REVIEWED'
    or coalesce(input_manifest->'terms'->'content'->>'legal_packet_status','REVIEWED') is distinct from 'REVIEWED'
    or coalesce(input_manifest->'privacy'->'content'->>'legal_packet_status','REVIEWED') is distinct from 'REVIEWED'
    or coalesce(input_manifest->'terms'->'template'->'content'->>'legal_packet_status','REVIEWED') is distinct from 'REVIEWED'
    or coalesce(input_manifest->'privacy'->'template'->'content'->>'legal_packet_status','REVIEWED') is distinct from 'REVIEWED'
    or input_manifest->'policy'->>'real_intake_status' is distinct from 'READY'
    or input_manifest->'policy'->>'legal_status' is distinct from 'VERIFIED'
    or input_manifest->'policy'->>'privacy_status' is distinct from 'VERIFIED'
    or input_manifest->'policy'->>'document_catalog_status' is distinct from 'VERIFIED'
    or input_manifest->'policy'->>'retention_status' is distinct from 'VERIFIED'
    or input_manifest->'terms'->>'effective_date'>to_char(current_date,'YYYY-MM-DD')
    or input_manifest->'privacy'->>'effective_date'>to_char(current_date,'YYYY-MM-DD')),false);
$f$;

create or replace function public.legal_bundle_effective_status_internal(input_bundle_id text,input_ignore_events boolean default false)
returns text language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $f$
declare snapshot public.legal_bundle_snapshots%rowtype; current_manifest jsonb; last_action text;
begin
  select * into snapshot from public.legal_bundle_snapshots where bundle_id=input_bundle_id;
  if snapshot.bundle_id is null then return 'NOT_FOUND'; end if;
  if not input_ignore_events then
    select action into last_action from public.legal_bundle_publication_events
      where bundle_id=input_bundle_id order by event_sequence desc limit 1;
  end if;
  -- Withdrawal remains explicit even when the underlying references age.
  if last_action='withdraw' then return 'WITHDRAWN'; end if;
  begin
    current_manifest:=public.legal_bundle_manifest_internal(snapshot.restaurant_id,snapshot.terms_version_id,snapshot.privacy_version_id);
  exception when sqlstate '42501' or sqlstate '22023' then return 'STALE'; end;
  if current_manifest is distinct from snapshot.manifest then return 'STALE'; end if;
  if not public.legal_bundle_manifest_ready_internal(current_manifest) then return 'BLOCKED'; end if;
  if last_action='publish' then return 'PUBLISHED'; end if;
  return 'READY';
end $f$;

create or replace function public.create_platform_legal_bundle_snapshot(
  input_restaurant_id uuid,input_country text,input_locale text,
  input_terms_id uuid,input_expected_terms_version text,input_expected_terms_hash text,input_expected_terms_status text,
  input_privacy_id uuid,input_expected_privacy_version text,input_expected_privacy_hash text,input_expected_privacy_status text,
  input_expected_policy_revision jsonb,input_idempotency_key uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare
  actor uuid:=auth.uid(); payload jsonb; prior public.legal_bundle_request_receipts%rowtype;
  manifest jsonb; canonical text; digest_value text; bundle text; result jsonb; existing public.legal_bundle_snapshots%rowtype;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_country is distinct from 'AT' or input_locale is distinct from 'de-AT'
    or input_idempotency_key is null or input_restaurant_id is null
    or input_expected_terms_hash is null or input_expected_privacy_hash is null
    or input_expected_terms_hash !~ '^[0-9a-f]{64}$' or input_expected_privacy_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'LEGAL_BUNDLE_REQUEST_INVALID' using errcode='22023';
  end if;
  payload:=jsonb_build_object('restaurant_id',input_restaurant_id,'country',input_country,'locale',input_locale,
    'terms_id',input_terms_id,'terms_version',input_expected_terms_version,'terms_hash',input_expected_terms_hash,
    'terms_status',input_expected_terms_status,'privacy_id',input_privacy_id,'privacy_version',input_expected_privacy_version,
    'privacy_hash',input_expected_privacy_hash,'privacy_status',input_expected_privacy_status,'policy',input_expected_policy_revision);
  perform pg_advisory_xact_lock(hashtextextended('legal-bundle-request:'||input_idempotency_key::text,0));
  select * into prior from public.legal_bundle_request_receipts where idempotency_key=input_idempotency_key;
  if prior.idempotency_key is not null then
    if prior.actor_id is distinct from actor or prior.operation<>'snapshot' or prior.request_payload is distinct from payload then
      raise exception 'LEGAL_BUNDLE_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return prior.result;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('legal-bundle-restaurant:'||input_restaurant_id::text,0));
  -- Lock every mutable input until receipt+snapshot are committed. New
  -- document rows take a parent FK lock; FOR UPDATE prevents a phantom newer
  -- version from being inserted for either selected document during capture.
  perform 1 from public.restaurants where id=input_restaurant_id for share;
  perform 1 from public.legal_documents where restaurant_id=input_restaurant_id
    and document_type in ('participation_terms','privacy') order by id for update;
  perform 1 from public.legal_document_versions where id in (input_terms_id,input_privacy_id) order by id for share;
  lock table public.legal_master_templates in share mode;
  perform 1 from public.country_kyb_intake_policies where country_code='AT' for share;
  manifest:=public.legal_bundle_manifest_internal(input_restaurant_id,input_terms_id,input_privacy_id);
  if manifest->'terms'->>'version' is distinct from input_expected_terms_version
    or manifest->'terms'->>'sha256' is distinct from input_expected_terms_hash
    or manifest->'terms'->>'status' is distinct from input_expected_terms_status
    or manifest->'privacy'->>'version' is distinct from input_expected_privacy_version
    or manifest->'privacy'->>'sha256' is distinct from input_expected_privacy_hash
    or manifest->'privacy'->>'status' is distinct from input_expected_privacy_status
    or manifest->'policy' is distinct from input_expected_policy_revision then
    raise exception 'LEGAL_BUNDLE_EXPECTED_STATE_MISMATCH' using errcode='22023';
  end if;
  canonical:=public.legal_bundle_canonical_manifest_v1(manifest);
  digest_value:=encode(extensions.digest(convert_to(canonical,'UTF8'),'sha256'),'hex');
  bundle:='bundle-'||digest_value;
  select * into existing from public.legal_bundle_snapshots where bundle_id=bundle for update;
  if existing.bundle_id is not null and (existing.bundle_sha256 is distinct from digest_value
    or existing.canonical_manifest is distinct from canonical) then
    raise exception 'LEGAL_BUNDLE_HASH_COLLISION' using errcode='23505';
  end if;
  if existing.bundle_id is null then
    insert into public.legal_bundle_snapshots(bundle_id,restaurant_id,country,locale,terms_version_id,terms_version,
      terms_sha256,privacy_version_id,privacy_version,privacy_sha256,policy_revision,manifest,canonical_manifest,bundle_sha256,created_by)
    values(bundle,input_restaurant_id,'AT','de-AT',input_terms_id,input_expected_terms_version,input_expected_terms_hash,
      input_privacy_id,input_expected_privacy_version,input_expected_privacy_hash,manifest->'policy',manifest,canonical,digest_value,actor);
  end if;
  result:=jsonb_build_object('operation','snapshot','bundle_id',bundle,'bundle_sha256',digest_value,
    'effective_status',public.legal_bundle_effective_status_internal(bundle));
  insert into public.legal_bundle_request_receipts(idempotency_key,actor_id,operation,bundle_id,request_payload,result)
    values(input_idempotency_key,actor,'snapshot',bundle,payload,result);
  return result;
end $f$;

create or replace function public.set_platform_legal_bundle_publication(
  input_bundle_id text,input_expected_bundle_hash text,input_action text,input_expected_status text,
  input_external_approval_confirmed boolean,input_approval_reference text,input_idempotency_key uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare
  actor uuid:=auth.uid(); payload jsonb; prior public.legal_bundle_request_receipts%rowtype;
  snapshot public.legal_bundle_snapshots%rowtype; status_value text; event_id uuid; result jsonb;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_action is null or input_action not in ('publish','withdraw') or input_idempotency_key is null
    or input_bundle_id is null or input_expected_bundle_hash is null
    or input_expected_bundle_hash !~ '^[0-9a-f]{64}$'
    or input_approval_reference is null or input_approval_reference !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
    or (input_action='publish' and input_external_approval_confirmed is distinct from true) then
    raise exception 'LEGAL_BUNDLE_PUBLICATION_REQUEST_INVALID' using errcode='22023';
  end if;
  payload:=jsonb_build_object('bundle_id',input_bundle_id,'hash',input_expected_bundle_hash,'action',input_action,
    'expected_status',input_expected_status,'confirmed',input_external_approval_confirmed,'reference',input_approval_reference);
  perform pg_advisory_xact_lock(hashtextextended('legal-bundle-request:'||input_idempotency_key::text,0));
  select * into prior from public.legal_bundle_request_receipts where idempotency_key=input_idempotency_key;
  if prior.idempotency_key is not null then
    if prior.actor_id is distinct from actor or prior.operation is distinct from input_action
      or prior.request_payload is distinct from payload then
      raise exception 'LEGAL_BUNDLE_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return prior.result;
  end if;
  select * into snapshot from public.legal_bundle_snapshots where bundle_id=input_bundle_id;
  if snapshot.bundle_id is null or snapshot.bundle_sha256 is distinct from input_expected_bundle_hash then
    raise exception 'LEGAL_BUNDLE_IDENTITY_MISMATCH' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('legal-bundle-restaurant:'||snapshot.restaurant_id::text,0));
  perform 1 from public.legal_bundle_snapshots where bundle_id=input_bundle_id for update;
  perform 1 from public.legal_documents where restaurant_id=snapshot.restaurant_id
    and document_type in ('participation_terms','privacy') order by id for update;
  perform 1 from public.legal_document_versions where id in(snapshot.terms_version_id,snapshot.privacy_version_id) order by id for share;
  lock table public.legal_master_templates in share mode;
  perform 1 from public.country_kyb_intake_policies where country_code='AT' for share;
  status_value:=public.legal_bundle_effective_status_internal(input_bundle_id);
  if status_value is distinct from input_expected_status then
    raise exception 'LEGAL_BUNDLE_STATUS_MISMATCH' using errcode='22023';
  end if;
  if (input_action='publish' and status_value not in ('READY','WITHDRAWN'))
    or (input_action='withdraw' and (status_value='WITHDRAWN' or not exists(select 1 from public.legal_bundle_publication_events
      where bundle_id=input_bundle_id and action='publish'))) then
    raise exception 'LEGAL_BUNDLE_PUBLICATION_BLOCKED' using errcode='42501';
  end if;
  -- WITHDRAWN cannot bypass newly closed gates: re-evaluate before republish.
  if input_action='publish' and public.legal_bundle_effective_status_internal(input_bundle_id,true)<>'READY' then
    raise exception 'LEGAL_BUNDLE_PUBLICATION_BLOCKED' using errcode='42501';
  end if;
  insert into public.legal_bundle_publication_events(bundle_id,idempotency_key,action,expected_status,
    external_approval_confirmed,approval_reference,actor_id,actor_role)
  values(input_bundle_id,input_idempotency_key,input_action,input_expected_status,
    coalesce(input_external_approval_confirmed,false),input_approval_reference,actor,public.current_platform_role()) returning id into event_id;
  result:=jsonb_build_object('operation',input_action,'event_id',event_id,'bundle_id',input_bundle_id,
    'bundle_sha256',snapshot.bundle_sha256,'effective_status',public.legal_bundle_effective_status_internal(input_bundle_id));
  insert into public.legal_bundle_request_receipts(idempotency_key,actor_id,operation,bundle_id,request_payload,result)
    values(input_idempotency_key,actor,input_action,input_bundle_id,payload,result);
  return result;
end $f$;

create or replace function public.get_platform_legal_bundle_receipt(input_idempotency_key uuid,input_expected_bundle_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $f$
declare receipt public.legal_bundle_request_receipts%rowtype;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_idempotency_key is null or input_expected_bundle_id is null
    or input_expected_bundle_id !~ '^bundle-[0-9a-f]{64}$' then
    raise exception 'LEGAL_BUNDLE_RECEIPT_REQUEST_INVALID' using errcode='22023';
  end if;
  select * into receipt from public.legal_bundle_request_receipts where idempotency_key=input_idempotency_key
    and bundle_id=input_expected_bundle_id and actor_id=auth.uid();
  if receipt.idempotency_key is null then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'committed_at',receipt.created_at,'receipt',receipt.result,
    'current_effective_status',public.legal_bundle_effective_status_internal(receipt.bundle_id));
end $f$;

create or replace function public.get_platform_legal_bundle_status(input_bundle_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $f$
begin
  perform public.require_legal_bundle_admin_internal();
  if input_bundle_id is null or input_bundle_id !~ '^bundle-[0-9a-f]{64}$' then
    raise exception 'LEGAL_BUNDLE_REQUEST_INVALID' using errcode='22023';
  end if;
  return jsonb_build_object('bundle_id',input_bundle_id,'effective_status',public.legal_bundle_effective_status_internal(input_bundle_id));
end $f$;

-- A read-only server preview gives the caller the expected deterministic ID
-- BEFORE capture, so even a lost capture response can be reconciled narrowly.
-- It returns metadata, not document bodies, personal data or general decisions.
create or replace function public.get_platform_legal_bundle_preflight(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $f$
declare terms_id uuid; privacy_id uuid; manifest jsonb; hash_value text;
begin
  perform public.require_legal_bundle_admin_internal();
  select v.id into terms_id from public.legal_documents d join public.legal_document_versions v on v.document_id=d.id
    where d.restaurant_id=input_restaurant_id and d.document_type='participation_terms'
    order by v.created_at desc,v.id desc limit 1;
  select v.id into privacy_id from public.legal_documents d join public.legal_document_versions v on v.document_id=d.id
    where d.restaurant_id=input_restaurant_id and d.document_type='privacy'
    order by v.created_at desc,v.id desc limit 1;
  manifest:=public.legal_bundle_manifest_internal(input_restaurant_id,terms_id,privacy_id);
  hash_value:=encode(extensions.digest(convert_to(public.legal_bundle_canonical_manifest_v1(manifest),'UTF8'),'sha256'),'hex');
  return jsonb_build_object('bundle_id','bundle-'||hash_value,'bundle_sha256',hash_value,
    'country','AT','locale','de-AT','policy_revision',manifest->'policy',
    'terms',jsonb_build_object('id',terms_id,'version',manifest->'terms'->>'version','sha256',manifest->'terms'->>'sha256',
      'status',manifest->'terms'->>'status','review_status',manifest->'terms'->'template'->>'review_status'),
    'privacy',jsonb_build_object('id',privacy_id,'version',manifest->'privacy'->>'version','sha256',manifest->'privacy'->>'sha256',
      'status',manifest->'privacy'->>'status','review_status',manifest->'privacy'->'template'->>'review_status'),
    'technical_status',case when public.legal_bundle_manifest_ready_internal(manifest) then 'READY' else 'BLOCKED' end);
end $f$;

-- Grants are explicit and last; no internal function or table is a Browser API.
revoke all on function public.legal_bundle_canonical_value_v1(jsonb),
  public.legal_bundle_canonical_manifest_v1(jsonb),public.protect_legal_bundle_append_only(),
  public.record_legal_bundle_policy_revision(),
  public.require_legal_bundle_admin_internal(),public.legal_bundle_manifest_internal(uuid,uuid,uuid),
  public.legal_bundle_effective_status_internal(text,boolean),public.legal_bundle_manifest_ready_internal(jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.create_platform_legal_bundle_snapshot(uuid,text,text,uuid,text,text,text,uuid,text,text,text,jsonb,uuid),
  public.set_platform_legal_bundle_publication(text,text,text,text,boolean,text,uuid),
  public.get_platform_legal_bundle_receipt(uuid,text),public.get_platform_legal_bundle_status(text),
  public.get_platform_legal_bundle_preflight(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.create_platform_legal_bundle_snapshot(uuid,text,text,uuid,text,text,text,uuid,text,text,text,jsonb,uuid),
  public.set_platform_legal_bundle_publication(text,text,text,text,boolean,text,uuid),
  public.get_platform_legal_bundle_receipt(uuid,text),public.get_platform_legal_bundle_status(text),
  public.get_platform_legal_bundle_preflight(uuid) to authenticated;

create or replace function public.restaurant_legal_bundle_is_current(
  input_restaurant_id uuid,input_as_of date default current_date
) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
  select public.legal_operator_publication_ready_internal(input_restaurant_id,statement_timestamp())
  and exists (
    select 1 from public.restaurants r
    join public.restaurant_legal_profiles p on p.restaurant_id=r.id
    join public.organization_legal_profiles op on op.id=p.operator_profile_id and op.organization_id=r.organization_id
    where r.id=input_restaurant_id and r.status='active'
      and nullif(trim(p.company_name),'') is not null
      and nullif(trim(p.legal_form),'') is not null
      and nullif(trim(p.street),'') is not null
      and nullif(trim(p.postal_code),'') is not null
      and nullif(trim(p.city),'') is not null
      and nullif(trim(p.country),'') is not null
      and nullif(trim(p.email),'') is not null
      and coalesce(nullif(trim(p.complaint_contact),''),nullif(trim(p.email),'')) is not null
      and not exists(select 1 from public.program_terminations t where t.restaurant_id=r.id and t.status='scheduled')
  ) and (
    select count(distinct d.document_type)=2
    from public.legal_documents d join public.legal_document_versions v on v.document_id=d.id
    where d.restaurant_id=input_restaurant_id and d.document_type in ('participation_terms','privacy')
      and v.restaurant_id=d.restaurant_id and v.status='published'
      and v.effective_date<=input_as_of and v.master_template_id is not null
  ) and exists(select 1 from public.legal_bundle_snapshots s
    join public.legal_documents td on td.current_published_version_id=s.terms_version_id and td.restaurant_id=s.restaurant_id
    join public.legal_documents pd on pd.current_published_version_id=s.privacy_version_id and pd.restaurant_id=s.restaurant_id
    where s.restaurant_id=input_restaurant_id and s.country='AT' and s.locale='de-AT'
      and public.legal_bundle_effective_status_internal(s.bundle_id)='PUBLISHED');
$function$;
revoke all on function public.restaurant_legal_bundle_is_current(uuid,date)
  from public,anon,authenticated;

create or replace function public.restaurant_registration_readiness(
  input_restaurant_id uuid,input_as_of date default current_date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  r public.restaurants%rowtype; p public.restaurant_legal_profiles%rowtype;
  operator_link_valid boolean:=false; approval_ready boolean:=false;
  missing_fields text[]:='{}'::text[]; active_required_count integer:=0;
  draft_count integer:=0; termination_active boolean:=false;
  registration_allowed boolean:=false; status_value text:='red';
  reason_value text:='Kundenregistrierung blockiert'; updated_value timestamptz;
begin
  select * into r from public.restaurants where id=input_restaurant_id;
  select * into p from public.restaurant_legal_profiles where restaurant_id=input_restaurant_id;
  select exists(select 1 from public.organization_legal_profiles op
    where op.id=p.operator_profile_id and op.organization_id=r.organization_id) into operator_link_valid;
  approval_ready:=public.legal_operator_publication_ready_internal(input_restaurant_id,statement_timestamp());
  if not operator_link_valid then missing_fields:=array_append(missing_fields,'Betreiberdaten'); end if;
  if nullif(trim(p.company_name),'') is null then missing_fields:=array_append(missing_fields,'Unternehmensname'); end if;
  if nullif(trim(p.legal_form),'') is null then missing_fields:=array_append(missing_fields,'Rechtsform'); end if;
  if nullif(trim(p.street),'') is null then missing_fields:=array_append(missing_fields,'Straße und Hausnummer'); end if;
  if nullif(trim(p.postal_code),'') is null then missing_fields:=array_append(missing_fields,'Postleitzahl'); end if;
  if nullif(trim(p.city),'') is null then missing_fields:=array_append(missing_fields,'Ort'); end if;
  if nullif(trim(p.country),'') is null then missing_fields:=array_append(missing_fields,'Land'); end if;
  if nullif(trim(p.email),'') is null then missing_fields:=array_append(missing_fields,'Kontakt-E-Mail'); end if;
  if not approval_ready then missing_fields:=array_append(missing_fields,'manuell freigegebene Betreiberangaben'); end if;
  select count(distinct d.document_type) into active_required_count
  from public.legal_documents d join public.legal_document_versions v on v.document_id=d.id
  where d.restaurant_id=input_restaurant_id and d.document_type in ('participation_terms','privacy')
    and v.restaurant_id=d.restaurant_id and v.status='published'
    and v.effective_date<=input_as_of and v.master_template_id is not null;
  select count(*) into draft_count from public.legal_document_versions v
    where v.restaurant_id=input_restaurant_id and v.status='draft';
  select exists(select 1 from public.program_terminations t
    where t.restaurant_id=input_restaurant_id and t.status='scheduled') into termination_active;
  registration_allowed:=r.id is not null and r.status='active' and operator_link_valid
    and approval_ready and cardinality(missing_fields)=0 and active_required_count=2 and not termination_active
    and public.restaurant_legal_bundle_is_current(input_restaurant_id,input_as_of);
  if registration_allowed and (r.legal_update_required_at is not null or draft_count>0) then
    status_value:='yellow'; reason_value:='Neue Dokumentversionen müssen geprüft und veröffentlicht werden.';
  elsif registration_allowed then
    status_value:='green'; reason_value:='Manuell freigegebene Betreiberangaben und aktive Dokumentversionen sind verfügbar.';
  elsif not approval_ready then
    reason_value:='Betreiberangaben sind noch nicht manuell freigegeben oder müssen nach einer Änderung erneut geprüft werden.';
  elsif termination_active then reason_value:='Das geplante Programmende blockiert neue Registrierungen.';
  elsif r.status is distinct from 'active' then reason_value:='Das Restaurantprogramm ist nicht aktiv.';
  elsif cardinality(missing_fields)>0 then reason_value:='Pflichtangaben fehlen: '||array_to_string(missing_fields,', ')||'.';
  else reason_value:='Teilnahmebedingungen oder Datenschutzerklärung sind nicht aktiv.'; end if;
  select greatest(coalesce(p.updated_at,'-infinity'::timestamptz),
    coalesce(r.legal_update_required_at,'-infinity'::timestamptz),
    coalesce(max(v.created_at),'-infinity'::timestamptz)) into updated_value
  from public.legal_document_versions v where v.restaurant_id=input_restaurant_id;
  return jsonb_build_object('status',status_value,'label',case status_value
    when 'green' then 'Bereit für Kundenregistrierung' when 'yellow' then 'Prüfung erforderlich'
    else 'Kundenregistrierung blockiert' end,'reason',reason_value,
    'registration_allowed',registration_allowed,'last_updated_at',nullif(updated_value,'-infinity'::timestamptz),
    'missing_profile_fields',to_jsonb(missing_fields),'active_required_documents',active_required_count,
    'draft_documents',draft_count,'program_active',r.status='active' and not termination_active,
    'legal_update_required',r.legal_update_required_at is not null,
    'operator_profile_manually_approved',approval_ready);
end
$function$;
revoke all on function public.restaurant_registration_readiness(uuid,date)
  from public,anon,authenticated;


revoke all on sequence public.legal_bundle_policy_revisions_revision_id_seq,public.legal_bundle_publication_events_event_sequence_seq from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
