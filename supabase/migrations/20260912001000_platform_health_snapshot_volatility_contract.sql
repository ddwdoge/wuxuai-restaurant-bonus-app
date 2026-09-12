-- Phase 5 corrective contract: retain the read-only Health Center result while
-- replacing calls to two VOLATILE aggregate RPCs with one shared SQL snapshot.
-- Existing telemetry and country RPCs are intentionally left unchanged.
begin;

create or replace function public.get_platform_health_center()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  checked_at_value timestamptz := statement_timestamp();
  restaurants_payload jsonb;
  operational_payload jsonb;
  country_payload jsonb;
  findings_value jsonb := '[]'::jsonb;
  targets_value jsonb := '[]'::jsonb;
  restaurant_value jsonb;
  control_value jsonb;
  legal_value jsonb;
  entitlement_value jsonb;
  country_value jsonb;
  system_key text;
  system_value jsonb;
  restaurant_id_value uuid;
  restaurant_name_value text;
  location_id_value uuid;
  country_code_value text;
  effective_plan_value text;
  onboarding_complete_value boolean;
  target_finding_count_before integer;
  target_finding_count_after integer;
  expected_currency_value text;
  latest_audit_value jsonb;
begin
  if auth.uid() is null or coalesce(public.is_platform_admin(), false) is not true then
    raise exception using errcode = '42501', message = 'PLATFORM_ADMIN_REQUIRED';
  end if;

  restaurants_payload := public.get_platform_restaurants();

  with expected_job_names(job_name, ordinality) as (
    values
      ('wuxuai-v1-birthday-gifts-daily', 1),
      ('wuxuai-v1-expire-redemption-codes', 2),
      ('wuxuai-v1-complete-points-presentations', 3),
      ('wuxuai-v1-expiry-reminders-daily', 4),
      ('wuxuai-v1-expire-bonus-boosts', 5),
      ('wuxuai-v1-birthday-gift-reminders', 6),
      ('wuxuai-v1-complete-gift-presentations', 7)
  ),
  cron_rollup as (
    select
      count(distinct job.jobid)::integer as configured_count,
      count(distinct job.jobid) filter (where job.active)::integer as enabled_count,
      max(run.end_time) filter (where run.status = 'succeeded') as last_success_at,
      max(run.end_time) filter (where run.status = 'failed') as last_failure_at,
      count(*) filter (
        where run.status = 'failed'
          and run.start_time >= checked_at_value - interval '24 hours'
      )::integer as failures_24h
    from expected_job_names expected
    left join cron.job job on job.jobname = expected.job_name
    left join cron.job_run_details run on run.jobid = job.jobid
  ),
  cron_state as (
    select
      case
        when configured_count <> 7 or enabled_count <> 7 then 'degraded'
        when last_failure_at is not null
          and (last_success_at is null or last_failure_at > last_success_at) then 'error'
        when failures_24h > 0 then 'degraded'
        when last_success_at is not null then 'healthy'
        else 'no_recent_events'
      end as status,
      case
        when configured_count <> 7 then 'expected_jobs_missing'
        when enabled_count <> 7 then 'expected_jobs_disabled'
        when last_failure_at is not null
          and (last_success_at is null or last_failure_at > last_success_at)
          then 'latest_known_run_failed'
        when failures_24h > 0 then 'recent_failures_present'
        when last_success_at is null then 'no_job_run_history'
        else null
      end as reason
    from cron_rollup
  ),
  email_rollup as (
    select
      count(*) filter (where delivery.status = 'PENDING')::integer as pending_count,
      count(*) filter (where delivery.status = 'PROCESSING')::integer as processing_count,
      count(*) filter (where delivery.status = 'FAILED')::integer as failed_count,
      count(*) filter (
        where delivery.status = 'SENT'
          and delivery.sent_at >= checked_at_value - interval '24 hours'
      )::integer as sent_24h_count,
      count(*) filter (
        where delivery.created_at >= checked_at_value - interval '7 days'
      )::integer as events_7d
    from public.customer_transactional_email_deliveries delivery
  ),
  email_state as (
    select
      case
        when failed_count > 0 then 'error'
        when pending_count > 0 or processing_count > 0 then 'degraded'
        when sent_24h_count > 0 then 'healthy'
        else 'no_recent_events'
      end as status,
      case
        when failed_count > 0 then 'failed_deliveries_present'
        when pending_count > 0 or processing_count > 0 then 'deliveries_waiting'
        when sent_24h_count = 0 and events_7d >= 0 then 'no_recent_delivery_events'
        else null
      end as reason
    from email_rollup
  ),
  registration_rollup as (
    select
      count(*) filter (
        where audit.status = 'success'
          and audit.created_at >= checked_at_value - interval '7 days'
      )::integer as successes_7d,
      count(*) filter (
        where audit.status in ('failed', 'blocked')
          and audit.created_at >= checked_at_value - interval '24 hours'
      )::integer as failures_24h,
      count(*) filter (
        where audit.status in ('failed', 'blocked')
          and audit.created_at >= checked_at_value - interval '7 days'
      )::integer as failures_7d
    from public.audit_log audit
    where audit.created_at >= checked_at_value - interval '7 days'
      and not audit.is_test_event
      and coalesce(nullif(audit.event_type, ''), audit.action) in (
        'CUSTOMER_REGISTERED',
        'CUSTOMER_REGISTRATION_ATTEMPT',
        'OWNER_TRIAL_STARTED',
        'RESTAURANT_ONBOARDING_COMPLETED'
      )
  ),
  registration_state as (
    select
      case
        when failures_24h >= 3 then 'error'
        when failures_24h > 0 or failures_7d > 0 then 'degraded'
        when successes_7d > 0 then 'healthy'
        else 'no_recent_events'
      end as status,
      case
        when failures_24h >= 3 then 'repeated_recent_registration_failures'
        when failures_24h > 0 or failures_7d > 0 then 'registration_failures_present'
        when successes_7d = 0 then 'no_recent_registration_events'
        else null
      end as reason
    from registration_rollup
  ),
  country_rows as (
    select
      policy.country_code,
      policy.currency_code,
      policy.market_status,
      count(readiness.check_key) = 8
        and coalesce(bool_and(
          readiness.status = 'ready'
          and length(trim(coalesce(readiness.evidence_ref, ''))) > 0
          and (readiness.valid_until is null or readiness.valid_until > checked_at_value)
          and (
            readiness.check_key <> 'required_documents'
            or (
              cardinality(readiness.document_version_refs) > 0
              and not exists (
                select 1
                from unnest(readiness.document_version_refs) document_ref
                where length(trim(coalesce(document_ref, ''))) = 0
              )
            )
          )
        ), false) as ready
    from public.country_launch_policy policy
    left join public.country_launch_readiness readiness
      on readiness.country_code = policy.country_code
    group by policy.country_code, policy.currency_code, policy.market_status
  ),
  shared_snapshot as (
    select
      jsonb_build_object(
        'cron', jsonb_build_object('status', cron_state.status, 'reason', cron_state.reason),
        'email', jsonb_build_object('status', email_state.status, 'reason', email_state.reason),
        'registration', jsonb_build_object(
          'status', registration_state.status,
          'reason', registration_state.reason
        )
      ) as operational,
      jsonb_build_object(
        'countries', coalesce((
          select jsonb_agg(jsonb_build_object(
            'country_code', country.country_code,
            'currency_code', country.currency_code,
            'market_status', country.market_status,
            'readiness', jsonb_build_object('ready', country.ready)
          ) order by country.country_code)
          from country_rows country
        ), '[]'::jsonb)
      ) as countries
    from cron_state
    cross join email_state
    cross join registration_state
  )
  select snapshot.operational, snapshot.countries
  into operational_payload, country_payload
  from shared_snapshot snapshot;

  for restaurant_value in
    select value from jsonb_array_elements(coalesce(restaurants_payload->'restaurants', '[]'::jsonb))
  loop
    restaurant_id_value := (restaurant_value->>'id')::uuid;
    restaurant_name_value := coalesce(nullif(restaurant_value->>'name', ''), 'Restaurant');
    location_id_value := nullif(restaurant_value->>'branch_id', '')::uuid;
    onboarding_complete_value := coalesce(restaurant_value->>'onboarding_status', '') in ('completed', 'ready');
    target_finding_count_before := jsonb_array_length(findings_value);

    control_value := public.get_platform_restaurant_control_center(restaurant_id_value);
    legal_value := public.get_platform_restaurant_legal_i18n_status(restaurant_id_value);
    entitlement_value := public.get_restaurant_entitlements(restaurant_id_value);
    country_code_value := nullif(legal_value->>'business_country', '');
    effective_plan_value := nullif(coalesce(entitlement_value->>'effective_plan', entitlement_value->>'plan_key'), '');
    latest_audit_value := case
      when jsonb_typeof(control_value->'audit') = 'array' and jsonb_array_length(control_value->'audit') > 0
        then jsonb_strip_nulls(jsonb_build_object(
          'id', control_value->'audit'->0->'id',
          'timestamp', control_value->'audit'->0->'timestamp',
          'event_key', control_value->'audit'->0->'event_key',
          'status', control_value->'audit'->0->'status'
        ))
      else jsonb_build_object('status', 'unavailable')
    end;

    if not onboarding_complete_value then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':onboarding_incomplete',
        'type', 'ONBOARDING_INCOMPLETE', 'severity', 'P1', 'category', 'ONBOARDING',
        'current', coalesce(restaurant_value->'onboarding_status', 'null'::jsonb),
        'expected', to_jsonb('completed'::text), 'first_seen_at', null,
        'first_seen_status', 'unavailable', 'last_checked_at', checked_at_value,
        'recommendation', 'COMPLETE_ONBOARDING', 'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object(
          'type', 'restaurant', 'restaurant_id', restaurant_id_value,
          'restaurant_name', restaurant_name_value, 'location_id', location_id_value,
          'country', country_code_value, 'plan', effective_plan_value,
          'route', '/admin/platform/restaurants/' || restaurant_id_value
        ))
      ));
    end if;

    if location_id_value is null then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':location_missing',
        'type', 'ACTIVE_LOCATION_MISSING', 'severity', 'P1', 'category', 'LOCATION',
        'current', to_jsonb('missing'::text), 'expected', to_jsonb('active_location'::text),
        'first_seen_at', null, 'first_seen_status', 'unavailable',
        'last_checked_at', checked_at_value, 'recommendation', 'REVIEW_LOCATION_SETUP',
        'audit', latest_audit_value,
        'target', jsonb_build_object('type', 'restaurant', 'restaurant_id', restaurant_id_value,
          'restaurant_name', restaurant_name_value, 'country', country_code_value,
          'plan', effective_plan_value, 'route', '/admin/platform/restaurants/' || restaurant_id_value)
      ));
    end if;

    if coalesce(restaurant_value->>'subscription_exists', 'false')::boolean is not true then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':subscription_missing',
        'type', 'SUBSCRIPTION_MISSING',
        'severity', case when onboarding_complete_value then 'P1' else 'P2' end,
        'category', 'PLAN', 'current', to_jsonb('missing'::text),
        'expected', to_jsonb('present'::text), 'first_seen_at', null,
        'first_seen_status', 'unavailable', 'last_checked_at', checked_at_value,
        'recommendation', 'REVIEW_SUBSCRIPTION', 'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object('type', 'restaurant',
          'restaurant_id', restaurant_id_value, 'restaurant_name', restaurant_name_value,
          'location_id', location_id_value, 'country', country_code_value,
          'plan', effective_plan_value, 'route', '/admin/platform/restaurants/' || restaurant_id_value))
      ));
    end if;

    if control_value#>>'{health,geolocation,address_complete}' = 'false' then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':address_incomplete',
        'type', 'ADDRESS_INCOMPLETE', 'severity', case when onboarding_complete_value then 'P1' else 'P2' end,
        'category', 'LOCATION', 'current', to_jsonb(false), 'expected', to_jsonb(true),
        'first_seen_at', null, 'first_seen_status', 'unavailable',
        'last_checked_at', checked_at_value, 'recommendation', 'REVIEW_LOCATION_SETUP',
        'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object('type', 'restaurant',
          'restaurant_id', restaurant_id_value, 'restaurant_name', restaurant_name_value,
          'location_id', location_id_value, 'country', country_code_value,
          'plan', effective_plan_value, 'route', '/admin/platform/restaurants/' || restaurant_id_value))
      ));
    end if;

    if control_value#>>'{health,geolocation,coordinates_present}' = 'false' then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':coordinates_missing',
        'type', 'COORDINATES_MISSING', 'severity', 'P2', 'category', 'LOCATION',
        'current', to_jsonb(false), 'expected', to_jsonb(true), 'first_seen_at', null,
        'first_seen_status', 'unavailable', 'last_checked_at', checked_at_value,
        'recommendation', 'REVIEW_LOCATION_SETUP', 'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object('type', 'restaurant',
          'restaurant_id', restaurant_id_value, 'restaurant_name', restaurant_name_value,
          'location_id', location_id_value, 'country', country_code_value,
          'plan', effective_plan_value, 'route', '/admin/platform/restaurants/' || restaurant_id_value))
      ));
    end if;

    if legal_value->>'legal_jurisdiction_status' is distinct from 'available' then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':legal_jurisdiction_unavailable',
        'type', 'LEGAL_JURISDICTION_UNAVAILABLE',
        'severity', case when onboarding_complete_value then 'P1' else 'P2' end,
        'category', 'LEGAL', 'current', to_jsonb(coalesce(legal_value->>'legal_jurisdiction_status', 'unavailable')),
        'expected', to_jsonb('available'::text), 'first_seen_at', null,
        'first_seen_status', 'unavailable', 'last_checked_at', checked_at_value,
        'recommendation', 'REVIEW_LEGAL_PROFILE', 'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object('type', 'restaurant',
          'restaurant_id', restaurant_id_value, 'restaurant_name', restaurant_name_value,
          'location_id', location_id_value, 'country', country_code_value,
          'plan', effective_plan_value, 'route', '/admin/platform/restaurants/' || restaurant_id_value))
      ));
    elsif legal_value->>'legal_review_status' in ('required', 'in_review') then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':legal_review_pending',
        'type', 'LEGAL_REVIEW_PENDING', 'severity', 'P3', 'category', 'LEGAL',
        'current', legal_value->'legal_review_status', 'expected', to_jsonb('reviewed'::text),
        'first_seen_at', null, 'first_seen_status', 'unavailable',
        'last_checked_at', checked_at_value, 'recommendation', 'REVIEW_LEGAL_PROFILE',
        'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object('type', 'restaurant',
          'restaurant_id', restaurant_id_value, 'restaurant_name', restaurant_name_value,
          'location_id', location_id_value, 'country', country_code_value,
          'plan', effective_plan_value, 'route', '/admin/platform/restaurants/' || restaurant_id_value))
      ));
    end if;

    if effective_plan_value is null or effective_plan_value not in ('BASIC', 'PRO') then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':plan_unavailable',
        'type', 'PLAN_STATUS_UNAVAILABLE', 'severity', 'P1', 'category', 'PLAN',
        'current', coalesce(entitlement_value->'reason_code', 'null'::jsonb),
        'expected', to_jsonb('BASIC_OR_PRO'::text), 'first_seen_at', null,
        'first_seen_status', 'unavailable', 'last_checked_at', checked_at_value,
        'recommendation', 'REVIEW_SUBSCRIPTION', 'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object('type', 'restaurant',
          'restaurant_id', restaurant_id_value, 'restaurant_name', restaurant_name_value,
          'location_id', location_id_value, 'country', country_code_value,
          'route', '/admin/platform/restaurants/' || restaurant_id_value))
      ));
    end if;

    if entitlement_value->>'override_status' in ('INVALID_WINDOW', 'EXPIRED', 'NOT_STARTED') then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':override_' || lower(entitlement_value->>'override_status'),
        'type', case entitlement_value->>'override_status'
          when 'INVALID_WINDOW' then 'PLAN_OVERRIDE_INVALID'
          when 'EXPIRED' then 'PLAN_OVERRIDE_EXPIRED'
          else 'PLAN_OVERRIDE_FUTURE' end,
        'severity', case entitlement_value->>'override_status'
          when 'INVALID_WINDOW' then 'P1' when 'EXPIRED' then 'P2' else 'P3' end,
        'category', 'PLAN', 'current', entitlement_value->'override_status',
        'expected', to_jsonb('VALID_OR_ABSENT'::text), 'first_seen_at', null,
        'first_seen_status', 'unavailable', 'last_checked_at', checked_at_value,
        'recommendation', 'REVIEW_PLAN_OVERRIDE', 'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object('type', 'restaurant',
          'restaurant_id', restaurant_id_value, 'restaurant_name', restaurant_name_value,
          'location_id', location_id_value, 'country', country_code_value,
          'plan', effective_plan_value, 'route', '/admin/platform/restaurants/' || restaurant_id_value))
      ));
    end if;

    if effective_plan_value = 'BASIC'
      and coalesce(entitlement_value#>>'{effective,offer_limit_unlimited}', 'false')::boolean is false
      and coalesce((entitlement_value->>'active_offer_count')::integer, 0)
        > coalesce((entitlement_value#>>'{effective,offer_limit}')::integer, 5) then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':basic_offer_limit_exceeded',
        'type', 'BASIC_OFFER_LIMIT_EXCEEDED', 'severity', 'P1', 'category', 'BONUS',
        'current', entitlement_value->'active_offer_count',
        'expected', entitlement_value#>'{effective,offer_limit}', 'first_seen_at', null,
        'first_seen_status', 'unavailable', 'last_checked_at', checked_at_value,
        'recommendation', 'REVIEW_ACTIVE_OFFERS', 'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object('type', 'restaurant',
          'restaurant_id', restaurant_id_value, 'restaurant_name', restaurant_name_value,
          'location_id', location_id_value, 'country', country_code_value,
          'plan', effective_plan_value, 'route', '/admin/platform/restaurants/' || restaurant_id_value))
      ));
    end if;

    if onboarding_complete_value
      and control_value#>>'{health,staff,daily_pin_available,status}' = 'available'
      and control_value#>>'{health,staff,daily_pin_available,value}' = 'false' then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':daily_pin_unavailable',
        'type', 'DAILY_PIN_UNAVAILABLE', 'severity', 'P1', 'category', 'BONUS',
        'current', to_jsonb(false), 'expected', to_jsonb(true), 'first_seen_at', null,
        'first_seen_status', 'unavailable', 'last_checked_at', checked_at_value,
        'recommendation', 'REVIEW_POINTS_SETUP', 'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object('type', 'restaurant',
          'restaurant_id', restaurant_id_value, 'restaurant_name', restaurant_name_value,
          'location_id', location_id_value, 'country', country_code_value,
          'plan', effective_plan_value, 'route', '/admin/platform/restaurants/' || restaurant_id_value))
      ));
    end if;

    if onboarding_complete_value
      and control_value#>>'{health,staff,qr_flow_available,status}' = 'available'
      and control_value#>>'{health,staff,qr_flow_available,value}' = 'false' then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'restaurant:' || restaurant_id_value || ':qr_flow_unavailable',
        'type', 'QR_FLOW_UNAVAILABLE', 'severity', 'P1', 'category', 'BONUS',
        'current', to_jsonb(false), 'expected', to_jsonb(true), 'first_seen_at', null,
        'first_seen_status', 'unavailable', 'last_checked_at', checked_at_value,
        'recommendation', 'REVIEW_POINTS_SETUP', 'audit', latest_audit_value,
        'target', jsonb_strip_nulls(jsonb_build_object('type', 'restaurant',
          'restaurant_id', restaurant_id_value, 'restaurant_name', restaurant_name_value,
          'location_id', location_id_value, 'country', country_code_value,
          'plan', effective_plan_value, 'route', '/admin/platform/restaurants/' || restaurant_id_value))
      ));
    end if;

    target_finding_count_after := jsonb_array_length(findings_value);
    targets_value := targets_value || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'restaurant_id', restaurant_id_value,
      'restaurant_name', restaurant_name_value,
      'location_id', location_id_value,
      'country', country_code_value,
      'plan', effective_plan_value,
      'finding_count', target_finding_count_after - target_finding_count_before,
      'status', case when target_finding_count_after = target_finding_count_before then 'HEALTHY' else 'ATTENTION' end,
      'route', '/admin/platform/restaurants/' || restaurant_id_value
    )));
  end loop;

  for system_key, system_value in
    select key, value
    from jsonb_each(operational_payload)
    where key in ('cron', 'email', 'registration')
    order by key
  loop
    if system_value->>'status' is distinct from 'healthy' then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'system:' || system_key,
        'type', 'SYSTEM_' || upper(system_key),
        'severity', case system_value->>'status'
          when 'error' then 'P1' when 'degraded' then 'P2'
          when 'unavailable' then 'P2' else 'P3' end,
        'category', 'SYSTEM',
        'current', jsonb_strip_nulls(jsonb_build_object(
          'status', system_value->>'status', 'reason', system_value->>'reason')),
        'expected', to_jsonb('healthy'::text), 'first_seen_at', null,
        'first_seen_status', 'unavailable', 'last_checked_at', checked_at_value,
        'recommendation', 'REVIEW_SYSTEM_EVIDENCE',
        'audit', jsonb_build_object('status', 'unavailable'),
        'target', jsonb_build_object('type', 'system', 'system_area', system_key,
          'route', '/admin/platform/health?category=SYSTEM')
      ));
    end if;
  end loop;

  for country_value in
    select value from jsonb_array_elements(coalesce(country_payload->'countries', '[]'::jsonb))
  loop
    country_code_value := country_value->>'country_code';
    expected_currency_value := case country_code_value when 'CH' then 'CHF'
      when 'AT' then 'EUR' when 'DE' then 'EUR' when 'FR' then 'EUR'
      when 'IT' then 'EUR' when 'ES' then 'EUR' else null end;

    if expected_currency_value is not null
      and country_value->>'currency_code' is distinct from expected_currency_value then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'country:' || country_code_value || ':currency',
        'type', 'COUNTRY_CURRENCY_INCONSISTENT', 'severity', 'P1', 'category', 'COUNTRY',
        'current', country_value->'currency_code', 'expected', to_jsonb(expected_currency_value),
        'first_seen_at', null, 'first_seen_status', 'unavailable',
        'last_checked_at', checked_at_value, 'recommendation', 'REVIEW_COUNTRY_CONFIGURATION',
        'audit', jsonb_build_object('status', 'available_in_country_control'),
        'target', jsonb_build_object('type', 'country', 'country', country_code_value,
          'route', '/admin/platform?country=' || country_code_value)
      ));
    end if;

    if coalesce((country_value#>>'{readiness,ready}')::boolean, false) is not true then
      findings_value := findings_value || jsonb_build_array(jsonb_build_object(
        'id', 'country:' || country_code_value || ':readiness',
        'type', case when country_value->>'market_status' = 'live'
          then 'COUNTRY_LIVE_WITHOUT_READINESS' else 'COUNTRY_READINESS_OPEN' end,
        'severity', case when country_value->>'market_status' = 'live' then 'P0' else 'P3' end,
        'category', 'COUNTRY',
        'current', jsonb_build_object('market_status', country_value->>'market_status',
          'ready', false), 'expected', jsonb_build_object('ready', true),
        'first_seen_at', null, 'first_seen_status', 'unavailable',
        'last_checked_at', checked_at_value, 'recommendation', 'REVIEW_COUNTRY_READINESS',
        'audit', jsonb_build_object('status', 'available_in_country_control'),
        'target', jsonb_build_object('type', 'country', 'country', country_code_value,
          'route', '/admin/platform?country=' || country_code_value)
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'contract_version', 'platform_health_center_v1',
    'generated_at', checked_at_value,
    'freshness', jsonb_build_object(
      'status', 'current', 'generated_at', checked_at_value,
      'claim', 'snapshot_at_request_time', 'automatic_refresh', false
    ),
    'summary', jsonb_build_object(
      'critical', (select count(*) from jsonb_array_elements(findings_value) item where item->>'severity' = 'P0'),
      'errors', (select count(*) from jsonb_array_elements(findings_value) item where item->>'severity' = 'P1'),
      'warnings', (select count(*) from jsonb_array_elements(findings_value) item where item->>'severity' = 'P2'),
      'notices', (select count(*) from jsonb_array_elements(findings_value) item where item->>'severity' = 'P3'),
      'healthy', (select count(*) from jsonb_array_elements(targets_value) item where item->>'status' = 'HEALTHY'),
      'findings_total', jsonb_array_length(findings_value),
      'restaurants_checked', jsonb_array_length(targets_value)
    ),
    'findings', findings_value,
    'restaurant_targets', targets_value
  );
end;
$function$;

revoke execute on function public.get_platform_health_center()
from public, anon, authenticated;
grant execute on function public.get_platform_health_center()
to authenticated;

comment on function public.get_platform_health_center() is
  'Read-only, data-minimal and transaction-consistent Platform Admin findings snapshot. Performs no repair or tenant mutation.';

notify pgrst, 'reload schema';
commit;
