-- WUXUAI Bonus V1: enforce the absolute 1 EUR minimum for amount-based points.

create or replace function public.validate_minimum_points_amount_v1(
  input_amount_cents integer
)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = public, pg_temp
as $$
begin
  if input_amount_cents is null or input_amount_cents < 100 then
    return jsonb_build_object(
      'success', false,
      'error_code', 'POINTS_AMOUNT_BELOW_MINIMUM',
      'error_message', 'Der Mindestbetrag für eine Punktegutschrift beträgt 1,00 €.'
    );
  end if;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.validate_minimum_points_amount_v1(integer)
from public, anon, authenticated;

-- Keep the already deployed implementations intact. Existing stored function
-- dependencies continue to point at these private implementations; the trigger
-- below is the final invariant for those legacy dependency paths.
alter function public.calculate_points_award_v1(uuid, uuid, integer)
  rename to calculate_points_award_v1_before_minimum_guard;
alter function public.award_points_v1(uuid, uuid, uuid, integer, text, text, uuid, text, uuid)
  rename to award_points_v1_before_minimum_guard;
alter function public.preview_restaurant_controlled_points(uuid, text, integer)
  rename to preview_restaurant_controlled_points_before_minimum_guard;
alter function public.confirm_restaurant_controlled_points(uuid, text, integer, text, uuid, text)
  rename to confirm_restaurant_controlled_points_before_minimum_guard;

revoke execute on function public.calculate_points_award_v1_before_minimum_guard(uuid, uuid, integer)
from public, anon, authenticated;
revoke execute on function public.award_points_v1_before_minimum_guard(uuid, uuid, uuid, integer, text, text, uuid, text, uuid)
from public, anon, authenticated;
revoke execute on function public.preview_restaurant_controlled_points_before_minimum_guard(uuid, text, integer)
from public, anon, authenticated;
revoke execute on function public.confirm_restaurant_controlled_points_before_minimum_guard(uuid, text, integer, text, uuid, text)
from public, anon, authenticated;

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
  validation jsonb;
begin
  validation := public.validate_minimum_points_amount_v1(input_amount_cents);
  if not coalesce((validation->>'success')::boolean, false) then
    raise exception using
      errcode = 'P0001',
      message = validation->>'error_code',
      detail = validation->>'error_message';
  end if;

  return public.calculate_points_award_v1_before_minimum_guard(
    input_restaurant_id,
    input_customer_id,
    input_amount_cents
  );
end;
$$;

revoke execute on function public.calculate_points_award_v1(uuid, uuid, integer)
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
  validation jsonb;
begin
  validation := public.validate_minimum_points_amount_v1(input_amount_cents);
  if not coalesce((validation->>'success')::boolean, false) then
    raise exception using
      errcode = 'P0001',
      message = validation->>'error_code',
      detail = validation->>'error_message';
  end if;

  return public.award_points_v1_before_minimum_guard(
    input_restaurant_id,
    input_customer_id,
    input_branch_id,
    input_amount_cents,
    input_source,
    input_reason,
    input_idempotency_key,
    input_receipt_number,
    input_staff_user_id
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
  validation jsonb;
begin
  validation := public.validate_minimum_points_amount_v1(input_amount_cents);
  if not coalesce((validation->>'success')::boolean, false) then
    return validation;
  end if;

  return public.preview_restaurant_controlled_points_before_minimum_guard(
    input_restaurant_id,
    input_qr_reference,
    input_amount_cents
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
  validation jsonb;
begin
  validation := public.validate_minimum_points_amount_v1(input_amount_cents);
  if not coalesce((validation->>'success')::boolean, false) then
    return validation;
  end if;

  return public.confirm_restaurant_controlled_points_before_minimum_guard(
    input_restaurant_id,
    input_qr_reference,
    input_amount_cents,
    input_daily_pin,
    input_idempotency_key,
    input_receipt_number
  );
end;
$$;

revoke execute on function public.confirm_restaurant_controlled_points(uuid, text, integer, text, uuid, text)
from public, anon;
grant execute on function public.confirm_restaurant_controlled_points(uuid, text, integer, text, uuid, text)
to authenticated;

create or replace function public.enforce_minimum_points_amount_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  validation jsonb;
begin
  if new.type = 'earn'
    and new.collection_source in ('customer_initiated', 'restaurant_controlled') then
    validation := public.validate_minimum_points_amount_v1(new.amount_cents);
    if not coalesce((validation->>'success')::boolean, false) then
      raise exception using
        errcode = 'P0001',
        message = validation->>'error_code',
        detail = validation->>'error_message';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_minimum_points_amount_v1()
from public, anon, authenticated;

drop trigger if exists enforce_minimum_points_amount_v1_trigger
on public.points_transactions;
create trigger enforce_minimum_points_amount_v1_trigger
before insert or update of amount_cents, collection_source, type
on public.points_transactions
for each row execute function public.enforce_minimum_points_amount_v1();

alter table public.points_transactions
  drop constraint if exists points_transactions_minimum_amount_check;
alter table public.points_transactions
  add constraint points_transactions_minimum_amount_check
  check (
    collection_source not in ('customer_initiated', 'restaurant_controlled')
    or (type = 'earn' and amount_cents is not null and amount_cents >= 100)
  ) not valid;

notify pgrst, 'reload schema';
