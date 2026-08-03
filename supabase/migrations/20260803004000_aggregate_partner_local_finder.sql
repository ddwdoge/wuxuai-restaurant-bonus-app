-- V1 partner-local finder: one bounded payload for public location data and
-- optional restaurant-scoped membership summaries. No customer PII is returned.

create or replace function public.get_partner_local_finder(
  input_customer_tokens jsonb default '{}'::jsonb,
  input_limit integer default 100,
  input_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  with token_entries as (
    select lower(trim(token.key)) as restaurant_slug, token.value as customer_token
    from jsonb_each_text(
      case
        when jsonb_typeof(coalesce(input_customer_tokens, '{}'::jsonb)) = 'object'
          then coalesce(input_customer_tokens, '{}'::jsonb)
        else '{}'::jsonb
      end
    ) token
    where length(trim(token.key)) between 1 and 160
      and length(token.value) between 16 and 2048
    order by token.key
    limit 100
  ),
  eligible_all as (
    select
      r.id as restaurant_id,
      b.id as branch_id,
      b.name,
      r.slug,
      b.address,
      b.postal_code,
      b.city,
      b.country,
      b.latitude,
      b.longitude,
      rb.logo_url,
      b.public_cover_image_url as cover_image_url,
      b.public_short_description as short_description,
      r.opening_hours,
      r.special_days,
      r.holidays
    from public.branches b
    join public.restaurants r on r.id = b.restaurant_id
    join public.loyalty_settings ls on ls.restaurant_id = r.id and ls.active = true
    left join public.restaurant_branding rb on rb.restaurant_id = r.id
    where r.status = 'active'
      and r.operational_ready = true
      and r.legal_ready = true
      and r.security_ready = true
      and b.status = 'active'
      and b.is_discoverable = true
      and nullif(trim(b.address), '') is not null
      and nullif(trim(b.postal_code), '') is not null
      and nullif(trim(b.city), '') is not null
      and b.latitude between -90 and 90
      and b.longitude between -180 and 180
      and not exists (
        select 1
        from public.program_terminations termination
        where termination.restaurant_id = r.id
          and (
            termination.status = 'completed'
            or (
              termination.status = 'scheduled'
              and termination.last_points_earning_at <= now()
            )
          )
      )
  ),
  eligible as (
    select *
    from eligible_all
    order by city, name, branch_id
    limit greatest(1, least(coalesce(input_limit, 100), 100))
    offset greatest(coalesce(input_offset, 0), 0)
  ),
  finder_rows as (
    select jsonb_build_object(
      'restaurant_id', location.restaurant_id,
      'branch_id', location.branch_id,
      'name', location.name,
      'slug', location.slug,
      'address', location.address,
      'postal_code', location.postal_code,
      'city', location.city,
      'country', location.country,
      'latitude', location.latitude,
      'longitude', location.longitude,
      'logo_url', location.logo_url,
      'cover_image_url', location.cover_image_url,
      'short_description', location.short_description,
      'opening_hours', location.opening_hours,
      'special_days', location.special_days,
      'holidays', location.holidays,
      'welcome_reward_available', coalesce(reward_stats.welcome_reward_available, false),
      'active_reward_count', coalesce(reward_stats.active_reward_count, 0),
      'membership', case
        when customer_record.id is null then null
        else jsonb_build_object(
          'registered', true,
          'points_balance', customer_record.points_balance,
          'visits_count', coalesce(visit_stats.visits_count, 0),
          'last_visit_at', visit_stats.last_visit_at,
          'available_rewards', coalesce(personal_rewards.available_rewards, '[]'::jsonb),
          'next_reward', personal_rewards.next_reward
        )
      end
    ) as payload,
    location.city,
    location.name,
    location.branch_id
    from eligible location
    left join token_entries token on token.restaurant_slug = lower(location.slug)
    left join lateral (
      select customer.*
      from public.customer_qr_tokens access_token
      join public.customers customer
        on customer.id = access_token.customer_id
       and customer.restaurant_id = access_token.restaurant_id
      where token.customer_token is not null
        and access_token.restaurant_id = location.restaurant_id
        and access_token.token_hash = public.hash_public_token(token.customer_token)
        and access_token.active = true
        and (access_token.expires_at is null or access_token.expires_at > now())
        and customer.membership_status = 'active'
      order by access_token.created_at desc
      limit 1
    ) customer_record on true
    left join lateral (
      select count(*)::integer as visits_count, max(pt.created_at) as last_visit_at
      from public.points_transactions pt
      where pt.restaurant_id = location.restaurant_id
        and pt.customer_id = customer_record.id
        and pt.type = 'earn'
        and pt.points > 0
    ) visit_stats on customer_record.id is not null
    left join lateral (
      select
        count(*) filter (where not reward.is_starter_reward)::integer as active_reward_count,
        bool_or(reward.is_starter_reward) as welcome_reward_available
      from public.rewards reward
      where reward.restaurant_id = location.restaurant_id
        and (reward.branch_id is null or reward.branch_id = location.branch_id)
        and reward.active = true
        and (reward.expires_at is null or reward.expires_at > now())
    ) reward_stats on true
    left join lateral (
      select
        (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', available.id,
            'title', available.title,
            'required_points', available.required_points,
            'image_url', available.image_url,
            'expires_at', available.expires_at
          ) order by available.required_points, available.title), '[]'::jsonb)
          from public.rewards available
          where available.restaurant_id = location.restaurant_id
            and (available.branch_id is null or available.branch_id = location.branch_id)
            and available.active = true
            and not available.is_starter_reward
            and available.required_points <= customer_record.points_balance
            and (available.expires_at is null or available.expires_at > now())
        ) as available_rewards,
        (
          select jsonb_build_object(
            'id', next_reward.id,
            'title', next_reward.title,
            'required_points', next_reward.required_points,
            'missing_points', greatest(next_reward.required_points - customer_record.points_balance, 0),
            'image_url', next_reward.image_url,
            'expires_at', next_reward.expires_at
          )
          from public.rewards next_reward
          where next_reward.restaurant_id = location.restaurant_id
            and (next_reward.branch_id is null or next_reward.branch_id = location.branch_id)
            and next_reward.active = true
            and not next_reward.is_starter_reward
            and next_reward.required_points > customer_record.points_balance
            and (next_reward.expires_at is null or next_reward.expires_at > now())
          order by next_reward.required_points, next_reward.title, next_reward.id
          limit 1
        ) as next_reward
    ) personal_rewards on customer_record.id is not null
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(finder_row.payload order by finder_row.city, finder_row.name, finder_row.branch_id)
      from finder_rows finder_row
    ), '[]'::jsonb),
    'total', (select count(*) from eligible_all),
    'limit', greatest(1, least(coalesce(input_limit, 100), 100)),
    'offset', greatest(coalesce(input_offset, 0), 0)
  );
$$;

revoke all on function public.get_partner_local_finder(jsonb, integer, integer) from public;
grant execute on function public.get_partner_local_finder(jsonb, integer, integer) to anon, authenticated;

comment on function public.get_partner_local_finder(jsonb, integer, integer) is
  'Returns a bounded V1 partner-local finder payload. Optional customer access tokens are validated per restaurant and are never returned.';

notify pgrst, 'reload schema';
