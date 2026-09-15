-- Phase 7B.4C: additive TEST_ONLY preflight and mutation hardening.
-- Existing cleanup evidence is retained; no tenant data is changed by this migration.
begin;
-- Serialize concurrent migration/repeat invocations before acquiring DDL locks.
select pg_advisory_xact_lock(hashtextextended('migration:20260915003000',0));

create table if not exists public.platform_test_tenant_mark_requests (
  idempotency_key uuid primary key,
  actor_id uuid not null references auth.users(id) on delete restrict,
  target_restaurant_ref uuid not null,
  organization_ref uuid not null,
  location_ref uuid not null,
  operation text not null check (operation = 'MARK_TEST_ONLY_TENANT'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  cleanup_audit_id uuid not null references public.platform_test_tenant_cleanup_audit(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);

-- Identity snapshots intentionally have no FK to a deletable tenant entity.
create index if not exists platform_test_tenant_mark_requests_target_idx
  on public.platform_test_tenant_mark_requests (target_restaurant_ref, created_at, idempotency_key);

alter table public.platform_test_tenant_mark_requests enable row level security;
revoke all on table public.platform_test_tenant_mark_requests from public, anon, authenticated, service_role;

create or replace function public.protect_platform_test_tenant_mark_requests()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'TEST_TENANT_MARK_REQUEST_IMMUTABLE' using errcode = '42501';
end
$function$;

drop trigger if exists protect_platform_test_tenant_mark_requests_trigger
  on public.platform_test_tenant_mark_requests;
create trigger protect_platform_test_tenant_mark_requests_trigger
before update or delete on public.platform_test_tenant_mark_requests
for each row execute function public.protect_platform_test_tenant_mark_requests();
drop trigger if exists protect_platform_test_tenant_mark_requests_truncate
  on public.platform_test_tenant_mark_requests;
create trigger protect_platform_test_tenant_mark_requests_truncate
before truncate on public.platform_test_tenant_mark_requests
for each statement execute function public.protect_platform_test_tenant_mark_requests();

drop trigger if exists protect_test_tenant_cleanup_audit_truncate on public.platform_test_tenant_cleanup_audit;
create trigger protect_test_tenant_cleanup_audit_truncate
before truncate on public.platform_test_tenant_cleanup_audit
for each statement execute function public.protect_test_tenant_cleanup_audit();

create or replace function public.get_platform_test_tenant_cleanup_preflight(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
stable
as $function$
declare
  restaurant_record public.restaurants%rowtype;
  legacy_value jsonb;
  effective_value jsonb;
  blockers_value jsonb := '[]'::jsonb;
  marking_blockers_value jsonb;
  warnings_value jsonb := '[]'::jsonb;
  location_count bigint;
  foreign_customer_memberships bigint;
  non_test_customers bigint;
  active_redemptions bigint;
  stripe_states bigint;
  billing_verified boolean := false;
  storage_review bigint;
begin
  if auth.uid() is null
    or coalesce(public.current_platform_role() in ('platform_owner', 'platform_admin'), false) is not true then
    raise exception 'PLATFORM_TEST_TENANT_ACCESS_DENIED' using errcode = '42501';
  end if;
  if input_restaurant_id is null then
    raise exception 'TEST_TENANT_CONTEXT_REQUIRED' using errcode = '22023';
  end if;

  -- Reuse every legacy isolation check and the exact flat numeric inventory.
  -- The applied v2 wrapper removes only the legal-evidence exception below.
  legacy_value := public.get_platform_test_tenant_cleanup_preflight_v1(input_restaurant_id);
  if coalesce((legacy_value->>'deleted')::boolean, false) then
    return legacy_value;
  end if;
  if jsonb_typeof(legacy_value->'blockers') is distinct from 'array'
    or jsonb_typeof(legacy_value->'inventory') is distinct from 'object'
    or jsonb_typeof(legacy_value->'eligible') is distinct from 'boolean'
    or jsonb_typeof(legacy_value->'restaurant_name') is distinct from 'string' then
    raise exception 'TEST_TENANT_LEGACY_CONTRACT_INVALID' using errcode = '42501';
  end if;
  blockers_value := (legacy_value->'blockers') - 'IMMUTABLE_LEGAL_EVIDENCE_PRESENT';

  select * into restaurant_record from public.restaurants where id = input_restaurant_id;
  if restaurant_record.id is null then
    raise exception 'TEST_TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*) into location_count from public.branches
    where restaurant_id = restaurant_record.id and organization_id = restaurant_record.organization_id;
  select count(*) into foreign_customer_memberships
  from public.customer_account_memberships own_membership
  join public.customer_account_memberships other_membership
    on other_membership.account_id = own_membership.account_id
  where own_membership.restaurant_id = restaurant_record.id
    and other_membership.restaurant_id <> restaurant_record.id;
  select count(*) into non_test_customers from public.customers
    where restaurant_id = restaurant_record.id and is_test_customer is not true;
  select count(*) into active_redemptions from public.redemption_activity_journal
    where restaurant_id = restaurant_record.id
      and upper(coalesce(status, '')) in ('ACTIVE','PENDING','RESERVED','PRESENTED','OPEN');
  active_redemptions := active_redemptions
    + (select count(*) from public.points_redemption_presentations
       where restaurant_id=restaurant_record.id and status='REDEMPTION_STARTED')
    + (select count(*) from public.gift_redemption_presentations
       where restaurant_id=restaurant_record.id and status='REDEMPTION_STARTED')
    + (select count(*) from public.kassa_redemption_workflows
       where restaurant_id=restaurant_record.id and status='OPEN');
  select count(*) into storage_review from storage.objects object
    where object.name like restaurant_record.id::text || '/%'
       or object.name like restaurant_record.slug || '/%';
  -- Canonical billing source: branch_subscriptions (Stripe is deferred).
  -- ANY subscription row, including trial/incomplete state, prevents marking.
  -- Bind by organization OR location: an inconsistent association cannot hide it.
  begin
    select count(*) into stripe_states
    from public.branch_subscriptions subscription
    where subscription.organization_id=restaurant_record.organization_id
      or subscription.branch_id in (select id from public.branches
        where restaurant_id=restaurant_record.id);
    -- Validate the actual canonical billing columns even for an empty source.
    perform subscription.stripe_customer_id, subscription.stripe_subscription_id,
      subscription.payment_status, subscription.subscription_status
      from public.branch_subscriptions subscription limit 0;
    billing_verified := true;
  exception when undefined_table or undefined_column or insufficient_privilege then
    billing_verified := false;
  end;

  if not exists (select 1 from public.organizations organization
    where organization.id = restaurant_record.organization_id
      and organization.owner_id = restaurant_record.owner_id) then
    blockers_value := blockers_value || '"ORGANIZATION_BINDING_MISSING"'::jsonb;
  end if;
  if not exists (select 1 from auth.users where id = restaurant_record.owner_id)
    or not exists (select 1 from public.restaurant_members member
      where member.restaurant_id = restaurant_record.id
        and member.user_id = restaurant_record.owner_id and member.role = 'owner') then
    blockers_value := blockers_value || '"OWNER_AUTH_BINDING_MISSING"'::jsonb;
  end if;
  if location_count <> 1
    or (select count(*) from public.branches where restaurant_id=restaurant_record.id) <> 1
    or not exists (select 1 from public.branches branch
    where branch.id = restaurant_record.primary_branch_id
      and branch.restaurant_id = restaurant_record.id
      and branch.organization_id = restaurant_record.organization_id
      and upper(trim(branch.country)) ~ '^[A-Z]{2}$') then
    blockers_value := blockers_value || '"LOCATION_BINDING_NOT_EXACT"'::jsonb;
  end if;
  if foreign_customer_memberships > 0 then blockers_value := blockers_value || '"FOREIGN_CUSTOMER_ACCOUNT_MEMBERSHIP"'::jsonb; end if;
  if non_test_customers > 0 then blockers_value := blockers_value || '"NON_TEST_CUSTOMER_PRESENT"'::jsonb; end if;
  if active_redemptions > 0 then blockers_value := blockers_value || '"ACTIVE_OR_RESERVED_REDEMPTION"'::jsonb; end if;
  if stripe_states > 0 then blockers_value := blockers_value || '"PAYMENT_OR_STRIPE_STATE_PRESENT"'::jsonb; end if;
  if not billing_verified then
    blockers_value := blockers_value || '"PAYMENT_STRIPE_FREEDOM_NOT_VERIFIED"'::jsonb;
  end if;
  if storage_review > 0 then blockers_value := blockers_value || '"STORAGE_OBJECTS_REQUIRE_SEPARATE_CLEANUP"'::jsonb; end if;

  if exists (select 1 from public.platform_admin_operations where tenant_id = restaurant_record.id) then
    blockers_value := blockers_value || '"IMMUTABLE_PLATFORM_AUDIT_PRESENT"'::jsonb;
  end if;
  if exists (select 1 from public.platform_test_tenant_mark_requests
    where target_restaurant_ref = restaurant_record.id) then
    blockers_value := blockers_value || '"IMMUTABLE_MARK_RECEIPT_PRESENT"'::jsonb;
  end if;
  if exists (select 1 from public.platform_test_tenant_cleanup_audit where restaurant_id = restaurant_record.id)
    or exists (select 1 from public.commercial_pro_access_audit where restaurant_id = restaurant_record.id) then
    blockers_value := blockers_value || '"IMMUTABLE_TENANT_AUDIT_PRESENT"'::jsonb;
  end if;
  select coalesce(jsonb_agg(code order by code), '[]'::jsonb) into blockers_value
    from (select distinct value as code from jsonb_array_elements_text(blockers_value)) codes;

  -- Cleanup still requires an existing marker. First marking instead requires
  -- its absence; no receipt/audit or other safety blocker is removed.
  marking_blockers_value := blockers_value - 'TEST_ONLY_MARKER_MISSING';
  if exists (select 1 from public.platform_test_tenant_registry where restaurant_id=restaurant_record.id) then
    marking_blockers_value := marking_blockers_value || '"TEST_ONLY_MARKER_ALREADY_PRESENT"'::jsonb;
  end if;

  effective_value := public.resolve_restaurant_entitlements_internal(restaurant_record.id);

  return legacy_value || jsonb_build_object(
    'contract_version','test-tenant-hardening-v3',
    'context',jsonb_build_object(
      'organization_id',restaurant_record.organization_id,
      'restaurant_id',restaurant_record.id,
      'location_ids',(select coalesce(jsonb_agg(branch.id order by branch.id),'[]'::jsonb)
        from public.branches branch where branch.restaurant_id=restaurant_record.id
          and branch.organization_id=restaurant_record.organization_id),
      'owner_auth_user_id',restaurant_record.owner_id,
      'country_codes',(select coalesce(jsonb_agg(distinct upper(trim(branch.country))),'[]'::jsonb)
        from public.branches branch where branch.restaurant_id=restaurant_record.id),
      'stored_plan',coalesce((select upper(subscription.plan_key)
        from public.branch_subscriptions subscription
        where subscription.branch_id=restaurant_record.primary_branch_id limit 1),'BASIC'),
      'effective_plan',coalesce(effective_value->>'plan_key','BASIC')
    ),
    'registry_states',(select coalesce(jsonb_agg(jsonb_build_object(
      'restaurant_id',marker.restaurant_id,'organization_id',marker.organization_id,
      'owner_user_id',marker.owner_user_id,'test_session_id',marker.test_session_id,
      'marked_by',marker.marked_by,'marked_at',marker.marked_at,
      'state',case when marker.deleted_at is null then 'ACTIVE' else 'INACTIVE' end,
      'deleted_at',marker.deleted_at) order by marker.marked_at),'[]'::jsonb)
      from public.platform_test_tenant_registry marker where marker.restaurant_id=restaurant_record.id),
    'customers',(select coalesce(jsonb_agg(jsonb_build_object(
      'customer_id',customer.id,'classification',case when customer.is_test_customer then 'TEST_CUSTOMER' else 'NON_TEST_CUSTOMER' end,
      'has_auth_binding',customer.auth_user_id is not null) order by customer.id),'[]'::jsonb)
      from public.customers customer where customer.restaurant_id=restaurant_record.id),
    'foreign_customer_account_memberships',jsonb_build_object('count',foreign_customer_memberships,'pii_returned',false),
    'activity_summary',jsonb_build_object(
      'points',(select count(*) from public.points_transactions where restaurant_id=restaurant_record.id),
      'visits',(select count(*) from public.audit_log where restaurant_id=restaurant_record.id and action ilike '%visit%'),
      'gifts',(select count(*) from public.customer_rewards where restaurant_id=restaurant_record.id),
      'redemptions',(select count(*) from public.redemption_activity_journal where restaurant_id=restaurant_record.id),
      'ledger_entries',(select count(*) from public.points_transactions where restaurant_id=restaurant_record.id),
      'active_or_reserved_redemptions',active_redemptions),
    'storage_objects',(select coalesce(jsonb_agg(jsonb_build_object(
      'object_id',object.id,'bucket_id',object.bucket_id,
      'purpose',case when object.bucket_id ilike '%logo%' then 'BRANDING' when object.bucket_id ilike '%legal%' then 'LEGAL' else 'TENANT_MEDIA' end,
      'tenant_binding',case when object.name like restaurant_record.id::text||'/%' then 'RESTAURANT_ID_PREFIX' else 'RESTAURANT_SLUG_PREFIX' end,
      'disposition','SEPARATE_REVIEW_REQUIRED','public_url_returned',false) order by object.bucket_id,object.id),'[]'::jsonb)
      from storage.objects object where object.name like restaurant_record.id::text||'/%' or object.name like restaurant_record.slug||'/%'),
    'billing_summary',jsonb_build_object(
      'subscriptions',stripe_states,'canonical_source_verified',billing_verified,
      'canonical_source','branch_subscriptions',
      'empty_canonical_billing_state',billing_verified and stripe_states=0,
      'payment_or_stripe_states',stripe_states,'invoice_source_available',false,
      'external_stripe_attestation',false,'payment_details_returned',false),
    'audit_summary',jsonb_build_object(
      'tenant_audit',(select count(*) from public.audit_log where restaurant_id=restaurant_record.id),
      'platform_audit',(select count(*) from public.platform_admin_operations where tenant_id=restaurant_record.id),
      'commercial_audit',(select count(*) from public.commercial_pro_access_audit where restaurant_id=restaurant_record.id),
      'immutable_history_preserved',true),
    'eligible',jsonb_array_length(blockers_value)=0,
    'restaurant_name',legacy_value->'restaurant_name',
    'inventory',legacy_value->'inventory',
    'eligible_for_marking',jsonb_array_length(marking_blockers_value)=0,
    'marking_preflight',jsonb_build_object('eligible',jsonb_array_length(marking_blockers_value)=0,
      'blockers',marking_blockers_value),
    'blockers',blockers_value,'warnings',warnings_value,
    'privacy',jsonb_build_object('emails_returned',false,'tokens_returned',false,'payment_details_returned',false)
  );
end
$function$;

-- The applied four-argument contract remains in history but is no longer a browser entry point.
revoke execute on function public.mark_platform_test_tenant(uuid,text,text,text)
  from public, anon, authenticated, service_role;

create or replace function public.mark_platform_test_tenant(
  input_restaurant_id uuid,
  input_test_session_id text,
  input_reason text,
  input_confirmation text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, extensions, pg_temp
as $function$
declare
  actor_id_value uuid := auth.uid();
  restaurant_record public.restaurants%rowtype;
  request_record public.platform_test_tenant_mark_requests%rowtype;
  marker_record public.platform_test_tenant_registry%rowtype;
  preflight_value jsonb;
  result_value jsonb;
  payload_hash_value text;
  audit_id_value uuid := extensions.gen_random_uuid();
begin
  if actor_id_value is null
    or coalesce(public.current_platform_role() in ('platform_owner', 'platform_admin'), false) is not true then
    raise exception 'PLATFORM_TEST_TENANT_ACCESS_DENIED' using errcode='42501';
  end if;
  perform public.require_recent_platform_auth_internal();
  if input_restaurant_id is null or input_idempotency_key is null
    or length(trim(coalesce(input_reason,''))) < 10
    or coalesce(input_test_session_id,'') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$' then
    raise exception 'TEST_TENANT_MARK_REQUEST_INVALID' using errcode='22023';
  end if;

  payload_hash_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'actor_id',actor_id_value,'target_restaurant_ref',input_restaurant_id,
    'operation','MARK_TEST_ONLY_TENANT','test_session_id',input_test_session_id,
    'reason',trim(input_reason),'confirmation',input_confirmation)::text,'UTF8'),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended('MARK_TEST_ONLY_TENANT:'||input_restaurant_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('test-tenant-mark:'||input_idempotency_key::text,0));
  select * into request_record from public.platform_test_tenant_mark_requests
    where idempotency_key=input_idempotency_key;
  if request_record.idempotency_key is not null then
    if request_record.actor_id is distinct from actor_id_value
      or request_record.target_restaurant_ref is distinct from input_restaurant_id
      or request_record.operation is distinct from 'MARK_TEST_ONLY_TENANT'
      or request_record.payload_hash is distinct from payload_hash_value then
      raise exception 'TEST_TENANT_IDEMPOTENCY_CONFLICT' using errcode='22023';
    end if;
    return request_record.result || jsonb_build_object('idempotent',true);
  end if;

  select * into restaurant_record from public.restaurants where id=input_restaurant_id for update;
  if restaurant_record.id is null then raise exception 'TEST_TENANT_NOT_FOUND' using errcode='P0002'; end if;
  if upper(restaurant_record.name) not like '%WUXUAI%'
    or (upper(restaurant_record.name) not like '%TEST%' and upper(restaurant_record.name) not like '%SMOKE%') then
    raise exception 'EXPLICIT_TEST_TENANT_NAME_REQUIRED' using errcode='42501';
  end if;
  if input_confirmation is distinct from 'CONFIRMED:'||restaurant_record.name||':'||restaurant_record.id::text then
    raise exception 'TEST_TENANT_STRONG_CONFIRMATION_REQUIRED' using errcode='42501';
  end if;

  preflight_value := public.get_platform_test_tenant_cleanup_preflight(input_restaurant_id);
  if coalesce((preflight_value->'marking_preflight'->>'eligible')::boolean,false) is not true then
    raise exception 'TEST_TENANT_PREFLIGHT_BLOCKED' using errcode='42501', detail=(preflight_value->'marking_preflight'->'blockers')::text;
  end if;

  insert into public.platform_test_tenant_registry(
    restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by
  ) values (restaurant_record.id,restaurant_record.name,restaurant_record.organization_id,
    restaurant_record.owner_id,input_test_session_id,actor_id_value)
  on conflict (restaurant_id) do nothing;
  select * into marker_record from public.platform_test_tenant_registry where restaurant_id=restaurant_record.id;
  if marker_record.deleted_at is not null
    or marker_record.restaurant_name is distinct from restaurant_record.name
    or marker_record.organization_id is distinct from restaurant_record.organization_id
    or marker_record.owner_user_id is distinct from restaurant_record.owner_id
    or marker_record.test_session_id is distinct from input_test_session_id then
    raise exception 'TEST_TENANT_REGISTRY_CONFLICT' using errcode='23505';
  end if;

  result_value := preflight_value || jsonb_build_object('marked',true,'idempotent',false);
  insert into public.platform_test_tenant_cleanup_audit(
    id,restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,
    platform_admin_user_id,reason,inventory,result
  ) values (audit_id_value,restaurant_record.id,restaurant_record.name,restaurant_record.organization_id,
    restaurant_record.owner_id,input_test_session_id,actor_id_value,trim(input_reason),
    preflight_value->'inventory','MARKED');
  insert into public.platform_test_tenant_mark_requests(
    idempotency_key,actor_id,target_restaurant_ref,organization_ref,location_ref,
    operation,payload_hash,result,cleanup_audit_id
  ) values (input_idempotency_key,actor_id_value,restaurant_record.id,
    restaurant_record.organization_id,restaurant_record.primary_branch_id,
    'MARK_TEST_ONLY_TENANT',payload_hash_value,result_value,audit_id_value);
  return result_value;
end
$function$;

revoke all on function public.get_platform_test_tenant_cleanup_preflight(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_platform_test_tenant_cleanup_preflight(uuid) to authenticated;
revoke all on function public.mark_platform_test_tenant(uuid,text,text,text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_platform_test_tenant(uuid,text,text,text,uuid) to authenticated;
revoke all on function public.protect_platform_test_tenant_mark_requests()
  from public, anon, authenticated, service_role;

commit;
