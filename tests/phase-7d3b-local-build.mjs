import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";

// Builds only against the isolated local stack. Never prints or persists keys.
const runtime = "/private/tmp/wuxuai-7d3b-runtime.R81Aj8";
const cli = "/private/tmp/wuxuai-7d2.1uZAeh/repo/node_modules/.bin/supabase";
const nodeBin = "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin";
const status = JSON.parse(execFileSync(cli, ["status", "--output", "json"], {
  cwd: runtime, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56221");
assert.ok(status.ANON_KEY);
const result = spawnSync("npm", ["run", "build"], { cwd: process.cwd(), encoding: "utf8",
  env: { ...process.env, PATH: `${nodeBin}:${process.env.PATH ?? ""}`,
    VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY },
  stdio: ["ignore", "pipe", "pipe"] });
const safe = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.replaceAll(status.ANON_KEY, "[LOCAL_KEY_REDACTED]");
process.stdout.write(safe);
if (result.error) throw new Error("LOCAL_BUILD_PROCESS_FAILED", { cause: result.error });
process.exitCode = result.status ?? 1;
