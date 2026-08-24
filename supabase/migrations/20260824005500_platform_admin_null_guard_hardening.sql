-- Fail closed when the authenticated user has no active Platform Admin role.
-- SQL membership checks return NULL for a missing role; all callers must see
-- that state as false so PL/pgSQL `if not is_platform_admin()` guards execute.

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(
    public.current_platform_role() in (
      'platform_owner',
      'platform_admin',
      'app_admin',
      'super_admin',
      'wuxuai_admin',
      'support',
      'billing_admin',
      'security_admin',
      'viewer'
    ),
    false
  );
$$;

revoke execute on function public.is_platform_admin()
from public, anon, authenticated;

comment on function public.is_platform_admin() is
  'Fail-closed internal Platform Admin role predicate. Missing or inactive mappings return false, never null.';

notify pgrst, 'reload schema';
