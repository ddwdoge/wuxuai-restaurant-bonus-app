-- AT Legal follow-up. No real policy change and no legal publication.
begin;

-- A public, read-only identity for the exact documents already shown by the
-- Legal Center. An absent identity means no customer consent may be taken.
create function public.get_public_at_legal_bundle_identity(input_restaurant_slug text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid; snapshot public.legal_bundle_snapshots%rowtype;
begin
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  if restaurant_id_value is null
    or not public.restaurant_legal_bundle_is_current(restaurant_id_value,current_date) then
    return null;
  end if;
  select s.* into snapshot from public.legal_bundle_snapshots s
  join public.legal_documents terms on terms.restaurant_id=s.restaurant_id
    and terms.document_type='participation_terms'
    and terms.current_published_version_id=s.terms_version_id
  join public.legal_documents privacy on privacy.restaurant_id=s.restaurant_id
    and privacy.document_type='privacy'
    and privacy.current_published_version_id=s.privacy_version_id
  where s.restaurant_id=restaurant_id_value and s.country='AT' and s.locale='de-AT'
    and public.legal_bundle_effective_status_internal(s.bundle_id)='PUBLISHED'
  order by s.created_at desc,s.bundle_id desc limit 1;
  if snapshot.bundle_id is null then return null; end if;
  return jsonb_build_object('bundle_id',snapshot.bundle_id,
    'bundle_sha256',snapshot.bundle_sha256,
    'terms',jsonb_build_object('id',snapshot.terms_version_id,
      'version',snapshot.terms_version,'sha256',snapshot.terms_sha256),
    'privacy',jsonb_build_object('id',snapshot.privacy_version_id,
      'version',snapshot.privacy_version,'sha256',snapshot.privacy_sha256));
end;
$function$;
revoke all on function public.get_public_at_legal_bundle_identity(text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_public_at_legal_bundle_identity(text)
  to anon,authenticated;

-- Existing acceptance rows are left unbound: historical agreement is never
-- reconstructed from today's publication. New rows carry their true bundle.
alter table public.customer_legal_acceptances
  add column at_legal_bundle_id text references public.legal_bundle_snapshots(bundle_id) on delete restrict;
create index customer_legal_acceptances_at_bundle_idx
  on public.customer_legal_acceptances(restaurant_id,customer_id,at_legal_bundle_id);

-- Unlike the legacy per-document unique acceptance, this event records each
-- explicit, exact-bundle choice, including re-acceptance of unchanged text.
-- It intentionally has no foreign key to customer or restaurant so an
-- authorized deletion workflow does not erase or counterfeit the audit event.
create table public.customer_at_legal_consent_receipts (
  request_id uuid primary key,
  restaurant_id uuid not null,
  customer_id uuid not null,
  bundle_id text not null check(bundle_id ~ '^bundle-[0-9a-f]{64}$'),
  bundle_sha256 text not null check(bundle_sha256 ~ '^[0-9a-f]{64}$'),
  terms_version_id uuid not null,
  terms_sha256 text not null check(terms_sha256 ~ '^[0-9a-f]{64}$'),
  privacy_version_id uuid not null,
  privacy_sha256 text not null check(privacy_sha256 ~ '^[0-9a-f]{64}$'),
  acceptance_source text not null check(acceptance_source in
    ('customer_registration','referral_registration','customer_join','referral_join','legal_center')),
  accepted_at timestamptz not null default clock_timestamp(),
  test_session_id text,
  check(bundle_id='bundle-'||bundle_sha256)
);
create index customer_at_legal_consent_receipts_customer_idx
  on public.customer_at_legal_consent_receipts(restaurant_id,customer_id,accepted_at desc);
alter table public.customer_at_legal_consent_receipts enable row level security;
revoke all on table public.customer_at_legal_consent_receipts
  from public,anon,authenticated,service_role;
create trigger customer_at_legal_consent_receipts_append_only
  before update or delete or truncate on public.customer_at_legal_consent_receipts
  for each statement execute function public.protect_legal_bundle_append_only();

create function public.require_current_at_legal_bundle_internal(
  input_restaurant_id uuid,input_bundle_id text
) returns public.legal_bundle_snapshots
language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare snapshot public.legal_bundle_snapshots%rowtype;
begin
  if input_restaurant_id is null or input_bundle_id is null
    or input_bundle_id !~ '^bundle-[0-9a-f]{64}$' then
    raise exception 'CUSTOMER_LEGAL_BUNDLE_REQUIRED' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('legal-bundle-restaurant:'||input_restaurant_id::text,0));
  select * into snapshot from public.legal_bundle_snapshots
    where bundle_id=input_bundle_id and restaurant_id=input_restaurant_id
      and country='AT' and locale='de-AT' for share;
  if snapshot.bundle_id is null then
    raise exception 'CUSTOMER_LEGAL_BUNDLE_MISMATCH' using errcode='22023';
  end if;
  perform 1 from public.legal_documents where restaurant_id=input_restaurant_id
    and document_type in ('participation_terms','privacy') order by id for share;
  perform 1 from public.legal_document_versions
    where id in (snapshot.terms_version_id,snapshot.privacy_version_id) order by id for share;
  perform 1 from public.country_kyb_intake_policies where country_code='AT' for share;
  if public.legal_bundle_effective_status_internal(input_bundle_id)<>'PUBLISHED'
    or not public.restaurant_legal_bundle_is_current(input_restaurant_id,current_date)
    or not exists(select 1 from public.legal_documents d
      where d.restaurant_id=input_restaurant_id and d.document_type='participation_terms'
        and d.current_published_version_id=snapshot.terms_version_id)
    or not exists(select 1 from public.legal_documents d
      where d.restaurant_id=input_restaurant_id and d.document_type='privacy'
        and d.current_published_version_id=snapshot.privacy_version_id) then
    raise exception 'CUSTOMER_LEGAL_BUNDLE_STALE' using errcode='42501';
  end if;
  return snapshot;
end;
$function$;
revoke all on function public.require_current_at_legal_bundle_internal(uuid,text)
  from public,anon,authenticated,service_role;

-- The legacy legal writer is still used inside the exact RPCs below. Reject
-- direct AT writes without their transaction-scoped, verified bundle context.
create function public.bind_customer_at_legal_acceptance()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare bundle text; snapshot public.legal_bundle_snapshots%rowtype;
begin
  if not exists(select 1 from public.legal_bundle_snapshots s
    where s.restaurant_id=new.restaurant_id and s.country='AT') then return new; end if;
  bundle:=nullif(current_setting('wuxuai.at_legal_bundle_id',true),'');
  snapshot:=public.require_current_at_legal_bundle_internal(new.restaurant_id,bundle);
  if (new.document_type='participation_terms' and
      (new.document_version_id is distinct from snapshot.terms_version_id
       or lower(new.document_hash) is distinct from snapshot.terms_sha256))
    or (new.document_type='privacy' and
      (new.document_version_id is distinct from snapshot.privacy_version_id
       or lower(new.document_hash) is distinct from snapshot.privacy_sha256)) then
    raise exception 'CUSTOMER_LEGAL_DOCUMENT_MISMATCH' using errcode='42501';
  end if;
  new.at_legal_bundle_id:=snapshot.bundle_id;
  return new;
end;
$function$;
create trigger bind_customer_at_legal_acceptance_before_insert
  before insert on public.customer_legal_acceptances
  for each row execute function public.bind_customer_at_legal_acceptance();
revoke all on function public.bind_customer_at_legal_acceptance()
  from public,anon,authenticated,service_role;

create function public.guard_customer_at_legal_membership()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
begin
  if exists(select 1 from public.legal_bundle_snapshots s
    where s.restaurant_id=new.restaurant_id and s.country='AT') then
    perform public.require_current_at_legal_bundle_internal(new.restaurant_id,
      nullif(current_setting('wuxuai.at_legal_bundle_id',true),''));
  end if;
  return new;
end;
$function$;
create trigger guard_customer_at_legal_membership_before_insert
  before insert on public.customer_account_memberships
  for each row execute function public.guard_customer_at_legal_membership();
revoke all on function public.guard_customer_at_legal_membership()
  from public,anon,authenticated,service_role;

create function public.record_customer_at_legal_consent_internal(
  input_restaurant_id uuid,input_customer_token text,input_bundle_id text,
  input_request_id uuid,input_source text
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare snapshot public.legal_bundle_snapshots%rowtype; customer_id_value uuid;
  prior public.customer_at_legal_consent_receipts%rowtype; session_value text;
begin
  if input_request_id is null or input_source not in
    ('customer_registration','referral_registration','customer_join','referral_join','legal_center') then
    raise exception 'CUSTOMER_LEGAL_RECEIPT_REQUEST_INVALID' using errcode='22023';
  end if;
  snapshot:=public.require_current_at_legal_bundle_internal(input_restaurant_id,input_bundle_id);
  customer_id_value:=public.resolve_customer_from_public_token(input_restaurant_id,input_customer_token);
  if customer_id_value is null then
    raise exception 'CUSTOMER_LEGAL_TOKEN_INVALID' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-legal-receipt:'||input_request_id::text,0));
  select * into prior from public.customer_at_legal_consent_receipts
    where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.restaurant_id is distinct from input_restaurant_id
      or prior.customer_id is distinct from customer_id_value
      or prior.bundle_id is distinct from input_bundle_id
      or prior.acceptance_source is distinct from input_source then
      raise exception 'CUSTOMER_LEGAL_RECEIPT_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('request_id',prior.request_id,'bundle_id',prior.bundle_id,
      'accepted_at',prior.accepted_at,'idempotent',true);
  end if;
  select c.test_session_id into session_value from public.customers c
    where c.id=customer_id_value and c.restaurant_id=input_restaurant_id;
  insert into public.customer_at_legal_consent_receipts(
    request_id,restaurant_id,customer_id,bundle_id,bundle_sha256,
    terms_version_id,terms_sha256,privacy_version_id,privacy_sha256,
    acceptance_source,test_session_id)
  values(input_request_id,input_restaurant_id,customer_id_value,snapshot.bundle_id,snapshot.bundle_sha256,
    snapshot.terms_version_id,snapshot.terms_sha256,snapshot.privacy_version_id,
    snapshot.privacy_sha256,input_source,session_value);
  return jsonb_build_object('request_id',input_request_id,'bundle_id',snapshot.bundle_id,
    'accepted_at',(select accepted_at from public.customer_at_legal_consent_receipts
      where request_id=input_request_id),'idempotent',false);
end;
$function$;
revoke all on function public.record_customer_at_legal_consent_internal(uuid,text,text,uuid,text)
  from public,anon,authenticated,service_role;

create function public.join_customer_account_restaurant_at_legal(
  input_restaurant_slug text,input_terms_accepted boolean,input_privacy_acknowledged boolean,
  input_device_id text,input_existing_customer_token text,input_bundle_id text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid; joined jsonb; token_value text; receipt jsonb;
begin
  if input_terms_accepted is distinct from true or input_privacy_acknowledged is distinct from true then
    raise exception 'CUSTOMER_LEGAL_ACCEPTANCE_REQUIRED' using errcode='22023';
  end if;
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  perform public.require_current_at_legal_bundle_internal(restaurant_id_value,input_bundle_id);
  perform set_config('wuxuai.at_legal_bundle_id',input_bundle_id,true);
  joined:=public.join_customer_account_restaurant(input_restaurant_slug,true,true,
    input_device_id,input_existing_customer_token);
  token_value:=coalesce(joined->>'customer_token',nullif(trim(input_existing_customer_token),''));
  if token_value is null then
    raise exception 'CUSTOMER_LEGAL_TOKEN_INVALID' using errcode='42501';
  end if;
  perform public.accept_current_legal_documents(input_restaurant_slug,token_value,'customer_join');
  receipt:=public.record_customer_at_legal_consent_internal(restaurant_id_value,
    token_value,input_bundle_id,input_request_id,'customer_join');
  return joined||jsonb_build_object('legal_receipt',receipt);
end;
$function$;

create function public.join_authenticated_customer_referral_at_legal(
  input_restaurant_slug text,input_referral_token text,input_terms_accepted boolean,
  input_privacy_acknowledged boolean,input_device_id text,input_bundle_id text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid; joined jsonb; token_value text; receipt jsonb;
begin
  if input_terms_accepted is distinct from true or input_privacy_acknowledged is distinct from true then
    raise exception 'CUSTOMER_LEGAL_ACCEPTANCE_REQUIRED' using errcode='22023';
  end if;
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  perform public.require_current_at_legal_bundle_internal(restaurant_id_value,input_bundle_id);
  perform set_config('wuxuai.at_legal_bundle_id',input_bundle_id,true);
  joined:=public.join_authenticated_customer_referral(input_restaurant_slug,input_referral_token,
    true,true,input_device_id);
  token_value:=joined->>'customer_token';
  if token_value is null then
    raise exception 'CUSTOMER_LEGAL_TOKEN_INVALID' using errcode='42501';
  end if;
  perform public.accept_current_legal_documents(input_restaurant_slug,token_value,'referral_join');
  receipt:=public.record_customer_at_legal_consent_internal(restaurant_id_value,
    token_value,input_bundle_id,input_request_id,'referral_join');
  return joined||jsonb_build_object('legal_receipt',receipt);
end;
$function$;

create function public.register_restaurant_customer_at_legal(
  input_restaurant_slug text,input_first_name text,input_phone text,input_birthday date,
  input_device_id text,input_terms_accepted boolean,input_privacy_acknowledged boolean,
  input_marketing_push boolean,input_marketing_sms boolean,input_marketing_email boolean,
  input_birthday_processing boolean,input_bundle_id text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid; result_payload jsonb; token_value text; receipt jsonb;
begin
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  perform public.require_current_at_legal_bundle_internal(restaurant_id_value,input_bundle_id);
  perform set_config('wuxuai.at_legal_bundle_id',input_bundle_id,true);
  result_payload:=public.register_restaurant_customer_legal(input_restaurant_slug,
    input_first_name,input_phone,input_birthday,input_device_id,input_terms_accepted,
    input_privacy_acknowledged,input_marketing_push,input_marketing_sms,input_marketing_email,
    input_birthday_processing);
  if coalesce((result_payload->>'success')::boolean,false) is not true then return result_payload; end if;
  token_value:=result_payload#>>'{customer,customer_qr_token}';
  receipt:=public.record_customer_at_legal_consent_internal(restaurant_id_value,
    token_value,input_bundle_id,input_request_id,'customer_registration');
  return result_payload||jsonb_build_object('legal_receipt',receipt);
end;
$function$;

create function public.register_referral_customer_at_legal(
  input_restaurant_slug text,input_referral_token text,input_first_name text,input_phone text,
  input_birthday date,input_device_id text,input_terms_accepted boolean,
  input_privacy_acknowledged boolean,input_marketing_push boolean,input_marketing_sms boolean,
  input_marketing_email boolean,input_birthday_processing boolean,
  input_bundle_id text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid; result_payload jsonb; token_value text; receipt jsonb;
begin
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  perform public.require_current_at_legal_bundle_internal(restaurant_id_value,input_bundle_id);
  perform set_config('wuxuai.at_legal_bundle_id',input_bundle_id,true);
  result_payload:=public.register_referral_customer_legal(input_restaurant_slug,
    input_referral_token,input_first_name,input_phone,input_birthday,input_device_id,
    input_terms_accepted,input_privacy_acknowledged,input_marketing_push,input_marketing_sms,
    input_marketing_email,input_birthday_processing);
  if coalesce((result_payload->>'success')::boolean,false) is not true then return result_payload; end if;
  token_value:=result_payload#>>'{customer,customer_qr_token}';
  receipt:=public.record_customer_at_legal_consent_internal(restaurant_id_value,
    token_value,input_bundle_id,input_request_id,'referral_registration');
  return result_payload||jsonb_build_object('legal_receipt',receipt);
end;
$function$;

create function public.accept_current_at_legal_documents(
  input_restaurant_slug text,input_customer_token text,input_bundle_id text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid; accepted jsonb; receipt jsonb;
begin
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  perform public.require_current_at_legal_bundle_internal(restaurant_id_value,input_bundle_id);
  perform set_config('wuxuai.at_legal_bundle_id',input_bundle_id,true);
  accepted:=public.accept_current_legal_documents(input_restaurant_slug,input_customer_token,'legal_center');
  receipt:=public.record_customer_at_legal_consent_internal(restaurant_id_value,
    input_customer_token,input_bundle_id,input_request_id,'legal_center');
  return accepted||jsonb_build_object('legal_receipt',receipt);
end;
$function$;

revoke all on function
  public.join_customer_account_restaurant_at_legal(text,boolean,boolean,text,text,text,uuid),
  public.join_authenticated_customer_referral_at_legal(text,text,boolean,boolean,text,text,uuid),
  public.register_restaurant_customer_at_legal(text,text,text,date,text,boolean,boolean,boolean,boolean,boolean,boolean,text,uuid),
  public.register_referral_customer_at_legal(text,text,text,text,date,text,boolean,boolean,boolean,boolean,boolean,boolean,text,uuid),
  public.accept_current_at_legal_documents(text,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function
  public.join_customer_account_restaurant_at_legal(text,boolean,boolean,text,text,text,uuid),
  public.join_authenticated_customer_referral_at_legal(text,text,boolean,boolean,text,text,uuid)
  to authenticated;
grant execute on function
  public.register_restaurant_customer_at_legal(text,text,text,date,text,boolean,boolean,boolean,boolean,boolean,boolean,text,uuid),
  public.register_referral_customer_at_legal(text,text,text,text,date,text,boolean,boolean,boolean,boolean,boolean,boolean,text,uuid),
  public.accept_current_at_legal_documents(text,text,text,uuid)
  to anon,authenticated;

-- A separate proof system for STAGING + an exact TEST_ONLY tenant. This does
-- not write real templates, document versions, policies, customers or consent.
-- Its four VERIFIED_TEST_ONLY values are never interpreted by real intake.
create table public.at_legal_synthetic_test_publications (
  id uuid primary key default extensions.gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  restaurant_id uuid not null,
  request_id uuid not null unique,
  action text not null check(action in ('PUBLISH_TEST','WITHDRAW_TEST')),
  expected_status text not null check(expected_status in ('NOT_FOUND','PUBLISHED_TEST','WITHDRAWN_TEST')),
  expected_previous_hash text,
  bundle_id text not null check(bundle_id ~ '^at-test-[0-9a-f]{64}$'),
  bundle_hash text not null check(bundle_hash ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  check(bundle_id='at-test-'||bundle_hash),
  check(expected_previous_hash is null or expected_previous_hash ~ '^[0-9a-f]{64}$')
);
create index at_legal_synthetic_test_publications_latest_idx
  on public.at_legal_synthetic_test_publications(restaurant_id,event_sequence desc);
create table public.at_legal_synthetic_test_consent_receipts (
  request_id uuid primary key,
  restaurant_id uuid not null,
  synthetic_subject_id uuid not null,
  bundle_id text not null check(bundle_id ~ '^at-test-[0-9a-f]{64}$'),
  bundle_hash text not null check(bundle_hash ~ '^[0-9a-f]{64}$'),
  legal_version text not null,
  legal_sha256 text not null,
  privacy_version text not null,
  privacy_sha256 text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz not null default clock_timestamp(),
  check(bundle_id='at-test-'||bundle_hash)
);
create index at_legal_synthetic_test_consents_tenant_idx
  on public.at_legal_synthetic_test_consent_receipts(restaurant_id,synthetic_subject_id,accepted_at desc);
alter table public.at_legal_synthetic_test_publications enable row level security;
alter table public.at_legal_synthetic_test_consent_receipts enable row level security;
revoke all on table public.at_legal_synthetic_test_publications,
  public.at_legal_synthetic_test_consent_receipts from public,anon,authenticated,service_role;
revoke all on sequence public.at_legal_synthetic_test_publications_event_sequence_seq
  from public,anon,authenticated,service_role;
create trigger at_legal_synthetic_publications_append_only
  before update or delete or truncate on public.at_legal_synthetic_test_publications
  for each statement execute function public.protect_legal_bundle_append_only();
create trigger at_legal_synthetic_consents_append_only
  before update or delete or truncate on public.at_legal_synthetic_test_consent_receipts
  for each statement execute function public.protect_legal_bundle_append_only();

create function public.require_at_legal_synthetic_scope_internal(input_restaurant_id uuid)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare r public.restaurants%rowtype; marker public.platform_test_tenant_registry%rowtype;
  runtime_environment text; policy public.country_kyb_intake_policies%rowtype;
begin
  perform public.require_legal_bundle_admin_internal();
  select environment into runtime_environment from public.business_verification_environment where singleton;
  select * into r from public.restaurants where id=input_restaurant_id for share;
  select * into marker from public.platform_test_tenant_registry
    where restaurant_id=input_restaurant_id and deleted_at is null for share;
  select * into policy from public.country_kyb_intake_policies where country_code='AT' for share;
  if runtime_environment is distinct from 'STAGING'
    or r.id is null
    or public.restaurant_activation_state_internal(r.id)->>'status' is distinct from 'PENDING_ACTIVATION'
    or not exists(select 1 from public.branches b
      where b.id=r.primary_branch_id and b.restaurant_id=r.id
        and b.organization_id=r.organization_id and b.country='AT')
    or marker.restaurant_id is null or marker.organization_id is distinct from r.organization_id
    or marker.owner_user_id is distinct from r.owner_id
    or marker.restaurant_name is distinct from r.name
    or policy.real_intake_status is distinct from 'BLOCKED'
    or policy.test_only_intake_status is distinct from 'READY' then
    raise exception 'AT_LEGAL_TEST_SCOPE_DENIED' using errcode='42501';
  end if;
end;
$function$;
revoke all on function public.require_at_legal_synthetic_scope_internal(uuid)
  from public,anon,authenticated,service_role;

create function public.at_legal_synthetic_manifest_hash_internal(input_manifest jsonb)
returns text language plpgsql immutable
set search_path=pg_catalog,public,pg_temp as $function$
declare area text; item jsonb; body text;
begin
  if input_manifest is null or jsonb_typeof(input_manifest)<>'object'
    or input_manifest->>'schema_version' is distinct from '1'
    or input_manifest->>'test_only' is distinct from 'true'
    or input_manifest->>'country' is distinct from 'AT'
    or input_manifest->>'locale' is distinct from 'de-AT' then
    raise exception 'AT_LEGAL_TEST_MANIFEST_INVALID' using errcode='22023';
  end if;
  foreach area in array array['legal','privacy','document_catalog','retention'] loop
    item:=input_manifest->area;
    body:=item->>'body';
    if item->>'status' is distinct from 'VERIFIED_TEST_ONLY'
      or coalesce(item->>'version','') !~ '^TEST_ONLY_[A-Z0-9_-]{3,80}$'
      or coalesce(item->>'source','') !~ '^TEST_ONLY_[A-Z0-9_-]{3,80}$'
      or left(coalesce(body,''),10)<>'TEST ONLY:'
      or length(body)>20000
      or item->>'sha256' is distinct from
        encode(extensions.digest(convert_to(body,'UTF8'),'sha256'),'hex') then
      raise exception 'AT_LEGAL_TEST_AREA_INVALID_%',upper(area) using errcode='22023';
    end if;
  end loop;
  return encode(extensions.digest(convert_to(
    'WUXUAI_AT_LEGAL_TEST_V1'||public.legal_bundle_canonical_value_v1(input_manifest),
    'UTF8'),'sha256'),'hex');
end;
$function$;
revoke all on function public.at_legal_synthetic_manifest_hash_internal(jsonb)
  from public,anon,authenticated,service_role;

create function public.set_platform_at_legal_synthetic_test_publication(
  input_restaurant_id uuid,input_action text,input_manifest jsonb,
  input_expected_status text,input_expected_previous_hash text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare prior public.at_legal_synthetic_test_publications%rowtype;
  existing public.at_legal_synthetic_test_publications%rowtype;
  status_value text:='NOT_FOUND'; manifest_value jsonb; hash_value text;
  bundle_value text; event_id uuid;
begin
  perform public.require_at_legal_synthetic_scope_internal(input_restaurant_id);
  if input_request_id is null or input_action not in ('PUBLISH_TEST','WITHDRAW_TEST') then
    raise exception 'AT_LEGAL_TEST_REQUEST_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('at-legal-synthetic:'||input_restaurant_id::text,0));
  select * into existing from public.at_legal_synthetic_test_publications
    where request_id=input_request_id;
  if existing.id is not null then
    if existing.actor_id is distinct from auth.uid()
      or existing.restaurant_id is distinct from input_restaurant_id
      or existing.action is distinct from input_action
      or existing.expected_status is distinct from input_expected_status
      or existing.expected_previous_hash is distinct from input_expected_previous_hash
      or (input_action='PUBLISH_TEST' and existing.manifest is distinct from input_manifest) then
      raise exception 'AT_LEGAL_TEST_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('event_id',existing.id,'bundle_id',existing.bundle_id,
      'bundle_hash',existing.bundle_hash,'status',case existing.action
        when 'PUBLISH_TEST' then 'PUBLISHED_TEST' else 'WITHDRAWN_TEST' end,
      'test_only',true,'idempotent',true);
  end if;
  select * into prior from public.at_legal_synthetic_test_publications
    where restaurant_id=input_restaurant_id order by event_sequence desc limit 1 for update;
  if prior.id is not null then
    status_value:=case prior.action when 'PUBLISH_TEST' then 'PUBLISHED_TEST'
      else 'WITHDRAWN_TEST' end;
  end if;
  if input_expected_status is distinct from status_value
    or input_expected_previous_hash is distinct from prior.bundle_hash then
    raise exception 'AT_LEGAL_TEST_EXPECTED_STATE_MISMATCH' using errcode='22023';
  end if;
  if input_action='WITHDRAW_TEST' then
    if status_value<>'PUBLISHED_TEST' or input_manifest is not null then
      raise exception 'AT_LEGAL_TEST_WITHDRAW_BLOCKED' using errcode='42501';
    end if;
    manifest_value:=prior.manifest;
    hash_value:=prior.bundle_hash;
    bundle_value:=prior.bundle_id;
  else
    if input_manifest->>'restaurant_id' is distinct from input_restaurant_id::text then
      raise exception 'AT_LEGAL_TEST_TENANT_MISMATCH' using errcode='22023';
    end if;
    hash_value:=public.at_legal_synthetic_manifest_hash_internal(input_manifest);
    bundle_value:='at-test-'||hash_value;
    manifest_value:=input_manifest;
  end if;
  insert into public.at_legal_synthetic_test_publications(
    restaurant_id,request_id,action,expected_status,expected_previous_hash,
    bundle_id,bundle_hash,manifest,actor_id)
  values(input_restaurant_id,input_request_id,input_action,input_expected_status,
    input_expected_previous_hash,bundle_value,hash_value,manifest_value,auth.uid())
  returning id into event_id;
  return jsonb_build_object('event_id',event_id,'bundle_id',bundle_value,
    'bundle_hash',hash_value,'status',case input_action when 'PUBLISH_TEST'
      then 'PUBLISHED_TEST' else 'WITHDRAWN_TEST' end,'test_only',true,'idempotent',false);
end;
$function$;
revoke all on function public.set_platform_at_legal_synthetic_test_publication(uuid,text,jsonb,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.set_platform_at_legal_synthetic_test_publication(uuid,text,jsonb,text,text,uuid)
  to authenticated;

create function public.record_platform_at_legal_synthetic_test_consent(
  input_restaurant_id uuid,input_synthetic_subject_id uuid,input_expected_bundle_hash text,
  input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare publication public.at_legal_synthetic_test_publications%rowtype;
  prior public.at_legal_synthetic_test_consent_receipts%rowtype;
begin
  perform public.require_at_legal_synthetic_scope_internal(input_restaurant_id);
  if input_request_id is null or input_synthetic_subject_id is null then
    raise exception 'AT_LEGAL_TEST_CONSENT_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('at-legal-synthetic:'||input_restaurant_id::text,0));
  select * into prior from public.at_legal_synthetic_test_consent_receipts
    where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.actor_id is distinct from auth.uid()
      or prior.restaurant_id is distinct from input_restaurant_id
      or prior.synthetic_subject_id is distinct from input_synthetic_subject_id
      or prior.bundle_hash is distinct from input_expected_bundle_hash then
      raise exception 'AT_LEGAL_TEST_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('request_id',prior.request_id,'bundle_id',prior.bundle_id,
      'accepted_at',prior.accepted_at,'test_only',true,'idempotent',true);
  end if;
  select * into publication from public.at_legal_synthetic_test_publications
    where restaurant_id=input_restaurant_id order by event_sequence desc limit 1 for share;
  if publication.id is null or publication.action<>'PUBLISH_TEST'
    or publication.bundle_hash is distinct from input_expected_bundle_hash then
    raise exception 'AT_LEGAL_TEST_BUNDLE_STALE' using errcode='42501';
  end if;
  insert into public.at_legal_synthetic_test_consent_receipts(
    request_id,restaurant_id,synthetic_subject_id,bundle_id,bundle_hash,
    legal_version,legal_sha256,privacy_version,privacy_sha256,actor_id)
  values(input_request_id,input_restaurant_id,input_synthetic_subject_id,
    publication.bundle_id,publication.bundle_hash,
    publication.manifest->'legal'->>'version',publication.manifest->'legal'->>'sha256',
    publication.manifest->'privacy'->>'version',publication.manifest->'privacy'->>'sha256',auth.uid());
  return jsonb_build_object('request_id',input_request_id,'bundle_id',publication.bundle_id,
    'accepted_at',(select accepted_at from public.at_legal_synthetic_test_consent_receipts
      where request_id=input_request_id),'test_only',true,'idempotent',false);
end;
$function$;
revoke all on function public.record_platform_at_legal_synthetic_test_consent(uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.record_platform_at_legal_synthetic_test_consent(uuid,uuid,text,uuid)
  to authenticated;

create function public.get_platform_at_legal_synthetic_test_receipt(input_request_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare publication public.at_legal_synthetic_test_publications%rowtype;
  consent public.at_legal_synthetic_test_consent_receipts%rowtype;
begin
  perform public.require_legal_bundle_admin_internal();
  select * into publication from public.at_legal_synthetic_test_publications
    where request_id=input_request_id and actor_id=auth.uid();
  if publication.id is not null then
    return jsonb_build_object('found',true,'operation',publication.action,
      'bundle_id',publication.bundle_id,'bundle_hash',publication.bundle_hash,
      'event_id',publication.id,'committed_at',publication.created_at,'test_only',true);
  end if;
  select * into consent from public.at_legal_synthetic_test_consent_receipts
    where request_id=input_request_id and actor_id=auth.uid();
  if consent.request_id is not null then
    return jsonb_build_object('found',true,'operation','CONSENT_TEST',
      'bundle_id',consent.bundle_id,'bundle_hash',consent.bundle_hash,
      'committed_at',consent.accepted_at,'test_only',true);
  end if;
  return jsonb_build_object('found',false);
end;
$function$;
revoke all on function public.get_platform_at_legal_synthetic_test_receipt(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_at_legal_synthetic_test_receipt(uuid)
  to authenticated;

create function public.get_platform_at_legal_synthetic_test_status(input_restaurant_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare publication public.at_legal_synthetic_test_publications%rowtype;
  current_status text:='NOT_FOUND'; area text; areas jsonb:='{}'::jsonb;
begin
  perform public.require_at_legal_synthetic_scope_internal(input_restaurant_id);
  select * into publication from public.at_legal_synthetic_test_publications
    where restaurant_id=input_restaurant_id order by event_sequence desc limit 1;
  if publication.id is not null then
    current_status:=case publication.action when 'PUBLISH_TEST'
      then 'PUBLISHED_TEST' else 'WITHDRAWN_TEST' end;
    foreach area in array array['legal','privacy','document_catalog','retention'] loop
      areas:=areas||jsonb_build_object(area,jsonb_build_object(
        'version',publication.manifest->area->>'version',
        'sha256',publication.manifest->area->>'sha256',
        'source',publication.manifest->area->>'source',
        'status',publication.manifest->area->>'status'));
    end loop;
  end if;
  return jsonb_build_object('restaurant_id',input_restaurant_id,'status',current_status,
    'bundle_id',publication.bundle_id,'bundle_hash',publication.bundle_hash,
    'areas',areas,'test_only',true,'real_intake_opened',false);
end;
$function$;
revoke all on function public.get_platform_at_legal_synthetic_test_status(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_at_legal_synthetic_test_status(uuid)
  to authenticated;

notify pgrst,'reload schema';
commit;
