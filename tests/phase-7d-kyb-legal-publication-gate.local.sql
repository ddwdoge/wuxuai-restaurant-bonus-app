\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('70000000-0000-4000-8000-000000000001','authenticated','authenticated',
  'synthetic-legal-gate@example.invalid','local-only',now(),now(),now());
insert into public.organizations(id,owner_id,name)
values('70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','SYNTHETIC LEGAL GATE');
insert into public.restaurants(id,owner_id,name,slug,status,organization_id)
values('70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001',
  'SYNTHETIC LEGAL GATE','synthetic-legal-gate','active','70000000-0000-4000-8000-000000000002');
update public.restaurants set activation_status='pending_activation'
where id='70000000-0000-4000-8000-000000000003';
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city)
values('70000000-0000-4000-8000-000000000004','70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000003','SYNTHETIC LEGAL GATE','synthetic-legal-gate-main',
  'AT','Synthetic Road 1','1000','Synthetic City');
update public.restaurants set primary_branch_id='70000000-0000-4000-8000-000000000004'
where id='70000000-0000-4000-8000-000000000003';
insert into public.branch_subscriptions(
  id,organization_id,branch_id,status,subscription_status,plan_key,selected_plan,payment_status
) values(
  '70000000-0000-4000-8000-000000000014','70000000-0000-4000-8000-000000000002',
  '70000000-0000-4000-8000-000000000004','pending_activation','pending_activation','BASIC','BASIC','not_required'
);
insert into public.organization_legal_profiles(
  id,organization_id,company_name,legal_form,registered_address_source,address_source_restaurant_id,address_source_branch_id,
  email,commercial_register_number,vat_id,responsible_person,legal_review_status,updated_by
) values(
  '70000000-0000-4000-8000-000000000005','70000000-0000-4000-8000-000000000002',
  'Synthetic Legal GmbH','GmbH','restaurant','70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000004',
  'synthetic-legal-gate@example.invalid','FN 123456 a','ATU12345678','Synthetic Representative','reviewed',
  '70000000-0000-4000-8000-000000000001'
);
insert into public.restaurant_legal_profiles(
  restaurant_id,company_name,legal_form,street,postal_code,city,country,email,
  commercial_register_number,vat_id,complaint_contact,legal_review_status,operator_profile_id,
  registered_address_source,address_source_restaurant_id
) values(
  '70000000-0000-4000-8000-000000000003','Synthetic Legal GmbH','GmbH','Synthetic Road 1','1000',
  'Synthetic City','AT','synthetic-legal-gate@example.invalid','FN 123456 a','ATU12345678',
  'synthetic-legal-gate@example.invalid','reviewed','70000000-0000-4000-8000-000000000005',
  'restaurant','70000000-0000-4000-8000-000000000003'
);
insert into public.business_verification_cases(
  id,restaurant_id,country_code,verification_method,status,test_only,decided_at,expires_at,created_by
) values(
  '70000000-0000-4000-8000-000000000006','70000000-0000-4000-8000-000000000003',
  'AT','MANUAL','VERIFIED',false,now(),now()+interval '1 year','70000000-0000-4000-8000-000000000001'
);
insert into public.business_verified_profile_revisions(
  id,case_id,revision,legal_name,legal_form,register_identifier,vat_id,business_street,
  business_postal_code,business_city,business_country,authorized_representative,status,
  decision_ref,created_by
) values(
  '70000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000006',1,
  'Synthetic Legal GmbH','GmbH','FN 123456 a','ATU12345678','Synthetic Road 1','1000',
  'Synthetic City','AT','Synthetic Representative','VERIFIED',
  '70000000-0000-4000-8000-000000000008','70000000-0000-4000-8000-000000000001'
);
insert into public.platform_admins(user_id,role,active)
values('70000000-0000-4000-8000-000000000001','platform_admin',true);
insert into public.legal_documents(id,restaurant_id,document_type,title)
values('70000000-0000-4000-8000-000000000009','70000000-0000-4000-8000-000000000003',
  'participation_terms','Synthetic Terms');
insert into public.legal_document_versions(
  id,document_id,restaurant_id,version,effective_date,rendered_text,document_hash,status,created_by
) values(
  '70000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000009',
  '70000000-0000-4000-8000-000000000003','1',current_date,'Synthetic only',repeat('a',64),'draft',
  '70000000-0000-4000-8000-000000000001'
);

set local session_replication_role=origin;

do $test$
declare payload jsonb;
begin
  if public.legal_operator_publication_ready_internal('70000000-0000-4000-8000-000000000003') then
    raise exception 'gate unexpectedly open without manual decision';
  end if;
  payload:=public.get_public_legal_center('synthetic-legal-gate',null);
  if payload->'roles'->>'program_operator' is not null or payload->'imprint' <> '{}'::jsonb then
    raise exception 'unapproved operator data exposed';
  end if;
  begin
    update public.legal_document_versions set status='published'
      where id='70000000-0000-4000-8000-000000000010';
    raise exception 'publication unexpectedly succeeded';
  exception when insufficient_privilege then
    if sqlerrm <> 'LEGAL_OPERATOR_MANUAL_APPROVAL_REQUIRED' then raise; end if;
  end;
end
$test$;

update public.country_kyb_intake_policies set real_intake_status='READY',legal_status='VERIFIED',
  privacy_status='VERIFIED',document_catalog_status='VERIFIED',retention_status='VERIFIED'
where country_code='AT';
insert into public.legal_operator_publication_decisions(
  id,restaurant_id,case_id,profile_revision_id,action,field_mapping_version,reason_code,
  redacted_reason,actor_id,aal2_verified_at,session_expires_at,auth_session_sha256,
  request_id,correlation_id
) values(
  '70000000-0000-4000-8000-000000000011','70000000-0000-4000-8000-000000000003',
  '70000000-0000-4000-8000-000000000006','70000000-0000-4000-8000-000000000007','APPROVED',
  'AT_V1_LEGAL_OPERATOR_V1','SYNTHETIC_MANUAL_REVIEW','Synthetic local manual review only',
  '70000000-0000-4000-8000-000000000001',clock_timestamp(),clock_timestamp()+interval '1 hour',
  repeat('b',64),'70000000-0000-4000-8000-000000000012',
  '70000000-0000-4000-8000-000000000013'
);

do $test$
begin
  if not public.legal_operator_publication_ready_internal('70000000-0000-4000-8000-000000000003') then
    raise exception 'valid explicit approval did not open the source gate';
  end if;

  if not exists (select 1 from public.restaurants
      where id='70000000-0000-4000-8000-000000000003'
        and activation_status='pending_activation') then
    raise exception 'publication approval changed restaurant activation';
  end if;
  if not exists (select 1 from public.branch_subscriptions
      where id='70000000-0000-4000-8000-000000000014'
        and status='pending_activation' and subscription_status='pending_activation'
        and payment_status='not_required' and trial_started_at is null and trial_ends_at is null
        and current_period_start is null and current_period_end is null
        and stripe_customer_id is null and stripe_subscription_id is null) then
    raise exception 'publication approval changed subscription, trial or Stripe state';
  end if;
  if exists (select 1 from public.billing_trial_claims
      where restaurant_id='70000000-0000-4000-8000-000000000003')
    or exists (select 1 from public.commercial_pro_access_grants
      where restaurant_id='70000000-0000-4000-8000-000000000003')
    or exists (select 1 from public.restaurant_capacity_addon_entitlements
      where restaurant_id='70000000-0000-4000-8000-000000000003') then
    raise exception 'publication approval created trial, entitlement or grant state';
  end if;
end
$test$;

set local session_replication_role=replica;
update public.organization_legal_profiles set company_name='Changed After Review'
where id='70000000-0000-4000-8000-000000000005';
set local session_replication_role=origin;

do $test$
begin
  if public.legal_operator_publication_ready_internal('70000000-0000-4000-8000-000000000003') then
    raise exception 'profile change did not require re-review';
  end if;
end
$test$;

rollback;
select 'LOCAL_KYB_LEGAL_PUBLICATION_GATE_PASS';
