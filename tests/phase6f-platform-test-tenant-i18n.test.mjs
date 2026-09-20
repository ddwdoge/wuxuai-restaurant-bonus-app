import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";
import { SUPPORTED_UI_LANGUAGES } from "../src/shared/i18n/language.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const keys = [
  "title", "description", "preflightPassed", "preflightBlocked", "reason",
  "reasonPlaceholder", "strongConfirmation", "required", "mark", "cleanup",
  "authorizedOnly", "cleaned", "foreignTitle", "foreignDescription",
  "narrowPreflightPassed", "narrowPreflightBlocked", "tenant", "customer",
  "authId", "accountId", "localMembershipId", "localPointTransactions",
  "localPointBalance", "localVisits", "localRewards", "localRedemptions",
  "localNotifications", "foreignMemberships", "foreignPointTransactions",
  "foreignDataChanged", "relationConfirmation", "removeForeign",
  "authorizedRemoveOnly", "preflightUnavailable", "markRejected",
  "cleanupRejected", "relationRejected", "markCustomer",
].map((key) => `platform.testTenant.${key}`);

test("Platform test-tenant system copy is complete in all seven languages", () => {
  for (const language of SUPPORTED_UI_LANGUAGES) {
    for (const key of keys) {
      const value = translateStructural(key, language);
      assert.notEqual(value, key, `${language}: ${key}`);
      assert.ok(value.trim().length > 0, `${language}: ${key}`);
      if (language !== "de") {
        assert.doesNotMatch(value, /Begründung|Vorprüfung|bereinigt|Test-Mandant|Mitgliedschaft|Punktebuchung/, `${language}: ${key}`);
      }
    }
  }
});

test("Platform test-tenant panel renders system labels through the established i18n provider", () => {
  const source = read("src/modules/platform/PlatformKassaCompliancePanel.tsx");
  for (const key of keys.filter((key) => key !== "platform.testTenant.markCustomer")) {
    assert.match(source, new RegExp(`t\\(\\"${key.replaceAll(".", "\\.")}\\"\\)`), key);
  }
  const operations = read("src/modules/platform/PlatformOperationsPanel.tsx");
  assert.match(operations, /t\("platform\.testTenant\.markCustomer"\)/);
  assert.doesNotMatch(source, />Als TEST-ONLY markieren</);
  assert.doesNotMatch(source, />Test-Tenant vollständig bereinigen</);
  assert.doesNotMatch(source, />Nur fremde Test-Zuordnung entfernen</);
});

test("Test-tenant panel keeps writes service-bound and request-idempotent", () => {
  const source = read("src/modules/platform/PlatformKassaCompliancePanel.tsx");
  assert.match(source, /markPlatformTestTenant\(\{[\s\S]*?confirmation,[\s\S]*?idempotencyKey:[\s\S]*?reason,[\s\S]*?restaurantId,[\s\S]*?testSessionId,/);
  assert.match(source, /cleanupPlatformTestTenant\(\{ confirmation, reason, restaurantId \}\)/);
  assert.match(source, /cleanupPlatformForeignTestCustomerRelation\(\{/);
  assert.doesNotMatch(source, /\.from\(|supabase|service_role|disable row level security/i);
});
