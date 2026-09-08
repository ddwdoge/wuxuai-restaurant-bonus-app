-- One-purpose Staging cleanup for a foreign customer account that was
-- accidentally linked to an explicitly marked isolated TEST-ONLY tenant.
-- The global account, auth identity, and every foreign tenant row remain intact.

alter table public.platform_test_tenant_cleanup_audit
  drop constraint if exists platform_test_tenant_cleanup_audit_result_check;

alter table public.platform_test_tenant_cleanup_audit
  add constraint platform_test_tenant_cleanup_audit_result_check
  check (result in ('MARKED', 'DELETED', 'FOREIGN_CUSTOMER_RELATION_REMOVED'));

create function public.get_platform_foreign_test_customer_cleanup_preflight(
  input_restaurant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  marker_record public.platform_test_tenant_registry%rowtype;
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  membership_record public.customer_account_memberships%rowtype;
  account_record public.customer_accounts%rowtype;
  candidate_count bigint;
  local_membership_count bigint;
  foreign_membership_count bigint;
  foreign_points_count bigint;
  local_points_count bigint;
  local_events_count bigint;
  local_rewards_count bigint;
  local_gifts_count bigint;
  local_redemptions_count bigint;
  local_notifications_count bigint;
  cross_tenant_customer_reference_count bigint := 0;
  platform_operation_count bigint;
  dependency_record record;
  dependency_count bigint;
  blockers_value jsonb := '[]'::jsonb;
  local_row_ids jsonb;
  auth_user_id_value uuid;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'PLATFORM_FOREIGN_TEST_CUSTOMER_ACCESS_DENIED';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id;

  if restaurant_record.id is null then
    raise exception using errcode = 'P0002', message = 'TEST_TENANT_NOT_FOUND';
  end if;

  select * into marker_record
  from public.platform_test_tenant_registry
  where restaurant_id = input_restaurant_id
    and deleted_at is null;

  if marker_record.restaurant_id is null then
    blockers_value := blockers_value || jsonb_build_array('TEST_ONLY_MARKER_REQUIRED');
  end if;

  select count(*) into candidate_count
  from public.customers
  where restaurant_id = input_restaurant_id
    and not is_test_customer;

  if candidate_count <> 1 then
    blockers_value := blockers_value || jsonb_build_array('EXACTLY_ONE_FOREIGN_CUSTOMER_REQUIRED');
  else
    select * into customer_record
    from public.customers
    where restaurant_id = input_restaurant_id
      and not is_test_customer
    for share;
  end if;

  if customer_record.id is null then
    return jsonb_build_object(
      'contract_version', 'staging-foreign-test-customer-cleanup-v1',
      'eligible', false,
      'restaurant_id', restaurant_record.id,
      'restaurant_name', restaurant_record.name,
      'candidate_count', candidate_count,
      'blockers', blockers_value
    );
  end if;

  select count(*) into local_membership_count
  from public.customer_account_memberships
  where restaurant_id = input_restaurant_id
    and customer_id = customer_record.id;

  if local_membership_count = 1 then
    select * into membership_record
    from public.customer_account_memberships
    where restaurant_id = input_restaurant_id
      and customer_id = customer_record.id;
    select * into account_record
    from public.customer_accounts
    where id = membership_record.account_id;
  else
    blockers_value := blockers_value || jsonb_build_array('EXACTLY_ONE_LOCAL_ACCOUNT_MEMBERSHIP_REQUIRED');
  end if;

  auth_user_id_value := coalesce(account_record.auth_user_id, customer_record.auth_user_id);
  if account_record.id is null then
    blockers_value := blockers_value || jsonb_build_array('GLOBAL_CUSTOMER_ACCOUNT_REQUIRED');
  end if;
  if auth_user_id_value is null then
    blockers_value := blockers_value || jsonb_build_array('AUTH_USER_REQUIRED');
  end if;
  if account_record.auth_user_id is not null
     and customer_record.auth_user_id is not null
     and account_record.auth_user_id <> customer_record.auth_user_id then
    blockers_value := blockers_value || jsonb_build_array('AUTH_IDENTITY_MISMATCH');
  end if;

  select count(*) into foreign_membership_count
  from public.customer_account_memberships
  where account_id = account_record.id
    and restaurant_id <> input_restaurant_id;

  select count(*) into foreign_points_count
  from public.customer_account_memberships foreign_membership
  join public.points_transactions foreign_points
    on foreign_points.customer_id = foreign_membership.customer_id
   and foreign_points.restaurant_id = foreign_membership.restaurant_id
  where foreign_membership.account_id = account_record.id
    and foreign_membership.restaurant_id <> input_restaurant_id;

  if foreign_membership_count = 0 then
    blockers_value := blockers_value || jsonb_build_array('FOREIGN_MEMBERSHIP_PROOF_REQUIRED');
  end if;

  select count(*) into local_points_count
  from public.points_transactions
  where restaurant_id = input_restaurant_id
    and customer_id = customer_record.id;

  select
    (select count(*) from public.points_collection_requests where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
    + (select count(*) from public.restaurant_points_credit_attempts where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
    + (select count(*) from public.audit_log where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
  into local_events_count;

  select count(*) into local_rewards_count
  from public.customer_rewards
  where restaurant_id = input_restaurant_id
    and customer_id = customer_record.id;

  select count(*) into local_gifts_count
  from public.customer_rewards
  where restaurant_id = input_restaurant_id
    and customer_id = customer_record.id
    and gift_type in ('welcome', 'birthday');

  select
    (select count(*) from public.reward_redemption_events where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
    + (select count(*) from public.redemption_codes where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
    + (select count(*) from public.reward_redemption_codes where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
    + (select count(*) from public.gift_redemption_presentations where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
    + (select count(*) from public.points_redemption_presentations where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
    + (select count(*) from public.redemption_activity_journal where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
  into local_redemptions_count;

  select
    (select count(*) from public.customer_transactional_email_deliveries where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
    + (select count(*) from public.customer_reward_notification_state where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
    + (select count(*) from public.customer_offer_email_consents where restaurant_id = input_restaurant_id and customer_id = customer_record.id)
  into local_notifications_count;

  select count(*) into platform_operation_count
  from public.platform_admin_operations
  where tenant_id = input_restaurant_id
    and entity_id = customer_record.id;

  if local_points_count <> 1 then
    blockers_value := blockers_value || jsonb_build_array('EXACTLY_ONE_LOCAL_POINT_TRANSACTION_REQUIRED');
  end if;
  if customer_record.points_balance <> coalesce((
    select sum(points) from public.points_transactions
    where restaurant_id = input_restaurant_id and customer_id = customer_record.id
  ), 0) then
    blockers_value := blockers_value || jsonb_build_array('LOCAL_POINT_BALANCE_MISMATCH');
  end if;
  if local_redemptions_count <> 0 then
    blockers_value := blockers_value || jsonb_build_array('LOCAL_REDEMPTION_HISTORY_PRESENT');
  end if;
  if exists (
    select 1 from public.customer_rewards
    where restaurant_id = input_restaurant_id
      and customer_id = customer_record.id
      and status in ('redemption_started', 'redeemed')
  ) then
    blockers_value := blockers_value || jsonb_build_array('LOCAL_REWARD_REDEMPTION_STATE_PRESENT');
  end if;
  if platform_operation_count <> 0 then
    blockers_value := blockers_value || jsonb_build_array('IMMUTABLE_PLATFORM_OPERATION_PRESENT');
  end if;

  for dependency_record in
    select customer_column.table_name
    from information_schema.columns customer_column
    join information_schema.columns restaurant_column
      on restaurant_column.table_schema = customer_column.table_schema
     and restaurant_column.table_name = customer_column.table_name
     and restaurant_column.column_name = 'restaurant_id'
    join information_schema.tables table_info
      on table_info.table_schema = customer_column.table_schema
     and table_info.table_name = customer_column.table_name
     and table_info.table_type = 'BASE TABLE'
    where customer_column.table_schema = 'public'
      and customer_column.column_name = 'customer_id'
  loop
    execute format(
      'select count(*) from public.%I where customer_id = $1 and restaurant_id <> $2',
      dependency_record.table_name
    ) into dependency_count using customer_record.id, input_restaurant_id;
    cross_tenant_customer_reference_count := cross_tenant_customer_reference_count + dependency_count;
  end loop;

  if cross_tenant_customer_reference_count <> 0 then
    blockers_value := blockers_value || jsonb_build_array('CROSS_TENANT_CUSTOMER_REFERENCE_PRESENT');
  end if;

  local_row_ids := jsonb_build_object(
    'membership_id', membership_record.id,
    'point_transaction_ids', coalesce((select jsonb_agg(id order by id) from public.points_transactions where restaurant_id = input_restaurant_id and customer_id = customer_record.id), '[]'::jsonb),
    'points_request_ids', coalesce((select jsonb_agg(id order by id) from public.points_collection_requests where restaurant_id = input_restaurant_id and customer_id = customer_record.id), '[]'::jsonb),
    'points_qr_reference_ids', coalesce((select jsonb_agg(id order by id) from public.customer_points_qr_references where restaurant_id = input_restaurant_id and customer_id = customer_record.id), '[]'::jsonb),
    'points_attempt_ids', coalesce((select jsonb_agg(id order by id) from public.restaurant_points_credit_attempts where restaurant_id = input_restaurant_id and customer_id = customer_record.id), '[]'::jsonb),
    'customer_reward_ids', coalesce((select jsonb_agg(id order by id) from public.customer_rewards where restaurant_id = input_restaurant_id and customer_id = customer_record.id), '[]'::jsonb),
    'notification_delivery_ids', coalesce((select jsonb_agg(id order by id) from public.customer_transactional_email_deliveries where restaurant_id = input_restaurant_id and customer_id = customer_record.id), '[]'::jsonb),
    'audit_ids', coalesce((select jsonb_agg(id order by id) from public.audit_log where restaurant_id = input_restaurant_id and customer_id = customer_record.id), '[]'::jsonb)
  );

  return jsonb_build_object(
    'contract_version', 'staging-foreign-test-customer-cleanup-v1',
    'eligible', jsonb_array_length(blockers_value) = 0,
    'blockers', blockers_value,
    'test_tenant', jsonb_build_object('id', restaurant_record.id, 'name', restaurant_record.name),
    'auth_user_id', auth_user_id_value,
    'customer_account_id', account_record.id,
    'customer_id', customer_record.id,
    'customer_name', customer_record.name,
    'local_membership_id', membership_record.id,
    'local_point_transactions', local_points_count,
    'local_point_balance', customer_record.points_balance,
    'local_visits_events', local_events_count,
    'local_rewards', local_rewards_count,
    'local_gifts', local_gifts_count,
    'local_redemptions', local_redemptions_count,
    'local_notifications', local_notifications_count,
    'foreign_restaurant_memberships', foreign_membership_count,
    'foreign_point_transactions', foreign_points_count,
    'cross_tenant_customer_references', cross_tenant_customer_reference_count,
    'foreign_data_to_be_changed', 0,
    'local_row_ids', local_row_ids
  );
end;
$$;

create function public.cleanup_platform_foreign_test_customer_relation(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_account_id uuid,
  input_expected_customer_name text,
  input_reason text,
  input_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  preflight_value jsonb;
  marker_record public.platform_test_tenant_registry%rowtype;
  restaurant_record public.restaurants%rowtype;
  point_transaction_ids uuid[];
  customer_reward_ids uuid[];
  foreign_memberships_before bigint;
  foreign_points_before bigint;
  foreign_memberships_after bigint;
  foreign_points_after bigint;
  expected_confirmation text;
begin
  if auth.uid() is null or not public.is_platform_admin() then
    raise exception using errcode = '42501', message = 'PLATFORM_FOREIGN_TEST_CUSTOMER_ACCESS_DENIED';
  end if;
  if length(trim(coalesce(input_reason, ''))) < 20 then
    raise exception using errcode = '22023', message = 'FOREIGN_TEST_CUSTOMER_CLEANUP_REASON_REQUIRED';
  end if;

  select * into restaurant_record from public.restaurants where id = input_restaurant_id for update;
  select * into marker_record from public.platform_test_tenant_registry
  where restaurant_id = input_restaurant_id and deleted_at is null for update;
  if restaurant_record.id is null or marker_record.restaurant_id is null then
    raise exception using errcode = '42501', message = 'TEST_ONLY_MARKER_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(input_restaurant_id::text || ':' || input_customer_id::text || ':' || input_account_id::text, 0));

  preflight_value := public.get_platform_foreign_test_customer_cleanup_preflight(input_restaurant_id);
  if not coalesce((preflight_value->>'eligible')::boolean, false) then
    raise exception using errcode = '42501', message = 'FOREIGN_TEST_CUSTOMER_PREFLIGHT_BLOCKED', detail = (preflight_value->'blockers')::text;
  end if;
  if (preflight_value->>'customer_id')::uuid <> input_customer_id
     or (preflight_value->>'customer_account_id')::uuid <> input_account_id
     or preflight_value->>'customer_name' <> input_expected_customer_name then
    raise exception using errcode = '42501', message = 'FOREIGN_TEST_CUSTOMER_TARGET_MISMATCH';
  end if;

  expected_confirmation := 'CONFIRMED:' || restaurant_record.name || ':' || restaurant_record.id::text
    || ':' || input_expected_customer_name || ':' || input_customer_id::text || ':' || input_account_id::text;
  if input_confirmation <> expected_confirmation then
    raise exception using errcode = '42501', message = 'FOREIGN_TEST_CUSTOMER_STRONG_CONFIRMATION_REQUIRED';
  end if;

  foreign_memberships_before := (preflight_value->>'foreign_restaurant_memberships')::bigint;
  foreign_points_before := (preflight_value->>'foreign_point_transactions')::bigint;
  select array_agg(id) into point_transaction_ids from public.points_transactions
  where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  select array_agg(id) into customer_reward_ids from public.customer_rewards
  where restaurant_id = input_restaurant_id and customer_id = input_customer_id;

  perform set_config('wuxuai.test_tenant_cleanup_id', input_restaurant_id::text, true);

  delete from public.customer_offer_email_deliveries
  where restaurant_id = input_restaurant_id and account_id = input_account_id;
  delete from public.customer_offer_email_consents
  where restaurant_id = input_restaurant_id and customer_id = input_customer_id and account_id = input_account_id;
  delete from public.customer_transactional_email_deliveries
  where restaurant_id = input_restaurant_id and customer_id = input_customer_id and account_id = input_account_id;
  delete from public.customer_reward_notification_state
  where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.expiry_reminders where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.customer_push_subscriptions where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.customer_message_attempts where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.customer_legal_acceptances where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.customer_consents where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.consent_events where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.privacy_requests where restaurant_id = input_restaurant_id and customer_id = input_customer_id;

  delete from public.daily_pin_attempts where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.restaurant_points_credit_attempts where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.points_collection_requests where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.customer_points_qr_references where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.customer_qr_tokens where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.points_idempotency_claims where restaurant_id = input_restaurant_id and transaction_id = any(coalesce(point_transaction_ids, '{}'::uuid[]));
  delete from public.points_reverse_idempotency_claims
  where restaurant_id = input_restaurant_id
    and (original_transaction_id = any(coalesce(point_transaction_ids, '{}'::uuid[]))
      or reversal_transaction_id = any(coalesce(point_transaction_ids, '{}'::uuid[])));

  delete from public.reward_redemption_codes where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.redemption_activation_attempts where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.redemption_codes where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.reward_redemption_events where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.birthday_gift_job_log where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.gift_assignment_cleanup_log
  where restaurant_id = input_restaurant_id
    and (kept_customer_reward_id = any(coalesce(customer_reward_ids, '{}'::uuid[]))
      or cancelled_customer_reward_id = any(coalesce(customer_reward_ids, '{}'::uuid[])));
  delete from public.customer_rewards where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.stamp_transactions where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.points_transactions where restaurant_id = input_restaurant_id and customer_id = input_customer_id;

  delete from public.customer_bonus_boosts where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.referral_boost_grants where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.customer_devices where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.campaign_customer_offers where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.campaign_events where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.coupon_redemptions where restaurant_id = input_restaurant_id and customer_id = input_customer_id;

  delete from public.audit_log where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
  delete from public.customer_account_memberships
  where id = (preflight_value->>'local_membership_id')::uuid
    and restaurant_id = input_restaurant_id
    and customer_id = input_customer_id
    and account_id = input_account_id;
  if not found then
    raise exception using errcode = '23503', message = 'LOCAL_MEMBERSHIP_DELETE_FAILED';
  end if;
  delete from public.customers where id = input_customer_id and restaurant_id = input_restaurant_id;
  if not found then
    raise exception using errcode = '23503', message = 'LOCAL_CUSTOMER_DELETE_FAILED';
  end if;

  select count(*) into foreign_memberships_after
  from public.customer_account_memberships
  where account_id = input_account_id and restaurant_id <> input_restaurant_id;
  select count(*) into foreign_points_after
  from public.customer_account_memberships foreign_membership
  join public.points_transactions foreign_points
    on foreign_points.customer_id = foreign_membership.customer_id
   and foreign_points.restaurant_id = foreign_membership.restaurant_id
  where foreign_membership.account_id = input_account_id
    and foreign_membership.restaurant_id <> input_restaurant_id;

  if foreign_memberships_after <> foreign_memberships_before or foreign_points_after <> foreign_points_before then
    raise exception using errcode = '23503', message = 'FOREIGN_CUSTOMER_DATA_CHANGED';
  end if;
  if not exists (select 1 from public.customer_accounts where id = input_account_id)
     or not exists (select 1 from auth.users where id = (preflight_value->>'auth_user_id')::uuid) then
    raise exception using errcode = '23503', message = 'GLOBAL_CUSTOMER_IDENTITY_CHANGED';
  end if;

  insert into public.platform_test_tenant_cleanup_audit (
    restaurant_id, restaurant_name, organization_id, owner_user_id, test_session_id,
    platform_admin_user_id, reason, inventory, result
  ) values (
    marker_record.restaurant_id, marker_record.restaurant_name, marker_record.organization_id,
    marker_record.owner_user_id, marker_record.test_session_id, auth.uid(), trim(input_reason),
    preflight_value, 'FOREIGN_CUSTOMER_RELATION_REMOVED'
  );

  return jsonb_build_object(
    'removed', true,
    'restaurant_id', input_restaurant_id,
    'customer_id', input_customer_id,
    'account_id', input_account_id,
    'foreign_memberships_preserved', foreign_memberships_after,
    'foreign_points_preserved', foreign_points_after,
    'global_account_preserved', true,
    'global_auth_user_preserved', true
  );
end;
$$;

revoke all on function public.get_platform_foreign_test_customer_cleanup_preflight(uuid)
  from public, anon, authenticated;
revoke all on function public.cleanup_platform_foreign_test_customer_relation(uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.get_platform_foreign_test_customer_cleanup_preflight(uuid)
  to authenticated;
grant execute on function public.cleanup_platform_foreign_test_customer_relation(uuid,uuid,uuid,text,text,text)
  to authenticated;

notify pgrst, 'reload schema';
