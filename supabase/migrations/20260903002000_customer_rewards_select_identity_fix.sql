-- Resolve customer_rewards visibility through the current tenant and central
-- Customer/Auth membership contracts without exposing customer tables.
create or replace function public.can_select_customer_reward(
  input_restaurant_id uuid,
  input_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and (
      public.is_restaurant_member(input_restaurant_id)
      or exists (
        select 1
        from public.customer_accounts account
        join public.customer_account_memberships membership
          on membership.account_id = account.id
        join public.customers customer
          on customer.id = membership.customer_id
         and customer.restaurant_id = membership.restaurant_id
        where account.auth_user_id = auth.uid()
          and account.disabled_at is null
          and membership.restaurant_id = input_restaurant_id
          and membership.customer_id = input_customer_id
          and customer.membership_status = 'active'
      )
    );
$$;

revoke all on function public.can_select_customer_reward(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.can_select_customer_reward(uuid, uuid)
to anon, authenticated;

drop policy if exists "customer rewards own select"
on public.customer_rewards;

create policy "customer rewards own select"
on public.customer_rewards for select
using (public.can_select_customer_reward(restaurant_id, customer_id));

notify pgrst, 'reload schema';
