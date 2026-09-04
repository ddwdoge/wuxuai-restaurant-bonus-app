import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260905001000_platform_admin_operations_v1_1.sql", import.meta.url), "utf8");
const immutableAuditMigration = readFileSync(new URL("../supabase/migrations/20260905002000_platform_admin_operations_immutable_audit.sql", import.meta.url), "utf8");
const criticalConfirmationMigration = readFileSync(new URL("../supabase/migrations/20260905003000_platform_admin_critical_confirmation_fix.sql", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/platform/platformAdminService.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/modules/platform/PlatformOperationsPanel.tsx", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/platform-support-auth/index.ts", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("all Platform Admin writes use the explicit operations and immutable audit contract", () => {
  assert.match(migration, /create table if not exists public\.platform_admin_operations/);
  for (const field of ["platform_admin_user_id", "action_type", "entity_type", "entity_id", "tenant_id", "severity", "reason", "before_state", "after_state", "result", "created_at"]) assert.match(migration, new RegExp(`\\b${field}\\b`));
  assert.match(migration, /severity in \('NORMAL', 'SENSITIVE', 'CRITICAL'\)/);
  assert.match(migration, /unique \(platform_admin_user_id, action_type, tenant_id, idempotency_key\)/);
  assert.match(migration, /revoke all on table public\.platform_admin_operations from public, anon, authenticated/);
  assert.match(immutableAuditMigration, /before update or delete on public\.platform_admin_operations/);
  assert.match(immutableAuditMigration, /Platform-Operations-Audit ist unveränderbar/);
  assert.doesNotMatch(immutableAuditMigration, /on conflict[\s\S]*do update/i);
});

test("write contract has a fixed allowlist and never accepts table names", () => {
  assert.match(migration, /input_action not in \(/);
  assert.doesNotMatch(migration, /execute\s+format|input_table|update_any_table|generic_database/i);
  assert.match(migration, /platform_operation_role_can_write\(input_action\)/);
  assert.match(migration, /set search_path = public, pg_temp/g);
});

test("operational lifecycle and publication stay separate from billing", () => {
  assert.match(migration, /'restaurant_activate', 'restaurant_inactivate', 'restaurant_publish', 'restaurant_unpublish'/);
  assert.match(migration, /update public\.branches set is_discoverable = true/);
  assert.match(migration, /restaurant_registration_readiness/);
  assert.match(migration, /Manuelle Zahlungsstatus sind bis zur Stripe-Integration gesperrt/);
  assert.match(migration, /Restaurant-Lifecycle wird über den Operations-Vertrag verwaltet/);
});

test("support repairs only identities already proven by canonical links", () => {
  assert.match(migration, /input_entity_id is distinct from restaurant_record\.owner_id/);
  assert.match(migration, /customer_record\.auth_user_id is null/);
  assert.match(migration, /ca\.auth_user_id=customer_record\.auth_user_id/);
  assert.doesNotMatch(migration, /insert into public\.platform_admins/);
});

test("points correction is bounded, idempotent, journaled and cannot create a negative balance", () => {
  assert.match(migration, /abs\(amount_value\) > 500/);
  assert.match(migration, /next_balance < 0/);
  assert.match(migration, /insert into public\.points_transactions/);
  assert.match(migration, /'platform_support_correction'/);
  assert.match(migration, /input_idempotency_key/);
  assert.doesNotMatch(panel, /points_balance.*update|\.from\(["']customers["']\)/s);
});

test("gift, QR and PIN diagnostics never expose secrets or assign gifts", () => {
  assert.match(migration, /'qr_evidence'/);
  assert.match(migration, /'pin_evidence'/);
  assert.doesNotMatch(migration.match(/'qr_evidence'[\s\S]*?'pin_evidence'/)?.[0] ?? "", /token_hash|manual_code_hash|customer_token_hash/);
  assert.doesNotMatch(panel, /PIN setzen|Geschenk zuweisen|Welcome Gift zuweisen/);
  assert.doesNotMatch(migration, /insert into public\.customer_rewards/);
  assert.match(migration, /Nur abgelaufene aktive Präsentationen können bereinigt werden/);
});

test("mail operations are narrow and never expose credentials or tokens", () => {
  assert.match(migration, /before_value->>'status' <> 'FAILED'/);
  assert.match(migration, /set status='PENDING'/);
  assert.match(edge, /owner_confirmation_resend/);
  assert.match(edge, /owner_password_recovery/);
  assert.match(edge, /staff_invitation_resend/);
  assert.match(edge, /searchParams\.set\("staff"/);
  assert.doesNotMatch(edge, /SERVICE_ROLE|SMTP_PASSWORD|scheduler/i);
  assert.doesNotMatch(panel, /token_hash|reset token|SMTP/);
});

test("auth support target is server-resolved and Platform role protected", () => {
  assert.match(migration, /get_platform_auth_support_target/);
  assert.match(migration, /platform_operation_role_can_write\(input_action\)/);
  assert.match(edge, /client\.rpc\("get_platform_auth_support_target"/);
  assert.doesNotMatch(edge, /body\.email/);
});

test("tenant suspension requires strong name confirmation and preserves data", () => {
  assert.match(migration, /severity_value = 'CRITICAL'/);
  assert.match(migration, /'CONFIRMED:' \|\| restaurant_record\.name/);
  assert.match(criticalConfirmationMigration, /severity_value = 'SENSITIVE'/);
  assert.match(criticalConfirmationMigration, /position\(old_guard in function_definition\) = 0/);
  assert.match(panel, /Zur Bestätigung Restaurantname eingeben/);
  assert.doesNotMatch(migration, /delete from public\.(restaurants|organizations|branches)/);
});

test("operations UI is responsive and keeps all controls at least 44px", () => {
  assert.match(panel, /Übersicht/);
  assert.match(panel, /Support/);
  assert.match(panel, /Aktivität/);
  assert.match(panel, /Sicherheit/);
  assert.match(panel, /Abrechnung/);
  assert.match(panel, /Aktionen/);
  assert.match(styles, /\.platform-operations-panel \.button,[\s\S]*min-height: 44px/);
  assert.match(styles, /@media \(max-width: 430px\)[\s\S]*\.platform-operations-panel/);
});

test("frontend uses only named RPCs and the protected Edge Function", () => {
  assert.match(service, /get_platform_restaurant_operations/);
  assert.match(service, /execute_platform_admin_operation/);
  assert.match(service, /functions\.invoke\("platform-support-auth"/);
  assert.doesNotMatch(service, /\.from\(/);
});
