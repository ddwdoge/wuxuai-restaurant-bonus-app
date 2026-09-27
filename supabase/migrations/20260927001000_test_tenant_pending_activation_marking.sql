-- Phase 7D: allow only the canonical neutral pending-activation registration
-- subscription to be marked TEST_ONLY. Cleanup remains fail-closed and no
-- restaurant, subscription, trial, entitlement, grant or billing state is changed.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260927001000',0));

create or replace function public.get_platform_test_tenant_cleanup_preflight(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
stable
as $function$
declare
  restaurant_record public.restaurants%rowtype;
  legacy_value jsonb;
  effective_value jsonb;
  blockers_value jsonb := '[]'::jsonb;
  marking_blockers_value jsonb;
  warnings_value jsonb := '[]'::jsonb;
  location_count bigint;
  foreign_customer_memberships bigint;
  non_test_customers bigint;
  active_redemptions bigint;
  stripe_states bigint;
  pending_subscription_rows bigint := 0;
  unsafe_subscription_rows bigint := 0;
  entitlement_override_rows bigint := 0;
  capacity_entitlement_rows bigint := 0;
  pro_grant_rows bigint := 0;
  trial_claim_rows bigint := 0;
  billing_event_rows bigint := 0;
  pending_marking_exception boolean := false;
  billing_verified boolean := false;
  storage_review bigint;
begin
  if auth.uid() is null
    or coalesce(public.current_platform_role() in ('platform_owner', 'platform_admin'), false) is not true then
    raise exception 'PLATFORM_TEST_TENANT_ACCESS_DENIED' using errcode = '42501';
  end if;
  if input_restaurant_id is null then
    raise exception 'TEST_TENANT_CONTEXT_REQUIRED' using errcode = '22023';
  end if;

  -- Reuse every legacy isolation check and the exact flat numeric inventory.
  -- The applied v2 wrapper removes only the legal-evidence exception below.
  legacy_value := public.get_platform_test_tenant_cleanup_preflight_v1(input_restaurant_id);
  if coalesce((legacy_value->>'deleted')::boolean, false) then
    return legacy_value;
  end if;
  if jsonb_typeof(legacy_value->'blockers') is distinct from 'array'
    or jsonb_typeof(legacy_value->'inventory') is distinct from 'object'
    or jsonb_typeof(legacy_value->'eligible') is distinct from 'boolean'
    or jsonb_typeof(legacy_value->'restaurant_name') is distinct from 'string' then
    raise exception 'TEST_TENANT_LEGACY_CONTRACT_INVALID' using errcode = '42501';
  end if;
  blockers_value := (legacy_value->'blockers') - 'IMMUTABLE_LEGAL_EVIDENCE_PRESENT';

  select * into restaurant_record from public.restaurants where id = input_restaurant_id;
  if restaurant_record.id is null then
    raise exception 'TEST_TENANT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select count(*) into location_count from public.branches
    where restaurant_id = restaurant_record.id and organization_id = restaurant_record.organization_id;
  select count(*) into foreign_customer_memberships
  from public.customer_account_memberships own_membership
  join public.customer_account_memberships other_membership
    on other_membership.account_id = own_membership.account_id
  where own_membership.restaurant_id = restaurant_record.id
    and other_membership.restaurant_id <> restaurant_record.id;
  select count(*) into non_test_customers from public.customers
    where restaurant_id = restaurant_record.id and is_test_customer is not true;
  select count(*) into active_redemptions from public.redemption_activity_journal
    where restaurant_id = restaurant_record.id
      and upper(coalesce(status, '')) in ('ACTIVE','PENDING','RESERVED','PRESENTED','OPEN');
  active_redemptions := active_redemptions
    + (select count(*) from public.points_redemption_presentations
       where restaurant_id=restaurant_record.id and status='REDEMPTION_STARTED')
    + (select count(*) from public.gift_redemption_presentations
       where restaurant_id=restaurant_record.id and status='REDEMPTION_STARTED')
    + (select count(*) from public.kassa_redemption_workflows
       where restaurant_id=restaurant_record.id and status='OPEN');
  select count(*) into storage_review from storage.objects object
    where object.name like restaurant_record.id::text || '/%'
       or object.name like restaurant_record.slug || '/%';
  -- Cleanup remains blocked by every subscription row. Marking has one narrow
  -- exception below for the canonical registration-created BASIC pending row.
  -- Bind by organization OR location: an inconsistent association cannot hide it.
  begin
    select
      count(*),
      count(*) filter (where
        subscription.organization_id=restaurant_record.organization_id
        and subscription.branch_id=restaurant_record.primary_branch_id
        and subscription.status='pending_activation'
        and subscription.subscription_status='pending_activation'
        and subscription.plan_key='BASIC'
        and subscription.selected_plan='BASIC'
        and subscription.payment_status='not_required'
        and subscription.trial_started_at is null
        and subscription.trial_ends_at is null
        and subscription.current_period_start is null
        and subscription.current_period_end is null
        and subscription.current_period_ends_at is null
        and subscription.stripe_customer_id is null
        and subscription.stripe_subscription_id is null),
      count(*) filter (where not (
        subscription.organization_id=restaurant_record.organization_id
        and subscription.branch_id=restaurant_record.primary_branch_id
        and subscription.status='pending_activation'
        and subscription.subscription_status='pending_activation'
        and subscription.plan_key='BASIC'
        and subscription.selected_plan='BASIC'
        and subscription.payment_status='not_required'
        and subscription.trial_started_at is null
        and subscription.trial_ends_at is null
        and subscription.current_period_start is null
        and subscription.current_period_end is null
        and subscription.current_period_ends_at is null
        and subscription.stripe_customer_id is null
        and subscription.stripe_subscription_id is null))
    into stripe_states, pending_subscription_rows, unsafe_subscription_rows
    from public.branch_subscriptions subscription
    where subscription.organization_id=restaurant_record.organization_id
      or subscription.branch_id in (select id from public.branches
        where restaurant_id=restaurant_record.id);

    select count(*) into entitlement_override_rows
    from public.branch_entitlement_overrides entitlement_override
    join public.branch_subscriptions subscription
      on subscription.id=entitlement_override.subscription_id
    where subscription.organization_id=restaurant_record.organization_id
      or subscription.branch_id in (select id from public.branches
        where restaurant_id=restaurant_record.id);

    select count(*) into capacity_entitlement_rows
    from public.restaurant_capacity_addon_entitlements entitlement
    where entitlement.restaurant_id=restaurant_record.id
      or entitlement.organization_id=restaurant_record.organization_id
      or entitlement.branch_id in (select id from public.branches
        where restaurant_id=restaurant_record.id);

    select count(*) into pro_grant_rows
    from public.commercial_pro_access_grants grant_row
    where grant_row.restaurant_id=restaurant_record.id
      or grant_row.organization_id=restaurant_record.organization_id;

    select count(*) into trial_claim_rows
    from public.billing_trial_claims claim
    where claim.restaurant_id=restaurant_record.id
      or claim.organization_id=restaurant_record.organization_id;

    select
      (select count(*) from public.billing_checkout_blocked_requests checkout_request
       where checkout_request.restaurant_id=restaurant_record.id
          or checkout_request.organization_id=restaurant_record.organization_id)
      +
      (select count(*) from public.billing_test_webhook_inbox webhook_event
       where webhook_event.tenant_ref=restaurant_record.id)
    into billing_event_rows;

    billing_verified := true;
  exception when undefined_table or undefined_column or insufficient_privilege then
    billing_verified := false;
  end;

  if not exists (select 1 from public.organizations organization
    where organization.id = restaurant_record.organization_id
      and organization.owner_id = restaurant_record.owner_id) then
    blockers_value := blockers_value || '"ORGANIZATION_BINDING_MISSING"'::jsonb;
  end if;
  if not exists (select 1 from auth.users where id = restaurant_record.owner_id)
    or not exists (select 1 from public.restaurant_members member
      where member.restaurant_id = restaurant_record.id
        and member.user_id = restaurant_record.owner_id and member.role = 'owner') then
    blockers_value := blockers_value || '"OWNER_AUTH_BINDING_MISSING"'::jsonb;
  end if;
  if location_count <> 1
    or (select count(*) from public.branches where restaurant_id=restaurant_record.id) <> 1
    or not exists (select 1 from public.branches branch
    where branch.id = restaurant_record.primary_branch_id
      and branch.restaurant_id = restaurant_record.id
      and branch.organization_id = restaurant_record.organization_id
      and upper(trim(branch.country)) ~ '^[A-Z]{2}$') then
    blockers_value := blockers_value || '"LOCATION_BINDING_NOT_EXACT"'::jsonb;
  end if;
  if foreign_customer_memberships > 0 then blockers_value := blockers_value || '"FOREIGN_CUSTOMER_ACCOUNT_MEMBERSHIP"'::jsonb; end if;
  if non_test_customers > 0 then blockers_value := blockers_value || '"NON_TEST_CUSTOMER_PRESENT"'::jsonb; end if;
  if active_redemptions > 0 then blockers_value := blockers_value || '"ACTIVE_OR_RESERVED_REDEMPTION"'::jsonb; end if;
  if stripe_states > 0 then blockers_value := blockers_value || '"PAYMENT_OR_STRIPE_STATE_PRESENT"'::jsonb; end if;
  if entitlement_override_rows > 0 or capacity_entitlement_rows > 0 then
    blockers_value := blockers_value || '"PAID_OR_OVERRIDE_ENTITLEMENT_PRESENT"'::jsonb;
  end if;
  if pro_grant_rows > 0 then blockers_value := blockers_value || '"PRO_ACCESS_GRANT_PRESENT"'::jsonb; end if;
  if trial_claim_rows > 0 then blockers_value := blockers_value || '"BILLING_TRIAL_CLAIM_PRESENT"'::jsonb; end if;
  if billing_event_rows > 0 then blockers_value := blockers_value || '"BILLING_EVENT_OR_CHECKOUT_STATE_PRESENT"'::jsonb; end if;
  if not billing_verified then
    blockers_value := blockers_value || '"PAYMENT_STRIPE_FREEDOM_NOT_VERIFIED"'::jsonb;
  end if;
  if storage_review > 0 then blockers_value := blockers_value || '"STORAGE_OBJECTS_REQUIRE_SEPARATE_CLEANUP"'::jsonb; end if;

  if exists (select 1 from public.platform_admin_operations where tenant_id = restaurant_record.id) then
    blockers_value := blockers_value || '"IMMUTABLE_PLATFORM_AUDIT_PRESENT"'::jsonb;
  end if;
  if exists (select 1 from public.platform_test_tenant_mark_requests
    where target_restaurant_ref = restaurant_record.id) then
    blockers_value := blockers_value || '"IMMUTABLE_MARK_RECEIPT_PRESENT"'::jsonb;
  end if;
  if exists (select 1 from public.platform_test_tenant_cleanup_audit where restaurant_id = restaurant_record.id)
    or exists (select 1 from public.commercial_pro_access_audit where restaurant_id = restaurant_record.id) then
    blockers_value := blockers_value || '"IMMUTABLE_TENANT_AUDIT_PRESENT"'::jsonb;
  end if;
  select coalesce(jsonb_agg(code order by code), '[]'::jsonb) into blockers_value
    from (select distinct value as code from jsonb_array_elements_text(blockers_value)) codes;

  -- Cleanup still requires an existing marker. First marking instead requires
  -- its absence; no receipt/audit or other safety blocker is removed.
  marking_blockers_value := blockers_value - 'TEST_ONLY_MARKER_MISSING';
  pending_marking_exception :=
    billing_verified
    and stripe_states=1
    and pending_subscription_rows=1
    and unsafe_subscription_rows=0
    and entitlement_override_rows=0
    and capacity_entitlement_rows=0
    and pro_grant_rows=0
    and trial_claim_rows=0
    and billing_event_rows=0
    and restaurant_record.status='draft'
    and restaurant_record.activation_status='pending_activation';
  if pending_marking_exception then
    marking_blockers_value := marking_blockers_value - 'PAYMENT_OR_STRIPE_STATE_PRESENT';
  end if;
  select coalesce(jsonb_agg(code order by code), '[]'::jsonb) into marking_blockers_value
    from (select distinct value as code from jsonb_array_elements_text(marking_blockers_value)) codes;
  if exists (select 1 from public.platform_test_tenant_registry where restaurant_id=restaurant_record.id) then
    marking_blockers_value := marking_blockers_value || '"TEST_ONLY_MARKER_ALREADY_PRESENT"'::jsonb;
  end if;

  effective_value := public.resolve_restaurant_entitlements_internal(restaurant_record.id);

  return legacy_value || jsonb_build_object(
    'contract_version','test-tenant-pending-activation-marking-v4',
    'context',jsonb_build_object(
      'organization_id',restaurant_record.organization_id,
      'restaurant_id',restaurant_record.id,
      'location_ids',(select coalesce(jsonb_agg(branch.id order by branch.id),'[]'::jsonb)
        from public.branches branch where branch.restaurant_id=restaurant_record.id
          and branch.organization_id=restaurant_record.organization_id),
      'owner_auth_user_id',restaurant_record.owner_id,
      'country_codes',(select coalesce(jsonb_agg(distinct upper(trim(branch.country))),'[]'::jsonb)
        from public.branches branch where branch.restaurant_id=restaurant_record.id),
      'stored_plan',coalesce((select upper(subscription.plan_key)
        from public.branch_subscriptions subscription
        where subscription.branch_id=restaurant_record.primary_branch_id limit 1),'BASIC'),
      'effective_plan',coalesce(effective_value->>'plan_key','BASIC')
    ),
    'registry_states',(select coalesce(jsonb_agg(jsonb_build_object(
      'restaurant_id',marker.restaurant_id,'organization_id',marker.organization_id,
      'owner_user_id',marker.owner_user_id,'test_session_id',marker.test_session_id,
      'marked_by',marker.marked_by,'marked_at',marker.marked_at,
      'state',case when marker.deleted_at is null then 'ACTIVE' else 'INACTIVE' end,
      'deleted_at',marker.deleted_at) order by marker.marked_at),'[]'::jsonb)
      from public.platform_test_tenant_registry marker where marker.restaurant_id=restaurant_record.id),
    'customers',(select coalesce(jsonb_agg(jsonb_build_object(
      'customer_id',customer.id,'classification',case when customer.is_test_customer then 'TEST_CUSTOMER' else 'NON_TEST_CUSTOMER' end,
      'has_auth_binding',customer.auth_user_id is not null) order by customer.id),'[]'::jsonb)
      from public.customers customer where customer.restaurant_id=restaurant_record.id),
    'foreign_customer_account_memberships',jsonb_build_object('count',foreign_customer_memberships,'pii_returned',false),
    'activity_summary',jsonb_build_object(
      'points',(select count(*) from public.points_transactions where restaurant_id=restaurant_record.id),
      'visits',(select count(*) from public.audit_log where restaurant_id=restaurant_record.id and action ilike '%visit%'),
      'gifts',(select count(*) from public.customer_rewards where restaurant_id=restaurant_record.id),
      'redemptions',(select count(*) from public.redemption_activity_journal where restaurant_id=restaurant_record.id),
      'ledger_entries',(select count(*) from public.points_transactions where restaurant_id=restaurant_record.id),
      'active_or_reserved_redemptions',active_redemptions),
    'storage_objects',(select coalesce(jsonb_agg(jsonb_build_object(
      'object_id',object.id,'bucket_id',object.bucket_id,
      'purpose',case when object.bucket_id ilike '%logo%' then 'BRANDING' when object.bucket_id ilike '%legal%' then 'LEGAL' else 'TENANT_MEDIA' end,
      'tenant_binding',case when object.name like restaurant_record.id::text||'/%' then 'RESTAURANT_ID_PREFIX' else 'RESTAURANT_SLUG_PREFIX' end,
      'disposition','SEPARATE_REVIEW_REQUIRED','public_url_returned',false) order by object.bucket_id,object.id),'[]'::jsonb)
      from storage.objects object where object.name like restaurant_record.id::text||'/%' or object.name like restaurant_record.slug||'/%'),
    'billing_summary',jsonb_build_object(
      'subscriptions',stripe_states,'canonical_source_verified',billing_verified,
      'canonical_source','branch_subscriptions',
      'empty_canonical_billing_state',billing_verified and stripe_states=0,
      'payment_or_stripe_states',stripe_states,
      'pending_activation_subscription_rows',pending_subscription_rows,
      'unsafe_subscription_rows',unsafe_subscription_rows,
      'entitlement_override_rows',entitlement_override_rows,
      'capacity_entitlement_rows',capacity_entitlement_rows,
      'pro_grant_rows',pro_grant_rows,
      'trial_claim_rows',trial_claim_rows,
      'billing_event_rows',billing_event_rows,
      'pending_activation_marking_exception',pending_marking_exception,
      'invoice_source_available',false,
      'external_stripe_attestation',false,'payment_details_returned',false),
    'audit_summary',jsonb_build_object(
      'tenant_audit',(select count(*) from public.audit_log where restaurant_id=restaurant_record.id),
      'platform_audit',(select count(*) from public.platform_admin_operations where tenant_id=restaurant_record.id),
      'commercial_audit',(select count(*) from public.commercial_pro_access_audit where restaurant_id=restaurant_record.id),
      'immutable_history_preserved',true),
    'eligible',jsonb_array_length(blockers_value)=0,
    'restaurant_name',legacy_value->'restaurant_name',
    'inventory',legacy_value->'inventory',
    'eligible_for_marking',jsonb_array_length(marking_blockers_value)=0,
    'marking_preflight',jsonb_build_object('eligible',jsonb_array_length(marking_blockers_value)=0,
      'blockers',marking_blockers_value),
    'blockers',blockers_value,'warnings',warnings_value,
    'privacy',jsonb_build_object('emails_returned',false,'tokens_returned',false,'payment_details_returned',false)
  );
end
$function$;


comment on function public.get_platform_test_tenant_cleanup_preflight(uuid) is
  'Read-only TEST_ONLY preflight. Marking accepts exactly one neutral BASIC pending-activation subscription; cleanup remains subscription-blocked.';

notify pgrst, 'reload schema';
commit;

