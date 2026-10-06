-- Narrow PRO notification gates. No channel or legal basis is activated here.
-- Existing queue/inbox evidence is retained on downgrade or withdrawal.

create or replace function public.pro_in_app_test_scope_allowed_internal(
  input_restaurant_id uuid,
  input_customer_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select exists (
    select 1
    from public.restaurants restaurant
    join public.customers customer
      on customer.restaurant_id = restaurant.id
     and customer.id = input_customer_id
     and customer.is_test_customer is true
     and customer.membership_status = 'active'
    join public.customer_account_memberships membership
      on membership.restaurant_id = restaurant.id
     and membership.customer_id = customer.id
    join public.customer_accounts account
      on account.id = membership.account_id
     and account.auth_user_id is not null
     and account.email_confirmed_at is not null
     and account.disabled_at is null
     and (customer.auth_user_id is null or customer.auth_user_id = account.auth_user_id)
    join public.platform_test_tenant_registry marker
      on marker.restaurant_id = restaurant.id
     and marker.organization_id = restaurant.organization_id
     and marker.restaurant_name = restaurant.name
     and marker.owner_user_id = restaurant.owner_id
     and marker.deleted_at is null
    where restaurant.id = input_restaurant_id
      and exists (
        select 1 from public.business_verification_environment environment
        where environment.singleton and environment.environment = 'STAGING'
      )
  );
$function$;

revoke execute on function public.pro_in_app_test_scope_allowed_internal(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.enqueue_customer_transactional_email(
  input_restaurant_id uuid, input_customer_id uuid, input_event_type text,
  input_event_key text, input_reward_id uuid default null,
  input_customer_reward_id uuid default null, input_payload jsonb default '{}'::jsonb,
  input_available_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  account_id_value uuid;
begin
  if input_event_type not in (
    'BIRTHDAY_GIFT_ASSIGNED', 'BIRTHDAY_GIFT_EXPIRY_REMINDER',
    'POINT_REWARD_AVAILABLE', 'OFFER_PUBLISHED'
  ) then
    return false;
  end if;

  -- A confirmed offer address never grants reward-email permission.
  if input_event_type = 'POINT_REWARD_AVAILABLE' then
    return false;
  end if;

  select membership.account_id into account_id_value
  from public.customer_account_memberships membership
  join public.customer_account_emails email
    on email.account_id = membership.account_id and email.status = 'CONFIRMED'
  join public.customer_accounts account
    on account.id = membership.account_id and account.disabled_at is null
  join public.customers customer
    on customer.id = membership.customer_id
   and customer.restaurant_id = membership.restaurant_id
  where membership.restaurant_id = input_restaurant_id
    and membership.customer_id = input_customer_id
    and (
      input_event_type <> 'OFFER_PUBLISHED'
      or (
        customer.membership_status = 'active'
        and account.auth_user_id is not null
        and account.email_confirmed_at is not null
        and (customer.auth_user_id is null or customer.auth_user_id = account.auth_user_id)
        and public.restaurant_entitlement_enabled(input_restaurant_id, 'offer_notifications')
        and exists (
          select 1 from public.customer_offer_email_consents consent
          where consent.account_id = membership.account_id
            and consent.restaurant_id = membership.restaurant_id
            and consent.customer_id = membership.customer_id
            and consent.status = 'ACTIVE'
            and consent.frequency in ('WEEKLY', 'MONTHLY')
            and consent.email_confirmed_at is not null
            and consent.withdrawn_at is null
            and nullif(trim(consent.consent_version), '') is not null
            and lower(trim(consent.email)) = lower(trim(email.email))
        )
      )
    )
  limit 1;

  if account_id_value is null then
    return false;
  end if;

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
  return false;
end;
$function$;

revoke execute on function public.enqueue_customer_transactional_email(
  uuid, uuid, text, text, uuid, uuid, jsonb, timestamptz
) from public, anon, authenticated, service_role;

create or replace function public.customer_transactional_email_dispatch_block_reason(
  input_delivery_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
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
      delivery_record.restaurant_id, 'offer_notifications'
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
       and account.auth_user_id is not null
       and account.email_confirmed_at is not null
       and account.disabled_at is null
      where consent.account_id = delivery_record.account_id
        and consent.restaurant_id = delivery_record.restaurant_id
        and consent.customer_id = delivery_record.customer_id
        and consent.status = 'ACTIVE'
        and consent.frequency in ('WEEKLY', 'MONTHLY')
        and consent.email_confirmed_at is not null
        and consent.withdrawn_at is null
        and nullif(trim(consent.consent_version), '') is not null
        and consent.updated_at <= delivery_record.created_at
        and lower(trim(consent.email)) = lower(trim(account_email.email))
        and customer.membership_status = 'active'
        and (customer.auth_user_id is null or customer.auth_user_id = account.auth_user_id)
    ) then
      return 'OFFER_EMAIL_CONSENT_INACTIVE';
    end if;

    return null;
  end if;

  if delivery_record.event_type = 'POINT_REWARD_AVAILABLE' then
    if not public.restaurant_entitlement_enabled(
      delivery_record.restaurant_id, 'reward_notifications'
    ) then
      return 'PRO_ENTITLEMENT_INACTIVE';
    end if;
    return 'REWARD_EMAIL_CONSENT_CONTRACT_MISSING';
  end if;

  return null;
end;
$function$;

revoke execute on function public.customer_transactional_email_dispatch_block_reason(uuid)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
