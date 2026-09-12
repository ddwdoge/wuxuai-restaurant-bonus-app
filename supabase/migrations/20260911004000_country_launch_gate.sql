-- Country launch policy, independent of UI language and Customer location.
begin;

create table public.country_launch_policy (
  country_code text primary key check (country_code ~ '^[A-Z]{2}$'),
  enabled boolean not null default false,
  revision integer not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.country_launch_policy(country_code, enabled)
values ('AT',true),('DE',false),('CH',false),('FR',false),('IT',false),('ES',false);

-- Snapshot identity, not mutable restaurant status, defines existing businesses.
create table public.country_launch_existing_businesses (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade
);
insert into public.country_launch_existing_businesses
select id from public.restaurants where onboarding_status in ('ready','completed');

create table public.country_launch_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_role text not null,
  event text not null,
  country_code text not null references public.country_launch_policy(country_code),
  restaurant_id uuid,
  request_id uuid not null,
  reason text not null,
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now(),
  unique(actor_id,request_id)
);
-- Private transaction-bound context cannot be supplied through a browser GUC.
create table public.country_launch_creation_context (
  transaction_id bigint primary key,
  actor_id uuid not null,
  country_code text not null references public.country_launch_policy(country_code),
  purpose text not null check(purpose in ('REGISTRATION','ONBOARDING')),
  restaurant_id uuid
);
alter table public.country_launch_policy enable row level security;
alter table public.country_launch_existing_businesses enable row level security;
alter table public.country_launch_audit enable row level security;
alter table public.country_launch_creation_context enable row level security;
revoke all on public.country_launch_policy, public.country_launch_existing_businesses,
  public.country_launch_audit, public.country_launch_creation_context from public, anon, authenticated;

create function public.country_launch_audit_immutable() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin raise exception 'COUNTRY_AUDIT_IMMUTABLE' using errcode='42501'; end $$;
revoke all on function public.country_launch_audit_immutable() from public,anon,authenticated;
create trigger country_launch_audit_immutable before update or delete on public.country_launch_audit
for each row execute function public.country_launch_audit_immutable();

create function public.require_launch_country(input_country text) returns text
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare code text := upper(trim(input_country)); allowed boolean;
begin
  if code is null or code !~ '^[A-Z]{2}$' then
    raise exception 'COUNTRY_REQUIRED' using errcode='22023';
  end if;
  select enabled into allowed from public.country_launch_policy
  where country_code=code for share;
  if allowed is distinct from true then
    raise exception 'COUNTRY_NOT_LAUNCHED' using errcode='42501';
  end if;
  return code;
end $$;
revoke all on function public.require_launch_country(text) from public,anon,authenticated;

create function public.get_registration_countries() returns jsonb
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('code',country_code,'enabled',enabled)
    order by country_code),'[]'::jsonb) from public.country_launch_policy;
$$;
revoke all on function public.get_registration_countries() from public;
grant execute on function public.get_registration_countries() to anon,authenticated;

create function public.get_platform_country_launch_status() returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if auth.uid() is null or public.current_platform_role() is null then
    raise exception 'COUNTRY_CONTROL_NOT_AUTHORIZED' using errcode='42501';
  end if;
  return jsonb_build_object('countries',(select jsonb_agg(to_jsonb(p) order by country_code)
    from public.country_launch_policy p),'audit',coalesce((select jsonb_agg(to_jsonb(a)) from
    (select event,country_code,reason,created_at,before_state,after_state from public.country_launch_audit
     where event='COUNTRY_POLICY_CHANGED' order by created_at desc limit 30) a),'[]'::jsonb));
end $$;
revoke all on function public.get_platform_country_launch_status() from public,anon;
grant execute on function public.get_platform_country_launch_status() to authenticated;

create function public.set_platform_country_launch_status(input_country text,input_enabled boolean,
  input_reason text,input_confirmation text,input_request_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare code text := upper(trim(input_country)); previous public.country_launch_policy%rowtype;
  receipt public.country_launch_audit%rowtype; result jsonb; actor uuid:=auth.uid();
begin
  if actor is null or coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false) is not true then
    raise exception 'COUNTRY_CONTROL_NOT_AUTHORIZED' using errcode='42501';
  end if;
  if code is null or code !~ '^[A-Z]{2}$' or input_enabled is null or input_request_id is null
    or length(trim(coalesce(input_reason,'')))<10
    or input_confirmation is distinct from 'CONFIRMED:'||code then
    raise exception 'COUNTRY_CONFIRMATION_REQUIRED' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('country-request:'||actor::text||input_request_id::text,0));
  select * into receipt from public.country_launch_audit where actor_id=actor and request_id=input_request_id;
  if found then
    if receipt.event <> 'COUNTRY_POLICY_CHANGED' or receipt.country_code<>code
      or receipt.after_state->'enabled' is distinct from to_jsonb(input_enabled)
      or receipt.reason<>trim(input_reason) then
      raise exception 'COUNTRY_REQUEST_CONFLICT' using errcode='22023';
    end if;
    return receipt.after_state;
  end if;
  select * into previous from public.country_launch_policy where country_code=code for update;
  if not found then raise exception 'COUNTRY_UNKNOWN' using errcode='22023'; end if;
  update public.country_launch_policy set enabled=input_enabled,revision=revision+1,updated_at=now()
  where country_code=code returning to_jsonb(country_launch_policy.*) into result;
  insert into public.country_launch_audit(actor_id,actor_role,event,country_code,request_id,reason,before_state,after_state)
  values(actor,public.current_platform_role(),'COUNTRY_POLICY_CHANGED',code,input_request_id,trim(input_reason),to_jsonb(previous),result);
  return result;
end $$;
revoke all on function public.set_platform_country_launch_status(text,boolean,text,text,uuid) from public,anon;
grant execute on function public.set_platform_country_launch_status(text,boolean,text,text,uuid) to authenticated;

create function public.require_tenant_launch_country(input_restaurant_id uuid) returns text
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare code text;
begin
  select b.country into code from public.restaurants r join public.branches b
    on b.id=r.primary_branch_id and b.restaurant_id=r.id and b.organization_id=r.organization_id
    where r.id=input_restaurant_id;
  return public.require_launch_country(code);
end $$;
revoke all on function public.require_tenant_launch_country(uuid) from public,anon,authenticated;

create function public.guard_country_launch_rows() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare ctx public.country_launch_creation_context%rowtype; tenant uuid; code text; grandfathered boolean;
  row_value jsonb:=to_jsonb(new); old_value jsonb:=to_jsonb(old);
begin
  select * into ctx from public.country_launch_creation_context
    where transaction_id=txid_current() and actor_id=auth.uid();
  if tg_table_name in ('restaurants','organizations') and tg_op='INSERT' then
    if ctx.actor_id is null or ctx.purpose <> 'REGISTRATION' or (row_value->>'owner_id')::uuid is distinct from ctx.actor_id then
      raise exception 'COUNTRY_REGISTRATION_RPC_REQUIRED' using errcode='42501';
    end if;
    perform public.require_launch_country(ctx.country_code);
    return new;
  end if;
  if tg_table_name='restaurants' then
    if (row_value->>'onboarding_status' in ('ready','completed') and row_value->'onboarding_status' is distinct from old_value->'onboarding_status')
      or (row_value->>'operational_ready'='true' and old_value->>'operational_ready' is distinct from 'true') then
      tenant:=(row_value->>'id')::uuid;
      if not exists(select 1 from public.country_launch_existing_businesses where restaurant_id=tenant) then
        if ctx.purpose is distinct from 'ONBOARDING' or ctx.restaurant_id is distinct from tenant then
          raise exception 'COUNTRY_ONBOARDING_RPC_REQUIRED' using errcode='42501';
        end if;
        perform public.require_tenant_launch_country(tenant);
        select public.require_launch_country(p.country) into code from public.restaurant_legal_profiles p
          where p.restaurant_id=tenant;
        if code is null then raise exception 'COUNTRY_LEGAL_PROFILE_REQUIRED' using errcode='42501'; end if;
      end if;
    end if;
    return new;
  end if;
  if tg_table_name='branches' then
    if tg_op='INSERT' then
      if ctx.actor_id is null or ctx.purpose <> 'REGISTRATION' then raise exception 'COUNTRY_REGISTRATION_RPC_REQUIRED' using errcode='42501'; end if;
      new:=jsonb_populate_record(new,jsonb_build_object('country',public.require_launch_country(ctx.country_code)));
    elsif row_value->'country' is distinct from old_value->'country' then
      new:=jsonb_populate_record(new,jsonb_build_object('country',public.require_launch_country(row_value->>'country')));
    end if;
    return new;
  end if;
  if tg_table_name='branch_subscriptions' then
    select b.restaurant_id into tenant from public.branches b
      where b.id=(row_value->>'branch_id')::uuid and b.organization_id=(row_value->>'organization_id')::uuid;
  else
    tenant:=(row_value->>'restaurant_id')::uuid;
  end if;
  grandfathered:=exists(select 1 from public.country_launch_existing_businesses where restaurant_id=tenant);
  if not grandfathered then perform public.require_tenant_launch_country(tenant); end if;
  if tg_table_name='restaurant_legal_profiles' then
    if not grandfathered or tg_op='INSERT' or row_value->'country' is distinct from old_value->'country' then
      new:=jsonb_populate_record(new,jsonb_build_object('country',public.require_launch_country(row_value->>'country')));
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_country_launch_rows() from public,anon,authenticated;
create trigger country_launch_guard before insert or update on public.restaurants
  for each row execute function public.guard_country_launch_rows();
create trigger country_launch_guard before insert on public.organizations
  for each row execute function public.guard_country_launch_rows();
create trigger country_launch_guard before insert or update on public.branches
  for each row execute function public.guard_country_launch_rows();
create trigger country_launch_guard before insert or update on public.branch_subscriptions
  for each row execute function public.guard_country_launch_rows();
create trigger country_launch_guard before insert or update on public.restaurant_legal_profiles
  for each row execute function public.guard_country_launch_rows();
create trigger country_launch_guard before insert on public.kassa_compliance_acknowledgements
  for each row execute function public.guard_country_launch_rows();

-- Existing audited trial logic remains intact, but its country-less entry point
-- is no longer a public API. Only this wrapper may establish creation context.
alter function public.start_restaurant_owner_trial(text,text,text) rename to start_restaurant_owner_trial_country_internal;
revoke all on function public.start_restaurant_owner_trial_country_internal(text,text,text) from public,anon,authenticated;
create function public.start_restaurant_owner_trial(input_owner_name text,input_restaurant_name text,
  input_phone text,input_country text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare code text; result jsonb; tenant uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode='42501'; end if;
  -- Resume existing ownership without rewriting a business, profile or trial.
  -- Missing country remains forbidden for every genuinely new registration.
  select jsonb_build_object('already_exists',true,'restaurant',jsonb_build_object(
    'id',r.id,'name',r.name,'slug',r.slug,'organization_id',r.organization_id,'branch_id',b.id),
    'subscription',jsonb_build_object('status',s.subscription_status,
      'trial_started_at',s.trial_started_at,'trial_ends_at',s.trial_ends_at)) into result
  from public.restaurants r join public.branches b on b.id=r.primary_branch_id
    and b.restaurant_id=r.id and b.organization_id=r.organization_id
  join public.branch_subscriptions s on s.branch_id=b.id and s.organization_id=r.organization_id
  join public.restaurant_members m on m.restaurant_id=r.id and m.user_id=auth.uid() and m.role='owner'
  where r.owner_id=auth.uid() order by r.created_at limit 1;
  if result is not null then return result; end if;
  code:=public.require_launch_country(input_country);
  insert into public.country_launch_creation_context(transaction_id,actor_id,country_code,purpose)
    values(txid_current(),auth.uid(),code,'REGISTRATION');
  result:=public.start_restaurant_owner_trial_country_internal(input_owner_name,input_restaurant_name,input_phone);
  tenant:=(result->'restaurant'->>'id')::uuid;
  if not exists(select 1 from public.country_launch_audit where restaurant_id=tenant and event='COUNTRY_REGISTRATION_ALLOWED') then
    insert into public.country_launch_audit(actor_id,actor_role,event,country_code,restaurant_id,request_id,reason,after_state)
    values(auth.uid(),'owner','COUNTRY_REGISTRATION_ALLOWED',code,tenant,gen_random_uuid(),'Explicit business country selected',
      jsonb_build_object('country_code',code));
  end if;
  delete from public.country_launch_creation_context where transaction_id=txid_current();
  return result;
end $$;
revoke all on function public.start_restaurant_owner_trial(text,text,text,text) from public,anon;
grant execute on function public.start_restaurant_owner_trial(text,text,text,text) to authenticated;

alter function public.complete_restaurant_onboarding(uuid,jsonb,jsonb,boolean,uuid)
  rename to complete_restaurant_onboarding_country_internal;
revoke all on function public.complete_restaurant_onboarding_country_internal(uuid,jsonb,jsonb,boolean,uuid) from public,anon,authenticated;
create function public.complete_restaurant_onboarding(input_restaurant_id uuid,input_profile jsonb,
  input_activation jsonb,input_publication_confirmed boolean default false,input_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare code text; result jsonb; prior boolean; request uuid:=coalesce(input_request_id,gen_random_uuid());
begin
  if auth.uid() is null or public.is_restaurant_admin(input_restaurant_id) is distinct from true then
    raise exception 'ONBOARDING_NOT_AUTHORIZED' using errcode='42501';
  end if;
  perform 1 from public.restaurants where id=input_restaurant_id for update;
  prior:=exists(select 1 from public.country_launch_existing_businesses where restaurant_id=input_restaurant_id);
  if not prior then
    code:=public.require_tenant_launch_country(input_restaurant_id);
    perform public.require_launch_country(input_profile->>'country');
    insert into public.country_launch_creation_context(transaction_id,actor_id,country_code,purpose,restaurant_id)
      values(txid_current(),auth.uid(),code,'ONBOARDING',input_restaurant_id);
  end if;
  result:=public.complete_restaurant_onboarding_country_internal(input_restaurant_id,input_profile,input_activation,input_publication_confirmed,input_request_id);
  if not prior and not exists(select 1 from public.country_launch_audit where restaurant_id=input_restaurant_id and event='COUNTRY_ONBOARDING_ALLOWED') then
    insert into public.country_launch_audit(actor_id,actor_role,event,country_code,restaurant_id,request_id,reason,after_state)
    values(auth.uid(),'owner','COUNTRY_ONBOARDING_ALLOWED',code,input_restaurant_id,request,'Country-validated onboarding completion',
      jsonb_build_object('business_country',code,'legal_country',input_profile->>'country'));
    insert into public.country_launch_existing_businesses values(input_restaurant_id) on conflict do nothing;
  end if;
  delete from public.country_launch_creation_context where transaction_id=txid_current();
  return result;
end $$;
revoke all on function public.complete_restaurant_onboarding(uuid,jsonb,jsonb,boolean,uuid) from public,anon;
grant execute on function public.complete_restaurant_onboarding(uuid,jsonb,jsonb,boolean,uuid) to authenticated;

create function public.guard_country_launch_legal_operator() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare code text; tenant uuid;
begin
  if tg_op='UPDATE' and new.country is not distinct from old.country
    and new.registered_address_source is not distinct from old.registered_address_source
    and new.address_source_branch_id is not distinct from old.address_source_branch_id
    and not exists(select 1 from public.restaurants r where r.organization_id=new.organization_id
      and not exists(select 1 from public.country_launch_existing_businesses e where e.restaurant_id=r.id)) then
    return new;
  end if;
  if new.registered_address_source='restaurant' then
    select b.country into code from public.branches b where b.id=new.address_source_branch_id
      and b.organization_id=new.organization_id;
  else code:=new.country; end if;
  perform public.require_launch_country(code);
  for tenant in select r.id from public.restaurants r where r.organization_id=new.organization_id loop
    if not exists(select 1 from public.country_launch_existing_businesses where restaurant_id=tenant) then
      perform public.require_tenant_launch_country(tenant);
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.guard_country_launch_legal_operator() from public,anon,authenticated;
create trigger country_launch_guard before insert or update on public.organization_legal_profiles
  for each row execute function public.guard_country_launch_legal_operator();

notify pgrst,'reload schema';
commit;
