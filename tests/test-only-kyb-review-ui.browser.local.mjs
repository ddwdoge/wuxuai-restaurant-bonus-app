import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const root = new URL("..", import.meta.url).pathname;
const authContainer = "supabase_auth_wuxuai-phase7b4d-local";
const dbContainer = "supabase_db_wuxuai-phase7b4d-local";
const projectRef = "mbgveqbhessaunrhfudm";
const issuer = `https://${projectRef}.supabase.co/auth/v1`;
const origin = "https://staging-v2.bonus.wuxuaisbi.com";
const env = { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1", DO_NOT_TRACK: "1" };
const fixtureFiles = {
  GISA_EXTRACT: "/private/tmp/wuxuai-staging-v2-kyb-replacement-20261011/WUXUAI_TEST_ONLY_GISA_EXTRACT.pdf",
  TRADE_LICENSE: "/private/tmp/wuxuai-staging-v2-kyb-replacement-20261011/WUXUAI_TEST_ONLY_TRADE_LICENSE.pdf",
};

const run = (command, args, options = {}) => String(execFileSync(command, args, {
  cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env, ...options,
}) ?? "").trim();
const sql = (statement) => execFileSync("docker", [
  "exec", "-i", dbContainer, "psql", "-U", "postgres", "-d", "postgres",
  "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const jsonSql = (statement) => JSON.parse(sql(statement).split("\n").at(-1));

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.replaceAll("=", "").toUpperCase()) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

function signedJwt(secret, payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

function incorrectTotp(secret) {
  const current = totp(secret);
  return `${current.slice(0, -1)}${(Number(current.at(-1)) + 1) % 10}`;
}

function ensureBoundLocalIssuer() {
  const inspected = JSON.parse(run("docker", ["inspect", authContainer]))[0];
  const currentIssuer = inspected.Config.Env.find((entry) => entry.startsWith("GOTRUE_JWT_ISSUER="))?.slice("GOTRUE_JWT_ISSUER=".length);
  if (currentIssuer === issuer) return;
  const network = inspected.HostConfig.NetworkMode;
  const environment = inspected.Config.Env.map((entry) => entry.startsWith("GOTRUE_JWT_ISSUER=") ? `GOTRUE_JWT_ISSUER=${issuer}` : entry);
  const args = ["run", "-d", "--name", authContainer, "--network", network, "--network-alias", "auth"];
  for (const [key, value] of Object.entries(inspected.Config.Labels ?? {})) args.push("--label", `${key}=${value}`);
  for (const entry of environment) args.push("--env", entry);
  args.push(inspected.Config.Image, ...(inspected.Config.Cmd ?? ["auth"]));
  run("docker", ["stop", authContainer]);
  run("docker", ["rm", authContainer]);
  run("docker", args);
}

async function waitForHealth(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${url}/auth/v1/health`)).ok) return; } catch { /* local startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("LOCAL_AUTH_HEALTH_TIMEOUT");
}

function installBinding() {
  const anchor = jsonSql("select public.get_project_bootstrap_anchor();");
  const bindingRequest = randomUUID();
  const binding = jsonSql(`select project_bootstrap.install(${q(JSON.stringify({
    project_ref: projectRef,
    backend_url: `https://${projectRef}.supabase.co`,
    auth_issuer: issuer,
    app_origin: origin,
    database_anchor: anchor.anchor,
    database_system_id: anchor.system_id,
    database_name: anchor.database_name,
    hosting_account_id: "2c1dfe5a3330e0b63b30a5838d81d3bc",
    worker_name: "wuxuai-restaurant-bonus-app-staging-v2",
    request_id: bindingRequest,
    operator_ref: "local-ui-auth-rpc-db-proof",
    environment: "STAGING",
  }))}::jsonb,${q("a".repeat(64))});`);
  const setupRequest = randomUUID();
  jsonSql(`select project_bootstrap.activate_bound_staging_environment(
    ${q(setupRequest)}::uuid,${q(binding.binding_id)}::uuid,${q(projectRef)},${q(issuer)},${q(origin)},
    'local-ui-auth-rpc-db-proof',${q("b".repeat(64))},
    ${q(`CONFIRMED:BOUND_STAGING_SETUP:${binding.binding_id}:${setupRequest}`)}
  );`);
  return binding.binding_id;
}

async function createAal2Identity(admin, anon, label) {
  const email = `${label}-${randomUUID()}@example.invalid`;
  const password = `${randomUUID()}${randomBytes(16).toString("hex")}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(created.error);
  const client = createClient(anon.url, anon.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email, password });
  assert.ifError(login.error);
  const enrollment = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `Local ${label}` });
  assert.ifError(enrollment.error);
  const verification = await client.auth.mfa.challengeAndVerify({ factorId: enrollment.data.id, code: totp(enrollment.data.totp.secret) });
  assert.ifError(verification.error);
  const session = await client.auth.getSession();
  assert.ifError(session.error);
  assert.equal(session.data.session?.user.id, created.data.user.id);
  const aal = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  assert.ifError(aal.error);
  assert.equal(aal.data.currentLevel, "aal2");
  assert.ok(aal.data.currentAuthenticationMethods.some((method) => method.method === "totp"));
  const payload = JSON.parse(Buffer.from(session.data.session.access_token.split(".")[1], "base64url").toString("utf8"));
  assert.equal(payload.iss, issuer);
  return {
    client,
    email,
    id: created.data.user.id,
    session: session.data.session,
    sessionId: payload.session_id,
    factorId: enrollment.data.id,
    totpSecret: enrollment.data.totp.secret,
  };
}

function bootstrapReviewers(bindingId, first, second) {
  const firstRequest = randomUUID();
  jsonSql(`select project_bootstrap.bootstrap_first_platform_owner(
    ${q(firstRequest)}::uuid,${q(bindingId)}::uuid,${q(projectRef)},${q(issuer)},${q(origin)},
    ${q(first.id)}::uuid,${q(first.email)},'local-ui-auth-rpc-db-proof',
    'Bind the first local synthetic Platform reviewer through the protected contract.',${q("c".repeat(64))},
    ${q(`CONFIRMED:FIRST_PLATFORM_OWNER:${bindingId}:${first.id}:${firstRequest}`)}
  );`);
  const secondRequest = randomUUID();
  jsonSql(`select project_bootstrap.bootstrap_second_platform_reviewer(
    ${q(secondRequest)}::uuid,${q(bindingId)}::uuid,${q(projectRef)},${q(issuer)},${q(origin)},
    ${q(first.id)}::uuid,${q(first.sessionId)}::uuid,${q(second.id)}::uuid,${q(second.email)},
    'local-ui-auth-rpc-db-proof','Bind the second local synthetic Platform reviewer through the protected contract.',
    ${q("d".repeat(64))},
    ${q(`CONFIRMED:SECOND_PLATFORM_REVIEWER:${bindingId}:${first.id}:${first.sessionId}:${second.id}:${secondRequest}`)}
  );`);
}

async function rpc(client, name, input) {
  const result = await client.rpc(name, input);
  assert.equal(result.error, null, `${name}:${result.error?.code ?? ""}:${result.error?.message ?? ""}`);
  return result.data;
}

async function uploadDocument(owner, restaurantId, documentType, versionMarker = null) {
  const source = readFileSync(fixtureFiles[documentType]);
  const bytes = versionMarker === null
    ? source
    : Buffer.concat([source, Buffer.from(`\n% WUXUAI TEST SUPERSEDED VERSION ${versionMarker}\n`, "utf8")]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const reservation = await rpc(owner.client, "reserve_business_verification_document_upload", {
    input_restaurant_id: restaurantId,
    input_document_type: documentType,
    input_mime_type: "application/pdf",
    input_request_id: randomUUID(),
    input_correlation_id: randomUUID(),
  });
  const uploaded = await owner.client.storage.from(reservation.bucket).upload(
    reservation.object_name,
    new Blob([bytes], { type: "application/pdf" }),
    { contentType: "application/pdf", upsert: false },
  );
  assert.equal(uploaded.error, null, `STORAGE_UPLOAD_${documentType}:${uploaded.error?.message ?? ""}`);
  const completed = await rpc(owner.client, "complete_business_verification_document_upload", {
    input_document_id: reservation.document_id,
    input_content_sha256: sha256,
    input_request_id: randomUUID(),
    input_correlation_id: randomUUID(),
  });
  assert.equal(completed.status, "UPLOADED");
  return { id: reservation.document_id, sha256 };
}

async function createProductTenant(admin, anon, reviewer, label) {
  const owner = await createAal2Identity(admin, anon, `owner-${label.toLowerCase().replaceAll(" ", "-")}`);
  const name = `WUXUAI TEST ${label}`;
  const registration = await rpc(owner.client, "start_restaurant_owner_trial", {
    input_owner_name: `Synthetic Owner ${label}`,
    input_restaurant_name: name,
    input_phone: null,
    input_country: "AT",
  });
  const restaurant = registration.restaurant.id;
  const organization = registration.restaurant.organization_id;
  const branch = registration.restaurant.branch_id;
  assert.equal(registration.subscription.status, "pending_activation");

  const preflight = await rpc(reviewer.client, "get_platform_test_tenant_cleanup_preflight", {
    input_restaurant_id: restaurant,
  });
  assert.equal(preflight.marking_preflight.eligible, true, JSON.stringify(preflight.marking_preflight.blockers));
  const marked = await rpc(reviewer.client, "mark_platform_test_tenant", {
    input_restaurant_id: restaurant,
    input_test_session_id: `ui-${restaurant}`,
    input_reason: "Local synthetic TEST_ONLY KYB UI browser proof.",
    input_confirmation: `CONFIRMED:${name}:${restaurant}`,
    input_idempotency_key: randomUUID(),
  });
  assert.equal(marked.marked, true);

  await rpc(owner.client, "generate_restaurant_legal_package", {
    input_restaurant_id: restaurant,
    input_profile: {
      company_name: name,
      legal_form: "Testbetrieb",
      registered_address_source: "separate",
      street: "Synthetic Test Street 1",
      postal_code: "1000",
      city: "Synthetic City",
      country: "AT",
      email: owner.email,
      phone: null,
      commercial_register_number: null,
      vat_id: null,
      chamber_membership: null,
      supervisory_authority: null,
      complaint_contact: owner.email,
      accessibility_contact: null,
      responsible_person: "Synthetic Test Owner",
    },
    input_reacceptance_required: false,
  });
  await rpc(owner.client, "save_owner_kyb_intake_profile", {
    input_restaurant_id: restaurant,
    input_profile: {
      country_code: "AT",
      gisa_number: `TEST-GISA-${restaurant}`,
      owner_is_authorized_representative: true,
      authorized_representative_name: "Synthetic Test Owner",
      authorized_representative_role: "Testinhaber",
      commercial_register_applicable: false,
      commercial_register_number: null,
    },
  });
  const intake = await rpc(owner.client, "submit_pending_business_verification_intake", {
    input_restaurant_id: restaurant,
    input_method: "MANUAL",
    input_request_id: randomUUID(),
    input_correlation_id: randomUUID(),
  });
  assert.equal(intake.intake_mode, "SYNTHETIC_TEST_ONLY");
  assert.equal(intake.commercial_activation_allowed, false);

  for (const documentType of ["GISA_EXTRACT", "TRADE_LICENSE"]) {
    for (let version = 1; version <= 3; version += 1) {
      await uploadDocument(owner, restaurant, documentType, version < 3 ? version : null);
    }
  }
  const review = await rpc(reviewer.client, "get_platform_test_only_kyb_review", {
    input_restaurant_id: restaurant,
  });
  const gisa = review.documents.find((document) => document.type === "GISA_EXTRACT");
  const trade = review.documents.find((document) => document.type === "TRADE_LICENSE");
  assert.equal(gisa.version, 3);
  assert.equal(trade.version, 3);
  return {
    owner,
    name,
    restaurant,
    organization,
    branch,
    caseId: review.snapshot.case_id,
    materialRevision: review.material_revision,
    gisa: gisa.id,
    trade: trade.id,
    gisaHash: gisa.sha256,
    tradeHash: trade.sha256,
  };
}

async function contextFor(browser, session) {
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await context.route("**/*", (route) => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await context.addInitScript((value) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(value));
    localStorage.setItem("wuxuai.ui-language", "de");
  }, session);
  return context;
}

async function openTenant(page, tenant) {
  await page.goto("http://127.0.0.1:56136/admin/platform/verification", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Betriebsprüfung", exact: true }).first().waitFor({ timeout: 20_000 });
  const row = page.getByRole("row").filter({ hasText: tenant.name });
  await row.getByRole("button", { name: "Details" }).click();
  assert.equal(new URL(page.url()).searchParams.get("review_case"), tenant.caseId);
  const panel = page.getByTestId("test-only-kyb-review");
  await panel.waitFor({ timeout: 20_000 });
  return panel;
}

async function reauthenticatePanel(panel, identity, {
  forceFullReload = false,
  testCancel = false,
  testWrongCode = false,
} = {}) {
  assert.equal(await panel.getByRole("button", { name: "Erste Testprüfung speichern" }).count(), 0);
  assert.equal(await panel.getByRole("button", { name: "Synthetische Gegenprüfung speichern" }).count(), 0);
  await panel.getByRole("button", { name: "TOTP erneut bestätigen" }).click();
  await panel.getByLabel("Aktueller sechsstelliger Bestätigungscode").waitFor();
  if (testCancel) {
    await panel.getByRole("button", { name: "Abbrechen" }).click();
    assert.equal(await panel.getByLabel("Aktueller sechsstelliger Bestätigungscode").count(), 0);
    assert.equal(await panel.getByRole("button", { name: "Erste Testprüfung speichern" }).count(), 0);
    assert.equal(await panel.getByRole("button", { name: "Synthetische Gegenprüfung speichern" }).count(), 0);
    await panel.getByRole("button", { name: "TOTP erneut bestätigen" }).click();
  }
  if (testWrongCode) {
    await panel.getByLabel("Aktueller sechsstelliger Bestätigungscode").fill(incorrectTotp(identity.totpSecret));
    await panel.getByRole("button", { name: "TOTP sicher bestätigen" }).click();
    await panel.getByText("Der Bestätigungscode ist falsch oder abgelaufen.", { exact: false }).waitFor();
    assert.equal(await panel.getByRole("button", { name: "Erste Testprüfung speichern" }).count(), 0);
    assert.equal(await panel.getByRole("button", { name: "Synthetische Gegenprüfung speichern" }).count(), 0);
  }
  await panel.getByLabel("Aktueller sechsstelliger Bestätigungscode").fill(totp(identity.totpSecret));
  await panel.getByRole("button", { name: "TOTP sicher bestätigen" }).click();
  await panel.getByText("serverseitige Frischeprüfung bestanden", { exact: false }).waitFor();
  if (forceFullReload) {
    assert.ok(await panel.page().evaluate(() => sessionStorage.getItem("wuxuai.test-only-kyb-reauth-continuation")));
    await panel.page().reload({ waitUntil: "networkidle" });
    await panel.waitFor({ timeout: 20_000 });
    await panel.getByText("serverseitige Frischeprüfung bestanden", { exact: false }).waitFor();
    assert.equal(await panel.getByRole("checkbox").count(), 1);
  }
}

async function completeTenant(browser, engine, tenant, first, second, status) {
  const firstContext = await contextFor(browser, first.session);
  const firstPage = await firstContext.newPage();
  let firstPayload;
  firstPage.on("request", (request) => {
    if (request.url().includes("/rpc/decide_platform_test_only_kyb_review")) firstPayload = request.postDataJSON();
  });
  let panel = await openTenant(firstPage, tenant);
  await reauthenticatePanel(panel, first, {
    forceFullReload: engine === "chromium",
    testCancel: engine === "chromium",
    testWrongCode: engine === "chromium",
  });
  assert.equal(await panel.getByTestId("test-only-material-revision").innerText(), String(tenant.materialRevision));
  await assertDocument(panel, "GISA_EXTRACT", tenant.gisa, tenant.gisaHash);
  await assertDocument(panel, "TRADE_LICENSE", tenant.trade, tenant.tradeHash);
  await panel.getByRole("checkbox").check();
  await panel.getByLabel("Bestätigungsphrase exakt eingeben:").fill(`TEST_ONLY KYB FIRST_REVIEW ${tenant.name}`);
  await panel.getByRole("button", { name: "Erste Testprüfung speichern" }).click();
  await panel.getByText("Erster synthetischer Prüfschritt gespeichert.", { exact: false }).waitFor();
  assert.ok(firstPayload?.input_request_id);

  const replay = await fetch(`${status.REST_URL}/rpc/decide_platform_test_only_kyb_review`, {
    method: "POST",
    headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${first.session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify(firstPayload),
  });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).idempotent, true);

  await firstPage.reload({ waitUntil: "networkidle" });
  panel = await openTenant(firstPage, tenant);
  await reauthenticatePanel(panel, first);
  await panel.getByText("Diese Identität hat bereits den ersten Schritt ausgeführt.", { exact: false }).waitFor();
  await firstContext.close();

  const secondContext = await contextFor(browser, second.session);
  const secondPage = await secondContext.newPage();
  panel = await openTenant(secondPage, tenant);
  await reauthenticatePanel(panel, second);
  await panel.getByRole("checkbox").check();
  await panel.getByLabel("Bestätigungsphrase exakt eingeben:").fill(`TEST_ONLY KYB APPROVE_TEST ${tenant.name}`);
  await panel.getByRole("button", { name: "Synthetische Gegenprüfung speichern" }).click();
  await panel.getByText("Zweiter synthetischer Prüfschritt gespeichert.", { exact: false }).waitFor();
  await secondPage.reload({ waitUntil: "networkidle" });
  panel = await openTenant(secondPage, tenant);
  await panel.getByText("Synthetische Zweifachprüfung vollständig", { exact: true }).waitFor();
  assert.equal(await secondPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${engine} mobile overflow`);
  await secondPage.setViewportSize({ width: 768, height: 900 });
  assert.equal(await secondPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${engine} tablet overflow`);
  await secondPage.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await secondPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `${engine} desktop overflow`);
  await secondContext.close();
}

async function assertDocument(panel, type, id, hash) {
  const card = panel.locator(`[data-document-type="${type}"]`);
  assert.match(await card.innerText(), /Fassung 3/);
  assert.match(await card.innerText(), new RegExp(id));
  assert.match(await card.innerText(), new RegExp(hash));
}

let server;
let browser;
try {
  ensureBoundLocalIssuer();
  run("npx", ["--no-install", "supabase", "db", "reset", "--local", "--yes"], { stdio: ["ignore", "ignore", "pipe"] });
  const status = JSON.parse(run("npx", ["--no-install", "supabase", "status", "--output", "json"]));
  await waitForHealth(status.API_URL);
  const bindingId = installBinding();
  const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = { url: status.API_URL, key: status.ANON_KEY };
  const first = await createAal2Identity(admin, anon, "reviewer-one");
  const second = await createAal2Identity(admin, anon, "reviewer-two");
  bootstrapReviewers(bindingId, first, second);
  const outsider = await createAal2Identity(admin, anon, "unprivileged-role-switch");

  const chromiumTenant = await createProductTenant(admin, anon, first, "CHROMIUM KYB V3");
  const webkitTenant = await createProductTenant(admin, anon, first, "WEBKIT KYB V3");
  const staleTenant = await createProductTenant(admin, anon, first, "STALE REVISION");

  const stalePayload = JSON.parse(Buffer.from(first.session.access_token.split(".")[1], "base64url").toString("utf8"));
  stalePayload.amr = [{ method: "password", timestamp: Math.floor(Date.now() / 1000) - 900 }, {
    method: "totp", timestamp: Math.floor(Date.now() / 1000) - 601,
  }];
  stalePayload.iat = Math.floor(Date.now() / 1000) - 601;
  stalePayload.exp = Math.floor(Date.now() / 1000) + 3600;
  const staleToken = signedJwt(status.JWT_SECRET, stalePayload);
  const expiredReadback = await fetch(`${status.REST_URL}/rpc/get_platform_test_only_kyb_review`, {
    method: "POST",
    headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${staleToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input_restaurant_id: chromiumTenant.restaurant }),
  });
  assert.equal(expiredReadback.status, 403);
  assert.match(await expiredReadback.text(), /RECENT_PLATFORM_TOTP_REQUIRED/);

  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "56136", "--strictPort"], {
    cwd: root,
    env: { ...env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch("http://127.0.0.1:56136")).ok) break; } catch { /* vite startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  for (const [engine, launcher, tenant] of [["chromium", chromium, chromiumTenant], ["webkit", webkit, webkitTenant]]) {
    browser = await launcher.launch({ headless: true });
    await completeTenant(browser, engine, tenant, first, second, status);
    await browser.close();
    browser = null;
  }

  browser = await chromium.launch({ headless: true });
  const receiptsBeforeIdentitySwitch = sql("select count(*) from public.test_only_kyb_review_receipts");
  const identityContext = await contextFor(browser, first.session);
  const identityPage = await identityContext.newPage();
  await identityPage.goto("http://127.0.0.1:56136/", { waitUntil: "networkidle" });
  const identitySwitchCode = await identityPage.evaluate(async ({ secondSession, factorId, code }) => {
    const service = await import("/src/modules/verification/testOnlyKybReviewService.ts");
    const library = await import("/src/shared/lib/supabase.ts");
    const prepared = await service.prepareTestOnlyKybReauthentication();
    await library.supabase.auth.setSession({
      access_token: secondSession.access_token,
      refresh_token: secondSession.refresh_token,
    });
    try {
      await service.confirmTestOnlyKybReauthentication({
        expectedIdentityId: prepared.identityId,
        factorId,
        code,
      });
      return "UNEXPECTED_SUCCESS";
    } catch (error) {
      return error && typeof error === "object" && "code" in error ? String(error.code) : "NO_CODE";
    }
  }, {
    secondSession: second.session,
    factorId: first.factorId,
    code: totp(first.totpSecret),
  });
  assert.equal(identitySwitchCode, "IDENTITY_CHANGED");
  assert.equal(sql("select count(*) from public.test_only_kyb_review_receipts"), receiptsBeforeIdentitySwitch);
  await identityContext.close();

  const firstContext = await contextFor(browser, first.session);
  const firstPage = await firstContext.newPage();
  let stalePanel = await openTenant(firstPage, staleTenant);
  await reauthenticatePanel(stalePanel, first);
  await stalePanel.getByRole("checkbox").check();
  await stalePanel.getByLabel("Bestätigungsphrase exakt eingeben:").fill(`TEST_ONLY KYB FIRST_REVIEW ${staleTenant.name}`);
  await stalePanel.getByRole("button", { name: "Erste Testprüfung speichern" }).click();
  await stalePanel.getByText("Erster synthetischer Prüfschritt gespeichert.", { exact: false }).waitFor();
  await firstContext.close();
  const secondContext = await contextFor(browser, second.session);
  const secondPage = await secondContext.newPage();
  stalePanel = await openTenant(secondPage, staleTenant);
  await reauthenticatePanel(stalePanel, second);
  await assertDocument(stalePanel, "GISA_EXTRACT", staleTenant.gisa, staleTenant.gisaHash);
  await assertDocument(stalePanel, "TRADE_LICENSE", staleTenant.trade, staleTenant.tradeHash);
  const staleSnapshot = await secondPage.evaluate(async (restaurantId) => {
    const service = await import("/src/modules/verification/testOnlyKybReviewService.ts");
    return service.readTestOnlyKybReview(restaurantId);
  }, staleTenant.restaurant);
  const replacement = await uploadDocument(staleTenant.owner, staleTenant.restaurant, "GISA_EXTRACT", 4);
  assert.notEqual(replacement.id, staleTenant.gisa);
  const staleCode = await secondPage.evaluate(async ({ state, name, requestId }) => {
    const service = await import("/src/modules/verification/testOnlyKybReviewService.ts");
    try {
      await service.decideTestOnlyKybReview({
        action: "APPROVE_TEST",
        confirmation: `TEST_ONLY KYB APPROVE_TEST ${name}`,
        reference: "TEST_ONLY_PLATFORM_UI_STALE_PROOF",
        requestId,
        state,
      });
      return "UNEXPECTED_SUCCESS";
    } catch (error) {
      return error && typeof error === "object" && "code" in error ? String(error.code) : "NO_CODE";
    }
  }, { state: staleSnapshot, name: staleTenant.name, requestId: randomUUID() });
  assert.equal(staleCode, "STALE");
  assert.equal(sql(`select count(*) from public.test_only_kyb_review_receipts where restaurant_id='${staleTenant.restaurant}'`), "1");
  await secondContext.close();

  const roleContext = await contextFor(browser, outsider.session);
  const rolePage = await roleContext.newPage();
  await rolePage.goto("http://127.0.0.1:56136/admin/platform/verification", { waitUntil: "networkidle" });
  const outsiderRead = await outsider.client.rpc("get_platform_test_only_kyb_review", {
    input_restaurant_id: chromiumTenant.restaurant,
  });
  assert.ok(outsiderRead.error);
  assert.equal(outsiderRead.error.code, "42501");
  await rolePage.waitForTimeout(500);
  assert.equal(await rolePage.getByTestId("test-only-kyb-review").count(), 0);
  assert.equal(await rolePage.getByText(chromiumTenant.name, { exact: true }).count(), 0);
  assert.equal(await rolePage.getByText(webkitTenant.name, { exact: true }).count(), 0);
  assert.equal(await rolePage.getByText(staleTenant.name, { exact: true }).count(), 0);
  assert.equal(await rolePage.getByRole("button", { name: "Details" }).count(), 0);
  await roleContext.close();
  const restoredContext = await contextFor(browser, first.session);
  const restoredPage = await restoredContext.newPage();
  await restoredPage.goto("http://127.0.0.1:56136/admin/platform/verification", { waitUntil: "networkidle" });
  await restoredPage.getByRole("heading", { name: "Betriebsprüfung", exact: true }).first().waitFor({ timeout: 20_000 });
  assert.ok(await restoredPage.getByText(chromiumTenant.name, { exact: true }).count());
  await restoredContext.close();
  await browser.close();
  browser = null;

  for (const tenant of [chromiumTenant, webkitTenant]) {
    assert.equal(sql(`select count(*) from public.test_only_kyb_review_receipts where restaurant_id='${tenant.restaurant}'`), "2");
    assert.equal(sql(`select count(distinct actor_id) from public.test_only_kyb_review_receipts where restaurant_id='${tenant.restaurant}'`), "2");
    assert.equal(sql(`select count(*) from public.business_verification_cases where restaurant_id='${tenant.restaurant}' and status='VERIFIED'`), "0");
  }
  assert.equal(sql("select real_intake_status from public.country_kyb_intake_policies where country_code='AT'"), "BLOCKED");
  assert.equal(sql("select count(*) from public.billing_trial_claims"), "0");
  assert.equal(sql("select count(*) from public.commercial_pro_access_grants"), "0");
  assert.equal(sql("select count(*) from public.basic_test_checkout_requests"), "0");
  assert.equal(sql("select count(*) from public.customer_transactional_email_deliveries"), "0");
  console.log(JSON.stringify({
    status: "TEST_ONLY_KYB_UI_AUTH_RPC_DB_BROWSER_PASS",
    engines: ["chromium", "webkit"],
    current_version_three_documents: [chromiumTenant.gisa, chromiumTenant.trade],
    exact_target_hashes: [chromiumTenant.gisaHash, chromiumTenant.tradeHash],
    full_two_identity_flows: 2,
    replay: "IDEMPOTENT",
    reauthentication_cancel: "CLOSED",
    reauthentication_wrong_code: "DENIED",
    reauthentication_expired: "DENIED",
    reauthentication_identity_switch: "DENIED",
    intermediate_revision_change: "DENIED",
    real_kyb_verified: false,
    real_at_intake: "BLOCKED",
    activation_trial_pro_checkout_mail_delta: 0,
  }));
} finally {
  if (browser) await browser.close();
  if (server) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
}
