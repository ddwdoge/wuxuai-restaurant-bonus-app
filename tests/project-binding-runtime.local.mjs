// Disposable two-instance evidence. No hosted endpoint is contacted.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,cpSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {randomUUID,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyAndInstall} from '../scripts/project-binding-bootstrap.mjs';
import {exerciseRuntime,functionSnapshot,checkUpgrade} from './project-binding-runtime-cases.local.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const cli=resolve(root,'node_modules/.bin/supabase');
const run=(bin,args,input)=>execFileSync(bin,args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:32*1024*1024}).trim();
const safeAsync=(bin,args)=>new Promise((res,rej)=>{
  const p=spawn(bin,args,{stdio:['ignore','pipe','pipe']});let text='';
  for(const s of [p.stdout,p.stderr])s.on('data',d=>{text+=d;});
  p.on('error',()=>rej(Error('LOCAL_SPAWN_FAILED')));
  p.on('close',code=>code===0?res(text):rej(Error(`LOCAL_PROCESS_FAILED_${code}`)));
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const stacks=[];let assertions=0;
const check=(a,b)=>{assert.deepEqual(a,b);assertions++;};
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql=(s,q)=>run('docker',['exec','-i',`supabase_db_${s.id}`,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],q);
const jsonSql=(s,q)=>JSON.parse(sql(s,q));
const asyncSql=(s,q)=>new Promise((res,rej)=>{
  const p=spawn('docker',['exec','-i',`supabase_db_${s.id}`,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
  let out='';p.stdout.on('data',d=>out+=d);p.stderr.resume();p.stdin.end(q);
  p.on('error',()=>rej(Error('LOCAL_SQL_SPAWN_FAILED')));
  p.on('close',code=>{if(code!==0)return rej(Error('LOCAL_SQL_FAILED'));try{res(JSON.parse(out.trim()));}catch{rej(Error('LOCAL_SQL_JSON_FAILED'));}});
});
async function post(url,path,body,headers={}){
  assert.match(url,/^http:\/\/127\.0\.0\.1:\d+$/);
  return fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
}
try{
  for(let i=0;i<2;i++){
    const dir=mkdtempSync(join(tmpdir(),'wuxuai-bootstrap-'));
    const id=dir.split('/').at(-1).toLowerCase(),base=57520+i*100;
    const s={dir,id,base,authName:`bootstrap_auth_${id}`,ref:(i?'b':'a').repeat(20)};stacks.push(s);
    mkdirSync(join(dir,'supabase'));
    let config=readFileSync(join(root,'supabase/config.toml'),'utf8')
      .replace(/^project_id = .+$/m,`project_id = "${id}"`)
      .replace(/561(\d\d)/g,(_,n)=>String(base+Number(n)-20));
    writeFileSync(join(dir,'supabase/config.toml'),config);
    cpSync(join(root,'supabase/migrations'),join(dir,'supabase/migrations'),{recursive:true});
    const runtimeMigration='20261009190125_project_binding_runtime_guards.sql';
    if(i===1)rmSync(join(dir,'supabase/migrations',runtimeMigration));
    console.log(JSON.stringify({phase:'fresh_start',instance:i+1}));
    await safeAsync(cli,['start','--workdir',dir,'-x','realtime,storage-api,imgproxy,studio,postgres-meta,edge-runtime,logflare,vector,supavisor']);
    s.status=JSON.parse(run(cli,['status','--workdir',dir,'-o','json']));
    if(i===1){
      const before=functionSnapshot(s,jsonSql);
      cpSync(join(root,'supabase/migrations',runtimeMigration),join(dir,'supabase/migrations',runtimeMigration));
      await safeAsync(cli,['migration','up','--local','--workdir',dir]);
      checkUpgrade(before,functionSnapshot(s,jsonSql));
      console.log(JSON.stringify({phase:'upgrade_exact_function_owner_acl_diff',pass:true}));
    }
    check(Number(sql(s,'select count(*) from supabase_migrations.schema_migrations;')),215);
    check(sql(s,'show session_replication_role;'),'origin');
    // Real Auth container, distinct configured issuer; no fabricated tokens.
    const auth=JSON.parse(run('docker',['inspect',`supabase_auth_${id}`]))[0];
    let env=auth.Config.Env.filter(v=>!v.startsWith('GOTRUE_JWT_ISSUER=')&&!v.startsWith('API_EXTERNAL_URL='));
    s.issuer=`https://${s.ref}.supabase.co/auth/v1`;
    env.push(`GOTRUE_JWT_ISSUER=${s.issuer}`,`API_EXTERNAL_URL=https://${s.ref}.supabase.co`);
    const envPath=join(dir,'auth.env');writeFileSync(envPath,env.join('\n'),{mode:0o600});
    s.authUrl=`http://127.0.0.1:${base+12}`;
    const network=Object.keys(auth.NetworkSettings.Networks)[0];
    run('docker',['run','-d','--pull=never','--name',s.authName,'--network',network,
      '-p',`127.0.0.1:${base+12}:9999`,'--env-file',envPath,auth.Config.Image]);
    for(let t=0;t<50;t++){try{if((await fetch(s.authUrl+'/health')).ok)break;}catch{}await pause(200);}
    const signup=await post(s.authUrl,'/signup',{email:`bootstrap-${randomUUID()}@example.invalid`,password:`Aa!${randomBytes(24).toString('hex')}`});
    check(signup.status,200);s.auth=await signup.json();assert.ok(s.auth.access_token);
    s.claims=JSON.parse(Buffer.from(s.auth.access_token.split('.')[1],'base64url').toString());
    check(s.claims.iss,s.issuer);
    const response=await fetch(s.authUrl+'/user',{headers:{Authorization:`Bearer ${s.auth.access_token}`}});
    check(response.status,200);
    check((await response.json()).id,s.claims.sub);
    s.anchor=jsonSql(s,'select public.get_project_bootstrap_anchor();');
    s.e={environment:'STAGING',project_ref:s.ref,backend_url:`https://${s.ref}.supabase.co`,auth_issuer:s.issuer,
      app_origin:`https://bootstrap-${i}.example.invalid`,hosting_account_id:'1'.repeat(32),worker_name:`bootstrap-worker-${i}`,
      request_id:randomUUID(),operator_ref:'synthetic-local-admin'};
    s.rpc=async(name,body={},token=s.auth.access_token)=>{
      const r=await post(s.status.API_URL,`/rest/v1/rpc/${name}`,body,{apikey:s.status.ANON_KEY,Authorization:`Bearer ${token}`});
      return {status:r.status,data:await r.json()};
    };
    console.log(JSON.stringify({phase:'real_auth_ready',instance:i+1}));
    check((await s.rpc('project_binding_session_matches')).data,false);
    s.adapters={
      // Provider/hosting observations are explicitly synthetic local test adapters.
      project:async()=>({id:s.ref,status:'ACTIVE_HEALTHY',database:{host:`db.${s.ref}.supabase.co`}}),
      hosting:async()=>[{hostname:new URL(s.e.app_origin).hostname,service:s.e.worker_name,environment:'production'}],
      worker:async()=>({bindings:Object.entries({WUXUAI_PROJECT_REF:s.ref,WUXUAI_BACKEND_URL:s.e.backend_url,
        WUXUAI_AUTH_ISSUER:s.issuer,WUXUAI_APP_ORIGIN:s.e.app_origin}).map(([name,text])=>({name,text,type:'plain_text'}))}),
      auth:async()=>{const r=await fetch(s.authUrl+'/user',{headers:{Authorization:`Bearer ${s.auth.access_token}`}});
        check(r.status,200);check((await r.json()).id,s.claims.sub);
        return {issuer:s.claims.iss,verifiedUserId:s.claims.sub,sessionId:s.claims.session_id};},
      restAnchor:async()=>{const r=await post(s.status.API_URL,'/rest/v1/rpc/get_project_bootstrap_anchor',{},
        {apikey:s.status.SERVICE_ROLE_KEY,Authorization:`Bearer ${s.status.SERVICE_ROLE_KEY}`});check(r.status,200);return r.json();},
      sqlAnchor:async()=>jsonSql(s,'select public.get_project_bootstrap_anchor();'),
      sessionExists:async(uid,sid)=>jsonSql(s,`select to_json(exists(select 1 from auth.sessions where user_id=${quote(uid)}::uuid and id=${quote(sid)}::uuid));`),
      install:async(b,d)=>asyncSql(s,`select project_bootstrap.install(${quote(JSON.stringify(b))}::jsonb,${quote(d)});`),
    };
  }
  const [a,b]=stacks;
  await exerciseRuntime(a,jsonSql,false);
  await exerciseRuntime(b,jsonSql,false);
  console.log(JSON.stringify({phase:'binding_matrix'}));
  for(const change of [{auth: b.adapters.auth},{sqlAnchor:b.adapters.sqlAnchor},
    {project: b.adapters.project},{hosting:b.adapters.hosting}]){
    await assert.rejects(verifyAndInstall(a.e,{...a.adapters,...change}));assertions++;
    check(sql(a,'select count(*) from project_bootstrap.binding;'),'0');
  }
  const results=await Promise.all(Array.from({length:6},()=>verifyAndInstall(a.e,a.adapters)));
  check(results.filter(r=>r.installed).length,1);
  check(new Set(results.map(r=>r.binding_id)).size,1);
  check((await a.rpc('project_binding_session_matches')).data,true);
  check((await b.rpc('project_binding_session_matches')).data,false);
  const foreign=await a.rpc('project_binding_session_matches',{},b.auth.access_token);
  assert.ok(foreign.status===401||foreign.data===false);assertions++;
  await verifyAndInstall(b.e,b.adapters);
  check((await b.rpc('project_binding_session_matches')).data,true);
  // First instance's ordinary Auth session has a different issuer but a REAL
  // local session in the SAME DB, so this tests issuer independently of FK scope.
  const other=await post(a.status.API_URL,'/auth/v1/signup',
    {email:`other-${randomUUID()}@example.invalid`,password:`Aa!${randomBytes(24).toString('hex')}`},{apikey:a.status.ANON_KEY});
  check(other.status,200);const otherSession=await other.json();
  check((await a.rpc('project_binding_session_matches',{},otherSession.access_token)).data,false);
  // A real local Auth process issues the exact legacy issuer. No hosted call,
  // token fabrication or SQL claim injection; it shares A's DB/signing config.
  const legacyIssuer='https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1';
  const legacyConfig=JSON.parse(run('docker',['inspect',a.authName]))[0];
  a.legacyAuth=`bootstrap_old_auth_${a.id}`;
  const legacyEnv=legacyConfig.Config.Env.filter(v=>!v.startsWith('GOTRUE_JWT_ISSUER=')&&!v.startsWith('API_EXTERNAL_URL='));
  legacyEnv.push(`GOTRUE_JWT_ISSUER=${legacyIssuer}`,`API_EXTERNAL_URL=${legacyIssuer.replace('/auth/v1','')}`);
  const legacyEnvFile=join(a.dir,'legacy-auth.env');writeFileSync(legacyEnvFile,legacyEnv.join('\n'),{mode:0o600});
  run('docker',['run','-d','--pull=never','--name',a.legacyAuth,'--network',Object.keys(legacyConfig.NetworkSettings.Networks)[0],
    '-p',`127.0.0.1:${a.base+13}:9999`,'--env-file',legacyEnvFile,legacyConfig.Config.Image]);
  const legacyUrl=`http://127.0.0.1:${a.base+13}`;
  for(let t=0;t<50;t++){try{if((await fetch(legacyUrl+'/health')).ok)break;}catch{}await pause(200);}
  const legacyResponse=await post(legacyUrl,'/signup',{email:`legacy-${randomUUID()}@example.invalid`,password:`Aa!${randomBytes(24).toString('hex')}`});
  check(legacyResponse.status,200);const legacySession=await legacyResponse.json();
  check(JSON.parse(Buffer.from(legacySession.access_token.split('.')[1],'base64url')).iss,legacyIssuer);
  check((await a.rpc('project_binding_session_matches',{},legacySession.access_token)).data,false);
  const deniedLegacy=await a.rpc('prepare_basic_test_checkout',{input_acceptance_id:randomUUID(),input_request_id:randomUUID(),
    input_return_route:'/admin/settings/konto-testphase'},legacySession.access_token);
  check(deniedLegacy.data.message,'PROJECT_BINDING_REQUIRED');
  check(sql(a,'select count(*) from public.basic_test_checkout_requests;'),'0');
  console.log(JSON.stringify({phase:'real_legacy_issuer',denied:true,checkoutDelta:0}));
  for(const s of stacks){
    await exerciseRuntime(s,jsonSql,true);
    check(sql(s,'select count(*) from project_bootstrap.binding;'),'1');
    check(sql(s,'select count(*) from project_bootstrap.installation_audit;'),'1');
    await assert.rejects(verifyAndInstall({...s.e,request_id:randomUUID()},s.adapters));assertions++;
    for(const role of ['anon','authenticated','service_role']){
      check(sql(s,`select has_function_privilege('${role}','project_bootstrap.require_runtime_binding(boolean)','EXECUTE');`),'f');
      check(sql(s,`select has_schema_privilege('${role}','project_bootstrap','USAGE');`),'f');
      check(sql(s,`select has_function_privilege('${role}','project_bootstrap.install(jsonb,text)','EXECUTE');`),'f');
      check(sql(s,`select has_table_privilege('${role}','project_bootstrap.binding','INSERT');`),'f');
      for(const q of ['select * from project_bootstrap.binding','update project_bootstrap.binding set project_ref=project_ref']){
        assert.throws(()=>sql(s,`begin; set local role ${role}; ${q}; rollback;`));assertions++;
      }
    }
    check(sql(s,"select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='project_bootstrap' and c.relkind='r' and c.relrowsecurity;"),'3');
    assert.throws(()=>sql(s,"update project_bootstrap.binding set worker_name='changed';"));assertions++;
    check(sql(s,"select environment from public.business_verification_environment where singleton;"),'DISABLED');
    check(sql(s,"select real_intake_status from public.country_kyb_intake_policies where country_code='AT';"),'BLOCKED');
    check(sql(s,'select count(*) from public.customer_transactional_email_deliveries;'),'0');
    check(sql(s,'select count(*) from public.restaurants;'),'0');
    const owners=jsonSql(s,"select jsonb_agg(jsonb_build_object('function',p.proname,'owner',r.rolname,'definer',p.prosecdef)) from pg_proc p join pg_roles r on r.oid=p.proowner where p.proname in ('get_project_bootstrap_anchor','get_server_project_binding','project_binding_session_matches','install') and p.pronamespace in ('public'::regnamespace,'project_bootstrap'::regnamespace);");
    check(owners.every(p=>p.owner==='postgres'),true);
    const count=Number(sql(s,'select count(*) from supabase_migrations.schema_migrations;'));
    check(count,215); // all migration versions exactly present: repeat set is empty
    await safeAsync(cli,['migration','up','--local','--workdir',s.dir]);
    check(Number(sql(s,'select count(*) from supabase_migrations.schema_migrations;')),count);
    const lint=await safeAsync(cli,['db','lint','--local','--workdir',s.dir,'--schema','project_bootstrap','--level','error','--fail-on','error']);
    check(/ERROR|"level"\s*:\s*"error"/.test(lint),false);
    console.log(JSON.stringify({phase:'repeat_and_bootstrap_lint',pass:true}));
    console.log(JSON.stringify({instance:s.id,history:count,binding:1,audit:1,queue:0,restaurants:0,owners}));
  }
  console.log(JSON.stringify({status:'LOCAL_RUNTIME_BINDING_PASS',assertions,providerProof:'SIMULATED_ONLY',mail:0,checkout:0}));
}catch(error){
  // No raw SQL/CLI/auth errors: they may carry input or connection material.
  console.error(JSON.stringify({status:'FAIL',code:/^[A-Z_0-9]+$/.test(error.message)?error.message:'LOCAL_ASSERTION_FAILED',lines:error.stack?.split('\n').filter(x=>x.includes('bootstrap.local.mjs')).map(x=>x.replace(root,'<repo>'))}));
  process.exitCode=1;
}finally{
  for(const s of stacks.reverse()){
    if(s.legacyAuth){try{run('docker',['rm','-f',s.legacyAuth]);}catch{}}
    try{run('docker',['rm','-f',s.authName]);}catch{}
    try{await safeAsync(cli,['stop','--workdir',s.dir,'--no-backup']);}catch{console.error('TASK_STACK_CLEANUP_FAILED');process.exitCode=1;}
    rmSync(s.dir,{recursive:true,force:true});
  }
}
