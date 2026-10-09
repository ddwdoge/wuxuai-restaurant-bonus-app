-- A queued offer event is not authority to send after its exact publication
-- has been withdrawn, expired or superseded. Historical queue rows remain.
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

    -- The canonical Owner publisher keys an event by the exact offer,
    -- publication revision and Customer. No payload field or title is trusted.
    if not exists (
      select 1
      from public.restaurant_offers offer
      join public.restaurants restaurant
        on restaurant.id = offer.restaurant_id
       and restaurant.status = 'active'
      join public.branches branch
        on branch.id = offer.branch_id
       and branch.restaurant_id = offer.restaurant_id
       and branch.status = 'active'
      where offer.restaurant_id = delivery_record.restaurant_id
        and offer.status = 'PUBLISHED'
        and offer.is_active is true
        and offer.valid_from <= statement_timestamp()
        and offer.valid_to > statement_timestamp()
        and offer.id::text || ':' || offer.publication_version::text || ':'
          || delivery_record.customer_id::text = delivery_record.event_key
    ) then
      return 'OFFER_SOURCE_INACTIVE';
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
