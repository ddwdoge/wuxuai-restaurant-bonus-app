-- Canonical Pending Activation: restaurants.status=draft and activation_status=pending_activation.

-- Only the short-lived transaction-bound STAGING/TEST_ONLY permit may traverse shared registration/join on draft.

-- Real registration, ordinary join, activation, AT intake and applied migrations 194-199 remain unchanged.

begin;

create or replace function public.platform_test_join_permit_active_internal(input_restaurant_id uuid)
returns boolean language sql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
  select exists(select 1 from public.platform_test_join_permits p
    join public.business_verification_environment e on e.singleton
    join public.platform_test_tenant_registry m on m.restaurant_id=p.restaurant_id
      and m.deleted_at is null and m.test_session_id=p.test_session_id
    join public.restaurants r on r.id=p.restaurant_id
      and r.primary_branch_id=p.branch_id and r.organization_id=m.organization_id
    where p.transaction_id=txid_current() and p.backend_pid=pg_backend_pid()
      and p.auth_user_id=auth.uid() and p.restaurant_id=input_restaurant_id
      and auth.jwt()->>'iss'='https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'
      and p.created_at>=clock_timestamp()-interval '60 seconds'
      and p.created_at<=clock_timestamp()+interval '5 seconds'
      and e.environment='STAGING' and r.status='draft'
      and r.activation_status='pending_activation');
$function$;

CREATE OR REPLACE FUNCTION public.register_restaurant_customer(input_restaurant_slug text, input_first_name text, input_phone text, input_birthday date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  normalized_name text;
  normalized_phone_value text;
  next_code text;
  raw_customer_token text;
  token_id uuid;
begin
  normalized_name := trim(coalesce(input_first_name, ''));
  normalized_phone_value := regexp_replace(trim(coalesce(input_phone, '')), '\s+', '', 'g');

  if length(normalized_name) < 2 or length(normalized_name) > 80 then
    raise exception 'Vorname ist erforderlich';
  end if;

  if length(normalized_phone_value) < 5 or length(normalized_phone_value) > 32 then
    raise exception 'Telefonnummer ist erforderlich';
  end if;

  select *
  into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and (status = 'active'
      or (status = 'draft' and activation_status = 'pending_activation'
        and public.platform_test_join_permit_active_internal(id)));

  if restaurant_record.id is null then
    raise exception 'Restaurant wurde nicht gefunden';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(restaurant_record.id::text || ':' || normalized_phone_value, 0));

  select *
  into customer_record
  from public.customers as existing_customer
  where existing_customer.restaurant_id = restaurant_record.id
    and existing_customer.phone = normalized_phone_value
  limit 1
  for update;

  if customer_record.id is null then
    next_code := upper(substr(restaurant_record.slug, 1, 3)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

    insert into public.customers (
      restaurant_id,
      name,
      phone,
      birthday,
      customer_code
    )
    values (
      restaurant_record.id,
      normalized_name,
      normalized_phone_value,
      input_birthday,
      next_code
    )
    returning * into customer_record;

    insert into public.audit_log (
      restaurant_id,
      actor_type,
      actor_id,
      action,
      target_table,
      target_id,
      metadata
    )
    values (
      restaurant_record.id,
      'customer',
      customer_record.id,
      'public_customer_registered',
      'customers',
      customer_record.id,
      jsonb_build_object('source', 'restaurant_qr_v1')
    );
  end if;

  raw_customer_token := encode(gen_random_bytes(32), 'hex');

  update public.customer_qr_tokens
  set active = false, rotated_at = now()
  where restaurant_id = restaurant_record.id
    and customer_id = customer_record.id
    and active = true;

  insert into public.customer_qr_tokens (
    restaurant_id,
    customer_id,
    token_hash,
    active
  )
  values (
    restaurant_record.id,
    customer_record.id,
    public.hash_public_token(raw_customer_token),
    true
  )
  returning id into token_id;

  return jsonb_build_object(
    'restaurant', jsonb_build_object(
      'name', restaurant_record.name,
      'slug', restaurant_record.slug,
      'status', restaurant_record.status
    ),
    'campaign', null,
    'customer', jsonb_build_object(
      'name', customer_record.name,
      'customer_code', customer_record.customer_code,
      'customer_qr_token', raw_customer_token
    ),
    'starter_offer_source', null,
    'starter_offer_id', null,
    'starter_issued', false
  );
end;
$function$;

create or replace function public.join_customer_account_core_internal(
  input_restaurant_slug text,input_device_id text,input_existing_customer_token text,
  input_test_only boolean
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,extensions,auth,pg_temp as $function$
declare account_id_value uuid:=public.ensure_authenticated_customer_account();
  account_record public.customer_accounts%rowtype;
  restaurant_record public.restaurants%rowtype;
  membership_record public.customer_account_memberships%rowtype;
  linked_account_id uuid; customer_id_value uuid; registration_result jsonb; raw_customer_token text;
begin
  select * into account_record from public.customer_accounts where id=account_id_value;
  select * into restaurant_record from public.restaurants
    where slug=trim(input_restaurant_slug)
      and ((input_test_only is false and status='active')
        or (input_test_only is true and status='draft'
          and activation_status='pending_activation'
          and public.platform_test_join_permit_active_internal(id)));
  if restaurant_record.id is null then
    raise exception 'CUSTOMER_ACCOUNT_CONTEXT_INVALID' using errcode='P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(account_id_value::text||':'||restaurant_record.id::text,0));
  select * into membership_record from public.customer_account_memberships
    where account_id=account_id_value and restaurant_id=restaurant_record.id;
  if membership_record.id is not null then
    return public.open_customer_account_membership(restaurant_record.id)||jsonb_build_object('joined',false);
  end if;
  if nullif(trim(coalesce(input_existing_customer_token,'')),'') is not null then
    if input_test_only then raise exception 'TEST_ONLY_EXISTING_TOKEN_FORBIDDEN' using errcode='42501'; end if;
    customer_id_value:=public.resolve_customer_from_public_token(restaurant_record.id,input_existing_customer_token);
    if customer_id_value is null then raise exception 'CUSTOMER_ACCESS_TOKEN_INVALID' using errcode='P0001'; end if;
    select account_id into linked_account_id from public.customer_account_memberships where customer_id=customer_id_value;
    if linked_account_id is not null and linked_account_id<>account_id_value then
      raise exception 'CUSTOMER_MEMBERSHIP_ALREADY_LINKED' using errcode='P0001';
    end if;
    insert into public.customer_account_memberships(account_id,restaurant_id,customer_id,last_opened_at)
      values(account_id_value,restaurant_record.id,customer_id_value,now())
      on conflict(account_id,restaurant_id) do nothing;
  else
    if input_test_only then
      registration_result:=public.register_restaurant_customer(
        restaurant_record.slug,account_record.first_name,account_record.phone,account_record.birthday,input_device_id);
    else
      registration_result:=public.register_restaurant_customer_legal(
        restaurant_record.slug,account_record.first_name,account_record.phone,account_record.birthday,
        input_device_id,true,true,false,false,false,account_record.birthday is not null);
    end if;
    if registration_result->>'success'='false' then
      raise exception '%',coalesce(registration_result->>'error_code','CUSTOMER_ACCOUNT_RECOVERY_REQUIRED') using errcode='P0001';
    end if;
    raw_customer_token:=registration_result#>>'{customer,customer_qr_token}';
    customer_id_value:=public.resolve_customer_from_public_token(restaurant_record.id,raw_customer_token);
    if customer_id_value is null then raise exception 'CUSTOMER_REGISTRATION_FAILED' using errcode='P0001'; end if;
    insert into public.customer_account_memberships(account_id,restaurant_id,customer_id,last_opened_at)
      values(account_id_value,restaurant_record.id,customer_id_value,now());
  end if;
  perform public.write_audit_event(restaurant_record.id,customer_id_value,'customer',customer_id_value,
    'CUSTOMER_JOINED_RESTAURANT','success','customer_account','customer_account_memberships',customer_id_value,
    null,jsonb_build_object('central_account',true)||case when input_test_only
      then jsonb_build_object('test_only',true) else '{}'::jsonb end);
  if raw_customer_token is null then
    return public.open_customer_account_membership(restaurant_record.id)||jsonb_build_object('joined',true);
  end if;
  return jsonb_build_object('joined',true,'restaurant_slug',restaurant_record.slug,'customer_token',raw_customer_token);
end;
$function$;

create or replace function public.require_platform_test_only_join_scope_internal(
  input_restaurant_id uuid,input_branch_id uuid,input_bundle_id text,input_bundle_hash text
) returns public.at_legal_synthetic_test_publications
language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare tenant public.restaurants%rowtype; marker public.platform_test_tenant_registry%rowtype;
  binding public.platform_terms_test_identities%rowtype;
  publication public.at_legal_synthetic_test_publications%rowtype;
  terms_status jsonb; platform_receipt public.platform_customer_terms_receipts%rowtype;
  policy public.country_kyb_intake_policies%rowtype; environment_value text;
begin
  if auth.uid() is null or auth.role() is distinct from 'authenticated'
    or auth.jwt()->>'iss' is distinct from 'https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'
    or input_restaurant_id is null or input_branch_id is null or input_bundle_id is null
    or input_bundle_hash is null then raise exception 'TEST_ONLY_JOIN_SCOPE_DENIED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('at-legal-synthetic:'||input_restaurant_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('platform-terms-test-publication:'||input_restaurant_id::text,0));
  select environment into environment_value from public.business_verification_environment where singleton for share;
  select * into tenant from public.restaurants where id=input_restaurant_id for share;
  select * into marker from public.platform_test_tenant_registry
    where restaurant_id=input_restaurant_id and deleted_at is null for share;
  select * into binding from public.platform_terms_test_identities where auth_user_id=auth.uid() for share;
  select * into policy from public.country_kyb_intake_policies where country_code='AT' for share;
  if environment_value is distinct from 'STAGING'
    or tenant.id is null or tenant.status is distinct from 'draft'
    or public.restaurant_activation_state_internal(tenant.id)->>'status' is distinct from 'PENDING_ACTIVATION'
    or tenant.primary_branch_id is distinct from input_branch_id
    or not exists(select 1 from public.branches b where b.id=input_branch_id
      and b.restaurant_id=tenant.id and b.organization_id=tenant.organization_id and b.country='AT')
    or marker.restaurant_id is null or marker.organization_id is distinct from tenant.organization_id
    or marker.owner_user_id is distinct from tenant.owner_id or marker.restaurant_name is distinct from tenant.name
    or binding.auth_user_id is null or binding.restaurant_id is distinct from tenant.id
    or binding.branch_id is distinct from input_branch_id
    or binding.test_session_id is distinct from marker.test_session_id
    or policy.real_intake_status is distinct from 'BLOCKED'
    or policy.test_only_intake_status is distinct from 'READY'
    or exists(select 1 from public.customer_account_memberships m
      join public.customer_accounts a on a.id=m.account_id
      where a.auth_user_id=auth.uid() and m.restaurant_id<>tenant.id) then
    raise exception 'TEST_ONLY_JOIN_SCOPE_DENIED' using errcode='42501';
  end if;
  terms_status:=public.get_platform_customer_terms_status();
  if terms_status->>'status' is distinct from 'ACCEPTED'
    or (terms_status->'document'->>'restaurant_id')::uuid is distinct from tenant.id
    or (terms_status->'document'->>'test_only')::boolean is not true then
    raise exception 'PLATFORM_TERMS_ACCEPTANCE_REQUIRED' using errcode='42501';
  end if;
  select * into platform_receipt from public.platform_customer_terms_receipts
    where id=(terms_status->'receipt'->>'id')::uuid and auth_user_id=auth.uid()
      and test_restaurant_id=tenant.id and test_session_id=marker.test_session_id for share;
  if platform_receipt.id is null then raise exception 'PLATFORM_TERMS_ACCEPTANCE_REQUIRED' using errcode='42501'; end if;
  select * into publication from public.at_legal_synthetic_test_publications
    where restaurant_id=tenant.id order by event_sequence desc limit 1 for share;
  if publication.id is null or publication.action is distinct from 'PUBLISH_TEST'
    or publication.bundle_id is distinct from input_bundle_id
    or publication.bundle_hash is distinct from input_bundle_hash
    or publication.manifest->>'test_only' is distinct from 'true'
    or publication.manifest->>'restaurant_id' is distinct from tenant.id::text
    or publication.bundle_hash is distinct from public.at_legal_synthetic_manifest_hash_internal(publication.manifest) then
    raise exception 'TEST_ONLY_JOIN_BUNDLE_STALE' using errcode='42501';
  end if;
  return publication;
end;
$function$;

create or replace function public.join_customer_account_test_only_at_legal(
  input_restaurant_slug text,input_branch_id uuid,input_terms_accepted boolean,
  input_privacy_acknowledged boolean,input_bundle_id text,input_bundle_hash text,
  input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare tenant public.restaurants%rowtype; publication public.at_legal_synthetic_test_publications%rowtype;
  prior public.customer_test_only_join_receipts%rowtype;
  receipt public.customer_test_only_join_receipts%rowtype;
  platform_status jsonb; account_value public.customer_accounts%rowtype;
  joined jsonb; customer_value public.customers%rowtype;
begin
  if input_terms_accepted is distinct from true or input_privacy_acknowledged is distinct from true
    or input_request_id is null then raise exception 'TEST_ONLY_JOIN_EXPLICIT_ACCEPTANCE_REQUIRED' using errcode='22023'; end if;
  select * into tenant from public.restaurants where slug=trim(input_restaurant_slug) and status='draft';
  publication:=public.require_platform_test_only_join_scope_internal(
    tenant.id,input_branch_id,input_bundle_id,input_bundle_hash);
  select * into account_value from public.customer_accounts
    where auth_user_id=auth.uid() and disabled_at is null for update;
  if account_value.id is null or account_value.phone is null then
    raise exception 'TEST_ONLY_JOIN_ACCOUNT_REQUIRED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(account_value.id::text||':'||tenant.id::text,0));
  select * into prior from public.customer_test_only_join_receipts where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.auth_user_id is distinct from auth.uid() or prior.account_id is distinct from account_value.id
      or prior.restaurant_id is distinct from tenant.id or prior.branch_id is distinct from input_branch_id
      or prior.bundle_id is distinct from input_bundle_id or prior.bundle_hash is distinct from input_bundle_hash then
      raise exception 'TEST_ONLY_JOIN_REQUEST_CONFLICT' using errcode='22023';
    end if;
    return jsonb_build_object('joined',false,'test_only',true,'legal_receipt',
      jsonb_build_object('request_id',prior.request_id,'bundle_id',prior.bundle_id,
        'bundle_hash',prior.bundle_hash,'accepted_at',prior.accepted_at,'idempotent',true));
  end if;
  if exists(select 1 from public.customers c where c.restaurant_id=tenant.id
    and c.normalized_phone=account_value.normalized_phone) then
    raise exception 'TEST_ONLY_JOIN_CUSTOMER_ALREADY_EXISTS' using errcode='42501';
  end if;
  platform_status:=public.get_platform_customer_terms_status();
  insert into public.platform_test_join_permits(
    transaction_id,backend_pid,auth_user_id,restaurant_id,branch_id,account_id,expected_phone,test_session_id)
  values(txid_current(),pg_backend_pid(),auth.uid(),tenant.id,input_branch_id,account_value.id,
    account_value.phone,(platform_status->'document'->>'test_session_id'));
  joined:=public.join_customer_account_core_internal(tenant.slug,null,null,true);
  select c.* into customer_value from public.customer_account_memberships m
    join public.customers c on c.id=m.customer_id and c.restaurant_id=m.restaurant_id
    where m.account_id=account_value.id and m.restaurant_id=tenant.id;
  if customer_value.id is null or customer_value.branch_id is distinct from input_branch_id
    or customer_value.is_test_customer is not true
    or customer_value.test_session_id is distinct from (platform_status->'document'->>'test_session_id') then
    raise exception 'TEST_ONLY_JOIN_CUSTOMER_MISMATCH' using errcode='42501';
  end if;
  insert into public.customer_test_only_join_receipts(
    request_id,auth_user_id,account_id,restaurant_id,branch_id,customer_id,bundle_publication_id,
    bundle_id,bundle_hash,legal_version,legal_sha256,privacy_version,privacy_sha256,
    platform_terms_receipt_id,test_session_id)
  values(input_request_id,auth.uid(),account_value.id,tenant.id,input_branch_id,customer_value.id,
    publication.id,publication.bundle_id,publication.bundle_hash,
    publication.manifest->'legal'->>'version',publication.manifest->'legal'->>'sha256',
    publication.manifest->'privacy'->>'version',publication.manifest->'privacy'->>'sha256',
    (platform_status->'receipt'->>'id')::uuid,customer_value.test_session_id)
  returning * into receipt;
  delete from public.platform_test_join_permits where transaction_id=txid_current() and backend_pid=pg_backend_pid();
  return joined||jsonb_build_object('test_only',true,'legal_receipt',
    jsonb_build_object('request_id',receipt.request_id,'bundle_id',receipt.bundle_id,
      'bundle_hash',receipt.bundle_hash,'legal_version',receipt.legal_version,
      'legal_sha256',receipt.legal_sha256,'privacy_version',receipt.privacy_version,
      'privacy_sha256',receipt.privacy_sha256,'accepted_at',receipt.accepted_at,'idempotent',false));
end;
$function$;

revoke all on function public.platform_test_join_permit_active_internal(uuid) from public,anon,authenticated,service_role;

revoke all on function public.join_customer_account_core_internal(text,text,text,boolean) from public,anon,authenticated,service_role;

revoke all on function public.require_platform_test_only_join_scope_internal(uuid,uuid,text,text) from public,anon,authenticated,service_role;

revoke all on function public.register_restaurant_customer(text,text,text,date) from public,anon,authenticated;

revoke all on function public.join_customer_account_test_only_at_legal(text,uuid,boolean,boolean,text,text,uuid) from public,anon,service_role;

grant execute on function public.join_customer_account_test_only_at_legal(text,uuid,boolean,boolean,text,text,uuid) to authenticated;

commit;
