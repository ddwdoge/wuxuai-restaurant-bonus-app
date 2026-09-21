\set ON_ERROR_STOP on
set session_replication_role = replica;

insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
values ('7c5c0000-0000-4000-8000-000000000001', 'phase7c5b-concurrency@example.invalid', now(), now(), now());
insert into public.organizations (id, owner_id, name)
values ('7c5c0000-0000-4000-8000-000000000010', '7c5c0000-0000-4000-8000-000000000001', 'Phase 7C.5B Concurrency');
insert into public.restaurants (
  id, owner_id, name, slug, organization_id, language, timezone_name, status
) values (
  '7c5c0000-0000-4000-8000-000000000011', '7c5c0000-0000-4000-8000-000000000001',
  'Phase 7C.5B Concurrency', 'phase-7c5b-concurrency', '7c5c0000-0000-4000-8000-000000000010',
  'de', 'Europe/Vienna', 'active'
);
insert into public.branches (id, organization_id, restaurant_id, name, slug, country)
values (
  '7c5c0000-0000-4000-8000-000000000012', '7c5c0000-0000-4000-8000-000000000010',
  '7c5c0000-0000-4000-8000-000000000011', 'Phase 7C.5B Concurrency', 'phase-7c5b-concurrency', 'AT'
);
update public.restaurants set primary_branch_id='7c5c0000-0000-4000-8000-000000000012'
where id='7c5c0000-0000-4000-8000-000000000011';
insert into public.restaurant_members (restaurant_id, organization_id, branch_id, user_id, role)
values (
  '7c5c0000-0000-4000-8000-000000000011', '7c5c0000-0000-4000-8000-000000000010',
  '7c5c0000-0000-4000-8000-000000000012', '7c5c0000-0000-4000-8000-000000000001', 'owner'
);
insert into public.branch_subscriptions (
  id, organization_id, branch_id, status, plan_key, subscription_status,
  payment_status, current_period_end, created_at
) values (
  '7c5c0000-0000-4000-8000-000000000013', '7c5c0000-0000-4000-8000-000000000010',
  '7c5c0000-0000-4000-8000-000000000012', 'active', 'BASIC', 'active',
  'manual', '2027-01-01 00:00:00+00', '2026-09-01 00:00:00+00'
);
insert into public.restaurant_capacity_addon_entitlements (
  entitlement_key, revision, restaurant_id, organization_id, branch_id,
  addon_key, addon_version, units, status, effective_from, source, request_id, reason
) values (
  '7c5c0000-0000-4000-8000-000000000020', 1,
  '7c5c0000-0000-4000-8000-000000000011', '7c5c0000-0000-4000-8000-000000000010',
  '7c5c0000-0000-4000-8000-000000000012', 'OFFER_CAPACITY', 1, 1, 'ACTIVE',
  '2026-09-01 00:00:00+00', 'TEST_FIXTURE', '7c5c0000-0000-4000-8000-000000000021',
  'Local concurrency fixture'
);
insert into public.restaurant_offers (
  id, restaurant_id, branch_id, offer_type, title, short_description,
  valid_from, valid_to, status, is_active
)
select md5('phase7c5b-concurrency-offer-' || series.value)::uuid,
  '7c5c0000-0000-4000-8000-000000000011', '7c5c0000-0000-4000-8000-000000000012',
  'NEWS', 'Concurrency ' || series.value, 'Local concurrency fixture',
  '2026-09-01 00:00:00+00', '2027-01-01 00:00:00+00', 'PUBLISHED', true
from generate_series(1, 8) series(value);

set session_replication_role = origin;
