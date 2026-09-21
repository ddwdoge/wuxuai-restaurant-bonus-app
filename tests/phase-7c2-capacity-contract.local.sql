\set ON_ERROR_STOP on
begin;

-- Synthetic local-only fixture. Every row is rolled back at the end.
set local session_replication_role = replica;

insert into auth.users (id, email, created_at, updated_at) values
  ('7c200000-0000-4000-8000-000000000001', 'owner-local@example.invalid', now(), now()),
  ('7c200000-0000-4000-8000-000000000002', 'stranger-local@example.invalid', now(), now());

insert into public.organizations (id, owner_id, name) values
  ('7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000001', 'Phase 7C.2 Local');
insert into public.restaurants (id, owner_id, name, slug, organization_id) values
  ('7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000001', 'Phase 7C.2 Local', 'phase-7c2-local', '7c200000-0000-4000-8000-000000000010');
insert into public.branches (id, organization_id, restaurant_id, name, slug, country) values
  ('7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000011', 'Phase 7C.2 Local', 'phase-7c2-local', 'AT');
update public.restaurants
set primary_branch_id = '7c200000-0000-4000-8000-000000000012'
where id = '7c200000-0000-4000-8000-000000000011';
insert into public.restaurant_members (restaurant_id, organization_id, branch_id, user_id, role) values
  ('7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000001', 'owner');

insert into public.customers (
  id, restaurant_id, organization_id, branch_id, name, customer_code,
  normalized_phone, is_test_customer
) values
  ('7c200000-0000-4000-8000-000000000101', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'A', 'C-A', '+43100000001', false),
  ('7c200000-0000-4000-8000-000000000102', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'B', 'C-B', '+43100000002', false),
  ('7c200000-0000-4000-8000-000000000103', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'C', 'C-C', '+43100000003', false),
  ('7c200000-0000-4000-8000-000000000104', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'D', 'C-D', '+43100000004', false),
  ('7c200000-0000-4000-8000-000000000105', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'E', 'C-E', '+43100000005', false),
  ('7c200000-0000-4000-8000-000000000106', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'F', 'C-F', '+43100000006', false),
  ('7c200000-0000-4000-8000-000000000107', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'TEST', 'C-T', '+43100000007', true);

insert into public.customer_accounts (id) values
  ('7c200000-0000-4000-8000-000000000201');
insert into public.customer_account_memberships (account_id, restaurant_id, customer_id) values
  ('7c200000-0000-4000-8000-000000000201', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000101');

insert into public.restaurant_offers (
  id, restaurant_id, branch_id, offer_type, title, short_description,
  valid_from, valid_to, status, is_active
) values
  ('7c200000-0000-4000-8000-000000000301', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000012', 'NEWS', 'Current', 'Current', '2026-09-20 00:00+00', '2026-09-30 00:00+00', 'PUBLISHED', true),
  ('7c200000-0000-4000-8000-000000000302', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000012', 'NEWS', 'Future', 'Future', '2026-09-25 00:00+00', '2026-10-30 00:00+00', 'PUBLISHED', true),
  ('7c200000-0000-4000-8000-000000000303', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000012', 'NEWS', 'Draft', 'Draft', '2026-09-20 00:00+00', '2026-09-30 00:00+00', 'DRAFT', false),
  ('7c200000-0000-4000-8000-000000000304', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000012', 'NEWS', 'Expired', 'Expired', '2026-08-01 00:00+00', '2026-09-01 00:00+00', 'PUBLISHED', true);

insert into public.points_transactions (
  id, restaurant_id, organization_id, branch_id, customer_id, type, points,
  amount_cents, collection_source, reversal_of, created_at
) values
  ('7c200000-0000-4000-8000-000000000401', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000101', 'earn', 10, 1000, 'restaurant_controlled', null, '2026-09-20 12:00+00'),
  ('7c200000-0000-4000-8000-000000000402', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000102', 'earn', 10, 1000, 'restaurant_controlled', null, '2026-09-20 12:00+00'),
  ('7c200000-0000-4000-8000-000000000403', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000102', 'adjust', -10, null, 'reversal', '7c200000-0000-4000-8000-000000000402', '2026-09-20 13:00+00'),
  ('7c200000-0000-4000-8000-000000000404', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000105', 'earn', 10, 1000, 'customer_initiated', null, '2025-09-21 12:00+00'),
  ('7c200000-0000-4000-8000-000000000405', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000106', 'earn', 10, 1000, 'customer_initiated', null, '2026-09-21 12:00+00'),
  ('7c200000-0000-4000-8000-000000000406', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000107', 'earn', 10, 1000, 'restaurant_controlled', null, '2026-09-20 12:00+00');

insert into public.redemption_activity_journal (
  id, activity_number, restaurant_id, organization_id, branch_id, customer_id,
  customer_reference, source_type, source_id, reward_type, redeemed_at,
  actor_role, status, cancelled_at, cancelled_by, cancellation_reason,
  snapshot_completeness, is_test_event
) values
  ('7c200000-0000-4000-8000-000000000501', '7C2-A', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000101', 'A', 'POINT_REWARD', '7c200000-0000-4000-8000-000000000601', 'POINT_REWARD', '2026-09-19 12:00+00', 'staff', 'ACTIVE', null, null, null, 'complete', false),
  ('7c200000-0000-4000-8000-000000000502', '7C2-C', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000103', 'C', 'WELCOME_GIFT', '7c200000-0000-4000-8000-000000000602', 'WELCOME_GIFT', '2026-09-19 12:00+00', 'staff', 'CANCELLED', '2026-09-20 12:00+00', '7c200000-0000-4000-8000-000000000001', 'Synthetic cancellation', 'complete', false),
  ('7c200000-0000-4000-8000-000000000503', '7C2-D', '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', '7c200000-0000-4000-8000-000000000104', 'D', 'BIRTHDAY_GIFT', '7c200000-0000-4000-8000-000000000603', 'BIRTHDAY_GIFT', '2026-09-18 12:00+00', 'staff', 'ACTIVE', null, null, null, 'complete', false);

set local session_replication_role = origin;

do $test$
declare snapshot jsonb;
begin
  snapshot := public.resolve_restaurant_capacity_internal(
    '7c200000-0000-4000-8000-000000000011', '2026-09-21 12:00+00'
  );
  if snapshot#>>'{plan,plan_key}' <> 'BASIC' then raise exception 'AT lock was bypassed: %', snapshot; end if;
  if (snapshot#>>'{offers,usage}')::bigint <> 2 then raise exception 'offer usage mismatch: %', snapshot; end if;
  if (snapshot#>>'{offers,effective_limit}')::bigint <> 5 then raise exception 'basic offer limit mismatch: %', snapshot; end if;
  if (snapshot#>>'{active_customers,usage}')::bigint <> 3 then raise exception 'customer usage mismatch: %', snapshot; end if;
  if (snapshot#>>'{active_customers,effective_limit}')::bigint <> 3000 then raise exception 'basic customer limit mismatch: %', snapshot; end if;
  if (snapshot->>'unlimited')::boolean then raise exception 'unlimited must be false'; end if;
  if (snapshot->>'write_enforcement_active')::boolean then raise exception '7C.2 must remain read-only'; end if;
end;
$test$;

do $test$
declare basic_plan public.commercial_capacity_plan_versions%rowtype;
declare pro_plan public.commercial_capacity_plan_versions%rowtype;
begin
  select * into basic_plan from public.commercial_capacity_plan_versions
  where plan_key = 'BASIC' and version = 1;
  select * into pro_plan from public.commercial_capacity_plan_versions
  where plan_key = 'PRO' and version = 1;
  if basic_plan.base_offer_limit + 1 * 5 <> 10 then raise exception 'BASIC plus one offer unit mismatch'; end if;
  if basic_plan.base_offer_limit + 2 * 5 <> 15 then raise exception 'BASIC plus two offer units mismatch'; end if;
  if pro_plan.base_offer_limit <> 15 or pro_plan.base_customer_limit <> 15000 then raise exception 'PRO base capacity mismatch'; end if;
  if pro_plan.base_offer_limit + 2 * 5 <> 25 then raise exception 'PRO plus two offer units mismatch'; end if;
  if basic_plan.base_customer_limit + 1 * 5000 <> 8000 then raise exception 'BASIC plus one customer unit mismatch'; end if;
  if pro_plan.base_customer_limit + 2 * 5000 <> 25000 then raise exception 'PRO plus two customer units mismatch'; end if;
end;
$test$;

insert into public.restaurant_capacity_addon_entitlements (
  entitlement_key, revision, restaurant_id, organization_id, branch_id,
  addon_key, addon_version, units, status, effective_from, effective_until,
  past_due_started_at, source, request_id, reason
) values
  ('7c200000-0000-4000-8000-000000000701', 1, '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'OFFER_CAPACITY', 1, 2, 'ACTIVE', '2026-09-01 00:00+00', null, null, 'TEST_FIXTURE', '7c200000-0000-4000-8000-000000000801', 'Synthetic active addon'),
  ('7c200000-0000-4000-8000-000000000702', 1, '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'CUSTOMER_CAPACITY', 1, 3, 'PAST_DUE', '2026-09-01 00:00+00', null, '2026-09-18 00:00+00', 'TEST_FIXTURE', '7c200000-0000-4000-8000-000000000802', 'Synthetic grace addon'),
  ('7c200000-0000-4000-8000-000000000703', 1, '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'CUSTOMER_CAPACITY', 1, 1, 'CANCELLED', '2026-09-01 00:00+00', '2026-10-15 00:00+00', null, 'TEST_FIXTURE', '7c200000-0000-4000-8000-000000000803', 'Synthetic cancellation at period end'),
  ('7c200000-0000-4000-8000-000000000704', 1, '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012', 'OFFER_CAPACITY', 1, 99, 'CHARGEBACK', '2026-09-01 00:00+00', null, null, 'TEST_FIXTURE', '7c200000-0000-4000-8000-000000000804', 'Synthetic chargeback is inactive');

do $test$
declare snapshot jsonb;
begin
  snapshot := public.resolve_restaurant_capacity_internal(
    '7c200000-0000-4000-8000-000000000011', '2026-09-21 12:00+00'
  );
  if (snapshot#>>'{offers,addon_units}')::bigint <> 2 or (snapshot#>>'{offers,effective_limit}')::bigint <> 15 then
    raise exception 'offer addon mismatch: %', snapshot;
  end if;
  if (snapshot#>>'{active_customers,addon_units}')::bigint <> 4 or (snapshot#>>'{active_customers,effective_limit}')::bigint <> 23000 then
    raise exception 'customer addon lifecycle mismatch: %', snapshot;
  end if;
end;
$test$;

insert into public.restaurant_capacity_addon_entitlements (
  entitlement_key, revision, restaurant_id, organization_id, branch_id,
  addon_key, addon_version, units, status, effective_from,
  past_due_started_at, source, request_id, reason
) values (
  '7c200000-0000-4000-8000-000000000701', 2,
  '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012',
  'OFFER_CAPACITY', 1, 2, 'REVOKED', '2026-09-01 00:00+00', null,
  'TEST_FIXTURE', '7c200000-0000-4000-8000-000000000805', 'Synthetic append-only revocation'
);

do $test$
declare snapshot jsonb;
begin
  snapshot := public.resolve_restaurant_capacity_internal(
    '7c200000-0000-4000-8000-000000000011', '2026-10-01 12:00+00'
  );
  if (snapshot#>>'{offers,addon_units}')::bigint <> 0 then raise exception 'latest revision did not revoke addon: %', snapshot; end if;
  if (snapshot#>>'{active_customers,addon_units}')::bigint <> 1 then raise exception 'past-due grace did not expire: %', snapshot; end if;
end;
$test$;

do $test$
begin
  begin
    insert into public.restaurant_capacity_addon_entitlements (
      entitlement_key, revision, restaurant_id, organization_id, branch_id,
      addon_key, addon_version, units, status, effective_from,
      past_due_started_at, source, request_id, reason
    ) values (
      '7c200000-0000-4000-8000-000000000730', 1,
      '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012',
      'OFFER_CAPACITY', 1, -1, 'ACTIVE', '2026-09-01 00:00+00', null,
      'TEST_FIXTURE', '7c200000-0000-4000-8000-000000000830', 'Synthetic negative unit rejection'
    );
    raise exception 'negative units unexpectedly succeeded';
  exception when check_violation then null;
  end;
  begin
    insert into public.restaurant_capacity_addon_entitlements (
      entitlement_key, revision, restaurant_id, organization_id, branch_id,
      addon_key, addon_version, units, status, effective_from,
      past_due_started_at, source, request_id, reason
    ) values (
      '7c200000-0000-4000-8000-000000000731', 1,
      '7c200000-0000-4000-8000-000000000011', '7c200000-0000-4000-8000-000000000010', '7c200000-0000-4000-8000-000000000012',
      'CUSTOMER_CAPACITY', 1, 1000001, 'ACTIVE', '2026-09-01 00:00+00', null,
      'TEST_FIXTURE', '7c200000-0000-4000-8000-000000000831', 'Synthetic overflow boundary rejection'
    );
    raise exception 'excessive units unexpectedly succeeded';
  exception when check_violation then null;
  end;
  begin
    update public.restaurant_capacity_addon_entitlements
    set units = units
    where id = (
      select id from public.restaurant_capacity_addon_entitlements order by id limit 1
    );
    raise exception 'immutable update unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.commercial_capacity_plan_versions where plan_key = 'BASIC' and version = 1;
    raise exception 'immutable delete unexpectedly succeeded';
  exception when sqlstate '55000' then null;
  end;
end;
$test$;

do $test$
begin
  if has_table_privilege('anon', 'public.restaurant_capacity_addon_entitlements', 'select') then raise exception 'anon table read present'; end if;
  if has_table_privilege('authenticated', 'public.restaurant_capacity_addon_entitlements', 'insert') then raise exception 'authenticated table write present'; end if;
  if has_function_privilege('anon', 'public.get_restaurant_capacity(uuid)', 'execute') then raise exception 'anon RPC execute present'; end if;
  if not has_function_privilege('authenticated', 'public.get_restaurant_capacity(uuid)', 'execute') then raise exception 'authenticated RPC execute missing'; end if;
  if has_function_privilege('authenticated', 'public.resolve_restaurant_capacity_internal(uuid,timestamptz)', 'execute') then raise exception 'internal resolver exposed'; end if;
end;
$test$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7c200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $test$
declare snapshot jsonb;
begin
  snapshot := public.get_restaurant_capacity('7c200000-0000-4000-8000-000000000011');
  if snapshot->>'contract_version' <> 'restaurant_capacity_v1' then raise exception 'authorized owner RPC failed'; end if;
end;
$test$;

select set_config('request.jwt.claims', '{"sub":"7c200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $test$
begin
  begin
    perform public.get_restaurant_capacity('7c200000-0000-4000-8000-000000000011');
    raise exception 'cross-tenant capacity read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$test$;
reset role;

rollback;
select 'PHASE_7C2_LOCAL_SQL_MATRIX_PASS';
