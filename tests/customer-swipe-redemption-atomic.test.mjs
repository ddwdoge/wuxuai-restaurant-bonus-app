import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  clampSwipeProgress,
  swipeCompletesRedemption,
  swipeCompletionThreshold,
} from "../src/modules/customer/swipeRedemption.mjs";

const migration = readFileSync(new URL(
  "../supabase/migrations/20260829002000_customer_swipe_redemption_atomic_confirmation.sql",
  import.meta.url,
), "utf8");
const customerPortal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const rewardService = readFileSync(new URL("../src/modules/rewards/rewardService.ts", import.meta.url), "utf8");
const swipeComponent = readFileSync(new URL(
  "../src/modules/customer/components/SwipeToRedeem.tsx",
  import.meta.url,
), "utf8");

function functionBody(name) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} fehlt`);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} ist nicht abgeschlossen`);
  return migration.slice(start, end);
}

test("preparation states do not consume points or gifts", () => {
  const pointsStart = functionBody("start_customer_points_presentation");
  const giftStart = functionBody("start_customer_gift_presentation");
  assert.match(pointsStart, /'REDEMPTION_STARTED'/);
  assert.doesNotMatch(pointsStart, /set points_balance =/);
  assert.doesNotMatch(pointsStart, /insert into public\.reward_redemption_events/);
  assert.doesNotMatch(pointsStart, /insert into public\.redemption_activity_journal/);
  assert.match(giftStart, /set status = 'redemption_started'/);
  assert.doesNotMatch(giftStart, /set status = 'redeemed'/);
  assert.doesNotMatch(giftStart, /insert into public\.redemption_activity_journal/);
});

test("one SECURITY DEFINER confirmation contract owns both benefit types", () => {
  const confirm = functionBody("confirm_customer_redemption_swipe");
  assert.match(confirm, /security definer/);
  assert.match(confirm, /set search_path = public, extensions, pg_temp/);
  assert.match(confirm, /input_presentation_type not in \('points', 'gift'\)/);
  assert.match(confirm, /public\.hash_public_token\(input_customer_token\)/);
  assert.match(confirm, /customer\.restaurant_id = token_record\.restaurant_id/);
  assert.match(confirm, /customer\.branch_id is not distinct from token_record\.branch_id/);
  assert.match(confirm, /for update;/g);
  assert.match(confirm, /pg_advisory_xact_lock\(hashtextextended\(/);
});

test("point confirmation is atomic and writes value exactly at final swipe", () => {
  const confirm = functionBody("confirm_customer_redemption_swipe");
  assert.match(confirm, /set points_balance = customer\.points_balance - points_record\.points_spent/);
  assert.match(confirm, /where id = points_record\.id[\s\S]*and status = 'REDEMPTION_STARTED'[\s\S]*and expires_at > confirmed_at_value/);
  assert.match(confirm, /insert into public\.reward_redemption_events/);
  assert.match(confirm, /insert into public\.points_transactions/);
  assert.match(confirm, /insert into public\.redemption_activity_journal/);
  assert.match(confirm, /'confirmation_method', 'CUSTOMER_SWIPE'/);
});

test("gift confirmation atomically consumes welcome and birthday assignments", () => {
  const confirm = functionBody("confirm_customer_redemption_swipe");
  assert.match(confirm, /gift\.gift_type in \('welcome', 'birthday'\)/);
  assert.match(confirm, /set status = 'redeemed', redeemed_at = confirmed_at_value/);
  assert.match(confirm, /case when gift_record\.gift_type = 'birthday' then 'BIRTHDAY_GIFT' else 'WELCOME_GIFT' end/);
  assert.match(confirm, /where id = gift_presentation_record\.id[\s\S]*and status = 'REDEMPTION_STARTED'[\s\S]*and expires_at > confirmed_at_value/);
});

test("same retry succeeds but a second device receives ALREADY_REDEEMED", () => {
  const confirm = functionBody("confirm_customer_redemption_swipe");
  assert.match(confirm, /confirmation_idempotency_key = input_idempotency_key/g);
  assert.match(confirm, /'already_confirmed', points_record\.confirmation_idempotency_key = input_idempotency_key/);
  assert.match(confirm, /'already_confirmed', gift_presentation_record\.confirmation_idempotency_key = input_idempotency_key/);
  assert.match(confirm, /'ALREADY_REDEEMED'/g);
  assert.match(confirm, /'Bereits eingelöst'/g);
});

test("simultaneous devices serialize and only one conditional transition wins", () => {
  const confirm = functionBody("confirm_customer_redemption_swipe");
  const lock = confirm.indexOf("pg_advisory_xact_lock");
  const pointsRowLock = confirm.indexOf("from public.points_redemption_presentations", lock);
  const pointsCas = confirm.indexOf("update public.points_redemption_presentations", pointsRowLock);
  const giftRowLock = confirm.indexOf("from public.gift_redemption_presentations", pointsCas);
  const giftCas = confirm.indexOf("update public.gift_redemption_presentations", giftRowLock);
  assert.ok(lock >= 0 && pointsRowLock > lock && pointsCas > pointsRowLock);
  assert.ok(giftRowLock > pointsCas && giftCas > giftRowLock);
  assert.match(confirm, /REDEMPTION_CONFIRMATION_RACE_LOST/g);
});

test("expired preparation never redeems and restores an unexpired gift", () => {
  const pointsExpiry = functionBody("complete_points_redemption_presentations");
  const giftExpiry = functionBody("complete_gift_redemption_presentations");
  assert.match(pointsExpiry, /set status = 'EXPIRED'/);
  assert.doesNotMatch(pointsExpiry, /points_balance/);
  assert.match(giftExpiry, /set status = 'EXPIRED'/);
  assert.match(giftExpiry, /else 'active'/);
  assert.doesNotMatch(giftExpiry, /set status = 'redeemed'/);
});

test("browser roles have only RPC execute and no presentation table rights", () => {
  assert.match(migration, /revoke all on table public\.points_redemption_presentations from public, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.gift_redemption_presentations from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.confirm_customer_redemption_swipe\(text, text, uuid, uuid\)[\s\S]*to anon, authenticated/);
});

test("swipe requires deliberate completion and cannot be a tap", () => {
  assert.equal(swipeCompletionThreshold, 0.88);
  assert.equal(clampSwipeProgress(-2), 0);
  assert.equal(clampSwipeProgress(2), 1);
  assert.equal(swipeCompletesRedemption(0), false);
  assert.equal(swipeCompletesRedemption(0.87), false);
  assert.equal(swipeCompletesRedemption(0.88), true);
  assert.match(swipeComponent, /onPointerDown/);
  assert.match(swipeComponent, /onPointerMove/);
  assert.match(swipeComponent, /lockedRef\.current = true/);
  assert.doesNotMatch(swipeComponent, /onClick=/);
});

test("UI confirms through server and recovers authoritative state after network uncertainty", () => {
  assert.match(rewardService, /confirm_customer_redemption_swipe/);
  assert.match(rewardService, /input_presentation_type: input\.presentationType/);
  assert.match(customerPortal, /<SwipeToRedeem/);
  assert.match(customerPortal, /Bitte erst vor dem Mitarbeiter bestätigen\./);
  assert.match(customerPortal, /Verbindung wird geprüft…/);
  assert.match(customerPortal, /loadCustomerGiftPresentation[\s\S]*loadCustomerPointsPresentation/);
  assert.match(customerPortal, /serverState\.status === "REDEEMED"/);
  assert.match(customerPortal, /Einlösezeit abgelaufen/);
  assert.doesNotMatch(customerPortal, /Die Punkte wurden endgültig eingelöst\. Zeige diesen Bildschirm/);
});

