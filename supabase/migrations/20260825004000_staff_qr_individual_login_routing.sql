-- Route restaurant-scoped Staff QR entries through an individual Staff login.
-- The public context exposes only the display name and slug of an active tenant;
-- the authenticated resolver remains the authority for Staff access.

create or replace function public.get_public_staff_login_context(input_restaurant_slug text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce((
    select jsonb_build_object(
      'available', true,
      'restaurant_name', r.name,
      'restaurant_slug', r.slug
    )
    from public.restaurants r
    where r.slug = lower(btrim(input_restaurant_slug))
      and r.status = 'active'
      and char_length(btrim(input_restaurant_slug)) between 1 and 160
    limit 1
  ), jsonb_build_object('available', false));
$$;

create or replace function public.get_my_staff_restaurant_access(input_restaurant_slug text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case
    when auth.uid() is null then
      jsonb_build_object('success', false, 'error_code', 'AUTH_REQUIRED')
    else coalesce((
      select jsonb_build_object(
        'success', true,
        'restaurant_id', r.id,
        'restaurant_name', r.name,
        'restaurant_slug', r.slug,
        'staff_role', rm.role
      )
      from public.restaurants r
      join public.restaurant_members rm
        on rm.restaurant_id = r.id
       and rm.user_id = auth.uid()
       and rm.role in ('staff', 'supervisor')
      join public.staff_members sm
        on sm.restaurant_id = r.id
       and sm.auth_user_id = auth.uid()
       and sm.active = true
       and sm.account_status = 'active'
       and sm.archived_at is null
      where r.slug = lower(btrim(input_restaurant_slug))
        and r.status = 'active'
      limit 1
    ), jsonb_build_object('success', false, 'error_code', 'STAFF_ACCESS_DENIED'))
  end;
$$;

revoke all on function public.get_public_staff_login_context(text) from public, anon, authenticated;
revoke all on function public.get_my_staff_restaurant_access(text) from public, anon, authenticated;

grant execute on function public.get_public_staff_login_context(text) to anon, authenticated;
grant execute on function public.get_my_staff_restaurant_access(text) to authenticated;

comment on function public.get_public_staff_login_context(text) is
  'Returns only the active restaurant display context needed by the public Staff login.';
comment on function public.get_my_staff_restaurant_access(text) is
  'Resolves exact active Staff or supervisor access for auth.uid() and one restaurant slug.';
