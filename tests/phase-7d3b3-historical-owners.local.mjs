import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const runtime = "/private/tmp/wuxuai-7d3b-runtime.R81Aj8";
const cli = "/private/tmp/wuxuai-7d2.1uZAeh/repo/node_modules/.bin/supabase";
const status = JSON.parse(execFileSync(cli, ["status", "--output", "json"], {
  cwd: runtime,
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56221");
const sql = (input) => execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
{ input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "162");
sql("create table public.d3b3_historical_fixture(label text primary key, owner_id uuid not null, restaurant_id uuid not null, branch_id uuid not null, organization_id uuid not null)");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
for (const label of ["A", "B"]) {
  const password = randomUUID() + randomUUID();
  const email = `d3b3-owner-${label}-${randomUUID()}@example.invalid`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null, `OWNER_${label}_AUTH_CREATE_FAILED`);
  const login = await publicClient.auth.signInWithPassword({ email, password });
  assert.equal(login.error, null, `OWNER_${label}_LOGIN_FAILED`);
  const owner = createClient(status.API_URL, status.ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${login.data.session.access_token}` } } });
  const trial = await owner.rpc("start_restaurant_owner_trial", {
    input_owner_name: `D3B3 Synthetic Owner ${label}`,
    input_restaurant_name: `D3B3 Synthetic Restaurant ${label}`,
    input_phone: null,
    input_country: "AT",
  });
  assert.equal(trial.error, null, `OWNER_${label}_HISTORICAL_TRIAL_FAILED:${trial.error?.code ?? ""}`);
  const restaurant = trial.data.restaurant;
  for (const field of [restaurant.id, restaurant.branch_id, restaurant.organization_id]) {
    assert.match(field, /^[0-9a-f-]{36}$/);
  }
  sql(`insert into public.d3b3_historical_fixture(label,owner_id,restaurant_id,branch_id,organization_id)
    values ('${label}','${created.data.user.id}','${restaurant.id}','${restaurant.branch_id}','${restaurant.organization_id}')`);
}
assert.equal(sql("select count(*) from public.d3b3_historical_fixture"), "2");
console.log("D3B3_TWO_HISTORICAL_OWNERS_VIA_AUTH_AND_TRIAL_RPC_PASS");
