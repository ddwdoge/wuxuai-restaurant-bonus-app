import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = p => readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260922007000_billing_catalog_reconciliation.sql');
// Reuse the established fixture loader. Trigger bypass ONLY while loading
// synthetic historical rows; origin is restored before any migration/assertion.
const fixture=read('tests/phase-7c5-owner-capacity-contract.local.sql').split('set local role authenticated;')[0];
const setup=`
\\set ON_ERROR_STOP on
do $$ begin if (select count(*) from supabase_migrations.schema_migrations)<>163 then raise exception 'Expected history 163'; end if; end $$;
${fixture}
update public.branch_subscriptions set trial_started_at='2026-01-31Z',trial_ends_at='2026-04-30Z'
where id='7c500000-0000-4000-8000-000000000013';
create temporary table baseline_relations as select tablename from pg_tables where schemaname='public';
create function pg_temp.fingerprint() returns jsonb language plpgsql as $$
declare t record; h text; result jsonb:='{}'; begin
 for t in select tablename from baseline_relations order by tablename loop
  execute format('select md5(coalesce(string_agg(to_jsonb(r)::text,chr(10) order by to_jsonb(r)::text),'''')) from public.%I r',t.tablename) into h;
  result:=result||jsonb_build_object(t.tablename,h);
 end loop; return result; end $$;
create temporary table before_data as select pg_temp.fingerprint() fingerprint;
create temporary table before_functions as select oid,pg_get_functiondef(oid) definition from pg_proc
where pronamespace='public'::regnamespace and prokind='f' and proname<>'resolve_restaurant_entitlements_internal';
`;
const check=`
do $$ begin
 if pg_temp.fingerprint() is distinct from (select fingerprint from before_data) then raise exception 'EXISTING_DATA_CHANGED'; end if;
 if exists(select 1 from before_functions where definition is distinct from pg_get_functiondef(oid)) then raise exception 'EXISTING_FUNCTION_CHANGED'; end if;
 if (select trial_ends_at from public.branch_subscriptions where id='7c500000-0000-4000-8000-000000000013')<>'2026-04-30Z'::timestamptz then raise exception 'TRIAL_CHANGED'; end if;
 if public.resolve_restaurant_entitlements_internal('7c500000-0000-4000-8000-000000000011')->>'monthly_price_eur_ex_vat'<>'59' then raise exception 'BASIC_CHANGED'; end if;
end $$;
`;
const input=setup+migration+check+"select 'UPGRADE_163_164_PASS';\n"+migration+check+"select 'REPEAT_1_PASS';\n"+migration+check+"select 'REPEAT_2_PASS';\nrollback;";
const output=execFileSync('docker',['exec','-i','supabase_db_wuxuai-phase7b4d-local','psql','-U','postgres','-d','postgres','-X','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8*1024*1024});
for(const marker of ['UPGRADE_163_164_PASS','REPEAT_1_PASS','REPEAT_2_PASS']) {assert.ok(output.includes(marker));console.log(marker);}
console.log('ALL_EXISTING_TABLE_FINGERPRINTS_AND_NON_ENTITLEMENT_FUNCTIONS_UNCHANGED');
console.log('SYNTHETIC_FIXTURES_ROLLED_BACK');
