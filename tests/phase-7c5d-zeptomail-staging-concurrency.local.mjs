import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";

const execFileAsync = promisify(execFile);
const databaseUrl = "postgresql://postgres:postgres@127.0.0.1:56122/postgres";
const requestId = randomUUID();
const correlationId = randomUUID();

function sql(statement) {
  return execFileAsync("/opt/homebrew/bin/psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atc", statement], {
    env: { ...process.env, PGPASSWORD: "postgres" },
    maxBuffer: 1024 * 1024,
  });
}

const enqueue = `select public.enqueue_capacity_warning_synthetic_email_test(
  '${requestId}'::uuid, '${correlationId}'::uuid, 'staging', true,
  'office@wuxuaisbi.com', 'notifications@wuxuaibonus.com', 'support@wuxuaibonus.com'
);`;

const enqueued = await Promise.all(Array.from({ length: 24 }, () => sql(enqueue)));
assert.equal(new Set(enqueued.map(({ stdout }) => stdout.trim())).size, 1, "24 enqueues must resolve to one row");

const reserve = `select count(*) from public.reserve_capacity_warning_synthetic_email_test(
  '${requestId}'::uuid, '${correlationId}'::uuid
);`;
const reserved = await Promise.all(Array.from({ length: 24 }, () => sql(reserve)));
assert.equal(reserved.filter(({ stdout }) => stdout.trim() === "1").length, 1, "exactly one reservation expected");
assert.equal(reserved.filter(({ stdout }) => stdout.trim() === "0").length, 23, "all duplicate reservations must be empty");

const { stdout: state } = await sql(`select status || ':' || attempt_count::text
  from public.capacity_warning_synthetic_email_tests
  where request_id = '${requestId}'::uuid and correlation_id = '${correlationId}'::uuid;`);
assert.equal(state.trim(), "PROCESSING:1");

console.log("phase-7c5d concurrency: PASS (24 enqueue, 24 reserve, exactly one lease)");
