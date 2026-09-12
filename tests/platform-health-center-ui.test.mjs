import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterHealthFindings, findingCounts, isHealthSnapshotStale, normalizeHealthFilters } from "../src/modules/platform/platformHealthCenterView.mjs";
import { PLATFORM_HEALTH_MESSAGES } from "../src/shared/i18n/platformHealthMessages.mjs";

const page = readFileSync(new URL("../src/modules/platform/PlatformHealthCenterPage.tsx", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/platform/platformAdminService.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/app/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const findings = [
  { id: "a", type: "ONBOARDING_INCOMPLETE", severity: "P1", category: "ONBOARDING", target: { restaurant_id: "r1", restaurant_name: "Alpha", location_id: "l1", country: "AT", plan: "BASIC" } },
  { id: "b", type: "SYSTEM_EMAIL", severity: "P2", category: "SYSTEM", target: { system_area: "email" } },
  { id: "c", type: "COUNTRY_READINESS_OPEN", severity: "P3", category: "COUNTRY", target: { country: "DE" } },
];

test("filters are stable URL state and combine every approved facet", () => {
  const params = new URLSearchParams("severity=P1&category=ONBOARDING&restaurant=r1&location=l1&country=at&plan=basic&query=alpha&finding=a");
  const filters = normalizeHealthFilters(params);
  assert.deepEqual(filters, { severity: "P1", category: "ONBOARDING", restaurant: "r1", location: "l1", country: "AT", plan: "BASIC", health: "", query: "alpha", finding: "a" });
  assert.deepEqual(filterHealthFindings(findings, filters).map((item) => item.id), ["a"]);
  assert.deepEqual(findingCounts(findings), { P0: 0, P1: 1, P2: 1, P3: 1 });
});

test("search includes the visible localized finding and category labels", () => {
  const filters = normalizeHealthFilters(new URLSearchParams("query=E-Mail"));
  const visibleText = (finding) => finding.type === "SYSTEM_EMAIL"
    ? "E-Mail-Betrieb benötigt Aufmerksamkeit System"
    : "";

  assert.deepEqual(filterHealthFindings(findings, filters, visibleText).map((item) => item.id), ["b"]);
});

test("invalid filter values fail closed to supported filter sets", () => {
  const filters = normalizeHealthFilters(new URLSearchParams("severity=P9&category=SECRET&health=BAD"));
  assert.equal(filters.severity, "");
  assert.equal(filters.category, "");
  assert.equal(filters.health, "");
});

test("freshness becomes stale without claiming automatic realtime", () => {
  assert.equal(isHealthSnapshotStale("2026-09-12T10:00:00Z", Date.parse("2026-09-12T10:04:59Z")), false);
  assert.equal(isHealthSnapshotStale("2026-09-12T10:00:00Z", Date.parse("2026-09-12T10:05:01Z")), true);
  assert.equal(isHealthSnapshotStale("invalid"), true);
});

test("UI uses the protected RPC, protected route and no direct table read", () => {
  assert.match(service, /supabase\.rpc\("get_platform_health_center"\)/);
  assert.doesNotMatch(service, /loadPlatformHealthCenter[\s\S]{0,500}\.from\(/);
  assert.match(app, /path="\/admin\/platform\/health"/);
  assert.match(app, /roleScope="platform"/);
  assert.match(page, /loadPlatformHealthCenter/);
  assert.doesNotMatch(page, /service[_-]?role|access_token|refresh_token/i);
});

test("every KPI and finding has a real interactive target", () => {
  assert.match(page, /platform-health-kpi[\s\S]*onClick/);
  assert.match(page, /updateFilter\("severity"/);
  assert.match(page, /updateFilter\("health"/);
  assert.match(page, /platform-health-finding[\s\S]*onClick/);
  assert.match(page, /platform-health-target-link/);
  assert.doesNotMatch(page, /Alles beheben|Fix all|auto.?repair/i);
});

test("all seven languages have exact Health Center key parity", () => {
  const languages = ["de", "en", "fr", "it", "es", "zh", "ko"];
  const canonical = Object.keys(PLATFORM_HEALTH_MESSAGES.de).sort();
  assert.ok(canonical.length >= 100);
  for (const language of languages) {
    assert.deepEqual(Object.keys(PLATFORM_HEALTH_MESSAGES[language]).sort(), canonical, language);
    for (const value of Object.values(PLATFORM_HEALTH_MESSAGES[language])) assert.ok(String(value).trim(), `${language} empty message`);
  }
});

test("responsive and accessible controls keep 44px targets from 320px upward", () => {
  assert.match(styles, /\.platform-health-shell \.button \{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.platform-health-filter-grid select,[\s\S]*min-height: 44px/);
  assert.match(styles, /\.platform-health-finding[\s\S]*min-height: 58px/);
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*\.platform-health-filter-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(styles, /min-width: 0/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(page, /aria-pressed/);
  assert.match(page, /aria-live="polite"/);
});
