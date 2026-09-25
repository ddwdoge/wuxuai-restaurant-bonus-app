import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/modules/staff/secureRedemptionQueuePresentation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
} }).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const { stabilizeRedemptionQueue, nextRedemptionCard } = exports;

const row = (id, minute) => ({ redemption_id: id,
  requested_at: `2026-09-25T10:${String(minute).padStart(2, "0")}:00Z`,
  expires_at: `2026-09-25T11:${String(minute).padStart(2, "0")}:00Z` });

test("0/1/2/5/10 requests: earliest expiry first, no duplicates", () => {
  for (const count of [0, 1, 2, 5, 10]) {
    const incoming = Array.from({ length: count }, (_, index) => row(`request-${index}`, count - index));
    const merged = stabilizeRedemptionQueue([], [...incoming, ...incoming]);
    assert.equal(merged.length, count);
    assert.deepEqual(merged.map((item) => item.redemption_id), [...incoming].reverse().map((item) => item.redemption_id));
  }
});

test("24 new arrivals append without moving the active card or existing cards", () => {
  const initial = stabilizeRedemptionQueue([], [row("first", 1), row("second", 2)]);
  const previousIds = initial.map((item) => item.redemption_id);
  const arriving = Array.from({ length: 24 }, (_, index) => row(`new-${index}`, index));
  const next = stabilizeRedemptionQueue(previousIds, [...arriving, ...initial, ...arriving]);
  assert.deepEqual(next.slice(0, 2).map((item) => item.redemption_id), previousIds);
  assert.equal(next.length, 26);
  assert.equal(nextRedemptionCard("second", previousIds, next.map((item) => item.redemption_id)), "second");
});

test("24 identical polling responses preserve order and selected request", () => {
  let queue = stabilizeRedemptionQueue([], [row("a", 2), row("b", 1), row("c", 3)]);
  for (let index = 0; index < 24; index++) {
    const previousIds = queue.map((item) => item.redemption_id);
    queue = stabilizeRedemptionQueue(previousIds, [row("c", 3), row("b", 1), row("a", 2)]);
    assert.deepEqual(queue.map((item) => item.redemption_id), previousIds);
    assert.equal(nextRedemptionCard("b", previousIds, previousIds), "b");
  }
});

test("after finalization the next card in the former slot moves up", () => {
  const before = ["a", "b", "c"];
  assert.equal(nextRedemptionCard("b", before, ["a", "c"]), "c");
  assert.equal(nextRedemptionCard("c", before, ["a", "b"]), "b");
  assert.equal(nextRedemptionCard("a", before, []), null);
});

test("queue remains server-authorized and actions bind to the request ID", () => {
  const component = readFileSync(new URL("../src/modules/staff/SecureRedemptionQueue.tsx", import.meta.url), "utf8");
  assert.match(component, /next\.actor_role !== "STAFF" && next\.actor_role !== "OWNER"/);
  assert.match(component, /queueState\?\.slug === restaurantSlug/);
  assert.match(component, /item\.redemption_id === redemptionId/);
  assert.match(component, /actionInFlight\.current/);
  assert.doesNotMatch(component, /startSecureRedemption|verifySecureRedemptionPin|cancelSecureRedemption/);
});
