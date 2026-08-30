import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HIGH_SINGLE_AMOUNT_RATIO,
  isHighSingleAmount,
  pointAnomalyActorKind,
  pointAnomalyNoticeKey,
  pointTransactionReference,
} from "../src/modules/admin/pointAnomalyPolicy.mjs";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const [dashboard, service, basePointsMigration, actorMigration, settings] = await Promise.all([
  read("../src/modules/admin/pages/AdminDashboard.tsx"),
  read("../src/modules/admin/pointAnomalyService.ts"),
  read("../supabase/migrations/20260731001000_restaurant_controlled_points_collection.sql"),
  read("../supabase/migrations/20260825005000_owner_own_staff_portal_access.sql"),
  read("../src/modules/admin/pages/SettingsPage.tsx"),
]);

test("single high amount warning follows exactly 80 percent of the configured maximum", () => {
  assert.equal(HIGH_SINGLE_AMOUNT_RATIO, 0.8);
  assert.equal(isHighSingleAmount(23999, 30000), false);
  assert.equal(isHighSingleAmount(24000, 30000), true);
  assert.equal(isHighSingleAmount(24001, 30000), true);
  assert.equal(isHighSingleAmount(39999, 50000), false);
  assert.equal(isHighSingleAmount(40000, 50000), true);
  assert.match(basePointsMigration, /points_collection_max_amount_cents \* 0\.8/);
});

test("existing configurable amount and customer daily hard limits remain unchanged", () => {
  assert.match(basePointsMigration, /set points_collection_max_amount_cents = 30000/);
  assert.match(basePointsMigration, /between 100 and 100000/);
  assert.match(basePointsMigration, />= 2 then/);
  assert.match(basePointsMigration, /POINTS_DAILY_LIMIT/);
  assert.match(settings, /Standard 300 EUR/);
  assert.match(settings, /max="1000" min="1"/);
});

test("V1 monitoring consumes only the existing single high amount audit event", () => {
  assert.match(service, /HIGH_POINTS_AMOUNT_REVIEW/);
  assert.match(service, /isHighSingleAmount/);
  assert.doesNotMatch(service, /staff.*(daily|day|count|sum)|restaurant.*(daily|day|count|sum)|customer.*(daily|day|sum)/i);
  assert.doesNotMatch(dashboard, /Betrugsverdacht|Staff sperren|Punkte zurück|automatisch stornieren/i);
});

test("owner dashboard warning is compact, reviewable and informational only", () => {
  assert.match(dashboard, /Ungewöhnlich hoher Buchungsbetrag/);
  assert.match(dashboard, /Eine Punktebuchung liegt nahe am festgelegten Maximalbetrag/);
  assert.match(dashboard, />\s*Prüfen\s*</);
  for (const label of ["Zeitpunkt", "Betrag", "Gutgeschriebene Punkte", "Gast", "Ausgeführt von", "Restaurant", "Buchungsreferenz"]) {
    assert.match(dashboard, new RegExp(label));
  }
  assert.match(dashboard, /verändert weder Punkte noch Kontozugänge/);
});

test("owner and Staff actors retain their authoritative identities", () => {
  assert.equal(pointAnomalyActorKind("admin"), "owner");
  assert.equal(pointAnomalyActorKind("staff"), "staff");
  assert.equal(pointAnomalyActorKind("customer"), null);
  assert.match(actorMigration, /actor_type_value := 'admin'/);
  assert.match(actorMigration, /'actor_restaurant_role', actor_restaurant_role/);
  assert.match(actorMigration, /'operational_access_mode', 'operator'/);
  assert.match(service, /Restaurantinhaber/);
  assert.match(service, /Mitarbeiter/);
});

test("warning reads remain tenant scoped and reviewed notices are user scoped", () => {
  assert.match(service, /\.eq\("restaurant_id", restaurantId\)/);
  assert.match(service, /\.eq\("event_type", "HIGH_POINTS_AMOUNT_REVIEW"\)/);
  assert.match(service, /loadCustomers\(restaurantId\)/);
  assert.equal(pointAnomalyNoticeKey("audit-id"), "point_anomaly_audit-id");
});

test("transaction references are compact and do not expose another identifier", () => {
  assert.equal(pointTransactionReference("12345678-1234-1234-1234-abcdef987654"), "EF987654");
});
