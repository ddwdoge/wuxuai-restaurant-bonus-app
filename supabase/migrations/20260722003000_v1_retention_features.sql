-- V1 retention features: expiry reminders, opt-in push subscriptions,
-- birthday gift draw from the welcome pool, and fixed 2x/30-day referrals.

alter table public.customers
  add column if not exists birthday_day smallint,
  add column if not exists birthday_month smallint,
  add column if not exists birthday_updated_at timestamptz;

update public.customers
set birthday_day = extract(day from birthday)::smallint,
    birthday_month = extract(month from birthday)::smallint
where birthday is not null
  and (birthday_day is null or birthday_month is null);

alter table public.customers
  drop constraint if exists customers_birthday_day_check,
  add constraint customers_birthday_day_check check (birthday_day between 1 and 31),
  drop constraint if exists customers_birthday_month_check,
  add constraint customers_birthday_month_check check (birthday_month between 1 and 12),
  drop constraint if exists customers_birthday_pair_check,
  add constraint customers_birthday_pair_check check (
    (birthday_day is null and birthday_month is null)
    or (birthday_day is not null and birthday_month is not null)
  );

create or replace function public.sync_customer_birthday_parts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.birthday is not null
     and (new.birthday_day is null or new.birthday_month is null
       or tg_op = 'INSERT' or new.birthday is distinct from old.birthday) then
    new.birthday_day := extract(day from new.birthday)::smallint;
    new.birthday_month := extract(month from new.birthday)::smallint;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_customer_birthday_parts_trigger on public.customers;
create trigger sync_customer_birthday_parts_trigger
before insert or update of birthday on public.customers
for each row execute function public.sync_customer_birthday_parts();

alter table public.rewards
  add column if not exists birthday_pool_enabled boolean not null default false;

-- Preserve the previous active birthday pool after switching from the automatic
-- job to an explicit customer draw. Owners can narrow the pool afterwards.
update public.rewards
set birthday_pool_enabled = true
where is_starter_reward = true and active = true;

create table if not exists public.customer_push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  endpoint_hash text not null,
  subscription jsonb not null,
  user_agent text,
  active boolean not null default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, customer_id, endpoint_hash)
);

alter table public.customer_push_subscriptions enable row level security;

create index if not exists customer_push_subscriptions_delivery_idx
on public.customer_push_subscriptions (active, restaurant_id, customer_id)
where active = true;

create table if not exists public.expiry_reminders (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete cascade,
  customer_reward_id uuid references public.customer_rewards(id) on delete cascade,
  reminder_stage smallint not null check (reminder_stage in (7, 3, 1, 0)),
  expires_at timestamptz not null,
  status text not null default 'created' check (status in ('created', 'displayed', 'opened', 'expired')),
  push_status text not null default 'pending' check (push_status in ('pending', 'sent', 'failed', 'not_subscribed')),
  displayed_at timestamptz,
  opened_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.expiry_reminders enable row level security;

create unique index if not exists expiry_reminders_unique_stage_idx
on public.expiry_reminders (
  restaurant_id,
  customer_id,
  reward_id,
  coalesce(customer_reward_id, '00000000-0000-0000-0000-000000000000'::uuid),
  reminder_stage,
  expires_at
);

create index if not exists expiry_reminders_push_queue_idx
on public.expiry_reminders (push_status, created_at)
where push_status = 'pending';

create or replace function public.v1_birthday_date(
  input_day integer,
  input_month integer,
  input_year integer
)
returns date
language plpgsql
immutable
set search_path = public
as $$
begin
  if input_month = 2 and input_day = 29
     and not (input_year % 400 = 0 or (input_year % 4 = 0 and input_year % 100 <> 0)) then
    return make_date(input_year, 2, 28);
  end if;
  return make_date(input_year, input_month, input_day);
exception when datetime_field_overflow then
  return null;
end;
$$;

create or replace function public.create_expiry_reminders(input_run_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
  reminder_record record;
begin
  update public.expiry_reminders
  set status = 'expired'
  where status in ('created', 'displayed', 'opened') and expires_at <= input_run_at;

  for reminder_record in
    with eligible as (
      select cr.restaurant_id, cr.organization_id, cr.branch_id, cr.customer_id,
        cr.reward_id, cr.id as customer_reward_id, cr.valid_until as expires_at,
        r.timezone_name
      from public.customer_rewards cr
      join public.restaurants r on r.id = cr.restaurant_id
      join public.rewards rw on rw.id = cr.reward_id and rw.restaurant_id = cr.restaurant_id
      where cr.status in ('active', 'redemption_started')
        and cr.valid_until is not null and cr.valid_until > input_run_at
        and rw.active = true
      union all
      select c.restaurant_id, c.organization_id, c.branch_id, c.id,
        rw.id, null::uuid, rw.expires_at, r.timezone_name
      from public.customers c
      join public.restaurants r on r.id = c.restaurant_id
      join public.rewards rw on rw.restaurant_id = c.restaurant_id
        and rw.branch_id is not distinct from c.branch_id
      where rw.active = true and rw.is_starter_reward = false
        and rw.expires_at is not null and rw.expires_at > input_run_at
    )
    select eligible.*,
      (timezone(eligible.timezone_name, eligible.expires_at)::date
       - timezone(eligible.timezone_name, input_run_at)::date)::integer as stage
    from eligible
    where (timezone(eligible.timezone_name, eligible.expires_at)::date
       - timezone(eligible.timezone_name, input_run_at)::date)::integer in (7, 3, 1, 0)
  loop
    insert into public.expiry_reminders (
      restaurant_id, organization_id, branch_id, customer_id, reward_id,
      customer_reward_id, reminder_stage, expires_at
    ) values (
      reminder_record.restaurant_id, reminder_record.organization_id,
      reminder_record.branch_id, reminder_record.customer_id,
      reminder_record.reward_id, reminder_record.customer_reward_id,
      reminder_record.stage, reminder_record.expires_at
    ) on conflict do nothing;

    if found then
      inserted_count := inserted_count + 1;
      perform public.write_audit_event(
        reminder_record.restaurant_id, reminder_record.customer_id, 'system', null,
        'EXPIRY_REMINDER_CREATED', 'success', 'retention_job', 'expiry_reminders',
        null, null,
        jsonb_build_object('reward_id', reminder_record.reward_id,
          'reminder_stage', reminder_record.stage)
      );
    end if;
  end loop;

  return jsonb_build_object('created', inserted_count);
end;
$$;

create or replace function public.get_customer_retention_status(
  input_restaurant_slug text,
  input_customer_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  boost_record public.customer_bonus_boosts%rowtype;
  birthday_candidate date;
  birthday_year_value integer;
  local_today date;
  existing_gift jsonb;
  reminders jsonb := '[]'::jsonb;
  referral_count integer := 0;
begin
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;

  select c.* into customer_record
  from public.customer_qr_tokens cqt
  join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true and (cqt.expires_at is null or cqt.expires_at > now())
    and c.restaurant_id = restaurant_record.id
  limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;

  perform public.create_expiry_reminders(now());
  local_today := timezone(restaurant_record.timezone_name, now())::date;

  if customer_record.birthday_day is not null and customer_record.birthday_month is not null then
    select candidate into birthday_candidate
    from (
      select public.v1_birthday_date(customer_record.birthday_day, customer_record.birthday_month,
        extract(year from local_today)::integer + offset_value) as candidate
      from generate_series(-1, 1) as offset_value
    ) candidates
    where local_today between candidate - 3 and candidate + 7
    order by abs(candidate - local_today)
    limit 1;
    birthday_year_value := extract(year from birthday_candidate)::integer;
  end if;

  if birthday_year_value is not null then
    select jsonb_build_object(
      'assignment_id', cr.id, 'reward_id', rw.id, 'title', rw.title,
      'description', rw.description, 'category', rw.category,
      'image_url', rw.image_url, 'status', cr.status,
      'valid_until', cr.valid_until, 'birthday_year', cr.birthday_year
    ) into existing_gift
    from public.customer_rewards cr
    join public.rewards rw on rw.id = cr.reward_id
    where cr.restaurant_id = restaurant_record.id
      and cr.branch_id is not distinct from customer_record.branch_id
      and cr.customer_id = customer_record.id
      and cr.gift_type = 'birthday' and cr.birthday_year = birthday_year_value
    limit 1;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', er.id, 'reward_id', er.reward_id,
    'customer_reward_id', er.customer_reward_id,
    'title', rw.title, 'expires_at', er.expires_at,
    'remaining_days', er.reminder_stage, 'status', er.status
  ) order by er.expires_at), '[]'::jsonb)
  into reminders
  from public.expiry_reminders er
  join public.rewards rw on rw.id = er.reward_id
  where er.restaurant_id = restaurant_record.id
    and er.customer_id = customer_record.id
    and er.status <> 'expired' and er.expires_at > now();

  select count(*) into referral_count from public.referrals
  where restaurant_id = restaurant_record.id
    and referrer_customer_id = customer_record.id and status = 'activated';

  select * into boost_record from public.customer_bonus_boosts
  where restaurant_id = restaurant_record.id and customer_id = customer_record.id
    and status = 'active' and active_from <= now() and active_until > now()
  order by active_until desc limit 1;

  return jsonb_build_object(
    'reminders', reminders,
    'birthday', jsonb_build_object(
      'day', customer_record.birthday_day,
      'month', customer_record.birthday_month,
      'can_update', customer_record.birthday_updated_at is null
        or customer_record.birthday_updated_at <= now() - interval '365 days',
      'eligible', birthday_candidate is not null,
      'birthday_year', birthday_year_value,
      'gift', existing_gift
    ),
    'referral', jsonb_build_object(
      'successful_referrals', referral_count,
      'boost_multiplier', 2,
      'boost_duration_days', 30,
      'active_until', boost_record.active_until
    ),
    'push', jsonb_build_object(
      'subscribed', exists(select 1 from public.customer_push_subscriptions cps
        where cps.restaurant_id = restaurant_record.id
          and cps.customer_id = customer_record.id and cps.active = true)
    )
  );
end;
$$;

create or replace function public.update_customer_birthday(
  input_restaurant_slug text,
  input_customer_token text,
  input_day integer,
  input_month integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
begin
  if public.v1_birthday_date(input_day, input_month, 2024) is null then
    raise exception 'Bitte gib einen gültigen Geburtstag ein.';
  end if;
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  select c.* into customer_record
  from public.customer_qr_tokens cqt join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true and (cqt.expires_at is null or cqt.expires_at > now())
  limit 1 for update of c;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  if customer_record.birthday_day = input_day and customer_record.birthday_month = input_month then
    return jsonb_build_object('day', input_day, 'month', input_month, 'changed', false);
  end if;
  if customer_record.birthday_updated_at is not null
     and customer_record.birthday_updated_at > now() - interval '365 days' then
    raise exception 'Dein Geburtstag kann derzeit nicht erneut geändert werden.';
  end if;
  update public.customers set birthday_day = input_day, birthday_month = input_month,
    birthday_updated_at = now() where id = customer_record.id;
  perform public.write_audit_event(restaurant_record.id, customer_record.id, 'customer',
    customer_record.id, 'BIRTHDAY_UPDATED', 'success', 'customer_portal', 'customers',
    customer_record.id, null, '{}'::jsonb);
  return jsonb_build_object('day', input_day, 'month', input_month, 'changed', true);
end;
$$;

create or replace function public.draw_customer_birthday_gift(
  input_restaurant_slug text,
  input_customer_token text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  selected_reward public.rewards%rowtype;
  existing_assignment public.customer_rewards%rowtype;
  birthday_candidate date;
  birthday_year_value integer;
  local_today date;
begin
  if input_idempotency_key is null then raise exception 'Anfrage-ID fehlt.'; end if;
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  select c.* into customer_record
  from public.customer_qr_tokens cqt join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true and (cqt.expires_at is null or cqt.expires_at > now())
  limit 1 for update of c;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  if customer_record.birthday_day is null or customer_record.birthday_month is null then
    raise exception 'Bitte speichere zuerst deinen Geburtstag.';
  end if;
  local_today := timezone(restaurant_record.timezone_name, now())::date;
  select candidate into birthday_candidate
  from (
    select public.v1_birthday_date(customer_record.birthday_day, customer_record.birthday_month,
      extract(year from local_today)::integer + offset_value) as candidate
    from generate_series(-1, 1) as offset_value
  ) candidates
  where local_today between candidate - 3 and candidate + 7
  order by abs(candidate - local_today) limit 1;
  if birthday_candidate is null then
    perform public.write_audit_event(restaurant_record.id, customer_record.id, 'customer',
      customer_record.id, 'BIRTHDAY_GIFT_DRAW_BLOCKED', 'blocked', 'customer_portal',
      'customer_rewards', null, input_idempotency_key,
      jsonb_build_object('reason', 'outside_birthday_window'));
    raise exception 'Deine Geburtstagsüberraschung ist derzeit nicht verfügbar.';
  end if;
  birthday_year_value := extract(year from birthday_candidate)::integer;
  select * into existing_assignment from public.customer_rewards
  where restaurant_id = restaurant_record.id
    and branch_id is not distinct from customer_record.branch_id
    and customer_id = customer_record.id and gift_type = 'birthday'
    and birthday_year = birthday_year_value limit 1;
  if existing_assignment.id is not null then
    select * into selected_reward from public.rewards where id = existing_assignment.reward_id;
    return jsonb_build_object('already_drawn', true, 'assignment_id', existing_assignment.id,
      'reward_id', selected_reward.id, 'title', selected_reward.title,
      'description', selected_reward.description, 'category', selected_reward.category,
      'image_url', selected_reward.image_url, 'status', existing_assignment.status,
      'valid_until', existing_assignment.valid_until);
  end if;
  perform public.write_audit_event(restaurant_record.id, customer_record.id, 'customer',
    customer_record.id, 'BIRTHDAY_GIFT_DRAW_STARTED', 'success', 'customer_portal',
    'customers', customer_record.id, input_idempotency_key,
    jsonb_build_object('birthday_year', birthday_year_value));
  select * into selected_reward from public.rewards
  where restaurant_id = restaurant_record.id
    and branch_id is not distinct from customer_record.branch_id
    and is_starter_reward = true and birthday_pool_enabled = true and active = true
    and (expires_at is null or expires_at > now())
  order by encode(extensions.gen_random_bytes(16), 'hex') limit 1;
  if selected_reward.id is null then
    perform public.write_audit_event(restaurant_record.id, customer_record.id, 'customer',
      customer_record.id, 'BIRTHDAY_GIFT_DRAW_BLOCKED', 'blocked', 'customer_portal',
      'customer_rewards', null, input_idempotency_key,
      jsonb_build_object('reason', 'no_available_gift'));
    raise exception 'Aktuell ist keine Geburtstagsüberraschung verfügbar.';
  end if;
  begin
    insert into public.customer_rewards (
      restaurant_id, organization_id, branch_id, customer_id, reward_id,
      status, is_starter_reward, gift_type, birthday_year, issued_at,
      valid_from, valid_until, unlocked_at, assignment_metadata
    ) values (
      restaurant_record.id, restaurant_record.organization_id, customer_record.branch_id,
      customer_record.id, selected_reward.id, 'active', true, 'birthday',
      birthday_year_value, now(), now(),
      ((birthday_candidate + 8)::timestamp at time zone restaurant_record.timezone_name),
      now(), jsonb_build_object('source', 'birthday_customer_draw',
        'request_id', input_idempotency_key)
    ) returning * into existing_assignment;
  exception when unique_violation then
    select * into existing_assignment from public.customer_rewards
    where restaurant_id = restaurant_record.id
      and branch_id is not distinct from customer_record.branch_id
      and customer_id = customer_record.id and gift_type = 'birthday'
      and birthday_year = birthday_year_value limit 1;
    select * into selected_reward from public.rewards where id = existing_assignment.reward_id;
    return jsonb_build_object('already_drawn', true, 'assignment_id', existing_assignment.id,
      'reward_id', selected_reward.id, 'title', selected_reward.title,
      'description', selected_reward.description, 'category', selected_reward.category,
      'image_url', selected_reward.image_url, 'status', existing_assignment.status,
      'valid_until', existing_assignment.valid_until);
  end;
  perform public.write_audit_event(restaurant_record.id, customer_record.id, 'customer',
    customer_record.id, 'BIRTHDAY_GIFT_DRAWN', 'success', 'customer_portal',
    'customer_rewards', existing_assignment.id, input_idempotency_key,
    jsonb_build_object('reward_id', selected_reward.id,
      'birthday_year', birthday_year_value));
  return jsonb_build_object('already_drawn', false, 'assignment_id', existing_assignment.id,
    'reward_id', selected_reward.id, 'title', selected_reward.title,
    'description', selected_reward.description, 'category', selected_reward.category,
    'image_url', selected_reward.image_url, 'status', existing_assignment.status,
    'valid_until', existing_assignment.valid_until);
end;
$$;

create or replace function public.save_customer_push_subscription(
  input_restaurant_slug text,
  input_customer_token text,
  input_subscription jsonb,
  input_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  endpoint_value text;
  endpoint_hash_value text;
begin
  endpoint_value := nullif(trim(input_subscription->>'endpoint'), '');
  if endpoint_value is null or input_subscription->'keys'->>'p256dh' is null
     or input_subscription->'keys'->>'auth' is null then
    raise exception 'Push-Anmeldung ist nicht gültig.';
  end if;
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  select c.* into customer_record
  from public.customer_qr_tokens cqt join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true and (cqt.expires_at is null or cqt.expires_at > now())
  limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  endpoint_hash_value := encode(extensions.digest(endpoint_value, 'sha256'), 'hex');
  insert into public.customer_push_subscriptions (
    restaurant_id, organization_id, branch_id, customer_id, endpoint_hash,
    subscription, user_agent, active, disabled_at, updated_at
  ) values (
    restaurant_record.id, restaurant_record.organization_id, customer_record.branch_id,
    customer_record.id, endpoint_hash_value, input_subscription,
    left(input_user_agent, 500), true, null, now()
  ) on conflict (restaurant_id, customer_id, endpoint_hash) do update
    set subscription = excluded.subscription, user_agent = excluded.user_agent,
      active = true, disabled_at = null, updated_at = now();
  return jsonb_build_object('subscribed', true);
end;
$$;

create or replace function public.disable_customer_push_subscriptions(
  input_restaurant_slug text,
  input_customer_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
begin
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  select c.* into customer_record
  from public.customer_qr_tokens cqt join public.customers c on c.id = cqt.customer_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true and (cqt.expires_at is null or cqt.expires_at > now())
  limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  update public.customer_push_subscriptions
  set active = false, disabled_at = now(), updated_at = now()
  where restaurant_id = restaurant_record.id and customer_id = customer_record.id
    and active = true;
  return jsonb_build_object('subscribed', false);
end;
$$;

create or replace function public.mark_expiry_reminder(
  input_customer_token text,
  input_reminder_id uuid,
  input_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_record public.expiry_reminders%rowtype;
begin
  select er.* into reminder_record
  from public.expiry_reminders er
  join public.customer_qr_tokens cqt on cqt.restaurant_id = er.restaurant_id
    and cqt.customer_id = er.customer_id and cqt.branch_id is not distinct from er.branch_id
  where er.id = input_reminder_id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true and (cqt.expires_at is null or cqt.expires_at > now())
  for update of er;
  if reminder_record.id is null then raise exception 'Erinnerung wurde nicht gefunden.'; end if;
  if input_action = 'displayed' and reminder_record.displayed_at is null then
    update public.expiry_reminders set status = 'displayed', displayed_at = now()
    where id = reminder_record.id;
    perform public.write_audit_event(reminder_record.restaurant_id, reminder_record.customer_id,
      'customer', reminder_record.customer_id, 'EXPIRY_REMINDER_DISPLAYED', 'success',
      'customer_portal', 'expiry_reminders', reminder_record.id, null,
      jsonb_build_object('reminder_stage', reminder_record.reminder_stage,
        'reward_id', reminder_record.reward_id));
  elsif input_action = 'opened' and reminder_record.opened_at is null then
    update public.expiry_reminders set status = 'opened', opened_at = now()
    where id = reminder_record.id;
    perform public.write_audit_event(reminder_record.restaurant_id, reminder_record.customer_id,
      'customer', reminder_record.customer_id, 'EXPIRY_REMINDER_OPENED', 'success',
      'customer_portal', 'expiry_reminders', reminder_record.id, null,
      jsonb_build_object('reminder_stage', reminder_record.reminder_stage,
        'reward_id', reminder_record.reward_id));
  end if;
  return jsonb_build_object('success', true);
end;
$$;

-- The customer now explicitly draws the birthday gift. Disable the old job
-- without dropping its historical function or log table.
do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job
  where jobname = 'wuxuai-v1-birthday-gifts-daily' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end;
$$;

create or replace function public.issue_birthday_gifts(input_run_at timestamptz default now())
returns jsonb
language sql
security definer
set search_path = public
as $$ select jsonb_build_object('issued', 0, 'skipped', 0, 'mode', 'customer_draw'); $$;

-- V1 product constants. Inputs stay in the helper signature for compatibility,
-- while the stored boost is always exactly 2x for 30 days.
update public.loyalty_settings
set referral_boost_multiplier = 2, referral_boost_duration_days = 30;

alter table public.loyalty_settings
  drop constraint if exists loyalty_settings_referral_boost_multiplier_check,
  add constraint loyalty_settings_referral_boost_multiplier_check
    check (referral_boost_multiplier = 2),
  drop constraint if exists loyalty_settings_referral_boost_duration_days_check,
  add constraint loyalty_settings_referral_boost_duration_days_check
    check (referral_boost_duration_days = 30);

create or replace function public.upsert_referral_boost(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_referral_id uuid,
  input_multiplier numeric,
  input_duration_days integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  boost_record public.customer_bonus_boosts%rowtype;
  boost_id uuid;
  extension_base timestamptz;
  event_type_value text;
begin
  perform pg_advisory_xact_lock(hashtextextended(input_restaurant_id::text || ':' || input_customer_id::text, 0));
  select * into boost_record from public.customer_bonus_boosts
  where restaurant_id = input_restaurant_id and customer_id = input_customer_id
    and source = 'referral' and status = 'active' and active_until > now()
  order by active_until desc limit 1 for update;
  if boost_record.id is null then
    insert into public.customer_bonus_boosts (
      restaurant_id, customer_id, multiplier, active_from, active_until,
      source, referral_id, status
    ) values (
      input_restaurant_id, input_customer_id, 2, now(), now() + interval '30 days',
      'referral', input_referral_id, 'active'
    ) returning id into boost_id;
    event_type_value := 'BONUS_BOOST_ACTIVATED';
  else
    extension_base := greatest(boost_record.active_until, now());
    update public.customer_bonus_boosts
    set active_until = extension_base + interval '30 days', multiplier = 2,
      referral_id = input_referral_id
    where id = boost_record.id returning id into boost_id;
    event_type_value := 'BONUS_BOOST_EXTENDED';
  end if;
  perform public.write_audit_event(input_restaurant_id, input_customer_id, 'system', null,
    event_type_value, 'success', 'referral', 'customer_bonus_boosts', boost_id,
    null, jsonb_build_object('referral_id', input_referral_id,
      'multiplier', 2, 'duration_days', 30));
  return boost_id;
end;
$$;

create or replace function public.audit_referral_retention_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare event_type_value text;
begin
  if tg_op = 'INSERT' then
    event_type_value := 'REFERRAL_CREATED';
  elsif new.status = 'pending_registered' and old.status is distinct from new.status then
    event_type_value := 'REFERRAL_REGISTERED';
  elsif new.status = 'activated' and old.status is distinct from new.status then
    event_type_value := 'REFERRAL_QUALIFIED';
  else
    return new;
  end if;
  perform public.write_audit_event(new.restaurant_id,
    coalesce(new.referred_customer_id, new.referrer_customer_id), 'system', null,
    event_type_value, 'success', 'referral', 'referrals', new.id, null,
    jsonb_build_object('referrer_customer_id', new.referrer_customer_id,
      'referred_customer_id', new.referred_customer_id));
  return new;
end;
$$;

drop trigger if exists audit_referral_retention_events_trigger on public.referrals;
create trigger audit_referral_retention_events_trigger
after insert or update of status, referred_customer_id on public.referrals
for each row execute function public.audit_referral_retention_events();

create or replace function public.expire_customer_bonus_boosts(input_run_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare boost_record record; expired_count integer := 0;
begin
  for boost_record in
    update public.customer_bonus_boosts
    set status = 'expired'
    where status = 'active' and active_until <= input_run_at
    returning id, restaurant_id, customer_id, referral_id
  loop
    expired_count := expired_count + 1;
    perform public.write_audit_event(boost_record.restaurant_id, boost_record.customer_id,
      'system', null, 'BONUS_BOOST_EXPIRED', 'success', 'referral',
      'customer_bonus_boosts', boost_record.id, null,
      jsonb_build_object('referral_id', boost_record.referral_id));
  end loop;
  return expired_count;
end;
$$;

create or replace function public.get_bonus_boost_kpis(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  boosted_guests integer := 0;
  returned_guests integer := 0;
  qualified_referrals integer := 0;
  boost_extra_points bigint := 0;
begin
  if not public.is_restaurant_member(input_restaurant_id) then raise exception 'not allowed'; end if;
  select count(distinct customer_id) into boosted_guests
  from public.customer_bonus_boosts cb
  join public.customers c on c.id = cb.customer_id
  where cb.restaurant_id = input_restaurant_id
    and cb.status = 'active' and cb.active_from <= now() and cb.active_until > now()
    and not c.is_test_customer;
  select count(*) into qualified_referrals
  from public.referrals rf
  join public.customers c on c.id = rf.referred_customer_id
  where rf.restaurant_id = input_restaurant_id and rf.status = 'activated'
    and not c.is_test_customer;
  select count(distinct customer_id),
    coalesce(sum(greatest(
      coalesce((metadata->>'final_points')::integer, 0)
      - coalesce((metadata->>'base_points')::integer, 0), 0)), 0)
  into returned_guests, boost_extra_points
  from public.audit_log
  where restaurant_id = input_restaurant_id
    and action = 'public_bonus_points_collected'
    and not is_test_event
    and coalesce((metadata->>'multiplier')::numeric, 1) > 1;
  return jsonb_build_object(
    'guests_currently_boosted', boosted_guests,
    'guests_returned_because_of_boost', returned_guests,
    'successful_referrals', qualified_referrals,
    'new_customers_from_referrals', qualified_referrals,
    'boost_extra_points', boost_extra_points
  );
end;
$$;

revoke execute on function public.v1_birthday_date(integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.sync_customer_birthday_parts() from public, anon, authenticated;
revoke execute on function public.create_expiry_reminders(timestamptz) from public, anon, authenticated;
revoke execute on function public.issue_birthday_gifts(timestamptz) from public, anon, authenticated;
revoke execute on function public.get_customer_retention_status(text, text) from public;
grant execute on function public.get_customer_retention_status(text, text) to anon, authenticated;
revoke execute on function public.update_customer_birthday(text, text, integer, integer) from public;
grant execute on function public.update_customer_birthday(text, text, integer, integer) to anon, authenticated;
revoke execute on function public.draw_customer_birthday_gift(text, text, uuid) from public;
grant execute on function public.draw_customer_birthday_gift(text, text, uuid) to anon, authenticated;
revoke execute on function public.save_customer_push_subscription(text, text, jsonb, text) from public;
grant execute on function public.save_customer_push_subscription(text, text, jsonb, text) to anon, authenticated;
revoke execute on function public.disable_customer_push_subscriptions(text, text) from public;
grant execute on function public.disable_customer_push_subscriptions(text, text) to anon, authenticated;
revoke execute on function public.mark_expiry_reminder(text, uuid, text) from public;
grant execute on function public.mark_expiry_reminder(text, uuid, text) to anon, authenticated;
revoke execute on function public.upsert_referral_boost(uuid, uuid, uuid, numeric, integer) from public, anon, authenticated;
revoke execute on function public.audit_referral_retention_events() from public, anon, authenticated;
revoke execute on function public.expire_customer_bonus_boosts(timestamptz) from public, anon, authenticated;
revoke execute on function public.get_bonus_boost_kpis(uuid) from public, anon;
grant execute on function public.get_bonus_boost_kpis(uuid) to authenticated;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job
  where jobname = 'wuxuai-v1-expiry-reminders-daily' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('wuxuai-v1-expiry-reminders-daily', '10 2 * * *',
    'select public.create_expiry_reminders(now());');
  select jobid into existing_job from cron.job
  where jobname = 'wuxuai-v1-expire-bonus-boosts' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('wuxuai-v1-expire-bonus-boosts', '20 2 * * *',
    'select public.expire_customer_bonus_boosts(now());');
end;
$$;

notify pgrst, 'reload schema';
