import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasTotpAuthenticationMethod,
  canRemoveTotpFactor,
  isPlatformSessionProofCurrent,
  latestVerifiedTotpFactor,
  nextTotpDeviceName,
  normalizeTotpCode,
  platformAdminMfaMode,
  totpFactorLabel,
  verifiedTotpFactors,
} from "../src/modules/platform/platformAdminMfa.mjs";

const migration = readFileSync(
  new URL("../supabase/migrations/20260926001000_platform_admin_totp_aal2_gate.sql", import.meta.url),
  "utf8",
);
const gate = readFileSync(new URL("../src/modules/platform/PlatformAdminMfaGate.tsx", import.meta.url), "utf8");
const securityControl = readFileSync(new URL("../src/modules/platform/PlatformAdminMfaSecurityControl.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/modules/platform/PlatformAdminLayout.tsx", import.meta.url), "utf8");
const protectedRoute = readFileSync(new URL("../src/modules/auth/ProtectedRoute.tsx", import.meta.url), "utf8");
const supportEdge = readFileSync(new URL("../supabase/functions/platform-support-auth/index.ts", import.meta.url), "utf8");

test("AAL2 is authorized only when the current session also proves TOTP", () => {
  assert.equal(platformAdminMfaMode({
    currentLevel: "aal2",
    currentAuthenticationMethods: [{ method: "totp", timestamp: 1 }],
    verifiedTotpFactors: [{ id: "factor" }],
  }), "authorized");
  assert.equal(platformAdminMfaMode({
    currentLevel: "aal2",
    currentAuthenticationMethods: [{ method: "phone", timestamp: 1 }],
    verifiedTotpFactors: [{ id: "factor" }],
  }), "challenge");
  assert.equal(platformAdminMfaMode({
    currentLevel: "aal1",
    currentAuthenticationMethods: ["password"],
    verifiedTotpFactors: [{ id: "factor" }],
  }), "challenge");
  assert.equal(platformAdminMfaMode({
    currentLevel: "aal1",
    currentAuthenticationMethods: ["password"],
    verifiedTotpFactors: [],
  }), "enroll");
});

test("TOTP method parsing accepts supported JWT formats and rejects other factors", () => {
  assert.equal(hasTotpAuthenticationMethod(["password", "totp"]), true);
  assert.equal(hasTotpAuthenticationMethod([{ method: "password" }, { method: "totp" }]), true);
  assert.equal(hasTotpAuthenticationMethod([{ method: "phone" }]), false);
  assert.equal(hasTotpAuthenticationMethod(null), false);
});

test("codes are numeric and the verified factor choice is deterministic", () => {
  assert.equal(normalizeTotpCode(" 12a 34567 "), "123456");
  assert.equal(latestVerifiedTotpFactor([
    { id: "a", updated_at: "2026-09-26T08:00:00Z" },
    { id: "b", updated_at: "2026-09-26T09:00:00Z" },
  ])?.id, "b");
});

test("two verified TOTP devices remain distinct and safely labelled", () => {
  const factors = verifiedTotpFactors([
    { id: "second", status: "verified", friendly_name: "WUXUAI Platform Admin – Gerät 2", created_at: "2026-09-27T09:00:00Z" },
    { id: "ignored", status: "unverified", friendly_name: "Unverified" },
    { id: "first", status: "verified", friendly_name: "WUXUAI Platform Admin – Gerät 1", created_at: "2026-09-27T08:00:00Z" },
  ]);
  assert.deepEqual(factors.map((factor) => factor.id), ["first", "second"]);
  assert.equal(totpFactorLabel(factors[0], 0), "WUXUAI Platform Admin – Gerät 1");
  assert.equal(totpFactorLabel({ id: "fallback", status: "verified" }, 1), "Authenticator-Gerät 2");
  assert.equal(nextTotpDeviceName([factors[0]]), "WUXUAI Platform Admin – Gerät 2");
});

test("loss recovery requires a different verified factor and preserves the last factor", () => {
  const factors = [
    { id: "first", status: "verified" },
    { id: "second", status: "verified" },
  ];
  assert.equal(canRemoveTotpFactor(factors, "first", "second"), true);
  assert.equal(canRemoveTotpFactor(factors, "first", "first"), false);
  assert.equal(canRemoveTotpFactor([factors[0]], "first", "second"), false);
  assert.equal(canRemoveTotpFactor(factors, "unknown", "second"), false);
});

test("server role authorization fails closed without TOTP AAL2", () => {
  assert.match(migration, /from auth\.sessions session_record/);
  assert.match(migration, /session_record\.user_id = auth\.uid\(\)/);
  assert.match(migration, /session_record\.not_after is null or session_record\.not_after > statement_timestamp\(\)/);
  assert.match(migration, /and public\.platform_session_current_internal\(\)/);
  assert.match(migration, /join auth\.mfa_factors factor_record/);
  assert.match(migration, /session_record\.aal = 'aal2'/);
  assert.match(migration, /factor_record\.factor_type = 'totp'/);
  assert.match(migration, /factor_record\.status = 'verified'/);
  assert.match(migration, /and public\.platform_totp_factor_current_internal\(\)/);
  assert.match(migration, /auth\.jwt\(\)->>'aal' = 'aal2'/);
  assert.match(migration, /method->>'method' = 'totp'/);
  assert.match(migration, /and public\.platform_totp_aal2_verified_internal\(\)/);
  assert.match(migration, /select coalesce\([\s\S]*public\.current_platform_role\(\) in/);
  assert.match(migration, /RECENT_PLATFORM_TOTP_REQUIRED/);
  assert.doesNotMatch(migration, /grant execute on function public\.platform_totp_aal2_verified_internal/);
  assert.doesNotMatch(migration, /grant execute on function public\.platform_session_current_internal/);
  assert.doesNotMatch(migration, /grant execute on function public\.platform_totp_factor_current_internal/);
});

test("role discovery remains narrow and separate so enrollment cannot lock out the sole admin", () => {
  const discovery = migration.match(/create or replace function public\.get_current_platform_role\(\)[\s\S]*?\$function\$;/)?.[0] ?? "";
  assert.match(discovery, /from public\.platform_admins pa/);
  assert.match(discovery, /pa\.user_id = auth\.uid\(\)/);
  assert.match(discovery, /platform_session_current_internal/);
  assert.doesNotMatch(discovery, /platform_totp_aal2_verified_internal/);
  assert.match(migration, /grant execute on function public\.get_current_platform_role\(\) to authenticated/);
});

test("every platform route is synchronously wrapped by the MFA gate after role authorization", () => {
  assert.match(protectedRoute, /if \(roleScope === "platform"\)[\s\S]*<PlatformAdminMfaGate key=\{user\.id\}>/);
  assert.match(gate, /getAuthenticatorAssuranceLevel\(\)/);
  assert.match(gate, /listFactors\(\)/);
  assert.match(gate, /challengeAndVerify\(\{ factorId, code \}\)/);
  assert.match(gate, /factorType: "totp"/);
  assert.match(gate, /Authenticator-Gerät auswählen/);
  assert.match(gate, /factors\.map/);
});

test("authorized Platform Admin can manage exactly two devices without an admin bypass", () => {
  assert.match(layout, /<PlatformAdminMfaSecurityControl \/>/);
  assert.match(securityControl, /factors\.length >= 2/);
  assert.match(securityControl, /canRemoveTotpFactor\(factors, removeTarget, proofFactor\)/);
  assert.match(securityControl, /challengeAndVerify\(\{ factorId: proofFactor, code \}\)/);
  assert.match(securityControl, /mfa\.unenroll\(\{ factorId: removeTarget \}\)/);
  assert.match(securityControl, /factors\.length < 2/);
  assert.doesNotMatch(securityControl, /service_role|auth\.admin|deleteFactor/);
});

test("the rendered Platform surface is bound fail-closed to the exact checked session", () => {
  assert.equal(isPlatformSessionProofCurrent("session-a", "session-a"), true);
  assert.equal(isPlatformSessionProofCurrent("session-a", "session-b"), false);
  assert.equal(isPlatformSessionProofCurrent("session-a", null), false);
  assert.equal(isPlatformSessionProofCurrent(null, "session-b"), false);
  assert.match(gate, /const currentSessionToken = session\?\.access_token \?\? null/);
  assert.match(gate, /supabase\.auth\.getSession\(\)/);
  assert.match(gate, /isPlatformSessionProofCurrent\(verifiedSessionToken, currentSessionToken\)/);
  assert.match(gate, /mode === "authorized" && sessionProofIsCurrent/);
  assert.match(gate, /\[currentSessionToken, refresh\]/);
  assert.match(gate, /refreshGeneration\.current/);
});

test("TOTP enrollment is explicit and never starts during the initial gate check", () => {
  const effect = gate.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[currentSessionToken, refresh\]\);/)?.[0] ?? "";
  assert.match(effect, /refresh\(\)/);
  assert.doesNotMatch(effect, /mfa\.enroll/);
  assert.match(gate, /onClick=\{\(\) => void beginEnrollment\(\)\}/);
});

test("Platform Support Edge inherits server-side AAL2 through both authorization RPCs", () => {
  assert.match(supportEdge, /rpc\("get_platform_auth_support_target"/);
  assert.match(supportEdge, /rpc\("record_platform_auth_support_operation"/);
  assert.doesNotMatch(supportEdge, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
