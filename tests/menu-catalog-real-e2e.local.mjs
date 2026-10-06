import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "vite";
import { createClient } from "@supabase/supabase-js";

const playwright = await import(process.env.WUXUAI_PLAYWRIGHT_MODULE || "playwright");
const api = "http://127.0.0.1:56121";
const key = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
assert.ok(key?.startsWith("sb_publishable_"), "Only a local public key is accepted");
const password = randomBytes(32).toString("hex");
const token = randomBytes(32).toString("hex");
const email = `catalog-owner-${randomBytes(6).toString("hex")}@example.invalid`;
const owner = createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } });
const signup = await owner.auth.signUp({ email, password });
assert.ifError(signup.error);
const ownerId = signup.data.user?.id;
assert.ok(ownerId, "local owner auth registration");

function sql(statement, variables = {}) {
  const args = ["-h", "127.0.0.1", "-p", "56122", "-U", "postgres", "-d", "postgres", "-X", "-q", "-A", "-t"];
  for (const [name, value] of Object.entries(variables)) args.push("-v", `${name}=${value}`);
  if (statement.endsWith(".sql")) args.push("-f", statement);
  else args.push("-c", statement);
  return execFileSync("psql", args, { encoding: "utf8", env: process.env }).trim();
}
sql("tests/menu-catalog-e2e.fixture.local.sql", { owner_id: ownerId, customer_token: token });
const restaurant = "ca200000-0000-4000-8000-000000000021";
const branch = "ca200000-0000-4000-8000-000000000031";

function makePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
    null,
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream1 = "BT /F1 24 Tf 40 300 Td (SYNTHETIC PAGE ONE) Tj ET\n";
  const stream2 = "BT /F1 24 Tf 40 300 Td (SYNTHETIC PAGE TWO) Tj ET\n";
  objects[3] = `<< /Length ${Buffer.byteLength(stream1)} >>\nstream\n${stream1}endstream`;
  objects[5] = `<< /Length ${Buffer.byteLength(stream2)} >>\nstream\n${stream2}endstream`;
  let source = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((value, index) => { offsets.push(Buffer.byteLength(source)); source += `${index + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}

const server = await createServer({ logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
let browsers = [];
let checks = 0;
await server.listen();
const address = server.httpServer.address();
assert.ok(address && typeof address !== "string");
const app = `http://127.0.0.1:${address.port}`;
try {
  const chromium = await playwright.chromium.launch({ headless: true });
  browsers.push(chromium);
  const ownerPage = await chromium.newPage({ viewport: { width: 390, height: 844 }, locale: "de-AT" });
  ownerPage.on("pageerror", (error) => console.log("OWNER_PAGE_ERROR", error.message.slice(0, 200)));
  ownerPage.on("console", (message) => { if (message.type() === "error") console.log("OWNER_CONSOLE_ERROR", message.text().slice(0, 200)); });
  ownerPage.on("requestfailed", (request) => console.log("FAILED_REQUEST", new URL(request.url()).pathname, request.failure()?.errorText));
  ownerPage.on("response", (response) => {
    if (!response.ok()) {
      const target = new URL(response.url());
      void response.text().then((body) => console.log("HTTP_ERROR", target.origin, target.pathname, response.status(), body.slice(0, 120))).catch(() => {});
    }
  });
  await ownerPage.goto(`${app}/restaurant/login`);
  const signedIn = await ownerPage.evaluate(async ({ email, password }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const result = await supabase.auth.signInWithPassword({ email, password });
    return { error: result.error?.message ?? null, id: result.data.user?.id ?? null };
  }, { email, password });
  assert.equal(signedIn.error, null); assert.equal(signedIn.id, ownerId);
  const connectedUrl = await ownerPage.evaluate(async () => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    return supabase?.supabaseUrl ?? null;
  });
  assert.equal(connectedUrl, api, "Browser must be bound to the local unlinked stack");
  await ownerPage.goto(`${app}/tests/menu-catalog-owner-browser.local.html`);
  await ownerPage.getByRole("heading", { name: "Speisekarte" }).waitFor();
  await ownerPage.getByText("Der Katalog ist derzeit nicht freigeschaltet", { exact: false }).waitFor();
  assert.equal(await ownerPage.getByRole("button", { name: "Fassung veröffentlichen" }).isDisabled(), true); checks += 2;

  await ownerPage.locator('input[type="file"]').setInputFiles({ name: "not-a-photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("invalid jpeg bytes") });
  await ownerPage.getByRole("alert").waitFor();
  assert.equal(sql(`select count(*) from public.restaurant_menu_catalogs where restaurant_id='${restaurant}'`), "0"); checks += 2;
  await ownerPage.locator('input[type="file"]').setInputFiles({ name: "not-a-pdf.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 not a document") });
  await ownerPage.getByRole("alert").waitFor();
  assert.equal(sql(`select count(*) from public.restaurant_menu_catalogs where restaurant_id='${restaurant}'`), "0"); checks += 2;

  await ownerPage.getByLabel("Eigene Textübersicht").fill("SYNTHETISCHE ÜBERSICHT\nKeine Preisübereinstimmung mit der Originalkarte behauptet.");
  await ownerPage.getByRole("button", { name: "Textentwurf speichern" }).click();
  await ownerPage.getByText("Entwurf gespeichert.").waitFor();
  await ownerPage.getByRole("button", { name: "Übersicht veröffentlichen" }).waitFor();
  assert.equal(await ownerPage.getByRole("button", { name: "Übersicht veröffentlichen" }).isDisabled(), true);
  assert.equal(sql(`select draft_text <> '' and text_published_at is null from public.restaurant_menu_catalogs where restaurant_id='${restaurant}'`), "t"); checks += 2;

  const jpeg = Buffer.from(await ownerPage.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 800;
    const context = canvas.getContext("2d"); context.fillStyle = "#faf8ee"; context.fillRect(0, 0, 600, 800);
    context.fillStyle = "#212121"; context.font = "32px sans-serif"; context.fillText("SYNTHETIC MENU", 40, 100);
    return canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
  }), "base64");
  await ownerPage.locator('input[type="file"]').setInputFiles({ name: "synthetic-menu.jpg", mimeType: "image/jpeg", buffer: jpeg });
  await ownerPage.waitForTimeout(1500);
  if (await ownerPage.getByRole("alert").count()) throw new Error(`UPLOAD_UI_ALERT: ${(await ownerPage.getByRole("alert").innerText()).slice(0, 160)}`);
  await ownerPage.getByRole("button", { name: /Seite 1: synthetic-menu.jpg/ }).waitFor();
  await ownerPage.locator('input[type="file"]').setInputFiles({ name: "synthetic-pages.pdf", mimeType: "application/pdf", buffer: makePdf() });
  await ownerPage.getByRole("button", { name: /Seite 2: synthetic-pages.pdf/ }).waitFor(); checks += 2;
  await ownerPage.getByRole("button", { name: "Vorherige Seite: synthetic-pages.pdf" }).click();
  await ownerPage.getByRole("button", { name: "Reihenfolge speichern" }).click();
  await ownerPage.getByRole("button", { name: /Seite 1: synthetic-pages.pdf/ }).waitFor();
  await ownerPage.getByRole("button", { name: "Nächste Seite: synthetic-pages.pdf" }).click();
  await ownerPage.getByRole("button", { name: "Reihenfolge speichern" }).click();
  await ownerPage.getByRole("button", { name: /Seite 2: synthetic-pages.pdf/ }).waitFor(); checks += 4;
  await ownerPage.getByRole("button", { name: /Seite 2: synthetic-pages.pdf/ }).click();
  await ownerPage.locator('.menu-media-viewer canvas[data-rendered="true"]').nth(1).waitFor();
  await ownerPage.getByRole("button", { name: "Vergrößern" }).click();
  await ownerPage.locator('.menu-media-viewer canvas[data-rendered="true"]').nth(1).waitFor();
  assert.ok(await ownerPage.locator(".menu-media-viewer canvas").count() === 2); checks += 2;

  sql(`insert into public.restaurant_menu_test_addon_events(restaurant_id,organization_id,branch_id,action,starts_at,expires_at,actor_id,request_id,payload_hash,reason)
    values('${restaurant}','ca200000-0000-4000-8000-000000000011','${branch}','GRANT',now(),now()+interval '1 hour','${ownerId}',gen_random_uuid(),repeat('a',64),'synthetic browser fixture')`);
  await ownerPage.goto(`${app}/tests/menu-catalog-owner-browser.local.html`);
  await ownerPage.getByRole("button", { name: "Übersicht veröffentlichen" }).click();
  await ownerPage.getByText("Übersicht: Veröffentlicht", { exact: false }).waitFor();
  assert.equal(sql(`select text_version from public.restaurant_menu_catalogs where restaurant_id='${restaurant}'`), "1"); checks += 2;
  await ownerPage.getByRole("button", { name: "Fassung veröffentlichen" }).click();
  await ownerPage.getByText("Veröffentlicht · Version 1").waitFor(); checks += 1;
  const path = sql(`select draft_pages->0->>'storage_path' from public.restaurant_menu_catalogs where restaurant_id='${restaurant}'`);
  const direct = await ownerPage.request.get(`${api}/storage/v1/object/${"restaurant-menu-private"}/${path}`, { headers: { apikey: key } });
  assert.notEqual(direct.status(), 200, "direct private storage URL"); checks += 1;
  const directAsOwner = await ownerPage.evaluate(async ({ api, path, key }) => {
    const { supabase } = await import("/src/shared/lib/supabase.ts");
    const session = await supabase.auth.getSession();
    return (await fetch(`${api}/storage/v1/object/authenticated/restaurant-menu-private/${path}`, {
      headers: { Authorization: `Bearer ${session.data.session?.access_token ?? ""}`, apikey: key },
    })).status;
  }, { api, path, key });
  assert.notEqual(directAsOwner, 200, "owner cannot bypass gated media gateway"); checks += 1;

  for (const [engineName, engine] of [["chromium", playwright.chromium], ["webkit", playwright.webkit]]) {
    const browser = engineName === "chromium" ? chromium : await engine.launch({ headless: true });
    if (browser !== chromium) browsers.push(browser);
    const customer = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "de-AT" });
    await customer.goto(`${app}/tests/menu-catalog-real-browser.local.html?slug=synthetic-menu-e2e&token=${token}`);
    const menuButton = customer.locator(".premium-bottom-navigation button").filter({ hasText: "Menü" });
    await menuButton.waitFor(); await menuButton.click();
    await customer.getByText("SYNTHETISCHE ÜBERSICHT", { exact: false }).waitFor();
    await customer.getByRole("button", { name: "Originalkarte" }).click();
    await customer.locator(".menu-media-viewer img").waitFor();
    await customer.getByRole("button", { name: "Vergrößern" }).click();
    assert.equal(await customer.locator(".menu-media-viewer img").evaluate((node) => node.style.width), "125%");
    if (process.env.MENU_SCREENSHOT_DIR) await customer.screenshot({ path: `${process.env.MENU_SCREENSHOT_DIR}/${engineName}-jpeg-390.png`, fullPage: true });
    await customer.getByRole("button", { name: "Nächste Seite" }).click();
    await customer.locator(".menu-media-viewer canvas").first().waitFor();
    await customer.getByRole("button", { name: "Vergrößern" }).click();
    await customer.locator('.menu-media-viewer canvas[data-rendered="true"]').nth(1).waitFor();
    assert.equal(await customer.locator(".menu-media-viewer canvas").count(), 2);
    if (process.env.MENU_SCREENSHOT_DIR) await customer.screenshot({ path: `${process.env.MENU_SCREENSHOT_DIR}/${engineName}-pdf-390.png`, fullPage: true });
    await customer.getByRole("button", { name: "Übersicht" }).click();
    await customer.getByText("SYNTHETISCHE ÜBERSICHT", { exact: false }).waitFor();
    await customer.reload(); await menuButton.waitFor(); checks += 5;
    for (const width of [320, 390, 430, 844]) {
      await customer.setViewportSize({ width, height: width === 844 ? 390 : 760 });
      const overflow = await customer.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${engineName}/${width}: overflow=${overflow}`); checks += 1;
    }
    await customer.close();
  }

  await ownerPage.getByRole("button", { name: "Veröffentlichung zurücknehmen" }).click();
  await ownerPage.getByText("Originalkarte: Entwurf", { exact: true }).waitFor(); checks += 1;
  assert.equal(sql(`select public.get_customer_menu_catalog('synthetic-menu-e2e','${token}')->>'available'`), "true");
  assert.equal(sql(`select jsonb_array_length(public.get_customer_menu_catalog('synthetic-menu-e2e','${token}')->'pages')`), "0"); checks += 2;
  const single = await chromium.newPage({ viewport: { width: 390, height: 844 }, locale: "de-AT" });
  await single.goto(`${app}/tests/menu-catalog-real-browser.local.html?slug=synthetic-menu-e2e&token=${token}`);
  await single.locator(".premium-bottom-navigation button").filter({ hasText: "Menü" }).click();
  await single.getByText("SYNTHETISCHE ÜBERSICHT", { exact: false }).waitFor();
  assert.equal(await single.getByRole("button", { name: "Originalkarte" }).count(), 0); checks += 2;
  await ownerPage.getByRole("button", { name: "Fassung veröffentlichen" }).click();
  await ownerPage.getByText("Veröffentlicht · Version 2").waitFor(); checks += 1;
  await ownerPage.getByRole("button", { name: "Übersicht zurücknehmen" }).click();
  await ownerPage.getByText("Übersicht: Entwurf", { exact: true }).waitFor();
  assert.equal(sql(`select public.get_customer_menu_catalog('synthetic-menu-e2e','${token}')->>'text'`), ""); checks += 1;
  await single.reload();
  await single.locator(".premium-bottom-navigation button").filter({ hasText: "Menü" }).click();
  await single.locator(".menu-media-viewer img").waitFor();
  assert.equal(await single.getByRole("button", { name: "Übersicht" }).count(), 0); checks += 2;
  await single.close();
  sql(`insert into public.restaurant_menu_test_addon_events(restaurant_id,organization_id,branch_id,action,grant_id,actor_id,request_id,payload_hash,reason)
    select restaurant_id,organization_id,branch_id,'REVOKE',id,'${ownerId}',gen_random_uuid(),repeat('b',64),'synthetic browser fixture'
    from public.restaurant_menu_test_addon_events where restaurant_id='${restaurant}' and action='GRANT'`);
  const deniedFile = await ownerPage.request.post(`${api}/functions/v1/catalog-media`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    data: { kind: "customer", slug: "synthetic-menu-e2e", token,
      pageId: sql(`select published_pages->0->>'id' from public.restaurant_menu_catalogs where restaurant_id='${restaurant}'`), version: 2 },
  });
  assert.equal(deniedFile.status(), 403); checks += 1;
  assert.equal(sql(`select public.get_customer_menu_catalog('synthetic-menu-e2e','${token}')->>'available'`), "false");
  assert.equal(sql(`select public.resolve_customer_menu_object_path('synthetic-menu-e2e','${token}',(select (published_pages->0->>'id')::uuid from public.restaurant_menu_catalogs where restaurant_id='${restaurant}'),2)->>'available'`), "false");
  assert.equal(sql(`select jsonb_array_length(draft_pages) from public.restaurant_menu_catalogs where restaurant_id='${restaurant}'`), "2"); checks += 3;
  const afterRevocation = await chromium.newPage({ viewport: { width: 390, height: 844 }, locale: "de-AT" });
  await afterRevocation.goto(`${app}/tests/menu-catalog-real-browser.local.html?slug=synthetic-menu-e2e&token=${token}`);
  await afterRevocation.waitForTimeout(1000);
  assert.equal(await afterRevocation.locator(".premium-bottom-navigation button").filter({ hasText: "Menü" }).count(), 0);
  await afterRevocation.reload();
  assert.equal(await afterRevocation.locator(".premium-bottom-navigation button").filter({ hasText: "Menü" }).count(), 0); checks += 2;

  // Rolled-back synthetic local plan fixture only: PRO includes catalog;
  // removing that plan immediately denies fresh reads again.
  sql(`begin; set local session_replication_role=replica;
    update public.commercial_plan_release_policy set release_state='RELEASED', founder_decision_ref='SYNTHETIC MENU LOCAL',released_at=now()
      where country_code='AT' and plan_key='PRO';
    update public.branch_subscriptions set plan_key='PRO',selected_plan='PRO',subscription_status='trialing',status='trialing',
      payment_status='not_required',trial_started_at=now()-interval '1 day',trial_ends_at=now()+interval '30 days'
      where branch_id='${branch}'; commit;`);
  assert.equal(sql(`select public.restaurant_menu_access_internal('${restaurant}','${branch}')`), "t");
  await afterRevocation.reload();
  await afterRevocation.locator(".premium-bottom-navigation button").filter({ hasText: "Menü" }).waitFor(); checks += 2;
  sql(`begin; set local session_replication_role=replica;
    update public.branch_subscriptions set plan_key='BASIC',selected_plan='BASIC',subscription_status='active',status='active',
      payment_status='manual',trial_started_at=null,trial_ends_at=null where branch_id='${branch}';
    update public.commercial_plan_release_policy set release_state='LOCKED',founder_decision_ref=null,released_at=null
      where country_code='AT' and plan_key='PRO'; commit;`);
  await afterRevocation.reload();
  assert.equal(await afterRevocation.locator(".premium-bottom-navigation button").filter({ hasText: "Menü" }).count(), 0);
  assert.equal(sql(`select public.get_customer_menu_catalog('synthetic-menu-e2e','${token}')->>'available'`), "false"); checks += 2;
  const deniedAfterDowngrade = await ownerPage.request.post(`${api}/functions/v1/catalog-media`, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    data: { kind: "customer", slug: "synthetic-menu-e2e", token,
      pageId: sql(`select published_pages->0->>'id' from public.restaurant_menu_catalogs where restaurant_id='${restaurant}'`), version: 2 },
  });
  assert.equal(deniedAfterDowngrade.status(), 403); checks += 1;
  await afterRevocation.close();
  await ownerPage.close();
  console.log(`MENU_REAL_BACKEND_E2E_PASS checks=${checks} engines=chromium,webkit files=jpeg,pdf pages=2`);
} finally {
  for (const browser of browsers) await browser.close();
  await server.close();
}
