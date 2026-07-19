-- Extend the existing audit_log instead of introducing a parallel event store.
alter table public.customers
  add column if not exists is_test_customer boolean not null default false,
  add column if not exists test_session_id text;

alter table public.customers
  drop constraint if exists customers_test_session_id_format;

alter table public.customers
  add constraint customers_test_session_id_format
  check (
    test_session_id is null
    or test_session_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$'
  );

alter table public.audit_log
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists event_type text,
  add column if not exists status text not null default 'success',
  add column if not exists source text,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists request_id uuid,
  add column if not exists is_test_event boolean not null default false,
  add column if not exists test_session_id text,
  add column if not exists error_code text,
  add column if not exists error_message text;

alter table public.audit_log
  drop constraint if exists audit_log_status_allowed;

alter table public.audit_log
  add constraint audit_log_status_allowed
  check (status in ('success', 'failed', 'blocked'));

create index if not exists audit_log_platform_filters_idx
  on public.audit_log (created_at desc, restaurant_id, event_type, status);

create index if not exists audit_log_customer_created_idx
  on public.audit_log (customer_id, created_at desc)
  where customer_id is not null;

create index if not exists audit_log_test_session_idx
  on public.audit_log (test_session_id, created_at desc)
  where test_session_id is not null;

create index if not exists customers_production_kpi_idx
  on public.customers (restaurant_id, created_at desc)
  where is_test_customer = false;

create or replace function public.audit_safe_metadata(input_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  result jsonb;
begin
  if input_value is null then
    return '{}'::jsonb;
  end if;

  if jsonb_typeof(input_value) = 'object' then
    select coalesce(jsonb_object_agg(
      entry.key,
      case
        when lower(entry.key) ~ '(phone|telephone|password|secret|authorization|auth_token|access_token|refresh_token|customer_token|referral_token|session_token|daily_pin|pin_code|pin_hash|code_hash|raw_code)'
          then to_jsonb('[ENTFERNT]'::text)
        else public.audit_safe_metadata(entry.value)
      end
    ), '{}'::jsonb)
    into result
    from jsonb_each(input_value) entry;
    return result;
  end if;

  if jsonb_typeof(input_value) = 'array' then
    select coalesce(jsonb_agg(public.audit_safe_metadata(item.value)), '[]'::jsonb)
    into result
    from jsonb_array_elements(input_value) item;
    return result;
  end if;

  if jsonb_typeof(input_value) = 'string' and length(input_value #>> '{}') > 500 then
    return to_jsonb(left(input_value #>> '{}', 500) || '…');
  end if;

  return input_value;
end;
$$;

create or replace function public.audit_event_type_for_action(input_action text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(input_action, ''))
    when 'public_customer_registered' then 'CUSTOMER_REGISTERED'
    when 'public_referral_registered' then 'CUSTOMER_REGISTERED'
    when 'welcome_starter_reward_assigned' then 'WELCOME_REWARD_CREATED'
    when 'birthday_gift_issued' then 'WELCOME_REWARD_CREATED'
    when 'daily_pin_failed' then 'DAILY_PIN_REJECTED'
    when 'daily_pin_locked' then 'AUTHORIZATION_DENIED'
    when 'public_bonus_points_collected' then 'POINTS_ADDED'
    when 'staff_loyalty_credit' then 'POINTS_ADDED'
    when 'staff_portal_first_points_collection' then 'POINTS_ADDED'
    when 'welcome_starter_reward_unlocked' then 'REWARD_UNLOCKED'
    when 'customer_redemption_started' then 'REDEMPTION_CODE_CREATED'
    when 'redemption_code_consumed' then 'REWARD_REDEEMED'
    when 'customer_point_redemption_used' then 'REWARD_REDEEMED'
    when 'customer_welcome_gift_redeemed' then 'REWARD_REDEEMED'
    when 'customer_reward_redeemed' then 'REWARD_REDEEMED'
    when 'public_referral_link_created' then 'REFERRAL_CREATED'
    when 'referral_bonus_boost_activated' then 'REFERRAL_ACTIVATED'
    when 'points_daily_limit_blocked' then 'POINTS_ADD_FAILED'
    when 'customer_reward_redemption_pin_failed' then 'REWARD_REDEMPTION_FAILED'
    else upper(regexp_replace(coalesce(input_action, 'API_ERROR'), '[^a-zA-Z0-9]+', '_', 'g'))
  end;
$$;

create or replace function public.normalize_audit_log_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_record public.customers%rowtype;
  metadata_customer_id uuid;
begin
  new.event_type := coalesce(nullif(new.event_type, ''), public.audit_event_type_for_action(new.action));
  new.status := case
    when new.status in ('success', 'failed', 'blocked') then new.status
    when lower(coalesce(new.action, '')) ~ '(failed|error)' then 'failed'
    when lower(coalesce(new.action, '')) ~ '(blocked|locked|denied)' then 'blocked'
    else 'success'
  end;
  if lower(coalesce(new.action, '')) ~ '(failed|error)' then new.status := 'failed'; end if;
  if lower(coalesce(new.action, '')) ~ '(blocked|locked|denied|daily_limit)' then new.status := 'blocked'; end if;

  new.source := coalesce(nullif(new.source, ''), nullif(new.metadata->>'source', ''),
    case new.actor_type when 'customer' then 'customer_portal' when 'staff' then 'staff_portal' when 'admin' then 'restaurant_portal' else 'system' end);
  new.entity_type := coalesce(nullif(new.entity_type, ''), new.target_table);
  new.entity_id := coalesce(new.entity_id, new.target_id);

  begin
    metadata_customer_id := nullif(new.metadata->>'customer_id', '')::uuid;
  exception when invalid_text_representation then
    metadata_customer_id := null;
  end;

  new.customer_id := coalesce(
    new.customer_id,
    metadata_customer_id,
    case when new.actor_type = 'customer' then new.actor_id else null end
  );

  if new.customer_id is not null then
    select * into customer_record from public.customers where id = new.customer_id;
    if customer_record.id is not null then
      new.is_test_event := customer_record.is_test_customer;
      new.test_session_id := customer_record.test_session_id;
    end if;
  end if;

  new.metadata := public.audit_safe_metadata(new.metadata);
  new.error_message := case
    when new.error_message is null then null
    else left(regexp_replace(new.error_message, '(Bearer|token|password|secret|pin|code)[^ ]*', '[ENTFERNT]', 'gi'), 500)
  end;
  return new;
end;
$$;

drop trigger if exists normalize_audit_log_row_trigger on public.audit_log;
create trigger normalize_audit_log_row_trigger
before insert or update on public.audit_log
for each row execute function public.normalize_audit_log_row();

create or replace function public.write_audit_event(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_actor_type text,
  input_actor_id uuid,
  input_event_type text,
  input_status text,
  input_source text,
  input_entity_type text,
  input_entity_id uuid,
  input_request_id uuid,
  input_metadata jsonb default '{}'::jsonb,
  input_error_code text default null,
  input_error_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  audit_id uuid;
begin
  select * into restaurant_record from public.restaurants where id = input_restaurant_id;
  if restaurant_record.id is null then return null; end if;

  insert into public.audit_log (
    restaurant_id, organization_id, branch_id, customer_id, actor_type, actor_id,
    action, event_type, status, source, target_table, target_id, entity_type,
    entity_id, request_id, metadata, error_code, error_message
  ) values (
    restaurant_record.id, restaurant_record.organization_id, restaurant_record.primary_branch_id,
    input_customer_id, input_actor_type, input_actor_id, lower(input_event_type), input_event_type,
    input_status, input_source, input_entity_type, input_entity_id, input_entity_type,
    input_entity_id, input_request_id, coalesce(input_metadata, '{}'::jsonb),
    input_error_code, input_error_message
  ) returning id into audit_id;
  return audit_id;
end;
$$;

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
  if tg_table_name = 'customers' and tg_op = 'INSERT' then
    perform public.write_audit_event(new.restaurant_id, new.id, 'customer', new.id,
      'CUSTOMER_REGISTERED', 'success', 'registration', 'customers', new.id, null,
      jsonb_build_object('registration_type', 'normal'));
    perform public.write_audit_event(new.restaurant_id, new.id, 'customer', new.id,
      'CUSTOMER_JOINED_RESTAURANT', 'success', 'registration', 'customers', new.id, null);
    return new;
  elsif tg_table_name = 'points_collection_requests' and tg_op = 'INSERT' then
    restaurant_id_value := new.restaurant_id; customer_id_value := new.customer_id;
    entity_id_value := new.id; request_id_value := new.idempotency_key;
    event_type_value := 'POINTS_COLLECTION_STARTED'; source_value := new.source;
    metadata_value := jsonb_build_object('source', new.source);
  elsif tg_table_name = 'points_transactions' and tg_op = 'INSERT' and new.type = 'earn' then
    restaurant_id_value := new.restaurant_id; customer_id_value := new.customer_id;
    entity_id_value := new.id; request_id_value := new.idempotency_key;
    perform public.write_audit_event(new.restaurant_id, new.customer_id, 'system', null,
      'DAILY_PIN_ACCEPTED', 'success', 'points_collection', 'points_transactions',
      new.id, new.idempotency_key, jsonb_build_object('confirmed_server_side', true));
    event_type_value := 'POINTS_ADDED'; metadata_value := jsonb_build_object('points', new.points, 'reason', new.reason);
  elsif tg_table_name = 'customer_rewards' and tg_op = 'INSERT' and new.gift_type in ('welcome', 'birthday') then
    restaurant_id_value := new.restaurant_id; customer_id_value := new.customer_id;
    entity_id_value := new.id; event_type_value := 'WELCOME_REWARD_CREATED';
    metadata_value := jsonb_build_object('gift_type', new.gift_type, 'reward_id', new.reward_id);
  elsif tg_table_name = 'customer_rewards' and tg_op = 'UPDATE'
    and old.status = 'locked' and new.status = 'active' then
    restaurant_id_value := new.restaurant_id; customer_id_value := new.customer_id;
    entity_id_value := new.id; event_type_value := 'REWARD_UNLOCKED';
    metadata_value := jsonb_build_object('gift_type', new.gift_type, 'reward_id', new.reward_id);
  elsif tg_table_name = 'redemption_codes' and tg_op = 'INSERT' then
    restaurant_id_value := new.restaurant_id; customer_id_value := new.customer_id;
    entity_id_value := new.id; request_id_value := new.idempotency_key;
    event_type_value := 'REDEMPTION_CODE_CREATED';
    metadata_value := jsonb_build_object('redemption_type', new.redemption_type, 'reward_id', new.reward_id, 'expires_at', new.expires_at);
  elsif tg_table_name = 'redemption_codes' and tg_op = 'UPDATE'
    and old.status is distinct from 'redeemed' and new.status = 'redeemed' then
    restaurant_id_value := new.restaurant_id; customer_id_value := new.customer_id;
    entity_id_value := new.id; request_id_value := new.idempotency_key;
    event_type_value := 'REWARD_REDEEMED'; metadata_value := jsonb_build_object('redemption_type', new.redemption_type, 'reward_id', new.reward_id);
  elsif tg_table_name = 'coupon_redemptions' and tg_op = 'INSERT' then
    restaurant_id_value := new.restaurant_id; customer_id_value := new.customer_id;
    entity_id_value := new.id; event_type_value := 'COUPON_REDEEMED'; metadata_value := jsonb_build_object('coupon_id', new.coupon_id);
  elsif tg_table_name = 'referrals' and tg_op = 'INSERT' then
    restaurant_id_value := new.restaurant_id; customer_id_value := new.referrer_customer_id;
    entity_id_value := new.id; event_type_value := 'REFERRAL_CREATED';
  elsif tg_table_name = 'referrals' and tg_op = 'UPDATE'
    and old.status is distinct from 'activated' and new.status = 'activated' then
    restaurant_id_value := new.restaurant_id; customer_id_value := new.referred_customer_id;
    entity_id_value := new.id; event_type_value := 'REFERRAL_ACTIVATED';
  else
    return new;
  end if;

  perform public.write_audit_event(restaurant_id_value, customer_id_value, 'system', null,
    event_type_value, 'success', source_value, entity_type_value,
    entity_id_value, request_id_value, metadata_value);
  return new;
end;
$$;

drop trigger if exists audit_customers_core_event on public.customers;
create trigger audit_customers_core_event after insert on public.customers
for each row execute function public.audit_core_table_changes();

drop trigger if exists audit_points_requests_core_event on public.points_collection_requests;
create trigger audit_points_requests_core_event after insert on public.points_collection_requests
for each row execute function public.audit_core_table_changes();

drop trigger if exists audit_points_transactions_core_event on public.points_transactions;
create trigger audit_points_transactions_core_event after insert on public.points_transactions
for each row execute function public.audit_core_table_changes();

drop trigger if exists audit_customer_rewards_core_event on public.customer_rewards;
create trigger audit_customer_rewards_core_event after insert or update on public.customer_rewards
for each row execute function public.audit_core_table_changes();

drop trigger if exists audit_redemption_codes_core_event on public.redemption_codes;
create trigger audit_redemption_codes_core_event after insert or update on public.redemption_codes
for each row execute function public.audit_core_table_changes();

drop trigger if exists audit_coupon_redemptions_core_event on public.coupon_redemptions;
create trigger audit_coupon_redemptions_core_event after insert on public.coupon_redemptions
for each row execute function public.audit_core_table_changes();

drop trigger if exists audit_referrals_core_event on public.referrals;
create trigger audit_referrals_core_event after insert or update on public.referrals
for each row execute function public.audit_core_table_changes();

drop policy if exists "audit log member select" on public.audit_log;
drop policy if exists "audit log admin insert" on public.audit_log;
drop policy if exists "audit log restaurant admin select" on public.audit_log;

create policy "audit log restaurant admin select"
on public.audit_log for select to authenticated
using (public.is_restaurant_admin(restaurant_id));

create or replace function public.set_platform_customer_test_mode(
  input_customer_id uuid,
  input_is_test_customer boolean,
  input_test_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  platform_role_value text := public.current_platform_role();
  customer_record public.customers%rowtype;
begin
  if platform_role_value not in ('platform_owner', 'platform_admin', 'app_admin', 'super_admin', 'wuxuai_admin', 'security_admin') then
    raise exception 'Nicht berechtigt.';
  end if;
  if input_is_test_customer and nullif(trim(coalesce(input_test_session_id, '')), '') is null then
    raise exception 'Test-Sitzungs-ID fehlt.';
  end if;

  update public.customers
  set is_test_customer = input_is_test_customer,
      test_session_id = case when input_is_test_customer then trim(input_test_session_id) else null end
  where id = input_customer_id
  returning * into customer_record;
  if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;

  perform public.write_audit_event(customer_record.restaurant_id, customer_record.id,
    'admin', auth.uid(), 'TEST_CUSTOMER_STATUS_CHANGED', 'success', 'platform_admin',
    'customers', customer_record.id, null,
    jsonb_build_object('is_test_customer', customer_record.is_test_customer,
      'test_session_id', customer_record.test_session_id, 'platform_role', platform_role_value));

  return jsonb_build_object('customer_id', customer_record.id,
    'is_test_customer', customer_record.is_test_customer,
    'test_session_id', customer_record.test_session_id);
end;
$$;

create or replace function public.get_platform_audit_events(
  input_from timestamptz default null,
  input_to timestamptz default null,
  input_restaurant_id uuid default null,
  input_customer_id uuid default null,
  input_event_type text default null,
  input_status text default null,
  input_source text default null,
  input_actor_type text default null,
  input_test_only boolean default false,
  input_failed_only boolean default false,
  input_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  platform_role_value text := public.current_platform_role();
  result jsonb;
begin
  if platform_role_value not in ('platform_owner', 'platform_admin', 'app_admin', 'super_admin', 'wuxuai_admin', 'support', 'security_admin', 'viewer') then
    raise exception 'Nicht berechtigt.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(events) order by events.created_at desc), '[]'::jsonb)
  into result
  from (
    select a.id, a.created_at, a.restaurant_id, r.name as restaurant_name,
      a.customer_id, a.actor_type, a.actor_id, a.event_type, a.status, a.source,
      a.entity_type, a.entity_id, a.request_id, a.is_test_event,
      a.test_session_id, a.metadata, a.error_code, a.error_message
    from public.audit_log a
    join public.restaurants r on r.id = a.restaurant_id
    where (input_from is null or a.created_at >= input_from)
      and (input_to is null or a.created_at < input_to)
      and (input_restaurant_id is null or a.restaurant_id = input_restaurant_id)
      and (input_customer_id is null or a.customer_id = input_customer_id)
      and (input_event_type is null or a.event_type = input_event_type)
      and (input_status is null or a.status = input_status)
      and (input_source is null or a.source = input_source)
      and (input_actor_type is null or a.actor_type = input_actor_type)
      and (not input_test_only or a.is_test_event)
      and (not input_failed_only or a.status in ('failed', 'blocked'))
    order by a.created_at desc
    limit least(greatest(coalesce(input_limit, 100), 1), 500)
  ) events;
  return result;
end;
$$;

create or replace function public.get_bonus_boost_kpis(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  boosted_guests integer := 0;
  returned_guests integer := 0;
  today_start timestamptz := (timezone('Europe/Vienna', now())::date::timestamp at time zone 'Europe/Vienna');
begin
  if not public.is_restaurant_member(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;

  select count(distinct cb.customer_id) into boosted_guests
  from public.customer_bonus_boosts cb
  join public.customers c on c.id = cb.customer_id and c.restaurant_id = cb.restaurant_id
  where cb.restaurant_id = input_restaurant_id and cb.status = 'active'
    and cb.active_from <= now() and cb.active_until > now() and not c.is_test_customer;

  select count(distinct a.customer_id) into returned_guests
  from public.audit_log a
  join public.customers c on c.id = a.customer_id and c.restaurant_id = a.restaurant_id
  where a.restaurant_id = input_restaurant_id and a.event_type = 'POINTS_ADDED'
    and a.created_at >= today_start and not c.is_test_customer
    and nullif(a.metadata->>'boost_id', '') is not null
    and coalesce((a.metadata->>'multiplier')::numeric, 1) > 1;

  return jsonb_build_object('guests_currently_boosted', boosted_guests,
    'guests_returned_because_of_boost', returned_guests);
end;
$$;

revoke execute on function public.audit_safe_metadata(jsonb) from public, anon, authenticated;
revoke execute on function public.audit_event_type_for_action(text) from public, anon, authenticated;
revoke execute on function public.write_audit_event(uuid, uuid, text, uuid, text, text, text, text, uuid, uuid, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.set_platform_customer_test_mode(uuid, boolean, text) from public, anon;
revoke execute on function public.get_platform_audit_events(timestamptz, timestamptz, uuid, uuid, text, text, text, text, boolean, boolean, integer) from public, anon;
revoke execute on function public.get_bonus_boost_kpis(uuid) from public, anon;

grant execute on function public.set_platform_customer_test_mode(uuid, boolean, text) to authenticated;
grant execute on function public.get_platform_audit_events(timestamptz, timestamptz, uuid, uuid, text, text, text, text, boolean, boolean, integer) to authenticated;
grant execute on function public.get_bonus_boost_kpis(uuid) to authenticated;

notify pgrst, 'reload schema';
