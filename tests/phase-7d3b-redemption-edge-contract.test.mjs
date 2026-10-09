import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedRedemptionOrigin,
  allowedRedemptionPreflight,
  allowedRedemptionRuntime,
  parseRedemptionMutation,
} from "../supabase/functions/_shared/redemptionEdgeContract.mjs";

const id = "c2194488-df54-41c6-a1c1-577d6f5d36ec";
const validStart = {
  action: "start", restaurant_slug: "test-restaurant", source_type: "points",
  entitlement_id: id, request_id: id, correlation_id: id, idempotency_key: id,
};

test("only the exact server-validated redemption envelope is accepted", () => {
  assert.equal(parseRedemptionMutation(validStart).action, "start");
  for (const field of ["actor_user_id", "role", "restaurant_id", "branch_id", "client_ip", "created_at"]) {
    assert.throws(() => parseRedemptionMutation({ ...validStart, [field]: id }), /REDEMPTION_REQUEST_INVALID/);
  }
  assert.throws(() => parseRedemptionMutation({ ...validStart, source_type: "offer" }), /REDEMPTION_REQUEST_INVALID/);
  assert.throws(() => parseRedemptionMutation({ ...validStart, request_id: "not-a-uuid" }), /REDEMPTION_REQUEST_INVALID/);
  assert.throws(() => parseRedemptionMutation({ action: "verify_pin", redemption_id: id,
    pin: "12345", request_id: id, correlation_id: id, idempotency_key: id }), /REDEMPTION_REQUEST_INVALID/);
});

test("CORS is exact and rejects unknown headers and origins", () => {
  assert.equal(allowedRedemptionOrigin("http://127.0.0.1:4180", "local_only", "http://127.0.0.1:4180"), "http://127.0.0.1:4180");
  assert.equal(allowedRedemptionOrigin("http://evil.test", "local_only", "http://127.0.0.1:4180"), null);
  assert.equal(allowedRedemptionOrigin("https://staging-app.bonus.wuxuaisbi.com", "staging", "", "wrong"), null);
  assert.equal(allowedRedemptionOrigin(
    "https://app.bonus.wuxuaisbi.com", "production", "", "fuqhljgesclipzduhykl",
  ), "https://app.bonus.wuxuaisbi.com");
  assert.equal(allowedRedemptionOrigin(
    "https://staging-app.bonus.wuxuaisbi.com", "production", "", "fuqhljgesclipzduhykl",
  ), null);
  assert.equal(allowedRedemptionOrigin(
    "https://app.bonus.wuxuaisbi.com", "production", "", "wrong",
  ), null);
  assert.equal(allowedRedemptionPreflight("POST", "authorization, apikey, content-type"), true);
  assert.equal(allowedRedemptionPreflight("POST", "authorization, x-forwarded-for"), false);
  assert.equal(allowedRedemptionPreflight("GET", "authorization"), false);
});

test("Staging and Production redemption runtimes are bound to their exact Supabase project", () => {
  assert.equal(allowedRedemptionRuntime(
    "staging", "https://bwhvfjuwixgwduoeqaya.supabase.co", "bwhvfjuwixgwduoeqaya",
  ), false);
  const binding = { project_ref: "a".repeat(20), backend_url: `https://${"a".repeat(20)}.supabase.co`,
    app_origin: "https://new-staging.example.invalid" };
  assert.equal(allowedRedemptionRuntime("staging", binding.backend_url, binding.project_ref, binding), true);
  assert.equal(allowedRedemptionOrigin(binding.app_origin, "staging", "", binding.project_ref, binding), binding.app_origin);
  assert.equal(allowedRedemptionRuntime(
    "production", "https://fuqhljgesclipzduhykl.supabase.co", "fuqhljgesclipzduhykl",
  ), true);
  assert.equal(allowedRedemptionRuntime(
    "production", "https://bwhvfjuwixgwduoeqaya.supabase.co", "fuqhljgesclipzduhykl",
  ), false);
  assert.equal(allowedRedemptionRuntime(
    "production", "https://fuqhljgesclipzduhykl.supabase.co", "bwhvfjuwixgwduoeqaya",
  ), false);
  assert.equal(allowedRedemptionRuntime(
    "", "https://fuqhljgesclipzduhykl.supabase.co", "fuqhljgesclipzduhykl",
  ), false);
});
