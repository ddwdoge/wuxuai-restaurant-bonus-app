-- Separate TEST_ONLY BASIC customer/owner runtime for QR -> PIN -> points.
-- The ordinary Customer portal and the real QR/PIN/points RPCs remain closed
-- while the restaurant is PENDING_ACTIVATION.
begin;

select pg_advisory_xact_lock(hashtextextended('migration:20261012230846', 0));

-- Keep the real operational gate real-only. The synthetic wrappers below set
-- a transaction-local scope that is private to their SECURITY DEFINER call.
create or replace function public.require_restaurant_operational(
  input_restaurant_id uuid,
  input_action text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  state jsonb;
  grace public.basic_post_trial_redemption_grace%rowtype;
  explicit_test_scope boolean := current_setting('wuxuai.test_only_basic_explicit', true) = 'on';
  required_test_action text := case input_action
    when 'create_customer_points_credit_qr' then 'CUSTOMER_POINTS_QR'
    when 'get_today_restaurant_pin' then 'DAILY_PIN'
    when 'preview_restaurant_controlled_points' then 'POINTS_PREVIEW'
    when 'confirm_restaurant_controlled_points' then 'POINTS_CONFIRM'
    else null
  end;
begin
  state := public.restaurant_activation_state_internal(input_restaurant_id);
  if coalesce((state->>'operational')::boolean, false) then return; end if;
  if input_action = 'resolve_customer_from_public_token'
    and public.platform_test_join_permit_active_internal(input_restaurant_id) then
    return;
  end if;
  -- Preserve the existing TEST_ONLY draft-authoring contract. The later
  -- publication migration keeps the real publish/status RPC closed and only
  -- publish_test_only_basic_offer can make such a draft visible.
  if input_action = 'save_restaurant_offer'
    and public.test_only_basic_access_active_internal(input_restaurant_id) then
    perform public.begin_test_only_basic_operation_internal(
      input_restaurant_id, 'OFFER_WRITE'
    );
    return;
  end if;
  if explicit_test_scope
    and required_test_action is not null
    and public.test_only_basic_operation_scope_active_internal(
      input_restaurant_id, required_test_action
    ) then
    return;
  end if;
  if input_action in ('secure_redemption_start', 'secure_redemption_finalize') then
    select * into grace from public.basic_post_trial_redemption_grace
    where restaurant_id = input_restaurant_id
      and starts_at <= statement_timestamp()
      and ends_at > statement_timestamp();
    if grace.restaurant_id is not null then return; end if;
  end if;
  raise exception 'RESTAURANT_NOT_OPERATIONAL' using errcode = '42501';
end;
$function$;

revoke all on function public.require_restaurant_operational(uuid, text)
from public, anon, authenticated, service_role;

-- Restore the ordinary customer QR writer. It only resolves active restaurants
-- and never consults a TEST_ONLY grant.
create or replace function public.create_customer_points_credit_qr(
  input_restaurant_slug text,
  input_customer_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  mode_value text;
  raw_token text;
  raw_code text;
  expiry_value timestamptz := now() + interval '5 minutes';
begin
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  select points_collection_mode into mode_value from public.loyalty_settings
  where restaurant_id = restaurant_record.id and active = true;
  if mode_value not in ('restaurant_controlled_only', 'both') then
    raise exception 'Dieser Sammelweg ist nicht aktiviert.';
  end if;
  select customer.* into customer_record
  from public.customer_qr_tokens token
  join public.customers customer on customer.id = token.customer_id
  where token.restaurant_id = restaurant_record.id
    and token.token_hash = public.hash_public_token(input_customer_token)
    and token.active = true
    and (token.expires_at is null or token.expires_at > now())
    and customer.restaurant_id = restaurant_record.id
    and customer.membership_status = 'active'
  limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  if (select count(*) from public.customer_points_qr_references reference
      where reference.customer_id = customer_record.id
        and reference.created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Bitte warte kurz und versuche es erneut.';
  end if;
  update public.customer_points_qr_references set revoked_at = now()
  where restaurant_id = restaurant_record.id
    and customer_id = customer_record.id
    and consumed_at is null and revoked_at is null and expires_at > now();
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  loop
    raw_code := public.generate_numeric_code(8);
    exit when not exists (
      select 1 from public.customer_points_qr_references reference
      where reference.manual_code_hash = public.hash_public_token(raw_code)
    );
  end loop;
  insert into public.customer_points_qr_references(
    restaurant_id, organization_id, branch_id, customer_id,
    token_hash, manual_code_hash, expires_at
  ) values (
    restaurant_record.id, restaurant_record.organization_id,
    coalesce(customer_record.branch_id, restaurant_record.primary_branch_id,
      public.restaurant_primary_branch_id(restaurant_record.id)),
    customer_record.id, public.hash_public_token(raw_token),
    public.hash_public_token(raw_code), expiry_value
  );
  return jsonb_build_object(
    'qr_token', raw_token, 'manual_code', raw_code, 'expires_at', expiry_value
  );
end;
$function$;

revoke all on function public.create_customer_points_credit_qr(text, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_customer_points_credit_qr(text, text)
to authenticated;

-- Restore the real public owner/staff PIN and points entry points. None of them
-- can set the private explicit TEST_ONLY scope used below.
create or replace function public.get_today_restaurant_pin(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  pin_record public.restaurant_daily_pins%rowtype;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;
  perform public.require_restaurant_operational(input_restaurant_id, 'get_today_restaurant_pin');
  pin_record := public.ensure_today_restaurant_pin(input_restaurant_id, null);
  return jsonb_build_object('pin_code', pin_record.pin_code, 'valid_until', pin_record.valid_until);
end;
$function$;

revoke all on function public.get_today_restaurant_pin(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_today_restaurant_pin(uuid) to authenticated;

create or replace function public.preview_restaurant_controlled_points(
  input_restaurant_id uuid,
  input_qr_reference text,
  input_amount_cents integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  validation jsonb;
begin
  perform public.require_restaurant_operational(
    input_restaurant_id, 'preview_restaurant_controlled_points'
  );
  validation := public.validate_minimum_points_amount_v1(input_amount_cents);
  if not coalesce((validation->>'success')::boolean, false) then return validation; end if;
  return public.preview_restaurant_controlled_points_before_minimum_guard(
    input_restaurant_id, input_qr_reference, input_amount_cents
  );
end;
$function$;

revoke all on function public.preview_restaurant_controlled_points(uuid, text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.preview_restaurant_controlled_points(uuid, text, integer)
to authenticated;

create or replace function public.confirm_restaurant_controlled_points(
  input_restaurant_id uuid,
  input_qr_reference text,
  input_amount_cents integer,
  input_daily_pin text,
  input_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.require_restaurant_operational(
    input_restaurant_id, 'confirm_restaurant_controlled_points'
  );
  return public.confirm_restaurant_controlled_points_with_legacy_receipt_v1(
    input_restaurant_id, input_qr_reference, input_amount_cents,
    input_daily_pin, input_idempotency_key, null
  );
end;
$function$;

revoke all on function public.confirm_restaurant_controlled_points(uuid, text, integer, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.confirm_restaurant_controlled_points(uuid, text, integer, text, uuid)
to authenticated;

-- Restore the ordinary public offer reader. Synthetic offers are available
-- only through get_test_only_basic_customer_flow below.
create or replace function public.get_public_restaurant_offers(
  input_restaurant_slug text default null,
  input_limit integer default 20
) returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select coalesce(jsonb_agg(payload order by priority, published_at desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', offer.id, 'restaurant_id', offer.restaurant_id,
      'restaurant_name', restaurant.name, 'restaurant_slug', restaurant.slug,
      'branch_id', offer.branch_id, 'branch_name', branch.name,
      'offer_type', offer.offer_type, 'title', offer.title,
      'short_description', offer.short_description, 'description', offer.description,
      'image_url', offer.image_url, 'image_zoom', offer.image_zoom,
      'image_position_x', offer.image_position_x, 'image_position_y', offer.image_position_y,
      'image_aspect_ratio', offer.image_aspect_ratio,
      'image_crop_version', offer.image_crop_version,
      'current_price', offer.current_price, 'previous_price', offer.previous_price,
      'currency', offer.currency, 'valid_from', offer.valid_from,
      'valid_to', offer.valid_to, 'weekdays', offer.weekdays,
      'time_from', offer.time_from, 'time_to', offer.time_to,
      'button_label', offer.button_label, 'published_at', offer.published_at
    ) payload,
    case offer.offer_type when 'LUNCH_MENU' then 1 when 'WEEKLY_OFFER' then 2
      when 'MONTHLY_OFFER' then 3 when 'SEASONAL_OFFER' then 4
      when 'NEW_DISH' then 5 when 'EVENT' then 6 else 7 end priority,
    offer.published_at
    from public.restaurant_offers offer
    join public.restaurants restaurant
      on restaurant.id = offer.restaurant_id and restaurant.status = 'active'
    join public.branches branch
      on branch.id = offer.branch_id and branch.restaurant_id = restaurant.id
     and branch.status = 'active'
    where offer.status = 'PUBLISHED' and offer.is_active = true
      and offer.valid_to > now()
      and ((input_restaurant_slug is not null and restaurant.slug = trim(input_restaurant_slug))
        or (input_restaurant_slug is null and branch.is_discoverable = true))
    order by priority, offer.published_at desc
    limit least(greatest(coalesce(input_limit, 20), 1), 100)
  ) visible_offers;
$function$;

revoke all on function public.get_public_restaurant_offers(text, integer)
from public, anon, authenticated, service_role;
grant execute on function public.get_public_restaurant_offers(text, integer)
to anon, authenticated;

create function public.get_test_only_basic_customer_flow(input_restaurant_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  restaurant_record public.restaurants%rowtype;
  branch_record public.branches%rowtype;
  customer_record public.customers%rowtype;
  snapshot_value jsonb;
  latest_access public.test_only_basic_access_receipts%rowtype;
  active_value boolean;
  offers_value jsonb := '[]'::jsonb;
begin
  perform project_bootstrap.require_runtime_binding(true);
  if auth.uid() is null or auth.role() is distinct from 'authenticated' then
    raise exception 'TEST_ONLY_BASIC_CUSTOMER_DENIED' using errcode = '42501';
  end if;
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug);
  if restaurant_record.id is null then
    raise exception 'TEST_ONLY_BASIC_CONTEXT_INVALID' using errcode = '42501';
  end if;
  snapshot_value := public.test_only_basic_access_snapshot_internal(restaurant_record.id);
  if snapshot_value is null
    or not public.test_only_basic_customer_authorized_internal(restaurant_record.id) then
    raise exception 'TEST_ONLY_BASIC_CUSTOMER_DENIED' using errcode = '42501';
  end if;
  select customer.* into customer_record
  from public.customer_accounts account
  join public.customer_account_memberships membership on membership.account_id = account.id
  join public.customers customer
    on customer.id = membership.customer_id
   and customer.restaurant_id = membership.restaurant_id
  where account.auth_user_id = auth.uid()
    and account.disabled_at is null
    and membership.restaurant_id = restaurant_record.id
    and customer.id = (snapshot_value->>'customer_id')::uuid
    and customer.is_test_customer is true
    and customer.membership_status = 'active';
  if customer_record.id is null then
    raise exception 'TEST_ONLY_BASIC_CUSTOMER_DENIED' using errcode = '42501';
  end if;
  select * into branch_record from public.branches
  where id = (snapshot_value->>'branch_id')::uuid
    and restaurant_id = restaurant_record.id
    and organization_id = restaurant_record.organization_id;
  if branch_record.id is null then
    raise exception 'TEST_ONLY_BASIC_CONTEXT_INVALID' using errcode = '42501';
  end if;
  select * into latest_access from public.test_only_basic_access_receipts receipt
  where receipt.restaurant_id = restaurant_record.id
  order by receipt.created_at desc, receipt.id desc limit 1;
  active_value := public.test_only_basic_access_active_internal(restaurant_record.id);
  if active_value then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', offer.id, 'title', offer.title,
      'short_description', offer.short_description, 'description', offer.description,
      'offer_type', offer.offer_type, 'image_url', offer.image_url,
      'current_price', offer.current_price, 'previous_price', offer.previous_price,
      'currency', offer.currency, 'valid_from', offer.valid_from,
      'valid_to', offer.valid_to, 'button_label', offer.button_label,
      'publication_version', offer.publication_version,
      'published_at', offer.published_at, 'synthetic_test_only', true
    ) order by offer.published_at desc), '[]'::jsonb)
    into offers_value
    from public.restaurant_offers offer
    where offer.restaurant_id = restaurant_record.id
      and offer.branch_id = branch_record.id
      and offer.status = 'PUBLISHED' and offer.is_active is true
      and offer.valid_to > statement_timestamp()
      and exists (
        select 1 from public.test_only_basic_offer_publication_receipts receipt
        where receipt.offer_id = offer.id
          and receipt.restaurant_id = offer.restaurant_id
          and (receipt.result->>'publication_version')::integer = offer.publication_version
      );
  end if;
  return jsonb_build_object(
    'synthetic_test_only', true, 'active', active_value,
    'restaurant_id', restaurant_record.id, 'restaurant_name', restaurant_record.name,
    'restaurant_slug', restaurant_record.slug, 'organization_id', restaurant_record.organization_id,
    'branch_id', branch_record.id, 'branch_name', branch_record.name,
    'customer_id', customer_record.id, 'customer_name', customer_record.name,
    'access_receipt_id', latest_access.id, 'expires_at', latest_access.expires_at,
    'offer_limit', case when active_value then 5 else 0 end,
    'offers', offers_value, 'real_activation', false, 'real_trial', false,
    'real_entitlement', false, 'catalog_access', false
  );
end;
$function$;

revoke all on function public.get_test_only_basic_customer_flow(text)
from public, anon, authenticated, service_role;
grant execute on function public.get_test_only_basic_customer_flow(text) to authenticated;

create function public.create_test_only_basic_customer_points_qr(
  input_restaurant_id uuid,
  input_request_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, auth, pg_temp
as $function$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  latest_access public.test_only_basic_access_receipts%rowtype;
  snapshot_value jsonb;
  reference_id_value uuid;
  raw_token text;
  raw_code text;
  expiry_value timestamptz := statement_timestamp() + interval '5 minutes';
begin
  perform project_bootstrap.require_runtime_binding(true);
  if input_restaurant_id is null or input_request_id is null then
    raise exception 'TEST_ONLY_BASIC_QR_REQUEST_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-basic:' || input_restaurant_id::text, 0
  ));
  perform public.begin_test_only_basic_operation_internal(
    input_restaurant_id, 'CUSTOMER_POINTS_QR'
  );
  perform set_config('wuxuai.test_only_basic_explicit', 'on', true);
  snapshot_value := public.test_only_basic_access_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then
    raise exception 'TEST_ONLY_BASIC_CONTEXT_INVALID' using errcode = '42501';
  end if;
  select * into restaurant_record from public.restaurants
  where id = input_restaurant_id
    and organization_id = (snapshot_value->>'organization_id')::uuid
  for share;
  select customer.* into customer_record
  from public.customer_accounts account
  join public.customer_account_memberships membership on membership.account_id = account.id
  join public.customers customer
    on customer.id = membership.customer_id
   and customer.restaurant_id = membership.restaurant_id
  where account.auth_user_id = auth.uid()
    and account.disabled_at is null
    and membership.restaurant_id = input_restaurant_id
    and customer.id = (snapshot_value->>'customer_id')::uuid
    and customer.is_test_customer is true
    and customer.membership_status = 'active';
  if restaurant_record.id is null or customer_record.id is null then
    raise exception 'TEST_ONLY_BASIC_CUSTOMER_DENIED' using errcode = '42501';
  end if;
  select * into latest_access from public.test_only_basic_access_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.created_at desc, receipt.id desc limit 1;
  if latest_access.action is distinct from 'GRANT'
    or latest_access.expires_at <= statement_timestamp() then
    raise exception 'TEST_ONLY_BASIC_OPERATION_DENIED' using errcode = '42501';
  end if;
  if (select count(*) from public.customer_points_qr_references reference
      where reference.customer_id = customer_record.id
        and reference.created_at > statement_timestamp() - interval '1 minute') >= 5 then
    raise exception 'Bitte warte kurz und versuche es erneut.';
  end if;
  update public.customer_points_qr_references set revoked_at = statement_timestamp()
  where restaurant_id = input_restaurant_id and customer_id = customer_record.id
    and consumed_at is null and revoked_at is null and expires_at > statement_timestamp();
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  loop
    raw_code := public.generate_numeric_code(8);
    exit when not exists (
      select 1 from public.customer_points_qr_references reference
      where reference.manual_code_hash = public.hash_public_token(raw_code)
    );
  end loop;
  insert into public.customer_points_qr_references(
    restaurant_id, organization_id, branch_id, customer_id,
    token_hash, manual_code_hash, expires_at
  ) values (
    input_restaurant_id, restaurant_record.organization_id,
    (snapshot_value->>'branch_id')::uuid,
    customer_record.id, public.hash_public_token(raw_token),
    public.hash_public_token(raw_code), expiry_value
  ) returning id into reference_id_value;
  perform public.write_audit_event(
    input_restaurant_id, customer_record.id, 'customer', customer_record.id,
    'TEST_ONLY_BASIC_CUSTOMER_QR_CREATED', 'success', 'customer_portal',
    'customer_points_qr_references', reference_id_value, input_request_id,
    jsonb_build_object('synthetic_test_only', true,
      'access_receipt_id', latest_access.id, 'expires_at', expiry_value)
  );
  return jsonb_build_object(
    'reference_id', reference_id_value, 'qr_token', raw_token,
    'manual_code', raw_code, 'expires_at', expiry_value,
    'access_receipt_id', latest_access.id, 'synthetic_test_only', true
  );
end;
$function$;

revoke all on function public.create_test_only_basic_customer_points_qr(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.create_test_only_basic_customer_points_qr(uuid, uuid)
to authenticated;

create function public.get_test_only_basic_today_restaurant_pin(
  input_restaurant_id uuid,
  input_request_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  pin_record public.restaurant_daily_pins%rowtype;
  latest_access public.test_only_basic_access_receipts%rowtype;
  snapshot_value jsonb;
begin
  perform project_bootstrap.require_runtime_binding(true);
  if input_restaurant_id is null or input_request_id is null then
    raise exception 'TEST_ONLY_BASIC_PIN_REQUEST_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-basic:' || input_restaurant_id::text, 0
  ));
  perform public.begin_test_only_basic_operation_internal(input_restaurant_id, 'DAILY_PIN');
  perform set_config('wuxuai.test_only_basic_explicit', 'on', true);
  snapshot_value := public.test_only_basic_access_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then
    raise exception 'TEST_ONLY_BASIC_CONTEXT_INVALID' using errcode = '42501';
  end if;
  pin_record := public.ensure_today_restaurant_pin(
    input_restaurant_id, (snapshot_value->>'branch_id')::uuid
  );
  select * into latest_access from public.test_only_basic_access_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.created_at desc, receipt.id desc limit 1;
  perform public.write_audit_event(
    input_restaurant_id, null, 'staff', auth.uid(),
    'TEST_ONLY_BASIC_DAILY_PIN_READ', 'success', 'owner_portal',
    'restaurant_daily_pins', pin_record.id, input_request_id,
    jsonb_build_object('synthetic_test_only', true,
      'access_receipt_id', latest_access.id, 'valid_until', pin_record.valid_until)
  );
  return jsonb_build_object(
    'pin_code', pin_record.pin_code, 'valid_until', pin_record.valid_until,
    'access_receipt_id', latest_access.id, 'synthetic_test_only', true
  );
end;
$function$;

revoke all on function public.get_test_only_basic_today_restaurant_pin(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_test_only_basic_today_restaurant_pin(uuid, uuid)
to authenticated;

create function public.preview_test_only_basic_points(
  input_restaurant_id uuid,
  input_qr_reference text,
  input_amount_cents integer,
  input_request_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  result_value jsonb;
  latest_access public.test_only_basic_access_receipts%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(true);
  if input_request_id is null then
    raise exception 'TEST_ONLY_BASIC_PREVIEW_REQUEST_INVALID' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-basic:' || input_restaurant_id::text, 0
  ));
  perform public.begin_test_only_basic_operation_internal(input_restaurant_id, 'POINTS_PREVIEW');
  perform set_config('wuxuai.test_only_basic_explicit', 'on', true);
  result_value := public.preview_test_only_basic_points_internal(
    input_restaurant_id, input_qr_reference, input_amount_cents
  );
  select * into latest_access from public.test_only_basic_access_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.created_at desc, receipt.id desc limit 1;
  perform public.write_audit_event(
    input_restaurant_id, null, 'staff', auth.uid(),
    'TEST_ONLY_BASIC_POINTS_PREVIEWED',
    case when coalesce((result_value->>'success')::boolean, true) then 'success' else 'blocked' end,
    'owner_portal', 'restaurant_points_credit_attempts', null, input_request_id,
    jsonb_build_object('synthetic_test_only', true,
      'access_receipt_id', latest_access.id, 'amount_cents', input_amount_cents,
      'success', coalesce((result_value->>'success')::boolean, true),
      'error_code', result_value->>'error_code')
  );
  return result_value || jsonb_build_object(
    'access_receipt_id', latest_access.id, 'synthetic_test_only', true
  );
end;
$function$;

revoke all on function public.preview_test_only_basic_points(uuid, text, integer, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.preview_test_only_basic_points(uuid, text, integer, uuid)
to authenticated;

create function public.confirm_test_only_basic_points(
  input_restaurant_id uuid,
  input_qr_reference text,
  input_amount_cents integer,
  input_daily_pin text,
  input_idempotency_key uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  result_value jsonb;
begin
  perform project_bootstrap.require_runtime_binding(true);
  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-basic:' || input_restaurant_id::text, 0
  ));
  perform public.begin_test_only_basic_operation_internal(input_restaurant_id, 'POINTS_CONFIRM');
  perform set_config('wuxuai.test_only_basic_explicit', 'on', true);
  result_value := public.confirm_test_only_basic_points_internal(
    input_restaurant_id, input_qr_reference, input_amount_cents,
    input_daily_pin, input_idempotency_key
  );
  return result_value || jsonb_build_object('synthetic_test_only', true);
end;
$function$;

revoke all on function public.confirm_test_only_basic_points(uuid, text, integer, text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.confirm_test_only_basic_points(uuid, text, integer, text, uuid)
to authenticated;

comment on function public.get_test_only_basic_customer_flow(text) is
  'Returns the bound synthetic guest, current synthetic offer evidence and active-grant state. It never opens the ordinary Customer portal.';
comment on function public.create_test_only_basic_customer_points_qr(uuid, uuid) is
  'Creates a short-lived QR only for the bound synthetic guest under the current TEST_ONLY BASIC grant.';
comment on function public.get_test_only_basic_today_restaurant_pin(uuid, uuid) is
  'Reads or creates the bound tenant daily PIN only under the explicit TEST_ONLY BASIC owner/staff path.';
comment on function public.preview_test_only_basic_points(uuid, text, integer, uuid) is
  'Previews synthetic points under the explicit TEST_ONLY BASIC path; no real entitlement is accepted.';
comment on function public.confirm_test_only_basic_points(uuid, text, integer, text, uuid) is
  'Confirms one idempotent synthetic points booking under the explicit TEST_ONLY BASIC path.';

notify pgrst, 'reload schema';
commit;
