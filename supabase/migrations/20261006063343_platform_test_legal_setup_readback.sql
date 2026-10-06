-- Read-only continuation state for the existing protected TEST_ONLY admin flow.
-- No table grants, real publication, or change to the write RPCs.
begin;

create function public.get_platform_test_legal_setup_readback(input_restaurant_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare
  marker public.platform_test_tenant_registry%rowtype;
  restaurant public.restaurants%rowtype;
  binding public.platform_terms_test_identities%rowtype;
  publication public.platform_terms_test_publications%rowtype;
  binding_count integer;
  platform_status text := 'NOT_FOUND';
begin
  perform public.require_at_legal_synthetic_scope_internal(input_restaurant_id);

  select * into marker from public.platform_test_tenant_registry
    where restaurant_id=input_restaurant_id and deleted_at is null for share;
  select * into restaurant from public.restaurants where id=input_restaurant_id for share;
  select count(*) into binding_count from public.platform_terms_test_identities
    where restaurant_id=input_restaurant_id;
  if binding_count > 1 then
    raise exception 'TEST_LEGAL_SETUP_BINDING_AMBIGUOUS' using errcode='42501';
  end if;
  if binding_count = 1 then
    select * into binding from public.platform_terms_test_identities
      where restaurant_id=input_restaurant_id for share;
    if binding.branch_id is distinct from restaurant.primary_branch_id
      or binding.test_session_id is distinct from marker.test_session_id
      or not exists(select 1 from auth.users u
        where u.id=binding.auth_user_id and u.email_confirmed_at is not null
          and u.deleted_at is null) then
      raise exception 'TEST_LEGAL_SETUP_BINDING_STALE' using errcode='42501';
    end if;
  end if;

  select * into publication from public.platform_terms_test_publications
    where restaurant_id=input_restaurant_id order by event_sequence desc limit 1;
  if publication.id is not null then
    if publication.test_session_id is distinct from marker.test_session_id then
      raise exception 'TEST_LEGAL_SETUP_PUBLICATION_STALE' using errcode='42501';
    end if;
    platform_status := case publication.action when 'PUBLISH_TEST'
      then 'PUBLISHED_TEST' else 'WITHDRAWN_TEST' end;
  end if;

  return jsonb_build_object(
    'restaurant_id',input_restaurant_id,
    'branch_id',restaurant.primary_branch_id,
    'test_session_id',marker.test_session_id,
    'binding',case when binding_count=1 then jsonb_build_object(
      'auth_user_id',binding.auth_user_id,'restaurant_id',binding.restaurant_id,
      'branch_id',binding.branch_id,'test_session_id',binding.test_session_id,
      'request_id',binding.request_id,'marked_at',binding.marked_at) else null end,
    'platform',jsonb_build_object('status',platform_status,
      'publication_id',publication.id,'version',publication.version,
      'sha256',publication.content_sha256),
    'test_only',true);
end;
$function$;

revoke all on function public.get_platform_test_legal_setup_readback(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_test_legal_setup_readback(uuid)
  to authenticated;
comment on function public.get_platform_test_legal_setup_readback(uuid) is
  'AAL2/recent-TOTP guarded, read-only continuation state for one exact STAGING/TEST_ONLY restaurant.';

notify pgrst,'reload schema';
commit;
