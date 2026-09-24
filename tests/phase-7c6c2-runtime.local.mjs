import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const container='supabase_db_wuxuai-phase7b4d-local';
const args=['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'];
const sql=input=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024});
const focused=readFileSync(new URL('./phase-7c6c2-test-provider-binding.local.sql',import.meta.url),'utf8');
assert.match(sql(focused),/PHASE_7C6C2_TEST_BINDING_PASS/);
console.log('FOCUSED_SQL_SECURITY_PASS');

const query=`begin read only;
select public.resolve_test_billing_binding_internal('BASIC','TEST',
 'price_1UIrMd59e5GrFXdMfnSrKlRA',5900,'EUR','wuxuai_bonus_basic_monthly',false);
commit;`;
const baseline=sql(query).trim();
const execute=promisify(execFile);
const results=await Promise.all(Array.from({length:24},()=>execute('docker',[...args,'-c',query],
 {encoding:'utf8',maxBuffer:1024*1024})));
for(const {stdout} of results)assert.equal(stdout.trim(),baseline);
console.log('PARALLEL_READS_24_IDENTICAL_PASS');
