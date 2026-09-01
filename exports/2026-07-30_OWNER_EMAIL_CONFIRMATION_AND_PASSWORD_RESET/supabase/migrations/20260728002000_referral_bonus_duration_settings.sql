-- Restaurant-specific referral bonus duration. Existing active boost periods are
-- intentionally not updated; the configured duration is read only on qualification.

alter table public.loyalty_settings
  alter column referral_boost_enabled set default true,
  alter column referral_boost_multiplier set default 2,
  alter column referral_boost_duration_days set default 30,
  drop constraint if exists loyalty_settings_referral_boost_multiplier_check,
  add constraint loyalty_settings_referral_boost_multiplier_check
    check (referral_boost_multiplier = 2),
  drop constraint if exists loyalty_settings_referral_boost_duration_days_check,
  add constraint loyalty_settings_referral_boost_duration_days_check
    check (referral_boost_duration_days between 1 and 365);

create or replace function public.protect_referral_bonus_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.referral_boost_enabled is not distinct from old.referral_boost_enabled
     and new.referral_boost_multiplier is not distinct from old.referral_boost_multiplier
     and new.referral_boost_duration_days is not distinct from old.referral_boost_duration_days then
    return new;
  end if;

  if tg_op = 'INSERT'
     and new.referral_boost_enabled = true
     and new.referral_boost_multiplier = 2
     and new.referral_boost_duration_days = 30 then
    return new;
  end if;

  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return new;
  end if;

  if not exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = new.restaurant_id
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin')
  ) then
    raise exception 'Keine Berechtigung für diese Einstellung.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.protect_referral_bonus_settings()
from public, anon, authenticated;

drop trigger if exists protect_referral_bonus_settings_trigger on public.loyalty_settings;
create trigger protect_referral_bonus_settings_trigger
before insert or update
on public.loyalty_settings
for each row execute function public.protect_referral_bonus_settings();

create or replace function public.update_referral_bonus_settings(
  input_restaurant_id uuid,
  input_enabled boolean,
  input_multiplier numeric,
  input_duration_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role_value text;
  settings_record public.loyalty_settings%rowtype;
  old_settings jsonb;
begin
  select rm.role
  into actor_role_value
  from public.restaurant_members rm
  where rm.restaurant_id = input_restaurant_id
    and rm.user_id = auth.uid()
    and rm.role in ('owner', 'admin')
  limit 1;

  if actor_role_value is null then
    raise exception 'Keine Berechtigung für diese Einstellung.' using errcode = '42501';
  end if;

  if input_multiplier is distinct from 2::numeric then
    raise exception 'Der Multiplikator muss 2,0 betragen.' using errcode = '22023';
  end if;

  if input_duration_days is null or input_duration_days < 1 or input_duration_days > 365 then
    raise exception 'Die Dauer muss zwischen 1 und 365 ganzen Tagen liegen.' using errcode = '22023';
  end if;

  select *
  into settings_record
  from public.loyalty_settings
  where restaurant_id = input_restaurant_id
  for update;

  if settings_record.id is null then
    raise exception 'Bonusprogramm-Einstellungen wurden nicht gefunden.' using errcode = 'P0002';
  end if;

  old_settings := jsonb_build_object(
    'enabled', settings_record.referral_boost_enabled,
    'multiplier', settings_record.referral_boost_multiplier,
    'duration_days', settings_record.referral_boost_duration_days
  );

  update public.loyalty_settings
  set referral_boost_enabled = coalesce(input_enabled, false),
      referral_boost_multiplier = 2,
      referral_boost_duration_days = input_duration_days
  where id = settings_record.id
  returning * into settings_record;

  perform public.write_audit_event(
    input_restaurant_id,
    null,
    'restaurant_user',
    auth.uid(),
    'REFERRAL_BONUS_SETTINGS_UPDATED',
    'success',
    'restaurant_portal',
    'loyalty_settings',
    settings_record.id,
    null,
    jsonb_build_object(
      'restaurant_id', input_restaurant_id,
      'actor_user_id', auth.uid(),
      'actor_role', actor_role_value,
      'old_value', old_settings,
      'new_value', jsonb_build_object(
        'enabled', settings_record.referral_boost_enabled,
        'multiplier', settings_record.referral_boost_multiplier,
        'duration_days', settings_record.referral_boost_duration_days
      ),
      'changed_at', now()
    )
  );

  return jsonb_build_object(
    'referral_boost_enabled', settings_record.referral_boost_enabled,
    'referral_boost_multiplier', settings_record.referral_boost_multiplier,
    'referral_boost_duration_days', settings_record.referral_boost_duration_days
  );
end;
$$;

revoke execute on function public.update_referral_bonus_settings(uuid, boolean, numeric, integer)
from public, anon;
grant execute on function public.update_referral_bonus_settings(uuid, boolean, numeric, integer)
to authenticated;

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
set search_path = public
as $$
declare
  boost_record public.customer_bonus_boosts%rowtype;
  boost_id uuid;
  extension_base timestamptz;
  event_type_value text;
begin
  if input_multiplier is distinct from 2::numeric then
    raise exception 'invalid referral boost multiplier' using errcode = '22023';
  end if;
  if input_duration_days is null or input_duration_days < 1 or input_duration_days > 365 then
    raise exception 'invalid referral boost duration' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(input_restaurant_id::text || ':' || input_customer_id::text, 0));
  select * into boost_record from public.customer_bonus_boosts
  where restaurant_id = input_restaurant_id and customer_id = input_customer_id
    and source = 'referral' and status = 'active' and active_until > now()
  order by active_until desc limit 1 for update;

  if boost_record.id is null then
    insert into public.customer_bonus_boosts (
      restaurant_id, customer_id, multiplier, active_from, active_until,
      source, referral_id, status
    ) values (
      input_restaurant_id, input_customer_id, 2, now(),
      now() + make_interval(days => input_duration_days),
      'referral', input_referral_id, 'active'
    ) returning id into boost_id;
    event_type_value := 'BONUS_BOOST_ACTIVATED';
  else
    extension_base := greatest(boost_record.active_until, now());
    update public.customer_bonus_boosts
    set active_until = extension_base + make_interval(days => input_duration_days),
        multiplier = 2,
        referral_id = input_referral_id
    where id = boost_record.id returning id into boost_id;
    event_type_value := 'BONUS_BOOST_EXTENDED';
  end if;

  perform public.write_audit_event(input_restaurant_id, input_customer_id, 'system', null,
    event_type_value, 'success', 'referral', 'customer_bonus_boosts', boost_id,
    null, jsonb_build_object('referral_id', input_referral_id,
      'multiplier', 2, 'duration_days', input_duration_days));
  return boost_id;
end;
$$;

revoke execute on function public.upsert_referral_boost(uuid, uuid, uuid, numeric, integer)
from public, anon, authenticated;
