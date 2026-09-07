-- Staging test-tenant destruction contract. This is deliberately unavailable
-- to ordinary tenants and retains system-level evidence after tenant removal.

create table public.platform_test_tenant_registry (
  restaurant_id uuid primary key,
  restaurant_name text not null,
  organization_id uuid not null,
  owner_user_id uuid not null,
  test_session_id text not null check (test_session_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$'),
  marked_by uuid not null references auth.users(id) on delete restrict,
  marked_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  unique (test_session_id)
);

create table public.platform_test_tenant_cleanup_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null,
  restaurant_name text not null,
  organization_id uuid not null,
  owner_user_id uuid not null,
  test_session_id text not null,
  platform_admin_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  inventory jsonb not null,
  result text not null check (result in ('MARKED','DELETED')),
  created_at timestamptz not null default clock_timestamp()
);

alter table public.platform_test_tenant_registry enable row level security;
alter table public.platform_test_tenant_cleanup_audit enable row level security;
revoke all on public.platform_test_tenant_registry from public, anon, authenticated;
revoke all on public.platform_test_tenant_cleanup_audit from public, anon, authenticated;

create function public.protect_test_tenant_cleanup_audit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using errcode = '42501', message = 'TEST_TENANT_CLEANUP_AUDIT_IMMUTABLE';
end;
$$;

create trigger protect_test_tenant_cleanup_audit_trigger
before update or delete on public.platform_test_tenant_cleanup_audit
for each row execute function public.protect_test_tenant_cleanup_audit();

create function public.test_tenant_cleanup_context_allows(input_restaurant_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(current_setting('wuxuai.test_tenant_cleanup_id', true), '') = input_restaurant_id::text
    and auth.uid() is not null
    and public.is_platform_admin()
    and exists (
      select 1 from public.platform_test_tenant_registry marker
      where marker.restaurant_id = input_restaurant_id and marker.deleted_at is null
    );
$$;

revoke execute on function public.test_tenant_cleanup_context_allows(uuid) from public, anon, authenticated;

create function public.get_platform_test_tenant_cleanup_preflight(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
stable
as $$
declare
  restaurant_record public.restaurants%rowtype;
  marker_record public.platform_test_tenant_registry%rowtype;
  inventory_value jsonb;
  blockers_value jsonb := '[]'::jsonb;
  organization_restaurants_value bigint;
  foreign_memberships_value bigint;
  foreign_owned_restaurants_value bigint;
  foreign_staff_identities_value bigint;
  foreign_customer_identities_value bigint;
  foreign_customer_memberships_value bigint;
  non_test_customers_value bigint;
  storage_rows_value bigint;
  legal_rows_value bigint;
  platform_operations_value bigint;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'PLATFORM_TEST_TENANT_ACCESS_DENIED';
  end if;

  select * into restaurant_record from public.restaurants where id = input_restaurant_id;
  if restaurant_record.id is null then
    select * into marker_record from public.platform_test_tenant_registry where restaurant_id = input_restaurant_id;
    if marker_record.restaurant_id is not null and marker_record.deleted_at is not null then
      return jsonb_build_object('eligible', false, 'deleted', true, 'blockers', jsonb_build_array('TENANT_ALREADY_DELETED'));
    end if;
    raise exception using errcode = 'P0002', message = 'TEST_TENANT_NOT_FOUND';
  end if;

  select * into marker_record from public.platform_test_tenant_registry where restaurant_id = input_restaurant_id;
  select count(*) into organization_restaurants_value from public.restaurants where organization_id = restaurant_record.organization_id;
  select count(*) into foreign_memberships_value
  from public.restaurant_members own_member
  join public.restaurant_members other_member on other_member.user_id = own_member.user_id
  where own_member.restaurant_id = input_restaurant_id and other_member.restaurant_id <> input_restaurant_id;
  select count(*) into foreign_owned_restaurants_value
  from public.restaurants other_restaurant
  where other_restaurant.owner_id = restaurant_record.owner_id
    and other_restaurant.id <> input_restaurant_id;
  select count(*) into foreign_staff_identities_value
  from public.staff_members own_staff
  join public.staff_members other_staff on other_staff.auth_user_id = own_staff.auth_user_id
  where own_staff.restaurant_id = input_restaurant_id
    and own_staff.auth_user_id is not null
    and other_staff.restaurant_id <> input_restaurant_id;
  select count(*) into foreign_customer_identities_value
  from public.customers own_customer
  join public.customers other_customer on other_customer.auth_user_id = own_customer.auth_user_id
  where own_customer.restaurant_id = input_restaurant_id
    and own_customer.auth_user_id is not null
    and other_customer.restaurant_id <> input_restaurant_id;
  select count(*) into foreign_customer_memberships_value
  from public.customer_account_memberships own_membership
  join public.customer_account_memberships other_membership on other_membership.account_id = own_membership.account_id
  where own_membership.restaurant_id = input_restaurant_id and other_membership.restaurant_id <> input_restaurant_id;
  select count(*) into non_test_customers_value
  from public.customers where restaurant_id = input_restaurant_id and not is_test_customer;
  select count(*) into storage_rows_value
  from storage.objects object
  where object.name like input_restaurant_id::text || '/%'
     or object.name like restaurant_record.slug || '/%';
  select count(*) into legal_rows_value
  from public.legal_documents where restaurant_id = input_restaurant_id;
  select count(*) into platform_operations_value
  from public.platform_admin_operations where tenant_id = input_restaurant_id;

  if marker_record.restaurant_id is null then blockers_value := blockers_value || '"TEST_ONLY_MARKER_MISSING"'::jsonb; end if;
  if organization_restaurants_value <> 1 then blockers_value := blockers_value || '"SHARED_ORGANIZATION"'::jsonb; end if;
  if foreign_memberships_value <> 0 then blockers_value := blockers_value || '"FOREIGN_USER_MEMBERSHIP"'::jsonb; end if;
  if foreign_owned_restaurants_value <> 0 then blockers_value := blockers_value || '"OWNER_HAS_FOREIGN_RESTAURANT"'::jsonb; end if;
  if foreign_staff_identities_value <> 0 then blockers_value := blockers_value || '"FOREIGN_STAFF_IDENTITY"'::jsonb; end if;
  if foreign_customer_identities_value <> 0 then blockers_value := blockers_value || '"FOREIGN_CUSTOMER_IDENTITY"'::jsonb; end if;
  if foreign_customer_memberships_value <> 0 then blockers_value := blockers_value || '"FOREIGN_CUSTOMER_ACCOUNT_MEMBERSHIP"'::jsonb; end if;
  if non_test_customers_value <> 0 then blockers_value := blockers_value || '"NON_TEST_CUSTOMER_PRESENT"'::jsonb; end if;
  if storage_rows_value <> 0 then blockers_value := blockers_value || '"STORAGE_OBJECTS_REQUIRE_SEPARATE_CLEANUP"'::jsonb; end if;
  if legal_rows_value <> 0 then blockers_value := blockers_value || '"IMMUTABLE_LEGAL_EVIDENCE_PRESENT"'::jsonb; end if;
  if platform_operations_value <> 0 then blockers_value := blockers_value || '"IMMUTABLE_PLATFORM_AUDIT_PRESENT"'::jsonb; end if;
  if exists (select 1 from public.platform_admins where user_id = restaurant_record.owner_id) then
    blockers_value := blockers_value || '"OWNER_IS_PLATFORM_ADMIN"'::jsonb;
  end if;

  inventory_value := jsonb_build_object(
    'organization', 1,
    'restaurant', 1,
    'branches', (select count(*) from public.branches where restaurant_id = input_restaurant_id),
    'owners', 1,
    'staff', (select count(*) from public.staff_members where restaurant_id = input_restaurant_id),
    'customers', (select count(*) from public.customers where restaurant_id = input_restaurant_id),
    'memberships', (select count(*) from public.restaurant_members where restaurant_id = input_restaurant_id),
    'customer_account_memberships', (select count(*) from public.customer_account_memberships where restaurant_id = input_restaurant_id),
    'points', (select count(*) from public.points_transactions where restaurant_id = input_restaurant_id),
    'qr_tokens', (select count(*) from public.customer_qr_tokens where restaurant_id = input_restaurant_id)
      + (select count(*) from public.customer_points_qr_references where restaurant_id = input_restaurant_id),
    'pin_attempts', (select count(*) from public.daily_pin_attempts where restaurant_id = input_restaurant_id),
    'rewards', (select count(*) from public.rewards where restaurant_id = input_restaurant_id)
      + (select count(*) from public.customer_rewards where restaurant_id = input_restaurant_id),
    'redemptions', (select count(*) from public.redemption_activity_journal where restaurant_id = input_restaurant_id),
    'kassa_acknowledgements', (select count(*) from public.kassa_compliance_acknowledgements where restaurant_id = input_restaurant_id),
    'kassa_open', (select count(*) from public.kassa_redemption_workflows where restaurant_id = input_restaurant_id and status = 'OPEN'),
    'kassa_recorded', (select count(*) from public.kassa_redemption_workflows where restaurant_id = input_restaurant_id and status = 'RECORDED'),
    'kassa_owner_reviewed', (select count(*) from public.kassa_redemption_workflows where restaurant_id = input_restaurant_id and status = 'OWNER_REVIEWED'),
    'offers', (select count(*) from public.restaurant_offers where restaurant_id = input_restaurant_id),
    'mail_queue', (select count(*) from public.customer_transactional_email_deliveries where restaurant_id = input_restaurant_id),
    'notification_state', (select count(*) from public.customer_reward_notification_state where restaurant_id = input_restaurant_id),
    'audit', (select count(*) from public.audit_log where restaurant_id = input_restaurant_id),
    'legal_consent', (select count(*) from public.customer_legal_acceptances where restaurant_id = input_restaurant_id)
      + (select count(*) from public.customer_consents where restaurant_id = input_restaurant_id)
      + (select count(*) from public.consent_events where restaurant_id = input_restaurant_id)
      + (select count(*) from public.legal_documents where restaurant_id = input_restaurant_id),
    'storage', storage_rows_value,
    'other_tenant_rows', (
      select coalesce(sum(row_count), 0) from (
        select count(*) row_count from public.platform_security_flags where restaurant_id = input_restaurant_id
        union all select count(*) from public.platform_admin_operations where tenant_id = input_restaurant_id
        union all select count(*) from public.restaurant_onboarding_drafts where restaurant_id = input_restaurant_id
        union all select count(*) from public.loyalty_settings where restaurant_id = input_restaurant_id
        union all select count(*) from public.restaurant_branding where restaurant_id = input_restaurant_id
      ) counted
    )
  );

  return jsonb_build_object(
    'contract_version', 'staging-test-tenant-cleanup-v1',
    'restaurant_id', restaurant_record.id,
    'restaurant_name', restaurant_record.name,
    'test_session_id', marker_record.test_session_id,
    'eligible', jsonb_array_length(blockers_value) = 0,
    'inventory', inventory_value,
    'blockers', blockers_value
  );
end;
$$;

create function public.mark_platform_test_tenant(
  input_restaurant_id uuid,
  input_test_session_id text,
  input_reason text,
  input_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  preflight_value jsonb;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'PLATFORM_TEST_TENANT_ACCESS_DENIED';
  end if;
  if length(trim(coalesce(input_reason, ''))) < 10 then
    raise exception using errcode = '22023', message = 'TEST_TENANT_REASON_REQUIRED';
  end if;
  if coalesce(input_test_session_id, '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$' then
    raise exception using errcode = '22023', message = 'TEST_SESSION_ID_INVALID';
  end if;

  select * into restaurant_record from public.restaurants where id = input_restaurant_id for update;
  if restaurant_record.id is null then raise exception using errcode = 'P0002', message = 'TEST_TENANT_NOT_FOUND'; end if;
  if upper(restaurant_record.name) not like '%WUXUAI%'
     or (upper(restaurant_record.name) not like '%TEST%' and upper(restaurant_record.name) not like '%SMOKE%') then
    raise exception using errcode = '42501', message = 'EXPLICIT_TEST_TENANT_NAME_REQUIRED';
  end if;
  if input_confirmation <> 'CONFIRMED:' || restaurant_record.name || ':' || restaurant_record.id::text then
    raise exception using errcode = '42501', message = 'TEST_TENANT_STRONG_CONFIRMATION_REQUIRED';
  end if;

  insert into public.platform_test_tenant_registry (
    restaurant_id, restaurant_name, organization_id, owner_user_id, test_session_id, marked_by
  ) values (
    restaurant_record.id, restaurant_record.name, restaurant_record.organization_id,
    restaurant_record.owner_id, input_test_session_id, auth.uid()
  ) on conflict (restaurant_id) do nothing;

  preflight_value := public.get_platform_test_tenant_cleanup_preflight(input_restaurant_id);
  if not coalesce((preflight_value->>'eligible')::boolean, false) then
    delete from public.platform_test_tenant_registry where restaurant_id = input_restaurant_id and deleted_at is null;
    raise exception using errcode = '42501', message = 'TEST_TENANT_PREFLIGHT_BLOCKED', detail = (preflight_value->'blockers')::text;
  end if;

  insert into public.platform_test_tenant_cleanup_audit (
    restaurant_id, restaurant_name, organization_id, owner_user_id, test_session_id,
    platform_admin_user_id, reason, inventory, result
  ) values (
    restaurant_record.id, restaurant_record.name, restaurant_record.organization_id,
    restaurant_record.owner_id, input_test_session_id, auth.uid(), trim(input_reason),
    preflight_value->'inventory', 'MARKED'
  );
  return preflight_value;
end;
$$;

create or replace function public.block_kassa_acknowledgement_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' and public.test_tenant_cleanup_context_allows(old.restaurant_id) then return old; end if;
  raise exception using errcode = '42501', message = 'KASSA_ACKNOWLEDGEMENT_IMMUTABLE';
end;
$$;

create or replace function public.protect_redemption_activity_journal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if public.test_tenant_cleanup_context_allows(old.restaurant_id) then return old; end if;
    raise exception 'Einlösungsaktivitäten dürfen nicht gelöscht werden.';
  end if;
  if coalesce(current_setting('wuxuai.allow_activity_finalization', true), '') = 'on' then
    if new.id is not distinct from old.id
       and new.activity_number is not distinct from old.activity_number
       and new.restaurant_id is not distinct from old.restaurant_id
       and new.organization_id is not distinct from old.organization_id
       and new.branch_id is not distinct from old.branch_id
       and new.customer_id is not distinct from old.customer_id
       and new.customer_reference is not distinct from old.customer_reference
       and new.source_type is not distinct from old.source_type
       and new.source_id is not distinct from old.source_id
       and new.reward_id is not distinct from old.reward_id
       and new.reward_type is not distinct from old.reward_type
       and new.reward_name_snapshot is not distinct from old.reward_name_snapshot
       and new.reward_description_snapshot is not distinct from old.reward_description_snapshot
       and new.points_spent is not distinct from old.points_spent
       and new.quantity is not distinct from old.quantity
       and new.redeemed_at is not distinct from old.redeemed_at
       and new.redeemed_by is not distinct from old.redeemed_by
       and new.actor_role is not distinct from old.actor_role
       and new.redemption_code_reference is not distinct from old.redemption_code_reference
       and new.status is not distinct from old.status
       and new.cancelled_at is not distinct from old.cancelled_at
       and new.cancelled_by is not distinct from old.cancelled_by
       and new.cancellation_reason is not distinct from old.cancellation_reason
       and new.cancellation_audit_id is not distinct from old.cancellation_audit_id
       and new.audit_reference is not distinct from old.audit_reference
       and new.snapshot_completeness is not distinct from old.snapshot_completeness
       and new.is_test_event is not distinct from old.is_test_event
       and new.created_at is not distinct from old.created_at
       and new.redemption_started_at is not distinct from old.redemption_started_at
       and new.reference_value_cents is not distinct from old.reference_value_cents
       and new.reference_currency is not distinct from old.reference_currency
       and old.finalized_at is null and new.finalized_at is not null then
      return new;
    end if;
    raise exception 'Historische Snapshotfelder dürfen nicht geändert werden.';
  end if;
  if coalesce(current_setting('wuxuai.allow_activity_cancellation', true), '') <> 'on' then
    raise exception 'Historische Einlösungsaktivitäten dürfen nicht geändert werden.';
  end if;
  if new.id is distinct from old.id
     or new.activity_number is distinct from old.activity_number
     or new.restaurant_id is distinct from old.restaurant_id
     or new.organization_id is distinct from old.organization_id
     or new.branch_id is distinct from old.branch_id
     or new.customer_id is distinct from old.customer_id
     or new.customer_reference is distinct from old.customer_reference
     or new.source_type is distinct from old.source_type
     or new.source_id is distinct from old.source_id
     or new.reward_id is distinct from old.reward_id
     or new.reward_type is distinct from old.reward_type
     or new.reward_name_snapshot is distinct from old.reward_name_snapshot
     or new.reward_description_snapshot is distinct from old.reward_description_snapshot
     or new.points_spent is distinct from old.points_spent
     or new.quantity is distinct from old.quantity
     or new.redeemed_at is distinct from old.redeemed_at
     or new.redeemed_by is distinct from old.redeemed_by
     or new.actor_role is distinct from old.actor_role
     or new.redemption_code_reference is distinct from old.redemption_code_reference
     or new.audit_reference is distinct from old.audit_reference
     or new.snapshot_completeness is distinct from old.snapshot_completeness
     or new.is_test_event is distinct from old.is_test_event
     or new.created_at is distinct from old.created_at
     or new.redemption_started_at is distinct from old.redemption_started_at
     or new.finalized_at is distinct from old.finalized_at
     or new.reference_value_cents is distinct from old.reference_value_cents
     or new.reference_currency is distinct from old.reference_currency then
    raise exception 'Historische Snapshotfelder dürfen nicht geändert werden.';
  end if;
  return new;
end;
$$;

create function public.cleanup_platform_test_tenant(
  input_restaurant_id uuid,
  input_reason text,
  input_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, storage, pg_temp
as $$
declare
  marker_record public.platform_test_tenant_registry%rowtype;
  preflight_value jsonb;
  auth_user_ids uuid[];
  account_ids uuid[];
  table_record record;
  deleted_rows bigint;
  progress_rows bigint;
  remaining_rows bigint;
  pass_number integer;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'PLATFORM_TEST_TENANT_ACCESS_DENIED';
  end if;
  if length(trim(coalesce(input_reason, ''))) < 20 then
    raise exception using errcode = '22023', message = 'TEST_TENANT_CLEANUP_REASON_REQUIRED';
  end if;

  select * into marker_record from public.platform_test_tenant_registry
  where restaurant_id = input_restaurant_id for update;
  if marker_record.restaurant_id is null or marker_record.deleted_at is not null then
    raise exception using errcode = '42501', message = 'TEST_ONLY_MARKER_REQUIRED';
  end if;
  if input_confirmation <> 'CONFIRMED:' || marker_record.restaurant_name || ':' || marker_record.restaurant_id::text then
    raise exception using errcode = '42501', message = 'TEST_TENANT_STRONG_CONFIRMATION_REQUIRED';
  end if;

  preflight_value := public.get_platform_test_tenant_cleanup_preflight(input_restaurant_id);
  if not coalesce((preflight_value->>'eligible')::boolean, false) then
    raise exception using errcode = '42501', message = 'TEST_TENANT_PREFLIGHT_BLOCKED', detail = (preflight_value->'blockers')::text;
  end if;

  select array_agg(distinct user_id) into auth_user_ids from (
    select marker_record.owner_user_id user_id
    union all select auth_user_id from public.staff_members where restaurant_id = input_restaurant_id and auth_user_id is not null
    union all select auth_user_id from public.customers where restaurant_id = input_restaurant_id and auth_user_id is not null
  ) users;
  select array_agg(distinct account_id) into account_ids
  from public.customer_account_memberships where restaurant_id = input_restaurant_id;

  perform set_config('wuxuai.test_tenant_cleanup_id', input_restaurant_id::text, true);
  update public.restaurants set primary_branch_id = null where id = input_restaurant_id;

  delete from public.kassa_redemption_workflows where restaurant_id = input_restaurant_id;
  delete from public.gift_redemption_presentations where restaurant_id = input_restaurant_id;
  delete from public.points_redemption_presentations where restaurant_id = input_restaurant_id;
  delete from public.redemption_activity_journal where restaurant_id = input_restaurant_id;
  delete from public.kassa_compliance_acknowledgements where restaurant_id = input_restaurant_id;
  delete from public.organization_legal_profiles where organization_id = marker_record.organization_id;
  delete from public.restaurant_legal_profiles where restaurant_id = input_restaurant_id;
  delete from public.audit_log where restaurant_id = input_restaurant_id;

  for pass_number in 1..12 loop
    progress_rows := 0;
    for table_record in
      select column_info.table_name
      from information_schema.columns column_info
      join information_schema.tables table_info
        on table_info.table_schema = column_info.table_schema and table_info.table_name = column_info.table_name
      where column_info.table_schema = 'public' and column_info.column_name = 'restaurant_id'
        and table_info.table_type = 'BASE TABLE'
        and column_info.table_name not in ('restaurants','platform_test_tenant_registry','platform_test_tenant_cleanup_audit')
      order by table_name
    loop
      begin
        execute format('delete from public.%I where restaurant_id = $1', table_record.table_name) using input_restaurant_id;
        get diagnostics deleted_rows = row_count;
        progress_rows := progress_rows + deleted_rows;
      exception when foreign_key_violation then
        null;
      end;
    end loop;
    exit when progress_rows = 0;
  end loop;

  select coalesce(sum(row_count), 0) into remaining_rows from (
    select 0::bigint row_count
  ) empty_counts;
  for table_record in
    select column_info.table_name
    from information_schema.columns column_info
    join information_schema.tables table_info
      on table_info.table_schema = column_info.table_schema and table_info.table_name = column_info.table_name
    where column_info.table_schema = 'public' and column_info.column_name = 'restaurant_id'
      and table_info.table_type = 'BASE TABLE'
      and column_info.table_name not in ('restaurants','platform_test_tenant_registry','platform_test_tenant_cleanup_audit')
  loop
    execute format('select count(*) from public.%I where restaurant_id = $1', table_record.table_name)
      into deleted_rows using input_restaurant_id;
    remaining_rows := remaining_rows + deleted_rows;
  end loop;
  if remaining_rows <> 0 then
    raise exception using errcode = '23503', message = 'TEST_TENANT_DEPENDENCIES_REMAIN';
  end if;

  delete from public.restaurants where id = input_restaurant_id;
  delete from public.organizations where id = marker_record.organization_id;
  if account_ids is not null then delete from public.customer_accounts where id = any(account_ids); end if;
  if auth_user_ids is not null then delete from auth.users where id = any(auth_user_ids); end if;

  update public.platform_test_tenant_registry set deleted_at = clock_timestamp()
  where restaurant_id = input_restaurant_id;
  insert into public.platform_test_tenant_cleanup_audit (
    restaurant_id, restaurant_name, organization_id, owner_user_id, test_session_id,
    platform_admin_user_id, reason, inventory, result
  ) values (
    marker_record.restaurant_id, marker_record.restaurant_name, marker_record.organization_id,
    marker_record.owner_user_id, marker_record.test_session_id, auth.uid(), trim(input_reason),
    preflight_value->'inventory', 'DELETED'
  );
  return jsonb_build_object('deleted', true, 'restaurant_id', input_restaurant_id,
    'test_session_id', marker_record.test_session_id, 'inventory', preflight_value->'inventory');
end;
$$;

revoke all on function public.get_platform_test_tenant_cleanup_preflight(uuid) from public, anon, authenticated;
revoke all on function public.mark_platform_test_tenant(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.cleanup_platform_test_tenant(uuid,text,text) from public, anon, authenticated;
revoke all on function public.protect_test_tenant_cleanup_audit() from public, anon, authenticated;
revoke all on function public.block_kassa_acknowledgement_mutation() from public, anon, authenticated;
revoke all on function public.protect_redemption_activity_journal() from public, anon, authenticated;
grant execute on function public.get_platform_test_tenant_cleanup_preflight(uuid) to authenticated;
grant execute on function public.mark_platform_test_tenant(uuid,text,text,text) to authenticated;
grant execute on function public.cleanup_platform_test_tenant(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';
