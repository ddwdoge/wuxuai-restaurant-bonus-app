import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [finder, access, accountService, migration, finderCss, customerCss] = await Promise.all([
  read("../src/modules/customer/PartnerRestaurantFinderPage.tsx"),
  read("../src/modules/customer/CustomerRestaurantAccess.tsx"),
  read("../src/modules/customer/customerAccountService.ts"),
  read("../supabase/migrations/20260804003000_central_customer_login_restaurant_context.sql"),
  read("../src/modules/customer/partner-restaurant-finder.css"),
  read("../src/modules/customer/customer-premium.css"),
]);

const joinFunction = migration.slice(
  migration.indexOf("create or replace function public.join_customer_account_restaurant"),
  migration.indexOf("create or replace function public.pause_all_customer_offer_emails"),
);

test("Restaurantdetails unterscheiden Mitglied und Nichtmitglied mit genau einer primären Aktion", () => {
  assert.match(finder, /const isMember = membership\?\.registered === true/);
  assert.match(finder, /Noch kein Bonus-Mitglied/);
  assert.match(finder, /isMember \?[\s\S]*Restaurant öffnen[\s\S]*Bonusprogramm beitreten/);
  assert.match(finder, /to=\{portalUrl\}/);
  assert.match(finder, /Route starten/);
});

test("Willkommensanreiz bleibt sichtbar und Beitritt erzeugt keinen Besuchstext", () => {
  assert.match(finder, /Willkommensgeschenk verfügbar/);
  assert.match(finder, /Ein Besuch wird erst nach einer echten Punktebuchung gespeichert/);
  assert.match(finder, /visits_count \?\? 0\) > 0/);
});

test("Discovery verwendet den bestehenden ausdrücklichen Legal-Consent-Flow", () => {
  assert.match(access, /loadPublicLegalCenter\(restaurantSlug\)/);
  assert.match(access, /Teilnahmebedingungen/);
  assert.match(access, /Datenschutzerklärung/);
  assert.equal((access.match(/aria-required="true"/g) ?? []).length, 2);
  assert.match(access, /disabled=\{!legalReady \|\| !termsAccepted \|\| !privacyAcknowledged \|\| joining\}/);
  assert.match(accountService, /rpc\("join_customer_account_restaurant"/);
  assert.doesNotMatch(finder, /\.from\("(?:customers|customer_account_memberships)"\)/);
});

test("Beitritt wechselt anschließend über denselben kanonischen Membership-Opener", () => {
  const joinHandler = access.slice(access.indexOf("async function join()"), access.indexOf("if (authLoading)"));
  assert.match(joinHandler, /await joinCustomerRestaurant\(/);
  assert.match(joinHandler, /await openCustomerMembership\(context\.restaurant_id\)/);
  assert.ok(joinHandler.indexOf("joinCustomerRestaurant") < joinHandler.indexOf("openCustomerMembership"));
  assert.match(access, /Du bist jetzt im Bonusprogramm von \$\{context\.restaurant_name\}/);
  assert.match(access, /<CustomerPortal entryMessage=\{joinSuccessMessage\}/);
  assert.match(access, /restaurantSlug=\{portalRestaurantSlug\}/);
});

test("Server-Join ist authgebunden, legal geprüft, idempotent und tenantgebunden", () => {
  assert.match(joinFunction, /ensure_authenticated_customer_account\(\)/);
  assert.match(joinFunction, /restaurant_legal_bundle_is_current/);
  assert.match(joinFunction, /pg_advisory_xact_lock/);
  assert.match(joinFunction, /where account_id = account_id_value and restaurant_id = restaurant_record\.id/);
  assert.match(joinFunction, /membership_record\.id is not null[\s\S]*joined', false/);
  assert.match(joinFunction, /register_restaurant_customer_legal/);
  assert.match(joinFunction, /CUSTOMER_MEMBERSHIP_ALREADY_LINKED/);
  assert.match(migration, /grant execute on function public\.join_customer_account_restaurant[^;]+to authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.join_customer_account_restaurant[^;]+to anon/);
});

test("Discovery-Beitritt erzeugt weder Punkte, Besuch noch Referral-Zuordnung", () => {
  assert.doesNotMatch(joinFunction, /points_transactions|award_points|visits_count|last_visit_at/i);
  assert.doesNotMatch(joinFunction, /referral|invitation|boost/i);
  assert.doesNotMatch(accountService.slice(
    accountService.indexOf("export async function joinCustomerRestaurant"),
    accountService.indexOf("export async function joinCustomerReferral"),
  ), /join_authenticated_customer_referral|referralToken/);
});

test("Join-Aktion bleibt mobil erreichbar und Erfolg ist barrierefrei sichtbar", () => {
  assert.match(finderCss, /partner-detail-actions \.premium-button[^}]*min-height: 48px/);
  assert.match(finderCss, /padding-bottom: calc\(18px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(customerCss, /customer-join-success/);
  assert.match(access, /entryMessage=\{joinSuccessMessage\}/);
});
