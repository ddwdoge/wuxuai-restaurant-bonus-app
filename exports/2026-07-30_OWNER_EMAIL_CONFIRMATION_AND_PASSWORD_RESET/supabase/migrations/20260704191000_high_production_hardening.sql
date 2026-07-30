create table if not exists public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  token_hash text not null unique,
  active boolean not null default true,
  expires_at timestamptz,
  rotated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.staff_sessions enable row level security;
alter table public.customer_qr_tokens enable row level security;

drop policy if exists "staff sessions admin select" on public.staff_sessions;
drop policy if exists "customer qr tokens admin select" on public.customer_qr_tokens;

create policy "staff sessions admin select"
on public.staff_sessions for select
using (public.is_restaurant_admin(restaurant_id));

create policy "customer qr tokens admin select"
on public.customer_qr_tokens for select
using (public.is_restaurant_admin(restaurant_id));

create index if not exists staff_sessions_token_hash_idx
on public.staff_sessions (token_hash)
where revoked_at is null;

create index if not exists staff_sessions_restaurant_staff_idx
on public.staff_sessions (restaurant_id, staff_member_id, expires_at desc);

create index if not exists customer_qr_tokens_token_hash_idx
on public.customer_qr_tokens (token_hash)
where active = true;

create index if not exists customer_qr_tokens_customer_idx
on public.customer_qr_tokens (restaurant_id, customer_id, active);

create or replace function public.hash_public_token(input_token text)
returns text
language sql
security definer
set search_path = public
immutable
as $$
  select encode(extensions.digest(coalesce(input_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.audit_admin_table_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  audit_restaurant_id uuid;
  target_id uuid;
  action_name text;
  old_payload jsonb;
  new_payload jsonb;
  audit_old_payload jsonb;
  audit_new_payload jsonb;
begin
  old_payload := case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end;
  new_payload := case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  audit_old_payload := old_payload - 'pin_hash';
  audit_new_payload := new_payload - 'pin_hash';

  audit_restaurant_id := case
    when TG_TABLE_NAME = 'restaurants' then coalesce((new_payload->>'id')::uuid, (old_payload->>'id')::uuid)
    else coalesce((new_payload->>'restaurant_id')::uuid, (old_payload->>'restaurant_id')::uuid)
  end;
  target_id := coalesce((new_payload->>'id')::uuid, (old_payload->>'id')::uuid);

  if audit_restaurant_id is null or auth.uid() is null then
    return new;
  end if;

  if not public.is_restaurant_admin(audit_restaurant_id) then
    return new;
  end if;

  action_name := case TG_OP
    when 'INSERT' then 'admin_' || TG_TABLE_NAME || '_created'
    when 'UPDATE' then
      case
        when TG_TABLE_NAME = 'staff_members' and old_payload->>'active' = 'true' and new_payload->>'active' = 'false'
          then 'admin_staff_member_deactivated'
        when TG_TABLE_NAME = 'loyalty_rules' and old_payload->>'active' = 'true' and new_payload->>'active' = 'false'
          then 'admin_loyalty_rule_deactivated'
        when TG_TABLE_NAME = 'rewards' and old_payload->>'active' = 'true' and new_payload->>'active' = 'false'
          then 'admin_reward_deactivated'
        when TG_TABLE_NAME = 'coupons' and old_payload->>'status' = 'active' and new_payload->>'status' <> 'active'
          then 'admin_coupon_deactivated'
        when TG_TABLE_NAME = 'campaigns' and old_payload->>'status' = 'active' and new_payload->>'status' <> 'active'
          then 'admin_campaign_deactivated'
        else 'admin_' || TG_TABLE_NAME || '_updated'
      end
    else 'admin_' || TG_TABLE_NAME || '_' || lower(TG_OP)
  end;

  insert into public.audit_log (
    restaurant_id,
    actor_type,
    actor_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    audit_restaurant_id,
    'admin',
    auth.uid(),
    action_name,
    TG_TABLE_NAME,
    target_id,
    jsonb_build_object(
      'operation', TG_OP,
      'old', case when TG_OP = 'UPDATE' then audit_old_payload else null end,
      'new', audit_new_payload
    )
  );

  return new;
end;
$$;

drop trigger if exists audit_admin_restaurants_update on public.restaurants;
create trigger audit_admin_restaurants_update
after update on public.restaurants
for each row execute function public.audit_admin_table_write();

drop trigger if exists audit_admin_restaurant_branding_write on public.restaurant_branding;
create trigger audit_admin_restaurant_branding_write
after insert or update on public.restaurant_branding
for each row execute function public.audit_admin_table_write();

drop trigger if exists audit_admin_loyalty_settings_write on public.loyalty_settings;
create trigger audit_admin_loyalty_settings_write
after insert or update on public.loyalty_settings
for each row execute function public.audit_admin_table_write();

drop trigger if exists audit_admin_loyalty_rules_write on public.loyalty_rules;
create trigger audit_admin_loyalty_rules_write
after insert or update on public.loyalty_rules
for each row execute function public.audit_admin_table_write();

drop trigger if exists audit_admin_rewards_write on public.rewards;
create trigger audit_admin_rewards_write
after insert or update on public.rewards
for each row execute function public.audit_admin_table_write();

drop trigger if exists audit_admin_coupons_write on public.coupons;
create trigger audit_admin_coupons_write
after insert or update on public.coupons
for each row execute function public.audit_admin_table_write();

drop trigger if exists audit_admin_campaigns_write on public.campaigns;
create trigger audit_admin_campaigns_write
after insert or update on public.campaigns
for each row execute function public.audit_admin_table_write();

drop trigger if exists audit_admin_staff_members_write on public.staff_members;
create trigger audit_admin_staff_members_write
after insert or update on public.staff_members
for each row execute function public.audit_admin_table_write();

create or replace function public.create_staff_session(
  input_restaurant_id uuid,
  input_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_record public.staff_members%rowtype;
  raw_token text;
  hashed_token text;
  session_id uuid;
  session_expires_at timestamptz;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  if coalesce(input_pin, '') = '' then
    raise exception 'staff pin is required';
  end if;

  select *
  into staff_record
  from public.staff_members
  where restaurant_id = input_restaurant_id
    and active = true
    and pin_hash = extensions.crypt(input_pin, pin_hash)
  limit 1;

  if staff_record.id is null then
    raise exception 'invalid staff pin';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  hashed_token := public.hash_public_token(raw_token);
  session_expires_at := now() + interval '5 minutes';

  insert into public.staff_sessions (
    restaurant_id,
    staff_member_id,
    token_hash,
    expires_at
  )
  values (
    input_restaurant_id,
    staff_record.id,
    hashed_token,
    session_expires_at
  )
  returning id into session_id;

  insert into public.audit_log (
    restaurant_id,
    actor_type,
    actor_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    input_restaurant_id,
    'staff',
    staff_record.id,
    'staff_session_created',
    'staff_sessions',
    session_id,
    jsonb_build_object('expires_at', session_expires_at)
  );

  return jsonb_build_object(
    'staff_member_id', staff_record.id,
    'staff_member_name', staff_record.name,
    'staff_session_token', raw_token,
    'expires_at', session_expires_at
  );
end;
$$;

create or replace function public.revoke_staff_session(
  input_restaurant_id uuid,
  input_staff_session_token text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hashed_token text;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  hashed_token := public.hash_public_token(input_staff_session_token);

  update public.staff_sessions
  set revoked_at = now()
  where restaurant_id = input_restaurant_id
    and token_hash = hashed_token
    and revoked_at is null;

  return true;
end;
$$;

create or replace function public.get_staff_from_session(
  input_restaurant_id uuid,
  input_staff_session_token text
)
returns public.staff_members
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  staff_record public.staff_members%rowtype;
begin
  if coalesce(input_staff_session_token, '') = '' then
    raise exception 'staff session token is required';
  end if;

  select sm.*
  into staff_record
  from public.staff_sessions ss
  join public.staff_members sm on sm.id = ss.staff_member_id
  where ss.restaurant_id = input_restaurant_id
    and ss.token_hash = public.hash_public_token(input_staff_session_token)
    and ss.expires_at > now()
    and ss.revoked_at is null
    and sm.active = true
  limit 1;

  if staff_record.id is null then
    raise exception 'invalid staff session';
  end if;

  return staff_record;
end;
$$;

create or replace function public.apply_loyalty_staff_session_action(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_staff_session_token text,
  input_loyalty_mode text,
  input_points integer default 0,
  input_stamps integer default 0,
  input_reason text default '',
  input_rule_id uuid default null,
  input_bill_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_record public.staff_members%rowtype;
  settings_record public.loyalty_settings%rowtype;
  customer_record public.customers%rowtype;
  rule_record public.loyalty_rules%rowtype;
  transaction_id uuid;
  audit_id uuid;
  next_points integer;
  next_stamps integer;
  awarded_points integer := 0;
  awarded_stamps integer := 0;
  action_reason text;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  staff_record := public.get_staff_from_session(input_restaurant_id, input_staff_session_token);

  select *
  into settings_record
  from public.loyalty_settings
  where restaurant_id = input_restaurant_id
    and active = true;

  if settings_record.id is null then
    raise exception 'loyalty settings not found';
  end if;

  if settings_record.loyalty_mode <> input_loyalty_mode then
    raise exception 'loyalty mode mismatch';
  end if;

  select *
  into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id
  for update;

  if customer_record.id is null then
    raise exception 'customer not found for restaurant';
  end if;

  if input_loyalty_mode = 'amount_based' then
    if coalesce(input_bill_amount, 0) <= 0 then
      raise exception 'bill amount is required';
    end if;
    awarded_points := floor(input_bill_amount / settings_record.amount_per_point)::integer;
    awarded_stamps := 0;
    action_reason := 'Rechnungsbetrag ' || input_bill_amount::text;
  elsif input_loyalty_mode = 'menu_points' then
    if input_rule_id is null then
      raise exception 'loyalty rule is required';
    end if;
    select *
    into rule_record
    from public.loyalty_rules
    where id = input_rule_id
      and restaurant_id = input_restaurant_id
      and active = true
      and points > 0
      and stamps = 0;
    if rule_record.id is null then
      raise exception 'loyalty rule not found';
    end if;
    awarded_points := rule_record.points;
    awarded_stamps := 0;
    action_reason := rule_record.title;
  elsif input_loyalty_mode = 'stamp_based' then
    if input_rule_id is not null then
      select *
      into rule_record
      from public.loyalty_rules
      where id = input_rule_id
        and restaurant_id = input_restaurant_id
        and active = true
        and stamps > 0
        and points = 0;
      if rule_record.id is null then
        raise exception 'loyalty rule not found';
      end if;
      awarded_stamps := rule_record.stamps;
      action_reason := rule_record.title;
    else
      awarded_stamps := 1;
      action_reason := '1 Stempel';
    end if;
    awarded_points := 0;
  else
    raise exception 'unsupported loyalty mode';
  end if;

  if awarded_points <= 0 and awarded_stamps <= 0 then
    raise exception 'nothing to award';
  end if;

  if awarded_points > 100000 or awarded_stamps > 100 then
    raise exception 'loyalty amount out of range';
  end if;

  if exists (
    select 1
    from public.audit_log a
    where a.restaurant_id = input_restaurant_id
      and a.actor_type = 'staff'
      and a.actor_id = staff_record.id
      and a.action = 'staff_loyalty_credit'
      and a.target_id = input_customer_id
      and a.created_at > now() - interval '30 seconds'
      and coalesce((a.metadata->>'points')::integer, 0) = awarded_points
      and coalesce((a.metadata->>'stamps')::integer, 0) = awarded_stamps
  ) then
    raise exception 'duplicate staff action blocked';
  end if;

  if awarded_points > 0 then
    insert into public.points_transactions (
      restaurant_id,
      customer_id,
      staff_member_id,
      type,
      points,
      reason
    )
    values (
      input_restaurant_id,
      input_customer_id,
      staff_record.id,
      'earn',
      awarded_points,
      action_reason
    )
    returning id into transaction_id;

    update public.customers
    set points_balance = points_balance + awarded_points
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
    returning points_balance, stamp_balance into next_points, next_stamps;
  else
    insert into public.stamp_transactions (
      restaurant_id,
      customer_id,
      staff_member_id,
      stamps,
      reason
    )
    values (
      input_restaurant_id,
      input_customer_id,
      staff_record.id,
      awarded_stamps,
      action_reason
    )
    returning id into transaction_id;

    update public.customers
    set stamp_balance = stamp_balance + awarded_stamps
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
    returning points_balance, stamp_balance into next_points, next_stamps;
  end if;

  insert into public.audit_log (
    restaurant_id,
    actor_type,
    actor_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    input_restaurant_id,
    'staff',
    staff_record.id,
    'staff_loyalty_credit',
    'customers',
    input_customer_id,
    jsonb_build_object(
      'loyalty_mode', input_loyalty_mode,
      'points', awarded_points,
      'stamps', awarded_stamps,
      'reason', action_reason,
      'client_points', input_points,
      'client_stamps', input_stamps,
      'rule_id', input_rule_id,
      'bill_amount', input_bill_amount,
      'transaction_id', transaction_id
    )
  )
  returning id into audit_id;

  return jsonb_build_object(
    'staff_member_id', staff_record.id,
    'staff_member_name', staff_record.name,
    'points_added', awarded_points,
    'stamps_added', awarded_stamps,
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'transaction_id', transaction_id,
    'audit_id', audit_id
  );
end;
$$;

create or replace function public.redeem_reward_with_staff_session(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_offer_source text,
  input_offer_id uuid,
  input_staff_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_record public.staff_members%rowtype;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  coupon_record public.coupons%rowtype;
  required_points_value integer := 0;
  required_stamps_value integer := 0;
  redemption_id uuid;
  next_points integer;
  next_stamps integer;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  staff_record := public.get_staff_from_session(input_restaurant_id, input_staff_session_token);

  select *
  into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id
  for update;

  if customer_record.id is null then
    raise exception 'customer not found for restaurant';
  end if;

  if input_offer_source = 'reward' then
    select *
    into reward_record
    from public.rewards
    where id = input_offer_id
      and restaurant_id = input_restaurant_id
      and active = true
      and (expires_at is null or expires_at > now());

    if reward_record.id is null then
      raise exception 'reward not active';
    end if;

    required_points_value := reward_record.required_points;
    required_stamps_value := reward_record.required_stamps;

    update public.customers
    set
      points_balance = points_balance - required_points_value,
      stamp_balance = stamp_balance - required_stamps_value
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
      and points_balance >= required_points_value
      and stamp_balance >= required_stamps_value
    returning points_balance, stamp_balance into next_points, next_stamps;

    if next_points is null then
      raise exception 'customer does not have enough balance';
    end if;

    insert into public.customer_rewards (
      restaurant_id,
      customer_id,
      reward_id,
      staff_member_id,
      status,
      redeemed_at
    )
    values (
      input_restaurant_id,
      input_customer_id,
      input_offer_id,
      staff_record.id,
      'redeemed',
      now()
    )
    on conflict (restaurant_id, customer_id, reward_id)
    do update set status = 'redeemed', staff_member_id = staff_record.id, redeemed_at = now()
      where public.customer_rewards.status <> 'redeemed'
    returning id into redemption_id;

    if redemption_id is null then
      raise exception 'reward already redeemed';
    end if;
  elsif input_offer_source = 'coupon' then
    select *
    into coupon_record
    from public.coupons
    where id = input_offer_id
      and restaurant_id = input_restaurant_id
      and status = 'active'
      and (expires_at is null or expires_at > now());

    if coupon_record.id is null then
      raise exception 'coupon not active';
    end if;

    required_points_value := coupon_record.required_points;
    required_stamps_value := coupon_record.required_stamps;

    update public.customers
    set
      points_balance = points_balance - required_points_value,
      stamp_balance = stamp_balance - required_stamps_value
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
      and points_balance >= required_points_value
      and stamp_balance >= required_stamps_value
    returning points_balance, stamp_balance into next_points, next_stamps;

    if next_points is null then
      raise exception 'customer does not have enough balance';
    end if;

    insert into public.coupon_redemptions (
      restaurant_id,
      coupon_id,
      customer_id,
      staff_member_id
    )
    values (
      input_restaurant_id,
      input_offer_id,
      input_customer_id,
      staff_record.id
    )
    returning id into redemption_id;
  else
    raise exception 'unsupported offer source';
  end if;

  update public.campaign_customer_offers
  set status = 'redeemed', redeemed_at = now()
  where restaurant_id = input_restaurant_id
    and customer_id = input_customer_id
    and offer_source = input_offer_source
    and offer_id = input_offer_id
    and status <> 'redeemed';

  insert into public.audit_log (
    restaurant_id,
    actor_type,
    actor_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    input_restaurant_id,
    'staff',
    staff_record.id,
    'staff_reward_redeemed',
    case when input_offer_source = 'coupon' then 'coupons' else 'rewards' end,
    input_offer_id,
    jsonb_build_object(
      'customer_id', input_customer_id,
      'offer_source', input_offer_source,
      'required_points', required_points_value,
      'required_stamps', required_stamps_value,
      'redemption_id', redemption_id
    )
  );

  return jsonb_build_object(
    'staff_member_id', staff_record.id,
    'staff_member_name', staff_record.name,
    'points_balance', next_points,
    'stamp_balance', next_stamps,
    'redeemed_offer_id', input_offer_id,
    'redemption_id', redemption_id
  );
end;
$$;

create or replace function public.rotate_customer_qr_token(
  input_restaurant_id uuid,
  input_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_token text;
  hashed_token text;
  token_id uuid;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  if not exists (
    select 1
    from public.customers
    where id = input_customer_id
      and restaurant_id = input_restaurant_id
  ) then
    raise exception 'customer not found for restaurant';
  end if;

  update public.customer_qr_tokens
  set active = false, rotated_at = now()
  where restaurant_id = input_restaurant_id
    and customer_id = input_customer_id
    and active = true;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  hashed_token := public.hash_public_token(raw_token);

  insert into public.customer_qr_tokens (
    restaurant_id,
    customer_id,
    token_hash,
    active
  )
  values (
    input_restaurant_id,
    input_customer_id,
    hashed_token,
    true
  )
  returning id into token_id;

  insert into public.audit_log (
    restaurant_id,
    actor_type,
    actor_id,
    action,
    target_table,
    target_id,
    metadata
  )
  values (
    input_restaurant_id,
    'admin',
    auth.uid(),
    'admin_customer_qr_token_rotated',
    'customer_qr_tokens',
    token_id,
    jsonb_build_object('customer_id', input_customer_id)
  );

  return jsonb_build_object(
    'customer_qr_token', raw_token,
    'token_id', token_id
  );
end;
$$;

drop function if exists public.get_public_customer_portal(text, text);

create or replace function public.get_public_customer_portal(
  input_restaurant_slug text,
  input_customer_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  branding_record public.restaurant_branding%rowtype;
  settings_record public.loyalty_settings%rowtype;
  customer_record public.customers%rowtype;
  campaigns_payload jsonb := '[]'::jsonb;
  offers_payload jsonb := '[]'::jsonb;
begin
  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  select *
  into branding_record
  from public.restaurant_branding
  where restaurant_id = restaurant_record.id;

  select *
  into settings_record
  from public.loyalty_settings
  where restaurant_id = restaurant_record.id
    and active = true;

  if settings_record.id is null then
    raise exception 'loyalty settings not found';
  end if;

  if nullif(trim(coalesce(input_customer_token, '')), '') is not null then
    select c.*
    into customer_record
    from public.customer_qr_tokens cqt
    join public.customers c on c.id = cqt.customer_id
    where cqt.restaurant_id = restaurant_record.id
      and cqt.token_hash = public.hash_public_token(input_customer_token)
      and cqt.active = true
      and (cqt.expires_at is null or cqt.expires_at > now())
      and c.restaurant_id = restaurant_record.id
    limit 1;

    if customer_record.id is null then
      raise exception 'customer token not valid';
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'title', c.title,
        'slug', c.slug,
        'description', c.description,
        'status', c.status,
        'start_date', c.start_date,
        'end_date', c.end_date
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into campaigns_payload
  from public.campaigns c
  where c.restaurant_id = restaurant_record.id
    and c.status = 'active'
    and (c.start_date is null or c.start_date <= current_date)
    and (c.end_date is null or c.end_date >= current_date);

  if customer_record.id is not null then
    with offers as (
      select
        'reward'::text as source,
        r.id,
        r.title,
        r.description,
        r.reward_type,
        r.required_points,
        r.required_stamps,
        r.expires_at
      from public.rewards r
      where r.restaurant_id = restaurant_record.id
        and r.active = true
        and (r.expires_at is null or r.expires_at > now())
        and not exists (
          select 1
          from public.customer_rewards cr
          where cr.restaurant_id = restaurant_record.id
            and cr.customer_id = customer_record.id
            and cr.reward_id = r.id
            and cr.status = 'redeemed'
        )
      union all
      select
        'coupon'::text as source,
        c.id,
        c.title,
        c.description,
        c.reward_type,
        c.required_points,
        c.required_stamps,
        c.expires_at
      from public.coupons c
      where c.restaurant_id = restaurant_record.id
        and c.status = 'active'
        and (c.expires_at is null or c.expires_at > now())
        and not exists (
          select 1
          from public.coupon_redemptions cr
          where cr.restaurant_id = restaurant_record.id
            and cr.customer_id = customer_record.id
            and cr.coupon_id = c.id
        )
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', offers.id,
          'source', offers.source,
          'title', offers.title,
          'description', offers.description,
          'reward_type', offers.reward_type,
          'required_points', offers.required_points,
          'required_stamps', offers.required_stamps,
          'active', true,
          'expires_at', offers.expires_at,
          'status', case
            when customer_record.points_balance >= offers.required_points
              and customer_record.stamp_balance >= offers.required_stamps
            then 'unlocked'
            else 'locked'
          end,
          'remaining_points', greatest(offers.required_points - customer_record.points_balance, 0),
          'remaining_stamps', greatest(offers.required_stamps - customer_record.stamp_balance, 0)
        )
        order by offers.required_points, offers.required_stamps, offers.title
      ),
      '[]'::jsonb
    )
    into offers_payload
    from offers;
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', restaurant_record.name,
      'slug', restaurant_record.slug,
      'status', restaurant_record.status
    ),
    'branding', jsonb_build_object(
      'logo_url', branding_record.logo_url,
      'primary_color', branding_record.primary_color,
      'secondary_color', branding_record.secondary_color,
      'button_color', branding_record.button_color,
      'font_family', branding_record.font_family
    ),
    'settings', jsonb_build_object(
      'loyalty_mode', settings_record.loyalty_mode,
      'amount_per_point', settings_record.amount_per_point,
      'stamps_required', settings_record.stamps_required,
      'active', settings_record.active
    ),
    'customer', case
      when customer_record.id is null then null
      else jsonb_build_object(
        'name', customer_record.name,
        'customer_code', customer_record.customer_code,
        'points_balance', customer_record.points_balance,
        'stamp_balance', customer_record.stamp_balance,
        'membership_level', customer_record.membership_level
      )
    end,
    'campaigns', campaigns_payload,
    'offers', offers_payload
  );
end;
$$;

create or replace function public.register_campaign_customer(
  input_restaurant_slug text,
  input_campaign_slug text,
  input_name text,
  input_phone text,
  input_birthday date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  campaign_record public.campaigns%rowtype;
  customer_record public.customers%rowtype;
  normalized_name text;
  normalized_phone text;
  next_code text;
  offer_source_value text;
  offer_id_value uuid;
  starter_issued boolean := false;
  inserted_count integer := 0;
  raw_customer_token text;
  token_id uuid;
begin
  normalized_name := trim(coalesce(input_name, ''));
  normalized_phone := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');

  if length(normalized_name) < 2 or length(normalized_name) > 120 then
    raise exception 'name is required';
  end if;

  if length(normalized_phone) < 5 or length(normalized_phone) > 32 then
    raise exception 'phone is required';
  end if;

  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  select *
  into campaign_record
  from public.campaigns
  where restaurant_id = restaurant_record.id
    and slug = trim(input_campaign_slug)
    and status = 'active'
    and (start_date is null or start_date <= current_date)
    and (end_date is null or end_date >= current_date);

  if campaign_record.id is null then
    raise exception 'campaign not active';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(restaurant_record.id::text || ':' || normalized_phone, 0));

  select *
  into customer_record
  from public.customers
  where restaurant_id = restaurant_record.id
    and phone = normalized_phone
  limit 1
  for update;

  if customer_record.id is null then
    next_code := upper(substr(restaurant_record.slug, 1, 3)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

    insert into public.customers (
      restaurant_id,
      name,
      phone,
      birthday,
      customer_code
    )
    values (
      restaurant_record.id,
      normalized_name,
      normalized_phone,
      input_birthday,
      next_code
    )
    returning * into customer_record;

    insert into public.audit_log (
      restaurant_id,
      actor_type,
      actor_id,
      action,
      target_table,
      target_id,
      metadata
    )
    values (
      restaurant_record.id,
      'customer',
      customer_record.id,
      'public_customer_registered',
      'customers',
      customer_record.id,
      jsonb_build_object('campaign_slug', campaign_record.slug)
    );
  end if;

  raw_customer_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.customer_qr_tokens
  set active = false, rotated_at = now()
  where restaurant_id = restaurant_record.id
    and customer_id = customer_record.id
    and active = true;

  insert into public.customer_qr_tokens (
    restaurant_id,
    customer_id,
    token_hash,
    active
  )
  values (
    restaurant_record.id,
    customer_record.id,
    public.hash_public_token(raw_customer_token),
    true
  )
  returning id into token_id;

  offer_source_value := campaign_record.starter_offer_source;
  offer_id_value := case
    when offer_source_value = 'reward' then campaign_record.starter_reward_id
    when offer_source_value = 'coupon' then campaign_record.starter_coupon_id
    else null
  end;

  insert into public.campaign_events (restaurant_id, campaign_id, customer_id, event_type)
  values (restaurant_record.id, campaign_record.id, customer_record.id, 'registration');

  if offer_source_value is not null and offer_id_value is not null then
    insert into public.campaign_customer_offers (
      restaurant_id,
      campaign_id,
      customer_id,
      offer_source,
      offer_id
    )
    values (
      restaurant_record.id,
      campaign_record.id,
      customer_record.id,
      offer_source_value,
      offer_id_value
    )
    on conflict do nothing;

    get diagnostics inserted_count = row_count;
    starter_issued := inserted_count > 0;

    if offer_source_value = 'reward' then
      insert into public.customer_rewards (
        restaurant_id,
        customer_id,
        reward_id,
        status
      )
      values (
        restaurant_record.id,
        customer_record.id,
        offer_id_value,
        'active'
      )
      on conflict (restaurant_id, customer_id, reward_id) do nothing;
    end if;

    if starter_issued then
      insert into public.campaign_events (
        restaurant_id,
        campaign_id,
        customer_id,
        event_type,
        metadata
      )
      values (
        restaurant_record.id,
        campaign_record.id,
        customer_record.id,
        'starter_reward',
        jsonb_build_object('offer_source', offer_source_value, 'offer_id', offer_id_value)
      );

      insert into public.audit_log (
        restaurant_id,
        actor_type,
        actor_id,
        action,
        target_table,
        target_id,
        metadata
      )
      values (
        restaurant_record.id,
        'system',
        null,
        'public_starter_offer_issued',
        'campaign_customer_offers',
        customer_record.id,
        jsonb_build_object(
          'campaign_id', campaign_record.id,
          'offer_source', offer_source_value,
          'offer_id', offer_id_value
        )
      );
    end if;
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', restaurant_record.name,
      'slug', restaurant_record.slug,
      'status', restaurant_record.status
    ),
    'campaign', jsonb_build_object(
      'title', campaign_record.title,
      'slug', campaign_record.slug,
      'description', campaign_record.description,
      'status', campaign_record.status
    ),
    'customer', jsonb_build_object(
      'name', customer_record.name,
      'customer_code', customer_record.customer_code,
      'customer_qr_token', raw_customer_token
    ),
    'starter_offer_source', offer_source_value,
    'starter_offer_id', offer_id_value,
    'starter_issued', starter_issued
  );
end;
$$;

revoke execute on function public.hash_public_token(text)
from public, anon, authenticated;

revoke execute on function public.audit_admin_table_write()
from public, anon, authenticated;

revoke execute on function public.get_staff_from_session(uuid, text)
from public, anon, authenticated;

revoke execute on function public.create_staff_session(uuid, text)
from public, anon, authenticated;

revoke execute on function public.revoke_staff_session(uuid, text)
from public, anon, authenticated;

revoke execute on function public.apply_loyalty_staff_session_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric)
from public, anon, authenticated;

revoke execute on function public.redeem_reward_with_staff_session(uuid, uuid, text, uuid, text)
from public, anon, authenticated;

revoke execute on function public.rotate_customer_qr_token(uuid, uuid)
from public, anon, authenticated;

revoke execute on function public.get_public_customer_portal(text, text)
from public, anon, authenticated;

revoke execute on function public.register_campaign_customer(text, text, text, text, date)
from public, anon, authenticated;

revoke execute on function public.validate_staff_pin(uuid, text)
from public, anon, authenticated;

revoke execute on function public.apply_loyalty_staff_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric)
from public, anon, authenticated;

revoke execute on function public.redeem_reward(uuid, uuid, text, uuid, text)
from public, anon, authenticated;

grant execute on function public.create_staff_session(uuid, text)
to authenticated;

grant execute on function public.revoke_staff_session(uuid, text)
to authenticated;

grant execute on function public.apply_loyalty_staff_session_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric)
to authenticated;

grant execute on function public.redeem_reward_with_staff_session(uuid, uuid, text, uuid, text)
to authenticated;

grant execute on function public.rotate_customer_qr_token(uuid, uuid)
to authenticated;

grant execute on function public.get_public_customer_portal(text, text)
to anon, authenticated;

grant execute on function public.register_campaign_customer(text, text, text, text, date)
to anon, authenticated;
