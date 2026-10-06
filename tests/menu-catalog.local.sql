\set ON_ERROR_STOP on
begin;
set local session_replication_role = replica;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('ca100000-0000-4000-8000-000000000001','authenticated','authenticated','menu-owner@example.invalid',now(),now()),
 ('ca100000-0000-4000-8000-000000000002','authenticated','authenticated','menu-foreign@example.invalid',now(),now());
insert into public.organizations(id,owner_id,name) values
 ('ca100000-0000-4000-8000-000000000011','ca100000-0000-4000-8000-000000000001','WUXUAI TEST MENU A'),
 ('ca100000-0000-4000-8000-000000000012','ca100000-0000-4000-8000-000000000002','WUXUAI TEST MENU B');
insert into public.restaurants(id,owner_id,name,slug,organization_id,status) values
 ('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000001','WUXUAI TEST MENU A','synthetic-menu-a','ca100000-0000-4000-8000-000000000011','active'),
 ('ca100000-0000-4000-8000-000000000022','ca100000-0000-4000-8000-000000000002','WUXUAI TEST MENU B','synthetic-menu-b','ca100000-0000-4000-8000-000000000012','active');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,status) values
 ('ca100000-0000-4000-8000-000000000031','ca100000-0000-4000-8000-000000000011','ca100000-0000-4000-8000-000000000021','WUXUAI TEST MENU A','synthetic-menu-a-main','AT','active'),
 ('ca100000-0000-4000-8000-000000000032','ca100000-0000-4000-8000-000000000012','ca100000-0000-4000-8000-000000000022','WUXUAI TEST MENU B','synthetic-menu-b-main','AT','active');
update public.restaurants set primary_branch_id = case
 when id='ca100000-0000-4000-8000-000000000021' then 'ca100000-0000-4000-8000-000000000031'::uuid
 else 'ca100000-0000-4000-8000-000000000032'::uuid end
where id in ('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000022');
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role) values
 ('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000011','ca100000-0000-4000-8000-000000000031','ca100000-0000-4000-8000-000000000001','owner'),
 ('ca100000-0000-4000-8000-000000000022','ca100000-0000-4000-8000-000000000012','ca100000-0000-4000-8000-000000000032','ca100000-0000-4000-8000-000000000002','owner');
insert into public.branch_subscriptions(id,organization_id,branch_id,status,plan_key,selected_plan,subscription_status,payment_status,current_period_end) values
 ('ca100000-0000-4000-8000-000000000041','ca100000-0000-4000-8000-000000000011','ca100000-0000-4000-8000-000000000031','active','BASIC','BASIC','active','manual',now()+interval '30 days'),
 ('ca100000-0000-4000-8000-000000000042','ca100000-0000-4000-8000-000000000012','ca100000-0000-4000-8000-000000000032','active','BASIC','BASIC','active','manual',now()+interval '30 days');
insert into public.customers(id,restaurant_id,organization_id,branch_id,name,customer_code,membership_status,phone,normalized_phone) values
 ('ca100000-0000-4000-8000-000000000051','ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000011','ca100000-0000-4000-8000-000000000031','Synthetic Guest A','MENU-A','active','+436600000051','+436600000051'),
 ('ca100000-0000-4000-8000-000000000052','ca100000-0000-4000-8000-000000000022','ca100000-0000-4000-8000-000000000012','ca100000-0000-4000-8000-000000000032','Synthetic Guest B','MENU-B','active','+436600000052','+436600000052');
insert into public.customer_qr_tokens(restaurant_id,organization_id,branch_id,customer_id,token_hash,active) values
 ('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000011','ca100000-0000-4000-8000-000000000031','ca100000-0000-4000-8000-000000000051',public.hash_public_token('local-menu-token-a'),true),
 ('ca100000-0000-4000-8000-000000000022','ca100000-0000-4000-8000-000000000012','ca100000-0000-4000-8000-000000000032','ca100000-0000-4000-8000-000000000052',public.hash_public_token('local-menu-token-b'),true);
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,owner_user_id,test_session_id,marked_by,marked_at)
values('ca100000-0000-4000-8000-000000000021','WUXUAI TEST MENU A','ca100000-0000-4000-8000-000000000011',
 'ca100000-0000-4000-8000-000000000001','TEST_ONLY_MENU_LOCAL','ca100000-0000-4000-8000-000000000001',now());
update public.business_verification_environment set environment='STAGING' where singleton;
set local session_replication_role = origin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'MENU_TEST_FAIL: %',label; end if; end $$;
select pg_temp.assert_true(public.restaurant_activation_state_internal('ca100000-0000-4000-8000-000000000021')->>'operational'='true','fixture operational');
select pg_temp.assert_true((select not public and file_size_limit=10485760 from storage.buckets where id='restaurant-menu-private'),'private bucket and size');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.restaurant_menu_catalogs','SELECT'),'catalog direct select denied');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.restaurant_menu_test_addon_events','SELECT'),'addon audit direct select denied');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.resolve_customer_menu_object_path(text,text,uuid,integer)','EXECUTE'),'private path rpc denied');
select pg_temp.assert_true(not public.restaurant_menu_access_internal('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000031'),'basic without addon');
select pg_temp.assert_true(public.get_customer_menu_catalog('synthetic-menu-a','local-menu-token-a')->>'available'='false','no publication');

set local role authenticated;
select set_config('request.jwt.claim.sub','ca100000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true(public.get_owner_menu_catalog('ca100000-0000-4000-8000-000000000021')->>'draft_pages'='[]','owner read');
do $$ begin
 begin perform public.get_owner_menu_catalog('ca100000-0000-4000-8000-000000000022'); raise exception 'FOREIGN_OWNER_BYPASS';
 exception when insufficient_privilege then null; end;
 begin perform public.manage_owner_menu_catalog('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000032','PUBLISH',null,0,0); raise exception 'BRANCH_BYPASS';
 exception when insufficient_privilege then null; end;
 begin perform public.manage_owner_menu_catalog('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000031','PUBLISH',null,0,0); raise exception 'BASIC_PUBLISH_BYPASS';
 exception when insufficient_privilege then null; end;
 begin perform public.set_platform_test_menu_addon('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000031','GRANT',null,now()+interval '1 hour','synthetic local',gen_random_uuid()); raise exception 'ADMIN_BYPASS';
 exception when insufficient_privilege then null; end;
 begin perform 1 from public.restaurant_menu_catalogs; raise exception 'DIRECT_CATALOG_BYPASS';
 exception when insufficient_privilege then null; end;
 begin perform 1 from public.restaurant_menu_test_addon_events; raise exception 'DIRECT_ADDON_BYPASS';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

insert into public.restaurant_menu_test_addon_events(id,restaurant_id,organization_id,branch_id,action,starts_at,expires_at,actor_id,request_id,payload_hash,reason)
values('ca100000-0000-4000-8000-000000000061','ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000011',
 'ca100000-0000-4000-8000-000000000031','GRANT',now()-interval '1 minute',now()+interval '1 hour',
 'ca100000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('a',64),'synthetic local test');
select pg_temp.assert_true(public.restaurant_menu_access_internal('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000031'),'basic test addon');
insert into public.restaurant_menu_catalogs(restaurant_id,organization_id,branch_id,draft_pages,draft_revision)
values('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000011','ca100000-0000-4000-8000-000000000031',
 jsonb_build_array(jsonb_build_object('id','ca100000-0000-4000-8000-000000000071','storage_path','private/test.jpg',
 'mime_type','image/jpeg','byte_size',123,'sha256',repeat('b',64),'filename','test.jpg')),1);
set local role authenticated;
select public.manage_owner_menu_catalog('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000031','PUBLISH',null,1,0);
select public.manage_owner_menu_catalog('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000031','SAVE_TEXT',null,1,1,'Synthetic text overview',0);
select public.manage_owner_menu_catalog('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000031','PUBLISH_TEXT',null,2,1,null,0);
reset role;
set local role anon;
select pg_temp.assert_true(public.get_customer_menu_catalog('synthetic-menu-a','local-menu-token-a')->>'available'='true','published basic addon');
select pg_temp.assert_true(public.get_customer_menu_catalog('synthetic-menu-a','local-menu-token-a')->>'text'='Synthetic text overview','independent text read');
select pg_temp.assert_true(public.get_customer_menu_catalog('synthetic-menu-a','local-menu-token-a')->>'text_hash'=encode(extensions.digest('Synthetic text overview','sha256'),'hex'),'exact text hash');
select pg_temp.assert_true(public.get_customer_menu_catalog('synthetic-menu-a','local-menu-token-a')->>'text_published_at' is not null,'text timestamp');
select pg_temp.assert_true(public.get_customer_menu_catalog('synthetic-menu-a','local-menu-token-a')->>'published_at' is not null,'media timestamp');
select pg_temp.assert_true(public.get_customer_menu_catalog('synthetic-menu-a','local-menu-token-b')->>'available'='false','foreign token');
select pg_temp.assert_true(public.get_customer_menu_catalog('synthetic-menu-b','local-menu-token-a')->>'available'='false','foreign tenant');
select pg_temp.assert_true(public.get_customer_menu_catalog('synthetic-menu-a','local-menu-token-a')->>'pages' not like '%storage_path%','no private path exposed');
do $$ begin
 begin perform public.resolve_customer_menu_object_path('synthetic-menu-a','local-menu-token-a','ca100000-0000-4000-8000-000000000071',1); raise exception 'PATH_RPC_BYPASS';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert_true(public.resolve_customer_menu_object_path('synthetic-menu-a','local-menu-token-a','ca100000-0000-4000-8000-000000000071',1)->>'available'='true','service path');
insert into public.restaurant_menu_test_addon_events(restaurant_id,organization_id,branch_id,action,grant_id,actor_id,request_id,payload_hash,reason)
values('ca100000-0000-4000-8000-000000000021','ca100000-0000-4000-8000-000000000011',
 'ca100000-0000-4000-8000-000000000031','REVOKE','ca100000-0000-4000-8000-000000000061',
 'ca100000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('c',64),'synthetic local test');
select pg_temp.assert_true(public.get_customer_menu_catalog('synthetic-menu-a','local-menu-token-a')->>'available'='false','revoke blocks read');
select pg_temp.assert_true(public.resolve_customer_menu_object_path('synthetic-menu-a','local-menu-token-a','ca100000-0000-4000-8000-000000000071',1)->>'available'='false','revoke blocks file');
select pg_temp.assert_true((select draft_revision=2 and published_version=1 and text_version=1 from public.restaurant_menu_catalogs where restaurant_id='ca100000-0000-4000-8000-000000000021'),'both drafts retained');
rollback;
select 'MENU_CATALOG_DB_PASS';
