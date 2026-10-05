-- A transaction-scoped TEST_ONLY admission, never a real AT publication.
-- Migration 194/195 and the existing membership trigger remain untouched.
begin;

create table public.platform_test_join_permits (
  transaction_id bigint primary key,
  backend_pid integer not null,
  auth_user_id uuid not null,
  restaurant_id uuid not null,
  branch_id uuid not null,
  account_id uuid not null,
  expected_phone text not null,
  test_session_id text not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.platform_test_join_permits enable row level security;
revoke all on public.platform_test_join_permits from public,anon,authenticated,service_role;

create table public.customer_test_only_join_receipts (
  request_id uuid primary key,
  auth_user_id uuid not null,
  account_id uuid not null,
  restaurant_id uuid not null,
  branch_id uuid not null,
  customer_id uuid not null,
  bundle_publication_id uuid not null references public.at_legal_synthetic_test_publications(id) on delete restrict,
  bundle_id text not null check (bundle_id ~ '^at-test-[0-9a-f]{64}$'),
  bundle_hash text not null check (bundle_hash ~ '^[0-9a-f]{64}$'),
  legal_version text not null,
  legal_sha256 text not null check (legal_sha256 ~ '^[0-9a-f]{64}$'),
  privacy_version text not null,
  privacy_sha256 text not null check (privacy_sha256 ~ '^[0-9a-f]{64}$'),
  platform_terms_receipt_id uuid not null references public.platform_customer_terms_receipts(id) on delete restrict,
  test_session_id text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  check (bundle_id='at-test-'||bundle_hash)
);
create index customer_test_only_join_receipts_actor_idx
  on public.customer_test_only_join_receipts(auth_user_id,restaurant_id,accepted_at desc);
alter table public.customer_test_only_join_receipts enable row level security;
revoke all on public.customer_test_only_join_receipts from public,anon,authenticated,service_role;
create trigger customer_test_only_join_receipts_append_only
  before update or delete or truncate on public.customer_test_only_join_receipts
  for each statement execute function public.protect_legal_bundle_append_only();

create function public.platform_test_join_permit_active_internal(input_restaurant_id uuid)
returns boolean language sql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
  select exists(select 1 from public.platform_test_join_permits p
    join public.business_verification_environment e on e.singleton
    join public.platform_test_tenant_registry m on m.restaurant_id=p.restaurant_id
      and m.deleted_at is null and m.test_session_id=p.test_session_id
    join public.restaurants r on r.id=p.restaurant_id
      and r.primary_branch_id=p.branch_id and r.organization_id=m.organization_id
    where p.transaction_id=txid_current() and p.backend_pid=pg_backend_pid()
      and p.auth_user_id=auth.uid() and p.restaurant_id=input_restaurant_id
      and auth.jwt()->>'iss'='https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'
      and e.environment='STAGING' and r.activation_status='pending_activation');
$function$;
revoke all on function public.platform_test_join_permit_active_internal(uuid)
  from public,anon,authenticated,service_role;

create function public.platform_test_join_operational_insert_internal(input_table text,input_row jsonb)
returns boolean language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare permit public.platform_test_join_permits%rowtype;
begin
  if input_table not in ('customers','customer_qr_tokens','customer_account_memberships','customer_rewards')
    or input_row->>'restaurant_id' is null then return false; end if;
  select * into permit from public.platform_test_join_permits
    where transaction_id=txid_current() and backend_pid=pg_backend_pid()
      and auth_user_id=auth.uid() and restaurant_id=(input_row->>'restaurant_id')::uuid;
  if permit.transaction_id is null
    or not public.platform_test_join_permit_active_internal(permit.restaurant_id)
    or (input_row->>'branch_id' is not null
      and (input_row->>'branch_id')::uuid is distinct from permit.branch_id) then return false; end if;
  if input_table='customers' then
    return input_row->>'phone'=permit.expected_phone
      and (input_row->>'branch_id')::uuid=permit.branch_id
      and input_row->>'test_session_id'=permit.test_session_id
      and coalesce((input_row->>'is_test_customer')::boolean,false);
  end if;
  if input_table='customer_account_memberships'
    and (input_row->>'account_id')::uuid is distinct from permit.account_id then return false; end if;
  if input_table='customer_rewards' and
    (coalesce((input_row->>'is_starter_reward')::boolean,false) is not true
      or input_row->>'status' is distinct from 'locked') then return false; end if;
  return exists(select 1 from public.customers c
    where c.id=(input_row->>'customer_id')::uuid and c.restaurant_id=permit.restaurant_id
      and c.branch_id=permit.branch_id and c.phone=permit.expected_phone
      and c.is_test_customer and c.test_session_id=permit.test_session_id);
end;
$function$;
revoke all on function public.platform_test_join_operational_insert_internal(text,jsonb)
  from public,anon,authenticated,service_role;

-- Before the existing pending guard, mark only the customer created by the
-- admitted transaction. No browser or service-role direct insert can do so.
create function public.mark_platform_test_join_customer()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare permit public.platform_test_join_permits%rowtype;
begin
  select * into permit from public.platform_test_join_permits
    where transaction_id=txid_current() and backend_pid=pg_backend_pid()
      and auth_user_id=auth.uid() and restaurant_id=new.restaurant_id;
  if permit.transaction_id is null then return new; end if;
  if not public.platform_test_join_permit_active_internal(new.restaurant_id)
    or new.phone is distinct from permit.expected_phone then
    raise exception 'TEST_ONLY_JOIN_CUSTOMER_MISMATCH' using errcode='42501';
  end if;
  new.branch_id:=permit.branch_id;
  new.is_test_customer:=true;
  new.test_session_id:=permit.test_session_id;
  return new;
end;
$function$;
create trigger a_platform_test_join_mark_customer
  before insert on public.customers for each row execute function public.mark_platform_test_join_customer();
revoke all on function public.mark_platform_test_join_customer()
  from public,anon,authenticated,service_role;

-- Retain every existing pending-activation rule. The only added exit is a
-- transaction-bound, four-table INSERT allowlist checked against the marker.
create or replace function public.guard_pending_activation_operational_write()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $function$
declare j jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  oldj jsonb:=to_jsonb(old); tenant uuid; previous_tenant uuid; r public.restaurants%rowtype;
  setup_table boolean; safe boolean:=false;
begin
  if tg_table_name='organizations' then
    select restaurant.id into tenant from public.restaurants restaurant
      where restaurant.organization_id=(j->>'id')::uuid and restaurant.activation_status='pending_activation' limit 1;
  elsif tg_table_name='branches' then tenant:=(j->>'restaurant_id')::uuid;
  elsif j ? 'restaurant_id' then tenant:=(j->>'restaurant_id')::uuid;
  elsif j ? 'subscription_id' then
    select b.restaurant_id into tenant from public.branch_subscriptions s join public.branches b on b.id=s.branch_id
      where s.id=(j->>'subscription_id')::uuid;
  elsif j ? 'organization_id' then
    select restaurant.id into tenant from public.restaurants restaurant
      where restaurant.organization_id=(j->>'organization_id')::uuid and restaurant.activation_status='pending_activation' limit 1;
  end if;
  if tg_op='UPDATE' and oldj ? 'restaurant_id' then
    previous_tenant:=(oldj->>'restaurant_id')::uuid;
    if previous_tenant is distinct from tenant and exists(select 1 from public.restaurants
      where id in (previous_tenant,tenant) and activation_status='pending_activation') then
      raise exception 'PENDING_TENANT_MOVE_FORBIDDEN' using errcode='42501';
    end if;
  end if;
  if tg_op='UPDATE' and oldj ? 'organization_id'
    and j->>'organization_id' is distinct from oldj->>'organization_id'
    and exists(select 1 from public.restaurants where activation_status='pending_activation'
      and organization_id in ((j->>'organization_id')::uuid,(oldj->>'organization_id')::uuid)) then
    raise exception 'PENDING_TENANT_MOVE_FORBIDDEN' using errcode='42501';
  end if;
  select * into r from public.restaurants where id=tenant;
  if r.activation_status is distinct from 'pending_activation' then
    if tg_op='DELETE' then return old; end if; return new;
  end if;
  if tg_op='INSERT' and public.platform_test_join_operational_insert_internal(tg_table_name,j) then
    return new;
  end if;
  setup_table:=tg_table_name in ('restaurant_branding','restaurant_onboarding_drafts','loyalty_settings',
    'loyalty_rules','restaurant_legal_profiles','organization_legal_profiles');
  if setup_table then safe:=true;
  elsif tg_table_name='branches' then
    safe:=tg_op<>'DELETE' and j->>'status'='draft' and coalesce((j->>'is_discoverable')::boolean,false)=false;
    if tg_op='UPDATE' and (j->'id' is distinct from oldj->'id' or j->'organization_id' is distinct from oldj->'organization_id') then safe:=false; end if;
  elsif tg_table_name='organizations' then
    safe:=tg_op<>'DELETE' and j->>'status'='draft';
    if tg_op='UPDATE' and (j->'id' is distinct from oldj->'id' or j->'owner_id' is distinct from oldj->'owner_id') then safe:=false; end if;
  elsif tg_table_name='restaurant_members' then
    safe:=tg_op<>'DELETE' and j->>'role'='owner' and (j->>'user_id')::uuid=r.owner_id;
  elsif tg_table_name='rewards' then safe:=coalesce((j->>'active')::boolean,true)=false;
  elsif tg_table_name='coupons' then safe:=j->>'status'='draft';
  elsif tg_table_name='restaurant_offers' then safe:=j->>'status'='DRAFT'
    and coalesce((j->>'is_active')::boolean,false)=false and j->>'published_at' is null;
  elsif tg_table_name='legal_documents' then safe:=j->>'current_published_version_id' is null;
  elsif tg_table_name='legal_document_versions' then safe:=j->>'status'='draft';
  end if;
  if not safe or auth.uid() is distinct from r.owner_id then
    raise exception 'PENDING_ACTIVATION_OPERATION_BLOCKED' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if; return new;
end $function$;
revoke all on function public.guard_pending_activation_operational_write()
  from public,anon,authenticated,service_role;

-- Token resolution is needed only inside the admitted canonical registration.
create or replace function public.require_restaurant_operational(input_restaurant_id uuid,input_action text)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $function$
declare state jsonb; grace public.basic_post_trial_redemption_grace%rowtype;
begin
  state:=public.restaurant_activation_state_internal(input_restaurant_id);
  if coalesce((state->>'operational')::boolean,false) then return; end if;
  if input_action='resolve_customer_from_public_token'
    and public.platform_test_join_permit_active_internal(input_restaurant_id) then return; end if;
  if input_action in ('secure_redemption_start','secure_redemption_finalize') then
    select * into grace from public.basic_post_trial_redemption_grace
      where restaurant_id=input_restaurant_id and starts_at<=statement_timestamp()
        and ends_at>statement_timestamp();
    if grace.restaurant_id is not null then return; end if;
  end if;
  raise exception 'RESTAURANT_NOT_OPERATIONAL' using errcode='42501';
end $function$;
revoke all on function public.require_restaurant_operational(uuid,text)
  from public,anon,authenticated,service_role;

-- The transactional membership/customer/welcome core is shared by the
-- normal exact-bundle path and the separately admitted synthetic path.
create function public.join_customer_account_core_internal(
  input_restaurant_slug text,input_device_id text,input_existing_customer_token text,
  input_test_only boolean
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,extensions,auth,pg_temp as $function$
declare account_id_value uuid:=public.ensure_authenticated_customer_account();
  account_record public.customer_accounts%rowtype;
  restaurant_record public.restaurants%rowtype;
  membership_record public.customer_account_memberships%rowtype;
  linked_account_id uuid; customer_id_value uuid; registration_result jsonb; raw_customer_token text;
begin
  select * into account_record from public.customer_accounts where id=account_id_value;
  select * into restaurant_record from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  if restaurant_record.id is null then
    raise exception 'CUSTOMER_ACCOUNT_CONTEXT_INVALID' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(account_id_value::text||':'||restaurant_record.id::text,0));
  select * into membership_record from public.customer_account_memberships
    where account_id=account_id_value and restaurant_id=restaurant_record.id;
  if membership_record.id is not null then
    return public.open_customer_account_membership(restaurant_record.id)||jsonb_build_object('joined',false);
  end if;
  if nullif(trim(coalesce(input_existing_customer_token,'')),'') is not null then
    if input_test_only then raise exception 'TEST_ONLY_EXISTING_TOKEN_FORBIDDEN' using errcode='42501'; end if;
    customer_id_value:=public.resolve_customer_from_public_token(restaurant_record.id,input_existing_customer_token);
    if customer_id_value is null then raise exception 'CUSTOMER_ACCESS_TOKEN_INVALID' using errcode='P0001'; end if;
    select account_id into linked_account_id from public.customer_account_memberships where customer_id=customer_id_value;
    if linked_account_id is not null and linked_account_id<>account_id_value then
      raise exception 'CUSTOMER_MEMBERSHIP_ALREADY_LINKED' using errcode='P0001';
    end if;
    insert into public.customer_account_memberships(account_id,restaurant_id,customer_id,last_opened_at)
      values(account_id_value,restaurant_record.id,customer_id_value,now())
      on conflict(account_id,restaurant_id) do nothing;
  else
    if input_test_only then
      registration_result:=public.register_restaurant_customer(
        restaurant_record.slug,account_record.first_name,account_record.phone,account_record.birthday,input_device_id);
    else
      registration_result:=public.register_restaurant_customer_legal(
        restaurant_record.slug,account_record.first_name,account_record.phone,account_record.birthday,
        input_device_id,true,true,false,false,false,account_record.birthday is not null);
    end if;
    if registration_result->>'success'='false' then
      raise exception '%',coalesce(registration_result->>'error_code','CUSTOMER_ACCOUNT_RECOVERY_REQUIRED') using errcode='P0001';
    end if;
    raw_customer_token:=registration_result#>>'{customer,customer_qr_token}';
    customer_id_value:=public.resolve_customer_from_public_token(restaurant_record.id,raw_customer_token);
    if customer_id_value is null then raise exception 'CUSTOMER_REGISTRATION_FAILED' using errcode='P0001'; end if;
    insert into public.customer_account_memberships(account_id,restaurant_id,customer_id,last_opened_at)
      values(account_id_value,restaurant_record.id,customer_id_value,now());
  end if;
  perform public.write_audit_event(restaurant_record.id,customer_id_value,'customer',customer_id_value,
    'CUSTOMER_JOINED_RESTAURANT','success','customer_account','customer_account_memberships',customer_id_value,
    null,jsonb_build_object('central_account',true)||case when input_test_only
      then jsonb_build_object('test_only',true) else '{}'::jsonb end);
  if raw_customer_token is null then
    return public.open_customer_account_membership(restaurant_record.id)||jsonb_build_object('joined',true);
  end if;
  return jsonb_build_object('joined',true,'restaurant_slug',restaurant_record.slug,'customer_token',raw_customer_token);
end;
$function$;
revoke all on function public.join_customer_account_core_internal(text,text,text,boolean)
  from public,anon,authenticated,service_role;

create or replace function public.join_customer_account_restaurant(
  input_restaurant_slug text,input_terms_accepted boolean,input_privacy_acknowledged boolean,
  input_device_id text default null,input_existing_customer_token text default null
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid;
begin
  if input_terms_accepted is distinct from true or input_privacy_acknowledged is distinct from true then
    raise exception 'CUSTOMER_LEGAL_ACCEPTANCE_REQUIRED' using errcode='P0001';
  end if;
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  if restaurant_id_value is null then raise exception 'CUSTOMER_ACCOUNT_CONTEXT_INVALID' using errcode='P0001'; end if;
  if not public.restaurant_legal_bundle_is_current(restaurant_id_value,current_date) then
    raise exception 'CUSTOMER_LEGAL_NOT_READY' using errcode='P0001';
  end if;
  return public.join_customer_account_core_internal(
    input_restaurant_slug,input_device_id,input_existing_customer_token,false);
end;
$function$;
revoke all on function public.join_customer_account_restaurant(text,boolean,boolean,text,text)
  from public,anon,authenticated;

create function public.require_platform_test_only_join_scope_internal(
  input_restaurant_id uuid,input_branch_id uuid,input_bundle_id text,input_bundle_hash text
) returns public.at_legal_synthetic_test_publications
language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare tenant public.restaurants%rowtype; marker public.platform_test_tenant_registry%rowtype;
  binding public.platform_terms_test_identities%rowtype;
  publication public.at_legal_synthetic_test_publications%rowtype;
  terms_status jsonb; platform_receipt public.platform_customer_terms_receipts%rowtype;
  policy public.country_kyb_intake_policies%rowtype; environment_value text;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or auth.jwt()->>'iss' is distinct from 'https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'
    or input_restaurant_id is null or input_branch_id is null or input_bundle_id is null
    or input_bundle_hash is null then raise exception 'TEST_ONLY_JOIN_SCOPE_DENIED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('at-legal-synthetic:'||input_restaurant_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-test-publication:'||input_restaurant_id::text,0));
  select environment into environment_value from public.business_verification_environment where singleton for share;
  select * into tenant from public.restaurants where id=input_restaurant_id for share;
  select * into marker from public.platform_test_tenant_registry
    where restaurant_id=input_restaurant_id and deleted_at is null for share;
  select * into binding from public.platform_terms_test_identities where auth_user_id=auth.uid() for share;
  select * into policy from public.country_kyb_intake_policies where country_code='AT' for share;
  if environment_value is distinct from 'STAGING'
    or tenant.id is null or tenant.status is distinct from 'active'
    or public.restaurant_activation_state_internal(tenant.id)->>'status' is distinct from 'PENDING_ACTIVATION'
    or tenant.primary_branch_id is distinct from input_branch_id
    or not exists(select 1 from public.branches b where b.id=input_branch_id
      and b.restaurant_id=tenant.id and b.organization_id=tenant.organization_id and b.country='AT')
    or marker.restaurant_id is null or marker.organization_id is distinct from tenant.organization_id
    or marker.owner_user_id is distinct from tenant.owner_id or marker.restaurant_name is distinct from tenant.name
    or binding.auth_user_id is null or binding.restaurant_id is distinct from tenant.id
    or binding.branch_id is distinct from input_branch_id
    or binding.test_session_id is distinct from marker.test_session_id
    or policy.real_intake_status is distinct from 'BLOCKED'
    or policy.test_only_intake_status is distinct from 'READY'
    or exists(select 1 from public.customer_account_memberships m
      join public.customer_accounts a on a.id=m.account_id
      where a.auth_user_id=auth.uid() and m.restaurant_id<>tenant.id) then
    raise exception 'TEST_ONLY_JOIN_SCOPE_DENIED' using errcode='42501';
  end if;
  terms_status:=public.get_platform_customer_terms_status();
  if terms_status->>'status' is distinct from 'ACCEPTED'
    or (terms_status->'document'->>'restaurant_id')::uuid is distinct from tenant.id
    or (terms_status->'document'->>'test_only')::boolean is not true then
    raise exception 'PLATFORM_TERMS_ACCEPTANCE_REQUIRED' using errcode='42501';
  end if;
  select * into platform_receipt from public.platform_customer_terms_receipts
    where id=(terms_status->'receipt'->>'id')::uuid and auth_user_id=auth.uid()
      and test_restaurant_id=tenant.id and test_session_id=marker.test_session_id for share;
  if platform_receipt.id is null then raise exception 'PLATFORM_TERMS_ACCEPTANCE_REQUIRED' using errcode='42501'; end if;
  select * into publication from public.at_legal_synthetic_test_publications
    where restaurant_id=tenant.id order by event_sequence desc limit 1 for share;
  if publication.id is null or publication.action is distinct from 'PUBLISH_TEST'
    or publication.bundle_id is distinct from input_bundle_id
    or publication.bundle_hash is distinct from input_bundle_hash
    or publication.manifest->>'test_only' is distinct from 'true'
    or publication.manifest->>'restaurant_id' is distinct from tenant.id::text
    or publication.bundle_hash is distinct from public.at_legal_synthetic_manifest_hash_internal(publication.manifest) then
    raise exception 'TEST_ONLY_JOIN_BUNDLE_STALE' using errcode='42501';
  end if;
  return publication;
end;
$function$;
revoke all on function public.require_platform_test_only_join_scope_internal(uuid,uuid,text,text)
  from public,anon,authenticated,service_role;

create function public.join_customer_account_test_only_at_legal(
  input_restaurant_slug text,input_branch_id uuid,input_terms_accepted boolean,
  input_privacy_acknowledged boolean,input_bundle_id text,input_bundle_hash text,
  input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare tenant public.restaurants%rowtype; publication public.at_legal_synthetic_test_publications%rowtype;
  prior public.customer_test_only_join_receipts%rowtype;
  receipt public.customer_test_only_join_receipts%rowtype;
  platform_status jsonb; account_value public.customer_accounts%rowtype;
  joined jsonb; customer_value public.customers%rowtype;
begin
  if input_terms_accepted is distinct from true or input_privacy_acknowledged is distinct from true
    or input_request_id is null then raise exception 'TEST_ONLY_JOIN_EXPLICIT_ACCEPTANCE_REQUIRED' using errcode='22023'; end if;
  select * into tenant from public.restaurants where slug=trim(input_restaurant_slug) and status='active';
  publication:=public.require_platform_test_only_join_scope_internal(
    tenant.id,input_branch_id,input_bundle_id,input_bundle_hash);
  select * into account_value from public.customer_accounts
    where auth_user_id=auth.uid() and disabled_at is null for update;
  if account_value.id is null or account_value.phone is null then
    raise exception 'TEST_ONLY_JOIN_ACCOUNT_REQUIRED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(account_value.id::text||':'||tenant.id::text,0));
  select * into prior from public.customer_test_only_join_receipts where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.auth_user_id is distinct from auth.uid() or prior.account_id is distinct from account_value.id
      or prior.restaurant_id is distinct from tenant.id or prior.branch_id is distinct from input_branch_id
      or prior.bundle_id is distinct from input_bundle_id or prior.bundle_hash is distinct from input_bundle_hash then
      raise exception 'TEST_ONLY_JOIN_REQUEST_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('joined',false,'test_only',true,'legal_receipt',
      jsonb_build_object('request_id',prior.request_id,'bundle_id',prior.bundle_id,
        'bundle_hash',prior.bundle_hash,'accepted_at',prior.accepted_at,'idempotent',true));
  end if;
  if exists(select 1 from public.customers c where c.restaurant_id=tenant.id
    and c.normalized_phone=account_value.normalized_phone) then
    raise exception 'TEST_ONLY_JOIN_CUSTOMER_ALREADY_EXISTS' using errcode='42501';
  end if;
  platform_status:=public.get_platform_customer_terms_status();
  insert into public.platform_test_join_permits(
    transaction_id,backend_pid,auth_user_id,restaurant_id,branch_id,account_id,expected_phone,test_session_id)
  values(txid_current(),pg_backend_pid(),auth.uid(),tenant.id,input_branch_id,account_value.id,
    account_value.phone,(platform_status->'document'->>'test_session_id'));
  joined:=public.join_customer_account_core_internal(tenant.slug,null,null,true);
  select c.* into customer_value from public.customer_account_memberships m
    join public.customers c on c.id=m.customer_id and c.restaurant_id=m.restaurant_id
    where m.account_id=account_value.id and m.restaurant_id=tenant.id;
  if customer_value.id is null or customer_value.branch_id is distinct from input_branch_id
    or customer_value.is_test_customer is not true
    or customer_value.test_session_id is distinct from (platform_status->'document'->>'test_session_id') then
    raise exception 'TEST_ONLY_JOIN_CUSTOMER_MISMATCH' using errcode='42501';
  end if;
  insert into public.customer_test_only_join_receipts(
    request_id,auth_user_id,account_id,restaurant_id,branch_id,customer_id,bundle_publication_id,
    bundle_id,bundle_hash,legal_version,legal_sha256,privacy_version,privacy_sha256,
    platform_terms_receipt_id,test_session_id)
  values(input_request_id,auth.uid(),account_value.id,tenant.id,input_branch_id,customer_value.id,
    publication.id,publication.bundle_id,publication.bundle_hash,
    publication.manifest->'legal'->>'version',publication.manifest->'legal'->>'sha256',
    publication.manifest->'privacy'->>'version',publication.manifest->'privacy'->>'sha256',
    (platform_status->'receipt'->>'id')::uuid,customer_value.test_session_id)
  returning * into receipt;
  delete from public.platform_test_join_permits where transaction_id=txid_current() and backend_pid=pg_backend_pid();
  return joined||jsonb_build_object('test_only',true,'legal_receipt',
    jsonb_build_object('request_id',receipt.request_id,'bundle_id',receipt.bundle_id,
      'bundle_hash',receipt.bundle_hash,'legal_version',receipt.legal_version,
      'legal_sha256',receipt.legal_sha256,'privacy_version',receipt.privacy_version,
      'privacy_sha256',receipt.privacy_sha256,'accepted_at',receipt.accepted_at,'idempotent',false));
end;
$function$;
revoke all on function public.join_customer_account_test_only_at_legal(text,uuid,boolean,boolean,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.join_customer_account_test_only_at_legal(text,uuid,boolean,boolean,text,text,uuid)
  to authenticated;

create function public.get_customer_test_only_join_receipt(input_request_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare receipt public.customer_test_only_join_receipts%rowtype;
begin
  if auth.uid() is null or input_request_id is null then
    raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end if;
  select * into receipt from public.customer_test_only_join_receipts
    where request_id=input_request_id and auth_user_id=auth.uid();
  if receipt.request_id is null then return jsonb_build_object('found',false); end if;
  return jsonb_build_object('found',true,'test_only',true,'request_id',receipt.request_id,
    'restaurant_id',receipt.restaurant_id,'branch_id',receipt.branch_id,'customer_id',receipt.customer_id,
    'bundle_id',receipt.bundle_id,'bundle_hash',receipt.bundle_hash,
    'legal_version',receipt.legal_version,'legal_sha256',receipt.legal_sha256,
    'privacy_version',receipt.privacy_version,'privacy_sha256',receipt.privacy_sha256,
    'accepted_at',receipt.accepted_at);
end;
$function$;
revoke all on function public.get_customer_test_only_join_receipt(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_customer_test_only_join_receipt(uuid) to authenticated;
commit;
