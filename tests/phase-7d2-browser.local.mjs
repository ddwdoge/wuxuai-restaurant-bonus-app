import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chromium,webkit} from '/Users/dongdongwu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

// Entirely local synthetic browser fixture. No hosted Supabase or real identity.
const project='wuxuai-phase7d2-local';
const dbContainer=`supabase_db_${project}`;
const status=JSON.parse(execFileSync('./node_modules/.bin/supabase',['status','--output','json'],
  {encoding:'utf8',stdio:['pipe','pipe','pipe'],env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'1',DO_NOT_TRACK:'1'}}));
assert.equal(status.API_URL,'http://127.0.0.1:56221');
const sql=input=>execFileSync('docker',['exec','-i',dbContainer,'psql','-U','postgres','-d','postgres',
  '-X','-qAt','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const adminClient=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const publicClient=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const adminEmail=`d2-admin-${randomUUID()}@example.invalid`,ownerEmail=`d2-owner-${randomUUID()}@example.invalid`;
const password=randomUUID()+randomUUID();
const org=randomUUID(),restaurant=randomUUID(),branch=randomUUID(),caseId=randomUUID();
let adminId,ownerId,browser,server;
let checks=0;
try {
  const adminCreated=await adminClient.auth.admin.createUser({email:adminEmail,password,email_confirm:true});
  if(adminCreated.error)throw Error('Local admin fixture failed');adminId=adminCreated.data.user.id;
  const ownerCreated=await adminClient.auth.admin.createUser({email:ownerEmail,password,email_confirm:true});
  if(ownerCreated.error)throw Error('Local owner fixture failed');ownerId=ownerCreated.data.user.id;
  sql(`begin;set local session_replication_role=replica;
    insert into public.platform_admins(user_id,role,active) values(${quote(adminId)},'platform_owner',true);
    insert into public.organizations(id,owner_id,name) values(${quote(org)},${quote(ownerId)},'D2 SYNTHETIC');
    insert into public.restaurants(id,owner_id,name,slug,organization_id,activation_status)
      values(${quote(restaurant)},${quote(ownerId)},'D2 SYNTHETIC',${quote('d2-'+restaurant.slice(0,12))},${quote(org)},'pending_activation');
    insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city)
      values(${quote(branch)},${quote(org)},${quote(restaurant)},'D2 SYNTHETIC',${quote('d2-'+branch.slice(0,12))},'AT','Synthetic Road 1','1000','Synthetic City');
    update public.restaurants set primary_branch_id=${quote(branch)} where id=${quote(restaurant)};
    insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
      values(${quote(restaurant)},${quote(org)},${quote(branch)},${quote(ownerId)},'owner');
    insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,selected_plan,plan_key,payment_status)
      values(${quote(org)},${quote(branch)},'pending_activation','pending_activation','BASIC','BASIC','not_required');
    insert into public.organization_legal_profiles(organization_id,company_name,legal_form,registered_address_source,
      address_source_restaurant_id,address_source_branch_id,email,responsible_person)
      values(${quote(org)},'D2 Synthetic GmbH','GmbH','restaurant',${quote(restaurant)},${quote(branch)},'d2@example.invalid','Synthetic Representative');
    insert into public.business_verification_cases(id,restaurant_id,country_code,verification_method,status,created_by)
      values(${quote(caseId)},${quote(restaurant)},'AT','MANUAL','PENDING_ACTIVATION',${quote(ownerId)});
    commit;`);
  const adminSession=await publicClient.auth.signInWithPassword({email:adminEmail,password});
  if(adminSession.error)throw Error('Local admin sign-in failed');
  const ownerSession=await publicClient.auth.signInWithPassword({email:ownerEmail,password});
  if(ownerSession.error)throw Error('Local owner sign-in failed');
  const before=sql(`select count(*) from public.business_verification_decisions`);
  server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','56226','--strictPort'],
    {env:{...process.env,VITE_SUPABASE_URL:status.API_URL,VITE_SUPABASE_ANON_KEY:status.ANON_KEY},stdio:'ignore'});
  for(let attempt=0;attempt<100;attempt++){
    try{if((await fetch('http://127.0.0.1:56226')).ok)break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  for(const [engine,launcher] of [['Chromium',chromium],['WebKit',webkit]]){
    browser=await launcher.launch({headless:true});
    for(const [persona,session,path] of [
      ['admin',adminSession.data.session,'/admin/platform/verification'],
      ['owner',ownerSession.data.session,'/admin/settings/betriebsverifizierung'],
    ]){
      const context=await browser.newContext();
      await context.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
      await context.addInitScript(value=>{localStorage.setItem('sb-127-auth-token',JSON.stringify(value));},session);
      const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
      for(const locale of ['de','en','fr','it','es','zh','ko'])for(const width of [320,375,390,430,767,768,1024,1440]){
        await page.setViewportSize({width,height:900});
        await page.goto('http://127.0.0.1:56226'+path,{waitUntil:'networkidle'});
        await page.evaluate(value=>localStorage.setItem('wuxuai.ui-language',value),locale);
        await page.reload({waitUntil:'networkidle'});
        assert.equal(new URL(page.url()).pathname,path,`${engine}/${persona}/${locale}/${width}: route`);
        const heading=persona==='admin'?page.getByRole('heading',{level:1}):page.getByTestId('owner-business-verification');
        await heading.waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${engine}/${persona}/${locale}/${width}: overflow`);
        assert.equal(await page.locator('html').getAttribute('lang'),locale);
        const small=await page.locator('button:not([disabled])').evaluateAll(elements=>elements.filter(element=>{
          if(!element.getClientRects().length)return false;
          const box=element.getBoundingClientRect();return box.width<44||box.height<44;
        }).map(element=>({className:element.className,width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height})));
        assert.deepEqual(small,[],`${engine}/${persona}/${locale}/${width}: touch`);
        checks++;
      }
      if(persona==='admin'){
        await page.evaluate(()=>localStorage.setItem('wuxuai.ui-language','de'));
        await page.goto('http://127.0.0.1:56226'+path,{waitUntil:'networkidle'});
        await page.getByRole('button',{name:'Details'}).click();
        await page.getByRole('dialog').waitFor();
        assert.equal(await page.getByRole('button',{name:'Prüfung beginnen'}).count(),1);
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({state:'hidden'});
        checks++;
      }
      assert.deepEqual(errors,[],`${engine}/${persona}: runtime errors`);
      await context.close();
    }
    await browser.close();browser=null;
  }
  assert.equal(sql('select count(*) from public.business_verification_decisions'),before,'read-only browser actions');
  console.log(`PHASE_7D2_BROWSER_PASS ${checks} Chromium/WebKit checks; UI writes 0`);
} finally {
  if(browser)await browser.close();
  if(server){server.kill('SIGTERM');await new Promise(resolve=>server.once('exit',resolve));}
  if(adminId&&ownerId){
    sql(`begin;set local session_replication_role=replica;
      delete from public.business_verification_cases where id=${quote(caseId)};
      delete from public.organization_legal_profiles where organization_id=${quote(org)};
      delete from public.branch_subscriptions where branch_id=${quote(branch)};
      delete from public.restaurant_members where restaurant_id=${quote(restaurant)};
      delete from public.branches where id=${quote(branch)};
      delete from public.restaurants where id=${quote(restaurant)};
      delete from public.organizations where id=${quote(org)};
      delete from public.platform_admins where user_id=${quote(adminId)};commit;`);
  }
  if(ownerId)await adminClient.auth.admin.deleteUser(ownerId);
  if(adminId)await adminClient.auth.admin.deleteUser(adminId);
}
