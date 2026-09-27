-- Re-authorize PRO customer notifications at reservation time and immediately
-- before provider dispatch. Queue rows are retained for evidence and move to
-- terminal SKIPPED state when an entitlement or consent gate closes.

create or replace function public.customer_transactional_email_dispatch_block_reason(
  input_delivery_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  delivery_record public.customer_transactional_email_deliveries%rowtype;
begin
  select * into delivery_record
  from public.customer_transactional_email_deliveries
  where id = input_delivery_id;

  if delivery_record.id is null then
    return 'DELIVERY_NOT_FOUND';
  end if;

  if delivery_record.event_type = 'OFFER_PUBLISHED' then
    if not public.restaurant_entitlement_enabled(
      delivery_record.restaurant_id,
      'offer_notifications'
    ) then
      return 'PRO_ENTITLEMENT_INACTIVE';
    end if;

    if not exists (
      select 1
      from public.customer_offer_email_consents consent
      join public.customer_account_memberships membership
        on membership.account_id = consent.account_id
       and membership.restaurant_id = consent.restaurant_id
       and membership.customer_id = consent.customer_id
      join public.customers customer
        on customer.id = consent.customer_id
       and customer.restaurant_id = consent.restaurant_id
      join public.customer_account_emails account_email
        on account_email.account_id = consent.account_id
       and account_email.status = 'CONFIRMED'
      join public.customer_accounts account
        on account.id = consent.account_id
       and account.disabled_at is null
      where consent.account_id = delivery_record.account_id
        and consent.restaurant_id = delivery_record.restaurant_id
        and consent.customer_id = delivery_record.customer_id
        and consent.status = 'ACTIVE'
        and consent.frequency in ('WEEKLY', 'MONTHLY')
        and consent.email_confirmed_at is not null
        and consent.withdrawn_at is null
        -- Any consent-state update after enqueue invalidates this event. This
        -- prevents a later unpause or re-consent from reviving stale mail.
        and consent.updated_at <= delivery_record.created_at
        and lower(trim(consent.email)) = lower(trim(account_email.email))
        and customer.membership_status = 'active'
    ) then
      return 'OFFER_EMAIL_CONSENT_INACTIVE';
    end if;

    return null;
  end if;

  if delivery_record.event_type = 'POINT_REWARD_AVAILABLE' then
    if not public.restaurant_entitlement_enabled(
      delivery_record.restaurant_id,
      'reward_notifications'
    ) then
      return 'PRO_ENTITLEMENT_INACTIVE';
    end if;

    -- A confirmed account e-mail or offer consent is not reward consent.
    -- Reward e-mail remains fail-closed until a dedicated contract exists.
    return 'REWARD_EMAIL_CONSENT_CONTRACT_MISSING';
  end if;

  return null;
end;
$$;

revoke execute on function public.customer_transactional_email_dispatch_block_reason(uuid)
  from public, anon, authenticated, service_role;

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
      last_error_code = public.customer_transactional_email_dispatch_block_reason(delivery.id),
      last_error = public.customer_transactional_email_dispatch_block_reason(delivery.id),
      updated_at = now()
  where (
      (delivery.status in ('PENDING', 'FAILED') and delivery.available_at <= now())
      or (delivery.status = 'PROCESSING'
        and delivery.processing_started_at <= now() - interval '10 minutes')
    )
    and delivery.event_type in ('OFFER_PUBLISHED', 'POINT_REWARD_AVAILABLE')
    and public.customer_transactional_email_dispatch_block_reason(delivery.id) is not null;

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
      and public.customer_transactional_email_dispatch_block_reason(delivery.id) is null
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
  join public.customer_account_emails account_email
    on account_email.account_id = reserved.account_id
   and account_email.status = 'CONFIRMED'
  join public.customer_accounts account
    on account.id = reserved.account_id
   and account.disabled_at is null
  join public.restaurants restaurant on restaurant.id = reserved.restaurant_id;
end;
$$;

revoke execute on function public.reserve_customer_transactional_emails(integer)
  from public, anon, authenticated;
grant execute on function public.reserve_customer_transactional_emails(integer) to service_role;

create or replace function public.authorize_customer_transactional_email_delivery(
  input_delivery_id uuid
)
returns table (authorized boolean, reason_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  delivery_record public.customer_transactional_email_deliveries%rowtype;
  block_reason text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'CUSTOMER_EMAIL_DISPATCH_ACCESS_DENIED';
  end if;

  select * into delivery_record
  from public.customer_transactional_email_deliveries
  where id = input_delivery_id
  for update;

  if delivery_record.id is null then
    return query select false, 'DELIVERY_NOT_FOUND'::text;
    return;
  end if;

  if delivery_record.status <> 'PROCESSING' then
    return query select false, 'DELIVERY_NOT_PROCESSING'::text;
    return;
  end if;

  block_reason := public.customer_transactional_email_dispatch_block_reason(delivery_record.id);
  if block_reason is not null then
    update public.customer_transactional_email_deliveries
    set status = 'SKIPPED', failed_at = now(), processing_started_at = null,
        last_error_code = block_reason, last_error = block_reason, updated_at = now()
    where id = delivery_record.id and status = 'PROCESSING';
    return query select false, block_reason;
    return;
  end if;

  return query select true, null::text;
end;
$$;

revoke execute on function public.authorize_customer_transactional_email_delivery(uuid)
  from public, anon, authenticated;
grant execute on function public.authorize_customer_transactional_email_delivery(uuid)
  to service_role;

comment on function public.authorize_customer_transactional_email_delivery(uuid) is
  'Service-only final authorization immediately before provider dispatch. Denied rows are retained as SKIPPED with a non-PII reason code.';

notify pgrst, 'reload schema';
