-- WUXUAI Bonus V1: one server-side points engine for both collection modes.

alter table public.points_transactions
  add column if not exists base_points integer,
  add column if not exists boost_multiplier numeric(8, 2),
  add column if not exists boost_source text,
  add column if not exists boost_expires_at timestamptz,
  add column if not exists bonus_rule_version text;

alter table public.points_transactions
  drop constraint if exists points_transactions_base_points_check,
  add constraint points_transactions_base_points_check
    check (base_points is null or base_points >= 0),
  drop constraint if exists points_transactions_boost_multiplier_check,
  add constraint points_transactions_boost_multiplier_check
    check (boost_multiplier is null or boost_multiplier >= 1);

create or replace function public.calculate_points_award_v1(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_amount_cents integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  settings_record public.loyalty_settings%rowtype;
  boost_record public.customer_bonus_boosts%rowtype;
  base_points_value integer;
  multiplier_value numeric(8, 2) := 1;
  final_points_value integer;
  rule_version_value text := 'shared_points_v1';
begin
  if input_amount_cents is null or input_amount_cents <= 0 then
    raise exception 'Der bonusberechtigte Betrag muss größer als null sein.';
  end if;

  if not exists (
    select 1 from public.customers c
    where c.id = input_customer_id
      and c.restaurant_id = input_restaurant_id
      and c.membership_status = 'active'
  ) then
    raise exception 'Gast wurde nicht gefunden.';
  end if;

  select * into settings_record
  from public.loyalty_settings ls
  where ls.restaurant_id = input_restaurant_id
    and ls.active = true
  limit 1;

  if settings_record.id is null then
    raise exception 'Bonusprogramm wurde nicht gefunden.';
  end if;

  if input_amount_cents > settings_record.points_collection_max_amount_cents then
    raise exception 'Der Betrag überschreitet das für dieses Restaurant festgelegte Limit.';
  end if;

  base_points_value := greatest(
    round((input_amount_cents::numeric / 100) / greatest(settings_record.amount_per_point, 0.01))::integer,
    0
  );

  select * into boost_record
  from public.customer_bonus_boosts cb
  where cb.restaurant_id = input_restaurant_id
    and cb.customer_id = input_customer_id
    and cb.status = 'active'
    and cb.active_from <= now()
    and cb.active_until > now()
  order by cb.multiplier desc, cb.active_until desc, cb.id
  limit 1;

  multiplier_value := greatest(coalesce(boost_record.multiplier, 1), 1);
  final_points_value := greatest(round(base_points_value * multiplier_value)::integer, 0);

  return jsonb_build_object(
    'base_points', base_points_value,
    'boost_multiplier', multiplier_value,
    'final_points', final_points_value,
    'bonus_rule_version', rule_version_value,
    'applied_rate', settings_record.amount_per_point,
    'boost_source', boost_record.source,
    'boost_expires_at', boost_record.active_until
  );
end;
$$;

revoke execute on function public.calculate_points_award_v1(uuid, uuid, integer)
from public, anon, authenticated;

create or replace function public.apply_successful_points_effects_v1(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_transaction_id uuid,
  input_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_record public.loyalty_settings%rowtype;
  referral_record public.referrals%rowtype;
  successful_earn_count integer;
  referrer_boost_id uuid;
  referred_boost_id uuid;
  unlocked_count integer := 0;
  referral_qualified boolean := false;
begin
  if not exists (
    select 1 from public.points_transactions pt
    where pt.id = input_transaction_id
      and pt.restaurant_id = input_restaurant_id
      and pt.customer_id = input_customer_id
      and pt.type = 'earn'
      and pt.points > 0
  ) then
    raise exception 'Punktebuchung wurde nicht gefunden.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(input_restaurant_id::text || ':' || input_customer_id::text || ':first-points', 0)
  );

  select * into settings_record
  from public.loyalty_settings ls
  where ls.restaurant_id = input_restaurant_id
    and ls.active = true
  limit 1;

  select count(*) into successful_earn_count
  from public.points_transactions pt
  where pt.restaurant_id = input_restaurant_id
    and pt.customer_id = input_customer_id
    and pt.type = 'earn'
    and pt.points > 0;

  if successful_earn_count = 1
    and coalesce(settings_record.referral_boost_enabled, true) then
    select * into referral_record
    from public.referrals r
    where r.restaurant_id = input_restaurant_id
      and r.referred_customer_id = input_customer_id
      and r.status = 'pending_registered'
    order by r.created_at, r.id
    limit 1
    for update;

    if referral_record.id is not null then
      update public.referrals
      set status = 'activated', activated_at = now()
      where id = referral_record.id
        and restaurant_id = input_restaurant_id
        and status = 'pending_registered'
      returning * into referral_record;

      if referral_record.id is not null then
        referrer_boost_id := public.upsert_referral_boost(
          input_restaurant_id,
          referral_record.referrer_customer_id,
          referral_record.id,
          settings_record.referral_boost_multiplier,
          settings_record.referral_boost_duration_days
        );
        referred_boost_id := public.upsert_referral_boost(
          input_restaurant_id,
          referral_record.referred_customer_id,
          referral_record.id,
          settings_record.referral_boost_multiplier,
          settings_record.referral_boost_duration_days
        );
        referral_qualified := true;

        perform public.write_audit_event(
          input_restaurant_id, input_customer_id, 'system', null,
          'REFERRAL_QUALIFIED', 'success', input_source,
          'referrals', referral_record.id, null,
          jsonb_build_object(
            'multiplier', settings_record.referral_boost_multiplier,
            'duration_days', settings_record.referral_boost_duration_days,
            'referrer_boost_id', referrer_boost_id,
            'referred_boost_id', referred_boost_id
          )
        );
      end if;
    end if;
  end if;

  update public.customer_rewards cr
  set status = 'active', unlocked_at = now()
  where cr.restaurant_id = input_restaurant_id
    and cr.customer_id = input_customer_id
    and cr.is_starter_reward = true
    and cr.status = 'locked';
  get diagnostics unlocked_count = row_count;

  if unlocked_count > 0 then
    perform public.write_audit_event(
      input_restaurant_id, input_customer_id, 'system', null,
      'REWARD_UNLOCKED', 'success', input_source,
      'customer_rewards', input_customer_id, null,
      jsonb_build_object('transaction_id', input_transaction_id)
    );
  end if;

  return jsonb_build_object(
    'first_successful_points', successful_earn_count = 1,
    'referral_qualified', referral_qualified,
    'welcome_gift_unlocked', unlocked_count > 0
  );
end;
$$;

revoke execute on function public.apply_successful_points_effects_v1(uuid, uuid, uuid, text)
from public, anon, authenticated;

create or replace function public.award_points_v1(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_branch_id uuid,
  input_amount_cents integer,
  input_source text,
  input_reason text,
  input_idempotency_key uuid,
  input_receipt_number text default null,
  input_staff_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  calculation jsonb;
  effects jsonb;
  transaction_id_value uuid;
  next_balance integer;
  base_points_value integer;
  final_points_value integer;
  multiplier_value numeric(8, 2);
begin
  if input_source not in ('customer_initiated', 'restaurant_controlled') then
    raise exception 'Buchungsquelle ist ungültig.';
  end if;
  if input_idempotency_key is null then raise exception 'Buchungs-ID fehlt.'; end if;

  select * into restaurant_record from public.restaurants r
  where r.id = input_restaurant_id and r.status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;

  -- Uses the same customer lock key as upsert_referral_boost so a boost cannot
  -- change between the authoritative calculation and transaction snapshot.
  perform pg_advisory_xact_lock(
    hashtextextended(input_restaurant_id::text || ':' || input_customer_id::text, 0)
  );

  calculation := public.calculate_points_award_v1(
    input_restaurant_id, input_customer_id, input_amount_cents
  );
  base_points_value := (calculation->>'base_points')::integer;
  final_points_value := (calculation->>'final_points')::integer;
  multiplier_value := (calculation->>'boost_multiplier')::numeric;
  if final_points_value <= 0 then raise exception 'Der Betrag ergibt noch keinen Punkt.'; end if;

  insert into public.points_transactions (
    restaurant_id, organization_id, branch_id, customer_id, type, points,
    reason, idempotency_key, amount_cents, rule_version, applied_rate,
    collection_source, receipt_number, staff_user_id, base_points,
    boost_multiplier, boost_source, boost_expires_at, bonus_rule_version
  ) values (
    input_restaurant_id, restaurant_record.organization_id, input_branch_id,
    input_customer_id, 'earn', final_points_value, input_reason,
    input_idempotency_key, input_amount_cents,
    calculation->>'bonus_rule_version', (calculation->>'applied_rate')::numeric,
    input_source, nullif(trim(coalesce(input_receipt_number, '')), ''),
    input_staff_user_id, base_points_value, multiplier_value,
    calculation->>'boost_source', (calculation->>'boost_expires_at')::timestamptz,
    calculation->>'bonus_rule_version'
  ) returning id into transaction_id_value;

  update public.customers c
  set points_balance = c.points_balance + final_points_value
  where c.id = input_customer_id
    and c.restaurant_id = input_restaurant_id
    and c.membership_status = 'active'
  returning c.points_balance into next_balance;
  if next_balance is null then raise exception 'Gast wurde nicht gefunden.'; end if;

  effects := public.apply_successful_points_effects_v1(
    input_restaurant_id, input_customer_id, transaction_id_value, input_source
  );

  return calculation || effects || jsonb_build_object(
    'transaction_id', transaction_id_value,
    'points_added', final_points_value,
    'points_balance', next_balance,
    'amount_cents', input_amount_cents,
    'already_completed', false
  );
end;
$$;

revoke execute on function public.award_points_v1(uuid, uuid, uuid, integer, text, text, uuid, text, uuid)
from public, anon, authenticated;

create or replace function public.preview_restaurant_controlled_points(
  input_restaurant_id uuid,
  input_qr_reference text,
  input_amount_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  qr_record public.customer_points_qr_references%rowtype;
  customer_record public.customers%rowtype;
  settings_record public.loyalty_settings%rowtype;
  hashed_reference text;
  calculation jsonb;
  last_visit timestamptz;
begin
  if not public.is_restaurant_member(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  select * into settings_record from public.loyalty_settings ls
  where ls.restaurant_id = input_restaurant_id and ls.active = true;
  if settings_record.points_collection_mode not in ('restaurant_controlled_only', 'both') then
    raise exception 'Dieser Sammelweg ist nicht aktiviert.';
  end if;
  if input_amount_cents is null or input_amount_cents <= 0 then
    raise exception 'Der bonusberechtigte Betrag muss größer als null sein.';
  end if;
  if input_amount_cents > settings_record.points_collection_max_amount_cents then
    perform public.write_audit_event(
      input_restaurant_id, null, 'staff', auth.uid(), 'POINTS_AMOUNT_LIMIT_BLOCKED',
      'blocked', 'staff_portal', 'loyalty_settings', settings_record.id,
      extensions.gen_random_uuid(),
      jsonb_build_object('amount_cents', input_amount_cents,
        'limit_cents', settings_record.points_collection_max_amount_cents)
    );
    return jsonb_build_object('success', false,
      'error_code', 'POINTS_AMOUNT_LIMIT_EXCEEDED',
      'error_message', 'Der Betrag überschreitet das für dieses Restaurant festgelegte Limit.');
  end if;

  hashed_reference := public.hash_public_token(
    regexp_replace(coalesce(input_qr_reference, ''), '\\s', '', 'g')
  );
  if (select count(*) from public.restaurant_points_credit_attempts a
    where a.restaurant_id = input_restaurant_id
      and a.actor_user_id = auth.uid()
      and a.created_at > now() - interval '5 minutes') >= 30 then
    return jsonb_build_object('success', false, 'error_code', 'RATE_LIMITED',
      'error_message', 'Zu viele Versuche. Bitte warte kurz.');
  end if;

  select * into qr_record from public.customer_points_qr_references q
  where q.restaurant_id = input_restaurant_id
    and (q.token_hash = hashed_reference or q.manual_code_hash = hashed_reference)
  limit 1;
  if qr_record.id is null then
    insert into public.restaurant_points_credit_attempts (
      restaurant_id, actor_user_id, reference_hash, status, reason_code
    ) values (input_restaurant_id, auth.uid(), hashed_reference, 'blocked', 'QR_NOT_FOUND');
    return jsonb_build_object('success', false, 'error_code', 'QR_NOT_FOUND',
      'error_message', 'QR-Code wurde nicht gefunden.');
  end if;
  if qr_record.consumed_at is not null then raise exception 'QR-Code wurde bereits verwendet.'; end if;
  if qr_record.revoked_at is not null or qr_record.expires_at <= now() then raise exception 'QR-Code ist abgelaufen.'; end if;

  select * into customer_record from public.customers c
  where c.id = qr_record.customer_id
    and c.restaurant_id = input_restaurant_id
    and c.membership_status = 'active';
  if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;

  calculation := public.calculate_points_award_v1(
    input_restaurant_id, customer_record.id, input_amount_cents
  );
  select max(pt.created_at) into last_visit from public.points_transactions pt
  where pt.restaurant_id = input_restaurant_id
    and pt.customer_id = customer_record.id
    and pt.type = 'earn' and pt.points > 0;

  insert into public.restaurant_points_credit_attempts (
    restaurant_id, customer_id, actor_user_id, reference_hash, amount_cents, status
  ) values (
    input_restaurant_id, customer_record.id, auth.uid(), hashed_reference,
    input_amount_cents, 'previewed'
  );

  return calculation || jsonb_build_object(
    'customer_label', split_part(customer_record.name, ' ', 1),
    'points_balance', customer_record.points_balance,
    'last_visit_at', last_visit,
    'amount_cents', input_amount_cents,
    'expected_points', (calculation->>'final_points')::integer,
    'high_amount_warning', input_amount_cents >= floor(
      settings_record.points_collection_max_amount_cents * 0.8
    ),
    'expires_at', qr_record.expires_at
  );
end;
$$;

revoke execute on function public.preview_restaurant_controlled_points(uuid, text, integer)
from public, anon;
grant execute on function public.preview_restaurant_controlled_points(uuid, text, integer)
to authenticated;

create or replace function public.confirm_restaurant_controlled_points(
  input_restaurant_id uuid,
  input_qr_reference text,
  input_amount_cents integer,
  input_daily_pin text,
  input_idempotency_key uuid,
  input_receipt_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  qr_record public.customer_points_qr_references%rowtype;
  customer_record public.customers%rowtype;
  settings_record public.loyalty_settings%rowtype;
  restaurant_record public.restaurants%rowtype;
  pin_record public.restaurant_daily_pins%rowtype;
  existing_transaction public.points_transactions%rowtype;
  hashed_reference text;
  result_payload jsonb;
  pin_failure jsonb;
  local_date_value date;
  local_day_start timestamptz;
  local_next_day_start timestamptz;
begin
  if not public.is_restaurant_member(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  if input_idempotency_key is null then raise exception 'Buchungs-ID fehlt.'; end if;

  select * into existing_transaction from public.points_transactions pt
  where pt.restaurant_id = input_restaurant_id
    and pt.idempotency_key = input_idempotency_key;
  if existing_transaction.id is not null then
    return jsonb_build_object(
      'transaction_id', existing_transaction.id,
      'base_points', existing_transaction.base_points,
      'boost_multiplier', coalesce(existing_transaction.boost_multiplier, 1),
      'points_added', existing_transaction.points,
      'final_points', existing_transaction.points,
      'points_balance', (select c.points_balance from public.customers c
        where c.id = existing_transaction.customer_id
          and c.restaurant_id = input_restaurant_id),
      'amount_cents', existing_transaction.amount_cents,
      'bonus_rule_version', existing_transaction.bonus_rule_version,
      'boost_source', existing_transaction.boost_source,
      'boost_expires_at', existing_transaction.boost_expires_at,
      'already_completed', true
    );
  end if;

  select * into restaurant_record from public.restaurants r
  where r.id = input_restaurant_id and r.status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  select * into settings_record from public.loyalty_settings ls
  where ls.restaurant_id = input_restaurant_id and ls.active = true;
  if settings_record.id is null then raise exception 'Bonusprogramm wurde nicht gefunden.'; end if;
  if settings_record.points_collection_mode not in ('restaurant_controlled_only', 'both') then
    raise exception 'Dieser Sammelweg ist nicht aktiviert.';
  end if;
  if input_amount_cents is null or input_amount_cents <= 0 then
    raise exception 'Der bonusberechtigte Betrag muss größer als null sein.';
  end if;
  if input_amount_cents > settings_record.points_collection_max_amount_cents then
    perform public.write_audit_event(
      input_restaurant_id, null, 'staff', auth.uid(), 'POINTS_AMOUNT_LIMIT_BLOCKED',
      'blocked', 'staff_portal', 'loyalty_settings', settings_record.id,
      input_idempotency_key, jsonb_build_object(
        'amount_cents', input_amount_cents,
        'limit_cents', settings_record.points_collection_max_amount_cents
      )
    );
    return jsonb_build_object('success', false,
      'error_code', 'POINTS_AMOUNT_LIMIT_EXCEEDED',
      'error_message', 'Der Betrag überschreitet das für dieses Restaurant festgelegte Limit.');
  end if;

  hashed_reference := public.hash_public_token(
    regexp_replace(coalesce(input_qr_reference, ''), '\\s', '', 'g')
  );
  if (select count(*) from public.restaurant_points_credit_attempts a
    where a.restaurant_id = input_restaurant_id
      and a.actor_user_id = auth.uid()
      and a.created_at > now() - interval '5 minutes') >= 30 then
    return jsonb_build_object('success', false, 'error_code', 'RATE_LIMITED',
      'error_message', 'Zu viele Versuche. Bitte warte kurz.');
  end if;

  select * into qr_record from public.customer_points_qr_references q
  where q.restaurant_id = input_restaurant_id
    and (q.token_hash = hashed_reference or q.manual_code_hash = hashed_reference)
  for update;
  if qr_record.id is null then
    insert into public.restaurant_points_credit_attempts (
      restaurant_id, actor_user_id, reference_hash, status, reason_code
    ) values (input_restaurant_id, auth.uid(), hashed_reference, 'blocked', 'QR_NOT_FOUND');
    return jsonb_build_object('success', false, 'error_code', 'QR_NOT_FOUND',
      'error_message', 'QR-Code wurde nicht gefunden.');
  end if;

  -- A parallel request may have completed while this call waited for the QR row.
  select * into existing_transaction from public.points_transactions pt
  where pt.restaurant_id = input_restaurant_id
    and pt.idempotency_key = input_idempotency_key;
  if existing_transaction.id is not null then
    return jsonb_build_object(
      'transaction_id', existing_transaction.id,
      'base_points', existing_transaction.base_points,
      'boost_multiplier', coalesce(existing_transaction.boost_multiplier, 1),
      'points_added', existing_transaction.points,
      'final_points', existing_transaction.points,
      'points_balance', (select c.points_balance from public.customers c
        where c.id = existing_transaction.customer_id
          and c.restaurant_id = input_restaurant_id),
      'amount_cents', existing_transaction.amount_cents,
      'bonus_rule_version', existing_transaction.bonus_rule_version,
      'boost_source', existing_transaction.boost_source,
      'boost_expires_at', existing_transaction.boost_expires_at,
      'already_completed', true
    );
  end if;
  if qr_record.consumed_at is not null then raise exception 'QR-Code wurde bereits verwendet.'; end if;
  if qr_record.revoked_at is not null or qr_record.expires_at <= now() then raise exception 'QR-Code ist abgelaufen.'; end if;

  select * into customer_record from public.customers c
  where c.id = qr_record.customer_id
    and c.restaurant_id = input_restaurant_id
    and c.membership_status = 'active'
  for update;
  if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;

  if (select count(*) from public.restaurant_points_credit_attempts a
    where a.restaurant_id = input_restaurant_id
      and a.actor_user_id = auth.uid()
      and a.customer_id = customer_record.id
      and a.status = 'completed'
      and a.created_at > now() - interval '5 minutes') >= 3 then
    raise exception 'Zu viele Buchungen in kurzer Zeit. Bitte prüfe den Vorgang.';
  end if;
  if nullif(trim(coalesce(input_receipt_number, '')), '') is not null and exists (
    select 1 from public.points_transactions pt
    where pt.restaurant_id = input_restaurant_id
      and pt.receipt_number = trim(input_receipt_number)
      and pt.created_at > now() - interval '24 hours'
  ) then raise exception 'Diese Bonnummer wurde bereits verwendet.'; end if;

  local_date_value := timezone(coalesce(restaurant_record.timezone_name, 'Europe/Vienna'), now())::date;
  local_day_start := local_date_value::timestamp at time zone coalesce(restaurant_record.timezone_name, 'Europe/Vienna');
  local_next_day_start := (local_date_value + 1)::timestamp at time zone coalesce(restaurant_record.timezone_name, 'Europe/Vienna');
  if (select count(*) from public.points_transactions pt
    where pt.restaurant_id = input_restaurant_id
      and pt.customer_id = customer_record.id
      and pt.type = 'earn' and pt.points > 0
      and pt.created_at >= local_day_start
      and pt.created_at < local_next_day_start) >= 2 then
    perform public.write_audit_event(
      input_restaurant_id, customer_record.id, 'staff', auth.uid(),
      'POINTS_DAILY_LIMIT_BLOCKED', 'blocked', 'staff_portal',
      'customers', customer_record.id, input_idempotency_key,
      jsonb_build_object('limit', 2)
    );
    return jsonb_build_object('success', false, 'error_code', 'POINTS_DAILY_LIMIT',
      'error_message', 'Für diesen Gast wurde das heutige Buchungslimit erreicht.');
  end if;

  pin_record := public.ensure_today_restaurant_pin(input_restaurant_id, qr_record.branch_id);
  if pin_record.valid_until <= now() then raise exception 'Die Tages-PIN ist nicht mehr gültig.'; end if;
  if exists (select 1 from public.daily_pin_attempts d
    where d.restaurant_id = input_restaurant_id
      and d.branch_id = qr_record.branch_id
      and d.customer_id = customer_record.id
      and d.valid_date = local_date_value
      and d.locked_until > now()) then
    return jsonb_build_object('success', false, 'error_code', 'DAILY_PIN_LOCKED',
      'error_message', 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.');
  end if;
  if pin_record.pin_code <> trim(coalesce(input_daily_pin, '')) then
    pin_failure := public.persist_daily_pin_rejection(
      input_restaurant_id, customer_record.id, qr_record.branch_id, null,
      'staff_portal', 'staff', input_idempotency_key
    );
    return pin_failure;
  end if;

  result_payload := public.award_points_v1(
    input_restaurant_id, customer_record.id, qr_record.branch_id,
    input_amount_cents, 'restaurant_controlled',
    'Direkt im Restaurant bezahlter bonusberechtigter Betrag',
    input_idempotency_key, input_receipt_number, auth.uid()
  );

  update public.daily_pin_attempts d
  set failed_attempts = 0, locked_until = null, updated_at = now()
  where d.restaurant_id = input_restaurant_id
    and d.branch_id = qr_record.branch_id
    and d.customer_id = customer_record.id
    and d.valid_date = local_date_value;

  update public.customer_points_qr_references q
  set consumed_at = now(),
      consumed_transaction_id = (result_payload->>'transaction_id')::uuid
  where q.id = qr_record.id and q.consumed_at is null;
  if not found then raise exception 'QR-Code wurde bereits verwendet.'; end if;

  insert into public.restaurant_points_credit_attempts (
    restaurant_id, customer_id, actor_user_id, reference_hash, amount_cents, status
  ) values (
    input_restaurant_id, customer_record.id, auth.uid(), hashed_reference,
    input_amount_cents, 'completed'
  );

  perform public.write_audit_event(
    input_restaurant_id, customer_record.id, 'staff', auth.uid(),
    'RESTAURANT_CONTROLLED_POINTS_ADDED', 'completed', 'staff_portal',
    'points_transactions', (result_payload->>'transaction_id')::uuid,
    input_idempotency_key, jsonb_build_object(
      'amount_cents', input_amount_cents,
      'base_points', (result_payload->>'base_points')::integer,
      'boost_multiplier', (result_payload->>'boost_multiplier')::numeric,
      'final_points', (result_payload->>'final_points')::integer,
      'bonus_rule_version', result_payload->>'bonus_rule_version',
      'boost_source', result_payload->>'boost_source',
      'boost_expires_at', result_payload->>'boost_expires_at'
    )
  );
  if input_amount_cents >= floor(settings_record.points_collection_max_amount_cents * 0.8) then
    perform public.write_audit_event(
      input_restaurant_id, customer_record.id, 'staff', auth.uid(),
      'HIGH_POINTS_AMOUNT_REVIEW', 'completed', 'staff_portal',
      'points_transactions', (result_payload->>'transaction_id')::uuid,
      input_idempotency_key, jsonb_build_object(
        'amount_cents', input_amount_cents,
        'limit_cents', settings_record.points_collection_max_amount_cents
      )
    );
  end if;
  return result_payload;
end;
$$;

revoke execute on function public.confirm_restaurant_controlled_points(uuid, text, integer, text, uuid, text)
from public, anon;
grant execute on function public.confirm_restaurant_controlled_points(uuid, text, integer, text, uuid, text)
to authenticated;

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
set search_path = public, pg_temp
as $$
<<customer_collection>>
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  settings_record public.loyalty_settings%rowtype;
  request_record public.points_collection_requests%rowtype;
  daily_pin_record public.restaurant_daily_pins%rowtype;
  attempt_record public.daily_pin_attempts%rowtype;
  tier_record jsonb;
  result_payload jsonb;
  token_hash_value text;
  branch_id_value uuid;
  tier_amount numeric;
  amount_cents_value integer;
  local_date_value date;
  local_day_start timestamptz;
  local_next_day_start timestamptz;
  safe_message text;
  next_reward jsonb;
begin
  if input_idempotency_key is null then raise exception 'Buchungs-ID fehlt.'; end if;

  select * into restaurant_record from public.restaurants r
  where r.slug = trim(input_restaurant_slug) and r.status = 'active';
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
    and c.membership_status = 'active'
  limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;

  branch_id_value := coalesce(
    customer_record.branch_id,
    restaurant_record.primary_branch_id,
    public.restaurant_primary_branch_id(restaurant_record.id)
  );

  insert into public.points_collection_requests (
    restaurant_id, organization_id, branch_id, customer_id,
    idempotency_key, source
  ) values (
    restaurant_record.id, restaurant_record.organization_id, branch_id_value,
    customer_record.id, input_idempotency_key, 'customer_portal'
  ) on conflict do nothing;

  select * into request_record from public.points_collection_requests pcr
  where pcr.restaurant_id = restaurant_record.id
    and pcr.branch_id = branch_id_value
    and pcr.customer_id = customer_record.id
    and pcr.idempotency_key = input_idempotency_key
  for update;
  if request_record.status = 'completed' then return request_record.result_payload; end if;

  begin
    select * into settings_record from public.loyalty_settings ls
    where ls.restaurant_id = restaurant_record.id and ls.active = true;
    if settings_record.id is null then raise exception 'Bonusprogramm wurde nicht gefunden.'; end if;
    if settings_record.points_collection_mode not in ('customer_initiated_only', 'both') then
      raise exception 'Dieser Sammelweg ist nicht aktiviert.';
    end if;

    select tier into tier_record
    from jsonb_array_elements(settings_record.bonus_amount_tiers) tier
    where tier->>'key' = input_amount_tier_key
    limit 1;
    if tier_record is null then raise exception 'Bon-Stufe wurde nicht gefunden.'; end if;
    tier_amount := greatest(
      coalesce((tier_record->>'min')::numeric, (tier_record->>'amount')::numeric, 0), 0
    );
    amount_cents_value := round(tier_amount * 100)::integer;
    if amount_cents_value <= 0 then raise exception 'Der Betrag ergibt noch keinen Punkt.'; end if;
    if amount_cents_value > settings_record.points_collection_max_amount_cents then
      raise exception 'Der Betrag überschreitet das für dieses Restaurant festgelegte Limit.';
    end if;

    select * into customer_record from public.customers c
    where c.id = customer_record.id
      and c.restaurant_id = restaurant_record.id
      and c.membership_status = 'active'
    for update;
    if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;

    local_date_value := timezone(coalesce(restaurant_record.timezone_name, 'Europe/Vienna'), now())::date;
    local_day_start := local_date_value::timestamp at time zone coalesce(restaurant_record.timezone_name, 'Europe/Vienna');
    local_next_day_start := (local_date_value + 1)::timestamp at time zone coalesce(restaurant_record.timezone_name, 'Europe/Vienna');
    daily_pin_record := public.ensure_today_restaurant_pin(restaurant_record.id, branch_id_value);

    select * into attempt_record from public.daily_pin_attempts d
    where d.restaurant_id = restaurant_record.id
      and d.branch_id = branch_id_value
      and d.customer_id = customer_record.id
      and d.valid_date = local_date_value
    for update;
    if attempt_record.locked_until > now() then
      result_payload := jsonb_build_object('success', false,
        'error_code', 'DAILY_PIN_LOCKED',
        'error_message', 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.');
    elsif daily_pin_record.valid_until <= now() then
      result_payload := jsonb_build_object('success', false,
        'error_code', 'DAILY_PIN_EXPIRED',
        'error_message', 'Die Tages-PIN ist nicht mehr gültig.');
    elsif daily_pin_record.pin_code <> trim(coalesce(input_daily_pin, '')) then
      result_payload := public.persist_daily_pin_rejection(
        restaurant_record.id, customer_record.id, branch_id_value,
        token_hash_value, 'customer_portal', 'customer', input_idempotency_key
      );
    elsif (select count(*) from public.points_transactions pt
      where pt.restaurant_id = restaurant_record.id
        and pt.customer_id = customer_record.id
        and pt.type = 'earn' and pt.points > 0
        and pt.created_at >= local_day_start
        and pt.created_at < local_next_day_start) >= 2 then
      result_payload := jsonb_build_object('success', false,
        'error_code', 'POINTS_DAILY_LIMIT',
        'error_message', 'Du hast heute bereits zweimal Punkte gesammelt. Morgen kannst du wieder Punkte sammeln.');
      perform public.write_audit_event(
        restaurant_record.id, customer_record.id, 'customer', customer_record.id,
        'POINTS_DAILY_LIMIT_BLOCKED', 'blocked', 'customer_portal',
        'customers', customer_record.id, input_idempotency_key,
        jsonb_build_object('limit', 2)
      );
    elsif exists (
      select 1 from public.points_transactions pt
      where pt.restaurant_id = restaurant_record.id
        and pt.customer_id = customer_record.id
        and pt.type = 'earn'
        and pt.collection_source = 'customer_initiated'
        and pt.created_at > now() - interval '5 minutes'
    ) then
      result_payload := jsonb_build_object('success', false,
        'error_code', 'POINTS_COLLECTION_RECENT',
        'error_message', 'Diese Buchung wurde gerade schon erfasst.');
    else
      result_payload := public.award_points_v1(
        restaurant_record.id, customer_record.id, branch_id_value,
        amount_cents_value, 'customer_initiated', 'bonus_qr',
        input_idempotency_key, null, null
      );

      update public.daily_pin_attempts d
      set failed_attempts = 0, locked_until = null, updated_at = now()
      where d.restaurant_id = restaurant_record.id
        and d.branch_id = branch_id_value
        and d.customer_id = customer_record.id
        and d.valid_date = local_date_value;

      perform public.record_customer_device(
        restaurant_record.id, customer_record.id,
        nullif(trim(coalesce(input_device_id, '')), '')
      );

      with candidates as (
        select r.title, r.required_points
        from public.rewards r
        where r.restaurant_id = restaurant_record.id
          and r.active = true
          and r.is_starter_reward = false
          and r.required_points > (result_payload->>'points_balance')::integer
          and (r.expires_at is null or r.expires_at > now())
      )
      select jsonb_build_object(
        'title', title,
        'required_points', required_points,
        'remaining_points', greatest(
          required_points - (result_payload->>'points_balance')::integer, 0
        )
      ) into next_reward from candidates
      order by required_points, title
      limit 1;

      result_payload := result_payload || jsonb_build_object(
        'success', true,
        'amount_tier_key', input_amount_tier_key,
        'amount_tier_label', tier_record->>'label',
        'bonus_multiplier', (result_payload->>'boost_multiplier')::numeric,
        'next_reward', next_reward
      );

      perform public.write_audit_event(
        restaurant_record.id, customer_record.id, 'customer', customer_record.id,
        'POINTS_ADDED', 'completed', 'customer_portal',
        'points_transactions', (result_payload->>'transaction_id')::uuid,
        input_idempotency_key, jsonb_build_object(
          'amount_tier_key', input_amount_tier_key,
          'amount_cents', amount_cents_value,
          'base_points', (result_payload->>'base_points')::integer,
          'boost_multiplier', (result_payload->>'boost_multiplier')::numeric,
          'final_points', (result_payload->>'final_points')::integer,
          'bonus_rule_version', result_payload->>'bonus_rule_version',
          'boost_source', result_payload->>'boost_source',
          'boost_expires_at', result_payload->>'boost_expires_at'
        )
      );
    end if;
  exception when others then
    safe_message := case
      when sqlerrm in (
        'Dieser Sammelweg ist nicht aktiviert.',
        'Der Betrag überschreitet das für dieses Restaurant festgelegte Limit.',
        'Der Betrag ergibt noch keinen Punkt.'
      ) then sqlerrm
      else 'Punkte konnten gerade nicht gebucht werden. Bitte versuche es erneut.'
    end;
    result_payload := jsonb_build_object('success', false,
      'error_code', 'POINTS_COLLECTION_FAILED', 'error_message', safe_message);
    perform public.write_audit_event(
      restaurant_record.id, customer_record.id, 'customer', customer_record.id,
      'POINTS_ADD_FAILED', 'failed', 'customer_portal',
      'points_collection_requests', request_record.id, input_idempotency_key,
      jsonb_build_object('reason', safe_message),
      'POINTS_COLLECTION_FAILED', safe_message
    );
  end;

  update public.points_collection_requests pcr
  set status = 'completed', result_payload = customer_collection.result_payload, completed_at = now()
  where pcr.id = request_record.id;
  return result_payload;
end;
$$;

revoke execute on function public.collect_bonus_points(text, text, text)
from public, anon, authenticated;
revoke execute on function public.collect_bonus_points(text, text, text, text, text)
from public, anon, authenticated;
revoke execute on function public.collect_bonus_points_v1(text, text, text, text, text, uuid)
from public;
grant execute on function public.collect_bonus_points_v1(text, text, text, text, text, uuid)
to anon, authenticated;

create or replace function public.reverse_restaurant_controlled_points(
  input_restaurant_id uuid,
  input_transaction_id uuid,
  input_reason text,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  original public.points_transactions%rowtype;
  reversal_id uuid;
  next_balance integer;
begin
  if not exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = input_restaurant_id
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'manager')
  ) then raise exception 'Nicht berechtigt.'; end if;
  if input_idempotency_key is null or length(trim(coalesce(input_reason, ''))) < 5 then
    raise exception 'Buchungs-ID und Begründung sind erforderlich.';
  end if;

  select * into original from public.points_transactions pt
  where pt.id = input_transaction_id
    and pt.restaurant_id = input_restaurant_id
    and pt.type = 'earn'
    and pt.collection_source = 'restaurant_controlled'
  for update;
  if original.id is null then raise exception 'Buchung wurde nicht gefunden.'; end if;

  select pt.id into reversal_id from public.points_transactions pt
  where pt.reversal_of = original.id;
  if reversal_id is not null then
    select c.points_balance into next_balance from public.customers c
    where c.id = original.customer_id and c.restaurant_id = input_restaurant_id;
    return jsonb_build_object(
      'reversal_transaction_id', reversal_id,
      'points_balance', next_balance,
      'already_reversed', true
    );
  end if;

  update public.customers c
  set points_balance = greatest(0, c.points_balance - original.points)
  where c.id = original.customer_id and c.restaurant_id = input_restaurant_id
  returning c.points_balance into next_balance;

  insert into public.points_transactions (
    restaurant_id, organization_id, branch_id, customer_id, type, points,
    reason, idempotency_key, amount_cents, rule_version, applied_rate,
    collection_source, staff_user_id, reversal_of, base_points,
    boost_multiplier, boost_source, boost_expires_at, bonus_rule_version
  ) values (
    original.restaurant_id, original.organization_id, original.branch_id,
    original.customer_id, 'adjust', -original.points, trim(input_reason),
    input_idempotency_key, original.amount_cents, original.rule_version,
    original.applied_rate, 'reversal', auth.uid(), original.id,
    original.base_points, original.boost_multiplier, original.boost_source,
    original.boost_expires_at, original.bonus_rule_version
  ) returning id into reversal_id;

  perform public.write_audit_event(
    input_restaurant_id, original.customer_id, 'admin', auth.uid(),
    'POINTS_CREDIT_REVERSED', 'completed', 'owner_portal',
    'points_transactions', reversal_id, input_idempotency_key,
    jsonb_build_object(
      'original_transaction_id', original.id,
      'base_points', original.base_points,
      'boost_multiplier', original.boost_multiplier,
      'points_reversed', original.points,
      'bonus_rule_version', original.bonus_rule_version,
      'reason', trim(input_reason)
    )
  );
  return jsonb_build_object(
    'reversal_transaction_id', reversal_id,
    'points_balance', next_balance,
    'already_reversed', false
  );
end;
$$;

revoke execute on function public.reverse_restaurant_controlled_points(uuid, uuid, text, uuid)
from public, anon;
grant execute on function public.reverse_restaurant_controlled_points(uuid, uuid, text, uuid)
to authenticated;

notify pgrst, 'reload schema';
