import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CUSTOMER_PRESENTATION_MESSAGES } from "../src/shared/i18n/customerPresentationMessages.mjs";

const [migration, route, service, login] = await Promise.all([
  readFile(new URL("../supabase/migrations/20260925001000_customer_identity_qr_token_idempotency.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/CustomerRestaurantAccess.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/customerAccountService.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/modules/customer/CustomerAuthPage.tsx", import.meta.url), "utf8"),
]);

function body(name) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `${name} missing`);
  return migration.slice(start, migration.indexOf("$function$;", start) + "$function$;".length);
}

test("all customer page reads are write-free", () => {
  for (const name of ["get_customer_account()", "get_customer_restaurant_context(", "get_customer_restaurant_access(", "open_customer_account_membership(", "get_customer_identity_summary("]) {
    const sql = body(name);
    assert.doesNotMatch(sql, /\b(insert|update|delete|perform\s+public\.write_audit_event)\b/i, name);
  }
  assert.match(route, /nextContext\.membership_exists && nextContext\.token_valid/);
  assert.doesNotMatch(route, /openCustomerMembership\(/);
  assert.match(route, /if \(portalRestaurantSlug === restaurantSlug\)/);
});

test("recovery requires recent server session, atomic revocation, one issuance and audit IDs", () => {
  const sql = body("recover_customer_membership_token(");
  assert.match(sql, /auth\.sessions s/);
  assert.match(sql, /s\.created_at>=statement_timestamp\(\)-interval '10 minutes'/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /CUSTOMER_RECOVERY_REAUTH_REQUIRED/);
  assert.match(sql, /set active=false,revoked_at=now\(\),rotated_at=now\(\)/);
  assert.match(sql, /insert into public\.customer_qr_tokens/);
  assert.match(sql, /public\.hash_public_token\(raw_value\)/);
  assert.match(sql, /input_request_id,input_correlation_id/);
  assert.match(migration, /create unique index if not exists customer_qr_tokens_one_active_per_customer_idx/);
  assert.match(migration, /created_at desc,id desc/);
  assert.match(body("protect_customer_qr_token_history("), /CUSTOMER_TOKEN_DELETE_FORBIDDEN/);
  assert.match(body("protect_customer_qr_token_history("), /old\.active is false and new\.active is true/);
  assert.match(service, /rpc\("recover_customer_membership_token"/);
  assert.match(route, /onClick=\{\(\) => void recover\(\)\}/);
});

test("login and context audits are separated from reads", () => {
  assert.match(body("record_customer_login_success("), /CUSTOMER_LOGIN_SUCCESS/);
  assert.match(body("set_customer_portal_context("), /CUSTOMER_CONTEXT_CHANGED/);
  assert.match(login, /await signIn\(/);
  assert.match(login, /await recordCustomerLoginSuccess\(returnTo\)/);
  assert.match(service, /rpc\("set_customer_portal_context"/);
});

test("explicit recovery copy exists in seven languages", () => {
  for (const language of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
    for (const key of ["title", "description", "action", "working", "reauthenticate"]) {
      const value = CUSTOMER_PRESENTATION_MESSAGES[language][`customer.recovery.${key}`];
      assert.ok(typeof value === "string" && value.trim().length > 0, `${language}/${key}`);
    }
  }
});
