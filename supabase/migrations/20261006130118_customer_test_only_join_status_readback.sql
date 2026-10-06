-- Read-only, auth-bound TEST_ONLY status. No direct receipt or membership table access.
begin;

create function public.get_customer_test_only_join_status(
  input_restaurant_slug text,
  input_branch_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare
  tenant public.restaurants%rowtype;
  branch_value public.branches%rowtype;
  marker public.platform_test_tenant_registry%rowtype;
  binding public.platform_terms_test_identities%rowtype;
  account_value public.customer_accounts%rowtype;
  membership_value public.customer_account_memberships%rowtype;
  customer_value public.customers%rowtype;
  receipt public.customer_test_only_join_receipts%rowtype;
  publication public.at_legal_synthetic_test_publications%rowtype;
  platform_receipt public.platform_customer_terms_receipts%rowtype;
  environment_value text;
  real_intake_value text;
  test_intake_value text;
  receipt_count integer;
begin
  if auth.uid() is null
    or auth.jwt()->>'iss' is distinct from 'https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'
    or nullif(trim(input_restaurant_slug),'') is null
    or input_branch_id is null then
    raise exception 'TEST_ONLY_JOIN_STATUS_DENIED' using errcode='42501';
  end if;

  select environment into environment_value
    from public.business_verification_environment where singleton;
  select real_intake_status,test_only_intake_status
    into real_intake_value,test_intake_value
    from public.country_kyb_intake_policies where country_code='AT';
  select * into tenant from public.restaurants
    where slug=trim(input_restaurant_slug);
  select * into branch_value from public.branches
    where id=input_branch_id and restaurant_id=tenant.id;
  select * into marker from public.platform_test_tenant_registry
    where restaurant_id=tenant.id and deleted_at is null;
  select * into binding from public.platform_terms_test_identities
    where auth_user_id=auth.uid();
  select * into account_value from public.customer_accounts
    where auth_user_id=auth.uid() and disabled_at is null;

  if environment_value is distinct from 'STAGING'
    or real_intake_value is distinct from 'BLOCKED'
    or test_intake_value is distinct from 'READY'
    or tenant.id is null or tenant.status is distinct from 'draft'
    or public.restaurant_activation_state_internal(tenant.id)->>'status' is distinct from 'PENDING_ACTIVATION'
    or tenant.primary_branch_id is distinct from input_branch_id
    or branch_value.id is null or branch_value.organization_id is distinct from tenant.organization_id
    or branch_value.country is distinct from 'AT'
    or marker.restaurant_id is null or marker.organization_id is distinct from tenant.organization_id
    or marker.owner_user_id is distinct from tenant.owner_id
    or marker.restaurant_name is distinct from tenant.name
    or binding.auth_user_id is null or binding.restaurant_id is distinct from tenant.id
    or binding.branch_id is distinct from branch_value.id
    or binding.test_session_id is distinct from marker.test_session_id
    or account_value.id is null then
    raise exception 'TEST_ONLY_JOIN_STATUS_DENIED' using errcode='42501';
  end if;

  select * into membership_value from public.customer_account_memberships
    where account_id=account_value.id and restaurant_id=tenant.id;
  select count(*) into receipt_count from public.customer_test_only_join_receipts
    where auth_user_id=auth.uid() and restaurant_id=tenant.id;
  if receipt_count > 1 then
    raise exception 'TEST_ONLY_JOIN_STATUS_INCONSISTENT' using errcode='42501';
  end if;
  select * into receipt from public.customer_test_only_join_receipts
    where auth_user_id=auth.uid() and restaurant_id=tenant.id;

  if receipt.request_id is null and membership_value.id is null then
    return jsonb_build_object('status','NOT_JOINED','test_only',true,
      'restaurant_slug',tenant.slug,'restaurant_id',tenant.id,'branch_id',branch_value.id);
  end if;
  if receipt.request_id is null or membership_value.id is null then
    raise exception 'TEST_ONLY_JOIN_STATUS_INCONSISTENT' using errcode='42501';
  end if;

  select * into customer_value from public.customers where id=membership_value.customer_id;
  select * into publication from public.at_legal_synthetic_test_publications
    where id=receipt.bundle_publication_id;
  select * into platform_receipt from public.platform_customer_terms_receipts
    where id=receipt.platform_terms_receipt_id;
  if receipt.account_id is distinct from account_value.id
    or receipt.branch_id is distinct from branch_value.id
    or receipt.customer_id is distinct from membership_value.customer_id
    or receipt.test_session_id is distinct from marker.test_session_id
    or customer_value.id is null or customer_value.restaurant_id is distinct from tenant.id
    or customer_value.branch_id is distinct from branch_value.id
    or customer_value.is_test_customer is not true
    or customer_value.test_session_id is distinct from marker.test_session_id
    or publication.id is null or publication.restaurant_id is distinct from tenant.id
    or publication.action is distinct from 'PUBLISH_TEST'
    or publication.bundle_id is distinct from receipt.bundle_id
    or publication.bundle_hash is distinct from receipt.bundle_hash
    or publication.bundle_hash is distinct from public.at_legal_synthetic_manifest_hash_internal(publication.manifest)
    or publication.manifest->'legal'->>'version' is distinct from receipt.legal_version
    or publication.manifest->'legal'->>'sha256' is distinct from receipt.legal_sha256
    or publication.manifest->'privacy'->>'version' is distinct from receipt.privacy_version
    or publication.manifest->'privacy'->>'sha256' is distinct from receipt.privacy_sha256
    or platform_receipt.id is null or platform_receipt.auth_user_id is distinct from auth.uid()
    or platform_receipt.test_restaurant_id is distinct from tenant.id
    or platform_receipt.test_session_id is distinct from marker.test_session_id then
    raise exception 'TEST_ONLY_JOIN_STATUS_INCONSISTENT' using errcode='42501';
  end if;

  return jsonb_build_object('status','JOINED','test_only',true,
    'restaurant_slug',tenant.slug,'restaurant_id',tenant.id,'branch_id',branch_value.id,
    'membership_id',membership_value.id,'request_id',receipt.request_id,
    'bundle_id',receipt.bundle_id,'bundle_hash',receipt.bundle_hash,
    'legal_version',receipt.legal_version,'legal_sha256',receipt.legal_sha256,
    'privacy_version',receipt.privacy_version,'privacy_sha256',receipt.privacy_sha256,
    'accepted_at',receipt.accepted_at);
end;
$function$;

revoke all on function public.get_customer_test_only_join_status(text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_customer_test_only_join_status(text,uuid)
  to authenticated;

commit;
