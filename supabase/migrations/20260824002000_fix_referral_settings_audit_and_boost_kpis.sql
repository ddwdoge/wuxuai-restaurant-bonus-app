-- Fix the two final V1 referral blockers without changing referral grant logic.

create or replace function public.update_referral_bonus_settings(
  input_restaurant_id uuid,
  input_enabled boolean,
  input_multiplier numeric,
  input_duration_days integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
    'admin',
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

create or replace function public.get_bonus_boost_kpis(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  boosted_guests integer := 0;
  returned_guests integer := 0;
  successful_referrals integer := 0;
  referrer_grants integer := 0;
  invited_friend_grants integer := 0;
  additional_points bigint := 0;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select count(distinct cb.customer_id)
  into boosted_guests
  from public.customer_bonus_boosts cb
  join public.customers c
    on c.id = cb.customer_id
   and c.restaurant_id = cb.restaurant_id
  where cb.restaurant_id = input_restaurant_id
    and cb.status = 'active'
    and cb.active_from <= now()
    and cb.active_until > now()
    and not c.is_test_customer;

  with eligible_point_events as (
    select
      coalesce(a.entity_id, a.target_id, a.id) as event_key,
      a.customer_id,
      a.created_at,
      greatest(
        (a.metadata->>'final_points')::integer
        - (a.metadata->>'base_points')::integer,
        0
      )::bigint as extra_points
    from public.audit_log a
    join public.customers c
      on c.id = a.customer_id
     and c.restaurant_id = a.restaurant_id
    where a.restaurant_id = input_restaurant_id
      and not a.is_test_event
      and not c.is_test_customer
      and a.metadata->>'base_points' ~ '^[0-9]+$'
      and a.metadata->>'final_points' ~ '^[0-9]+$'
      and (
        (
          a.event_type = 'POINTS_ADDED'
          and a.metadata->>'boost_source' = 'referral'
          and coalesce(nullif(a.metadata->>'boost_multiplier', '')::numeric, 1) > 1
        )
        or (
          a.action = 'public_bonus_points_collected'
          and coalesce(nullif(a.metadata->>'multiplier', '')::numeric, 1) > 1
        )
      )
  ), deduplicated_point_events as (
    select
      event_key,
      customer_id,
      max(created_at) as created_at,
      max(extra_points) as extra_points
    from eligible_point_events
    group by event_key, customer_id
  )
  select
    count(distinct customer_id) filter (where created_at >= current_date),
    coalesce(sum(extra_points), 0)
  into returned_guests, additional_points
  from deduplicated_point_events;

  select
    count(distinct rbg.referral_id),
    count(*) filter (where rbg.beneficiary_role = 'referrer'),
    count(*) filter (where rbg.beneficiary_role = 'invited_friend')
  into successful_referrals, referrer_grants, invited_friend_grants
  from public.referral_boost_grants rbg
  join public.customers c
    on c.id = rbg.customer_id
   and c.restaurant_id = rbg.restaurant_id
  where rbg.restaurant_id = input_restaurant_id
    and not c.is_test_customer;

  return jsonb_build_object(
    'guests_currently_boosted', boosted_guests,
    'guests_returned_because_of_boost', returned_guests,
    'successful_referrals', successful_referrals,
    'referrer_boosters_granted', referrer_grants,
    'invited_friend_boosters_granted', invited_friend_grants,
    'additional_referral_points', additional_points,
    'boost_extra_points', additional_points
  );
end;
$$;

revoke execute on function public.get_bonus_boost_kpis(uuid)
from public, anon;
grant execute on function public.get_bonus_boost_kpis(uuid)
to authenticated;
