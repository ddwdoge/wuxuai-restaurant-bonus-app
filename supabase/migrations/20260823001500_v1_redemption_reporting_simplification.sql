-- V1 customer presentation reporting. Historical six-digit redemption data
-- remains available as legacy evidence, but is not part of the primary flow.

alter table public.redemption_activity_journal
  add column if not exists redemption_started_at timestamptz,
  add column if not exists finalized_at timestamptz,
  add column if not exists reference_value_cents integer,
  add column if not exists reference_currency text;

alter table public.redemption_activity_journal
  drop constraint if exists redemption_activity_reference_value_check;
alter table public.redemption_activity_journal
  add constraint redemption_activity_reference_value_check check (
    (reference_value_cents is null and reference_currency is null)
    or (reference_value_cents >= 0 and reference_currency = 'EUR')
  );

-- The immutable-journal trigger predates these reporting columns. Enable its
-- transaction-local maintenance path only for the deterministic backfill.
select set_config('wuxuai.allow_activity_cancellation', 'on', true);

update public.redemption_activity_journal journal
set redemption_started_at = coalesce(presentation.activated_at, journal.redeemed_at),
    finalized_at = presentation.completed_at
from public.points_redemption_presentations presentation
where journal.source_type = 'points_presentation'
  and journal.source_id = presentation.id
  and (journal.redemption_started_at is null or journal.finalized_at is null);

update public.redemption_activity_journal journal
set redemption_started_at = coalesce(presentation.activated_at, journal.redeemed_at),
    finalized_at = coalesce(presentation.completed_at, journal.redeemed_at)
from public.gift_redemption_presentations presentation
where journal.source_type = 'gift_presentation'
  and journal.source_id = presentation.id
  and (journal.redemption_started_at is null or journal.finalized_at is null);

-- Legacy rows keep their recorded event time. Missing historical values are
-- intentionally left null instead of being reconstructed from current data.
update public.redemption_activity_journal
set redemption_started_at = coalesce(redemption_started_at, redeemed_at),
    finalized_at = coalesce(finalized_at, redeemed_at)
where source_type not in ('points_presentation', 'gift_presentation');

select set_config('wuxuai.allow_activity_cancellation', 'off', true);

create or replace function public.prepare_redemption_reporting_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  started_at_value timestamptz;
  finalized_at_value timestamptz;
  product_price_value numeric(10, 2);
begin
  if new.source_type = 'points_presentation' then
    select presentation.activated_at, presentation.completed_at, reward.product_price
      into started_at_value, finalized_at_value, product_price_value
    from public.points_redemption_presentations presentation
    left join public.rewards reward
      on reward.id = presentation.reward_id
     and reward.restaurant_id = presentation.restaurant_id
    where presentation.id = new.source_id
      and presentation.restaurant_id = new.restaurant_id;
  elsif new.source_type = 'gift_presentation' then
    select presentation.activated_at, presentation.completed_at, reward.product_price
      into started_at_value, finalized_at_value, product_price_value
    from public.gift_redemption_presentations presentation
    left join public.rewards reward
      on reward.id = presentation.reward_id
     and reward.restaurant_id = presentation.restaurant_id
    where presentation.id = new.source_id
      and presentation.restaurant_id = new.restaurant_id;
  end if;

  new.redemption_started_at := coalesce(started_at_value, new.redeemed_at);
  new.finalized_at := case
    when new.source_type = 'points_presentation' then finalized_at_value
    else coalesce(finalized_at_value, new.redeemed_at)
  end;
  if product_price_value is not null then
    new.reference_value_cents := round(product_price_value * 100)::integer;
    new.reference_currency := 'EUR';
  end if;
  return new;
end;
$$;

revoke execute on function public.prepare_redemption_reporting_snapshot()
  from public, anon, authenticated;

drop trigger if exists prepare_redemption_reporting_snapshot_trigger
  on public.redemption_activity_journal;
create trigger prepare_redemption_reporting_snapshot_trigger
before insert on public.redemption_activity_journal
for each row execute function public.prepare_redemption_reporting_snapshot();

create or replace function public.finalize_points_redemption_reporting()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'REDEEMED_ACTIVE'
     and new.status = 'REDEEMED_COMPLETED'
     and new.completed_at is not null then
    perform set_config('wuxuai.allow_activity_finalization', 'on', true);
    update public.redemption_activity_journal
    set finalized_at = new.completed_at
    where restaurant_id = new.restaurant_id
      and source_type = 'points_presentation'
      and source_id = new.id
      and finalized_at is null;
  end if;
  return new;
end;
$$;

revoke execute on function public.finalize_points_redemption_reporting()
  from public, anon, authenticated;

drop trigger if exists finalize_points_redemption_reporting_trigger
  on public.points_redemption_presentations;
create trigger finalize_points_redemption_reporting_trigger
after update of status, completed_at on public.points_redemption_presentations
for each row execute function public.finalize_points_redemption_reporting();

create or replace function public.protect_redemption_activity_journal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Einlösungsaktivitäten dürfen nicht gelöscht werden.';
  end if;

  if coalesce(current_setting('wuxuai.allow_activity_finalization', true), '') = 'on' then
    if new.finalized_at is not null
       and old.finalized_at is null
       and new is not distinct from old then
      return new;
    end if;
    -- The row comparison above includes finalized_at. Compare the immutable
    -- snapshot explicitly while allowing only the null-to-value transition.
    if new.id is not distinct from old.id
       and new.activity_number is not distinct from old.activity_number
       and new.restaurant_id is not distinct from old.restaurant_id
       and new.organization_id is not distinct from old.organization_id
       and new.branch_id is not distinct from old.branch_id
       and new.customer_id is not distinct from old.customer_id
       and new.customer_reference is not distinct from old.customer_reference
       and new.source_type is not distinct from old.source_type
       and new.source_id is not distinct from old.source_id
       and new.reward_id is not distinct from old.reward_id
       and new.reward_type is not distinct from old.reward_type
       and new.reward_name_snapshot is not distinct from old.reward_name_snapshot
       and new.reward_description_snapshot is not distinct from old.reward_description_snapshot
       and new.points_spent is not distinct from old.points_spent
       and new.quantity is not distinct from old.quantity
       and new.redeemed_at is not distinct from old.redeemed_at
       and new.redeemed_by is not distinct from old.redeemed_by
       and new.actor_role is not distinct from old.actor_role
       and new.redemption_code_reference is not distinct from old.redemption_code_reference
       and new.status is not distinct from old.status
       and new.cancelled_at is not distinct from old.cancelled_at
       and new.cancelled_by is not distinct from old.cancelled_by
       and new.cancellation_reason is not distinct from old.cancellation_reason
       and new.cancellation_audit_id is not distinct from old.cancellation_audit_id
       and new.audit_reference is not distinct from old.audit_reference
       and new.snapshot_completeness is not distinct from old.snapshot_completeness
       and new.is_test_event is not distinct from old.is_test_event
       and new.created_at is not distinct from old.created_at
       and new.redemption_started_at is not distinct from old.redemption_started_at
       and new.reference_value_cents is not distinct from old.reference_value_cents
       and new.reference_currency is not distinct from old.reference_currency
       and old.finalized_at is null and new.finalized_at is not null then
      return new;
    end if;
    raise exception 'Historische Snapshotfelder dürfen nicht geändert werden.';
  end if;

  if coalesce(current_setting('wuxuai.allow_activity_cancellation', true), '') <> 'on' then
    raise exception 'Historische Einlösungsaktivitäten dürfen nicht geändert werden.';
  end if;

  if new.id is distinct from old.id
     or new.activity_number is distinct from old.activity_number
     or new.restaurant_id is distinct from old.restaurant_id
     or new.organization_id is distinct from old.organization_id
     or new.branch_id is distinct from old.branch_id
     or new.customer_id is distinct from old.customer_id
     or new.customer_reference is distinct from old.customer_reference
     or new.source_type is distinct from old.source_type
     or new.source_id is distinct from old.source_id
     or new.reward_id is distinct from old.reward_id
     or new.reward_type is distinct from old.reward_type
     or new.reward_name_snapshot is distinct from old.reward_name_snapshot
     or new.reward_description_snapshot is distinct from old.reward_description_snapshot
     or new.points_spent is distinct from old.points_spent
     or new.quantity is distinct from old.quantity
     or new.redeemed_at is distinct from old.redeemed_at
     or new.redeemed_by is distinct from old.redeemed_by
     or new.actor_role is distinct from old.actor_role
     or new.redemption_code_reference is distinct from old.redemption_code_reference
     or new.audit_reference is distinct from old.audit_reference
     or new.snapshot_completeness is distinct from old.snapshot_completeness
     or new.is_test_event is distinct from old.is_test_event
     or new.created_at is distinct from old.created_at
     or new.redemption_started_at is distinct from old.redemption_started_at
     or new.finalized_at is distinct from old.finalized_at
     or new.reference_value_cents is distinct from old.reference_value_cents
     or new.reference_currency is distinct from old.reference_currency then
    raise exception 'Historische Snapshotfelder dürfen nicht geändert werden.';
  end if;
  return new;
end;
$$;

create index if not exists redemption_activity_report_finalized_idx
  on public.redemption_activity_journal
  (restaurant_id, finalized_at desc, reward_type)
  where finalized_at is not null and is_test_event = false;

create index if not exists redemption_activity_report_branch_idx
  on public.redemption_activity_journal
  (restaurant_id, branch_id, finalized_at desc)
  where finalized_at is not null and is_test_event = false;

create or replace function public.get_v1_redemption_report(
  input_restaurant_id uuid,
  input_period text default 'today',
  input_custom_from date default null,
  input_custom_to date default null,
  input_branch_id uuid default null,
  input_reward_source text default null,
  input_include_cancelled boolean default false,
  input_limit integer default 250,
  input_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  timezone_value text;
  restaurant_name_value text;
  local_today date;
  local_from date;
  local_to date;
  period_from timestamptz;
  period_to timestamptz;
  summary_value jsonb;
  rows_value jsonb;
  daily_value jsonb;
  monthly_value jsonb;
  top_rewards_value jsonb;
  excluded_test_count_value integer;
begin
  if not public.is_bonus_report_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'REPORT_ACCESS_DENIED';
  end if;
  select restaurant.name, coalesce(nullif(restaurant.timezone_name, ''), 'Europe/Vienna')
    into restaurant_name_value, timezone_value
  from public.restaurants restaurant where restaurant.id = input_restaurant_id;
  if restaurant_name_value is null then raise exception using errcode = 'P0001', message = 'REPORT_NOT_AVAILABLE'; end if;
  if input_branch_id is not null and not exists (
    select 1 from public.branches branch
    where branch.id = input_branch_id and branch.restaurant_id = input_restaurant_id
  ) then raise exception using errcode = '42501', message = 'REPORT_ACCESS_DENIED'; end if;
  if input_reward_source is not null and input_reward_source not in ('points', 'welcome', 'birthday') then
    raise exception using errcode = '22023', message = 'REPORT_FILTER_INVALID';
  end if;

  local_today := statement_timestamp() at time zone timezone_value;
  case input_period
    when 'today' then local_from := local_today; local_to := local_today + 1;
    when 'yesterday' then local_from := local_today - 1; local_to := local_today;
    when 'this_week' then local_from := local_today - (extract(isodow from local_today)::integer - 1); local_to := local_from + 7;
    when 'last_week' then local_to := local_today - (extract(isodow from local_today)::integer - 1); local_from := local_to - 7;
    when 'this_month' then local_from := date_trunc('month', local_today)::date; local_to := (local_from + interval '1 month')::date;
    when 'last_month' then local_to := date_trunc('month', local_today)::date; local_from := (local_to - interval '1 month')::date;
    when 'this_year' then local_from := make_date(extract(year from local_today)::integer, 1, 1); local_to := make_date(extract(year from local_today)::integer + 1, 1, 1);
    when 'custom' then
      if input_custom_from is null or input_custom_to is null or input_custom_to < input_custom_from
        or input_custom_to - input_custom_from > 366 then
        raise exception using errcode = '22023', message = 'REPORT_PERIOD_INVALID';
      end if;
      local_from := input_custom_from; local_to := input_custom_to + 1;
    else raise exception using errcode = '22023', message = 'REPORT_PERIOD_INVALID';
  end case;
  period_from := local_from::timestamp at time zone timezone_value;
  period_to := local_to::timestamp at time zone timezone_value;

  select count(*) into excluded_test_count_value
  from public.redemption_activity_journal journal
  where journal.restaurant_id = input_restaurant_id
    and journal.finalized_at >= period_from and journal.finalized_at < period_to
    and journal.is_test_event = true
    and (input_branch_id is null or journal.branch_id = input_branch_id)
    and journal.reward_type in ('POINT_REWARD', 'WELCOME_GIFT', 'BIRTHDAY_GIFT');

  with eligible as (
    select journal.* from public.redemption_activity_journal journal
    where journal.restaurant_id = input_restaurant_id
      and journal.finalized_at >= period_from and journal.finalized_at < period_to
      and journal.is_test_event = false
      and (input_include_cancelled or journal.status = 'ACTIVE')
      and (input_branch_id is null or journal.branch_id = input_branch_id)
      and journal.reward_type in ('POINT_REWARD', 'WELCOME_GIFT', 'BIRTHDAY_GIFT')
      and (input_reward_source is null or journal.reward_type = case input_reward_source
        when 'points' then 'POINT_REWARD' when 'welcome' then 'WELCOME_GIFT' when 'birthday' then 'BIRTHDAY_GIFT' end)
  )
  select jsonb_build_object(
    'total', count(*),
    'point_rewards', count(*) filter (where reward_type = 'POINT_REWARD'),
    'welcome_gifts', count(*) filter (where reward_type = 'WELCOME_GIFT'),
    'birthday_gifts', count(*) filter (where reward_type = 'BIRTHDAY_GIFT'),
    'points_spent', coalesce(sum(points_spent), 0),
    'customers', count(distinct customer_reference),
    'reference_value_cents', coalesce(sum(reference_value_cents), 0),
    'reference_value_count', count(reference_value_cents),
    'missing_reference_count', count(*) filter (where reference_value_cents is null),
    'complete_snapshots', count(*) filter (where snapshot_completeness = 'complete'),
    'incomplete_legacy_records', count(*) filter (where snapshot_completeness <> 'complete'),
    'cancelled', count(*) filter (where status = 'CANCELLED')
  ) into summary_value from eligible;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', report_row.id, 'activity_number', report_row.activity_number,
    'redemption_started_at', report_row.redemption_started_at,
    'redeemed_at', report_row.finalized_at, 'branch_id', report_row.branch_id,
    'branch_name', report_row.branch_name, 'reward_id', report_row.reward_id,
    'reward_source', case report_row.reward_type when 'POINT_REWARD' then 'points' when 'WELCOME_GIFT' then 'welcome' else 'birthday' end,
    'reward_name', report_row.reward_name_snapshot, 'points_spent', report_row.points_spent,
    'reference_value_cents', report_row.reference_value_cents,
    'reference_currency', report_row.reference_currency,
    'status', case when report_row.status = 'CANCELLED' then 'cancelled' else 'redeemed' end,
    'snapshot_completeness', report_row.snapshot_completeness
  ) order by report_row.finalized_at desc), '[]'::jsonb) into rows_value
  from (
    select journal.*, branch.name branch_name
    from public.redemption_activity_journal journal
    left join public.branches branch on branch.id = journal.branch_id and branch.restaurant_id = journal.restaurant_id
    where journal.restaurant_id = input_restaurant_id
      and journal.finalized_at >= period_from and journal.finalized_at < period_to
      and journal.is_test_event = false
      and (input_include_cancelled or journal.status = 'ACTIVE')
      and (input_branch_id is null or journal.branch_id = input_branch_id)
      and journal.reward_type in ('POINT_REWARD', 'WELCOME_GIFT', 'BIRTHDAY_GIFT')
      and (input_reward_source is null or journal.reward_type = case input_reward_source
        when 'points' then 'POINT_REWARD' when 'welcome' then 'WELCOME_GIFT' when 'birthday' then 'BIRTHDAY_GIFT' end)
    order by journal.finalized_at desc
    limit least(greatest(coalesce(input_limit, 250), 1), 500)
    offset greatest(coalesce(input_offset, 0), 0)
  ) report_row;

  select coalesce(jsonb_agg(jsonb_build_object('date', grouped.local_date, 'count', grouped.total) order by grouped.local_date), '[]'::jsonb)
    into daily_value
  from (
    select (journal.finalized_at at time zone timezone_value)::date local_date, count(*) total
    from public.redemption_activity_journal journal
    where journal.restaurant_id = input_restaurant_id and journal.finalized_at >= period_from and journal.finalized_at < period_to
      and journal.status = 'ACTIVE' and not journal.is_test_event
      and (input_branch_id is null or journal.branch_id = input_branch_id)
      and journal.reward_type in ('POINT_REWARD', 'WELCOME_GIFT', 'BIRTHDAY_GIFT')
      and (input_reward_source is null or journal.reward_type = case input_reward_source
        when 'points' then 'POINT_REWARD' when 'welcome' then 'WELCOME_GIFT' when 'birthday' then 'BIRTHDAY_GIFT' end)
    group by 1
  ) grouped;

  select coalesce(jsonb_agg(jsonb_build_object('name', grouped.reward_name, 'count', grouped.total) order by grouped.total desc, grouped.reward_name), '[]'::jsonb)
    into top_rewards_value
  from (
    select coalesce(journal.reward_name_snapshot, 'Historischer Wert nicht vorhanden') reward_name, count(*) total
    from public.redemption_activity_journal journal
    where journal.restaurant_id = input_restaurant_id and journal.finalized_at >= period_from and journal.finalized_at < period_to
      and journal.status = 'ACTIVE' and not journal.is_test_event
      and (input_branch_id is null or journal.branch_id = input_branch_id)
      and journal.reward_type in ('POINT_REWARD', 'WELCOME_GIFT', 'BIRTHDAY_GIFT')
      and (input_reward_source is null or journal.reward_type = case input_reward_source
        when 'points' then 'POINT_REWARD' when 'welcome' then 'WELCOME_GIFT' when 'birthday' then 'BIRTHDAY_GIFT' end)
    group by 1
    order by count(*) desc, reward_name
    limit 5
  ) grouped;

  select coalesce(jsonb_agg(jsonb_build_object('month', month_series.month_number, 'count', coalesce(grouped.total, 0)) order by month_series.month_number), '[]'::jsonb)
    into monthly_value
  from generate_series(1, 12) month_series(month_number)
  left join (
    select extract(month from journal.finalized_at at time zone timezone_value)::integer month_number, count(*) total
    from public.redemption_activity_journal journal
    where journal.restaurant_id = input_restaurant_id and journal.finalized_at >= period_from and journal.finalized_at < period_to
      and journal.status = 'ACTIVE' and not journal.is_test_event
      and (input_branch_id is null or journal.branch_id = input_branch_id)
      and journal.reward_type in ('POINT_REWARD', 'WELCOME_GIFT', 'BIRTHDAY_GIFT')
      and (input_reward_source is null or journal.reward_type = case input_reward_source
        when 'points' then 'POINT_REWARD' when 'welcome' then 'WELCOME_GIFT' when 'birthday' then 'BIRTHDAY_GIFT' end)
    group by 1
  ) grouped using (month_number);

  perform public.write_audit_event(input_restaurant_id, null, 'admin', auth.uid(),
    'REDEMPTION_REPORT_VIEWED', 'success', 'restaurant_portal',
    'redemption_activity_journal', null, null,
    jsonb_build_object('period', input_period, 'from', local_from, 'to', local_to - 1,
      'branch_id', input_branch_id, 'reward_source', input_reward_source));

  return jsonb_build_object(
    'restaurant_name', restaurant_name_value, 'timezone', timezone_value,
    'period_from', period_from, 'period_to', period_to,
    'test_data_excluded', true, 'excluded_test_count', excluded_test_count_value,
    'cancelled_included', input_include_cancelled,
    'summary', summary_value, 'rows', rows_value, 'daily_series', daily_value,
    'top_rewards', top_rewards_value, 'monthly_series', monthly_value,
    'legal_notice', 'Dieser Bericht dokumentiert Bonus- und Geschenk-Einlösungen innerhalb von WUXUAI. Er ersetzt keine gesetzlich vorgeschriebene Kassen-, Rechnungs- oder Steuerdokumentation.'
  );
end;
$$;

revoke execute on function public.get_v1_redemption_report(uuid, text, date, date, uuid, text, boolean, integer, integer)
  from public, anon;
grant execute on function public.get_v1_redemption_report(uuid, text, date, date, uuid, text, boolean, integer, integer)
  to authenticated;

comment on function public.get_v1_redemption_report(uuid, text, date, date, uuid, text, boolean, integer, integer)
is 'Tenant-scoped V1 report over finalized customer presentation redemptions. Test events are always excluded.';
