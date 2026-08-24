-- Read-only Platform Admin aggregation for one restaurant. This migration is
-- ordered after the pending 04000 referral bridge and must not be applied alone.

create or replace function public.get_platform_restaurant_control_center(
  input_restaurant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  restaurant_record public.restaurants%rowtype;
  branch_record public.branches%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  settings_record public.loyalty_settings%rowtype;
  branch_found boolean := false;
  subscription_found boolean := false;
  settings_found boolean := false;
  timezone_value text;
  local_today date;
  today_start timestamptz;
  today_end timestamptz;
  rolling_30d_start timestamptz := statement_timestamp() - interval '30 days';
  customers_total_value bigint := 0;
  customers_new_30d_value bigint := 0;
  points_today_value bigint := 0;
  points_30d_value bigint := 0;
  redemptions_today_value bigint := 0;
  redemptions_30d_value bigint := 0;
  point_redemptions_30d_value bigint := 0;
  welcome_redemptions_30d_value bigint := 0;
  birthday_redemptions_30d_value bigint := 0;
  last_redemption_at_value timestamptz;
  welcome_gifts_active_value bigint := 0;
  birthday_gifts_active_value bigint := 0;
  qualified_referrals_30d_value bigint := 0;
  last_qualified_referral_at_value timestamptz;
  active_boosters_value bigint := 0;
  boost_extra_points_30d_value bigint := 0;
  last_registration_success_value timestamptz;
  registration_failures_24h_value bigint := 0;
  registration_failures_7d_value bigint := 0;
  registration_health_value text := 'unavailable';
  last_email_success_value timestamptz;
  last_email_failure_value timestamptz;
  email_failed_24h_value bigint := 0;
  email_pending_retry_value bigint := 0;
  email_delivery_count_value bigint := 0;
  email_health_value text := 'unavailable';
  address_complete_value boolean := false;
  coordinates_present_value boolean := false;
  public_search_eligible_value boolean := false;
  geolocation_health_value text := 'unavailable';
  staff_count_value bigint := 0;
  daily_pin_available_value boolean := false;
  qr_flow_available_value boolean := false;
  staff_health_value text := 'unavailable';
  referral_health_value text := 'unavailable';
  redemption_failure_24h_value bigint := 0;
  redemption_success_count_value bigint := 0;
  redemption_health_value text := 'unavailable';
  overall_health_value text := 'unknown';
  last_activity_at_value timestamptz;
  audit_value jsonb := '[]'::jsonb;
begin
  if not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'PLATFORM_ADMIN_ACCESS_DENIED';
  end if;

  if input_restaurant_id is null then
    raise exception using errcode = '22023', message = 'RESTAURANT_ID_REQUIRED';
  end if;

  select restaurant.*
  into restaurant_record
  from public.restaurants restaurant
  where restaurant.id = input_restaurant_id;

  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'RESTAURANT_NOT_FOUND';
  end if;

  timezone_value := coalesce(nullif(trim(restaurant_record.timezone_name), ''), 'Europe/Vienna');
  local_today := statement_timestamp() at time zone timezone_value;
  today_start := local_today::timestamp at time zone timezone_value;
  today_end := (local_today + 1)::timestamp at time zone timezone_value;

  select branch.*
  into branch_record
  from public.branches branch
  where branch.restaurant_id = restaurant_record.id
  order by (branch.id = restaurant_record.primary_branch_id) desc, branch.created_at asc
  limit 1;
  branch_found := branch_record.id is not null;

  if branch_found then
    select subscription.*
    into subscription_record
    from public.branch_subscriptions subscription
    where subscription.branch_id = branch_record.id
    limit 1;
    subscription_found := subscription_record.id is not null;
  end if;

  select settings.*
  into settings_record
  from public.loyalty_settings settings
  where settings.restaurant_id = restaurant_record.id
  limit 1;
  settings_found := settings_record.id is not null;

  select
    count(*),
    count(*) filter (where customer.created_at >= rolling_30d_start)
  into customers_total_value, customers_new_30d_value
  from public.customers customer
  where customer.restaurant_id = restaurant_record.id
    and not coalesce(customer.is_test_customer, false);

  select
    coalesce(sum(transaction.points) filter (
      where transaction.created_at >= today_start and transaction.created_at < today_end
    ), 0),
    coalesce(sum(transaction.points) filter (
      where transaction.created_at >= rolling_30d_start
    ), 0)
  into points_today_value, points_30d_value
  from public.points_transactions transaction
  join public.customers customer
    on customer.id = transaction.customer_id
   and customer.restaurant_id = transaction.restaurant_id
  where transaction.restaurant_id = restaurant_record.id
    and transaction.type = 'earn'
    and not coalesce(customer.is_test_customer, false);

  select
    count(*) filter (where journal.finalized_at >= today_start and journal.finalized_at < today_end),
    count(*) filter (where journal.finalized_at >= rolling_30d_start),
    count(*) filter (where journal.finalized_at >= rolling_30d_start and journal.reward_type = 'POINT_REWARD'),
    count(*) filter (where journal.finalized_at >= rolling_30d_start and journal.reward_type = 'WELCOME_GIFT'),
    count(*) filter (where journal.finalized_at >= rolling_30d_start and journal.reward_type = 'BIRTHDAY_GIFT'),
    max(journal.finalized_at)
  into
    redemptions_today_value,
    redemptions_30d_value,
    point_redemptions_30d_value,
    welcome_redemptions_30d_value,
    birthday_redemptions_30d_value,
    last_redemption_at_value
  from public.redemption_activity_journal journal
  where journal.restaurant_id = restaurant_record.id
    and journal.finalized_at is not null
    and journal.status = 'ACTIVE'
    and not journal.is_test_event
    and journal.reward_type in ('POINT_REWARD', 'WELCOME_GIFT', 'BIRTHDAY_GIFT');

  select count(*)
  into welcome_gifts_active_value
  from public.rewards reward
  where reward.restaurant_id = restaurant_record.id
    and reward.active
    and coalesce(reward.is_starter_reward, false);

  select count(*)
  into birthday_gifts_active_value
  from public.customer_rewards customer_reward
  join public.customers customer
    on customer.id = customer_reward.customer_id
   and customer.restaurant_id = customer_reward.restaurant_id
  where customer_reward.restaurant_id = restaurant_record.id
    and customer_reward.gift_type = 'birthday'
    and customer_reward.status in ('active', 'redemption_started')
    and not coalesce(customer.is_test_customer, false);

  select count(*), max(referral.qualified_at)
  into qualified_referrals_30d_value, last_qualified_referral_at_value
  from public.referrals referral
  join public.customers referrer
    on referrer.id = referral.referrer_customer_id
   and referrer.restaurant_id = referral.restaurant_id
  where referral.restaurant_id = restaurant_record.id
    and referral.qualified_at >= rolling_30d_start
    and not coalesce(referrer.is_test_customer, false);

  select count(distinct boost.customer_id)
  into active_boosters_value
  from public.customer_bonus_boosts boost
  join public.customers customer
    on customer.id = boost.customer_id
   and customer.restaurant_id = boost.restaurant_id
  where boost.restaurant_id = restaurant_record.id
    and boost.status = 'active'
    and boost.active_from <= statement_timestamp()
    and boost.active_until > statement_timestamp()
    and not coalesce(customer.is_test_customer, false);

  with eligible_point_events as (
    select
      coalesce(audit.entity_id, audit.target_id, audit.id) event_key,
      audit.customer_id,
      greatest(
        (audit.metadata->>'final_points')::integer - (audit.metadata->>'base_points')::integer,
        0
      )::bigint extra_points
    from public.audit_log audit
    join public.customers customer
      on customer.id = audit.customer_id
     and customer.restaurant_id = audit.restaurant_id
    where audit.restaurant_id = restaurant_record.id
      and audit.created_at >= rolling_30d_start
      and not audit.is_test_event
      and not coalesce(customer.is_test_customer, false)
      and audit.metadata->>'base_points' ~ '^[0-9]+$'
      and audit.metadata->>'final_points' ~ '^[0-9]+$'
      and (
        (audit.event_type = 'POINTS_ADDED'
          and audit.metadata->>'boost_source' = 'referral'
          and coalesce(nullif(audit.metadata->>'boost_multiplier', '')::numeric, 1) > 1)
        or (audit.action = 'public_bonus_points_collected'
          and coalesce(nullif(audit.metadata->>'multiplier', '')::numeric, 1) > 1)
      )
  ), deduplicated_point_events as (
    select event_key, customer_id, max(extra_points) extra_points
    from eligible_point_events
    group by event_key, customer_id
  )
  select coalesce(sum(event.extra_points), 0)
  into boost_extra_points_30d_value
  from deduplicated_point_events event;

  select
    max(audit.created_at) filter (where audit.status = 'success'),
    count(*) filter (
      where audit.status in ('failed', 'blocked')
        and audit.created_at >= statement_timestamp() - interval '24 hours'
    ),
    count(*) filter (
      where audit.status in ('failed', 'blocked')
        and audit.created_at >= statement_timestamp() - interval '7 days'
    )
  into last_registration_success_value, registration_failures_24h_value, registration_failures_7d_value
  from public.audit_log audit
  where audit.restaurant_id = restaurant_record.id
    and audit.event_type = 'CUSTOMER_REGISTERED'
    and not audit.is_test_event;

  registration_health_value := case
    when registration_failures_24h_value >= 3 then 'error'
    when registration_failures_24h_value > 0 or registration_failures_7d_value > 0 then 'warning'
    when last_registration_success_value is not null then 'healthy'
    else 'unavailable'
  end;

  select
    count(*),
    max(delivery.sent_at),
    max(delivery.failed_at),
    count(*) filter (
      where delivery.status = 'FAILED'
        and delivery.failed_at >= statement_timestamp() - interval '24 hours'
    ),
    count(*) filter (
      where delivery.status in ('PENDING', 'PROCESSING', 'FAILED')
        and delivery.attempt_count > 0
    )
  into
    email_delivery_count_value,
    last_email_success_value,
    last_email_failure_value,
    email_failed_24h_value,
    email_pending_retry_value
  from public.customer_transactional_email_deliveries delivery
  join public.customers customer
    on customer.id = delivery.customer_id
   and customer.restaurant_id = delivery.restaurant_id
  where delivery.restaurant_id = restaurant_record.id
    and not coalesce(customer.is_test_customer, false);

  email_health_value := case
    when email_delivery_count_value = 0 then 'unavailable'
    when email_failed_24h_value >= 3 then 'error'
    when email_failed_24h_value > 0 or email_pending_retry_value > 0 then 'warning'
    when last_email_success_value is not null then 'healthy'
    else 'unavailable'
  end;

  if branch_found then
    address_complete_value := nullif(trim(coalesce(branch_record.address, '')), '') is not null
      and nullif(trim(coalesce(branch_record.postal_code, '')), '') is not null
      and nullif(trim(coalesce(branch_record.city, '')), '') is not null
      and nullif(trim(coalesce(branch_record.country, '')), '') is not null;
    coordinates_present_value := coalesce(
      branch_record.latitude between -90 and 90
        and branch_record.longitude between -180 and 180,
      false
    );
    public_search_eligible_value := restaurant_record.status = 'active'
      and branch_record.status = 'active'
      and branch_record.is_discoverable
      and coordinates_present_value;
    geolocation_health_value := case
      when address_complete_value and coordinates_present_value then 'healthy'
      else 'warning'
    end;
  end if;

  select count(*)
  into staff_count_value
  from public.staff_members staff
  where staff.restaurant_id = restaurant_record.id
    and staff.active;

  if branch_found then
    select exists (
      select 1
      from public.restaurant_daily_pins pin
      where pin.restaurant_id = restaurant_record.id
        and pin.branch_id is not distinct from branch_record.id
        and pin.valid_from <= statement_timestamp()
        and pin.valid_until > statement_timestamp()
    ) into daily_pin_available_value;
  end if;

  if settings_found then
    qr_flow_available_value := settings_record.active
      and settings_record.points_collection_mode in (
        'restaurant_controlled_only', 'customer_initiated_only', 'both'
      );
    staff_health_value := case
      when staff_count_value = 0 or not daily_pin_available_value or not qr_flow_available_value then 'warning'
      else 'healthy'
    end;
    referral_health_value := 'healthy';
  end if;

  select
    count(*) filter (
      where audit.status in ('failed', 'blocked')
        and audit.created_at >= statement_timestamp() - interval '24 hours'
    ),
    count(*) filter (where audit.status = 'success')
  into redemption_failure_24h_value, redemption_success_count_value
  from public.audit_log audit
  where audit.restaurant_id = restaurant_record.id
    and audit.event_type in ('REWARD_REDEEMED', 'REWARD_REDEMPTION_FAILED')
    and not audit.is_test_event;

  redemption_health_value := case
    when redemption_failure_24h_value >= 3 then 'error'
    when redemption_failure_24h_value > 0 then 'warning'
    when redemption_success_count_value > 0 or redemptions_30d_value > 0 then 'healthy'
    else 'unavailable'
  end;

  overall_health_value := case
    when 'error' in (
      registration_health_value, email_health_value, geolocation_health_value,
      referral_health_value, redemption_health_value, staff_health_value
    ) then 'error'
    when 'warning' in (
      registration_health_value, email_health_value, geolocation_health_value,
      referral_health_value, redemption_health_value, staff_health_value
    ) then 'warning'
    when registration_health_value = 'healthy'
      and email_health_value = 'healthy'
      and geolocation_health_value = 'healthy'
      and referral_health_value = 'healthy'
      and redemption_health_value = 'healthy'
      and staff_health_value = 'healthy'
      then 'healthy'
    else 'unknown'
  end;

  select max(audit.created_at)
  into last_activity_at_value
  from public.audit_log audit
  where audit.restaurant_id = restaurant_record.id
    and not audit.is_test_event;

  select coalesce(jsonb_agg(event.data order by event.created_at desc), '[]'::jsonb)
  into audit_value
  from (
    select
      audit.created_at,
      jsonb_build_object(
        'id', audit.id,
        'timestamp', audit.created_at,
        'actor_type', audit.actor_type,
        'actor_label', case audit.actor_type
          when 'admin' then 'Administration'
          when 'staff' then 'Mitarbeiter'
          when 'customer' then 'Gast'
          else 'System'
        end,
        'event_key', coalesce(nullif(audit.event_type, ''), audit.action),
        'event_label', case audit.action
          when 'platform_subscription_updated' then 'Abo-Status geändert'
          when 'trial_extended' then 'Testphase verlängert'
          when 'restaurant_status_updated' then 'Restaurantstatus geändert'
          when 'manual_payment_recorded' then 'Manuelle Zahlung erfasst'
          else coalesce(nullif(audit.event_type, ''), audit.action)
        end,
        'status', audit.status,
        'target_type', coalesce(audit.entity_type, audit.target_table),
        'target_id', coalesce(audit.entity_id, audit.target_id),
        'before', case when audit.action = 'platform_subscription_updated' then jsonb_build_object(
          'subscription_status', audit.metadata#>>'{previous_subscription,subscription_status}',
          'payment_status', audit.metadata#>>'{previous_subscription,payment_status}',
          'trial_ends_at', audit.metadata#>>'{previous_subscription,trial_ends_at}'
        ) else null end,
        'after', case when audit.action = 'platform_subscription_updated' then jsonb_build_object(
          'subscription_status', audit.metadata#>>'{next_subscription,subscription_status}',
          'payment_status', audit.metadata#>>'{next_subscription,payment_status}',
          'trial_ends_at', audit.metadata#>>'{next_subscription,trial_ends_at}'
        ) else null end
      ) data
    from public.audit_log audit
    where audit.restaurant_id = restaurant_record.id
      and not audit.is_test_event
    order by audit.created_at desc
    limit 20
  ) event;

  return jsonb_build_object(
    'contract_version', 'platform_restaurant_control_center_v1',
    'generated_at', statement_timestamp(),
    'timezone', timezone_value,
    'overall_health', overall_health_value,
    'account', jsonb_build_object(
      'restaurant_id', restaurant_record.id,
      'restaurant_name', restaurant_record.name,
      'restaurant_status', restaurant_record.status,
      'onboarding_status', restaurant_record.onboarding_status,
      'setup_completed', restaurant_record.onboarding_status = 'completed',
      'owner', jsonb_build_object(
        'user_id', restaurant_record.owner_id,
        'name', (select profile.full_name from public.profiles profile where profile.id = restaurant_record.owner_id),
        'business_email', (select auth_user.email from auth.users auth_user where auth_user.id = restaurant_record.owner_id)
      ),
      'created_at', restaurant_record.created_at,
      'last_activity_at', last_activity_at_value,
      'internal_test', jsonb_build_object('status', 'unavailable', 'value', null)
    ),
    'subscription', case when subscription_found then jsonb_build_object(
      'status', 'available',
      'value', jsonb_build_object(
        'subscription_status', coalesce(subscription_record.subscription_status, subscription_record.status),
        'payment_status', subscription_record.payment_status,
        'plan_key', subscription_record.plan_key,
        'trial_started_at', subscription_record.trial_started_at,
        'trial_ends_at', subscription_record.trial_ends_at,
        'trial_days_remaining', case when subscription_record.trial_ends_at is null then null
          else greatest(ceil(extract(epoch from (subscription_record.trial_ends_at - statement_timestamp())) / 86400.0)::integer, 0)
        end,
        'current_period_end', coalesce(subscription_record.current_period_end, subscription_record.current_period_ends_at)
      )
    ) else jsonb_build_object('status', 'unavailable', 'value', null) end,
    'usage', jsonb_build_object(
      'customers_total', jsonb_build_object('status', 'available', 'value', customers_total_value),
      'customers_new_30d', jsonb_build_object('status', 'available', 'value', customers_new_30d_value),
      'points_today', jsonb_build_object('status', 'available', 'value', points_today_value),
      'points_30d', jsonb_build_object('status', 'available', 'value', points_30d_value),
      'welcome_gifts_active', jsonb_build_object('status', 'available', 'value', welcome_gifts_active_value),
      'birthday_gifts_active', jsonb_build_object('status', 'available', 'value', birthday_gifts_active_value)
    ),
    'redemption', jsonb_build_object(
      'health', redemption_health_value,
      'redemptions_today', jsonb_build_object('status', 'available', 'value', redemptions_today_value),
      'redemptions_30d', jsonb_build_object('status', 'available', 'value', redemptions_30d_value),
      'last_redemption_at', jsonb_build_object('status', 'available', 'value', last_redemption_at_value),
      'breakdown_30d', jsonb_build_object(
        'points', point_redemptions_30d_value,
        'welcome', welcome_redemptions_30d_value,
        'birthday', birthday_redemptions_30d_value
      ),
      'failures_24h', redemption_failure_24h_value
    ),
    'referral', case when settings_found then jsonb_build_object(
      'status', 'available',
      'health', referral_health_value,
      'enabled', settings_record.referral_boost_enabled,
      'multiplier', 2,
      'configured_duration_days', settings_record.referral_boost_duration_days,
      'duration_type', case when settings_record.referral_boost_duration_days in (7, 14, 28) then 'preset' else 'custom' end,
      'friend_duration_ratio', 0.5,
      'qualified_referrals_30d', qualified_referrals_30d_value,
      'active_boosters', active_boosters_value,
      'boost_extra_points_30d', boost_extra_points_30d_value,
      'last_qualified_referral_at', last_qualified_referral_at_value
    ) else jsonb_build_object('status', 'unavailable', 'health', 'unavailable', 'value', null) end,
    'health', jsonb_build_object(
      'registration', jsonb_build_object(
        'status', registration_health_value,
        'last_success', last_registration_success_value,
        'failures_24h', registration_failures_24h_value,
        'failures_7d', registration_failures_7d_value
      ),
      'email', jsonb_build_object(
        'status', email_health_value,
        'last_success', last_email_success_value,
        'last_failure', last_email_failure_value,
        'failed_24h', email_failed_24h_value,
        'pending_retry_count', email_pending_retry_value
      ),
      'geolocation', jsonb_build_object(
        'status', geolocation_health_value,
        'address_complete', case when branch_found then address_complete_value else null end,
        'coordinates_present', case when branch_found then coordinates_present_value else null end,
        'public_search_eligible', case when branch_found then public_search_eligible_value else null end,
        'last_geocode_status', jsonb_build_object('status', 'unavailable', 'value', null)
      ),
      'staff', jsonb_build_object(
        'status', staff_health_value,
        'staff_count', jsonb_build_object('status', 'available', 'value', staff_count_value),
        'daily_pin_available', case when branch_found then jsonb_build_object('status', 'available', 'value', daily_pin_available_value)
          else jsonb_build_object('status', 'unavailable', 'value', null) end,
        'qr_flow_available', case when settings_found then jsonb_build_object('status', 'available', 'value', qr_flow_available_value)
          else jsonb_build_object('status', 'unavailable', 'value', null) end
      ),
      'cron', jsonb_build_object(
        'status', 'unavailable',
        'last_success', null,
        'last_failure', null,
        'failure_count', null,
        'reason', 'no_restaurant_scoped_job_telemetry'
      )
    ),
    'audit', audit_value,
    'capabilities', jsonb_build_object(
      'restaurant_status_change', 'supported',
      'subscription_update', 'supported',
      'trial_extension', 'supported',
      'manual_payment', jsonb_build_object(
        'status', 'deferred',
        'reason', 'no_authoritative_manual_payment_ledger'
      )
    )
  );
end;
$$;

revoke execute on function public.get_platform_restaurant_control_center(uuid)
from public, anon, authenticated;
grant execute on function public.get_platform_restaurant_control_center(uuid)
to authenticated;

comment on function public.get_platform_restaurant_control_center(uuid) is
  'Read-only, Platform Admin authorized restaurant control-center aggregation. Missing telemetry is returned as unavailable, never as an invented healthy state.';

notify pgrst, 'reload schema';
