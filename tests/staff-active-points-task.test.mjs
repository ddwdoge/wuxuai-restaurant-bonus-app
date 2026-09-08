import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ACTIVE_POINTS_TASK_MAX_AGE_MS,
  activePointsTaskExpiryMs,
  activePointsTaskStage,
  createActivePointsTaskContext,
  isActivePointsTaskContextValid,
  isActivePointsTaskExpired,
  withActivePointsTaskExpiry,
} from "../src/modules/staff/staffActivePointsTask.mjs";
import { translateStructural } from "../src/shared/i18n/catalog.mjs";

const staff = readFileSync(new URL("../src/modules/staff/StaffTablet.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/modules/staff/staff-premium.css", import.meta.url), "utf8");
const helper = readFileSync(new URL("../src/modules/staff/staffActivePointsTask.mjs", import.meta.url), "utf8");
const baseContext = createActivePointsTaskContext({
  actorId: "actor-a",
  restaurantId: "restaurant-a",
  roleContext: "staff::staff",
  now: 1_000,
});

test("1 scan QR opens the workflow and creates session-bound context", () => {
  assert.match(staff, /setScannerOpen\(true\)/);
  assert.match(staff, /createActivePointsTaskContext\(\{[\s\S]*actorId: user\.id,[\s\S]*restaurantId,[\s\S]*roleContext: staffAccessContext/);
});

test("2 secure preview keeps the full canonical customer label", () => {
  assert.match(staff, /<h3>\{pointsPreview\.customer_label\}<\/h3>/);
  assert.doesNotMatch(staff, /pointsPreview\.customer_label\.split/);
});

test("3 outside dismissal minimizes instead of cancelling", () => {
  assert.match(staff, /dismissOnOverlay=\{hasActivePointsTask\}/);
  assert.match(staff, /function dismissScanner\(\)[\s\S]*hasActivePointsTaskRef\.current[\s\S]*minimizeActivePointsTask/);
});

test("4 minimized task exposes a compact persistent status", () => {
  assert.match(staff, /pointsTaskMinimized && hasActivePointsTask/);
  assert.match(staff, /staff-active-points-task/);
});

test("5 resume restores the same in-memory task without a reset", () => {
  const resume = staff.slice(staff.indexOf("function resumeActivePointsTask"), staff.indexOf("async function executePinAction"));
  assert.match(resume, /setScannerOpen\(true\)/);
  assert.doesNotMatch(resume, /resetSelectedCustomerState/);
});

test("6 entered amount has a distinct preserved task stage", () => {
  assert.equal(activePointsTaskStage({ hasPreview: false, amountCents: 1250, pinRequired: false }), "amount");
  assert.match(staff, /value=\{billAmount \|\| ""\}/);
});

test("7 PIN workflow step survives minimize and resume", () => {
  assert.equal(activePointsTaskStage({ hasPreview: true, amountCents: 1250, pinRequired: true }), "pin");
  assert.match(staff, /pinRequired: Boolean\(pendingPinAction\)/);
});

test("8 Daily PIN value is never stored in active task context", () => {
  assert.doesNotMatch(helper, /dailyPin|pinDraft|pinValue/i);
  assert.match(staff, /function minimizeActivePointsTask[\s\S]*setPinDraft\(""\)/);
});

test("9 QR expiry is never extended and blocks continuation", () => {
  assert.equal(activePointsTaskExpiryMs(baseContext), 1_000 + ACTIVE_POINTS_TASK_MAX_AGE_MS);
  const authoritative = withActivePointsTaskExpiry(baseContext, "2026-09-08T10:00:00.000Z");
  assert.equal(activePointsTaskExpiryMs(authoritative), Date.parse("2026-09-08T10:00:00.000Z"));
  assert.equal(isActivePointsTaskExpired(baseContext, 1_000 + ACTIVE_POINTS_TASK_MAX_AGE_MS), true);
  assert.match(staff, /staff\.activePoints\.expired/);
});

test("10 explicit cancel terminates active state only after confirmation", () => {
  assert.match(staff, /setCancelTaskPromptOpen\(true\)/);
  assert.match(staff, /onClick=\{\(\) => terminateActivePointsTask\(\)\}/);
});

test("11 a new QR request shows continue or cancel-and-new choice", () => {
  assert.match(staff, /setReplaceTaskPromptOpen\(true\)/);
  assert.match(staff, /staff\.activePoints\.continue/);
  assert.match(staff, /staff\.activePoints\.startNew/);
});

test("12 two parallel tasks are impossible", () => {
  const start = staff.slice(staff.indexOf("async function startQrScanner"), staff.indexOf("async function restartQrScanner"));
  assert.match(start, /hasActivePointsTaskRef\.current/);
  assert.match(start, /return;/);
});

test("13 tenant switch invalidates the task", () => {
  assert.equal(isActivePointsTaskContextValid(baseContext, { actorId: "actor-a", restaurantId: "restaurant-b", roleContext: "staff::staff" }), false);
});

test("14 restaurant switch invalidates the task", () => {
  assert.equal(isActivePointsTaskContextValid(baseContext, { actorId: "actor-a", restaurantId: "restaurant-other", roleContext: "staff::staff" }), false);
});

test("15 logout clears active state before sign-out", () => {
  const logout = staff.slice(staff.indexOf("async function handleStaffLogout"), staff.indexOf("function openStaffView"));
  assert.ok(logout.indexOf("resetSelectedCustomerState()") < logout.indexOf("await signOut()"));
});

test("16 role invalidation clears the task", () => {
  assert.equal(isActivePointsTaskContextValid(baseContext, { actorId: "actor-a", restaurantId: "restaurant-a", roleContext: "operator:owner:" }), false);
  assert.match(staff, /roleContext: staffAccessContext/);
});

test("17 successful final booking clears the active task", () => {
  const confirmation = staff.slice(staff.indexOf("function confirmRestaurantControlledPreview"), staff.indexOf("async function handleSearch"));
  assert.match(confirmation, /setActivePointsTaskContext\(null\)/);
  assert.match(confirmation, /setPointsQrReference\(null\)/);
});

test("18 preview remains non-booking and does not consume QR", () => {
  const preview = staff.slice(staff.indexOf("async function handleRestaurantControlledPreview"), staff.indexOf("function confirmRestaurantControlledPreview"));
  assert.match(preview, /previewRestaurantControlledPoints/);
  assert.doesNotMatch(preview, /confirmRestaurantControlledPoints|setPointsQrReference\(null\)/);
});

test("19 preview leaves transaction creation to final server confirmation", () => {
  assert.ok(staff.indexOf("previewRestaurantControlledPoints") < staff.indexOf("confirmRestaurantControlledPoints({ restaurantId"));
});

test("20 final submit without a valid PIN remains blocked", () => {
  assert.match(staff, /if \(!pin\.trim\(\)\)/);
  assert.match(staff, /disabled=\{!pinDraft \|\| saving\}/);
});

test("21 wrong-PIN handling remains delegated to the existing server contract", () => {
  assert.match(staff, /tages-pin.*nicht korrekt/i);
  assert.match(staff, /confirmRestaurantControlledPoints\(\{ restaurantId, qrReference: pointsQrReference/);
});

test("22 QR replay remains blocked by the unchanged final confirmation RPC", () => {
  assert.match(staff, /qr-code.*\(ungültig\|abgelaufen\|verwendet\|nicht gefunden\)/i);
  assert.doesNotMatch(helper, /consume|transaction|award/i);
});

test("23 another auth identity cannot resume the task", () => {
  assert.equal(isActivePointsTaskContextValid(baseContext, { actorId: "actor-b", restaurantId: "restaurant-a", roleContext: "staff::staff" }), false);
});

test("24 Owner-as-Staff uses the same context-bound workflow", () => {
  const owner = createActivePointsTaskContext({ actorId: "owner", restaurantId: "restaurant-a", roleContext: "operator:owner:" });
  assert.equal(isActivePointsTaskContextValid(owner, { actorId: "owner", restaurantId: "restaurant-a", roleContext: "operator:owner:" }), true);
  assert.match(staff, /access_mode === "operator"/);
});

test("25 Staff uses the same context-bound workflow", () => {
  assert.equal(isActivePointsTaskContextValid(baseContext, { actorId: "actor-a", restaurantId: "restaurant-a", roleContext: "staff::staff" }), true);
});

test("active task controls are responsive and translated in seven languages", () => {
  assert.match(styles, /\.staff-active-points-task[\s\S]*width: min\(620px, calc\(100vw - 24px\)\)/);
  assert.match(styles, /\.staff-active-points-task-resume,[\s\S]*min-height: 44px/);
  assert.match(styles, /bottom: calc\(76px \+ env\(safe-area-inset-bottom\)\)/);
  for (const language of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    for (const key of ["title", "recognized", "amount", "preview", "pin", "resume", "minimize", "cancel", "expired"]) {
      assert.notEqual(translateStructural(`staff.activePoints.${key}`, language), `staff.activePoints.${key}`, `${language} missing ${key}`);
    }
  }
});
