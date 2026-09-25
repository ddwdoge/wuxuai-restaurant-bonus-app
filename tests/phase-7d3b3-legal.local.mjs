import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const cli = "/private/tmp/wuxuai-7d2.1uZAeh/repo/node_modules/.bin/supabase";
const runtime = "/private/tmp/wuxuai-7d3b-runtime.R81Aj8";
const status = JSON.parse(execFileSync(cli, ["status", "--output", "json"], {
  cwd: runtime, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56221");
const sql = (query) => execFileSync("docker", ["exec", "-i", "supabase_db_wuxuai-phase7d3b-isolated",
  "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"],
{ input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "171");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(status.API_URL, status.ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
for (const row of sql("select label,owner_id,restaurant_id from public.d3b3_historical_fixture order by label").split("\n")) {
  const [label, ownerId, restaurantId] = row.split("|");
  const password = randomUUID() + randomUUID();
  const email = sql(`select email from auth.users where id='${ownerId}'`);
  const updated = await admin.auth.admin.updateUserById(ownerId, { password });
  assert.equal(updated.error, null);
  const logged = await anon.auth.signInWithPassword({ email, password });
  assert.equal(logged.error, null);
  const owner = createClient(status.API_URL, status.ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${logged.data.session.access_token}` } } });
  const generated = await owner.rpc("generate_restaurant_legal_package", {
    input_restaurant_id: restaurantId,
    input_profile: { company_name: `D3B3 Synthetic ${label}`, legal_form: "GmbH",
      street: "Testgasse 1", postal_code: "1010", city: "Wien", country: "AT",
      email: `d3b3-legal-${label}@example.invalid` },
    input_reacceptance_required: false,
  });
  assert.equal(generated.error, null, `LEGAL_GENERATE_${label}:${generated.error?.code ?? ""}`);
  const published = await owner.rpc("publish_restaurant_legal_drafts", {
    input_restaurant_id: restaurantId, input_effective_date: new Date().toISOString().slice(0, 10),
    input_reacceptance_required: false, input_confirmed: true, input_request_id: randomUUID(),
  });
  assert.equal(published.error, null, `LEGAL_PUBLISH_${label}:${published.error?.code ?? ""}`);
}
console.log("D3B3_HISTORICAL_A_B_LEGAL_PUBLISHED_VIA_OWNER_RPC_PASS");
