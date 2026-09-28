import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const databaseUrl = process.env.WUXUAI_MANUAL_TRIAL_LOCAL_DB;
assert.ok(databaseUrl, "WUXUAI_MANUAL_TRIAL_LOCAL_DB is required");
const migration180 = await readFile(new URL(
  "../supabase/migrations/20260927004000_v1_manual_basic_trial_activation.sql",
  import.meta.url,
), "utf8");
const migration183 = await readFile(new URL(
  "../supabase/migrations/20260928002000_basic_paid_and_free_pilot_readiness.sql",
  import.meta.url,
), "utf8");

const preflight = String.raw`
\set ON_ERROR_STOP on
create function pg_temp.protected_fingerprint() returns text language plpgsql as $$
declare relation text; relation_hash text; combined text:=''; begin
  foreach relation in array array['restaurants','organizations','branches','restaurant_members',
    'branch_subscriptions','billing_trial_claims','country_launch_policy',
    'country_launch_readiness','country_kyb_intake_policies'] loop
    execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) order by to_jsonb(t)::text),'''')) from public.%I t',relation)
      into relation_hash;
    combined:=combined||relation||relation_hash;
  end loop;
  return md5(combined);
end $$;
create temporary table protected_before as select pg_temp.protected_fingerprint() fingerprint;
create temporary table decisions_before as
  select count(*)::bigint decision_count from public.manual_basic_trial_decisions;
`;
const check = String.raw`
do $$ begin
  if pg_temp.protected_fingerprint() is distinct from (select fingerprint from protected_before) then
    raise exception 'PROTECTED_DATA_CHANGED';
  end if;
  if (select count(*) from public.manual_basic_trial_decisions)
      <>(select decision_count from decisions_before) then
    raise exception 'TRIAL_DECISION_CREATED_BY_MIGRATION';
  end if;
end $$;
`;
const migration = migration180 + "\n" + migration183;
const input = preflight + migration + check + "select 'REPEAT_1_PASS';\n"
  + migration + check + "select 'REPEAT_2_PASS';\n";

const output = await new Promise((resolve, reject) => {
  const child = spawn("/opt/homebrew/opt/postgresql@17/bin/psql", [
    databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
  ], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (status) => status === 0 ? resolve(stdout) : reject(new Error(stderr)));
  child.stdin.end(input);
});

assert.match(output, /REPEAT_1_PASS/);
assert.match(output, /REPEAT_2_PASS/);
console.log("MIGRATIONS_180_183_REPEAT_1_2_PASS");
console.log("PROTECTED_DATA_FINGERPRINTS_UNCHANGED");
