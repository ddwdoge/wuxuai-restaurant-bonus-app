import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CUSTOMER_ACTIVATION_PREFERENCE_VERSION,
  CUSTOMER_ACTIVATION_SNOOZE_MS,
  CUSTOMER_ACTIVATION_STORAGE_PREFIX,
  customerActivationPresentationState,
  customerActivationSummary,
  customerActivationUiState,
  customerInstallState,
  customerPushState,
  defaultCustomerActivationPreference,
  dismissCustomerActivation,
  readCustomerActivationPreference,
  resetCustomerActivationPreference,
  shouldAutoOpenCustomerActivation,
  shouldShowCustomerActivationBanner,
  snoozeCustomerActivation,
  writeCustomerActivationPreference,
} from "../src/modules/customer/customerActivationSetup.mjs";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const page = readFileSync(new URL("../src/modules/customer/CentralCustomerPage.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/modules/customer/central-customer.css", import.meta.url), "utf8");
const drawer = readFileSync(new URL("../src/shared/components/AppDrawer.tsx", import.meta.url), "utf8");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    value(key) { return values.get(key) ?? null; },
  };
}

function uiInput(overrides = {}) {
  return {
    preferenceReady: true,
    setupComplete: false,
    installState: "manual_ios",
    preference: defaultCustomerActivationPreference(),
    now: new Date("2026-10-02T08:00:00.000Z"),
    ...overrides,
  };
}

test("versioned preference stores presentation only and remains per customer", () => {
  const storage = memoryStorage();
  const preference = dismissCustomerActivation(defaultCustomerActivationPreference());
  assert.equal(writeCustomerActivationPreference(storage, "customer-a", preference), true);
  assert.deepEqual(readCustomerActivationPreference(storage, "customer-a"), preference);
  assert.deepEqual(readCustomerActivationPreference(storage, "customer-b"), defaultCustomerActivationPreference());
  assert.equal(preference.version, CUSTOMER_ACTIVATION_PREFERENCE_VERSION);
  assert.match(CUSTOMER_ACTIVATION_STORAGE_PREFIX, /customer-activation/);
  assert.doesNotMatch(JSON.stringify(preference), /installed|pushGranted|emailConfirmed/);
});

test("legacy explicit opt-out migrates to the V2 presentation dismissal", () => {
  const dismissedKey = `${CUSTOMER_ACTIVATION_STORAGE_PREFIX}dismissed`;
  const storage = memoryStorage({
    [dismissedKey]: JSON.stringify({ autoReminderEnabled: false, firstLoginDrawerSeen: true, lastSnoozedAt: null }),
  });
  assert.equal(readCustomerActivationPreference(storage, "dismissed").presentation, "dismissed");
});

test("legacy snooze migrates to seven days and expires back to open", () => {
  const snoozedKey = `${CUSTOMER_ACTIVATION_STORAGE_PREFIX}snoozed`;
  const storage = memoryStorage({
    [snoozedKey]: JSON.stringify({ autoReminderEnabled: true, firstLoginDrawerSeen: true, lastSnoozedAt: "2026-10-02T08:00:00.000Z" }),
  });
  const preference = readCustomerActivationPreference(storage, "snoozed");
  assert.equal(preference.presentation, "open");
  assert.equal(preference.snoozedUntil, "2026-10-09T08:00:00.000Z");
  assert.equal(customerActivationPresentationState(preference, new Date("2026-10-08T08:00:00.000Z")), "snoozed_until");
  assert.equal(customerActivationPresentationState(preference, new Date("2026-10-09T08:00:00.000Z")), "open");
});

test("legacy first-login marker alone never becomes a permanent opt-out", () => {
  const key = `${CUSTOMER_ACTIVATION_STORAGE_PREFIX}seen`;
  const storage = memoryStorage({
    [key]: JSON.stringify({ autoReminderEnabled: true, firstLoginDrawerSeen: true, lastSnoozedAt: null }),
  });
  assert.deepEqual(readCustomerActivationPreference(storage, "seen"), defaultCustomerActivationPreference());
});

test("damaged legacy and unknown version values fail safe to open", () => {
  const storage = memoryStorage({
    [`${CUSTOMER_ACTIVATION_STORAGE_PREFIX}legacy`]: JSON.stringify({ autoReminderEnabled: "false", firstLoginDrawerSeen: "yes", lastSnoozedAt: "not-a-date" }),
    [`${CUSTOMER_ACTIVATION_STORAGE_PREFIX}future`]: JSON.stringify({ version: 999, presentation: "dismissed", snoozedUntil: null }),
  });
  assert.deepEqual(readCustomerActivationPreference(storage, "legacy"), defaultCustomerActivationPreference());
  assert.deepEqual(readCustomerActivationPreference(storage, "future"), defaultCustomerActivationPreference());
});

test("damaged local values fail safe to a visible open state", () => {
  const invalidJson = memoryStorage({ [`${CUSTOMER_ACTIVATION_STORAGE_PREFIX}a`]: "{" });
  const invalidShape = memoryStorage({ [`${CUSTOMER_ACTIVATION_STORAGE_PREFIX}b`]: JSON.stringify({ version: 2, presentation: "hidden-forever" }) });
  assert.deepEqual(readCustomerActivationPreference(invalidJson, "a"), defaultCustomerActivationPreference());
  assert.deepEqual(readCustomerActivationPreference(invalidShape, "b"), defaultCustomerActivationPreference());
});

test("install state trusts runtime evidence and never a local completion flag", () => {
  const base = { displayModeStandalone: false, iosStandalone: false, promptAvailable: false, isIos: false, isEmbeddedBrowser: false };
  assert.equal(customerInstallState({ ...base, displayModeStandalone: true }), "installed");
  assert.equal(customerInstallState({ ...base, iosStandalone: true, isIos: true }), "installed");
  assert.equal(customerInstallState({ ...base, promptAvailable: true }), "prompt_available");
  assert.equal(customerInstallState({ ...base, isIos: true }), "manual_ios");
  assert.equal(customerInstallState(base), "manual_browser");
  assert.equal(customerInstallState({ ...base, isEmbeddedBrowser: true }), "unavailable");
});

test("push status remains separate from installation presentation", () => {
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
  assert.equal(customerActivationSummary({ emailConfirmed: false, installState: "manual_ios", pushState: "available" }).incompleteCount, 3);
});

test("WebKit and iOS use manual guidance rather than a programmatic prompt", () => {
  assert.equal(customerInstallState({ displayModeStandalone: false, iosStandalone: false, promptAvailable: false, isIos: true, isEmbeddedBrowser: false }), "manual_ios");
  assert.match(page, /customer\.activation\.showInstructions/);
  assert.match(page, /customer\.activation\.installStepMenu/);
  assert.match(page, /customer\.activation\.installStepHome/);
  assert.match(page, /customer\.activation\.installStepConfirm/);
});

test("manual installation row is a semantic actionable button without a disabled dead CTA", () => {
  assert.match(page, /<button className="central-activation-step central-activation-step-action"/);
  assert.match(page, /onClick=\{\(\) => void runInstallAction\(\)\}/);
  assert.doesNotMatch(page, /disabled=\{(?:installState|!installPrompt)/);
});

test("Chromium beforeinstallprompt exposes an explicit install action", () => {
  assert.match(page, /beforeinstallprompt/);
  assert.match(page, /customer\.activation\.installApp/);
  assert.match(page, /installState === "prompt_available"/);
});

test("native install prompt is called only from the explicit install action", () => {
  const actionStart = page.indexOf("async function runInstallAction");
  const promptCall = page.indexOf("currentPrompt.prompt()", actionStart);
  assert.ok(actionStart > 0);
  assert.ok(promptCall > actionStart);
  assert.doesNotMatch(page.slice(0, actionStart), /\.prompt\(\)/);
});

test("consumed prompt is cleared and native decline is distinct from presentation dismissal", () => {
  assert.match(page, /setInstallPrompt\(null\);[\s\S]*await currentPrompt\.prompt\(\)/);
  assert.match(page, /setNativePromptOutcome\(choice\.outcome === "accepted" \? "accepted" : "declined"\)/);
  assert.match(page, /nativePromptOutcome === "accepted"/);
  assert.doesNotMatch(page, /install(?:ed)?\s*:\s*true/);
});

test("desktop Chromium and other suitable browsers without a prompt use generic manual guidance", () => {
  assert.equal(customerInstallState({ displayModeStandalone: false, iosStandalone: false, promptAvailable: false, isIos: false, isEmbeddedBrowser: false }), "manual_browser");
  assert.match(page, /installState === "manual_ios" \|\| installState === "manual_browser"/);
  assert.match(page, /customer\.activation\.browserInstallStepMenu/);
  assert.match(page, /customer\.activation\.browserInstallStepInstall/);
  assert.match(page, /customer\.activation\.browserInstallStepConfirm/);
});

test("known embedded browsers remain fail-closed as unavailable", () => {
  assert.equal(customerInstallState({ displayModeStandalone: false, iosStandalone: false, promptAvailable: false, isIos: false, isEmbeddedBrowser: true }), "unavailable");
  assert.match(page, /embeddedBrowser =/);
});

test("declining the native prompt keeps presentation open and the banner reachable", () => {
  const preference = defaultCustomerActivationPreference();
  const input = uiInput({ preference, installState: "manual_browser" });
  const actionSource = page.slice(page.indexOf("async function runInstallAction"), page.indexOf("async function runActivationAction"));
  assert.equal(preference.presentation, "open");
  assert.notEqual(customerInstallState({ displayModeStandalone: false, iosStandalone: false, promptAvailable: false, isIos: false, isEmbeddedBrowser: false }), "installed");
  assert.equal(shouldShowCustomerActivationBanner(input), true);
  assert.doesNotMatch(actionSource, /dismissCustomerActivation|writeCustomerActivationPreference/);
});

test("standalone runtime suppresses both automatic sheet and banner", () => {
  const input = uiInput({ installState: "installed" });
  assert.equal(customerActivationUiState(input), "installed");
  assert.equal(shouldShowCustomerActivationBanner(input), false);
  assert.equal(shouldAutoOpenCustomerActivation({ ...input, accountReady: true, view: "home" }), false);
  assert.match(page, /if \(installState !== "installed"\) return;[\s\S]*setActivationOpen\(false\)/);
});

test("remind later stores exactly seven days", () => {
  const now = new Date("2026-10-02T08:00:00.000Z");
  const snoozed = snoozeCustomerActivation(defaultCustomerActivationPreference(), now);
  assert.equal(Date.parse(snoozed.snoozedUntil) - now.getTime(), CUSTOMER_ACTIVATION_SNOOZE_MS);
  assert.equal(snoozed.snoozedUntil, "2026-10-09T08:00:00.000Z");
});

test("snooze prevents automatic opening while the manually clickable banner remains", () => {
  const preference = snoozeCustomerActivation(defaultCustomerActivationPreference(), new Date("2026-10-02T08:00:00.000Z"));
  const input = uiInput({ preference, now: new Date("2026-10-08T08:00:00.000Z") });
  assert.equal(customerActivationPresentationState(preference, input.now), "snoozed_until");
  assert.equal(shouldAutoOpenCustomerActivation({ ...input, accountReady: true, view: "home" }), false);
  assert.equal(shouldShowCustomerActivationBanner(input), true);
});

test("after snooze expiry automatic opening is allowed again", () => {
  const preference = snoozeCustomerActivation(defaultCustomerActivationPreference(), new Date("2026-10-02T08:00:00.000Z"));
  const input = uiInput({ preference, now: new Date("2026-10-09T08:00:00.000Z") });
  assert.equal(customerActivationPresentationState(preference, input.now), "open");
  assert.equal(shouldAutoOpenCustomerActivation({ ...input, accountReady: true, view: "home" }), true);
});

test("drawer X uses the same seven-day snooze path and cannot immediately reopen", () => {
  assert.match(page, /onClose=\{snoozeActivation\}/);
  assert.match(page, /snoozeCustomerActivation\(activationPreference\)/);
  const preference = snoozeCustomerActivation(defaultCustomerActivationPreference(), new Date("2026-10-02T08:00:00.000Z"));
  assert.equal(shouldAutoOpenCustomerActivation({ ...uiInput({ preference }), accountReady: true, view: "home" }), false);
});

test("permanent dismissal survives reload, tab restart and relogin in the same browser", () => {
  const storage = memoryStorage();
  const dismissed = dismissCustomerActivation(defaultCustomerActivationPreference());
  assert.equal(writeCustomerActivationPreference(storage, "customer-a", dismissed), true);
  for (const scenario of ["reload", "tab restart", "relogin"]) {
    assert.deepEqual(readCustomerActivationPreference(storage, "customer-a"), dismissed, scenario);
  }
});

test("dismissal hides both automatic sheet and banner without claiming installation", () => {
  const preference = dismissCustomerActivation(defaultCustomerActivationPreference());
  const input = uiInput({ preference });
  assert.equal(customerActivationUiState(input), "dismissed");
  assert.equal(shouldShowCustomerActivationBanner(input), false);
  assert.equal(shouldAutoOpenCustomerActivation({ ...input, accountReady: true, view: "home" }), false);
  assert.notEqual(customerInstallState({ displayModeStandalone: false, iosStandalone: false, promptAvailable: false, isIos: true, isEmbeddedBrowser: false }), "installed");
});

test("banner and sheet derive visibility from the same authoritative UI state", () => {
  assert.match(page, /customerActivationUiState\(/);
  assert.match(page, /shouldShowCustomerActivationBanner\(/);
  assert.match(page, /shouldAutoOpenCustomerActivation\(/);
  assert.match(page, /showActivationBanner \? \(/);
});

test("preference hydration fails closed without banner or auto-open flicker", () => {
  const input = uiInput({ preferenceReady: false });
  assert.equal(customerActivationUiState(input), "hydrating");
  assert.equal(shouldShowCustomerActivationBanner(input), false);
  assert.equal(shouldAutoOpenCustomerActivation({ ...input, accountReady: true, view: "home" }), false);
  assert.match(page, /activationPreferenceOwnerId === user\?\.id/);
});

test("account settings can explicitly restore a dismissed installation notice", () => {
  assert.deepEqual(resetCustomerActivationPreference(), defaultCustomerActivationPreference());
  assert.match(page, /customer\.activation\.restoreInstallNotice/);
  assert.match(page, /persistActivationPreference\(resetCustomerActivationPreference\(\)\)/);
});

test("task row, drawer and close controls retain keyboard and focus behavior", () => {
  assert.match(page, /central-activation-step-action[\s\S]*type="button"/);
  assert.match(page, /data-drawer-autofocus/);
  assert.match(drawer, /focusableSelector/);
  assert.match(drawer, /event\.key === "Escape"/);
  assert.match(drawer, /previousFocus\?\.focus/);
  assert.match(css, /central-activation-step-action:focus-visible/);
});

test("activation controls meet touch, contrast, safe-area and narrow-layout contracts", () => {
  assert.match(css, /\.central-activation-reminder[\s\S]*min-height: 44px/);
  assert.match(css, /\.app-drawer-panel:has\(\.central-activation-content\)[\s\S]*--drawer-viewport-height/);
  assert.match(css, /\.app-drawer-panel:has\(\.central-activation-content\) \.app-drawer-footer > \* \{ min-height: 44px/);
  assert.match(css, /\.premium-button-primary/);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*central-activation-step/);
});

test("new installation copy exists in all seven supported languages", () => {
  const keys = [
    "customer.activation.installApp",
    "customer.activation.showInstructions",
    "customer.activation.remindLater",
    "customer.activation.dismiss",
    "customer.activation.restoreInstallNotice",
    "customer.activation.instructionsTitle",
    "customer.activation.installStepMenu",
    "customer.activation.installStepHome",
    "customer.activation.installStepConfirm",
    "customer.activation.browserInstallStepMenu",
    "customer.activation.browserInstallStepInstall",
    "customer.activation.browserInstallStepConfirm",
    "customer.activation.installAccepted",
    "customer.activation.installDismissed",
  ];
  for (const language of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    for (const key of keys) assert.notEqual(translateStructural(key, language), key, `${language}:${key}`);
  }
});

test("setup UI has no backend or business write path", () => {
  const setupState = readFileSync(new URL("../src/modules/customer/customerActivationSetup.mjs", import.meta.url), "utf8");
  const setupHandlers = page.slice(page.indexOf("function snoozeActivation"), page.indexOf("const activationStatus"));
  const setupDrawer = page.slice(page.indexOf("<AppDrawer"));
  const setupSource = `${setupState}\n${setupHandlers}\n${setupDrawer}`;
  assert.doesNotMatch(setupSource, /supabase\.|\.rpc\(|points_transactions|reward|inbox|membership.*(?:insert|update)|service_role/i);
});

test("existing customer account, staff and owner service boundaries remain untouched", () => {
  assert.match(page, /loadCustomerAccount\(\)/);
  assert.match(page, /openCustomerAccountMembership\(membership\)/);
  assert.doesNotMatch(page, /from "\.\.\/staff|from "\.\.\/admin/);
});
