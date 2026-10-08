// Real local Auth, Owner RPC, Mailpit and browser. No forged roles, tokens or activation fixtures.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createClient} from '@supabase/supabase-js';
const root=fileURLToPath(new URL('..',import.meta.url));
assert.ok(process.env.RECOVERY_LOCAL_STACK,'Explicit disposable stack required');
const runtime=realpathSync(process.env.RECOVERY_LOCAL_STACK);
assert.match(runtime,/\/wuxuai-owner-recovery-[\w-]+$/);
assert.ok(!existsSync(resolve(runtime,'supabase/.temp/project-ref')),'Unlinked only');
const config=readFileSync(resolve(runtime,'supabase/config.toml'),'utf8');
const project=config.match(/^project_id\s*=\s*"([\w-]+)"/m)?.[1];
assert.match(project||'',/^wuxuai-owner-recovery-/);
assert.match(config,/enable_confirmations = true/);assert.match(config,/otp_expiry = 30/);
const base=config.match(/^site_url\s*=\s*"([^"]+)"/m)?.[1];assert.equal(new URL(base).hostname,'127.0.0.1');
const status=JSON.parse(execFileSync(resolve(root,'node_modules/.bin/supabase'),['status','--workdir',runtime,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
for(const key of['API_URL','MAILPIT_URL'])assert.equal(new URL(status[key]).hostname,'127.0.0.1');
const sql=q=>execFileSync(process.env.LOCAL_DOCKER||'docker',['exec','-i','supabase_db_'+project,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const client=()=>createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const modulePath=process.env.WUXUAI_PLAYWRIGHT_MODULE||'playwright';const playwright=await import(isAbsolute(modulePath)?pathToFileURL(modulePath).href:modulePath);
const server=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',new URL(base).port,'--strictPort'],{cwd:root,env:{...process.env,VITE_SUPABASE_URL:status.API_URL,VITE_SUPABASE_ANON_KEY:status.ANON_KEY},stdio:'ignore'});
const results=[];let phase='startup',browser;
function check(label,value){assert.ok(value,label);results.push(label);console.log(JSON.stringify({check:label,status:'PASS'}));}
async function mail(email,type){for(let i=0;i<100;i++){const list=await(await fetch(status.MAILPIT_URL+'/api/v1/messages')).json();for(const entry of list.messages){if(!JSON.stringify(entry.To).includes(email))continue;const m=await(await fetch(status.MAILPIT_URL+'/api/v1/message/'+entry.ID)).json();for(const match of m.HTML.matchAll(/href="([^"]+)"/g)){const link=new URL(match[1].replaceAll('&amp;','&'));if(link.origin===status.API_URL&&link.searchParams.get('type')===type){assert.equal(new URL(link.searchParams.get('redirect_to')).origin,base);return link.href;}}}await delay(100);}throw Error('LOCAL_MAIL_MISSING');}
async function owner(){const email=`owner-recovery-${randomUUID()}@example.invalid`,password='Aa!9'+randomUUID(),api=client();
const signup=await api.auth.signUp({email,password,options:{emailRedirectTo:base+'/auth/callback',data:{full_name:'SYNTHETIC OWNER',restaurant_name:'SYNTHETIC RECOVERY',business_country:'AT'}}});assert.ifError(signup.error);assert.equal(signup.data.session,null);
const response=await fetch(await mail(email,'signup'),{redirect:'manual'});const redirect=new URL(response.headers.get('location'));assert.equal(redirect.origin,base);const hash=new URLSearchParams(redirect.hash.slice(1));const established=await api.auth.setSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token')});assert.ifError(established.error);
const registered=await api.rpc('start_restaurant_owner_trial',{input_owner_name:'SYNTHETIC OWNER',input_restaurant_name:'SYNTHETIC RECOVERY',input_phone:null,input_country:'AT'});assert.ifError(registered.error);assert.ok(registered.data.restaurant.id);
return{email,password,id:established.data.user.id,tenant:registered.data.restaurant.id,api,session:established.data.session};}
function snapshot(){return sql(`select jsonb_build_object('restaurants',(select jsonb_agg(to_jsonb(r) order by id) from restaurants r),'branches',(select jsonb_agg(to_jsonb(b) order by id) from branches b),'members',(select jsonb_agg(to_jsonb(m) order by restaurant_id,user_id) from restaurant_members m),'subscriptions',(select jsonb_agg(to_jsonb(s) order by id) from branch_subscriptions s),'admins',(select count(*) from platform_admins),'customers',(select count(*) from customers),'points',(select count(*) from points_transactions),'rewards',(select count(*) from customer_rewards))::text;`);}
function binding(a){assert.match(a.id,/^[a-f0-9-]{36}$/);return JSON.parse(sql(`select jsonb_build_object('owner',r.owner_id='${a.id}','pending',r.activation_status='pending_activation' and r.status='draft','branch',b.restaurant_id=r.id and b.country='AT','role',m.role,'trial',s.trial_started_at is null and s.trial_ends_at is null,'subscription',s.subscription_status) from restaurants r join branches b on b.id=r.primary_branch_id join restaurant_members m on m.restaurant_id=r.id and m.user_id=r.owner_id join branch_subscriptions s on s.branch_id=b.id where r.id='${a.tenant}';`));}
async function context(){const c=await browser.newContext({locale:'de-AT',viewport:{width:390,height:844}});await c.route('**/*',r=>[base,status.API_URL].includes(new URL(r.request().url()).origin)?r.continue():r.abort());return c;}
async function request(page,a){await page.goto(base+'/auth/forgot-password?portal=owner');await page.locator('#forgot-password-email').fill(a.email);await page.getByRole('button',{name:'Reset-Link senden'}).click();await page.getByRole('status').waitFor();return mail(a.email,'recovery');}
async function denied(page,url,label){await page.goto(url);await page.getByText('Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.',{exact:true}).waitFor();check(label,await page.locator('#new-password').count()===0);}
async function access(a,api){const r=await api.rpc('get_current_portal_access'),p=await api.rpc('get_current_platform_role');check(phase+':owner-only',!r.error&&r.data.owner_access===true&&r.data.staff_access===false&&!p.error&&p.data===null);const b=binding(a);check(phase+':binding-pending-no-trial',b.owner&&b.pending&&b.branch&&b.role==='owner'&&b.trial&&b.subscription==='pending_activation');}
try{for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await delay(100);}
check('fresh-empty-stack',sql('select count(*) from restaurants')==='0');check('active-triggers',sql('show session_replication_role')==='origin');
for(const engine of['chromium','webkit']){phase=engine+':setup';browser=await playwright[engine].launch();const foreign=await owner();
for(const variant of['valid','reload','foreign-session','cancel','expired']){phase=engine+':'+variant;const a=await owner(),before=snapshot();await access(a,a.api);const c=await context(),page=await c.newPage();page.setDefaultTimeout(15000);
if(variant==='foreign-session'){await page.goto(base+'/restaurant/login');await page.evaluate(session=>localStorage.setItem('sb-127-auth-token',JSON.stringify(session)),foreign.session);await denied(page,base+'/auth/update-password?portal=owner',phase+':foreign-session-alone-denied');}
const link=await request(page,a);
if(variant==='expired'){await delay(32000);await denied(page,link,phase+':expired-denied');check(phase+':old-password-still-valid',!(await client().auth.signInWithPassword({email:a.email,password:a.password})).error);}
else{await page.goto(link);await page.locator('#new-password').waitFor();check(phase+':clean-url',!new URL(page.url()).hash&&!/token|code=/.test(new URL(page.url()).search));
const other=await context(),otherPage=await other.newPage();await denied(otherPage,base+'/auth/update-password?portal=owner',phase+':separate-session-no-marker');await other.close();
if(variant==='cancel'){await page.evaluate(()=>{history.pushState({},'', '/auth/forgot-password?portal=owner');dispatchEvent(new PopStateEvent('popstate'));});await page.locator('#forgot-password-email').waitFor();await page.waitForFunction(()=>!sessionStorage.getItem('wuxuai-owner-recovery-auth'));await denied(page,base+'/auth/update-password?portal=owner',phase+':cancel-cleared');check(phase+':password-unchanged',!(await client().auth.signInWithPassword({email:a.email,password:a.password})).error);}
else{if(variant==='reload'){await page.reload();await page.locator('#new-password').waitFor();}const password='Bb!9'+randomUUID();await page.locator('#new-password').fill(password);await page.locator('#confirm-new-password').fill(password);await page.getByRole('button',{name:'Passwort speichern',exact:true}).click();
if(variant!=='foreign-session'){await page.waitForURL(u=>u.pathname==='/restaurant/login');await page.getByText('Dein Passwort wurde geändert. Du kannst dich jetzt anmelden.',{exact:true}).waitFor();check(phase+':owner-success',true);}else{await page.waitForURL(u=>u.pathname!=='/auth/update-password');check(phase+':normal-session-not-replaced',await page.evaluate(id=>JSON.parse(localStorage.getItem('sb-127-auth-token'))?.user.id===id,foreign.id));const rows=await foreign.api.from('restaurants').select('id').eq('id',a.tenant);check(phase+':foreign-tenant-denied',!rows.error&&rows.data.length===0);}
const fresh=client(),login=await fresh.auth.signInWithPassword({email:a.email,password});check(phase+':fresh-login-same-id',!login.error&&login.data.user.id===a.id);check(phase+':old-password-denied',Boolean((await client().auth.signInWithPassword({email:a.email,password:a.password})).error));await access(a,fresh);
await denied(page,link,phase+':replay-denied');const replay=await context();await denied(await replay.newPage(),link,phase+':separate-replay-denied');await replay.close();}
}
check(phase+':tenant-business-fingerprint',snapshot()===before);check(phase+':foreign-password-unchanged',!(await client().auth.signInWithPassword({email:foreign.email,password:foreign.password})).error);await c.close();}
await browser.close();browser=null;}
}catch(error){console.log(JSON.stringify({phase,status:'FAIL',reason:'RAW_ERROR_WITHHELD',timeout:error.name==='TimeoutError'}));process.exitCode=1;}
finally{if(browser)await browser.close();server.kill('SIGTERM');}
console.log(JSON.stringify({checks:results.length,status:process.exitCode?'FAIL':'PASS',boundary:'local Auth/Mailpit; existing access-token sessions are not assumed immediately invalid; no activation/provider proof'}));
