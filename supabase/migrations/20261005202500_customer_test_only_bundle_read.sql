-- Customer decision data only. No table grants, publication or business writes.
begin;
create function public.get_customer_test_only_merchant_bundle(
  input_restaurant_slug text,input_branch_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare tenant_id uuid; publication public.at_legal_synthetic_test_publications%rowtype;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or input_branch_id is null or nullif(trim(input_restaurant_slug),'') is null then
    return jsonb_build_object('status','UNAVAILABLE');
  end if;
  select id into tenant_id from public.restaurants where slug=trim(input_restaurant_slug);
  if tenant_id is null then return jsonb_build_object('status','UNAVAILABLE'); end if;
  -- Same serialization order as publication and final join; never create a permit.
  perform pg_advisory_xact_lock(hashtextextended('at-legal-synthetic:'||tenant_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-test-publication:'||tenant_id::text,0));
  select * into publication from public.at_legal_synthetic_test_publications
    where restaurant_id=tenant_id order by event_sequence desc limit 1;
  if publication.id is null or publication.action is distinct from 'PUBLISH_TEST' then
    return jsonb_build_object('status','UNAVAILABLE');
  end if;
  -- Existing gate binds uid, TEST_ONLY identity, tenant, branch, session, issuer,
  -- STAGING, current platform acceptance and real AT intake BLOCKED.
  publication:=public.require_platform_test_only_join_scope_internal(
    tenant_id,input_branch_id,publication.bundle_id,publication.bundle_hash);
  -- Revalidates all body hashes and canonical bundle hash without exposing internals.
  if publication.bundle_hash is distinct from public.at_legal_synthetic_manifest_hash_internal(publication.manifest)
    or publication.bundle_id is distinct from 'at-test-'||publication.bundle_hash then
    return jsonb_build_object('status','UNAVAILABLE');
  end if;
  return jsonb_build_object('status','READY','test_only',true,
    'bundle_id',publication.bundle_id,'bundle_hash',publication.bundle_hash,
    'terms',jsonb_build_object('text',publication.manifest->'legal'->>'body',
      'version',publication.manifest->'legal'->>'version','sha256',publication.manifest->'legal'->>'sha256'),
    'privacy',jsonb_build_object('text',publication.manifest->'privacy'->>'body',
      'version',publication.manifest->'privacy'->>'version','sha256',publication.manifest->'privacy'->>'sha256'));
exception when insufficient_privilege or invalid_parameter_value then
  return jsonb_build_object('status','UNAVAILABLE');
end;
$function$;
revoke all on function public.get_customer_test_only_merchant_bundle(text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_customer_test_only_merchant_bundle(text,uuid) to authenticated;
commit;
