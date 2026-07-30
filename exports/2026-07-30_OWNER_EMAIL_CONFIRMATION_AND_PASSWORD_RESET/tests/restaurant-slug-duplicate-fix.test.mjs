import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildRestaurantActivationPayload,
  indexRowsByKey,
  requireExistingRestaurantId,
  shouldSkipCompletedOnboarding,
} from "../src/modules/onboarding/restaurantOnboardingActivation.mjs";

const onboardingServicePath = new URL("../src/modules/onboarding/pilotOnboardingService.ts", import.meta.url);
const onboardingPagePath = new URL("../src/modules/admin/pages/RestaurantOnboarding.tsx", import.meta.url);
const ownerTrialMigrationPath = new URL(
  "../supabase/migrations/20260713004000_live_go_hardening_rate_limit_owner_race.sql",
  import.meta.url,
);

test("new restaurants remain the responsibility of the idempotent owner registration RPC", async () => {
  const source = await readFile(ownerTrialMigrationPath, "utf8");
  const functionSource = source.slice(source.indexOf("create or replace function public.start_restaurant_owner_trial"));

  assert.match(functionSource, /select \*\s+into restaurant_record\s+from public\.restaurants\s+where owner_id = user_id_value/);
  assert.match(functionSource, /if restaurant_record\.id is null then[\s\S]*insert into public\.restaurants/);
  assert.match(functionSource, /else\s+update public\.restaurants[\s\S]*where id = restaurant_record\.id/);
});

test("onboarding activation requires an existing restaurant and never inserts one", async () => {
  const source = await readFile(onboardingServicePath, "utf8");

  assert.throws(() => requireExistingRestaurantId(null), /bestehende Restaurant/);
  assert.equal(requireExistingRestaurantId(" restaurant-id "), "restaurant-id");
  assert.doesNotMatch(source, /from\("restaurants"\)\s*\.insert\(/);
  assert.doesNotMatch(source, /from\("restaurants"\)\s*\.update\(/);
  assert.match(source, /rpc\("complete_restaurant_onboarding"/);
});

test("activation updates status without changing an existing slug", () => {
  const existingRestaurant = { id: "restaurant-id", slug: "existing-slug", status: "draft" };
  const payload = buildRestaurantActivationPayload({
    restaurantName: "Name mit bereits belegtem Slug",
    restaurantType: "restaurant",
    language: "de",
    openingHours: {},
    specialDays: [],
    holidays: [],
    smartOpenEnabled: true,
    onboardingChecklist: { ready: true },
  });

  assert.equal(Object.hasOwn(payload, "status"), false);
  assert.equal(Object.hasOwn(payload, "onboarding_status"), false);
  assert.equal(Object.hasOwn(payload, "slug"), false);
  assert.equal({ ...existingRestaurant, ...payload }.slug, "existing-slug");
});

test("repeated activation reuses completed state and keyed setup records", () => {
  assert.equal(shouldSkipCompletedOnboarding("completed"), true);
  assert.equal(shouldSkipCompletedOnboarding("draft"), false);
  assert.equal(shouldSkipCompletedOnboarding("ready"), false);

  const rows = indexRowsByKey([
    { id: "rule-1", title: "Besuch" },
    { id: "rule-2", title: "Menü" },
  ], "title");
  assert.equal(rows.get("Besuch")?.id, "rule-1");
  assert.equal(rows.get("Menü")?.id, "rule-2");
});

test("double click is synchronously blocked and the existing slug is used", async () => {
  const source = await readFile(onboardingPagePath, "utf8");

  assert.match(source, /const submissionInFlightRef = useRef\(false\)/);
  assert.match(source, /if \(submissionInFlightRef\.current\) \{\s*return;\s*\}/);
  assert.match(source, /submissionInFlightRef\.current = true;[\s\S]*setSaving\(true\)/);
  assert.match(source, /finally \{\s*submissionInFlightRef\.current = false;\s*setSaving\(false\)/);
  assert.match(source, /const restaurantSlug = activeRestaurant\?\.slug \?\? ""/);
  assert.doesNotMatch(source, /slugifyRestaurant/);
});
