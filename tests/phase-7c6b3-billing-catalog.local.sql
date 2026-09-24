\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'BILLING_ASSERTION: %',label; end if; end $$;
select pg_temp.assert_true((select count(*)=4 from public.billing_catalog_internal),'four products');
select pg_temp.assert_true((select monthly_price_minor=5900 and base_offer_limit=5 and base_customer_limit=3000 from public.billing_catalog_internal where product_code='BASIC'),'BASIC');
select pg_temp.assert_true((select monthly_price_minor=14900 and base_offer_limit=15 and base_customer_limit=15000 from public.billing_catalog_internal where product_code='PRO'),'PRO');
select pg_temp.assert_true((select monthly_price_minor=1900 and capacity_per_unit=5 and trial_calendar_months=0 from public.billing_catalog_internal where product_code='OFFER_CAPACITY'),'offer addon');
select pg_temp.assert_true((select monthly_price_minor=2900 and capacity_per_unit=5000 and trial_calendar_months=0 from public.billing_catalog_internal where product_code='CUSTOMER_CAPACITY'),'customer addon');
select pg_temp.assert_true((select monthly_price_eur_ex_vat=99 and offer_limit is null from public.commercial_plan_catalog where plan_key='PRO'),'legacy evidence unchanged');
select pg_temp.assert_true(public.billing_trial_end_internal('2024-01-31 12:34:56Z')='2024-02-29 12:34:56Z'::timestamptz,'leap end');
select pg_temp.assert_true(public.billing_trial_end_internal('2025-01-31 12:34:56Z')='2025-02-28 12:34:56Z'::timestamptz,'ordinary end');
select pg_temp.assert_true(public.billing_trial_end_internal('2026-03-31 12:34:56Z')='2026-04-30 12:34:56Z'::timestamptz,'30 day month end');
select pg_temp.assert_true(public.billing_trial_end_internal('2026-12-15 12:34:56Z')='2027-01-15 12:34:56Z'::timestamptz,'year change');
set local timezone='Pacific/Auckland';
select pg_temp.assert_true(public.billing_trial_end_internal('2024-01-31 12:34:56Z')='2024-02-29 12:34:56Z'::timestamptz,'session timezone independent');
do $$ declare env text; p jsonb; relation text; api_role text; expected_status text; begin
 foreach env in array array['TEST','LIVE'] loop
  p:=public.resolve_billing_product_internal('PRO',env);
  expected_status:=case when env='TEST' and to_regclass('public.billing_tax_readiness_versions') is not null
    then 'VERIFIED' else 'UNBOUND' end;
  perform pg_temp.assert_true(p->>'environment'=env and p->>'binding_status'=expected_status and p->>'provider_ready'='false'
   and p->>'seller_readiness'='PLANNED' and p->>'purchase_allowed'='false','unbound seller isolation');
 end loop;
 begin perform public.resolve_billing_product_internal('PRO',null); raise exception 'null environment accepted'; exception when invalid_parameter_value then null; end;
 foreach relation in array array['billing_product_versions','billing_seller_versions','billing_provider_binding_versions','billing_trial_claims'] loop
  perform pg_temp.assert_true((select relrowsecurity from pg_class where oid=('public.'||relation)::regclass),'RLS');
  foreach api_role in array array['anon','authenticated','service_role'] loop
   perform pg_temp.assert_true(not has_table_privilege(api_role,'public.'||relation,'INSERT,UPDATE,DELETE,TRUNCATE'),'DML');
  end loop;
  begin execute format('update public.%I set created_at=created_at',relation); exception when undefined_column then
    begin execute format('delete from public.%I',relation); exception when object_not_in_prerequisite_state then continue; end;
   when object_not_in_prerequisite_state then continue;
  end;
  raise exception 'Immutability missing %',relation;
 end loop;
 begin insert into public.billing_seller_versions(version,seller_name,ip_licensor_name,readiness,valid_from,revision_reason)
 values(2,'Synthetic','Synthetic','LIVE_READY',now(),'Local negative verification test');
 raise exception 'Unverified live seller accepted'; exception when check_violation then null; end;
 begin insert into public.billing_provider_binding_versions(product_code,catalog_version,provider,environment,revision,binding_status,valid_from,revision_reason)
 values('PRO',1,'STRIPE','TEST',2,'VERIFIED',now(),'Local negative binding test');
 raise exception 'Missing price accepted'; exception when check_violation then null; end;
end $$;
-- Registration uses the genuine pending RPC, not a forged subscription.
create temporary table fixture(actor uuid default gen_random_uuid(), outsider uuid default gen_random_uuid(), tenant uuid);
insert into fixture default values;
grant select,update on fixture to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'authenticated','authenticated','billing-'||actor||'@example.invalid',now(),'{}','{}',now(),now() from fixture;
select set_config('request.jwt.claim.sub',actor::text,true) from fixture;
set local role authenticated;
update fixture set tenant=(public.start_restaurant_owner_trial('Synthetic Billing','Synthetic Billing',null,'AT')->'restaurant'->>'id')::uuid;
do $$ declare p jsonb; begin
 p:=public.get_restaurant_billing_catalog((select tenant from fixture));
 if p#>>'{capacity,offers,effective_limit}'<>'0' or p#>>'{capacity,active_customers,effective_limit}'<>'0'
  or p->>'trial_start_allowed'<>'false' or p->>'provider_ready'<>'false' then raise exception 'Pending activation leak'; end if;
 if p#>>'{capacity,plan,plan_key}' is not null then raise exception 'Pending effective BASIC'; end if;
 if p is distinct from public.get_restaurant_billing_catalog((select tenant from fixture)) then raise exception 'Non deterministic read'; end if;
end $$;
select set_config('request.jwt.claim.sub',outsider::text,true) from fixture;
do $$ begin
 begin perform public.get_restaurant_billing_catalog((select tenant from fixture)); raise exception 'Foreign tenant read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- A claim is immutable and keyed by company/restaurant, never by selected plan.
insert into public.billing_trial_claims(organization_id,restaurant_id,provider_event_reference)
select r.organization_id,r.id,'synthetic-local-no-provider-call' from public.restaurants r join fixture f on f.tenant=r.id;
do $$ begin
 begin
  insert into public.billing_trial_claims(organization_id,restaurant_id,provider_event_reference)
  select r.organization_id,r.id,'synthetic-second-plan-not-allowed' from public.restaurants r join fixture f on f.tenant=r.id;
  raise exception 'Second trial claim accepted';
 exception when unique_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub',actor::text,true) from fixture;
set local role authenticated;
do $$ begin
 if public.get_restaurant_billing_catalog((select tenant from fixture))->>'trial_previously_used'<>'true' then
  raise exception 'Claim eligibility not observed'; end if;
end $$;
reset role;
do $$ declare r text; signature text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  foreach signature in array array['billing_trial_end_internal(timestamp with time zone)','resolve_billing_product_internal(text,text)'] loop
   perform pg_temp.assert_true(not has_function_privilege(r,'public.'||signature,'EXECUTE'),'private RPC');
  end loop;
 end loop;
 perform pg_temp.assert_true(not has_function_privilege('anon','public.get_restaurant_billing_catalog(uuid,text)','EXECUTE'),'anon blocked');
end $$;
rollback;
select 'BILLING_CATALOG_LOCAL_PASS';
