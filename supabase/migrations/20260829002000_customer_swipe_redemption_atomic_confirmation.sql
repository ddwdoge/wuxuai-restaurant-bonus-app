-- Customer swipe confirmation separates the 15-minute preparation window from
-- the authoritative, exactly-once redemption. Historical redeemed records stay
-- redeemed; new point and gift presentations start without consuming value.

alter table public.points_redemption_presentations
  add column if not exists redeemed_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists confirmation_idempotency_key uuid,
  alter column redemption_event_id drop not null;

alter table public.gift_redemption_presentations
  add column if not exists redeemed_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists confirmation_idempotency_key uuid;

-- Remove only the legacy status/state checks before normalizing their values.
alter table public.points_redemption_presentations
  drop constraint if exists points_redemption_presentations_status_check,
  drop constraint if exists points_redemption_presentations_check1;

alter table public.gift_redemption_presentations
  drop constraint if exists gift_redemption_presentations_status_check,
  drop constraint if exists gift_redemption_presentations_check1;

-- Point presentations created by the former contract already consumed points
-- at activation and therefore remain authoritative redeemed history.
update public.points_redemption_presentations
set status = 'REDEEMED',
    redeemed_at = coalesce(redeemed_at, activated_at),
    completed_at = coalesce(completed_at, activated_at)
where status in ('REDEEMED_ACTIVE', 'REDEEMED_COMPLETED');

-- Gift presentations did not consume the assignment until their old automatic
-- completion. Preserve completed history and keep a live window pending.
update public.gift_redemption_presentations
set status = case
      when status = 'REDEEMED_COMPLETED' then 'REDEEMED'
      when expires_at <= statement_timestamp() then 'EXPIRED'
      else 'REDEMPTION_STARTED'
    end,
    redeemed_at = case
      when status = 'REDEEMED_COMPLETED' then coalesce(redeemed_at, completed_at)
      else redeemed_at
    end,
    expired_at = case
      when status = 'REDEEMED_ACTIVE' and expires_at <= statement_timestamp()
        then coalesce(expired_at, expires_at)
      else expired_at
    end
where status in ('REDEEMED_ACTIVE', 'REDEEMED_COMPLETED');

update public.customer_rewards gift
set status = case
      when gift.valid_until is not null and gift.valid_until <= statement_timestamp()
        then 'expired'
      else 'active'
    end,
    redemption_started_at = null
from public.gift_redemption_presentations presentation
where presentation.customer_reward_id = gift.id
  and presentation.status = 'EXPIRED'
  and gift.status = 'redemption_started';

alter table public.points_redemption_presentations
  alter column status set default 'REDEMPTION_STARTED',
  add constraint points_redemption_presentations_status_check
    check (status in ('REDEMPTION_STARTED', 'REDEEMED', 'EXPIRED', 'CANCELLED')),
  add constraint points_redemption_presentations_state_check check (
    (status = 'REDEMPTION_STARTED' and redeemed_at is null and expired_at is null
      and cancelled_at is null)
    or (status = 'REDEEMED' and redeemed_at is not null and expired_at is null
      and cancelled_at is null)
    or (status = 'EXPIRED' and redeemed_at is null and expired_at is not null
      and cancelled_at is null)
    or (status = 'CANCELLED' and cancelled_at is not null and cancelled_by is not null
      and length(trim(cancellation_reason)) >= 10)
  );

alter table public.gift_redemption_presentations
  alter column status set default 'REDEMPTION_STARTED',
  add constraint gift_redemption_presentations_status_check
    check (status in ('REDEMPTION_STARTED', 'REDEEMED', 'EXPIRED')),
  add constraint gift_redemption_presentations_state_check check (
    (status = 'REDEMPTION_STARTED' and redeemed_at is null and expired_at is null)
    or (status = 'REDEEMED' and redeemed_at is not null and expired_at is null)
    or (status = 'EXPIRED' and redeemed_at is null and expired_at is not null)
  );

drop index if exists public.points_redemption_presentations_one_active_reward_idx;
create unique index points_redemption_presentations_one_active_reward_idx
  on public.points_redemption_presentations (restaurant_id, customer_id, reward_id)
  where status = 'REDEMPTION_STARTED';

drop index if exists public.points_redemption_presentations_expiry_idx;
create index points_redemption_presentations_expiry_idx
  on public.points_redemption_presentations (expires_at)
  where status = 'REDEMPTION_STARTED';

drop index if exists public.gift_presentations_one_active_assignment_idx;
create unique index gift_presentations_one_active_assignment_idx
  on public.gift_redemption_presentations (customer_reward_id)
  where status = 'REDEMPTION_STARTED';

drop index if exists public.gift_presentations_expiry_idx;
create index gift_presentations_expiry_idx
  on public.gift_redemption_presentations (expires_at)
  where status = 'REDEMPTION_STARTED';

create or replace function public.points_presentation_payload(
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
    'presentation_type', 'points',
    'status', presentation.status,
    'active', presentation.status = 'REDEMPTION_STARTED' and presentation.expires_at > input_now,
    'activated_at', presentation.activated_at,
    'expires_at', presentation.expires_at,
    'redeemed_at', presentation.redeemed_at,
    'expired_at', presentation.expired_at,
    'completed_at', presentation.completed_at,
    'server_now', input_now,
    'visual_code', case when presentation.status = 'REDEEMED'
      then public.points_presentation_visual_code(presentation.id, input_now) else null end,
    'visual_code_valid_until', case when presentation.status = 'REDEEMED'
      then to_timestamp((floor(extract(epoch from input_now) / 10) + 1) * 10) else null end,
    'redemption_number', presentation.public_reference,
    'reward_id', presentation.reward_id,
    'reward_title', reward.title,
    'reward_description', reward.description,
    'reward_image_url', reward.image_url,
    'image_zoom', reward.image_zoom,
    'image_position_x', reward.image_position_x,
    'image_position_y', reward.image_position_y,
    'image_aspect_ratio', reward.image_aspect_ratio,
    'image_crop_version', reward.image_crop_version,
    'restaurant_name', restaurant.name,
    'points_spent', presentation.points_spent,
    'stamps_spent', presentation.stamps_spent,
    'confirmation_method', 'CUSTOMER_SWIPE'
  )
  from public.points_redemption_presentations presentation
  join public.rewards reward
    on reward.id = presentation.reward_id
   and reward.restaurant_id = presentation.restaurant_id
  join public.restaurants restaurant on restaurant.id = presentation.restaurant_id
  where presentation.id = input_presentation_id
$$;

revoke execute on function public.points_presentation_payload(uuid, timestamptz)
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
    'presentation_type', 'gift',
    'status', presentation.status,
    'active', presentation.status = 'REDEMPTION_STARTED' and presentation.expires_at > input_now,
    'activated_at', presentation.activated_at,
    'expires_at', presentation.expires_at,
    'redeemed_at', presentation.redeemed_at,
    'expired_at', presentation.expired_at,
    'completed_at', presentation.completed_at,
    'server_now', input_now,
    'visual_code', case when presentation.status = 'REDEEMED'
      then public.points_presentation_visual_code(presentation.id, input_now) else null end,
    'visual_code_valid_until', case when presentation.status = 'REDEEMED'
      then to_timestamp((floor(extract(epoch from input_now) / 10) + 1) * 10) else null end,
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
    'confirmation_method', 'CUSTOMER_SWIPE'
  )
  from public.gift_redemption_presentations presentation
  join public.customer_rewards customer_reward on customer_reward.id = presentation.customer_reward_id
  join public.rewards reward
    on reward.id = presentation.reward_id
   and reward.restaurant_id = presentation.restaurant_id
  join public.restaurants restaurant on restaurant.id = presentation.restaurant_id
  where presentation.id = input_presentation_id
$$;

revoke execute on function public.gift_presentation_payload(uuid, timestamptz)
  from public, anon, authenticated;

create or replace function public.complete_points_redemption_presentations(
  input_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  presentation_record public.points_redemption_presentations%rowtype;
  expired_count integer := 0;
begin
  for presentation_record in
    select presentation.*
    from public.points_redemption_presentations presentation
    where presentation.status = 'REDEMPTION_STARTED'
      and presentation.expires_at <= input_now
    for update skip locked
  loop
    update public.points_redemption_presentations
    set status = 'EXPIRED', expired_at = input_now, completed_at = input_now
    where id = presentation_record.id
      and status = 'REDEMPTION_STARTED';
    if found then
      perform public.write_audit_event(
        presentation_record.restaurant_id, presentation_record.customer_id,
        'system', null, 'POINT_REDEMPTION_PRESENTATION_EXPIRED', 'completed', 'system',
        'points_redemption_presentations', presentation_record.id, null,
        jsonb_build_object(
          'reward_id', presentation_record.reward_id,
          'confirmation_method', 'CUSTOMER_SWIPE',
          'value_consumed', false
        )
      );
      expired_count := expired_count + 1;
    end if;
  end loop;
  return expired_count;
end;
$$;

revoke execute on function public.complete_points_redemption_presentations(timestamptz)
  from public, anon, authenticated;

create or replace function public.complete_gift_redemption_presentations(
  input_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  presentation_record public.gift_redemption_presentations%rowtype;
  expired_count integer := 0;
begin
  for presentation_record in
    select presentation.*
    from public.gift_redemption_presentations presentation
    where presentation.status = 'REDEMPTION_STARTED'
      and presentation.expires_at <= input_now
    for update skip locked
  loop
    update public.gift_redemption_presentations
    set status = 'EXPIRED', expired_at = input_now, completed_at = input_now
    where id = presentation_record.id
      and status = 'REDEMPTION_STARTED';
    if not found then continue; end if;

    update public.customer_rewards gift
    set status = case
          when gift.valid_until is not null and gift.valid_until <= input_now then 'expired'
          else 'active'
        end,
        redemption_started_at = null
    where gift.id = presentation_record.customer_reward_id
      and gift.restaurant_id = presentation_record.restaurant_id
      and gift.customer_id = presentation_record.customer_id
      and gift.status = 'redemption_started';

    perform public.write_audit_event(
      presentation_record.restaurant_id, presentation_record.customer_id,
      'system', null, 'GIFT_REDEMPTION_PRESENTATION_EXPIRED', 'completed', 'system',
      'gift_redemption_presentations', presentation_record.id, null,
      jsonb_build_object(
        'reward_id', presentation_record.reward_id,
        'customer_reward_id', presentation_record.customer_reward_id,
        'confirmation_method', 'CUSTOMER_SWIPE',
        'value_consumed', false
      )
    );
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;

revoke execute on function public.complete_gift_redemption_presentations(timestamptz)
  from public, anon, authenticated;

create or replace function public.start_customer_points_presentation(
  input_customer_token text,
  input_reward_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  token_record public.customer_qr_tokens%rowtype;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  existing_presentation public.points_redemption_presentations%rowtype;
  presentation_id_value uuid := extensions.gen_random_uuid();
  activated_at_value timestamptz := statement_timestamp();
begin
  if input_idempotency_key is null or input_reward_id is null then
    raise exception using errcode = 'P0001', message = 'POINT_PRESENTATION_REQUEST_INVALID';
  end if;

  select token.* into token_record
  from public.customer_qr_tokens token
  where token.token_hash = public.hash_public_token(input_customer_token)
    and token.active = true
    and (token.expires_at is null or token.expires_at > activated_at_value);
  if token_record.id is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCESS_TOKEN_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'points-presentation:' || token_record.restaurant_id::text || ':' ||
      token_record.customer_id::text || ':' || input_reward_id::text,
    0
  ));

  select customer.* into customer_record
  from public.customers customer
  where customer.id = token_record.customer_id
    and customer.restaurant_id = token_record.restaurant_id
    and customer.branch_id is not distinct from token_record.branch_id
    and customer.membership_status = 'active'
  for update;
  if customer_record.id is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_INACTIVE';
  end if;

  perform public.complete_points_redemption_presentations(activated_at_value);

  select presentation.* into existing_presentation
  from public.points_redemption_presentations presentation
  where presentation.restaurant_id = customer_record.restaurant_id
    and presentation.customer_id = customer_record.id
    and presentation.idempotency_key = input_idempotency_key
  for update;
  if existing_presentation.id is not null then
    if existing_presentation.reward_id <> input_reward_id then
      return jsonb_build_object(
        'success', false,
        'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'error_message', 'Diese Bestätigungs-ID wurde bereits für eine andere Einlösung verwendet.'
      );
    end if;
    return public.points_presentation_payload(existing_presentation.id, activated_at_value)
      || jsonb_build_object(
        'success', true,
        'already_started', true,
        'points_balance', customer_record.points_balance,
        'stamp_balance', customer_record.stamp_balance
      );
  end if;

  select presentation.* into existing_presentation
  from public.points_redemption_presentations presentation
  where presentation.restaurant_id = customer_record.restaurant_id
    and presentation.customer_id = customer_record.id
    and presentation.reward_id = input_reward_id
    and presentation.status = 'REDEMPTION_STARTED'
  limit 1
  for update;
  if existing_presentation.id is not null then
    return public.points_presentation_payload(existing_presentation.id, activated_at_value)
      || jsonb_build_object(
        'success', true,
        'already_started', true,
        'points_balance', customer_record.points_balance,
        'stamp_balance', customer_record.stamp_balance
      );
  end if;

  select reward.* into reward_record
  from public.rewards reward
  where reward.id = input_reward_id
    and reward.restaurant_id = customer_record.restaurant_id
    and reward.branch_id is not distinct from coalesce(
      customer_record.branch_id,
      public.restaurant_primary_branch_id(customer_record.restaurant_id)
    )
    and reward.active = true
    and not reward.is_starter_reward
    and (reward.expires_at is null or reward.expires_at > activated_at_value);
  if reward_record.id is null then
    raise exception using errcode = 'P0001', message = 'POINT_REWARD_NOT_AVAILABLE';
  end if;
  if customer_record.points_balance < reward_record.required_points
    or customer_record.stamp_balance < reward_record.required_stamps then
    raise exception using errcode = 'P0001', message = 'POINT_REWARD_BALANCE_INSUFFICIENT';
  end if;

  insert into public.points_redemption_presentations (
    id, restaurant_id, organization_id, branch_id, customer_id, reward_id,
    redemption_event_id, points_transaction_id, idempotency_key, public_reference,
    status, points_spent, stamps_spent, activated_at, expires_at
  ) values (
    presentation_id_value, customer_record.restaurant_id, customer_record.organization_id,
    coalesce(customer_record.branch_id, public.restaurant_primary_branch_id(customer_record.restaurant_id)),
    customer_record.id, reward_record.id, null, null, input_idempotency_key,
    'WXP-' || upper(left(replace(presentation_id_value::text, '-', ''), 10)),
    'REDEMPTION_STARTED', reward_record.required_points, reward_record.required_stamps,
    activated_at_value, activated_at_value + interval '15 minutes'
  );

  perform public.write_audit_event(
    customer_record.restaurant_id, customer_record.id, 'customer', customer_record.id,
    'POINT_REDEMPTION_PRESENTATION_STARTED', 'completed', 'customer_portal',
    'points_redemption_presentations', presentation_id_value, input_idempotency_key,
    jsonb_build_object(
      'reward_id', reward_record.id,
      'points_reserved', reward_record.required_points,
      'stamps_reserved', reward_record.required_stamps,
      'value_consumed', false,
      'confirmation_method', 'CUSTOMER_SWIPE',
      'expires_at', activated_at_value + interval '15 minutes'
    )
  );

  return public.points_presentation_payload(presentation_id_value, activated_at_value)
    || jsonb_build_object(
      'success', true,
      'already_started', false,
      'points_balance', customer_record.points_balance,
      'stamp_balance', customer_record.stamp_balance
    );
end;
$$;

revoke execute on function public.start_customer_points_presentation(text, uuid, uuid) from public;
grant execute on function public.start_customer_points_presentation(text, uuid, uuid) to anon, authenticated;

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
declare
  token_record public.customer_qr_tokens%rowtype;
  customer_record public.customers%rowtype;
  gift_record public.customer_rewards%rowtype;
  reward_record public.rewards%rowtype;
  existing_record public.gift_redemption_presentations%rowtype;
  presentation_id_value uuid := extensions.gen_random_uuid();
  activated_at_value timestamptz := statement_timestamp();
begin
  if input_idempotency_key is null or input_customer_reward_id is null then
    raise exception using errcode = 'P0001', message = 'GIFT_PRESENTATION_REQUEST_INVALID';
  end if;

  select token.* into token_record
  from public.customer_qr_tokens token
  where token.token_hash = public.hash_public_token(input_customer_token)
    and token.active = true
    and (token.expires_at is null or token.expires_at > activated_at_value);
  if token_record.id is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCESS_TOKEN_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'gift-presentation:' || token_record.restaurant_id::text || ':' || input_customer_reward_id::text,
    0
  ));

  select customer.* into customer_record
  from public.customers customer
  where customer.id = token_record.customer_id
    and customer.restaurant_id = token_record.restaurant_id
    and customer.branch_id is not distinct from token_record.branch_id
    and customer.membership_status = 'active'
  for update;
  if customer_record.id is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_INACTIVE';
  end if;

  perform public.complete_gift_redemption_presentations(activated_at_value);

  select presentation.* into existing_record
  from public.gift_redemption_presentations presentation
  where presentation.restaurant_id = customer_record.restaurant_id
    and presentation.customer_id = customer_record.id
    and presentation.idempotency_key = input_idempotency_key
  for update;
  if existing_record.id is not null then
    if existing_record.customer_reward_id <> input_customer_reward_id then
      return jsonb_build_object(
        'success', false,
        'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'error_message', 'Diese Bestätigungs-ID wurde bereits für eine andere Einlösung verwendet.'
      );
    end if;
    return public.gift_presentation_payload(existing_record.id, activated_at_value)
      || jsonb_build_object('success', true, 'already_started', true);
  end if;

  select gift.* into gift_record
  from public.customer_rewards gift
  where gift.id = input_customer_reward_id
    and gift.restaurant_id = customer_record.restaurant_id
    and gift.customer_id = customer_record.id
    and gift.gift_type in ('welcome', 'birthday')
    and gift.status in ('active', 'redemption_started')
  for update;
  if gift_record.id is null then
    raise exception using errcode = 'P0001', message = 'GIFT_NOT_AVAILABLE';
  end if;

  select reward.* into reward_record
  from public.rewards reward
  where reward.id = gift_record.reward_id
    and reward.restaurant_id = gift_record.restaurant_id
    and reward.active = true
    and reward.is_starter_reward = true
    and (reward.expires_at is null or reward.expires_at > activated_at_value);
  if reward_record.id is null
    or (gift_record.valid_from is not null and gift_record.valid_from > activated_at_value)
    or (gift_record.valid_until is not null and gift_record.valid_until <= activated_at_value) then
    raise exception using errcode = 'P0001', message = 'GIFT_NOT_AVAILABLE';
  end if;

  select presentation.* into existing_record
  from public.gift_redemption_presentations presentation
  where presentation.customer_reward_id = gift_record.id
  order by presentation.created_at desc
  limit 1
  for update;
  if existing_record.id is not null and existing_record.status = 'REDEEMED' then
    return public.gift_presentation_payload(existing_record.id, activated_at_value)
      || jsonb_build_object(
        'success', false,
        'error_code', 'ALREADY_REDEEMED',
        'error_message', 'Bereits eingelöst'
      );
  end if;
  if existing_record.id is not null and existing_record.status = 'REDEMPTION_STARTED' then
    return public.gift_presentation_payload(existing_record.id, activated_at_value)
      || jsonb_build_object('success', true, 'already_started', true);
  end if;

  update public.customer_rewards
  set status = 'redemption_started', redemption_started_at = activated_at_value
  where id = gift_record.id and status = 'active';
  if not found and gift_record.status <> 'redemption_started' then
    raise exception using errcode = 'P0001', message = 'GIFT_NOT_AVAILABLE';
  end if;

  if existing_record.id is not null then
    update public.gift_redemption_presentations
    set idempotency_key = input_idempotency_key,
        status = 'REDEMPTION_STARTED',
        activated_at = activated_at_value,
        expires_at = activated_at_value + interval '15 minutes',
        completed_at = null,
        expired_at = null,
        redeemed_at = null,
        confirmation_idempotency_key = null
    where id = existing_record.id
    returning id into presentation_id_value;
  else
    insert into public.gift_redemption_presentations (
      id, restaurant_id, organization_id, branch_id, customer_id, reward_id,
      customer_reward_id, idempotency_key, public_reference, status, activated_at, expires_at
    ) values (
      presentation_id_value, gift_record.restaurant_id, gift_record.organization_id,
      gift_record.branch_id, gift_record.customer_id, gift_record.reward_id,
      gift_record.id, input_idempotency_key,
      'WXG-' || upper(left(replace(presentation_id_value::text, '-', ''), 10)),
      'REDEMPTION_STARTED', activated_at_value, activated_at_value + interval '15 minutes'
    );
  end if;

  perform public.write_audit_event(
    gift_record.restaurant_id, gift_record.customer_id, 'customer', gift_record.customer_id,
    'GIFT_REDEMPTION_PRESENTATION_STARTED', 'completed', 'customer_portal',
    'gift_redemption_presentations', presentation_id_value, input_idempotency_key,
    jsonb_build_object(
      'reward_id', gift_record.reward_id,
      'customer_reward_id', gift_record.id,
      'gift_type', gift_record.gift_type,
      'value_consumed', false,
      'confirmation_method', 'CUSTOMER_SWIPE',
      'expires_at', activated_at_value + interval '15 minutes'
    )
  );

  return public.gift_presentation_payload(presentation_id_value, activated_at_value)
    || jsonb_build_object('success', true, 'already_started', false);
end;
$$;

revoke execute on function public.start_customer_gift_presentation(text, uuid, uuid) from public;
grant execute on function public.start_customer_gift_presentation(text, uuid, uuid) to anon, authenticated;

create or replace function public.get_customer_points_presentation(
  input_restaurant_slug text,
  input_customer_token text,
  input_presentation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  presentation_record public.points_redemption_presentations%rowtype;
  server_now_value timestamptz := statement_timestamp();
begin
  select restaurant.* into restaurant_record
  from public.restaurants restaurant
  where restaurant.slug = trim(input_restaurant_slug)
    and restaurant.status = 'active';
  if restaurant_record.id is null then return jsonb_build_object('found', false); end if;

  select customer.* into customer_record
  from public.customer_qr_tokens token
  join public.customers customer
    on customer.id = token.customer_id
   and customer.restaurant_id = token.restaurant_id
  where token.restaurant_id = restaurant_record.id
    and token.token_hash = public.hash_public_token(input_customer_token)
    and token.active = true
    and (token.expires_at is null or token.expires_at > server_now_value)
    and customer.membership_status = 'active'
  limit 1;
  if customer_record.id is null then return jsonb_build_object('found', false); end if;

  perform public.complete_points_redemption_presentations(server_now_value);
  if input_presentation_id is null then
    select presentation.* into presentation_record
    from public.points_redemption_presentations presentation
    where presentation.restaurant_id = restaurant_record.id
      and presentation.customer_id = customer_record.id
      and presentation.status = 'REDEMPTION_STARTED'
    order by presentation.activated_at desc
    limit 1;
  else
    select presentation.* into presentation_record
    from public.points_redemption_presentations presentation
    where presentation.id = input_presentation_id
      and presentation.restaurant_id = restaurant_record.id
      and presentation.customer_id = customer_record.id;
  end if;
  if presentation_record.id is null then return jsonb_build_object('found', false); end if;
  return public.points_presentation_payload(presentation_record.id, server_now_value);
end;
$$;

revoke execute on function public.get_customer_points_presentation(text, text, uuid) from public;
grant execute on function public.get_customer_points_presentation(text, text, uuid) to anon, authenticated;

create or replace function public.get_customer_gift_presentation(
  input_restaurant_slug text,
  input_customer_token text,
  input_presentation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  restaurant_id_value uuid;
  customer_id_value uuid;
  presentation_record public.gift_redemption_presentations%rowtype;
  server_now_value timestamptz := statement_timestamp();
begin
  select restaurant.id into restaurant_id_value
  from public.restaurants restaurant
  where restaurant.slug = trim(input_restaurant_slug)
    and restaurant.status = 'active';

  select customer.id into customer_id_value
  from public.customer_qr_tokens token
  join public.customers customer
    on customer.id = token.customer_id
   and customer.restaurant_id = token.restaurant_id
  where token.restaurant_id = restaurant_id_value
    and token.token_hash = public.hash_public_token(input_customer_token)
    and token.active = true
    and (token.expires_at is null or token.expires_at > server_now_value)
    and customer.membership_status = 'active'
  limit 1;
  if customer_id_value is null then return jsonb_build_object('found', false); end if;

  perform public.complete_gift_redemption_presentations(server_now_value);
  if input_presentation_id is null then
    select presentation.* into presentation_record
    from public.gift_redemption_presentations presentation
    where presentation.restaurant_id = restaurant_id_value
      and presentation.customer_id = customer_id_value
      and presentation.status = 'REDEMPTION_STARTED'
    order by presentation.activated_at desc
    limit 1;
  else
    select presentation.* into presentation_record
    from public.gift_redemption_presentations presentation
    where presentation.id = input_presentation_id
      and presentation.restaurant_id = restaurant_id_value
      and presentation.customer_id = customer_id_value;
  end if;
  if presentation_record.id is null then return jsonb_build_object('found', false); end if;
  return public.gift_presentation_payload(presentation_record.id, server_now_value);
end;
$$;

revoke execute on function public.get_customer_gift_presentation(text, text, uuid) from public;
grant execute on function public.get_customer_gift_presentation(text, text, uuid) to anon, authenticated;

create or replace function public.confirm_customer_redemption_swipe(
  input_customer_token text,
  input_presentation_type text,
  input_presentation_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
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
  if input_presentation_type not in ('points', 'gift')
    or input_presentation_id is null
    or input_idempotency_key is null then
    raise exception using errcode = 'P0001', message = 'REDEMPTION_CONFIRMATION_REQUEST_INVALID';
  end if;

  select token.* into token_record
  from public.customer_qr_tokens token
  where token.token_hash = public.hash_public_token(input_customer_token)
    and token.active = true
    and (token.expires_at is null or token.expires_at > confirmed_at_value);
  if token_record.id is null then
    raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCESS_TOKEN_INVALID';
  end if;

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
  if customer_record.id is null then
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
    if points_record.id is null then
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
        'customer_confirmation', true,
        'confirmation_method', 'CUSTOMER_SWIPE',
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
        'customer_swipe'
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
      points_record.restaurant_id, points_record.customer_id, 'customer', points_record.customer_id,
      'POINT_REDEMPTION_SWIPE_CONFIRMED', 'completed', 'customer_portal',
      'points_redemption_presentations', points_record.id, input_idempotency_key,
      jsonb_build_object(
        'reward_id', points_record.reward_id,
        'redemption_event_id', event_id_value,
        'points_spent', points_record.points_spent,
        'stamps_spent', points_record.stamps_spent,
        'confirmation_method', 'CUSTOMER_SWIPE',
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
      confirmed_at_value, points_record.customer_id, 'customer', points_record.public_reference,
      'ACTIVE', audit_id_value, 'complete', coalesce(customer_record.is_test_customer, false)
    ) on conflict (source_type, source_id) do nothing;

    return public.points_presentation_payload(points_record.id, confirmed_at_value)
      || jsonb_build_object(
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
  if gift_presentation_record.id is null then
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
    'customer', gift_presentation_record.customer_id,
    'GIFT_REDEMPTION_SWIPE_CONFIRMED', 'completed', 'customer_portal',
    'gift_redemption_presentations', gift_presentation_record.id, input_idempotency_key,
    jsonb_build_object(
      'reward_id', gift_presentation_record.reward_id,
      'customer_reward_id', gift_presentation_record.customer_reward_id,
      'gift_type', gift_record.gift_type,
      'confirmation_method', 'CUSTOMER_SWIPE',
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
    gift_presentation_record.customer_id, 'customer', gift_presentation_record.public_reference,
    'ACTIVE', audit_id_value, 'complete', coalesce(customer_record.is_test_customer, false)
  ) on conflict (source_type, source_id) do nothing;

  return public.gift_presentation_payload(gift_presentation_record.id, confirmed_at_value)
    || jsonb_build_object('success', true, 'already_confirmed', false);
end;
$$;

revoke execute on function public.confirm_customer_redemption_swipe(text, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_customer_redemption_swipe(text, text, uuid, uuid)
  to anon, authenticated;

revoke all on table public.points_redemption_presentations from public, anon, authenticated;
revoke all on table public.gift_redemption_presentations from public, anon, authenticated;
