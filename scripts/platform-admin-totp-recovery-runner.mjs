import { Buffer } from "node:buffer";
import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { pathToFileURL, URL } from "node:url";

const EXPECTED_ACTION = "DELETE_TOTP_FACTOR";
const EXPECTED_MIGRATION_SHA256 = "fe76bbbc8b24fc069231bb0f56d4351e801d40216c6625df9d4655d0162913ce";
const MAX_APPROVAL_WINDOW_MS = 15 * 60 * 1_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{2,127}$/;
const PROJECT_REF_PATTERN = /^[a-z]{20}$/;
const IDENTITY_CHECKS = new Set([
  "REGISTERED_RECOVERY_CONTACT",
  "SECOND_MFA_PROTECTED_PROVIDER",
  "CORPORATE_AUTHORITY_RECORD",
]);

export class RecoveryRunnerError extends Error {
  constructor(code) {
    super(code);
    this.name = "RecoveryRunnerError";
    this.code = code;
  }
}

function fail(code) {
  throw new RecoveryRunnerError(code);
}

function assertRestrictedMode(mode, code) {
  if ((mode & 0o077) !== 0) fail(code);
}

async function assertEvidencePathUnused(io, path) {
  try {
    await io.stat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    fail("RECOVERY_EVIDENCE_PATH_INVALID");
  }
  fail("RECOVERY_EVIDENCE_ALREADY_EXISTS");
}

function parseIso(value, code) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
}

export function canonicalApprovalPayload(request) {
  const payload = {
    version: request.version,
    action: request.action,
    project_ref: request.project_ref,
    correlation_id: request.correlation_id,
    request_id: request.request_id,
    target_user_id: request.target_user_id,
    factor_id: request.factor_id,
    factor_type: request.factor_type,
    requestor_ref: request.requestor_ref,
    approver_ref: request.approver_ref,
    executor_ref: request.executor_ref,
    identity_checks: [...request.identity_checks].sort(),
    reason_code: request.reason_code,
    approved_at: request.approved_at,
    expires_at: request.expires_at,
    migration_173_sha256: request.migration_173_sha256,
  };
  return JSON.stringify(payload);
}

export function validateApprovalRequest(request, context) {
  if (!request || typeof request !== "object" || Array.isArray(request)) fail("APPROVAL_INVALID");
  if (request.version !== 1 || request.action !== EXPECTED_ACTION) fail("APPROVAL_ACTION_INVALID");
  if (!PROJECT_REF_PATTERN.test(request.project_ref ?? "")) fail("APPROVAL_PROJECT_INVALID");
  if (request.project_ref !== context.expectedProjectRef) fail("APPROVAL_PROJECT_MISMATCH");
  if (!UUID_PATTERN.test(request.correlation_id ?? "") || !UUID_PATTERN.test(request.request_id ?? "")) {
    fail("APPROVAL_REQUEST_ID_INVALID");
  }
  if (!UUID_PATTERN.test(request.target_user_id ?? "") || !UUID_PATTERN.test(request.factor_id ?? "")) {
    fail("APPROVAL_TARGET_INVALID");
  }
  if (request.factor_type !== "totp") fail("APPROVAL_FACTOR_TYPE_INVALID");
  for (const ref of [request.requestor_ref, request.approver_ref, request.executor_ref]) {
    if (!SAFE_REF_PATTERN.test(ref ?? "")) fail("APPROVAL_ACTOR_REF_INVALID");
  }
  if (request.requestor_ref === request.approver_ref || request.requestor_ref === request.executor_ref) {
    fail("APPROVAL_SEPARATION_INVALID");
  }
  if (request.executor_ref !== context.executorRef) fail("APPROVAL_EXECUTOR_MISMATCH");
  if (!Array.isArray(request.identity_checks)) fail("APPROVAL_IDENTITY_CHECKS_INVALID");
  const identityChecks = new Set(request.identity_checks);
  if (identityChecks.size < 2 || [...identityChecks].some((entry) => !IDENTITY_CHECKS.has(entry))) {
    fail("APPROVAL_IDENTITY_CHECKS_INVALID");
  }
  if (!new Set(["LOST_DEVICE", "DEVICE_REPLACED", "FACTOR_UNAVAILABLE", "SECURITY_INCIDENT"]).has(request.reason_code)) {
    fail("APPROVAL_REASON_INVALID");
  }
  if (request.migration_173_sha256 !== EXPECTED_MIGRATION_SHA256) fail("APPROVAL_MIGRATION_MISMATCH");

  const approvedAt = parseIso(request.approved_at, "APPROVAL_TIME_INVALID");
  const expiresAt = parseIso(request.expires_at, "APPROVAL_TIME_INVALID");
  if (expiresAt <= approvedAt || expiresAt - approvedAt > MAX_APPROVAL_WINDOW_MS) fail("APPROVAL_WINDOW_INVALID");
  if (context.nowMs < approvedAt || context.nowMs >= expiresAt) fail("APPROVAL_EXPIRED");
  if (typeof request.signature !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(request.signature)) {
    fail("APPROVAL_SIGNATURE_INVALID");
  }
  return request;
}

export function verifyApproval(request, publicKeyPem) {
  let key;
  let signature;
  try {
    key = createPublicKey(publicKeyPem);
    signature = Buffer.from(request.signature, "base64");
  } catch {
    fail("APPROVAL_SIGNATURE_INVALID");
  }
  if (key.asymmetricKeyType !== "ed25519") fail("APPROVAL_KEY_TYPE_INVALID");
  const valid = verifySignature(null, Buffer.from(canonicalApprovalPayload(request)), key, signature);
  if (!valid) fail("APPROVAL_SIGNATURE_INVALID");
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeFactorList(data) {
  if (!data || !Array.isArray(data.factors)) fail("AUTH_ADMIN_FACTOR_RESPONSE_INVALID");
  return data.factors;
}

export async function runRecovery({
  env,
  adminMfa,
  nowMs = Date.now(),
  io = { appendFile, readFile, stat, writeFile },
}) {
  const required = [
    "PLATFORM_RECOVERY_PROJECT_URL",
    "PLATFORM_RECOVERY_PROJECT_REF",
    "PLATFORM_RECOVERY_EXECUTOR_REF",
    "PLATFORM_RECOVERY_APPROVAL_FILE",
    "PLATFORM_RECOVERY_APPROVER_PUBLIC_KEY_FILE",
    "PLATFORM_RECOVERY_EVIDENCE_FILE",
    "PLATFORM_RECOVERY_CONFIRMATION",
  ];
  if (required.some((name) => typeof env[name] !== "string" || env[name].length === 0)) {
    fail("RECOVERY_CONFIGURATION_INCOMPLETE");
  }

  let projectUrl;
  try {
    projectUrl = new URL(env.PLATFORM_RECOVERY_PROJECT_URL);
  } catch {
    fail("RECOVERY_PROJECT_URL_INVALID");
  }
  if (projectUrl.protocol !== "https:" || projectUrl.hostname !== `${env.PLATFORM_RECOVERY_PROJECT_REF}.supabase.co`) {
    fail("RECOVERY_PROJECT_URL_MISMATCH");
  }

  const approvalStat = await io.stat(env.PLATFORM_RECOVERY_APPROVAL_FILE);
  const keyStat = await io.stat(env.PLATFORM_RECOVERY_APPROVER_PUBLIC_KEY_FILE);
  const evidenceDirStat = await io.stat(dirname(env.PLATFORM_RECOVERY_EVIDENCE_FILE));
  if (!approvalStat.isFile() || !keyStat.isFile() || !evidenceDirStat.isDirectory()) {
    fail("RECOVERY_FILE_TYPE_INVALID");
  }
  assertRestrictedMode(approvalStat.mode, "RECOVERY_APPROVAL_FILE_PERMISSIONS");
  assertRestrictedMode(keyStat.mode, "RECOVERY_KEY_FILE_PERMISSIONS");
  assertRestrictedMode(evidenceDirStat.mode, "RECOVERY_EVIDENCE_DIR_PERMISSIONS");
  await assertEvidencePathUnused(io, env.PLATFORM_RECOVERY_EVIDENCE_FILE);

  let request;
  try {
    request = JSON.parse(await io.readFile(env.PLATFORM_RECOVERY_APPROVAL_FILE, "utf8"));
  } catch {
    fail("APPROVAL_INVALID");
  }
  validateApprovalRequest(request, {
    expectedProjectRef: env.PLATFORM_RECOVERY_PROJECT_REF,
    executorRef: env.PLATFORM_RECOVERY_EXECUTOR_REF,
    nowMs,
  });
  verifyApproval(request, await io.readFile(env.PLATFORM_RECOVERY_APPROVER_PUBLIC_KEY_FILE, "utf8"));

  const expectedConfirmation = `DELETE_TOTP_FACTOR:${request.correlation_id}`;
  if (env.PLATFORM_RECOVERY_CONFIRMATION !== expectedConfirmation) fail("RECOVERY_CONFIRMATION_MISMATCH");

  const evidenceBase = {
    schema_version: 1,
    project_ref: request.project_ref,
    correlation_id: request.correlation_id,
    request_id: request.request_id,
    requestor_ref: request.requestor_ref,
    approver_ref: request.approver_ref,
    executor_ref: request.executor_ref,
    identity_checks: [...new Set(request.identity_checks)].sort(),
    target_fingerprint: fingerprint(request.target_user_id),
    factor_fingerprint: fingerprint(request.factor_id),
    approval_fingerprint: fingerprint(canonicalApprovalPayload(request)),
  };
  const startedEvidence = {
    ...evidenceBase,
    event: "RECOVERY_AUTHORIZED",
    recorded_at: new Date(nowMs).toISOString(),
  };
  await io.writeFile(env.PLATFORM_RECOVERY_EVIDENCE_FILE, `${JSON.stringify(startedEvidence)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });

  const listed = await adminMfa.listFactors({ userId: request.target_user_id });
  if (listed.error) fail("AUTH_ADMIN_LIST_FACTORS_FAILED");
  const matching = normalizeFactorList(listed.data).filter((factor) => factor.id === request.factor_id);
  if (matching.length !== 1) fail("AUTH_ADMIN_FACTOR_NOT_UNIQUE");
  const factor = matching[0];
  if (factor.factor_type !== "totp" || factor.status !== "verified") fail("AUTH_ADMIN_FACTOR_NOT_ELIGIBLE");

  const removed = await adminMfa.deleteFactor({ userId: request.target_user_id, id: request.factor_id });
  if (removed.error) fail("AUTH_ADMIN_DELETE_FACTOR_FAILED");

  const evidence = {
    ...evidenceBase,
    event: "TOTP_FACTOR_REMOVED",
    result: "TOTP_FACTOR_REMOVED",
    recorded_at: new Date(nowMs).toISOString(),
    next_required_state: "NEW_TOTP_AAL2_AND_RECOVERY_CLOSURE",
  };
  await io.appendFile(env.PLATFORM_RECOVERY_EVIDENCE_FILE, `${JSON.stringify(evidence)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
  return evidence;
}

async function main() {
  const serviceKey = process.env.PLATFORM_RECOVERY_AUTH_ADMIN_KEY;
  if (!serviceKey) fail("RECOVERY_AUTH_ADMIN_KEY_MISSING");
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(process.env.PLATFORM_RECOVERY_PROJECT_URL, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  await runRecovery({ env: process.env, adminMfa: client.auth.admin.mfa });
  process.stdout.write("RECOVERY_RUNNER_PASS\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    const code = error instanceof RecoveryRunnerError ? error.code : "RECOVERY_RUNNER_FAILED";
    process.stderr.write(`${code}\n`);
    process.exitCode = 1;
  });
}
