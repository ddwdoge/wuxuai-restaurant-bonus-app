\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
-- Exact, task-owned local fixture replacement for diagnostic reruns only.
delete from public.customer_qr_tokens where customer_id='ca200000-0000-4000-8000-000000000051';
delete from public.customers where id='ca200000-0000-4000-8000-000000000051';
delete from public.branch_subscriptions where id='ca200000-0000-4000-8000-000000000041';
delete from public.platform_test_tenant_registry where restaurant_id='ca200000-0000-4000-8000-000000000021';
delete from public.restaurant_members where restaurant_id='ca200000-0000-4000-8000-000000000021';
delete from public.branches where id='ca200000-0000-4000-8000-000000000031';
delete from public.restaurants where id='ca200000-0000-4000-8000-000000000021';
delete from public.organizations where id='ca200000-0000-4000-8000-000000000011';
insert into public.organizations(id,owner_id,name)
values ('ca200000-0000-4000-8000-000000000011',:'owner_id','WUXUAI TEST MENU E2E');
insert into public.restaurants(id,owner_id,name,slug,organization_id,status,onboarding_status)
values ('ca200000-0000-4000-8000-000000000021',:'owner_id','WUXUAI TEST MENU E2E','synthetic-menu-e2e',
 'ca200000-0000-4000-8000-000000000011','active','completed');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,status)
values ('ca200000-0000-4000-8000-000000000031','ca200000-0000-4000-8000-000000000011',
 'ca200000-0000-4000-8000-000000000021','WUXUAI TEST MENU E2E','synthetic-menu-e2e-main','AT','active');
update public.restaurants set primary_branch_id='ca200000-0000-4000-8000-000000000031'
where id='ca200000-0000-4000-8000-000000000021';
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
values('ca200000-0000-4000-8000-000000000021','ca200000-0000-4000-8000-000000000011',
 'ca200000-0000-4000-8000-000000000031',:'owner_id','owner');
insert into public.branch_subscriptions(id,organization_id,branch_id,status,plan_key,selected_plan,subscription_status,payment_status,current_period_end)
values('ca200000-0000-4000-8000-000000000041','ca200000-0000-4000-8000-000000000011',
 'ca200000-0000-4000-8000-000000000031','active','BASIC','BASIC','active','manual',now()+interval '30 days');
insert into public.customers(id,restaurant_id,organization_id,branch_id,name,customer_code,membership_status,phone,normalized_phone)
values('ca200000-0000-4000-8000-000000000051','ca200000-0000-4000-8000-000000000021',
 'ca200000-0000-4000-8000-000000000011','ca200000-0000-4000-8000-000000000031',
 'Synthetic Catalog Guest','MENU-E2E','active','+436600000151','+436600000151');
insert into public.customer_qr_tokens(restaurant_id,organization_id,branch_id,customer_id,token_hash,active)
values('ca200000-0000-4000-8000-000000000021','ca200000-0000-4000-8000-000000000011',
 'ca200000-0000-4000-8000-000000000031','ca200000-0000-4000-8000-000000000051',
 public.hash_public_token(:'customer_token'),true);
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by,marked_at)
values('ca200000-0000-4000-8000-000000000021','WUXUAI TEST MENU E2E',
 'ca200000-0000-4000-8000-000000000011',:'owner_id','TEST_ONLY_MENU_E2E',:'owner_id',now());
update public.business_verification_environment set environment='STAGING' where singleton;
set local session_replication_role = origin;
commit;
