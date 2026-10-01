import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyStaffPointsFailure } from "../src/modules/staff/staffPointsFailure.mjs";

const service = await readFile(new URL("../src/modules/loyalty/loyaltyService.ts", import.meta.url), "utf8");

const cases = [
  [{ status: 0, message: "Failed to fetch" }, "transport"],
  [{ status: 401, code: "PGRST301" }, "session_expired"],
  [{ status: 403, message: "STAFF_ACTION_ACCESS_DENIED" }, "staff_unauthorized"],
  [{ message: "Die Tages-PIN ist nicht korrekt." }, "daily_pin"],
  [{ message: "Gast wurde nicht gefunden." }, "customer_membership"],
  [{ message: "Betrag überschreitet das Limit." }, "amount_invalid"],
  [{ code: "23505", message: "duplicate idempotency key" }, "duplicate"],
  [{ message: "POINTS_COLLECTION_FAILED" }, "booking_rejected"],
  [{ message: "notification inbox side path failed" }, "notification_sidepath"],
  [{ message: "unexpected" }, "unknown"],
];

for (const [failure, expected] of cases) {
  test(`klassifiziert ${expected} ohne technische Nutzerausgabe`, () => {
    const result = classifyStaffPointsFailure(failure);
    assert.equal(result.category, expected);
    assert.match(result.safeCode, /^STAFF_POINTS_[A-Z_]+$/);
  });
}

test("Service protokolliert keine rohen Supabase-Fehlerdetails", () => {
  const start = service.indexOf("export async function applyStaffLoyaltyAction");
  const end = service.indexOf("\n}", start) + 2;
  const action = service.slice(start, end);
  assert.doesNotMatch(action, /console\.(?:warn|error|log)/);
  assert.match(action, /StaffLoyaltyActionError/);
  assert.match(action, /safeMessage = staffDailyPinActionErrorMessage/);
  assert.doesNotMatch(action, /throw new StaffLoyaltyActionError\(\s*payload\.error_message/);
});
