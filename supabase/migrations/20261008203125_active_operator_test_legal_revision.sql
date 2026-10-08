-- Active BASIC operator-change legal proof, strictly STAGING/TEST_ONLY.
-- This is independent of real AT publication, legal readiness and intake.
begin;

create table public.active_operator_test_legal_events (
  id uuid primary key default extensions.gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  test_session_id text not null,
  material_revision bigint not null,
  operator_publication_id uuid not null references public.operator_publication_events(id) on delete restrict,
  request_id uuid not null unique,
  action text not null check (action in ('PUBLISH_TEST','WITHDRAW_TEST')),
  expected_previous_id uuid,
  bundle_id text not null check (bundle_id ~ '^at-test-[0-9a-f]{64}$'),
  bundle_hash text not null check (bundle_hash ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (restaurant_id,material_revision)
    references public.operator_material_revisions(restaurant_id,revision),
  check (bundle_id='at-test-'||bundle_hash)
);
create index active_operator_test_legal_events_latest
  on public.active_operator_test_legal_events(restaurant_id,event_sequence desc);
create table public.active_operator_test_legal_consents (
  request_id uuid primary key,
  publication_id uuid not null references public.active_operator_test_legal_events(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  test_session_id text not null,
  material_revision bigint not null,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  bundle_id text not null,
  bundle_hash text not null check (bundle_hash ~ '^[0-9a-f]{64}$'),
  legal_version text not null,
  legal_sha256 text not null check (legal_sha256 ~ '^[0-9a-f]{64}$'),
  privacy_version text not null,
  privacy_sha256 text not null check (privacy_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz not null default clock_timestamp(),
  unique(publication_id,auth_user_id)
);
create index active_operator_test_legal_consents_customer
  on public.active_operator_test_legal_consents(auth_user_id,restaurant_id,accepted_at desc);
alter table public.active_operator_test_legal_events enable row level security;
alter table public.active_operator_test_legal_consents enable row level security;
revoke all on public.active_operator_test_legal_events,
  public.active_operator_test_legal_consents from public,anon,authenticated,service_role;
revoke all on sequence public.active_operator_test_legal_events_event_sequence_seq
  from public,anon,authenticated,service_role;
create trigger active_operator_test_legal_events_immutable
  before update or delete or truncate on public.active_operator_test_legal_events
  for each statement execute function public.protect_legal_bundle_append_only();
create trigger active_operator_test_legal_consents_immutable
  before update or delete or truncate on public.active_operator_test_legal_consents
  for each statement execute function public.protect_legal_bundle_append_only();

-- The same scope check is used by the writer and by every customer read and
-- acceptance. A newer material epoch invalidates even byte-identical A.
create function public.active_operator_test_legal_context_internal(input_restaurant_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare r public.restaurants%rowtype; b public.branches%rowtype;
  marker public.platform_test_tenant_registry%rowtype;
  p public.operator_publication_events%rowtype; revision_value bigint;
  policy public.country_kyb_intake_policies%rowtype; environment_value text;
begin
  select environment into environment_value from public.business_verification_environment
    where singleton for share;
  select * into r from public.restaurants where id=input_restaurant_id for share;
  select * into b from public.branches where id=r.primary_branch_id for share;
  select * into marker from public.platform_test_tenant_registry
    where restaurant_id=input_restaurant_id and deleted_at is null for share;
  select * into policy from public.country_kyb_intake_policies
    where country_code='AT' for share;
  select max(revision) into revision_value from public.operator_material_revisions
    where restaurant_id=input_restaurant_id;
  select * into p from public.operator_publication_events
    where restaurant_id=input_restaurant_id order by created_at desc,id desc limit 1 for share;
  if environment_value is distinct from 'STAGING' or r.id is null
    or r.status is distinct from 'active'
    or public.restaurant_activation_state_internal(r.id)->>'status' is distinct from 'ACTIVE'
    or public.resolve_restaurant_entitlements_internal(r.id)->>'effective_plan' is distinct from 'BASIC'
    or b.id is null or b.restaurant_id is distinct from r.id
    or b.organization_id is distinct from r.organization_id or b.country is distinct from 'AT'
    or marker.restaurant_id is null or marker.organization_id is distinct from r.organization_id
    or marker.owner_user_id is distinct from r.owner_id
    or marker.restaurant_name is distinct from r.name
    or policy.real_intake_status is distinct from 'BLOCKED'
    or policy.test_only_intake_status is distinct from 'READY'
    or revision_value is null or p.id is null
    or p.material_revision is distinct from revision_value
    or p.organization_id is distinct from r.organization_id
    or p.branch_id is distinct from b.id
    or p.published_live_sha256 is distinct from public.operator_live_material_sha256_internal(r.id)
    or not public.operator_review_current_internal(r.id,'KYB',statement_timestamp()) then
    raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_SCOPE_DENIED' using errcode='42501';
  end if;
  return jsonb_build_object('restaurant_id',r.id,'organization_id',r.organization_id,
    'branch_id',b.id,'test_session_id',marker.test_session_id,
    'material_revision',revision_value,'operator_publication_id',p.id);
end;
$function$;
revoke all on function public.active_operator_test_legal_context_internal(uuid)
  from public,anon,authenticated,service_role;

create function public.set_platform_active_operator_test_legal(
  input_restaurant_id uuid,input_action text,input_manifest jsonb,
  input_expected_revision bigint,input_expected_previous_id uuid,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare context_value jsonb; previous public.active_operator_test_legal_events%rowtype;
  existing public.active_operator_test_legal_events%rowtype;
  manifest_value jsonb; hash_value text; event_value public.active_operator_test_legal_events%rowtype;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_request_id is null or input_action not in ('PUBLISH_TEST','WITHDRAW_TEST') then
    raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_REQUEST_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('active-operator-test-legal:'||input_restaurant_id::text,0));
  context_value:=public.active_operator_test_legal_context_internal(input_restaurant_id);
  if input_expected_revision is distinct from (context_value->>'material_revision')::bigint then
    raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_REVISION_STALE' using errcode='42501';
  end if;
  select * into existing from public.active_operator_test_legal_events where request_id=input_request_id;
  if existing.id is not null then
    if existing.actor_id is distinct from auth.uid() or existing.restaurant_id is distinct from input_restaurant_id
      or existing.action is distinct from input_action or existing.material_revision is distinct from input_expected_revision
      or existing.expected_previous_id is distinct from input_expected_previous_id
      or (input_action='PUBLISH_TEST' and existing.manifest is distinct from input_manifest)
      or (input_action='WITHDRAW_TEST' and input_manifest is not null) then
      raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_REPLAY_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('event_id',existing.id,'bundle_id',existing.bundle_id,
      'bundle_hash',existing.bundle_hash,'material_revision',existing.material_revision,
      'status',case existing.action when 'PUBLISH_TEST' then 'PUBLISHED_TEST' else 'WITHDRAWN_TEST' end,
      'idempotent',true,'test_only',true);
  end if;
  select * into previous from public.active_operator_test_legal_events
    where restaurant_id=input_restaurant_id order by event_sequence desc limit 1 for update;
  if input_expected_previous_id is distinct from previous.id then
    raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_EXPECTED_STATE_STALE' using errcode='42501';
  end if;
  if input_action='WITHDRAW_TEST' then
    if previous.id is null or previous.action is distinct from 'PUBLISH_TEST'
      or input_manifest is not null then
      raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_WITHDRAW_DENIED' using errcode='42501';
    end if;
    manifest_value:=previous.manifest; hash_value:=previous.bundle_hash;
  else
    if input_manifest->>'restaurant_id' is distinct from input_restaurant_id::text
      or input_manifest->>'organization_id' is distinct from context_value->>'organization_id'
      or input_manifest->>'branch_id' is distinct from context_value->>'branch_id'
      or input_manifest->>'test_session_id' is distinct from context_value->>'test_session_id'
      or input_manifest->>'material_revision' is distinct from context_value->>'material_revision'
      or input_manifest->>'operator_publication_id' is distinct from context_value->>'operator_publication_id' then
      raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_BINDING_MISMATCH' using errcode='42501';
    end if;
    hash_value:=public.at_legal_synthetic_manifest_hash_internal(input_manifest);
    -- Material revision B needs a genuinely new, immutable legal document
    -- version and body; renaming A or replaying a withdrawn version is not a
    -- new legal proof. Privacy may keep its own unchanged version.
    if exists(select 1 from public.at_legal_synthetic_test_publications old
        where old.restaurant_id=input_restaurant_id and old.action='PUBLISH_TEST'
          and (old.manifest->'legal'->>'version'=input_manifest->'legal'->>'version'
            or old.manifest->'legal'->>'sha256'=input_manifest->'legal'->>'sha256'))
      or exists(select 1 from public.active_operator_test_legal_events old
        where old.restaurant_id=input_restaurant_id and old.action='PUBLISH_TEST'
          and (old.manifest->'legal'->>'version'=input_manifest->'legal'->>'version'
            or old.manifest->'legal'->>'sha256'=input_manifest->'legal'->>'sha256')) then
      raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_VERSION_REUSED' using errcode='42501';
    end if;
    manifest_value:=input_manifest;
  end if;
  insert into public.active_operator_test_legal_events(
    restaurant_id,organization_id,branch_id,test_session_id,material_revision,
    operator_publication_id,request_id,action,expected_previous_id,bundle_id,bundle_hash,manifest,actor_id)
  values(input_restaurant_id,(context_value->>'organization_id')::uuid,
    (context_value->>'branch_id')::uuid,context_value->>'test_session_id',input_expected_revision,
    (context_value->>'operator_publication_id')::uuid,input_request_id,input_action,
    input_expected_previous_id,'at-test-'||hash_value,hash_value,manifest_value,auth.uid())
  returning * into event_value;
  return jsonb_build_object('event_id',event_value.id,'bundle_id',event_value.bundle_id,
    'bundle_hash',event_value.bundle_hash,'material_revision',event_value.material_revision,
    'status',case event_value.action when 'PUBLISH_TEST' then 'PUBLISHED_TEST' else 'WITHDRAWN_TEST' end,
    'idempotent',false,'test_only',true);
end;
$function$;
revoke all on function public.set_platform_active_operator_test_legal(uuid,text,jsonb,bigint,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.set_platform_active_operator_test_legal(uuid,text,jsonb,bigint,uuid,uuid)
  to authenticated;

create function public.require_active_operator_test_legal_customer_internal(
  input_restaurant_id uuid,input_branch_id uuid
) returns public.active_operator_test_legal_events language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare context_value jsonb; binding public.platform_terms_test_identities%rowtype;
  account_value public.customer_accounts%rowtype; membership_value public.customer_account_memberships%rowtype;
  customer_value public.customers%rowtype; publication public.active_operator_test_legal_events%rowtype;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or auth.jwt()->>'iss' is distinct from 'https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'
    or input_restaurant_id is null or input_branch_id is null
    or not exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid
      and s.user_id=auth.uid()) then
    raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_CUSTOMER_DENIED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('active-operator-test-legal:'||input_restaurant_id::text,0));
  context_value:=public.active_operator_test_legal_context_internal(input_restaurant_id);
  select * into binding from public.platform_terms_test_identities
    where auth_user_id=auth.uid() for share;
  select * into account_value from public.customer_accounts
    where auth_user_id=auth.uid() and disabled_at is null for share;
  select * into membership_value from public.customer_account_memberships
    where account_id=account_value.id and restaurant_id=input_restaurant_id for share;
  select * into customer_value from public.customers
    where id=membership_value.customer_id for share;
  select * into publication from public.active_operator_test_legal_events
    where restaurant_id=input_restaurant_id order by event_sequence desc limit 1 for share;
  if input_branch_id is distinct from (context_value->>'branch_id')::uuid
    or binding.auth_user_id is null or binding.restaurant_id is distinct from input_restaurant_id
    or binding.branch_id is distinct from input_branch_id
    or binding.test_session_id is distinct from context_value->>'test_session_id'
    or account_value.id is null or membership_value.id is null
    or customer_value.id is null or customer_value.restaurant_id is distinct from input_restaurant_id
    or customer_value.branch_id is distinct from input_branch_id
    or customer_value.is_test_customer is not true
    or customer_value.test_session_id is distinct from context_value->>'test_session_id'
    or exists(select 1 from public.customer_account_memberships foreign_membership
      where foreign_membership.account_id=account_value.id
        and foreign_membership.restaurant_id<>input_restaurant_id)
    or publication.id is null or publication.action is distinct from 'PUBLISH_TEST'
    or publication.branch_id is distinct from input_branch_id
    or publication.organization_id is distinct from (context_value->>'organization_id')::uuid
    or publication.test_session_id is distinct from context_value->>'test_session_id'
    or publication.material_revision is distinct from (context_value->>'material_revision')::bigint
    or publication.operator_publication_id is distinct from (context_value->>'operator_publication_id')::uuid
    or publication.bundle_hash is distinct from public.at_legal_synthetic_manifest_hash_internal(publication.manifest)
    or publication.bundle_id is distinct from 'at-test-'||publication.bundle_hash then
    raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_CUSTOMER_DENIED' using errcode='42501';
  end if;
  return publication;
end;
$function$;
revoke all on function public.require_active_operator_test_legal_customer_internal(uuid,uuid)
  from public,anon,authenticated,service_role;

create function public.get_customer_active_operator_test_legal(
  input_restaurant_slug text,input_branch_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare tenant_id uuid; publication public.active_operator_test_legal_events%rowtype;
  consent public.active_operator_test_legal_consents%rowtype;
begin
  select id into tenant_id from public.restaurants where slug=trim(input_restaurant_slug);
  publication:=public.require_active_operator_test_legal_customer_internal(tenant_id,input_branch_id);
  select * into consent from public.active_operator_test_legal_consents
    where publication_id=publication.id and auth_user_id=auth.uid();
  return jsonb_build_object('status','READY','test_only',true,
    'bundle_id',publication.bundle_id,'bundle_hash',publication.bundle_hash,
    'material_revision',publication.material_revision,
    'accepted',consent.request_id is not null,
    'accepted_at',consent.accepted_at,
    'terms',jsonb_build_object('text',publication.manifest->'legal'->>'body',
      'version',publication.manifest->'legal'->>'version','sha256',publication.manifest->'legal'->>'sha256'),
    'privacy',jsonb_build_object('text',publication.manifest->'privacy'->>'body',
      'version',publication.manifest->'privacy'->>'version','sha256',publication.manifest->'privacy'->>'sha256'));
exception when insufficient_privilege or invalid_parameter_value then
  return jsonb_build_object('status','UNAVAILABLE');
end;
$function$;
revoke all on function public.get_customer_active_operator_test_legal(text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_customer_active_operator_test_legal(text,uuid) to authenticated;

create function public.accept_customer_active_operator_test_legal(
  input_restaurant_slug text,input_branch_id uuid,input_bundle_id text,
  input_bundle_hash text,input_material_revision bigint,
  input_terms_accepted boolean,input_privacy_acknowledged boolean,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare tenant_id uuid; publication public.active_operator_test_legal_events%rowtype;
  prior public.active_operator_test_legal_consents%rowtype;
  customer_value uuid;
begin
  if input_request_id is null or input_terms_accepted is distinct from true
    or input_privacy_acknowledged is distinct from true then
    raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_EXPLICIT_ACCEPTANCE_REQUIRED' using errcode='22023';
  end if;
  select id into tenant_id from public.restaurants where slug=trim(input_restaurant_slug);
  publication:=public.require_active_operator_test_legal_customer_internal(tenant_id,input_branch_id);
  if publication.bundle_id is distinct from input_bundle_id
    or publication.bundle_hash is distinct from input_bundle_hash
    or publication.material_revision is distinct from input_material_revision then
    raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_BUNDLE_STALE' using errcode='42501';
  end if;
  select m.customer_id into customer_value from public.customer_accounts a
    join public.customer_account_memberships m on m.account_id=a.id
    where a.auth_user_id=auth.uid() and a.disabled_at is null and m.restaurant_id=tenant_id;
  select * into prior from public.active_operator_test_legal_consents where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.auth_user_id is distinct from auth.uid() or prior.restaurant_id is distinct from tenant_id
      or prior.branch_id is distinct from input_branch_id or prior.customer_id is distinct from customer_value
      or prior.publication_id is distinct from publication.id or prior.bundle_hash is distinct from input_bundle_hash then
      raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_REPLAY_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('request_id',prior.request_id,'accepted_at',prior.accepted_at,
      'bundle_id',prior.bundle_id,'bundle_hash',prior.bundle_hash,
      'material_revision',prior.material_revision,'idempotent',true,'test_only',true);
  end if;
  if exists(select 1 from public.active_operator_test_legal_consents
    where publication_id=publication.id and auth_user_id=auth.uid()) then
    raise exception 'ACTIVE_OPERATOR_TEST_LEGAL_ALREADY_ACCEPTED' using errcode='42501';
  end if;
  insert into public.active_operator_test_legal_consents(
    request_id,publication_id,restaurant_id,branch_id,test_session_id,material_revision,
    auth_user_id,customer_id,bundle_id,bundle_hash,legal_version,legal_sha256,privacy_version,privacy_sha256)
  values(input_request_id,publication.id,tenant_id,input_branch_id,publication.test_session_id,
    publication.material_revision,auth.uid(),customer_value,publication.bundle_id,publication.bundle_hash,
    publication.manifest->'legal'->>'version',publication.manifest->'legal'->>'sha256',
    publication.manifest->'privacy'->>'version',publication.manifest->'privacy'->>'sha256');
  return jsonb_build_object('request_id',input_request_id,'bundle_id',publication.bundle_id,
    'bundle_hash',publication.bundle_hash,'material_revision',publication.material_revision,
    'idempotent',false,'test_only',true);
end;
$function$;
revoke all on function public.accept_customer_active_operator_test_legal(text,uuid,text,text,bigint,boolean,boolean,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.accept_customer_active_operator_test_legal(text,uuid,text,text,bigint,boolean,boolean,uuid)
  to authenticated;

commit;
