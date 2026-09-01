-- WUXUAI Restaurant Bonus V1 release finishing.
-- Additive gift presentation windows, automatic birthday assignment and
-- transactional customer notification state. Existing point presentations
-- and historical six-digit redemption codes remain intact.

create table if not exists public.gift_redemption_presentations (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  customer_reward_id uuid not null unique references public.customer_rewards(id) on delete restrict,
  idempotency_key uuid not null,
  public_reference text not null unique,
  status text not null default 'REDEEMED_ACTIVE'
    check (status in ('REDEEMED_ACTIVE', 'REDEEMED_COMPLETED')),
  activated_at timestamptz not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (restaurant_id, customer_id, idempotency_key),
  check (expires_at = activated_at + interval '15 minutes'),
  check (
    (status = 'REDEEMED_ACTIVE' and completed_at is null)
    or (status = 'REDEEMED_COMPLETED' and completed_at is not null)
  )
);

create unique index if not exists gift_presentations_one_active_assignment_idx
  on public.gift_redemption_presentations (customer_reward_id)
  where status = 'REDEEMED_ACTIVE';
create index if not exists gift_presentations_expiry_idx
  on public.gift_redemption_presentations (expires_at)
  where status = 'REDEEMED_ACTIVE';

alter table public.gift_redemption_presentations enable row level security;
revoke all on public.gift_redemption_presentations from public, anon, authenticated;

create table if not exists public.customer_transactional_email_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  account_id uuid not null references public.customer_accounts(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid references public.rewards(id) on delete set null,
  customer_reward_id uuid references public.customer_rewards(id) on delete set null,
  event_type text not null check (event_type in (
    'BIRTHDAY_GIFT_ASSIGNED', 'BIRTHDAY_GIFT_EXPIRY_REMINDER', 'POINT_REWARD_AVAILABLE'
  )),
  event_key text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED')),
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  processing_started_at timestamptz,
  provider_message_id text,
  sent_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_type, event_key)
);

create index if not exists customer_transactional_email_queue_idx
  on public.customer_transactional_email_deliveries (status, available_at, created_at)
  where status in ('PENDING', 'PROCESSING', 'FAILED');
alter table public.customer_transactional_email_deliveries enable row level security;
revoke all on public.customer_transactional_email_deliveries from public, anon, authenticated;

create table if not exists public.customer_reward_notification_state (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete cascade,
  above_threshold boolean not null default false,
  last_crossed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (restaurant_id, customer_id, reward_id)
);
alter table public.customer_reward_notification_state enable row level security;
revoke all on public.customer_reward_notification_state from public, anon, authenticated;

create or replace function public.enqueue_customer_transactional_email(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_event_type text,
  input_event_key text,
  input_reward_id uuid default null,
  input_customer_reward_id uuid default null,
  input_payload jsonb default '{}'::jsonb,
  input_available_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare account_id_value uuid;
begin
  if input_event_type not in ('BIRTHDAY_GIFT_ASSIGNED', 'BIRTHDAY_GIFT_EXPIRY_REMINDER', 'POINT_REWARD_AVAILABLE') then
    return false;
  end if;
  select membership.account_id into account_id_value
  from public.customer_account_memberships membership
  join public.customer_account_emails email on email.account_id = membership.account_id
  join public.customer_accounts account on account.id = membership.account_id
  where membership.restaurant_id = input_restaurant_id
    and membership.customer_id = input_customer_id
    and email.status = 'CONFIRMED'
    and account.disabled_at is null
  limit 1;
  if account_id_value is null then return false; end if;

  insert into public.customer_transactional_email_deliveries (
    account_id, restaurant_id, customer_id, reward_id, customer_reward_id,
    event_type, event_key, payload, available_at
  ) values (
    account_id_value, input_restaurant_id, input_customer_id, input_reward_id,
    input_customer_reward_id, input_event_type, input_event_key,
    coalesce(input_payload, '{}'::jsonb), input_available_at
  ) on conflict (event_type, event_key) do nothing;
  return found;
exception when others then
  -- E-mail infrastructure must never roll back a gift or points transaction.
  return false;
end;
$$;
revoke execute on function public.enqueue_customer_transactional_email(uuid, uuid, text, text, uuid, uuid, jsonb, timestamptz)
  from public, anon, authenticated;

create or replace function public.gift_presentation_payload(
  input_presentation_id uuid,
  input_now timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'found', true,
    'presentation_id', presentation.id,
    'status', presentation.status,
    'active', presentation.status = 'REDEEMED_ACTIVE' and presentation.expires_at > input_now,
    'activated_at', presentation.activated_at,
    'expires_at', presentation.expires_at,
    'completed_at', presentation.completed_at,
    'server_now', input_now,
    'visual_code', public.points_presentation_visual_code(presentation.id, input_now),
    'visual_code_valid_until', to_timestamp((floor(extract(epoch from input_now) / 10) + 1) * 10),
    'redemption_number', presentation.public_reference,
    'reward_id', presentation.reward_id,
    'customer_reward_id', presentation.customer_reward_id,
    'reward_title', reward.title,
    'reward_description', reward.description,
    'reward_image_url', reward.image_url,
    'image_zoom', reward.image_zoom,
    'image_position_x', reward.image_position_x,
    'image_position_y', reward.image_position_y,
    'image_aspect_ratio', reward.image_aspect_ratio,
    'image_crop_version', reward.image_crop_version,
    'restaurant_name', restaurant.name,
    'points_spent', 0,
    'stamps_spent', 0,
    'gift_type', customer_reward.gift_type,
    'confirmation_method', 'CUSTOMER_PRESENTATION_WINDOW'
  )
  from public.gift_redemption_presentations presentation
  join public.customer_rewards customer_reward on customer_reward.id = presentation.customer_reward_id
  join public.rewards reward on reward.id = presentation.reward_id and reward.restaurant_id = presentation.restaurant_id
  join public.restaurants restaurant on restaurant.id = presentation.restaurant_id
  where presentation.id = input_presentation_id
$$;
revoke execute on function public.gift_presentation_payload(uuid, timestamptz)
  from public, anon, authenticated;

create or replace function public.complete_gift_redemption_presentations(input_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare presentation_record public.gift_redemption_presentations%rowtype;
declare reward_record public.rewards%rowtype;
declare customer_record public.customers%rowtype;
declare audit_id_value uuid;
declare activity_number_value text;
declare completed_count integer := 0;
begin
  for presentation_record in
    select * from public.gift_redemption_presentations
    where status = 'REDEEMED_ACTIVE' and expires_at <= input_now
    for update skip locked
  loop
    update public.gift_redemption_presentations
    set status = 'REDEEMED_COMPLETED', completed_at = input_now
    where id = presentation_record.id and status = 'REDEEMED_ACTIVE';
    if not found then continue; end if;

    update public.customer_rewards
    set status = 'redeemed', redeemed_at = input_now
    where id = presentation_record.customer_reward_id and status = 'redemption_started';
    select * into reward_record from public.rewards where id = presentation_record.reward_id;
    select * into customer_record from public.customers where id = presentation_record.customer_id;

    audit_id_value := public.write_audit_event(
      presentation_record.restaurant_id, presentation_record.customer_id,
      'system', null, 'GIFT_REDEMPTION_PRESENTATION_COMPLETED', 'completed', 'system',
      'gift_redemption_presentations', presentation_record.id, null,
      jsonb_build_object(
        'reward_id', presentation_record.reward_id,
        'customer_reward_id', presentation_record.customer_reward_id,
        'confirmation_method', 'CUSTOMER_PRESENTATION_WINDOW'
      )
    );
    activity_number_value := 'WXB-' || to_char(input_now at time zone 'Europe/Vienna', 'YYYY')
      || '-' || lpad(nextval('public.redemption_activity_number_seq')::text, 8, '0');
    insert into public.redemption_activity_journal (
      activity_number, restaurant_id, organization_id, branch_id, customer_id,
      customer_reference, source_type, source_id, reward_id, reward_type,
      reward_name_snapshot, reward_description_snapshot, points_spent, quantity,
      redeemed_at, redeemed_by, actor_role, redemption_code_reference, status,
      audit_reference, snapshot_completeness, is_test_event
    ) values (
      activity_number_value, presentation_record.restaurant_id, presentation_record.organization_id,
      presentation_record.branch_id, presentation_record.customer_id,
      left(encode(extensions.digest(presentation_record.customer_id::text, 'sha256'), 'hex'), 16),
      'gift_presentation', presentation_record.id, presentation_record.reward_id,
      case when (select gift_type from public.customer_rewards where id = presentation_record.customer_reward_id) = 'birthday'
        then 'BIRTHDAY_GIFT' else 'WELCOME_GIFT' end,
      reward_record.title, reward_record.description, 0, 1, input_now,
      presentation_record.customer_id, 'customer', presentation_record.public_reference,
      'ACTIVE', audit_id_value, 'complete', coalesce(customer_record.is_test_customer, false)
    ) on conflict (source_type, source_id) do nothing;
    completed_count := completed_count + 1;
  end loop;
  return completed_count;
end;
$$;
revoke execute on function public.complete_gift_redemption_presentations(timestamptz)
  from public, anon, authenticated;

create or replace function public.start_customer_gift_presentation(
  input_customer_token text,
  input_customer_reward_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare token_record public.customer_qr_tokens%rowtype;
declare customer_record public.customers%rowtype;
declare gift_record public.customer_rewards%rowtype;
declare reward_record public.rewards%rowtype;
declare existing_record public.gift_redemption_presentations%rowtype;
declare presentation_id_value uuid := extensions.gen_random_uuid();
declare activated_at_value timestamptz := statement_timestamp();
begin
  if input_idempotency_key is null or input_customer_reward_id is null then
    raise exception using errcode = 'P0001', message = 'GIFT_PRESENTATION_REQUEST_INVALID';
  end if;
  select * into token_record from public.customer_qr_tokens
  where token_hash = public.hash_public_token(input_customer_token)
    and active = true and (expires_at is null or expires_at > now());
  if token_record.id is null then raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCESS_TOKEN_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'gift-presentation:' || token_record.restaurant_id::text || ':' || input_customer_reward_id::text, 0
  ));
  select * into customer_record from public.customers
  where id = token_record.customer_id and restaurant_id = token_record.restaurant_id
    and membership_status = 'active' for update;
  if customer_record.id is null then raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_INACTIVE'; end if;

  select * into existing_record from public.gift_redemption_presentations
  where restaurant_id = customer_record.restaurant_id and customer_id = customer_record.id
    and idempotency_key = input_idempotency_key for update;
  if existing_record.id is not null then
    if existing_record.customer_reward_id <> input_customer_reward_id then
      return jsonb_build_object('success', false, 'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
    end if;
    perform public.complete_gift_redemption_presentations(now());
    return public.gift_presentation_payload(existing_record.id, now())
      || jsonb_build_object('success', true, 'already_started', true);
  end if;

  select * into gift_record from public.customer_rewards
  where id = input_customer_reward_id and restaurant_id = customer_record.restaurant_id
    and customer_id = customer_record.id and gift_type in ('welcome', 'birthday')
    and status in ('active', 'redemption_started') for update;
  if gift_record.id is null then raise exception using errcode = 'P0001', message = 'GIFT_NOT_AVAILABLE'; end if;

  select * into existing_record from public.gift_redemption_presentations
  where customer_reward_id = gift_record.id order by created_at desc limit 1 for update;
  if existing_record.id is not null then
    perform public.complete_gift_redemption_presentations(now());
    return public.gift_presentation_payload(existing_record.id, now())
      || jsonb_build_object('success', true, 'already_started', true);
  end if;

  select * into reward_record from public.rewards
  where id = gift_record.reward_id and restaurant_id = gift_record.restaurant_id
    and active = true and is_starter_reward = true
    and (expires_at is null or expires_at > activated_at_value);
  if reward_record.id is null
    or (gift_record.valid_from is not null and gift_record.valid_from > activated_at_value)
    or (gift_record.valid_until is not null and gift_record.valid_until <= activated_at_value) then
    raise exception using errcode = 'P0001', message = 'GIFT_NOT_AVAILABLE';
  end if;

  update public.customer_rewards set status = 'redemption_started', redemption_started_at = activated_at_value
  where id = gift_record.id and status = 'active';
  if not found and gift_record.status <> 'redemption_started' then
    raise exception using errcode = 'P0001', message = 'GIFT_NOT_AVAILABLE';
  end if;

  insert into public.gift_redemption_presentations (
    id, restaurant_id, organization_id, branch_id, customer_id, reward_id,
    customer_reward_id, idempotency_key, public_reference, activated_at, expires_at
  ) values (
    presentation_id_value, gift_record.restaurant_id, gift_record.organization_id,
    gift_record.branch_id, gift_record.customer_id, gift_record.reward_id,
    gift_record.id, input_idempotency_key,
    'WXG-' || upper(left(replace(presentation_id_value::text, '-', ''), 10)),
    activated_at_value, activated_at_value + interval '15 minutes'
  );
  perform public.write_audit_event(
    gift_record.restaurant_id, gift_record.customer_id, 'customer', gift_record.customer_id,
    'GIFT_REDEMPTION_PRESENTATION_STARTED', 'completed', 'customer_portal',
    'gift_redemption_presentations', presentation_id_value, input_idempotency_key,
    jsonb_build_object(
      'reward_id', gift_record.reward_id, 'customer_reward_id', gift_record.id,
      'gift_type', gift_record.gift_type,
      'expires_at', activated_at_value + interval '15 minutes',
      'confirmation_method', 'CUSTOMER_PRESENTATION_WINDOW'
    )
  );
  return public.gift_presentation_payload(presentation_id_value, activated_at_value)
    || jsonb_build_object('success', true, 'already_started', false);
end;
$$;
revoke execute on function public.start_customer_gift_presentation(text, uuid, uuid) from public;
grant execute on function public.start_customer_gift_presentation(text, uuid, uuid) to anon, authenticated;

create or replace function public.get_customer_gift_presentation(
  input_restaurant_slug text,
  input_customer_token text,
  input_presentation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare restaurant_id_value uuid;
declare customer_id_value uuid;
declare presentation_record public.gift_redemption_presentations%rowtype;
declare server_now_value timestamptz := statement_timestamp();
begin
  select id into restaurant_id_value from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  select customer.id into customer_id_value
  from public.customer_qr_tokens token
  join public.customers customer on customer.id = token.customer_id and customer.restaurant_id = token.restaurant_id
  where token.restaurant_id = restaurant_id_value
    and token.token_hash = public.hash_public_token(input_customer_token)
    and token.active = true and (token.expires_at is null or token.expires_at > now())
    and customer.membership_status = 'active' limit 1;
  if customer_id_value is null then return jsonb_build_object('found', false); end if;
  perform public.complete_gift_redemption_presentations(server_now_value);
  if input_presentation_id is null then
    select * into presentation_record from public.gift_redemption_presentations
    where restaurant_id = restaurant_id_value and customer_id = customer_id_value
      and status = 'REDEEMED_ACTIVE' order by activated_at desc limit 1;
  else
    select * into presentation_record from public.gift_redemption_presentations
    where id = input_presentation_id and restaurant_id = restaurant_id_value
      and customer_id = customer_id_value;
  end if;
  if presentation_record.id is null then return jsonb_build_object('found', false); end if;
  return public.gift_presentation_payload(presentation_record.id, server_now_value);
end;
$$;
revoke execute on function public.get_customer_gift_presentation(text, text, uuid) from public;
grant execute on function public.get_customer_gift_presentation(text, text, uuid) to anon, authenticated;

-- Keep redeemed gifts in the customer's history without exposing customer rows.
create or replace function public.get_customer_gift_metadata(input_customer_token text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'reward_id', gift.reward_id, 'assignment_id', gift.id, 'gift_type', gift.gift_type,
    'status', gift.status, 'valid_from', gift.valid_from, 'valid_until', gift.valid_until,
    'birthday_year', gift.birthday_year, 'redeemed_at', gift.redeemed_at
  ) order by gift.issued_at desc), '[]'::jsonb)
  from public.customer_qr_tokens token
  join public.customer_rewards gift on gift.restaurant_id = token.restaurant_id
    and gift.customer_id = token.customer_id and gift.branch_id is not distinct from token.branch_id
  where token.token_hash = public.hash_public_token(input_customer_token)
    and token.active = true and (token.expires_at is null or token.expires_at > now())
    and gift.gift_type in ('welcome', 'birthday')
    and gift.status in ('locked', 'active', 'redemption_started', 'redeemed', 'expired')
$$;
revoke execute on function public.get_customer_gift_metadata(text) from public;
grant execute on function public.get_customer_gift_metadata(text) to anon, authenticated;

-- The customer draw remains in history but is no longer a browser-accessible V1 path.
revoke execute on function public.draw_customer_birthday_gift(text, text, uuid) from public, anon, authenticated;

create or replace function public.issue_birthday_gifts(input_run_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare membership record;
declare selected_reward public.rewards%rowtype;
declare assignment_id_value uuid;
declare birthday_date_value date;
declare target_year integer;
declare issued_count integer := 0;
declare skipped_count integer := 0;
begin
  for membership in
    select customer.*, restaurant.timezone_name, restaurant.status restaurant_status
    from public.customers customer
    join public.restaurants restaurant on restaurant.id = customer.restaurant_id
    where customer.membership_status = 'active' and restaurant.status = 'active'
      and customer.birthday_day is not null and customer.birthday_month is not null
  loop
    birthday_date_value := public.v1_birthday_date(
      membership.birthday_day, membership.birthday_month,
      extract(year from (input_run_at at time zone membership.timezone_name)::date + 14)::integer
    );
    if birthday_date_value is null
      or birthday_date_value <> (input_run_at at time zone membership.timezone_name)::date + 14 then
      continue;
    end if;
    target_year := extract(year from birthday_date_value)::integer;
    perform pg_advisory_xact_lock(hashtextextended(
      'birthday-gift:' || membership.restaurant_id::text || ':' || membership.id::text || ':' || target_year::text, 0
    ));
    if exists (select 1 from public.customer_rewards where restaurant_id = membership.restaurant_id
      and customer_id = membership.id and gift_type = 'birthday' and birthday_year = target_year) then
      skipped_count := skipped_count + 1; continue;
    end if;
    select * into selected_reward from public.rewards
    where restaurant_id = membership.restaurant_id
      and branch_id is not distinct from membership.branch_id
      and is_starter_reward = true and birthday_pool_enabled = true and active = true
      and (expires_at is null or expires_at > input_run_at)
    order by encode(extensions.gen_random_bytes(16), 'hex') limit 1;
    if selected_reward.id is null then skipped_count := skipped_count + 1; continue; end if;
    begin
      insert into public.customer_rewards (
        restaurant_id, organization_id, branch_id, customer_id, reward_id, status,
        is_starter_reward, gift_type, birthday_year, issued_at, valid_from,
        valid_until, unlocked_at, assignment_metadata
      ) values (
        membership.restaurant_id, membership.organization_id, membership.branch_id,
        membership.id, selected_reward.id, 'active', true, 'birthday', target_year,
        input_run_at,
        ((birthday_date_value - 14)::timestamp at time zone membership.timezone_name),
        ((birthday_date_value + 15)::timestamp at time zone membership.timezone_name),
        input_run_at,
        jsonb_build_object('source', 'birthday_automatic_v1', 'birthday_year', target_year)
      ) returning id into assignment_id_value;
      perform public.write_audit_event(
        membership.restaurant_id, membership.id, 'system', null,
        'BIRTHDAY_GIFT_ASSIGNED', 'completed', 'system', 'customer_rewards',
        assignment_id_value, null,
        jsonb_build_object('reward_id', selected_reward.id, 'birthday_year', target_year)
      );
      perform public.enqueue_customer_transactional_email(
        membership.restaurant_id, membership.id, 'BIRTHDAY_GIFT_ASSIGNED',
        assignment_id_value::text, selected_reward.id, assignment_id_value,
        jsonb_build_object(
          'subject', 'Dein Geburtstagsgeschenk wartet auf dich 🎁',
          'reward_name', selected_reward.title,
          'restaurant_slug', (select slug from public.restaurants where id = membership.restaurant_id)
        ), input_run_at
      );
      issued_count := issued_count + 1;
    exception when unique_violation then skipped_count := skipped_count + 1;
    end;
  end loop;
  return jsonb_build_object('issued', issued_count, 'skipped', skipped_count, 'mode', 'automatic_14_days');
end;
$$;
revoke execute on function public.issue_birthday_gifts(timestamptz) from public, anon, authenticated;

create or replace function public.queue_birthday_gift_expiry_reminders(input_run_at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare gift record;
declare queued_count integer := 0;
begin
  for gift in
    select customer_reward.*, restaurant.slug restaurant_slug, restaurant.timezone_name, reward.title reward_title
    from public.customer_rewards customer_reward
    join public.restaurants restaurant on restaurant.id = customer_reward.restaurant_id and restaurant.status = 'active'
    join public.rewards reward on reward.id = customer_reward.reward_id and reward.active = true
    where customer_reward.gift_type = 'birthday' and customer_reward.status = 'active'
      and customer_reward.valid_until is not null
      and (customer_reward.valid_until at time zone restaurant.timezone_name)::date
        = (input_run_at at time zone restaurant.timezone_name)::date + 3
  loop
    if public.enqueue_customer_transactional_email(
      gift.restaurant_id, gift.customer_id, 'BIRTHDAY_GIFT_EXPIRY_REMINDER',
      gift.id::text, gift.reward_id, gift.id,
      jsonb_build_object('reward_name', gift.reward_title, 'restaurant_slug', gift.restaurant_slug), input_run_at
    ) then queued_count := queued_count + 1; end if;
  end loop;
  return queued_count;
end;
$$;
revoke execute on function public.queue_birthday_gift_expiry_reminders(timestamptz)
  from public, anon, authenticated;

create or replace function public.sync_point_reward_notification_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare current_balance integer;
declare previous_balance integer;
declare reward_record record;
declare was_above boolean;
begin
  select points_balance into current_balance from public.customers
  where id = new.customer_id and restaurant_id = new.restaurant_id;
  if current_balance is null then return new; end if;
  previous_balance := current_balance - new.points;
  for reward_record in
    select id, title, required_points from public.rewards
    where restaurant_id = new.restaurant_id and active = true and not is_starter_reward
      and required_points > 0 and (expires_at is null or expires_at > new.created_at)
  loop
    select above_threshold into was_above from public.customer_reward_notification_state
    where restaurant_id = new.restaurant_id and customer_id = new.customer_id and reward_id = reward_record.id;
    was_above := coalesce(was_above, previous_balance >= reward_record.required_points);
    insert into public.customer_reward_notification_state (
      restaurant_id, customer_id, reward_id, above_threshold, last_crossed_at, updated_at
    ) values (
      new.restaurant_id, new.customer_id, reward_record.id,
      current_balance >= reward_record.required_points,
      case when not was_above and current_balance >= reward_record.required_points then new.created_at else null end,
      now()
    ) on conflict (restaurant_id, customer_id, reward_id) do update
      set above_threshold = excluded.above_threshold,
          last_crossed_at = case when not public.customer_reward_notification_state.above_threshold
            and excluded.above_threshold then excluded.last_crossed_at
            else public.customer_reward_notification_state.last_crossed_at end,
          updated_at = now();
    if not was_above and current_balance >= reward_record.required_points then
      perform public.enqueue_customer_transactional_email(
        new.restaurant_id, new.customer_id, 'POINT_REWARD_AVAILABLE',
        new.id::text || ':' || reward_record.id::text, reward_record.id, null,
        jsonb_build_object('reward_name', reward_record.title, 'required_points', reward_record.required_points),
        new.created_at
      );
    end if;
  end loop;
  return new;
exception when others then
  -- Notification state must never roll back the points transaction.
  return new;
end;
$$;
drop trigger if exists sync_point_reward_notification_state_trigger on public.points_transactions;
create trigger sync_point_reward_notification_state_trigger
after insert on public.points_transactions
for each row execute function public.sync_point_reward_notification_state();
revoke execute on function public.sync_point_reward_notification_state() from public, anon, authenticated;

create or replace function public.reserve_customer_transactional_emails(input_limit integer default 50)
returns table (
  delivery_id uuid, event_type text, email text, restaurant_name text,
  restaurant_slug text, payload jsonb, attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- A disabled account or missing confirmed address is terminal. Do not leave
  -- a reserved row invisible in PROCESSING after the recipient disappears.
  update public.customer_transactional_email_deliveries delivery
  set status = 'SKIPPED', failed_at = now(), processing_started_at = null,
      last_error_code = 'RECIPIENT_UNAVAILABLE', last_error = 'RECIPIENT_UNAVAILABLE',
      updated_at = now()
  where delivery.status in ('PENDING', 'FAILED')
    and delivery.available_at <= now()
    and not exists (
      select 1
      from public.customer_account_emails account_email
      join public.customer_accounts account on account.id = account_email.account_id
      where account_email.account_id = delivery.account_id
        and account_email.status = 'CONFIRMED'
        and account.disabled_at is null
    );

  -- A worker can stop after reserving a row. The lease makes such rows
  -- retryable without allowing two active workers to reserve the same row.
  update public.customer_transactional_email_deliveries delivery
  set status = 'SKIPPED', failed_at = now(), processing_started_at = null,
      last_error_code = 'DELIVERY_ATTEMPTS_EXHAUSTED',
      last_error = 'DELIVERY_ATTEMPTS_EXHAUSTED', updated_at = now()
  where delivery.status = 'PROCESSING'
    and delivery.attempt_count >= 5
    and delivery.processing_started_at <= now() - interval '10 minutes';

  return query
  with due as (
    select delivery.id from public.customer_transactional_email_deliveries delivery
    where (
        (delivery.status in ('PENDING', 'FAILED') and delivery.available_at <= now())
        or (delivery.status = 'PROCESSING'
          and delivery.processing_started_at <= now() - interval '10 minutes')
      )
      and delivery.attempt_count < 5
    order by delivery.available_at, delivery.created_at
    for update skip locked limit least(greatest(input_limit, 1), 100)
  ), reserved as (
    update public.customer_transactional_email_deliveries delivery
    set status = 'PROCESSING', attempt_count = attempt_count + 1,
        processing_started_at = now(), failed_at = null,
        last_error_code = null, last_error = null, updated_at = now()
    from due where delivery.id = due.id
    returning delivery.*
  )
  select reserved.id, reserved.event_type, account_email.email, restaurant.name,
    restaurant.slug, reserved.payload, reserved.attempt_count
  from reserved
  join public.customer_account_emails account_email on account_email.account_id = reserved.account_id
    and account_email.status = 'CONFIRMED'
  join public.customer_accounts account on account.id = reserved.account_id and account.disabled_at is null
  join public.restaurants restaurant on restaurant.id = reserved.restaurant_id;
end;
$$;
revoke execute on function public.reserve_customer_transactional_emails(integer) from public, anon, authenticated;
grant execute on function public.reserve_customer_transactional_emails(integer) to service_role;

create or replace function public.complete_customer_transactional_email(
  input_delivery_id uuid,
  input_success boolean,
  input_provider_message_id text default null,
  input_error_code text default null
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.customer_transactional_email_deliveries
  set status = case
        when input_success then 'SENT'
        when attempt_count >= 5 then 'SKIPPED'
        else 'FAILED'
      end,
      provider_message_id = case when input_success then nullif(trim(input_provider_message_id), '') else provider_message_id end,
      sent_at = case when input_success then now() else sent_at end,
      failed_at = case when input_success then null else now() end,
      processing_started_at = null,
      last_error_code = case when input_success then null else left(coalesce(input_error_code, 'DELIVERY_FAILED'), 120) end,
      last_error = case when input_success then null else left(coalesce(input_error_code, 'DELIVERY_FAILED'), 120) end,
      available_at = case
        when input_success or attempt_count >= 5 then available_at
        when attempt_count = 1 then now() + interval '1 minute'
        when attempt_count = 2 then now() + interval '5 minutes'
        when attempt_count = 3 then now() + interval '15 minutes'
        else now() + interval '1 hour'
      end,
      updated_at = now()
  where id = input_delivery_id and status = 'PROCESSING';
$$;
revoke execute on function public.complete_customer_transactional_email(uuid, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_customer_transactional_email(uuid, boolean, text, text) to service_role;

create extension if not exists pg_cron;
do $$
declare job_record record;
begin
  for job_record in select jobid from cron.job where jobname in (
    'wuxuai-v1-birthday-gifts-daily',
    'wuxuai-v1-birthday-gift-reminders',
    'wuxuai-v1-complete-gift-presentations'
  ) loop perform cron.unschedule(job_record.jobid); end loop;
  perform cron.schedule('wuxuai-v1-birthday-gifts-daily', '30 1 * * *',
    'select public.issue_birthday_gifts(now());');
  perform cron.schedule('wuxuai-v1-birthday-gift-reminders', '45 1 * * *',
    'select public.queue_birthday_gift_expiry_reminders(now());');
  perform cron.schedule('wuxuai-v1-complete-gift-presentations', '* * * * *',
    'select public.complete_gift_redemption_presentations(now());');
end;
$$;

notify pgrst, 'reload schema';
