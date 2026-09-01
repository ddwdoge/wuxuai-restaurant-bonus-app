alter table public.rewards
  add column if not exists product_price numeric(10, 2),
  add column if not exists welcome_gift_mode text not null default 'value_limit',
  add column if not exists fixed_product_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rewards_welcome_gift_mode_allowed'
      and conrelid = 'public.rewards'::regclass
  ) then
    alter table public.rewards
      add constraint rewards_welcome_gift_mode_allowed
      check (welcome_gift_mode in ('value_limit', 'fixed_product'));
  end if;
end $$;

update public.rewards
set product_price = case
    when category ilike '%getränk%' then 4
    when category ilike '%kaffee%' then 4
    when category ilike '%dessert%' then 6
    when category ilike '%vorspeise%' then 8
    when category ilike '%hauptspeise%' then 20
    when category ilike '%menü%' then 16
    else product_price
  end
where is_starter_reward = true
  and product_price is null;

create or replace function public.assign_welcome_starter_reward(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_campaign_id uuid default null,
  input_source text default 'restaurant_qr'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  existing_reward public.rewards%rowtype;
  selected_reward public.rewards%rowtype;
  assignment_id uuid;
  issued_value boolean := false;
begin
  if input_restaurant_id is null or input_customer_id is null then
    raise exception 'restaurant_id and customer_id are required';
  end if;

  select r.*
  into existing_reward
  from public.customer_rewards cr
  join public.rewards r on r.id = cr.reward_id
  where cr.restaurant_id = input_restaurant_id
    and cr.customer_id = input_customer_id
    and cr.is_starter_reward = true
    and r.restaurant_id = input_restaurant_id
  order by cr.created_at asc
  limit 1;

  if existing_reward.id is not null then
    return jsonb_build_object(
      'issued', false,
      'reward_id', existing_reward.id,
      'reward', jsonb_build_object(
        'id', existing_reward.id,
        'title', existing_reward.title,
        'category', existing_reward.category,
        'available_products', existing_reward.available_products,
        'image_url', existing_reward.image_url,
        'product_price', existing_reward.product_price,
        'welcome_gift_mode', existing_reward.welcome_gift_mode,
        'fixed_product_name', existing_reward.fixed_product_name
      )
    );
  end if;

  select *
  into selected_reward
  from public.rewards
  where restaurant_id = input_restaurant_id
    and is_starter_reward = true
    and active = true
    and (expires_at is null or expires_at > now())
  order by encode(extensions.gen_random_bytes(16), 'hex')
  limit 1;

  if selected_reward.id is null then
    return jsonb_build_object('issued', false, 'reward_id', null, 'reward', null);
  end if;

  begin
    insert into public.customer_rewards (
      restaurant_id,
      customer_id,
      reward_id,
      status,
      is_starter_reward,
      assignment_metadata
    )
    values (
      input_restaurant_id,
      input_customer_id,
      selected_reward.id,
      'active',
      true,
      jsonb_build_object(
        'source', input_source,
        'campaign_id', input_campaign_id,
        'title', selected_reward.title,
        'category', selected_reward.category,
        'available_products', selected_reward.available_products,
        'image_url', selected_reward.image_url,
        'product_price', selected_reward.product_price,
        'welcome_gift_mode', selected_reward.welcome_gift_mode,
        'fixed_product_name', selected_reward.fixed_product_name,
        'assigned_at', now()
      )
    )
    returning id into assignment_id;
    issued_value := true;
  exception
    when unique_violation then
      issued_value := false;
  end;

  if issued_value then
    if input_campaign_id is not null then
      insert into public.campaign_events (
        restaurant_id,
        campaign_id,
        customer_id,
        event_type,
        metadata
      )
      values (
        input_restaurant_id,
        input_campaign_id,
        input_customer_id,
        'starter_reward',
        jsonb_build_object('offer_source', 'reward', 'offer_id', selected_reward.id, 'source', input_source)
      );
    end if;

    insert into public.audit_log (
      restaurant_id,
      actor_type,
      actor_id,
      action,
      target_table,
      target_id,
      metadata
    )
    values (
      input_restaurant_id,
      'system',
      null,
      'welcome_starter_reward_assigned',
      'customer_rewards',
      assignment_id,
      jsonb_build_object(
        'customer_id', input_customer_id,
        'reward_id', selected_reward.id,
        'source', input_source,
        'campaign_id', input_campaign_id
      )
    );
  end if;

  return jsonb_build_object(
    'issued', issued_value,
    'reward_id', selected_reward.id,
    'reward', jsonb_build_object(
      'id', selected_reward.id,
      'title', selected_reward.title,
      'category', selected_reward.category,
      'available_products', selected_reward.available_products,
      'image_url', selected_reward.image_url,
      'product_price', selected_reward.product_price,
      'welcome_gift_mode', selected_reward.welcome_gift_mode,
      'fixed_product_name', selected_reward.fixed_product_name
    )
  );
end;
$$;

revoke execute on function public.assign_welcome_starter_reward(uuid, uuid, uuid, text)
from public, anon, authenticated;
