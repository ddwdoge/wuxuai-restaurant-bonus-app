import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL(
  "../supabase/migrations/20261011094458_bound_staging_environment_setup_contract.sql",
  import.meta.url,
), "utf8");

const body = migration.match(/create function project_bootstrap\.activate_bound_staging_environment\([\s\S]+?\n\$function\$;/)?.[0] ?? "";

test("bound staging setup is private, exact-project, and fail-closed", () => {
  assert.match(body, /security invoker/);
  assert.match(body, /session_user <> 'postgres' or current_user <> 'postgres'/);
  assert.match(body, /perform project_bootstrap\.require_runtime_binding\(false\)/);
  assert.match(body, /input_expected_project_ref is distinct from 'mbgveqbhessaunrhfudm'/);
  assert.match(body, /input_expected_auth_issuer is distinct from 'https:\/\/mbgveqbhessaunrhfudm\.supabase\.co\/auth\/v1'/);
  assert.match(body, /input_expected_app_origin is distinct from 'https:\/\/staging-v2\.bonus\.wuxuaisbi\.com'/);
  assert.match(body, /STAGING_ENVIRONMENT_SETUP_BINDING_MISMATCH/);
  assert.match(migration, /revoke all on function project_bootstrap\.activate_bound_staging_environment\([\s\S]+?from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant execute on function project_bootstrap\.activate_bound_staging_environment/);
  assert.doesNotMatch(migration, /create or replace function public\.activate_bound_staging_environment/);
});

test("transition is one-time, serialized, idempotent, and replay-protected", () => {
  assert.match(body, /pg_advisory_xact_lock\(hashtextextended\('BOUND_STAGING_ENVIRONMENT_SETUP', 0\)\)/);
  assert.match(body, /where singleton\s+for update/);
  assert.match(body, /where request_id = input_request_id/);
  assert.match(body, /STAGING_ENVIRONMENT_SETUP_IDEMPOTENCY_CONFLICT/);
  assert.match(body, /'idempotent', true/);
  assert.match(body, /environment_record\.environment is distinct from 'DISABLED'/);
  assert.match(body, /environment_record\.change_ref is distinct from 'LOCAL_MIGRATION_DEFAULT'/);
  assert.match(body, /STAGING_ENVIRONMENT_SETUP_REPLAY_DENIED/);
  assert.match(migration, /transition_key text primary key check \(transition_key = 'BUSINESS_VERIFICATION_DISABLED_TO_STAGING'\)/);
});

test("environment table and audit are protected from direct or mutable writes", () => {
  assert.match(migration, /BUSINESS_VERIFICATION_ENVIRONMENT_DIRECT_WRITE_DENIED/);
  assert.match(migration, /before insert or update or delete on public\.business_verification_environment/);
  assert.match(migration, /before truncate on public\.business_verification_environment/);
  assert.match(migration, /STAGING_ENVIRONMENT_SETUP_AUDIT_IMMUTABLE/);
  assert.match(migration, /before update or delete on project_bootstrap\.staging_environment_setup_audit/);
  assert.match(migration, /before truncate on project_bootstrap\.staging_environment_setup_audit/);
  assert.match(migration, /alter table project_bootstrap\.staging_environment_setup_audit enable row level security/);
  assert.match(migration, /revoke all on table project_bootstrap\.staging_environment_setup_audit\s+from public, anon, authenticated, service_role/);
});

test("setup migration does not open product, billing, mail, catalog, or marker paths", () => {
  assert.doesNotMatch(migration, /(?:insert into|update|delete from) public\.(?:restaurants|branches|branch_subscriptions|country_kyb_intake_policies|platform_test_tenant_registry|commercial_pro_access_grants|billing_trial_claims|basic_test_checkout_requests|customer_transactional_email_deliveries|restaurant_menu_catalogs)/i);
  assert.doesNotMatch(migration, /grant execute[\s\S]+(?:authenticated|anon|service_role)/i);
  assert.doesNotMatch(migration, /create policy/i);
  assert.doesNotMatch(migration, /storage\.objects|storage\.buckets/i);
});
