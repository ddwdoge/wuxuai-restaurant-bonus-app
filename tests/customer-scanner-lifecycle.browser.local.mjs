// Real Scanner/Drawer/parser; synthetic camera + decoder boundary. No physical camera/DB claim.
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import { createServer, transformWithEsbuild } from 'vite';
import react from '@vitejs/plugin-react';
const modulePath=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium,webkit}=await import(isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath);
const root=fileURLToPath(new URL('..',import.meta.url));
const entry=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';
import{I18nProvider}from'/src/shared/i18n/I18nProvider';
import{CustomerRestaurantScanner}from'/src/modules/customer/components/CustomerRestaurantScanner';
import '/src/styles.css';import '/src/shared/ui/ui-system.css';import '/src/modules/customer/customer-premium.css';
function App(){const[open,setOpen]=useState(false);const[mounted,setMounted]=useState(true);const[version,setVersion]=useState(0);
return <><button onClick={()=>{setMounted(true);setOpen(true)}}>Open scanner</button>
<button onClick={()=>setMounted(false)}>Unmount</button><button onClick={()=>setVersion(v=>v+1)}>Change context</button>
{mounted&&<CustomerRestaurantScanner open={open} onCancel={()=>setOpen(false)} onRestaurantDetected={(slug,path)=>{window.camera.detected.push({slug,path,version});setOpen(false)}}/>}</>}
createRoot(document.getElementById('root')).render(<I18nProvider><App/></I18nProvider>);`;
const decoder=`export class BrowserQRCodeReader {async decodeFromConstraints(constraints,video,callback){
const c=window.camera;const stream=await navigator.mediaDevices.getUserMedia(constraints);video.srcObject=stream;
// ZXing's finalizer clears the preview on every stop, even repeated stops.
const control={stop(){stream.getTracks().forEach(t=>t.stop());video.srcObject=null}};
c.sessions.push({control,callback,stream,video});if(c.delayControls)await new Promise(r=>c.controlResolvers.push(r));return control;}}`;
const server=await createServer({root,configFile:false,plugins:[{name:'scanner-fixture',enforce:'pre',
 resolveId(id){if(id==='/scanner-test.tsx')return '\0scanner-entry';if(id==='@zxing/browser')return '\0scanner-decoder';},
 async load(id){if(id==='\0scanner-decoder')return decoder;if(id==='\0scanner-entry')return (await transformWithEsbuild(entry,'scanner-test.tsx',{loader:'tsx',jsx:'automatic'})).code;},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url!=='/scanner-test')return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/scanner-test.tsx"></script></body></html>'));});},
},react()],server:{host:'127.0.0.1',port:0},logLevel:'error'});
const results=[];
try{await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
for(const [engineName,engine]of Object.entries({chromium,webkit})){
 const browser=await engine.launch({headless:true});
 try{for(const width of (process.env.SCANNER_FOCUSED==='1'?[320]:[320,390,430])){
  const context=await browser.newContext({viewport:{width,height:850},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   localStorage.setItem('wuxuai.ui-language','de');
   const c=window.camera={error:null,delayMedia:false,delayControls:false,mediaResolvers:[],controlResolvers:[],sessions:[],tracks:[],detected:[],requests:0};
   Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{
    c.requests++;if(c.error)throw new DOMException('Synthetic camera error',c.error);
    if(c.delayMedia)await new Promise(r=>c.mediaResolvers.push(r));
    const track={readyState:'live',stop(){this.readyState='ended'}};c.tracks.push(track);
    const stream=new MediaStream();Object.defineProperty(stream,'getTracks',{value:()=>[track]});return stream;
   }}});
  });
  const page=await context.newPage();const errors=[],unexpected=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   if(!route.request().url().startsWith(origin+'/')||!['GET','HEAD'].includes(route.request().method())){unexpected.push('unexpected request');return route.abort();}
   return route.continue();
  });
  const reset=async()=>{await page.goto(origin+'/scanner-test');await page.getByRole('button',{name:'Open scanner',exact:true}).waitFor();};
  const open=async()=>{await page.getByRole('button',{name:'Open scanner',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();};
  const active=()=>page.waitForFunction(()=>window.camera.sessions.length>0);
  const emit=async(text,index=-1)=>page.evaluate(({text,index})=>{const s=window.camera.sessions.at(index);s.callback({getText:()=>text},null,s.control);},{text,index});
  const stopped=async()=>{await page.waitForFunction(()=>window.camera.tracks.every(t=>t.readyState==='ended'),{},{timeout:1500});};
  const run=async(name,fn)=>{try{await reset();await fn();assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);results.push({engine:engineName,width,name,status:'PASS'});}catch(e){results.push({engine:engineName,width,name,status:'FAIL',reason:e.message.split('\n')[0]});}console.log(JSON.stringify(results.at(-1)));};
  await run('camera denied, unavailable, retry and keyboard',async()=>{
   for(const name of ['NotAllowedError','NotFoundError']){await page.evaluate(name=>window.camera.error=name,name);await open();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.camera.detected.length),0);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});}
   await page.evaluate(()=>window.camera.error=null);await open();await active();
   const dialog=page.getByRole('dialog');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.keyboard.press('Shift+Tab');assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
   await page.getByRole('button',{name:'Abbrechen',exact:true}).click();await stopped();assert.ok(await page.getByRole('button',{name:'Open scanner',exact:true}).evaluate(el=>el===document.activeElement));
  });
  await run('invalid/foreign codes, retry, context binding and parameter stripping',async()=>{
   await open();await active();await emit('not a QR URL');await page.getByRole('alert').waitFor();await stopped();
   await page.getByRole('button',{name:'Anderes Restaurant erneut scannen'}).click();await page.waitForFunction(()=>window.camera.sessions.length===2);
   await emit(origin+'/w/stale',0);
   assert.equal(await page.evaluate(()=>window.camera.sessions[1].video.srcObject===window.camera.sessions[1].stream),true,'old controls must not clear the current preview');
   await emit('https://foreign.example.invalid/w/other');await page.getByRole('alert').waitFor();await stopped();assert.equal(await page.evaluate(()=>window.camera.detected.length),0);
   await page.getByRole('button',{name:'Anderes Restaurant erneut scannen'}).click();await page.waitForFunction(()=>window.camera.sessions.length===3);
   await page.getByRole('button',{name:'Change context',exact:true}).evaluate(b=>b.click());
   await emit(origin+'/customer/restaurant-b?token=synthetic-old&reward=old');
   assert.deepEqual(await page.evaluate(()=>window.camera.detected),[{slug:'restaurant-b',path:'/w/restaurant-b',version:1}]);await stopped();
  });
  await run('cancel before delayed media resolution',async()=>{
   await page.evaluate(()=>window.camera.delayMedia=true);await open();await page.waitForFunction(()=>window.camera.mediaResolvers.length===1);
   await page.getByRole('button',{name:'Abbrechen',exact:true}).click();await page.evaluate(()=>window.camera.mediaResolvers.shift()());await active();await stopped();
   await emit(origin+'/w/stale');assert.equal(await page.evaluate(()=>window.camera.detected.length),0);
  });
  await run('old callback cannot cancel reopened scan',async()=>{
   await open();await active();await page.getByRole('button',{name:'Abbrechen',exact:true}).click();await stopped();await open();await page.waitForFunction(()=>window.camera.sessions.length===2);
   await emit(origin+'/w/stale',0);assert.equal(await page.evaluate(()=>window.camera.detected.length),0);
   assert.equal(await page.evaluate(()=>window.camera.sessions[1].stream.getTracks()[0].readyState),'live');
   await emit(origin+'/w/current',1);assert.deepEqual(await page.evaluate(()=>window.camera.detected.map(d=>d.slug)),['current']);await stopped();
   await emit(origin+'/w/current',1);assert.equal(await page.evaluate(()=>window.camera.detected.length),1);
  });
  await run('unmount while decoder controls pending',async()=>{
   await page.evaluate(()=>window.camera.delayControls=true);await open();await active();await page.getByRole('button',{name:'Unmount',exact:true}).evaluate(b=>b.click());
   await page.evaluate(()=>window.camera.controlResolvers.shift()());await stopped();await emit(origin+'/w/stale');assert.equal(await page.evaluate(()=>window.camera.detected.length),0);
  });
  await run('missing camera API fails closed',async()=>{
   await page.evaluate(()=>Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:undefined}));
   await open();await page.getByRole('alert').waitFor();assert.ok((await page.getByRole('alert').innerText()).includes('unterstützt keinen Kamera-Zugriff'));
   assert.equal(await page.evaluate(()=>window.camera.requests),0);assert.equal(await page.evaluate(()=>window.camera.detected.length),0);
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  });
  await context.close();
 }}finally{await browser.close();}
}
console.log(JSON.stringify({results,passed:results.filter(r=>r.status==='PASS').length,total:results.length,boundary:'synthetic camera/decoder; real component/parser; no business requests'}));
assert.ok(results.every(r=>r.status==='PASS'),'Scanner lifecycle failures reproduced');
}finally{await server.close();}
