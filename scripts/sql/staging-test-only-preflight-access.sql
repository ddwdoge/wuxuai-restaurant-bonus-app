-- Staging-only administrative diagnostic setup; not an application migration.
-- No business rows, application grants, subscriptions or migration history change.
-- Run only on the dashboard-verified wuxuai-bonus-staging project.
-- NOLOGIN administrative profile only: inherited PUBLIC function rights exist.
-- This is not an independent query-only database principal; audit before use.
-- Never issue a login/password or widen this role without resolving that gap.
BEGIN;
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.business_verification_environment
      WHERE singleton AND environment = 'STAGING') OR NOT EXISTS (
    SELECT 1 FROM public.restaurants r
    JOIN public.platform_test_tenant_registry m ON m.restaurant_id=r.id
      AND m.organization_id=r.organization_id AND m.restaurant_name=r.name
      AND m.owner_user_id=r.owner_id AND m.deleted_at IS NULL
    WHERE r.slug='wuxuai-test-only-pro-phase-1') THEN
    RAISE EXCEPTION 'STAGING_TEST_ONLY_IDENTITY_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='wuxuai_test_preflight_reader')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='wuxuai_test_preflight') THEN
    RAISE EXCEPTION 'PREFLIGHT_ACCESS_ALREADY_EXISTS_REVIEW_REQUIRED';
  END IF;
END;
$guard$;
CREATE ROLE wuxuai_test_preflight_reader NOLOGIN NOSUPERUSER NOCREATEDB
  NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
ALTER ROLE wuxuai_test_preflight_reader SET default_transaction_read_only = on;
ALTER ROLE wuxuai_test_preflight_reader SET statement_timeout = '10s';
-- SQL Editor uses postgres; grant only the ability to assume the narrower role.
GRANT wuxuai_test_preflight_reader TO postgres WITH INHERIT FALSE, SET TRUE;
CREATE SCHEMA wuxuai_test_preflight;
REVOKE ALL ON SCHEMA wuxuai_test_preflight FROM PUBLIC, anon, authenticated;
CREATE FUNCTION wuxuai_test_preflight.read_65_to_109()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $read$
BEGIN
  IF current_setting('transaction_read_only') IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION USING ERRCODE='25006', MESSAGE='READ_ONLY_TRANSACTION_REQUIRED';
  END IF;
  RETURN (
WITH
target AS MATERIALIZED (
  SELECT r.id, r.organization_id, r.primary_branch_id, r.timezone_name,
    EXISTS (
      SELECT 1 FROM public.platform_test_tenant_registry m
      WHERE m.restaurant_id = r.id AND m.organization_id = r.organization_id
        AND m.restaurant_name = r.name AND m.owner_user_id = r.owner_id
        AND m.deleted_at IS NULL
    ) AS test_marker_valid
  FROM public.restaurants r
  WHERE r.slug = 'wuxuai-test-only-pro-phase-1'
),
tenant AS MATERIALIZED (
  SELECT * FROM target
  WHERE test_marker_valid AND (SELECT count(*) FROM target) = 1
),
branches AS MATERIALIZED (
  SELECT b.* FROM public.branches b JOIN tenant t ON b.restaurant_id = t.id
),
candidates AS MATERIALIZED (
  SELECT c.* FROM public.customers c JOIN tenant t ON c.restaurant_id = t.id
  WHERE c.membership_status = 'active' AND c.points_balance = 65
),
customer AS MATERIALIZED (
  SELECT * FROM candidates
  WHERE (SELECT count(*) FROM candidates) = 1
    AND (SELECT count(*) FROM branches) = 1
),
binding AS MATERIALIZED (
  SELECT c.id AS customer_id, t.id AS restaurant_id, t.organization_id,
    b.id AS branch_id, b.name AS branch_name, c.points_balance,
    c.is_test_customer,
    coalesce(c.organization_id = t.organization_id
      AND c.branch_id = b.id AND t.primary_branch_id = b.id
      AND b.organization_id = t.organization_id AND b.status = 'active', false)
      AS location_bound,
    (SELECT count(*) FROM public.customer_account_memberships m
      JOIN public.customer_accounts a ON a.id = m.account_id
      WHERE m.customer_id = c.id AND m.restaurant_id = t.id
        AND a.disabled_at IS NULL
        AND (c.auth_user_id IS NULL OR a.auth_user_id = c.auth_user_id))
      AS account_memberships,
    (SELECT count(*) FROM public.customer_account_memberships m
      WHERE m.customer_id = c.id AND m.restaurant_id <> t.id)
      AS foreign_memberships,
    coalesce(t.timezone_name, 'Europe/Vienna') AS timezone_name
  FROM customer c JOIN tenant t ON c.restaurant_id = t.id
  CROSS JOIN branches b
),
earn AS MATERIALIZED (
  SELECT count(*) AS successful_today
  FROM public.points_transactions p JOIN binding b
    ON p.restaurant_id = b.restaurant_id AND p.customer_id = b.customer_id
  WHERE p.type = 'earn' AND p.points > 0
    AND p.created_at >= (timezone(b.timezone_name, now())::date::timestamp
      AT TIME ZONE b.timezone_name)
    AND p.created_at < ((timezone(b.timezone_name, now())::date + 1)::timestamp
      AT TIME ZONE b.timezone_name)
),
reward_window AS MATERIALIZED (
  -- Match the committed threshold trigger: restaurant-scoped, not branch-filtered.
  SELECT r.id, r.required_points,
    coalesce(r.organization_id = b.organization_id AND r.branch_id = b.branch_id,
      false) AS location_bound
  FROM public.rewards r JOIN binding b ON r.restaurant_id = b.restaurant_id
  WHERE r.active AND NOT r.is_starter_reward
    AND r.required_points BETWEEN 66 AND 109
    AND (r.expires_at IS NULL OR r.expires_at > statement_timestamp())
),
effects AS MATERIALIZED (
  SELECT
    (SELECT count(*) FROM public.customer_reward_notification_state s
      JOIN binding b ON s.restaurant_id = b.restaurant_id
        AND s.customer_id = b.customer_id
      JOIN reward_window r ON r.id = s.reward_id AND r.required_points = 109)
      AS threshold_rows,
    (SELECT count(*) FROM public.customer_rewards cr
      JOIN binding b ON cr.restaurant_id = b.restaurant_id
        AND cr.customer_id = b.customer_id
      JOIN reward_window r ON r.id = cr.reward_id AND r.required_points = 109)
      AS customer_reward_rows,
    (SELECT count(*) FROM public.customer_pro_in_app_notifications n
      JOIN binding b ON n.restaurant_id = b.restaurant_id
        AND n.customer_id = b.customer_id
      JOIN reward_window r ON (r.id = n.reward_id OR r.id = n.source_entity_id)
        AND r.required_points = 109
      WHERE n.event_type = 'POINT_REWARD_AVAILABLE') AS reward_inbox_rows
),
entitlement AS MATERIALIZED (
  -- STABLE, SELECT-only resolver; all three called helpers also verified read-only.
  SELECT public.resolve_restaurant_entitlements_internal(b.restaurant_id) AS value
  FROM binding b WHERE b.location_bound AND b.is_test_customer
    AND b.account_memberships = 1 AND b.foreign_memberships = 0
),
grants AS MATERIALIZED (
  SELECT g.id, g.starts_at, g.expires_at
  FROM public.commercial_pro_access_grants g JOIN binding b
    ON g.restaurant_id = b.restaurant_id AND g.organization_id = b.organization_id
  WHERE g.access_kind = 'INTERNAL_TEST_ONLY' AND g.revoked_at IS NULL
    AND isfinite(g.starts_at) AND isfinite(g.expires_at)
    AND g.starts_at <= statement_timestamp() AND g.expires_at > statement_timestamp()
),
selected_grant AS MATERIALIZED (
  SELECT g.starts_at, g.expires_at FROM grants g CROSS JOIN entitlement e
  WHERE g.id::text = e.value #>> '{commercial_access,access_grant_id}'
),
collection AS MATERIALIZED (
  SELECT l.points_collection_mode,
    coalesce(l.organization_id = b.organization_id AND l.branch_id = b.branch_id,
      false) AS location_bound
  FROM public.loyalty_settings l JOIN binding b ON l.restaurant_id = b.restaurant_id
),
checks AS MATERIALIZED (
  SELECT
    (SELECT count(*) FROM target) AS restaurant_count,
    (SELECT count(*) FROM tenant) AS marked_tenant_count,
    (SELECT count(*) FROM candidates) AS customer_count,
    (SELECT count(*) FROM branches) AS branch_count,
    (SELECT count(*) FROM reward_window) AS thresholds_in_window,
    (SELECT count(*) FROM reward_window WHERE required_points = 109) AS rewards_109,
    coalesce((SELECT bool_and(location_bound) FROM reward_window), false)
      AS reward_binding_valid,
    EXISTS (SELECT 1 FROM public.business_verification_environment
      WHERE singleton AND environment = 'STAGING') AS staging_environment,
    coalesce((SELECT (value->>'effective_plan') = 'PRO'
      AND (value #>> '{commercial_access,effective_pro}')::boolean
      AND (value #>> '{commercial_access,internal_test_only}')::boolean
      AND (value #>> '{effective,reward_notifications}')::boolean
      FROM entitlement), false) AS effective_test_pro,
    (SELECT count(*) FROM selected_grant) = 1 AS selected_grant_valid
),
result AS MATERIALIZED (
  SELECT CASE
    WHEN k.restaurant_count > 1 OR k.customer_count > 1 OR k.branch_count > 1
      THEN 'AMBIGUOUS'
    WHEN k.marked_tenant_count <> 1 THEN 'STOP_TEST_ONLY_TENANT_NOT_CONFIRMED'
    WHEN k.customer_count = 0 THEN 'STOP_NO_ACTIVE_65_POINT_CUSTOMER'
    WHEN NOT EXISTS (SELECT 1 FROM binding WHERE location_bound AND is_test_customer
      AND account_memberships = 1 AND foreign_memberships = 0)
      THEN 'STOP_MEMBERSHIP_OR_BRANCH_MISMATCH'
    WHEN NOT k.staging_environment THEN 'STOP_NOT_STAGING'
    WHEN NOT k.effective_test_pro OR NOT k.selected_grant_valid
      THEN 'STOP_PRO_TEST_GRANT_NOT_EFFECTIVE'
    WHEN k.thresholds_in_window <> 1 OR k.rewards_109 <> 1
      THEN 'STOP_REWARD_WINDOW_NOT_EXACTLY_ONE_109_THRESHOLD'
    WHEN NOT k.reward_binding_valid THEN 'STOP_REWARD_BRANCH_MISMATCH'
    WHEN x.threshold_rows > 0 OR x.customer_reward_rows > 0 OR x.reward_inbox_rows > 0
      THEN 'STOP_TARGET_EFFECT_ALREADY_EXISTS'
    WHEN a.successful_today >= 2 THEN 'STOP_DAILY_LIMIT'
    WHEN (SELECT count(*) FROM collection) <> 1 OR NOT EXISTS (
      SELECT 1 FROM collection WHERE location_bound
        AND points_collection_mode = 'restaurant_controlled_only')
      THEN 'STOP_COLLECTION_MODE_OR_BINDING'
    ELSE 'READ_ONLY_PREFLIGHT_PASS_AWAIT_SEPARATE_WRITE_APPROVAL'
  END AS status, k.*, x.*, a.successful_today
  FROM checks k CROSS JOIN effects x CROSS JOIN earn a
)
SELECT CASE WHEN status = 'AMBIGUOUS' THEN
  jsonb_build_object('status', status, 'customer_candidates', customer_count,
    'branches', branch_count)
ELSE jsonb_build_object(
  'status', status,
  'customer_candidate', CASE WHEN customer_count = 1 THEN 'UNIQUE' ELSE 'NONE' END,
  'membership_bound', coalesce((SELECT location_bound AND is_test_customer
    AND account_memberships = 1 AND foreign_memberships = 0 FROM binding), false),
  'branch_name', (SELECT branch_name FROM binding),
  'points', (SELECT points_balance FROM binding),
  'successful_earns_today', successful_today,
  'daily_limit_remaining', greatest(2 - successful_today, 0),
  'active_thresholds_66_to_109', thresholds_in_window,
  'active_109_reward_definitions', rewards_109,
  '109_threshold_state_rows', threshold_rows,
  '109_customer_reward_rows', customer_reward_rows,
  '109_reward_inbox_rows', reward_inbox_rows,
  'effective_test_pro', effective_test_pro,
  'reward_notifications_enabled', coalesce((SELECT
    (value #>> '{effective,reward_notifications}')::boolean FROM entitlement), false),
  'valid_test_grants', (SELECT count(*) FROM grants),
  'selected_test_grant_valid', selected_grant_valid,
  'grant_valid_from', (SELECT starts_at FROM selected_grant),
  'grant_valid_until', (SELECT expires_at FROM selected_grant),
  'collection_mode', (SELECT points_collection_mode FROM collection LIMIT 1)
) END AS preflight
FROM result
  );
END;
$read$;
REVOKE ALL ON FUNCTION wuxuai_test_preflight.read_65_to_109() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA wuxuai_test_preflight TO wuxuai_test_preflight_reader;
GRANT EXECUTE ON FUNCTION wuxuai_test_preflight.read_65_to_109() TO wuxuai_test_preflight_reader;
COMMIT;
