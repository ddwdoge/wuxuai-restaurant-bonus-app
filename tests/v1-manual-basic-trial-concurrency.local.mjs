import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const databaseUrl = process.env.WUXUAI_MANUAL_TRIAL_LOCAL_DB;
assert.ok(databaseUrl, "WUXUAI_MANUAL_TRIAL_LOCAL_DB is required");
const psql = "/opt/homebrew/opt/postgresql@17/bin/psql";

function syntheticUuid(label) {
  const hash = createHash("md5").update(label).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function query(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(psql, [databaseUrl, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(sql);
  });
}

const source = await readFile(new URL("./v1-manual-basic-trial.local.sql", import.meta.url), "utf8");
const setup = source.slice(0, source.indexOf("-- AAL1 remains blocked.")) + `
set local session_replication_role=origin;
update public.country_kyb_intake_policies set real_intake_status='READY',legal_status='VERIFIED',
  privacy_status='VERIFIED',document_catalog_status='VERIFIED',retention_status='VERIFIED'
where country_code='AT';
update public.country_launch_readiness set status='ready',evidence_ref='LOCAL_SYNTHETIC_TRIAL',
  document_version_refs=case when check_key='required_documents'
    then array['LOCAL_SYNTHETIC_DOCUMENT'] else '{}' end
where country_code='AT' and check_key in
  ('legal','privacy','tax','translation','technical_smoke','required_documents');
insert into public.country_basic_pilot_policy_versions(
  country_code,revision,state,evidence_reference,valid_from,revision_reason
) values ('AT',2,'APPROVED','LOCAL_SYNTHETIC_COUNSEL_DECISION',now(),
  'Synthetic local approval for the concurrency security test');
update public.country_launch_policy set enabled=true,market_status='prepared',activated_at=null
where country_code='AT';
commit;`;
await query(setup);

const actor = syntheticUuid("trial-admin");
const session = syntheticUuid("trial-session");
const restaurant = syntheticUuid("trial-one-restaurant");
const request = syntheticUuid("trial-parallel-request");
const correlation = syntheticUuid("trial-parallel-correlation");
const claims = `jsonb_build_object('sub','${actor}','role','authenticated','aal','aal2',
  'session_id','${session}','amr',jsonb_build_array(jsonb_build_object(
    'method','totp','timestamp',extract(epoch from clock_timestamp())::bigint)))::text`;
const call = `begin;
  select set_config('request.jwt.claims',${claims},true);
  set local role authenticated;
  select public.activate_v1_manual_basic_trial('${restaurant}',1::smallint,
    'Synthetic parallel trial decision','BASIC-TRIAL SYNTHETIC trial-one 1 MONATE AKTIVIEREN',
    '${request}','${correlation}')->>'idempotent';
  commit;`;

const results = (await Promise.all(Array.from({ length: 24 }, () => query(call))))
  .map((value) => value.split("\n").at(-1));
assert.equal(results.filter((value) => value === "false").length, 1);
assert.equal(results.filter((value) => value === "true").length, 23);
assert.equal(await query(`select count(*) from public.manual_basic_trial_decisions
  where restaurant_id='${restaurant}';`), "1");
assert.equal(await query(`select count(*) from public.billing_trial_claims
  where restaurant_id='${restaurant}';`), "1");
assert.equal(await query(`select count(*) from public.branch_subscriptions s
  join public.branches b on b.id=s.branch_id where b.restaurant_id='${restaurant}'
    and s.subscription_status='trialing' and s.payment_status='not_required'
    and s.stripe_customer_id is null and s.stripe_subscription_id is null;`), "1");

console.log("LOCAL_V1_MANUAL_BASIC_TRIAL_24_WAY_PASS");
