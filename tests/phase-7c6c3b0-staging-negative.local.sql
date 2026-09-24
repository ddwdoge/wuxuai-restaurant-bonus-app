-- Only for the isolated local Supabase database. The synthetic seller revision rolls back.
begin;

do $test$ begin
  if has_function_privilege('anon','public.billing_staging_negative_readiness()','EXECUTE')
    or has_function_privilege('authenticated','public.billing_staging_negative_readiness()','EXECUTE')
    or not has_function_privilege('service_role','public.billing_staging_negative_readiness()','EXECUTE') then
    raise exception 'STAGING_NEGATIVE_EXECUTE_ACL_FAILED';
  end if;
  if has_table_privilege('service_role','public.billing_seller_versions','SELECT')
    or has_table_privilege('service_role','public.billing_tax_readiness_versions','SELECT')
    or has_table_privilege('service_role','public.billing_provider_binding_versions','SELECT') then
    raise exception 'STAGING_NEGATIVE_DIRECT_TABLE_ACCESS';
  end if;
end $test$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $test$ begin
  if public.billing_staging_negative_readiness() is distinct from true then
    raise exception 'STAGING_NEGATIVE_BASELINE_NOT_READY';
  end if;
end $test$;
reset role;

insert into public.billing_seller_versions
  (version,seller_name,ip_licensor_name,readiness,valid_from,revision_reason)
values (2,'Synthetic local test seller','Synthetic local licensor','TEST_READY',
  statement_timestamp(),'Rollback-only negative readiness probe');

set local role service_role;
do $test$ begin
  if public.billing_staging_negative_readiness() is distinct from false then
    raise exception 'STAGING_NEGATIVE_SELLER_GUARD_FAILED';
  end if;
end $test$;
rollback;
