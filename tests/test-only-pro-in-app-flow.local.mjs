// Opt-in disposable-stack proof. Never point this test at a hosted project.
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

assert.equal(process.env.ALLOW_LOCAL_TEST_ONLY_PRO_IN_APP, "1");
const root = new URL("..", import.meta.url).pathname;
const env = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" };
const run = (command, args) => String(execFileSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env })).trim();
const status = JSON.parse(run("npx", ["--no-install", "supabase", "status", "--output", "json"]));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
const psqlArgs = ["exec", "-i", "supabase_db_wuxuai-phase7b4d-local", "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const sql = (input) => execFileSync("docker", psqlArgs, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const asyncSql = (input) => new Promise((resolve, reject) => {
  const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] }); let output = ""; let error = "";
  child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { error += chunk; });
  child.once("close", code => code === 0 ? resolve(output.trim()) : reject(new Error(error.trim()))); child.stdin.end(input);
});
const q = value => `'${String(value).replaceAll("'", "''")}'`;
const json = input => JSON.parse(sql(input).split("\n").filter(Boolean).at(-1));
const denied = (input, pattern) => assert.throws(() => sql(input), error => pattern.test(String(error.stderr ?? error.message)));
const projectRef = "mbgveqbhessaunrhfudm";
const issuer = `https://${projectRef}.supabase.co/auth/v1`;
const baseFixture = json(`select jsonb_build_object(
  'restaurant',r.id,'organization',r.organization_id,'branch',r.primary_branch_id,'slug',r.slug,'owner',r.owner_id,
  'admin',(select user_id from public.platform_admins where active order by role desc,user_id limit 1),
  'admin_session',(select s.id from auth.sessions s join public.platform_admins a on a.user_id=s.user_id where a.active order by a.role desc,s.created_at desc limit 1),
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
const guest=randomUUID(); const guest_session=randomUUID(); const owner_session=randomUUID();
const guest_email=`synthetic-pro-inbox-${guest}@example.invalid`;
const fixture={...baseFixture,guest,guest_session,owner_session,guest_email,customer:null,account:null};
for (const key of ["restaurant","organization","branch","owner","admin","admin_session","guest","guest_session","owner_session"]) assert.match(fixture[key], /^[0-9a-f-]{36}$/i, key);
assert.match(fixture.platform_publication?.id,/^[0-9a-f-]{36}$/i);
assert.match(fixture.merchant_publication?.id,/^[0-9a-f-]{36}$/i);
sql(`insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
  values('${guest}','authenticated','authenticated',${q(guest_email)},'local-only',now(),
    ${q(JSON.stringify({customer_first_name:"Synthetic PRO",customer_phone:`+4367${String(Date.now()).slice(-9)}`}))}::jsonb,now(),now());
  insert into auth.sessions(id,user_id,aal,created_at,updated_at,refreshed_at) values
    ('${guest_session}','${guest}','aal1',now(),now(),now()),
    ('${owner_session}','${fixture.owner}','aal1',now(),now(),now());`);

const claims = ({ who, session, aal = "aal1", age = 0, jwtIssuer = issuer }) => JSON.stringify({
  sub: who, role: "authenticated", session_id: session, iss: jwtIssuer, aal,
  amr: aal === "aal2" ? [{ method: "totp", timestamp: Math.floor(Date.now()/1000)-age }] : [],
}).replaceAll("'", "''");
const asAuth = ({ who, session, aal = "aal1", age = 0, jwtIssuer = issuer }, statement) =>
  `begin; set local role authenticated; select set_config('request.jwt.claims','${claims({who,session,aal,age,jwtIssuer})}',true); ${statement}; commit;`;
const adminAuth = (statement, age=1) => asAuth({ who:fixture.admin, session:fixture.admin_session, aal:"aal2", age }, statement);
const ownerAuth = statement => asAuth({ who:fixture.owner, session:fixture.owner_session }, statement);
const guestAuth = statement => asAuth({ who:fixture.guest, session:fixture.guest_session }, statement);

json(adminAuth(`select public.bind_platform_terms_test_identity('${fixture.restaurant}','${fixture.guest}','${randomUUID()}')`));
json(guestAuth(`select public.accept_platform_customer_terms('${fixture.platform_publication.id}',
  '${fixture.platform_publication.sha256}','de-AT','customer_registration','${randomUUID()}')`));
sql(guestAuth("select public.ensure_authenticated_customer_account()"));
const joined=json(guestAuth(`select public.join_customer_account_test_only_at_legal(
  '${fixture.slug}','${fixture.branch}',true,true,'${fixture.merchant_publication.bundle_id}',
  '${fixture.merchant_publication.bundle_hash}','${randomUUID()}')`));
assert.equal(joined.joined,true); assert.equal(joined.test_only,true);
fixture.customer=sql(`select membership.customer_id from public.customer_account_memberships membership
  join public.customer_accounts account on account.id=membership.account_id
  where account.auth_user_id='${fixture.guest}' and membership.restaurant_id='${fixture.restaurant}'`);
fixture.account=sql(`select id from public.customer_accounts where auth_user_id='${fixture.guest}'`);
assert.match(fixture.customer,/^[0-9a-f-]{36}$/i); assert.match(fixture.account,/^[0-9a-f-]{36}$/i);

const counters = () => json(`select jsonb_build_object(
 'real_pro_grants',(select count(*) from public.commercial_pro_access_grants where restaurant_id='${fixture.restaurant}'),
 'real_inbox',(select count(*) from public.customer_pro_in_app_notifications where restaurant_id='${fixture.restaurant}'),
 'offer_mail',(select count(*) from public.customer_offer_email_deliveries where restaurant_id='${fixture.restaurant}'),
 'transactional_mail',(select count(*) from public.customer_transactional_email_deliveries where restaurant_id='${fixture.restaurant}'),
 'checkout',(select count(*) from public.basic_test_checkout_requests where restaurant_id='${fixture.restaurant}'),
 'trial',(select count(*) from public.billing_trial_claims where restaurant_id='${fixture.restaurant}'),
 'test_access',(select count(*) from public.test_only_pro_in_app_access_receipts where restaurant_id='${fixture.restaurant}'),
 'test_consent',(select count(*) from public.test_only_pro_in_app_consent_receipts where restaurant_id='${fixture.restaurant}'),
 'test_notifications',(select count(*) from public.test_only_pro_in_app_notifications where restaurant_id='${fixture.restaurant}'),
 'test_open',(select count(*) from public.test_only_pro_in_app_open_receipts where restaurant_id='${fixture.restaurant}')
);`);
const before = counters();
assert.deepEqual(Object.fromEntries(["real_pro_grants","real_inbox","offer_mail","transactional_mail","checkout","trial"].map(key=>[key,before[key]])), {
  real_pro_grants:0,real_inbox:0,offer_mail:0,transactional_mail:0,checkout:0,trial:0,
});

denied(adminAuth(`select public.get_platform_test_only_pro_in_app_access('${fixture.restaurant}')`, 601), /RECENT_PLATFORM_TOTP_REQUIRED/i);
denied(asAuth({who:fixture.admin,session:fixture.admin_session,aal:"aal2",jwtIssuer:"https://wrong.invalid/auth/v1"},
  `select public.get_platform_test_only_pro_in_app_access('${fixture.restaurant}')`), /PROJECT_BINDING_REQUIRED/i);
for (const table of ["test_only_pro_in_app_access_receipts","test_only_pro_in_app_access_audit","test_only_pro_in_app_consent_receipts","test_only_pro_in_app_notifications","test_only_pro_in_app_notification_audit","test_only_pro_in_app_open_receipts"]) {
  assert.equal(sql(`select has_table_privilege('authenticated','public.${table}','SELECT')`), "f", table);
  assert.equal(sql(`select has_table_privilege('authenticated','public.${table}','INSERT')`), "f", table);
}

const basicClosed = json(adminAuth(`select public.get_platform_test_only_basic_access('${fixture.restaurant}')`));
assert.equal(basicClosed.active,false);
const basicGrantRequest=randomUUID();
const basicGrant=json(adminAuth(`select public.decide_platform_test_only_basic_access('${fixture.restaurant}','GRANT',
 '${basicClosed.snapshot_sha256}',${basicClosed.previous_receipt_id ? `'${basicClosed.previous_receipt_id}'` : "null"},now()+interval '1 hour','Synthetic PRO inbox publication prerequisite',
 'TEST_ONLY BASIC GRANT ${fixture.restaurant}','${basicGrantRequest}')`));
assert.equal(basicGrant.synthetic_test_only,true);

const initial=json(adminAuth(`select public.get_platform_test_only_pro_in_app_access('${fixture.restaurant}')`));
assert.equal(initial.active,false); assert.equal(initial.real_pro_entitlement,false); assert.equal(initial.consent_active,false);
sql(`create function public.local_reject_test_only_pro_audit() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_PRO_AUDIT_FAILURE'; end$$;
create trigger reject_test_only_pro_audit before insert on public.test_only_pro_in_app_access_audit for each row execute function public.local_reject_test_only_pro_audit();`);
denied(adminAuth(`select public.decide_platform_test_only_pro_in_app_access('${fixture.restaurant}','GRANT','${initial.snapshot_sha256}',null,
 now()+interval '30 minutes','Synthetic rollback proof','TEST_ONLY PRO IN_APP GRANT ${fixture.restaurant}','${randomUUID()}')`), /SYNTHETIC_PRO_AUDIT_FAILURE/i);
assert.equal(sql(`select count(*) from public.test_only_pro_in_app_access_receipts where restaurant_id='${fixture.restaurant}'`),"0");
sql("drop trigger reject_test_only_pro_audit on public.test_only_pro_in_app_access_audit; drop function public.local_reject_test_only_pro_audit();");

const grantRequest=randomUUID();
const grantExpiresAt=new Date(Date.now()+30*60*1000).toISOString();
const grantSql=adminAuth(`select public.decide_platform_test_only_pro_in_app_access('${fixture.restaurant}','GRANT','${initial.snapshot_sha256}',null,
 '${grantExpiresAt}'::timestamptz,'Synthetic PRO inbox local flow','TEST_ONLY PRO IN_APP GRANT ${fixture.restaurant}','${grantRequest}')`);
const parallel=await Promise.all(Array.from({length:4},()=>asyncSql(grantSql)));
const grants=parallel.map(output=>JSON.parse(output.split("\n").filter(line=>line.startsWith("{")).at(-1)));
assert.equal(grants.filter(row=>row.idempotent===false).length,1);
assert.equal(grants.filter(row=>row.idempotent===true).length,3);
assert.equal(new Set(grants.map(row=>row.receipt_id)).size,1);
denied(grantSql.replace("Synthetic PRO inbox local flow","Changed replay payload"), /TEST_ONLY_PRO_IN_APP_REPLAY_CONFLICT/i);
const active=json(adminAuth(`select public.get_platform_test_only_pro_in_app_access('${fixture.restaurant}')`));
assert.equal(active.active,true); assert.equal(active.consent_active,false);

const published=json(`select coalesce(jsonb_agg(id order by published_at,id),'[]'::jsonb) from public.restaurant_offers
 where restaurant_id='${fixture.restaurant}' and status='PUBLISHED' and is_active and valid_to>now();`);
for (const id of published.slice(0,2)) json(ownerAuth(`select public.change_restaurant_offer_status('${fixture.restaurant}','${id}','DISABLE')`));
const createDraft = title => json(ownerAuth(`select public.save_restaurant_offer('${fixture.restaurant}',null,'${fixture.branch}',
 'NEWS',${q(title)},'Synthetischer PRO-In-App-Test',null,null,null,null,now()-interval '1 minute',now()+interval '1 day',null,null,null,'Test ansehen')`));
const publish = offer => ownerAuth(`select public.publish_test_only_basic_offer('${fixture.restaurant}','${offer.id}',
 '${basicGrant.receipt_id}','DRAFT',${offer.publication_version},'${randomUUID()}')`);
const noConsent=createDraft("TEST_ONLY PRO ohne Einwilligung");
json(publish(noConsent));
assert.equal(sql(`select count(*) from public.test_only_pro_in_app_notifications where restaurant_id='${fixture.restaurant}'`),"0");

const consentRequest=randomUUID();
const consentSql=guestAuth(`select public.set_test_only_pro_in_app_consent('${fixture.restaurant}','ACCEPT','TEST_ONLY_PRO_IN_APP_V1',
 '91ef364b74afdb9884feed55c712692181fbf70bbd3df58b325947a68dd7ad97','${consentRequest}')`);
const consent=json(consentSql); assert.equal(consent.consent_active,true);
assert.equal(json(consentSql).idempotent,true);
const offer=createDraft("TEST_ONLY PRO E2E 2026-10-13");
sql(`create function public.local_reject_test_only_pro_notification_audit() returns trigger language plpgsql as
  $$begin raise exception 'SYNTHETIC_PRO_NOTIFICATION_AUDIT_FAILURE'; end$$;
  create trigger reject_test_only_pro_notification_audit before insert on public.test_only_pro_in_app_notification_audit
  for each row execute function public.local_reject_test_only_pro_notification_audit();`);
denied(ownerAuth(`select public.publish_test_only_basic_offer('${fixture.restaurant}','${offer.id}',
  '${basicGrant.receipt_id}','DRAFT',${offer.publication_version},'${randomUUID()}')`), /SYNTHETIC_PRO_NOTIFICATION_AUDIT_FAILURE/i);
assert.equal(sql(`select status from public.restaurant_offers where id='${offer.id}'`),"DRAFT");
assert.equal(sql(`select count(*) from public.test_only_pro_in_app_notifications where restaurant_id='${fixture.restaurant}'`),"0");
sql("drop trigger reject_test_only_pro_notification_audit on public.test_only_pro_in_app_notification_audit; drop function public.local_reject_test_only_pro_notification_audit();");
const publishRequest=randomUUID();
const publishSql=ownerAuth(`select public.publish_test_only_basic_offer('${fixture.restaurant}','${offer.id}',
 '${basicGrant.receipt_id}','DRAFT',${offer.publication_version},'${publishRequest}')`);
const publication=json(publishSql); assert.equal(publication.synthetic_test_only,true);
assert.equal(json(publishSql).idempotent,true);
assert.equal(sql(`select count(*) from public.test_only_pro_in_app_notifications where restaurant_id='${fixture.restaurant}'`),"1");
assert.equal(sql(`select count(*) from public.test_only_pro_in_app_notification_audit where restaurant_id='${fixture.restaurant}'`),"1");
assert.equal(sql(`select count(*) from public.customer_pro_in_app_notifications where restaurant_id='${fixture.restaurant}'`),"0");
const notificationId=sql(`select id from public.test_only_pro_in_app_notifications where restaurant_id='${fixture.restaurant}' limit 1`);
assert.match(notificationId,/^[0-9a-f-]{36}$/i);
denied(guestAuth(`select public.get_test_only_pro_in_app_inbox((select id from public.restaurants where id<>'${fixture.restaurant}' limit 1))`), /TEST_ONLY_PRO_IN_APP_ACCESS_DENIED|TEST_ONLY_PRO_IN_APP_GUEST_DENIED/i);

function jwt(payload) { const header=Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"); const body=Buffer.from(JSON.stringify(payload)).toString("base64url"); const signature=createHmac("sha256",status.JWT_SECRET).update(`${header}.${body}`).digest("base64url"); return `${header}.${body}.${signature}`; }
const now=Math.floor(Date.now()/1000);
const accessToken=jwt({aud:"authenticated",exp:now+3600,iat:now,iss:issuer,sub:fixture.guest,email:fixture.guest_email,role:"authenticated",aal:"aal1",session_id:fixture.guest_session,amr:[{method:"password",timestamp:now-60}]});
const session={access_token:accessToken,refresh_token:"local-test-only-pro-inbox",expires_in:3600,expires_at:now+3600,token_type:"bearer",user:{id:fixture.guest,aud:"authenticated",role:"authenticated",email:fixture.guest_email,app_metadata:{provider:"email",providers:["email"]},user_metadata:{},identities:[],created_at:new Date().toISOString()}};
let server;
try {
  server=spawn(process.execPath,["node_modules/vite/bin/vite.js","--host","127.0.0.1","--port","56139","--strictPort"],{cwd:root,env:{...env,VITE_SUPABASE_URL:status.API_URL,VITE_SUPABASE_ANON_KEY:status.ANON_KEY,VITE_PLATFORM_TEST_CONTROL_ENABLED:"true"},stdio:"ignore"});
  for(let i=0;i<100;i+=1){try{if((await fetch("http://127.0.0.1:56139")).ok)break;}catch{} await new Promise(resolve=>setTimeout(resolve,100));}
  for (const [engine,launcher] of [["chromium",chromium],["webkit",webkit]]) {
    const browser=await launcher.launch({headless:true}); const context=await browser.newContext({viewport:{width:390,height:900}});
    await context.route("**/*",route=>["127.0.0.1","localhost"].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    await context.addInitScript(value=>{localStorage.setItem("sb-127-auth-token",JSON.stringify(value));localStorage.setItem("wuxuai.ui-language","de");},session);
    const page=await context.newPage(); await page.goto(`http://127.0.0.1:56139/customer/test-only-pro-inbox/${fixture.restaurant}`,{waitUntil:"networkidle"});
    const body=page.getByTestId("test-only-pro-inbox-page"); await body.waitFor({timeout:20000});
    if(engine==="chromium"){
      await body.getByText("1 ungelesen",{exact:true}).waitFor();
      await body.getByRole("button",{name:"Öffnen und als gelesen markieren"}).click();
      await body.getByText("0 ungelesen",{exact:true}).waitFor(); await page.reload({waitUntil:"networkidle"});
      await body.getByText("Gelesen",{exact:true}).waitFor();
    } else {
      await body.getByText("0 ungelesen",{exact:true}).waitFor(); await body.getByText("Gelesen",{exact:true}).waitFor();
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`${engine} mobile overflow`);
    await context.close(); await browser.close();
  }
} finally { if(server&&!server.killed)server.kill("SIGTERM"); }
assert.equal(sql(`select count(*) from public.test_only_pro_in_app_open_receipts where restaurant_id='${fixture.restaurant}'`),"1");
const openRequest=sql(`select request_id from public.test_only_pro_in_app_open_receipts where restaurant_id='${fixture.restaurant}' limit 1`);
const openReplay=json(guestAuth(`select public.open_test_only_pro_in_app_notification('${fixture.restaurant}','${notificationId}','${openRequest}')`));
assert.equal(openReplay.idempotent,true);

// An expired receipt must close every customer read without mutating the durable history.
denied(`begin;
  insert into public.test_only_pro_in_app_access_receipts(
    id,restaurant_id,organization_id,branch_id,customer_id,account_id,guest_auth_user_id,
    action,actor_id,request_id,previous_receipt_id,
    starts_at,expires_at,reason,snapshot,snapshot_sha256,decision_payload,auth_evidence,
    result,receipt_sha256,created_at
  )
  select gen_random_uuid(),restaurant_id,organization_id,branch_id,customer_id,account_id,guest_auth_user_id,
    'GRANT',actor_id,gen_random_uuid(),id,
    now()-interval '2 hours',now()-interval '1 hour','Synthetic expiry proof',snapshot,snapshot_sha256,
    decision_payload,auth_evidence,result,repeat('e',64),clock_timestamp()+interval '1 second'
  from public.test_only_pro_in_app_access_receipts
  where id='${active.previous_receipt_id}';
  ${asAuth({ who:fixture.guest, session:fixture.guest_session }, `select public.get_test_only_pro_in_app_inbox('${fixture.restaurant}')`).replace(/^begin;|commit;$/g, "")}
  rollback;`, /TEST_ONLY_PRO_IN_APP_ACCESS_DENIED/i);
assert.equal(sql(`select count(*) from public.test_only_pro_in_app_notifications where restaurant_id='${fixture.restaurant}'`),"1");

const revoke=json(adminAuth(`select public.decide_platform_test_only_pro_in_app_access('${fixture.restaurant}','REVOKE','${active.snapshot_sha256}',
 '${active.previous_receipt_id}',null,'Synthetic PRO inbox local revoke','TEST_ONLY PRO IN_APP REVOKE ${fixture.restaurant}','${randomUUID()}')`));
assert.equal(revoke.action,"REVOKE");
denied(guestAuth(`select public.get_test_only_pro_in_app_inbox('${fixture.restaurant}')`), /TEST_ONLY_PRO_IN_APP_ACCESS_DENIED/i);
denied(guestAuth(`select public.open_test_only_pro_in_app_notification('${fixture.restaurant}',
 '${notificationId}','${randomUUID()}')`), /TEST_ONLY_PRO_IN_APP_ACCESS_DENIED/i);
const basicActive=json(adminAuth(`select public.get_platform_test_only_basic_access('${fixture.restaurant}')`));
json(adminAuth(`select public.decide_platform_test_only_basic_access('${fixture.restaurant}','REVOKE','${basicActive.snapshot_sha256}',
 '${basicActive.previous_receipt_id}',null,'Close synthetic publication prerequisite','TEST_ONLY BASIC REVOKE ${fixture.restaurant}','${randomUUID()}')`));

const after=counters();
for(const key of ["real_pro_grants","real_inbox","offer_mail","transactional_mail","checkout","trial"]) assert.equal(after[key],before[key],key);
assert.equal(after.test_access-before.test_access,2); assert.equal(after.test_consent-before.test_consent,1);
assert.equal(after.test_notifications-before.test_notifications,1); assert.equal(after.test_open-before.test_open,1);
assert.equal(sql("select count(*) from cron.job where command ilike '%test_only_pro_in_app%'"),"0");
console.log(JSON.stringify({status:"TEST_ONLY_PRO_IN_APP_LOCAL_CODE_LOCK_PASS",project_ref:projectRef,
  grant_parallel:"1_WRITE_3_IDEMPOTENT",notifications:1,notification_audits:1,open_receipts:1,
  browser:["chromium","webkit"],reload_read_status:true,no_consent_no_notification:true,
  foreign_tenant:"DENIED",post_revoke:"CLOSED",real_pro_delta:0,email_delta:0,checkout_delta:0,trial_delta:0}));
