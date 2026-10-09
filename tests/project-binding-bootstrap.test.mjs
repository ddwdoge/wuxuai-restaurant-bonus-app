import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {validateExpected,verifyAndInstall,liveAdapters} from '../scripts/project-binding-bootstrap.mjs';

const expected=()=>({environment:'STAGING',project_ref:'a'.repeat(20),backend_url:`https://${'a'.repeat(20)}.supabase.co`,
  auth_issuer:`https://${'a'.repeat(20)}.supabase.co/auth/v1`,app_origin:'https://new-staging.example.invalid',
  hosting_account_id:'1'.repeat(32),worker_name:'synthetic-new-worker',request_id:randomUUID(),operator_ref:'local-operator'});
function fixture(e){
  const anchor={anchor:randomUUID(),system_id:'123',database_name:'postgres'};
  let writes=0;
  return {get writes(){return writes;},adapters:{
    project:async()=>({id:e.project_ref,status:'ACTIVE_HEALTHY',database:{host:`db.${e.project_ref}.supabase.co`}}),
    hosting:async()=>[{hostname:new URL(e.app_origin).hostname,service:e.worker_name,environment:'production'}],
    worker:async()=>({bindings:Object.entries({WUXUAI_PROJECT_REF:e.project_ref,WUXUAI_BACKEND_URL:e.backend_url,
      WUXUAI_AUTH_ISSUER:e.auth_issuer,WUXUAI_APP_ORIGIN:e.app_origin}).map(([name,text])=>({name,text,type:'plain_text'}))}),
    auth:async()=>({issuer:e.auth_issuer,verifiedUserId:randomUUID(),sessionId:randomUUID()}),
    restAnchor:async()=>anchor,sqlAnchor:async()=>anchor,sessionExists:async()=>true,
    install:async()=>{writes++;return {installed:true};},
  }};
}
test('complete independent reads precede the single admin write',async()=>{
  const e=expected(),f=fixture(e);assert.deepEqual(await verifyAndInstall(e,f.adapters),{installed:true});assert.equal(f.writes,1);
});
for(const [name,override]of Object.entries({
  project:{project:async()=>({id:'b'.repeat(20)})},
  database:{restAnchor:async()=>({anchor:randomUUID(),system_id:'another',database_name:'postgres'})},
  issuer:{auth:async()=>({issuer:'https://foreign.example.invalid/auth/v1',verifiedUserId:'a',sessionId:'b'})},
  origin:{hosting:async()=>[{hostname:'wrong.example.invalid',service:'synthetic-new-worker',environment:'production'}]},
  worker:{worker:async()=>({bindings:[]})},
  session:{sessionExists:async()=>false},
  duplicateOrigin:{hosting:async()=>Array(2).fill({hostname:'new-staging.example.invalid'})},
  missingProvider:{project:async()=>{throw Error('PROVIDER_READ_FAILED');}},
}))test(`reject ${name} before install`,async()=>{
  const e=expected(),f=fixture(e);await assert.rejects(verifyAndInstall(e,{...f.adapters,...override}));assert.equal(f.writes,0);
});
test('no legacy staging, production, http, credentials or environment-only binding',()=>{
  for(const patch of [{project_ref:'bwhvfjuwixgwduoeqaya'},{project_ref:'fuqhljgesclipzduhykl'},
    {environment:'PRODUCTION'},{backend_url:'https://other.example.invalid'},
    {auth_issuer:'https://other.example.invalid/auth/v1'},{app_origin:'http://localhost'},
    {app_origin:'https://u:p@new-staging.example.invalid'},{app_origin:'https://app.bonus.wuxuaisbi.com'}]){
    assert.throws(()=>validateExpected({...expected(),...patch}));
  }
});
test('live adapter does not trust decoded claims without successful Auth validation',async()=>{
  const old=globalThis.fetch;let calls=0;
  try{globalThis.fetch=async()=>{calls++;return {ok:false};};
    await assert.rejects(liveAdapters(expected(),{auth_access_token:'not-a-token'},()=>{}).auth(expected().backend_url));
    assert.equal(calls,1);
  }finally{globalThis.fetch=old;}
});
test('session proof uses JSON boolean on the administrative SQL boundary',async()=>{
  let query;
  const adapter=liveAdapters(expected(),{},value=>{query=value;return true;});
  assert.equal(await adapter.sessionExists(randomUUID(),randomUUID()),true);
  assert.match(query,/^select to_json\(exists\(/);
  assert.match(query,/not_after>now\(\)/);
});
