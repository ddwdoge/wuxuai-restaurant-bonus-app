-- Platform-account terms are separate from restaurant legal bundles.
-- Counsel-review drafts in migration 196 are never acceptance-eligible.
-- The only positive publication in this migration is STAGING/TEST_ONLY.
begin;

create table public.platform_terms_test_identities (
  auth_user_id uuid primary key references auth.users(id) on delete restrict,
  restaurant_id uuid not null,
  branch_id uuid not null,
  test_session_id text not null,
  marked_by uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  marked_at timestamptz not null default clock_timestamp()
);
alter table public.platform_terms_test_identities enable row level security;
revoke all on public.platform_terms_test_identities from public, anon, authenticated, service_role;
create trigger platform_terms_test_identities_immutable
  before update or delete or truncate on public.platform_terms_test_identities
  for each statement execute function public.protect_legal_bundle_append_only();

create table public.platform_terms_test_publications (
  id uuid primary key default extensions.gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  restaurant_id uuid not null,
  request_id uuid not null unique,
  action text not null check (action in ('PUBLISH_TEST','WITHDRAW_TEST')),
  expected_previous_id uuid,
  version text not null check (version ~ '^TEST_ONLY_[A-Z0-9_-]{3,80}$'),
  language text not null default 'de-AT' check (language='de-AT'),
  provider_snapshot text not null check (provider_snapshot like 'TEST ONLY:%'),
  body_markdown text not null check (body_markdown like 'TEST ONLY:%' and length(body_markdown)<=20000),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  test_session_id text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  check (content_sha256=encode(extensions.digest(convert_to(body_markdown,'UTF8'),'sha256'),'hex'))
);
create index platform_terms_test_publications_latest_idx
  on public.platform_terms_test_publications(restaurant_id,event_sequence desc);
alter table public.platform_terms_test_publications enable row level security;
revoke all on public.platform_terms_test_publications from public, anon, authenticated, service_role;
revoke all on sequence public.platform_terms_test_publications_event_sequence_seq
  from public, anon, authenticated, service_role;
create trigger platform_terms_test_publications_immutable
  before update or delete or truncate on public.platform_terms_test_publications
  for each statement execute function public.protect_legal_bundle_append_only();

-- The receipt is keyed to the one Auth identity, before or after account
-- profile creation. No restaurant customer row is used as identity authority.
create table public.platform_customer_terms_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null unique,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  real_document_id uuid references public.platform_legal_document_versions(id) on delete restrict,
  test_document_id uuid references public.platform_terms_test_publications(id) on delete restrict,
  document_version text not null,
  document_sha256 text not null check(document_sha256 ~ '^[0-9a-f]{64}$'),
  language text not null,
  provider_snapshot text not null,
  acceptance_source text not null check(acceptance_source in ('customer_registration','existing_account','test_only')),
  accepted_at timestamptz not null default clock_timestamp(),
  test_restaurant_id uuid,
  test_session_id text,
  check ((real_document_id is not null) <> (test_document_id is not null)),
  check ((test_document_id is null and test_restaurant_id is null and test_session_id is null)
      or (test_document_id is not null and test_restaurant_id is not null and test_session_id is not null))
);
create index platform_customer_terms_receipts_actor_idx
  on public.platform_customer_terms_receipts(auth_user_id,accepted_at desc);
alter table public.platform_customer_terms_receipts enable row level security;
revoke all on public.platform_customer_terms_receipts from public, anon, authenticated, service_role;
create trigger platform_customer_terms_receipts_immutable
  before update or delete or truncate on public.platform_customer_terms_receipts
  for each statement execute function public.protect_legal_bundle_append_only();

create function public.bind_platform_terms_test_identity(
  input_restaurant_id uuid,input_auth_user_id uuid,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare marker public.platform_test_tenant_registry%rowtype;
  previous public.platform_terms_test_identities%rowtype;
  branch_id_value uuid;
begin
  perform public.require_at_legal_synthetic_scope_internal(input_restaurant_id);
  if input_auth_user_id is null or input_request_id is null then
    raise exception 'PLATFORM_TERMS_TEST_IDENTITY_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-test-identity:'||input_auth_user_id::text,0));
  select * into marker from public.platform_test_tenant_registry
    where restaurant_id=input_restaurant_id and deleted_at is null for share;
  select r.primary_branch_id into branch_id_value from public.restaurants r
    join public.branches b on b.id=r.primary_branch_id and b.restaurant_id=r.id
      and b.organization_id=r.organization_id and b.country='AT'
    where r.id=input_restaurant_id for share of r,b;
  if branch_id_value is null then
    raise exception 'PLATFORM_TERMS_TEST_BRANCH_INVALID' using errcode='42501';
  end if;
  select * into previous from public.platform_terms_test_identities where auth_user_id=input_auth_user_id;
  if previous.auth_user_id is not null then
    if previous.restaurant_id is distinct from input_restaurant_id
      or previous.branch_id is distinct from branch_id_value
      or previous.test_session_id is distinct from marker.test_session_id
      or previous.request_id is distinct from input_request_id then
      raise exception 'PLATFORM_TERMS_TEST_IDENTITY_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('auth_user_id',input_auth_user_id,'restaurant_id',input_restaurant_id,
      'branch_id',branch_id_value,
      'test_session_id',marker.test_session_id,'idempotent',true);
  end if;
  if not exists(select 1 from auth.users u where u.id=input_auth_user_id and u.email_confirmed_at is not null)
    or exists(select 1 from public.platform_admins where user_id=input_auth_user_id)
    or exists(select 1 from public.restaurant_members where user_id=input_auth_user_id)
    or exists(select 1 from public.customer_accounts where auth_user_id=input_auth_user_id)
    or exists(select 1 from public.platform_terms_test_identities where auth_user_id=input_auth_user_id
      and restaurant_id<>input_restaurant_id) then
    raise exception 'PLATFORM_TERMS_TEST_IDENTITY_NOT_ISOLATED' using errcode='42501';
  end if;
  insert into public.platform_terms_test_identities(auth_user_id,restaurant_id,branch_id,test_session_id,marked_by,request_id)
    values(input_auth_user_id,input_restaurant_id,branch_id_value,marker.test_session_id,auth.uid(),input_request_id);
  return jsonb_build_object('auth_user_id',input_auth_user_id,'restaurant_id',input_restaurant_id,
    'branch_id',branch_id_value,
    'test_session_id',marker.test_session_id,'idempotent',false);
end;
$function$;
revoke all on function public.bind_platform_terms_test_identity(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.bind_platform_terms_test_identity(uuid,uuid,uuid) to authenticated;

create function public.set_platform_terms_test_publication(
  input_restaurant_id uuid,input_action text,input_version text,input_body text,
  input_provider_snapshot text,input_expected_previous_id uuid,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare marker public.platform_test_tenant_registry%rowtype;
  previous public.platform_terms_test_publications%rowtype;
  event_row public.platform_terms_test_publications%rowtype;
begin
  perform public.require_at_legal_synthetic_scope_internal(input_restaurant_id);
  if input_request_id is null or input_action not in ('PUBLISH_TEST','WITHDRAW_TEST')
    or coalesce(input_version,'') !~ '^TEST_ONLY_[A-Z0-9_-]{3,80}$'
    or input_body not like 'TEST ONLY:%' or length(input_body)>20000
    or input_provider_snapshot not like 'TEST ONLY:%' then
    raise exception 'PLATFORM_TERMS_TEST_PUBLICATION_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-test-publication:'||input_restaurant_id::text,0));
  select * into marker from public.platform_test_tenant_registry
    where restaurant_id=input_restaurant_id and deleted_at is null for share;
  select * into event_row from public.platform_terms_test_publications where request_id=input_request_id;
  if event_row.id is not null then
    if event_row.restaurant_id is distinct from input_restaurant_id or event_row.action is distinct from input_action
      or event_row.version is distinct from input_version or event_row.body_markdown is distinct from input_body
      or event_row.provider_snapshot is distinct from input_provider_snapshot
      or event_row.expected_previous_id is distinct from input_expected_previous_id then
      raise exception 'PLATFORM_TERMS_TEST_PUBLICATION_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('id',event_row.id,'action',event_row.action,'sha256',event_row.content_sha256,
      'idempotent',true);
  end if;
  select * into previous from public.platform_terms_test_publications
    where restaurant_id=input_restaurant_id order by event_sequence desc limit 1;
  if previous.id is distinct from input_expected_previous_id then
    raise exception 'PLATFORM_TERMS_TEST_PUBLICATION_STALE' using errcode='40001';
  end if;
  insert into public.platform_terms_test_publications(
    restaurant_id,request_id,action,expected_previous_id,version,body_markdown,
    provider_snapshot,content_sha256,test_session_id,actor_id)
  values(input_restaurant_id,input_request_id,input_action,input_expected_previous_id,
    input_version,input_body,input_provider_snapshot,
    encode(extensions.digest(convert_to(input_body,'UTF8'),'sha256'),'hex'),
    marker.test_session_id,auth.uid()) returning * into event_row;
  return jsonb_build_object('id',event_row.id,'action',event_row.action,'sha256',event_row.content_sha256,
    'version',event_row.version,'actor_id',event_row.actor_id,'test_session_id',event_row.test_session_id,
    'idempotent',false);
end;
$function$;
revoke all on function public.set_platform_terms_test_publication(uuid,text,text,text,text,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.set_platform_terms_test_publication(uuid,text,text,text,text,uuid,uuid)
  to authenticated;

-- Never expose a DRAFT document as an active choice. The real publication
-- arm intentionally returns nothing until a separately approved contract
-- introduces an audited real publication workflow.
create function public.current_platform_terms_document_internal(input_auth_user_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare binding public.platform_terms_test_identities%rowtype;
  event_row public.platform_terms_test_publications%rowtype;
begin
  select * into binding from public.platform_terms_test_identities
    where auth_user_id=input_auth_user_id;
  if binding.auth_user_id is null then return null; end if;
  if not exists(select 1 from public.platform_test_tenant_registry m
    join public.restaurants r on r.id=m.restaurant_id
    join public.business_verification_environment e on e.singleton
    join public.country_kyb_intake_policies p on p.country_code='AT'
    where m.restaurant_id=binding.restaurant_id and m.deleted_at is null
      and m.test_session_id=binding.test_session_id and e.environment='STAGING'
      and p.real_intake_status='BLOCKED' and p.test_only_intake_status='READY'
      and public.restaurant_activation_state_internal(r.id)->>'status'='PENDING_ACTIVATION'
      and r.primary_branch_id=binding.branch_id
      and exists(select 1 from public.branches b where b.id=binding.branch_id
        and b.restaurant_id=r.id and b.organization_id=r.organization_id and b.country='AT'))
    or exists(select 1 from public.customer_account_memberships membership
      join public.customer_accounts account on account.id=membership.account_id
      where account.auth_user_id=input_auth_user_id
        and membership.restaurant_id<>binding.restaurant_id) then
    return null;
  end if;
  select * into event_row from public.platform_terms_test_publications
    where restaurant_id=binding.restaurant_id order by event_sequence desc limit 1;
  if event_row.id is null or event_row.action<>'PUBLISH_TEST'
    or event_row.test_session_id is distinct from binding.test_session_id then return null; end if;
  return jsonb_build_object('document_id',event_row.id,'version',event_row.version,
    'sha256',event_row.content_sha256,'language',event_row.language,
    'provider_snapshot',event_row.provider_snapshot,'body_markdown',event_row.body_markdown,
    'test_only',true,'restaurant_id',binding.restaurant_id,'test_session_id',binding.test_session_id);
end;
$function$;
revoke all on function public.current_platform_terms_document_internal(uuid)
  from public,anon,authenticated,service_role;

create function public.get_platform_customer_terms_status()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare doc jsonb; receipt public.platform_customer_terms_receipts%rowtype;
  has_account boolean;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end if;
  select exists(select 1 from public.customer_accounts a
    where a.auth_user_id=auth.uid() and a.disabled_at is null) into has_account;
  doc:=public.current_platform_terms_document_internal(auth.uid());
  if doc is null then
    return jsonb_build_object('status','UNAVAILABLE','account_exists',has_account,
      'next_step','WAIT_FOR_APPROVED_TERMS');
  end if;
  select * into receipt from public.platform_customer_terms_receipts r
    where r.auth_user_id=auth.uid() and r.test_document_id=(doc->>'document_id')::uuid
      and r.document_sha256=doc->>'sha256' order by r.accepted_at desc,r.id desc limit 1;
  return jsonb_build_object('status',case when receipt.id is null then 'ACCEPTANCE_REQUIRED' else 'ACCEPTED' end,
    'account_exists',has_account,'next_step',case when receipt.id is null then 'ACCEPT_CURRENT_TERMS' else 'CONTINUE' end,
    'document',doc,'receipt',case when receipt.id is null then null else
      jsonb_build_object('id',receipt.id,'request_id',receipt.request_id,
        'document_id',receipt.test_document_id,'version',receipt.document_version,
        'sha256',receipt.document_sha256,'language',receipt.language,
        'provider_snapshot',receipt.provider_snapshot,'accepted_at',receipt.accepted_at,
        'source',receipt.acceptance_source,'test_session_id',receipt.test_session_id) end);
end;
$function$;
revoke all on function public.get_platform_customer_terms_status()
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_customer_terms_status() to authenticated;

create function public.accept_platform_customer_terms(
  input_document_id uuid,input_sha256 text,input_language text,input_source text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare doc jsonb; prior public.platform_customer_terms_receipts%rowtype;
  result_row public.platform_customer_terms_receipts%rowtype;
  bound_restaurant_id uuid;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null) then
    raise exception 'CUSTOMER_EMAIL_CONFIRMATION_REQUIRED' using errcode='42501';
  end if;
  if input_request_id is null or input_document_id is null
    or input_source not in ('customer_registration','existing_account','test_only') then
    raise exception 'PLATFORM_TERMS_ACCEPTANCE_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-acceptance:'||auth.uid()::text,0));
  select * into prior from public.platform_customer_terms_receipts where request_id=input_request_id;
  if prior.id is not null then
    if prior.auth_user_id is distinct from auth.uid() or prior.test_document_id is distinct from input_document_id
      or prior.document_sha256 is distinct from input_sha256 or prior.language is distinct from input_language
      or prior.acceptance_source is distinct from input_source then
      raise exception 'PLATFORM_TERMS_RECEIPT_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('id',prior.id,'request_id',prior.request_id,'document_id',prior.test_document_id,
      'version',prior.document_version,'sha256',prior.document_sha256,'accepted_at',prior.accepted_at,
      'idempotent',true);
  end if;
  select restaurant_id into bound_restaurant_id from public.platform_terms_test_identities
    where auth_user_id=auth.uid();
  if bound_restaurant_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'platform-terms-test-publication:'||bound_restaurant_id::text,0));
  end if;
  doc:=public.current_platform_terms_document_internal(auth.uid());
  if doc is null or (doc->>'document_id')::uuid is distinct from input_document_id
    or doc->>'sha256' is distinct from input_sha256 or doc->>'language' is distinct from input_language then
    raise exception 'PLATFORM_TERMS_DOCUMENT_STALE_OR_UNAVAILABLE' using errcode='42501';
  end if;
  perform 1 from public.platform_terms_test_publications where id=input_document_id for share;
  insert into public.platform_customer_terms_receipts(
    request_id,auth_user_id,test_document_id,document_version,document_sha256,language,
    provider_snapshot,acceptance_source,test_restaurant_id,test_session_id)
  values(input_request_id,auth.uid(),input_document_id,doc->>'version',doc->>'sha256',
    doc->>'language',doc->>'provider_snapshot',input_source,
    (doc->>'restaurant_id')::uuid,doc->>'test_session_id') returning * into result_row;
  return jsonb_build_object('id',result_row.id,'request_id',result_row.request_id,
    'document_id',result_row.test_document_id,'version',result_row.document_version,
    'sha256',result_row.document_sha256,'language',result_row.language,
    'provider_snapshot',result_row.provider_snapshot,'accepted_at',result_row.accepted_at,
    'source',result_row.acceptance_source,'test_session_id',result_row.test_session_id,
    'idempotent',false);
end;
$function$;
revoke all on function public.accept_platform_customer_terms(uuid,text,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.accept_platform_customer_terms(uuid,text,text,text,uuid) to authenticated;

create function public.require_current_platform_customer_terms_internal()
returns void language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare status_value jsonb;
begin
  status_value:=public.get_platform_customer_terms_status();
  if status_value->>'status' is distinct from 'ACCEPTED' then
    raise exception 'PLATFORM_TERMS_ACCEPTANCE_REQUIRED' using errcode='42501';
  end if;
end;
$function$;
revoke all on function public.require_current_platform_customer_terms_internal()
  from public,anon,authenticated,service_role;

-- Existing customer read paths are intentionally left unchanged. Join and
-- new-account gates are introduced only at their specific entrypoints.

-- Request-scoped readback resolves an ambiguous transport outcome even if a
-- newer test version was published after the original acceptance.
create function public.get_platform_customer_terms_receipt(input_request_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare receipt public.platform_customer_terms_receipts%rowtype;
begin
  if auth.uid() is null or input_request_id is null then
    raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end if;
  select * into receipt from public.platform_customer_terms_receipts
    where request_id=input_request_id and auth_user_id=auth.uid();
  if receipt.id is null then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'id',receipt.id,'request_id',receipt.request_id,
    'document_id',coalesce(receipt.real_document_id,receipt.test_document_id),
    'version',receipt.document_version,'sha256',receipt.document_sha256,
    'language',receipt.language,'provider_snapshot',receipt.provider_snapshot,
    'accepted_at',receipt.accepted_at,'source',receipt.acceptance_source,
    'test_session_id',receipt.test_session_id);
end;
$function$;
revoke all on function public.get_platform_customer_terms_receipt(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_customer_terms_receipt(uuid) to authenticated;
commit;
