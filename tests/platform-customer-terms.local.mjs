// Opt-in, disposable and unlinked local stack only; never a hosted project.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

assert.equal(process.env.ALLOW_LOCAL_PLATFORM_TERMS_TESTS, "1");
const container = "supabase_db_wuxuai-test-only-join-20261005-local";
const host = !process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST
  ? process.env.DOCKER_HOST
  : execFileSync("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { encoding: "utf8" }).trim();
assert.ok(host.startsWith("unix://"), "local Unix-socket Docker daemon required");
const ports = JSON.parse(execFileSync("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", container], { encoding: "utf8" }));
assert.ok(ports["5432/tcp"].every((port) => port.HostPort === "56422"));
const sql = (query) => execFileSync("docker", ["exec", "-i", container,
  "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"],
{ input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000 }).trim();
const parallelSql = (query) => new Promise((resolve, reject) => {
  const child = spawn("docker", ["exec", "-i", container,
    "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"],
  { stdio: ["pipe", "pipe", "pipe"] });
  let output = "", error = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { error += chunk; });
  child.on("error", reject);
  child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
  child.stdin.end(query);
});
const id = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const claim = (who, aal = "aal1", issuer = "https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1") => quote(JSON.stringify({
  sub: who, role: "authenticated", iss: issuer, aal, session_id: id(31),
  amr: aal === "aal2" ? [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }] : [],
}));
const asUser = (who, query, aal = "aal1") => sql(`set role authenticated; set request.jwt.claims=${claim(who, aal)}; ${query}`);
const admin = (query) => asUser(id(1), query, "aal2");
const customer = (query) => asUser(id(70), query);
const result = (output) => JSON.parse(output.split("\n").at(-1));
let assertions = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); assertions += 1; }
function denied(query, actor = customer, pattern = /PLATFORM_TERMS_|CUSTOMER_AUTH_REQUIRED|permission denied/) {
  let error;
  try { actor(query); } catch (caught) { error = caught; }
  assert.ok(error, "unexpectedly accepted");
  assert.match(String(error.stderr ?? error.message), pattern);
  assertions += 1;
}

equal(sql("select count(*) from supabase_migrations.schema_migrations"), "199");
equal(sql("select count(*) from public.platform_legal_document_versions where review_status='DRAFT_LEGAL_REVIEW_REQUIRED'"), "7");
for (const table of ["platform_legal_document_versions", "platform_terms_test_identities",
  "platform_terms_test_publications", "platform_customer_terms_receipts"]) {
  equal(sql(`select has_table_privilege('authenticated','public.${table}','SELECT')`), "f");
  equal(sql(`select has_table_privilege('authenticated','public.${table}','INSERT')`), "f");
}
equal(sql("select has_function_privilege('anon','public.require_platform_terms_for_join_internal(uuid)','EXECUTE')"), "f");
for (const name of ["join_customer_account_restaurant", "join_authenticated_customer_referral",
  "register_restaurant_customer_legal", "register_referral_customer_legal"]) {
  equal(sql(`select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='${name}'
    and has_function_privilege('authenticated',oid,'EXECUTE')`), "0");
}
equal(sql("select has_function_privilege('anon','public.accept_platform_customer_terms(uuid,text,text,text,uuid)','EXECUTE')"), "f");
equal(sql("select has_function_privilege('anon','public.get_platform_customer_terms_receipt(uuid)','EXECUTE')"), "f");
equal(sql("select has_function_privilege('anon','public.join_customer_account_test_only_at_legal(text,uuid,boolean,boolean,text,text,uuid)','EXECUTE')"), "f");
equal(sql("select has_function_privilege('authenticated','public.join_customer_account_core_internal(text,text,text,boolean)','EXECUTE')"), "f");
for (const table of ["platform_test_join_permits", "customer_test_only_join_receipts"]) {
  equal(sql(`select has_table_privilege('authenticated','public.${table}','SELECT')`), "f");
  equal(sql(`select has_table_privilege('authenticated','public.${table}','INSERT')`), "f");
  equal(sql(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`), "t");
}
sql(`begin; ${readFileSync(new URL("at-legal-bundle-fixture.local.sql", import.meta.url), "utf8")} commit;`);
sql(`insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values('${id(70)}','authenticated','authenticated','synthetic-platform-customer@example.invalid','local-only',now(),
    '{"customer_first_name":"Synthetic","customer_phone":"+431234567890"}'::jsonb,now(),now()),
    ('${id(71)}','authenticated','authenticated','synthetic-foreign-customer@example.invalid','local-only',now(),
    '{"customer_first_name":"Foreign","customer_phone":"+431234567891"}'::jsonb,now(),now()),
    ('${id(72)}','authenticated','authenticated','synthetic-unaccepted-customer@example.invalid','local-only',now(),
    '{"customer_first_name":"Unaccepted","customer_phone":"+431234567892"}'::jsonb,now(),now());`);
equal(result(customer("select public.get_platform_customer_terms_status();")).status, "UNAVAILABLE");
denied("select public.ensure_authenticated_customer_account()", customer, /PLATFORM_TERMS_ACCEPTANCE_REQUIRED/);
const draftId = sql("select id from public.platform_legal_document_versions where document_type='platform_terms'");
denied(`select public.accept_platform_customer_terms('${draftId}',repeat('a',64),'de-AT','customer_registration','${id(99)}')`,
  customer, /PLATFORM_TERMS_DOCUMENT_STALE_OR_UNAVAILABLE/);
denied(`select public.accept_platform_customer_terms('${id(999)}',repeat('a',64),'de-AT','customer_registration','${id(100)}')`,
  customer, /PLATFORM_TERMS_DOCUMENT_STALE_OR_UNAVAILABLE/);
equal(sql("select count(*) from public.customer_accounts where auth_user_id='" + id(70) + "'"), "0");
const policyBefore = sql("select to_jsonb(p)::text from public.country_kyb_intake_policies p where country_code='AT'");
sql(`update public.business_verification_environment set environment='STAGING',change_ref='TEST_ONLY_LOCAL_197' where singleton;
  insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by)
  values('${id(3)}','SYNTHETIC LEGAL GATE','${id(2)}','${id(1)}','TEST_ONLY_LOCAL_PLATFORM_197','${id(1)}');`);
sql(`begin; set local session_replication_role=replica;
  insert into public.organizations(id,owner_id,name) values('${id(200)}','${id(1)}','FOREIGN SYNTHETIC');
  insert into public.restaurants(id,owner_id,name,slug,status,organization_id,activation_status)
  values('${id(201)}','${id(1)}','FOREIGN SYNTHETIC','foreign-synthetic','active','${id(200)}','pending_activation');
  insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city)
  values('${id(202)}','${id(200)}','${id(201)}','FOREIGN SYNTHETIC','foreign-main','AT','Test Road 2','1000','Test City');
  update public.restaurants set primary_branch_id='${id(202)}' where id='${id(201)}';
  insert into public.branch_subscriptions(id,organization_id,branch_id,status,subscription_status,plan_key,selected_plan,payment_status)
  values('${id(203)}','${id(200)}','${id(202)}','pending_activation','pending_activation','BASIC','BASIC','not_required');
  insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by)
  values('${id(201)}','FOREIGN SYNTHETIC','${id(200)}','${id(1)}','TEST_ONLY_FOREIGN_LOCAL','${id(1)}');
  commit;`);
denied(`select public.bind_platform_terms_test_identity('${id(3)}','${id(70)}','${id(101)}')`,
  customer, /LEGAL_BUNDLE_ACCESS_DENIED/);
equal(result(admin(`select public.bind_platform_terms_test_identity('${id(3)}','${id(70)}','${id(101)}');`)).idempotent, false);
equal(result(admin(`select public.bind_platform_terms_test_identity('${id(3)}','${id(70)}','${id(101)}');`)).idempotent, true);
equal(result(admin(`select public.bind_platform_terms_test_identity('${id(3)}','${id(72)}','${id(109)}');`)).branch_id, id(4));
const body = "TEST ONLY: Platform terms V01 for local synthetic account, no real legal approval.";
const provider = "TEST ONLY: Synthetic platform provider";
const hash = createHash("sha256").update(body, "utf8").digest("hex");
const published = result(admin(`select public.set_platform_terms_test_publication('${id(3)}','PUBLISH_TEST','TEST_ONLY_V01',
  ${quote(body)},${quote(provider)},null,'${id(102)}');`));
equal(published.sha256, hash);
equal(result(customer("select public.get_platform_customer_terms_status();")).status, "ACCEPTANCE_REQUIRED");
equal(result(asUser(id(71), "select public.get_platform_customer_terms_status();")).status, "UNAVAILABLE");
const joinWithoutReceipt = `select public.join_customer_account_restaurant_at_legal(
  'synthetic-legal-gate',true,true,null,null,'bundle-${"a".repeat(64)}','${id(106)}')`;
const referralWithoutReceipt = `select public.join_authenticated_customer_referral_at_legal(
  'synthetic-legal-gate','invalid',true,true,null,'bundle-${"a".repeat(64)}','${id(107)}')`;
const registerWithoutReceipt = `select public.register_restaurant_customer_at_legal(
  'synthetic-legal-gate','Synthetic','+431234567890',null,null,true,true,false,false,false,false,
  'bundle-${"a".repeat(64)}','${id(108)}')`;
for (const query of [joinWithoutReceipt, referralWithoutReceipt, registerWithoutReceipt]) {
  denied(query, customer, /PLATFORM_TERMS_ACCEPTANCE_REQUIRED/);
}
denied(`select public.accept_platform_customer_terms('${published.id}',repeat('f',64),'de-AT','customer_registration','${id(103)}')`,
  customer, /PLATFORM_TERMS_DOCUMENT_STALE_OR_UNAVAILABLE/);
denied(`select public.accept_platform_customer_terms('${published.id}',${quote(hash)},'de-AT','customer_registration','${id(103)}')`,
  (query) => asUser(id(71), query), /PLATFORM_TERMS_DOCUMENT_STALE_OR_UNAVAILABLE/);
equal(result(customer("select public.get_current_portal_access();")).customer_access, false);
const accepted = result(customer(`select public.accept_platform_customer_terms('${published.id}',${quote(hash)},
  'de-AT','customer_registration','${id(103)}');`));
equal(accepted.sha256, hash);
equal(accepted.idempotent, false);
equal(result(customer(`select public.accept_platform_customer_terms('${published.id}',${quote(hash)},
  'de-AT','customer_registration','${id(103)}');`)).idempotent, true);
const concurrentAcceptance = await Promise.all(Array.from({ length: 6 }, () =>
  parallelSql(`set role authenticated; set request.jwt.claims=${claim(id(70))};
    select public.accept_platform_customer_terms('${published.id}',${quote(hash)},
      'de-AT','customer_registration','${id(103)}');`)));
equal(concurrentAcceptance.length, 6);
equal(concurrentAcceptance.every((output) => result(output).idempotent === true), true);
equal(result(customer("select public.get_platform_customer_terms_status();")).receipt.request_id, id(103));
const receiptReadback = result(customer(`select public.get_platform_customer_terms_receipt('${id(103)}');`));
equal(receiptReadback.found, true);
equal(receiptReadback.document_id, published.id);
equal(receiptReadback.sha256, hash);
equal(result(asUser(id(71), `select public.get_platform_customer_terms_receipt('${id(103)}');`)).found, false);
const account = customer("select public.ensure_authenticated_customer_account();").split("\n").at(-1);
assert.match(account, /^[0-9a-f-]{36}$/); assertions += 1;
equal(result(admin(`select public.bind_platform_terms_test_identity('${id(3)}','${id(70)}','${id(101)}');`)).idempotent, true);
equal(result(customer("select public.get_current_portal_access();")).customer_access, true);
denied(`select public.join_customer_account_restaurant_at_legal('synthetic-legal-gate',
  true,true,null,null,'bundle-${"a".repeat(64)}','${id(106)}')`,
  customer, /PLATFORM_TERMS_TEST_TENANT_DENIED|CUSTOMER_LEGAL_BUNDLE_/);
equal(sql("select count(*) from public.customer_account_memberships"), "0");
equal(sql("select count(*) from public.points_transactions"), "0");
equal(sql("select count(*) from public.customer_rewards"), "0");
sql(`begin; set local session_replication_role=replica;
  insert into public.rewards(id,restaurant_id,organization_id,branch_id,title,category,is_starter_reward,active)
  values('${id(130)}','${id(3)}','${id(2)}','${id(4)}','TEST ONLY: Welcome drink','drink',true,true);
  commit;`);
const area = (name) => {
  const body = `TEST ONLY: ${name} for one synthetic local customer.`;
  return { status: "VERIFIED_TEST_ONLY", version: `TEST_ONLY_${name.toUpperCase()}_V01`,
    source: "TEST_ONLY_LOCAL", body, sha256: createHash("sha256").update(body).digest("hex") };
};
const manifest = { schema_version: "1", test_only: true, country: "AT", locale: "de-AT",
  restaurant_id: id(3), legal: area("legal"), privacy: area("privacy"),
  document_catalog: area("catalog"), retention: area("retention") };
const bundle = result(admin(`select public.set_platform_at_legal_synthetic_test_publication(
  '${id(3)}','PUBLISH_TEST',${quote(JSON.stringify(manifest))}::jsonb,'NOT_FOUND',null,'${id(120)}');`));
equal(bundle.test_only, true);
const testJoin = `select public.join_customer_account_test_only_at_legal(
  'synthetic-legal-gate','${id(4)}',true,true,${quote(bundle.bundle_id)},${quote(bundle.bundle_hash)},'${id(121)}');`;
const testJoinFor = (who, branch = id(4), bundleId = bundle.bundle_id, bundleHash = bundle.bundle_hash) =>
  `select public.join_customer_account_test_only_at_legal(
    'synthetic-legal-gate','${branch}',true,true,${quote(bundleId)},${quote(bundleHash)},'${id(122)}');`;
denied(testJoinFor(id(70), id(202)), customer, /TEST_ONLY_JOIN_SCOPE_DENIED/);
denied(testJoinFor(id(70), id(4), 'at-test-' + 'f'.repeat(64)), customer, /TEST_ONLY_JOIN_BUNDLE_STALE/);
denied(testJoinFor(id(70), id(4), bundle.bundle_id, 'f'.repeat(64)), customer, /TEST_ONLY_JOIN_BUNDLE_STALE/);
denied(testJoinFor(id(71)), (query) => asUser(id(71), query), /TEST_ONLY_JOIN_SCOPE_DENIED/);
denied(testJoinFor(id(72)), (query) => asUser(id(72), query), /PLATFORM_TERMS_ACCEPTANCE_REQUIRED/);
denied(testJoinFor(id(70)), (query) => sql(`set role authenticated;
  set request.jwt.claims=${claim(id(70), "aal1", "https://fuqhljgesclipzduhykl.supabase.co/auth/v1")}; ${query}`),
  /TEST_ONLY_JOIN_SCOPE_DENIED/);
denied(`select public.join_customer_account_test_only_at_legal(
  'missing-test-tenant','${id(4)}',true,true,${quote(bundle.bundle_id)},${quote(bundle.bundle_hash)},'${id(123)}')`,
  customer, /TEST_ONLY_JOIN_SCOPE_DENIED/);
denied(`select public.join_customer_account_test_only_at_legal(
  'foreign-synthetic','${id(202)}',true,true,${quote(bundle.bundle_id)},${quote(bundle.bundle_hash)},'${id(125)}')`,
  customer, /TEST_ONLY_JOIN_SCOPE_DENIED/);
denied(testJoinFor(id(70)), (query) => sql(`begin;
  update public.business_verification_environment set environment='DISABLED' where singleton;
  set role authenticated; set request.jwt.claims=${claim(id(70))}; ${query}`), /TEST_ONLY_JOIN_SCOPE_DENIED/);
denied(testJoinFor(id(70)), (query) => sql(`begin; set local session_replication_role=replica;
  update public.platform_test_tenant_registry set deleted_at=now() where restaurant_id='${id(3)}';
  set local session_replication_role=origin; set role authenticated;
  set request.jwt.claims=${claim(id(70))}; ${query}`), /TEST_ONLY_JOIN_SCOPE_DENIED/);
denied(`insert into public.customers(restaurant_id,name,phone,customer_code)
  values('${id(3)}','Outside Test Join','+431234567899','OUTSIDE-TEST')`,
  (query) => sql(`set role authenticated; set request.jwt.claims=${claim(id(70))}; ${query}`),
  /permission denied/);
denied(`insert into public.customers(restaurant_id,name,phone,customer_code)
  values('${id(3)}','Outside Test Join','+431234567899','OUTSIDE-TEST')`,
  (query) => sql(query), /PENDING_ACTIVATION_OPERATION_BLOCKED/);
const parallelJoin = await Promise.all(Array.from({ length: 6 }, () =>
  parallelSql(`set role authenticated; set request.jwt.claims=${claim(id(70))}; ${testJoin}`)));
const joinResults = parallelJoin.map(result);
equal(joinResults.filter((joined) => joined.joined === true).length, 1);
equal(joinResults.filter((joined) => joined.legal_receipt.idempotent === true).length, 5);
const firstJoin = joinResults.find((joined) => joined.joined === true);
equal(firstJoin.joined, true);
equal(firstJoin.legal_receipt.bundle_id, bundle.bundle_id);
equal(firstJoin.legal_receipt.legal_sha256, manifest.legal.sha256);
equal(firstJoin.legal_receipt.privacy_sha256, manifest.privacy.sha256);
equal(result(customer(testJoin)).legal_receipt.idempotent, true);
equal(sql("select count(*) from public.customer_account_memberships"), "1");
equal(sql("select count(*) from public.customer_test_only_join_receipts"), "1");
equal(sql("select count(*) from public.customers where is_test_customer and test_session_id='TEST_ONLY_LOCAL_PLATFORM_197'"), "1");
equal(sql("select count(*) from public.customer_rewards where is_starter_reward and status='locked'"), "1");
equal(result(customer(`select public.get_customer_test_only_join_receipt('${id(121)}');`)).bundle_hash, bundle.bundle_hash);
equal(result(asUser(id(71), `select public.get_customer_test_only_join_receipt('${id(121)}');`)).found, false);
equal(sql("select count(*) from public.points_transactions"), "0");
equal(sql("select count(*) from public.redemption_activity_journal"), "0");
equal(sql("select count(*) from public.coupon_redemptions"), "0");
equal(sql("select count(*) from public.basic_test_checkout_requests"), "0");
equal(sql("select count(*) from public.billing_checkout_blocked_requests"), "0");
equal(sql("select count(*) from public.customer_transactional_email_deliveries"), "0");
equal(sql("select count(*) from public.platform_test_join_permits"), "0");
equal(sql("select count(*) from public.platform_customer_terms_receipts where auth_user_id='" + id(70) + "'"), "1");
equal(sql("select count(*) from public.platform_legal_document_versions where published_at is not null"), "0");
const revisedBody = "TEST ONLY: revised synthetic local participation terms.";
const revisedManifest = { ...manifest, legal: { ...manifest.legal,
  version: "TEST_ONLY_LEGAL_V02", body: revisedBody,
  sha256: createHash("sha256").update(revisedBody).digest("hex") } };
const revisedBundle = result(admin(`select public.set_platform_at_legal_synthetic_test_publication(
  '${id(3)}','PUBLISH_TEST',${quote(JSON.stringify(revisedManifest))}::jsonb,
  'PUBLISHED_TEST',${quote(bundle.bundle_hash)},'${id(124)}');`));
equal(revisedBundle.test_only, true);
denied(testJoin, customer, /TEST_ONLY_JOIN_BUNDLE_STALE/);
equal(result(customer(`select public.get_customer_test_only_join_receipt('${id(121)}');`)).bundle_id, bundle.bundle_id);
const secondBody = "TEST ONLY: Platform terms V02 for local synthetic account, no real legal approval.";
const second = result(admin(`select public.set_platform_terms_test_publication('${id(3)}','PUBLISH_TEST','TEST_ONLY_V02',
  ${quote(secondBody)},${quote(provider)},'${published.id}','${id(104)}');`));
equal(result(customer("select public.get_platform_customer_terms_status();")).status, "ACCEPTANCE_REQUIRED");
equal(result(customer("select public.get_current_portal_access();")).customer_access, true);
denied(joinWithoutReceipt, customer, /PLATFORM_TERMS_ACCEPTANCE_REQUIRED/);
denied(referralWithoutReceipt, customer, /PLATFORM_TERMS_ACCEPTANCE_REQUIRED/);
denied(testJoin, customer, /PLATFORM_TERMS_ACCEPTANCE_REQUIRED/);
equal(result(customer(`select public.accept_platform_customer_terms('${published.id}',${quote(hash)},
  'de-AT','customer_registration','${id(103)}');`)).idempotent, true);
equal(result(customer(`select public.get_platform_customer_terms_receipt('${id(103)}');`)).document_id, published.id);
equal(result(customer("select public.get_customer_account();")).profile.first_name, "Synthetic");
const withdrawn = result(admin(`select public.set_platform_terms_test_publication('${id(3)}','WITHDRAW_TEST','TEST_ONLY_V02',
  ${quote(secondBody)},${quote(provider)},'${second.id}','${id(105)}');`));
equal(withdrawn.action, "WITHDRAW_TEST");
equal(result(customer("select public.get_platform_customer_terms_status();")).status, "UNAVAILABLE");
equal(sql("select count(*) from public.platform_customer_terms_receipts"), "1");
equal(sql("select to_jsonb(p)::text from public.country_kyb_intake_policies p where country_code='AT'"), policyBefore);
console.log(JSON.stringify({ status: "PASS", assertions, test_only: true, real_intake: "BLOCKED",
  membership_writes: 1, welcome_gifts: 1, cloud_requests: 0 }));
