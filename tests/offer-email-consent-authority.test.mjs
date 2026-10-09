import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");
const migration = await source("../supabase/migrations/20261009101842_offer_email_consent_authority.sql");
const edge = await source("../supabase/functions/customer-offer-email-request/index.ts");
const service = await source("../src/modules/customer/customerAccountService.ts");
const customer = await source("../src/modules/customer/CentralCustomerPage.tsx");

const body = (name) => {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} missing`);
  const end = migration.indexOf("$function$;", start);
  return migration.slice(start, end);
};

test("no approved offer-email document or hosted sender is seeded", () => {
  assert.doesNotMatch(migration, /insert into public\.platform_legal_document_versions\s*\([^)]*offer_email_consent/is);
  assert.doesNotMatch(migration, /LOCAL_SYNTHETIC_TEST_ONLY/);
  assert.doesNotMatch(edge, /sendMail|smtp|captureUrl|fetch\(capture|customer-offer-email-local-test/i);
  assert.match(edge, /return reply\(\{ accepted: true \}, 202, origin\)/);
  assert.doesNotMatch(service + customer, /customer-offer-email-local-test|requestLocalTestCustomerOfferEmail/);
});

test("request uses the current immutable version/hash, confirmed session and rate limit", () => {
  const request = body("request_authenticated_customer_offer_email_confirmation");
  assert.match(request, /current_offer_email_consent_document_internal/);
  assert.match(request, /input_expected_document_id/);
  assert.match(request, /input_expected_version/);
  assert.match(request, /input_expected_sha256/);
  assert.match(request, /join auth\.sessions s/);
  assert.match(request, /customer_offer_email_request_receipts/);
  assert.match(request, /offer_email_request_id\)/);
  assert.match(request, /interval '24 hours'/);
  assert.match(request, /restaurant_entitlement_enabled\(input_restaurant_id,'offer_notifications'\)/);
  assert.match(request, /'PENDING_CONFIRMATION'/);
  assert.match(edge, /auth\.getUser\(bearer\)/);
  assert.match(edge, /url\.protocol === "http:" && \["127\.0\.0\.1", "localhost", "kong"\]/);
  assert.doesNotMatch(edge, /body\.email|body\.customer_id|body\.auth_user_id/);
});

test("confirmation and withdrawal are one-time, session- and document-bound", () => {
  const confirm = body("confirm_customer_offer_email");
  const withdraw = body("withdraw_authenticated_customer_offer_email");
  assert.match(confirm, /customer_verified_session_id/);
  assert.match(confirm, /current_offer_email_consent_document_internal/);
  assert.match(confirm, /receipt\.request_id=token_record\.offer_email_request_id/);
  assert.match(confirm, /consent_record\.consent_content_sha256 is distinct from document_row\.content_sha256/);
  assert.match(confirm, /token_record\.used_at is not null/);
  assert.match(confirm, /customer_offer_email_decision_receipts/);
  assert.match(confirm, /restaurant_entitlement_enabled\(consent_record\.restaurant_id,'offer_notifications'\)/);
  assert.match(withdraw, /customer_verified_session_id/);
  assert.match(withdraw, /status='WITHDRAWN'/);
  assert.match(withdraw, /purpose='CONFIRM' and used_at is null/);
  assert.match(withdraw, /customer_offer_email_decision_receipts/);
});

test("Customer readback marks stale consent invalid and permits a fresh decision", () => {
  assert.match(body("get_current_offer_email_consent_document"), /current_consent_active/);
  assert.match(customer, /offerEmailConsentCurrent\(membership, emailDocuments\[membership\.restaurant_id\]\)/);
  assert.match(customer, /Erneute Bestätigung erforderlich; Versand gesperrt/);
  const request = customer.slice(customer.indexOf('async function requestOfferEmail('),
    customer.indexOf('async function withdrawOfferEmail('));
  assert.doesNotMatch(request, /email_delivery\.available/,
    'senderless opt-in must not depend on a live delivery provider');
  assert.match(customer, /\{emailDocuments\[membership\.restaurant_id\]\?\.available\s*\n\s*&& !offerEmailConsentCurrent/);
});

test("all offer queue paths recheck published source, hash, PRO and binding", () => {
  const enqueue = body("enqueue_customer_transactional_email");
  const dispatch = body("customer_transactional_email_dispatch_block_reason");
  const list = body("list_due_customer_offer_email_consents");
  const reserve = body("reserve_customer_offer_email_delivery");
  for (const value of [enqueue, dispatch]) {
    assert.match(value, /offer_email_current_consent_authorized_internal/);
    assert.match(value, /restaurant_entitlement_enabled/);
  }
  assert.match(dispatch, /OFFER_SOURCE_INACTIVE/);
  assert.match(dispatch, /OFFER_EMAIL_CONSENT_INACTIVE/);
  assert.match(dispatch, /REWARD_EMAIL_CONSENT_CONTRACT_MISSING/);
  assert.match(list, /No recipient is released/);
  assert.doesNotMatch(list, /return query|consent\.email/);
  assert.match(reserve, /LEGACY_SENDER_NOT_RELEASED/);
  assert.doesNotMatch(reserve, /'reserved', true|consent_record\.email/);
});

test("browser grants are narrow and protected tables have no direct grant", () => {
  assert.match(migration, /revoke all on function public\.request_authenticated_customer_offer_email_confirmation\([\s\S]*?from public,anon,authenticated/);
  assert.match(migration, /grant execute on function public\.request_authenticated_customer_offer_email_confirmation\([\s\S]*?to service_role/);
  assert.match(migration, /revoke all on function public\.request_customer_offer_email_confirmation\([\s\S]*?from public,anon,authenticated,service_role/);
  for (const table of ["customer_offer_email_request_receipts", "customer_offer_email_decision_receipts", "offer_email_consent_publication_events"]) {
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from public,anon,authenticated,service_role`));
  }
});
