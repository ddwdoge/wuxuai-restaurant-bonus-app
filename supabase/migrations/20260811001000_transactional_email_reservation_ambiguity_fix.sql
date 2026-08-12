-- Fix the reservation counter reference without changing the dispatcher contract.
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

  update public.customer_transactional_email_deliveries delivery
  set status = 'SKIPPED', failed_at = now(), processing_started_at = null,
      last_error_code = 'DELIVERY_ATTEMPTS_EXHAUSTED',
      last_error = 'DELIVERY_ATTEMPTS_EXHAUSTED', updated_at = now()
  where delivery.status = 'PROCESSING'
    and delivery.attempt_count >= 5
    and delivery.processing_started_at <= now() - interval '10 minutes';

  return query
  with due as (
    select delivery.id
    from public.customer_transactional_email_deliveries delivery
    where (
        (delivery.status in ('PENDING', 'FAILED') and delivery.available_at <= now())
        or (delivery.status = 'PROCESSING'
          and delivery.processing_started_at <= now() - interval '10 minutes')
      )
      and delivery.attempt_count < 5
    order by delivery.available_at, delivery.created_at
    for update skip locked
    limit least(greatest(input_limit, 1), 100)
  ), reserved as (
    update public.customer_transactional_email_deliveries delivery
    set status = 'PROCESSING', attempt_count = delivery.attempt_count + 1,
        processing_started_at = now(), failed_at = null,
        last_error_code = null, last_error = null, updated_at = now()
    from due
    where delivery.id = due.id
    returning delivery.*
  )
  select reserved.id, reserved.event_type, account_email.email, restaurant.name,
    restaurant.slug, reserved.payload, reserved.attempt_count
  from reserved
  join public.customer_account_emails account_email on account_email.account_id = reserved.account_id
    and account_email.status = 'CONFIRMED'
  join public.customer_accounts account on account.id = reserved.account_id
    and account.disabled_at is null
  join public.restaurants restaurant on restaurant.id = reserved.restaurant_id;
end;
$$;

revoke execute on function public.reserve_customer_transactional_emails(integer)
  from public, anon, authenticated;
grant execute on function public.reserve_customer_transactional_emails(integer) to service_role;

notify pgrst, 'reload schema';
