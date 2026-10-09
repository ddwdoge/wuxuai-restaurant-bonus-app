-- Keep the append-only offer event as history, but never present a withdrawn,
-- expired or deleted source as an active Customer Inbox offer.
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
        when 'OFFER_PUBLISHED' then offer.title
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
        (notification.event_type = 'OFFER_PUBLISHED'
          and offer_enabled
          and offer.status = 'PUBLISHED'
          and offer.is_active is true
          and offer.valid_to > statement_timestamp())
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

  if notification_record.event_type = 'OFFER_PUBLISHED'
    and not exists (
      select 1
      from public.restaurant_offers offer
      where offer.id = notification_record.offer_id
        and offer.restaurant_id = identity_record.restaurant_id
        and offer.status = 'PUBLISHED'
        and offer.is_active is true
        and offer.valid_to > statement_timestamp()
    )
  then
    raise exception using errcode = '42501', message = 'PRO_IN_APP_OFFER_INACTIVE';
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
