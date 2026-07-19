-- Consolidate tenant-safe production KPIs and verify cached customer redemption codes.
create or replace function public.get_restaurant_dashboard_kpis(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  timezone_value text;
  local_today date;
  local_week_start date;
  today_start timestamptz;
  tomorrow_start timestamptz;
  week_start timestamptz;
  active_customers_count integer := 0;
  new_members_today_count integer := 0;
  new_members_this_week_count integer := 0;
  active_today_count integer := 0;
  redemptions_today_count integer := 0;
  points_issued_today_count integer := 0;
  stamps_issued_today_count integer := 0;
  active_rewards_count integer := 0;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;

  select coalesce(nullif(r.timezone_name, ''), 'Europe/Vienna')
  into timezone_value
  from public.restaurants r
  where r.id = input_restaurant_id;

  if timezone_value is null then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;

  begin
    local_today := timezone(timezone_value, now())::date;
  exception when invalid_parameter_value then
    timezone_value := 'Europe/Vienna';
    local_today := timezone(timezone_value, now())::date;
  end;

  local_week_start := local_today - (extract(isodow from local_today)::integer - 1);
  today_start := local_today::timestamp at time zone timezone_value;
  tomorrow_start := (local_today + 1)::timestamp at time zone timezone_value;
  week_start := local_week_start::timestamp at time zone timezone_value;

  select count(*)::integer
  into active_customers_count
  from public.customers c
  where c.restaurant_id = input_restaurant_id
    and not c.is_test_customer;

  select count(*)::integer
  into new_members_today_count
  from public.customers c
  where c.restaurant_id = input_restaurant_id
    and not c.is_test_customer
    and c.created_at >= today_start
    and c.created_at < tomorrow_start;

  select count(*)::integer
  into new_members_this_week_count
  from public.customers c
  where c.restaurant_id = input_restaurant_id
    and not c.is_test_customer
    and c.created_at >= week_start
    and c.created_at < tomorrow_start;

  select coalesce(sum(pt.points), 0)::integer
  into points_issued_today_count
  from public.points_transactions pt
  join public.customers c
    on c.id = pt.customer_id
   and c.restaurant_id = pt.restaurant_id
  where pt.restaurant_id = input_restaurant_id
    and pt.type = 'earn'
    and pt.created_at >= today_start
    and pt.created_at < tomorrow_start
    and not c.is_test_customer;

  select coalesce(sum(st.stamps), 0)::integer
  into stamps_issued_today_count
  from public.stamp_transactions st
  join public.customers c
    on c.id = st.customer_id
   and c.restaurant_id = st.restaurant_id
  where st.restaurant_id = input_restaurant_id
    and st.created_at >= today_start
    and st.created_at < tomorrow_start
    and not c.is_test_customer;

  select count(*)::integer
  into redemptions_today_count
  from (
    select 'gift:' || cr.id::text as business_event_id
    from public.customer_rewards cr
    join public.customers c
      on c.id = cr.customer_id
     and c.restaurant_id = cr.restaurant_id
    where cr.restaurant_id = input_restaurant_id
      and cr.gift_type in ('welcome', 'birthday')
      and cr.status = 'redeemed'
      and cr.redeemed_at >= today_start
      and cr.redeemed_at < tomorrow_start
      and not c.is_test_customer
    union
    select 'points:' || re.id::text
    from public.reward_redemption_events re
    join public.customers c
      on c.id = re.customer_id
     and c.restaurant_id = re.restaurant_id
    where re.restaurant_id = input_restaurant_id
      and re.status = 'redeemed'
      and re.redeemed_at >= today_start
      and re.redeemed_at < tomorrow_start
      and not c.is_test_customer
    union
    select 'coupon:' || cp.id::text
    from public.coupon_redemptions cp
    join public.customers c
      on c.id = cp.customer_id
     and c.restaurant_id = cp.restaurant_id
    where cp.restaurant_id = input_restaurant_id
      and cp.redeemed_at >= today_start
      and cp.redeemed_at < tomorrow_start
      and not c.is_test_customer
  ) final_redemptions;

  select count(distinct activity.customer_id)::integer
  into active_today_count
  from (
    select pt.customer_id
    from public.points_transactions pt
    join public.customers c on c.id = pt.customer_id and c.restaurant_id = pt.restaurant_id
    where pt.restaurant_id = input_restaurant_id
      and pt.type = 'earn'
      and pt.created_at >= today_start and pt.created_at < tomorrow_start
      and not c.is_test_customer
    union
    select st.customer_id
    from public.stamp_transactions st
    join public.customers c on c.id = st.customer_id and c.restaurant_id = st.restaurant_id
    where st.restaurant_id = input_restaurant_id
      and st.created_at >= today_start and st.created_at < tomorrow_start
      and not c.is_test_customer
    union
    select re.customer_id
    from public.reward_redemption_events re
    join public.customers c on c.id = re.customer_id and c.restaurant_id = re.restaurant_id
    where re.restaurant_id = input_restaurant_id
      and re.status = 'redeemed'
      and re.redeemed_at >= today_start and re.redeemed_at < tomorrow_start
      and not c.is_test_customer
    union
    select cr.customer_id
    from public.customer_rewards cr
    join public.customers c on c.id = cr.customer_id and c.restaurant_id = cr.restaurant_id
    where cr.restaurant_id = input_restaurant_id
      and cr.gift_type in ('welcome', 'birthday')
      and cr.status = 'redeemed'
      and cr.redeemed_at >= today_start and cr.redeemed_at < tomorrow_start
      and not c.is_test_customer
    union
    select cp.customer_id
    from public.coupon_redemptions cp
    join public.customers c on c.id = cp.customer_id and c.restaurant_id = cp.restaurant_id
    where cp.restaurant_id = input_restaurant_id
      and cp.redeemed_at >= today_start and cp.redeemed_at < tomorrow_start
      and not c.is_test_customer
  ) activity;

  select (
    (select count(*) from public.rewards r
      where r.restaurant_id = input_restaurant_id and r.active = true)
    +
    (select count(*) from public.coupons c
      where c.restaurant_id = input_restaurant_id and c.status = 'active')
  )::integer into active_rewards_count;

  return jsonb_build_object(
    'active_customers', active_customers_count,
    'new_members_today', new_members_today_count,
    'new_members_this_week', new_members_this_week_count,
    'active_today_count', active_today_count,
    'redemptions_today', redemptions_today_count,
    'points_issued_today', points_issued_today_count,
    'stamps_issued_today', stamps_issued_today_count,
    'active_rewards', active_rewards_count,
    'timezone', timezone_value
  );
end;
$$;

create index if not exists redemption_codes_customer_source_created_idx
  on public.redemption_codes (restaurant_id, customer_id, source_id, created_at desc);

create or replace function public.get_customer_redemption_status(
  input_restaurant_slug text,
  input_customer_token text,
  input_redemption_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  code_record public.redemption_codes%rowtype;
  source_status text;
begin
  select * into restaurant_record
  from public.restaurants r
  where r.slug = trim(input_restaurant_slug)
    and r.status = 'active';

  if restaurant_record.id is null then
    return jsonb_build_object('active', false, 'status', 'disabled');
  end if;

  select c.* into customer_record
  from public.customer_qr_tokens cqt
  join public.customers c
    on c.id = cqt.customer_id
   and c.restaurant_id = cqt.restaurant_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true
    and (cqt.expires_at is null or cqt.expires_at > now())
  limit 1;

  if customer_record.id is null then
    return jsonb_build_object('active', false, 'status', 'cancelled');
  end if;

  perform public.expire_redemption_codes(now());

  select * into code_record
  from public.redemption_codes rc
  where rc.restaurant_id = restaurant_record.id
    and rc.customer_id = customer_record.id
    and rc.source_id = input_redemption_id
  order by rc.created_at desc
  limit 1;

  if code_record.id is null then
    return jsonb_build_object('active', false, 'status', 'cancelled');
  end if;

  if code_record.redemption_type = 'points_redemption' then
    select re.status into source_status
    from public.reward_redemption_events re
    where re.id = code_record.source_id
      and re.restaurant_id = restaurant_record.id
      and re.customer_id = customer_record.id;
  else
    select cr.status into source_status
    from public.customer_rewards cr
    where cr.id = code_record.source_id
      and cr.restaurant_id = restaurant_record.id
      and cr.customer_id = customer_record.id;
  end if;

  return jsonb_build_object(
    'active', code_record.status = 'active'
      and code_record.expires_at > now()
      and source_status in ('started', 'redemption_started'),
    'status', code_record.status,
    'source_status', coalesce(source_status, 'cancelled'),
    'expires_at', code_record.expires_at,
    'redemption_type', code_record.redemption_type
  );
end;
$$;

revoke execute on function public.get_restaurant_dashboard_kpis(uuid) from public, anon;
grant execute on function public.get_restaurant_dashboard_kpis(uuid) to authenticated;

revoke execute on function public.get_customer_redemption_status(text, text, uuid) from public;
grant execute on function public.get_customer_redemption_status(text, text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
