import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const api = "http://127.0.0.1:56121";
const key = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
assert.ok(key?.startsWith("sb_publishable_"));
const restaurant = "ca200000-0000-4000-8000-000000000021";
const branch = "ca200000-0000-4000-8000-000000000031";
const admin = createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `catalog-admin-${randomBytes(6).toString("hex")}@example.invalid`;
const signup = await admin.auth.signUp({ email, password: randomBytes(32).toString("hex") });
assert.ifError(signup.error);
assert.ok(signup.data.user?.id);

function sql(statement) {
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", "56122", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t", "-c", statement],
    { encoding: "utf8", env: process.env }).trim();
}
sql(`insert into public.platform_admins(user_id,role,active) values('${signup.data.user.id}','platform_admin',true)`);

const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const requestId = crypto.randomUUID();
const reason = "Synthetic local catalog permit test";
const grantRequest = {
  input_restaurant_id: restaurant, input_branch_id: branch, input_action: "GRANT",
  input_expected_grant_id: null, input_expires_at: expiresAt, input_reason: reason,
  input_request_id: requestId,
};
const beforeMfa = await admin.rpc("set_platform_test_menu_addon", grantRequest);
assert.ok(beforeMfa.error, "Admin write must fail without AAL2 and recent TOTP");
assert.equal(sql(`select count(*) from public.restaurant_menu_test_addon_events where restaurant_id='${restaurant}' and actor_id='${signup.data.user.id}'`), "0");

function base32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0; let buffer = 0; const output = [];
  for (const letter of value.toUpperCase().replace(/=+$/, "")) {
    const index = alphabet.indexOf(letter); if (index < 0) throw new Error("INVALID_TOTP_SECRET");
    buffer = (buffer << 5) | index; bits += 5;
    if (bits >= 8) { bits -= 8; output.push((buffer >> bits) & 255); }
  }
  return Buffer.from(output);
}
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const enrollment = await admin.auth.mfa.enroll({ factorType: "totp", friendlyName: "Synthetic local catalog test" });
assert.ifError(enrollment.error);
const factorId = enrollment.data?.id;
const secret = enrollment.data?.totp?.secret;
assert.ok(factorId && secret, "Real local Auth TOTP enrollment");
const verified = await admin.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
assert.ifError(verified.error);
const aal = await admin.auth.mfa.getAuthenticatorAssuranceLevel();
assert.equal(aal.data?.currentLevel, "aal2");

const granted = await admin.rpc("set_platform_test_menu_addon", grantRequest);
assert.ifError(granted.error);
assert.ok(granted.data?.event_id);
const replays = await Promise.all(Array.from({ length: 5 }, () => admin.rpc("set_platform_test_menu_addon", grantRequest)));
for (const replay of replays) {
  assert.ifError(replay.error);
  assert.equal(replay.data?.event_id, granted.data.event_id);
  assert.equal(replay.data?.idempotent, true);
}
const read = await admin.rpc("get_platform_test_menu_addon", { input_restaurant_id: restaurant });
assert.ifError(read.error);
assert.equal(read.data?.active, true);
assert.equal(read.data?.grant_id, granted.data.event_id);
assert.equal(sql(`select count(*) from public.audit_log where restaurant_id='${restaurant}' and event_type='MENU_TEST_ADDON_GRANT' and actor_id='${signup.data.user.id}'`), "1");

const foreign = await admin.rpc("set_platform_test_menu_addon", {
  ...grantRequest, input_restaurant_id: crypto.randomUUID(), input_request_id: crypto.randomUUID(),
});
assert.ok(foreign.error, "foreign TEST_ONLY tenant denied");
const foreignBranch = await admin.rpc("set_platform_test_menu_addon", {
  ...grantRequest, input_branch_id: crypto.randomUUID(), input_request_id: crypto.randomUUID(),
});
assert.ok(foreignBranch.error, "foreign branch denied");

const revoked = await admin.rpc("set_platform_test_menu_addon", {
  input_restaurant_id: restaurant, input_branch_id: branch, input_action: "REVOKE",
  input_expected_grant_id: granted.data.event_id, input_expires_at: null,
  input_reason: reason, input_request_id: crypto.randomUUID(),
});
assert.ifError(revoked.error);
const after = await admin.rpc("get_platform_test_menu_addon", { input_restaurant_id: restaurant });
assert.ifError(after.error);
assert.equal(after.data?.active, false);
assert.equal(sql(`select count(*) from public.audit_log where restaurant_id='${restaurant}' and event_type='MENU_TEST_ADDON_REVOKE' and actor_id='${signup.data.user.id}'`), "1");
sql("update public.business_verification_environment set environment='DISABLED' where singleton");
const disabled = await admin.rpc("set_platform_test_menu_addon", {
  ...grantRequest, input_request_id: crypto.randomUUID(),
});
assert.ok(disabled.error, "non-STAGING environment denied");
sql("update public.business_verification_environment set environment='STAGING' where singleton");
console.log("MENU_ADDON_REAL_LOCAL_AAL2_PASS grant=1 parallel_replay=5 revoke=1 audit=2 non_staging_denied=1");
