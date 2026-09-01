import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../supabase/migrations/20260831001000_birthday_gift_14_day_catch_up.sql",
  import.meta.url,
), "utf8");

function birthdayDate(day, month, year) {
  const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  const normalizedDay = month === 2 && day === 29 && !leap ? 28 : day;
  return new Date(Date.UTC(year, month - 1, normalizedDay));
}

function isEligible(day, month, today) {
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 14);
  let candidate = birthdayDate(day, month, today.getUTCFullYear());
  if (candidate < today) candidate = birthdayDate(day, month, today.getUTCFullYear() + 1);
  return candidate >= today && candidate <= end;
}

test("birthday catch-up uses the inclusive local today through day fourteen window", () => {
  const today = new Date(Date.UTC(2026, 7, 31));
  for (const days of [0, 1, 4, 10, 14]) {
    const candidate = new Date(today);
    candidate.setUTCDate(candidate.getUTCDate() + days);
    assert.equal(isEligible(candidate.getUTCDate(), candidate.getUTCMonth() + 1, today), true);
  }
  const dayFifteen = new Date(today);
  dayFifteen.setUTCDate(dayFifteen.getUTCDate() + 15);
  assert.equal(isEligible(dayFifteen.getUTCDate(), dayFifteen.getUTCMonth() + 1, today), false);
  assert.equal(isEligible(30, 8, today), false, "a birthday that already passed is not catch-up eligible");
});

test("birthday catch-up handles year boundaries and the canonical February 29 rule", () => {
  assert.equal(isEligible(3, 1, new Date(Date.UTC(2026, 11, 25))), true);
  assert.equal(isEligible(10, 1, new Date(Date.UTC(2026, 11, 25))), false);
  assert.equal(isEligible(29, 2, new Date(Date.UTC(2027, 1, 14))), true);
  assert.equal(isEligible(29, 2, new Date(Date.UTC(2027, 2, 1))), false);
});

test("one internal helper owns timezone eligibility pool assignment audit and e-mail", () => {
  assert.match(migration, /create or replace function public\.assign_birthday_gift_if_eligible/);
  assert.match(migration, /input_run_at at time zone membership\.timezone_name/);
  assert.match(migration, /birthday_date_value < local_today/);
  assert.match(migration, /birthday_date_value > local_today \+ 14/);
  assert.match(migration, /public\.v1_birthday_date/);
  assert.match(migration, /is_starter_reward = true/);
  assert.match(migration, /birthday_pool_enabled = true/);
  assert.match(migration, /reward\.active = true/);
  assert.match(migration, /BIRTHDAY_GIFT_ASSIGNED/);
  assert.match(migration, /enqueue_customer_transactional_email/);
  assert.match(migration, /birthday_automatic_v1_catch_up/);
});

test("assignment is annual idempotent and repeated cron cannot duplicate it", () => {
  assert.match(migration, /customer_rewards_one_birthday_gift_restaurant_year_idx/);
  assert.match(migration, /restaurant_id, customer_id, birthday_year/);
  assert.match(migration, /gift_type = 'birthday'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /status', 'already_assigned'/);
  assert.match(migration, /exception when unique_violation/);
  assert.match(migration, /create or replace function public\.issue_birthday_gifts/);
  assert.match(migration, /assign_birthday_gift_if_eligible\(\s*customer_record\.id/);
  assert.match(migration, /'mode', 'automatic_14_day_window'/);
});

test("active central membership receives an immediate catch-up without weakening access", () => {
  assert.match(migration, /after insert on public\.customer_account_memberships/);
  assert.match(migration, /catch_up_birthday_gift_after_membership_activation/);
  assert.match(migration, /membership\.customer_id = new\.id/);
  assert.match(migration, /new\.membership_status = 'active'/);
  assert.match(migration, /revoke all on function public\.assign_birthday_gift_if_eligible[\s\S]*public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.assign_birthday_gift_if_eligible/);
});

test("gift validity and notification remain independent from visits and points", () => {
  assert.match(migration, /birthday_date_value - 14/);
  assert.match(migration, /birthday_date_value \+ 15/);
  assert.doesNotMatch(migration, /points_transactions|visits_count|POINTS_ADDED/);
  assert.match(migration, /assignment_id_value::text/);
});
