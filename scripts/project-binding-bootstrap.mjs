import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const fail = (code) => { throw new Error(code); };
const exact = (actual, expected, code) => { if (actual !== expected) fail(code); };
const sha = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateExpected(e) {
  if (!e || !/^[a-z]{20}$/.test(e.project_ref ?? '')
    || ['bwhvfjuwixgwduoeqaya', 'fuqhljgesclipzduhykl'].includes(e.project_ref)) fail('PROJECT_INVALID');
  exact(e.environment, 'STAGING', 'ENVIRONMENT_INVALID');
  exact(e.backend_url, `https://${e.project_ref}.supabase.co`, 'BACKEND_INVALID');
  exact(e.auth_issuer, `${e.backend_url}/auth/v1`, 'ISSUER_INVALID');
  let origin;
  try { origin = new URL(e.app_origin); } catch { fail('ORIGIN_INVALID'); }
  if (origin.protocol !== 'https:' || origin.origin !== e.app_origin || origin.username || origin.password
    || ['app.bonus.wuxuaisbi.com', 'staging-app.bonus.wuxuaisbi.com'].includes(origin.hostname)) fail('ORIGIN_INVALID');
  if (!/^[a-f0-9]{32}$/.test(e.hosting_account_id ?? '')
    || !/^[a-z0-9][a-z0-9-]{2,62}$/.test(e.worker_name ?? '')
    || !/^[A-Za-z0-9_.:-]{3,100}$/.test(e.operator_ref ?? '')
    || !/^[0-9a-f-]{36}$/.test(e.request_id ?? '')) fail('SETUP_INVALID');
  return e;
}

// Dependency injection is solely for local tests. The CLI below always uses
// fixed provider API origins, authenticated live reads and TLS SQL.
export async function verifyAndInstall(expected, adapters) {
  const e = validateExpected(expected);
  const project = await adapters.project(e.project_ref);
  exact(project.id, e.project_ref, 'PROJECT_MISMATCH');
  exact(project.status, 'ACTIVE_HEALTHY', 'PROJECT_NOT_READY');
  exact(project.database?.host, `db.${e.project_ref}.supabase.co`, 'PROVIDER_DATABASE_MISMATCH');
  const domains = await adapters.hosting(e.hosting_account_id);
  const matches = domains.filter(d => d.hostname === new URL(e.app_origin).hostname);
  if (matches.length !== 1) fail('HOSTING_NOT_UNIQUE');
  exact(matches[0].service, e.worker_name, 'HOSTING_WORKER_MISMATCH');
  exact(matches[0].environment, 'production', 'HOSTING_ENVIRONMENT_MISMATCH');
  // "production" here is Cloudflare's Worker environment name, NOT WUXUAI Production.
  const settings = await adapters.worker(e.hosting_account_id, e.worker_name);
  for (const [name, value] of Object.entries({WUXUAI_PROJECT_REF:e.project_ref,
    WUXUAI_BACKEND_URL:e.backend_url,WUXUAI_AUTH_ISSUER:e.auth_issuer,WUXUAI_APP_ORIGIN:e.app_origin})) {
    const found = settings.bindings?.filter(b => b.name === name && b.type === 'plain_text');
    if (found?.length !== 1 || found[0].text !== value) fail('HOSTING_BINDING_MISMATCH');
  }
  const auth = await adapters.auth(e.backend_url);
  exact(auth.issuer, e.auth_issuer, 'AUTH_ISSUER_MISMATCH');
  if (!auth.verifiedUserId || !auth.sessionId) fail('AUTH_PROOF_INVALID');
  const rest = await adapters.restAnchor(e.backend_url);
  const sql = await adapters.sqlAnchor();
  for (const key of ['anchor','system_id','database_name']) {
    if (!rest?.[key] || rest[key] !== sql?.[key]) fail('DATABASE_MISMATCH');
  }
  if (!await adapters.sessionExists(auth.verifiedUserId, auth.sessionId)) fail('AUTH_DATABASE_MISMATCH');
  const binding = {environment:e.environment,project_ref:e.project_ref,backend_url:e.backend_url,
    auth_issuer:e.auth_issuer,app_origin:e.app_origin,hosting_account_id:e.hosting_account_id,
    worker_name:e.worker_name,request_id:e.request_id,operator_ref:e.operator_ref,
    database_anchor:sql.anchor,database_system_id:sql.system_id,database_name:sql.database_name};
  // Raw provider responses, credentials, tokens and user IDs never enter audit.
  const evidence = sha({binding,project:{id:project.id,status:project.status,host:project.database.host},
    domain:matches[0],authProofSha256:sha(auth)});
  return adapters.install(binding, evidence);
}

async function privateJson(path) {
  const s = await stat(path);
  if (!s.isFile() || (s.mode & 0o077) !== 0 || s.uid !== process.getuid()) fail('PRIVATE_FILE_REQUIRED');
  return JSON.parse(await readFile(path, 'utf8'));
}
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
export function sqlAdapter(credentials, expected) {
  // libpq service file owns hostname/TLS/credentials, never command arguments.
  // Environment overrides cannot replace the explicitly fixed target and TLS mode.
  return (query) => {
    try {
      const output = execFileSync('psql', ['-X','-A','-t','-v','ON_ERROR_STOP=1',
        `service=${credentials.pg_service} host=db.${expected.project_ref}.supabase.co dbname=postgres user=postgres sslmode=verify-full`],
      {input:query,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20_000,
        env:{PATH:process.env.PATH,PGSERVICEFILE:credentials.pg_service_file,PGPASSFILE:credentials.pg_pass_file}});
      return JSON.parse(output.trim());
    } catch { fail('DATABASE_ADMIN_OPERATION_FAILED'); }
  };
}
async function getJson(url, headers, method='GET', body) {
  const response = await fetch(url,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(15_000)});
  if (!response.ok) fail('PROVIDER_READ_FAILED');
  return response.json();
}
export function liveAdapters(e,c,sql) {
  const sb={Authorization:`Bearer ${c.supabase_management_token}`};
  const cf={Authorization:`Bearer ${c.cloudflare_read_token}`};
  const rest={apikey:c.supabase_service_key,Authorization:`Bearer ${c.supabase_service_key}`,'Content-Type':'application/json'};
  return {
    project: ref => getJson(`https://api.supabase.com/v1/projects/${ref}`,sb),
    hosting: async id => {
      const response=await getJson(`https://api.cloudflare.com/client/v4/accounts/${id}/workers/domains`,cf);
      if (response.success!==true || !Array.isArray(response.result)) fail('HOSTING_READ_FAILED');
      return response.result;
    },
    worker: async(id,name)=>{
      const response=await getJson(`https://api.cloudflare.com/client/v4/accounts/${id}/workers/scripts/${name}/settings`,cf);
      if(response.success!==true) fail('HOSTING_READ_FAILED'); return response.result;
    },
    auth: async backend=>{
      const user=await getJson(`${backend}/auth/v1/user`,{apikey:c.supabase_public_key,Authorization:`Bearer ${c.auth_access_token}`});
      let claims; try { claims=JSON.parse(Buffer.from(c.auth_access_token.split('.')[1],'base64url').toString()); }
      catch { fail('AUTH_PROOF_INVALID'); }
      // Claims are read only AFTER the target Auth server validates the token.
      if(!user.id || user.id!==claims.sub || !user.email_confirmed_at
        || claims.exp*1000<=Date.now()) fail('AUTH_PROOF_INVALID');
      return {issuer:claims.iss,verifiedUserId:user.id,sessionId:claims.session_id};
    },
    restAnchor: backend=>getJson(`${backend}/rest/v1/rpc/get_project_bootstrap_anchor`,rest,'POST','{}'),
    sqlAnchor: async()=>sql('select public.get_project_bootstrap_anchor();'),
    sessionExists: async(uid,sid)=>sql(`select to_json(exists(select 1 from auth.sessions where user_id::text=${literal(uid)} and id::text=${literal(sid)} and (not_after is null or not_after>now())));`),
    install: async(binding,digest)=>sql(`select project_bootstrap.install(${literal(JSON.stringify(binding))}::jsonb,${literal(digest)});`),
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [expectedPath,credentialsPath,confirmation]=process.argv.slice(2);
    const e=validateExpected(await privateJson(expectedPath));
    if(confirmation!==`INSTALL:${e.project_ref}:${e.request_id}`) fail('EXPLICIT_CONFIRMATION_REQUIRED');
    const c=await privateJson(credentialsPath);
    for(const p of [c.pg_service_file,c.pg_pass_file]){
      const s=await stat(p); if(!s.isFile() || (s.mode & 0o077)!==0 || s.uid!==process.getuid()) fail('PRIVATE_FILE_REQUIRED');
    }
    if(!/^[a-zA-Z0-9_-]+$/.test(c.pg_service ?? '')) fail('SQL_SERVICE_INVALID');
    const receipt=await verifyAndInstall(e,liveAdapters(e,c,sqlAdapter(c,e)));
    console.log(JSON.stringify(receipt));
  }catch(error){console.error(/^([A-Z_]+)$/.test(error.message)?error.message:'BOOTSTRAP_FAILED');process.exitCode=1;}
}
