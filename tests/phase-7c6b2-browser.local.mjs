import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, webkit } from "/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import assert from "node:assert/strict";

const container = "supabase_db_wuxuai-phase7b4d-local";
const platformOnly=process.env.PHASE7C6B2_PLATFORM_ONLY==="1";
const sql = statement => execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const status = JSON.parse(execFileSync("npx", ["supabase", "status", "--output", "json"], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }));
assert.equal(status.API_URL, "http://127.0.0.1:56121");
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations"), "163");
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `browser-${randomUUID()}@example.invalid`;
const password = randomUUID()+randomUUID();
const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
assert.equal(created.error, null, "local synthetic auth creation failed");
const signed = await client.auth.signInWithPassword({ email, password });
assert.equal(signed.error, null, "local synthetic login failed");
const registration = await client.rpc("start_restaurant_owner_trial", { input_owner_name: "Synthetic Browser", input_restaurant_name: "Synthetic Pending Browser", input_phone: null, input_country: "AT" });
if (registration.error) throw new Error("LOCAL_REGISTRATION_RPC_FAILED: " + registration.error.code);
const tenant = registration.data.restaurant.id;
const platformEmail=`platform-${randomUUID()}@example.invalid`;
const platformPassword=randomUUID()+randomUUID();
const platformUser=await admin.auth.admin.createUser({email:platformEmail,password:platformPassword,email_confirm:true});
assert.equal(platformUser.error,null);
const platformClient=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const platformLogin=await platformClient.auth.signInWithPassword({email:platformEmail,password:platformPassword});
assert.equal(platformLogin.error,null);
sql(`insert into public.platform_admins(user_id,role,active) values('${platformUser.data.user.id}','platform_owner',true)`);
const fingerprint = () => JSON.parse(sql(`
create or replace function pg_temp.fingerprints() returns jsonb language plpgsql as $$
declare t record; h text; result jsonb:='{}'; begin
 for t in select tablename from pg_tables where schemaname='public' order by tablename loop
  execute format('select md5(coalesce(string_agg(to_jsonb(r)::text,chr(10) order by to_jsonb(r)::text),'''')) from public.%I r',t.tablename) into h;
  result:=result||jsonb_build_object(t.tablename,h);
 end loop;
 return result;
end $$;
select pg_temp.fingerprints();`).split("\n").at(-1));
const before = fingerprint();
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "56126", "--strictPort"], {
 env: { ...process.env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_ANON_KEY: status.ANON_KEY }, stdio: "ignore",
});
console.log("TASK_VITE_STARTED", server.pid);
let browser;
const failures = [];
let checks = 0;
try {
 for(let attempt=0;attempt<100;attempt++) {
  try { if ((await fetch("http://127.0.0.1:56126")).ok) break; } catch { /* startup */ }
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 for(const [engine, launcher] of (platformOnly?[["webkit",webkit]]:[["chromium",chromium],["webkit",webkit]])) {
  browser = await launcher.launch({ headless: true });
  const context = await browser.newContext();
  await context.route("**/*", route => {
   const url = new URL(route.request().url());
   return ["127.0.0.1","localhost"].includes(url.hostname) ? route.continue() : route.abort();
  });
  await context.addInitScript(({session,tenant})=>{
   localStorage.setItem("sb-127-auth-token",JSON.stringify(session));
   localStorage.setItem(`wuxuai:onboarding-how-it-works-dismissed:${tenant}`,"true");
   if(!localStorage.getItem("wuxuai.ui-language"))localStorage.setItem("wuxuai.ui-language","de");
  },{session:signed.data.session,tenant});
  const page=await context.newPage();
  page.on("pageerror",()=>failures.push({engine,error:"runtime-error"}));
  const widths=platformOnly?[]:[320,375,390,430,767,768,1024,1440];
  const routes=["/admin/onboarding","/admin/qr","/admin/staff","/admin/settings/tarif-kapazitaet","/admin/rewards","/admin/welcome-gifts","/admin/offers"];
  for(const width of widths) {
   await page.setViewportSize({width,height:900});
   for(const route of routes) {
    await page.goto("http://127.0.0.1:56126"+route);
    try { await page.locator(route === "/admin/onboarding" ? ".setup-shell h1" : "[data-pending-activation]").first().waitFor({timeout:20000}); }
    catch { console.log("LOCAL_UI_DIAGNOSTIC",engine,width,route,new URL(page.url()).pathname,(await page.locator("body").innerText()).slice(0,2500)); throw new Error("PENDING_UI_NOT_VISIBLE"); }
    await page.waitForTimeout(200);
    const geometry=await page.evaluate(()=>({
     overflow:document.documentElement.scrollWidth>window.innerWidth,
     small:[...document.querySelectorAll('button,a[href],input:not([type="hidden"]),select')].filter(el=>{
      const target=el.matches('input[type="checkbox"],input[type="radio"]')?(el.closest('label')||el):el;
      const r=target.getBoundingClientRect(); const style=getComputedStyle(el);
      return r.width>0&&r.height>0&&style.visibility!=="hidden"&&!el.closest('[aria-hidden="true"]')&&(r.width<43.99||r.height<43.99);
     }).map(el=>({tag:el.tagName,label:(el.getAttribute("aria-label")||el.textContent||"").trim().slice(0,55),width:Math.round(el.getBoundingClientRect().width),height:Math.round(el.getBoundingClientRect().height)})),
    }));
    if(geometry.overflow||geometry.small.length)failures.push({engine,width,route,...geometry});
    checks++;
   }
   // Open an empty synthetic offer editor; every dismissal must remain read-only.
   for(const close of ["cancel","x","escape"]) {
    await page.getByRole("button",{name:"Neues Angebot erstellen",exact:true}).last().click();
    const dialog=page.getByRole("dialog");
    await dialog.waitFor();
    if(close==="cancel")await dialog.getByRole("button",{name:"Abbrechen",exact:true}).click();
    else if(close==="x")await dialog.locator(".app-drawer-close").click();
    else await page.keyboard.press("Escape");
    await dialog.waitFor({state:"hidden"});
    checks++;
   }
   const after=fingerprint();
   const changed=Object.keys(before).filter(table=>before[table]!==after[table]);
   if(changed.length)throw new Error("PAGE_VIEW_WRITES: "+changed.join(","));
   console.log("BROWSER_WIDTH_COMPLETED",engine,width);
  }
  for(const language of (platformOnly?[]:["de","en","fr","it","es","zh","ko"])) {
   await page.evaluate(language=>localStorage.setItem("wuxuai.ui-language",language),language);
   await page.goto("http://127.0.0.1:56126/admin/settings/tarif-kapazitaet");
   await page.locator("[data-pending-activation]").first().waitFor();
   assert.equal(await page.locator("html").getAttribute("lang"),language);
   assert.ok((await page.locator("[data-pending-activation]").first().innerText()).trim().length>30);
   checks++;
  }
  const platformContext=await browser.newContext();
  await platformContext.route("**/*",route=>["127.0.0.1","localhost"].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await platformContext.addInitScript(session=>{
   localStorage.setItem("sb-127-auth-token",JSON.stringify(session));
   if(!localStorage.getItem("wuxuai.ui-language"))localStorage.setItem("wuxuai.ui-language","de");
  },platformLogin.data.session);
  const platformPage=await platformContext.newPage();
  platformPage.on("pageerror",error=>failures.push({engine,error:"platform-runtime-error",message:error.message}));
  const titles={de:"Verifizierung ausstehend",en:"Verification pending",fr:"Vérification en attente",it:"Verifica in attesa",es:"Verificación pendiente",zh:"等待验证",ko:"인증 대기 중"};
  for(const [language,title] of Object.entries(titles)) {
   for(const width of [390,1024]) {
    await platformPage.setViewportSize({width,height:900});
    await platformPage.goto("http://127.0.0.1:56126/admin/platform/businesses/"+tenant,{waitUntil:"networkidle"});
    await platformPage.evaluate(language=>localStorage.setItem("wuxuai.ui-language",language),language);
    await platformPage.reload({waitUntil:"networkidle"});
    await platformPage.getByText(title,{exact:true}).first().waitFor({timeout:20000});
    if(await platformPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth))failures.push({engine,width,language,error:"platform-overflow"});
    checks++;
   }
  }
  const finalFingerprint=fingerprint();
  const changed=Object.keys(before).filter(table=>before[table]!==finalFingerprint[table]);
  if(changed.length)throw new Error("PAGE_VIEW_OR_DISMISS_WRITES: "+changed.join(","));
  await platformContext.close();
  await browser.close();browser=null;
 }
 console.log(JSON.stringify({checks,failures},null,2));
 assert.equal(failures.length,0,"Browser geometry/runtime failures");
} finally {
 if(browser)await browser.close();
 server.kill("SIGTERM");
 await new Promise(resolve=>server.once("exit",resolve));
 console.log("TASK_VITE_STOPPED",server.pid);
 await client.auth.signOut({scope:"local"});
 await platformClient.auth.signOut({scope:"local"});
}
