create table if not exists public.owner_dashboard_notice_views (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notice_key text not null check (char_length(notice_key) between 3 and 100),
  seen_at timestamptz not null default now(),
  unique (restaurant_id, user_id, notice_key)
);

create index if not exists owner_dashboard_notice_views_user_restaurant_idx
  on public.owner_dashboard_notice_views (user_id, restaurant_id, seen_at desc);

alter table public.owner_dashboard_notice_views enable row level security;

drop policy if exists "owner dashboard notice views own select" on public.owner_dashboard_notice_views;
create policy "owner dashboard notice views own select"
on public.owner_dashboard_notice_views
for select
to authenticated
using (
  user_id = auth.uid()
  and public.is_restaurant_admin(restaurant_id)
);

drop policy if exists "owner dashboard notice views own insert" on public.owner_dashboard_notice_views;
create policy "owner dashboard notice views own insert"
on public.owner_dashboard_notice_views
for insert
to authenticated
with check (
  user_id = auth.uid()
  and public.is_restaurant_admin(restaurant_id)
);

revoke all on table public.owner_dashboard_notice_views from public, anon;
revoke update, delete on table public.owner_dashboard_notice_views from authenticated;
grant select, insert on table public.owner_dashboard_notice_views to authenticated;
