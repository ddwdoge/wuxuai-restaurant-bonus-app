-- Run only against a disposable local Supabase stack after fresh replay.
begin;
do $$
declare signature text;
declare actor text;
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version='20261006191254')
    or exists (select 1 from supabase_migrations.schema_migrations where version='20261006220311')
    or not exists (select 1 from supabase_migrations.schema_migrations where version='20261007103620') then
    raise exception 'MIGRATION_SET_MISMATCH';
  end if;

  foreach signature in array array[
    'public.get_platform_test_menu_addon(uuid)',
    'public.set_platform_test_menu_addon(uuid,uuid,text,uuid,timestamptz,text,uuid)',
    'public.get_owner_menu_catalog(uuid)',
    'public.get_customer_menu_catalog(text,text)',
    'public.manage_owner_menu_catalog(uuid,uuid,text,uuid[],integer,integer,text,integer)',
    'public.register_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,text)',
    'public.resolve_owner_menu_object_path(uuid,uuid,uuid)',
    'public.resolve_customer_menu_object_path(text,text,uuid,integer)'
  ] loop
    foreach actor in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(actor, signature, 'EXECUTE') then
        raise exception 'CATALOG_EXECUTE_OPEN: % %', actor, signature;
      end if;
    end loop;
  end loop;

  if (select file_size_limit from storage.buckets where id='restaurant-menu-private') is distinct from 1 then
    raise exception 'CATALOG_BUCKET_LIMIT_OPEN';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname='reject_v1_menu_storage_write'
      and tgrelid='storage.objects'::regclass and not tgisinternal and tgenabled='O'
  ) then raise exception 'CATALOG_STORAGE_TRIGGER_MISSING'; end if;

  begin
    insert into storage.objects(id,bucket_id,name)
    values(gen_random_uuid(),'restaurant-menu-private','synthetic/freeze-check.jpg');
    raise exception 'CATALOG_STORAGE_WRITE_ALLOWED';
  exception when insufficient_privilege then
    if SQLERRM <> 'CATALOG_V1_DISABLED' then raise; end if;
  end;

  if has_table_privilege('anon','public.restaurant_menu_catalogs','SELECT')
    or has_table_privilege('authenticated','public.restaurant_menu_catalogs','INSERT')
    or has_table_privilege('service_role','public.restaurant_menu_catalogs','UPDATE') then
    raise exception 'CATALOG_TABLE_ACL_OPEN';
  end if;
end $$;
rollback;
