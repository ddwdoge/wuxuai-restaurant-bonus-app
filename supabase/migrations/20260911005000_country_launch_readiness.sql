-- Staging first. Technical registration and public market readiness are separate.
-- No existing country is activated, paused, or declared professionally reviewed.
begin;

alter table public.country_launch_policy
  add column currency_code text check (currency_code ~ '^[A-Z]{3}$'),
  add column market_status text not null default 'prepared'
    check (market_status in ('prepared','live','paused')),
  add column activated_at timestamptz;
update public.country_launch_policy set currency_code=case country_code
  when 'CH' then 'CHF' when 'AT' then 'EUR' when 'DE' then 'EUR'
  when 'FR' then 'EUR' when 'IT' then 'EUR' when 'ES' then 'EUR' end;

create table public.country_launch_readiness (
  country_code text not null references public.country_launch_policy(country_code),
  check_key text not null check (check_key in
    ('legal','privacy','tax','billing','stripe','translation','technical_smoke','required_documents')),
  status text not null default 'not_configured' check (status in ('ready','open','not_configured')),
  evidence_ref text,
  document_version_refs text[] not null default '{}',
  valid_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key(country_code,check_key),
  check (status <> 'ready' or length(trim(coalesce(evidence_ref,'')))>0),
  check (status <> 'ready' or check_key <> 'required_documents' or cardinality(document_version_refs)>0)
);
-- Tenant legal versions are not evidence of a country's commercial clearance.
-- References stay empty until a separately approved, evidence-backed review.
insert into public.country_launch_readiness(country_code,check_key)
select country_code,check_key from public.country_launch_policy cross join
  unnest(array['legal','privacy','tax','billing','stripe','translation','technical_smoke','required_documents']) check_key;
alter table public.country_launch_readiness enable row level security;
revoke all on public.country_launch_readiness from public,anon,authenticated;

create function public.country_launch_readiness_snapshot(input_country text) returns jsonb
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select jsonb_build_object(
    'ready',count(*)=8 and coalesce(bool_and(status='ready' and
      length(trim(coalesce(evidence_ref,'')))>0 and
      (valid_until is null or valid_until>statement_timestamp()) and
      (check_key<>'required_documents' or (cardinality(document_version_refs)>0 and
        not exists(select 1 from unnest(document_version_refs) ref where length(trim(coalesce(ref,'')))=0)))),false),
    'checks',coalesce(jsonb_agg(jsonb_build_object('key',check_key,
      'status',case when valid_until<=statement_timestamp() then 'expired' else status end,
      'document_version_refs',document_version_refs,'valid_until',valid_until,'updated_at',updated_at)
      order by check_key),'[]'::jsonb))
  from public.country_launch_readiness where country_code=input_country;
$$;
revoke all on function public.country_launch_readiness_snapshot(text) from public,anon,authenticated;

create function public.guard_country_market_readiness() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if new.market_status='live' or (tg_op='UPDATE' and new.enabled and not old.enabled)
    or (tg_op='INSERT' and new.enabled) then
    if new.currency_code is null or
      (public.country_launch_readiness_snapshot(new.country_code)->>'ready')::boolean is distinct from true then
      raise exception 'COUNTRY_READINESS_INCOMPLETE' using errcode='42501';
    end if;
  end if;
  if new.market_status='live' and not new.enabled then
    raise exception 'COUNTRY_LIVE_REQUIRES_REGISTRATION' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.guard_country_market_readiness() from public,anon,authenticated;
create trigger country_market_readiness_guard before insert or update on public.country_launch_policy
for each row execute function public.guard_country_market_readiness();

-- Serialize evidence maintenance with activation; a concurrent edit cannot
-- race an activation's readiness check. No browser evidence editor is exposed.
create function public.lock_country_readiness_policy() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if tg_op='UPDATE' and (new.country_code<>old.country_code or new.check_key<>old.check_key) then
    raise exception 'COUNTRY_READINESS_IDENTITY_IMMUTABLE' using errcode='42501';
  end if;
  perform 1 from public.country_launch_policy
    where country_code=case when tg_op='DELETE' then old.country_code else new.country_code end for update;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.lock_country_readiness_policy() from public,anon,authenticated;
create trigger country_readiness_policy_lock before insert or update or delete on public.country_launch_readiness
for each row execute function public.lock_country_readiness_policy();

create or replace function public.get_platform_country_launch_status() returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
  if auth.uid() is null or public.current_platform_role() is null then
    raise exception 'COUNTRY_CONTROL_NOT_AUTHORIZED' using errcode='42501';
  end if;
  return jsonb_build_object('countries',(select jsonb_agg(to_jsonb(p)||
    jsonb_build_object('readiness',public.country_launch_readiness_snapshot(p.country_code)) order by p.country_code)
    from public.country_launch_policy p),'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id) from
    (select ranked.id,event,country_code,actor_id,actor_role,reason,created_at,before_state,after_state from
      (select a.*,row_number() over(partition by country_code order by created_at desc,id) as ordinal
       from public.country_launch_audit a where event='COUNTRY_POLICY_CHANGED') ranked
      where ordinal<=20) a),'[]'::jsonb));
end $$;
revoke all on function public.get_platform_country_launch_status() from public,anon;
grant execute on function public.get_platform_country_launch_status() to authenticated;

create or replace function public.set_platform_country_launch_status(input_country text,input_enabled boolean,
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
  if input_enabled and (previous.currency_code is null or
    (public.country_launch_readiness_snapshot(code)->>'ready')::boolean is distinct from true) then
    raise exception 'COUNTRY_READINESS_INCOMPLETE' using errcode='42501';
  end if;
  update public.country_launch_policy set enabled=input_enabled,
    market_status=case when input_enabled then 'live' else 'paused' end,
    activated_at=case when input_enabled then now() else activated_at end,
    revision=revision+1,updated_at=now()
  where country_code=code returning to_jsonb(country_launch_policy.*) into result;
  insert into public.country_launch_audit(actor_id,actor_role,event,country_code,request_id,reason,before_state,after_state)
  values(actor,public.current_platform_role(),'COUNTRY_POLICY_CHANGED',code,input_request_id,trim(input_reason),to_jsonb(previous),result);
  return result;
end $$;
revoke all on function public.set_platform_country_launch_status(text,boolean,text,text,uuid) from public,anon;
grant execute on function public.set_platform_country_launch_status(text,boolean,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
