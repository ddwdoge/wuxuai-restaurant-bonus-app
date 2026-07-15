-- WUXUAI Bonus V1
-- Daily PIN, two collections per local day, one-time welcome/birthday gifts,
-- and a shared 15-minute redemption-code flow.

alter table public.restaurants
  add column if not exists timezone_name text not null default 'Europe/Vienna';

alter table public.points_transactions
  add column if not exists idempotency_key uuid;

create unique index if not exists points_transactions_restaurant_idempotency_idx
on public.points_transactions (restaurant_id, idempotency_key)
where idempotency_key is not null;

create table if not exists public.points_collection_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  idempotency_key uuid not null,
  source text not null check (source in ('customer_portal', 'staff_portal')),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  result_payload jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (restaurant_id, branch_id, customer_id, idempotency_key)
);

alter table public.points_collection_requests enable row level security;

drop policy if exists points_collection_requests_member_select on public.points_collection_requests;
create policy points_collection_requests_member_select
on public.points_collection_requests for select
using (public.is_restaurant_member(restaurant_id));

create index if not exists points_collection_requests_customer_created_idx
on public.points_collection_requests (restaurant_id, branch_id, customer_id, created_at desc);

create or replace function public.ensure_today_restaurant_pin(
  input_restaurant_id uuid,
  input_branch_id uuid default null
)
returns public.restaurant_daily_pins
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  branch_id_value uuid;
  pin_record public.restaurant_daily_pins%rowtype;
  next_pin text;
  local_today date;
  local_day_start timestamptz;
  local_next_day_start timestamptz;
  attempts integer := 0;
begin
  select * into restaurant_record from public.restaurants
  where id = input_restaurant_id and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;

  branch_id_value := coalesce(input_branch_id, restaurant_record.primary_branch_id,
    public.restaurant_primary_branch_id(restaurant_record.id));
  local_today := timezone(restaurant_record.timezone_name, now())::date;
  local_day_start := local_today::timestamp at time zone restaurant_record.timezone_name;
  local_next_day_start := (local_today + 1)::timestamp at time zone restaurant_record.timezone_name;

  select * into pin_record from public.restaurant_daily_pins
  where restaurant_id = restaurant_record.id
    and branch_id is not distinct from branch_id_value
    and valid_date = local_today
  limit 1;
  if pin_record.id is not null then return pin_record; end if;

  loop
    attempts := attempts + 1;
    next_pin := public.generate_daily_pin_code();
    begin
      insert into public.restaurant_daily_pins (
        restaurant_id, branch_id, pin_code, valid_date, valid_from, valid_until
      ) values (
        restaurant_record.id, branch_id_value, next_pin, local_today,
        local_day_start, local_next_day_start
      ) returning * into pin_record;
      return pin_record;
    exception when unique_violation then
      select * into pin_record from public.restaurant_daily_pins
      where restaurant_id = restaurant_record.id
        and branch_id is not distinct from branch_id_value
        and valid_date = local_today
      limit 1;
      if pin_record.id is not null then return pin_record; end if;
      if attempts >= 8 then raise exception 'Tages-PIN konnte nicht erstellt werden.'; end if;
    end;
  end loop;
end;
$$;

alter table public.customer_rewards
  add column if not exists gift_type text,
  add column if not exists birthday_year integer,
  add column if not exists issued_at timestamptz not null default now(),
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz,
  add column if not exists redemption_started_at timestamptz;

update public.customer_rewards
set gift_type = case when is_starter_reward then 'welcome' else 'legacy' end
where gift_type is null;

alter table public.customer_rewards
  alter column gift_type set not null,
  drop constraint if exists customer_rewards_gift_type_check,
  add constraint customer_rewards_gift_type_check
    check (gift_type in ('welcome', 'birthday', 'legacy')),
  drop constraint if exists customer_rewards_status_check,
  add constraint customer_rewards_status_check
    check (status in ('locked', 'active', 'redemption_started', 'redeemed', 'expired', 'cancelled'));

drop index if exists public.customer_rewards_one_starter_reward_idx;
drop index if exists public.customer_rewards_customer_reward_unique_idx;

create table if not exists public.gift_assignment_cleanup_log (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  kept_customer_reward_id uuid not null references public.customer_rewards(id) on delete restrict,
  cancelled_customer_reward_id uuid not null references public.customer_rewards(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (cancelled_customer_reward_id)
);

alter table public.gift_assignment_cleanup_log enable row level security;

drop policy if exists gift_assignment_cleanup_log_member_select on public.gift_assignment_cleanup_log;
create policy gift_assignment_cleanup_log_member_select
on public.gift_assignment_cleanup_log for select
using (public.is_restaurant_member(restaurant_id));

with ranked_welcome_gifts as (
  select
    cr.id,
    cr.restaurant_id,
    cr.branch_id,
    cr.customer_id,
    first_value(cr.id) over (
      partition by cr.restaurant_id,
        coalesce(cr.branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
        cr.customer_id
      order by cr.created_at, cr.id
    ) as kept_id,
    row_number() over (
      partition by cr.restaurant_id,
        coalesce(cr.branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
        cr.customer_id
      order by cr.created_at, cr.id
    ) as row_number
  from public.customer_rewards cr
  where cr.gift_type = 'welcome'
), duplicates as (
  select * from ranked_welcome_gifts where row_number > 1
)
insert into public.gift_assignment_cleanup_log (
  restaurant_id, branch_id, customer_id, kept_customer_reward_id,
  cancelled_customer_reward_id, reason
)
select restaurant_id, branch_id, customer_id, kept_id, id,
  'Doppelte Willkommenszuteilung vor V1-Eindeutigkeitsregel'
from duplicates
on conflict (cancelled_customer_reward_id) do nothing;

update public.customer_rewards cr
set gift_type = 'legacy',
    status = case
      when cr.status in ('locked', 'active', 'redemption_started') then 'cancelled'
      else cr.status
    end
from public.gift_assignment_cleanup_log cleanup
where cleanup.cancelled_customer_reward_id = cr.id
  and cr.gift_type = 'welcome';

create unique index if not exists customer_rewards_one_welcome_gift_idx
on public.customer_rewards (
  restaurant_id,
  coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  customer_id
)
where gift_type = 'welcome';

create unique index if not exists customer_rewards_one_birthday_gift_year_idx
on public.customer_rewards (
  restaurant_id,
  coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  customer_id,
  birthday_year
)
where gift_type = 'birthday';

create or replace function public.set_customer_reward_gift_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.gift_type is null then
    new.gift_type := case when new.is_starter_reward then 'welcome' else 'legacy' end;
  end if;
  return new;
end;
$$;

drop trigger if exists set_customer_reward_gift_type_trigger on public.customer_rewards;
create trigger set_customer_reward_gift_type_trigger
before insert on public.customer_rewards
for each row execute function public.set_customer_reward_gift_type();

create table if not exists public.birthday_gift_job_log (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  birthday_year integer not null,
  result text not null check (result in ('issued', 'no_active_gift', 'already_issued')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (restaurant_id, branch_id, customer_id, birthday_year, result)
);

alter table public.birthday_gift_job_log enable row level security;

drop policy if exists birthday_gift_job_log_member_select on public.birthday_gift_job_log;
create policy birthday_gift_job_log_member_select
on public.birthday_gift_job_log for select
using (public.is_restaurant_member(restaurant_id));

create table if not exists public.redemption_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  redemption_type text not null check (redemption_type in ('welcome_gift', 'birthday_gift', 'points_redemption')),
  source_id uuid not null,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  code_hash text not null,
  status text not null default 'active' check (status in ('pending_confirmation', 'active', 'redeemed', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  expired_at timestamptz,
  deactivated_at timestamptz,
  idempotency_key uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  unique (restaurant_id, idempotency_key)
);

alter table public.redemption_codes enable row level security;

drop policy if exists redemption_codes_member_select on public.redemption_codes;
create policy redemption_codes_member_select
on public.redemption_codes for select
using (public.is_restaurant_member(restaurant_id));

create unique index if not exists redemption_codes_active_code_hash_idx
on public.redemption_codes (code_hash)
where status = 'active';

create unique index if not exists redemption_codes_one_active_reward_idx
on public.redemption_codes (restaurant_id, branch_id, customer_id, redemption_type, reward_id)
where status in ('pending_confirmation', 'active');

create index if not exists redemption_codes_expiry_idx
on public.redemption_codes (status, expires_at);

create table if not exists public.redemption_activation_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete cascade,
  customer_token_hash text not null,
  successful boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.redemption_activation_attempts enable row level security;

drop policy if exists redemption_activation_attempts_member_select on public.redemption_activation_attempts;
create policy redemption_activation_attempts_member_select
on public.redemption_activation_attempts for select
using (restaurant_id is not null and public.is_restaurant_member(restaurant_id));

create index if not exists redemption_activation_attempts_rate_idx
on public.redemption_activation_attempts (customer_token_hash, created_at desc);

alter table public.reward_redemption_events
  add column if not exists status text not null default 'redeemed',
  add column if not exists redemption_code_id uuid references public.redemption_codes(id) on delete set null,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz;

alter table public.reward_redemption_events
  alter column redeemed_at drop not null,
  alter column redeemed_at drop default;

alter table public.reward_redemption_events
  drop constraint if exists reward_redemption_events_status_check,
  add constraint reward_redemption_events_status_check
    check (status in ('started', 'redeemed', 'expired', 'cancelled'));

create or replace function public.generate_numeric_code(input_digits integer)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  random_bytes bytea;
  random_value bigint;
  code_limit bigint;
begin
  if input_digits not between 4 and 9 then
    raise exception 'Ungültige Codelänge.';
  end if;
  code_limit := power(10, input_digits)::bigint;
  -- Seven bytes stay inside signed bigint while retaining far more entropy than
  -- the six-digit output space requires.
  random_bytes := extensions.gen_random_bytes(7);
  random_value := (
    get_byte(random_bytes, 0)::bigint * 281474976710656
    + get_byte(random_bytes, 1)::bigint * 1099511627776
    + get_byte(random_bytes, 2)::bigint * 4294967296
    + get_byte(random_bytes, 3)::bigint * 16777216
    + get_byte(random_bytes, 4)::bigint * 65536
    + get_byte(random_bytes, 5)::bigint * 256
    + get_byte(random_bytes, 6)::bigint
  ) % code_limit;
  return lpad(random_value::text, input_digits, '0');
end;
$$;

create or replace function public.expire_redemption_codes(input_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer := 0;
begin
  with expired as (
    update public.redemption_codes
    set status = 'expired', expired_at = input_now, deactivated_at = input_now
    where status = 'active' and expires_at <= input_now
    returning id, redemption_type, source_id, restaurant_id, customer_id
  ), gift_updates as (
    update public.customer_rewards cr
    set status = 'expired'
    from expired e
    where e.redemption_type in ('welcome_gift', 'birthday_gift')
      and cr.id = e.source_id
      and cr.status = 'redemption_started'
    returning cr.id
  ), point_updates as (
    update public.reward_redemption_events re
    set status = 'expired'
    from expired e
    where e.redemption_type = 'points_redemption'
      and re.id = e.source_id
      and re.status = 'started'
    returning re.id
  )
  select count(*) into expired_count from expired;

  return expired_count;
end;
$$;

create or replace function public.issue_birthday_gifts(input_run_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  membership record;
  local_today date;
  target_year integer;
  birthday_date date;
  selected_reward public.rewards%rowtype;
  assignment_id uuid;
  issued_count integer := 0;
  skipped_count integer := 0;
begin
  for membership in
    select c.*, r.timezone_name, r.organization_id
    from public.customers c
    join public.restaurants r on r.id = c.restaurant_id
    where c.birthday is not null and r.status = 'active'
  loop
    local_today := timezone(membership.timezone_name, input_run_at)::date;
    target_year := extract(year from (local_today + 14))::integer;

    if extract(month from membership.birthday) = 2
      and extract(day from membership.birthday) = 29
      and not (
        target_year % 400 = 0 or (target_year % 4 = 0 and target_year % 100 <> 0)
      ) then
      birthday_date := make_date(target_year, 2, 28);
    else
      birthday_date := make_date(
        target_year,
        extract(month from membership.birthday)::integer,
        extract(day from membership.birthday)::integer
      );
    end if;

    if birthday_date < local_today or birthday_date > local_today + 14 then
      continue;
    end if;

    if exists (
      select 1 from public.customer_rewards cr
      where cr.restaurant_id = membership.restaurant_id
        and cr.branch_id is not distinct from membership.branch_id
        and cr.customer_id = membership.id
        and cr.gift_type = 'birthday'
        and cr.birthday_year = target_year
    ) then
      insert into public.birthday_gift_job_log (
        restaurant_id, organization_id, branch_id, customer_id, birthday_year, result
      ) values (
        membership.restaurant_id, membership.organization_id, membership.branch_id,
        membership.id, target_year, 'already_issued'
      ) on conflict do nothing;
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select r.* into selected_reward
    from public.rewards r
    where r.restaurant_id = membership.restaurant_id
      and r.branch_id is not distinct from membership.branch_id
      and r.is_starter_reward = true
      and r.active = true
      and (r.expires_at is null or r.expires_at > input_run_at)
    order by encode(extensions.gen_random_bytes(16), 'hex')
    limit 1;

    if selected_reward.id is null then
      insert into public.birthday_gift_job_log (
        restaurant_id, organization_id, branch_id, customer_id, birthday_year, result,
        details
      ) values (
        membership.restaurant_id, membership.organization_id, membership.branch_id,
        membership.id, target_year, 'no_active_gift',
        jsonb_build_object('birthday_date', birthday_date)
      ) on conflict do nothing;
      skipped_count := skipped_count + 1;
      continue;
    end if;

    begin
      insert into public.customer_rewards (
        restaurant_id, organization_id, branch_id, customer_id, reward_id,
        status, is_starter_reward, gift_type, birthday_year, issued_at,
        valid_from, valid_until, unlocked_at, assignment_metadata
      ) values (
        membership.restaurant_id, membership.organization_id, membership.branch_id,
        membership.id, selected_reward.id, 'active', true, 'birthday', target_year,
        input_run_at, input_run_at,
        ((birthday_date + 1)::timestamp at time zone membership.timezone_name),
        input_run_at,
        jsonb_build_object(
          'source', 'birthday_job',
          'title', selected_reward.title,
          'category', selected_reward.category,
          'image_url', selected_reward.image_url,
          'birthday_date', birthday_date,
          'birthday_year', target_year,
          'issued_at', input_run_at
        )
      ) returning id into assignment_id;

      insert into public.birthday_gift_job_log (
        restaurant_id, organization_id, branch_id, customer_id, birthday_year,
        result, details
      ) values (
        membership.restaurant_id, membership.organization_id, membership.branch_id,
        membership.id, target_year, 'issued',
        jsonb_build_object('customer_reward_id', assignment_id, 'reward_id', selected_reward.id)
      ) on conflict do nothing;

      insert into public.audit_log (
        restaurant_id, organization_id, branch_id, actor_type, actor_id,
        action, target_table, target_id, metadata
      ) values (
        membership.restaurant_id, membership.organization_id, membership.branch_id,
        'system', null, 'birthday_gift_issued', 'customer_rewards', assignment_id,
        jsonb_build_object('customer_id', membership.id, 'birthday_year', target_year,
          'reward_id', selected_reward.id, 'birthday_date', birthday_date)
      );
      issued_count := issued_count + 1;
    exception when unique_violation then
      skipped_count := skipped_count + 1;
    end;
  end loop;

  return jsonb_build_object('issued', issued_count, 'skipped', skipped_count);
end;
$$;

create or replace function public.collect_bonus_points_v1(
  input_restaurant_slug text,
  input_customer_token text,
  input_amount_tier_key text,
  input_daily_pin text,
  input_device_id text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  request_record public.points_collection_requests%rowtype;
  request_result jsonb;
  token_hash_value text;
  branch_id_value uuid;
begin
  if input_idempotency_key is null then
    raise exception 'Buchungs-ID fehlt.';
  end if;

  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;

  token_hash_value := public.hash_public_token(input_customer_token);
  select c.* into customer_record
  from public.customer_qr_tokens cqt
  join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = token_hash_value
    and cqt.active = true
    and (cqt.expires_at is null or cqt.expires_at > now())
    and c.restaurant_id = restaurant_record.id
  limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;

  branch_id_value := coalesce(customer_record.branch_id, restaurant_record.primary_branch_id,
    public.restaurant_primary_branch_id(restaurant_record.id));

  insert into public.points_collection_requests (
    restaurant_id, organization_id, branch_id, customer_id, idempotency_key, source
  ) values (
    restaurant_record.id, restaurant_record.organization_id, branch_id_value,
    customer_record.id, input_idempotency_key, 'customer_portal'
  ) on conflict do nothing;

  select * into request_record from public.points_collection_requests
  where restaurant_id = restaurant_record.id and branch_id = branch_id_value
    and customer_id = customer_record.id and idempotency_key = input_idempotency_key
  for update;

  if request_record.status = 'completed' then return request_record.result_payload; end if;

  begin
    request_result := public.collect_bonus_points(
      input_restaurant_slug, input_customer_token, input_amount_tier_key,
      input_daily_pin, input_device_id
    );
  exception when others then
    if sqlerrm = 'Du hast heute bereits Punkte gesammelt.' then
      raise exception 'Du hast heute bereits zweimal Punkte gesammelt. Morgen kannst du wieder Punkte sammeln.';
    end if;
    raise;
  end;

  update public.points_collection_requests
  set status = 'completed', result_payload = request_result, completed_at = now()
  where id = request_record.id;

  update public.points_transactions
  set idempotency_key = input_idempotency_key
  where id = (
    select pt.id from public.points_transactions pt
    where pt.restaurant_id = restaurant_record.id and pt.branch_id = branch_id_value
      and pt.customer_id = customer_record.id and pt.type = 'earn'
      and pt.idempotency_key is null
      and pt.created_at >= request_record.created_at
      and coalesce((request_result->>'points_added')::integer, 0) > 0
    order by pt.created_at desc limit 1
  );

  return request_result;
end;
$$;

create or replace function public.apply_staff_daily_pin_loyalty_action_v1(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_daily_pin text,
  input_loyalty_mode text,
  input_points integer,
  input_stamps integer,
  input_reason text,
  input_rule_id uuid,
  input_bill_amount numeric,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  branch_id_value uuid;
  request_record public.points_collection_requests%rowtype;
  request_result jsonb;
begin
  if not public.is_restaurant_member(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  if input_idempotency_key is null then raise exception 'Buchungs-ID fehlt.'; end if;

  select * into restaurant_record from public.restaurants where id = input_restaurant_id and status = 'active';
  select * into customer_record from public.customers
  where id = input_customer_id and restaurant_id = input_restaurant_id;
  if restaurant_record.id is null or customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;
  branch_id_value := coalesce(customer_record.branch_id, restaurant_record.primary_branch_id,
    public.restaurant_primary_branch_id(input_restaurant_id));

  insert into public.points_collection_requests (
    restaurant_id, organization_id, branch_id, customer_id, idempotency_key, source
  ) values (
    input_restaurant_id, restaurant_record.organization_id, branch_id_value,
    input_customer_id, input_idempotency_key, 'staff_portal'
  ) on conflict do nothing;

  select * into request_record from public.points_collection_requests
  where restaurant_id = input_restaurant_id and branch_id = branch_id_value
    and customer_id = input_customer_id and idempotency_key = input_idempotency_key
  for update;
  if request_record.status = 'completed' then return request_record.result_payload; end if;

  begin
    request_result := public.apply_staff_daily_pin_loyalty_action(
      input_restaurant_id, input_customer_id, input_daily_pin, input_loyalty_mode,
      input_points, input_stamps, input_reason, input_rule_id, input_bill_amount
    );
  exception when others then
    if sqlerrm = 'Du hast heute bereits Punkte gesammelt.' then
      raise exception 'Du hast heute bereits zweimal Punkte gesammelt. Morgen kannst du wieder Punkte sammeln.';
    end if;
    raise;
  end;

  update public.points_collection_requests
  set status = 'completed', result_payload = request_result, completed_at = now()
  where id = request_record.id;
  update public.points_transactions
  set idempotency_key = input_idempotency_key
  where id = (
    select pt.id from public.points_transactions pt
    where pt.restaurant_id = input_restaurant_id and pt.branch_id = branch_id_value
      and pt.customer_id = input_customer_id and pt.type = 'earn'
      and pt.idempotency_key is null
      and pt.created_at >= request_record.created_at
      and coalesce((request_result->>'points_added')::integer, 0) > 0
    order by pt.created_at desc limit 1
  );
  return request_result;
end;
$$;

create or replace function public.start_customer_redemption(
  input_customer_token text,
  input_reward_id uuid,
  input_customer_reward_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  token_hash_value text;
  token_record public.customer_qr_tokens%rowtype;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  gift_record public.customer_rewards%rowtype;
  event_id uuid;
  code_record public.redemption_codes%rowtype;
  raw_code text;
  raw_code_hash text;
  branch_id_value uuid;
  redemption_type_value text;
  source_id_value uuid;
  next_points integer;
  next_stamps integer;
  attempt_count integer;
  generation_attempt integer := 0;
begin
  if input_idempotency_key is null then raise exception 'Bestätigungs-ID fehlt.'; end if;
  perform public.expire_redemption_codes(now());
  token_hash_value := public.hash_public_token(input_customer_token);

  select count(*) into attempt_count from public.redemption_activation_attempts
  where customer_token_hash = token_hash_value and created_at > now() - interval '15 minutes';
  if attempt_count >= 10 then raise exception 'Zu viele Versuche. Bitte warte kurz und versuche es später erneut.'; end if;

  select * into token_record from public.customer_qr_tokens
  where token_hash = token_hash_value and active = true
    and (expires_at is null or expires_at > now());
  if token_record.id is null then
    insert into public.redemption_activation_attempts (customer_token_hash, successful)
    values (token_hash_value, false);
    raise exception 'Kundenzugang ist nicht gültig.';
  end if;

  select * into customer_record from public.customers
  where id = token_record.customer_id and restaurant_id = token_record.restaurant_id
    and branch_id is not distinct from token_record.branch_id
  for update;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  branch_id_value := coalesce(customer_record.branch_id, public.restaurant_primary_branch_id(customer_record.restaurant_id));

  select * into code_record from public.redemption_codes
  where restaurant_id = customer_record.restaurant_id and idempotency_key = input_idempotency_key
  for update;
  if code_record.id is not null then
    return jsonb_build_object(
      'redemption_code', null, 'already_active', code_record.status = 'active',
      'status', code_record.status, 'expires_at', code_record.expires_at,
      'points_balance', customer_record.points_balance,
      'stamp_balance', customer_record.stamp_balance,
      'redemption_type', code_record.redemption_type,
      'redemption_id', code_record.source_id
    );
  end if;

  select * into reward_record from public.rewards
  where id = input_reward_id and restaurant_id = customer_record.restaurant_id
    and branch_id is not distinct from branch_id_value and active = true
    and (expires_at is null or expires_at > now());
  if reward_record.id is null then raise exception 'Diese Punkteeinlösung ist nicht mehr verfügbar.'; end if;

  if reward_record.is_starter_reward then
    select * into gift_record from public.customer_rewards
    where restaurant_id = customer_record.restaurant_id
      and branch_id is not distinct from branch_id_value
      and customer_id = customer_record.id and reward_id = reward_record.id
      and (input_customer_reward_id is null or id = input_customer_reward_id)
      and gift_type in ('welcome', 'birthday')
      and status = 'active'
      and (valid_from is null or valid_from <= now())
      and (valid_until is null or valid_until > now())
    order by case gift_type when 'birthday' then 0 else 1 end, issued_at desc
    limit 1 for update;
    if gift_record.id is null then raise exception 'Dieses Geschenk ist nicht mehr verfügbar.'; end if;
    redemption_type_value := case gift_record.gift_type when 'birthday' then 'birthday_gift' else 'welcome_gift' end;
    source_id_value := gift_record.id;
    update public.customer_rewards set status = 'redemption_started', redemption_started_at = now()
    where id = gift_record.id and status = 'active';
    next_points := customer_record.points_balance;
    next_stamps := customer_record.stamp_balance;
  else
    update public.customers
    set points_balance = points_balance - reward_record.required_points,
        stamp_balance = stamp_balance - reward_record.required_stamps
    where id = customer_record.id and restaurant_id = customer_record.restaurant_id
      and points_balance >= reward_record.required_points
      and stamp_balance >= reward_record.required_stamps
    returning points_balance, stamp_balance into next_points, next_stamps;
    if next_points is null then raise exception 'Du hast noch nicht genug Punkte.'; end if;

    insert into public.reward_redemption_events (
      restaurant_id, organization_id, branch_id, customer_id, reward_id,
      points_spent, stamps_spent, status, metadata
    ) values (
      customer_record.restaurant_id, customer_record.organization_id, branch_id_value,
      customer_record.id, reward_record.id, reward_record.required_points,
      reward_record.required_stamps, 'started',
      jsonb_build_object('customer_confirmation', true, 'idempotency_key', input_idempotency_key)
    ) returning id into event_id;
    source_id_value := event_id;
    redemption_type_value := 'points_redemption';

    if reward_record.required_points > 0 then
      insert into public.points_transactions (
        restaurant_id, organization_id, branch_id, customer_id, type, points,
        reason, idempotency_key
      ) values (
        customer_record.restaurant_id, customer_record.organization_id, branch_id_value,
        customer_record.id, 'redeem', -reward_record.required_points,
        'Punkteeinlösung reserviert', input_idempotency_key
      );
    end if;
  end if;

  loop
    generation_attempt := generation_attempt + 1;
    raw_code := public.generate_numeric_code(6);
    raw_code_hash := encode(extensions.digest(raw_code, 'sha256'), 'hex');
    begin
      insert into public.redemption_codes (
        restaurant_id, organization_id, branch_id, customer_id, redemption_type,
        source_id, reward_id, code_hash, status, activated_at, expires_at,
        idempotency_key, metadata
      ) values (
        customer_record.restaurant_id, customer_record.organization_id, branch_id_value,
        customer_record.id, redemption_type_value, source_id_value, reward_record.id,
        raw_code_hash, 'active', now(), now() + interval '15 minutes',
        input_idempotency_key,
        jsonb_build_object('customer_confirmed', true, 'title', reward_record.title)
      ) returning * into code_record;
      exit;
    exception when unique_violation then
      if generation_attempt >= 12 then raise exception 'Einlösecode konnte nicht erstellt werden.'; end if;
    end;
  end loop;

  if redemption_type_value = 'points_redemption' then
    update public.reward_redemption_events set redemption_code_id = code_record.id
    where id = source_id_value;
  end if;

  insert into public.redemption_activation_attempts (
    restaurant_id, branch_id, customer_id, customer_token_hash, successful
  ) values (
    customer_record.restaurant_id, branch_id_value, customer_record.id, token_hash_value, true
  );

  insert into public.audit_log (
    restaurant_id, organization_id, branch_id, actor_type, actor_id, action,
    target_table, target_id, metadata
  ) values (
    customer_record.restaurant_id, customer_record.organization_id, branch_id_value,
    'customer', customer_record.id, 'customer_redemption_started',
    'redemption_codes', code_record.id,
    jsonb_build_object('redemption_type', redemption_type_value, 'source_id', source_id_value,
      'reward_id', reward_record.id, 'expires_at', code_record.expires_at)
  );

  return jsonb_build_object(
    'redemption_code', raw_code, 'already_active', false, 'status', 'active',
    'expires_at', code_record.expires_at, 'points_balance', next_points,
    'stamp_balance', next_stamps, 'redemption_type', redemption_type_value,
    'redemption_id', source_id_value, 'points_spent', reward_record.required_points,
    'stamps_spent', reward_record.required_stamps
  );
end;
$$;

create or replace function public.consume_redemption_code(
  input_restaurant_id uuid,
  input_code text,
  input_staff_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code_record public.redemption_codes%rowtype;
  staff_record public.staff_members%rowtype;
  code_hash_value text;
  reward_title text;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    if nullif(trim(coalesce(input_staff_session_token, '')), '') is null then
      raise exception 'Nicht berechtigt.';
    end if;
    staff_record := public.get_staff_from_session(input_restaurant_id, input_staff_session_token);
    if staff_record.id is null then raise exception 'Mitarbeitersitzung ist nicht gültig.'; end if;
  end if;

  if trim(coalesce(input_code, '')) !~ '^[0-9]{6}$' then raise exception 'Einlösecode ist nicht gültig.'; end if;
  perform public.expire_redemption_codes(now());
  code_hash_value := encode(extensions.digest(trim(input_code), 'sha256'), 'hex');

  select * into code_record from public.redemption_codes
  where restaurant_id = input_restaurant_id and code_hash = code_hash_value
  order by case status when 'active' then 0 when 'redeemed' then 1 else 2 end,
    created_at desc
  limit 1
  for update;
  if code_record.id is null then raise exception 'Einlösecode ist nicht gültig.'; end if;
  if code_record.status = 'expired' or code_record.expires_at <= now() then raise exception 'Einlösecode ist abgelaufen.'; end if;
  if code_record.status = 'redeemed' then raise exception 'Einlösecode wurde bereits verwendet.'; end if;
  if code_record.status <> 'active' then raise exception 'Einlösecode ist nicht mehr verfügbar.'; end if;

  update public.redemption_codes
  set status = 'redeemed', redeemed_at = now(), deactivated_at = now()
  where id = code_record.id and status = 'active';

  if code_record.redemption_type = 'points_redemption' then
    update public.reward_redemption_events
    set status = 'redeemed', completed_at = now(), redeemed_at = now()
    where id = code_record.source_id and status = 'started';
  else
    update public.customer_rewards
    set status = 'redeemed', redeemed_at = now(), staff_member_id = staff_record.id
    where id = code_record.source_id and status = 'redemption_started';
  end if;

  select title into reward_title from public.rewards where id = code_record.reward_id;
  insert into public.audit_log (
    restaurant_id, organization_id, branch_id, actor_type, actor_id, action,
    target_table, target_id, metadata
  ) values (
    code_record.restaurant_id, code_record.organization_id, code_record.branch_id,
    case when staff_record.id is null then 'admin' else 'staff' end,
    coalesce(staff_record.id, auth.uid()), 'redemption_code_consumed',
    'redemption_codes', code_record.id,
    jsonb_build_object('redemption_type', code_record.redemption_type,
      'source_id', code_record.source_id, 'reward_id', code_record.reward_id)
  );

  return jsonb_build_object('success', true, 'redemption_type', code_record.redemption_type,
    'title', reward_title, 'redeemed_at', now());
end;
$$;

-- Add the gift metadata to the public portal without exposing customer rows directly.
create or replace function public.get_customer_gift_metadata(input_customer_token text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'reward_id', cr.reward_id,
    'assignment_id', cr.id,
    'gift_type', cr.gift_type,
    'status', cr.status,
    'valid_from', cr.valid_from,
    'valid_until', cr.valid_until,
    'birthday_year', cr.birthday_year
  )), '[]'::jsonb)
  from public.customer_qr_tokens cqt
  join public.customer_rewards cr
    on cr.restaurant_id = cqt.restaurant_id and cr.customer_id = cqt.customer_id
    and cr.branch_id is not distinct from cqt.branch_id
  where cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true and (cqt.expires_at is null or cqt.expires_at > now())
    and cr.gift_type in ('welcome', 'birthday')
    and cr.status in ('locked', 'active', 'redemption_started')
    and (cr.valid_until is null or cr.valid_until > now());
$$;

revoke execute on function public.generate_numeric_code(integer) from public, anon, authenticated;
revoke execute on function public.expire_redemption_codes(timestamptz) from public, anon, authenticated;
revoke execute on function public.issue_birthday_gifts(timestamptz) from public, anon, authenticated;

revoke execute on function public.collect_bonus_points(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.collect_bonus_points(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.collect_bonus_points(text, text, text) from public, anon, authenticated;
revoke execute on function public.collect_bonus_points_v1(text, text, text, text, text, uuid) from public;
grant execute on function public.collect_bonus_points_v1(text, text, text, text, text, uuid) to anon, authenticated;

revoke execute on function public.apply_staff_daily_pin_loyalty_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.apply_loyalty_staff_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.apply_loyalty_staff_session_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric) from public, anon, authenticated;
revoke execute on function public.apply_staff_daily_pin_loyalty_action_v1(uuid, uuid, text, text, integer, integer, text, uuid, numeric, uuid) from public, anon;
grant execute on function public.apply_staff_daily_pin_loyalty_action_v1(uuid, uuid, text, text, integer, integer, text, uuid, numeric, uuid) to authenticated;

revoke execute on function public.redeem_customer_reward(text, uuid) from public, anon, authenticated;
revoke execute on function public.redeem_reward(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.redeem_reward_with_staff_session(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.create_redemption_code(text, uuid) from public, anon, authenticated;
revoke execute on function public.redeem_reward_with_pin(text, uuid, text, text) from public, anon, authenticated;

revoke execute on function public.start_customer_redemption(text, uuid, uuid, uuid) from public;
grant execute on function public.start_customer_redemption(text, uuid, uuid, uuid) to anon, authenticated;

revoke execute on function public.consume_redemption_code(uuid, text, text) from public;
grant execute on function public.consume_redemption_code(uuid, text, text) to anon, authenticated;

revoke execute on function public.get_customer_gift_metadata(text) from public;
grant execute on function public.get_customer_gift_metadata(text) to anon, authenticated;

-- Supabase Cron runs this idempotent job every day. A missed run is caught up
-- because the function considers birthdays from today through the next 14 days.
create extension if not exists pg_cron;

do $$
declare
  existing_job bigint;
  expiry_job bigint;
begin
  select jobid into existing_job from cron.job
  where jobname = 'wuxuai-v1-birthday-gifts-daily' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'wuxuai-v1-birthday-gifts-daily',
    '15 2 * * *',
    'select public.issue_birthday_gifts(now());'
  );

  select jobid into expiry_job from cron.job
  where jobname = 'wuxuai-v1-expire-redemption-codes' limit 1;
  if expiry_job is not null then perform cron.unschedule(expiry_job); end if;
  perform cron.schedule(
    'wuxuai-v1-expire-redemption-codes',
    '* * * * *',
    'select public.expire_redemption_codes(now());'
  );
end;
$$;

notify pgrst, 'reload schema';
