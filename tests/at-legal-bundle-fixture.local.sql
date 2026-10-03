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

insert into public.legal_documents(id,restaurant_id,document_type,title)
values('70000000-0000-4000-8000-000000000015','70000000-0000-4000-8000-000000000003','privacy','Synthetic Privacy');
insert into public.legal_master_templates(id,document_type,version,language,title,content_template,rendered_text_template,review_status,active,created_at)
values('70000000-0000-4000-8000-000000000016','participation_terms','LOCAL-192-1','de-AT','Synthetic Terms','{}','Synthetic only','REVIEWED',true,clock_timestamp()+interval '1 day'),
('70000000-0000-4000-8000-000000000017','privacy','LOCAL-192-1','de-AT','Synthetic Privacy','{}','Synthetic only','REVIEWED',true,clock_timestamp()+interval '1 day');
insert into public.legal_document_versions(id,document_id,restaurant_id,version,effective_date,rendered_text,document_hash,status,created_by,master_template_id)
values('70000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000009','70000000-0000-4000-8000-000000000003','LOCAL-192-1',current_date,'Synthetic terms',repeat('a',64),'published','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000016'),
('70000000-0000-4000-8000-000000000018','70000000-0000-4000-8000-000000000015','70000000-0000-4000-8000-000000000003','LOCAL-192-1',current_date,'Synthetic privacy',repeat('b',64),'published','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000017');
insert into public.legal_document_version_jurisdictions(document_version_id,restaurant_id,legal_country,resolved_from)
values('70000000-0000-4000-8000-000000000010','70000000-0000-4000-8000-000000000003','AT','primary_business_branch'),
('70000000-0000-4000-8000-000000000018','70000000-0000-4000-8000-000000000003','AT','primary_business_branch');
update public.legal_documents set current_published_version_id=case when document_type='privacy' then '70000000-0000-4000-8000-000000000018'::uuid else '70000000-0000-4000-8000-000000000010'::uuid end
where restaurant_id='70000000-0000-4000-8000-000000000003';
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
values('70000000-0000-4000-8000-000000000030','70000000-0000-4000-8000-000000000001','totp','verified',now(),now());
insert into auth.sessions(id,user_id,factor_id,aal,not_after,created_at,updated_at)
values('70000000-0000-4000-8000-000000000031','70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000030','aal2',now()+interval '1 hour',now(),now());
insert into auth.users(id,aud,role,created_at,updated_at) select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',now(),now() from generate_series(40,45) n;
insert into public.restaurant_members(user_id,restaurant_id,organization_id,branch_id,role) values
('70000000-0000-4000-8000-000000000040','70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000004','owner'),
('70000000-0000-4000-8000-000000000041','70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000004','manager'),
('70000000-0000-4000-8000-000000000042','70000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000004','staff');
insert into public.customer_accounts(id,auth_user_id,email,first_name)
values('70000000-0000-4000-8000-000000000046','70000000-0000-4000-8000-000000000043','synthetic-192@example.invalid','Synthetic');
set local session_replication_role=origin;
