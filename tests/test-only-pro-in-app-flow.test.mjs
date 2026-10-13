import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261013094045_test_only_pro_in_app_flow.sql", "utf8");
const panel = readFileSync("src/modules/verification/PlatformTestOnlyProInboxPanel.tsx", "utf8");
const customer = readFileSync("src/modules/customer/CustomerTestOnlyProInboxPage.tsx", "utf8");
const service = readFileSync("src/modules/customer/testOnlyProInboxService.ts", "utf8");

test("isolated TEST_ONLY PRO grant never mutates real entitlement or delivery systems", () => {
  assert.match(migration, /real_pro_entitlement',false/);
  assert.match(migration, /email_delivery',false/);
  assert.match(migration, /push_delivery',false/);
  assert.doesNotMatch(migration, /insert into public\.commercial_pro_access_grants|update public\.branch_subscriptions|enqueue_customer_transactional_email|customer_offer_email_deliveries\s*\(/i);
  assert.doesNotMatch(migration, /cron\.schedule|net\.http|stripe|checkout/i);
});

test("project, tenant, exact guest, expiry and dedicated consent are checked on reads and writes", () => {
  assert.match(migration, /project_bootstrap\.require_runtime_binding\(true\)/g);
  assert.match(migration, /platform_terms_test_identities/);
  assert.match(migration, /customer_test_only_join_receipts/);
  assert.match(migration, /guest_auth_user_id.*auth\.uid\(\)::text/);
  assert.match(migration, /expires_at > statement_timestamp\(\)/);
  assert.match(migration, /test_only_pro_in_app_consent_active_internal/g);
  assert.match(migration, /TEST_ONLY_PRO_IN_APP_V1/g);
});

test("notification source is only the existing synthetic publication receipt and is replay safe", () => {
  assert.match(migration, /after insert on public\.test_only_basic_offer_publication_receipts/);
  assert.match(migration, /offer_publication_receipt_id uuid not null unique/);
  assert.match(migration, /on conflict \(offer_publication_receipt_id\) do nothing/);
  assert.match(migration, /status='PUBLISHED'.*is_active/s);
  assert.doesNotMatch(migration, /create trigger .*restaurant_offers/i);
});

test("all evidence tables are private and append-only; browser receives RPCs only", () => {
  for (const name of ["access_receipts","access_audit","consent_receipts","notifications","notification_audit","open_receipts"]) {
    assert.match(migration, new RegExp(`test_only_pro_in_app_${name} enable row level security`));
    assert.match(migration, new RegExp(`test_only_pro_in_app_${name}_immutable`));
  }
  assert.match(migration, /from public,anon,authenticated,service_role/);
  assert.match(migration, /grant execute on function[\s\S]*public\.get_test_only_pro_in_app_inbox\(uuid\)[\s\S]*to authenticated/);
  assert.doesNotMatch(`${panel}\n${customer}\n${service}`, /service_role|\.from\(/);
});

test("UI separates synthetic consent and inbox from real PRO and mail", () => {
  assert.match(panel, /TEST_ONLY PRO · In-App/);
  assert.match(panel, /Kein echtes PRO/);
  assert.match(customer, /Kein E-Mail- oder Push-Versand/);
  assert.match(customer, /Öffnen und als gelesen markieren/);
  assert.match(service, /set_test_only_pro_in_app_consent/);
  assert.match(service, /open_test_only_pro_in_app_notification/);
});
