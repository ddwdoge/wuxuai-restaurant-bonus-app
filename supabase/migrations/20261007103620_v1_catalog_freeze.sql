-- Founder decision 2026-10-07: restaurant menu catalog is not a V1 feature.
-- Preserve migration 205, private data, file metadata, and immutable audit.
begin;

-- A Storage trigger is deliberately installed before RPC revocation. Its DDL
-- lock waits for ongoing object inserts. The zero-object staging precondition
-- then detects any legacy upload that finished while the lock was acquired.
-- If it did, abort atomically instead of leaving an unregistered file when
-- the old gateway's next register call loses EXECUTE.
create function public.reject_v1_menu_storage_write() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if new.bucket_id = 'restaurant-menu-private' then
    raise exception 'CATALOG_V1_DISABLED' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.reject_v1_menu_storage_write() from public, anon, authenticated, service_role;
create trigger reject_v1_menu_storage_write
before insert or update on storage.objects
for each row execute function public.reject_v1_menu_storage_write();

do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'restaurant-menu-private') then
    raise exception 'CATALOG_FREEZE_REQUIRES_ZERO_OBJECTS' using errcode = '55000';
  end if;
end $$;

-- The legacy gateway reads get_owner_menu_catalog before every upload.
-- The private bucket limit and trigger both block later Storage writes.
update storage.buckets
set file_size_limit = 1
where id = 'restaurant-menu-private';

create or replace function public.restaurant_menu_access_internal(
  input_restaurant_id uuid, input_branch_id uuid
) returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp as $$ select false $$;

revoke all on function public.get_platform_test_menu_addon(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_platform_test_menu_addon(uuid,uuid,text,uuid,timestamptz,text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_owner_menu_catalog(uuid) from public, anon, authenticated, service_role;
revoke all on function public.get_customer_menu_catalog(text,text) from public, anon, authenticated, service_role;
revoke all on function public.manage_owner_menu_catalog(uuid,uuid,text,uuid[],integer,integer,text,integer) from public, anon, authenticated, service_role;
revoke all on function public.register_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,text) from public, anon, authenticated, service_role;
revoke all on function public.resolve_owner_menu_object_path(uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.resolve_customer_menu_object_path(text,text,uuid,integer) from public, anon, authenticated, service_role;

-- No direct table or Storage grant is introduced. Migration 205 RLS stays on.
commit;
notify pgrst, 'reload schema';
