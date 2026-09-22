import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const container = "supabase_db_wuxuai-phase7b4d-local";
const migration = readFileSync(new URL("../supabase/migrations/20260922006000_pending_activation_registration_and_live_gates.sql", import.meta.url), "utf8");
const setup = `
\\set ON_ERROR_STOP on
do $$ begin
 if (select count(*) from supabase_migrations.schema_migrations) <> 162 then raise exception 'Expected exact history 162'; end if;
end $$;
begin;
create temporary table legacy_fixture(actor uuid default gen_random_uuid(), tenant uuid);
insert into legacy_fixture default values;
insert into legacy_fixture default values;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'authenticated','authenticated','legacy-'||actor||'@example.invalid',now(),'{}','{}',now(),now() from legacy_fixture;
do $$ declare f record; t uuid; begin
 for f in select * from legacy_fixture loop
  perform set_config('request.jwt.claim.sub',f.actor::text,true);
  t := (public.start_restaurant_owner_trial('Synthetic Legacy','Synthetic Legacy',null,'AT')->'restaurant'->>'id')::uuid;
  update legacy_fixture set tenant=t where actor=f.actor;
 end loop;
end $$;
update public.branch_subscriptions set status='active',subscription_status='active'
where branch_id=(select primary_branch_id from public.restaurants where id=(select tenant from legacy_fixture order by actor limit 1));
commit;
create function pg_temp.legacy_fingerprint() returns text language plpgsql as $$
declare relation text; rows_hash text; combined text := ''; begin
 foreach relation in array array['restaurants','organizations','branches','restaurant_members','branch_subscriptions','audit_log','country_launch_policy'] loop
  if to_regclass('public.'||relation) is null then raise exception 'Missing fingerprint relation: %',relation; end if;
  execute format('select md5(coalesce(string_agg(row_value::text, chr(10) order by row_value::text),'''')) from (select to_jsonb(t) - ''activation_status'' - ''selected_plan'' - ''current_period_start'' as row_value from public.%I t) q',relation) into rows_hash;
  combined := combined || relation || rows_hash;
 end loop;
 return md5(combined);
end $$;
create temporary table legacy_before as select pg_temp.legacy_fingerprint() as fingerprint;
`;
const check = `
do $$ begin
 if pg_temp.legacy_fingerprint() <> (select fingerprint from legacy_before) then raise exception 'LEGACY_DATA_CHANGED'; end if;
 if exists(select 1 from public.restaurants r join legacy_fixture f on f.tenant=r.id where r.activation_status is not null) then raise exception 'Legacy activation changed'; end if;
 if (select count(*) from public.branch_subscriptions s join public.branches b on b.id=s.branch_id join legacy_fixture f on f.tenant=b.restaurant_id where s.trial_started_at is not null and s.trial_ends_at is not null) <> 2 then raise exception 'Legacy trial dates missing'; end if;
end $$;
`;
const input = setup + migration + check + "select 'UPGRADE_162_163_PASS';\n" + migration + check + "select 'REPEAT_1_PASS';\n" + migration + check + "select 'REPEAT_2_PASS';\n";
const output = execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1"], { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
for (const marker of ["UPGRADE_162_163_PASS", "REPEAT_1_PASS", "REPEAT_2_PASS"]) {
 assert.ok(output.includes(marker), marker);
 console.log(marker);
}
console.log("LEGACY_ACTIVE_TRIAL_SUBSCRIPTION_FINGERPRINTS: UNCHANGED");
