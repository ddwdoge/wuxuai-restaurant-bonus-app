import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { hasTotpAuthenticationMethod } from "../src/modules/platform/platformAdminMfa.mjs";

const status = JSON.parse(execFileSync(
  "npx",
  ["--no-install", "supabase", "status", "--output", "json"],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
));
const url = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY;
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):56121$/);
assert.ok(anonKey && serviceRoleKey);

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replace(/=+$/u, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid local TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, now = Date.now()) {
  const counter = Math.floor(now / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, "0");
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const browser = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const userId = randomUUID();
const email = `platform-aal2-${randomUUID()}@example.invalid`;
const password = randomBytes(24).toString("base64url");

try {
  const created = await admin.auth.admin.createUser({ id: userId, email, password, email_confirm: true });
  assert.ifError(created.error);
  const roleInsert = await admin.from("platform_admins").insert({ user_id: userId, role: "platform_admin", active: true });
  assert.ifError(roleInsert.error);

  const signedIn = await browser.auth.signInWithPassword({ email, password });
  assert.ifError(signedIn.error);

  const aal1 = await browser.auth.mfa.getAuthenticatorAssuranceLevel();
  assert.ifError(aal1.error);
  assert.equal(aal1.data.currentLevel, "aal1");
  const denied = await browser.rpc("get_platform_restaurants");
  assert.ok(denied.error, "A direct Platform Admin RPC must fail before TOTP AAL2");

  const enrollment = await browser.auth.mfa.enroll({ factorType: "totp", friendlyName: "Local security gate" });
  assert.ifError(enrollment.error);
  const verified = await browser.auth.mfa.challengeAndVerify({
    factorId: enrollment.data.id,
    code: totp(enrollment.data.totp.secret),
  });
  assert.ifError(verified.error);

  const aal2 = await browser.auth.mfa.getAuthenticatorAssuranceLevel();
  assert.ifError(aal2.error);
  assert.equal(aal2.data.currentLevel, "aal2");
  assert.equal(hasTotpAuthenticationMethod(aal2.data.currentAuthenticationMethods), true);
  const allowed = await browser.rpc("get_platform_restaurants");
  assert.ifError(allowed.error);

  const beforeRefresh = (await browser.auth.getSession()).data.session?.access_token;
  const refreshed = await browser.auth.refreshSession();
  assert.ifError(refreshed.error);
  assert.notEqual(refreshed.data.session?.access_token, beforeRefresh);
  const refreshedAal = await browser.auth.mfa.getAuthenticatorAssuranceLevel();
  assert.ifError(refreshedAal.error);
  assert.equal(refreshedAal.data.currentLevel, "aal2");
  assert.ifError((await browser.rpc("get_platform_restaurants")).error);

  assert.ifError((await browser.auth.signOut({ scope: "local" })).error);
  assert.ok((await browser.rpc("get_platform_restaurants")).error);

  console.log("LOCAL_REAL_TOTP_ENROLLMENT_CHALLENGE_PASS");
  console.log("LOCAL_AAL1_DIRECT_RPC_BLOCKED_PASS");
  console.log("LOCAL_AAL2_REFRESH_AND_SERVER_ACCESS_PASS");
  console.log("LOCAL_SIGNED_OUT_DIRECT_RPC_BLOCKED_PASS");
} finally {
  await admin.from("platform_admins").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
}
