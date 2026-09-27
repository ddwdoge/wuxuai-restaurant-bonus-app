import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { generateKeyPairSync, sign } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  canonicalApprovalPayload,
  RecoveryRunnerError,
  runRecovery,
} from "../scripts/platform-admin-totp-recovery-runner.mjs";

const NOW = Date.parse("2026-09-27T10:05:00.000Z");
const PROJECT_REF = "bwhvfjuwixgwduoeqaya";
const USER_ID = "10000000-0000-4000-8000-000000000173";
const FACTOR_ID = "30000000-0000-4000-8000-000000001731";
const CORRELATION_ID = "40000000-0000-4000-8000-000000001731";

function unsignedRequest(overrides = {}) {
  return {
    version: 1,
    action: "DELETE_TOTP_FACTOR",
    project_ref: PROJECT_REF,
    correlation_id: CORRELATION_ID,
    request_id: "50000000-0000-4000-8000-000000001731",
    target_user_id: USER_ID,
    factor_id: FACTOR_ID,
    factor_type: "totp",
    requestor_ref: "founder-requestor",
    approver_ref: "independent-approver",
    executor_ref: "recovery-executor",
    identity_checks: ["REGISTERED_RECOVERY_CONTACT", "SECOND_MFA_PROTECTED_PROVIDER"],
    reason_code: "LOST_DEVICE",
    approved_at: "2026-09-27T10:00:00.000Z",
    expires_at: "2026-09-27T10:10:00.000Z",
    migration_173_sha256: "fe76bbbc8b24fc069231bb0f56d4351e801d40216c6625df9d4655d0162913ce",
    ...overrides,
  };
}

async function fixture(overrides = {}, factorOverrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "wuxuai-recovery-runner-"));
  await chmod(directory, 0o700);
  const approvalFile = join(directory, "approval.json");
  const publicKeyFile = join(directory, "approver.pem");
  const evidenceFile = join(directory, "evidence.json");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const request = unsignedRequest(overrides);
  request.signature = sign(null, Buffer.from(canonicalApprovalPayload(request)), privateKey).toString("base64");
  await writeFile(approvalFile, `${JSON.stringify(request)}\n`, { mode: 0o600 });
  await writeFile(publicKeyFile, publicKey.export({ type: "spki", format: "pem" }), { mode: 0o600 });
  const calls = { list: 0, remove: 0 };
  const adminMfa = {
    async listFactors() {
      calls.list += 1;
      return {
        data: {
          factors: [{ id: FACTOR_ID, factor_type: "totp", status: "verified", ...factorOverrides }],
        },
        error: null,
      };
    },
    async deleteFactor() {
      calls.remove += 1;
      return { data: {}, error: null };
    },
  };
  const env = {
    PLATFORM_RECOVERY_PROJECT_URL: `https://${PROJECT_REF}.supabase.co`,
    PLATFORM_RECOVERY_PROJECT_REF: PROJECT_REF,
    PLATFORM_RECOVERY_EXECUTOR_REF: "recovery-executor",
    PLATFORM_RECOVERY_APPROVAL_FILE: approvalFile,
    PLATFORM_RECOVERY_APPROVER_PUBLIC_KEY_FILE: publicKeyFile,
    PLATFORM_RECOVERY_EVIDENCE_FILE: evidenceFile,
    PLATFORM_RECOVERY_CONFIRMATION: `DELETE_TOTP_FACTOR:${CORRELATION_ID}`,
  };
  return { directory, approvalFile, evidenceFile, request, env, adminMfa, calls };
}

async function expectBlocked(setup, expectedCode) {
  await assert.rejects(
    runRecovery({ env: setup.env, adminMfa: setup.adminMfa, nowMs: NOW }),
    (error) => error instanceof RecoveryRunnerError && error.code === expectedCode,
  );
  assert.equal(setup.calls.remove, 0);
}

test("valid signed two-person approval removes exactly one synthetic verified TOTP factor", async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.directory, { recursive: true, force: true }));
  const evidence = await runRecovery({ env: setup.env, adminMfa: setup.adminMfa, nowMs: NOW });
  assert.equal(setup.calls.list, 1);
  assert.equal(setup.calls.remove, 1);
  assert.equal(evidence.result, "TOTP_FACTOR_REMOVED");
  assert.equal(evidence.target_user_id, undefined);
  assert.equal(evidence.factor_id, undefined);
  const persisted = (await readFile(setup.evidenceFile, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(persisted.map((entry) => entry.event), ["RECOVERY_AUTHORIZED", "TOTP_FACTOR_REMOVED"]);
  assert.equal(persisted[0].target_fingerprint.length, 64);
  assert.equal(persisted[1].factor_fingerprint.length, 64);
  assert.equal(persisted.some((entry) => "target_user_id" in entry || "factor_id" in entry), false);
});

test("tampered approval fails before Auth Admin factor access", async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.directory, { recursive: true, force: true }));
  const tampered = { ...setup.request, factor_id: "30000000-0000-4000-8000-000000001799" };
  await writeFile(setup.approvalFile, `${JSON.stringify(tampered)}\n`, { mode: 0o600 });
  await expectBlocked(setup, "APPROVAL_SIGNATURE_INVALID");
  assert.equal(setup.calls.list, 0);
});

for (const [name, overrides, envOverride, code] of [
  ["requestor cannot approve", { approver_ref: "founder-requestor" }, {}, "APPROVAL_SEPARATION_INVALID"],
  ["requestor cannot execute", { executor_ref: "founder-requestor" }, { PLATFORM_RECOVERY_EXECUTOR_REF: "founder-requestor" }, "APPROVAL_SEPARATION_INVALID"],
  ["two independent identity checks are mandatory", { identity_checks: ["REGISTERED_RECOVERY_CONTACT"] }, {}, "APPROVAL_IDENTITY_CHECKS_INVALID"],
  ["approval expires closed", { expires_at: "2026-09-27T10:04:59.000Z" }, {}, "APPROVAL_EXPIRED"],
  ["project mismatch is blocked", { project_ref: "zzzzzzzzzzzzzzzzzzzz" }, {}, "APPROVAL_PROJECT_MISMATCH"],
  ["migration hash mismatch is blocked", { migration_173_sha256: "0".repeat(64) }, {}, "APPROVAL_MIGRATION_MISMATCH"],
  ["executor mismatch is blocked", {}, { PLATFORM_RECOVERY_EXECUTOR_REF: "different-executor" }, "APPROVAL_EXECUTOR_MISMATCH"],
]) {
  test(name, async (t) => {
    const setup = await fixture(overrides);
    Object.assign(setup.env, envOverride);
    t.after(() => rm(setup.directory, { recursive: true, force: true }));
    await expectBlocked(setup, code);
    assert.equal(setup.calls.list, 0);
  });
}

test("non-TOTP or non-verified factors are never removed", async (t) => {
  const setup = await fixture({}, { factor_type: "phone", status: "unverified" });
  t.after(() => rm(setup.directory, { recursive: true, force: true }));
  await expectBlocked(setup, "AUTH_ADMIN_FACTOR_NOT_ELIGIBLE");
  assert.equal(setup.calls.list, 1);
});

test("an existing evidence file blocks execution before factor access", async (t) => {
  const setup = await fixture();
  t.after(() => rm(setup.directory, { recursive: true, force: true }));
  await writeFile(setup.evidenceFile, "existing", { mode: 0o600 });
  await expectBlocked(setup, "RECOVERY_EVIDENCE_ALREADY_EXISTS");
  assert.equal(setup.calls.list, 0);
  assert.equal(setup.calls.remove, 0);
});
