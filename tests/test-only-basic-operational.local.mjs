// Opt-in, disposable local-stack contract test. Never point this at a hosted project.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

assert.equal(process.env.ALLOW_LOCAL_TEST_ONLY_BASIC, "1");
const env = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" };
const status = JSON.parse(execFileSync("npx", ["--no-install", "supabase", "status", "--output", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env,
}));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
const projectId = readFileSync(new URL("../supabase/config.toml", import.meta.url), "utf8")
  .match(/^project_id = "([^"]+)"/m)?.[1];
assert.equal(projectId, "wuxuai-phase7b4d-local");
const container = `supabase_db_${projectId}`;
const psqlArgs = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const sql = (input) => execFileSync("docker", psqlArgs, {
  input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
}).trim();
const asyncSql = (input) => new Promise((resolve, reject) => {
  const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let error = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { error += chunk; });
  child.once("error", reject);
  child.once("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error.trim())));
  child.stdin.end(input);
});
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (input) => JSON.parse(sql(input).split("\n").filter(Boolean).at(-1));
const denied = (input, pattern) => assert.throws(() => sql(input), (error) => pattern.test(String(error.stderr ?? error.message)));

const projectRef = "mbgveqbhessaunrhfudm";
const issuer = `https://${projectRef}.supabase.co/auth/v1`;
const fixture = json(`select jsonb_build_object(
  'restaurant',r.id,'organization',r.organization_id,'branch',r.primary_branch_id,
  'slug',r.slug,'owner',r.owner_id,
  'admin',(select user_id from public.platform_admins where active order by role desc,user_id limit 1),
  'admin_session',(select session.id from auth.sessions session join public.platform_admins admin_row
    on admin_row.user_id=session.user_id where admin_row.active order by admin_row.role desc,session.id limit 1),
  'platform_publication',(select jsonb_build_object('id',p.id,'sha256',p.content_sha256)
    from public.platform_terms_test_publications p where p.restaurant_id=r.id and p.action='PUBLISH_TEST'
    order by p.event_sequence desc limit 1),
  'merchant_publication',(select jsonb_build_object('id',p.id,'bundle_id',p.bundle_id,'bundle_hash',p.bundle_hash)
    from public.at_legal_synthetic_test_publications p where p.restaurant_id=r.id and p.action='PUBLISH_TEST'
    order by p.event_sequence desc limit 1)
) from public.restaurants r
where exists(select 1 from public.test_only_activation_trial_receipts receipt
  where receipt.restaurant_id=r.id and receipt.action='TRIAL_READINESS_TEST')
  and not exists(select 1 from public.customer_test_only_join_receipts joined where joined.restaurant_id=r.id)
order by r.created_at limit 1;`);
assert.ok(fixture.restaurant && fixture.platform_publication?.id && fixture.merchant_publication?.id);

const customerUser = randomUUID();
const customerSession = randomUUID();
const ownerSession = randomUUID();
const customerEmail = `synthetic-basic-${customerUser}@example.invalid`;
const customerPhone = `+4366${String(Date.now()).slice(-9)}`;
sql(`insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values('${customerUser}','authenticated','authenticated',${q(customerEmail)},'local-only',now(),
    ${q(JSON.stringify({ customer_first_name: "Synthetic BASIC", customer_phone: customerPhone }))}::jsonb,now(),now());
  insert into auth.sessions(id,user_id,aal,created_at,updated_at,refreshed_at)
  values('${customerSession}','${customerUser}','aal1',now(),now(),now()),
    ('${ownerSession}','${fixture.owner}','aal1',now(),now(),now());`);

const claims = ({ who, session, age = 0, aal = "aal1", jwtIssuer = issuer } = {}) => JSON.stringify({
  sub: who, role: "authenticated", session_id: session, iss: jwtIssuer, aal,
  amr: aal === "aal2" ? [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) - age }] : [],
}).replaceAll("'", "''");
const asAuth = ({ who, session, age = 0, aal = "aal1", jwtIssuer = issuer }, statement) =>
  `begin; set local role authenticated; select set_config('request.jwt.claims','${claims({ who, session, age, aal, jwtIssuer })}',true); ${statement}; commit;`;
const adminAuth = (statement, age = 0) => asAuth({ who: fixture.admin, session: fixture.admin_session, age, aal: "aal2" }, statement);
const ownerAuth = (statement) => asAuth({ who: fixture.owner, session: ownerSession }, statement);
const customerAuth = (statement) => asAuth({ who: customerUser, session: customerSession }, statement);

// Build the customer prerequisite through the existing guarded product contracts.
json(adminAuth(`select public.bind_platform_terms_test_identity('${fixture.restaurant}','${customerUser}','${randomUUID()}')`, 2));
json(customerAuth(`select public.accept_platform_customer_terms('${fixture.platform_publication.id}',
  '${fixture.platform_publication.sha256}','de-AT','customer_registration','${randomUUID()}')`));
sql(customerAuth("select public.ensure_authenticated_customer_account()"));
const join = json(customerAuth(`select public.join_customer_account_test_only_at_legal(
  '${fixture.slug}','${fixture.branch}',true,true,'${fixture.merchant_publication.bundle_id}',
  '${fixture.merchant_publication.bundle_hash}','${randomUUID()}')`));
assert.equal(join.joined, true);
assert.equal(join.test_only, true);
const customerToken = join.customer_token;
assert.match(customerToken, /^[0-9a-f]{64}$/);
const customerId = sql(`select membership.customer_id from public.customer_account_memberships membership
  join public.customer_accounts account on account.id=membership.account_id
  where account.auth_user_id='${customerUser}' and membership.restaurant_id='${fixture.restaurant}'`);
assert.match(customerId, /^[0-9a-f-]{36}$/);

const read = (options = {}) => json(asAuth({ who: fixture.admin, session: fixture.admin_session,
  aal: "aal2", age: options.age ?? 0, jwtIssuer: options.jwtIssuer ?? issuer },
"select public.get_platform_test_only_basic_access('" + fixture.restaurant + "')"));
const decide = ({ state, action, request = randomUUID(), expiresAt = null,
  reason = "Synthetic BASIC local contract validation" } = {}) => ({ request, sql: adminAuth(
  `select public.decide_platform_test_only_basic_access('${fixture.restaurant}','${action}',
    '${state.snapshot_sha256}',${state.previous_receipt_id ? `'${state.previous_receipt_id}'` : "null"},
    ${expiresAt ? `'${expiresAt}'` : "null"},${q(reason)},
    'TEST_ONLY BASIC ${action} ${fixture.restaurant}','${request}')`, 1) });

const negativeState = () => json(`select jsonb_build_object(
  'restaurant',(select jsonb_build_object('status',status,'activation_status',activation_status,
    'legal_ready',legal_ready,'operational_ready',operational_ready,'security_ready',security_ready)
    from public.restaurants where id='${fixture.restaurant}'),
  'branch',(select status from public.branches where id='${fixture.branch}'),
  'subscription',(select jsonb_build_object('status',status,'subscription_status',subscription_status,
    'trial_started_at',trial_started_at,'trial_ends_at',trial_ends_at,
    'stripe_customer_id',stripe_customer_id,'stripe_subscription_id',stripe_subscription_id)
    from public.branch_subscriptions where branch_id='${fixture.branch}'),
  'real_entitlement',public.resolve_restaurant_entitlements_internal('${fixture.restaurant}'),
  'real_trial',(select count(*) from public.manual_basic_trial_decisions where restaurant_id='${fixture.restaurant}'),
  'trial_claims',(select count(*) from public.billing_trial_claims where restaurant_id='${fixture.restaurant}'),
  'pro_grants',(select count(*) from public.commercial_pro_access_grants where restaurant_id='${fixture.restaurant}'),
  'checkout',(select count(*) from public.basic_test_checkout_requests where restaurant_id='${fixture.restaurant}'),
  'billing_webhooks',(select count(*) from public.basic_stripe_test_event_inbox where restaurant_id='${fixture.restaurant}'),
  'offer_mail',(select count(*) from public.customer_offer_email_deliveries where restaurant_id='${fixture.restaurant}'),
  'transactional_mail',(select count(*) from public.customer_transactional_email_deliveries where restaurant_id='${fixture.restaurant}'),
  'pro_inbox',(select count(*) from public.customer_pro_in_app_notifications where restaurant_id='${fixture.restaurant}'),
  'real_legal',(select count(*) from public.legal_operator_publication_decisions where restaurant_id='${fixture.restaurant}'),
  'real_intake',(select real_intake_status from public.country_kyb_intake_policies where country_code='AT'),
  'catalog_access',public.restaurant_menu_access_internal('${fixture.restaurant}','${fixture.branch}'),
  'catalog_objects',(select count(*) from storage.objects where bucket_id='restaurant-menu-private')
);`);

const before = negativeState();
assert.equal(before.restaurant.status, "draft");
assert.equal(before.restaurant.activation_status, "pending_activation");
assert.equal(before.real_entitlement.entitlement_source, "NONE");
assert.equal(before.real_entitlement.effective_plan, null);
assert.equal(before.real_intake, "BLOCKED");
assert.equal(before.catalog_access, false);

denied(`begin; set local role anon; select public.get_platform_test_only_basic_access('${fixture.restaurant}'); rollback;`,
  /permission denied|LEGAL_BUNDLE_ACCESS_DENIED|PROJECT_BINDING_REQUIRED/i);
denied(adminAuth(`select public.get_platform_test_only_basic_access('${fixture.restaurant}')`, 601),
  /RECENT_PLATFORM_TOTP_REQUIRED/i);
denied(asAuth({ who: fixture.admin, session: fixture.admin_session, aal: "aal2", jwtIssuer: "https://wrong.invalid/auth/v1" },
  `select public.get_platform_test_only_basic_access('${fixture.restaurant}')`), /PROJECT_BINDING_REQUIRED/i);
for (const role of ["anon", "authenticated", "service_role"]) {
  assert.equal(sql(`select has_table_privilege('${role}','public.test_only_basic_access_receipts','SELECT')`), "f");
  assert.equal(sql(`select has_table_privilege('${role}','public.test_only_basic_access_audit','INSERT')`), "f");
}

const initial = read();
assert.equal(initial.next_action, "GRANT");
assert.equal(initial.active, false);
assert.equal(initial.snapshot.customer_id, customerId);
assert.equal(initial.snapshot.basic.plan_key, "BASIC");
assert.equal(initial.snapshot.basic.offer_limit, 5);

// Audit insertion failure must roll back the paired receipt.
sql(`create function public.local_reject_test_only_basic_audit() returns trigger language plpgsql as
$$begin raise exception 'SYNTHETIC_BASIC_AUDIT_FAILURE'; end$$;
create trigger reject_test_only_basic_audit before insert on public.test_only_basic_access_audit
for each row execute function public.local_reject_test_only_basic_audit();`);
denied(decide({ state: initial, action: "GRANT", expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() }).sql,
  /SYNTHETIC_BASIC_AUDIT_FAILURE/i);
assert.equal(sql(`select count(*) from public.test_only_basic_access_receipts where restaurant_id='${fixture.restaurant}'`), "0");
sql("drop trigger reject_test_only_basic_audit on public.test_only_basic_access_audit; drop function public.local_reject_test_only_basic_audit();");

const grantRequest = randomUUID();
const grantCall = decide({ state: initial, action: "GRANT", request: grantRequest,
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() });
const parallel = await Promise.all(Array.from({ length: 6 }, () => asyncSql(grantCall.sql)));
const grantResults = parallel.map((output) => JSON.parse(output.split("\n").filter((line) => line.startsWith("{")).at(-1)));
assert.equal(grantResults.filter((row) => row.idempotent === false).length, 1);
assert.equal(grantResults.filter((row) => row.idempotent === true).length, 5);
assert.equal(new Set(grantResults.map((row) => row.receipt_id)).size, 1);
denied(grantCall.sql.replace("Synthetic BASIC local contract validation", "Changed replay reason"),
  /TEST_ONLY_BASIC_REPLAY_CONFLICT/i);
const active = read();
assert.equal(active.active, true);
assert.equal(active.next_action, "REVOKE");
const runtime = json(customerAuth(`select public.get_test_only_basic_runtime('${fixture.restaurant}')`));
assert.equal(runtime.active, true);
assert.equal(runtime.effective_plan, "BASIC");
assert.equal(runtime.offer_limit, 5);
assert.equal(runtime.offer_usage, 0);
assert.equal(runtime.offer_notifications, false);
assert.equal(runtime.catalog_access, false);
assert.equal(runtime.receipt_id, active.previous_receipt_id);

// A different tenant and unrelated customer remain closed.
const foreign = json(`select jsonb_build_object('restaurant',r.id,'slug',r.slug) from public.restaurants r
  where r.id<>'${fixture.restaurant}' and r.activation_status='pending_activation' order by r.created_at limit 1;`);
denied(customerAuth(`select public.get_test_only_basic_runtime('${foreign.restaurant}')`),
  /TEST_ONLY_BASIC_RUNTIME_DENIED|TEST_ONLY_BASIC_CONTEXT_INVALID/i);
denied(customerAuth(`select public.create_test_only_basic_customer_points_qr('${foreign.restaurant}','${randomUUID()}')`),
  /TEST_ONLY_BASIC_OPERATION_DENIED|TEST_ONLY_BASIC_CUSTOMER_DENIED/i);
// A valid synthetic grant never opens the ordinary QR/PIN/points entry points.
denied(customerAuth(`select public.create_customer_points_credit_qr('${fixture.slug}','${customerToken}')`),
  /Restaurant wurde nicht gefunden/i);
denied(ownerAuth(`select public.get_today_restaurant_pin('${fixture.restaurant}')`),
  /RESTAURANT_NOT_OPERATIONAL/i);
denied(ownerAuth(`select public.preview_restaurant_controlled_points('${fixture.restaurant}',
  'ordinary-path-must-stay-closed',1500)`), /RESTAURANT_NOT_OPERATIONAL/i);
denied(ownerAuth(`select public.confirm_restaurant_controlled_points('${fixture.restaurant}',
  'ordinary-path-must-stay-closed',1500,'0000','${randomUUID()}')`),
  /RESTAURANT_NOT_OPERATIONAL/i);

// Owner offer flow: the real publish RPC stays closed. Only the dedicated,
// grant-bound TEST_ONLY writer can publish and it is replay-safe.
const offerIds = [];
for (let index = 1; index <= 5; index += 1) {
  const offer = json(ownerAuth(`select public.save_restaurant_offer('${fixture.restaurant}',null,'${fixture.branch}',
    'NEWS','TEST ONLY Angebot ${index}','Synthetischer BASIC-Test',null,null,null,null,
    now()-interval '1 minute',now()+interval '1 day',null,null,null,'Test ansehen')`));
  offerIds.push(offer.id);
  if (index === 1) {
    denied(ownerAuth(`select public.change_restaurant_offer_status('${fixture.restaurant}','${offer.id}','PUBLISH')`),
      /RESTAURANT_NOT_OPERATIONAL/i);
  }
  const requestId = randomUUID();
  const publishSql = ownerAuth(`select public.publish_test_only_basic_offer(
    '${fixture.restaurant}','${offer.id}','${runtime.receipt_id}','DRAFT',${offer.publication_version},'${requestId}')`);
  const published = json(publishSql);
  assert.equal(published.status, "PUBLISHED");
  assert.equal(published.synthetic_test_only, true);
  assert.equal(published.notifications_enqueued, false);
  if (index === 1) {
    const replay = json(publishSql);
    assert.equal(replay.idempotent, true);
    assert.equal(replay.receipt_id, published.receipt_id);
    denied(publishSql.replace("'DRAFT'", "'DISABLED'"), /TEST_ONLY_BASIC_OFFER_REPLAY_CONFLICT/i);
  }
}
const sixth = json(ownerAuth(`select public.save_restaurant_offer('${fixture.restaurant}',null,'${fixture.branch}',
  'NEWS','TEST ONLY Angebot 6','Synthetischer BASIC-Test',null,null,null,null,
  now()-interval '1 minute',now()+interval '1 day',null,null,null,'Test ansehen')`));
denied(ownerAuth(`select public.publish_test_only_basic_offer(
  '${fixture.restaurant}','${sixth.id}','${runtime.receipt_id}','DRAFT',${sixth.publication_version},'${randomUUID()}')`),
  /OFFER_CAPACITY_REACHED/i);
denied(ownerAuth(`select public.publish_test_only_basic_offer(
  '${foreign.restaurant}','${sixth.id}','${runtime.receipt_id}','DRAFT',${sixth.publication_version},'${randomUUID()}')`),
  /TEST_ONLY_BASIC_OWNER_DENIED|TEST_ONLY_BASIC_OFFER_GRANT_INVALID/i);
assert.equal(json(customerAuth(`select public.get_public_restaurant_offers('${fixture.slug}',20)`)).length, 0);
const customerFlow = json(customerAuth(`select public.get_test_only_basic_customer_flow('${fixture.slug}')`));
assert.equal(customerFlow.active, true);
assert.equal(customerFlow.restaurant_id, fixture.restaurant);
assert.equal(customerFlow.customer_id, customerId);
assert.equal(customerFlow.offers.length, 5);
assert.ok(customerFlow.offers.every((offer) => offer.synthetic_test_only === true));
const visible = customerFlow.offers;
const fullRuntime = json(ownerAuth(`select public.get_test_only_basic_runtime('${fixture.restaurant}')`));
assert.equal(fullRuntime.offer_usage, 5);
assert.equal(fullRuntime.offer_limit, 5);
denied(asAuth({ who: fixture.owner, session: randomUUID() },
  `select public.get_test_only_basic_customer_flow('${fixture.slug}')`),
  /PROJECT_BINDING_REQUIRED|TEST_ONLY_BASIC_CUSTOMER_DENIED/i);

// The separated customer/owner flow exercises offer -> QR -> PIN -> preview ->
// exactly one idempotent points write. None of these calls uses a real RPC.
const testQr = json(customerAuth(`select public.create_test_only_basic_customer_points_qr(
  '${fixture.restaurant}','${randomUUID()}')`));
assert.equal(testQr.synthetic_test_only, true);
assert.equal(testQr.access_receipt_id, runtime.receipt_id);
assert.match(testQr.qr_token, /^[0-9a-f]{64}$/);
assert.match(testQr.manual_code, /^\d{8}$/);
const testPin = json(ownerAuth(`select public.get_test_only_basic_today_restaurant_pin(
  '${fixture.restaurant}','${randomUUID()}')`));
assert.equal(testPin.synthetic_test_only, true);
assert.equal(testPin.access_receipt_id, runtime.receipt_id);
assert.match(testPin.pin_code, /^\d{4}$/);
const testPreview = json(ownerAuth(`select public.preview_test_only_basic_points(
  '${fixture.restaurant}',${q(testQr.qr_token)},1500,'${randomUUID()}')`));
assert.equal(testPreview.synthetic_test_only, true);
assert.equal(testPreview.access_receipt_id, runtime.receipt_id);
assert.ok(testPreview.final_points > 0);
const pointsRequest = randomUUID();
const confirmSql = ownerAuth(`select public.confirm_test_only_basic_points(
  '${fixture.restaurant}',${q(testQr.qr_token)},1500,${q(testPin.pin_code)},'${pointsRequest}')`);
const parallelPoints = await Promise.all(Array.from({ length: 6 }, () => asyncSql(confirmSql)));
const pointResults = parallelPoints.map((output) => JSON.parse(
  output.split("\n").filter((line) => line.startsWith("{")).at(-1),
));
assert.equal(pointResults.filter((row) => row.already_completed === false).length, 1);
assert.equal(pointResults.filter((row) => row.already_completed === true).length, 5);
assert.equal(new Set(pointResults.map((row) => row.transaction_id)).size, 1);
const pointsWrite = pointResults.find((row) => row.already_completed === false);
assert.equal(pointsWrite.synthetic_test_only, true);
assert.ok(pointsWrite.points_added > 0);
const pointsReplay = json(confirmSql);
assert.equal(pointsReplay.synthetic_test_only, true);
assert.equal(pointsReplay.already_completed, true);
assert.equal(pointsReplay.transaction_id, pointsWrite.transaction_id);
assert.equal(sql(`select count(*) from public.points_transactions
  where restaurant_id='${fixture.restaurant}' and id='${pointsWrite.transaction_id}'
    and reason='TEST_ONLY BASIC: synthetische Punktebuchung'`), "1");
assert.equal(sql(`select count(*) from public.audit_log
  where restaurant_id='${fixture.restaurant}' and event_type='TEST_ONLY_BASIC_POINTS_ADDED'
    and entity_id='${pointsWrite.transaction_id}'`), "1");
denied(ownerAuth(`select public.create_test_only_basic_customer_points_qr(
  '${fixture.restaurant}','${randomUUID()}')`), /TEST_ONLY_BASIC_CUSTOMER_DENIED/i);
denied(customerAuth(`select public.get_test_only_basic_today_restaurant_pin(
  '${fixture.restaurant}','${randomUUID()}')`), /TEST_ONLY_BASIC_MEMBER_DENIED/i);
denied(ownerAuth(`select public.preview_test_only_basic_points(
  '${foreign.restaurant}',${q(testQr.qr_token)},1500,'${randomUUID()}')`),
  /TEST_ONLY_BASIC_OPERATION_DENIED|TEST_ONLY_BASIC_MEMBER_DENIED/i);

// Simulate a newer expired grant inside a rolled-back transaction. The writer
// must evaluate expiry on every call rather than trusting an earlier UI read.
const expiredRequest = randomUUID();
const expiredGrant = randomUUID();
const expiredOperation = (authSql, statement) => `begin;
  insert into public.test_only_basic_access_receipts(
    id,restaurant_id,organization_id,branch_id,action,actor_id,request_id,
    previous_receipt_id,readiness_receipt_id,readiness_snapshot_sha256,
    customer_join_receipt_id,starts_at,expires_at,reason,decision_payload,
    auth_evidence,result,receipt_sha256,created_at
  ) select '${expiredGrant}',restaurant_id,organization_id,branch_id,'GRANT',actor_id,'${expiredRequest}',
    id,readiness_receipt_id,readiness_snapshot_sha256,customer_join_receipt_id,
    now()-interval '2 hours',now()-interval '1 hour','Expired local writer proof',
    decision_payload,auth_evidence,result,repeat('0',64),clock_timestamp()+interval '1 second'
  from public.test_only_basic_access_receipts where id='${runtime.receipt_id}';
  ${authSql}
  ${statement};
  rollback;`;
denied(expiredOperation(
  `set local role authenticated; select set_config('request.jwt.claims','${claims({ who: fixture.owner, session: ownerSession })}',true);`,
  `select public.publish_test_only_basic_offer('${fixture.restaurant}','${sixth.id}',
    '${expiredGrant}','DRAFT',${sixth.publication_version},'${randomUUID()}')`,
), /TEST_ONLY_BASIC_OFFER_GRANT_INVALID/i);
denied(expiredOperation(
  `set local role authenticated; select set_config('request.jwt.claims','${claims({ who: customerUser, session: customerSession })}',true);`,
  `select public.create_test_only_basic_customer_points_qr('${fixture.restaurant}','${randomUUID()}')`,
), /TEST_ONLY_BASIC_OPERATION_DENIED/i);
for (const statement of [
  `select public.get_test_only_basic_today_restaurant_pin('${fixture.restaurant}','${randomUUID()}')`,
  `select public.preview_test_only_basic_points('${fixture.restaurant}',${q(testQr.qr_token)},1500,'${randomUUID()}')`,
  `select public.confirm_test_only_basic_points('${fixture.restaurant}',${q(testQr.qr_token)},1500,${q(testPin.pin_code)},'${randomUUID()}')`,
]) {
  denied(expiredOperation(
    `set local role authenticated; select set_config('request.jwt.claims','${claims({ who: fixture.owner, session: ownerSession })}',true);`,
    statement,
  ), /TEST_ONLY_BASIC_OPERATION_DENIED/i);
}

const during = negativeState();
assert.deepEqual(during.restaurant, before.restaurant);
assert.deepEqual(during.branch, before.branch);
assert.deepEqual(during.subscription, before.subscription);
assert.equal(during.real_entitlement.entitlement_source, "NONE");
assert.equal(during.real_entitlement.effective_plan, null);
for (const key of ["real_trial", "trial_claims", "pro_grants", "checkout", "billing_webhooks",
  "offer_mail", "transactional_mail", "pro_inbox", "real_legal", "catalog_objects"]) assert.equal(during[key], before[key], key);
assert.equal(during.real_intake, "BLOCKED");
assert.equal(during.catalog_access, false);

const revoke = json(decide({ state: active, action: "REVOKE" }).sql);
assert.equal(revoke.action, "REVOKE");
assert.equal(revoke.effective_plan, null);
const closed = read();
assert.equal(closed.active, false);
assert.equal(closed.next_action, "GRANT");
const closedRuntime = json(ownerAuth(`select public.get_test_only_basic_runtime('${fixture.restaurant}')`));
assert.equal(closedRuntime.active, false);
assert.equal(closedRuntime.offer_usage, 0);
assert.equal(closedRuntime.offer_limit, 0);
denied(customerAuth(`select public.create_customer_points_credit_qr('${fixture.slug}','${customerToken}')`),
  /Restaurant wurde nicht gefunden/i);
denied(customerAuth(`select public.create_test_only_basic_customer_points_qr(
  '${fixture.restaurant}','${randomUUID()}')`), /TEST_ONLY_BASIC_OPERATION_DENIED/i);
denied(ownerAuth(`select public.get_test_only_basic_today_restaurant_pin(
  '${fixture.restaurant}','${randomUUID()}')`), /TEST_ONLY_BASIC_OPERATION_DENIED/i);
denied(ownerAuth(`select public.preview_test_only_basic_points(
  '${fixture.restaurant}','post-revoke-invalid-reference',1500,'${randomUUID()}')`),
  /TEST_ONLY_BASIC_OPERATION_DENIED/i);
denied(ownerAuth(`select public.confirm_test_only_basic_points(
  '${fixture.restaurant}','post-revoke-invalid-reference',1500,'0000','${randomUUID()}')`),
  /TEST_ONLY_BASIC_OPERATION_DENIED/i);
denied(ownerAuth(`select public.publish_test_only_basic_offer(
  '${fixture.restaurant}','${sixth.id}','${runtime.receipt_id}','DRAFT',${sixth.publication_version},'${randomUUID()}')`),
  /TEST_ONLY_BASIC_OFFER_GRANT_INVALID/i);
denied(ownerAuth(`select public.change_restaurant_offer_status('${fixture.restaurant}','${sixth.id}','PUBLISH')`),
  /RESTAURANT_NOT_OPERATIONAL/i);
const postRevokeDraft = json(ownerAuth(`select public.save_restaurant_offer('${fixture.restaurant}',null,'${fixture.branch}',
  'NEWS','TEST ONLY nach Widerruf','Muss gesperrt bleiben',null,null,null,null,
  now()-interval '1 minute',now()+interval '1 day',null,null,null,'Test ansehen')`));
assert.equal(postRevokeDraft.status, "DRAFT");
assert.equal(postRevokeDraft.is_active, false);
denied(ownerAuth(`select public.publish_test_only_basic_offer(
  '${fixture.restaurant}','${postRevokeDraft.id}','${runtime.receipt_id}','DRAFT',${postRevokeDraft.publication_version},'${randomUUID()}')`),
  /TEST_ONLY_BASIC_OFFER_GRANT_INVALID/i);
denied(ownerAuth(`select public.get_today_restaurant_pin('${fixture.restaurant}')`),
  /RESTAURANT_NOT_OPERATIONAL|TEST_ONLY_BASIC_OPERATION_DENIED/i);
denied(ownerAuth(`select public.preview_restaurant_controlled_points('${fixture.restaurant}',
  'post-revoke-invalid-reference',1500)`), /RESTAURANT_NOT_OPERATIONAL|TEST_ONLY_BASIC_OPERATION_DENIED|PENDING_ACTIVATION_OPERATION_BLOCKED/i);
denied(ownerAuth(`select public.confirm_restaurant_controlled_points('${fixture.restaurant}',
  'post-revoke-invalid-reference',1500,'00000000','${randomUUID()}')`),
  /RESTAURANT_NOT_OPERATIONAL|TEST_ONLY_BASIC_OPERATION_DENIED|PENDING_ACTIVATION_OPERATION_BLOCKED|Restaurant wurde nicht gefunden/i);
assert.equal(json(customerAuth(`select public.get_public_restaurant_offers('${fixture.slug}',20)`)).length, 0);
const closedCustomerFlow = json(customerAuth(`select public.get_test_only_basic_customer_flow('${fixture.slug}')`));
assert.equal(closedCustomerFlow.active, false);
assert.equal(closedCustomerFlow.offers.length, 0);
assert.equal(sql(`select count(*) from public.test_only_basic_access_receipts where restaurant_id='${fixture.restaurant}'`), "2");
assert.equal(sql(`select count(*) from public.test_only_basic_access_audit where restaurant_id='${fixture.restaurant}'`), "2");
assert.equal(sql(`select count(*) from public.test_only_basic_offer_publication_receipts where restaurant_id='${fixture.restaurant}'`), "5");
assert.equal(sql(`select count(*) from public.test_only_basic_offer_publication_audit where restaurant_id='${fixture.restaurant}'`), "5");
assert.equal(sql(`select count(*) from public.restaurant_offers where restaurant_id='${fixture.restaurant}' and status='PUBLISHED'`), "5");
assert.equal(sql(`select count(*) from public.restaurant_offers where restaurant_id='${fixture.restaurant}' and status='DRAFT'`), "2");
assert.equal(sql(`select count(*) from public.audit_log where restaurant_id='${fixture.restaurant}'
  and event_type='TEST_ONLY_BASIC_OFFER_PUBLISHED'`), "5");
denied(`update public.test_only_basic_access_receipts set reason=reason where restaurant_id='${fixture.restaurant}'`,
  /BUSINESS_VERIFICATION_APPEND_ONLY/i);
denied(`delete from public.test_only_basic_access_audit where restaurant_id='${fixture.restaurant}'`,
  /BUSINESS_VERIFICATION_APPEND_ONLY/i);
assert.deepEqual(negativeState(), during);

console.log(JSON.stringify({
  status: "TEST_ONLY_BASIC_OPERATIONAL_LOCAL_PASS",
  project_ref: projectRef,
  restaurant_id: fixture.restaurant,
  grant_parallel: "1_WRITE_5_IDEMPOTENT",
  offers_visible_during_grant: visible.length,
  points_transaction_id: pointsWrite.transaction_id,
  points_parallel: "1_WRITE_5_IDEMPOTENT",
  points_idempotent_replay: true,
  expired_writer_matrix: "CLOSED",
  offer_publication_receipts: 5,
  offer_publication_audits: 5,
  post_revoke_writer_matrix: "CLOSED",
  revoked: true,
  real_activation: false,
  real_trial: false,
  real_entitlement: "NONE",
  mail_delta: 0,
  pro_inbox_delta: 0,
  catalog_access: false,
}));
