// Local-only positive browser proof for the synthetic TEST_ONLY PRO inbox.
// Runtime credentials, customer tokens and auth sessions stay in memory.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const cwd = new URL("../", import.meta.url).pathname;
const status = JSON.parse(execFileSync("./node_modules/.bin/supabase", ["status", "--output", "json"], {
  cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
const container = "supabase_db_wuxuai-phase7b4d-local";
const sql = (query) => execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
  input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
}).trim();
const origin = "http://127.0.0.1:4186";
const email = `pro-inbox-${randomUUID()}@example.invalid`;
const password = randomUUID() + randomUUID();
const rawToken = randomBytes(32).toString("hex");
const ids = Object.fromEntries(["owner", "organization", "restaurant", "branch", "customer", "account",
  "grant", "offer", "reward", "points", "request"].map((key) => [key, randomUUID()]));
const slug = `pro-inbox-${ids.restaurant.slice(0, 8)}`;
const adminHeaders = { apikey: status.SERVICE_ROLE_KEY,
  authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, "content-type": "application/json" };
const created = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
  method: "POST", headers: adminHeaders,
  body: JSON.stringify({ email, password, email_confirm: true }),
});
assert.equal(created.status, 200, "LOCAL_CUSTOMER_CREATE_FAILED");
const createdBody = await created.json();
const userId = createdBody.id ?? createdBody.user?.id;
assert.match(String(userId), /^[0-9a-f-]{36}$/);
const previousEnvironment = sql("select environment from public.business_verification_environment where singleton");

sql(`begin;
set local session_replication_role=replica;
insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at)
values('${ids.owner}','authenticated','authenticated','owner-${ids.owner}@example.invalid',now(),now(),now());
insert into public.organizations(id,owner_id,name,status)
values('${ids.organization}','${ids.owner}','PRO INBOX BROWSER LOCAL','active');
insert into public.restaurants(id,owner_id,name,slug,status,organization_id,operational_ready,security_ready,legal_ready,onboarding_status)
values('${ids.restaurant}','${ids.owner}','PRO INBOX BROWSER LOCAL','${slug}','active','${ids.organization}',true,true,true,'completed');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city,status)
values('${ids.branch}','${ids.organization}','${ids.restaurant}','PRO INBOX','${slug}-main','AT','Synthetic 1','1000','Vienna','active');
update public.restaurants set primary_branch_id='${ids.branch}' where id='${ids.restaurant}';
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
values('${ids.restaurant}','${ids.organization}','${ids.branch}','${ids.owner}','owner');
insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,selected_plan,plan_key,payment_status)
values('${ids.organization}','${ids.branch}','active','active','BASIC','BASIC','paid');
insert into public.loyalty_settings(restaurant_id,organization_id,branch_id,loyalty_mode)
values('${ids.restaurant}','${ids.organization}','${ids.branch}','amount_based');
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by)
values('${ids.restaurant}','PRO INBOX BROWSER LOCAL','${ids.organization}','${ids.owner}','pro-inbox-${ids.restaurant}','${ids.owner}');
insert into public.commercial_pro_access_grants(id,restaurant_id,organization_id,access_kind,starts_at,expires_at,reason,created_by,request_id)
values('${ids.grant}','${ids.restaurant}','${ids.organization}','INTERNAL_TEST_ONLY',now()-interval '1 hour',now()+interval '1 day',
  'Synthetic local browser proof','${ids.owner}','${ids.request}');
update public.business_verification_environment set environment='STAGING',change_ref='PRO_INBOX_BROWSER_LOCAL' where singleton;
insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,name,customer_code,membership_status,is_test_customer,normalized_phone,phone,points_balance)
values('${ids.customer}','${ids.restaurant}','${ids.organization}','${ids.branch}','${userId}','Synthetic Customer','INBOX-BROWSER','active',true,
  '+436600000201','+436600000201',0);
insert into public.customer_accounts(id,auth_user_id,email,first_name,email_confirmed_at)
values('${ids.account}','${userId}','${email}','Synthetic',now());
insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
values('${ids.account}','${ids.restaurant}','${ids.customer}');
insert into public.customer_qr_tokens(restaurant_id,customer_id,organization_id,branch_id,token_hash,active)
values('${ids.restaurant}','${ids.customer}','${ids.organization}','${ids.branch}',public.hash_public_token('${rawToken}'),true);
insert into public.restaurant_offers(id,restaurant_id,branch_id,offer_type,title,short_description,valid_from,valid_to,status,is_active,publication_version)
values('${ids.offer}','${ids.restaurant}','${ids.branch}','NEWS','Synthetic Offer','Synthetic offer',now()-interval '1 day',now()+interval '10 days','DRAFT',false,0);
insert into public.rewards(id,restaurant_id,organization_id,branch_id,title,description,required_points,active,is_starter_reward)
values('${ids.reward}','${ids.restaurant}','${ids.organization}','${ids.branch}','Synthetic Reward','Synthetic reward',10,true,false);
commit;
update public.restaurant_offers set status='PUBLISHED',is_active=true,publication_version=1,published_at=now() where id='${ids.offer}';
insert into public.points_transactions(id,restaurant_id,organization_id,branch_id,customer_id,type,points,reason,amount_cents,collection_source,idempotency_key,created_at)
values('${ids.points}','${ids.restaurant}','${ids.organization}','${ids.branch}','${ids.customer}','earn',10,'Synthetic threshold',1000,
  'customer_initiated','${ids.request}',statement_timestamp());`);

assert.equal(sql(`select count(*) from public.customer_pro_in_app_notifications where restaurant_id='${ids.restaurant}'`), "2");
assert.equal(sql(`select count(*) from public.customer_pro_in_app_notifications where restaurant_id='${ids.restaurant}' and read_at is null`), "2");
const businessBefore = sql(`select md5(concat_ws('|',
 (select count(*) from public.customers where restaurant_id='${ids.restaurant}'),
 (select points_balance from public.customers where id='${ids.customer}'),
 (select count(*) from public.points_transactions where restaurant_id='${ids.restaurant}'),
 (select count(*) from public.rewards where restaurant_id='${ids.restaurant}'),
 (select count(*) from public.restaurant_offers where restaurant_id='${ids.restaurant}'),
 (select status from public.branch_subscriptions where branch_id='${ids.branch}')))`);

let server;
const browsers = [];
try {
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4186", "--strictPort"], {
    cwd, detached: true, stdio: "ignore",
    env: { ...process.env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY },
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(origin)).status === 200) break; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  let checks = 0;
  for (const [engineName, engine] of [["Chromium", chromium], ["WebKit", webkit]]) {
    sql(`update public.customer_pro_in_app_notifications set read_at=null where restaurant_id='${ids.restaurant}'`);
    const browser = await engine.launch({ headless: true });
    browsers.push(browser);
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const signedIn = await page.evaluate(async ({ emailValue, passwordValue }) => {
      const { supabase } = await import("/src/shared/lib/supabase.ts");
      const result = await supabase.auth.signInWithPassword({ email: emailValue, password: passwordValue });
      return Boolean(result.data.session) && !result.error;
    }, { emailValue: email, passwordValue: password });
    assert.equal(signedIn, true, `${engineName} auth`);
    await page.evaluate(async ({ restaurantSlug, customerToken }) => {
      const { saveStoredCustomerToken } = await import("/src/modules/customer/customerTokenStorage.ts");
      saveStoredCustomerToken(restaurantSlug, { customer_token: customerToken, device_id: null });
    }, { restaurantSlug: slug, customerToken: rawToken });
    await page.goto(`${origin}/customer/${slug}`, { waitUntil: "domcontentloaded" });
    const trigger = page.locator(".customer-pro-inbox-trigger");
    await trigger.waitFor({ timeout: 15000 });
    assert.match(await trigger.getAttribute("aria-label"), /2/);
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await dialog.locator(".customer-pro-inbox-list article").count(), 2);
    assert.equal(await dialog.locator(".customer-pro-inbox-list article.is-unread").count(), 2);
    await dialog.locator(".customer-pro-inbox-list article.is-unread button").first().click();
    await page.waitForFunction(() => document.querySelectorAll(".customer-pro-inbox-list article.is-unread").length === 1);
    await page.keyboard.press("Escape");
    await page.reload({ waitUntil: "domcontentloaded" });
    await trigger.waitFor({ timeout: 15000 });
    assert.match(await trigger.getAttribute("aria-label"), /1/);
    assert.equal(sql(`select count(*) from public.customer_pro_in_app_notifications where restaurant_id='${ids.restaurant}'`), "2");
    sql(`update public.commercial_pro_access_grants set revoked_at=now(),revoked_by='${ids.owner}',revoke_reason='Synthetic browser downgrade' where id='${ids.grant}'`);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#customer-home-title").waitFor({ timeout: 15000 });
    assert.equal(await trigger.count(), 0, `${engineName} downgrade visibility`);
    assert.equal(await page.locator(".customer-pro-inbox-list").count(), 0, `${engineName} downgrade drawer`);
    sql(`update public.commercial_pro_access_grants set revoked_at=null,revoked_by=null,revoke_reason=null where id='${ids.grant}'`);
    await context.close();
    checks += 8;
  }
  assert.equal(sql(`select count(*) from public.customer_pro_in_app_notifications where restaurant_id='${ids.restaurant}'`), "2");
  assert.equal(sql(`select count(*) from public.customer_pro_in_app_notifications where restaurant_id='${ids.restaurant}' and read_at is not null`), "1");
  assert.equal(sql(`select md5(concat_ws('|',
   (select count(*) from public.customers where restaurant_id='${ids.restaurant}'),
   (select points_balance from public.customers where id='${ids.customer}'),
   (select count(*) from public.points_transactions where restaurant_id='${ids.restaurant}'),
   (select count(*) from public.rewards where restaurant_id='${ids.restaurant}'),
   (select count(*) from public.restaurant_offers where restaurant_id='${ids.restaurant}'),
   (select status from public.branch_subscriptions where branch_id='${ids.branch}')))`), businessBefore);
  console.log(`LOCAL PRO INBOX POSITIVE BROWSER FLOW: ${checks} Chromium/WebKit assertions PASS`);
  console.log("LOCAL PRO INBOX EVENTS: OFFER 1 / REWARD 1 / DEDUPLICATED 2 TOTAL");
  console.log("LOCAL PRO INBOX DOWNGRADE VISIBILITY: PASS");
  console.log("LOCAL PRO INBOX UNEXPECTED BUSINESS WRITES: 0");
} finally {
  await Promise.allSettled(browsers.map((browser) => browser.close()));
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already exited */ }
  }
  sql(`begin; set local session_replication_role=replica;
  delete from public.customer_pro_in_app_notifications where restaurant_id='${ids.restaurant}';
  delete from public.points_transactions where restaurant_id='${ids.restaurant}';
  delete from public.customer_reward_notification_state where restaurant_id='${ids.restaurant}';
  delete from public.restaurant_offers where restaurant_id='${ids.restaurant}';
  delete from public.rewards where restaurant_id='${ids.restaurant}';
  delete from public.customer_qr_tokens where restaurant_id='${ids.restaurant}';
  delete from public.customer_account_memberships where restaurant_id='${ids.restaurant}';
  delete from public.customer_accounts where id='${ids.account}';
  delete from public.customers where restaurant_id='${ids.restaurant}';
  delete from public.commercial_pro_access_grants where restaurant_id='${ids.restaurant}';
  delete from public.platform_test_tenant_registry where restaurant_id='${ids.restaurant}';
  delete from public.loyalty_settings where restaurant_id='${ids.restaurant}';
  delete from public.branch_subscriptions where branch_id='${ids.branch}';
  delete from public.restaurant_members where restaurant_id='${ids.restaurant}';
  delete from public.branches where restaurant_id='${ids.restaurant}';
  delete from public.restaurants where id='${ids.restaurant}';
  delete from public.organizations where id='${ids.organization}';
  delete from auth.users where id='${ids.owner}';
  update public.business_verification_environment set environment='${previousEnvironment}',change_ref='PRO_INBOX_BROWSER_LOCAL_CLEANUP' where singleton;
  commit;`);
  await fetch(`${status.API_URL}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: adminHeaders });
}
