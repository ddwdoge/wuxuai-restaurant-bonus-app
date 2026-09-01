import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260804002000_central_customer_account_offer_emails.sql", import.meta.url);
const authMigrationUrl = new URL("../supabase/migrations/20260804003000_central_customer_login_restaurant_context.sql", import.meta.url);
const appUrl = new URL("../src/app/App.tsx", import.meta.url);
const pageUrl = new URL("../src/modules/customer/CentralCustomerPage.tsx", import.meta.url);
const portalUrl = new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url);
const finderServiceUrl = new URL("../src/modules/customer/partnerRestaurantService.ts", import.meta.url);
const offersPageUrl = new URL("../src/modules/customer/CustomerOffersPage.tsx", import.meta.url);
const ownerPageUrl = new URL("../src/modules/admin/pages/RestaurantOffersPage.tsx", import.meta.url);
const navigationUrl = new URL("../src/modules/customer/components/CentralCustomerNavigation.tsx", import.meta.url);
const cssUrl = new URL("../src/modules/customer/central-customer.css", import.meta.url);

test("zentrale Kundenrouten benötigen keinen Restaurant-Slug", async () => {
  const app = await readFile(appUrl, "utf8");
  for (const route of ["/customer", "/customer/locations", "/customer/account", "/customer/restaurants"]) {
    assert.match(app, new RegExp(`path=\\"${route.replaceAll("/", "\\/")}\\"`));
  }
});

test("Meine Vorteile verwendet genau die vier freigegebenen Navigationsziele", async () => {
  const navigation = await readFile(navigationUrl, "utf8");
  for (const label of ["Start", "Meine Lokale", "Entdecken", "Konto"]) assert.match(navigation, new RegExp(`label: "${label}"`));
  assert.doesNotMatch(navigation, /label: "Aktuelles"/);
  assert.equal((navigation.match(/label:/g) ?? []).length, 4);
});

test("Punkte werden je Lokal gezeigt und niemals als Gesamtpunktestand addiert", async () => {
  const page = await readFile(pageUrl, "utf8");
  assert.match(page, /Deine Punkte/);
  assert.match(page, /points_balance/);
  assert.doesNotMatch(page, /Gesamtpunkte|Gesamtpunktestand|reduce\([^\n]*points_balance/);
});

test("Restaurant-Mitgliedschaften werden nur nach gültigem geheimem Restauranttoken verknüpft", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const bootstrap = migration.slice(migration.indexOf("create or replace function public.bootstrap_customer_account"), migration.indexOf("create or replace function public.get_customer_account"));
  assert.match(bootstrap, /token\.restaurant_id = restaurant_record\.id/);
  assert.match(bootstrap, /token\.token_hash = public\.hash_public_token\(input_customer_token\)/);
  assert.match(bootstrap, /customer\.membership_status = 'active'/);
  assert.doesNotMatch(bootstrap, /device_id|birthday_day|birthday_month|where[^;]*phone\s*=/i);
});

test("zentrale Kundenanmeldung ist an Supabase Auth und bestätigte E-Mail gebunden", async () => {
  const migration = await readFile(authMigrationUrl, "utf8");
  assert.match(migration, /auth_user_id uuid references auth\.users\(id\)/);
  assert.match(migration, /auth\.uid\(\) is null/);
  assert.match(migration, /email_confirmed_at is null/);
  assert.match(migration, /CUSTOMER_EMAIL_CONFIRMATION_REQUIRED/);
  assert.doesNotMatch(migration, /where[^;]*(phone|birthday|device_id)[^;]*auth_user_id/is);
});

test("ein Lokal kann pro zentralem Konto nur einem Kunden zugeordnet sein", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /unique \(account_id, restaurant_id\)/);
  assert.match(migration, /unique \(customer_id\)/);
  assert.match(migration, /CUSTOMER_ACCOUNT_RESTAURANT_CONFLICT/);
  assert.match(migration, /CUSTOMER_MEMBERSHIP_ALREADY_LINKED/);
});

test("Finder aggregiert keine Restauranttokens und Aktuelles bleibt restaurantbezogen", async () => {
  const [finder, offers] = await Promise.all([readFile(finderServiceUrl, "utf8"), readFile(offersPageUrl, "utf8")]);
  assert.match(finder, /loadCustomerAccount/);
  assert.doesNotMatch(finder, /readStoredCustomerTokens/);
  assert.doesNotMatch(offers, /readStoredCustomerTokens/);
  assert.match(offers, /loadPublicRestaurantOffers\(slug, 100\)/);
  assert.doesNotMatch(offers, /loadPublicRestaurantOffers\(null/);
});

test("erneutes Öffnen stellt nur für die eigene Auth-Membership einen restaurantbezogenen Zugang aus", async () => {
  const migration = await readFile(authMigrationUrl, "utf8");
  const openMembership = migration.slice(migration.indexOf("create or replace function public.open_customer_account_membership"), migration.indexOf("create or replace function public.join_customer_account_restaurant"));
  assert.match(openMembership, /ensure_authenticated_customer_account/);
  assert.match(openMembership, /membership\.account_id = account_id_value/);
  assert.match(openMembership, /membership\.restaurant_id = input_restaurant_id/);
  assert.match(openMembership, /insert into public\.customer_qr_tokens \(restaurant_id, customer_id, token_hash, active\)/);
  assert.doesNotMatch(openMembership, /update public\.customer_qr_tokens[\s\S]*active = false/);
});

test("CustomerPortal erzeugt keine globale Identität mehr aus Restauranttokens", async () => {
  const portal = await readFile(portalUrl, "utf8");
  assert.doesNotMatch(portal, /bootstrapCustomerAccount/);
  assert.match(portal, /readStoredCustomerToken/);
});

test("Angebots-E-Mails starten verbindlich mit Nie und benötigen Double-Opt-in", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /frequency text not null default 'NEVER' check \(frequency in \('NEVER', 'WEEKLY', 'MONTHLY'\)\)/);
  assert.match(migration, /status text not null default 'NOT_GRANTED'/);
  assert.match(migration, /'PENDING_CONFIRMATION'/);
  assert.match(migration, /set status = 'ACTIVE', consented_at = now\(\), email_confirmed_at = now\(\)/);
});

test("ohne freigegebenen Provider bleibt jeder Versand serverseitig deaktiviert", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /delivery_enabled boolean not null default false/);
  assert.match(migration, /provider_status text not null default 'NOT_CONFIGURED'/);
  const dueFunction = migration.slice(migration.indexOf("create or replace function public.list_due_customer_offer_email_consents"), migration.indexOf("create or replace function public.reserve_customer_offer_email_delivery"));
  assert.match(dueFunction, /if not coalesce/);
  assert.match(dueFunction, /return;/);
});

test("Woche und Monat werden in Europe/Vienna periodisiert und nur einmal reserviert", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /now\(\) at time zone 'Europe\/Vienna'/);
  assert.match(migration, /unique \(consent_id, frequency, period_key\)/);
  assert.match(migration, /on conflict \(consent_id, frequency, period_key\) do nothing/);
  assert.match(migration, /ALREADY_RESERVED/);
});

test("Abmeldung beendet nur E-Mails und löscht weder Punkte noch Membership", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const withdrawal = migration.slice(migration.indexOf("create or replace function public.withdraw_customer_offer_email"), migration.indexOf("create or replace function public.pause_all_customer_offer_emails"));
  assert.match(withdrawal, /set status = 'WITHDRAWN', frequency = 'NEVER'/);
  assert.doesNotMatch(withdrawal, /delete from public\.(customers|points_transactions|customer_account_memberships)/);
});

test("Marketingtokens besitzen Zweck, Ablauf, Single Use und Rate Limit", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /purpose text not null check \(purpose in \('CONFIRM', 'UNSUBSCRIBE'\)\)/);
  assert.match(migration, /expires_at timestamptz not null/);
  assert.match(migration, /used_at timestamptz/);
  assert.match(migration, /created_at > now\(\) - interval '15 minutes'/);
  assert.match(migration, />= 10/);
});

test("RLS bleibt aktiv und Browser erhält keine direkten Tabellenrechte", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  for (const table of ["customer_accounts", "customer_account_memberships", "customer_account_tokens", "customer_offer_email_consents", "customer_offer_email_tokens", "customer_offer_email_deliveries"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon, authenticated`));
  }
  assert.doesNotMatch(migration, /disable row level security/i);
});

test("E-Mail-Job und Rohadressen sind ausschließlich service-role zugänglich", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  for (const signature of [
    "list_due_customer_offer_email_consents\\(text, integer\\)",
    "reserve_customer_offer_email_delivery\\(uuid, text, text, text\\)",
    "complete_customer_offer_email_delivery\\(uuid, text, text\\)",
  ]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to service_role`));
  }
  assert.doesNotMatch(migration, /grant execute on function public\.list_due_customer_offer_email_consents[^;]+to (?:anon|authenticated)/);
});

test("Owner sieht nur aggregierten Versandstatus und keine Empfängerliste", async () => {
  const [migration, ownerPage] = await Promise.all([readFile(migrationUrl, "utf8"), readFile(ownerPageUrl, "utf8")]);
  const summary = migration.slice(migration.indexOf("create or replace function public.get_restaurant_offer_email_summary"), migration.indexOf("revoke all on function public.normalize_customer_offer_email"));
  assert.match(summary, /public\.is_restaurant_admin\(input_restaurant_id\)/);
  assert.doesNotMatch(summary, /'email'|consent\.email/);
  assert.match(ownerPage, /Angebots-E-Mails/);
  assert.match(ownerPage, /keine Empfängerlisten/);
});

test("zentrale UI ist mobil, safe-area-fähig und tastaturbedienbar", async () => {
  const [page, css] = await Promise.all([readFile(pageUrl, "utf8"), readFile(cssUrl, "utf8")]);
  assert.match(css, /grid-template-columns: repeat\([34], minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(page, /aria-label=/);
  assert.doesNotMatch(css, /overflow-x:\s*hidden/);
});
