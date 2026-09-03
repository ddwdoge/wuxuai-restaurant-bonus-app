-- Customer gift assignments and redemption state are server-controlled.
-- Browser roles retain the existing RLS-governed SELECT contract only.
drop policy if exists "customer rewards admin write"
on public.customer_rewards;

revoke insert, update, delete, truncate
on table public.customer_rewards
from anon, authenticated;
