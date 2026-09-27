import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const status = JSON.parse(execFileSync("npx", ["--no-install", "supabase", "status", "--output", "json"], {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" },
}));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
const dbContainer = "supabase_db_wuxuai-phase7b4d-local";
const sql = (input) => execFileSync("docker", ["exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
  input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
}).trim();
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replace(/=+$/u, "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid local TOTP secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const fixture = {
  organization: randomUUID(), restaurant: randomUUID(), branch: randomUUID(), caseId: randomUUID(),
};
const password = randomBytes(24).toString("base64url");
const users = {};
let browser;
let server;
let documentId;
let objectName;
let checks = 0;

try {
  for (const role of ["admin", "owner", "staff", "customer"]) {
    const created = await service.auth.admin.createUser({ email: `kyb-phase3-${role}-${randomUUID()}@example.invalid`, password, email_confirm: true });
    assert.ifError(created.error);
    users[role] = created.data.user.id;
  }
  sql(`begin; set local session_replication_role=replica;
    insert into public.platform_admins(user_id,role,active) values(${q(users.admin)},'platform_admin',true);
    insert into public.organizations(id,owner_id,name) values(${q(fixture.organization)},${q(users.owner)},'KYB PHASE 3 SYNTHETIC');
    insert into public.restaurants(id,owner_id,name,slug,organization_id,activation_status)
      values(${q(fixture.restaurant)},${q(users.owner)},'KYB PHASE 3 SYNTHETIC',${q(`kyb-phase3-${fixture.restaurant.slice(0, 8)}`)},${q(fixture.organization)},'pending_activation');
    insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city)
      values(${q(fixture.branch)},${q(fixture.organization)},${q(fixture.restaurant)},'KYB PHASE 3 SYNTHETIC',${q(`kyb-phase3-${fixture.branch.slice(0, 8)}`)},'AT','Synthetic Road 1','1000','Synthetic City');
    update public.restaurants set primary_branch_id=${q(fixture.branch)} where id=${q(fixture.restaurant)};
    insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role) values
      (${q(fixture.restaurant)},${q(fixture.organization)},${q(fixture.branch)},${q(users.owner)},'owner'),
      (${q(fixture.restaurant)},${q(fixture.organization)},${q(fixture.branch)},${q(users.staff)},'staff');
    insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,selected_plan,plan_key,payment_status)
      values(${q(fixture.organization)},${q(fixture.branch)},'pending_activation','pending_activation','BASIC','BASIC','not_required');
    insert into public.business_verification_cases(id,restaurant_id,country_code,verification_method,status,created_by)
      values(${q(fixture.caseId)},${q(fixture.restaurant)},'AT','MANUAL','PENDING_ACTIVATION',${q(users.owner)});
    insert into public.business_verified_profile_revisions(case_id,revision,legal_name,legal_form,business_street,business_postal_code,business_city,business_country,status,decision_ref,created_by)
      values(${q(fixture.caseId)},1,'KYB Phase 3 Synthetic GmbH','GmbH','Synthetic Road 1','1000','Synthetic City','AT','REVIEWED_DRAFT',gen_random_uuid(),${q(users.owner)});
    commit;`);

  const clients = {};
  for (const role of ["admin", "owner", "staff", "customer"]) {
    clients[role] = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  // Sign in by looking up the synthetic addresses without exposing them in output.
  const emails = {};
  for (const role of ["admin", "owner", "staff", "customer"]) {
    const lookup = await service.auth.admin.getUserById(users[role]);
    assert.ifError(lookup.error); emails[role] = lookup.data.user.email;
    const signedIn = await clients[role].auth.signInWithPassword({ email: emails[role], password });
    assert.ifError(signedIn.error);
  }

  const ownerReserve = await clients.owner.rpc("reserve_business_verification_document_upload", {
    input_restaurant_id: fixture.restaurant, input_document_type: "GISA_EXTRACT",
    input_mime_type: "application/pdf", input_request_id: randomUUID(), input_correlation_id: randomUUID(),
  });
  assert.ifError(ownerReserve.error);
  documentId = ownerReserve.data.document_id; objectName = ownerReserve.data.object_name;
  const content = new TextEncoder().encode("synthetic-local-kyb-phase-3");
  assert.ifError((await clients.owner.storage.from("business-verification-documents").upload(objectName, content, { contentType: "application/pdf", upsert: false })).error);
  assert.ifError((await clients.owner.rpc("complete_business_verification_document_upload", {
    input_document_id: documentId, input_content_sha256: createHash("sha256").update(content).digest("hex"),
    input_request_id: randomUUID(), input_correlation_id: randomUUID(),
  })).error);

  assert.ok((await clients.admin.rpc("list_platform_kyb_review_queue")).error, "AAL1 admin must be blocked");
  for (const role of ["owner", "staff", "customer"]) assert.ok((await clients[role].rpc("list_platform_kyb_review_queue")).error, `${role} must be blocked`);
  assert.ok((await anon.rpc("list_platform_kyb_review_queue")).error, "anonymous must be blocked");

  const enrollment = await clients.admin.auth.mfa.enroll({ factorType: "totp", friendlyName: "Local KYB phase 3" });
  assert.ifError(enrollment.error);
  assert.ifError((await clients.admin.auth.mfa.challengeAndVerify({ factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret) })).error);
  const adminSession = (await clients.admin.auth.getSession()).data.session;
  assert.ok(adminSession);
  const queue = await clients.admin.rpc("list_platform_kyb_review_queue");
  assert.ifError(queue.error); assert.equal(queue.data.length, 1);
  assert.ifError((await clients.admin.rpc("get_platform_kyb_review_detail", { input_case_id: fixture.caseId })).error);
  assert.ifError((await clients.admin.rpc("get_platform_kyb_document_object", { input_document_id: documentId })).error);
  assert.ifError((await clients.admin.storage.from("business-verification-documents").download(objectName)).error);

  const before = sql(`select jsonb_build_object(
    'documents',(select count(*) from public.business_verification_documents where case_id=${q(fixture.caseId)}),
    'events',(select count(*) from public.business_verification_document_events where case_id=${q(fixture.caseId)}),
    'decisions',(select count(*) from public.business_verification_decisions where case_id=${q(fixture.caseId)}),
    'activation',(select activation_status from public.restaurants where id=${q(fixture.restaurant)}),
    'subscription',(select subscription_status from public.branch_subscriptions where branch_id=${q(fixture.branch)})
  )::text`);

  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "56126", "--strictPort"], {
    env: { ...process.env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY }, stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch("http://127.0.0.1:56126")).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  for (const [engine, launcher] of [["Chromium", chromium], ["WebKit", webkit]]) {
    browser = await launcher.launch({ headless: true });
    const context = await browser.newContext();
    await context.route("**/*", (route) => {
      const target = new URL(route.request().url());
      return target.protocol === "blob:" || ["127.0.0.1", "localhost"].includes(target.hostname) ? route.continue() : route.abort();
    });
    await context.addInitScript((session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), adminSession);
    const page = await context.newPage();
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    for (const locale of ["de", "en", "fr", "it", "es", "zh", "ko"]) {
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("http://127.0.0.1:56126/admin/platform/verification", { waitUntil: "networkidle" });
        await page.evaluate((value) => localStorage.setItem("wuxuai.ui-language", value), locale);
        await page.reload({ waitUntil: "networkidle" });
        await page.getByRole("heading", { level: 1 }).waitFor();
        assert.equal(new URL(page.url()).pathname, "/admin/platform/verification", `${engine}/${locale}/${width}: route`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${engine}/${locale}/${width}: overflow`);
        const small = await page.locator("button:not([disabled])").evaluateAll((elements) => elements.filter((element) => {
          if (!element.getClientRects().length) return false;
          const box = element.getBoundingClientRect(); return box.width < 44 || box.height < 44;
        }).length);
        assert.equal(small, 0, `${engine}/${locale}/${width}: touch`); checks += 1;
      }
    }
    await page.evaluate(() => localStorage.setItem("wuxuai.ui-language", "de"));
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Details" }).click();
    await page.getByTestId("platform-kyb-document-review").waitFor();
    await page.getByText("Vorhandene Uploads belegen weder Vollständigkeit noch Freigabefähigkeit.", { exact: false }).waitFor();
    const openButton = page.getByRole("button", { name: "Sicher öffnen" });
    assert.equal(await openButton.count(), 1);
    await page.evaluate(() => {
      window.__kybOpenedBlobs = [];
      const createObjectURL = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = createObjectURL(blob);
        window.__kybOpenedBlobs.push({ url, size: blob.size, type: blob.type });
        return url;
      };
    });
    page.on("popup", (popup) => void popup.close());
    await openButton.click();
    await page.waitForFunction(() => window.__kybOpenedBlobs?.length === 1);
    const [openedBlob] = await page.evaluate(() => window.__kybOpenedBlobs);
    assert.match(openedBlob.url, /^blob:/u, `${engine}: private document opened from a browser-local object URL`);
    assert.ok(openedBlob.size > 0, `${engine}: private document download was not empty`);
    assert.deepEqual(errors, [], `${engine}: runtime errors`);
    await context.close(); await browser.close(); browser = null;
  }
  assert.equal(sql(`select jsonb_build_object(
    'documents',(select count(*) from public.business_verification_documents where case_id=${q(fixture.caseId)}),
    'events',(select count(*) from public.business_verification_document_events where case_id=${q(fixture.caseId)}),
    'decisions',(select count(*) from public.business_verification_decisions where case_id=${q(fixture.caseId)}),
    'activation',(select activation_status from public.restaurants where id=${q(fixture.restaurant)}),
    'subscription',(select subscription_status from public.branch_subscriptions where branch_id=${q(fixture.branch)})
  )::text`), before, "read-only browser flow must write nothing");
  console.log(`LOCAL_PLATFORM_KYB_REVIEW_PASS ${checks} Chromium/WebKit locale/viewport checks; writes 0`);
} finally {
  if (browser) await browser.close();
  if (server) { server.kill("SIGTERM"); await new Promise((resolve) => server.once("exit", resolve)); }
  if (fixture.caseId) sql(`begin; set local session_replication_role=replica;
    delete from storage.objects where bucket_id='business-verification-documents' and name=${q(objectName ?? "")};
    delete from public.business_verification_document_events where case_id=${q(fixture.caseId)};
    delete from public.business_verification_evidence_metadata where case_id=${q(fixture.caseId)};
    delete from public.business_verification_documents where case_id=${q(fixture.caseId)};
    delete from public.business_verified_profile_revisions where case_id=${q(fixture.caseId)};
    delete from public.business_verification_cases where id=${q(fixture.caseId)};
    delete from public.branch_subscriptions where branch_id=${q(fixture.branch)};
    delete from public.restaurant_members where restaurant_id=${q(fixture.restaurant)};
    update public.restaurants set primary_branch_id=null where id=${q(fixture.restaurant)};
    delete from public.branches where id=${q(fixture.branch)};
    delete from public.restaurants where id=${q(fixture.restaurant)};
    delete from public.organizations where id=${q(fixture.organization)};
    delete from public.platform_admins where user_id=${q(users.admin ?? randomUUID())}; commit;`);
  for (const id of Object.values(users)) await service.auth.admin.deleteUser(id);
}
