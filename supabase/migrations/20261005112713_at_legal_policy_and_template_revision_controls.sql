-- Additive controls for future exact Founder/Counsel content. This migration
-- neither reviews existing drafts nor verifies real AT policies.
begin;

create table public.platform_at_legal_admin_receipts (
  request_id uuid primary key,
  operation text not null check(operation in ('TEMPLATE_DRAFT','TEMPLATE_REVIEW',
    'POLICY_ARTIFACT_DRAFT','POLICY_ARTIFACT_REVIEW','POLICY_REVISION')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  expected_state jsonb not null,
  request_payload jsonb not null,
  result jsonb not null,
  committed_at timestamptz not null default clock_timestamp()
);
create table public.platform_at_legal_template_evidence (
  template_id uuid primary key references public.legal_master_templates(id) on delete restrict,
  source_reference text not null check(source_reference ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'),
  source_origin text not null check(source_origin in ('FOUNDER_DRAFT','COUNSEL_DRAFT')),
  content_sha256 text not null check(content_sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);
create table public.platform_at_legal_template_review_events (
  id uuid primary key default extensions.gen_random_uuid(),
  template_id uuid not null references public.legal_master_templates(id) on delete restrict,
  request_id uuid not null unique references public.platform_at_legal_admin_receipts(request_id) on delete restrict
    deferrable initially deferred,
  expected_hash text not null check(expected_hash ~ '^[0-9a-f]{64}$'),
  external_approval_reference text not null check(external_approval_reference ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'),
  actor_id uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default clock_timestamp()
);
create table public.platform_at_legal_policy_evidence (
  revision_id bigint primary key references public.legal_bundle_policy_revisions(revision_id) on delete restrict,
  request_id uuid not null unique references public.platform_at_legal_admin_receipts(request_id) on delete restrict
    deferrable initially deferred,
  area_versions jsonb not null,
  area_evidence_sha256 text not null check(area_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  external_approval_reference text not null check(external_approval_reference ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'),
  actor_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp()
);
create table public.platform_at_legal_policy_artifact_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  area text not null check(area in ('document_catalog','retention')),
  version text not null check(version ~ '^[A-Za-z0-9_.-]{3,80}$'),
  content jsonb not null check(jsonb_typeof(content)='object'),
  rendered_text text not null check(length(trim(rendered_text)) between 1 and 100000),
  content_sha256 text not null check(content_sha256 ~ '^[0-9a-f]{64}$'),
  source_reference text not null check(source_reference ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'),
  source_origin text not null check(source_origin in ('FOUNDER_DRAFT','COUNSEL_DRAFT')),
  review_status text not null default 'DRAFT_LEGAL_REVIEW_REQUIRED'
    check(review_status in ('DRAFT_LEGAL_REVIEW_REQUIRED','REVIEWED')),
  active boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique(area,version)
);
create table public.platform_at_legal_policy_artifact_review_events (
  id uuid primary key default extensions.gen_random_uuid(),
  artifact_id uuid not null references public.platform_at_legal_policy_artifact_versions(id) on delete restrict,
  request_id uuid not null unique references public.platform_at_legal_admin_receipts(request_id)
    on delete restrict deferrable initially deferred,
  expected_hash text not null check(expected_hash ~ '^[0-9a-f]{64}$'),
  external_approval_reference text not null check(external_approval_reference ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'),
  actor_id uuid not null references auth.users(id) on delete restrict,
  reviewed_at timestamptz not null default clock_timestamp()
);
do $ddl$
declare relation text;
begin
  foreach relation in array array['platform_at_legal_admin_receipts',
    'platform_at_legal_template_evidence','platform_at_legal_template_review_events',
    'platform_at_legal_policy_evidence','platform_at_legal_policy_artifact_versions',
    'platform_at_legal_policy_artifact_review_events'] loop
    execute format('alter table public.%I enable row level security',relation);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',relation);
    if relation<>'platform_at_legal_policy_artifact_versions' then
      execute format('create trigger at_legal_admin_append_only before update or delete or truncate on public.%I for each statement execute function public.protect_legal_bundle_append_only()',relation);
    end if;
  end loop;
end $ddl$;

create function public.at_legal_policy_artifact_hash_internal(
  input_area text,input_version text,input_content jsonb,input_rendered_text text
) returns text language sql immutable set search_path=pg_catalog,public,pg_temp as $function$
  select encode(extensions.digest(convert_to('WUXUAI_AT_POLICY_ARTIFACT_V1'
    ||public.legal_bundle_canonical_value_v1(jsonb_build_object(
      'area',input_area,'version',input_version,'content',input_content,
      'rendered_text',input_rendered_text)),'UTF8'),'sha256'),'hex');
$function$;
revoke all on function public.at_legal_policy_artifact_hash_internal(text,text,jsonb,text)
  from public,anon,authenticated,service_role;

create function public.protect_platform_at_legal_policy_artifact()
returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $function$
begin
  if tg_op='DELETE' then raise exception 'AT_LEGAL_POLICY_ARTIFACT_APPEND_ONLY' using errcode='42501'; end if;
  if (new.area,new.version,new.content,new.rendered_text,new.content_sha256,
    new.source_reference,new.source_origin,new.created_by,new.created_at)
    is distinct from
    (old.area,old.version,old.content,old.rendered_text,old.content_sha256,
    old.source_reference,old.source_origin,old.created_by,old.created_at) then
    raise exception 'AT_LEGAL_POLICY_ARTIFACT_IMMUTABLE' using errcode='42501';
  end if;
  return new;
end;
$function$;
create trigger protect_platform_at_legal_policy_artifact_row
  before update or delete on public.platform_at_legal_policy_artifact_versions
  for each row execute function public.protect_platform_at_legal_policy_artifact();
create trigger protect_platform_at_legal_policy_artifact_truncate
  before truncate on public.platform_at_legal_policy_artifact_versions
  for each statement execute function public.protect_legal_bundle_append_only();
revoke all on function public.protect_platform_at_legal_policy_artifact()
  from public,anon,authenticated,service_role;

create function public.at_legal_template_content_hash_internal(
  input_type text,input_version text,input_language text,input_title text,
  input_content jsonb,input_rendered_text text
) returns text language sql immutable set search_path=pg_catalog,public,pg_temp as $function$
  select encode(extensions.digest(convert_to('WUXUAI_AT_TEMPLATE_V1'
    ||public.legal_bundle_canonical_value_v1(jsonb_build_object(
      'document_type',input_type,'version',input_version,'language',input_language,
      'title',input_title,'content',input_content,'rendered_text',input_rendered_text)),
    'UTF8'),'sha256'),'hex');
$function$;
revoke all on function public.at_legal_template_content_hash_internal(text,text,text,text,jsonb,text)
  from public,anon,authenticated,service_role;

create function public.get_platform_at_legal_template_preflight(input_document_type text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare latest public.legal_master_templates%rowtype; evidence public.platform_at_legal_template_evidence%rowtype;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_document_type not in ('participation_terms','privacy','imprint','storage','accessibility') then
    raise exception 'AT_LEGAL_TEMPLATE_TYPE_INVALID' using errcode='22023';
  end if;
  select * into latest from public.legal_master_templates
    where document_type=input_document_type and language='de-AT'
    order by created_at desc,id desc limit 1;
  if latest.id is null then return jsonb_build_object('found',false); end if;
  select * into evidence from public.platform_at_legal_template_evidence
    where template_id=latest.id;
  return jsonb_build_object('found',true,'template_id',latest.id,
    'version',latest.version,'review_status',latest.review_status,'active',latest.active,
    'content_sha256',public.at_legal_template_content_hash_internal(
      latest.document_type,latest.version,latest.language,latest.title,
      latest.content_template,latest.rendered_text_template),
    'source_reference',evidence.source_reference,'source_origin',evidence.source_origin);
end;
$function$;
revoke all on function public.get_platform_at_legal_template_preflight(text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_at_legal_template_preflight(text)
  to authenticated;

create function public.protect_platform_at_legal_template_content()
returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $function$
begin
  if exists(select 1 from public.platform_at_legal_template_evidence
    where template_id=old.id) then
    if tg_op='DELETE' then raise exception 'AT_LEGAL_TEMPLATE_APPEND_ONLY' using errcode='42501'; end if;
    if (new.document_type,new.version,new.language,new.title,new.content_template,new.rendered_text_template)
      is distinct from
      (old.document_type,old.version,old.language,old.title,old.content_template,old.rendered_text_template) then
      raise exception 'AT_LEGAL_TEMPLATE_CONTENT_IMMUTABLE' using errcode='42501';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;
create trigger protect_platform_at_legal_template_content_row
  before update or delete on public.legal_master_templates
  for each row execute function public.protect_platform_at_legal_template_content();
revoke all on function public.protect_platform_at_legal_template_content()
  from public,anon,authenticated,service_role;

create function public.create_platform_at_legal_template_draft(
  input_document_type text,input_version text,input_title text,input_content jsonb,
  input_rendered_text text,input_source_reference text,input_source_origin text,
  input_expected_latest_id uuid,input_expected_latest_hash text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare prior public.platform_at_legal_admin_receipts%rowtype;
  latest public.legal_master_templates%rowtype; template_id_value uuid;
  current_hash text; new_hash text; expected jsonb; payload jsonb; result jsonb;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_request_id is null
    or input_document_type not in ('participation_terms','privacy','imprint','storage','accessibility')
    or coalesce(input_version,'') !~ '^[A-Za-z0-9_.-]{3,80}$'
    or nullif(trim(input_title),'') is null or length(input_title)>240
    or jsonb_typeof(input_content) is distinct from 'object'
    or nullif(trim(input_rendered_text),'') is null or length(input_rendered_text)>100000
    or coalesce(input_source_reference,'') !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
    or input_source_origin not in ('FOUNDER_DRAFT','COUNSEL_DRAFT') then
    raise exception 'AT_LEGAL_TEMPLATE_REQUEST_INVALID' using errcode='22023';
  end if;
  expected:=jsonb_build_object('latest_id',input_expected_latest_id,
    'latest_hash',input_expected_latest_hash);
  payload:=jsonb_build_object('type',input_document_type,'version',input_version,
    'title',input_title,'content',input_content,'rendered_text',input_rendered_text,
    'source_reference',input_source_reference,'source_origin',input_source_origin);
  perform pg_advisory_xact_lock(hashtextextended('at-legal-template:'||input_document_type,0));
  select * into prior from public.platform_at_legal_admin_receipts where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.actor_id is distinct from auth.uid() or prior.operation<>'TEMPLATE_DRAFT'
      or prior.expected_state is distinct from expected or prior.request_payload is distinct from payload then
      raise exception 'AT_LEGAL_ADMIN_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return prior.result;
  end if;
  lock table public.legal_master_templates in share row exclusive mode;
  select * into latest from public.legal_master_templates
    where document_type=input_document_type and language='de-AT'
    order by created_at desc,id desc limit 1 for update;
  if latest.id is not null then
    current_hash:=public.at_legal_template_content_hash_internal(latest.document_type,
      latest.version,latest.language,latest.title,latest.content_template,latest.rendered_text_template);
  end if;
  if latest.id is distinct from input_expected_latest_id
    or current_hash is distinct from input_expected_latest_hash then
    raise exception 'AT_LEGAL_TEMPLATE_EXPECTED_STATE_MISMATCH' using errcode='22023';
  end if;
  new_hash:=public.at_legal_template_content_hash_internal(input_document_type,input_version,
    'de-AT',input_title,input_content,input_rendered_text);
  insert into public.legal_master_templates(document_type,version,language,title,
    content_template,rendered_text_template,review_status,active)
  values(input_document_type,input_version,'de-AT',input_title,input_content,
    input_rendered_text,'DRAFT_LEGAL_REVIEW_REQUIRED',false)
  returning id into template_id_value;
  insert into public.platform_at_legal_template_evidence(template_id,source_reference,
    source_origin,content_sha256,created_by)
  values(template_id_value,input_source_reference,input_source_origin,new_hash,auth.uid());
  result:=jsonb_build_object('template_id',template_id_value,'content_sha256',new_hash,
    'review_status','DRAFT_LEGAL_REVIEW_REQUIRED','active',false,'source_reference',
    input_source_reference,'test_only',false);
  insert into public.platform_at_legal_admin_receipts(
    request_id,operation,actor_id,expected_state,request_payload,result)
  values(input_request_id,'TEMPLATE_DRAFT',auth.uid(),expected,payload,result);
  return result;
end;
$function$;
revoke all on function public.create_platform_at_legal_template_draft(
  text,text,text,jsonb,text,text,text,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.create_platform_at_legal_template_draft(
  text,text,text,jsonb,text,text,text,uuid,text,uuid) to authenticated;

create function public.review_platform_at_legal_template(
  input_template_id uuid,input_expected_hash text,input_expected_status text,
  input_external_approval_reference text,input_external_approval_confirmed boolean,
  input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare prior public.platform_at_legal_admin_receipts%rowtype;
  template public.legal_master_templates%rowtype;
  evidence public.platform_at_legal_template_evidence%rowtype;
  expected jsonb; payload jsonb; result jsonb; hash_value text;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_template_id is null or input_request_id is null
    or input_expected_hash !~ '^[0-9a-f]{64}$'
    or input_expected_status is distinct from 'DRAFT_LEGAL_REVIEW_REQUIRED'
    or coalesce(input_external_approval_reference,'') !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
    or input_external_approval_confirmed is distinct from true then
    raise exception 'AT_LEGAL_TEMPLATE_REVIEW_REQUEST_INVALID' using errcode='22023';
  end if;
  expected:=jsonb_build_object('template_id',input_template_id,
    'hash',input_expected_hash,'status',input_expected_status);
  payload:=jsonb_build_object('approval_reference',input_external_approval_reference,
    'confirmed',input_external_approval_confirmed);
  perform pg_advisory_xact_lock(hashtextextended('at-legal-template-review:'||input_template_id::text,0));
  select * into prior from public.platform_at_legal_admin_receipts where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.actor_id is distinct from auth.uid() or prior.operation<>'TEMPLATE_REVIEW'
      or prior.expected_state is distinct from expected or prior.request_payload is distinct from payload then
      raise exception 'AT_LEGAL_ADMIN_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return prior.result;
  end if;
  select * into template from public.legal_master_templates where id=input_template_id for update;
  select * into evidence from public.platform_at_legal_template_evidence
    where template_id=input_template_id for share;
  if template.id is null or evidence.template_id is null
    or template.language<>'de-AT' or template.review_status is distinct from input_expected_status
    or template.active
    or evidence.content_sha256 is distinct from input_expected_hash then
    raise exception 'AT_LEGAL_TEMPLATE_REVIEW_STATE_MISMATCH' using errcode='22023';
  end if;
  hash_value:=public.at_legal_template_content_hash_internal(template.document_type,
    template.version,template.language,template.title,template.content_template,template.rendered_text_template);
  if hash_value is distinct from input_expected_hash then
    raise exception 'AT_LEGAL_TEMPLATE_CONTENT_MISMATCH' using errcode='42501';
  end if;
  update public.legal_master_templates set review_status='REVIEWED',active=true
    where id=input_template_id;
  result:=jsonb_build_object('template_id',input_template_id,'content_sha256',hash_value,
    'review_status','REVIEWED','active',true,'approval_reference',input_external_approval_reference,
    'test_only',false);
  insert into public.platform_at_legal_template_review_events(template_id,request_id,
    expected_hash,external_approval_reference,actor_id)
  values(input_template_id,input_request_id,input_expected_hash,
    input_external_approval_reference,auth.uid());
  insert into public.platform_at_legal_admin_receipts(
    request_id,operation,actor_id,expected_state,request_payload,result)
  values(input_request_id,'TEMPLATE_REVIEW',auth.uid(),expected,payload,result);
  return result;
end;
$function$;
revoke all on function public.review_platform_at_legal_template(uuid,text,text,text,boolean,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.review_platform_at_legal_template(uuid,text,text,text,boolean,uuid)
  to authenticated;

create function public.get_platform_at_legal_policy_artifact_preflight(input_area text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare artifact public.platform_at_legal_policy_artifact_versions%rowtype;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_area not in ('document_catalog','retention') then
    raise exception 'AT_LEGAL_POLICY_ARTIFACT_AREA_INVALID' using errcode='22023';
  end if;
  select * into artifact from public.platform_at_legal_policy_artifact_versions
    where area=input_area order by created_at desc,id desc limit 1;
  if artifact.id is null then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'artifact_id',artifact.id,'area',artifact.area,
    'version',artifact.version,'content_sha256',artifact.content_sha256,
    'source_reference',artifact.source_reference,'review_status',artifact.review_status,
    'active',artifact.active);
end;
$function$;
revoke all on function public.get_platform_at_legal_policy_artifact_preflight(text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_at_legal_policy_artifact_preflight(text)
  to authenticated;

create function public.create_platform_at_legal_policy_artifact_draft(
  input_area text,input_version text,input_content jsonb,input_rendered_text text,
  input_source_reference text,input_source_origin text,input_expected_latest_id uuid,
  input_expected_latest_hash text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare prior public.platform_at_legal_admin_receipts%rowtype;
  latest public.platform_at_legal_policy_artifact_versions%rowtype;
  artifact_id_value uuid; hash_value text; expected jsonb; payload jsonb; result jsonb;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_request_id is null or input_area not in ('document_catalog','retention')
    or coalesce(input_version,'') !~ '^[A-Za-z0-9_.-]{3,80}$'
    or jsonb_typeof(input_content)<>'object'
    or nullif(trim(input_rendered_text),'') is null or length(input_rendered_text)>100000
    or coalesce(input_source_reference,'') !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
    or input_source_origin not in ('FOUNDER_DRAFT','COUNSEL_DRAFT') then
    raise exception 'AT_LEGAL_POLICY_ARTIFACT_REQUEST_INVALID' using errcode='22023';
  end if;
  expected:=jsonb_build_object('latest_id',input_expected_latest_id,
    'latest_hash',input_expected_latest_hash);
  payload:=jsonb_build_object('area',input_area,'version',input_version,
    'content',input_content,'rendered_text',input_rendered_text,
    'source_reference',input_source_reference,'source_origin',input_source_origin);
  perform pg_advisory_xact_lock(hashtextextended('at-legal-policy-artifact:'||input_area,0));
  select * into prior from public.platform_at_legal_admin_receipts where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.actor_id is distinct from auth.uid() or prior.operation<>'POLICY_ARTIFACT_DRAFT'
      or prior.expected_state is distinct from expected or prior.request_payload is distinct from payload then
      raise exception 'AT_LEGAL_ADMIN_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return prior.result;
  end if;
  select * into latest from public.platform_at_legal_policy_artifact_versions
    where area=input_area order by created_at desc,id desc limit 1 for update;
  if latest.id is distinct from input_expected_latest_id
    or latest.content_sha256 is distinct from input_expected_latest_hash then
    raise exception 'AT_LEGAL_POLICY_ARTIFACT_EXPECTED_STATE_MISMATCH' using errcode='22023';
  end if;
  hash_value:=public.at_legal_policy_artifact_hash_internal(input_area,
    input_version,input_content,input_rendered_text);
  insert into public.platform_at_legal_policy_artifact_versions(
    area,version,content,rendered_text,content_sha256,
    source_reference,source_origin,created_by)
  values(input_area,input_version,input_content,input_rendered_text,hash_value,
    input_source_reference,input_source_origin,auth.uid())
  returning id into artifact_id_value;
  result:=jsonb_build_object('artifact_id',artifact_id_value,'area',input_area,
    'version',input_version,'content_sha256',hash_value,
    'review_status','DRAFT_LEGAL_REVIEW_REQUIRED','active',false);
  insert into public.platform_at_legal_admin_receipts(
    request_id,operation,actor_id,expected_state,request_payload,result)
  values(input_request_id,'POLICY_ARTIFACT_DRAFT',auth.uid(),expected,payload,result);
  return result;
end;
$function$;
revoke all on function public.create_platform_at_legal_policy_artifact_draft(
  text,text,jsonb,text,text,text,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.create_platform_at_legal_policy_artifact_draft(
  text,text,jsonb,text,text,text,uuid,text,uuid) to authenticated;

create function public.review_platform_at_legal_policy_artifact(
  input_artifact_id uuid,input_expected_hash text,input_expected_status text,
  input_external_approval_reference text,input_external_approval_confirmed boolean,
  input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare prior public.platform_at_legal_admin_receipts%rowtype;
  artifact public.platform_at_legal_policy_artifact_versions%rowtype;
  expected jsonb; payload jsonb; result jsonb; hash_value text;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_artifact_id is null or input_request_id is null
    or input_expected_hash !~ '^[0-9a-f]{64}$'
    or input_expected_status is distinct from 'DRAFT_LEGAL_REVIEW_REQUIRED'
    or coalesce(input_external_approval_reference,'') !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
    or input_external_approval_confirmed is distinct from true then
    raise exception 'AT_LEGAL_POLICY_ARTIFACT_REVIEW_INVALID' using errcode='22023';
  end if;
  expected:=jsonb_build_object('artifact_id',input_artifact_id,
    'hash',input_expected_hash,'status',input_expected_status);
  payload:=jsonb_build_object('approval_reference',input_external_approval_reference,
    'confirmed',input_external_approval_confirmed);
  perform pg_advisory_xact_lock(hashtextextended('at-legal-policy-artifact-review:'||input_artifact_id::text,0));
  select * into prior from public.platform_at_legal_admin_receipts where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.actor_id is distinct from auth.uid() or prior.operation<>'POLICY_ARTIFACT_REVIEW'
      or prior.expected_state is distinct from expected or prior.request_payload is distinct from payload then
      raise exception 'AT_LEGAL_ADMIN_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return prior.result;
  end if;
  select * into artifact from public.platform_at_legal_policy_artifact_versions
    where id=input_artifact_id for update;
  if artifact.id is null or artifact.review_status is distinct from input_expected_status
    or artifact.active or artifact.content_sha256 is distinct from input_expected_hash then
    raise exception 'AT_LEGAL_POLICY_ARTIFACT_REVIEW_STATE_MISMATCH' using errcode='22023';
  end if;
  hash_value:=public.at_legal_policy_artifact_hash_internal(artifact.area,
    artifact.version,artifact.content,artifact.rendered_text);
  if hash_value is distinct from artifact.content_sha256 then
    raise exception 'AT_LEGAL_POLICY_ARTIFACT_HASH_MISMATCH' using errcode='42501';
  end if;
  update public.platform_at_legal_policy_artifact_versions
    set review_status='REVIEWED',active=true where id=input_artifact_id;
  result:=jsonb_build_object('artifact_id',input_artifact_id,'area',artifact.area,
    'version',artifact.version,'content_sha256',hash_value,
    'review_status','REVIEWED','active',true,
    'approval_reference',input_external_approval_reference);
  insert into public.platform_at_legal_policy_artifact_review_events(
    artifact_id,request_id,expected_hash,external_approval_reference,actor_id)
  values(input_artifact_id,input_request_id,input_expected_hash,
    input_external_approval_reference,auth.uid());
  insert into public.platform_at_legal_admin_receipts(
    request_id,operation,actor_id,expected_state,request_payload,result)
  values(input_request_id,'POLICY_ARTIFACT_REVIEW',auth.uid(),expected,payload,result);
  return result;
end;
$function$;
revoke all on function public.review_platform_at_legal_policy_artifact(uuid,text,text,text,boolean,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.review_platform_at_legal_policy_artifact(uuid,text,text,text,boolean,uuid)
  to authenticated;

create function public.get_platform_at_legal_policy_preflight()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare policy public.country_kyb_intake_policies%rowtype;
  revision_id_value bigint; evidence public.platform_at_legal_policy_evidence%rowtype;
begin
  perform public.require_legal_bundle_admin_internal();
  select * into policy from public.country_kyb_intake_policies where country_code='AT';
  if policy.country_code is null then
    return jsonb_build_object('found',false,'blocking_reason','AT_POLICY_MISSING');
  end if;
  select revision_id into revision_id_value from public.legal_bundle_policy_revisions
    where country_code='AT' and policy_state=to_jsonb(policy)
    order by revision_id desc limit 1;
  select * into evidence from public.platform_at_legal_policy_evidence
    where revision_id=revision_id_value;
  return jsonb_build_object('found',true,'revision_id',revision_id_value,
    'policy_state',to_jsonb(policy),'area_evidence_sha256',evidence.area_evidence_sha256,
    'external_approval_reference',evidence.external_approval_reference);
end;
$function$;
revoke all on function public.get_platform_at_legal_policy_preflight()
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_at_legal_policy_preflight()
  to authenticated;

create function public.set_platform_at_legal_policy_revision(
  input_expected_revision_id bigint,input_expected_policy_state jsonb,
  input_next_statuses jsonb,input_area_versions jsonb,input_change_ref text,
  input_external_approval_reference text,input_external_approval_confirmed boolean,
  input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare prior public.platform_at_legal_admin_receipts%rowtype;
  policy public.country_kyb_intake_policies%rowtype; area_name text; area_item jsonb;
  revision_id_value bigint; area_hash text; expected jsonb; payload jsonb; result jsonb;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_request_id is null or input_expected_revision_id is null
    or jsonb_typeof(input_expected_policy_state)<>'object'
    or jsonb_typeof(input_next_statuses)<>'object'
    or jsonb_typeof(input_area_versions)<>'object'
    or coalesce(input_change_ref,'') !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
    or coalesce(input_external_approval_reference,'') !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
    or input_external_approval_confirmed is distinct from true then
    raise exception 'AT_LEGAL_POLICY_REQUEST_INVALID' using errcode='22023';
  end if;
  -- Prevent a concurrent review, withdrawal or newer version from changing
  -- any of the exact sources between validation and the committed revision.
  lock table public.legal_master_templates in share mode;
  lock table public.platform_at_legal_policy_artifact_versions in share mode;
  foreach area_name in array array['legal','privacy','document_catalog','retention'] loop
    area_item:=input_area_versions->area_name;
    if coalesce(input_next_statuses->>area_name,'') not in
      ('PENDING_CONFIGURATION','VERIFIED','BLOCKED')
      or jsonb_typeof(area_item)<>'object'
      or coalesce(area_item->>'version','') !~ '^[A-Za-z0-9_.-]{3,80}$'
      or coalesce(area_item->>'sha256','') !~ '^[0-9a-f]{64}$'
      or coalesce(area_item->>'source_reference','') !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$' then
      raise exception 'AT_LEGAL_POLICY_AREA_INVALID_%',upper(area_name) using errcode='22023';
    end if;
    if input_next_statuses->>area_name='VERIFIED' then
      if area_name in ('legal','privacy') and not exists(
        select 1 from public.legal_master_templates template
        join public.platform_at_legal_template_evidence evidence on evidence.template_id=template.id
        where template.document_type=case area_name when 'legal' then 'participation_terms' else 'privacy' end
          and template.language='de-AT' and template.version=area_item->>'version'
          and template.review_status='REVIEWED' and template.active
          and evidence.content_sha256=area_item->>'sha256'
          and evidence.source_reference=area_item->>'source_reference'
          and not exists(select 1 from public.legal_master_templates newer
            where newer.document_type=template.document_type and newer.language='de-AT'
              and newer.review_status='REVIEWED' and newer.active
              and (newer.created_at,newer.id)>(template.created_at,template.id))
      ) then
        raise exception 'AT_LEGAL_POLICY_REVIEWED_SOURCE_REQUIRED_%',upper(area_name) using errcode='42501';
      end if;
      if area_name in ('document_catalog','retention') and not exists(
        select 1 from public.platform_at_legal_policy_artifact_versions artifact
        where artifact.area=area_name and artifact.version=area_item->>'version'
          and artifact.review_status='REVIEWED' and artifact.active
          and artifact.content_sha256=area_item->>'sha256'
          and artifact.source_reference=area_item->>'source_reference'
          and not exists(select 1 from public.platform_at_legal_policy_artifact_versions newer
            where newer.area=artifact.area and newer.review_status='REVIEWED' and newer.active
              and (newer.created_at,newer.id)>(artifact.created_at,artifact.id))
      ) then
        raise exception 'AT_LEGAL_POLICY_REVIEWED_SOURCE_REQUIRED_%',upper(area_name) using errcode='42501';
      end if;
    end if;
  end loop;
  if (select count(*) from jsonb_object_keys(input_next_statuses))<>4
    or (select count(*) from jsonb_object_keys(input_area_versions))<>4 then
    raise exception 'AT_LEGAL_POLICY_AREAS_INVALID' using errcode='22023';
  end if;
  expected:=jsonb_build_object('revision_id',input_expected_revision_id,
    'policy_state',input_expected_policy_state);
  payload:=jsonb_build_object('next_statuses',input_next_statuses,
    'area_versions',input_area_versions,'change_ref',input_change_ref,
    'external_approval_reference',input_external_approval_reference,
    'confirmed',input_external_approval_confirmed);
  perform pg_advisory_xact_lock(hashtextextended('at-legal-policy:AT',0));
  select * into prior from public.platform_at_legal_admin_receipts where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.actor_id is distinct from auth.uid() or prior.operation<>'POLICY_REVISION'
      or prior.expected_state is distinct from expected or prior.request_payload is distinct from payload then
      raise exception 'AT_LEGAL_ADMIN_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return prior.result;
  end if;
  select * into policy from public.country_kyb_intake_policies
    where country_code='AT' for update;
  if policy.country_code is null or policy.real_intake_status is distinct from 'BLOCKED'
    or to_jsonb(policy) is distinct from input_expected_policy_state then
    raise exception 'AT_LEGAL_POLICY_EXPECTED_STATE_MISMATCH' using errcode='22023';
  end if;
  if (select revision_id from public.legal_bundle_policy_revisions
    where country_code='AT' and policy_state=to_jsonb(policy)
    order by revision_id desc limit 1) is distinct from input_expected_revision_id then
    raise exception 'AT_LEGAL_POLICY_REVISION_MISMATCH' using errcode='22023';
  end if;
  update public.country_kyb_intake_policies set
    legal_status=input_next_statuses->>'legal',
    privacy_status=input_next_statuses->>'privacy',
    document_catalog_status=input_next_statuses->>'document_catalog',
    retention_status=input_next_statuses->>'retention',
    change_ref=input_change_ref,updated_at=clock_timestamp()
  where country_code='AT';
  select revision_id into revision_id_value from public.legal_bundle_policy_revisions
    where country_code='AT' order by revision_id desc limit 1;
  area_hash:=encode(extensions.digest(convert_to('WUXUAI_AT_POLICY_EVIDENCE_V1'
    ||public.legal_bundle_canonical_value_v1(input_area_versions),'UTF8'),'sha256'),'hex');
  result:=jsonb_build_object('revision_id',revision_id_value,
    'area_evidence_sha256',area_hash,'real_intake_status','BLOCKED',
    'statuses',input_next_statuses,'change_ref',input_change_ref);
  insert into public.platform_at_legal_policy_evidence(
    revision_id,request_id,area_versions,area_evidence_sha256,
    external_approval_reference,actor_id)
  values(revision_id_value,input_request_id,input_area_versions,area_hash,
    input_external_approval_reference,auth.uid());
  insert into public.platform_at_legal_admin_receipts(
    request_id,operation,actor_id,expected_state,request_payload,result)
  values(input_request_id,'POLICY_REVISION',auth.uid(),expected,payload,result);
  return result;
end;
$function$;
revoke all on function public.set_platform_at_legal_policy_revision(bigint,jsonb,jsonb,jsonb,text,text,boolean,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.set_platform_at_legal_policy_revision(bigint,jsonb,jsonb,jsonb,text,text,boolean,uuid)
  to authenticated;

create function public.get_platform_at_legal_admin_receipt(input_request_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare receipt public.platform_at_legal_admin_receipts%rowtype;
begin
  perform public.require_legal_bundle_admin_internal();
  select * into receipt from public.platform_at_legal_admin_receipts
    where request_id=input_request_id and actor_id=auth.uid();
  if receipt.request_id is null then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'operation',receipt.operation,
    'committed_at',receipt.committed_at,'result',receipt.result);
end;
$function$;
revoke all on function public.get_platform_at_legal_admin_receipt(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_at_legal_admin_receipt(uuid)
  to authenticated;

notify pgrst,'reload schema';
commit;
