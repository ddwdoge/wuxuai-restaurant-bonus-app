// Opt-in Chromium/WebKit proof for the separated TEST_ONLY guest and owner UI.
// Database authorization and writes are covered by test-only-basic-operational.local.mjs.
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isAbsolute } from "node:path";
import { createServer, transformWithEsbuild } from "vite";
import react from "@vitejs/plugin-react";

assert.equal(process.env.ALLOW_LOCAL_TEST_ONLY_BASIC, "1");
const modulePath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium, webkit } = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const root = fileURLToPath(new URL("..", import.meta.url));
const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Route,Routes} from 'react-router-dom';
import {I18nProvider} from '/src/shared/i18n/I18nProvider';
import {TestOnlyBasicQrPointsPage} from '/src/modules/verification/TestOnlyBasicQrPointsPage';
import {CustomerTestOnlyBasicPage} from '/src/modules/customer/CustomerTestOnlyBasicPage';
import '/src/styles.css'; import '/src/shared/ui/ui-system.css';
createRoot(document.getElementById('root')).render(<BrowserRouter><I18nProvider><Routes>
  <Route path="/admin/qr" element={<TestOnlyBasicQrPointsPage/>}/>
  <Route path="/customer/test-only-basic/:slug" element={<CustomerTestOnlyBasicPage/>}/>
</Routes></I18nProvider></BrowserRouter>);`;

const adapter = `
const read=(key)=>JSON.parse(localStorage.getItem(key));
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
export const isSupabaseConfigured=true,liveDataUnavailableMessage='Unavailable',supabaseAuthStorageKey=null;
export const ownerRecoverySupabase=null,staffInviteSupabase=null;
export const supabase={rpc:async(name,args)=>{window.rpcCalls??=[];window.rpcCalls.push(name);
  if(name==='get_test_only_basic_runtime')return{data:read('test-runtime'),error:null};
  if(name==='get_test_only_basic_customer_flow')return{data:read('test-customer-flow'),error:null};
  if(name==='create_test_only_basic_customer_points_qr'){
    const flow=read('test-customer-flow');if(!flow.active)return{data:null,error:{message:'TEST_ONLY_BASIC_OPERATION_DENIED'}};
    return{data:{reference_id:'11111111-1111-4111-8111-111111111111',qr_token:'a'.repeat(64),manual_code:'12345678',expires_at:'2099-10-13T12:05:00.000Z',access_receipt_id:flow.access_receipt_id,synthetic_test_only:true},error:null};
  }
  if(name==='get_test_only_basic_today_restaurant_pin'){
    const runtime=read('test-runtime');if(!runtime.active)return{data:null,error:{message:'TEST_ONLY_BASIC_OPERATION_DENIED'}};
    return{data:{pin_code:'2468',valid_until:'2099-10-13T23:59:00.000Z',access_receipt_id:runtime.receipt_id,synthetic_test_only:true},error:null};
  }
  if(name==='preview_test_only_basic_points'){
    const runtime=read('test-runtime');if(!runtime.active)return{data:null,error:{message:'TEST_ONLY_BASIC_OPERATION_DENIED'}};
    return{data:{customer_label:'Synthetischer Gast',points_balance:0,last_visit_at:null,amount_cents:args.input_amount_cents,expected_points:1,base_points:1,boost_multiplier:1,final_points:1,bonus_rule_version:'test-v1',high_amount_warning:false,expires_at:'2099-10-13T12:05:00.000Z',access_receipt_id:runtime.receipt_id,synthetic_test_only:true},error:null};
  }
  if(name==='confirm_test_only_basic_points'){
    const runtime=read('test-runtime');if(!runtime.active)return{data:null,error:{message:'TEST_ONLY_BASIC_OPERATION_DENIED'}};
    const stored=read('test-points-result');if(stored&&stored.key===args.input_idempotency_key)return{data:{...stored.value,already_completed:true},error:null};
    const value={transaction_id:'22222222-2222-4222-8222-222222222222',points_added:1,points_balance:1,amount_cents:args.input_amount_cents,already_completed:false,base_points:1,boost_multiplier:1,final_points:1,bonus_rule_version:'test-v1',synthetic_test_only:true};
    write('test-points-result',{key:args.input_idempotency_key,value});return{data:value,error:null};
  }
  throw Error('Unexpected RPC '+name);
}};`;

const server = await createServer({
  root,
  configFile: false,
  plugins: [{
    name: "test-only-basic-qr-points-ui",
    enforce: "pre",
    resolveId(id) {
      if (id === "/test-only-basic-flow-entry.tsx") return "\0test-only-basic-flow-entry";
      if (id.endsWith("/tenant/TenantProvider")) return "\0test-only-tenant";
      if (id.endsWith("/lib/supabase")) return "\0test-only-db";
    },
    async load(id) {
      if (id === "\0test-only-basic-flow-entry") return (await transformWithEsbuild(entry, "test-only-basic-flow-entry.tsx", { loader: "tsx", jsx: "automatic" })).code;
      if (id === "\0test-only-db") return adapter;
      if (id === "\0test-only-tenant") return `const restaurant={id:'test-only-tenant',name:'WUXUAI TEST RESTAURANT',slug:'test-only',status:'draft',activation_status:'pending_activation',primary_branch_id:'test-only-branch'};export const useTenant=()=>({activeRestaurant:restaurant,restaurants:[restaurant],branding:null,loading:false,clearTenantState(){},setActiveRestaurantId(){}});`;
    },
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        const path = request.url?.split("?")[0];
        if (path !== "/admin/qr" && path !== "/customer/test-only-basic/test-only") return next();
        response.setHeader("Content-Type", "text/html");
        response.end(await vite.transformIndexHtml(request.url, '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/test-only-basic-flow-entry.tsx"></script></body></html>'));
      });
    },
  }, react()],
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});

const runtime = (active) => ({ synthetic_test_only: true, active, effective_plan: active ? "BASIC" : null,
  offer_limit: active ? 5 : 0, offer_usage: active ? 1 : 0, offer_notifications: false,
  reward_notifications: false, catalog_access: false, real_activation: false, real_trial: false,
  starts_at: active ? "2099-10-13T10:00:00.000Z" : null,
  expires_at: active ? "2099-10-13T12:00:00.000Z" : null,
  receipt_id: active ? "33333333-3333-4333-8333-333333333333" : "44444444-4444-4444-8444-444444444444",
  readiness_receipt_id: "55555555-5555-4555-8555-555555555555" });
const customerFlow = (active) => ({ synthetic_test_only: true, active, restaurant_id: "test-only-tenant",
  restaurant_name: "WUXUAI TEST RESTAURANT", restaurant_slug: "test-only", organization_id: "test-only-org",
  branch_id: "test-only-branch", branch_name: "TEST_ONLY Filiale", customer_id: "test-only-customer",
  customer_name: "Synthetischer Gast", access_receipt_id: active ? "33333333-3333-4333-8333-333333333333" : "44444444-4444-4444-8444-444444444444",
  expires_at: active ? "2099-10-13T12:00:00.000Z" : null, offer_limit: active ? 5 : 0,
  offers: active ? [{ id: "offer-1", title: "TEST_ONLY BASIC E2E", short_description: "Synthetisches Angebot",
    description: null, offer_type: "NEWS", image_url: null, current_price: null, previous_price: null,
    currency: "EUR", valid_from: "2099-10-13T09:00:00.000Z", valid_to: "2099-10-14T09:00:00.000Z",
    button_label: "Test", publication_version: 1, published_at: "2099-10-13T09:00:00.000Z", synthetic_test_only: true }] : [],
  real_activation: false, real_trial: false, real_entitlement: false, catalog_access: false });

const cases = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const [engineName, launcher] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await launcher.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: "block" });
      await context.route("**/*", (route) => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
      await context.addInitScript(({ openRuntime, openFlow }) => {
        localStorage.setItem("wuxuai.ui-language", "de");
        if (!localStorage.getItem("test-runtime")) localStorage.setItem("test-runtime", JSON.stringify(openRuntime));
        if (!localStorage.getItem("test-customer-flow")) localStorage.setItem("test-customer-flow", JSON.stringify(openFlow));
      }, { openRuntime: runtime(true), openFlow: customerFlow(true) });

      const guest = await context.newPage();
      const errors = [];
      guest.on("pageerror", (error) => errors.push(error.message));
      await guest.goto(`${origin}/customer/test-only-basic/test-only`);
      await guest.getByText("TEST_ONLY BASIC E2E", { exact: true }).waitFor();
      await guest.getByRole("button", { name: "Test-QR erstellen", exact: true }).click();
      await guest.getByText("1234 5678", { exact: false }).waitFor();
      assert.equal(await guest.evaluate(() => window.rpcCalls.includes("create_customer_points_credit_qr")), false);

      const owner = await context.newPage();
      owner.on("pageerror", (error) => errors.push(error.message));
      await owner.goto(`${origin}/admin/qr`);
      await owner.getByText("Grant aktiv", { exact: true }).waitFor();
      await owner.getByRole("button", { name: "Tages-PIN frisch lesen", exact: true }).click();
      await owner.getByText("2468", { exact: false }).waitFor();
      await owner.getByLabel("QR-Inhalt oder Ersatzcode").fill("12345678");
      await owner.getByRole("button", { name: "Punkte-Vorschau prüfen", exact: true }).click();
      await owner.getByText("Synthetische Punktevorschau bestätigt. Noch wurden keine Punkte gebucht.", { exact: true }).waitFor();
      const confirm = owner.getByRole("button", { name: "Genau eine TEST_ONLY-Buchung speichern", exact: true });
      await confirm.click();
      await owner.getByText("Genau eine synthetische TEST_ONLY-Punktebuchung wurde gespeichert.", { exact: true }).waitFor();
      assert.equal(await confirm.isDisabled(), true);
      assert.equal(await owner.evaluate(() => window.rpcCalls.filter((name) => name === "confirm_test_only_basic_points").length), 1);
      assert.equal(await owner.evaluate(() => window.rpcCalls.some((name) => ["get_today_restaurant_pin", "preview_restaurant_controlled_points", "confirm_restaurant_controlled_points"].includes(name))), false);

      await owner.evaluate(({ closedRuntime, closedFlow }) => {
        localStorage.setItem("test-runtime", JSON.stringify(closedRuntime));
        localStorage.setItem("test-customer-flow", JSON.stringify(closedFlow));
      }, { closedRuntime: runtime(false), closedFlow: customerFlow(false) });
      await owner.reload();
      await owner.getByText("GESCHLOSSEN", { exact: true }).waitFor();
      assert.equal(await owner.getByRole("button", { name: "Tages-PIN frisch lesen", exact: true }).count(), 0);
      await guest.reload();
      await guest.getByText("TEST_ONLY-BASIC ist geschlossen", { exact: true }).waitFor();
      assert.equal(await guest.getByRole("button", { name: /Test-QR erstellen/ }).count(), 0);
      assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
      assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
      assert.deepEqual(errors, []);
      cases.push({ engine: engineName, full_flow: "PASS", post_revoke: "CLOSED" });
      await context.close();
    } finally {
      await browser.close();
    }
  }
  console.log(JSON.stringify({ status: "TEST_ONLY_BASIC_QR_POINTS_UI_PASS", cases }));
} finally {
  await server.close();
}
