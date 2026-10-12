// Real owner offer UI and service with a synthetic persisted RPC adapter.
// Server-side enforcement is covered by test-only-basic-operational.local.mjs.
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
import {BrowserRouter} from 'react-router-dom';
import {I18nProvider} from '/src/shared/i18n/I18nProvider';
import {RestaurantOffersPage} from '/src/modules/admin/pages/RestaurantOffersPage';
import '/src/styles.css'; import '/src/shared/ui/ui-system.css';
createRoot(document.getElementById('root')).render(<BrowserRouter><I18nProvider><RestaurantOffersPage/></I18nProvider></BrowserRouter>);`;
const adapter = `
const read=(key)=>JSON.parse(localStorage.getItem(key));
const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
export const isSupabaseConfigured=true,liveDataUnavailableMessage='Unavailable',supabaseAuthStorageKey=null;
export const ownerRecoverySupabase=null,staffInviteSupabase=null;
export const supabase={rpc:async(name,args)=>{window.rpcCalls??=[];window.rpcCalls.push(name);
  if(name==='list_restaurant_offers')return{data:read('test-only-offers'),error:null};
  if(name==='get_test_only_basic_runtime')return{data:read('test-only-runtime'),error:null};
  if(name==='get_restaurant_offer_email_summary')return{data:{available:false},error:null};
  if(name==='get_restaurant_capacity'||name==='get_restaurant_entitlements')return{data:null,error:{message:'PENDING_ACTIVATION'}};
  if(name==='publish_test_only_basic_offer'){
    const runtime=read('test-only-runtime'),offers=read('test-only-offers');
    const index=offers.findIndex((offer)=>offer.id===args.input_offer_id);
    if(!runtime.active||runtime.receipt_id!==args.input_expected_access_receipt_id)return{data:null,error:{message:'TEST_ONLY_BASIC_OFFER_GRANT_INVALID'}};
    if(index<0||offers[index].status!==args.input_expected_status||offers[index].publication_version!==args.input_expected_publication_version)return{data:null,error:{message:'TEST_ONLY_BASIC_OFFER_STALE'}};
    offers[index]={...offers[index],status:'PUBLISHED',is_active:true,publication_version:offers[index].publication_version+1,published_at:new Date().toISOString()};
    write('test-only-offers',offers);
    write('test-only-runtime',{...runtime,offer_usage:runtime.offer_usage+1});
    return{data:{receipt_id:'synthetic-publication-receipt',restaurant_id:'test-only-tenant',offer_id:offers[index].id,access_receipt_id:runtime.receipt_id,status:'PUBLISHED',publication_version:offers[index].publication_version,published_at:offers[index].published_at,material_snapshot_sha256:'a'.repeat(64),synthetic_test_only:true,real_activation:false,real_trial:false,real_entitlement:false,notifications_enqueued:false,catalog_access:false,idempotent:false},error:null};
  }
  throw Error('Unexpected RPC '+name);
},from(name){if(name!=='branches')throw Error('Unexpected table '+name);const q={select:()=>q,eq:()=>q,order:async()=>({data:[{id:'test-only-branch',name:'TEST_ONLY Filiale',status:'draft'}],error:null})};return q;}};`;

const server = await createServer({
  root,
  configFile: false,
  plugins: [{
    name: "test-only-offer-publication-ui",
    enforce: "pre",
    resolveId(id) {
      if (id === "/test-only-offer-entry.tsx") return "\0test-only-offer-entry";
      if (id.endsWith("/tenant/TenantProvider")) return "\0test-only-tenant";
      if (id.endsWith("/lib/supabase")) return "\0test-only-db";
    },
    async load(id) {
      if (id === "\0test-only-offer-entry") return (await transformWithEsbuild(entry, "test-only-offer-entry.tsx", { loader: "tsx", jsx: "automatic" })).code;
      if (id === "\0test-only-db") return adapter;
      if (id === "\0test-only-tenant") return `const restaurant={id:'test-only-tenant',name:'WUXUAI TEST RESTAURANT',slug:'test-only',status:'draft',activation_status:'pending_activation',primary_branch_id:'test-only-branch'};export const useTenant=()=>({activeRestaurant:restaurant,restaurants:[restaurant],branding:null,loading:false,clearTenantState(){},setActiveRestaurantId(){}});`;
    },
    configureServer(vite) {
      vite.middlewares.use(async (request, response, next) => {
        if (request.url?.split("?")[0] !== "/admin/offers") return next();
        response.setHeader("Content-Type", "text/html");
        response.end(await vite.transformIndexHtml(request.url, '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/test-only-offer-entry.tsx"></script></body></html>'));
      });
    },
  }, react()],
  server: { host: "127.0.0.1", port: 0 },
  logLevel: "error",
});

const baseOffer = (id, title) => ({
  id, restaurant_id: "test-only-tenant", branch_id: "test-only-branch", branch_name: "TEST_ONLY Filiale",
  title, short_description: "Synthetischer Staging-Test", description: null, offer_type: "NEWS",
  status: "DRAFT", is_active: false, publication_version: 0, published_at: null, published_by: null,
  valid_from: "2026-10-01T00:00:00.000Z", valid_to: "2099-10-31T23:59:00.000Z",
  button_label: "Test ansehen", image_url: null, current_price: null, previous_price: null,
  currency: "EUR", weekdays: null, time_from: null, time_to: null,
  created_at: "2026-10-12T00:00:00.000Z", updated_at: "2026-10-12T00:00:00.000Z", archived_at: null,
});

const results = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const [engineName, launcher] of [["chromium", chromium], ["webkit", webkit]]) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (const width of [390, 1280]) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" });
        await context.route("**/*", (route) => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
        await context.addInitScript(({ offer, runtime }) => {
          localStorage.setItem("wuxuai.ui-language", "de");
          if (!localStorage.getItem("test-only-offers")) localStorage.setItem("test-only-offers", JSON.stringify([offer]));
          if (!localStorage.getItem("test-only-runtime")) localStorage.setItem("test-only-runtime", JSON.stringify(runtime));
        }, {
          offer: baseOffer(`draft-${engineName}-${width}`, `TEST_ONLY DRAFT ${engineName} ${width}`),
          runtime: { synthetic_test_only: true, active: true, effective_plan: "BASIC", offer_limit: 5, offer_usage: 0,
            offer_notifications: false, reward_notifications: false, catalog_access: false,
            real_activation: false, real_trial: false, starts_at: "2026-10-12T00:00:00.000Z",
            expires_at: "2099-10-12T02:00:00.000Z", receipt_id: `grant-${engineName}-${width}`,
            readiness_receipt_id: "readiness-receipt" },
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${origin}/admin/offers`);
        const panel = page.getByTestId("test-only-offer-publication");
        await panel.getByText("BASIC-Testzugang aktiv", { exact: true }).waitFor();
        const publish = page.getByRole("button", { name: "TEST_ONLY synthetisch veröffentlichen", exact: true });
        assert.equal(await publish.isEnabled(), true);
        await publish.click();
        await page.getByText("TEST_ONLY: Synthetisches Angebot veröffentlicht. Keine reale Aktivierung oder Benachrichtigung.", { exact: true }).waitFor();
        await panel.getByText("1 / 5", { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.rpcCalls.filter((name) => name === "publish_test_only_basic_offer").length), 1);
        assert.equal(await page.evaluate(() => window.rpcCalls.includes("change_restaurant_offer_status")), false);
        await page.reload();
        await page.getByText("BASIC-Testzugang aktiv", { exact: true }).waitFor();
        await panel.getByText("1 / 5", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: "TEST_ONLY synthetisch veröffentlichen", exact: true }).count(), 0);

        await page.evaluate(({ draft }) => {
          localStorage.setItem("test-only-runtime", JSON.stringify({ ...JSON.parse(localStorage.getItem("test-only-runtime")), active: false, effective_plan: null, offer_limit: 0, offer_usage: 0, receipt_id: "revoke-receipt", expires_at: null }));
          localStorage.setItem("test-only-offers", JSON.stringify([...JSON.parse(localStorage.getItem("test-only-offers")), draft]));
        }, { draft: baseOffer(`post-revoke-${engineName}-${width}`, `POST REVOKE DRAFT ${engineName} ${width}`) });
        await page.reload();
        await panel.getByText("Testzugang geschlossen", { exact: true }).waitFor();
        const closedButton = page.getByRole("button", { name: "TEST_ONLY synthetisch veröffentlichen", exact: true });
        assert.equal(await closedButton.count(), 1);
        assert.equal(await closedButton.isDisabled(), true);
        assert.equal(await page.evaluate(() => window.rpcCalls.filter((name) => name === "publish_test_only_basic_offer").length), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
        assert.deepEqual(errors, []);
        results.push({ engine: engineName, width, publish: "PASS", reload: "PASS", post_revoke_ui: "CLOSED" });
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  console.log(JSON.stringify({ status: "TEST_ONLY_BASIC_OFFER_UI_PASS", cases: results.length, results }));
} finally {
  await server.close();
}
