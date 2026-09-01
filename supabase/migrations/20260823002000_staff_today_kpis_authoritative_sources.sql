-- Staff today KPIs use the same authoritative ledgers as the points balance
-- and redemption reports. The public RPC contract remains unchanged.

create or replace function public.get_staff_daily_activity(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  timezone_value text;
  local_today date;
  period_from timestamptz;
  period_to timestamptz;
  points_issued_value integer;
  stamps_issued_value integer;
  rewards_redeemed_value integer;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'STAFF_ACTIVITY_ACCESS_DENIED';
  end if;

  select coalesce(nullif(trim(restaurant.timezone_name), ''), 'Europe/Vienna')
    into timezone_value
  from public.restaurants restaurant
  where restaurant.id = input_restaurant_id;

  if timezone_value is null then
    raise exception using errcode = 'P0001', message = 'STAFF_ACTIVITY_NOT_AVAILABLE';
  end if;

  local_today := statement_timestamp() at time zone timezone_value;
  period_from := local_today::timestamp at time zone timezone_value;
  period_to := (local_today + 1)::timestamp at time zone timezone_value;

  select coalesce(sum(points_transaction.points), 0)::integer
    into points_issued_value
  from public.points_transactions points_transaction
  join public.customers customer
    on customer.id = points_transaction.customer_id
   and customer.restaurant_id = points_transaction.restaurant_id
  where points_transaction.restaurant_id = input_restaurant_id
    and points_transaction.type = 'earn'
    and points_transaction.points > 0
    and points_transaction.created_at >= period_from
    and points_transaction.created_at < period_to
    and not coalesce(customer.is_test_customer, false);

  select coalesce(sum(stamp_transaction.stamps), 0)::integer
    into stamps_issued_value
  from public.stamp_transactions stamp_transaction
  join public.customers customer
    on customer.id = stamp_transaction.customer_id
   and customer.restaurant_id = stamp_transaction.restaurant_id
  where stamp_transaction.restaurant_id = input_restaurant_id
    and stamp_transaction.created_at >= period_from
    and stamp_transaction.created_at < period_to
    and not coalesce(customer.is_test_customer, false);

  select count(*)::integer
    into rewards_redeemed_value
  from public.redemption_activity_journal journal
  where journal.restaurant_id = input_restaurant_id
    and journal.status = 'ACTIVE'
    and journal.finalized_at >= period_from
    and journal.finalized_at < period_to
    and not journal.is_test_event;

  return jsonb_build_array(jsonb_build_object(
    'staff_member_id', null,
    'staff_name', 'Restaurant gesamt',
    'points_issued', points_issued_value,
    'stamps_issued', stamps_issued_value,
    'rewards_redeemed', rewards_redeemed_value
  ));
end;
$$;

revoke execute on function public.get_staff_daily_activity(uuid)
from public, anon;
grant execute on function public.get_staff_daily_activity(uuid)
to authenticated;
