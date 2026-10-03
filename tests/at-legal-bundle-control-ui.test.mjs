import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseLegalBundleControl, createLegalBundleOperation, classifyLegalBundleReceipt, createLegalBundleRunner } from '../src/modules/platform/legalBundleControlContract.mjs';
const id = n => `71000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hash='a'.repeat(64), bundle='bundle-'+hash;
export function fixture(status='READY') {
  return { restaurant_id:id(1), country:'AT', locale:'de-AT', technical_status:status==='BLOCKED'?'BLOCKED':'READY', effective_status:status,
    candidate:{ bundle_id:bundle,bundle_sha256:hash,country:'AT',locale:'de-AT',technical_status:status==='BLOCKED'?'BLOCKED':'READY',
      terms:{id:id(2),version:'SYNTHETIC-1',sha256:'b'.repeat(64),status:'published'},privacy:{id:id(3),version:'SYNTHETIC-1',sha256:'c'.repeat(64),status:'published'},policy_revision:{revision_id:'1'} },
    snapshot:{bundle_id:bundle,bundle_sha256:hash,effective_status:status,terms:{id:id(2),version:'SYNTHETIC-1',sha256:'b'.repeat(64),status:'published'},privacy:{id:id(3),version:'SYNTHETIC-1',sha256:'c'.repeat(64),status:'published'}},blocking_reasons:status==='BLOCKED'?['TERMS_LEGAL_REVIEW_REQUIRED','LEGAL_STATUS_BLOCKED']:[],
    allowed_actions:status==='BLOCKED'?['snapshot']:status==='PUBLISHED'?['snapshot','withdraw']:['snapshot','publish'] };
}
const operation = action => createLegalBundleOperation(fixture(action==='withdraw'?'PUBLISHED':'READY'),action,{key:id(10),approvalReference:'SYNTHETIC_REF',externalApproval:action==='publish'});
const receipt = op => ({ found:true,committed_at:'2026-10-03T00:00:00Z',current_effective_status:op.action==='publish'?'PUBLISHED':op.action==='withdraw'?'WITHDRAWN':'READY',
  receipt:{operation:op.action,bundle_id:op.bundleId,bundle_sha256:op.bundleHash,effective_status:op.action==='publish'?'PUBLISHED':op.action==='withdraw'?'WITHDRAWN':'READY',event_id:id(11)} });

test('read model is exact tenant, AT/de-AT and fails closed on malformed server authority',()=>{
  assert.equal(parseLegalBundleControl(fixture(),id(1)).country,'AT');
  for(const changed of [{country:'DE'},{locale:'de'},{restaurant_id:id(9)},{snapshot:null},{technical_status:'BLOCKED'},{candidate:null},{allowed_actions:['join']}]) {
    assert.throws(()=>parseLegalBundleControl({...fixture(),...changed},id(1)));
  }
});
test('draft/open policies and stale snapshot never permit a publish request',()=>{
  assert.throws(()=>createLegalBundleOperation(fixture('BLOCKED'),'publish',{key:id(10),approvalReference:'SYNTHETIC_REF',externalApproval:true}));
  const stale=fixture();stale.effective_status='STALE';stale.snapshot.effective_status='STALE';stale.allowed_actions=['snapshot'];
  assert.throws(()=>createLegalBundleOperation(stale,'publish',{key:id(10),approvalReference:'SYNTHETIC_REF',externalApproval:true}));
  assert.throws(()=>createLegalBundleOperation(fixture(),'publish',{key:id(10),approvalReference:'SYNTHETIC_REF'}));
  assert.throws(()=>createLegalBundleOperation(fixture(),'publish',{key:id(10),approvalReference:'person@example.invalid',externalApproval:true}));
});
for(const action of ['snapshot','publish','withdraw']) test(`${action}: double click and completed-key replay send exactly one mutation`,async()=>{
  const op=operation(action),calls=[];
  let release;const wait=new Promise(resolve=>{release=resolve;});
  const runner=createLegalBundleRunner(async(name,params)=>{calls.push({name,params});if(name==='get_platform_legal_bundle_receipt') return receipt(op);await wait;return {};});
  const first=runner.run(op);await runner.run(op);release();await first;await runner.run(op);
  assert.deepEqual(calls.map(c=>c.name),[action==='snapshot'?'create_platform_legal_bundle_snapshot':'set_platform_legal_bundle_publication','get_platform_legal_bundle_receipt']);
  assert.equal(calls[0].params.input_idempotency_key,op.key);assert.equal(calls[1].params.input_idempotency_key,op.key);
  assert.equal(runner.getState().phase,'confirmed');
});
test('timeout/rejected transport recovers only through receipt, no mutation retry',async()=>{
  const op=operation('publish'),calls=[];
  const runner=createLegalBundleRunner(async name=>{calls.push(name);if(name==='get_platform_legal_bundle_receipt')return receipt(op);throw new Error('synthetic timeout');});
  assert.equal((await runner.run(op)).phase,'confirmed');
  assert.equal(calls.length,2);
});
for(const [value,expected] of [[{found:false},'not_found'],[null,'unclear']]) test(`${expected} receipt persists a fail-closed gate across status reload and fresh action`,async()=>{
  const calls=[],op=operation('snapshot');
  const runner=createLegalBundleRunner(async name=>{calls.push(name);return name==='get_platform_legal_bundle_receipt'?value:null;});
  assert.equal((await runner.run(op)).phase,expected);
  const fresh=createLegalBundleOperation(fixture(),'snapshot',{key:id(12)});await runner.run(fresh);
  assert.equal(calls.length,2);await runner.reconcile();assert.equal(calls.length,3);
  assert.equal(calls[2],'get_platform_legal_bundle_receipt');assert.equal(runner.getState().phase,expected);
});
test('contradictory identity, action, event or status receipts are rejected',()=>{
  const op=operation('publish'),valid=receipt(op);
  for(const changed of [{bundle_id:'bundle-'+'f'.repeat(64)},{bundle_sha256:'f'.repeat(64)},{operation:'withdraw'},{event_id:'invalid'},{effective_status:'READY'}]) assert.equal(classifyLegalBundleReceipt({...valid,receipt:{...valid.receipt,...changed}},op),'contradictory');
});
test('snapshot request pins full expected versions, hashes, policy revision and predicted bundle ID',()=>{
  const op=operation('snapshot');assert.equal(op.bundleId,bundle);
  assert.equal(op.parameters.input_expected_terms_hash,'b'.repeat(64));assert.equal(op.parameters.input_expected_terms_version,'SYNTHETIC-1');
  assert.deepEqual(op.parameters.input_expected_policy_revision,{revision_id:'1'});
  assert.equal(op.parameters.input_country,'AT');assert.equal(op.parameters.input_locale,'de-AT');
});
test('existing recent-TOTP helper, role gate, drawer focus contract, no direct tables/business paths',()=>{
  const ui=readFileSync(new URL('../src/modules/platform/PlatformLegalBundleControl.tsx',import.meta.url),'utf8');
  const service=readFileSync(new URL('../src/modules/platform/platformLegalBundleService.ts',import.meta.url),'utf8');
  assert.match(ui,/platformRole === 'platform_owner' \|\| platformRole === 'platform_admin'/);
  assert.match(ui,/refreshPlatformTestCollectionRecentTotp\(factorId, code\)/);
  assert.match(ui,/inFlight\.current/);assert.match(ui,/crypto\.randomUUID\(\)/);
  assert.match(ui,/<AppDrawer/);assert.match(ui,/aria-live="polite"/);
  assert.match(service,/AbortSignal\.timeout\(15000\)/);
  assert.match(service,/new Map<string, LegalRunner>/);
  for(const source of [ui,service]) assert.doesNotMatch(source,/\.from\(|service_role|console\.|localStorage|sessionStorage|award_points|register_restaurant_customer|set_platform_business/);
  const css=readFileSync(new URL('../src/modules/platform/platform-legal-bundle-control.css',import.meta.url),'utf8');
  assert.match(css,/min-height: 44px/);assert.match(css,/overflow-wrap: anywhere/);
});
test('Migration 192 is byte-locked; Migration 193 adds exactly one stable read RPC and no DML',()=>{
  const migration=readFileSync(new URL('../supabase/migrations/20261003001000_at_legal_bundle_publication_contract.sql',import.meta.url));
  assert.equal(createHash('sha256').update(migration).digest('hex'),'71e8a33e54b47902413da00f8f5f94c1c6083b2805c456510ad96d9da662a3d2');
  const sql=readFileSync(new URL('../supabase/migrations/20261003002000_at_legal_bundle_control_read_model.sql',import.meta.url),'utf8');
  assert.equal((sql.match(/create function /gi)||[]).length,1);
  assert.match(sql,/stable security definer/);assert.match(sql,/require_legal_bundle_admin_internal/);
  assert.doesNotMatch(sql,/\b(insert into|update public\.|delete from|create table)\b/i);
  assert.match(sql,/grant execute.*to authenticated/);
  assert.match(sql,/from public,anon,authenticated,service_role/);
});

test('actual service loads only the narrow read model and preserves actor-scoped pending runners',async()=>{
  const ts=(await import('typescript')).default;
  const vm=await import('node:vm');
  const serviceSource=readFileSync(new URL('../src/modules/platform/platformLegalBundleService.ts',import.meta.url),'utf8');
  const {outputText}=ts.transpileModule(serviceSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
  const calls=[];let identity=id(5);
  const supabase={auth:{getSession:async()=>({data:{session:{user:{id:identity}}},error:null})},rpc(name,parameters){
    calls.push({name,parameters});const promise=Promise.resolve({data:name==='get_platform_at_legal_bundle_control'?fixture():{found:false},error:null});
    promise.abortSignal=signal=>{assert.ok(signal instanceof AbortSignal);return promise;};return promise;
  }};
  const exports={};vm.runInNewContext(outputText,{exports,AbortSignal,require:name=>name==='../../shared/lib/supabase'?{supabase}:{createLegalBundleRunner,parseLegalBundleControl}});
  await exports.loadPlatformLegalBundleControl(id(1));await exports.loadPlatformLegalBundleControl(id(1));
  assert.deepEqual(calls.map(call=>call.name),['get_platform_at_legal_bundle_control','get_platform_at_legal_bundle_control']);
  const runner=exports.platformLegalBundleRunner(id(5),id(1));assert.equal(exports.platformLegalBundleRunner(id(5),id(1)),runner);
  assert.notEqual(exports.platformLegalBundleRunner(id(6),id(1)),runner);
  identity=id(6);const op=operation('snapshot');await runner.run(op);
  assert.equal(calls.length,3);assert.equal(calls[2].name,'get_platform_legal_bundle_receipt');
  assert.equal(runner.getState().phase,'not_found');
});
