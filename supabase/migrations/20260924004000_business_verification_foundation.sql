-- 7C.6C5A / 7D.1: local foundation only. Real verification and checkout remain disabled.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260924004000',0));

create table if not exists public.business_verification_environment (
  singleton boolean primary key default true check (singleton),
  environment text not null default 'DISABLED' check (environment in ('DISABLED','STAGING')),
  changed_at timestamptz not null default clock_timestamp(),
  change_ref text not null default 'LOCAL_MIGRATION_DEFAULT'
);
insert into public.business_verification_environment(singleton,environment,change_ref)
values(true,'DISABLED','LOCAL_MIGRATION_DEFAULT') on conflict (singleton) do nothing;

create table if not exists public.business_verification_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete restrict,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  verification_method text not null check (verification_method in ('MANUAL','DIGITAL')),
  status text not null default 'PENDING_ACTIVATION' check (status in
    ('PENDING_ACTIVATION','IN_REVIEW','VERIFIED','REJECTED','SUSPENDED')),
  environment_scope text not null default 'ALL' check (environment_scope='ALL'),
  test_only boolean not null default false,
  immutable_ref uuid not null default extensions.gen_random_uuid() unique,
  requested_at timestamptz not null default clock_timestamp(),
  review_started_at timestamptz,
  decided_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  check (status <> 'VERIFIED' or (decided_at is not null and expires_at is not null))
);

create table if not exists public.business_verified_profile_revisions (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  revision integer not null check (revision>0),
  legal_name text not null check (length(trim(legal_name)) between 2 and 240),
  legal_form text not null check (length(trim(legal_form)) between 2 and 120),
  register_type text,
  register_identifier text,
  vat_id text,
  business_street text not null check (length(trim(business_street)) between 2 and 240),
  business_postal_code text not null check (length(trim(business_postal_code)) between 2 and 40),
  business_city text not null check (length(trim(business_city)) between 2 and 120),
  business_country text not null check (business_country ~ '^[A-Z]{2}$'),
  authorized_representative text,
  effective_from timestamptz not null default clock_timestamp(),
  supersedes_revision_id uuid references public.business_verified_profile_revisions(id) on delete restrict,
  status text not null default 'REVIEWED_DRAFT' check (status in ('REVIEWED_DRAFT','VERIFIED')),
  decision_ref uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique(case_id,revision),
  unique(decision_ref)
);

create table if not exists public.business_verification_test_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  action text not null check (action in ('GRANTED','REVOKED')),
  grant_id uuid references public.business_verification_test_receipts(id) on delete restrict,
  environment text not null default 'STAGING' check (environment='STAGING'),
  purpose text not null default 'SYNTHETIC_STAGING_BILLING_TEST'
    check (purpose='SYNTHETIC_STAGING_BILLING_TEST'),
  effective_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz,
  actor_id uuid not null references auth.users(id) on delete restrict,
  decision_ref uuid not null unique,
  check ((action='GRANTED' and grant_id is null and expires_at is not null
    and expires_at>effective_at and expires_at<=effective_at+interval '24 hours')
    or (action='REVOKED' and grant_id is not null and expires_at is null))
);
create index if not exists business_verification_test_receipts_latest_idx
  on public.business_verification_test_receipts(restaurant_id,effective_at desc,id);

create table if not exists public.business_verification_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  previous_status text,
  new_status text not null,
  action text not null check(action in
    ('START_REVIEW','REJECT','SUSPEND','CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST')),
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  redacted_reason text not null check (length(trim(redacted_reason)) between 10 and 500),
  actor_id uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default clock_timestamp(),
  request_id uuid not null unique,
  correlation_id uuid not null,
  confirmation_sha256 text not null check (confirmation_sha256 ~ '^[0-9a-f]{64}$'),
  environment text not null check(environment in ('ALL','STAGING')),
  test_only boolean not null,
  profile_revision_id uuid references public.business_verified_profile_revisions(id) on delete restrict,
  test_receipt_id uuid references public.business_verification_test_receipts(id) on delete restrict
);

create table if not exists public.business_verification_requests (
  request_id uuid primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  decision_id uuid not null unique references public.business_verification_decisions(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.business_verification_evidence_metadata (
  id uuid primary key default extensions.gen_random_uuid(),
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  evidence_type text not null check(evidence_type ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  storage_reference text not null check(storage_reference !~ '^(https?://|/)' and length(storage_reference)<=300),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  mime_type text not null check(length(mime_type) between 3 and 100),
  retention_class text not null check(retention_class ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  uploaded_at timestamptz not null,
  reviewed_at timestamptz,
  unique(case_id,content_hash)
);

alter table public.business_verification_environment enable row level security;
alter table public.business_verification_cases enable row level security;
alter table public.business_verified_profile_revisions enable row level security;
alter table public.business_verification_test_receipts enable row level security;
alter table public.business_verification_decisions enable row level security;
alter table public.business_verification_requests enable row level security;
alter table public.business_verification_evidence_metadata enable row level security;
revoke all on public.business_verification_environment,public.business_verification_cases,
  public.business_verified_profile_revisions,public.business_verification_test_receipts,
  public.business_verification_decisions,public.business_verification_requests,
  public.business_verification_evidence_metadata from public,anon,authenticated,service_role;

create or replace function public.protect_business_verification_append_only()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $function$
begin
  raise exception 'BUSINESS_VERIFICATION_AUDIT_IMMUTABLE' using errcode='42501';
end $function$;
revoke all on function public.protect_business_verification_append_only() from public,anon,authenticated,service_role;
drop trigger if exists business_verification_profile_immutable on public.business_verified_profile_revisions;
create trigger business_verification_profile_immutable before update or delete or truncate
  on public.business_verified_profile_revisions for each statement execute function public.protect_business_verification_append_only();
drop trigger if exists business_verification_test_immutable on public.business_verification_test_receipts;
create trigger business_verification_test_immutable before update or delete or truncate
  on public.business_verification_test_receipts for each statement execute function public.protect_business_verification_append_only();
drop trigger if exists business_verification_decision_immutable on public.business_verification_decisions;
create trigger business_verification_decision_immutable before update or delete or truncate
  on public.business_verification_decisions for each statement execute function public.protect_business_verification_append_only();
drop trigger if exists business_verification_request_immutable on public.business_verification_requests;
create trigger business_verification_request_immutable before update or delete or truncate
  on public.business_verification_requests for each statement execute function public.protect_business_verification_append_only();
drop trigger if exists business_verification_evidence_immutable on public.business_verification_evidence_metadata;
create trigger business_verification_evidence_immutable before update or delete or truncate
  on public.business_verification_evidence_metadata for each statement execute function public.protect_business_verification_append_only();

-- Server-side only. This resolver is not an activation writer and cannot bypass other gates.
create or replace function public.resolve_business_verification_readiness_internal(
  input_restaurant_id uuid,input_environment text,input_as_of timestamptz default statement_timestamp()
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  case_row public.business_verification_cases%rowtype;
  latest_test public.business_verification_test_receipts%rowtype;
  marker public.platform_test_tenant_registry%rowtype;
  restaurant_row public.restaurants%rowtype;
  branch_country text;
  runtime_environment text;
  real_ready boolean:=false;
  test_ready boolean:=false;
  status_value text:='PENDING_ACTIVATION';
  reason_value text:='BUSINESS_VERIFICATION_PENDING';
begin
  if input_restaurant_id is null or input_environment not in ('TEST','LIVE')
    or input_environment is null or input_as_of is null or not isfinite(input_as_of) then
    return jsonb_build_object('status','UNAVAILABLE','real_verified',false,
      'staging_test_verified',false,'checkout_allowed',false,'live_activation_allowed',false,
      'block_code','BUSINESS_VERIFICATION_CONTEXT_INVALID');
  end if;
  select * into restaurant_row from public.restaurants where id=input_restaurant_id;
  if restaurant_row.id is null then
    return jsonb_build_object('status','UNAVAILABLE','real_verified',false,
      'staging_test_verified',false,'checkout_allowed',false,'live_activation_allowed',false,
      'block_code','BUSINESS_VERIFICATION_NOT_FOUND');
  end if;
  select * into case_row from public.business_verification_cases where restaurant_id=input_restaurant_id;
  select upper(trim(country)) into branch_country from public.branches
    where id=restaurant_row.primary_branch_id and restaurant_id=restaurant_row.id
      and organization_id=restaurant_row.organization_id;
  select environment into runtime_environment from public.business_verification_environment where singleton;
  if case_row.id is not null then
    status_value:=case_row.status;
    if case_row.country_code=branch_country and case_row.status='VERIFIED' and case_row.decided_at<=input_as_of
      and case_row.expires_at>input_as_of and case_row.test_only=false
      and exists(select 1 from public.business_verified_profile_revisions p
        where p.case_id=case_row.id and p.status='VERIFIED'
          and p.business_country=case_row.country_code and p.effective_from<=input_as_of) then
      real_ready:=true;
    end if;
  end if;
  if input_environment='TEST' and runtime_environment='STAGING' and case_row.id is not null
    and case_row.country_code=branch_country
    and case_row.test_only=true then
    select * into marker from public.platform_test_tenant_registry
      where restaurant_id=input_restaurant_id and deleted_at is null;
    select * into latest_test from public.business_verification_test_receipts
      where restaurant_id=input_restaurant_id order by effective_at desc,id desc limit 1;
    test_ready:=marker.restaurant_id is not null
      and marker.organization_id=restaurant_row.organization_id
      and marker.owner_user_id=restaurant_row.owner_id
      and marker.restaurant_name=restaurant_row.name
      and latest_test.action='GRANTED' and latest_test.effective_at<=input_as_of
      and latest_test.expires_at>input_as_of;
  end if;
  if real_ready then reason_value:='BUSINESS_VERIFICATION_READY';
  elsif test_ready then reason_value:='STAGING_TEST_VERIFIED';
  elsif status_value='SUSPENDED' then reason_value:='BUSINESS_VERIFICATION_SUSPENDED';
  elsif status_value='REJECTED' then reason_value:='BUSINESS_VERIFICATION_REJECTED';
  elsif latest_test.action='GRANTED' and latest_test.expires_at<=input_as_of then
    reason_value:='STAGING_TEST_EXPIRED';
  end if;
  return jsonb_build_object('status',status_value,'country_code',case_row.country_code,
    'verification_method',case_row.verification_method,'real_verified',real_ready,
    'staging_test_verified',test_ready,'valid_until',case when test_ready then latest_test.expires_at
      when real_ready then case_row.expires_at else null end,
    'checkout_allowed',false,'live_activation_allowed',false,'block_code',reason_value);
end $function$;
revoke all on function public.resolve_business_verification_readiness_internal(uuid,text,timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.get_business_verification_readiness(
  input_restaurant_id uuid,input_environment text default 'TEST'
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
begin
  if auth.uid() is null or not (
    coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false)
    or exists(select 1 from public.restaurants r join public.restaurant_members m
      on m.restaurant_id=r.id and m.user_id=auth.uid() and m.role='owner'
      where r.id=input_restaurant_id and r.owner_id=auth.uid())) then
    raise exception 'BUSINESS_VERIFICATION_READ_DENIED' using errcode='42501';
  end if;
  return public.resolve_business_verification_readiness_internal(input_restaurant_id,input_environment,statement_timestamp());
end $function$;
revoke all on function public.get_business_verification_readiness(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_business_verification_readiness(uuid,text) to authenticated;

create or replace function public.get_business_verification_profile(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare profile_row public.business_verified_profile_revisions%rowtype;
begin
  if auth.uid() is null or not (
    coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false)
    or exists(select 1 from public.restaurants r join public.restaurant_members m
      on m.restaurant_id=r.id and m.user_id=auth.uid() and m.role='owner'
      where r.id=input_restaurant_id and r.owner_id=auth.uid())) then
    raise exception 'BUSINESS_VERIFICATION_READ_DENIED' using errcode='42501';
  end if;
  select p.* into profile_row from public.business_verified_profile_revisions p
    join public.business_verification_cases c on c.id=p.case_id
    where c.restaurant_id=input_restaurant_id order by p.revision desc limit 1;
  if profile_row.id is null then return jsonb_build_object('status','NOT_AVAILABLE'); end if;
  return jsonb_build_object('status',profile_row.status,'revision',profile_row.revision,
    'legal_name',profile_row.legal_name,'legal_form',profile_row.legal_form,
    'register_type',profile_row.register_type,'register_identifier',profile_row.register_identifier,
    'vat_id',profile_row.vat_id,'business_street',profile_row.business_street,
    'business_postal_code',profile_row.business_postal_code,'business_city',profile_row.business_city,
    'business_country',profile_row.business_country,'effective_from',profile_row.effective_from);
end $function$;
revoke all on function public.get_business_verification_profile(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_business_verification_profile(uuid) to authenticated;

-- A single narrow mutation surface. Real VERIFIED is deliberately unavailable.
create or replace function public.manage_business_verification(
  input_restaurant_id uuid,input_action text,input_method text,input_reason_code text,
  input_reason text,input_profile jsonb,input_request_id uuid,input_correlation_id uuid,
  input_confirmation text
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare
  actor uuid:=auth.uid();
  r public.restaurants%rowtype;
  c public.business_verification_cases%rowtype;
  old_profile public.business_verified_profile_revisions%rowtype;
  latest_test public.business_verification_test_receipts%rowtype;
  prior_request public.business_verification_requests%rowtype;
  decision_id uuid:=extensions.gen_random_uuid();
  profile_id uuid;
  receipt_id uuid;
  before_status text;
  after_status text;
  country_value text;
  payload_hash text;
  confirmation_hash text;
  result_value jsonb;
  system_environment text;
  now_value timestamptz:=clock_timestamp();
begin
  if actor is null or auth.role() is distinct from 'authenticated'
    or coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false) is not true then
    raise exception 'BUSINESS_VERIFICATION_ADMIN_REQUIRED' using errcode='42501';
  end if;
  perform public.require_recent_platform_auth_internal();
  if input_restaurant_id is null or input_request_id is null or input_correlation_id is null
    or input_action not in ('START_REVIEW','REJECT','SUSPEND','CORRECT_PROFILE','GRANT_TEST','REVOKE_TEST')
    or input_action is null or input_reason_code !~ '^[A-Z][A-Z0-9_]{2,79}$'
    or length(trim(coalesce(input_reason,''))) not between 10 and 500 then
    raise exception 'BUSINESS_VERIFICATION_REQUEST_INVALID' using errcode='22023';
  end if;
  -- Audit notes must not contain obvious contact or document identifiers.
  if input_reason ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    or input_reason ~ '[0-9]{5,}' or input_reason ~* '(https?://|passport|ausweisnummer|iban)' then
    raise exception 'BUSINESS_VERIFICATION_REASON_NOT_REDACTED' using errcode='22023';
  end if;
  if input_action='START_REVIEW' and input_method not in ('MANUAL','DIGITAL') then
    raise exception 'BUSINESS_VERIFICATION_METHOD_INVALID' using errcode='22023';
  end if;
  if input_action<>'START_REVIEW' and input_method is not null then
    raise exception 'BUSINESS_VERIFICATION_METHOD_IMMUTABLE' using errcode='22023';
  end if;
  if input_action<>'CORRECT_PROFILE' and input_profile is not null then
    raise exception 'BUSINESS_VERIFICATION_PROFILE_UNEXPECTED' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('business-verification:'||input_restaurant_id::text,0));
  select * into r from public.restaurants where id=input_restaurant_id for update;
  if r.id is null then raise exception 'BUSINESS_VERIFICATION_NOT_FOUND' using errcode='P0002'; end if;
  if input_confirmation is distinct from
    'CONFIRMED:'||r.name||':'||r.id::text||':'||input_action then
    raise exception 'BUSINESS_VERIFICATION_CONFIRMATION_REQUIRED' using errcode='42501';
  end if;
  confirmation_hash:=encode(extensions.digest(convert_to(input_confirmation,'UTF8'),'sha256'),'hex');
  payload_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'restaurant',input_restaurant_id,'action',input_action,'method',input_method,
    'reason_code',input_reason_code,'reason',trim(input_reason),'profile',input_profile,
    'correlation',input_correlation_id,'confirmation_hash',confirmation_hash)::text,'UTF8'),'sha256'),'hex');
  select * into prior_request from public.business_verification_requests where request_id=input_request_id;
  if prior_request.request_id is not null then
    if prior_request.restaurant_id is distinct from input_restaurant_id
      or prior_request.actor_id is distinct from actor
      or prior_request.payload_sha256 is distinct from payload_hash then
      raise exception 'BUSINESS_VERIFICATION_IDEMPOTENCY_CONFLICT' using errcode='23505';
    end if;
    return prior_request.result || jsonb_build_object('idempotent',true);
  end if;
  select * into c from public.business_verification_cases where restaurant_id=r.id for update;
  before_status:=coalesce(c.status,'PENDING_ACTIVATION');
  after_status:=before_status;
  select environment into system_environment from public.business_verification_environment where singleton;
  if input_action='START_REVIEW' then
    if c.id is not null and c.status not in ('PENDING_ACTIVATION','REJECTED') then
      raise exception 'BUSINESS_VERIFICATION_TRANSITION_BLOCKED' using errcode='42501';
    end if;
    select upper(trim(country)) into country_value from public.branches
      where id=r.primary_branch_id and restaurant_id=r.id and organization_id=r.organization_id;
    if country_value !~ '^[A-Z]{2}$' or country_value is null then
      raise exception 'BUSINESS_VERIFICATION_COUNTRY_UNAVAILABLE' using errcode='55000';
    end if;
    if c.id is null then
      insert into public.business_verification_cases(restaurant_id,country_code,verification_method,
        status,test_only,created_by,review_started_at)
      values(r.id,country_value,input_method,'IN_REVIEW',
        exists(select 1 from public.platform_test_tenant_registry t
          where t.restaurant_id=r.id and t.deleted_at is null),actor,now_value)
      returning * into c;
    else
      if c.country_code is distinct from country_value then
        raise exception 'BUSINESS_VERIFICATION_COUNTRY_CHANGE_REQUIRES_NEW_REVIEW' using errcode='42501';
      end if;
      update public.business_verification_cases set status='IN_REVIEW',
        verification_method=input_method,review_started_at=now_value,decided_at=null,
        expires_at=null,updated_at=now_value where id=c.id returning * into c;
    end if;
    after_status:='IN_REVIEW';
  elsif c.id is null then
    raise exception 'BUSINESS_VERIFICATION_CASE_REQUIRED' using errcode='42501';
  elsif input_action='REJECT' then
    if c.status<>'IN_REVIEW' then raise exception 'BUSINESS_VERIFICATION_TRANSITION_BLOCKED' using errcode='42501'; end if;
    update public.business_verification_cases set status='REJECTED',decided_at=now_value,
      expires_at=null,updated_at=now_value where id=c.id returning * into c;
    after_status:='REJECTED';
  elsif input_action='SUSPEND' then
    if c.status<>'VERIFIED' then raise exception 'BUSINESS_VERIFICATION_TRANSITION_BLOCKED' using errcode='42501'; end if;
    update public.business_verification_cases set status='SUSPENDED',decided_at=now_value,
      expires_at=null,updated_at=now_value where id=c.id returning * into c;
    after_status:='SUSPENDED';
  elsif input_action='CORRECT_PROFILE' then
    if c.status not in ('IN_REVIEW','VERIFIED','SUSPENDED') or jsonb_typeof(input_profile) is distinct from 'object'
      or length(trim(coalesce(input_profile->>'legal_name',''))) < 2
      or length(trim(coalesce(input_profile->>'legal_form',''))) < 2
      or length(trim(coalesce(input_profile->>'business_street',''))) < 2
      or length(trim(coalesce(input_profile->>'business_postal_code',''))) < 2
      or length(trim(coalesce(input_profile->>'business_city',''))) < 2 then
      raise exception 'BUSINESS_VERIFICATION_PROFILE_INVALID' using errcode='22023';
    end if;
    country_value:=upper(trim(coalesce(input_profile->>'business_country','')));
    if country_value !~ '^[A-Z]{2}$' then
      raise exception 'BUSINESS_VERIFICATION_PROFILE_COUNTRY_INVALID' using errcode='22023';
    end if;
    select * into old_profile from public.business_verified_profile_revisions
      where case_id=c.id order by revision desc limit 1;
    insert into public.business_verified_profile_revisions(case_id,revision,legal_name,legal_form,
      register_type,register_identifier,vat_id,business_street,business_postal_code,business_city,
      business_country,authorized_representative,supersedes_revision_id,status,decision_ref,created_by)
    values(c.id,coalesce(old_profile.revision,0)+1,trim(input_profile->>'legal_name'),
      trim(input_profile->>'legal_form'),nullif(trim(input_profile->>'register_type'),''),
      nullif(trim(input_profile->>'register_identifier'),''),nullif(trim(input_profile->>'vat_id'),''),
      trim(input_profile->>'business_street'),trim(input_profile->>'business_postal_code'),
      trim(input_profile->>'business_city'),country_value,
      nullif(trim(input_profile->>'authorized_representative'),''),old_profile.id,
      'REVIEWED_DRAFT',decision_id,actor) returning id into profile_id;
    -- Any correction invalidates previous verification; country change also requires new country review.
    update public.business_verification_cases set country_code=country_value,
      status='IN_REVIEW',decided_at=null,expires_at=null,updated_at=now_value
      where id=c.id returning * into c;
    after_status:='IN_REVIEW';
  elsif input_action='GRANT_TEST' then
    if system_environment<>'STAGING' or c.test_only is not true
      or c.status not in ('IN_REVIEW','REJECTED','PENDING_ACTIVATION')
      or not exists(select 1 from public.platform_test_tenant_registry t
        where t.restaurant_id=r.id and t.deleted_at is null and t.restaurant_name=r.name
          and t.organization_id=r.organization_id and t.owner_user_id=r.owner_id) then
      raise exception 'BUSINESS_VERIFICATION_TEST_NOT_ELIGIBLE' using errcode='42501';
    end if;
    select * into latest_test from public.business_verification_test_receipts
      where restaurant_id=r.id order by effective_at desc,id desc limit 1;
    if latest_test.action='GRANTED' and latest_test.expires_at>now_value then
      raise exception 'BUSINESS_VERIFICATION_TEST_ALREADY_ACTIVE' using errcode='42501';
    end if;
    insert into public.business_verification_test_receipts(case_id,restaurant_id,action,
      effective_at,expires_at,actor_id,decision_ref)
    values(c.id,r.id,'GRANTED',now_value,now_value+interval '24 hours',actor,decision_id)
    returning id into receipt_id;
  elsif input_action='REVOKE_TEST' then
    select * into latest_test from public.business_verification_test_receipts
      where restaurant_id=r.id order by effective_at desc,id desc limit 1;
    if latest_test.action is distinct from 'GRANTED' then
      raise exception 'BUSINESS_VERIFICATION_TEST_NOT_ACTIVE' using errcode='42501';
    end if;
    insert into public.business_verification_test_receipts(case_id,restaurant_id,action,
      grant_id,effective_at,actor_id,decision_ref)
    values(c.id,r.id,'REVOKED',latest_test.id,now_value,actor,decision_id)
    returning id into receipt_id;
  end if;
  result_value:=jsonb_build_object('status',after_status,'action',input_action,
    'request_id',input_request_id,'idempotent',false,'profile_revision_created',profile_id is not null,
    'test_receipt_created',receipt_id is not null);
  insert into public.business_verification_decisions(id,case_id,restaurant_id,previous_status,
    new_status,action,reason_code,redacted_reason,actor_id,request_id,correlation_id,
    confirmation_sha256,environment,test_only,profile_revision_id,test_receipt_id)
  values(decision_id,c.id,r.id,before_status,after_status,input_action,input_reason_code,
    trim(input_reason),actor,input_request_id,input_correlation_id,confirmation_hash,
    case when input_action in ('GRANT_TEST','REVOKE_TEST') then 'STAGING' else 'ALL' end,
    c.test_only,profile_id,receipt_id);
  insert into public.business_verification_requests(request_id,restaurant_id,actor_id,
    payload_sha256,result,decision_id)
  values(input_request_id,r.id,actor,payload_hash,result_value,decision_id);
  return result_value;
end $function$;
revoke all on function public.manage_business_verification(uuid,text,text,text,text,jsonb,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.manage_business_verification(uuid,text,text,text,text,jsonb,uuid,uuid,text)
  to authenticated;

-- Explicitly named real-verification entry point: unreleased until legal/document/storage gates exist.
create or replace function public.confirm_real_business_verification(input_restaurant_id uuid,
  input_request_id uuid,input_correlation_id uuid,input_confirmation text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
begin
  raise exception 'REAL_BUSINESS_VERIFICATION_NOT_RELEASED' using errcode='42501';
end $function$;
revoke all on function public.confirm_real_business_verification(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;

commit;
