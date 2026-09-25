\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('7d4b0000-0000-4000-8000-000000000001','authenticated','authenticated',
  'd4b-upgrade@example.invalid',now(),'{}','{}',now(),now());
insert into public.organizations(id,owner_id,name)
values('7d4b0000-0000-4000-8000-000000000002',
  '7d4b0000-0000-4000-8000-000000000001','D4B UPGRADE LOCAL');
insert into public.restaurants(id,owner_id,name,slug,organization_id)
values('7d4b0000-0000-4000-8000-000000000003',
  '7d4b0000-0000-4000-8000-000000000001','D4B UPGRADE LOCAL','d4b-upgrade-local',
  '7d4b0000-0000-4000-8000-000000000002');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country)
values('7d4b0000-0000-4000-8000-000000000004',
  '7d4b0000-0000-4000-8000-000000000002',
  '7d4b0000-0000-4000-8000-000000000003','D4B UPGRADE','d4b-upgrade-local','AT');
update public.restaurants set primary_branch_id='7d4b0000-0000-4000-8000-000000000004'
where id='7d4b0000-0000-4000-8000-000000000003';
insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,
  selected_plan,plan_key,payment_status)
values('7d4b0000-0000-4000-8000-000000000002',
  '7d4b0000-0000-4000-8000-000000000004',
  'active','active','BASIC','BASIC','paid');
insert into public.customers(id,restaurant_id,organization_id,branch_id,name,
  customer_code,membership_status,is_test_customer,normalized_phone,phone)
values
('7d4b0000-0000-4000-8000-000000000005',
 '7d4b0000-0000-4000-8000-000000000003',
 '7d4b0000-0000-4000-8000-000000000002',
 '7d4b0000-0000-4000-8000-000000000004','D4B Synthetic A','D4B-A',
 'active',true,'+436600000001','+436600000001'),
('7d4b0000-0000-4000-8000-000000000006',
 '7d4b0000-0000-4000-8000-000000000003',
 '7d4b0000-0000-4000-8000-000000000002',
 '7d4b0000-0000-4000-8000-000000000004','D4B Synthetic B','D4B-B',
 'active',true,'+436600000002','+436600000002');
insert into public.customer_qr_tokens(id,restaurant_id,customer_id,organization_id,branch_id,
  token_hash,active,created_at,expires_at)
values
('7d4b0000-0000-4000-8000-000000000011',
 '7d4b0000-0000-4000-8000-000000000003',
 '7d4b0000-0000-4000-8000-000000000005',
 '7d4b0000-0000-4000-8000-000000000002',
 '7d4b0000-0000-4000-8000-000000000004',
 public.hash_public_token(gen_random_uuid()::text),true,now()-interval '2 days',null),
('7d4b0000-0000-4000-8000-000000000012',
 '7d4b0000-0000-4000-8000-000000000003',
 '7d4b0000-0000-4000-8000-000000000005',
 '7d4b0000-0000-4000-8000-000000000002',
 '7d4b0000-0000-4000-8000-000000000004',
 public.hash_public_token(gen_random_uuid()::text),true,now()-interval '1 day',null),
('7d4b0000-0000-4000-8000-000000000013',
 '7d4b0000-0000-4000-8000-000000000003',
 '7d4b0000-0000-4000-8000-000000000006',
 '7d4b0000-0000-4000-8000-000000000002',
 '7d4b0000-0000-4000-8000-000000000004',
 public.hash_public_token(gen_random_uuid()::text),true,now()-interval '1 day',
 now()-interval '1 hour');
commit;
