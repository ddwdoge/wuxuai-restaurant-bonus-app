-- WUXUAI Bonus PRO preparation: tenant-bound plans and entitlements.
-- Stripe state and unavailable Premium modules remain untouched.

create table if not exists public.commercial_plan_catalog (
  plan_key text primary key check (plan_key in ('BASIC', 'PRO', 'PREMIUM')),
  monthly_price_eur_ex_vat integer not null check (monthly_price_eur_ex_vat > 0),
  publicly_available boolean not null default false,
  offer_limit integer check (offer_limit between 1 and 7),
  offer_notifications boolean not null default false,
  reward_notifications boolean not null default false,
  gift_cards boolean not null default false,
  pos_integration boolean not null default false,
  stripe_price_lookup_key text,
  updated_at timestamptz not null default now(),
  constraint commercial_plan_unbuilt_features_disabled
    check (gift_cards = false and pos_integration = false)
);

insert into public.commercial_plan_catalog (
  plan_key, monthly_price_eur_ex_vat, publicly_available, offer_limit,
  offer_notifications, reward_notifications, gift_cards, pos_integration,
  stripe_price_lookup_key
) values
  ('BASIC', 59, true, 5, false, false, false, false, 'wuxuai_bonus_basic_monthly'),
  ('PRO', 99, false, null, true, true, false, false, 'wuxuai_bonus_pro_monthly'),
  ('PREMIUM', 199, false, null, true, true, false, false, null)
on conflict (plan_key) do update set
  monthly_price_eur_ex_vat = excluded.monthly_price_eur_ex_vat,
  publicly_available = excluded.publicly_available,
  offer_limit = excluded.offer_limit,
  offer_notifications = excluded.offer_notifications,
  reward_notifications = excluded.reward_notifications,
  gift_cards = false,
  pos_integration = false,
  stripe_price_lookup_key = excluded.stripe_price_lookup_key,
  updated_at = now();

alter table public.commercial_plan_catalog enable row level security;
revoke all on table public.commercial_plan_catalog from public, anon, authenticated;

update public.branch_subscriptions
set plan_key = 'BASIC'
where upper(coalesce(plan_key, '')) not in ('BASIC', 'PRO', 'PREMIUM');

update public.branch_subscriptions
set plan_key = upper(plan_key)
where plan_key is distinct from upper(plan_key);

alter table public.branch_subscriptions alter column plan_key set default 'BASIC';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'branch_subscriptions_plan_key_fkey'
      and conrelid = 'public.branch_subscriptions'::regclass
  ) then
    alter table public.branch_subscriptions
      add constraint branch_subscriptions_plan_key_fkey
      foreign key (plan_key) references public.commercial_plan_catalog(plan_key);
  end if;
end $$;

create table if not exists public.branch_entitlement_overrides (
  subscription_id uuid primary key references public.branch_subscriptions(id) on delete cascade,
  offer_limit integer check (offer_limit between 1 and 7),
  offer_limit_unlimited boolean,
  offer_notifications boolean,
  reward_notifications boolean,
  gift_cards boolean,
  pos_integration boolean,
  reason text not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint branch_entitlement_offer_limit_shape check (
    (offer_limit_unlimited is null and offer_limit is null)
    or (offer_limit_unlimited = true and offer_limit is null)
    or (offer_limit_unlimited = false and offer_limit between 1 and 7)
  ),
  constraint branch_entitlement_unbuilt_features_disabled check (
    coalesce(gift_cards, false) = false and coalesce(pos_integration, false) = false
  )
);

alter table public.branch_entitlement_overrides enable row level security;
revoke all on table public.branch_entitlement_overrides from public, anon, authenticated;

create or replace function public.resolve_restaurant_entitlements_internal(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare
  subscription_record public.branch_subscriptions%rowtype;
  plan_record public.commercial_plan_catalog%rowtype;
  override_record public.branch_entitlement_overrides%rowtype;
  effective_offer_limit integer;
  effective_offer_unlimited boolean;
begin
  select subscription.* into subscription_record
  from public.restaurants restaurant
  left join public.branches branch on branch.restaurant_id = restaurant.id
  left join public.branch_subscriptions subscription
    on subscription.branch_id = coalesce(restaurant.primary_branch_id, branch.id)
  where restaurant.id = input_restaurant_id
  order by branch.created_at asc nulls last
  limit 1;

  if subscription_record.id is null then
    select * into plan_record from public.commercial_plan_catalog where plan_key = 'BASIC';
  else
    select * into plan_record from public.commercial_plan_catalog where plan_key = subscription_record.plan_key;
    select * into override_record from public.branch_entitlement_overrides where subscription_id = subscription_record.id;
  end if;

  if override_record.offer_limit_unlimited is true then
    effective_offer_limit := null;
    effective_offer_unlimited := true;
  elsif override_record.offer_limit_unlimited is false then
    effective_offer_limit := override_record.offer_limit;
    effective_offer_unlimited := false;
  else
    effective_offer_limit := plan_record.offer_limit;
    effective_offer_unlimited := plan_record.offer_limit is null;
  end if;

  return jsonb_build_object(
    'plan_key', coalesce(plan_record.plan_key, 'BASIC'),
    'monthly_price_eur_ex_vat', coalesce(plan_record.monthly_price_eur_ex_vat, 59),
    'publicly_available', coalesce(plan_record.publicly_available, false),
    'commercial_default', jsonb_build_object(
      'offer_limit', plan_record.offer_limit,
      'offer_limit_unlimited', plan_record.offer_limit is null,
      'offer_notifications', coalesce(plan_record.offer_notifications, false),
      'reward_notifications', coalesce(plan_record.reward_notifications, false),
      'gift_cards', false,
      'pos_integration', false
    ),
    'override', case when override_record.subscription_id is null then null else jsonb_build_object(
      'offer_limit', override_record.offer_limit,
      'offer_limit_unlimited', override_record.offer_limit_unlimited,
      'offer_notifications', override_record.offer_notifications,
      'reward_notifications', override_record.reward_notifications,
      'gift_cards', false,
      'pos_integration', false,
      'reason', override_record.reason,
      'changed_by', override_record.changed_by,
      'changed_at', override_record.changed_at
    ) end,
    'effective', jsonb_build_object(
      'offer_limit', effective_offer_limit,
      'offer_limit_unlimited', effective_offer_unlimited,
      'offer_notifications', coalesce(override_record.offer_notifications, plan_record.offer_notifications, false),
      'reward_notifications', coalesce(override_record.reward_notifications, plan_record.reward_notifications, false),
      'gift_cards', false,
      'pos_integration', false
    ),
    'subscription_id', subscription_record.id,
    'stripe_mapping', jsonb_build_object(
      'lookup_key', plan_record.stripe_price_lookup_key,
      'configured', false
    )
  );
end;
$$;

revoke execute on function public.resolve_restaurant_entitlements_internal(uuid)
from public, anon, authenticated;

create or replace function public.get_restaurant_entitlements(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare result jsonb;
begin
  if auth.uid() is null or not (
    public.is_restaurant_admin(input_restaurant_id) or public.is_platform_admin()
  ) then raise exception 'Nicht berechtigt.' using errcode = '42501'; end if;
  if not exists (select 1 from public.restaurants where id = input_restaurant_id) then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;
  result := public.resolve_restaurant_entitlements_internal(input_restaurant_id);
  return result || jsonb_build_object(
    'restaurant_id', input_restaurant_id,
    'active_offer_count', (
      select count(*)::integer from public.restaurant_offers offer
      where offer.restaurant_id = input_restaurant_id
        and offer.status = 'PUBLISHED' and offer.is_active = true and offer.valid_to > now()
    )
  );
end;
$$;

revoke execute on function public.get_restaurant_entitlements(uuid) from public, anon;
grant execute on function public.get_restaurant_entitlements(uuid) to authenticated;

create or replace function public.restaurant_entitlement_enabled(input_restaurant_id uuid, input_entitlement text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case input_entitlement
    when 'offer_notifications' then coalesce((public.resolve_restaurant_entitlements_internal(input_restaurant_id)->'effective'->>'offer_notifications')::boolean, false)
    when 'reward_notifications' then coalesce((public.resolve_restaurant_entitlements_internal(input_restaurant_id)->'effective'->>'reward_notifications')::boolean, false)
    else false
  end;
$$;

revoke execute on function public.restaurant_entitlement_enabled(uuid, text)
from public, anon, authenticated;

create or replace function public.update_platform_restaurant_entitlements(
  input_restaurant_id uuid,
  input_action text,
  input_plan_key text default null,
  input_offer_limit integer default null,
  input_offer_limit_unlimited boolean default null,
  input_enabled boolean default null,
  input_reason text default null,
  input_confirmation text default null,
  input_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id_value uuid := auth.uid();
  role_value text := public.current_platform_role();
  restaurant_record public.restaurants%rowtype;
  subscription_record public.branch_subscriptions%rowtype;
  branch_id_value uuid;
  operation_id_value uuid;
  before_value jsonb;
  after_value jsonb;
  normalized_plan text := upper(trim(coalesce(input_plan_key, '')));
begin
  if actor_id_value is null or role_value not in ('platform_owner', 'platform_admin', 'billing_admin') then
    raise exception 'Nicht berechtigt.' using errcode = '42501';
  end if;
  if input_action not in (
    'PLAN_CHANGED', 'OFFER_LIMIT_OVERRIDE_CHANGED', 'OFFER_NOTIFICATIONS_CHANGED',
    'REWARD_NOTIFICATIONS_CHANGED', 'ENTITLEMENT_OVERRIDE_CLEARED'
  ) then raise exception 'Aktion ist nicht freigegeben.'; end if;
  if input_idempotency_key is null then raise exception 'Vorgangskennung fehlt.'; end if;
  if length(trim(coalesce(input_reason, ''))) < 10 then
    raise exception 'Eine nachvollziehbare Begründung mit mindestens 10 Zeichen ist erforderlich.';
  end if;
  if input_confirmation <> 'CONFIRMED' then raise exception 'Bestätigung fehlt.'; end if;

  select * into restaurant_record from public.restaurants where id = input_restaurant_id for update;
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  branch_id_value := coalesce(restaurant_record.primary_branch_id, public.ensure_restaurant_branch(input_restaurant_id));
  select * into subscription_record from public.branch_subscriptions where branch_id = branch_id_value for update;
  if subscription_record.id is null then raise exception 'Abo-Zuordnung wurde nicht gefunden.'; end if;

  select id into operation_id_value from public.platform_admin_operations
  where platform_admin_user_id = actor_id_value and action_type = input_action
    and tenant_id = input_restaurant_id and idempotency_key = input_idempotency_key;
  if operation_id_value is not null then
    return jsonb_build_object('success', true, 'idempotent', true, 'operation_id', operation_id_value,
      'entitlements', public.resolve_restaurant_entitlements_internal(input_restaurant_id));
  end if;

  before_value := public.resolve_restaurant_entitlements_internal(input_restaurant_id);
  if input_action = 'PLAN_CHANGED' then
    if normalized_plan not in ('BASIC', 'PRO', 'PREMIUM') then raise exception 'Paket ist ungültig.'; end if;
    update public.branch_subscriptions set plan_key = normalized_plan where id = subscription_record.id;
  elsif input_action = 'OFFER_LIMIT_OVERRIDE_CHANGED' then
    if input_offer_limit_unlimited is true then
      if input_offer_limit is not null then raise exception 'Unbegrenztes Limit darf keinen Zahlenwert enthalten.'; end if;
    elsif input_offer_limit_unlimited is false then
      if input_offer_limit not between 1 and 7 then raise exception 'Angebotslimit muss zwischen 1 und 7 liegen.'; end if;
    else raise exception 'Angebotslimit fehlt.'; end if;
    insert into public.branch_entitlement_overrides (
      subscription_id, offer_limit, offer_limit_unlimited, reason, changed_by, changed_at
    ) values (
      subscription_record.id, input_offer_limit, input_offer_limit_unlimited,
      trim(input_reason), actor_id_value, now()
    ) on conflict (subscription_id) do update set
      offer_limit = excluded.offer_limit, offer_limit_unlimited = excluded.offer_limit_unlimited,
      reason = excluded.reason, changed_by = excluded.changed_by, changed_at = excluded.changed_at;
  elsif input_action in ('OFFER_NOTIFICATIONS_CHANGED', 'REWARD_NOTIFICATIONS_CHANGED') then
    if input_enabled is null then raise exception 'Status fehlt.'; end if;
    insert into public.branch_entitlement_overrides (
      subscription_id, offer_notifications, reward_notifications, reason, changed_by, changed_at
    ) values (
      subscription_record.id,
      case when input_action = 'OFFER_NOTIFICATIONS_CHANGED' then input_enabled end,
      case when input_action = 'REWARD_NOTIFICATIONS_CHANGED' then input_enabled end,
      trim(input_reason), actor_id_value, now()
    ) on conflict (subscription_id) do update set
      offer_notifications = case when input_action = 'OFFER_NOTIFICATIONS_CHANGED' then input_enabled else public.branch_entitlement_overrides.offer_notifications end,
      reward_notifications = case when input_action = 'REWARD_NOTIFICATIONS_CHANGED' then input_enabled else public.branch_entitlement_overrides.reward_notifications end,
      reason = excluded.reason, changed_by = excluded.changed_by, changed_at = excluded.changed_at;
  else
    delete from public.branch_entitlement_overrides where subscription_id = subscription_record.id;
  end if;

  after_value := public.resolve_restaurant_entitlements_internal(input_restaurant_id);
  insert into public.platform_admin_operations (
    platform_admin_user_id, platform_admin_role, action_type, entity_type, entity_id,
    tenant_id, severity, reason, before_state, after_state, result, idempotency_key
  ) values (
    actor_id_value, role_value, input_action, 'branch_subscription', subscription_record.id,
    input_restaurant_id, 'SENSITIVE', trim(input_reason), before_value, after_value,
    'SUCCESS', input_idempotency_key
  ) returning id into operation_id_value;
  return jsonb_build_object('success', true, 'idempotent', false,
    'operation_id', operation_id_value, 'entitlements', after_value);
end;
$$;

revoke execute on function public.update_platform_restaurant_entitlements(uuid, text, text, integer, boolean, boolean, text, text, uuid)
from public, anon;
grant execute on function public.update_platform_restaurant_entitlements(uuid, text, text, integer, boolean, boolean, text, text, uuid)
to authenticated;

alter table public.restaurant_offers
  add column if not exists publication_version integer not null default 0 check (publication_version >= 0);
update public.restaurant_offers set publication_version = 1
where status = 'PUBLISHED' and publication_version = 0;

create or replace function public.validate_restaurant_offer_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare overlapping_count integer := 0;
declare effective_limit integer;
begin
  new.title := trim(new.title);
  new.short_description := trim(new.short_description);
  new.description := nullif(trim(coalesce(new.description, '')), '');
  new.image_url := nullif(trim(coalesce(new.image_url, '')), '');
  new.button_label := coalesce(nullif(trim(new.button_label), ''), 'Angebot ansehen');
  new.updated_at := now();
  if new.branch_id is not null and not exists (
    select 1 from public.branches branch where branch.id = new.branch_id and branch.restaurant_id = new.restaurant_id
  ) then raise exception using errcode = 'P0001', message = 'OFFER_BRANCH_INVALID'; end if;
  if new.offer_type = 'LUNCH_MENU' and (
    coalesce(cardinality(new.weekdays), 0) = 0 or new.time_from is null or new.time_to is null
  ) then raise exception using errcode = 'P0001', message = 'OFFER_LUNCH_WINDOW_REQUIRED'; end if;
  if new.status = 'PUBLISHED' and new.is_active and new.valid_to > now() then
    effective_limit := (public.resolve_restaurant_entitlements_internal(new.restaurant_id)->'effective'->>'offer_limit')::integer;
    if effective_limit is not null then
      perform pg_advisory_xact_lock(hashtextextended(new.restaurant_id::text, 0));
      select coalesce(max((select count(*)::integer from public.restaurant_offers existing
        where existing.restaurant_id = new.restaurant_id and existing.id <> new.id
          and existing.status = 'PUBLISHED' and existing.is_active = true
          and existing.valid_from <= points.checked_at and existing.valid_to > points.checked_at)), 0)
      into overlapping_count
      from (
        select new.valid_from as checked_at
        union
        select existing.valid_from from public.restaurant_offers existing
        where existing.restaurant_id = new.restaurant_id and existing.id <> new.id
          and existing.status = 'PUBLISHED' and existing.is_active = true
          and existing.valid_from < new.valid_to and existing.valid_to > new.valid_from
      ) points;
      if overlapping_count >= effective_limit then
        raise exception using errcode = 'P0001', message = 'OFFER_ACTIVE_LIMIT_REACHED:' || effective_limit::text;
      end if;
    end if;
  end if;
  return new;
end;
$$;

alter table public.customer_transactional_email_deliveries
  drop constraint if exists customer_transactional_email_deliveries_event_type_check;
alter table public.customer_transactional_email_deliveries
  add constraint customer_transactional_email_deliveries_event_type_check
  check (event_type in ('BIRTHDAY_GIFT_ASSIGNED', 'BIRTHDAY_GIFT_EXPIRY_REMINDER', 'POINT_REWARD_AVAILABLE', 'OFFER_PUBLISHED'));

create or replace function public.enqueue_customer_transactional_email(
  input_restaurant_id uuid, input_customer_id uuid, input_event_type text,
  input_event_key text, input_reward_id uuid default null,
  input_customer_reward_id uuid default null, input_payload jsonb default '{}'::jsonb,
  input_available_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare account_id_value uuid;
begin
  if input_event_type not in ('BIRTHDAY_GIFT_ASSIGNED', 'BIRTHDAY_GIFT_EXPIRY_REMINDER', 'POINT_REWARD_AVAILABLE', 'OFFER_PUBLISHED') then return false; end if;
  select membership.account_id into account_id_value
  from public.customer_account_memberships membership
  join public.customer_account_emails email on email.account_id = membership.account_id
  join public.customer_accounts account on account.id = membership.account_id
  where membership.restaurant_id = input_restaurant_id and membership.customer_id = input_customer_id
    and email.status = 'CONFIRMED' and account.disabled_at is null limit 1;
  if account_id_value is null then return false; end if;
  insert into public.customer_transactional_email_deliveries (
    account_id, restaurant_id, customer_id, reward_id, customer_reward_id,
    event_type, event_key, payload, available_at
  ) values (
    account_id_value, input_restaurant_id, input_customer_id, input_reward_id,
    input_customer_reward_id, input_event_type, input_event_key,
    coalesce(input_payload, '{}'::jsonb), input_available_at
  ) on conflict (event_type, event_key) do nothing;
  return found;
exception when others then return false;
end;
$$;
revoke execute on function public.enqueue_customer_transactional_email(uuid, uuid, text, text, uuid, uuid, jsonb, timestamptz)
from public, anon, authenticated;

create or replace function public.change_restaurant_offer_status(
  input_restaurant_id uuid, input_offer_id uuid, input_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  offer_record public.restaurant_offers%rowtype;
  event_type_value text;
  was_published_active boolean := false;
  recipient_record record;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'OFFER_ACCESS_DENIED';
  end if;
  if input_action = 'PUBLISH' then
    select * into offer_record from public.restaurant_offers
    where id = input_offer_id and restaurant_id = input_restaurant_id for update;
    if offer_record.id is null then raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND'; end if;
    if offer_record.valid_to <= now() then raise exception using errcode = 'P0001', message = 'OFFER_PERIOD_EXPIRED'; end if;
    was_published_active := offer_record.status = 'PUBLISHED' and offer_record.is_active;
    update public.restaurant_offers set
      status = 'PUBLISHED', is_active = true,
      published_at = case when was_published_active then published_at else now() end,
      published_by = auth.uid(), archived_at = null,
      publication_version = case when was_published_active then publication_version else publication_version + 1 end
    where id = input_offer_id and restaurant_id = input_restaurant_id returning * into offer_record;
    event_type_value := 'OFFER_PUBLISHED';
    if not was_published_active and public.restaurant_entitlement_enabled(input_restaurant_id, 'offer_notifications') then
      for recipient_record in
        select distinct consent.customer_id from public.customer_offer_email_consents consent
        join public.customers customer on customer.id = consent.customer_id and customer.restaurant_id = consent.restaurant_id
        where consent.restaurant_id = input_restaurant_id and consent.status = 'ACTIVE'
          and consent.email_confirmed_at is not null and customer.membership_status = 'active'
      loop
        perform public.enqueue_customer_transactional_email(
          input_restaurant_id, recipient_record.customer_id, 'OFFER_PUBLISHED',
          offer_record.id::text || ':' || offer_record.publication_version::text || ':' || recipient_record.customer_id::text,
          null, null, jsonb_build_object('offer_title', offer_record.title), now()
        );
      end loop;
    end if;
  elsif input_action = 'DISABLE' then
    update public.restaurant_offers set status = 'DISABLED', is_active = false
    where id = input_offer_id and restaurant_id = input_restaurant_id returning * into offer_record;
    event_type_value := 'OFFER_DISABLED';
  elsif input_action = 'ARCHIVE' then
    update public.restaurant_offers set status = 'ARCHIVED', is_active = false, archived_at = now()
    where id = input_offer_id and restaurant_id = input_restaurant_id returning * into offer_record;
    event_type_value := 'OFFER_ARCHIVED';
  else raise exception using errcode = '22023', message = 'OFFER_ACTION_INVALID'; end if;
  if offer_record.id is null then raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND'; end if;
  perform public.write_audit_event(
    input_restaurant_id, null, 'admin', auth.uid(), event_type_value,
    'success', 'owner_portal', 'restaurant_offer', offer_record.id, null,
    jsonb_build_object('offer_type', offer_record.offer_type, 'status', offer_record.status, 'publication_version', offer_record.publication_version)
  );
  return to_jsonb(offer_record);
end;
$$;

create or replace function public.sync_point_reward_notification_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare current_balance integer;
declare previous_balance integer;
declare reward_record record;
declare was_above boolean;
begin
  select points_balance into current_balance from public.customers where id = new.customer_id and restaurant_id = new.restaurant_id;
  if current_balance is null then return new; end if;
  if new.type = 'earn' and new.points > 0 and new.collection_source in ('customer_initiated', 'restaurant_controlled') then
    current_balance := current_balance + new.points;
  end if;
  previous_balance := current_balance - new.points;
  for reward_record in
    select id, title, required_points from public.rewards
    where restaurant_id = new.restaurant_id and active = true and not is_starter_reward
      and required_points > 0 and (expires_at is null or expires_at > new.created_at)
  loop
    select above_threshold into was_above from public.customer_reward_notification_state
    where restaurant_id = new.restaurant_id and customer_id = new.customer_id and reward_id = reward_record.id;
    was_above := coalesce(was_above, previous_balance >= reward_record.required_points);
    insert into public.customer_reward_notification_state (
      restaurant_id, customer_id, reward_id, above_threshold, last_crossed_at, updated_at
    ) values (
      new.restaurant_id, new.customer_id, reward_record.id, current_balance >= reward_record.required_points,
      case when not was_above and current_balance >= reward_record.required_points then new.created_at end, now()
    ) on conflict (restaurant_id, customer_id, reward_id) do update set
      above_threshold = excluded.above_threshold,
      last_crossed_at = case when not public.customer_reward_notification_state.above_threshold and excluded.above_threshold
        then excluded.last_crossed_at else public.customer_reward_notification_state.last_crossed_at end,
      updated_at = now();
    if not was_above and current_balance >= reward_record.required_points
      and public.restaurant_entitlement_enabled(new.restaurant_id, 'reward_notifications') then
      perform public.enqueue_customer_transactional_email(
        new.restaurant_id, new.customer_id, 'POINT_REWARD_AVAILABLE',
        new.id::text || ':' || reward_record.id::text, reward_record.id, null,
        jsonb_build_object('reward_name', reward_record.title, 'required_points', reward_record.required_points), new.created_at
      );
    end if;
  end loop;
  return new;
exception when others then return new;
end;
$$;
revoke execute on function public.sync_point_reward_notification_state() from public, anon, authenticated;

notify pgrst, 'reload schema';
