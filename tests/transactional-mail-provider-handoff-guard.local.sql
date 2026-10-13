-- LOCAL ONLY: provider handoff, missing-consent and no-retry proof.
-- Run after 20261013130000 inside a disposable transaction.
\set ON_ERROR_STOP on

create temporary table transactional_mail_handoff_checks(label text primary key);
create function pg_temp.check_case(ok boolean, label text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %', label; end if;
  insert into transactional_mail_handoff_checks values (label);
end;
$$;

create temporary table transactional_mail_entitlements(
  restaurant_id uuid primary key,
  offer_enabled boolean not null
);
create or replace function public.restaurant_entitlement_enabled(
  input_restaurant_id uuid,
  input_entitlement text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select input_entitlement = 'offer_notifications'
    and coalesce((select offer_enabled
      from pg_temp.transactional_mail_entitlements
      where restaurant_id = input_restaurant_id), false)
$$;

set local session_replication_role = replica;
select set_config('request.jwt.claim.role', 'service_role', true);

do $test$
declare
  owner_id uuid := '7b000000-0000-4000-8000-000000000001';
  organization_id_value uuid := '7b000000-0000-4000-8000-000000000002';
  restaurant_id_value uuid := '7b000000-0000-4000-8000-000000000003';
  branch_id_value uuid := '7b000000-0000-4000-8000-000000000004';
  customer_id_value uuid := '7b000000-0000-4000-8000-000000000005';
  account_id_value uuid := '7b000000-0000-4000-8000-000000000006';
  offer_id_value uuid := '7b000000-0000-4000-8000-000000000007';
  unknown_delivery uuid := '7b000000-0000-4000-8000-000000000008';
  accepted_delivery uuid := '7b000000-0000-4000-8000-000000000009';
  blocked_delivery uuid := '7b000000-0000-4000-8000-000000000010';
  consent_id_value uuid := '7b000000-0000-4000-8000-000000000011';
  consent_document_v1 uuid := '7b000000-0000-4000-8000-000000000012';
  consent_document_v2 uuid := '7b000000-0000-4000-8000-000000000013';
  decision_request_id uuid := '7b000000-0000-4000-8000-000000000014';
  version_offer_id uuid := '7b000000-0000-4000-8000-000000000015';
  publication_request_v1 uuid := '7b000000-0000-4000-8000-000000000016';
  publication_request_v2 uuid := '7b000000-0000-4000-8000-000000000017';
  version_delivery uuid;
  consent_body_v1 text := 'Synthetic local-only offer email consent version one.';
  consent_body_v2 text := 'Synthetic local-only offer email consent version two.';
  result_record record;
begin
  insert into auth.users(id, aud, role, email, email_confirmed_at)
  values (owner_id, 'authenticated', 'authenticated',
    'synthetic-mail-handoff@example.invalid', now());
  insert into public.organizations(id, owner_id, name, status)
  values (organization_id_value, owner_id, 'SYNTHETIC MAIL HANDOFF', 'active');
  insert into public.restaurants(id, owner_id, organization_id, name, slug, status)
  values (restaurant_id_value, owner_id, organization_id_value,
    'SYNTHETIC MAIL HANDOFF', 'synthetic-mail-handoff', 'active');
  insert into public.branches(id, organization_id, restaurant_id, name, slug, country, status)
  values (branch_id_value, organization_id_value, restaurant_id_value,
    'SYNTHETIC MAIL HANDOFF', 'synthetic-mail-handoff', 'AT', 'active');
  insert into public.customers(
    id, restaurant_id, organization_id, branch_id, name, customer_code,
    membership_status, normalized_phone
  ) values (
    customer_id_value, restaurant_id_value, organization_id_value, branch_id_value,
    'Synthetic Customer', 'SYNTH-MAIL-HANDOFF', 'active', '+439990000077'
  );
  insert into public.customer_accounts(id, auth_user_id, email_confirmed_at)
  values (account_id_value, owner_id, now());
  insert into public.customer_account_memberships(account_id, restaurant_id, customer_id)
  values (account_id_value, restaurant_id_value, customer_id_value);
  insert into public.customer_account_emails(account_id, email, status, confirmed_at)
  values (account_id_value, 'synthetic-mail-handoff@example.invalid',
    'CONFIRMED', now());
  insert into pg_temp.transactional_mail_entitlements
  values (restaurant_id_value, true);
  insert into public.restaurant_offers(
    id, restaurant_id, branch_id, offer_type, title, short_description,
    valid_from, valid_to, status, is_active, publication_version
  ) values (
    offer_id_value, restaurant_id_value, branch_id_value, 'NEWS',
    'SYNTHETIC MAIL HANDOFF', 'Synthetic local-only offer',
    now() - interval '1 hour', now() + interval '1 day', 'PUBLISHED', true, 1
  );
  insert into public.restaurant_offers(
    id, restaurant_id, branch_id, offer_type, title, short_description,
    valid_from, valid_to, status, is_active, publication_version
  ) values (
    version_offer_id, restaurant_id_value, branch_id_value, 'NEWS',
    'SYNTHETIC VERSION SWITCH', 'Synthetic local-only version test',
    now() - interval '1 hour', now() + interval '1 day', 'PUBLISHED', true, 1
  );

  insert into public.customer_transactional_email_deliveries(
    id, account_id, restaurant_id, customer_id, event_type, event_key,
    status, attempt_count, processing_started_at
  ) values
    (unknown_delivery, account_id_value, restaurant_id_value, customer_id_value,
      'BIRTHDAY_GIFT_ASSIGNED', 'local:handoff:unknown', 'PROCESSING', 1, now()),
    (accepted_delivery, account_id_value, restaurant_id_value, customer_id_value,
      'BIRTHDAY_GIFT_ASSIGNED', 'local:handoff:accepted', 'PROCESSING', 1, now()),
    (blocked_delivery, account_id_value, restaurant_id_value, customer_id_value,
      'OFFER_PUBLISHED', offer_id_value::text || ':1:' || customer_id_value::text,
      'PROCESSING', 1, now());

  select * into result_record
  from public.begin_customer_transactional_email_delivery(unknown_delivery);
  perform pg_temp.check_case(result_record.authorized,
    'valid delivery enters provider handoff');
  perform pg_temp.check_case((select status = 'SUBMITTING'
    from public.customer_transactional_email_deliveries where id = unknown_delivery),
    'provider handoff is terminal before SMTP');
  perform pg_temp.check_case(public.complete_customer_transactional_email_delivery_v2(
    unknown_delivery, 'UNKNOWN', '<synthetic-unknown@example.invalid>',
    'SYNTHETIC_PROVIDER_TIMEOUT'), 'unknown provider outcome recorded');
  perform pg_temp.check_case((select status = 'UNKNOWN'
      and provider_started_at is not null and provider_accepted_at is null
    from public.customer_transactional_email_deliveries where id = unknown_delivery),
    'unknown outcome is retained without acceptance claim');
  perform pg_temp.check_case(public.complete_customer_transactional_email_delivery_v2(
    unknown_delivery, 'UNKNOWN', '<synthetic-unknown@example.invalid>',
    'SYNTHETIC_PROVIDER_TIMEOUT'), 'exact completion replay is idempotent');
  perform pg_temp.check_case(not public.complete_customer_transactional_email_delivery_v2(
    unknown_delivery, 'ACCEPTED', '<synthetic-unknown@example.invalid>', null),
    'unknown outcome cannot be upgraded by replay');
  perform pg_temp.check_case(not exists (
    select 1 from public.reserve_customer_transactional_emails(50)
    where delivery_id = unknown_delivery
  ), 'unknown provider outcome is never re-reserved');

  select * into result_record
  from public.begin_customer_transactional_email_delivery(accepted_delivery);
  perform pg_temp.check_case(result_record.authorized,
    'accepted delivery enters provider handoff');
  perform pg_temp.check_case(public.complete_customer_transactional_email_delivery_v2(
    accepted_delivery, 'ACCEPTED', '<synthetic-accepted@example.invalid>', null),
    'accepted provider outcome recorded once');
  perform pg_temp.check_case((select status = 'SENT'
      and provider_started_at is not null and provider_accepted_at is not null
    from public.customer_transactional_email_deliveries where id = accepted_delivery),
    'accepted provider evidence is complete');

  select * into result_record
  from public.begin_customer_transactional_email_delivery(blocked_delivery);
  perform pg_temp.check_case(not result_record.authorized
      and result_record.reason_code = 'OFFER_EMAIL_CONSENT_INACTIVE',
    'offer without consent is blocked before SMTP');
  perform pg_temp.check_case((select status = 'SKIPPED'
    from public.customer_transactional_email_deliveries where id = blocked_delivery),
    'blocked offer is terminal without provider handoff');

  insert into public.platform_legal_document_versions(
    id, document_type, version, source_zip_sha256, source_entry,
    source_origin, body_markdown, content_sha256, review_status,
    published_at, approval_reference, approved_by
  ) values (
    consent_document_v1, 'offer_email_consent', 'local-mail-v1', repeat('0', 64),
    'synthetic/local-mail-v1.md', 'COUNSEL_APPROVED', consent_body_v1,
    encode(digest(convert_to(consent_body_v1, 'UTF8'), 'sha256'), 'hex'),
    'REVIEWED', now() - interval '1 hour', 'LOCAL_MAIL_V1', owner_id
  );
  insert into public.offer_email_consent_publication_events(
    document_version_id, action, request_id, actor_id, approval_reference
  ) values (
    consent_document_v1, 'PUBLISH', publication_request_v1, owner_id,
    'LOCAL_MAIL_V1'
  );
  insert into public.customer_offer_email_consents(
    id, account_id, restaurant_id, customer_id, email, frequency, status,
    consent_version, consented_at, email_confirmed_at,
    consent_document_version_id, consent_content_sha256
  ) values (
    consent_id_value, account_id_value, restaurant_id_value, customer_id_value,
    'synthetic-mail-handoff@example.invalid', 'WEEKLY', 'ACTIVE',
    'local-mail-v1', now(), now(), consent_document_v1,
    encode(digest(convert_to(consent_body_v1, 'UTF8'), 'sha256'), 'hex')
  );
  insert into public.customer_offer_email_decision_receipts(
    consent_id, document_version_id, document_version, document_sha256,
    account_id, customer_id, restaurant_id, auth_user_id, action, request_id
  ) values (
    consent_id_value, consent_document_v1, 'local-mail-v1',
    encode(digest(convert_to(consent_body_v1, 'UTF8'), 'sha256'), 'hex'),
    account_id_value, customer_id_value, restaurant_id_value, owner_id,
    'CONFIRM', decision_request_id
  );
  perform pg_temp.check_case(public.enqueue_customer_transactional_email(
    restaurant_id_value, customer_id_value, 'OFFER_PUBLISHED',
    version_offer_id::text || ':1:' || customer_id_value::text
  ), 'current exact consent version can enqueue once');
  select id into version_delivery
  from public.customer_transactional_email_deliveries
  where event_key = version_offer_id::text || ':1:' || customer_id_value::text;

  insert into public.platform_legal_document_versions(
    id, document_type, version, source_zip_sha256, source_entry,
    source_origin, body_markdown, content_sha256, review_status,
    published_at, approval_reference, approved_by
  ) values (
    consent_document_v2, 'offer_email_consent', 'local-mail-v2', repeat('1', 64),
    'synthetic/local-mail-v2.md', 'COUNSEL_APPROVED', consent_body_v2,
    encode(digest(convert_to(consent_body_v2, 'UTF8'), 'sha256'), 'hex'),
    'REVIEWED', now(), 'LOCAL_MAIL_V2', owner_id
  );
  insert into public.offer_email_consent_publication_events(
    document_version_id, action, request_id, actor_id, approval_reference
  ) values (
    consent_document_v2, 'PUBLISH', publication_request_v2, owner_id,
    'LOCAL_MAIL_V2'
  );
  perform * from public.reserve_customer_transactional_emails(50);
  perform pg_temp.check_case((select status = 'SKIPPED'
      and last_error_code = 'OFFER_EMAIL_CONSENT_INACTIVE'
    from public.customer_transactional_email_deliveries where id = version_delivery),
    'published consent version switch invalidates queued old consent');

  perform pg_temp.check_case(
    not has_function_privilege('authenticated',
      'public.begin_customer_transactional_email_delivery(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated',
      'public.complete_customer_transactional_email_delivery_v2(uuid,text,text,text)',
      'EXECUTE'), 'browser roles cannot cross provider handoff');
end;
$test$;

select count(*) as passed_sql_cases from transactional_mail_handoff_checks;
