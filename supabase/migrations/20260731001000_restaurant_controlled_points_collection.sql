-- WUXUAI Bonus V1: owner-selectable collection mode and restaurant-controlled credits.
-- Existing rows keep the customer-initiated flow; new rows default to restaurant-controlled.

alter table public.loyalty_settings
  add column if not exists points_collection_mode text,
  add column if not exists points_collection_max_amount_cents integer;

update public.loyalty_settings set points_collection_mode = 'customer_initiated_only'
where points_collection_mode is null;
update public.loyalty_settings set points_collection_max_amount_cents = 30000
where points_collection_max_amount_cents is null;

alter table public.loyalty_settings
  alter column points_collection_mode set default 'restaurant_controlled_only',
  alter column points_collection_mode set not null,
  alter column points_collection_max_amount_cents set default 30000,
  alter column points_collection_max_amount_cents set not null,
  drop constraint if exists loyalty_settings_points_collection_mode_check,
  add constraint loyalty_settings_points_collection_mode_check check (
    points_collection_mode in ('restaurant_controlled_only', 'customer_initiated_only', 'both')
  ),
  drop constraint if exists loyalty_settings_points_collection_max_check,
  add constraint loyalty_settings_points_collection_max_check check (
    points_collection_max_amount_cents between 100 and 100000
  );

alter table public.points_transactions
  add column if not exists amount_cents integer,
  add column if not exists rule_version text,
  add column if not exists applied_rate numeric(12,4),
  add column if not exists collection_source text,
  add column if not exists receipt_number text,
  add column if not exists staff_user_id uuid references auth.users(id) on delete set null,
  add column if not exists reversal_of uuid references public.points_transactions(id) on delete restrict;

create unique index if not exists points_transactions_one_reversal_idx
on public.points_transactions (reversal_of) where reversal_of is not null;

create table if not exists public.customer_points_qr_references (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  purpose text not null default 'points_credit' check (purpose = 'points_credit'),
  token_hash text not null unique,
  manual_code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_transaction_id uuid references public.points_transactions(id) on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.customer_points_qr_references enable row level security;
revoke all on table public.customer_points_qr_references from anon, authenticated;
create index if not exists customer_points_qr_references_scope_idx
on public.customer_points_qr_references (restaurant_id, customer_id, expires_at desc);

create table if not exists public.restaurant_points_credit_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  reference_hash text not null,
  amount_cents integer,
  status text not null check (status in ('previewed', 'completed', 'blocked')),
  reason_code text,
  created_at timestamptz not null default now()
);
alter table public.restaurant_points_credit_attempts enable row level security;
revoke all on table public.restaurant_points_credit_attempts from anon, authenticated;
create index if not exists restaurant_points_credit_attempts_rate_idx
on public.restaurant_points_credit_attempts (restaurant_id, actor_user_id, customer_id, created_at desc);

create or replace function public.enforce_points_collection_mode()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare mode_value text;
begin
  select points_collection_mode into mode_value from public.loyalty_settings
  where restaurant_id = new.restaurant_id and active = true;
  if new.source = 'customer_portal' and mode_value = 'restaurant_controlled_only' then
    raise exception 'Dieser Sammelweg ist nicht aktiviert.';
  end if;
  if new.source = 'staff_portal' and mode_value = 'restaurant_controlled_only' then
    raise exception 'Bitte scanne den persönlichen Kunden-QR.';
  end if;
  return new;
end $$;

drop trigger if exists enforce_points_collection_mode_trigger on public.points_collection_requests;
create trigger enforce_points_collection_mode_trigger before insert on public.points_collection_requests
for each row execute function public.enforce_points_collection_mode();

create or replace function public.get_public_points_collection_mode(input_restaurant_slug text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select ls.points_collection_mode from public.restaurants r
  join public.loyalty_settings ls on ls.restaurant_id = r.id and ls.active = true
  where r.slug = trim(input_restaurant_slug) and r.status = 'active' limit 1
$$;

create or replace function public.update_points_collection_settings(
  input_restaurant_id uuid, input_mode text, input_max_amount_cents integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare previous_mode text; previous_limit integer; settings_id uuid;
begin
  if not exists (select 1 from public.restaurant_members rm where rm.restaurant_id = input_restaurant_id
    and rm.user_id = auth.uid() and rm.role in ('owner', 'admin', 'manager')) then raise exception 'Nicht berechtigt.'; end if;
  if input_mode not in ('restaurant_controlled_only', 'customer_initiated_only', 'both') then raise exception 'Punktevergabe-Modus ist ungültig.'; end if;
  if input_max_amount_cents not between 100 and 100000 then raise exception 'Maximalbetrag muss zwischen 1 und 1.000 Euro liegen.'; end if;
  select id, points_collection_mode, points_collection_max_amount_cents
    into settings_id, previous_mode, previous_limit from public.loyalty_settings
    where restaurant_id = input_restaurant_id for update;
  if settings_id is null then raise exception 'Bonusprogramm wurde nicht gefunden.'; end if;
  update public.loyalty_settings set points_collection_mode = input_mode,
    points_collection_max_amount_cents = input_max_amount_cents where id = settings_id;
  perform public.write_audit_event(input_restaurant_id, null, 'admin', auth.uid(),
    'POINTS_COLLECTION_SETTINGS_UPDATED', 'completed', 'owner_portal', 'loyalty_settings', settings_id,
    extensions.gen_random_uuid(), jsonb_build_object('previous_mode', previous_mode, 'new_mode', input_mode,
      'previous_limit_cents', previous_limit, 'new_limit_cents', input_max_amount_cents));
  return jsonb_build_object('points_collection_mode', input_mode,
    'points_collection_max_amount_cents', input_max_amount_cents);
end $$;

create or replace function public.reverse_restaurant_controlled_points(
  input_restaurant_id uuid, input_transaction_id uuid, input_reason text, input_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare original public.points_transactions%rowtype; reversal_id uuid; next_balance integer;
begin
  if not exists (select 1 from public.restaurant_members rm where rm.restaurant_id = input_restaurant_id
    and rm.user_id = auth.uid() and rm.role in ('owner', 'manager')) then raise exception 'Nicht berechtigt.'; end if;
  if input_idempotency_key is null or length(trim(coalesce(input_reason, ''))) < 5 then
    raise exception 'Buchungs-ID und Begründung sind erforderlich.';
  end if;
  select * into original from public.points_transactions p where p.id = input_transaction_id
    and p.restaurant_id = input_restaurant_id and p.type = 'earn'
    and p.collection_source = 'restaurant_controlled' for update;
  if original.id is null then raise exception 'Buchung wurde nicht gefunden.'; end if;
  select id into reversal_id from public.points_transactions where reversal_of = original.id;
  if reversal_id is not null then
    select points_balance into next_balance from public.customers where id = original.customer_id;
    return jsonb_build_object('reversal_transaction_id', reversal_id, 'points_balance', next_balance, 'already_reversed', true);
  end if;
  update public.customers set points_balance = greatest(0, points_balance - original.points)
    where id = original.customer_id and restaurant_id = input_restaurant_id returning points_balance into next_balance;
  insert into public.points_transactions (restaurant_id, organization_id, branch_id, customer_id, type, points,
    reason, idempotency_key, amount_cents, rule_version, applied_rate, collection_source, staff_user_id, reversal_of)
  values (original.restaurant_id, original.organization_id, original.branch_id, original.customer_id, 'adjust',
    -original.points, trim(input_reason), input_idempotency_key, original.amount_cents,
    original.rule_version, original.applied_rate, 'reversal', auth.uid(), original.id) returning id into reversal_id;
  perform public.write_audit_event(input_restaurant_id, original.customer_id, 'admin', auth.uid(),
    'POINTS_CREDIT_REVERSED', 'completed', 'owner_portal', 'points_transactions', reversal_id,
    input_idempotency_key, jsonb_build_object('original_transaction_id', original.id,
      'points_reversed', original.points, 'reason', trim(input_reason)));
  return jsonb_build_object('reversal_transaction_id', reversal_id, 'points_balance', next_balance, 'already_reversed', false);
end $$;

create or replace function public.create_customer_points_credit_qr(
  input_restaurant_slug text, input_customer_token text
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare restaurant_record public.restaurants%rowtype; customer_record public.customers%rowtype;
  mode_value text; raw_token text; raw_code text; expiry_value timestamptz := now() + interval '5 minutes';
begin
  select * into restaurant_record from public.restaurants where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  select points_collection_mode into mode_value from public.loyalty_settings where restaurant_id = restaurant_record.id and active = true;
  if mode_value not in ('restaurant_controlled_only', 'both') then raise exception 'Dieser Sammelweg ist nicht aktiviert.'; end if;
  select c.* into customer_record from public.customer_qr_tokens t join public.customers c on c.id = t.customer_id
  where t.restaurant_id = restaurant_record.id and t.token_hash = public.hash_public_token(input_customer_token)
    and t.active = true and (t.expires_at is null or t.expires_at > now())
    and c.restaurant_id = restaurant_record.id and c.membership_status = 'active' limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  if (select count(*) from public.customer_points_qr_references q where q.customer_id = customer_record.id
    and q.created_at > now() - interval '1 minute') >= 5 then raise exception 'Bitte warte kurz und versuche es erneut.'; end if;
  update public.customer_points_qr_references set revoked_at = now()
  where restaurant_id = restaurant_record.id and customer_id = customer_record.id
    and consumed_at is null and revoked_at is null and expires_at > now();
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  loop raw_code := public.generate_numeric_code(8);
    exit when not exists (select 1 from public.customer_points_qr_references q
      where q.manual_code_hash = public.hash_public_token(raw_code)); end loop;
  insert into public.customer_points_qr_references (restaurant_id, organization_id, branch_id, customer_id,
    token_hash, manual_code_hash, expires_at) values (restaurant_record.id, restaurant_record.organization_id,
    coalesce(customer_record.branch_id, restaurant_record.primary_branch_id, public.restaurant_primary_branch_id(restaurant_record.id)),
    customer_record.id, public.hash_public_token(raw_token), public.hash_public_token(raw_code), expiry_value);
  return jsonb_build_object('qr_token', raw_token, 'manual_code', raw_code, 'expires_at', expiry_value);
end $$;

create or replace function public.preview_restaurant_controlled_points(
  input_restaurant_id uuid, input_qr_reference text, input_amount_cents integer
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare qr_record public.customer_points_qr_references%rowtype; customer_record public.customers%rowtype;
  settings_record public.loyalty_settings%rowtype; hashed_reference text; point_value integer; last_visit timestamptz;
begin
  if not public.is_restaurant_member(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  select * into settings_record from public.loyalty_settings where restaurant_id = input_restaurant_id and active = true;
  if settings_record.points_collection_mode not in ('restaurant_controlled_only', 'both') then raise exception 'Dieser Sammelweg ist nicht aktiviert.'; end if;
  if input_amount_cents <= 0 then raise exception 'Der bonusberechtigte Betrag muss größer als null sein.'; end if;
  if input_amount_cents > settings_record.points_collection_max_amount_cents then
    perform public.write_audit_event(input_restaurant_id, null, 'staff', auth.uid(), 'POINTS_AMOUNT_LIMIT_BLOCKED',
      'blocked', 'staff_portal', 'loyalty_settings', settings_record.id, extensions.gen_random_uuid(),
      jsonb_build_object('amount_cents', input_amount_cents, 'limit_cents', settings_record.points_collection_max_amount_cents));
    return jsonb_build_object('success', false, 'error_code', 'POINTS_AMOUNT_LIMIT_EXCEEDED',
      'error_message', 'Der Betrag überschreitet das für dieses Restaurant festgelegte Limit.');
  end if;
  hashed_reference := public.hash_public_token(regexp_replace(coalesce(input_qr_reference, ''), '\\s', '', 'g'));
  if (select count(*) from public.restaurant_points_credit_attempts a where a.restaurant_id = input_restaurant_id
    and a.actor_user_id = auth.uid() and a.created_at > now() - interval '5 minutes') >= 30 then
    return jsonb_build_object('success', false, 'error_code', 'RATE_LIMITED',
      'error_message', 'Zu viele Versuche. Bitte warte kurz.');
  end if;
  select * into qr_record from public.customer_points_qr_references q where q.restaurant_id = input_restaurant_id
    and (q.token_hash = hashed_reference or q.manual_code_hash = hashed_reference) limit 1;
  if qr_record.id is null then
    insert into public.restaurant_points_credit_attempts (restaurant_id, actor_user_id, reference_hash, status, reason_code)
    values (input_restaurant_id, auth.uid(), hashed_reference, 'blocked', 'QR_NOT_FOUND');
    return jsonb_build_object('success', false, 'error_code', 'QR_NOT_FOUND', 'error_message', 'QR-Code wurde nicht gefunden.');
  end if;
  if qr_record.consumed_at is not null then raise exception 'QR-Code wurde bereits verwendet.'; end if;
  if qr_record.revoked_at is not null or qr_record.expires_at <= now() then raise exception 'QR-Code ist abgelaufen.'; end if;
  select * into customer_record from public.customers c where c.id = qr_record.customer_id
    and c.restaurant_id = input_restaurant_id and c.membership_status = 'active';
  if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;
  point_value := floor((input_amount_cents::numeric / 100) / greatest(settings_record.amount_per_point, 0.01))::integer;
  select max(created_at) into last_visit from public.points_transactions where customer_id = customer_record.id and type = 'earn';
  insert into public.restaurant_points_credit_attempts (restaurant_id, customer_id, actor_user_id,
    reference_hash, amount_cents, status) values (input_restaurant_id, customer_record.id, auth.uid(),
    hashed_reference, input_amount_cents, 'previewed');
  return jsonb_build_object('customer_label', split_part(customer_record.name, ' ', 1),
    'points_balance', customer_record.points_balance, 'last_visit_at', last_visit,
    'amount_cents', input_amount_cents, 'expected_points', point_value,
    'high_amount_warning', input_amount_cents >= floor(settings_record.points_collection_max_amount_cents * 0.8),
    'expires_at', qr_record.expires_at);
end $$;

create or replace function public.confirm_restaurant_controlled_points(
  input_restaurant_id uuid, input_qr_reference text, input_amount_cents integer,
  input_daily_pin text, input_idempotency_key uuid, input_receipt_number text default null
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare qr_record public.customer_points_qr_references%rowtype; customer_record public.customers%rowtype;
  settings_record public.loyalty_settings%rowtype; restaurant_record public.restaurants%rowtype;
  pin_record public.restaurant_daily_pins%rowtype; hashed_reference text; point_value integer;
  transaction_id_value uuid; existing_transaction public.points_transactions%rowtype; next_balance integer;
  pin_failure jsonb;
begin
  if not public.is_restaurant_member(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  if input_idempotency_key is null then raise exception 'Buchungs-ID fehlt.'; end if;
  select * into existing_transaction from public.points_transactions
    where restaurant_id = input_restaurant_id and idempotency_key = input_idempotency_key;
  if existing_transaction.id is not null then
    select points_balance into next_balance from public.customers where id = existing_transaction.customer_id;
    return jsonb_build_object('transaction_id', existing_transaction.id, 'points_added', existing_transaction.points,
      'points_balance', next_balance, 'amount_cents', existing_transaction.amount_cents, 'already_completed', true);
  end if;
  select * into restaurant_record from public.restaurants where id = input_restaurant_id and status = 'active';
  select * into settings_record from public.loyalty_settings where restaurant_id = input_restaurant_id and active = true;
  if settings_record.points_collection_mode not in ('restaurant_controlled_only', 'both') then raise exception 'Dieser Sammelweg ist nicht aktiviert.'; end if;
  if input_amount_cents <= 0 then raise exception 'Der bonusberechtigte Betrag muss größer als null sein.'; end if;
  if input_amount_cents > settings_record.points_collection_max_amount_cents then
    perform public.write_audit_event(input_restaurant_id, null, 'staff', auth.uid(), 'POINTS_AMOUNT_LIMIT_BLOCKED',
      'blocked', 'staff_portal', 'loyalty_settings', settings_record.id, input_idempotency_key,
      jsonb_build_object('amount_cents', input_amount_cents, 'limit_cents', settings_record.points_collection_max_amount_cents));
    return jsonb_build_object('success', false, 'error_code', 'POINTS_AMOUNT_LIMIT_EXCEEDED',
      'error_message', 'Der Betrag überschreitet das für dieses Restaurant festgelegte Limit.');
  end if;
  hashed_reference := public.hash_public_token(regexp_replace(coalesce(input_qr_reference, ''), '\\s', '', 'g'));
  if (select count(*) from public.restaurant_points_credit_attempts a where a.restaurant_id = input_restaurant_id
    and a.actor_user_id = auth.uid() and a.created_at > now() - interval '5 minutes') >= 30 then
    return jsonb_build_object('success', false, 'error_code', 'RATE_LIMITED',
      'error_message', 'Zu viele Versuche. Bitte warte kurz.');
  end if;
  select * into qr_record from public.customer_points_qr_references q where q.restaurant_id = input_restaurant_id
    and (q.token_hash = hashed_reference or q.manual_code_hash = hashed_reference) for update;
  if qr_record.id is null then
    insert into public.restaurant_points_credit_attempts (restaurant_id, actor_user_id, reference_hash, status, reason_code)
    values (input_restaurant_id, auth.uid(), hashed_reference, 'blocked', 'QR_NOT_FOUND');
    return jsonb_build_object('success', false, 'error_code', 'QR_NOT_FOUND', 'error_message', 'QR-Code wurde nicht gefunden.');
  end if;
  if qr_record.consumed_at is not null then raise exception 'QR-Code wurde bereits verwendet.'; end if;
  if qr_record.revoked_at is not null or qr_record.expires_at <= now() then raise exception 'QR-Code ist abgelaufen.'; end if;
  select * into customer_record from public.customers c where c.id = qr_record.customer_id
    and c.restaurant_id = input_restaurant_id and c.membership_status = 'active' for update;
  if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;
  if (select count(*) from public.restaurant_points_credit_attempts a where a.restaurant_id = input_restaurant_id
    and a.actor_user_id = auth.uid() and a.customer_id = customer_record.id and a.status = 'completed'
    and a.created_at > now() - interval '5 minutes') >= 3 then raise exception 'Zu viele Buchungen in kurzer Zeit. Bitte prüfe den Vorgang.'; end if;
  if nullif(trim(coalesce(input_receipt_number, '')), '') is not null and exists (
    select 1 from public.points_transactions p where p.restaurant_id = input_restaurant_id
      and p.receipt_number = trim(input_receipt_number) and p.created_at > now() - interval '24 hours'
  ) then raise exception 'Diese Bonnummer wurde bereits verwendet.'; end if;
  if (select count(*) from public.points_transactions p where p.restaurant_id = input_restaurant_id
    and p.customer_id = customer_record.id and p.type = 'earn' and p.points > 0
    and p.created_at >= (timezone(coalesce(restaurant_record.timezone_name, 'Europe/Vienna'), now())::date::timestamp
      at time zone coalesce(restaurant_record.timezone_name, 'Europe/Vienna'))
    and p.created_at < ((timezone(coalesce(restaurant_record.timezone_name, 'Europe/Vienna'), now())::date + 1)::timestamp
      at time zone coalesce(restaurant_record.timezone_name, 'Europe/Vienna'))) >= 2 then
    perform public.write_audit_event(input_restaurant_id, customer_record.id, 'staff', auth.uid(),
      'POINTS_DAILY_LIMIT_BLOCKED', 'blocked', 'staff_portal', 'customers', customer_record.id,
      input_idempotency_key, jsonb_build_object('limit', 2));
    return jsonb_build_object('success', false, 'error_code', 'POINTS_DAILY_LIMIT',
      'error_message', 'Für diesen Gast wurde das heutige Buchungslimit erreicht.');
  end if;
  pin_record := public.ensure_today_restaurant_pin(input_restaurant_id, qr_record.branch_id);
  if pin_record.valid_until <= now() then raise exception 'Die Tages-PIN ist nicht mehr gültig.'; end if;
  if exists (select 1 from public.daily_pin_attempts d where d.restaurant_id = input_restaurant_id
    and d.branch_id = qr_record.branch_id and d.customer_id = customer_record.id
    and d.valid_date = timezone(coalesce(restaurant_record.timezone_name, 'Europe/Vienna'), now())::date
    and d.locked_until > now()) then
    return jsonb_build_object('success', false, 'error_code', 'DAILY_PIN_LOCKED',
      'error_message', 'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.');
  end if;
  if pin_record.pin_code <> trim(coalesce(input_daily_pin, '')) then
    pin_failure := public.persist_daily_pin_rejection(input_restaurant_id, customer_record.id,
      qr_record.branch_id, null, 'staff_portal', 'staff', input_idempotency_key);
    return pin_failure;
  end if;
  point_value := floor((input_amount_cents::numeric / 100) / greatest(settings_record.amount_per_point, 0.01))::integer;
  if point_value <= 0 then raise exception 'Der Betrag ergibt noch keinen Punkt.'; end if;
  insert into public.points_transactions (restaurant_id, organization_id, branch_id, customer_id, type, points,
    reason, idempotency_key, amount_cents, rule_version, applied_rate, collection_source, receipt_number, staff_user_id)
  values (input_restaurant_id, restaurant_record.organization_id, qr_record.branch_id, customer_record.id,
    'earn', point_value, 'Direkt im Restaurant bezahlter bonusberechtigter Betrag', input_idempotency_key,
    input_amount_cents, 'restaurant_controlled_v1', settings_record.amount_per_point,
    'restaurant_controlled', nullif(trim(input_receipt_number), ''), auth.uid()) returning id into transaction_id_value;
  update public.customers set points_balance = points_balance + point_value where id = customer_record.id
    returning points_balance into next_balance;
  update public.daily_pin_attempts set failed_attempts = 0, locked_until = null, updated_at = now()
    where restaurant_id = input_restaurant_id and branch_id = qr_record.branch_id
      and customer_id = customer_record.id
      and valid_date = timezone(coalesce(restaurant_record.timezone_name, 'Europe/Vienna'), now())::date;
  update public.customer_points_qr_references set consumed_at = now(), consumed_transaction_id = transaction_id_value
    where id = qr_record.id and consumed_at is null;
  insert into public.restaurant_points_credit_attempts (restaurant_id, customer_id, actor_user_id,
    reference_hash, amount_cents, status) values (input_restaurant_id, customer_record.id, auth.uid(),
    hashed_reference, input_amount_cents, 'completed');
  update public.customer_rewards set status = 'active', unlocked_at = now()
    where restaurant_id = input_restaurant_id and customer_id = customer_record.id
      and is_starter_reward = true and status = 'locked';
  perform public.write_audit_event(input_restaurant_id, customer_record.id, 'staff', auth.uid(),
    'RESTAURANT_CONTROLLED_POINTS_ADDED', 'completed', 'staff_portal', 'points_transactions', transaction_id_value,
    input_idempotency_key, jsonb_build_object('amount_cents', input_amount_cents, 'points', point_value,
      'rule_version', 'restaurant_controlled_v1', 'applied_rate', settings_record.amount_per_point));
  if input_amount_cents >= floor(settings_record.points_collection_max_amount_cents * 0.8) then
    perform public.write_audit_event(input_restaurant_id, customer_record.id, 'staff', auth.uid(),
      'HIGH_POINTS_AMOUNT_REVIEW', 'completed', 'staff_portal', 'points_transactions', transaction_id_value,
      input_idempotency_key, jsonb_build_object('amount_cents', input_amount_cents,
        'limit_cents', settings_record.points_collection_max_amount_cents));
  end if;
  return jsonb_build_object('transaction_id', transaction_id_value, 'points_added', point_value,
    'points_balance', next_balance, 'amount_cents', input_amount_cents, 'already_completed', false);
end $$;

revoke execute on function public.get_public_points_collection_mode(text) from public;
grant execute on function public.get_public_points_collection_mode(text) to anon, authenticated;
revoke execute on function public.update_points_collection_settings(uuid, text, integer) from public, anon;
grant execute on function public.update_points_collection_settings(uuid, text, integer) to authenticated;
revoke execute on function public.create_customer_points_credit_qr(text, text) from public;
grant execute on function public.create_customer_points_credit_qr(text, text) to anon, authenticated;
revoke execute on function public.preview_restaurant_controlled_points(uuid, text, integer) from public, anon;
grant execute on function public.preview_restaurant_controlled_points(uuid, text, integer) to authenticated;
revoke execute on function public.confirm_restaurant_controlled_points(uuid, text, integer, text, uuid, text) from public, anon;
grant execute on function public.confirm_restaurant_controlled_points(uuid, text, integer, text, uuid, text) to authenticated;
revoke execute on function public.reverse_restaurant_controlled_points(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.reverse_restaurant_controlled_points(uuid, uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
