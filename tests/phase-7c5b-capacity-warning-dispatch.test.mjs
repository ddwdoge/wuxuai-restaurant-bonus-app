import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { URL } from "node:url";
import {
  renderOwnerCapacityWarningMail,
  supportedTransactionalMailLanguages,
} from "../supabase/functions/_shared/transactionalMailTemplates.mjs";

const migration = readFileSync(new URL("../supabase/migrations/20260921005000_capacity_warning_dispatch.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../supabase/functions/transactional-mail-dispatcher/index.ts", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/modules/capacity/ownerCapacityService.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/modules/admin/pages/OwnerCapacityPage.tsx", import.meta.url), "utf8");

test("warning data model is private, tenant-scoped and append-only where required", () => {
  for (const table of ["capacity_usage_daily_snapshots", "capacity_warning_episodes", "capacity_warning_states", "capacity_warning_deliveries", "capacity_warning_audit"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table}`));
  }
  assert.match(migration, /CAPACITY_WARNING_AUDIT_APPEND_ONLY/);
  assert.match(migration, /unique \(warning_episode_id, recipient_user_id, channel\)/);
  assert.doesNotMatch(migration, /recipient_email|email_address/);
});

test("evaluator uses only the capacity resolver and exact Founder thresholds", () => {
  assert.match(migration, /resolve_restaurant_capacity_internal\(input_restaurant_id, input_run_at\)/);
  assert.match(migration, /input_usage \* 100 >= input_limit \* 80/);
  assert.match(migration, /input_usage \* 100 >= input_limit \* 90/);
  assert.match(migration, /input_usage = input_limit then '100'/);
  assert.match(migration, /input_usage > input_limit then 'OVER_LIMIT'/);
  assert.doesNotMatch(migration, /base_offer_limit\s*:=|base_customer_limit\s*:=/);
});

test("forecast requires 28 complete days and implements the approved formula", () => {
  assert.match(migration, /history_count = 28/);
  assert.match(migration, /forecast_basis_date_value := local_date_value - 28/);
  assert.match(migration, /daily_net_growth = \(usage_value - history_usage\) \/ 28/);
  assert.match(migration, /\(usage_value - history_usage\)::numeric \* 7::numeric \/ 28::numeric/);
  assert.match(migration, /ceil\(/);
  assert.match(migration, /projected_value := null/);
});

test("event and daily triggers are idempotent and warning failures cannot roll back business actions", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /wuxuai-capacity-warning-hourly-local-0800/);
  assert.match(migration, /'0 \* \* \* \*'/);
  assert.match(migration, /extract\(hour from input_run_at at time zone/);
  assert.match(migration, /Warning infrastructure must never roll back an otherwise valid action/);
  assert.match(migration, /exception when others[\s\S]*return new/);
});

test("deduplication, seven-day reminders, quiet hours and rearm are explicit", () => {
  assert.match(migration, /capacity_warning_one_open_episode_idx/);
  assert.match(migration, /interval '7 days'/);
  assert.match(migration, /SEVEN_COMPLETE_DAYS_BELOW/);
  assert.match(migration, /CAPACITY_INCREASE/);
  assert.match(migration, /time '08:00'/);
  assert.match(migration, /time '22:00'/);
  assert.match(migration, /triggered_by = case when signal_actual then 'ACTUAL'/);
});

test("owner app acknowledgement is isolated and changes no capacity authority", () => {
  assert.match(service, /get_owner_capacity_warnings/);
  assert.match(service, /acknowledge_owner_capacity_warning/);
  assert.match(page, /CapacityWarningNotice/);
  assert.match(page, /warning\.acknowledged/);
  assert.match(migration, /member\.role = 'owner'/);
  const acknowledgeBody = migration.slice(migration.indexOf("create or replace function public.acknowledge_owner_capacity_warning"), migration.indexOf("create or replace function public.reserve_capacity_warning_emails"));
  assert.doesNotMatch(acknowledgeBody, /restaurant_capacity_addon_entitlements|branch_subscriptions|commercial_pro_access_grants/);
});

test("capacity emails reuse the transactional worker without a real local send", () => {
  assert.match(worker, /reserve_capacity_warning_emails/);
  assert.match(worker, /complete_capacity_warning_email/);
  assert.match(worker, /renderOwnerCapacityWarningMail/);
  assert.match(migration, /owner_user\.email_confirmed_at is not null/);
  assert.match(migration, /member\.role = 'owner'/);
  assert.match(worker, /if \(capacityReserveError\)[\s\S]*capacityDeliveries =/);
  assert.doesNotMatch(worker, /capacity_queue_reservation_failed/);
});

test("capacity warning email renders safely in all seven languages", () => {
  assert.deepEqual(supportedTransactionalMailLanguages, ["de", "en", "fr", "it", "es", "zh", "ko"]);
  for (const language of supportedTransactionalMailLanguages) {
    const mail = renderOwnerCapacityWarningMail({
      restaurantName: "Test & Lokal",
      payload: { capacity_type: "offer", warning_level: "90", usage: 9, effective_limit: 10, remaining: 1, projected_usage_7d: 10, language },
      appBaseUrl: "https://staging-app.bonus.wuxuaisbi.com",
      language,
    });
    assert.equal(mail.language, language);
    assert.match(mail.actionUrl, /\/admin\/settings\/tarif-kapazitaet$/);
    assert.match(mail.text, /9/);
    assert.match(mail.text, /10/);
    assert.match(mail.html, /Test &amp; Lokal/);
    assert.doesNotMatch(mail.html, /<script/i);
  }
});

test("dispatcher contains no purchase, plan, grant or business-data mutation", () => {
  assert.doesNotMatch(migration, /insert into public\.restaurant_capacity_addon_entitlements/);
  assert.doesNotMatch(migration, /update public\.branch_subscriptions/);
  assert.doesNotMatch(migration, /insert into public\.commercial_pro_access_grants/);
  assert.doesNotMatch(migration, /delete from public\.(restaurant_offers|customers|points_transactions|redemption_activity_journal)/);
});
