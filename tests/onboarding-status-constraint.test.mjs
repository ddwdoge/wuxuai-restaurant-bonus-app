import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260730001000_onboarding_status_allow_completed.sql",
    import.meta.url,
  ),
  "utf8",
);
const activation = await readFile(
  new URL("../src/modules/onboarding/restaurantOnboardingActivation.mjs", import.meta.url),
  "utf8",
);
const domainTypes = await readFile(
  new URL("../src/shared/types/domain.ts", import.meta.url),
  "utf8",
);
const onboardingService = await readFile(
  new URL("../src/modules/onboarding/pilotOnboardingService.ts", import.meta.url),
  "utf8",
);
const adminLayout = await readFile(
  new URL("../src/modules/admin/AdminLayout.tsx", import.meta.url),
  "utf8",
);
const appRoutes = await readFile(
  new URL("../src/app/App.tsx", import.meta.url),
  "utf8",
);

const allowedStatuses = migration
  .match(/onboarding_status in \(([^)]+)\)/i)?.[1]
  .match(/'([^']+)'/g)
  ?.map((value) => value.slice(1, -1)) ?? [];

test("Onboarding-Constraint behält draft und ready bei", () => {
  assert.ok(allowedStatuses.includes("draft"));
  assert.ok(allowedStatuses.includes("ready"));
});

test("Onboarding-Constraint erlaubt completed", () => {
  assert.ok(allowedStatuses.includes("completed"));
  assert.deepEqual(allowedStatuses, ["draft", "ready", "completed"]);
});

test("Onboarding-Constraint lehnt unbekannte Werte ab", () => {
  assert.equal(allowedStatuses.includes("unknown"), false);
  assert.equal(allowedStatuses.length, 3);
});

test("Migration ersetzt nur den exakten Check-Constraint", () => {
  assert.match(migration, /alter table public\.restaurants\s+drop constraint if exists restaurants_onboarding_status_check/i);
  assert.match(migration, /add constraint restaurants_onboarding_status_check/i);
  assert.doesNotMatch(migration, /\b(update|insert|delete)\b/i);
  assert.doesNotMatch(migration, /\b(policy|row level security)\b/i);
});

test("Aktivierung bleibt Update-only, slug-stabil und completed", () => {
  assert.match(activation, /onboarding_status: "completed"/);
  assert.match(activation, /status: "active"/);
  assert.doesNotMatch(activation, /\b(insert|upsert)\s*\(/i);
  assert.doesNotMatch(activation, /\bslug\s*:/i);
});

test("TypeScript, Mapper und Guards verwenden dieselben drei Statuswerte", () => {
  assert.match(domainTypes, /onboarding_status\?: "draft" \| "ready" \| "completed"/);
  assert.match(onboardingService, /as "draft" \| "ready" \| "completed"/);
  assert.match(activation, /onboardingStatus === "completed"/);
  assert.match(adminLayout, /onboardingStatus !== "ready" && onboardingStatus !== "completed"/);
  assert.match(appRoutes, /onboardingStatus === "ready" \|\| onboardingStatus === "completed"/);
});
