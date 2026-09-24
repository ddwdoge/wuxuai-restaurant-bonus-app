-- Phase 7C.6C3B0: read-only service gate for the isolated Staging negative mode.
-- No checkout, subscription, trial, entitlement or provider activation writer.
begin;

create or replace function public.billing_staging_negative_readiness()
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  seller_record public.billing_seller_versions%rowtype;
  tax_record public.billing_tax_readiness_versions%rowtype;
  live_count integer;
  test_count integer;
  resolved_count integer := 0;
  binding_record record;
  resolved jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'BILLING_STAGING_NEGATIVE_FORBIDDEN' using errcode='42501';
  end if;
  select * into seller_record from public.billing_seller_versions
    where valid_from<=statement_timestamp() order by version desc limit 1;
  if seller_record.version is null or seller_record.readiness is distinct from 'PLANNED' then
    return false;
  end if;
  select * into tax_record from public.billing_tax_readiness_versions
    where seller_version=seller_record.version and provider='STRIPE' and environment='TEST'
    order by revision desc limit 1;
  if tax_record.readiness_status is distinct from 'PENDING_CONFIGURATION'
    or tax_record.observed_provider_tax_behavior is distinct from 'UNSPECIFIED'
    or tax_record.automatic_tax_enabled is distinct from false then
    return false;
  end if;
  select count(*) into live_count from (
    select distinct on (product_code,catalog_version) binding_status,product_id,price_id
    from public.billing_provider_binding_versions
    where provider='STRIPE' and environment='LIVE' and valid_from<=statement_timestamp()
    order by product_code,catalog_version,revision desc
  ) latest where binding_status='UNBOUND' and product_id is null and price_id is null;
  if live_count is distinct from 4 or exists (
    select 1 from public.billing_provider_binding_versions
    where provider='STRIPE' and environment='LIVE' and valid_from<=statement_timestamp()
      and binding_status<>'UNBOUND'
  ) then
    return false;
  end if;
  select count(*) into test_count from (
    select distinct on (product_code,catalog_version) binding_status,price_livemode
    from public.billing_provider_binding_versions
    where provider='STRIPE' and environment='TEST' and valid_from<=statement_timestamp()
    order by product_code,catalog_version,revision desc
  ) latest where binding_status='VERIFIED' and price_livemode is false;
  if test_count is distinct from 4 then
    return false;
  end if;
  for binding_record in
    select p.product_code,p.monthly_price_minor,p.currency,
      b.price_id,b.lookup_key
    from public.billing_catalog_internal p
    join lateral (
      select * from public.billing_provider_binding_versions x
      where x.product_code=p.product_code and x.catalog_version=p.version
        and x.provider='STRIPE' and x.environment='TEST'
        and x.valid_from<=statement_timestamp()
      order by x.revision desc limit 1
    ) b on true
    where p.active and p.valid_from<=statement_timestamp()
      and p.product_code in ('BASIC','PRO','OFFER_CAPACITY','CUSTOMER_CAPACITY')
  loop
    resolved_count:=resolved_count+1;
    resolved:=public.resolve_test_billing_binding_internal(binding_record.product_code,'TEST',
      binding_record.price_id,binding_record.monthly_price_minor::integer,
      binding_record.currency,binding_record.lookup_key,false);
    if (resolved->>'commercial_activation_allowed')::boolean is distinct from false
      or (resolved->>'purchase_allowed')::boolean is distinct from false then
      return false;
    end if;
  end loop;
  return resolved_count=4;
end $function$;

revoke all on function public.billing_staging_negative_readiness()
  from public,anon,authenticated,service_role;
grant execute on function public.billing_staging_negative_readiness() to service_role;
notify pgrst,'reload schema';
commit;
