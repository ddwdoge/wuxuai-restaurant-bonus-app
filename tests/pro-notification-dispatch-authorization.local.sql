-- LOCAL ONLY: synthetic queue authorization fixture. Rolled back in full.
\set ON_ERROR_STOP on
begin;

create temporary table pro_notification_checks(label text primary key);
create function pg_temp.check_case(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
  insert into pro_notification_checks values (label);
end;
$$;

create temporary table pro_notification_entitlements (
  restaurant_id uuid primary key,
  offer_enabled boolean not null,
  reward_enabled boolean not null
);

create or replace function public.restaurant_entitlement_enabled(
  input_restaurant_id uuid,
  input_entitlement text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case input_entitlement
    when 'offer_notifications' then coalesce((
      select offer_enabled from pg_temp.pro_notification_entitlements
      where restaurant_id = input_restaurant_id
    ), false)
    when 'reward_notifications' then coalesce((
      select reward_enabled from pg_temp.pro_notification_entitlements
      where restaurant_id = input_restaurant_id
    ), false)
    else false
  end;
$$;

set local session_replication_role = replica;
select set_config('request.jwt.claim.role', 'service_role', true);

do $test$
declare
  tenant uuid := '75000000-0000-4000-8000-000000000001';
  owner_id uuid := '75000000-0000-4000-8000-000000000002';
  account_id_value uuid := '75000000-0000-4000-8000-000000000003';
  customer_id uuid := '75000000-0000-4000-8000-000000000004';
  organization_id_value uuid := '75000000-0000-4000-8000-000000000005';
  branch_id_value uuid := '75000000-0000-4000-8000-000000000006';
  auth_id_value uuid := '75000000-0000-4000-8000-000000000007';
  delivery_id uuid;
  authorization_record record;
begin
  insert into auth.users(id, aud, role, email, email_confirmed_at)
  values (auth_id_value, 'authenticated', 'authenticated',
    'synthetic-pro-mail@example.invalid', now());
  insert into public.restaurants(id, owner_id, organization_id, name, slug, status)
  values (tenant, owner_id, organization_id_value,
    'Local PRO Mail Fixture', 'local-pro-mail-fixture', 'active');
  insert into public.customers(
    id, restaurant_id, organization_id, branch_id, name, customer_code,
    membership_status, normalized_phone
  ) values (
    customer_id, tenant, organization_id_value, branch_id_value,
    'Synthetic Customer', 'SYNTHETIC-PRO-MAIL', 'active', '+439990000001'
  );
  insert into public.customer_accounts(id, auth_user_id, email_confirmed_at)
  values (account_id_value, auth_id_value, now());
  insert into public.customer_account_memberships(account_id, restaurant_id, customer_id)
  values (account_id_value, tenant, customer_id);
  insert into public.customer_account_emails(account_id, email, status, confirmed_at)
  values (account_id_value, 'synthetic-pro-mail@example.invalid', 'CONFIRMED', now());
  insert into public.customer_offer_email_consents(
    account_id, restaurant_id, customer_id, email, frequency, status,
    consent_version, consented_at, email_confirmed_at
  ) values (
    account_id_value, tenant, customer_id, 'synthetic-pro-mail@example.invalid',
    'WEEKLY', 'ACTIVE', 'LOCAL_TEST_ONLY', now(), now()
  );
  insert into pg_temp.pro_notification_entitlements values (tenant, true, true);

  -- No consent, BASIC, or an unrelated tenant may create a PRO offer row.
  update public.customer_offer_email_consents
  set status = 'PAUSED' where account_id = account_id_value;
  perform pg_temp.check_case(not public.enqueue_customer_transactional_email(
    tenant, customer_id, 'OFFER_PUBLISHED', 'local:offer:no-consent'
  ), 'offer generation requires current channel consent');
  update public.customer_offer_email_consents
  set status = 'ACTIVE' where account_id = account_id_value;
  update pg_temp.pro_notification_entitlements
  set offer_enabled = false where restaurant_id = tenant;
  perform pg_temp.check_case(not public.enqueue_customer_transactional_email(
    tenant, customer_id, 'OFFER_PUBLISHED', 'local:offer:basic'
  ), 'BASIC cannot generate PRO offer mail');
  update pg_temp.pro_notification_entitlements
  set offer_enabled = true where restaurant_id = tenant;
  perform pg_temp.check_case(not public.enqueue_customer_transactional_email(
    '75000000-0000-4000-8000-000000000099', customer_id,
    'OFFER_PUBLISHED', 'local:offer:foreign-tenant'
  ), 'foreign tenant cannot use the customer consent');

  -- Offer email may queue with PRO and consent. Reward email cannot be
  -- queued because it has no separate approved consent contract.
  perform pg_temp.check_case(public.enqueue_customer_transactional_email(
    tenant, customer_id, 'OFFER_PUBLISHED', 'local:offer:downgrade'
  ), 'offer queued while PRO');
  perform pg_temp.check_case(not public.enqueue_customer_transactional_email(
    tenant, customer_id, 'OFFER_PUBLISHED', 'local:offer:downgrade'
  ), 'offer event replay does not create duplicate queue row');
  perform pg_temp.check_case(not public.enqueue_customer_transactional_email(
    tenant, customer_id, 'POINT_REWARD_AVAILABLE', 'local:reward:downgrade'
  ), 'reward email blocked at generation');
  update pg_temp.pro_notification_entitlements
  set offer_enabled = false, reward_enabled = false where restaurant_id = tenant;
  perform * from public.reserve_customer_transactional_emails(20);
  perform pg_temp.check_case((select count(*) = 1
    from public.customer_transactional_email_deliveries
    where event_key = 'local:offer:downgrade'
      and status = 'SKIPPED' and last_error_code = 'PRO_ENTITLEMENT_INACTIVE'),
    'downgrade blocks queued offer');

  -- Offer consent existed at enqueue and was withdrawn before reservation.
  -- Reward has no dedicated consent contract: offer consent must never imply it.
  update pg_temp.pro_notification_entitlements
  set offer_enabled = true, reward_enabled = true where restaurant_id = tenant;
  update public.customer_offer_email_consents
  set status = 'ACTIVE', frequency = 'WEEKLY', withdrawn_at = null,
      email_confirmed_at = now() where account_id = account_id_value;
  perform pg_temp.check_case(public.enqueue_customer_transactional_email(
    tenant, customer_id, 'OFFER_PUBLISHED', 'local:offer:withdrawn'
  ), 'offer queued with active consent');
  perform pg_temp.check_case(not public.enqueue_customer_transactional_email(
    tenant, customer_id, 'POINT_REWARD_AVAILABLE', 'local:reward:withdrawn'
  ), 'offer consent never queues reward mail');
  update public.customer_offer_email_consents
  set status = 'WITHDRAWN', frequency = 'NEVER', withdrawn_at = now()
  where account_id = account_id_value;
  perform * from public.reserve_customer_transactional_emails(20);
  perform pg_temp.check_case((select status = 'SKIPPED'
      and last_error_code = 'OFFER_EMAIL_CONSENT_INACTIVE'
    from public.customer_transactional_email_deliveries
    where event_key = 'local:offer:withdrawn'),
    'withdrawal blocks queued offer at reservation');
  perform pg_temp.check_case(not exists (
    select 1 from public.customer_transactional_email_deliveries
    where event_key = 'local:reward:withdrawn'
  ), 'no new reward email evidence row');

  -- A pause after enqueue permanently invalidates this event. Reactivating
  -- consent later must not revive already queued mail.
  update public.customer_offer_email_consents
  set status = 'ACTIVE', frequency = 'WEEKLY', withdrawn_at = null,
      email_confirmed_at = now(), updated_at = now()
  where account_id = account_id_value;
  perform public.enqueue_customer_transactional_email(
    tenant, customer_id, 'OFFER_PUBLISHED', 'local:offer:pause-reopened'
  );
  update public.customer_offer_email_consents
  set status = 'PAUSED', updated_at = now() + interval '1 second'
  where account_id = account_id_value;
  update public.customer_offer_email_consents
  set status = 'ACTIVE', updated_at = now() + interval '2 seconds'
  where account_id = account_id_value;
  perform * from public.reserve_customer_transactional_emails(20);
  perform pg_temp.check_case((select status = 'SKIPPED'
      and last_error_code = 'OFFER_EMAIL_CONSENT_INACTIVE'
    from public.customer_transactional_email_deliveries
    where event_key = 'local:offer:pause-reopened'),
    'pause and later reactivation cannot revive queued offer');

  -- Consent can also be withdrawn after reservation. The final provider gate
  -- must skip the row without invoking a provider.
  update public.customer_offer_email_consents
  set status = 'ACTIVE', frequency = 'WEEKLY', withdrawn_at = null,
      email_confirmed_at = now(), updated_at = now()
  where account_id = account_id_value;
  perform public.enqueue_customer_transactional_email(
    tenant, customer_id, 'OFFER_PUBLISHED', 'local:offer:pre-provider-withdrawal'
  );
  perform * from public.reserve_customer_transactional_emails(20);
  select id into delivery_id from public.customer_transactional_email_deliveries
  where event_key = 'local:offer:pre-provider-withdrawal';
  perform pg_temp.check_case((select status = 'PROCESSING'
    from public.customer_transactional_email_deliveries where id = delivery_id),
    'valid offer reserved');
  update public.customer_offer_email_consents
  set status = 'WITHDRAWN', frequency = 'NEVER', withdrawn_at = now()
  where account_id = account_id_value;
  select * into authorization_record
  from public.authorize_customer_transactional_email_delivery(delivery_id);
  perform pg_temp.check_case(not authorization_record.authorized
      and authorization_record.reason_code = 'OFFER_EMAIL_CONSENT_INACTIVE',
    'withdrawal blocks immediately before provider');
  perform pg_temp.check_case((select status = 'SKIPPED'
    from public.customer_transactional_email_deliveries where id = delivery_id),
    'pre-provider denial retained as skipped');

  -- Valid offer and pre-existing non-PRO transactional mail remain deliverable.
  update public.customer_offer_email_consents
  set status = 'ACTIVE', frequency = 'WEEKLY', withdrawn_at = null,
      email_confirmed_at = now(), updated_at = now()
  where account_id = account_id_value;
  perform public.enqueue_customer_transactional_email(
    tenant, customer_id, 'OFFER_PUBLISHED', 'local:offer:valid'
  );
  perform public.enqueue_customer_transactional_email(
    tenant, customer_id, 'BIRTHDAY_GIFT_ASSIGNED', 'local:birthday:valid'
  );
  perform * from public.reserve_customer_transactional_emails(20);
  select id into delivery_id from public.customer_transactional_email_deliveries
  where event_key = 'local:offer:valid';
  select * into authorization_record
  from public.authorize_customer_transactional_email_delivery(delivery_id);
  perform pg_temp.check_case(authorization_record.authorized,
    'valid PRO offer remains authorized');
  select id into delivery_id from public.customer_transactional_email_deliveries
  where event_key = 'local:birthday:valid';
  select * into authorization_record
  from public.authorize_customer_transactional_email_delivery(delivery_id);
  perform pg_temp.check_case(authorization_record.authorized,
    'existing birthday mail remains authorized');

  -- A legacy reward row already in PROCESSING remains fail-closed at the
  -- dispatcher boundary even with PRO and active offer consent.
  insert into public.customer_transactional_email_deliveries(
    account_id, restaurant_id, customer_id, event_type, event_key,
    status, attempt_count, processing_started_at
  ) values (
    account_id_value, tenant, customer_id, 'POINT_REWARD_AVAILABLE',
    'local:reward:pre-provider', 'PROCESSING', 1, now()
  ) returning id into delivery_id;
  select * into authorization_record
  from public.authorize_customer_transactional_email_delivery(delivery_id);
  perform pg_temp.check_case(not authorization_record.authorized
      and authorization_record.reason_code = 'REWARD_EMAIL_CONSENT_CONTRACT_MISSING',
    'reward denied immediately before provider');

  perform pg_temp.check_case((select count(*) = 0
    from public.customer_transactional_email_deliveries
    where event_key like 'local:%' and status = 'SENT'),
    'no provider delivery recorded by security test');
  perform pg_temp.check_case((select count(*) = 7
    from public.customer_transactional_email_deliveries
    where event_key like 'local:%'),
    'all queue rows retained');

  perform pg_temp.check_case(
    not has_function_privilege('authenticated',
      'public.enqueue_customer_transactional_email(uuid,uuid,text,text,uuid,uuid,jsonb,timestamptz)', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.customer_transactional_email_dispatch_block_reason(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.authorize_customer_transactional_email_delivery(uuid)', 'EXECUTE'),
    'browser role has no direct PRO queue or dispatcher function execution');

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform * from public.authorize_customer_transactional_email_delivery(delivery_id);
    raise exception 'authenticated dispatcher authorization unexpectedly allowed';
  exception
    when insufficient_privilege then
      perform pg_temp.check_case(true, 'browser role blocked from final authorization');
  end;
  perform set_config('request.jwt.claim.role', 'service_role', true);
end;
$test$;

select count(*) as passed_sql_cases from pro_notification_checks;
rollback;
