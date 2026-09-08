-- Resolve the organization/restaurant legal-profile dependency only inside
-- the existing, exact TEST-ONLY cleanup transaction.

create function public.cleanup_test_tenant_legal_profile_dependency()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  cleanup_restaurant_id uuid;
begin
  cleanup_restaurant_id := nullif(
    current_setting('wuxuai.test_tenant_cleanup_id', true),
    ''
  )::uuid;

  if cleanup_restaurant_id is null
     or not public.test_tenant_cleanup_context_allows(cleanup_restaurant_id) then
    return old;
  end if;

  delete from public.restaurant_legal_profiles
  where restaurant_id = cleanup_restaurant_id
    and operator_profile_id = old.id;

  return old;
end;
$$;

create trigger cleanup_test_tenant_legal_profile_dependency_trigger
before delete on public.organization_legal_profiles
for each row execute function public.cleanup_test_tenant_legal_profile_dependency();

revoke all on function public.cleanup_test_tenant_legal_profile_dependency()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
