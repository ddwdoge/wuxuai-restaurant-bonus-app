create table if not exists public.restaurant_onboarding_drafts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  current_step integer not null default 0 check (current_step >= 0 and current_step <= 7),
  draft_data jsonb not null default '{}'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_onboarding_drafts enable row level security;

create or replace function public.set_onboarding_draft_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.restaurant_id is null then
    raise exception 'restaurant_id required';
  end if;

  if new.organization_id is null then
    new.organization_id := public.restaurant_organization_id(new.restaurant_id);
  end if;

  if new.branch_id is null then
    new.branch_id := public.restaurant_primary_branch_id(new.restaurant_id);
  end if;

  new.updated_at := now();

  return new;
end;
$$;

drop trigger if exists set_onboarding_draft_scope on public.restaurant_onboarding_drafts;
create trigger set_onboarding_draft_scope
before insert or update of restaurant_id, organization_id, branch_id, current_step, draft_data, checklist
on public.restaurant_onboarding_drafts
for each row execute function public.set_onboarding_draft_scope();

drop policy if exists "onboarding drafts admin select" on public.restaurant_onboarding_drafts;
drop policy if exists "onboarding drafts admin write" on public.restaurant_onboarding_drafts;

create policy "onboarding drafts admin select"
on public.restaurant_onboarding_drafts for select
using (public.is_restaurant_admin(restaurant_id));

create policy "onboarding drafts admin write"
on public.restaurant_onboarding_drafts for all
using (public.is_restaurant_admin(restaurant_id))
with check (public.is_restaurant_admin(restaurant_id));

create index if not exists onboarding_drafts_restaurant_idx
on public.restaurant_onboarding_drafts (restaurant_id);

revoke execute on function public.set_onboarding_draft_scope()
from public, anon, authenticated;
