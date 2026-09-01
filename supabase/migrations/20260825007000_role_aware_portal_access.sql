-- Resolve portal eligibility from authoritative server-side relationships.
-- The result contains only access flags and one confirmed Staff destination.

create or replace function public.get_current_portal_access()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with access as (
    select
      exists (
        select 1
        from public.customer_accounts ca
        where ca.auth_user_id = auth.uid()
          and ca.disabled_at is null
      ) as customer_access,
      exists (
        select 1
        from public.restaurant_members rm
        where rm.user_id = auth.uid()
          and rm.role in ('owner', 'admin', 'manager')
      ) as owner_access,
      exists (
        select 1
        from public.restaurant_members rm
        where rm.user_id = auth.uid()
          and (
            rm.role in ('owner', 'admin', 'manager')
            or (
              rm.role in ('staff', 'supervisor')
              and exists (
                select 1
                from public.staff_members sm
                where sm.restaurant_id = rm.restaurant_id
                  and sm.auth_user_id = auth.uid()
                  and sm.active = true
                  and sm.account_status = 'active'
                  and sm.archived_at is null
              )
            )
          )
      ) as staff_access,
      exists (
        select 1
        from public.platform_admins pa
        where pa.user_id = auth.uid()
          and pa.active = true
      ) as platform_access
  ), preferred_staff as (
    select r.slug
    from public.restaurant_members rm
    join public.restaurants r on r.id = rm.restaurant_id
    where rm.user_id = auth.uid()
      and r.status = 'active'
      and (
        rm.role in ('owner', 'admin', 'manager')
        or (
          rm.role in ('staff', 'supervisor')
          and exists (
            select 1
            from public.staff_members sm
            where sm.restaurant_id = rm.restaurant_id
              and sm.auth_user_id = auth.uid()
              and sm.active = true
              and sm.account_status = 'active'
              and sm.archived_at is null
          )
        )
      )
    order by r.created_at, r.id
    limit 1
  )
  select case
    when auth.uid() is null then
      jsonb_build_object(
        'authenticated', false,
        'customer_access', false,
        'owner_access', false,
        'staff_access', false,
        'platform_access', false
      )
    else jsonb_strip_nulls(jsonb_build_object(
      'authenticated', true,
      'customer_access', access.customer_access,
      'owner_access', access.owner_access,
      'staff_access', access.staff_access,
      'platform_access', access.platform_access,
      'preferred_staff_slug', preferred_staff.slug
    ))
  end
  from access
  left join preferred_staff on true;
$$;

revoke all on function public.get_current_portal_access()
from public, anon, authenticated;
grant execute on function public.get_current_portal_access()
to authenticated;

comment on function public.get_current_portal_access() is
  'Returns authenticated portal eligibility from customer, restaurant, active Staff and platform-admin relationships without exposing account data.';

notify pgrst, 'reload schema';
