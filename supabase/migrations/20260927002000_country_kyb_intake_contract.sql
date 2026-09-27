-- Phase 7D: separate pre-activation KYB intake from commercial country release.
-- Real-document intake remains disabled. Only an exact STAGING + TEST_ONLY +
-- PENDING_ACTIVATION tuple may create a synthetic manual-review case.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260927002000', 0));

create table if not exists public.country_kyb_intake_policies (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  real_intake_status text not null check (real_intake_status in ('BLOCKED','READY')),
  test_only_intake_status text not null check (test_only_intake_status in ('BLOCKED','READY')),
  legal_status text not null check (legal_status in ('PENDING_CONFIGURATION','VERIFIED','BLOCKED')),
  privacy_status text not null check (privacy_status in ('PENDING_CONFIGURATION','VERIFIED','BLOCKED')),
  document_catalog_status text not null check (document_catalog_status in ('PENDING_CONFIGURATION','VERIFIED','BLOCKED')),
  retention_status text not null check (retention_status in ('PENDING_CONFIGURATION','VERIFIED','BLOCKED')),
  updated_at timestamptz not null default clock_timestamp(),
  change_ref text not null
);
insert into public.country_kyb_intake_policies(
  country_code, real_intake_status, test_only_intake_status,
  legal_status, privacy_status, document_catalog_status, retention_status, change_ref
) values (
  'AT', 'BLOCKED', 'READY',
  'PENDING_CONFIGURATION', 'PENDING_CONFIGURATION',
  'PENDING_CONFIGURATION', 'PENDING_CONFIGURATION',
  'PHASE_7D_SYNTHETIC_STAGING_INTAKE_ONLY'
) on conflict (country_code) do nothing;
alter table public.country_kyb_intake_policies enable row level security;
revoke all on public.country_kyb_intake_policies from public, anon, authenticated, service_role;

alter table public.organization_legal_profiles
  add column if not exists gisa_number text,
  add column if not exists owner_is_authorized_representative boolean,
  add column if not exists authorized_representative_role text,
  add column if not exists commercial_register_applicable boolean;

create or replace function public.save_owner_kyb_intake_profile(
  input_restaurant_id uuid,
  input_profile jsonb
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  actor uuid := auth.uid();
  restaurant_row public.restaurants%rowtype;
  profile_row public.organization_legal_profiles%rowtype;
  country_value text := upper(trim(coalesce(input_profile->>'country_code', '')));
  gisa_value text := nullif(trim(input_profile->>'gisa_number'), '');
  representative_name text := nullif(trim(input_profile->>'authorized_representative_name'), '');
  representative_role text := nullif(trim(input_profile->>'authorized_representative_role'), '');
  owner_is_representative boolean := coalesce((input_profile->>'owner_is_authorized_representative')::boolean, false);
  register_applicable boolean := coalesce((input_profile->>'commercial_register_applicable')::boolean, false);
  register_number text := nullif(trim(input_profile->>'commercial_register_number'), '');
begin
  if actor is null or auth.role() is distinct from 'authenticated'
    or input_restaurant_id is null or jsonb_typeof(input_profile) is distinct from 'object' then
    raise exception 'KYB_INTAKE_PROFILE_INVALID' using errcode = '22023';
  end if;
  select * into restaurant_row from public.restaurants where id=input_restaurant_id for update;
  if restaurant_row.id is null or restaurant_row.owner_id is distinct from actor
    or not exists(select 1 from public.restaurant_members m
      where m.restaurant_id=restaurant_row.id and m.organization_id=restaurant_row.organization_id
        and m.user_id=actor and m.role='owner') then
    raise exception 'KYB_INTAKE_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if public.restaurant_activation_state_internal(restaurant_row.id)->>'status' is distinct from 'PENDING_ACTIVATION' then
    raise exception 'KYB_INTAKE_PENDING_REQUIRED' using errcode = '42501';
  end if;
  if country_value <> 'AT' or gisa_value is null or length(gisa_value) > 120
    or representative_name is null or length(representative_name) > 240
    or representative_role is null or length(representative_role) > 120
    or (register_applicable and register_number is null) then
    raise exception 'KYB_INTAKE_PROFILE_INCOMPLETE' using errcode = '22023';
  end if;
  update public.organization_legal_profiles set
    gisa_number=gisa_value,
    owner_is_authorized_representative=owner_is_representative,
    responsible_person=representative_name,
    authorized_representative_role=representative_role,
    commercial_register_applicable=register_applicable,
    commercial_register_number=case when register_applicable then register_number else null end,
    updated_at=clock_timestamp(), updated_by=actor
  where organization_id=restaurant_row.organization_id
  returning * into profile_row;
  if profile_row.id is null then
    raise exception 'KYB_INTAKE_LEGAL_PROFILE_REQUIRED' using errcode = '42501';
  end if;
  return jsonb_build_object('status','COMPLETE','country_code',country_value,
    'gisa_number',profile_row.gisa_number,
    'owner_is_authorized_representative',profile_row.owner_is_authorized_representative,
    'authorized_representative_name',profile_row.responsible_person,
    'authorized_representative_role',profile_row.authorized_representative_role,
    'commercial_register_applicable',profile_row.commercial_register_applicable,
    'commercial_register_number',profile_row.commercial_register_number);
end;
$function$;
revoke all on function public.save_owner_kyb_intake_profile(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_owner_kyb_intake_profile(uuid,jsonb) to authenticated;

create or replace function public.get_owner_kyb_intake_summary(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  actor uuid := auth.uid();
  restaurant_row public.restaurants%rowtype;
  branch_row public.branches%rowtype;
  profile_row public.organization_legal_profiles%rowtype;
  missing text[] := array[]::text[];
begin
  select * into restaurant_row from public.restaurants where id=input_restaurant_id;
  if actor is null or auth.role() is distinct from 'authenticated'
    or restaurant_row.id is null or restaurant_row.owner_id is distinct from actor
    or not exists(select 1 from public.restaurant_members m
      where m.restaurant_id=restaurant_row.id and m.organization_id=restaurant_row.organization_id
        and m.user_id=actor and m.role='owner') then
    raise exception 'KYB_INTAKE_OWNER_REQUIRED' using errcode='42501';
  end if;
  select * into branch_row from public.branches where id=restaurant_row.primary_branch_id
    and restaurant_id=restaurant_row.id and organization_id=restaurant_row.organization_id;
  select * into profile_row from public.organization_legal_profiles
    where organization_id=restaurant_row.organization_id;
  if profile_row.id is null then missing:=array_append(missing,'Unternehmensdaten'); end if;
  if nullif(trim(profile_row.gisa_number),'') is null then missing:=array_append(missing,'GISA-Zahl'); end if;
  if nullif(trim(profile_row.responsible_person),'') is null then missing:=array_append(missing,'vertretungsberechtigte Person'); end if;
  if nullif(trim(profile_row.authorized_representative_role),'') is null then missing:=array_append(missing,'Funktion der vertretungsberechtigten Person'); end if;
  if coalesce(profile_row.commercial_register_applicable,false)
    and nullif(trim(profile_row.commercial_register_number),'') is null then
    missing:=array_append(missing,'Firmenbuchnummer');
  end if;
  return jsonb_build_object(
    'status',case when cardinality(missing)=0 then 'COMPLETE' else 'INCOMPLETE' end,
    'missing_fields',to_jsonb(missing),
    'company_name',profile_row.company_name,'legal_form',profile_row.legal_form,
    'country_code',upper(trim(branch_row.country)),
    'street',case when profile_row.registered_address_source='restaurant' then branch_row.address else profile_row.street end,
    'postal_code',case when profile_row.registered_address_source='restaurant' then branch_row.postal_code else profile_row.postal_code end,
    'city',case when profile_row.registered_address_source='restaurant' then branch_row.city else profile_row.city end,
    'gisa_number',profile_row.gisa_number,
    'owner_is_authorized_representative',profile_row.owner_is_authorized_representative,
    'authorized_representative_name',profile_row.responsible_person,
    'authorized_representative_role',profile_row.authorized_representative_role,
    'commercial_register_applicable',profile_row.commercial_register_applicable,
    'commercial_register_number',profile_row.commercial_register_number);
end;
$function$;
revoke all on function public.get_owner_kyb_intake_summary(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_owner_kyb_intake_summary(uuid) to authenticated;

create or replace function public.resolve_country_kyb_intake_internal(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  restaurant_row public.restaurants%rowtype;
  policy_row public.country_kyb_intake_policies%rowtype;
  runtime_environment text;
  country_value text;
  exact_test_marker boolean := false;
  pending_state boolean := false;
begin
  select * into restaurant_row from public.restaurants where id=input_restaurant_id;
  if restaurant_row.id is null then
    return jsonb_build_object('allowed',false,'code','KYB_INTAKE_RESTAURANT_NOT_FOUND');
  end if;
  select upper(trim(country)) into country_value from public.branches
    where id=restaurant_row.primary_branch_id and restaurant_id=restaurant_row.id
      and organization_id=restaurant_row.organization_id;
  select * into policy_row from public.country_kyb_intake_policies where country_code=country_value;
  select environment into runtime_environment from public.business_verification_environment where singleton;
  pending_state := public.restaurant_activation_state_internal(restaurant_row.id)->>'status'='PENDING_ACTIVATION';
  exact_test_marker := exists(select 1 from public.platform_test_tenant_registry marker
    where marker.restaurant_id=restaurant_row.id and marker.organization_id=restaurant_row.organization_id
      and marker.owner_user_id=restaurant_row.owner_id and marker.restaurant_name=restaurant_row.name
      and marker.deleted_at is null);
  if policy_row.country_code is null then
    return jsonb_build_object('allowed',false,'code','KYB_INTAKE_COUNTRY_NOT_CONFIGURED');
  end if;
  if runtime_environment='STAGING' and policy_row.test_only_intake_status='READY'
    and exact_test_marker and pending_state then
    return jsonb_build_object('allowed',true,'mode','SYNTHETIC_TEST_ONLY',
      'country_code',country_value,'commercial_activation_allowed',false);
  end if;
  return jsonb_build_object('allowed',false,
    'code',case
      when not pending_state then 'KYB_INTAKE_PENDING_REQUIRED'
      when runtime_environment<>'STAGING' then 'KYB_INTAKE_ENVIRONMENT_BLOCKED'
      when not exact_test_marker then 'KYB_INTAKE_REAL_DOCUMENTS_BLOCKED'
      else 'KYB_INTAKE_POLICY_BLOCKED' end,
    'country_code',country_value,'commercial_activation_allowed',false);
end;
$function$;
revoke all on function public.resolve_country_kyb_intake_internal(uuid) from public,anon,authenticated,service_role;

create or replace function public.enforce_business_verification_document_intake_guard()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare intake jsonb;
begin
  intake:=public.resolve_country_kyb_intake_internal(new.restaurant_id);
  if coalesce((intake->>'allowed')::boolean,false) is not true then
    raise exception '%',coalesce(intake->>'code','KYB_INTAKE_BLOCKED') using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.enforce_business_verification_document_intake_guard()
  from public,anon,authenticated,service_role;
drop trigger if exists business_verification_document_intake_guard
  on public.business_verification_documents;
create trigger business_verification_document_intake_guard
  before insert on public.business_verification_documents
  for each row execute function public.enforce_business_verification_document_intake_guard();

create or replace function public.submit_pending_business_verification_intake(
  input_restaurant_id uuid,input_method text,input_request_id uuid,input_correlation_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare
  actor uuid:=auth.uid(); restaurant_row public.restaurants%rowtype;
  branch_row public.branches%rowtype; legal_row public.organization_legal_profiles%rowtype;
  case_row public.business_verification_cases%rowtype; prior public.business_verification_owner_submissions%rowtype;
  intake jsonb; profile_id uuid; revision_number integer; payload_hash text; country_value text;
begin
  if actor is null or auth.role() is distinct from 'authenticated' or input_restaurant_id is null
    or input_request_id is null or input_correlation_id is null or input_method is distinct from 'MANUAL' then
    raise exception 'BUSINESS_VERIFICATION_SUBMISSION_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('business-verification:'||input_restaurant_id::text,0));
  select * into restaurant_row from public.restaurants where id=input_restaurant_id for update;
  if restaurant_row.id is null or restaurant_row.owner_id is distinct from actor
    or not exists(select 1 from public.restaurant_members m where m.restaurant_id=restaurant_row.id
      and m.organization_id=restaurant_row.organization_id and m.user_id=actor and m.role='owner') then
    raise exception 'BUSINESS_VERIFICATION_OWNER_REQUIRED' using errcode='42501';
  end if;
  select * into prior from public.business_verification_owner_submissions where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.restaurant_id is distinct from restaurant_row.id or prior.owner_id is distinct from actor
      or prior.method is distinct from input_method or prior.register_type is distinct from 'GISA'
      or prior.correlation_id is distinct from input_correlation_id then
      raise exception 'BUSINESS_VERIFICATION_IDEMPOTENCY_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('status','PENDING_ACTIVATION','case_id',prior.case_id,'request_id',input_request_id,'idempotent',true);
  end if;
  intake:=public.resolve_country_kyb_intake_internal(restaurant_row.id);
  if coalesce((intake->>'allowed')::boolean,false) is not true then
    raise exception '%',coalesce(intake->>'code','KYB_INTAKE_BLOCKED') using errcode='42501';
  end if;
  select * into branch_row from public.branches where id=restaurant_row.primary_branch_id
    and restaurant_id=restaurant_row.id and organization_id=restaurant_row.organization_id;
  country_value:=upper(trim(branch_row.country));
  select * into legal_row from public.organization_legal_profiles where organization_id=restaurant_row.organization_id;
  if legal_row.id is null or length(trim(coalesce(legal_row.company_name,'')))<2
    or length(trim(coalesce(legal_row.legal_form,'')))<2 or length(trim(coalesce(legal_row.email,'')))<3
    or length(trim(coalesce(legal_row.responsible_person,'')))<2
    or length(trim(coalesce(legal_row.authorized_representative_role,'')))<2
    or length(trim(coalesce(legal_row.gisa_number,'')))<2
    or (coalesce(legal_row.commercial_register_applicable,false)
      and length(trim(coalesce(legal_row.commercial_register_number,'')))<2) then
    raise exception 'BUSINESS_VERIFICATION_PROFILE_INCOMPLETE' using errcode='22023';
  end if;
  if legal_row.registered_address_source='restaurant' then
    if legal_row.address_source_restaurant_id is distinct from restaurant_row.id
      or legal_row.address_source_branch_id is distinct from branch_row.id
      or length(trim(coalesce(branch_row.address,'')))<2 or length(trim(coalesce(branch_row.postal_code,'')))<2
      or length(trim(coalesce(branch_row.city,'')))<2 then
      raise exception 'BUSINESS_VERIFICATION_ADDRESS_INCOMPLETE' using errcode='22023';
    end if;
  elsif length(trim(coalesce(legal_row.street,'')))<2 or length(trim(coalesce(legal_row.postal_code,'')))<2
    or length(trim(coalesce(legal_row.city,'')))<2 or upper(trim(coalesce(legal_row.country,''))) is distinct from country_value then
    raise exception 'BUSINESS_VERIFICATION_ADDRESS_INCOMPLETE' using errcode='22023';
  end if;
  payload_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'restaurant',restaurant_row.id,'owner',actor,'country',country_value,'method',input_method,
    'register_type','GISA','legal_profile',to_jsonb(legal_row)-'updated_at'-'updated_by',
    'branch_address',jsonb_build_object('street',branch_row.address,'postal_code',branch_row.postal_code,'city',branch_row.city))::text,'UTF8'),'sha256'),'hex');
  select * into case_row from public.business_verification_cases where restaurant_id=restaurant_row.id for update;
  if case_row.id is not null and case_row.status<>'PENDING_ACTIVATION' then
    raise exception 'BUSINESS_VERIFICATION_CASE_ALREADY_REVIEWED' using errcode='42501';
  end if;
  select * into prior from public.business_verification_owner_submissions
    where restaurant_id=restaurant_row.id and payload_sha256=payload_hash;
  if prior.request_id is not null then
    return jsonb_build_object('status','PENDING_ACTIVATION','case_id',prior.case_id,'request_id',prior.request_id,'idempotent',true);
  end if;
  if case_row.id is null then
    insert into public.business_verification_cases(restaurant_id,country_code,verification_method,status,test_only,created_by)
    values(restaurant_row.id,country_value,input_method,'PENDING_ACTIVATION',true,actor) returning * into case_row;
  elsif case_row.country_code is distinct from country_value or case_row.verification_method is distinct from input_method
    or case_row.test_only is not true then
    raise exception 'BUSINESS_VERIFICATION_CASE_CONFLICT' using errcode='23505';
  end if;
  select coalesce(max(revision),0)+1 into revision_number from public.business_verified_profile_revisions where case_id=case_row.id;
  insert into public.business_verified_profile_revisions(case_id,revision,legal_name,legal_form,register_type,
    register_identifier,vat_id,business_street,business_postal_code,business_city,business_country,
    authorized_representative,supersedes_revision_id,status,decision_ref,created_by)
  values(case_row.id,revision_number,trim(legal_row.company_name),trim(legal_row.legal_form),'GISA',
    trim(legal_row.gisa_number),nullif(trim(coalesce(legal_row.vat_id,'')),''),
    case when legal_row.registered_address_source='restaurant' then trim(branch_row.address) else trim(legal_row.street) end,
    case when legal_row.registered_address_source='restaurant' then trim(branch_row.postal_code) else trim(legal_row.postal_code) end,
    case when legal_row.registered_address_source='restaurant' then trim(branch_row.city) else trim(legal_row.city) end,
    country_value,trim(legal_row.responsible_person),
    (select id from public.business_verified_profile_revisions where case_id=case_row.id order by revision desc limit 1),
    'REVIEWED_DRAFT',extensions.gen_random_uuid(),actor) returning id into profile_id;
  insert into public.business_verification_owner_submissions(request_id,correlation_id,restaurant_id,owner_id,
    method,register_type,payload_sha256,case_id,profile_revision_id)
  values(input_request_id,input_correlation_id,restaurant_row.id,actor,input_method,'GISA',payload_hash,case_row.id,profile_id);
  return jsonb_build_object('status','PENDING_ACTIVATION','case_id',case_row.id,'request_id',input_request_id,
    'idempotent',false,'intake_mode','SYNTHETIC_TEST_ONLY','commercial_activation_allowed',false);
end;
$function$;
revoke all on function public.submit_pending_business_verification_intake(uuid,text,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.submit_pending_business_verification_intake(uuid,text,uuid,uuid) to authenticated;

comment on table public.country_kyb_intake_policies is
  'Country-specific intake gate. It is separate from commercial launch readiness and does not authorize activation, trials, entitlements, billing or Stripe.';
comment on function public.resolve_country_kyb_intake_internal(uuid) is
  'Fail-closed intake resolver. Synthetic is a governed TEST_ONLY mode, never inferred from document contents.';
commit;
