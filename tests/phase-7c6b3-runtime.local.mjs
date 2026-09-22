import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const args=['exec','-i','supabase_db_wuxuai-phase7b4d-local','psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1'];
const sql=input=>execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024});
for(const file of ['phase-7c6b3-billing-catalog.local.sql','phase-7c6b2-pending-registration.local.sql','phase-7c6b2-role-security.local.sql','phase-7c5-owner-capacity-contract.local.sql']){
 const input=readFileSync(new URL('./'+file,import.meta.url),'utf8').replaceAll('7c500000-','7c630000-').replaceAll('phase-7c5-local','phase-7c6b3-runtime');
 sql(input);console.log('LOCAL_REGRESSION_PASS',file);
}
const query=`begin read only; select public.resolve_billing_product_internal('PRO','TEST'); commit;`;
const baseline=sql(query).trim();
const execute=promisify(execFile);
const results=await Promise.all(Array.from({length:24},()=>execute('docker',[...args,'-c',query],{encoding:'utf8',maxBuffer:1024*1024})));
for(const {stdout} of results)assert.equal(stdout.trim(),baseline);
console.log('PARALLEL_READS_24_IDENTICAL_PASS');
// Staff, customer and anonymous cannot read the owner's catalog.
sql(`begin;
insert into auth.users(id,aud,role,email) values
 ('7c630000-0000-4000-8000-000000000071','authenticated','authenticated','staff@example.invalid'),
 ('7c630000-0000-4000-8000-000000000072','authenticated','authenticated','customer@example.invalid');
insert into public.restaurant_members(restaurant_id,user_id,role) values
 ('7c500000-0000-4000-8000-000000000011','7c630000-0000-4000-8000-000000000071','staff');
insert into public.customer_accounts(auth_user_id) values('7c630000-0000-4000-8000-000000000072');
set local role authenticated;
do $$ declare actor uuid; begin
 foreach actor in array array['7c630000-0000-4000-8000-000000000071'::uuid,'7c630000-0000-4000-8000-000000000072'::uuid] loop
 perform set_config('request.jwt.claim.sub',actor::text,true);
 begin perform public.get_restaurant_billing_catalog('7c500000-0000-4000-8000-000000000011');
 raise exception 'Billing role bypass'; exception when insufficient_privilege then null; end;
 end loop;
end $$;
reset role;
set local role anon;
do $$ begin
begin perform public.get_restaurant_billing_catalog('7c500000-0000-4000-8000-000000000011');
raise exception 'Anonymous billing bypass'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into auth.users(id,aud,role,email) values('7c630000-0000-4000-8000-000000000073','authenticated','authenticated','platform@example.invalid');
insert into public.platform_admins(user_id,role,active) values('7c630000-0000-4000-8000-000000000073','platform_owner',true);
select set_config('request.jwt.claim.sub','7c630000-0000-4000-8000-000000000073',true);
set local role authenticated;
do $$ begin
 if public.get_restaurant_billing_catalog('7c500000-0000-4000-8000-000000000011')->>'catalog_version'<>'1' then
 raise exception 'Platform read unavailable'; end if;
end $$;
reset role; rollback;`);
console.log('STAFF_CUSTOMER_ANON_BLOCKED_PASS');
console.log('PLATFORM_ADMIN_READ_PASS');
