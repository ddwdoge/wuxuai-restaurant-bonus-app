import assert from "node:assert/strict";
import test from "node:test";
import { validateLocalSupabaseTestTarget } from "./helpers/local-supabase-test-guard.mjs";

const configText = `project_id = "wuxuai-phase7b4d-local"
[db]
port = 56122
`;
const status = { DB_URL: "postgresql://postgres:local-only@127.0.0.1:56122/postgres" };
const valid = {
  allowFlag: "1",
  configText,
  connectionUrl: "postgresql://postgres:local-only@127.0.0.1:56122/wuxuai_7b4c_guard",
  status,
};

test("local Supabase guard accepts only the configured Phase 7B.4D target", () => {
  const result = validateLocalSupabaseTestTarget(valid);
  assert.equal(result.host, "127.0.0.1");
  assert.equal(result.port, "56122");
  assert.equal(result.database, "wuxuai_7b4c_guard");
});
test("local Supabase guard requires explicit opt-in and a non-empty URL", () => {
  assert.throws(() => validateLocalSupabaseTestTarget({ ...valid, allowFlag: undefined }), /ALLOW_LOCAL_SUPABASE_TESTS=1/);
  assert.throws(() => validateLocalSupabaseTestTarget({ ...valid, connectionUrl: "" }), /database URL is required/);
});

test("local Supabase guard rejects remote, staging and production hosts", () => {
  for (const host of ["db.example.com", "staging-db.example.com", "production-db.example.com"]) {
    assert.throws(
      () => validateLocalSupabaseTestTarget({ ...valid, connectionUrl: `postgresql://postgres:hidden@${host}:56122/wuxuai_7b4c_guard` }),
      /host must be loopback/,
    );
  }
});

test("local Supabase guard rejects wrong ports, projects, protocols and databases", () => {
  assert.throws(() => validateLocalSupabaseTestTarget({ ...valid, connectionUrl: "postgresql://postgres:hidden@127.0.0.1:56123/wuxuai_7b4c_guard" }), /port does not match/);
  assert.throws(() => validateLocalSupabaseTestTarget({ ...valid, configText: configText.replace("wuxuai-phase7b4d-local", "other-project") }), /unexpected local Supabase project_id/);
  assert.throws(() => validateLocalSupabaseTestTarget({ ...valid, connectionUrl: "https://127.0.0.1:56122/wuxuai_7b4c_guard" }), /protocol must be postgres/);
  assert.throws(() => validateLocalSupabaseTestTarget({ ...valid, connectionUrl: "postgresql://postgres:hidden@127.0.0.1:56122/customer_data" }), /database name is outside/);
});

test("local Supabase guard rejects a mismatched or reserved active runtime", () => {
  assert.throws(() => validateLocalSupabaseTestTarget({ ...valid, status: { DB_URL: "postgresql://postgres:hidden@127.0.0.1:56123/postgres" } }), /active Supabase DB port/);
  assert.throws(() => validateLocalSupabaseTestTarget({ ...valid, configText: configText.replace("56122", "55439") }), /reserved port 55439/);
});
