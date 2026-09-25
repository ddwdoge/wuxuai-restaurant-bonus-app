-- Phase 7D.3B: secure, single-use redemption requests. All historical
-- presentations and receipts remain intact. Public cutover follows the
-- complete backend implementation below in this same migration.

create table public.redemption_confirmation_pins (
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  local_day date not null,
  pin_hash text not null,
  generation integer not null default 1 check (generation > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default statement_timestamp(),
  rotated_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  primary key (restaurant_id, branch_id, local_day)
);
alter table public.redemption_confirmation_pins enable row level security;
revoke all on public.redemption_confirmation_pins from public, anon, authenticated;

create table public.secure_redemption_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  account_id uuid not null references public.customer_accounts(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  source_type text not null check (source_type in ('points', 'gift')),
  source_id uuid not null,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  entitlement_id uuid,
  presentation_id uuid not null,
  status text not null default 'REQUESTED' check (status in
    ('REQUESTED', 'PIN_VERIFIED', 'REDEEMED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
  requested_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  request_id uuid not null,
  correlation_id uuid not null,
  start_idempotency_key uuid not null,
  confirmation_idempotency_key uuid,
  confirmation_method text check (confirmation_method in
    ('CUSTOMER_SWIPE_AFTER_PIN', 'STAFF_APPROVAL', 'OWNER_APPROVAL')),
  confirmed_by uuid references auth.users(id) on delete restrict,
  pin_generation integer,
  pin_verified_at timestamptz,
  failed_pin_attempts integer not null default 0 check (failed_pin_attempts between 0 and 5),
  last_error_code text,
  unique (actor_user_id, request_id),
  unique (actor_user_id, start_idempotency_key),
  check (expires_at = requested_at + interval '15 minutes'),
  check (completed_at is null or status in ('REDEEMED', 'REJECTED', 'CANCELLED', 'EXPIRED'))
);
create unique index secure_redemption_one_active_entitlement
  on public.secure_redemption_requests (restaurant_id, branch_id, customer_id, source_type,
    coalesce(entitlement_id, reward_id))
  where status in ('REQUESTED', 'PIN_VERIFIED');
create index secure_redemption_queue_idx
  on public.secure_redemption_requests (restaurant_id, branch_id, requested_at)
  where status in ('REQUESTED', 'PIN_VERIFIED');
create index secure_redemption_velocity_idx
  on public.secure_redemption_requests (customer_id, restaurant_id, requested_at desc);
alter table public.secure_redemption_requests enable row level security;
revoke all on public.secure_redemption_requests from public, anon, authenticated;

create table public.secure_redemption_pin_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  redemption_id uuid not null references public.secure_redemption_requests(id) on delete restrict,
  idempotency_key uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  attempted_at timestamptz not null default statement_timestamp(),
  successful boolean not null,
  unique (redemption_id, idempotency_key)
);
create index secure_redemption_pin_hour_idx
  on public.secure_redemption_pin_attempts (actor_user_id, restaurant_id, branch_id, attempted_at desc);
alter table public.secure_redemption_pin_attempts enable row level security;
revoke all on public.secure_redemption_pin_attempts from public, anon, authenticated;

create table public.secure_redemption_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  redemption_id uuid not null references public.secure_redemption_requests(id) on delete restrict,
  event_type text not null,
  actor_role text not null,
  actor_user_id uuid,
  occurred_at timestamptz not null default statement_timestamp(),
  request_id uuid,
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb
);
create index secure_redemption_audit_request_idx
  on public.secure_redemption_audit (redemption_id, occurred_at);
alter table public.secure_redemption_audit enable row level security;
revoke all on public.secure_redemption_audit from public, anon, authenticated;
create function public.protect_secure_redemption_audit()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception using errcode = '42501', message = 'REDEMPTION_AUDIT_IMMUTABLE';
end;
$$;
revoke all on function public.protect_secure_redemption_audit()
  from public, anon, authenticated, service_role;
create trigger secure_redemption_audit_immutable
before update or delete or truncate on public.secure_redemption_audit
for each statement execute function public.protect_secure_redemption_audit();

create or replace function public.secure_redemption_actor_role(
  input_actor_user_id uuid, input_restaurant_id uuid, input_branch_id uuid
) returns text language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  result_role text;
begin
  if input_actor_user_id is null or input_restaurant_id is null or input_branch_id is null
    or exists (select 1 from public.platform_admins pa
      where pa.user_id = input_actor_user_id and pa.active)
    or not exists (select 1 from public.branches b
      where b.id = input_branch_id and b.restaurant_id = input_restaurant_id and b.status = 'active')
    or not exists (select 1 from public.restaurants r
      where r.id = input_restaurant_id and r.primary_branch_id = input_branch_id and r.status = 'active') then
    return null;
  end if;
  select case
    when rm.role = 'owner' then 'OWNER'
    when rm.role in ('staff', 'supervisor')
      and exists (select 1 from public.staff_members sm
        where sm.restaurant_id = rm.restaurant_id and sm.auth_user_id = rm.user_id
          and sm.active and sm.account_status = 'active' and sm.archived_at is null)
      then 'STAFF'
    else null
  end into result_role
  from public.restaurant_members rm
  where rm.restaurant_id = input_restaurant_id and rm.user_id = input_actor_user_id;
  if result_role is not null then return result_role; end if;
  if exists (
    select 1 from public.customer_accounts a
    join public.customer_account_memberships m on m.account_id = a.id
    join public.customers c on c.id = m.customer_id
    where a.auth_user_id = input_actor_user_id and a.disabled_at is null
      and m.restaurant_id = input_restaurant_id and c.restaurant_id = m.restaurant_id
      and coalesce(c.branch_id, input_branch_id) = input_branch_id
      and c.membership_status = 'active'
  ) then return 'CUSTOMER'; end if;
  return null;
end;
$$;
revoke all on function public.secure_redemption_actor_role(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.secure_redemption_timezone(input_restaurant_id uuid)
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce((select tz.name
    from public.restaurants r join pg_catalog.pg_timezone_names tz on tz.name = r.timezone_name
    where r.id = input_restaurant_id limit 1), 'Europe/Vienna')
$$;
revoke all on function public.secure_redemption_timezone(uuid)
  from public, anon, authenticated;
create or replace function public.secure_redemption_finalize(
  input_redemption_id uuid,
  input_method text,
  input_actor_user_id uuid,
  input_idempotency_key uuid,
  input_request_id uuid,
  input_correlation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  secure_record public.secure_redemption_requests%rowtype;
  actor_role_value text;
  input_presentation_type text;
  input_presentation_id uuid;
  token_record public.customer_qr_tokens%rowtype;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  points_record public.points_redemption_presentations%rowtype;
  gift_presentation_record public.gift_redemption_presentations%rowtype;
  gift_record public.customer_rewards%rowtype;
  confirmed_at_value timestamptz := statement_timestamp();
  event_id_value uuid;
  transaction_id_value uuid;
  audit_id_value uuid;
  activity_number_value text;
  next_points integer;
  next_stamps integer;
begin
  if input_redemption_id is null or input_actor_user_id is null
    or input_idempotency_key is null or input_request_id is null
    or input_correlation_id is null then
    raise exception using errcode = '22023', message = 'REDEMPTION_CONFIRMATION_REQUEST_INVALID';
  end if;
  select * into secure_record from public.secure_redemption_requests
  where id = input_redemption_id for update;
  if secure_record.id is null or secure_record.correlation_id <> input_correlation_id then
    raise exception using errcode = '42501', message = 'REDEMPTION_NOT_AVAILABLE';
  end if;
  actor_role_value := public.secure_redemption_actor_role(
    input_actor_user_id, secure_record.restaurant_id, secure_record.branch_id);
  if secure_record.status = 'REDEEMED' then
    if actor_role_value is not null and secure_record.confirmed_by = input_actor_user_id
      and secure_record.confirmation_method = input_method
      and secure_record.confirmation_idempotency_key = input_idempotency_key then
      return (case when secure_record.source_type = 'points'
        then public.points_presentation_payload(secure_record.presentation_id, confirmed_at_value)
        else public.gift_presentation_payload(secure_record.presentation_id, confirmed_at_value) end)
        || jsonb_build_object('success', true, 'already_confirmed', true,
          'redemption_id', secure_record.id, 'status', 'REDEEMED',
          'confirmation_method', input_method);
    end if;
    return jsonb_build_object('success', false, 'error_code', 'ALREADY_REDEEMED');
  end if;
  perform public.require_restaurant_operational(secure_record.restaurant_id,
    'secure_redemption_finalize');
  if input_method = 'CUSTOMER_SWIPE_AFTER_PIN' then
    if actor_role_value <> 'CUSTOMER'
      or secure_record.actor_user_id <> input_actor_user_id
      or secure_record.status <> 'PIN_VERIFIED'
      or secure_record.pin_verified_at is null
      or not exists (
        select 1 from public.redemption_confirmation_pins pin
        where pin.restaurant_id = secure_record.restaurant_id
          and pin.branch_id = secure_record.branch_id
          and pin.generation = secure_record.pin_generation
          and pin.expires_at > confirmed_at_value
      ) then
      raise exception using errcode = '42501', message = 'REDEMPTION_CONFIRMATION_REQUIRED';
    end if;
  elsif input_method in ('STAFF_APPROVAL', 'OWNER_APPROVAL') then
    if actor_role_value is distinct from (case
        when input_method = 'STAFF_APPROVAL' then 'STAFF' else 'OWNER' end)
      or secure_record.status <> 'REQUESTED' then
      raise exception using errcode = '42501', message = 'REDEMPTION_CONFIRMATION_REQUIRED';
    end if;
  else
    raise exception using errcode = '22023', message = 'REDEMPTION_CONFIRMATION_REQUEST_INVALID';
  end if;
  if secure_record.expires_at <= confirmed_at_value then
    update public.secure_redemption_requests
    set status = 'EXPIRED', completed_at = confirmed_at_value
    where id = secure_record.id and status in ('REQUESTED', 'PIN_VERIFIED');
    return jsonb_build_object('success', false, 'error_code', 'REDEMPTION_WINDOW_EXPIRED');
  end if;
  input_presentation_type := secure_record.source_type;
  input_presentation_id := secure_record.presentation_id;
  token_record.restaurant_id := secure_record.restaurant_id;
  token_record.branch_id := secure_record.branch_id;
  token_record.customer_id := secure_record.customer_id;
  perform pg_advisory_xact_lock(hashtextextended(
    'customer-redemption-confirm:' || token_record.restaurant_id::text || ':' ||
      input_presentation_type || ':' || input_presentation_id::text,
    0
  ));

  select customer.* into customer_record
  from public.customers customer
  where customer.id = token_record.customer_id
    and customer.restaurant_id = token_record.restaurant_id
    and customer.branch_id is not distinct from token_record.branch_id
    and customer.membership_status = 'active'
  for update;
  if customer_record.id is null or customer_record.id <> secure_record.customer_id then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_INACTIVE';
  end if;

  if input_presentation_type = 'points' then
    select presentation.* into points_record
    from public.points_redemption_presentations presentation
    where presentation.id = input_presentation_id
      and presentation.restaurant_id = customer_record.restaurant_id
      and presentation.customer_id = customer_record.id
      and presentation.branch_id is not distinct from coalesce(
        customer_record.branch_id,
        public.restaurant_primary_branch_id(customer_record.restaurant_id)
      )
    for update;
    if points_record.id is null or points_record.reward_id <> secure_record.reward_id
      or points_record.reward_id <> secure_record.source_id then
      return jsonb_build_object(
        'success', false,
        'error_code', 'REDEMPTION_NOT_AVAILABLE',
        'error_message', 'Diese Einlösung ist nicht verfügbar.'
      );
    end if;

    if points_record.status = 'REDEEMED' then
      return public.points_presentation_payload(points_record.id, confirmed_at_value)
        || jsonb_build_object(
          'success', points_record.confirmation_idempotency_key = input_idempotency_key,
          'already_confirmed', points_record.confirmation_idempotency_key = input_idempotency_key,
          'error_code', case when points_record.confirmation_idempotency_key = input_idempotency_key
            then null else 'ALREADY_REDEEMED' end,
          'error_message', case when points_record.confirmation_idempotency_key = input_idempotency_key
            then null else 'Bereits eingelöst' end,
          'points_balance', customer_record.points_balance,
          'stamp_balance', customer_record.stamp_balance
        );
    end if;
    if points_record.status = 'EXPIRED' or points_record.expires_at <= confirmed_at_value then
      update public.secure_redemption_requests
      set status = 'EXPIRED', completed_at = confirmed_at_value
      where id = secure_record.id and status in ('REQUESTED', 'PIN_VERIFIED');
      update public.points_redemption_presentations
      set status = 'EXPIRED', expired_at = coalesce(expired_at, confirmed_at_value),
          completed_at = coalesce(completed_at, confirmed_at_value)
      where id = points_record.id and status = 'REDEMPTION_STARTED';
      return public.points_presentation_payload(points_record.id, confirmed_at_value)
        || jsonb_build_object(
          'success', false,
          'error_code', 'REDEMPTION_WINDOW_EXPIRED',
          'error_message', 'Einlösezeit abgelaufen'
        );
    end if;
    if points_record.status <> 'REDEMPTION_STARTED' then
      return jsonb_build_object(
        'success', false,
        'error_code', 'REDEMPTION_NOT_AVAILABLE',
        'error_message', 'Diese Einlösung ist nicht verfügbar.'
      );
    end if;

    select reward.* into reward_record
    from public.rewards reward
    where reward.id = points_record.reward_id
      and reward.restaurant_id = points_record.restaurant_id
      and reward.branch_id is not distinct from points_record.branch_id
      and reward.active = true
      and not reward.is_starter_reward
      and (reward.expires_at is null or reward.expires_at > confirmed_at_value);
    if reward_record.id is null then
      return jsonb_build_object(
        'success', false,
        'error_code', 'POINT_REWARD_NOT_AVAILABLE',
        'error_message', 'Diese Punkteeinlösung ist nicht mehr verfügbar.'
      );
    end if;

    update public.customers customer
    set points_balance = customer.points_balance - points_record.points_spent,
        stamp_balance = customer.stamp_balance - points_record.stamps_spent
    where customer.id = points_record.customer_id
      and customer.restaurant_id = points_record.restaurant_id
      and customer.points_balance >= points_record.points_spent
      and customer.stamp_balance >= points_record.stamps_spent
    returning customer.points_balance, customer.stamp_balance into next_points, next_stamps;
    if next_points is null then
      return jsonb_build_object(
        'success', false,
        'error_code', 'POINT_REWARD_BALANCE_INSUFFICIENT',
        'error_message', 'Du hast noch nicht genug Punkte.'
      );
    end if;

    insert into public.reward_redemption_events (
      restaurant_id, organization_id, branch_id, customer_id, reward_id,
      points_spent, stamps_spent, status, started_at, completed_at, redeemed_at, metadata
    ) values (
      points_record.restaurant_id, points_record.organization_id, points_record.branch_id,
      points_record.customer_id, points_record.reward_id, points_record.points_spent,
      points_record.stamps_spent, 'redeemed', points_record.activated_at,
      confirmed_at_value, confirmed_at_value,
      jsonb_build_object(
        'customer_confirmation', input_method = 'CUSTOMER_SWIPE_AFTER_PIN',
        'confirmation_method', input_method,
        'confirmation_idempotency_key', input_idempotency_key,
        'presentation_id', points_record.id
      )
    ) returning id into event_id_value;

    if points_record.points_spent > 0 then
      insert into public.points_transactions (
        restaurant_id, organization_id, branch_id, customer_id, type, points,
        reason, idempotency_key, collection_source
      ) values (
        points_record.restaurant_id, points_record.organization_id, points_record.branch_id,
        points_record.customer_id, 'redeem', -points_record.points_spent,
        'Punkteeinlösung per Kundenbestätigung', input_idempotency_key,
        case when actor_role_value = 'CUSTOMER' then 'customer_swipe' else 'staff_approval' end
      ) returning id into transaction_id_value;
    end if;

    update public.points_redemption_presentations
    set status = 'REDEEMED',
        redeemed_at = confirmed_at_value,
        completed_at = confirmed_at_value,
        confirmation_idempotency_key = input_idempotency_key,
        redemption_event_id = event_id_value,
        points_transaction_id = transaction_id_value
    where id = points_record.id
      and status = 'REDEMPTION_STARTED'
      and expires_at > confirmed_at_value;
    if not found then
      raise exception using errcode = '40001', message = 'REDEMPTION_CONFIRMATION_RACE_LOST';
    end if;

    audit_id_value := public.write_audit_event(
      points_record.restaurant_id, points_record.customer_id, case when actor_role_value = 'CUSTOMER' then 'customer' when actor_role_value = 'OWNER' then 'admin' else 'staff' end,
      case when actor_role_value = 'CUSTOMER' then points_record.customer_id else input_actor_user_id end,
      'POINT_REDEMPTION_SECURE_CONFIRMED', 'completed', case when actor_role_value = 'CUSTOMER' then 'customer_portal' else 'staff_portal' end,
      'points_redemption_presentations', points_record.id, input_idempotency_key,
      jsonb_build_object(
        'reward_id', points_record.reward_id,
        'redemption_event_id', event_id_value,
        'points_spent', points_record.points_spent,
        'stamps_spent', points_record.stamps_spent,
        'confirmation_method', input_method,
        'redeemed_at', confirmed_at_value
      )
    );

    activity_number_value := 'WXB-'
      || to_char(confirmed_at_value at time zone 'Europe/Vienna', 'YYYY')
      || '-' || lpad(nextval('public.redemption_activity_number_seq')::text, 8, '0');
    insert into public.redemption_activity_journal (
      activity_number, restaurant_id, organization_id, branch_id, customer_id,
      customer_reference, source_type, source_id, reward_id, reward_type,
      reward_name_snapshot, reward_description_snapshot, points_spent, quantity,
      redeemed_at, redeemed_by, actor_role, redemption_code_reference, status,
      audit_reference, snapshot_completeness, is_test_event
    ) values (
      activity_number_value, points_record.restaurant_id, points_record.organization_id,
      points_record.branch_id, points_record.customer_id,
      left(encode(extensions.digest(points_record.customer_id::text, 'sha256'), 'hex'), 16),
      'points_presentation', points_record.id, points_record.reward_id, 'POINT_REWARD',
      reward_record.title, reward_record.description, points_record.points_spent, 1,
      confirmed_at_value, case when actor_role_value = 'CUSTOMER' then points_record.customer_id else input_actor_user_id end,
      lower(actor_role_value), points_record.public_reference,
      'ACTIVE', audit_id_value, 'complete', coalesce(customer_record.is_test_customer, false)
    ) on conflict (source_type, source_id) do nothing;

    update public.secure_redemption_requests
    set status = 'REDEEMED', completed_at = confirmed_at_value,
        confirmation_idempotency_key = input_idempotency_key,
        confirmation_method = input_method, confirmed_by = input_actor_user_id
    where id = secure_record.id and status = secure_record.status;
    if not found then raise exception using errcode = '40001', message = 'REDEMPTION_CONFIRMATION_RACE_LOST'; end if;
    insert into public.secure_redemption_audit (
      redemption_id, event_type, actor_role, actor_user_id, request_id, correlation_id, metadata
    ) values (secure_record.id, 'REDEEMED', actor_role_value, input_actor_user_id,
      input_request_id, input_correlation_id,
      jsonb_build_object('confirmation_method', input_method));
    return public.points_presentation_payload(points_record.id, confirmed_at_value)
      || jsonb_build_object(
        'redemption_id', secure_record.id, 'status', 'REDEEMED', 'confirmation_method', input_method,
        'success', true,
        'already_confirmed', false,
        'points_balance', next_points,
        'stamp_balance', next_stamps
      );
  end if;

  select presentation.* into gift_presentation_record
  from public.gift_redemption_presentations presentation
  where presentation.id = input_presentation_id
    and presentation.restaurant_id = customer_record.restaurant_id
    and presentation.customer_id = customer_record.id
    and presentation.branch_id is not distinct from token_record.branch_id
  for update;
  if gift_presentation_record.id is null
    or gift_presentation_record.reward_id <> secure_record.reward_id
    or gift_presentation_record.customer_reward_id <> secure_record.source_id then
    return jsonb_build_object(
      'success', false,
      'error_code', 'REDEMPTION_NOT_AVAILABLE',
      'error_message', 'Diese Einlösung ist nicht verfügbar.'
    );
  end if;

  if gift_presentation_record.status = 'REDEEMED' then
    return public.gift_presentation_payload(gift_presentation_record.id, confirmed_at_value)
      || jsonb_build_object(
        'success', gift_presentation_record.confirmation_idempotency_key = input_idempotency_key,
        'already_confirmed', gift_presentation_record.confirmation_idempotency_key = input_idempotency_key,
        'error_code', case when gift_presentation_record.confirmation_idempotency_key = input_idempotency_key
          then null else 'ALREADY_REDEEMED' end,
        'error_message', case when gift_presentation_record.confirmation_idempotency_key = input_idempotency_key
          then null else 'Bereits eingelöst' end
      );
  end if;
  if gift_presentation_record.status = 'EXPIRED'
    or gift_presentation_record.expires_at <= confirmed_at_value then
    update public.secure_redemption_requests
    set status = 'EXPIRED', completed_at = confirmed_at_value
    where id = secure_record.id and status in ('REQUESTED', 'PIN_VERIFIED');
    update public.gift_redemption_presentations
    set status = 'EXPIRED', expired_at = coalesce(expired_at, confirmed_at_value),
        completed_at = coalesce(completed_at, confirmed_at_value)
    where id = gift_presentation_record.id and status = 'REDEMPTION_STARTED';
    update public.customer_rewards gift
    set status = case
          when gift.valid_until is not null and gift.valid_until <= confirmed_at_value then 'expired'
          else 'active'
        end,
        redemption_started_at = null
    where gift.id = gift_presentation_record.customer_reward_id
      and gift.status = 'redemption_started';
    return public.gift_presentation_payload(gift_presentation_record.id, confirmed_at_value)
      || jsonb_build_object(
        'success', false,
        'error_code', 'REDEMPTION_WINDOW_EXPIRED',
        'error_message', 'Einlösezeit abgelaufen'
      );
  end if;
  if gift_presentation_record.status <> 'REDEMPTION_STARTED' then
    return jsonb_build_object(
      'success', false,
      'error_code', 'REDEMPTION_NOT_AVAILABLE',
      'error_message', 'Diese Einlösung ist nicht verfügbar.'
    );
  end if;

  select gift.* into gift_record
  from public.customer_rewards gift
  where gift.id = gift_presentation_record.customer_reward_id
    and gift.restaurant_id = gift_presentation_record.restaurant_id
    and gift.customer_id = gift_presentation_record.customer_id
    and gift.reward_id = gift_presentation_record.reward_id
    and gift.gift_type in ('welcome', 'birthday')
    and gift.status = 'redemption_started'
  for update;
  if gift_record.id is null
    or (gift_record.valid_from is not null and gift_record.valid_from > confirmed_at_value)
    or (gift_record.valid_until is not null and gift_record.valid_until <= confirmed_at_value) then
    return jsonb_build_object(
      'success', false,
      'error_code', 'GIFT_NOT_AVAILABLE',
      'error_message', 'Dieses Geschenk ist nicht mehr verfügbar.'
    );
  end if;

  select reward.* into reward_record
  from public.rewards reward
  where reward.id = gift_record.reward_id
    and reward.restaurant_id = gift_record.restaurant_id
    and reward.active = true
    and reward.is_starter_reward = true
    and (reward.expires_at is null or reward.expires_at > confirmed_at_value);
  if reward_record.id is null then
    return jsonb_build_object(
      'success', false,
      'error_code', 'GIFT_NOT_AVAILABLE',
      'error_message', 'Dieses Geschenk ist nicht mehr verfügbar.'
    );
  end if;

  update public.customer_rewards
  set status = 'redeemed', redeemed_at = confirmed_at_value
  where id = gift_record.id
    and restaurant_id = gift_record.restaurant_id
    and customer_id = gift_record.customer_id
    and status = 'redemption_started';
  if not found then
    return jsonb_build_object(
      'success', false,
      'error_code', 'ALREADY_REDEEMED',
      'error_message', 'Bereits eingelöst'
    );
  end if;

  update public.gift_redemption_presentations
  set status = 'REDEEMED',
      redeemed_at = confirmed_at_value,
      completed_at = confirmed_at_value,
      confirmation_idempotency_key = input_idempotency_key
  where id = gift_presentation_record.id
    and status = 'REDEMPTION_STARTED'
    and expires_at > confirmed_at_value;
  if not found then
    raise exception using errcode = '40001', message = 'REDEMPTION_CONFIRMATION_RACE_LOST';
  end if;

  audit_id_value := public.write_audit_event(
    gift_presentation_record.restaurant_id, gift_presentation_record.customer_id,
    case when actor_role_value = 'CUSTOMER' then 'customer' when actor_role_value = 'OWNER' then 'admin' else 'staff' end,
    case when actor_role_value = 'CUSTOMER' then gift_presentation_record.customer_id else input_actor_user_id end,
    'GIFT_REDEMPTION_SECURE_CONFIRMED', 'completed', case when actor_role_value = 'CUSTOMER' then 'customer_portal' else 'staff_portal' end,
    'gift_redemption_presentations', gift_presentation_record.id, input_idempotency_key,
    jsonb_build_object(
      'reward_id', gift_presentation_record.reward_id,
      'customer_reward_id', gift_presentation_record.customer_reward_id,
      'gift_type', gift_record.gift_type,
      'confirmation_method', input_method,
      'redeemed_at', confirmed_at_value
    )
  );

  activity_number_value := 'WXB-'
    || to_char(confirmed_at_value at time zone 'Europe/Vienna', 'YYYY')
    || '-' || lpad(nextval('public.redemption_activity_number_seq')::text, 8, '0');
  insert into public.redemption_activity_journal (
    activity_number, restaurant_id, organization_id, branch_id, customer_id,
    customer_reference, source_type, source_id, reward_id, reward_type,
    reward_name_snapshot, reward_description_snapshot, points_spent, quantity,
    redeemed_at, redeemed_by, actor_role, redemption_code_reference, status,
    audit_reference, snapshot_completeness, is_test_event
  ) values (
    activity_number_value, gift_presentation_record.restaurant_id,
    gift_presentation_record.organization_id, gift_presentation_record.branch_id,
    gift_presentation_record.customer_id,
    left(encode(extensions.digest(gift_presentation_record.customer_id::text, 'sha256'), 'hex'), 16),
    'gift_presentation', gift_presentation_record.id, gift_presentation_record.reward_id,
    case when gift_record.gift_type = 'birthday' then 'BIRTHDAY_GIFT' else 'WELCOME_GIFT' end,
    reward_record.title, reward_record.description, 0, 1, confirmed_at_value,
    case when actor_role_value = 'CUSTOMER' then gift_presentation_record.customer_id else input_actor_user_id end,
    lower(actor_role_value), gift_presentation_record.public_reference,
    'ACTIVE', audit_id_value, 'complete', coalesce(customer_record.is_test_customer, false)
  ) on conflict (source_type, source_id) do nothing;

  update public.secure_redemption_requests
  set status = 'REDEEMED', completed_at = confirmed_at_value,
      confirmation_idempotency_key = input_idempotency_key,
      confirmation_method = input_method, confirmed_by = input_actor_user_id
  where id = secure_record.id and status = secure_record.status;
  if not found then raise exception using errcode = '40001', message = 'REDEMPTION_CONFIRMATION_RACE_LOST'; end if;
  insert into public.secure_redemption_audit (
    redemption_id, event_type, actor_role, actor_user_id, request_id, correlation_id, metadata
  ) values (secure_record.id, 'REDEEMED', actor_role_value, input_actor_user_id,
    input_request_id, input_correlation_id,
    jsonb_build_object('confirmation_method', input_method));
  return public.gift_presentation_payload(gift_presentation_record.id, confirmed_at_value)
    || jsonb_build_object('redemption_id', secure_record.id, 'status', 'REDEEMED',
      'confirmation_method', input_method, 'success', true, 'already_confirmed', false);
end;
$$;

revoke all on function public.secure_redemption_finalize(uuid, text, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.secure_redemption_edge_mutate(
  input_actor_user_id uuid, input_payload jsonb
) returns jsonb language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare
  action_value text := input_payload->>'action';
  request_id_value uuid := (input_payload->>'request_id')::uuid;
  correlation_id_value uuid := (input_payload->>'correlation_id')::uuid;
  idempotency_key_value uuid := (input_payload->>'idempotency_key')::uuid;
  redemption_id_value uuid;
  entitlement_id_value uuid;
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  customer_id_value uuid;
  account_id_value uuid;
  reward_record public.rewards%rowtype;
  gift_record public.customer_rewards%rowtype;
  gift_presentation public.gift_redemption_presentations%rowtype;
  secure_record public.secure_redemption_requests%rowtype;
  pin_record public.redemption_confirmation_pins%rowtype;
  role_value text;
  now_value timestamptz := statement_timestamp();
  source_value text;
  presentation_id_value uuid;
  last_request_at timestamptz;
  local_day_value date;
  timezone_value text;
  pin_value text;
  random_bytes bytea;
  random_number bigint;
  attempt_count_value integer;
  prior_attempt public.secure_redemption_pin_attempts%rowtype;
begin
  if auth.role() is distinct from 'service_role' or input_actor_user_id is null
    or input_payload is null or request_id_value is null or correlation_id_value is null
    or idempotency_key_value is null then
    raise exception using errcode = '42501', message = 'REDEMPTION_EDGE_REQUIRED';
  end if;
  if action_value not in ('start', 'verify_pin', 'swipe', 'approve', 'reject', 'cancel', 'rotate_pin') then
    raise exception using errcode = '22023', message = 'REDEMPTION_REQUEST_INVALID';
  end if;

  if action_value in ('start', 'rotate_pin') then
    select * into restaurant_record from public.restaurants r
    where r.slug = input_payload->>'restaurant_slug' and r.status = 'active';
    if restaurant_record.id is null or restaurant_record.primary_branch_id is null then
      raise exception using errcode = '42501', message = 'REDEMPTION_NOT_AVAILABLE';
    end if;
    role_value := public.secure_redemption_actor_role(input_actor_user_id,
      restaurant_record.id, restaurant_record.primary_branch_id);

    if action_value = 'rotate_pin' then
      if role_value is distinct from 'OWNER' then
        raise exception using errcode = '42501', message = 'REDEMPTION_OWNER_REQUIRED';
      end if;
      perform pg_advisory_xact_lock(hashtextextended(
        'redemption-pin:' || restaurant_record.id::text || ':' || restaurant_record.primary_branch_id::text, 0));
      timezone_value := public.secure_redemption_timezone(restaurant_record.id);
      local_day_value := (now_value at time zone timezone_value)::date;
      random_bytes := extensions.gen_random_bytes(4);
      random_number := get_byte(random_bytes, 0)::bigint * 16777216
        + get_byte(random_bytes, 1)::bigint * 65536
        + get_byte(random_bytes, 2)::bigint * 256
        + get_byte(random_bytes, 3)::bigint;
      pin_value := lpad((random_number % 1000000)::text, 6, '0');
      insert into public.redemption_confirmation_pins (
        restaurant_id, branch_id, local_day, pin_hash, expires_at, created_by
      ) values (
        restaurant_record.id, restaurant_record.primary_branch_id, local_day_value,
        extensions.crypt(pin_value, extensions.gen_salt('bf', 12)),
        (local_day_value + 1)::timestamp at time zone timezone_value, input_actor_user_id
      ) on conflict (restaurant_id, branch_id, local_day) do update
        set pin_hash = excluded.pin_hash,
            generation = public.redemption_confirmation_pins.generation + 1,
            expires_at = excluded.expires_at,
            rotated_at = now_value, created_by = input_actor_user_id;
      -- This is the only plaintext disclosure. No audit, table or log receives it.
      return jsonb_build_object('success', true, 'pin', pin_value,
        'valid_until', (local_day_value + 1)::timestamp at time zone timezone_value);
    end if;

    if role_value is distinct from 'CUSTOMER' then
      raise exception using errcode = '42501', message = 'REDEMPTION_CUSTOMER_REQUIRED';
    end if;
    perform public.require_restaurant_operational(restaurant_record.id,
      'secure_redemption_start');
    source_value := input_payload->>'source_type';
    entitlement_id_value := (input_payload->>'entitlement_id')::uuid;
    if source_value not in ('points', 'gift') or entitlement_id_value is null then
      raise exception using errcode = '22023', message = 'REDEMPTION_REQUEST_INVALID';
    end if;
    select a.id, c.id into account_id_value, customer_id_value
    from public.customer_accounts a
    join public.customer_account_memberships m on m.account_id = a.id
    join public.customers c on c.id = m.customer_id and c.restaurant_id = m.restaurant_id
    where a.auth_user_id = input_actor_user_id and a.disabled_at is null
      and m.restaurant_id = restaurant_record.id
      and coalesce(c.branch_id, restaurant_record.primary_branch_id) = restaurant_record.primary_branch_id
      and c.membership_status = 'active';
    select * into customer_record from public.customers where id = customer_id_value;
    if customer_record.id is null then
      raise exception using errcode = '42501', message = 'REDEMPTION_CUSTOMER_REQUIRED';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'secure-redemption-start:' || customer_record.id::text || ':' || restaurant_record.id::text, 0));
    select * into secure_record from public.secure_redemption_requests
    where actor_user_id = input_actor_user_id and start_idempotency_key = idempotency_key_value;
    if secure_record.id is not null then
      if secure_record.source_type <> source_value or secure_record.source_id <> entitlement_id_value
        or secure_record.restaurant_id <> restaurant_record.id
        or secure_record.request_id <> request_id_value
        or secure_record.correlation_id <> correlation_id_value then
        return jsonb_build_object('success', false, 'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
      end if;
      return jsonb_build_object('success', true, 'already_started', true,
        'redemption_id', secure_record.id, 'status', secure_record.status,
        'expires_at', secure_record.expires_at, 'correlation_id', secure_record.correlation_id);
    end if;
    update public.secure_redemption_requests
    set status = 'EXPIRED', completed_at = now_value
    where customer_id = customer_record.id and restaurant_id = restaurant_record.id
      and status in ('REQUESTED', 'PIN_VERIFIED') and expires_at <= now_value;
    select max(completed_at) into last_request_at from public.secure_redemption_requests
    where customer_id = customer_record.id and restaurant_id = restaurant_record.id
      and status in ('CANCELLED', 'REJECTED', 'EXPIRED');
    if last_request_at is not null and last_request_at + interval '60 seconds' > now_value then
      return jsonb_build_object('success', false, 'error_code', 'REDEMPTION_RETRY_COOLDOWN');
    end if;
    if (select count(*) from public.secure_redemption_requests
      where customer_id = customer_record.id and restaurant_id = restaurant_record.id
        and requested_at > now_value - interval '1 hour') >= 5 then
      return jsonb_build_object('success', false, 'error_code', 'REDEMPTION_REQUEST_RATE_LIMIT');
    end if;
    if exists (select 1 from public.secure_redemption_requests
      where customer_id = customer_record.id and restaurant_id = restaurant_record.id
        and branch_id = restaurant_record.primary_branch_id
        and source_type = source_value and source_id = entitlement_id_value
        and status in ('REQUESTED', 'PIN_VERIFIED')) then
      return jsonb_build_object('success', false, 'error_code', 'REDEMPTION_ALREADY_REQUESTED');
    end if;
    if source_value = 'points' then
      update public.points_redemption_presentations
      set status = 'EXPIRED', expired_at = coalesce(expired_at, now_value),
        completed_at = coalesce(completed_at, now_value)
      where restaurant_id = restaurant_record.id and customer_id = customer_record.id
        and reward_id = entitlement_id_value and status = 'REDEMPTION_STARTED'
        and expires_at <= now_value;
      select * into reward_record from public.rewards r
      where r.id = entitlement_id_value and r.restaurant_id = restaurant_record.id
        and r.branch_id is not distinct from restaurant_record.primary_branch_id
        and r.active and not r.is_starter_reward
        and (r.expires_at is null or r.expires_at > now_value);
      if reward_record.id is null or customer_record.points_balance < reward_record.required_points
        or customer_record.stamp_balance < reward_record.required_stamps then
        return jsonb_build_object('success', false, 'error_code', 'POINT_REWARD_NOT_AVAILABLE');
      end if;
      if exists (select 1 from public.points_redemption_presentations p
        where p.restaurant_id = restaurant_record.id and p.customer_id = customer_record.id
          and p.reward_id = reward_record.id and p.status = 'REDEMPTION_STARTED'
          and p.expires_at > now_value) then
        return jsonb_build_object('success', false, 'error_code', 'LEGACY_CONFIRMATION_REQUIRED');
      end if;
      presentation_id_value := extensions.gen_random_uuid();
      insert into public.points_redemption_presentations (
        id, restaurant_id, organization_id, branch_id, customer_id, reward_id,
        redemption_event_id, points_transaction_id, idempotency_key, public_reference,
        status, points_spent, stamps_spent, activated_at, expires_at
      ) values (
        presentation_id_value, restaurant_record.id, restaurant_record.organization_id,
        restaurant_record.primary_branch_id, customer_record.id, reward_record.id,
        null, null, idempotency_key_value,
        'WXP-' || upper(left(replace(presentation_id_value::text, '-', ''), 10)),
        'REDEMPTION_STARTED', reward_record.required_points, reward_record.required_stamps,
        now_value, now_value + interval '15 minutes'
      );
    else
      update public.gift_redemption_presentations p
      set status = 'EXPIRED', expired_at = coalesce(p.expired_at, now_value),
        completed_at = coalesce(p.completed_at, now_value)
      where p.customer_reward_id = entitlement_id_value
        and p.restaurant_id = restaurant_record.id and p.customer_id = customer_record.id
        and p.status = 'REDEMPTION_STARTED' and p.expires_at <= now_value;
      update public.customer_rewards g
      set status = case when g.valid_until is not null and g.valid_until <= now_value
        then 'expired' else 'active' end, redemption_started_at = null
      where g.id = entitlement_id_value and g.restaurant_id = restaurant_record.id
        and g.customer_id = customer_record.id and g.status = 'redemption_started'
        and exists (select 1 from public.gift_redemption_presentations p
          where p.customer_reward_id = g.id and p.status = 'EXPIRED');
      select * into gift_record from public.customer_rewards g
      where g.id = entitlement_id_value and g.restaurant_id = restaurant_record.id
        and g.customer_id = customer_record.id and g.branch_id is not distinct from restaurant_record.primary_branch_id
        and g.gift_type in ('welcome', 'birthday') and g.status = 'active'
        and (g.valid_from is null or g.valid_from <= now_value)
        and (g.valid_until is null or g.valid_until > now_value)
      for update;
      if gift_record.id is null then
        return jsonb_build_object('success', false, 'error_code', 'GIFT_NOT_AVAILABLE');
      end if;
      select * into reward_record from public.rewards r
      where r.id = gift_record.reward_id and r.restaurant_id = restaurant_record.id
        and r.active and r.is_starter_reward
        and (r.expires_at is null or r.expires_at > now_value);
      if reward_record.id is null then
        return jsonb_build_object('success', false, 'error_code', 'GIFT_NOT_AVAILABLE');
      end if;
      select * into gift_presentation from public.gift_redemption_presentations p
      where p.customer_reward_id = gift_record.id for update;
      if gift_presentation.id is not null and gift_presentation.status = 'REDEMPTION_STARTED' then
        return jsonb_build_object('success', false, 'error_code', 'LEGACY_CONFIRMATION_REQUIRED');
      end if;
      presentation_id_value := coalesce(gift_presentation.id, extensions.gen_random_uuid());
      update public.customer_rewards set status = 'redemption_started', redemption_started_at = now_value
      where id = gift_record.id and status = 'active';
      if gift_presentation.id is null then
        insert into public.gift_redemption_presentations (
          id, restaurant_id, organization_id, branch_id, customer_id, reward_id,
          customer_reward_id, idempotency_key, public_reference, status, activated_at, expires_at
        ) values (
          presentation_id_value, restaurant_record.id, restaurant_record.organization_id,
          restaurant_record.primary_branch_id, customer_record.id, gift_record.reward_id,
          gift_record.id, idempotency_key_value,
          'WXG-' || upper(left(replace(presentation_id_value::text, '-', ''), 10)),
          'REDEMPTION_STARTED', now_value, now_value + interval '15 minutes'
        );
      else
        update public.gift_redemption_presentations
        set idempotency_key = idempotency_key_value, status = 'REDEMPTION_STARTED',
          activated_at = now_value, expires_at = now_value + interval '15 minutes',
          completed_at = null, expired_at = null, redeemed_at = null,
          confirmation_idempotency_key = null
        where id = gift_presentation.id and status = 'EXPIRED';
        if not found then raise exception using errcode = '40001', message = 'REDEMPTION_START_RACE_LOST'; end if;
      end if;
    end if;
    insert into public.secure_redemption_requests (
      restaurant_id, organization_id, branch_id, customer_id, account_id, actor_user_id,
      source_type, source_id, reward_id, entitlement_id, presentation_id,
      requested_at, expires_at, request_id, correlation_id, start_idempotency_key
    ) values (
      restaurant_record.id, restaurant_record.organization_id, restaurant_record.primary_branch_id,
      customer_record.id, account_id_value, input_actor_user_id, source_value,
      entitlement_id_value, reward_record.id, entitlement_id_value, presentation_id_value,
      now_value, now_value + interval '15 minutes', request_id_value,
      correlation_id_value, idempotency_key_value
    ) returning * into secure_record;
    insert into public.secure_redemption_audit (
      redemption_id, event_type, actor_role, actor_user_id, request_id, correlation_id
    ) values (secure_record.id, 'REQUESTED', 'CUSTOMER', input_actor_user_id,
      request_id_value, correlation_id_value);
    return jsonb_build_object('success', true, 'redemption_id', secure_record.id,
      'status', 'REQUESTED', 'requested_at', now_value,
      'expires_at', secure_record.expires_at, 'correlation_id', secure_record.correlation_id);
  end if;

  redemption_id_value := (input_payload->>'redemption_id')::uuid;
  if redemption_id_value is null then
    raise exception using errcode = '22023', message = 'REDEMPTION_REQUEST_INVALID';
  end if;
  select * into secure_record from public.secure_redemption_requests
  where id = redemption_id_value for update;
  if secure_record.id is null or secure_record.correlation_id <> correlation_id_value then
    raise exception using errcode = '42501', message = 'REDEMPTION_NOT_AVAILABLE';
  end if;
  role_value := public.secure_redemption_actor_role(input_actor_user_id,
    secure_record.restaurant_id, secure_record.branch_id);
  if role_value is null then
    raise exception using errcode = '42501', message = 'REDEMPTION_NOT_AVAILABLE';
  end if;
  if action_value in ('verify_pin', 'swipe', 'cancel')
    and (role_value <> 'CUSTOMER' or secure_record.actor_user_id <> input_actor_user_id) then
    raise exception using errcode = '42501', message = 'REDEMPTION_CUSTOMER_REQUIRED';
  end if;
  if action_value in ('approve', 'reject') and role_value not in ('STAFF', 'OWNER') then
    raise exception using errcode = '42501', message = 'REDEMPTION_STAFF_REQUIRED';
  end if;
  if secure_record.expires_at <= now_value and secure_record.status in ('REQUESTED', 'PIN_VERIFIED') then
    update public.secure_redemption_requests set status = 'EXPIRED', completed_at = now_value
    where id = secure_record.id;
    return jsonb_build_object('success', false, 'error_code', 'REDEMPTION_WINDOW_EXPIRED');
  end if;
  if action_value = 'verify_pin' then
    if secure_record.status <> 'REQUESTED' or secure_record.failed_pin_attempts >= 5 then
      return jsonb_build_object('success', false, 'error_code', 'REDEMPTION_PIN_INVALID');
    end if;
    if input_payload->>'pin' !~ '^[0-9]{6}$' then
      raise exception using errcode = '22023', message = 'REDEMPTION_REQUEST_INVALID';
    end if;
    select * into prior_attempt from public.secure_redemption_pin_attempts
    where redemption_id = secure_record.id and idempotency_key = idempotency_key_value;
    if prior_attempt.id is not null then
      return jsonb_build_object('success', prior_attempt.successful,
        'status', case when prior_attempt.successful then 'PIN_VERIFIED' else 'REQUESTED' end,
        'error_code', case when prior_attempt.successful then null else 'REDEMPTION_PIN_INVALID' end);
    end if;
    perform pg_advisory_xact_lock(hashtextextended(
      'redemption-pin-rate:' || input_actor_user_id::text || ':' || secure_record.restaurant_id::text
        || ':' || secure_record.branch_id::text, 0));
    select count(*) into attempt_count_value from public.secure_redemption_pin_attempts
    where actor_user_id = input_actor_user_id and restaurant_id = secure_record.restaurant_id
      and branch_id = secure_record.branch_id and attempted_at > now_value - interval '1 hour';
    if attempt_count_value >= 20 then
      return jsonb_build_object('success', false, 'error_code', 'REDEMPTION_PIN_RATE_LIMIT');
    end if;
    timezone_value := public.secure_redemption_timezone(secure_record.restaurant_id);
    local_day_value := (now_value at time zone timezone_value)::date;
    select * into pin_record from public.redemption_confirmation_pins pin
    where pin.restaurant_id = secure_record.restaurant_id and pin.branch_id = secure_record.branch_id
      and pin.local_day = local_day_value and pin.expires_at > now_value;
    if pin_record.pin_hash is not null
      and extensions.crypt(input_payload->>'pin', pin_record.pin_hash) = pin_record.pin_hash then
      insert into public.secure_redemption_pin_attempts (
        redemption_id, idempotency_key, actor_user_id, restaurant_id, branch_id, successful
      ) values (secure_record.id, idempotency_key_value, input_actor_user_id,
        secure_record.restaurant_id, secure_record.branch_id, true);
      update public.secure_redemption_requests
      set status = 'PIN_VERIFIED', pin_verified_at = now_value, pin_generation = pin_record.generation
      where id = secure_record.id and status = 'REQUESTED';
      insert into public.secure_redemption_audit (
        redemption_id, event_type, actor_role, actor_user_id, request_id, correlation_id
      ) values (secure_record.id, 'PIN_VERIFIED', 'CUSTOMER', input_actor_user_id,
        request_id_value, correlation_id_value);
      return jsonb_build_object('success', true, 'status', 'PIN_VERIFIED',
        'redemption_id', secure_record.id, 'expires_at', secure_record.expires_at);
    end if;
    insert into public.secure_redemption_pin_attempts (
      redemption_id, idempotency_key, actor_user_id, restaurant_id, branch_id, successful
    ) values (secure_record.id, idempotency_key_value, input_actor_user_id,
      secure_record.restaurant_id, secure_record.branch_id, false);
    update public.secure_redemption_requests
    set failed_pin_attempts = failed_pin_attempts + 1, last_error_code = 'REDEMPTION_PIN_INVALID'
    where id = secure_record.id and failed_pin_attempts < 5;
    insert into public.secure_redemption_audit (
      redemption_id, event_type, actor_role, actor_user_id, request_id, correlation_id
    ) values (secure_record.id, 'PIN_REJECTED', 'CUSTOMER', input_actor_user_id,
      request_id_value, correlation_id_value);
    return jsonb_build_object('success', false, 'error_code', 'REDEMPTION_PIN_INVALID');
  end if;
  if action_value in ('swipe', 'approve') then
    return public.secure_redemption_finalize(secure_record.id,
      case when action_value = 'swipe' then 'CUSTOMER_SWIPE_AFTER_PIN'
        when role_value = 'OWNER' then 'OWNER_APPROVAL' else 'STAFF_APPROVAL' end,
      input_actor_user_id, idempotency_key_value, request_id_value, correlation_id_value);
  end if;
  if action_value = 'cancel' and secure_record.status not in ('REQUESTED', 'PIN_VERIFIED')
    or action_value = 'reject' and secure_record.status <> 'REQUESTED' then
    return jsonb_build_object('success', false, 'error_code', 'REDEMPTION_NOT_AVAILABLE');
  end if;
  update public.secure_redemption_requests
  set status = case when action_value = 'cancel' then 'CANCELLED' else 'REJECTED' end,
    completed_at = now_value, confirmed_by = input_actor_user_id
  where id = secure_record.id and status = secure_record.status;
  if secure_record.source_type = 'points' then
    update public.points_redemption_presentations
    set status = 'CANCELLED', cancelled_at = now_value,
      cancelled_by = input_actor_user_id, cancellation_reason = 'Secure redemption request closed'
    where id = secure_record.presentation_id and status = 'REDEMPTION_STARTED';
  else
    update public.gift_redemption_presentations
    set status = 'EXPIRED', expired_at = now_value, completed_at = now_value
    where id = secure_record.presentation_id and status = 'REDEMPTION_STARTED';
    update public.customer_rewards
    set status = case when valid_until is not null and valid_until <= now_value then 'expired' else 'active' end,
      redemption_started_at = null
    where id = secure_record.source_id and status = 'redemption_started';
  end if;
  insert into public.secure_redemption_audit (
    redemption_id, event_type, actor_role, actor_user_id, request_id, correlation_id
  ) values (secure_record.id, case when action_value = 'cancel' then 'CANCELLED' else 'REJECTED' end,
    role_value, input_actor_user_id, request_id_value, correlation_id_value);
  return jsonb_build_object('success', true,
    'status', case when action_value = 'cancel' then 'CANCELLED' else 'REJECTED' end,
    'redemption_id', secure_record.id);
end;
$$;
revoke all on function public.secure_redemption_edge_mutate(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.secure_redemption_edge_mutate(uuid, jsonb) to service_role;

create or replace function public.get_secure_redemption_status(
  input_restaurant_slug text, input_redemption_id uuid default null
)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  request_record public.secure_redemption_requests%rowtype;
  reward_record public.rewards%rowtype;
  now_value timestamptz := statement_timestamp();
begin
  if auth.uid() is null or input_restaurant_slug is null then
    raise exception using errcode = '42501', message = 'CUSTOMER_AUTH_REQUIRED';
  end if;
  select * into request_record from public.secure_redemption_requests
  where actor_user_id = auth.uid()
    and restaurant_id = (select id from public.restaurants
      where slug = input_restaurant_slug and status = 'active')
    and (id = input_redemption_id or (input_redemption_id is null
      and status in ('REQUESTED', 'PIN_VERIFIED') and expires_at > now_value))
  order by requested_at desc limit 1;
  if request_record.id is null
    or public.secure_redemption_actor_role(auth.uid(), request_record.restaurant_id,
      request_record.branch_id) is distinct from 'CUSTOMER' then
    return jsonb_build_object('found', false);
  end if;
  select * into reward_record from public.rewards
  where id = request_record.reward_id and restaurant_id = request_record.restaurant_id;
  return jsonb_build_object(
    'found', true, 'redemption_id', request_record.id,
    'presentation_id', request_record.presentation_id,
    'presentation_type', request_record.source_type,
    'status', case when request_record.status in ('REQUESTED', 'PIN_VERIFIED')
      and request_record.expires_at <= now_value then 'EXPIRED' else request_record.status end,
    'active', request_record.status in ('REQUESTED', 'PIN_VERIFIED')
      and request_record.expires_at > now_value,
    'requested_at', request_record.requested_at,
    'expires_at', request_record.expires_at,
    'server_now', now_value,
    'correlation_id', request_record.correlation_id,
    'reward_id', request_record.reward_id,
    'source_id', request_record.source_id,
    'reward_title', reward_record.title,
    'reward_description', reward_record.description,
    'reward_image_url', reward_record.image_url,
    'image_zoom', reward_record.image_zoom,
    'image_position_x', reward_record.image_position_x,
    'image_position_y', reward_record.image_position_y,
    'image_aspect_ratio', reward_record.image_aspect_ratio,
    'image_crop_version', reward_record.image_crop_version,
    'confirmation_method', request_record.confirmation_method
  );
end;
$$;
revoke all on function public.get_secure_redemption_status(text, uuid)
  from public, anon, authenticated;
grant execute on function public.get_secure_redemption_status(text, uuid) to authenticated;

create or replace function public.get_secure_redemption_queue(input_restaurant_slug text)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  restaurant_record public.restaurants%rowtype;
  role_value text;
  now_value timestamptz := statement_timestamp();
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'REDEMPTION_STAFF_REQUIRED';
  end if;
  select * into restaurant_record from public.restaurants
  where slug = input_restaurant_slug and status = 'active';
  if restaurant_record.id is null then
    raise exception using errcode = '42501', message = 'REDEMPTION_STAFF_REQUIRED';
  end if;
  role_value := public.secure_redemption_actor_role(auth.uid(),
    restaurant_record.id, restaurant_record.primary_branch_id);
  if role_value not in ('STAFF', 'OWNER') or role_value is null then
    raise exception using errcode = '42501', message = 'REDEMPTION_STAFF_REQUIRED';
  end if;
  return jsonb_build_object(
    'server_now', now_value,
    'actor_role', role_value,
    'requests', coalesce((select jsonb_agg(jsonb_build_object(
      'redemption_id', sr.id,
      'status', sr.status,
      'requested_at', sr.requested_at,
      'expires_at', sr.expires_at,
      'correlation_id', sr.correlation_id,
      'source_type', sr.source_type,
      'presentation_type', sr.source_type,
      'reward_title', r.title,
      'reward_image_url', r.image_url,
      'image_zoom', r.image_zoom,
      'image_position_x', r.image_position_x,
      'image_position_y', r.image_position_y,
      'image_aspect_ratio', r.image_aspect_ratio,
      'image_crop_version', r.image_crop_version,
      'customer_label', split_part(c.name, ' ', 1)
        || case when position(' ' in c.name) > 0
          then ' ' || left(split_part(c.name, ' ', 2), 1) || '.' else '' end
    ) order by sr.requested_at, sr.id)
    from public.secure_redemption_requests sr
    join public.rewards r on r.id = sr.reward_id and r.restaurant_id = sr.restaurant_id
    join public.customers c on c.id = sr.customer_id and c.restaurant_id = sr.restaurant_id
    where sr.restaurant_id = restaurant_record.id
      and sr.branch_id = restaurant_record.primary_branch_id
      and sr.status in ('REQUESTED', 'PIN_VERIFIED') and sr.expires_at > now_value),
      '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_secure_redemption_queue(text)
  from public, anon, authenticated;
grant execute on function public.get_secure_redemption_queue(text) to authenticated;

-- Cut over only after all replacement request, status, queue and finalization
-- contracts have been defined. Historical receipts and function signatures stay.
create or replace function public.confirm_customer_redemption_swipe(
  input_customer_token text, input_presentation_type text,
  input_presentation_id uuid, input_idempotency_key uuid
) returns jsonb language sql volatile security definer
set search_path = public, pg_temp as $$
  select jsonb_build_object('success', false,
    'error_code', 'REDEMPTION_CONFIRMATION_REQUIRED')
$$;
revoke all on function public.confirm_customer_redemption_swipe(text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_customer_redemption_swipe(text, text, uuid, uuid)
  to anon, authenticated;

revoke all on function public.start_customer_points_presentation(text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.start_customer_gift_presentation(text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.start_customer_redemption(text, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.consume_redemption_code(uuid, text, text)
  from public, anon, authenticated;
