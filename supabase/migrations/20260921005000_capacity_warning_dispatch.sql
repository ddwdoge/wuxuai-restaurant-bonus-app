-- Phase 7C.5B: private, tenant-scoped capacity warning dispatcher.
-- This migration never purchases capacity, changes a plan, activates a grant,
-- mutates entitlements, or edits offer/customer/points/redemption business data.

create table if not exists public.capacity_usage_daily_snapshots (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  capacity_type text not null check (capacity_type in ('offer', 'customer')),
  snapshot_date date not null,
  usage bigint not null check (usage >= 0),
  effective_limit bigint not null check (effective_limit > 0),
  timezone_name text not null,
  captured_at timestamptz not null default statement_timestamp(),
  primary key (restaurant_id, capacity_type, snapshot_date)
);

create table if not exists public.capacity_warning_episodes (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  capacity_type text not null check (capacity_type in ('offer', 'customer')),
  warning_level text not null check (warning_level in ('80', '90', '100', 'OVER_LIMIT')),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  triggered_by text not null check (triggered_by in ('ACTUAL', 'FORECAST')),
  usage bigint not null check (usage >= 0),
  effective_limit bigint not null check (effective_limit > 0),
  remaining bigint not null check (remaining >= 0),
  projected_usage_7d bigint check (projected_usage_7d is null or projected_usage_7d >= 0),
  forecast_basis_date date,
  opened_at timestamptz not null,
  actual_reached_at timestamptz,
  resolved_at timestamptz,
  resolve_reason text check (resolve_reason is null or resolve_reason in ('SEVEN_COMPLETE_DAYS_BELOW', 'CAPACITY_INCREASE')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (
    (status = 'OPEN' and resolved_at is null and resolve_reason is null)
    or (status = 'RESOLVED' and resolved_at is not null and resolve_reason is not null)
  )
);

create unique index if not exists capacity_warning_one_open_episode_idx
  on public.capacity_warning_episodes (restaurant_id, capacity_type, warning_level)
  where status = 'OPEN';

create table if not exists public.capacity_warning_states (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  capacity_type text not null check (capacity_type in ('offer', 'customer')),
  warning_level text not null check (warning_level in ('80', '90', '100', 'OVER_LIMIT')),
  active_episode_id uuid references public.capacity_warning_episodes(id) on delete set null,
  below_since_date date,
  last_usage bigint not null default 0 check (last_usage >= 0),
  last_effective_limit bigint check (last_effective_limit is null or last_effective_limit > 0),
  last_projected_usage_7d bigint check (last_projected_usage_7d is null or last_projected_usage_7d >= 0),
  last_evaluated_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (restaurant_id, capacity_type, warning_level)
);

create table if not exists public.capacity_warning_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  warning_episode_id uuid not null references public.capacity_warning_episodes(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('app', 'email')),
  status text not null check (status in (
    'PENDING', 'PROCESSING', 'DELIVERED', 'SENT', 'FAILED',
    'ACKNOWLEDGED', 'RESOLVED', 'SKIPPED'
  )),
  available_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  processing_started_at timestamptz,
  delivered_at timestamptz,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  provider_message_id text,
  last_error_code text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (warning_episode_id, recipient_user_id, channel)
);

create index if not exists capacity_warning_email_queue_idx
  on public.capacity_warning_deliveries (status, available_at, created_at)
  where channel = 'email' and status in ('PENDING', 'PROCESSING', 'FAILED');
create index if not exists capacity_warning_owner_app_idx
  on public.capacity_warning_deliveries (recipient_user_id, restaurant_id, status, created_at desc)
  where channel = 'app';

create table if not exists public.capacity_warning_audit (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  warning_episode_id uuid references public.capacity_warning_episodes(id) on delete set null,
  capacity_type text not null check (capacity_type in ('offer', 'customer')),
  warning_level text check (warning_level is null or warning_level in ('80', '90', '100', 'OVER_LIMIT')),
  event_type text not null check (event_type in (
    'EPISODE_OPENED', 'FORECAST_CONFIRMED', 'ACTUAL_CONFIRMED',
    'DELIVERY_QUEUED', 'REMINDER_QUEUED', 'APP_ACKNOWLEDGED',
    'EPISODE_RESOLVED', 'EVALUATION_FAILED'
  )),
  evaluation_source text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp()
);

alter table public.capacity_usage_daily_snapshots enable row level security;
alter table public.capacity_warning_episodes enable row level security;
alter table public.capacity_warning_states enable row level security;
alter table public.capacity_warning_deliveries enable row level security;
alter table public.capacity_warning_audit enable row level security;

revoke all on table public.capacity_usage_daily_snapshots from public, anon, authenticated, service_role;
revoke all on table public.capacity_warning_episodes from public, anon, authenticated, service_role;
revoke all on table public.capacity_warning_states from public, anon, authenticated, service_role;
revoke all on table public.capacity_warning_deliveries from public, anon, authenticated, service_role;
revoke all on table public.capacity_warning_audit from public, anon, authenticated, service_role;

create or replace function public.protect_capacity_warning_audit()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'CAPACITY_WARNING_AUDIT_APPEND_ONLY' using errcode = '55000';
end;
$function$;

revoke execute on function public.protect_capacity_warning_audit()
from public, anon, authenticated, service_role;

drop trigger if exists capacity_warning_audit_immutable on public.capacity_warning_audit;
create trigger capacity_warning_audit_immutable
before update or delete on public.capacity_warning_audit
for each row execute function public.protect_capacity_warning_audit();

create or replace function public.capacity_warning_timezone(input_timezone text)
returns text
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select case
    when exists (
      select 1 from pg_catalog.pg_timezone_names zone
      where zone.name = nullif(trim(input_timezone), '')
    ) then nullif(trim(input_timezone), '')
    else 'Europe/Vienna'
  end;
$function$;

revoke execute on function public.capacity_warning_timezone(text)
from public, anon, authenticated, service_role;

create or replace function public.capacity_warning_level_rank(input_level text)
returns integer
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $function$
  select case input_level when '80' then 1 when '90' then 2 when '100' then 3 when 'OVER_LIMIT' then 4 else 0 end;
$function$;

revoke execute on function public.capacity_warning_level_rank(text)
from public, anon, authenticated, service_role;

create or replace function public.capacity_warning_level_for_usage(
  input_usage bigint,
  input_limit bigint
)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if input_usage is null or input_usage < 0 or input_limit is null or input_limit <= 0 then
    raise exception 'CAPACITY_WARNING_USAGE_INVALID' using errcode = '22023';
  end if;
  return case
    when input_usage > input_limit then 'OVER_LIMIT'
    when input_usage = input_limit then '100'
    when input_usage * 100 >= input_limit * 90 then '90'
    when input_usage * 100 >= input_limit * 80 then '80'
    else null
  end;
end;
$function$;

revoke execute on function public.capacity_warning_level_for_usage(bigint, bigint)
from public, anon, authenticated, service_role;

create or replace function public.capacity_warning_email_available_at(
  input_at timestamptz,
  input_timezone text
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  timezone_value text := public.capacity_warning_timezone(input_timezone);
  local_value timestamp;
begin
  if input_at is null or not isfinite(input_at) then
    raise exception 'CAPACITY_WARNING_TIME_INVALID' using errcode = '22023';
  end if;
  local_value := input_at at time zone timezone_value;
  if local_value::time >= time '08:00' and local_value::time < time '22:00' then
    return input_at;
  end if;
  if local_value::time < time '08:00' then
    return (local_value::date + time '08:00') at time zone timezone_value;
  end if;
  return ((local_value::date + 1) + time '08:00') at time zone timezone_value;
end;
$function$;

revoke execute on function public.capacity_warning_email_available_at(timestamptz, text)
from public, anon, authenticated, service_role;

create or replace function public.evaluate_restaurant_capacity_warning_internal(
  input_restaurant_id uuid,
  input_capacity_type text,
  input_run_at timestamptz,
  input_source text,
  input_record_daily_snapshot boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  restaurant_record public.restaurants%rowtype;
  capacity_snapshot jsonb;
  metric jsonb;
  timezone_value text;
  local_date_value date;
  usage_value bigint;
  limit_value bigint;
  remaining_value bigint;
  actual_level text;
  forecast_level text;
  history_usage bigint;
  history_count integer := 0;
  projected_value bigint;
  forecast_basis_date_value date;
  level_record record;
  state_record public.capacity_warning_states%rowtype;
  episode_record public.capacity_warning_episodes%rowtype;
  signal_actual boolean;
  signal_forecast boolean;
  above_current boolean;
  resolve_now boolean;
  resolve_reason_value text;
  episode_created boolean;
  delivery_rows integer;
  reminder_rows integer;
begin
  if input_restaurant_id is null
     or input_capacity_type not in ('offer', 'customer')
     or input_run_at is null or not isfinite(input_run_at)
     or input_source not in ('EVENT', 'DAILY', 'MANUAL_TEST') then
    raise exception 'CAPACITY_WARNING_INPUT_INVALID' using errcode = '22023';
  end if;

  select restaurant.* into restaurant_record
  from public.restaurants restaurant
  where restaurant.id = input_restaurant_id;
  if restaurant_record.id is null then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  timezone_value := public.capacity_warning_timezone(restaurant_record.timezone_name);
  local_date_value := (input_run_at at time zone timezone_value)::date;

  perform pg_advisory_xact_lock(hashtextextended(
    'capacity-warning:' || input_restaurant_id::text || ':' || input_capacity_type,
    0
  ));

  capacity_snapshot := public.resolve_restaurant_capacity_internal(input_restaurant_id, input_run_at);
  metric := case input_capacity_type
    when 'offer' then capacity_snapshot->'offers'
    else capacity_snapshot->'active_customers'
  end;
  usage_value := (metric->>'usage')::bigint;
  limit_value := (metric->>'effective_limit')::bigint;
  if usage_value is null or usage_value < 0 or limit_value is null or limit_value <= 0 then
    raise exception 'CAPACITY_WARNING_RESOLVER_INVALID' using errcode = '55000';
  end if;
  remaining_value := greatest(limit_value - usage_value, 0);

  if input_record_daily_snapshot then
    insert into public.capacity_usage_daily_snapshots (
      restaurant_id, capacity_type, snapshot_date, usage,
      effective_limit, timezone_name, captured_at
    ) values (
      input_restaurant_id, input_capacity_type, local_date_value - 1,
      usage_value, limit_value, timezone_value, input_run_at
    ) on conflict (restaurant_id, capacity_type, snapshot_date) do nothing;
  end if;

  forecast_basis_date_value := local_date_value - 28;
  select count(*)::integer,
    max(snapshot.usage) filter (where snapshot.snapshot_date = forecast_basis_date_value)
  into history_count, history_usage
  from public.capacity_usage_daily_snapshots snapshot
  where snapshot.restaurant_id = input_restaurant_id
    and snapshot.capacity_type = input_capacity_type
    and snapshot.snapshot_date between forecast_basis_date_value and local_date_value - 1;

  if history_count = 28 and history_usage is not null then
    -- Founder formula: daily_net_growth = (usage_value - history_usage) / 28;
    -- projected_usage_7d = usage_value + max(0, daily_net_growth * 7).
    -- Multiply before dividing so an exact integer projection (for example
    -- 8 + (8 - 0) * 7 / 28 = 10) cannot become 10.000...1 and ceil to 11.
    projected_value := usage_value
      + ceil(greatest(
          0::numeric,
          (usage_value - history_usage)::numeric * 7::numeric / 28::numeric
        ))::bigint;
  else
    projected_value := null;
    forecast_basis_date_value := null;
  end if;

  actual_level := public.capacity_warning_level_for_usage(usage_value, limit_value);
  forecast_level := case when projected_value is null then null
    else public.capacity_warning_level_for_usage(projected_value, limit_value) end;

  for level_record in
    select * from (values
      ('80'::text, 80::integer),
      ('90'::text, 90::integer),
      ('100'::text, 100::integer),
      ('OVER_LIMIT'::text, 101::integer)
    ) level_values(warning_level, threshold_percent)
  loop
    insert into public.capacity_warning_states (
      restaurant_id, capacity_type, warning_level, last_usage,
      last_effective_limit, last_projected_usage_7d, last_evaluated_at
    ) values (
      input_restaurant_id, input_capacity_type, level_record.warning_level,
      usage_value, limit_value, projected_value, input_run_at
    ) on conflict (restaurant_id, capacity_type, warning_level) do nothing;

    select * into state_record
    from public.capacity_warning_states state
    where state.restaurant_id = input_restaurant_id
      and state.capacity_type = input_capacity_type
      and state.warning_level = level_record.warning_level
    for update;

    above_current := case level_record.warning_level
      when 'OVER_LIMIT' then usage_value > limit_value
      else usage_value * 100 >= limit_value * level_record.threshold_percent
    end;
    resolve_now := false;
    resolve_reason_value := null;

    if state_record.active_episode_id is not null and not above_current then
      if state_record.last_effective_limit is not null
         and limit_value > state_record.last_effective_limit then
        resolve_now := true;
        resolve_reason_value := 'CAPACITY_INCREASE';
      elsif state_record.below_since_date is not null
            and local_date_value >= state_record.below_since_date + 7 then
        resolve_now := true;
        resolve_reason_value := 'SEVEN_COMPLETE_DAYS_BELOW';
      end if;

      if resolve_now then
        update public.capacity_warning_episodes episode
        set status = 'RESOLVED', resolved_at = input_run_at,
            resolve_reason = resolve_reason_value, updated_at = input_run_at
        where episode.id = state_record.active_episode_id and episode.status = 'OPEN';
        update public.capacity_warning_deliveries delivery
        set status = 'RESOLVED', resolved_at = input_run_at,
            processing_started_at = null, updated_at = input_run_at
        where delivery.warning_episode_id = state_record.active_episode_id
          and delivery.status <> 'RESOLVED';
        insert into public.capacity_warning_audit (
          restaurant_id, warning_episode_id, capacity_type, warning_level,
          event_type, evaluation_source, details, created_at
        ) values (
          input_restaurant_id, state_record.active_episode_id, input_capacity_type,
          level_record.warning_level, 'EPISODE_RESOLVED', input_source,
          jsonb_build_object('reason', resolve_reason_value, 'usage', usage_value, 'effective_limit', limit_value),
          input_run_at
        );
        update public.capacity_warning_states state
        set active_episode_id = null, below_since_date = null, updated_at = input_run_at
        where state.restaurant_id = input_restaurant_id
          and state.capacity_type = input_capacity_type
          and state.warning_level = level_record.warning_level;
        state_record.active_episode_id := null;
        state_record.below_since_date := null;
      elsif state_record.below_since_date is null then
        update public.capacity_warning_states state
        set below_since_date = local_date_value, updated_at = input_run_at
        where state.restaurant_id = input_restaurant_id
          and state.capacity_type = input_capacity_type
          and state.warning_level = level_record.warning_level;
        state_record.below_since_date := local_date_value;
      end if;
    elsif above_current and state_record.below_since_date is not null then
      update public.capacity_warning_states state
      set below_since_date = null, updated_at = input_run_at
      where state.restaurant_id = input_restaurant_id
        and state.capacity_type = input_capacity_type
        and state.warning_level = level_record.warning_level;
      state_record.below_since_date := null;
    end if;

    signal_actual := actual_level = level_record.warning_level;
    signal_forecast := forecast_level = level_record.warning_level
      and public.capacity_warning_level_rank(forecast_level)
        > public.capacity_warning_level_rank(actual_level);
    episode_created := false;

    if signal_actual or signal_forecast then
      if state_record.active_episode_id is null then
        insert into public.capacity_warning_episodes (
          restaurant_id, capacity_type, warning_level, triggered_by,
          usage, effective_limit, remaining, projected_usage_7d,
          forecast_basis_date, opened_at, actual_reached_at,
          created_at, updated_at
        ) values (
          input_restaurant_id, input_capacity_type, level_record.warning_level,
          case when signal_actual then 'ACTUAL' else 'FORECAST' end,
          usage_value, limit_value, remaining_value, projected_value,
          forecast_basis_date_value, input_run_at,
          case when signal_actual then input_run_at else null end,
          input_run_at, input_run_at
        ) returning * into episode_record;
        episode_created := true;
        update public.capacity_warning_states state
        set active_episode_id = episode_record.id,
            below_since_date = case when above_current then null else local_date_value end,
            updated_at = input_run_at
        where state.restaurant_id = input_restaurant_id
          and state.capacity_type = input_capacity_type
          and state.warning_level = level_record.warning_level;
        state_record.active_episode_id := episode_record.id;

        insert into public.capacity_warning_audit (
          restaurant_id, warning_episode_id, capacity_type, warning_level,
          event_type, evaluation_source, details, created_at
        ) values (
          input_restaurant_id, episode_record.id, input_capacity_type,
          level_record.warning_level, 'EPISODE_OPENED', input_source,
          jsonb_build_object(
            'triggered_by', episode_record.triggered_by,
            'usage', usage_value, 'effective_limit', limit_value,
            'remaining', remaining_value, 'projected_usage_7d', projected_value
          ), input_run_at
        );
      else
        select * into episode_record
        from public.capacity_warning_episodes episode
        where episode.id = state_record.active_episode_id
        for update;
        update public.capacity_warning_episodes episode
        set triggered_by = case when signal_actual then 'ACTUAL' else episode.triggered_by end,
            actual_reached_at = case
              when signal_actual then coalesce(episode.actual_reached_at, input_run_at)
              else episode.actual_reached_at
            end,
            usage = usage_value, effective_limit = limit_value,
            remaining = remaining_value, projected_usage_7d = projected_value,
            forecast_basis_date = forecast_basis_date_value, updated_at = input_run_at
        where episode.id = episode_record.id;
        if signal_actual and episode_record.actual_reached_at is null then
          insert into public.capacity_warning_audit (
            restaurant_id, warning_episode_id, capacity_type, warning_level,
            event_type, evaluation_source, details, created_at
          ) values (
            input_restaurant_id, episode_record.id, input_capacity_type,
            level_record.warning_level, 'ACTUAL_CONFIRMED', input_source,
            jsonb_build_object('usage', usage_value, 'effective_limit', limit_value), input_run_at
          );
        end if;
      end if;

      insert into public.capacity_warning_deliveries (
        warning_episode_id, restaurant_id, recipient_user_id, channel,
        status, available_at, delivered_at, payload, created_at, updated_at
      )
      select episode_record.id, input_restaurant_id, member.user_id, 'app',
        'DELIVERED', input_run_at, input_run_at,
        jsonb_build_object(
          'capacity_type', input_capacity_type,
          'warning_level', level_record.warning_level,
          'usage', usage_value, 'effective_limit', limit_value,
          'remaining', remaining_value, 'projected_usage_7d', projected_value,
          'route', '/admin/settings/tarif-kapazitaet',
          'language', coalesce(nullif(restaurant_record.language, ''), 'de'),
          'automatic_purchase', false
        ), input_run_at, input_run_at
      from public.restaurant_members member
      join auth.users owner_user on owner_user.id = member.user_id
      where member.restaurant_id = input_restaurant_id
        and member.role = 'owner'
        and owner_user.email is not null
        and owner_user.email_confirmed_at is not null
        and (owner_user.banned_until is null or owner_user.banned_until <= input_run_at)
      on conflict (warning_episode_id, recipient_user_id, channel) do nothing;
      get diagnostics delivery_rows = row_count;

      insert into public.capacity_warning_deliveries (
        warning_episode_id, restaurant_id, recipient_user_id, channel,
        status, available_at, payload, created_at, updated_at
      )
      select episode_record.id, input_restaurant_id, member.user_id, 'email',
        'PENDING', public.capacity_warning_email_available_at(input_run_at, timezone_value),
        jsonb_build_object(
          'capacity_type', input_capacity_type,
          'warning_level', level_record.warning_level,
          'usage', usage_value, 'effective_limit', limit_value,
          'remaining', remaining_value, 'projected_usage_7d', projected_value,
          'route', '/admin/settings/tarif-kapazitaet',
          'language', coalesce(nullif(restaurant_record.language, ''), 'de'),
          'automatic_purchase', false
        ), input_run_at, input_run_at
      from public.restaurant_members member
      join auth.users owner_user on owner_user.id = member.user_id
      where member.restaurant_id = input_restaurant_id
        and member.role = 'owner'
        and owner_user.email is not null
        and owner_user.email_confirmed_at is not null
        and (owner_user.banned_until is null or owner_user.banned_until <= input_run_at)
      on conflict (warning_episode_id, recipient_user_id, channel) do nothing;
      get diagnostics reminder_rows = row_count;

      if episode_created and delivery_rows + reminder_rows > 0 then
        insert into public.capacity_warning_audit (
          restaurant_id, warning_episode_id, capacity_type, warning_level,
          event_type, evaluation_source, details, created_at
        ) values (
          input_restaurant_id, episode_record.id, input_capacity_type,
          level_record.warning_level, 'DELIVERY_QUEUED', input_source,
          jsonb_build_object('app', delivery_rows, 'email', reminder_rows), input_run_at
        );
      end if;

      if not episode_created and level_record.warning_level in ('100', 'OVER_LIMIT') then
        update public.capacity_warning_deliveries delivery
        set status = 'DELIVERED', delivered_at = input_run_at,
            acknowledged_at = null, available_at = input_run_at,
            payload = jsonb_set(jsonb_set(jsonb_set(delivery.payload,
              '{usage}', to_jsonb(usage_value), true),
              '{effective_limit}', to_jsonb(limit_value), true),
              '{remaining}', to_jsonb(remaining_value), true),
            updated_at = input_run_at
        where delivery.warning_episode_id = episode_record.id
          and delivery.channel = 'app'
          and delivery.status = 'ACKNOWLEDGED'
          and delivery.delivered_at <= input_run_at - interval '7 days';
        get diagnostics delivery_rows = row_count;

        update public.capacity_warning_deliveries delivery
        set status = 'PENDING', available_at = public.capacity_warning_email_available_at(input_run_at, timezone_value),
            processing_started_at = null, provider_message_id = null,
            last_error_code = null,
            payload = jsonb_set(jsonb_set(jsonb_set(delivery.payload,
              '{usage}', to_jsonb(usage_value), true),
              '{effective_limit}', to_jsonb(limit_value), true),
              '{remaining}', to_jsonb(remaining_value), true),
            updated_at = input_run_at
        where delivery.warning_episode_id = episode_record.id
          and delivery.channel = 'email'
          and delivery.status = 'SENT'
          and delivery.sent_at <= input_run_at - interval '7 days';
        get diagnostics reminder_rows = row_count;

        if delivery_rows + reminder_rows > 0 then
          insert into public.capacity_warning_audit (
            restaurant_id, warning_episode_id, capacity_type, warning_level,
            event_type, evaluation_source, details, created_at
          ) values (
            input_restaurant_id, episode_record.id, input_capacity_type,
            level_record.warning_level, 'REMINDER_QUEUED', input_source,
            jsonb_build_object('app', delivery_rows, 'email', reminder_rows), input_run_at
          );
        end if;
      end if;
    end if;

    update public.capacity_warning_states state
    set last_usage = usage_value,
        last_effective_limit = limit_value,
        last_projected_usage_7d = projected_value,
        last_evaluated_at = input_run_at,
        updated_at = input_run_at
    where state.restaurant_id = input_restaurant_id
      and state.capacity_type = input_capacity_type
      and state.warning_level = level_record.warning_level;
  end loop;

  return jsonb_build_object(
    'restaurant_id', input_restaurant_id,
    'capacity_type', input_capacity_type,
    'usage', usage_value,
    'effective_limit', limit_value,
    'remaining', remaining_value,
    'actual_level', actual_level,
    'projected_usage_7d', projected_value,
    'forecast_level', forecast_level,
    'forecast_basis_date', forecast_basis_date_value,
    'timezone', timezone_value
  );
end;
$function$;

revoke execute on function public.evaluate_restaurant_capacity_warning_internal(
  uuid, text, timestamptz, text, boolean
) from public, anon, authenticated, service_role;

create or replace function public.evaluate_capacity_warning_after_business_action()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  restaurant_id_value uuid;
  capacity_type_value text;
begin
  if tg_table_name = 'restaurant_offers' then
    restaurant_id_value := new.restaurant_id;
    capacity_type_value := 'offer';
  elsif tg_table_name = 'points_transactions' then
    if not (new.type = 'earn' and new.points > 0 and new.reversal_of is null
      and new.collection_source in ('restaurant_controlled', 'customer_initiated')) then
      return new;
    end if;
    restaurant_id_value := new.restaurant_id;
    capacity_type_value := 'customer';
  elsif tg_table_name = 'redemption_activity_journal' then
    if not (new.customer_id is not null and new.status = 'ACTIVE'
      and new.cancelled_at is null and new.is_test_event = false) then
      return new;
    end if;
    restaurant_id_value := new.restaurant_id;
    capacity_type_value := 'customer';
  elsif tg_table_name = 'restaurant_capacity_addon_entitlements' then
    restaurant_id_value := new.restaurant_id;
    capacity_type_value := case new.addon_key when 'OFFER_CAPACITY' then 'offer' else 'customer' end;
  elsif tg_table_name = 'branch_subscriptions' then
    select restaurant.id into restaurant_id_value
    from public.restaurants restaurant where restaurant.primary_branch_id = new.branch_id;
  elsif tg_table_name = 'commercial_pro_access_grants' then
    restaurant_id_value := new.restaurant_id;
  end if;

  if restaurant_id_value is null then return new; end if;
  if capacity_type_value is null then
    perform public.evaluate_restaurant_capacity_warning_internal(
      restaurant_id_value, 'offer', clock_timestamp(), 'EVENT', false
    );
    perform public.evaluate_restaurant_capacity_warning_internal(
      restaurant_id_value, 'customer', clock_timestamp(), 'EVENT', false
    );
  else
    perform public.evaluate_restaurant_capacity_warning_internal(
      restaurant_id_value, capacity_type_value, clock_timestamp(), 'EVENT', false
    );
  end if;
  return new;
exception when others then
  begin
    if restaurant_id_value is not null then
      insert into public.capacity_warning_audit (
        restaurant_id, capacity_type, event_type, evaluation_source, details
      ) values (
        restaurant_id_value, coalesce(capacity_type_value, 'offer'),
        'EVALUATION_FAILED', 'EVENT',
        jsonb_build_object('error_code', sqlstate, 'source_table', tg_table_name)
      );
    end if;
  exception when others then null;
  end;
  -- Warning infrastructure must never roll back an otherwise valid action.
  return new;
end;
$function$;

revoke execute on function public.evaluate_capacity_warning_after_business_action()
from public, anon, authenticated, service_role;

drop trigger if exists capacity_warning_offer_event on public.restaurant_offers;
create trigger capacity_warning_offer_event
after insert or update of restaurant_id, status, is_active, valid_to
on public.restaurant_offers
for each row execute function public.evaluate_capacity_warning_after_business_action();

drop trigger if exists capacity_warning_points_event on public.points_transactions;
create trigger capacity_warning_points_event
after insert or update of restaurant_id, customer_id, type, points, reversal_of, collection_source
on public.points_transactions
for each row execute function public.evaluate_capacity_warning_after_business_action();

drop trigger if exists capacity_warning_redemption_event on public.redemption_activity_journal;
create trigger capacity_warning_redemption_event
after insert or update of restaurant_id, customer_id, status, cancelled_at, is_test_event
on public.redemption_activity_journal
for each row execute function public.evaluate_capacity_warning_after_business_action();

drop trigger if exists capacity_warning_addon_event on public.restaurant_capacity_addon_entitlements;
create trigger capacity_warning_addon_event
after insert on public.restaurant_capacity_addon_entitlements
for each row execute function public.evaluate_capacity_warning_after_business_action();

drop trigger if exists capacity_warning_subscription_event on public.branch_subscriptions;
create trigger capacity_warning_subscription_event
after insert or update of status, plan_key on public.branch_subscriptions
for each row execute function public.evaluate_capacity_warning_after_business_action();

drop trigger if exists capacity_warning_pro_grant_event on public.commercial_pro_access_grants;
create trigger capacity_warning_pro_grant_event
after insert or update of starts_at, expires_at, revoked_at on public.commercial_pro_access_grants
for each row execute function public.evaluate_capacity_warning_after_business_action();

create or replace function public.run_capacity_warning_daily(
  input_run_at timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  restaurant_record record;
  evaluated_count integer := 0;
  failed_count integer := 0;
begin
  if input_run_at is null or not isfinite(input_run_at) then
    raise exception 'CAPACITY_WARNING_TIME_INVALID' using errcode = '22023';
  end if;
  for restaurant_record in
    select restaurant.id,
      public.capacity_warning_timezone(restaurant.timezone_name) as timezone_name
    from public.restaurants restaurant
    where restaurant.status = 'active'
      and not exists (
        select 1 from public.platform_test_tenant_registry test_tenant
        where test_tenant.restaurant_id = restaurant.id
      )
      and extract(hour from input_run_at at time zone public.capacity_warning_timezone(restaurant.timezone_name)) = 8
  loop
    begin
      perform public.evaluate_restaurant_capacity_warning_internal(
        restaurant_record.id, 'offer', input_run_at, 'DAILY', true
      );
      perform public.evaluate_restaurant_capacity_warning_internal(
        restaurant_record.id, 'customer', input_run_at, 'DAILY', true
      );
      evaluated_count := evaluated_count + 1;
    exception when others then
      failed_count := failed_count + 1;
      begin
        insert into public.capacity_warning_audit (
          restaurant_id, capacity_type, event_type, evaluation_source, details, created_at
        ) values (
          restaurant_record.id, 'offer', 'EVALUATION_FAILED', 'DAILY',
          jsonb_build_object('error_code', sqlstate), input_run_at
        );
      exception when others then null;
      end;
    end;
  end loop;
  return jsonb_build_object('evaluated_restaurants', evaluated_count, 'failed_restaurants', failed_count);
end;
$function$;

revoke execute on function public.run_capacity_warning_daily(timestamptz)
from public, anon, authenticated, service_role;

create or replace function public.get_owner_capacity_warnings(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.restaurant_members member
    where member.restaurant_id = input_restaurant_id
      and member.user_id = auth.uid() and member.role = 'owner'
  ) then
    raise exception 'CAPACITY_WARNING_READ_FORBIDDEN' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'episode_id', episode.id,
      'capacity_type', episode.capacity_type,
      'warning_level', episode.warning_level,
      'triggered_by', episode.triggered_by,
      'usage', episode.usage,
      'effective_limit', episode.effective_limit,
      'remaining', episode.remaining,
      'projected_usage_7d', episode.projected_usage_7d,
      'opened_at', episode.opened_at,
      'acknowledged', delivery.status = 'ACKNOWLEDGED',
      'route', '/admin/settings/tarif-kapazitaet'
    ) order by public.capacity_warning_level_rank(episode.warning_level) desc, episode.opened_at desc)
    from public.capacity_warning_deliveries delivery
    join public.capacity_warning_episodes episode on episode.id = delivery.warning_episode_id
    where delivery.restaurant_id = input_restaurant_id
      and delivery.recipient_user_id = auth.uid()
      and delivery.channel = 'app'
      and delivery.status in ('DELIVERED', 'ACKNOWLEDGED')
      and episode.status = 'OPEN'
  ), '[]'::jsonb);
end;
$function$;

revoke execute on function public.get_owner_capacity_warnings(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_owner_capacity_warnings(uuid) to authenticated;

create or replace function public.acknowledge_owner_capacity_warning(
  input_restaurant_id uuid,
  input_episode_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  delivery_record public.capacity_warning_deliveries%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.restaurant_members member
    where member.restaurant_id = input_restaurant_id
      and member.user_id = auth.uid() and member.role = 'owner'
  ) then
    raise exception 'CAPACITY_WARNING_ACK_FORBIDDEN' using errcode = '42501';
  end if;
  select delivery.* into delivery_record
  from public.capacity_warning_deliveries delivery
  join public.capacity_warning_episodes episode on episode.id = delivery.warning_episode_id
  where delivery.warning_episode_id = input_episode_id
    and delivery.restaurant_id = input_restaurant_id
    and delivery.recipient_user_id = auth.uid()
    and delivery.channel = 'app'
    and episode.status = 'OPEN'
  for update of delivery;
  if delivery_record.id is null then
    raise exception 'CAPACITY_WARNING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if delivery_record.status = 'ACKNOWLEDGED' then return true; end if;
  if delivery_record.status <> 'DELIVERED' then return false; end if;

  update public.capacity_warning_deliveries
  set status = 'ACKNOWLEDGED', acknowledged_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where id = delivery_record.id;
  insert into public.capacity_warning_audit (
    restaurant_id, warning_episode_id, capacity_type, warning_level,
    event_type, evaluation_source, details
  )
  select episode.restaurant_id, episode.id, episode.capacity_type,
    episode.warning_level, 'APP_ACKNOWLEDGED', 'OWNER', '{}'::jsonb
  from public.capacity_warning_episodes episode where episode.id = input_episode_id;
  return true;
end;
$function$;

revoke execute on function public.acknowledge_owner_capacity_warning(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.acknowledge_owner_capacity_warning(uuid, uuid) to authenticated;

create or replace function public.reserve_capacity_warning_emails(input_limit integer default 25)
returns table (
  delivery_id uuid,
  event_type text,
  email text,
  restaurant_name text,
  restaurant_slug text,
  payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  update public.capacity_warning_deliveries delivery
  set status = 'SKIPPED', processing_started_at = null,
      last_error_code = 'RECIPIENT_UNAVAILABLE', updated_at = statement_timestamp()
  where delivery.channel = 'email'
    and delivery.status in ('PENDING', 'FAILED')
    and not exists (
      select 1
      from public.restaurant_members member
      join auth.users owner_user on owner_user.id = member.user_id
      where member.restaurant_id = delivery.restaurant_id
        and member.user_id = delivery.recipient_user_id
        and member.role = 'owner'
        and owner_user.email is not null
        and owner_user.email_confirmed_at is not null
        and (owner_user.banned_until is null or owner_user.banned_until <= statement_timestamp())
    );

  update public.capacity_warning_deliveries delivery
  set status = case when delivery.attempt_count >= 5 then 'SKIPPED' else 'FAILED' end,
      processing_started_at = null,
      available_at = case when delivery.attempt_count >= 5 then delivery.available_at else statement_timestamp() end,
      last_error_code = case when delivery.attempt_count >= 5 then 'DELIVERY_ATTEMPTS_EXHAUSTED' else 'LEASE_EXPIRED' end,
      updated_at = statement_timestamp()
  where delivery.channel = 'email' and delivery.status = 'PROCESSING'
    and delivery.processing_started_at <= statement_timestamp() - interval '10 minutes';

  return query
  with due as (
    select delivery.id
    from public.capacity_warning_deliveries delivery
    where delivery.channel = 'email'
      and delivery.status in ('PENDING', 'FAILED')
      and delivery.available_at <= statement_timestamp()
      and delivery.attempt_count < 5
    order by delivery.available_at, delivery.created_at
    for update skip locked
    limit least(greatest(coalesce(input_limit, 25), 1), 50)
  ), reserved as (
    update public.capacity_warning_deliveries delivery
    set status = 'PROCESSING', attempt_count = delivery.attempt_count + 1,
        processing_started_at = statement_timestamp(), last_error_code = null,
        updated_at = statement_timestamp()
    from due where delivery.id = due.id
    returning delivery.*
  )
  select reserved.id, 'CAPACITY_WARNING'::text, owner_user.email::text,
    restaurant.name::text, restaurant.slug::text, reserved.payload, reserved.attempt_count
  from reserved
  join public.restaurant_members member
    on member.restaurant_id = reserved.restaurant_id
   and member.user_id = reserved.recipient_user_id and member.role = 'owner'
  join auth.users owner_user on owner_user.id = reserved.recipient_user_id
   and owner_user.email is not null and owner_user.email_confirmed_at is not null
   and (owner_user.banned_until is null or owner_user.banned_until <= statement_timestamp())
  join public.restaurants restaurant on restaurant.id = reserved.restaurant_id;
end;
$function$;

revoke execute on function public.reserve_capacity_warning_emails(integer)
from public, anon, authenticated, service_role;
grant execute on function public.reserve_capacity_warning_emails(integer) to service_role;

create or replace function public.complete_capacity_warning_email(
  input_delivery_id uuid,
  input_success boolean,
  input_provider_message_id text default null,
  input_error_code text default null
)
returns void
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  update public.capacity_warning_deliveries delivery
  set status = case
        when input_success then 'SENT'
        when delivery.attempt_count >= 5 then 'SKIPPED'
        else 'FAILED'
      end,
      provider_message_id = case
        when input_success then left(nullif(trim(input_provider_message_id), ''), 240)
        else delivery.provider_message_id
      end,
      sent_at = case when input_success then statement_timestamp() else delivery.sent_at end,
      processing_started_at = null,
      last_error_code = case
        when input_success then null
        else left(coalesce(input_error_code, 'DELIVERY_FAILED'), 120)
      end,
      available_at = case
        when input_success or delivery.attempt_count >= 5 then delivery.available_at
        when delivery.attempt_count = 1 then statement_timestamp() + interval '1 minute'
        when delivery.attempt_count = 2 then statement_timestamp() + interval '5 minutes'
        when delivery.attempt_count = 3 then statement_timestamp() + interval '15 minutes'
        else statement_timestamp() + interval '1 hour'
      end,
      updated_at = statement_timestamp()
  where delivery.id = input_delivery_id
    and delivery.channel = 'email' and delivery.status = 'PROCESSING';
$function$;

revoke execute on function public.complete_capacity_warning_email(uuid, boolean, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.complete_capacity_warning_email(uuid, boolean, text, text) to service_role;

create or replace function public.get_restaurant_capacity(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  at_value timestamptz := statement_timestamp();
  capacity_snapshot jsonb;
  entitlement_snapshot jsonb;
  offer_addon_record public.commercial_capacity_addon_versions%rowtype;
  customer_addon_record public.commercial_capacity_addon_versions%rowtype;
  offer_usage bigint;
  offer_limit bigint;
  offer_addon_units bigint;
  customer_usage bigint;
  customer_limit bigint;
  customer_addon_units bigint;
  offer_status text;
  customer_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not public.is_restaurant_admin(input_restaurant_id)
     and not public.is_platform_admin() then
    raise exception 'CAPACITY_READ_FORBIDDEN' using errcode = '42501';
  end if;

  capacity_snapshot := public.resolve_restaurant_capacity_internal(input_restaurant_id, at_value);
  entitlement_snapshot := public.resolve_restaurant_entitlements_internal(input_restaurant_id);

  select * into offer_addon_record
  from public.commercial_capacity_addon_versions addon
  where addon.addon_key = 'OFFER_CAPACITY'
    and addon.effective_from <= at_value
    and (addon.effective_until is null or addon.effective_until > at_value)
  order by addon.effective_from desc, addon.version desc limit 1;
  select * into customer_addon_record
  from public.commercial_capacity_addon_versions addon
  where addon.addon_key = 'CUSTOMER_CAPACITY'
    and addon.effective_from <= at_value
    and (addon.effective_until is null or addon.effective_until > at_value)
  order by addon.effective_from desc, addon.version desc limit 1;
  if offer_addon_record.id is null or customer_addon_record.id is null then
    raise exception 'CAPACITY_ADDON_CATALOG_NOT_CONFIGURED' using errcode = '55000';
  end if;

  offer_usage := (capacity_snapshot #>> '{offers,usage}')::bigint;
  offer_limit := (capacity_snapshot #>> '{offers,effective_limit}')::bigint;
  offer_addon_units := (capacity_snapshot #>> '{offers,addon_units}')::bigint;
  customer_usage := (capacity_snapshot #>> '{active_customers,usage}')::bigint;
  customer_limit := (capacity_snapshot #>> '{active_customers,effective_limit}')::bigint;
  customer_addon_units := (capacity_snapshot #>> '{active_customers,addon_units}')::bigint;
  offer_status := case
    when offer_usage > offer_limit then 'OVER_LIMIT'
    when offer_usage = offer_limit then 'AT_LIMIT'
    when offer_usage * 100 >= offer_limit * 90 then 'WARNING_90'
    when offer_usage * 100 >= offer_limit * 80 then 'WARNING_80'
    else 'AVAILABLE' end;
  customer_status := case
    when customer_usage > customer_limit then 'OVER_LIMIT'
    when customer_usage = customer_limit then 'AT_LIMIT'
    when customer_usage * 100 >= customer_limit * 90 then 'WARNING_90'
    when customer_usage * 100 >= customer_limit * 80 then 'WARNING_80'
    else 'AVAILABLE' end;

  capacity_snapshot := jsonb_set(capacity_snapshot, '{offers,status}', to_jsonb(offer_status), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{offers,usage_percent}', to_jsonb(least(100, (offer_usage * 100 / offer_limit)::integer)), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{offers,addon_capacity}', to_jsonb(offer_addon_units * offer_addon_record.capacity_per_unit), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{active_customers,status}', to_jsonb(customer_status), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{active_customers,usage_percent}', to_jsonb(least(100, (customer_usage * 100 / customer_limit)::integer)), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{active_customers,addon_capacity}', to_jsonb(customer_addon_units * customer_addon_record.capacity_per_unit), true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{write_enforcement_active}', 'true'::jsonb, true);
  capacity_snapshot := jsonb_set(capacity_snapshot, '{write_enforcement}', jsonb_build_object('offers', true, 'active_customers', true), true);

  return capacity_snapshot || jsonb_build_object(
    'commercial_release', entitlement_snapshot->'commercial_release',
    'catalog', jsonb_build_object(
      'offer_addon', jsonb_build_object(
        'addon_key', offer_addon_record.addon_key,
        'version', offer_addon_record.version,
        'capacity_per_unit', offer_addon_record.capacity_per_unit,
        'monthly_price_minor', offer_addon_record.monthly_price_minor,
        'currency', offer_addon_record.currency,
        'tax_treatment', offer_addon_record.tax_treatment
      ),
      'customer_addon', jsonb_build_object(
        'addon_key', customer_addon_record.addon_key,
        'version', customer_addon_record.version,
        'capacity_per_unit', customer_addon_record.capacity_per_unit,
        'monthly_price_minor', customer_addon_record.monthly_price_minor,
        'currency', customer_addon_record.currency,
        'tax_treatment', customer_addon_record.tax_treatment
      )
    ),
    'warning_contract', jsonb_build_object(
      'thresholds_percent', jsonb_build_array(80, 90, 100),
      'forecast_horizon_days', 7,
      'minimum_complete_history_days', 28,
      'dispatch_active', true,
      'forecast_active', true,
      'decision_required', false
    )
  );
end;
$function$;

revoke execute on function public.get_restaurant_capacity(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_restaurant_capacity(uuid) to authenticated;

create extension if not exists pg_cron;
do $function$
declare job_record record;
begin
  for job_record in
    select jobid from cron.job where jobname = 'wuxuai-capacity-warning-hourly-local-0800'
  loop
    perform cron.unschedule(job_record.jobid);
  end loop;
  perform cron.schedule(
    'wuxuai-capacity-warning-hourly-local-0800',
    '0 * * * *',
    'select public.run_capacity_warning_daily(statement_timestamp());'
  );
end;
$function$;

comment on function public.evaluate_restaurant_capacity_warning_internal(uuid, text, timestamptz, text, boolean) is
  'Private Phase 7C.5B evaluator. Resolver-authoritative, tenant-serialized and fail-closed; it never mutates entitlements or business data.';
comment on function public.get_owner_capacity_warnings(uuid) is
  'Read-only tenant-scoped app warnings for the authenticated restaurant admin.';
comment on function public.acknowledge_owner_capacity_warning(uuid, uuid) is
  'Owner-only idempotent app acknowledgement. It changes no capacity, entitlement or business state.';

notify pgrst, 'reload schema';
