create or replace function public.get_bonus_boost_kpis(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  boosted_guests integer := 0;
  returned_guests integer := 0;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  select count(distinct customer_id)
  into boosted_guests
  from public.customer_bonus_boosts
  where restaurant_id = input_restaurant_id
    and status = 'active'
    and active_from <= now()
    and active_until > now();

  select count(distinct actor_id)
  into returned_guests
  from public.audit_log
  where restaurant_id = input_restaurant_id
    and actor_type = 'customer'
    and action = 'public_bonus_points_collected'
    and created_at >= current_date
    and nullif(metadata->>'boost_id', '') is not null
    and coalesce((metadata->>'multiplier')::numeric, 1) > 1;

  return jsonb_build_object(
    'guests_currently_boosted', boosted_guests,
    'guests_returned_because_of_boost', returned_guests
  );
end;
$$;

revoke execute on function public.get_bonus_boost_kpis(uuid)
from public;

grant execute on function public.get_bonus_boost_kpis(uuid)
to authenticated;
