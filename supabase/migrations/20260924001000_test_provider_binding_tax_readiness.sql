-- Phase 7C.6C2: verified TEST catalog evidence, not commercial activation.
-- The existing provider status enum and all LIVE bindings remain unchanged.
alter table public.billing_provider_binding_versions
  add column if not exists lookup_key text,
  add column if not exists price_currency text,
  add column if not exists price_interval text,
  add column if not exists price_amount_minor integer,
  add column if not exists price_livemode boolean,
  add column if not exists price_usage_type text,
  add column if not exists price_billing_scheme text;

do $ddl$ begin
if not exists (select 1 from pg_catalog.pg_constraint
 where conname='billing_provider_verified_price_contract'
 and conrelid='public.billing_provider_binding_versions'::regclass) then
alter table public.billing_provider_binding_versions
  add constraint billing_provider_verified_price_contract check (
    binding_status not in ('VERIFIED','RETIRED') or (
      lookup_key is not null and lookup_key ~ '^wuxuai_bonus_[a-z0-9_]+$'
      and price_currency = 'EUR' and price_interval = 'MONTH'
      and price_amount_minor > 0 and price_usage_type = 'licensed'
      and price_billing_scheme = 'per_unit'
      and price_livemode = (environment = 'LIVE')
    )
  );
end if;
end $ddl$;

create table if not exists public.billing_tax_readiness_versions (
  seller_version integer not null references public.billing_seller_versions(version),
  provider text not null check (provider = 'STRIPE'),
  environment text not null check (environment in ('TEST','LIVE')),
  revision integer not null check (revision > 0),
  account_country text not null check (account_country ~ '^[A-Z]{2}$'),
  readiness_status text not null check (readiness_status in ('PENDING_CONFIGURATION','VERIFIED','BLOCKED')),
  observed_provider_tax_behavior text not null check (observed_provider_tax_behavior in ('UNSPECIFIED','EXCLUSIVE','INCLUSIVE')),
  automatic_tax_enabled boolean not null,
  verified_at timestamptz,
  verified_by text,
  evidence_reference text not null check (length(trim(evidence_reference)) >= 10),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  created_by text not null default session_user,
  revision_reason text not null check (length(trim(revision_reason)) >= 10),
  primary key (seller_version,provider,environment,revision),
  check (updated_at >= created_at),
  check ((readiness_status = 'VERIFIED' and verified_at is not null and nullif(trim(verified_by),'') is not null)
    or (readiness_status <> 'VERIFIED' and verified_at is null and verified_by is null)),
  check (environment <> 'LIVE' or readiness_status <> 'PENDING_CONFIGURATION')
);
alter table public.billing_tax_readiness_versions enable row level security;
revoke all on public.billing_tax_readiness_versions from public,anon,authenticated,service_role;
drop trigger if exists billing_immutable on public.billing_tax_readiness_versions;
create trigger billing_immutable before update or delete or truncate on public.billing_tax_readiness_versions
  for each statement execute function public.block_capacity_contract_mutation();

insert into public.billing_tax_readiness_versions
  (seller_version,provider,environment,revision,account_country,readiness_status,
   observed_provider_tax_behavior,automatic_tax_enabled,evidence_reference,revision_reason)
values
  (1,'STRIPE','TEST',1,'AT','PENDING_CONFIGURATION','UNSPECIFIED',false,
   'PHASE_7C_6C1C_SANDBOX_ACCOUNT_PRICE_PROOF_2026-09-24',
   'Founder-approved TEST tax-readiness separation; no tax configuration')
on conflict do nothing;

insert into public.billing_provider_binding_versions
  (product_code,catalog_version,provider,environment,revision,product_id,price_id,
   binding_status,verification_reference,valid_from,revision_reason,lookup_key,
   price_currency,price_interval,price_amount_minor,price_livemode,price_usage_type,price_billing_scheme)
values
  ('BASIC',1,'STRIPE','TEST',2,'prod_VJULxwnQMyqxRc','price_1UIrMd59e5GrFXdMfnSrKlRA',
   'VERIFIED','PHASE_7C_6C1C_SANDBOX_PRICE_PROOF',statement_timestamp(),
   'Read-only verified Sandbox BASIC price; activation remains blocked',
   'wuxuai_bonus_basic_monthly','EUR','MONTH',5900,false,'licensed','per_unit'),
  ('PRO',1,'STRIPE','TEST',2,'prod_VJUQIPslrlZ8oU','price_1UIrRF59e5GrFXdMIsLU7NJQ',
   'VERIFIED','PHASE_7C_6C1C_SANDBOX_PRICE_PROOF',statement_timestamp(),
   'Read-only verified Sandbox PRO price; activation remains blocked',
   'wuxuai_bonus_pro_monthly','EUR','MONTH',14900,false,'licensed','per_unit'),
  ('OFFER_CAPACITY',1,'STRIPE','TEST',2,'prod_VJUTVTF7nMLSTC','price_1UIraZ59e5GrFXdMfvHDBObO',
   'VERIFIED','PHASE_7C_6C1C_SANDBOX_PRICE_PROOF',statement_timestamp(),
   'Read-only verified Sandbox offer add-on price; activation remains blocked',
   'wuxuai_bonus_offers_addon_5_monthly','EUR','MONTH',1900,false,'licensed','per_unit'),
  ('CUSTOMER_CAPACITY',1,'STRIPE','TEST',2,'prod_VJUahjCB0v86iL','price_1UIrbj59e5GrFXdMOhTeYaVj',
   'VERIFIED','PHASE_7C_6C1C_SANDBOX_PRICE_PROOF',statement_timestamp(),
   'Read-only verified Sandbox customer add-on price; activation remains blocked',
   'wuxuai_bonus_customers_addon_5000_monthly','EUR','MONTH',2900,false,'licensed','per_unit')
on conflict do nothing;

-- Private resolver for later server-side TEST checkout validation. It never
-- creates a session, customer, subscription, trial, invoice or entitlement.
create or replace function public.resolve_test_billing_binding_internal(
  input_code text,input_environment text,input_price_id text,input_amount_minor integer,
  input_currency text,input_lookup_key text,input_livemode boolean
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare p public.billing_catalog_internal%rowtype;
  b public.billing_provider_binding_versions%rowtype;
  t public.billing_tax_readiness_versions%rowtype;
  s public.billing_seller_versions%rowtype;
begin
  if input_environment is distinct from 'TEST' or input_livemode is distinct from false then
    raise exception 'BILLING_TEST_ENVIRONMENT_REQUIRED' using errcode='42501';
  end if;
  select * into p from public.billing_catalog_internal
   where product_code=input_code and active and valid_from<=statement_timestamp()
   order by version desc limit 1;
  if p.product_code is null then
    raise exception 'BILLING_PRODUCT_UNAVAILABLE' using errcode='55000';
  end if;
  select * into s from public.billing_seller_versions
   where valid_from<=statement_timestamp() order by version desc limit 1;
  select * into b from public.billing_provider_binding_versions
   where product_code=p.product_code and catalog_version=p.version
    and provider='STRIPE' and environment='TEST' and valid_from<=statement_timestamp()
   order by revision desc limit 1;
  select * into t from public.billing_tax_readiness_versions
   where seller_version=s.version and provider='STRIPE' and environment='TEST'
   order by revision desc limit 1;
  if s.version is null or b.binding_status is distinct from 'VERIFIED'
    or b.price_id is null or b.product_id is null or b.price_livemode is distinct from false
    or b.price_currency is distinct from 'EUR' or b.price_interval is distinct from 'MONTH'
    or b.price_usage_type is distinct from 'licensed' or b.price_billing_scheme is distinct from 'per_unit'
    or b.price_amount_minor is distinct from p.monthly_price_minor
    or b.price_currency is distinct from p.currency
    or t.readiness_status is distinct from 'PENDING_CONFIGURATION'
    or t.account_country is distinct from 'AT'
    or t.observed_provider_tax_behavior is distinct from 'UNSPECIFIED'
    or t.automatic_tax_enabled is distinct from false
    or input_price_id is distinct from b.price_id
    or input_amount_minor is distinct from b.price_amount_minor
    or input_currency is distinct from b.price_currency
    or input_lookup_key is distinct from b.lookup_key then
    raise exception 'BILLING_TEST_BINDING_MISMATCH' using errcode='55000';
  end if;
  return jsonb_build_object('product_code',p.product_code,'catalog_version',p.version,
   'provider','STRIPE','environment','TEST','provider_binding_status',b.binding_status,
   'product_id',b.product_id,'price_id',b.price_id,'lookup_key',b.lookup_key,
   'amount_minor',b.price_amount_minor,'currency',b.price_currency,
   'interval',b.price_interval,'livemode',false,'tax_readiness_status',t.readiness_status,
   'observed_provider_tax_behavior',t.observed_provider_tax_behavior,
   'automatic_tax_enabled',false,'commercial_activation_allowed',false,
   'purchase_allowed',false,'seller_readiness',s.readiness);
end $function$;
revoke execute on function public.resolve_test_billing_binding_internal(text,text,text,integer,text,text,boolean)
  from public,anon,authenticated,service_role;
