// Local-only synthetic concurrency proof for the KYB upload reservation.
// The caller resets the task-owned database after this test.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

const container = "supabase_db_wuxuai-phase7b4d-local";
const ids = Object.fromEntries([
  "owner", "organization", "restaurant", "branch", "verificationCase",
].map((key) => [key, randomUUID()]));
const requestId = randomUUID();
const correlationId = randomUUID();

function run(sql) {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-X", "-qAt",
      "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr }));
    child.stdin.end(sql);
  });
}

const setup = `begin;
set local session_replication_role=replica;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('${ids.owner}','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'kyb-parallel-${ids.owner}@example.invalid','',now(),'{}','{}',now(),now());
insert into public.organizations(id,owner_id,name)
values ('${ids.organization}','${ids.owner}','KYB PARALLEL LOCAL');
insert into public.restaurants(id,owner_id,name,slug,organization_id,activation_status)
values ('${ids.restaurant}','${ids.owner}','KYB PARALLEL LOCAL','kyb-${ids.restaurant.slice(0, 8)}',
  '${ids.organization}','pending_activation');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city)
values ('${ids.branch}','${ids.organization}','${ids.restaurant}','KYB PARALLEL LOCAL',
  'kyb-${ids.branch.slice(0, 8)}','AT','Synthetic Road 1','1000','Synthetic City');
update public.restaurants set primary_branch_id='${ids.branch}' where id='${ids.restaurant}';
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
values ('${ids.restaurant}','${ids.organization}','${ids.branch}','${ids.owner}','owner');
insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,
  selected_plan,plan_key,payment_status)
values ('${ids.organization}','${ids.branch}','pending_activation','pending_activation',
  'BASIC','BASIC','not_required');
insert into public.business_verification_cases(id,restaurant_id,country_code,verification_method,status,created_by)
values ('${ids.verificationCase}','${ids.restaurant}','AT','MANUAL','PENDING_ACTIVATION','${ids.owner}');
commit;`;
const setupResult = await run(setup);
assert.equal(setupResult.code, 0, `synthetic KYB fixture failed: ${setupResult.stderr
  .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[synthetic-id]")
  .replaceAll(/[^\s]+@example\.invalid/g, "[synthetic-email]")}`);

const reservation = `begin;
do $claims$ begin
  perform set_config('request.jwt.claim.sub','${ids.owner}',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub','${ids.owner}','role','authenticated')::text,true);
end $claims$;
set local role authenticated;
select public.reserve_business_verification_document_upload(
  '${ids.restaurant}','GISA_EXTRACT','application/pdf','${requestId}','${correlationId}'
)::text;
commit;`;

const results = await Promise.all(Array.from({ length: 24 }, () => run(reservation)));
assert.equal(results.filter(({ code }) => code === 0).length, 24, "parallel reservation failed");
const answers = results.map(({ stdout }) => JSON.parse(
  stdout.split("\n").find((line) => line.startsWith("{")),
));
assert.equal(answers.filter(({ idempotent }) => idempotent === false).length, 1);
assert.equal(answers.filter(({ idempotent }) => idempotent === true).length, 23);
assert.equal(new Set(answers.map(({ document_id: documentId }) => documentId)).size, 1);

const final = await run(`select
  (select count(*) from public.business_verification_documents
    where restaurant_id='${ids.restaurant}'),
  (select count(*) from public.business_verification_document_events
    where restaurant_id='${ids.restaurant}' and event_type='UPLOAD_RESERVED'),
  (select activation_status from public.restaurants where id='${ids.restaurant}'),
  (select subscription_status from public.branch_subscriptions where branch_id='${ids.branch}');`);
assert.equal(final.code, 0);
assert.equal(final.stdout, "1|1|pending_activation|pending_activation");

console.log("KYB PARALLEL RESERVATION: 24/24 PASS; one document and one audit event");
