-- Assign one birthday gift when an active restaurant customer is inside the
-- inclusive local 14-day eligibility window. The same internal helper owns
-- cron and immediate membership catch-up behavior.

create unique index if not exists customer_rewards_one_birthday_gift_restaurant_year_idx
on public.customer_rewards (restaurant_id, customer_id, birthday_year)
where gift_type = 'birthday';

create or replace function public.assign_birthday_gift_if_eligible(
  input_customer_id uuid,
  input_run_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  membership record;
  selected_reward public.rewards%rowtype;
  existing_assignment_id uuid;
  assignment_id_value uuid;
  local_today date;
  birthday_date_value date;
  target_year integer;
begin
  select
    customer.*,
    restaurant.timezone_name,
    restaurant.slug as restaurant_slug,
    restaurant.status as restaurant_status
  into membership
  from public.customers customer
  join public.restaurants restaurant on restaurant.id = customer.restaurant_id
  where customer.id = input_customer_id
  for update of customer;

  if membership.id is null
    or membership.membership_status <> 'active'
    or membership.restaurant_status <> 'active' then
    return jsonb_build_object('status', 'inactive');
  end if;

  membership.birthday_day := coalesce(
    membership.birthday_day,
    extract(day from membership.birthday)::integer
  );
  membership.birthday_month := coalesce(
    membership.birthday_month,
    extract(month from membership.birthday)::integer
  );
  if membership.birthday_day is null or membership.birthday_month is null then
    return jsonb_build_object('status', 'birthday_missing');
  end if;

  local_today := (input_run_at at time zone membership.timezone_name)::date;
  target_year := extract(year from local_today)::integer;
  birthday_date_value := public.v1_birthday_date(
    membership.birthday_day,
    membership.birthday_month,
    target_year
  );

  if birthday_date_value is null then
    return jsonb_build_object('status', 'birthday_invalid');
  end if;
  if birthday_date_value < local_today then
    target_year := target_year + 1;
    birthday_date_value := public.v1_birthday_date(
      membership.birthday_day,
      membership.birthday_month,
      target_year
    );
  end if;

  if birthday_date_value is null
    or birthday_date_value < local_today
    or birthday_date_value > local_today + 14 then
    return jsonb_build_object('status', 'not_eligible');
  end if;

  target_year := extract(year from birthday_date_value)::integer;
  perform pg_advisory_xact_lock(hashtextextended(
    'birthday-gift:' || membership.restaurant_id::text || ':'
      || membership.id::text || ':' || target_year::text,
    0
  ));

  select customer_reward.id
  into existing_assignment_id
  from public.customer_rewards customer_reward
  where customer_reward.restaurant_id = membership.restaurant_id
    and customer_reward.customer_id = membership.id
    and customer_reward.gift_type = 'birthday'
    and customer_reward.birthday_year = target_year
  limit 1;
  if existing_assignment_id is not null then
    return jsonb_build_object(
      'status', 'already_assigned',
      'customer_reward_id', existing_assignment_id,
      'birthday_year', target_year
    );
  end if;

  select reward.*
  into selected_reward
  from public.rewards reward
  where reward.restaurant_id = membership.restaurant_id
    and reward.branch_id is not distinct from membership.branch_id
    and reward.is_starter_reward = true
    and reward.birthday_pool_enabled = true
    and reward.active = true
    and (reward.expires_at is null or reward.expires_at > input_run_at)
  order by encode(extensions.gen_random_bytes(16), 'hex')
  limit 1;
  if selected_reward.id is null then
    return jsonb_build_object('status', 'no_active_birthday_gift');
  end if;

  begin
    insert into public.customer_rewards (
      restaurant_id,
      organization_id,
      branch_id,
      customer_id,
      reward_id,
      status,
      is_starter_reward,
      gift_type,
      birthday_year,
      issued_at,
      valid_from,
      valid_until,
      unlocked_at,
      assignment_metadata
    ) values (
      membership.restaurant_id,
      membership.organization_id,
      membership.branch_id,
      membership.id,
      selected_reward.id,
      'active',
      true,
      'birthday',
      target_year,
      input_run_at,
      ((birthday_date_value - 14)::timestamp at time zone membership.timezone_name),
      ((birthday_date_value + 15)::timestamp at time zone membership.timezone_name),
      input_run_at,
      jsonb_build_object(
        'source', 'birthday_automatic_v1_catch_up',
        'birthday_date', birthday_date_value,
        'birthday_year', target_year
      )
    )
    returning id into assignment_id_value;
  exception when unique_violation then
    select customer_reward.id
    into existing_assignment_id
    from public.customer_rewards customer_reward
    where customer_reward.restaurant_id = membership.restaurant_id
      and customer_reward.customer_id = membership.id
      and customer_reward.gift_type = 'birthday'
      and customer_reward.birthday_year = target_year
    limit 1;
    return jsonb_build_object(
      'status', 'already_assigned',
      'customer_reward_id', existing_assignment_id,
      'birthday_year', target_year
    );
  end;

  perform public.write_audit_event(
    membership.restaurant_id,
    membership.id,
    'system',
    null,
    'BIRTHDAY_GIFT_ASSIGNED',
    'completed',
    'system',
    'customer_rewards',
    assignment_id_value,
    null,
    jsonb_build_object(
      'reward_id', selected_reward.id,
      'birthday_date', birthday_date_value,
      'birthday_year', target_year
    )
  );
  perform public.enqueue_customer_transactional_email(
    membership.restaurant_id,
    membership.id,
    'BIRTHDAY_GIFT_ASSIGNED',
    assignment_id_value::text,
    selected_reward.id,
    assignment_id_value,
    jsonb_build_object(
      'subject', 'Dein Geburtstagsgeschenk wartet auf dich',
      'reward_name', selected_reward.title,
      'restaurant_slug', membership.restaurant_slug
    ),
    input_run_at
  );

  return jsonb_build_object(
    'status', 'assigned',
    'customer_reward_id', assignment_id_value,
    'birthday_date', birthday_date_value,
    'birthday_year', target_year
  );
end;
$$;

revoke all on function public.assign_birthday_gift_if_eligible(uuid, timestamptz)
from public, anon, authenticated;

create or replace function public.issue_birthday_gifts(
  input_run_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  customer_record record;
  assignment_result jsonb;
  issued_count integer := 0;
  skipped_count integer := 0;
begin
  for customer_record in
    select customer.id
    from public.customers customer
    join public.restaurants restaurant on restaurant.id = customer.restaurant_id
    where customer.membership_status = 'active'
      and restaurant.status = 'active'
      and (
        (customer.birthday_day is not null and customer.birthday_month is not null)
        or customer.birthday is not null
      )
  loop
    assignment_result := public.assign_birthday_gift_if_eligible(
      customer_record.id,
      input_run_at
    );
    if assignment_result->>'status' = 'assigned' then
      issued_count := issued_count + 1;
    elsif assignment_result->>'status' in (
      'already_assigned',
      'no_active_birthday_gift'
    ) then
      skipped_count := skipped_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'issued', issued_count,
    'skipped', skipped_count,
    'mode', 'automatic_14_day_window'
  );
end;
$$;

revoke all on function public.issue_birthday_gifts(timestamptz)
from public, anon, authenticated;

create or replace function public.catch_up_birthday_gift_after_membership_activation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assign_birthday_gift_if_eligible(new.customer_id, now());
  return new;
end;
$$;

revoke all on function public.catch_up_birthday_gift_after_membership_activation()
from public, anon, authenticated;

drop trigger if exists customer_account_membership_birthday_gift_catch_up
on public.customer_account_memberships;
create trigger customer_account_membership_birthday_gift_catch_up
after insert on public.customer_account_memberships
for each row
execute function public.catch_up_birthday_gift_after_membership_activation();

create or replace function public.catch_up_birthday_gift_after_customer_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.membership_status = 'active'
    and exists (
      select 1
      from public.customer_account_memberships membership
      where membership.customer_id = new.id
        and membership.restaurant_id = new.restaurant_id
    ) then
    perform public.assign_birthday_gift_if_eligible(new.id, now());
  end if;
  return new;
end;
$$;

revoke all on function public.catch_up_birthday_gift_after_customer_change()
from public, anon, authenticated;

drop trigger if exists customer_birthday_gift_eligibility_change
on public.customers;
create trigger customer_birthday_gift_eligibility_change
after update of membership_status, birthday, birthday_day, birthday_month
on public.customers
for each row
when (
  old.membership_status is distinct from new.membership_status
  or old.birthday is distinct from new.birthday
  or old.birthday_day is distinct from new.birthday_day
  or old.birthday_month is distinct from new.birthday_month
)
execute function public.catch_up_birthday_gift_after_customer_change();

notify pgrst, 'reload schema';
