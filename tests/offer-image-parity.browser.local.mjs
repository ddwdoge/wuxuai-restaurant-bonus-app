// Real Owner page, editor, service and Customer card; synthetic persisted RPC adapter, not DB E2E.
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
import {createServer,transformWithEsbuild} from 'vite';
import react from '@vitejs/plugin-react';
const modulePath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium,webkit}=await import(isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath);
const root=fileURLToPath(new URL('..',import.meta.url));
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';
import{I18nProvider}from'/src/shared/i18n/I18nProvider';import{RestaurantOffersPage}from'/src/modules/admin/pages/RestaurantOffersPage';
import{RestaurantOfferCard}from'/src/modules/customer/components/RestaurantOfferCard';
import '/src/styles.css';import '/src/shared/ui/ui-system.css';import '/src/modules/customer/customer-premium.css';
const offer=JSON.parse(localStorage.getItem('synthetic-offer'));
if(offer.image_url.startsWith('data:image/svg')){const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;const c=canvas.getContext('2d');c.fillStyle='orange';c.fillRect(0,0,800,600);c.fillStyle='blue';c.beginPath();c.arc(400,300,150,0,Math.PI*2);c.fill();offer.image_url=canvas.toDataURL('image/jpeg');localStorage.setItem('synthetic-offer',JSON.stringify(offer));}
createRoot(document.getElementById('root')).render(<I18nProvider><BrowserRouter>{location.pathname==='/customer'?<main className="customer-premium"><section className="customer-offer-grid"><RestaurantOfferCard offer={offer} onOpen={()=>{}}/></section></main>:<RestaurantOffersPage/>}</BrowserRouter></I18nProvider>);`;
const adapter=`export const supabase={rpc:async(name,args)=>{let o=JSON.parse(localStorage.getItem('synthetic-offer'));window.calls??=[];window.calls.push(name);
if(name==='list_restaurant_offers')return{data:[o]};
if(name==='save_restaurant_offer'){o={...o,title:args.input_title,image_url:args.input_image_url};localStorage.setItem('synthetic-offer',JSON.stringify(o));return{data:o};}
if(name==='save_restaurant_offer_image_presentation'){o={...o,image_zoom:args.input_image_zoom,image_position_x:args.input_image_position_x,image_position_y:args.input_image_position_y};localStorage.setItem('synthetic-offer',JSON.stringify(o));return{data:o};}
if(['get_restaurant_capacity','get_restaurant_entitlements','get_restaurant_offer_email_summary'].includes(name))return{data:null};throw Error('Unexpected RPC '+name);},
from(name){if(name!=='branches')throw Error('Unexpected table');const q={select:()=>q,eq:()=>q,order:async()=>({data:[{id:'synthetic-branch',name:'Synthetic branch',status:'active'}]})};return q;}};`;
const server=await createServer({root,configFile:false,plugins:[{name:'offer-fixture',enforce:'pre',
resolveId(id){if(id==='/offer-fixture.tsx')return '\0entry';if(id.endsWith('/TenantProvider'))return '\0tenant';if(id.endsWith('/lib/supabase'))return '\0db';},
async load(id){if(id==='\0entry')return(await transformWithEsbuild(entry,'fixture.tsx',{loader:'tsx',jsx:'automatic'})).code;if(id==='\0db')return adapter;if(id==='\0tenant')return `export const useTenant=()=>({activeRestaurant:{id:'synthetic-tenant',name:'Synthetic',status:'active',activation_status:null}});`;},
configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!['/owner','/customer'].includes(req.url))return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/offer-fixture.tsx"></script></body></html>'));});}},react()],server:{host:'127.0.0.1',port:0},logLevel:'error'});
const results=[];
try{await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
for(const[name,engine]of Object.entries({chromium,webkit})){const browser=await engine.launch();try{for(const width of[320,390,1280]){
const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await context.route('**/*',r=>r.request().url().startsWith(origin+'/')?r.continue():r.abort());
await context.addInitScript(()=>{localStorage.setItem('wuxuai.ui-language','de');if(!localStorage.getItem('synthetic-offer'))localStorage.setItem('synthetic-offer',JSON.stringify({id:'synthetic-offer',restaurant_id:'synthetic-tenant',branch_id:'synthetic-branch',title:'Synthetic offer',short_description:'Synthetic description',offer_type:'NEWS',status:'PUBLISHED',is_active:true,valid_from:'2026-01-01T00:00:00Z',valid_to:'2099-01-01T00:00:00Z',button_label:'Angebot ansehen',image_zoom:1,image_position_x:.5,image_position_y:.5,image_url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="orange"/><circle cx="400" cy="300" r="150" fill="blue"/></svg>')}));});
const sample=async(selector)=>{const frame=page.locator(selector).first();await frame.waitFor();await page.waitForFunction(selector=>{const el=document.querySelector(selector),i=el?.querySelector('img');if(!i?.naturalWidth)return false;const s=getComputedStyle(el);return Math.abs(Number(s.getPropertyValue('--smart-media-render-scale'))-Number(s.getPropertyValue('--smart-media-crop-zoom'))*4/3)<.0001;},selector);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return frame.evaluate(el=>{const s=getComputedStyle(el),i=el.querySelector('img'),r=el.getBoundingClientRect();return{ratio:r.width/r.height,padding:s.padding,display:s.display,fit:getComputedStyle(i).objectFit,scale:s.getPropertyValue('--smart-media-render-scale'),position:s.getPropertyValue('--smart-media-position-x'),src:i.getAttribute('src')};});};
const fit=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal page overflow');
await page.goto(origin+'/owner');await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();
await page.getByRole('button',{name:'Bild vergrößern',exact:true}).focus();await page.keyboard.press('Enter');
const editor=await sample('.smart-media-editor-stage .smart-media-frame');await fit();
await page.getByRole('button',{name:'Entwurf speichern',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.reload();
await page.getByRole('button',{name:'Vorschau',exact:true}).click();const preview=await sample('.restaurant-offer-customer-preview > .smart-media-frame');await fit();
await page.goto(origin+'/customer');const customer=await sample('.customer-offer-card-media .smart-media-frame');await fit();await page.reload();const reloaded=await sample('.customer-offer-card-media .smart-media-frame');
console.log(JSON.stringify({engine:name,width,padding:[editor.padding,preview.padding,customer.padding],ratios:[editor.ratio,preview.ratio,customer.ratio]}));
for(const value of[editor,preview,customer,reloaded]){assert.ok(Math.abs(value.ratio-16/9)<.02,'16:9 media frame');assert.equal(value.padding,'0px','media must not inherit text padding');assert.equal(value.fit,'contain');assert.equal(value.src,editor.src);assert.equal(value.scale,editor.scale);assert.equal(value.position,editor.position);}
assert.deepEqual(errors,[]);results.push({engine:name,width,status:'PASS'});await context.close();
}}finally{await browser.close();}}
console.log(JSON.stringify({results,boundary:'real UI/service; synthetic persistence; no hosted upload or DB claim'}));
}finally{await server.close();}
