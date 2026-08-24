-- Keep the existing platform-admin model and make its server-side role table
-- the only authority for internal platform access.

alter table public.platform_admins enable row level security;

revoke all on table public.platform_admins from public, anon, authenticated;

create or replace function public.current_platform_role()
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select pa.role
  from public.platform_admins pa
  where pa.user_id = auth.uid()
    and pa.active = true
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.current_platform_role() in (
    'platform_owner',
    'platform_admin',
    'app_admin',
    'super_admin',
    'wuxuai_admin',
    'support',
    'billing_admin',
    'security_admin',
    'viewer'
  );
$$;

create or replace function public.get_current_platform_role()
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select public.current_platform_role();
$$;

revoke execute on function public.current_platform_role() from public, anon, authenticated;
revoke execute on function public.is_platform_admin() from public, anon, authenticated;
revoke execute on function public.get_current_platform_role() from public, anon, authenticated;
grant execute on function public.get_current_platform_role() to authenticated;

comment on table public.platform_admins is
  'Internal WUXUAI platform roles. Restaurant ownership and customer/staff memberships never grant platform access.';

notify pgrst, 'reload schema';
