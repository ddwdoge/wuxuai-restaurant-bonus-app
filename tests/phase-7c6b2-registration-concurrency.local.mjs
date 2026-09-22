import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const exec = promisify(execFile);
const container = "supabase_db_wuxuai-phase7b4d-local";
async function sql(statement) {
  const { stdout } = await exec("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { maxBuffer: 1024 * 1024 });
  return stdout.trim();
}
// Local synthetic fixtures only. Cleared by the task-owned full replay/stack cleanup.
const actor = randomUUID();
await sql(`insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('${actor}','authenticated','authenticated','parallel-${actor}@example.invalid',now(),'{}','{}',now(),now());`);
const call = `begin; set local role authenticated; select set_config('request.jwt.claim.sub','${actor}',true);
select public.start_restaurant_owner_trial('Synthetic Parallel','Synthetic Pending Parallel',null,'AT')->'restaurant'->>'id'; commit;`;
const results = await Promise.all(Array.from({ length: 24 }, () => sql(call)));
const ids = results.map(result => result.split("\n").filter(line => /^[a-f0-9-]{36}$/.test(line)).at(-1));
assert.equal(new Set(ids).size, 1);
const tenant = ids[0];
assert.ok(tenant && tenant !== actor);
const counts = await sql(`select concat_ws('|',
 (select count(*) from public.restaurants where owner_id='${actor}'),
 (select count(*) from public.organizations where owner_id='${actor}'),
 (select count(*) from public.branches where restaurant_id='${tenant}'),
 (select count(*) from public.restaurant_members where restaurant_id='${tenant}' and role='owner'),
 (select count(*) from public.branch_subscriptions s join public.branches b on b.id=s.branch_id where b.restaurant_id='${tenant}' and s.subscription_status='pending_activation'),
 (select count(*) from public.pending_registration_audit where restaurant_ref='${tenant}'),
 (select count(*) from public.audit_log where restaurant_id='${tenant}' and action='owner_trial_started'));`);
assert.equal(counts,"1|1|1|1|1|1|0");
const deniedActivations = Array.from({ length: 24 }, () => sql(`begin; set local role service_role;
do $$ begin begin update public.restaurants set operational_ready=true,status='active' where id='${tenant}';
exception when insufficient_privilege then return; end; raise exception 'activation bypass'; end $$; rollback;`));
const setupSaves = Array.from({ length: 24 }, () => sql(`begin; set local role authenticated;
select set_config('request.jwt.claim.sub','${actor}',true);
select public.complete_restaurant_onboarding('${tenant}',
'{"company_name":"Synthetic Local","legal_form":"Einzelunternehmen","street":"Testweg 1","postal_code":"1010","city":"Wien","country":"AT","email":"local@example.invalid","responsible_person":"Synthetic Owner","complaint_contact":"local@example.invalid"}',
'{"name":"Synthetic Pending Parallel"}',false,null)->>'activation_status'; commit;`));
const completedSetups = await Promise.all(setupSaves);
await Promise.all(deniedActivations);
assert.ok(completedSetups.every(result=>result.includes("PENDING_ACTIVATION")));
assert.equal(await sql(`select status||'|'||activation_status from public.restaurants where id='${tenant}'`),"draft|pending_activation");
console.log("PARALLEL_REGISTRATION_24: PASS; ONE_TENANT_BRANCH_MEMBER_SUBSCRIPTION_AUDIT: PASS; PARALLEL_ACTIVATION_24: BLOCKED");
console.log("PARALLEL_SETUP_24_WITH_COMPETING_ACTIVATION_24: PASS");
