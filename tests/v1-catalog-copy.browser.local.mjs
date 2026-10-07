// UI-only synthetic read models. No authenticated backend or business-flow proof.
// PLAYWRIGHT_MODULE may point to an installed module; no fixed runtime path.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
import { GENERATED_MESSAGES } from '../src/shared/i18n/messages.generated.mjs';
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium, webkit } = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const root = fileURLToPath(new URL('..', import.meta.url));
const out = process.env.COPY_SMOKE_OUTPUT
  ? resolve(process.env.COPY_SMOKE_OUTPUT)
  : await mkdtemp(join(tmpdir(), 'wuxuai-v1-copy-smoke-'));
await mkdir(out, { recursive: true });
const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,Routes,Route} from 'react-router-dom';
import {I18nProvider} from '/src/shared/i18n/I18nProvider';
import {RestaurantOffersPage} from '/src/modules/admin/pages/RestaurantOffersPage';
import {AdminLayout} from '/src/modules/admin/AdminLayout';
import {PublicHome} from '/src/modules/public/PublicHome';
import {BillingCatalogInfo} from '/src/modules/capacity/BillingCatalogInfo';
import {AppShell,BottomNavigation} from '/src/modules/customer/components/PremiumCustomerUi';
import '/src/styles.css'; import '/src/shared/ui/ui-system.css';
function Customer(){const [view,setView]=React.useState('home');return <AppShell><h1>TEST ONLY</h1><output>{view}</output><BottomNavigation activeView={view} onChange={setView}/></AppShell>}
createRoot(document.getElementById('root')).render(<BrowserRouter><I18nProvider><Routes>
<Route path='/owner' element={<AdminLayout/>}><Route index element={<><RestaurantOffersPage/><BillingCatalogInfo restaurantId='synthetic-copy'/></>}/></Route>
<Route path='/customer-copy' element={<Customer/>}/><Route path='*' element={<PublicHome/>}/>
</Routes></I18nProvider></BrowserRouter>);`;
const server = await createServer({ root, configFile: false, plugins: [
  { name: 'synthetic-copy-reads', enforce: 'pre',
    resolveId(id){if(id==='/copy-entry.tsx')return '\0copy-entry.tsx';},
    async load(id){if(id==='\0copy-entry.tsx')return (await transformWithEsbuild(entry,'copy-entry.tsx',{loader:'tsx',jsx:'automatic'})).code;},
    transform(_code,id){
      if(id.endsWith('/tenant/TenantProvider.tsx')) return `const r={id:'synthetic-copy',name:'TEST ONLY',status:'active',activation_status:'active',onboarding_status:'ready'}; export const useTenant=()=>({activeRestaurant:r,restaurants:[r],branding:null,loading:false,clearTenantState(){},setActiveRestaurantId(){}});`;
      if(id.endsWith('/auth/AuthProvider.tsx')) return `export const useAuth=()=>({user:null,restaurantRole:'owner',portalAccess:{},signOut(){throw Error('write forbidden')}});`;
      if(id.endsWith('/shared/lib/supabase.ts')) return `
        export const isSupabaseConfigured=true, liveDataUnavailableMessage='Unavailable', supabaseAuthStorageKey=null;
        export const ownerRecoverySupabase=null,staffInviteSupabase=null;
        export const supabase={rpc:async(name)=>{const pro=new URLSearchParams(location.search).get('plan')==='PRO'; const data={
          list_restaurant_offers:[],get_restaurant_offer_email_summary:{available:false},
          get_restaurant_entitlements:{},get_restaurant_kassa_compliance_status:{accepted:true},
          get_restaurant_capacity:{plan:{plan_key:pro?'PRO':'BASIC'},offers:{usage:0,effective_limit:pro?15:5}},
          get_restaurant_billing_catalog:{products:[{product_code:'BASIC',product_kind:'PLAN',monthly_price_minor:5900,currency:'EUR',base_offer_limit:5,base_customer_limit:3000},{product_code:'PRO',product_kind:'PLAN',monthly_price_minor:14900,currency:'EUR',base_offer_limit:15,base_customer_limit:15000}]}
        };if(!(name in data))throw Error('Unexpected RPC: '+name);return {data:data[name],error:null};},
        from(name){if(name!=='branches')throw Error('Unexpected table');const q={select:()=>q,eq:()=>q,order:async()=>({data:[],error:null})};return q;}};`;
    },
    configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!['/owner','/customer-copy','/public-copy'].includes(req.url?.split('?')[0]))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/copy-entry.tsx"></script></body></html>'));});},
  }, react()], server:{host:'127.0.0.1',port:0}, logLevel:'error' });
const results=[];
try {
  await server.listen();
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  for(const [engine,type] of Object.entries({chromium,webkit})) {
    const browser=await type.launch({headless:true});
    try { for(const width of [390,1280]) for(const language of ['de','en','fr','it','es','zh','ko']) {
      const context=await browser.newContext({viewport:{width,height:800},serviceWorkers:'block'});
      const errors=[],blocked=[];
      await context.route('**/*',route=>{const r=route.request();if(!r.url().startsWith(origin+'/')||!['GET','HEAD'].includes(r.method())){blocked.push(r.method()+' '+new URL(r.url()).origin);return route.abort();}return route.continue();});
      await context.addInitScript(lang=>localStorage.setItem('wuxuai.ui-language',lang),language);
      const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
      page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
      for(const plan of ['BASIC','PRO']) {
        await page.goto(origin+'/owner?plan='+plan);
        const intro=page.locator('.restaurant-offers-heading p');
        await intro.waitFor();
        await page.waitForFunction(expected=>document.querySelector('.restaurant-offers-heading p')?.textContent===expected,GENERATED_MESSAGES[language]['owner.auto_6805353970ab']);
        assert.equal(await intro.textContent(),GENERATED_MESSAGES[language]['owner.auto_6805353970ab']);
        await page.waitForFunction(()=>document.querySelector('[data-i18n-skip="true"].card')?.textContent.includes('149'));
        assert.equal(await page.locator('a[href*="/menu"],a[href*="/catalog"]').count(),0);
        assert.ok((await page.locator('body').innerText()).includes('59'));
        assert.ok((await page.locator('body').innerText()).includes('149'));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        await page.reload();await intro.waitFor();
        await page.waitForFunction(expected=>document.querySelector('.restaurant-offers-heading p')?.textContent===expected,GENERATED_MESSAGES[language]['owner.auto_6805353970ab']);
        if(language==='de'&&plan==='BASIC')await page.screenshot({path:resolve(out,engine+'-'+width+'-owner.png'),fullPage:true});
      }
      await page.goto(origin+'/customer-copy');
      const nav=page.locator('.premium-bottom-navigation');await nav.waitFor();
      assert.equal(await nav.locator('button').count(),4);
      const qr=nav.locator('button').nth(2);await qr.focus();await page.keyboard.press('Enter');
      assert.equal(await page.locator('output').textContent(),'collect');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.goto(origin+'/public-copy');await page.locator('.public-premium-entry-grid').waitFor();
      assert.equal(await page.locator('a[href*="/menu"],a[href*="/catalog"]').count(),0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
      results.push({engine,width,language,ownerPlans:2,reload:true,customerKeyboard:true,publicEntry:true});
      await context.close();
    }} finally {await browser.close();}
  }
  console.log(JSON.stringify({status:'PASS',cases:results.length,results},null,2));
} finally {await server.close();}
