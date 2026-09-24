import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

// Local-only synthetic fixture. The caller must reset the task-owned local DB
// after this script; no hosted project or real identity is ever contacted.
const container = 'supabase_db_wuxuai-phase7b4d-local';
const sqlLiteral = value => `'${String(value).replaceAll("'", "''")}'`;
const run = sql => new Promise((resolve,reject) => {
  const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres',
    '-X','-qAt','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
  let out='',err='';
  child.stdout.on('data',part=>out+=part);
  child.stderr.on('data',part=>err+=part);
  child.on('error',reject);
  child.on('close',code=>code===0?resolve(out.trim()):reject(new Error(
    err.includes('BUSINESS_VERIFICATION_TRANSITION_BLOCKED')?'TRANSITION_BLOCKED':'LOCAL_SQL_FAILURE')));
  child.stdin.end(sql);
});

const admin=randomUUID(),owner=randomUUID(),organization=randomUUID(),restaurant=randomUUID();
const branch=randomUUID(),sameRequest=randomUUID(),correlation=randomUUID();
const name='WUXUAI TEST Verification Parallel';
const confirmation=action=>`CONFIRMED:${name}:${restaurant}:${action}`;

await run(`begin;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values (${sqlLiteral(admin)},'authenticated','authenticated',${sqlLiteral(`bv-parallel-${admin}@example.invalid`)},now(),'{}','{}',now(),now()),
(${sqlLiteral(owner)},'authenticated','authenticated',${sqlLiteral(`bv-parallel-${owner}@example.invalid`)},now(),'{}','{}',now(),now());
insert into public.platform_admins(user_id,role,active) values(${sqlLiteral(admin)},'platform_owner',true);
set local session_replication_role=replica;
insert into public.organizations(id,owner_id,name) values(${sqlLiteral(organization)},${sqlLiteral(owner)},${sqlLiteral(name)});
insert into public.restaurants(id,owner_id,name,slug,organization_id,activation_status)
values(${sqlLiteral(restaurant)},${sqlLiteral(owner)},${sqlLiteral(name)},${sqlLiteral(`bv-parallel-${restaurant.slice(0,12)}`)},${sqlLiteral(organization)},'pending_activation');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country)
values(${sqlLiteral(branch)},${sqlLiteral(organization)},${sqlLiteral(restaurant)},${sqlLiteral(name)},${sqlLiteral(`bv-parallel-${branch.slice(0,12)}`)},'AT');
update public.restaurants set primary_branch_id=${sqlLiteral(branch)} where id=${sqlLiteral(restaurant)};
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
values(${sqlLiteral(restaurant)},${sqlLiteral(organization)},${sqlLiteral(branch)},${sqlLiteral(owner)},'owner');
set local session_replication_role=origin;
commit;`);

const call=(action,request)=>`begin;
do $claims$ begin
perform set_config('request.jwt.claim.sub',${sqlLiteral(admin)},true);
perform set_config('request.jwt.claim.role','authenticated',true);
perform set_config('request.jwt.claims',jsonb_build_object('sub',${sqlLiteral(admin)},
  'role','authenticated','session_id',${sqlLiteral(randomUUID())},
  'auth_time',extract(epoch from clock_timestamp()))::text,true);
end $claims$;
set local role authenticated;
select public.manage_business_verification(${sqlLiteral(restaurant)},${sqlLiteral(action)},
  ${action==='START_REVIEW'?'\'MANUAL\'':'null'},'SYNTHETIC_LOCAL_QA','SYNTHETIC LOCAL QA ONLY',null,
  ${sqlLiteral(request)},${sqlLiteral(correlation)},${sqlLiteral(confirmation(action))});
commit;`;

const identical=await Promise.all(Array.from({length:24},()=>run(call('START_REVIEW',sameRequest))));
const answers=identical.map(line=>JSON.parse(line.split('\n').find(x=>x.startsWith('{'))));
assert.equal(answers.filter(x=>x.idempotent===false).length,1);
assert.equal(answers.filter(x=>x.idempotent===true).length,23);
assert.ok(answers.every(x=>x.status==='IN_REVIEW'));
assert.equal((await run(`select count(*) from public.business_verification_decisions where restaurant_id=${sqlLiteral(restaurant)}`)).trim(),'1');

const competing=await Promise.allSettled(Array.from({length:24},()=>run(call('REJECT',randomUUID()))));
assert.equal(competing.filter(x=>x.status==='fulfilled').length,1);
assert.equal(competing.filter(x=>x.status==='rejected'&&x.reason.message==='TRANSITION_BLOCKED').length,23);
assert.equal((await run(`select count(*) from public.business_verification_decisions where restaurant_id=${sqlLiteral(restaurant)}`)).trim(),'2');
assert.equal((await run(`select status from public.business_verification_cases where restaurant_id=${sqlLiteral(restaurant)}`)).trim(),'REJECTED');
console.log('BUSINESS_VERIFICATION_PARALLEL_PASS 24 identical / 24 competing; synthetic local fixture requires local reset');
