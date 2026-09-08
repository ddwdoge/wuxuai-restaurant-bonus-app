-- WUXUAI Bonus: show the canonical tenant customer name in the Staff points preview.

create or replace function public.preview_restaurant_controlled_points_before_minimum_guard(
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
    'customer_label', customer_record.name,
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

revoke execute on function public.preview_restaurant_controlled_points_before_minimum_guard(uuid, text, integer)
from public, anon, authenticated;
