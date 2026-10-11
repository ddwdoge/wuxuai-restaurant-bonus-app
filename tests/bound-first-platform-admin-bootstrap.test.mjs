import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL(
  "../supabase/migrations/20261011113000_bound_first_platform_admin_bootstrap.sql",
  import.meta.url,
), "utf8");

const body = migration.match(/create function project_bootstrap\.bootstrap_first_platform_owner\([\s\S]+?\n\$function\$;/)?.[0] ?? "";

test("first Platform Owner bootstrap is private and bound to exact staging-v2 identity", () => {
  assert.match(body, /security invoker/);
  assert.match(body, /session_user <> 'postgres' or current_user <> 'postgres'/);
  assert.match(body, /perform project_bootstrap\.require_runtime_binding\(false\)/);
  assert.match(body, /input_expected_project_ref is distinct from 'mbgveqbhessaunrhfudm'/);
  assert.match(body, /input_expected_auth_issuer is distinct from 'https:\/\/mbgveqbhessaunrhfudm\.supabase\.co\/auth\/v1'/);
  assert.match(body, /input_expected_app_origin is distinct from 'https:\/\/staging-v2\.bonus\.wuxuaisbi\.com'/);
  assert.match(body, /environment_record\.environment is distinct from 'STAGING'/);
  assert.match(body, /environment_record\.change_ref not like 'BOUND_PROJECT_SETUP:%'/);
  assert.match(migration, /revoke all on function project_bootstrap\.bootstrap_first_platform_owner\([\s\S]+?from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant execute on function project_bootstrap\.bootstrap_first_platform_owner/);
  assert.doesNotMatch(migration, /create (?:or replace )?function public\.bootstrap_first_platform_owner/);
});

test("bootstrap accepts only a confirmed separate Auth identity", () => {
  assert.match(body, /lower\(trim\(coalesce\(auth_record\.email, ''\)\)\) is distinct from normalized_email_value/);
  assert.match(body, /auth_record\.email_confirmed_at is null/);
  assert.match(body, /auth_record\.deleted_at is not null/);
  assert.match(body, /coalesce\(auth_record\.is_anonymous, false\)/);
  assert.match(body, /auth_record\.banned_until/);
  for (const forbidden of [
    "public.restaurants where owner_id",
    "public.organizations where owner_id",
    "public.restaurant_members where user_id",
    "public.staff_members where auth_user_id",
    "public.customers where auth_user_id",
    "public.customer_accounts where auth_user_id",
    "public.platform_terms_test_identities where auth_user_id",
  ]) assert.match(body, new RegExp(forbidden.replaceAll(".", "\\.")));
  assert.match(body, /FIRST_PLATFORM_ADMIN_BOOTSTRAP_IDENTITY_NOT_SEPARATE/);
  assert.match(body, /values \(auth_record\.id, 'platform_owner', true\)/);
});

test("bootstrap is serialized, one-time, idempotent, strongly confirmed, and append-only audited", () => {
  assert.match(body, /pg_advisory_xact_lock\(hashtextextended\('BOUND_FIRST_PLATFORM_OWNER_BOOTSTRAP', 0\)\)/);
  assert.match(body, /CONFIRMED:FIRST_PLATFORM_OWNER:/);
  assert.match(body, /where request_id = input_request_id/);
  assert.match(body, /FIRST_PLATFORM_ADMIN_BOOTSTRAP_IDEMPOTENCY_CONFLICT/);
  assert.match(body, /FIRST_PLATFORM_ADMIN_BOOTSTRAP_ALREADY_COMPLETED/);
  assert.match(body, /'idempotent', true/);
  assert.match(body, /'totp_aal2_required', true/);
  assert.match(migration, /bootstrap_key text primary key check \(bootstrap_key = 'FIRST_PLATFORM_OWNER'\)/);
  assert.match(migration, /FIRST_PLATFORM_ADMIN_BOOTSTRAP_AUDIT_IMMUTABLE/);
  assert.match(migration, /before update or delete on project_bootstrap\.first_platform_admin_bootstrap_audit/);
  assert.match(migration, /before truncate on project_bootstrap\.first_platform_admin_bootstrap_audit/);
  assert.doesNotMatch(migration, /normalized_email text/);
  assert.match(migration, /normalized_email_sha256/);
});

test("bootstrap opens no tenant, KYB, billing, mail, catalog, or marker path", () => {
  assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.(?:restaurants|organizations|branches|branch_subscriptions|business_verification_cases|platform_test_tenant_registry|commercial_pro_access_grants|billing_trial_claims|basic_test_checkout_requests|customer_transactional_email_deliveries|restaurant_menu_catalogs)/i);
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /storage\.objects|storage\.buckets/i);
  assert.doesNotMatch(migration, /trial_started_at|stripe_customer_id|stripe_subscription_id/i);
});
