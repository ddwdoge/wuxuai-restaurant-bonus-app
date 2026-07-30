-- Keep the shared audit trigger table-safe: transition records only expose
-- columns of the table that fired the trigger.
create or replace function public.audit_core_table_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_id_value uuid;
  event_type_value text;
  entity_type_value text := tg_table_name;
  entity_id_value uuid;
  restaurant_id_value uuid;
  request_id_value uuid;
  metadata_value jsonb := '{}'::jsonb;
  source_value text := 'database';
begin
  if tg_table_name = 'customers' then
    if tg_op <> 'INSERT' then return new; end if;
    perform public.write_audit_event(new.restaurant_id, new.id, 'customer', new.id,
      'CUSTOMER_REGISTERED', 'success', 'registration', 'customers', new.id, null,
      jsonb_build_object('registration_type', 'normal'));
    perform public.write_audit_event(new.restaurant_id, new.id, 'customer', new.id,
      'CUSTOMER_JOINED_RESTAURANT', 'success', 'registration', 'customers', new.id, null);
    return new;
  elsif tg_table_name = 'points_collection_requests' then
    if tg_op <> 'INSERT' then return new; end if;
    restaurant_id_value := new.restaurant_id;
    customer_id_value := new.customer_id;
    entity_id_value := new.id;
    request_id_value := new.idempotency_key;
    event_type_value := 'POINTS_COLLECTION_STARTED';
    source_value := new.source;
    metadata_value := jsonb_build_object('source', new.source);
  elsif tg_table_name = 'points_transactions' then
    if tg_op <> 'INSERT' or new.type <> 'earn' then return new; end if;
    restaurant_id_value := new.restaurant_id;
    customer_id_value := new.customer_id;
    entity_id_value := new.id;
    request_id_value := new.idempotency_key;
    perform public.write_audit_event(new.restaurant_id, new.customer_id, 'system', null,
      'DAILY_PIN_ACCEPTED', 'success', 'points_collection', 'points_transactions',
      new.id, new.idempotency_key, jsonb_build_object('confirmed_server_side', true));
    event_type_value := 'POINTS_ADDED';
    metadata_value := jsonb_build_object('points', new.points, 'reason', new.reason);
  elsif tg_table_name = 'customer_rewards' then
    if tg_op = 'INSERT' then
      if new.gift_type not in ('welcome', 'birthday') then return new; end if;
      restaurant_id_value := new.restaurant_id;
      customer_id_value := new.customer_id;
      entity_id_value := new.id;
      event_type_value := 'WELCOME_REWARD_CREATED';
      metadata_value := jsonb_build_object('gift_type', new.gift_type, 'reward_id', new.reward_id);
    elsif tg_op = 'UPDATE' then
      if old.status <> 'locked' or new.status <> 'active' then return new; end if;
      restaurant_id_value := new.restaurant_id;
      customer_id_value := new.customer_id;
      entity_id_value := new.id;
      event_type_value := 'REWARD_UNLOCKED';
      metadata_value := jsonb_build_object('gift_type', new.gift_type, 'reward_id', new.reward_id);
    else
      return new;
    end if;
  elsif tg_table_name = 'redemption_codes' then
    if tg_op = 'INSERT' then
      restaurant_id_value := new.restaurant_id;
      customer_id_value := new.customer_id;
      entity_id_value := new.id;
      request_id_value := new.idempotency_key;
      event_type_value := 'REDEMPTION_CODE_CREATED';
      metadata_value := jsonb_build_object('redemption_type', new.redemption_type,
        'reward_id', new.reward_id, 'expires_at', new.expires_at);
    elsif tg_op = 'UPDATE' then
      if old.status = 'redeemed' or new.status <> 'redeemed' then return new; end if;
      restaurant_id_value := new.restaurant_id;
      customer_id_value := new.customer_id;
      entity_id_value := new.id;
      request_id_value := new.idempotency_key;
      event_type_value := 'REWARD_REDEEMED';
      metadata_value := jsonb_build_object('redemption_type', new.redemption_type,
        'reward_id', new.reward_id);
    else
      return new;
    end if;
  elsif tg_table_name = 'coupon_redemptions' then
    if tg_op <> 'INSERT' then return new; end if;
    restaurant_id_value := new.restaurant_id;
    customer_id_value := new.customer_id;
    entity_id_value := new.id;
    event_type_value := 'COUPON_REDEEMED';
    metadata_value := jsonb_build_object('coupon_id', new.coupon_id);
  elsif tg_table_name = 'referrals' then
    if tg_op = 'INSERT' then
      restaurant_id_value := new.restaurant_id;
      customer_id_value := new.referrer_customer_id;
      entity_id_value := new.id;
      event_type_value := 'REFERRAL_CREATED';
    elsif tg_op = 'UPDATE' then
      if old.status = 'activated' or new.status <> 'activated' then return new; end if;
      restaurant_id_value := new.restaurant_id;
      customer_id_value := new.referred_customer_id;
      entity_id_value := new.id;
      event_type_value := 'REFERRAL_ACTIVATED';
    else
      return new;
    end if;
  else
    return new;
  end if;

  perform public.write_audit_event(restaurant_id_value, customer_id_value, 'system', null,
    event_type_value, 'success', source_value, entity_type_value,
    entity_id_value, request_id_value, metadata_value);
  return new;
end;
$$;

revoke execute on function public.audit_core_table_changes() from public, anon, authenticated;

notify pgrst, 'reload schema';
