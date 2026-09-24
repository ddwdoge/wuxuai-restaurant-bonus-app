\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'TEST_BINDING_ASSERTION: %',label; end if; end $$;

select pg_temp.assert_true((select count(*)=4 from public.billing_provider_binding_versions
 where environment='TEST' and revision=2 and binding_status='VERIFIED'),'four TEST bindings');
select pg_temp.assert_true((select count(*)=4 from public.billing_provider_binding_versions
 where environment='LIVE' and revision=1 and binding_status='UNBOUND'),'LIVE unbound');
select pg_temp.assert_true((select count(*)=0 from public.billing_provider_binding_versions
 where environment='LIVE' and binding_status='VERIFIED'),'no LIVE binding');
select pg_temp.assert_true((select count(*)=1 from public.billing_tax_readiness_versions
 where environment='TEST' and account_country='AT' and readiness_status='PENDING_CONFIGURATION'
 and observed_provider_tax_behavior='UNSPECIFIED' and not automatic_tax_enabled
 and verified_at is null and verified_by is null),'TEST tax pending');
select pg_temp.assert_true((select count(*)=0 from public.billing_tax_readiness_versions
 where environment='LIVE'),'missing LIVE tax readiness fails closed');
select pg_temp.assert_true((select readiness='PLANNED' from public.billing_seller_versions
 order by version desc limit 1),'seller planned');

do $$ declare b public.billing_provider_binding_versions%rowtype; r jsonb; role_name text;
begin
 for b in select * from public.billing_provider_binding_versions
  where environment='TEST' and revision=2 loop
  r:=public.resolve_test_billing_binding_internal(b.product_code,'TEST',b.price_id,
   b.price_amount_minor,b.price_currency,b.lookup_key,false);
  perform pg_temp.assert_true(r->>'provider_binding_status'='VERIFIED'
   and r->>'tax_readiness_status'='PENDING_CONFIGURATION'
   and r->>'observed_provider_tax_behavior'='UNSPECIFIED'
   and r->>'commercial_activation_allowed'='false'
   and r->>'purchase_allowed'='false'
   and r->>'automatic_tax_enabled'='false','safe resolved TEST binding');
  perform pg_temp.assert_true((public.resolve_billing_product_internal(b.product_code,'TEST')->>'provider_ready')='false',
   'seller blocks provider readiness');
 end loop;
 perform pg_temp.assert_true((public.resolve_billing_product_internal('BASIC','LIVE')->>'provider_ready')='false',
  'LIVE fail closed');
 for role_name in select unnest(array['anon','authenticated','service_role']) loop
  perform pg_temp.assert_true(not has_table_privilege(role_name,'public.billing_provider_binding_versions','SELECT,INSERT,UPDATE,DELETE'),
   'binding table API access');
  perform pg_temp.assert_true(not has_table_privilege(role_name,'public.billing_tax_readiness_versions','SELECT,INSERT,UPDATE,DELETE'),
   'tax table API access');
  perform pg_temp.assert_true(not has_function_privilege(role_name,
   'public.resolve_test_billing_binding_internal(text,text,text,integer,text,text,boolean)','EXECUTE'),
   'resolver API execute');
 end loop;
end $$;

do $$ declare api_role text; begin
 foreach api_role in array array['anon','authenticated','service_role'] loop
  execute format('set local role %I',api_role);
  begin
   perform 1 from public.billing_tax_readiness_versions;
   raise exception 'TAX_TABLE_READ_BYPASS: %',api_role;
  exception when insufficient_privilege then null; end;
  begin
   perform 1 from public.billing_provider_binding_versions;
   raise exception 'BINDING_TABLE_READ_BYPASS: %',api_role;
  exception when insufficient_privilege then null; end;
  begin
   insert into public.billing_tax_readiness_versions default values;
   raise exception 'TAX_TABLE_DML_BYPASS: %',api_role;
  exception when insufficient_privilege then null; end;
  begin
   update public.billing_provider_binding_versions set revision=revision;
   raise exception 'BINDING_TABLE_DML_BYPASS: %',api_role;
  exception when insufficient_privilege then null; end;
  begin
   perform public.resolve_test_billing_binding_internal('BASIC','TEST',
    'price_1UIrMd59e5GrFXdMfnSrKlRA',5900,'EUR','wuxuai_bonus_basic_monthly',false);
   raise exception 'PRIVATE_RESOLVER_BYPASS: %',api_role;
  exception when insufficient_privilege then null; end;
  reset role;
 end loop;
end $$;

do $$ begin
 begin perform public.resolve_test_billing_binding_internal('BASIC','LIVE','wrong',5900,'EUR','wuxuai_bonus_basic_monthly',true);
  raise exception 'LIVE accepted'; exception when insufficient_privilege then null; end;
 begin perform public.resolve_test_billing_binding_internal('UNKNOWN','TEST','wrong',5900,'EUR','wrong',false);
  raise exception 'unknown accepted'; exception when object_not_in_prerequisite_state then null; end;
 begin perform public.resolve_test_billing_binding_internal('BASIC','TEST','wrong',5900,'EUR','wuxuai_bonus_basic_monthly',false);
  raise exception 'wrong price accepted'; exception when object_not_in_prerequisite_state then null; end;
 begin perform public.resolve_test_billing_binding_internal('BASIC','TEST','price_1UIrMd59e5GrFXdMfnSrKlRA',5901,'EUR','wuxuai_bonus_basic_monthly',false);
  raise exception 'wrong amount accepted'; exception when object_not_in_prerequisite_state then null; end;
 begin perform public.resolve_test_billing_binding_internal('BASIC','TEST','price_1UIrMd59e5GrFXdMfnSrKlRA',5900,'USD','wuxuai_bonus_basic_monthly',false);
  raise exception 'wrong currency accepted'; exception when object_not_in_prerequisite_state then null; end;
 begin perform public.resolve_test_billing_binding_internal('BASIC','TEST','price_1UIrMd59e5GrFXdMfnSrKlRA',5900,'EUR','wrong',false);
  raise exception 'wrong lookup accepted'; exception when object_not_in_prerequisite_state then null; end;
 begin perform public.resolve_test_billing_binding_internal('BASIC','TEST','price_1UIrMd59e5GrFXdMfnSrKlRA',5900,'EUR','wuxuai_bonus_basic_monthly',true);
  raise exception 'live flag accepted'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PHASE_7C6C2_TEST_BINDING_PASS';
