-- Evaluate point-reward notifications against the effective balance produced
-- by the canonical earn transaction, even though the journal trigger runs
-- before award_points_v1 persists customers.points_balance.

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
  select points_balance into current_balance from public.customers
  where id = new.customer_id and restaurant_id = new.restaurant_id;
  if current_balance is null then return new; end if;

  if new.type = 'earn'
    and new.points > 0
    and new.collection_source in ('customer_initiated', 'restaurant_controlled')
  then
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
      new.restaurant_id, new.customer_id, reward_record.id,
      current_balance >= reward_record.required_points,
      case when not was_above and current_balance >= reward_record.required_points then new.created_at else null end,
      now()
    ) on conflict (restaurant_id, customer_id, reward_id) do update
      set above_threshold = excluded.above_threshold,
          last_crossed_at = case when not public.customer_reward_notification_state.above_threshold
            and excluded.above_threshold then excluded.last_crossed_at
            else public.customer_reward_notification_state.last_crossed_at end,
          updated_at = now();
    if not was_above and current_balance >= reward_record.required_points then
      perform public.enqueue_customer_transactional_email(
        new.restaurant_id, new.customer_id, 'POINT_REWARD_AVAILABLE',
        new.id::text || ':' || reward_record.id::text, reward_record.id, null,
        jsonb_build_object('reward_name', reward_record.title, 'required_points', reward_record.required_points),
        new.created_at
      );
    end if;
  end loop;
  return new;
exception when others then
  -- Notification infrastructure must never roll back a points transaction.
  return new;
end;
$$;

revoke execute on function public.sync_point_reward_notification_state()
from public, anon, authenticated;

