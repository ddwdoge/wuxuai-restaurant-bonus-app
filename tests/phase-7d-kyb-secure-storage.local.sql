\set ON_ERROR_STOP on
begin;

create temporary table kyb_fixture (
  owner_a uuid default gen_random_uuid(),
  owner_b uuid default gen_random_uuid(),
  staff_a uuid default gen_random_uuid(),
  customer_user_a uuid default gen_random_uuid(),
  customer_a uuid default gen_random_uuid(),
  customer_account_a uuid default gen_random_uuid(),
  admin_id uuid default gen_random_uuid(),
  admin_factor uuid default gen_random_uuid(),
  foreign_factor uuid default gen_random_uuid(),
  admin_session uuid default gen_random_uuid(),
  organization_a uuid default gen_random_uuid(),
  organization_b uuid default gen_random_uuid(),
  restaurant_a uuid default gen_random_uuid(),
  restaurant_b uuid default gen_random_uuid(),
  branch_a uuid default gen_random_uuid(),
  branch_b uuid default gen_random_uuid(),
  submission_a uuid default gen_random_uuid(),
  submission_b uuid default gen_random_uuid(),
  correlation_a uuid default gen_random_uuid(),
  correlation_b uuid default gen_random_uuid()
);
insert into kyb_fixture default values;
grant select on kyb_fixture to authenticated, anon, service_role;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'kyb-local-' || user_id || '@example.invalid', '', clock_timestamp(), '{}', '{}',
  clock_timestamp(), clock_timestamp()
from kyb_fixture fixture
cross join lateral unnest(array[
  fixture.owner_a, fixture.owner_b, fixture.staff_a, fixture.customer_user_a, fixture.admin_id
]) user_id;

insert into public.platform_admins(user_id, role, active)
select admin_id, 'platform_admin', true from kyb_fixture;
insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at)
select admin_factor, admin_id, 'Local KYB TOTP', 'totp', 'verified', clock_timestamp(), clock_timestamp()
from kyb_fixture;
insert into auth.mfa_factors(id, user_id, friendly_name, factor_type, status, created_at, updated_at)
select foreign_factor, owner_b, 'Foreign local TOTP', 'totp', 'verified', clock_timestamp(), clock_timestamp()
from kyb_fixture;
insert into auth.sessions(id, user_id, created_at, updated_at, factor_id, aal, not_after)
select admin_session, admin_id, clock_timestamp(), clock_timestamp(), admin_factor, 'aal2', null
from kyb_fixture;

set local session_replication_role = replica;
insert into public.organizations(id, owner_id, name)
select organization_a, owner_a, 'KYB LOCAL A' from kyb_fixture
union all select organization_b, owner_b, 'KYB LOCAL B' from kyb_fixture;
insert into public.restaurants(id, owner_id, name, slug, organization_id, activation_status)
select restaurant_a, owner_a, 'KYB LOCAL A', 'kyb-a-' || substr(restaurant_a::text, 1, 8), organization_a, 'pending_activation'
from kyb_fixture
union all
select restaurant_b, owner_b, 'KYB LOCAL B', 'kyb-b-' || substr(restaurant_b::text, 1, 8), organization_b, 'pending_activation'
from kyb_fixture;
insert into public.branches(id, organization_id, restaurant_id, name, slug, country, address, postal_code, city)
select branch_a, organization_a, restaurant_a, 'KYB LOCAL A', 'kyb-a-' || substr(branch_a::text, 1, 8),
  'AT', 'Synthetic Road 1', '1000', 'Synthetic City' from kyb_fixture
union all
select branch_b, organization_b, restaurant_b, 'KYB LOCAL B', 'kyb-b-' || substr(branch_b::text, 1, 8),
  'AT', 'Synthetic Road 2', '1000', 'Synthetic City' from kyb_fixture;
update public.restaurants restaurant
set primary_branch_id = case
  when restaurant.id = fixture.restaurant_a then fixture.branch_a
  else fixture.branch_b
end
from kyb_fixture fixture
where restaurant.id in (fixture.restaurant_a, fixture.restaurant_b);
insert into public.restaurant_members(restaurant_id, organization_id, branch_id, user_id, role)
select restaurant_a, organization_a, branch_a, owner_a, 'owner' from kyb_fixture
union all select restaurant_b, organization_b, branch_b, owner_b, 'owner' from kyb_fixture
union all select restaurant_a, organization_a, branch_a, staff_a, 'staff' from kyb_fixture;
insert into public.customers(
  id, restaurant_id, organization_id, branch_id, auth_user_id, name,
  customer_code, points_balance, membership_status, is_test_customer,
  normalized_phone, phone
)
select customer_a, restaurant_a, organization_a, branch_a, customer_user_a,
  'KYB Synthetic Customer', 'KYB-LOCAL', 0, 'active', true,
  '+436600000091', '+436600000091'
from kyb_fixture;
insert into public.customer_accounts(id, auth_user_id, email, first_name, email_confirmed_at)
select customer_account_a, customer_user_a,
  'kyb-customer-' || customer_user_a || '@example.invalid', 'KYB', clock_timestamp()
from kyb_fixture;
insert into public.customer_account_memberships(account_id, restaurant_id, customer_id)
select customer_account_a, restaurant_a, customer_a from kyb_fixture;
insert into public.branch_subscriptions(
  organization_id, branch_id, status, subscription_status, selected_plan, plan_key, payment_status
)
select organization_a, branch_a, 'pending_activation', 'pending_activation', 'BASIC', 'BASIC', 'not_required'
from kyb_fixture
union all
select organization_b, branch_b, 'pending_activation', 'pending_activation', 'BASIC', 'BASIC', 'not_required'
from kyb_fixture;
insert into public.organization_legal_profiles(
  organization_id, company_name, legal_form, registered_address_source,
  address_source_restaurant_id, address_source_branch_id, email, responsible_person
)
select organization_a, 'KYB Local A GmbH', 'GmbH', 'restaurant', restaurant_a, branch_a,
  'kyb-a@example.invalid', 'Synthetic Representative A' from kyb_fixture
union all
select organization_b, 'KYB Local B GmbH', 'GmbH', 'restaurant', restaurant_b, branch_b,
  'kyb-b@example.invalid', 'Synthetic Representative B' from kyb_fixture;
update public.country_launch_readiness
set status = 'ready', evidence_ref = 'LOCAL_SYNTHETIC_ONLY',
  document_version_refs = case when check_key = 'required_documents'
    then array['LOCAL_SYNTHETIC_ONLY'] else '{}'::text[] end
where country_code = 'AT';
update public.country_launch_policy set enabled = true where country_code = 'AT';
set local session_replication_role = origin;

create function pg_temp.kyb_denied(statement text) returns void language plpgsql as $function$
begin
  begin
    execute statement;
  exception
    when insufficient_privilege or invalid_parameter_value or unique_violation
      or raise_exception or no_data_found then
      return;
  end;
  raise exception 'KYB_EXPECTED_DENIAL: %', statement;
end;
$function$;
grant execute on function pg_temp.kyb_denied(text) to authenticated, anon, service_role;

-- Both owners create their pending manual-verification case. No activation occurs.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', owner_a, 'role', 'authenticated'
)::text, true) from kyb_fixture;
select set_config('request.jwt.claim.sub', owner_a::text, true) from kyb_fixture;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select public.submit_pending_business_verification(
  restaurant_a, 'MANUAL', 'GISA', submission_a, correlation_a
) from kyb_fixture;
reset role;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', owner_b, 'role', 'authenticated'
)::text, true) from kyb_fixture;
select set_config('request.jwt.claim.sub', owner_b::text, true) from kyb_fixture;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select public.submit_pending_business_verification(
  restaurant_b, 'MANUAL', 'GISA', submission_b, correlation_b
) from kyb_fixture;
reset role;

create temporary table kyb_document_fixture (
  document_a uuid,
  object_a text,
  reserve_a uuid,
  complete_a uuid,
  delete_a uuid,
  correlation_a uuid
);
grant select, insert on kyb_document_fixture to authenticated, anon, service_role;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', owner_a, 'role', 'authenticated'
)::text, true) from kyb_fixture;
select set_config('request.jwt.claim.sub', owner_a::text, true) from kyb_fixture;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $function$
declare
  fixture kyb_fixture%rowtype;
  answer jsonb;
  reserve_request uuid := gen_random_uuid();
  completion_request uuid := gen_random_uuid();
  deletion_request uuid := gen_random_uuid();
  correlation uuid := gen_random_uuid();
begin
  select * into fixture from kyb_fixture;
  answer := public.reserve_business_verification_document_upload(
    fixture.restaurant_a, 'GISA_EXTRACT', 'application/pdf', reserve_request, correlation
  );
  if answer->>'status' <> 'PENDING_UPLOAD' or (answer->>'idempotent')::boolean then
    raise exception 'KYB_RESERVATION_FAILED';
  end if;
  if public.reserve_business_verification_document_upload(
      fixture.restaurant_a, 'GISA_EXTRACT', 'application/pdf', reserve_request, correlation
    )->>'document_id' is distinct from answer->>'document_id' then
    raise exception 'KYB_RESERVATION_IDEMPOTENCY_FAILED';
  end if;
  insert into kyb_document_fixture(document_a, object_a, reserve_a, complete_a, delete_a, correlation_a)
  values ((answer->>'document_id')::uuid, answer->>'object_name', reserve_request,
    completion_request, deletion_request, correlation);
end;
$function$;

-- The owner may upload only the exact reserved object. Object replacement and deletion have no browser policy.
insert into storage.objects(bucket_id, name, owner_id, metadata)
select 'business-verification-documents', object_a, fixture.owner_a,
  jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
from kyb_document_fixture document
cross join kyb_fixture fixture;
select pg_temp.kyb_denied(format(
  'insert into storage.objects(bucket_id,name,owner_id,metadata) values(''business-verification-documents'',%L,%L,''{"mimetype":"application/pdf","size":1024}''::jsonb)',
  restaurant_a::text || '/unreserved/document.pdf', owner_a
)) from kyb_fixture;
update storage.objects set name = name || '-changed'
where bucket_id = 'business-verification-documents'
  and name = (select object_a from kyb_document_fixture);
select pg_temp.kyb_denied(format(
  'delete from storage.objects where bucket_id=''business-verification-documents'' and name=%L', object_a
)) from kyb_document_fixture;
do $function$
begin
  if (select count(*) from storage.objects
      where bucket_id = 'business-verification-documents'
        and name = (select object_a from kyb_document_fixture)) <> 1 then
    raise exception 'KYB_STORAGE_IMMUTABILITY_FAILED';
  end if;
end;
$function$;

do $function$
declare
  document kyb_document_fixture%rowtype;
  answer jsonb;
begin
  select * into document from kyb_document_fixture;
  answer := public.complete_business_verification_document_upload(
    document.document_a, repeat('a', 64), document.complete_a, document.correlation_a
  );
  if answer->>'status' <> 'UPLOADED' or (answer->>'idempotent')::boolean then
    raise exception 'KYB_COMPLETION_FAILED';
  end if;
  if not (public.complete_business_verification_document_upload(
      document.document_a, repeat('a', 64), document.complete_a, document.correlation_a
    )->>'idempotent')::boolean then
    raise exception 'KYB_COMPLETION_IDEMPOTENCY_FAILED';
  end if;
end;
$function$;
reset role;

-- Foreign owners, Staff, anonymous and service_role cannot read or mutate another tenant's KYB evidence.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', owner_b, 'role', 'authenticated'
)::text, true) from kyb_fixture;
select set_config('request.jwt.claim.sub', owner_b::text, true) from kyb_fixture;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $function$
declare fixture kyb_fixture%rowtype;
begin
  select * into fixture from kyb_fixture;
  if auth.uid() is distinct from fixture.owner_b then
    raise exception 'KYB_FOREIGN_OWNER_CLAIM_MISMATCH';
  end if;
end;
$function$;
select pg_temp.kyb_denied(format(
  'select public.list_business_verification_documents(%L)', restaurant_a
)) from kyb_fixture;
select pg_temp.kyb_denied(format(
  'select public.get_business_verification_document_object(%L)', document_a
)) from kyb_document_fixture;
select pg_temp.kyb_denied('select public.list_platform_kyb_review_queue()');
do $function$
begin
  if (select count(*) from storage.objects where bucket_id = 'business-verification-documents') <> 0 then
    raise exception 'KYB_FOREIGN_STORAGE_READ_LEAK';
  end if;
end;
$function$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', staff_a, 'role', 'authenticated'
)::text, true) from kyb_fixture;
select set_config('request.jwt.claim.sub', staff_a::text, true) from kyb_fixture;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select pg_temp.kyb_denied(format(
  'select public.list_business_verification_documents(%L)', restaurant_a
)) from kyb_fixture;
select pg_temp.kyb_denied(format(
  'select public.reserve_business_verification_document_upload(%L,''GISA_EXTRACT'',''application/pdf'',gen_random_uuid(),gen_random_uuid())',
  restaurant_a
)) from kyb_fixture;
select pg_temp.kyb_denied('select public.list_platform_kyb_review_queue()');
reset role;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', customer_user_a, 'role', 'authenticated'
)::text, true) from kyb_fixture;
select set_config('request.jwt.claim.sub', customer_user_a::text, true) from kyb_fixture;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select pg_temp.kyb_denied(format(
  'select public.list_business_verification_documents(%L)', restaurant_a
)) from kyb_fixture;
select pg_temp.kyb_denied(format(
  'select public.reserve_business_verification_document_upload(%L,''GISA_EXTRACT'',''application/pdf'',gen_random_uuid(),gen_random_uuid())',
  restaurant_a
)) from kyb_fixture;
select pg_temp.kyb_denied(format(
  'select public.get_business_verification_document_object(%L)', document_a
)) from kyb_document_fixture;
select pg_temp.kyb_denied('select public.list_platform_kyb_review_queue()');
reset role;

set local role anon;
select pg_temp.kyb_denied(format(
  'select public.get_business_verification_document_object(%L)', document_a
)) from kyb_document_fixture;
reset role;
set local role service_role;
select pg_temp.kyb_denied(format(
  'select public.get_business_verification_document_object(%L)', document_a
)) from kyb_document_fixture;
select pg_temp.kyb_denied('select public.list_platform_kyb_review_queue()');
reset role;

-- A Platform role at AAL1 cannot read queue, detail, object metadata or Storage.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', admin_id, 'role', 'authenticated', 'aal', 'aal1', 'session_id', admin_session,
  'amr', jsonb_build_array(jsonb_build_object('method', 'password'))
)::text, true) from kyb_fixture;
select set_config('request.jwt.claim.sub', admin_id::text, true) from kyb_fixture;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
select pg_temp.kyb_denied('select public.list_platform_kyb_review_queue()');
select pg_temp.kyb_denied(format(
  'select public.get_platform_kyb_review_detail(%L)', submission_a
)) from kyb_fixture;
select pg_temp.kyb_denied(format(
  'select public.get_platform_kyb_document_object(%L)', document_a
)) from kyb_document_fixture;
do $function$
begin
  if (select count(*) from storage.objects where bucket_id = 'business-verification-documents') <> 0 then
    raise exception 'KYB_AAL1_STORAGE_READ_LEAK';
  end if;
end;
$function$;
reset role;

-- A forged AAL2 shape fails when the live session has no factor or another user's factor.
update auth.sessions set factor_id = null where id = (select admin_session from kyb_fixture);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', admin_id, 'role', 'authenticated', 'aal', 'aal2', 'session_id', admin_session,
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'totp', 'timestamp', extract(epoch from clock_timestamp())::bigint
  ))
)::text, true) from kyb_fixture;
set local role authenticated;
select pg_temp.kyb_denied('select public.list_platform_kyb_review_queue()');
reset role;
update auth.sessions set factor_id = (select foreign_factor from kyb_fixture)
where id = (select admin_session from kyb_fixture);
set local role authenticated;
select pg_temp.kyb_denied('select public.list_platform_kyb_review_queue()');
reset role;
update auth.sessions set factor_id = (select admin_factor from kyb_fixture)
where id = (select admin_session from kyb_fixture);

-- Current Platform reviewers require a live TOTP/AAL2 session through current_platform_role().
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', admin_id, 'role', 'authenticated', 'aal', 'aal2', 'session_id', admin_session,
  'amr', jsonb_build_array(jsonb_build_object(
    'method', 'totp', 'timestamp', extract(epoch from clock_timestamp())::bigint
  ))
)::text, true) from kyb_fixture;
select set_config('request.jwt.claim.sub', admin_id::text, true) from kyb_fixture;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $function$
declare
  fixture kyb_fixture%rowtype;
  document kyb_document_fixture%rowtype;
  detail jsonb;
begin
  select * into fixture from kyb_fixture;
  select * into document from kyb_document_fixture;
  if jsonb_array_length(public.list_platform_kyb_review_queue()) <> 1 then
    raise exception 'KYB_PLATFORM_QUEUE_FAILED';
  end if;
  detail := public.get_platform_kyb_review_detail(
    (public.list_platform_kyb_review_queue()->0->>'case_id')::uuid
  );
  if jsonb_array_length(detail->'documents') <> 1
    or jsonb_array_length(detail->'document_events') <> 2 then
    raise exception 'KYB_PLATFORM_DETAIL_FAILED';
  end if;
  if public.get_platform_kyb_document_object(document.document_a)->>'status' <> 'UPLOADED' then
    raise exception 'KYB_PLATFORM_OBJECT_FAILED';
  end if;
  if public.get_business_verification_document_object(document.document_a)->>'status' <> 'UPLOADED' then
    raise exception 'KYB_REVIEWER_READ_FAILED';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'business-verification-documents') <> 1 then
    raise exception 'KYB_AAL2_STORAGE_READ_FAILED';
  end if;
end;
$function$;
reset role;

-- The owner can request deletion, but neither the SQL row nor object is physically deleted.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', owner_a, 'role', 'authenticated'
)::text, true) from kyb_fixture;
select set_config('request.jwt.claim.sub', owner_a::text, true) from kyb_fixture;
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;
do $function$
declare
  document kyb_document_fixture%rowtype;
  answer jsonb;
begin
  select * into document from kyb_document_fixture;
  answer := public.request_business_verification_document_deletion(
    document.document_a, document.delete_a, document.correlation_a
  );
  if answer->>'status' <> 'DELETION_REQUESTED'
    or (answer->>'physical_delete_pending')::boolean is distinct from true then
    raise exception 'KYB_DELETION_REQUEST_FAILED';
  end if;
end;
$function$;
select pg_temp.kyb_denied('update public.business_verification_documents set status=''DELETED''');
select pg_temp.kyb_denied('delete from public.business_verification_document_events');
select pg_temp.kyb_denied(format(
  'select public.confirm_real_business_verification(%L,gen_random_uuid(),gen_random_uuid(),''CONFIRMED'')',
  restaurant_a
)) from kyb_fixture;
select pg_temp.kyb_denied(format(
  'update public.restaurants set activation_status=null,status=''active'' where id=%L', restaurant_a
)) from kyb_fixture;
select pg_temp.kyb_denied(format(
  'select public.require_restaurant_operational(%L,''KYB_LOCAL_TEST'')', restaurant_a
)) from kyb_fixture;
reset role;

do $function$
declare
  fixture kyb_fixture%rowtype;
  document kyb_document_fixture%rowtype;
begin
  select * into fixture from kyb_fixture;
  select * into document from kyb_document_fixture;
  if (select activation_status from public.restaurants where id = fixture.restaurant_a)
      is distinct from 'pending_activation' then
    raise exception 'KYB_PENDING_ACTIVATION_BYPASSED';
  end if;
  if (select subscription_status from public.branch_subscriptions where branch_id = fixture.branch_a)
      is distinct from 'pending_activation' then
    raise exception 'KYB_SUBSCRIPTION_ACTIVATED';
  end if;
  if (select count(*) from public.business_verification_documents where id = document.document_a) <> 1
    or (select count(*) from storage.objects where bucket_id = 'business-verification-documents'
      and name = document.object_a) <> 1 then
    raise exception 'KYB_EVIDENCE_DELETED';
  end if;
  if (select status from public.business_verification_documents where id = document.document_a)
      is distinct from 'DELETION_REQUESTED' then
    raise exception 'KYB_DOCUMENT_STATUS_UNEXPECTED';
  end if;
  if (select count(*) from public.business_verification_document_events
      where document_id = document.document_a) <> 3 then
    raise exception 'KYB_DOCUMENT_AUDIT_COUNT_UNEXPECTED';
  end if;
end;
$function$;

rollback;
select 'PHASE_7D_KYB_SECURE_STORAGE_PASS';
