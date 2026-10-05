// Synthetic component/browser proof. No Auth HTTP, hosted backend or real legal text.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { build } from "esbuild";

assert.equal(process.env.ALLOW_LOCAL_PLATFORM_TERMS_UI_TESTS, "1");
const require = createRequire(import.meta.url);
const { chromium, webkit } = require("/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const entry = `import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {MemoryRouter,Routes,Route} from 'react-router-dom';
  import {CustomerPlatformTermsPage} from './src/modules/customer/CustomerPlatformTermsPage';
  createRoot(document.getElementById('root')).render(
    <MemoryRouter initialEntries={['/customer/platform-terms?returnTo=%2Fcustomer']}>
      <Routes><Route path="/customer/platform-terms" element={<CustomerPlatformTermsPage/>}/></Routes>
    </MemoryRouter>);`;
const bundled = await build({
  stdin: { contents: entry, resolveDir: root, loader: "tsx" },
  bundle: true, write: false, outfile: "synthetic.js", format: "iife", jsx: "automatic",
  plugins: [{ name: "synthetic-authority", setup(plugin) {
    plugin.onResolve({ filter: /\/AuthProvider$/ }, () => ({ path: "auth", namespace: "synthetic" }));
    plugin.onResolve({ filter: /\/lib\/supabase$/ }, () => ({ path: "client", namespace: "synthetic" }));
    plugin.onResolve({ filter: /\/I18nProvider$/ }, () => ({ path: "i18n", namespace: "synthetic" }));
    plugin.onLoad({ filter: /.*/, namespace: "synthetic" }, ({ path }) => ({
      loader: "js", contents: path === "auth"
        ? "export const useAuth=()=>window.__auth;"
        : path === "client" ? "export const supabase=window.__client;"
          : "export const useI18n=()=>({language:'de',setLanguage:()=>{},translateKey:k=>k});",
    }));
  } }],
});
const js = bundled.outputFiles.find((file) => file.path.endsWith(".js"))?.text;
const css = bundled.outputFiles.filter((file) => file.path.endsWith(".css")).map((file) => file.text).join("\n");
assert.ok(js && css);
const mock = `
  const scenario=new URLSearchParams(location.search).get('scenario')||'ready';
  window.__calls=[];
  window.__auth={loading:false,user:{id:'70000000-0000-4000-8000-000000000070'},
    portalAccess:{platform_terms_status:'ACCEPTANCE_REQUIRED',customer_access:false},retryAuthorization:()=>{window.__calls.push({name:'retryAuthorization'})}};
  let accepted=false, reads=0, lastRequest=null, acceptedDoc=null;
  const doc={document_id:'70000000-0000-4000-8000-000000000080',version:'TEST_ONLY_V01',
    sha256:'a'.repeat(64),language:'de-AT',provider_snapshot:'TEST ONLY: Synthetic provider',
    body_markdown:'TEST ONLY: Synthetic platform terms, no real legal approval.',test_only:true};
  window.__client={rpc:async(name,params)=>{
    window.__calls.push({name,params});
    if(name==='get_platform_customer_terms_status'){
      reads++;
      if(scenario==='retry'&&reads===1)return {data:null,error:{message:'synthetic temporary error'}};
      if(scenario==='unavailable')return {data:{status:'UNAVAILABLE',account_exists:true,next_step:'WAIT_FOR_APPROVED_TERMS'},error:null};
      const visibleDoc=(scenario==='newversion'||scenario==='ambiguous_newversion')&&reads>1
        ? {...doc,document_id:'70000000-0000-4000-8000-000000000081',version:'TEST_ONLY_V02',sha256:'b'.repeat(64)}:doc;
      const currentAccepted=accepted&&acceptedDoc?.document_id===visibleDoc.document_id;
      return {data:{status:currentAccepted?'ACCEPTED':'ACCEPTANCE_REQUIRED',account_exists:false,
        document:visibleDoc,receipt:currentAccepted?{id:'receipt',request_id:lastRequest,document_id:visibleDoc.document_id}:null},error:null};
    }
    if(name==='get_platform_customer_terms_receipt')return {data:{found:accepted,
      request_id:lastRequest,document_id:acceptedDoc?.document_id,sha256:acceptedDoc?.sha256},error:null};
    if(name==='accept_platform_customer_terms'){
      lastRequest=params.input_request_id;accepted=true;acceptedDoc=doc;
      if(scenario==='ambiguous'||scenario==='ambiguous_newversion')return {data:null,error:{message:'synthetic response lost'}};
      return {data:{id:'receipt',request_id:lastRequest},error:null};
    }
    if(name==='ensure_authenticated_customer_account')return {data:'account',error:null};
    throw Error('unexpected RPC '+name);
  }};`;
const server = createServer((_request, response) => {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.end(`<!doctype html><html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${mock}</script><script>${js}</script></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let cases = 0;
try {
  for (const [engine, launcher] of [["Chromium", chromium], ["WebKit", webkit]]) {
    const browser = await launcher.launch({ headless: true });
    try {
      for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 900 }]) {
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        async function load(scenario) {
          await page.goto(`${origin}/?scenario=${scenario}`);
          await page.getByRole("heading", { name: "Plattformbedingungen für dein Kundenkonto" }).waitFor();
        }
        async function layout() {
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        await load("unavailable");
        await page.getByText(/keine freigegebene Fassung/).waitFor();
        assert.equal(await page.getByRole("button", { name: "Verbindlich zustimmen" }).count(), 0);
        await layout(); cases++;
        await load("retry");
        await page.getByRole("button", { name: "Erneut prüfen", exact: true }).click();
        await page.getByText(/Synthetic platform terms/).waitFor();
        await layout(); cases++;
        await load("ready");
        const button = page.getByRole("button", { name: "Verbindlich zustimmen" });
        assert.equal(await button.isDisabled(), true);
        await page.getByRole("checkbox").check();
        await button.focus();
        await page.keyboard.press("Enter");
        await page.getByRole("button", { name: "Zum Kundenkonto" }).waitFor();
        const calls = await page.evaluate(() => window.__calls);
        assert.equal(calls.filter((call) => call.name === "accept_platform_customer_terms").length, 1);
        await layout(); cases++;
        await load("newversion");
        await page.getByRole("checkbox").check();
        await page.getByRole("button", { name: "Status erneut prüfen" }).click();
        await page.getByText(/TEST_ONLY_V02/).waitFor();
        assert.equal(await page.getByRole("checkbox").isChecked(), false);
        assert.equal(await page.getByRole("button", { name: "Verbindlich zustimmen" }).isDisabled(), true);
        await layout(); cases++;
        await load("ambiguous");
        await page.getByRole("checkbox").check();
        await page.getByRole("button", { name: "Verbindlich zustimmen" }).click();
        await page.getByRole("button", { name: "Zum Kundenkonto" }).waitFor();
        assert.equal(await page.getByRole("alert").count(), 0);
        assert.equal((await page.evaluate(() => window.__calls)).filter((call) => call.name === "get_platform_customer_terms_receipt").length, 1);
        await layout(); cases++;
        await load("ambiguous_newversion");
        await page.getByRole("checkbox").check();
        await page.getByRole("button", { name: "Verbindlich zustimmen" }).click();
        await page.getByRole("alert").getByText(/Eine neue Fassung liegt vor/).waitFor();
        assert.equal(await page.getByRole("button", { name: "Zum Kundenkonto" }).count(), 0);
        assert.equal(await page.getByRole("checkbox").isChecked(), false);
        await layout(); cases++;
        assert.deepEqual(errors, []);
        await page.close();
      }
    } finally { await browser.close(); }
    console.log(`${engine} platform terms UI PASS`);
  }
  console.log(JSON.stringify({ status: "PASS", cases, viewports: ["390x844", "768x1024", "1280x900"],
    engines: 2, backend_requests: 0, cloud_requests: 0 }));
} finally { await new Promise((resolve) => server.close(resolve)); }
