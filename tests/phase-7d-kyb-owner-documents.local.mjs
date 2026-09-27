// Local-only synthetic Owner upload/version/download flow. No hosted project or real identity.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { chromium } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const cwd = new URL("../", import.meta.url).pathname;
const status = JSON.parse(execFileSync("./node_modules/.bin/supabase", ["status", "--output", "json"], {
  cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
const origin = "http://127.0.0.1:4182";
const container = "supabase_db_wuxuai-phase7b4d-local";
const sql = (query) => execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-qAt",
  "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
  input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
}).trim();
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket },
});
const ownerClient = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket },
});

const email = `kyb-owner-${randomUUID()}@example.invalid`;
const password = randomUUID() + randomUUID();
const fixture = Object.fromEntries(["organization", "restaurant", "branch"].map((key) => [key, randomUUID()]));
let ownerId;
let browser;
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(origin)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("LOCAL_KYB_UI_NOT_READY");
}

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error("LOCAL_KYB_OWNER_CREATE_FAILED");
  ownerId = created.data.user.id;

  sql(`begin;
    set local session_replication_role=replica;
    insert into public.organizations(id,owner_id,name)
      values(${q(fixture.organization)},${q(ownerId)},'KYB PHASE 2 LOCAL');
    insert into public.restaurants(id,owner_id,name,slug,organization_id,activation_status)
      values(${q(fixture.restaurant)},${q(ownerId)},'KYB PHASE 2 LOCAL',
        ${q(`kyb-phase2-${fixture.restaurant.slice(0, 8)}`)},${q(fixture.organization)},'pending_activation');
    insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city)
      values(${q(fixture.branch)},${q(fixture.organization)},${q(fixture.restaurant)},'KYB PHASE 2 LOCAL',
        ${q(`kyb-phase2-${fixture.branch.slice(0, 8)}`)},'AT','Synthetic Road 2','1000','Synthetic City');
    update public.restaurants set primary_branch_id=${q(fixture.branch)} where id=${q(fixture.restaurant)};
    insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
      values(${q(fixture.restaurant)},${q(fixture.organization)},${q(fixture.branch)},${q(ownerId)},'owner');
    insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,
      selected_plan,plan_key,payment_status)
      values(${q(fixture.organization)},${q(fixture.branch)},'pending_activation','pending_activation',
        'BASIC','BASIC','not_required');
    insert into public.organization_legal_profiles(organization_id,company_name,legal_form,
      registered_address_source,address_source_restaurant_id,address_source_branch_id,email,responsible_person)
      values(${q(fixture.organization)},'KYB Phase 2 Local GmbH','GmbH','restaurant',
        ${q(fixture.restaurant)},${q(fixture.branch)},'kyb-phase2@example.invalid','Synthetic Representative');
    update public.country_launch_readiness set status='ready',evidence_ref='LOCAL_SYNTHETIC_ONLY',
      document_version_refs=case when check_key='required_documents'
        then array['LOCAL_SYNTHETIC_ONLY'] else '{}'::text[] end where country_code='AT';
    update public.country_launch_policy set enabled=true where country_code='AT';
    set local session_replication_role=origin;
    commit;`);

  const login = await ownerClient.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) throw new Error("LOCAL_KYB_OWNER_LOGIN_FAILED");
  const submitted = await ownerClient.rpc("submit_pending_business_verification", {
    input_restaurant_id: fixture.restaurant,
    input_method: "MANUAL",
    input_register_type: "GISA",
    input_request_id: randomUUID(),
    input_correlation_id: randomUUID(),
  });
  assert.equal(submitted.error, null, "LOCAL_KYB_SUBMISSION_FAILED");
  assert.equal(submitted.data.status, "PENDING_ACTIVATION");
  const ownerStatus = await ownerClient.rpc("get_business_verification_owner_status", {
    input_restaurant_id: fixture.restaurant,
  });
  assert.equal(ownerStatus.error, null, "LOCAL_KYB_OWNER_STATUS_FAILED");
  assert.ok(ownerStatus.data?.submitted_at, "LOCAL_KYB_OWNER_SUBMISSION_NOT_VISIBLE");

  const businessBefore = sql(`select
    (select activation_status from public.restaurants where id=${q(fixture.restaurant)}),
    (select subscription_status from public.branch_subscriptions where branch_id=${q(fixture.branch)}),
    (select count(*) from public.restaurant_capacity_addon_entitlements where restaurant_id=${q(fixture.restaurant)}),
    (select count(*) from public.business_verification_documents where restaurant_id=${q(fixture.restaurant)});`);
  assert.equal(businessBefore, "pending_activation|pending_activation|0|0");

  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4182", "--strictPort"], {
    cwd, detached: true, stdio: "ignore",
    env: { ...process.env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY },
  });
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 900 }, acceptDownloads: true });
  await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
    ? route.continue() : route.abort());
  await context.addInitScript((session) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    localStorage.setItem("wuxuai.ui-language", "de");
  }, login.data.session);
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.name));
  await page.goto(`${origin}/admin/settings/betriebsverifizierung`, { waitUntil: "networkidle" });
  const browserContract = await page.evaluate(async (restaurantId) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const [memberships, statusResult, documents] = await Promise.all([
      supabase.from("restaurant_members").select("restaurant_id,role"),
      supabase.rpc("get_business_verification_owner_status", { input_restaurant_id: restaurantId }),
      supabase.rpc("list_business_verification_documents", { input_restaurant_id: restaurantId }),
    ]);
    return {
      membershipCount: memberships.data?.length ?? -1,
      membershipError: memberships.error?.code ?? null,
      statusError: statusResult.error?.code ?? null,
      submitted: Boolean(statusResult.data?.submitted_at),
      documentsError: documents.error?.code ?? null,
    };
  }, fixture.restaurant);
  assert.deepEqual(browserContract, {
    membershipCount: 1, membershipError: null, statusError: null, submitted: true, documentsError: null,
  });
  const serviceContract = await page.evaluate(async (restaurantId) => {
    const verification = await import("/src/modules/verification/businessVerificationService.ts");
    try {
      const [verificationResult, documentsResult] = await Promise.all([
        verification.readOwnerVerification(restaurantId),
        verification.listOwnerKybDocuments(restaurantId),
      ]);
      return { ok: true, submitted: Boolean(verificationResult.ownerStatus.submitted_at),
        profile: verificationResult.profile.status !== "NOT_AVAILABLE", documentCount: documentsResult.length };
    } catch (error) {
      return { ok: false, errorName: error instanceof Error ? error.name : "unknown" };
    }
  }, fixture.restaurant);
  assert.deepEqual(serviceContract, { ok: true, submitted: true, profile: true, documentCount: 0 });
  await page.getByTestId("owner-business-verification").waitFor();
  await page.locator("#kyb-document-type").waitFor({ timeout: 15000 });
  assert.equal(await page.locator("#kyb-document-type option").count(), 6);
  await page.getByText(/Upload ist noch keine Freigabe/).waitFor();

  const input = page.locator("#kyb-document-file");
  await input.setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("invalid") });
  await page.getByRole("button", { name: "Sicher hochladen" }).click();
  await page.getByRole("alert").getByText("Erlaubt sind PDF-, JPG- und PNG-Dateien.").waitFor();
  assert.equal(sql(`select count(*) from public.business_verification_documents where restaurant_id=${q(fixture.restaurant)}`), "0");

  await input.setInputFiles({ name: "empty.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
  await page.getByRole("button", { name: "Sicher hochladen" }).click();
  await page.getByRole("alert").getByText("Die Datei muss zwischen 1 Byte und 10 MB groß sein.").waitFor();
  assert.equal(sql(`select count(*) from public.business_verification_documents where restaurant_id=${q(fixture.restaurant)}`), "0");

  await input.setInputFiles({ name: "synthetic-proof.pdf", mimeType: "application/pdf", buffer: randomBytes(128) });
  await page.getByRole("button", { name: "Sicher hochladen" }).click();
  await page.getByText("Der Nachweis wurde sicher gespeichert.").waitFor();
  await page.getByText("Fassung 1 · Hochgeladen").waitFor();

  await input.setInputFiles({ name: "synthetic-proof-v2.pdf", mimeType: "application/pdf", buffer: randomBytes(160) });
  await page.getByRole("button", { name: "Neue Fassung hochladen" }).click();
  await page.getByText("Fassung 2 · Hochgeladen").waitFor();
  await page.getByText("Fassung 1 · Durch neuere Fassung ersetzt").waitFor();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Dokument herunterladen" }).first().click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^gisa_extract-v2\.pdf$/);

  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      small: [...document.querySelectorAll("button:not([disabled]),select,input[type=file]")]
        .filter((element) => element.getClientRects().length > 0)
        .filter((element) => element.getBoundingClientRect().height < 44).length,
    }));
    assert.equal(layout.overflow, false, `KYB_OWNER_OVERFLOW_${width}`);
    assert.equal(layout.small, 0, `KYB_OWNER_TOUCH_TARGET_${width}`);
  }
  assert.deepEqual(runtimeErrors, []);

  const after = sql(`select
    (select activation_status from public.restaurants where id=${q(fixture.restaurant)}),
    (select subscription_status from public.branch_subscriptions where branch_id=${q(fixture.branch)}),
    (select count(*) from public.restaurant_capacity_addon_entitlements where restaurant_id=${q(fixture.restaurant)}),
    (select count(*) from public.business_verification_documents where restaurant_id=${q(fixture.restaurant)}),
    (select count(*) from public.business_verification_documents where restaurant_id=${q(fixture.restaurant)} and status='UPLOADED'),
    (select count(*) from public.business_verification_documents where restaurant_id=${q(fixture.restaurant)} and status='SUPERSEDED'),
    (select count(*) from public.business_verification_document_events where restaurant_id=${q(fixture.restaurant)});`);
  assert.equal(after, "pending_activation|pending_activation|0|2|1|1|5");
  console.log("LOCAL KYB OWNER FLOW: upload, private download and versioned replacement PASS; activation writes 0");
} finally {
  if (browser) await browser.close();
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch { /* already stopped */ }
  }
  if (ownerId) await admin.auth.admin.deleteUser(ownerId);
}
