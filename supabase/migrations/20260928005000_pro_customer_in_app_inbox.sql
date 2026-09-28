-- PRO customer in-app inbox. Real-customer visibility remains fail-closed
-- until the advertising/consent and retention contracts are approved.

create table if not exists public.customer_pro_in_app_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  event_type text not null check (event_type in ('OFFER_PUBLISHED', 'POINT_REWARD_AVAILABLE')),
  event_key text not null check (length(event_key) between 3 and 240),
  source_entity_id uuid not null,
  offer_id uuid references public.restaurant_offers(id) on delete set null,
  reward_id uuid references public.rewards(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  read_at timestamptz,
  constraint customer_pro_in_app_notification_source_check check (
    (event_type = 'OFFER_PUBLISHED' and reward_id is null
      and (offer_id is null or source_entity_id = offer_id))
    or (event_type = 'POINT_REWARD_AVAILABLE' and offer_id is null
      and (reward_id is null or source_entity_id = reward_id))
  ),
  unique (restaurant_id, customer_id, event_type, event_key)
);

create index if not exists customer_pro_in_app_notifications_customer_idx
  on public.customer_pro_in_app_notifications (restaurant_id, customer_id, created_at desc, id desc);
create index if not exists customer_pro_in_app_notifications_unread_idx
  on public.customer_pro_in_app_notifications (restaurant_id, customer_id, created_at desc)
  where read_at is null;

alter table public.customer_pro_in_app_notifications enable row level security;
revoke all on table public.customer_pro_in_app_notifications from public, anon, authenticated;

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
from public, anon, authenticated;

create or replace function public.enqueue_customer_pro_in_app_notification_internal(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_event_type text,
  input_event_key text,
  input_offer_id uuid default null,
  input_reward_id uuid default null,
  input_created_at timestamptz default statement_timestamp()
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  entitlement_key text;
begin
  entitlement_key := case input_event_type
    when 'OFFER_PUBLISHED' then 'offer_notifications'
    when 'POINT_REWARD_AVAILABLE' then 'reward_notifications'
    else null
  end;

  if entitlement_key is null
    or not public.pro_in_app_test_scope_allowed_internal(input_restaurant_id, input_customer_id)
    or not public.restaurant_entitlement_enabled(input_restaurant_id, entitlement_key)
  then
    return false;
  end if;

  insert into public.customer_pro_in_app_notifications (
    restaurant_id, customer_id, event_type, event_key, source_entity_id,
    offer_id, reward_id, created_at
  ) values (
    input_restaurant_id, input_customer_id, input_event_type, input_event_key,
    coalesce(input_offer_id, input_reward_id), input_offer_id, input_reward_id,
    coalesce(input_created_at, statement_timestamp())
  )
  on conflict (restaurant_id, customer_id, event_type, event_key) do nothing;

  return found;
exception when others then
  -- Notification infrastructure must never roll back the source business event.
  return false;
end;
$function$;

revoke execute on function public.enqueue_customer_pro_in_app_notification_internal(
  uuid, uuid, text, text, uuid, uuid, timestamptz
) from public, anon, authenticated;

create or replace function public.enqueue_offer_pro_in_app_notifications_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  recipient record;
begin
  if new.status = 'PUBLISHED' and new.is_active is true
    and (
      old.status is distinct from 'PUBLISHED'
      or old.is_active is distinct from true
      or new.publication_version is distinct from old.publication_version
    )
    and public.restaurant_entitlement_enabled(new.restaurant_id, 'offer_notifications')
  then
    for recipient in
      select customer.id
      from public.customers customer
      where customer.restaurant_id = new.restaurant_id
        and customer.membership_status = 'active'
        and customer.is_test_customer is true
    loop
      perform public.enqueue_customer_pro_in_app_notification_internal(
        new.restaurant_id,
        recipient.id,
        'OFFER_PUBLISHED',
        new.id::text || ':' || new.publication_version::text,
        new.id,
        null,
        coalesce(new.published_at, statement_timestamp())
      );
    end loop;
  end if;
  return new;
exception when others then
  return new;
end;
$function$;

drop trigger if exists enqueue_offer_pro_in_app_notifications
  on public.restaurant_offers;
create trigger enqueue_offer_pro_in_app_notifications
after update of status, is_active, publication_version
on public.restaurant_offers
for each row execute function public.enqueue_offer_pro_in_app_notifications_trigger();

revoke execute on function public.enqueue_offer_pro_in_app_notifications_trigger()
from public, anon, authenticated;

create or replace function public.enqueue_reward_pro_in_app_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  reward_state record;
begin
  if new.type <> 'earn' or new.points <= 0
    or new.collection_source not in ('customer_initiated', 'restaurant_controlled')
  then
    return new;
  end if;

  for reward_state in
    select state.reward_id
    from public.customer_reward_notification_state state
    where state.restaurant_id = new.restaurant_id
      and state.customer_id = new.customer_id
      and state.above_threshold is true
      and state.last_crossed_at = new.created_at
  loop
    perform public.enqueue_customer_pro_in_app_notification_internal(
      new.restaurant_id,
      new.customer_id,
      'POINT_REWARD_AVAILABLE',
      reward_state.reward_id::text,
      null,
      reward_state.reward_id,
      new.created_at
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$function$;

drop trigger if exists zz_enqueue_reward_pro_in_app_notification
  on public.points_transactions;
create trigger zz_enqueue_reward_pro_in_app_notification
after insert on public.points_transactions
for each row execute function public.enqueue_reward_pro_in_app_notification_trigger();

revoke execute on function public.enqueue_reward_pro_in_app_notification_trigger()
from public, anon, authenticated;

create or replace function public.require_customer_pro_in_app_identity_internal(
  input_restaurant_slug text,
  input_customer_token text
)
returns table (restaurant_id uuid, customer_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  restaurant_record public.restaurants%rowtype;
  customer_id_value uuid;
begin
  if nullif(trim(coalesce(input_restaurant_slug, '')), '') is null
    or nullif(trim(coalesce(input_customer_token, '')), '') is null
  then
    raise exception using errcode = '42501', message = 'PRO_IN_APP_CUSTOMER_ACCESS_DENIED';
  end if;

  select * into restaurant_record
  from public.restaurants
  where slug = lower(trim(input_restaurant_slug));
  if restaurant_record.id is null then
    raise exception using errcode = '42501', message = 'PRO_IN_APP_CUSTOMER_ACCESS_DENIED';
  end if;

  customer_id_value := public.resolve_customer_from_public_token(
    restaurant_record.id,
    input_customer_token
  );
  if customer_id_value is null then
    raise exception using errcode = '42501', message = 'PRO_IN_APP_CUSTOMER_ACCESS_DENIED';
  end if;

  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'PRO_IN_APP_AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.customers customer
    left join public.customer_account_memberships membership
      on membership.customer_id = customer.id
     and membership.restaurant_id = customer.restaurant_id
    left join public.customer_accounts account on account.id = membership.account_id
    where customer.id = customer_id_value
      and customer.restaurant_id = restaurant_record.id
      and (customer.auth_user_id = auth.uid() or account.auth_user_id = auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'PRO_IN_APP_CUSTOMER_ROLE_DENIED';
  end if;

  return query select restaurant_record.id, customer_id_value;
end;
$function$;

revoke execute on function public.require_customer_pro_in_app_identity_internal(text, text)
from public, anon, authenticated;

create or replace function public.get_customer_pro_in_app_inbox(
  input_restaurant_slug text,
  input_customer_token text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  identity_record record;
  offer_enabled boolean;
  reward_enabled boolean;
  scope_allowed boolean;
  result jsonb;
begin
  select * into identity_record
  from public.require_customer_pro_in_app_identity_internal(
    input_restaurant_slug,
    input_customer_token
  );

  scope_allowed := public.pro_in_app_test_scope_allowed_internal(
    identity_record.restaurant_id,
    identity_record.customer_id
  );
  offer_enabled := scope_allowed and public.restaurant_entitlement_enabled(
    identity_record.restaurant_id, 'offer_notifications'
  );
  reward_enabled := scope_allowed and public.restaurant_entitlement_enabled(
    identity_record.restaurant_id, 'reward_notifications'
  );

  with visible as materialized (
    select notification.id,
      notification.event_type,
      notification.created_at,
      notification.read_at,
      case notification.event_type
        when 'OFFER_PUBLISHED' then coalesce(offer.title, 'Neues Angebot')
        when 'POINT_REWARD_AVAILABLE' then coalesce(reward.title, 'Belohnung erreicht')
      end as title
    from public.customer_pro_in_app_notifications notification
    left join public.restaurant_offers offer
      on offer.id = notification.offer_id
     and offer.restaurant_id = notification.restaurant_id
    left join public.rewards reward
      on reward.id = notification.reward_id
     and reward.restaurant_id = notification.restaurant_id
    where notification.restaurant_id = identity_record.restaurant_id
      and notification.customer_id = identity_record.customer_id
      and (
        (notification.event_type = 'OFFER_PUBLISHED' and offer_enabled)
        or (notification.event_type = 'POINT_REWARD_AVAILABLE' and reward_enabled)
      )
    order by notification.created_at desc, notification.id desc
    limit 50
  )
  select jsonb_build_object(
    'available', scope_allowed and (offer_enabled or reward_enabled),
    'legal_mode', 'SYNTHETIC_TEST_ONLY_ONLY',
    'unread_count', count(*) filter (where read_at is null),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'event_type', event_type,
      'title', title,
      'created_at', created_at,
      'read_at', read_at
    ) order by created_at desc, id desc), '[]'::jsonb)
  ) into result
  from visible;

  return result;
end;
$function$;

revoke execute on function public.get_customer_pro_in_app_inbox(text, text) from public;
grant execute on function public.get_customer_pro_in_app_inbox(text, text) to anon, authenticated;

create or replace function public.mark_customer_pro_in_app_notification_read(
  input_restaurant_slug text,
  input_customer_token text,
  input_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  identity_record record;
  notification_record public.customer_pro_in_app_notifications%rowtype;
  entitlement_key text;
begin
  select * into identity_record
  from public.require_customer_pro_in_app_identity_internal(
    input_restaurant_slug,
    input_customer_token
  );

  select * into notification_record
  from public.customer_pro_in_app_notifications notification
  where notification.id = input_notification_id
    and notification.restaurant_id = identity_record.restaurant_id
    and notification.customer_id = identity_record.customer_id
  for update;
  if notification_record.id is null then
    raise exception using errcode = 'P0002', message = 'PRO_IN_APP_NOTIFICATION_NOT_FOUND';
  end if;

  entitlement_key := case notification_record.event_type
    when 'OFFER_PUBLISHED' then 'offer_notifications'
    when 'POINT_REWARD_AVAILABLE' then 'reward_notifications'
    else null
  end;
  if entitlement_key is null
    or not public.pro_in_app_test_scope_allowed_internal(
      identity_record.restaurant_id, identity_record.customer_id
    )
    or not public.restaurant_entitlement_enabled(identity_record.restaurant_id, entitlement_key)
  then
    raise exception using errcode = '42501', message = 'PRO_IN_APP_ENTITLEMENT_INACTIVE';
  end if;

  update public.customer_pro_in_app_notifications
  set read_at = coalesce(read_at, statement_timestamp())
  where id = notification_record.id;

  return public.get_customer_pro_in_app_inbox(input_restaurant_slug, input_customer_token);
end;
$function$;

revoke execute on function public.mark_customer_pro_in_app_notification_read(text, text, uuid)
from public;
grant execute on function public.mark_customer_pro_in_app_notification_read(text, text, uuid)
to anon, authenticated;

notify pgrst, 'reload schema';
