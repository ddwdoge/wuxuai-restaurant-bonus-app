-- WUXUAI Bonus V1 referral rule.
-- New qualifications grant 2x points for the configured duration to the
-- referrer and exactly half that duration to the invited guest. Existing
-- boost rows are intentionally not rewritten.

alter table public.loyalty_settings
  alter column referral_boost_multiplier set default 2,
  alter column referral_boost_duration_days set default 14;

alter table public.referrals
  add column if not exists qualified_at timestamptz,
  add column if not exists reward_granted_at timestamptz;

create table if not exists public.referral_boost_grants (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  referral_id uuid not null references public.referrals(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  beneficiary_role text not null
    check (beneficiary_role in ('referrer', 'invited_friend')),
  multiplier numeric(8, 2) not null default 2 check (multiplier = 2),
  configured_duration_days integer not null
    check (configured_duration_days between 1 and 365),
  granted_duration interval not null
    check (granted_duration > interval '0 seconds'),
  boost_id uuid references public.customer_bonus_boosts(id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (referral_id, customer_id, beneficiary_role)
);

alter table public.referral_boost_grants enable row level security;

drop policy if exists referral_boost_grants_member_select
on public.referral_boost_grants;

create policy referral_boost_grants_member_select
on public.referral_boost_grants
for select
to authenticated
using (public.is_restaurant_member(restaurant_id));

revoke all on table public.referral_boost_grants
from public, anon, authenticated;

grant select on table public.referral_boost_grants to authenticated;

create index if not exists referral_boost_grants_restaurant_granted_idx
on public.referral_boost_grants (restaurant_id, granted_at desc);

create index if not exists referral_boost_grants_customer_idx
on public.referral_boost_grants (restaurant_id, customer_id, granted_at desc);

create or replace function public.apply_v1_referral_boost_grant(
  input_restaurant_id uuid,
  input_referral_id uuid,
  input_customer_id uuid,
  input_beneficiary_role text,
  input_configured_duration_days integer,
  input_granted_duration interval
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  referral_record public.referrals%rowtype;
  existing_grant public.referral_boost_grants%rowtype;
  boost_record public.customer_bonus_boosts%rowtype;
  boost_id_value uuid;
  extension_base timestamptz;
  legacy_active_until timestamptz;
  audit_event_type text;
begin
  if input_beneficiary_role not in ('referrer', 'invited_friend') then
    raise exception 'REFERRAL_BENEFICIARY_INVALID';
  end if;

  if input_configured_duration_days not between 1 and 365
     or input_granted_duration <= interval '0 seconds'
     or input_granted_duration > interval '365 days' then
    raise exception 'REFERRAL_DURATION_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(input_restaurant_id::text || ':' || input_customer_id::text, 0)
  );

  select r.*
  into referral_record
  from public.referrals r
  where r.id = input_referral_id
    and r.restaurant_id = input_restaurant_id
    and r.status = 'activated'
  for update;

  if referral_record.id is null then
    raise exception 'REFERRAL_NOT_QUALIFIED';
  end if;

  if (input_beneficiary_role = 'referrer'
      and referral_record.referrer_customer_id <> input_customer_id)
     or (input_beneficiary_role = 'invited_friend'
      and referral_record.referred_customer_id is distinct from input_customer_id) then
    raise exception 'REFERRAL_BENEFICIARY_INVALID';
  end if;

  if not exists (
    select 1
    from public.customers c
    where c.id = input_customer_id
      and c.restaurant_id = input_restaurant_id
      and c.membership_status = 'active'
  ) then
    raise exception 'REFERRAL_CUSTOMER_INVALID';
  end if;

  select rbg.*
  into existing_grant
  from public.referral_boost_grants rbg
  where rbg.referral_id = input_referral_id
    and rbg.customer_id = input_customer_id
    and rbg.beneficiary_role = input_beneficiary_role
  for update;

  if existing_grant.id is not null then
    return existing_grant.boost_id;
  end if;

  select cb.*
  into boost_record
  from public.customer_bonus_boosts cb
  where cb.restaurant_id = input_restaurant_id
    and cb.customer_id = input_customer_id
    and cb.source = 'referral'
    and cb.status = 'active'
    and cb.multiplier = 2
    and cb.active_until > now()
  order by cb.active_until desc, cb.id
  limit 1
  for update;

  if boost_record.id is not null then
    extension_base := greatest(boost_record.active_until, now());
    update public.customer_bonus_boosts cb
    set active_until = extension_base + input_granted_duration,
        referral_id = input_referral_id
    where cb.id = boost_record.id
    returning cb.id into boost_id_value;
    audit_event_type := 'BONUS_BOOST_EXTENDED';
  else
    select max(cb.active_until)
    into legacy_active_until
    from public.customer_bonus_boosts cb
    where cb.restaurant_id = input_restaurant_id
      and cb.customer_id = input_customer_id
      and cb.source = 'referral'
      and cb.status = 'active'
      and cb.active_until > now();

    extension_base := greatest(now(), coalesce(legacy_active_until, now()));

    insert into public.customer_bonus_boosts (
      restaurant_id,
      customer_id,
      multiplier,
      active_from,
      active_until,
      source,
      referral_id,
      status
    ) values (
      input_restaurant_id,
      input_customer_id,
      2,
      extension_base,
      extension_base + input_granted_duration,
      'referral',
      input_referral_id,
      'active'
    )
    returning id into boost_id_value;
    audit_event_type := 'BONUS_BOOST_ACTIVATED';
  end if;

  insert into public.referral_boost_grants (
    restaurant_id,
    referral_id,
    customer_id,
    beneficiary_role,
    multiplier,
    configured_duration_days,
    granted_duration,
    boost_id
  ) values (
    input_restaurant_id,
    input_referral_id,
    input_customer_id,
    input_beneficiary_role,
    2,
    input_configured_duration_days,
    input_granted_duration,
    boost_id_value
  );

  perform public.write_audit_event(
    input_restaurant_id,
    input_customer_id,
    'system',
    null,
    audit_event_type,
    'success',
    'referral',
    'customer_bonus_boosts',
    boost_id_value,
    null,
    jsonb_build_object(
      'referral_id', input_referral_id,
      'beneficiary_role', input_beneficiary_role,
      'multiplier', 2,
      'configured_duration_days', input_configured_duration_days,
      'granted_duration_seconds', extract(epoch from input_granted_duration)::bigint
    )
  );

  return boost_id_value;
end;
$$;

revoke execute on function public.apply_v1_referral_boost_grant(
  uuid, uuid, uuid, text, integer, interval
) from public, anon, authenticated;

create or replace function public.grant_v1_referral_benefits()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_record public.loyalty_settings%rowtype;
  invited_duration interval;
begin
  select ls.*
  into settings_record
  from public.loyalty_settings ls
  where ls.restaurant_id = new.restaurant_id
    and ls.active = true
  limit 1;

  if settings_record.id is null
     or not coalesce(settings_record.referral_boost_enabled, true) then
    return new;
  end if;

  if settings_record.referral_boost_multiplier <> 2
     or settings_record.referral_boost_duration_days not between 1 and 365
     or new.referred_customer_id is null then
    raise exception 'REFERRAL_SETTINGS_INVALID';
  end if;

  invited_duration := make_interval(
    secs => settings_record.referral_boost_duration_days::double precision * 43200
  );

  perform public.apply_v1_referral_boost_grant(
    new.restaurant_id,
    new.id,
    new.referrer_customer_id,
    'referrer',
    settings_record.referral_boost_duration_days,
    make_interval(days => settings_record.referral_boost_duration_days)
  );

  perform public.apply_v1_referral_boost_grant(
    new.restaurant_id,
    new.id,
    new.referred_customer_id,
    'invited_friend',
    settings_record.referral_boost_duration_days,
    invited_duration
  );

  update public.referrals r
  set qualified_at = coalesce(r.qualified_at, now()),
      reward_granted_at = coalesce(r.reward_granted_at, now())
  where r.id = new.id;

  return new;
end;
$$;

revoke execute on function public.grant_v1_referral_benefits()
from public, anon, authenticated;

drop trigger if exists referrals_grant_v1_benefits on public.referrals;

create trigger referrals_grant_v1_benefits
after update of status on public.referrals
for each row
when (old.status is distinct from new.status and new.status = 'activated')
execute function public.grant_v1_referral_benefits();

-- Preserve the established internal helper signature used by existing points
-- RPCs. Caller-supplied multiplier and duration are ignored; current settings
-- and the beneficiary role determine the grant.
create or replace function public.upsert_referral_boost(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_referral_id uuid,
  input_multiplier numeric,
  input_duration_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  referral_record public.referrals%rowtype;
  settings_record public.loyalty_settings%rowtype;
  existing_boost_id uuid;
  beneficiary_role_value text;
  granted_duration interval;
begin
  select rbg.boost_id
  into existing_boost_id
  from public.referral_boost_grants rbg
  where rbg.referral_id = input_referral_id
    and rbg.customer_id = input_customer_id
  limit 1;

  if existing_boost_id is not null then
    return existing_boost_id;
  end if;

  select r.*
  into referral_record
  from public.referrals r
  where r.id = input_referral_id
    and r.restaurant_id = input_restaurant_id
    and r.status = 'activated';

  select ls.*
  into settings_record
  from public.loyalty_settings ls
  where ls.restaurant_id = input_restaurant_id
    and ls.active = true
  limit 1;

  if referral_record.id is null or settings_record.id is null then
    raise exception 'REFERRAL_NOT_QUALIFIED';
  end if;

  if input_customer_id = referral_record.referrer_customer_id then
    beneficiary_role_value := 'referrer';
    granted_duration := make_interval(days => settings_record.referral_boost_duration_days);
  elsif input_customer_id = referral_record.referred_customer_id then
    beneficiary_role_value := 'invited_friend';
    granted_duration := make_interval(
      secs => settings_record.referral_boost_duration_days::double precision * 43200
    );
  else
    raise exception 'REFERRAL_BENEFICIARY_INVALID';
  end if;

  return public.apply_v1_referral_boost_grant(
    input_restaurant_id,
    input_referral_id,
    input_customer_id,
    beneficiary_role_value,
    settings_record.referral_boost_duration_days,
    granted_duration
  );
end;
$$;

revoke execute on function public.upsert_referral_boost(
  uuid, uuid, uuid, numeric, integer
) from public, anon, authenticated;

create or replace function public.get_public_customer_referral_boost_context(
  input_restaurant_slug text,
  input_customer_token text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  resolved_restaurant_id uuid;
  resolved_customer_id uuid;
  boost_record public.customer_bonus_boosts%rowtype;
  grant_record public.referral_boost_grants%rowtype;
begin
  select r.id, c.id
  into resolved_restaurant_id, resolved_customer_id
  from public.restaurants r
  join public.customer_qr_tokens cqt
    on cqt.restaurant_id = r.id
   and cqt.token_hash = public.hash_public_token(input_customer_token)
   and cqt.active = true
   and (cqt.expires_at is null or cqt.expires_at > now())
  join public.customers c
    on c.id = cqt.customer_id
   and c.restaurant_id = r.id
   and c.membership_status = 'active'
  where r.slug = trim(input_restaurant_slug)
    and r.status = 'active'
  limit 1;

  if resolved_restaurant_id is null or resolved_customer_id is null then
    raise exception 'CUSTOMER_ACCESS_TOKEN_INVALID';
  end if;

  select cb.*
  into boost_record
  from public.customer_bonus_boosts cb
  where cb.restaurant_id = resolved_restaurant_id
    and cb.customer_id = resolved_customer_id
    and cb.status = 'active'
    and cb.active_from <= now()
    and cb.active_until > now()
  order by cb.multiplier desc, cb.active_until desc, cb.id
  limit 1;

  if boost_record.id is null then
    return null;
  end if;

  select rbg.*
  into grant_record
  from public.referral_boost_grants rbg
  where rbg.boost_id = boost_record.id
    and rbg.restaurant_id = resolved_restaurant_id
    and rbg.customer_id = resolved_customer_id
  order by rbg.granted_at desc, rbg.id
  limit 1;

  if grant_record.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'beneficiary_role', grant_record.beneficiary_role,
    'granted_duration_seconds', extract(epoch from grant_record.granted_duration)::bigint
  );
end;
$$;

revoke execute on function public.get_public_customer_referral_boost_context(text, text)
from public;

grant execute on function public.get_public_customer_referral_boost_context(text, text)
to anon, authenticated;

notify pgrst, 'reload schema';
