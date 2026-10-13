// Opt-in only. Runs against the exact disposable database cloned from the local stack.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

assert.equal(process.env.ALLOW_LOCAL_TEST_ONLY_APP_MAIL, "1");
const container = "supabase_db_wuxuai-phase7b4d-local";
const database = "wuxuai_test_only_mail_code_lock";
const psqlArgs = [
  "exec", "-i", container, "psql", "-U", "postgres", "-d", database,
  "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
];
const migration = readFileSync(new URL(
  "../supabase/migrations/20261013140000_test_only_app_mail_single_recipient.sql",
  import.meta.url,
), "utf8");
const contentSha256 = "1663c63b2cf0edc11188a8fdf035e726704e10a1bfb33cce6703346cad0c30bb";
const eventType = "TEST_ONLY_APP_MAIL_SMOKE";

const sql = (input) => execFileSync("docker", psqlArgs, {
  input,
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
  maxBuffer: 16 * 1024 * 1024,
}).trim();
const asyncSql = (input) => new Promise((resolve, reject) => {
  const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let error = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { error += chunk; });
  child.once("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error.trim())));
  child.stdin.end(input);
});
const json = (input) => JSON.parse(sql(input).split("\n").filter(Boolean).at(-1));
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const denied = (input, expected) => assert.throws(
  () => sql(input),
  (error) => expected.test(String(error.stderr ?? error.message)),
);
const service = (statement) => `begin;
  set local role service_role;
  select set_config('request.jwt.claim.role','service_role',true);
  select set_config('request.jwt.claims','{"role":"service_role"}',true);
  ${statement};
  commit;`;

function resetContract() {
  sql(`drop function if exists public.get_test_only_app_mail_result(uuid);
    drop function if exists public.complete_test_only_app_mail_delivery(uuid,text,text,text);
    drop function if exists public.begin_test_only_app_mail_delivery(uuid);
    drop function if exists public.reserve_test_only_app_mail(uuid);
    drop function if exists public.enqueue_test_only_app_mail(uuid,uuid,integer,text);
    drop function if exists project_bootstrap.revoke_test_only_app_mail_recipient(uuid,uuid,text,text,text);
    drop function if exists project_bootstrap.configure_test_only_app_mail_recipient(
      uuid,uuid,uuid,uuid,uuid,text,timestamptz,uuid,text,text);
    drop schema if exists test_only_app_mail cascade;`);
  sql(migration);
  sql(`set session_replication_role=replica;
    update project_bootstrap.binding set database_name=current_database();
    set session_replication_role=origin;`);
  const binding = json("select public.get_server_project_binding();");
  assert.equal(binding.project_ref, "mbgveqbhessaunrhfudm");
  assert.equal(binding.auth_issuer, "https://mbgveqbhessaunrhfudm.supabase.co/auth/v1");
  assert.equal(binding.app_origin, "https://staging-v2.bonus.wuxuaisbi.com");
}

const fixture = () => json(`select jsonb_build_object(
  'restaurant',restaurant.id,'branch',branch.id,'account',account.id,
  'customer',customer.id,'auth_user',account.auth_user_id,'email',auth_user.email
) from public.restaurants restaurant
join public.branches branch on branch.restaurant_id=restaurant.id
  and branch.organization_id=restaurant.organization_id
join public.platform_test_tenant_registry marker on marker.restaurant_id=restaurant.id
  and marker.organization_id=restaurant.organization_id and marker.owner_user_id=restaurant.owner_id
  and marker.restaurant_name=restaurant.name and marker.deleted_at is null
join public.customers customer on customer.restaurant_id=restaurant.id
  and customer.branch_id=branch.id and customer.organization_id=restaurant.organization_id
  and customer.is_test_customer is true and customer.membership_status='active'
join public.customer_account_memberships membership on membership.restaurant_id=restaurant.id
  and membership.customer_id=customer.id
join public.customer_accounts account on account.id=membership.account_id
  and account.email_confirmed_at is not null and account.disabled_at is null
join auth.users auth_user on auth_user.id=account.auth_user_id
  and auth_user.email_confirmed_at is not null
join public.customer_account_emails account_email on account_email.account_id=account.id
  and account_email.status='CONFIRMED' and account_email.confirmed_at is not null
  and lower(trim(account_email.email))=lower(trim(auth_user.email))
where restaurant.status in ('draft','pending_activation')
  and upper(restaurant.name) like '%WUXUAI%'
  and (upper(restaurant.name) like '%TEST%' or upper(restaurant.name) like '%SMOKE%')
order by restaurant.created_at limit 1;`);

const businessCounters = () => json(`select jsonb_build_object(
  'auth_users',(select count(*) from auth.users),
  'restaurants',(select count(*) from public.restaurants),
  'offers',(select count(*) from public.restaurant_offers),
  'points',(select count(*) from public.points_transactions),
  'real_offer_mail',(select count(*) from public.customer_offer_email_deliveries),
  'real_offer_consent',(select count(*) from public.customer_offer_email_consents),
  'real_transactional_mail',(select count(*) from public.customer_transactional_email_deliveries),
  'test_pro_consent',(select count(*) from public.test_only_pro_in_app_consent_receipts),
  'real_pro',(select count(*) from public.commercial_pro_access_grants),
  'trial',(select count(*) from public.billing_trial_claims),
  'checkout',(select count(*) from public.basic_test_checkout_requests)
);`);

function configure(current, requestId = randomUUID(), validUntil = new Date(Date.now() + 2 * 60 * 60_000).toISOString()) {
  return json(`select project_bootstrap.configure_test_only_app_mail_recipient(
    '${current.restaurant}','${current.branch}','${current.account}','${current.customer}',
    '${current.auth_user}',${q(current.email)},'${validUntil}'::timestamptz,'${requestId}',
    'local-code-lock',repeat('a',64));`);
}

function enqueue(bindingId, requestId, version = 1, hash = contentSha256) {
  return service(`select public.enqueue_test_only_app_mail(
    '${bindingId}','${requestId}',${version},'${hash}')`);
}

const before = businessCounters();
resetContract();
const current = fixture();
for (const key of ["restaurant", "branch", "account", "customer", "auth_user"]) {
  assert.match(current[key], /^[0-9a-f-]{36}$/i, key);
}
assert.match(current.email, /@example\.invalid$/);

// The administrative binding contract fails closed when the immutable server
// authority no longer reports the exact v2 origin.
sql(`set session_replication_role=replica;
  update project_bootstrap.binding set app_origin='https://wrong.invalid';
  set session_replication_role=origin;`);
denied(`select project_bootstrap.configure_test_only_app_mail_recipient(
  '${current.restaurant}','${current.branch}','${current.account}','${current.customer}',
  '${current.auth_user}',${q(current.email)},now()+interval '2 hours','${randomUUID()}',
  'local-code-lock',repeat('a',64));`, /PROJECT_BINDING_MISMATCH/);
sql(`set session_replication_role=replica;
  update project_bootstrap.binding set app_origin='https://staging-v2.bonus.wuxuaisbi.com';
  set session_replication_role=origin;`);
assert.equal(json("select public.get_server_project_binding();").project_ref, "mbgveqbhessaunrhfudm");

// Private tables have RLS and no browser or service-role table privileges. Only
// the five narrow service RPCs are executable by service_role.
for (const role of ["anon", "authenticated", "service_role"]) {
  assert.equal(sql(`select has_schema_privilege('${role}','test_only_app_mail','USAGE');`), "f");
  for (const table of ["recipient_binding", "queue", "provider_receipts", "audit"]) {
    assert.equal(sql(`select has_table_privilege('${role}','test_only_app_mail.${table}','SELECT');`), "f");
    assert.equal(sql(`select has_table_privilege('${role}','test_only_app_mail.${table}','INSERT');`), "f");
  }
}
for (const signature of [
  "enqueue_test_only_app_mail(uuid,uuid,integer,text)",
  "reserve_test_only_app_mail(uuid)",
  "begin_test_only_app_mail_delivery(uuid)",
  "complete_test_only_app_mail_delivery(uuid,text,text,text)",
  "get_test_only_app_mail_result(uuid)",
]) {
  assert.equal(sql(`select has_function_privilege('service_role','public.${signature}','EXECUTE');`), "t");
  assert.equal(sql(`select has_function_privilege('authenticated','public.${signature}','EXECUTE');`), "f");
}
assert.equal(sql("select count(*) from test_only_app_mail.recipient_binding;"), "0");
assert.equal(sql("select count(*) from test_only_app_mail.queue;"), "0");
assert.equal(sql("select count(*) from test_only_app_mail.provider_receipts;"), "0");
assert.equal(sql("select count(*) from test_only_app_mail.audit;"), "0");

const configurationRequest = randomUUID();
const configurationValidUntil = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
const configured = configure(current, configurationRequest, configurationValidUntil);
assert.equal(configured.created, true);
assert.equal(configure(current, configurationRequest, configurationValidUntil).replay, true);
const foreignRestaurant = sql(`select id from public.restaurants
  where id<>'${current.restaurant}' order by created_at limit 1;`);
denied(`select project_bootstrap.configure_test_only_app_mail_recipient(
  '${foreignRestaurant}','${current.branch}','${current.account}','${current.customer}',
  '${current.auth_user}',${q(current.email)},now()+interval '2 hours','${randomUUID()}',
  'local-code-lock',repeat('a',64));`, /TEST_ONLY_APP_MAIL_RECIPIENT_NOT_ELIGIBLE/);
denied(`select project_bootstrap.configure_test_only_app_mail_recipient(
  '${current.restaurant}','${current.branch}','${current.account}','${current.customer}',
  '${current.auth_user}',${q(current.email)},now()+interval '2 hours','${randomUUID()}',
  'local-code-lock',repeat('a',64));`, /TEST_ONLY_APP_MAIL_BINDING_CONFLICT/);

denied(enqueue(configured.binding_id, randomUUID(), 2), /CONTRACT_VERSION_CHANGED/);
denied(enqueue(configured.binding_id, randomUUID(), 1, "b".repeat(64)), /CONTRACT_VERSION_CHANGED/);

// Parallel enqueue and reservation yield one durable event and one attempt.
const requestId = randomUUID();
const enqueues = await Promise.all(Array.from({ length: 8 }, () => asyncSql(enqueue(configured.binding_id, requestId))));
const enqueueRows = enqueues.map((value) => JSON.parse(value.split("\n").filter((line) => line.startsWith("{")).at(-1)));
assert.equal(enqueueRows.filter((row) => row.created === true).length, 1);
assert.equal(enqueueRows.filter((row) => row.replay === true).length, 7);
assert.equal(new Set(enqueueRows.map((row) => row.delivery_id)).size, 1);
const deliveryId = enqueueRows[0].delivery_id;
const reserveSql = service(`select coalesce(jsonb_agg(delivery),'[]'::jsonb)
  from public.reserve_test_only_app_mail('${requestId}') delivery`);
const reservations = await Promise.all(Array.from({ length: 8 }, () => asyncSql(reserveSql)));
const reservedRows = reservations.flatMap((value) => JSON.parse(value.split("\n").filter((line) => line.startsWith("[")).at(-1)));
assert.equal(reservedRows.length, 1);
assert.equal(reservedRows[0].delivery_id, deliveryId);
assert.equal(reservedRows[0].email, current.email);
assert.equal(reservedRows[0].attempt_count, 1);
assert.equal(reservedRows[0].deterministic_message_id, `<wuxuai-test-only-${deliveryId}@wuxuai.invalid>`);

const begun = json(service(`select to_jsonb(result) from public.begin_test_only_app_mail_delivery('${deliveryId}') result`));
assert.equal(begun.authorized, true);
const unknown = service(`select public.complete_test_only_app_mail_delivery(
  '${deliveryId}','UNKNOWN','<wuxuai-test-only-${deliveryId}@wuxuai.invalid>',
  'PROVIDER_OUTCOME_UNKNOWN')`);
const completions = await Promise.all(Array.from({ length: 6 }, () => asyncSql(unknown)));
assert.ok(completions.every((value) => value.split("\n").includes("t")));
assert.equal(sql(service(`select public.complete_test_only_app_mail_delivery(
  '${deliveryId}','ACCEPTED','<changed@wuxuai.invalid>',null)`)).split("\n").at(-1), "f");
assert.equal(json(reserveSql).length, 0);
const result = json(service(`select public.get_test_only_app_mail_result('${requestId}')`));
assert.equal(result.status, "UNKNOWN");
assert.equal(result.attempt_count, 1);
assert.equal(result.provider_receipt_count, 1);
assert.equal(result.provider_outcome, "UNKNOWN");
assert.equal(sql(`select count(*) from test_only_app_mail.queue where id='${deliveryId}'`), "1");
assert.equal(sql(`select count(*) from test_only_app_mail.provider_receipts where queue_id='${deliveryId}'`), "1");
assert.equal(sql(`select count(*) from test_only_app_mail.audit where queue_id='${deliveryId}'`), "4");
denied("update test_only_app_mail.audit set actor_ref=actor_ref;", /TEST_ONLY_APP_MAIL_EVIDENCE_IMMUTABLE/);

// Revoke before the irreversible begin boundary closes the already-reserved event.
resetContract();
const revokeBinding = configure(current);
const revokeRequest = randomUUID();
const revokeEnqueue = json(enqueue(revokeBinding.binding_id, revokeRequest));
json(service(`select coalesce(jsonb_agg(delivery),'[]'::jsonb)
  from public.reserve_test_only_app_mail('${revokeRequest}') delivery`));
const revokeId = randomUUID();
const revoked = json(`select project_bootstrap.revoke_test_only_app_mail_recipient(
  '${revokeBinding.binding_id}','${revokeId}','local-code-lock',
  'Synthetic local revocation before provider handoff.',repeat('c',64));`);
assert.equal(revoked.revoked, true);
assert.equal(json(`select project_bootstrap.revoke_test_only_app_mail_recipient(
  '${revokeBinding.binding_id}','${revokeId}','local-code-lock',
  'Synthetic local revocation before provider handoff.',repeat('c',64));`).replay, true);
const blockedAfterRevoke = json(service(`select to_jsonb(result)
  from public.begin_test_only_app_mail_delivery('${revokeEnqueue.delivery_id}') result`));
assert.equal(blockedAfterRevoke.authorized, false);
assert.equal(sql(`select status from test_only_app_mail.queue where id='${revokeEnqueue.delivery_id}'`), "SKIPPED");
assert.equal(sql("select count(*) from test_only_app_mail.provider_receipts;"), "0");

// A snapshot version change between reserve and begin is caught by the final check.
resetContract();
const versionBinding = configure(current);
const versionRequest = randomUUID();
const versionEnqueue = json(enqueue(versionBinding.binding_id, versionRequest));
json(service(`select coalesce(jsonb_agg(delivery),'[]'::jsonb)
  from public.reserve_test_only_app_mail('${versionRequest}') delivery`));
sql(`begin; select set_config('wuxuai.test_only_app_mail_write','on',true);
  update test_only_app_mail.queue set event_version=2 where id='${versionEnqueue.delivery_id}'; commit;`);
const blockedVersion = json(service(`select to_jsonb(result)
  from public.begin_test_only_app_mail_delivery('${versionEnqueue.delivery_id}') result`));
assert.deepEqual(blockedVersion, { authorized: false, reason_code: "CONTRACT_VERSION_CHANGED" });
assert.equal(sql(`select status from test_only_app_mail.queue where id='${versionEnqueue.delivery_id}'`), "SKIPPED");

// Audit failure rolls the begin transition back atomically.
resetContract();
const rollbackBinding = configure(current);
const rollbackRequest = randomUUID();
const rollbackEnqueue = json(enqueue(rollbackBinding.binding_id, rollbackRequest));
json(service(`select coalesce(jsonb_agg(delivery),'[]'::jsonb)
  from public.reserve_test_only_app_mail('${rollbackRequest}') delivery`));
sql(`create function test_only_app_mail.local_reject_handoff_audit() returns trigger
  language plpgsql as $$begin if new.event='PROVIDER_HANDOFF_STARTED' then
  raise exception 'LOCAL_HANDOFF_AUDIT_FAILURE'; end if; return new; end$$;
  create trigger local_reject_handoff_audit before insert on test_only_app_mail.audit
  for each row execute function test_only_app_mail.local_reject_handoff_audit();`);
denied(service(`select * from public.begin_test_only_app_mail_delivery('${rollbackEnqueue.delivery_id}')`),
  /LOCAL_HANDOFF_AUDIT_FAILURE/);
assert.equal(sql(`select status from test_only_app_mail.queue where id='${rollbackEnqueue.delivery_id}'`), "RESERVED");
assert.equal(sql(`select provider_started_at is null from test_only_app_mail.queue where id='${rollbackEnqueue.delivery_id}'`), "t");
sql("drop trigger local_reject_handoff_audit on test_only_app_mail.audit; drop function test_only_app_mail.local_reject_handoff_audit();");

assert.deepEqual(businessCounters(), before);
console.log(JSON.stringify({
  status: "LOCAL_TEST_ONLY_APP_MAIL_DB_PASS",
  project_ref: "mbgveqbhessaunrhfudm",
  event_type: eventType,
  parallel_enqueue: 8,
  parallel_reserve: 8,
  parallel_unknown_completion: 6,
  real_business_delta: 0,
}));
