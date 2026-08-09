import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260803007000_points_redemption_presentation_window.sql", import.meta.url),
  "utf8",
);
const legalMigration = readFileSync(
  new URL("../supabase/migrations/20260803008000_points_presentation_legal_template.sql", import.meta.url),
  "utf8",
);
const customerPortal = readFileSync(new URL("../src/modules/customer/CustomerPortal.tsx", import.meta.url), "utf8");
const customerCss = readFileSync(new URL("../src/modules/customer/customer-premium.css", import.meta.url), "utf8");
const rewardService = readFileSync(new URL("../src/modules/rewards/rewardService.ts", import.meta.url), "utf8");
const releaseMigration = readFileSync(
  new URL("../supabase/migrations/20260809001000_v1_release_gift_presentations_notifications.sql", import.meta.url),
  "utf8",
);
const decision = readFileSync(
  new URL("../docs/product/DECISION_2026-08-03_V1_POINTS_PRESENTATION_WINDOW.md", import.meta.url),
  "utf8",
);

test("Punkteeinlösungen erhalten ein restaurant- und kundenbezogenes Präsentationsfenster", () => {
  assert.match(migration, /create table if not exists public\.points_redemption_presentations/);
  assert.match(migration, /restaurant_id uuid not null/);
  assert.match(migration, /customer_id uuid not null/);
  assert.match(migration, /reward_id uuid not null/);
  assert.match(migration, /unique \(restaurant_id, customer_id, idempotency_key\)/);
  assert.match(migration, /where status = 'REDEEMED_ACTIVE'/);
});

test("das Fenster ist exakt 15 Minuten lang und wird ausschließlich mit Serverzeit bewertet", () => {
  assert.match(migration, /expires_at = activated_at \+ interval '15 minutes'/);
  assert.match(migration, /activated_at_value timestamptz := statement_timestamp\(\)/);
  assert.match(migration, /prp\.expires_at > input_now/);
  assert.match(migration, /'server_now', input_now/);
  assert.doesNotMatch(rewardService, /Date\.now\(\).*active/);
});

test("Start und Retry sind idempotent und ein Payload-Wechsel wird abgelehnt", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /points-presentation-reward:/);
  assert.match(migration, /prp\.idempotency_key = input_idempotency_key/);
  assert.match(migration, /existing_presentation\.reward_id <> input_reward_id/);
  assert.match(migration, /IDEMPOTENCY_KEY_PAYLOAD_MISMATCH/);
  assert.match(migration, /'already_started', true/);
});

test("Punkteabzug, Journal und Präsentation entstehen in derselben RPC-Transaktion", () => {
  assert.match(migration, /update public\.customers[\s\S]*points_balance = c\.points_balance - reward_record\.required_points/);
  assert.match(migration, /insert into public\.points_transactions/);
  assert.match(migration, /insert into public\.points_redemption_presentations/);
  assert.match(migration, /insert into public\.redemption_activity_journal/);
  assert.match(migration, /POINT_REDEMPTION_PRESENTATION_STARTED/);
  assert.match(migration, /CUSTOMER_PRESENTATION_WINDOW/);
});

test("Punktevertrag bleibt getrennt, während Geschenke denselben Präsentationsstil additiv erhalten", () => {
  assert.match(migration, /not r\.is_starter_reward/);
  assert.match(customerPortal, /if \(!redeemOffer\.is_starter_reward\)[\s\S]*startCustomerPointsPresentation/);
  assert.match(customerPortal, /startCustomerGiftPresentation/);
  assert.match(releaseMigration, /customer_reward_id uuid not null unique/);
  assert.match(releaseMigration, /CUSTOMER_PRESENTATION_WINDOW/);
});

test("Reload und weitere Tabs restaurieren ausschließlich einen servervalidierten Zustand", () => {
  assert.match(rewardService, /get_customer_points_presentation/);
  assert.match(customerPortal, /loadCustomerPointsPresentation/);
  assert.match(migration, /cqt\.token_hash = public\.hash_public_token\(input_customer_token\)/);
  assert.match(migration, /cqt\.restaurant_id = restaurant_record\.id/);
  assert.match(migration, /prp\.customer_id = customer_record\.id/);
  assert.doesNotMatch(customerPortal, /sessionStorage[^\n]*points.*presentation/i);
});

test("abgelaufene Fenster werden serverseitig abgeschlossen", () => {
  assert.match(migration, /complete_points_redemption_presentations/);
  assert.match(migration, /status = 'REDEEMED_COMPLETED', completed_at = input_now/);
  assert.match(migration, /POINT_REDEMPTION_PRESENTATION_COMPLETED/);
  assert.match(migration, /wuxuai-v1-complete-points-presentations/);
  assert.match(migration, /'\* \* \* \* \*'/);
});

test("der sichtbare Sicherheitswert rotiert und ist nicht die Autorität der Einlösung", () => {
  assert.match(migration, /floor\(extract\(epoch from input_now\) \/ 10\)/);
  assert.match(migration, /extensions\.digest/);
  assert.match(migration, /'visual_code_valid_until'/);
  assert.match(decision, /kein Authentifizierungsmerkmal/);
});

test("nur Owner oder Support dürfen mit Begründung stornieren und atomar zurückbuchen", () => {
  assert.match(migration, /rm\.role = 'owner'/);
  assert.match(migration, /coalesce\(public\.current_platform_role\(\), ''\) <> 'support'/);
  assert.match(migration, /length\(trim\(coalesce\(input_reason, ''\)\)\) < 10/);
  assert.match(migration, /points_balance = c\.points_balance \+ presentation_record\.points_spent/);
  assert.match(migration, /stamp_balance = c\.stamp_balance \+ presentation_record\.stamps_spent/);
  assert.match(migration, /POINT_REDEMPTION_PRESENTATION_CANCELLED/);
  assert.match(migration, /Die Einlösung wurde bereits storniert/);
});

test("Browserrollen haben keinen direkten Tabellenzugriff und nur enge RPC-Rechte", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.points_redemption_presentations from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.start_customer_points_presentation[\s\S]*to anon, authenticated/);
  assert.match(migration, /revoke execute on function public\.cancel_points_presentation_activity_internal[\s\S]*from public, anon, authenticated/);
});

test("die Kundenoberfläche zeigt Bestätigung, Countdown und bewegte Sicherheitsmerkmale", () => {
  assert.match(customerPortal, /Jetzt einlösen/);
  assert.match(customerPortal, /Die benötigten Punkte werden sofort endgültig abgezogen/);
  assert.match(customerPortal, /Diese Aktion kann nicht selbst rückgängig gemacht werden/);
  assert.match(customerPortal, /Danach hast du 15 Minuten Zeit, diese Einlösung dem Team zu zeigen/);
  assert.match(customerPortal, /Verbleibende Zeit/);
  assert.match(customerPortal, /Serverzeit/);
  assert.match(customerPortal, /Gültig bis/);
  assert.match(customerPortal, /Sicherheit/);
  assert.match(customerPortal, /wakeLock/);
  assert.match(customerCss, /premium-presentation-shine/);
  assert.match(customerCss, /prefers-reduced-motion: reduce/);
});

test("die neue Legal-Vorlage bleibt Entwurf und überschreibt keine veröffentlichten Dokumente", () => {
  assert.match(legalMigration, /DRAFT_LEGAL_REVIEW_REQUIRED/);
  assert.match(legalMigration, /2026\.08-v1\.0-presentation-window/);
  assert.doesNotMatch(legalMigration, /update public\.legal_document_templates/);
  assert.doesNotMatch(legalMigration, /delete from/);
});
