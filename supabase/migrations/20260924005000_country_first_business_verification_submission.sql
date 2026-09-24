-- Phase 7D.2: pending-only owner submission and least-privilege review reads.
-- No real-verification writer, country release, or billing activation is added.
begin;

create table public.business_verification_owner_submissions (
  request_id uuid primary key,
  correlation_id uuid not null,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  method text not null check (method='MANUAL'),
  register_type text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  profile_revision_id uuid not null references public.business_verified_profile_revisions(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique(restaurant_id,payload_sha256)
);
alter table public.business_verification_owner_submissions enable row level security;
revoke all on public.business_verification_owner_submissions from public,anon,authenticated,service_role;
create trigger business_verification_owner_submission_immutable
  before update or delete or truncate on public.business_verification_owner_submissions
  for each statement execute function public.protect_business_verification_append_only();

create or replace function public.submit_pending_business_verification(
  input_restaurant_id uuid,input_method text,input_register_type text,
  input_request_id uuid,input_correlation_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,extensions,pg_temp as $function$
declare
  actor uuid:=auth.uid();
  restaurant_row public.restaurants%rowtype;
  branch_row public.branches%rowtype;
  legal_row public.organization_legal_profiles%rowtype;
  case_row public.business_verification_cases%rowtype;
  prior public.business_verification_owner_submissions%rowtype;
  profile_id uuid;
  revision_number integer;
  payload_hash text;
  country_value text;
begin
  if actor is null or auth.role() is distinct from 'authenticated'
    or input_restaurant_id is null or input_request_id is null or input_correlation_id is null
    or input_method is distinct from 'MANUAL'
    or length(trim(coalesce(input_register_type,''))) not between 2 and 120 then
    raise exception 'BUSINESS_VERIFICATION_SUBMISSION_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('business-verification:'||input_restaurant_id::text,0));
  select * into restaurant_row from public.restaurants where id=input_restaurant_id for update;
  if restaurant_row.id is null or restaurant_row.owner_id is distinct from actor
    or not exists(select 1 from public.restaurant_members m
      where m.restaurant_id=restaurant_row.id and m.organization_id=restaurant_row.organization_id
        and m.user_id=actor and m.role='owner') then
    raise exception 'BUSINESS_VERIFICATION_OWNER_REQUIRED' using errcode='42501';
  end if;
  select * into prior from public.business_verification_owner_submissions where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.restaurant_id is distinct from restaurant_row.id or prior.owner_id is distinct from actor
      or prior.method is distinct from input_method
      or prior.register_type is distinct from trim(input_register_type)
      or prior.correlation_id is distinct from input_correlation_id then
      raise exception 'BUSINESS_VERIFICATION_IDEMPOTENCY_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('status','PENDING_ACTIVATION','case_id',prior.case_id,
      'request_id',input_request_id,'idempotent',true);
  end if;
  if public.restaurant_activation_state_internal(restaurant_row.id)->>'status' is distinct from 'PENDING_ACTIVATION' then
    raise exception 'BUSINESS_VERIFICATION_PENDING_REQUIRED' using errcode='42501';
  end if;
  select * into branch_row from public.branches where id=restaurant_row.primary_branch_id
    and restaurant_id=restaurant_row.id and organization_id=restaurant_row.organization_id;
  if branch_row.id is null then
    raise exception 'BUSINESS_VERIFICATION_BRANCH_REQUIRED' using errcode='42501';
  end if;
  country_value:=public.require_launch_country(upper(trim(branch_row.country)));
  if (public.country_launch_readiness_snapshot(country_value)->>'ready')::boolean is distinct from true then
    raise exception 'BUSINESS_VERIFICATION_COUNTRY_NOT_READY' using errcode='42501';
  end if;
  select * into legal_row from public.organization_legal_profiles
    where organization_id=restaurant_row.organization_id;
  if legal_row.id is null or length(trim(coalesce(legal_row.company_name,'')))<2
    or length(trim(coalesce(legal_row.legal_form,'')))<2
    or length(trim(coalesce(legal_row.email,'')))<3
    or length(trim(coalesce(legal_row.responsible_person,'')))<2 then
    raise exception 'BUSINESS_VERIFICATION_PROFILE_INCOMPLETE' using errcode='22023';
  end if;
  if legal_row.registered_address_source='restaurant' then
    if legal_row.address_source_restaurant_id is distinct from restaurant_row.id
      or legal_row.address_source_branch_id is distinct from branch_row.id then
      raise exception 'BUSINESS_VERIFICATION_ADDRESS_SOURCE_INVALID' using errcode='42501';
    end if;
    if length(trim(coalesce(branch_row.address,'')))<2
      or length(trim(coalesce(branch_row.postal_code,'')))<2
      or length(trim(coalesce(branch_row.city,'')))<2 then
      raise exception 'BUSINESS_VERIFICATION_ADDRESS_INCOMPLETE' using errcode='22023';
    end if;
  elsif length(trim(coalesce(legal_row.street,'')))<2
    or length(trim(coalesce(legal_row.postal_code,'')))<2
    or length(trim(coalesce(legal_row.city,'')))<2
    or upper(trim(coalesce(legal_row.country,''))) is distinct from country_value then
    raise exception 'BUSINESS_VERIFICATION_ADDRESS_INCOMPLETE' using errcode='22023';
  end if;
  payload_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
    'restaurant',restaurant_row.id,'owner',actor,'country',country_value,
    'method',input_method,'register_type',trim(input_register_type),
    'legal_profile',to_jsonb(legal_row)-'updated_at'-'updated_by',
    'branch_address',jsonb_build_object('street',branch_row.address,
      'postal_code',branch_row.postal_code,'city',branch_row.city))::text,'UTF8'),'sha256'),'hex');
  select * into case_row from public.business_verification_cases
    where restaurant_id=restaurant_row.id for update;
  if case_row.id is not null and case_row.status <> 'PENDING_ACTIVATION' then
    raise exception 'BUSINESS_VERIFICATION_CASE_ALREADY_REVIEWED' using errcode='42501';
  end if;
  select * into prior from public.business_verification_owner_submissions
    where restaurant_id=restaurant_row.id and payload_sha256=payload_hash;
  if prior.request_id is not null then
    return jsonb_build_object('status','PENDING_ACTIVATION','case_id',prior.case_id,
      'request_id',prior.request_id,'idempotent',true);
  end if;
  if case_row.id is null then
    insert into public.business_verification_cases(restaurant_id,country_code,
      verification_method,status,test_only,created_by)
    values(restaurant_row.id,country_value,input_method,'PENDING_ACTIVATION',
      exists(select 1 from public.platform_test_tenant_registry t
        where t.restaurant_id=restaurant_row.id and t.deleted_at is null
          and t.restaurant_name=restaurant_row.name
          and t.organization_id=restaurant_row.organization_id
          and t.owner_user_id=restaurant_row.owner_id),actor)
    returning * into case_row;
  elsif case_row.country_code is distinct from country_value
    or case_row.verification_method is distinct from input_method then
    raise exception 'BUSINESS_VERIFICATION_CASE_CONFLICT' using errcode='23505';
  end if;
  select coalesce(max(revision),0)+1 into revision_number
    from public.business_verified_profile_revisions where case_id=case_row.id;
  insert into public.business_verified_profile_revisions(case_id,revision,legal_name,legal_form,
    register_type,register_identifier,vat_id,business_street,business_postal_code,
    business_city,business_country,authorized_representative,supersedes_revision_id,
    status,decision_ref,created_by)
  values(case_row.id,revision_number,trim(legal_row.company_name),trim(legal_row.legal_form),
    trim(input_register_type),
    nullif(trim(coalesce(legal_row.commercial_register_number,'')),''),
    nullif(trim(coalesce(legal_row.vat_id,'')),''),
    case when legal_row.registered_address_source='restaurant' then trim(branch_row.address) else trim(legal_row.street) end,
    case when legal_row.registered_address_source='restaurant' then trim(branch_row.postal_code) else trim(legal_row.postal_code) end,
    case when legal_row.registered_address_source='restaurant' then trim(branch_row.city) else trim(legal_row.city) end,
    country_value,trim(legal_row.responsible_person),
    (select id from public.business_verified_profile_revisions where case_id=case_row.id
      order by revision desc limit 1),'REVIEWED_DRAFT',extensions.gen_random_uuid(),actor)
  returning id into profile_id;
  insert into public.business_verification_owner_submissions(request_id,correlation_id,
    restaurant_id,owner_id,method,register_type,payload_sha256,case_id,profile_revision_id)
  values(input_request_id,input_correlation_id,restaurant_row.id,actor,input_method,
    trim(input_register_type),payload_hash,case_row.id,profile_id);
  return jsonb_build_object('status','PENDING_ACTIVATION','case_id',case_row.id,
    'request_id',input_request_id,'idempotent',false);
end $function$;
revoke all on function public.submit_pending_business_verification(uuid,text,text,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.submit_pending_business_verification(uuid,text,text,uuid,uuid) to authenticated;

create or replace function public.get_business_verification_owner_status(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare answer jsonb;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or not exists(select 1 from public.restaurants r join public.restaurant_members m
      on m.restaurant_id=r.id and m.organization_id=r.organization_id
        and m.user_id=auth.uid() and m.role='owner'
      where r.id=input_restaurant_id and r.owner_id=auth.uid()) then
    raise exception 'BUSINESS_VERIFICATION_OWNER_REQUIRED' using errcode='42501';
  end if;
  select jsonb_build_object('status',coalesce(c.status,'PENDING_ACTIVATION'),
    'submission_allowed',c.status is null or c.status='PENDING_ACTIVATION',
    'pending_tenant',(public.restaurant_activation_state_internal(r.id)->>'status')='PENDING_ACTIVATION',
    'submitted_at',c.requested_at,'review_started_at',c.review_started_at,
    'rejection_reason',case when c.status='REJECTED' then
      (select d.redacted_reason from public.business_verification_decisions d
        where d.case_id=c.id and d.action='REJECT'
        order by d.decided_at desc,d.id desc limit 1) else null end,
    'profile_revision', (select max(p.revision) from public.business_verified_profile_revisions p
      where p.case_id=c.id)) into answer
  from public.restaurants r left join public.business_verification_cases c on c.restaurant_id=r.id
  where r.id=input_restaurant_id;
  return answer;
end $function$;
revoke all on function public.get_business_verification_owner_status(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_business_verification_owner_status(uuid) to authenticated;

create or replace function public.list_business_verification_queue()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false) is not true then
    raise exception 'BUSINESS_VERIFICATION_ADMIN_REQUIRED' using errcode='42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('case_id',c.id,
    'restaurant_id',c.restaurant_id,'country',c.country_code,
    'method',c.verification_method,'status',c.status,'submitted_at',c.requested_at)
    order by c.requested_at desc,c.id),'[]'::jsonb)
    from public.business_verification_cases c);
end $function$;
revoke all on function public.list_business_verification_queue() from public,anon,authenticated,service_role;
grant execute on function public.list_business_verification_queue() to authenticated;

create or replace function public.get_business_verification_admin_detail(input_case_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare answer jsonb;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false) is not true then
    raise exception 'BUSINESS_VERIFICATION_ADMIN_REQUIRED' using errcode='42501';
  end if;
  select jsonb_build_object(
    'case_id',c.id,'restaurant_id',c.restaurant_id,'restaurant_name',r.name,
    'country',c.country_code,'method',c.verification_method,'status',c.status,
    'allowed_actions',to_jsonb(array_remove(array[
      case when c.status in ('PENDING_ACTIVATION','REJECTED')
        and c.country_code=(select upper(trim(b.country)) from public.branches b
          where b.id=r.primary_branch_id and b.restaurant_id=r.id
            and b.organization_id=r.organization_id)
        then 'START_REVIEW' end,
      case when c.status='IN_REVIEW' then 'REJECT' end,
      case when c.status='VERIFIED' then 'SUSPEND' end,
      case when c.status in ('IN_REVIEW','VERIFIED','SUSPENDED') then 'CORRECT_PROFILE' end,
      case when c.status in ('IN_REVIEW','REJECTED','PENDING_ACTIVATION')
        and c.test_only
        and (select environment from public.business_verification_environment where singleton)='STAGING'
        and exists(select 1 from public.platform_test_tenant_registry t
          where t.restaurant_id=r.id and t.deleted_at is null
            and t.restaurant_name=r.name and t.organization_id=r.organization_id
            and t.owner_user_id=r.owner_id)
        and not exists(select 1 from public.business_verification_test_receipts z
          where z.restaurant_id=r.id and z.action='GRANTED' and z.expires_at>statement_timestamp()
            and z.id=(select z2.id from public.business_verification_test_receipts z2
              where z2.restaurant_id=r.id order by z2.effective_at desc,z2.id desc limit 1))
        then 'GRANT_TEST' end,
      case when (select z.action from public.business_verification_test_receipts z
        where z.restaurant_id=r.id order by z.effective_at desc,z.id desc limit 1)='GRANTED'
        then 'REVOKE_TEST' end
    ]::text[],null)),
    'submitted_at',c.requested_at,'review_started_at',c.review_started_at,
    'decided_at',c.decided_at,
    'profiles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'revision',p.revision,'legal_name',p.legal_name,
      'legal_form',p.legal_form,'register_type',p.register_type,
      'register_identifier',p.register_identifier,'vat_id',p.vat_id,
      'business_street',p.business_street,'business_postal_code',p.business_postal_code,
      'business_city',p.business_city,'business_country',p.business_country,
      'authorized_representative',p.authorized_representative,'status',p.status,
      'created_at',p.created_at) order by p.revision desc)
      from public.business_verified_profile_revisions p where p.case_id=c.id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object('action',d.action,
      'previous_status',d.previous_status,'new_status',d.new_status,
      'reason_code',d.reason_code,'reason',d.redacted_reason,'decided_at',d.decided_at)
      order by d.decided_at desc,d.id)
      from public.business_verification_decisions d where d.case_id=c.id),'[]'::jsonb),
    'evidence',coalesce((select jsonb_agg(jsonb_build_object('evidence_type',e.evidence_type,
      'content_hash',e.content_hash,'retention_class',e.retention_class,'uploaded_at',e.uploaded_at,
      'reviewed_at',e.reviewed_at) order by e.uploaded_at desc,e.id)
      from public.business_verification_evidence_metadata e where e.case_id=c.id),'[]'::jsonb))
  into answer from public.business_verification_cases c
    join public.restaurants r on r.id=c.restaurant_id where c.id=input_case_id;
  if answer is null then raise exception 'BUSINESS_VERIFICATION_NOT_FOUND' using errcode='P0002'; end if;
  return answer;
end $function$;
revoke all on function public.get_business_verification_admin_detail(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_business_verification_admin_detail(uuid) to authenticated;

commit;
