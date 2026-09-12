import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260910001000_pro_entitlement_lifecycle.sql", import.meta.url),
  "utf8",
);

function resolveLifecycle({
  plan = "PRO",
  status,
  payment,
  trialEndsAt = null,
  periodEndsAt = null,
  pastDueStartedAt = null,
  now = "2026-09-10T12:00:00.000Z",
}) {
  const at = new Date(now).getTime();
  const normalizedStatus = status === "canceled" ? "cancelled" : status;
  if (plan !== "PRO") return { eligible: false, reason: plan === "PREMIUM" ? "PREMIUM_NOT_RELEASED" : "BASIC_PLAN" };
  if (normalizedStatus === "active") {
    const valid = ["paid", "manual"].includes(payment) && new Date(periodEndsAt).getTime() > at;
    return { eligible: valid, reason: valid ? "PAID_PLAN_ACTIVE" : "ACTIVE_PAYMENT_OR_PERIOD_INVALID" };
  }
  if (normalizedStatus === "trialing") {
    const valid = payment === "not_required" && new Date(trialEndsAt).getTime() > at;
    return { eligible: valid, reason: valid ? "TRIAL_ACTIVE" : "TRIAL_EXPIRED_OR_CONFLICTING" };
  }
  if (normalizedStatus === "past_due") {
    if (!pastDueStartedAt) return { eligible: false, reason: "PAST_DUE_START_UNKNOWN" };
    const graceEnd = new Date(pastDueStartedAt).getTime() + 7 * 86_400_000;
    const valid = ["pending", "failed"].includes(payment) && at <= graceEnd;
    return { eligible: valid, reason: valid ? "PAST_DUE_WITHIN_GRACE" : "PAST_DUE_GRACE_EXPIRED" };
  }
  if (normalizedStatus === "cancelled") {
    const valid = ["paid", "manual"].includes(payment) && new Date(periodEndsAt).getTime() > at;
    return { eligible: valid, reason: valid ? "CANCELLED_PERIOD_ACTIVE" : "CANCELLED_PERIOD_ENDED_OR_UNPAID" };
  }
  return { eligible: false, reason: "SUBSCRIPTION_STATUS_UNKNOWN_OR_INACTIVE" };
}

test("Basic without a subscription remains the fail-closed default", () => {
  assert.match(migration, /resolved_plan_key text := 'BASIC'/);
  assert.match(migration, /reason_code_value text := 'SUBSCRIPTION_MISSING'/);
  assert.equal(resolveLifecycle({ plan: "BASIC", status: null, payment: null }).eligible, false);
});

test("paid active PRO requires a valid payment and future period end", () => {
  assert.deepEqual(resolveLifecycle({ status: "active", payment: "paid", periodEndsAt: "2026-10-10T12:00:00Z" }), {
    eligible: true,
    reason: "PAID_PLAN_ACTIVE",
  });
  assert.equal(resolveLifecycle({ status: "active", payment: "failed", periodEndsAt: "2026-10-10T12:00:00Z" }).eligible, false);
  assert.match(migration, /payment_value in \('paid', 'manual'\) and input_period_ends_at > input_at/);
});

test("trialing PRO is effective only before the trial end", () => {
  assert.equal(resolveLifecycle({ status: "trialing", payment: "not_required", trialEndsAt: "2026-09-11T12:00:00Z" }).eligible, true);
  assert.equal(resolveLifecycle({ status: "trialing", payment: "not_required", trialEndsAt: "2026-09-09T12:00:00Z" }).eligible, false);
  assert.match(migration, /'TRIAL_EXPIRED_OR_CONFLICTING'/);
});

test("past-due PRO uses an exact seven-day grace window", () => {
  assert.equal(resolveLifecycle({ status: "past_due", payment: "failed", pastDueStartedAt: "2026-09-04T12:00:00Z" }).eligible, true);
  assert.equal(resolveLifecycle({ status: "past_due", payment: "failed", pastDueStartedAt: "2026-09-02T11:59:59Z" }).eligible, false);
  assert.match(migration, /input_past_due_started_at \+ interval '7 days'/);
  assert.match(migration, /'PAST_DUE_GRACE_EXPIRED'/);
});

test("canceled and cancelled PRO remain effective only through paid period end", () => {
  assert.equal(resolveLifecycle({ status: "canceled", payment: "paid", periodEndsAt: "2026-09-11T12:00:00Z" }).eligible, true);
  assert.equal(resolveLifecycle({ status: "cancelled", payment: "paid", periodEndsAt: "2026-09-09T12:00:00Z" }).eligible, false);
  assert.match(migration, /if status_value = 'canceled' then/);
  assert.match(migration, /'CANCELLED_PERIOD_ACTIVE'/);
});

test("unknown and conflicting states fail closed", () => {
  assert.equal(resolveLifecycle({ status: "mystery", payment: "paid", periodEndsAt: "2026-10-10T12:00:00Z" }).eligible, false);
  assert.equal(resolveLifecycle({ status: "active", payment: "not_required", periodEndsAt: "2026-10-10T12:00:00Z" }).eligible, false);
  assert.match(migration, /'SUBSCRIPTION_STATUS_UNKNOWN_OR_INACTIVE'/);
});

test("resolver priority is safety, valid admin override, lifecycle, then Basic", () => {
  const safety = migration.indexOf("if safety_plan then");
  const override = migration.indexOf("elsif override_plan_valid then");
  const lifecycle = migration.indexOf("elsif coalesce((lifecycle_value->>'eligible')::boolean, false) then");
  assert.ok(safety > 0 && safety < override && override < lifecycle);
  assert.match(migration, /source_value := 'SAFETY_BLOCK'/);
  assert.match(migration, /source_value := 'PLATFORM_ADMIN_OVERRIDE'/);
});

test("admin plan overrides require a bounded validity window", () => {
  assert.match(migration, /plan_override_key text/);
  assert.match(migration, /effective_from timestamptz/);
  assert.match(migration, /expires_at timestamptz/);
  assert.match(migration, /override_status_value := 'EXPIRED'/);
  assert.match(migration, /override_status_value := 'VALID'/);
  assert.match(migration, /input_expires_at is null or input_expires_at <= statement_timestamp\(\)/);
});

test("one server-side plan override changes the complete catalog plan", () => {
  assert.match(migration, /set_platform_restaurant_plan_override/);
  assert.match(migration, /plan_override_key = excluded\.plan_override_key/);
  assert.match(migration, /select \* into effective_plan_record[\s\S]*where plan_key = resolved_plan_key/);
  assert.match(migration, /'offer_notifications', coalesce\(effective_plan_record\.offer_notifications, false\)/);
  assert.match(migration, /'reward_notifications', coalesce\(effective_plan_record\.reward_notifications, false\)/);
});

test("manual override and paid lifecycle sources remain distinguishable", () => {
  for (const source of ["PLATFORM_ADMIN_OVERRIDE", "PAID_PLAN", "TRIAL", "PAST_DUE_GRACE", "CANCELLED_PAID_PERIOD", "BASIC_FALLBACK"]) {
    assert.match(migration, new RegExp(`'${source}'`));
  }
  assert.match(migration, /'entitlement_source', source_value/);
});

test("effective response is versioned and restaurant-location scoped", () => {
  assert.match(migration, /'contract_version', 'restaurant_entitlements_v2'/);
  assert.match(migration, /'type', 'RESTAURANT_LOCATION'/);
  for (const field of ["effective_plan", "effective_from", "effective_until", "subscription_status", "payment_status", "trial_ends_at", "period_ends_at", "grace_status", "override_status", "reason_code"]) {
    assert.match(migration, new RegExp(`'${field}'`));
  }
});

test("missing primary branch fails closed and never selects an arbitrary branch", () => {
  assert.match(migration, /restaurant_record\.primary_branch_id is null/);
  assert.match(migration, /'PRIMARY_BRANCH_MISSING'/);
  assert.match(migration, /where branch_id = restaurant_record\.primary_branch_id/);
  const resolver = migration.slice(migration.indexOf("create or replace function public.resolve_restaurant_entitlements_internal"), migration.indexOf("create or replace function public.set_platform_restaurant_plan_override"));
  assert.doesNotMatch(resolver, /order by branch\.created_at|coalesce\(restaurant_record\.primary_branch_id, branch\.id\)/);
});

test("safety blocks outrank overrides and can be global or feature-specific", () => {
  assert.match(migration, /scope_type in \('GLOBAL', 'RESTAURANT'\)/);
  assert.match(migration, /'ALL', 'PLAN', 'OFFER_LIMIT', 'OFFER_NOTIFICATIONS', 'REWARD_NOTIFICATIONS'/);
  assert.match(migration, /if safety_offer_notifications then[\s\S]*effective_offer_notifications := false/);
  assert.match(migration, /if safety_reward_notifications then[\s\S]*effective_reward_notifications := false/);
});

test("Platform Admin override remains confirmed, reasoned, idempotent and audited", () => {
  assert.match(migration, /role_value not in \('platform_owner', 'platform_admin', 'billing_admin'\)/);
  assert.match(migration, /length\(trim\(coalesce\(input_reason, ''\)\)\) < 10/);
  assert.match(migration, /input_confirmation <> 'CONFIRMED'/);
  assert.match(migration, /action_type = 'PLAN_OVERRIDE_CHANGED'/);
  assert.match(migration, /'idempotent', true/);
  assert.match(migration, /insert into public\.platform_admin_operations/);
  assert.match(migration, /'SENSITIVE'/);
});

test("PREMIUM is blocked by both storage constraint and subscription trigger", () => {
  assert.equal(resolveLifecycle({ plan: "PREMIUM", status: "active", payment: "paid", periodEndsAt: "2026-10-10T12:00:00Z" }).eligible, false);
  assert.match(migration, /plan_override_key is null or plan_override_key in \('BASIC', 'PRO'\)/);
  assert.match(migration, /branch_subscriptions_block_unreleased_premium/);
  assert.match(migration, /message = 'PREMIUM_NOT_RELEASED'/);
});

test("tenant and browser authority remain server controlled", () => {
  assert.match(migration, /revoke all on table public\.restaurant_entitlement_safety_blocks[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.resolve_restaurant_entitlements_internal\(uuid\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.set_platform_restaurant_plan_override[\s\S]*from public, anon/);
  assert.doesNotMatch(migration, /service_role|disable row level security/i);
});

test("Phase 1 does not implement deferred Pro features", () => {
  assert.doesNotMatch(migration, /customer_limit|3000|shared_points|stripe_checkout|checkout_session|gift_card_balance|pos_integration\s*=\s*true/i);
});
