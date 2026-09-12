import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CUSTOMER_ACTIVATION_STORAGE_PREFIX,
  customerActivationSummary,
  customerInstallState,
  customerPushState,
  defaultCustomerActivationPreference,
  readCustomerActivationPreference,
  shouldAutoOpenCustomerActivation,
  writeCustomerActivationPreference,
} from "../src/modules/customer/customerActivationSetup.mjs";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const page = readFileSync(new URL("../src/modules/customer/CentralCustomerPage.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/modules/customer/central-customer.css", import.meta.url), "utf8");
const drawer = readFileSync(new URL("../src/shared/components/AppDrawer.tsx", import.meta.url), "utf8");

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test("setup preference is per user and stores only reminder presentation state", () => {
  const storage = memoryStorage();
  const preference = { autoReminderEnabled: false, firstLoginDrawerSeen: true, lastSnoozedAt: "2026-09-10T10:00:00.000Z" };
  assert.equal(writeCustomerActivationPreference(storage, "customer-a", preference), true);
  assert.deepEqual(readCustomerActivationPreference(storage, "customer-a"), preference);
  assert.deepEqual(readCustomerActivationPreference(storage, "customer-b"), defaultCustomerActivationPreference());
  assert.match(CUSTOMER_ACTIVATION_STORAGE_PREFIX, /customer-activation/);
  assert.doesNotMatch(JSON.stringify(preference), /installed|pushGranted|emailConfirmed/);
});

test("install state trusts runtime evidence and never a local completion flag", () => {
  const base = { displayModeStandalone: false, iosStandalone: false, promptAvailable: false, isIos: false, isAndroid: false };
  assert.equal(customerInstallState({ ...base, displayModeStandalone: true }), "installed");
  assert.equal(customerInstallState({ ...base, iosStandalone: true, isIos: true }), "installed");
  assert.equal(customerInstallState({ ...base, promptAvailable: true }), "prompt_available");
  assert.equal(customerInstallState({ ...base, isIos: true }), "manual_ios");
  assert.equal(customerInstallState({ ...base, isAndroid: true }), "manual_browser");
  assert.equal(customerInstallState(base), "unavailable");
});

test("push status separates available, granted, denied and unsupported", () => {
  assert.equal(customerPushState({ available: false, permission: "unsupported" }), "unavailable");
  assert.equal(customerPushState({ available: true, permission: "default" }), "available");
  assert.equal(customerPushState({ available: true, permission: "granted" }), "granted");
  assert.equal(customerPushState({ available: true, permission: "denied" }), "denied");
});

test("completion counts only relevant unfinished setup steps", () => {
  assert.deepEqual(customerActivationSummary({ emailConfirmed: true, installState: "installed", pushState: "granted" }), {
    complete: true,
    incompleteCount: 0,
    steps: { email: "complete", install: "complete", push: "complete" },
  });
  assert.deepEqual(customerActivationSummary({ emailConfirmed: false, installState: "manual_ios", pushState: "available" }).incompleteCount, 3);
  assert.deepEqual(customerActivationSummary({ emailConfirmed: true, installState: "unavailable", pushState: "denied" }), {
    complete: true,
    incompleteCount: 0,
    steps: { email: "complete", install: "not_applicable", push: "not_applicable" },
  });
});

test("first-login drawer opens once, remains optional and disappears after completion", () => {
  const preference = defaultCustomerActivationPreference();
  assert.equal(shouldAutoOpenCustomerActivation({ accountReady: true, view: "home", setupComplete: false, preference }), true);
  assert.equal(shouldAutoOpenCustomerActivation({ accountReady: true, view: "home", setupComplete: true, preference }), false);
  assert.equal(shouldAutoOpenCustomerActivation({ accountReady: true, view: "home", setupComplete: false, preference: { ...preference, firstLoginDrawerSeen: true } }), false);
  assert.equal(shouldAutoOpenCustomerActivation({ accountReady: true, view: "home", setupComplete: false, preference: { ...preference, autoReminderEnabled: false } }), false);
  assert.equal(shouldAutoOpenCustomerActivation({ accountReady: true, view: "account", setupComplete: false, preference }), false);
});

test("central customer UI provides drawer, snooze, compact reminder and settings re-entry", () => {
  assert.match(page, /<AppDrawer[\s\S]*size="compact"/);
  assert.match(page, /central-activation-reminder/);
  assert.match(page, /customer\.activation\.settings/);
  assert.match(page, /openActivation\(true\)/);
  assert.match(page, /openActivation\(false\)/);
  assert.match(page, /activationShowAll \|\| activationSummary\.steps\.email === "pending"/);
  assert.match(page, /lastSnoozedAt: new Date\(\)\.toISOString\(\)/);
  assert.match(page, /autoReminderEnabled: !event\.target\.checked/);
  assert.match(page, /!activationSummary\.complete/);
});

test("push permission is requested only inside the explicit setup action", () => {
  const actionStart = page.indexOf("async function runActivationAction");
  const permissionRequest = page.indexOf("Notification.requestPermission()", actionStart);
  const drawerStart = page.indexOf("<AppDrawer");
  assert.ok(actionStart > 0);
  assert.ok(permissionRequest > actionStart);
  assert.ok(permissionRequest < drawerStart);
  assert.doesNotMatch(page.slice(0, actionStart), /Notification\.requestPermission/);
});

test("real install prompt and appinstalled runtime event remain authoritative", () => {
  assert.match(page, /beforeinstallprompt/);
  assert.match(page, /installPrompt\.prompt\(\)/);
  assert.match(page, /installPrompt\.userChoice/);
  assert.match(page, /appinstalled/);
  assert.match(page, /display-mode: standalone/);
  assert.doesNotMatch(page, /install(?:ed)?\s*:\s*true/);
});

test("activation copy exists in all seven supported languages with preserved count placeholder", () => {
  for (const language of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    for (const key of ["customer.activation.title", "customer.activation.settings", "customer.activation.setupNow", "customer.activation.later"]) {
      assert.notEqual(translateStructural(key, language), key, `${language}:${key}`);
    }
    assert.match(translateStructural("customer.activation.reminder", language), /\{count\}/);
    assert.match(translateStructural("customer.activation.description", language), /\{count\}/);
    assert.notEqual(translateStructural("customer.activation.reminderOne", language), "customer.activation.reminderOne");
    assert.notEqual(translateStructural("customer.activation.descriptionOne", language), "customer.activation.descriptionOne");
  }
  assert.match(drawer, /useI18n\(\)/);
  assert.match(drawer, /aria-label=\{closeLabel \?\? t\("common\.close"\)\}/);
});

test("activation controls meet touch, safe-area and narrow-layout contracts", () => {
  assert.match(css, /\.central-activation-reminder[\s\S]*min-height: 44px/);
  assert.match(css, /\.central-activation-info[\s\S]*min-height: 44px/);
  assert.match(css, /\.app-drawer-panel:has\(\.central-activation-content\)[\s\S]*max-height: min\(78dvh, 620px\)/);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*central-activation-step/);
  assert.doesNotMatch(css.match(/\.central-activation-content \{[^}]+\}/)?.[0] ?? "", /overflow-x/);
});
