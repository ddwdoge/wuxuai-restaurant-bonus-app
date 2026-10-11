import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL(
  "../supabase/migrations/20261011111248_bound_second_platform_reviewer_bootstrap.sql",
  import.meta.url,
), "utf8");

const body = migration.match(/create function project_bootstrap\.bootstrap_second_platform_reviewer\([\s\S]+?\n\$function\$;/)?.[0] ?? "";

test("second reviewer bootstrap is private and exactly bound to staging-v2", () => {
  assert.match(body, /security invoker/);
  assert.match(body, /session_user <> 'postgres' or current_user <> 'postgres'/);
  assert.match(body, /perform project_bootstrap\.require_runtime_binding\(false\)/);
  assert.match(body, /input_expected_project_ref is distinct from 'mbgveqbhessaunrhfudm'/);
  assert.match(body, /input_expected_auth_issuer is distinct from 'https:\/\/mbgveqbhessaunrhfudm\.supabase\.co\/auth\/v1'/);
  assert.match(body, /input_expected_app_origin is distinct from 'https:\/\/staging-v2\.bonus\.wuxuaisbi\.com'/);
  assert.match(body, /environment_record\.environment is distinct from 'STAGING'/);
  assert.match(body, /environment_record\.change_ref not like 'BOUND_PROJECT_SETUP:%'/);
  assert.match(migration, /revoke all on function project_bootstrap\.bootstrap_second_platform_reviewer\([\s\S]+?from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant execute on function project_bootstrap\.bootstrap_second_platform_reviewer/);
  assert.doesNotMatch(migration, /create (?:or replace )?function public\.bootstrap_second_platform_reviewer/);
});

test("second reviewer requires the audited first owner with verified TOTP and a fresh exact AAL2 session", () => {
  assert.match(body, /project_bootstrap\.first_platform_admin_bootstrap_audit/);
  assert.match(body, /first_admin\.role = 'platform_owner'/);
  assert.match(body, /first_admin\.active/);
  assert.match(body, /factor\.factor_type = 'totp'/);
  assert.match(body, /factor\.status = 'verified'/);
  assert.match(body, /session\.id = input_first_platform_owner_aal2_session_id/);
  assert.match(body, /session\.user_id = input_first_platform_owner_id/);
  assert.match(body, /session\.aal = 'aal2'/);
  assert.match(body, /interval '15 minutes'/);
  assert.match(body, /SECOND_PLATFORM_REVIEWER_BOOTSTRAP_FIRST_OWNER_AAL2_REQUIRED/);
});

test("second reviewer identity is confirmed, separate, one-time, idempotent, and append-only audited", () => {
  assert.match(body, /lower\(trim\(coalesce\(auth_record\.email, ''\)\)\) is distinct from normalized_email_value/);
  assert.match(body, /auth_record\.email_confirmed_at is null/);
  assert.match(body, /auth_record\.deleted_at is not null/);
  assert.match(body, /coalesce\(auth_record\.is_anonymous, false\)/);
  for (const forbidden of [
    "public.restaurants where owner_id",
    "public.organizations where owner_id",
    "public.restaurant_members where user_id",
    "public.staff_members where auth_user_id",
    "public.customers where auth_user_id",
    "public.customer_accounts where auth_user_id",
    "public.platform_terms_test_identities where auth_user_id",
    "public.platform_admins where user_id",
  ]) assert.match(body, new RegExp(forbidden.replaceAll(".", "\\.")));
  assert.match(body, /values \(auth_record\.id, 'platform_admin', true\)/);
  assert.match(body, /pg_advisory_xact_lock\(hashtextextended\('BOUND_SECOND_PLATFORM_REVIEWER_BOOTSTRAP', 0\)\)/);
  assert.match(body, /CONFIRMED:SECOND_PLATFORM_REVIEWER:/);
  assert.match(body, /where request_id = input_request_id/);
  assert.match(body, /SECOND_PLATFORM_REVIEWER_BOOTSTRAP_IDEMPOTENCY_CONFLICT/);
  assert.match(body, /'idempotent', true/);
  assert.match(body, /'totp_aal2_required', true/);
  assert.match(migration, /bootstrap_key text primary key check \(bootstrap_key = 'SECOND_PLATFORM_REVIEWER'\)/);
  assert.match(migration, /SECOND_PLATFORM_REVIEWER_BOOTSTRAP_AUDIT_IMMUTABLE/);
});

test("second reviewer bootstrap opens no tenant, KYB, billing, mail, catalog, storage, or marker path", () => {
  assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.(?:restaurants|organizations|branches|branch_subscriptions|business_verification_cases|platform_test_tenant_registry|commercial_pro_access_grants|billing_trial_claims|basic_test_checkout_requests|customer_transactional_email_deliveries|restaurant_menu_catalogs)/i);
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /storage\.objects|storage\.buckets/i);
  assert.doesNotMatch(migration, /trial_started_at|stripe_customer_id|stripe_subscription_id/i);
});
