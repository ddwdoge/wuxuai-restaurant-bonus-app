import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("QR-Route prüft zuerst die zentrale Kundensitzung und behält den Restaurantpfad", async () => {
  const [app, access, returnPath] = await Promise.all([read("../src/app/App.tsx"), read("../src/modules/customer/CustomerRestaurantAccess.tsx"), read("../src/modules/customer/customerReturnPath.mjs")]);
  assert.match(app, /CustomerRestaurantAccess/);
  assert.match(access, /useAuth\(\)/);
  assert.match(access, /returnTo = `\$\{isBonusCollection \? "\/w" : "\/customer"\}/);
  assert.match(access, /Mit bestehendem Kundenkonto anmelden/);
  assert.match(access, /Neues Kundenkonto erstellen/);
  assert.match(returnPath, /isCollectPath = \/\^\\\/w\\\//);
  assert.match(returnPath, /isCustomerPath \|\| isCollectPath \|\| isReferralPath/);
  assert.match(returnPath, /value\.startsWith\("\/\/"\)/);
});

test("Registrierung nutzt Supabase Auth mit E-Mail Passwort und Bestätigungslink", async () => {
  const [page, service] = await Promise.all([
    read("../src/modules/customer/CustomerAuthPage.tsx"),
    read("../src/modules/customer/customerAuthService.ts"),
  ]);
  assert.match(service, /auth\.signUp/);
  assert.match(service, /emailRedirectTo/);
  assert.match(service, /customer_first_name/);
  assert.match(service, /customer_phone/);
  assert.match(service, /customer_return_to: input\.returnTo/);
  assert.match(service, /new URL\("\/customer\/auth\/callback", input\.origin\)/);
  assert.doesNotMatch(service, /callbackUrl\.searchParams\.set\("returnTo"/);
  assert.match(page, /minLength=\{8\}/);
  assert.doesNotMatch(`${page}\n${service}`, /localStorage.*password|setItem\([^\n]*password/);
});

test("Bestätigungs-Callback stellt die Auth-Session her und kehrt zum QR-Kontext zurück", async () => {
  const [callback, service] = await Promise.all([
    read("../src/modules/customer/CustomerAuthCallbackPage.tsx"),
    read("../src/modules/auth/emailConfirmationService.ts"),
  ]);
  assert.match(service, /verifyOtp/);
  assert.match(service, /exchangeCodeForSession/);
  assert.match(callback, /ensure_authenticated_customer_account/);
  assert.match(callback, /safeCustomerReturnPath/);
  assert.match(callback, /void confirmEmail\(\)/);
  assert.match(callback, /E-Mail-Adresse erfolgreich bestätigt/);
  assert.match(callback, /customer_return_to/);
  assert.match(callback, /Neue Bestätigungs-E-Mail senden/);
  assert.doesNotMatch(callback, /useEffect\([\s\S]{0,260}establishEmailConfirmationSession/);
});

test("zentrale Identity nutzt eine bestehende Accounttabelle und keine zweite globale Kundentabelle", async () => {
  const migration = await read("../supabase/migrations/20260804003000_central_customer_login_restaurant_context.sql");
  assert.match(migration, /alter table public\.customer_accounts/);
  assert.doesNotMatch(migration, /create table[^;]*(global_customer|customer_identities)/i);
  assert.match(migration, /auth_user_id uuid references auth\.users\(id\)/);
});

test("Telefonnummer Geburtstag und Gerätekennung authentifizieren niemals ein Konto", async () => {
  const migration = await read("../supabase/migrations/20260804003000_central_customer_login_restaurant_context.sql");
  const resolver = migration.slice(migration.indexOf("create or replace function public.ensure_authenticated_customer_account"), migration.indexOf("create or replace function public.get_customer_account"));
  assert.match(resolver, /auth\.uid\(\)/);
  assert.doesNotMatch(resolver, /where[^;]*(normalized_phone|birthday|device_id)[^;]*select id into account_id_value/is);
});

test("Membership-Beitritt ist explizit tenantgebunden und idempotent", async () => {
  const migration = await read("../supabase/migrations/20260804003000_central_customer_login_restaurant_context.sql");
  const join = migration.slice(migration.indexOf("create or replace function public.join_customer_account_restaurant"), migration.indexOf("create or replace function public.pause_all_customer_offer_emails"));
  assert.match(join, /input_terms_accepted/);
  assert.match(join, /input_privacy_acknowledged/);
  assert.match(join, /restaurant_record\.id/);
  assert.match(join, /pg_advisory_xact_lock/);
  assert.match(join, /membership_record\.id is not null/);
  assert.match(join, /register_restaurant_customer_legal/);
});

test("bestehender Restaurantkunde wird nur mit gültigem Restauranttoken verknüpft", async () => {
  const migration = await read("../supabase/migrations/20260804003000_central_customer_login_restaurant_context.sql");
  const join = migration.slice(migration.indexOf("create or replace function public.join_customer_account_restaurant"), migration.indexOf("create or replace function public.pause_all_customer_offer_emails"));
  assert.match(join, /resolve_customer_from_public_token\(restaurant_record\.id, input_existing_customer_token\)/);
  assert.match(join, /CUSTOMER_MEMBERSHIP_ALREADY_LINKED/);
  assert.match(join, /CUSTOMER_ACCOUNT_RECOVERY_REQUIRED/);
});

test("fremd gebundener lokaler Restaurantzugang blockiert keinen neuen Auth-Account dauerhaft", async () => {
  const service = await read("../src/modules/customer/customerAccountService.ts");
  const join = service.slice(
    service.indexOf("export async function joinCustomerRestaurant"),
    service.indexOf("export async function joinCustomerReferral"),
  );
  assert.match(join, /CUSTOMER_ACCESS_TOKEN_INVALID/);
  assert.match(join, /CUSTOMER_MEMBERSHIP_ALREADY_LINKED/);
  assert.match(join, /removeStoredCustomerToken\(input\.restaurantSlug\)/);
  assert.match(join, /\(\{ data, error \} = await join\(null\)\)/);
  assert.doesNotMatch(join, /while\s*\(/);
});

test("Punkte und Belohnungen werden je Membership und Restaurant geladen", async () => {
  const migration = await read("../supabase/migrations/20260804003000_central_customer_login_restaurant_context.sql");
  assert.match(migration, /customer\.restaurant_id = membership\.restaurant_id/);
  assert.match(migration, /t\.restaurant_id = restaurant\.id/);
  assert.match(migration, /r\.restaurant_id = restaurant\.id/);
  assert.doesNotMatch(migration, /sum\([^)]*points_balance/i);
});

test("V1 besitzt keinen global gemischten Angebotsfeed", async () => {
  const [page, offers, navigation] = await Promise.all([
    read("../src/modules/customer/CentralCustomerPage.tsx"),
    read("../src/modules/customer/CustomerOffersPage.tsx"),
    read("../src/modules/customer/components/CentralCustomerNavigation.tsx"),
  ]);
  assert.doesNotMatch(page, /account\.offers/);
  assert.doesNotMatch(navigation, /Aktuelles/);
  assert.match(offers, /loadPublicRestaurantOffers\(slug, 100\)/);
});

test("öffentliche Auth-Seiten starten keinen geschützten Refresh und Customer-Routen schon", async () => {
  const policy = await read("../src/modules/auth/authRoutePolicy.mjs");
  assert.match(policy, /"\/customer"/);
  for (const path of ["/customer/login", "/customer/register", "/customer/auth/callback", "/customer/email/confirm", "/customer/email/unsubscribe"]) {
    assert.match(policy, new RegExp(path.replaceAll("/", "\\/")));
  }
});

test("neue RPCs sind nur für authenticated freigegeben und direkte Tabellenrechte bleiben entzogen", async () => {
  const [baseMigration, migration] = await Promise.all([
    read("../supabase/migrations/20260804002000_central_customer_account_offer_emails.sql"),
    read("../supabase/migrations/20260804003000_central_customer_login_restaurant_context.sql"),
  ]);
  for (const signature of ["get_customer_account\\(\\)", "get_customer_restaurant_context\\(text\\)", "open_customer_account_membership\\(uuid\\)", "join_customer_account_restaurant\\(text, boolean, boolean, text, text\\)"]) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${signature} to authenticated`));
  }
  assert.doesNotMatch(migration, /grant execute on function public\.(get_customer_account|get_customer_restaurant_context|open_customer_account_membership|join_customer_account_restaurant)[^;]+to anon/);
  assert.doesNotMatch(migration, /disable row level security/i);
  for (const legacySignature of ["bootstrap_customer_account\\(text, text, text\\)", "get_customer_account\\(text\\)", "open_customer_account_membership\\(text, uuid\\)", "pause_all_customer_offer_emails\\(text, boolean\\)"]) {
    assert.match(baseMigration, new RegExp(`revoke all on function public\\.${legacySignature} from public, anon, authenticated`));
    assert.doesNotMatch(baseMigration, new RegExp(`grant execute on function public\\.${legacySignature} to (?:anon|authenticated)`));
  }
});

test("Restaurantzugang nutzt mindestens 44 Pixel Touchziele und sichere Mobilebreiten", async () => {
  const css = await read("../src/modules/customer/central-customer.css");
  assert.match(css, /central-auth-page[\s\S]*width: min\(620px, 100%\)/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.doesNotMatch(css, /width:\s*100vw/);
});
