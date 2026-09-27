import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import console from "node:console";
import { createHmac, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { hasTotpAuthenticationMethod } from "../src/modules/platform/platformAdminMfa.mjs";
import {
  canonicalApprovalPayload,
  runRecovery,
} from "../scripts/platform-admin-totp-recovery-runner.mjs";

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
const recoveryDirectory = await mkdtemp(join(tmpdir(), "wuxuai-platform-recovery-"));
await chmod(recoveryDirectory, 0o700);

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

  const staleAal2Token = refreshed.data.session?.access_token;
  assert.ok(staleAal2Token);
  const factorsBeforeDelete = await admin.auth.admin.mfa.listFactors({ userId });
  assert.ifError(factorsBeforeDelete.error);
  assert.equal(factorsBeforeDelete.data.factors.some((factor) => factor.id === enrollment.data.id), true);

  const approvalFile = join(recoveryDirectory, "approval.json");
  const publicKeyFile = join(recoveryDirectory, "approver.pem");
  const evidenceFile = join(recoveryDirectory, "evidence.jsonl");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const approvedAt = new Date();
  const request = {
    version: 1,
    action: "DELETE_TOTP_FACTOR",
    project_ref: "abcdefghijklmnopqrst",
    correlation_id: randomUUID(),
    request_id: randomUUID(),
    target_user_id: userId,
    factor_id: enrollment.data.id,
    factor_type: "totp",
    requestor_ref: "synthetic-local-requestor",
    approver_ref: "synthetic-local-approver",
    executor_ref: "synthetic-local-executor",
    identity_checks: ["REGISTERED_RECOVERY_CONTACT", "SECOND_MFA_PROTECTED_PROVIDER"],
    reason_code: "FACTOR_UNAVAILABLE",
    approved_at: approvedAt.toISOString(),
    expires_at: new Date(approvedAt.getTime() + 5 * 60_000).toISOString(),
    migration_173_sha256: "fe76bbbc8b24fc069231bb0f56d4351e801d40216c6625df9d4655d0162913ce",
  };
  request.signature = sign(null, Buffer.from(canonicalApprovalPayload(request)), privateKey).toString("base64");
  await writeFile(approvalFile, `${JSON.stringify(request)}\n`, { mode: 0o600 });
  await writeFile(publicKeyFile, publicKey.export({ type: "spki", format: "pem" }), { mode: 0o600 });
  await runRecovery({
    env: {
      PLATFORM_RECOVERY_PROJECT_URL: "https://abcdefghijklmnopqrst.supabase.co",
      PLATFORM_RECOVERY_PROJECT_REF: "abcdefghijklmnopqrst",
      PLATFORM_RECOVERY_EXECUTOR_REF: "synthetic-local-executor",
      PLATFORM_RECOVERY_APPROVAL_FILE: approvalFile,
      PLATFORM_RECOVERY_APPROVER_PUBLIC_KEY_FILE: publicKeyFile,
      PLATFORM_RECOVERY_EVIDENCE_FILE: evidenceFile,
      PLATFORM_RECOVERY_CONFIRMATION: `DELETE_TOTP_FACTOR:${request.correlation_id}`,
    },
    adminMfa: admin.auth.admin.mfa,
  });
  const evidenceLines = (await readFile(evidenceFile, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(evidenceLines.map((entry) => entry.event), ["RECOVERY_AUTHORIZED", "TOTP_FACTOR_REMOVED"]);
  assert.equal(evidenceLines.some((entry) => "target_user_id" in entry || "factor_id" in entry), false);
  const factorsAfterDelete = await admin.auth.admin.mfa.listFactors({ userId });
  assert.ifError(factorsAfterDelete.error);
  assert.equal(factorsAfterDelete.data.factors.some((factor) => factor.id === enrollment.data.id), false);

  const staleSessionClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${staleAal2Token}` } },
  });
  const revokedSessionRpc = await staleSessionClient.rpc("get_platform_restaurants");
  assert.ok(revokedSessionRpc.error, "A revoked session's unexpired AAL2 token must fail immediately");

  console.log("LOCAL_REAL_TOTP_ENROLLMENT_CHALLENGE_PASS");
  console.log("LOCAL_AAL1_DIRECT_RPC_BLOCKED_PASS");
  console.log("LOCAL_AAL2_REFRESH_AND_SERVER_ACCESS_PASS");
  console.log("LOCAL_ADMIN_FACTOR_DELETE_PATH_PASS");
  console.log("LOCAL_REVOKED_SESSION_STALE_AAL2_RPC_BLOCKED_PASS");
} finally {
  await admin.from("platform_admins").delete().eq("user_id", userId);
  await admin.auth.admin.deleteUser(userId);
  await rm(recoveryDirectory, { recursive: true, force: true });
}
