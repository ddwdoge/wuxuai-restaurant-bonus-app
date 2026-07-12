drop index if exists public.rewards_one_active_welcome_gift_per_restaurant_idx;

create index if not exists rewards_active_welcome_gift_pool_idx
on public.rewards (restaurant_id, active, starter_reward_order, created_at)
where is_starter_reward = true;
