\set ON_ERROR_STOP on
begin;
set local timezone = 'UTC';
set local session_replication_role = replica;

create function pg_temp.u(label text) returns uuid language sql immutable as $$
  select (substr(md5(label),1,8)||'-'||substr(md5(label),9,4)||'-4'||substr(md5(label),14,3)
    ||'-8'||substr(md5(label),18,3)||'-'||substr(md5(label),21,12))::uuid
$$;

insert into auth.users(id,aud,role,email,email_confirmed_at,created_at,updated_at) values
  (pg_temp.u('inbox-owner'),'authenticated','authenticated','inbox-owner@example.invalid',now(),now(),now()),
  (pg_temp.u('inbox-customer'),'authenticated','authenticated','inbox-customer@example.invalid',now(),now(),now()),
  (pg_temp.u('inbox-other'),'authenticated','authenticated','inbox-other@example.invalid',now(),now(),now());
insert into public.organizations(id,owner_id,name,status)
values(pg_temp.u('inbox-org'),pg_temp.u('inbox-owner'),'PRO INBOX LOCAL','active');
insert into public.restaurants(id,owner_id,name,slug,status,organization_id,
  operational_ready,security_ready,legal_ready,onboarding_status)
values(pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-owner'),'PRO INBOX LOCAL',
  'pro-inbox-local','active',pg_temp.u('inbox-org'),true,true,true,'completed');
insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city,status)
values(pg_temp.u('inbox-branch'),pg_temp.u('inbox-org'),pg_temp.u('inbox-restaurant'),
  'PRO INBOX LOCAL','pro-inbox-local-main','AT','Synthetic 1','1000','Vienna','active');
update public.restaurants set primary_branch_id=pg_temp.u('inbox-branch')
where id=pg_temp.u('inbox-restaurant');
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
values(pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-org'),pg_temp.u('inbox-branch'),
  pg_temp.u('inbox-owner'),'owner');
insert into public.platform_test_tenant_registry(restaurant_id,restaurant_name,organization_id,
  owner_user_id,test_session_id,marked_by)
values(pg_temp.u('inbox-restaurant'),'PRO INBOX LOCAL',pg_temp.u('inbox-org'),
  pg_temp.u('inbox-owner'),'pro-inbox-local',pg_temp.u('inbox-owner'));
update public.business_verification_environment
set environment='STAGING',change_ref='PRO_INBOX_LOCAL_TEST' where singleton;

insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,name,
  customer_code,membership_status,is_test_customer,normalized_phone,phone,points_balance) values
  (pg_temp.u('inbox-customer-row'),pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-org'),
   pg_temp.u('inbox-branch'),pg_temp.u('inbox-customer'),'Synthetic Customer','INBOX-1',
   'active',true,'+436600000101','+436600000101',0),
  (pg_temp.u('inbox-other-row'),pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-org'),
   pg_temp.u('inbox-branch'),pg_temp.u('inbox-other'),'Other Customer','INBOX-2',
   'active',true,'+436600000102','+436600000102',0);
insert into public.customer_accounts(id,auth_user_id,email,first_name,email_confirmed_at) values
  (pg_temp.u('inbox-account'),pg_temp.u('inbox-customer'),'inbox-customer@example.invalid','Synthetic',now()),
  (pg_temp.u('inbox-other-account'),pg_temp.u('inbox-other'),'inbox-other@example.invalid','Other',now());
insert into public.customer_account_memberships(account_id,restaurant_id,customer_id) values
  (pg_temp.u('inbox-account'),pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-customer-row')),
  (pg_temp.u('inbox-other-account'),pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-other-row'));
insert into public.customer_qr_tokens(id,restaurant_id,customer_id,organization_id,branch_id,token_hash) values
  (pg_temp.u('inbox-token-row'),pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-customer-row'),
   pg_temp.u('inbox-org'),pg_temp.u('inbox-branch'),public.hash_public_token('synthetic-inbox-token')),
  (pg_temp.u('inbox-other-token-row'),pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-other-row'),
   pg_temp.u('inbox-org'),pg_temp.u('inbox-branch'),public.hash_public_token('synthetic-other-token'));
insert into public.restaurant_offers(id,restaurant_id,branch_id,offer_type,title,short_description,
  valid_from,valid_to,status,is_active,publication_version)
values(pg_temp.u('inbox-offer'),pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-branch'),
  'NEWS','Synthetic Offer','Synthetic offer',now()-interval '1 day',now()+interval '10 days',
  'DRAFT',false,0);
insert into public.rewards(id,restaurant_id,organization_id,branch_id,title,description,
  required_points,active,is_starter_reward)
values(pg_temp.u('inbox-reward'),pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-org'),
  pg_temp.u('inbox-branch'),'Synthetic Reward','Synthetic reward',10,true,false);

create temporary table pro_inbox_entitlements (
  restaurant_id uuid primary key,
  offer_enabled boolean not null,
  reward_enabled boolean not null
);
insert into pro_inbox_entitlements values(pg_temp.u('inbox-restaurant'),true,true);
create or replace function public.restaurant_entitlement_enabled(input_restaurant_id uuid,input_entitlement text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select case input_entitlement
    when 'offer_notifications' then coalesce((select offer_enabled from pg_temp.pro_inbox_entitlements where restaurant_id=input_restaurant_id),false)
    when 'reward_notifications' then coalesce((select reward_enabled from pg_temp.pro_inbox_entitlements where restaurant_id=input_restaurant_id),false)
    else false end
$$;

set local session_replication_role = origin;

do $test$
declare inserted boolean;
begin
  for i in 1..24 loop
    inserted:=public.enqueue_customer_pro_in_app_notification_internal(
      pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-customer-row'),
      'POINT_REWARD_AVAILABLE',pg_temp.u('inbox-reward')::text,null,pg_temp.u('inbox-reward'),now());
  end loop;
  if (select count(*) from public.customer_pro_in_app_notifications
      where customer_id=pg_temp.u('inbox-customer-row') and event_type='POINT_REWARD_AVAILABLE')<>1 then
    raise exception 'REWARD_DEDUPLICATION_FAILED';
  end if;
end $test$;

insert into public.points_transactions(
  id,restaurant_id,organization_id,branch_id,customer_id,type,points,reason,
  amount_cents,collection_source,idempotency_key,created_at
) values (
  pg_temp.u('inbox-points-event'),pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-org'),
  pg_temp.u('inbox-branch'),pg_temp.u('inbox-other-row'),'earn',10,'Synthetic threshold',
  1000,'customer_initiated',pg_temp.u('inbox-points-request'),statement_timestamp()
);

do $test$ begin
  if (select count(*) from public.customer_pro_in_app_notifications
      where customer_id=pg_temp.u('inbox-other-row')
        and event_type='POINT_REWARD_AVAILABLE')<>1 then
    raise exception 'REWARD_THRESHOLD_TRIGGER_FAILED';
  end if;
end $test$;

update public.restaurant_offers set status='PUBLISHED',is_active=true,
  publication_version=1,published_at=now()
where id=pg_temp.u('inbox-offer');

do $test$
begin
  if (select count(*) from public.customer_pro_in_app_notifications
      where event_type='OFFER_PUBLISHED')<>2 then
    raise exception 'OFFER_FANOUT_OR_TEST_CUSTOMER_SCOPE_FAILED';
  end if;
  update public.restaurant_offers set title=title where id=pg_temp.u('inbox-offer');
  if (select count(*) from public.customer_pro_in_app_notifications
      where event_type='OFFER_PUBLISHED')<>2 then
    raise exception 'OFFER_RETRY_DEDUPLICATION_FAILED';
  end if;
end $test$;

select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.u('inbox-customer'),
  'role','authenticated')::text,true) as ignored \gset
set local role authenticated;
do $test$
declare inbox jsonb; notification_id uuid;
begin
  inbox:=public.get_customer_pro_in_app_inbox('pro-inbox-local','synthetic-inbox-token');
  if (inbox->>'available')::boolean is not true
    or (inbox->>'unread_count')::integer<>2
    or jsonb_array_length(inbox->'items')<>2 then
    raise exception 'CUSTOMER_INBOX_MISMATCH: %',inbox;
  end if;
  notification_id:=(inbox->'items'->0->>'id')::uuid;
  inbox:=public.mark_customer_pro_in_app_notification_read(
    'pro-inbox-local','synthetic-inbox-token',notification_id);
  if (inbox->>'unread_count')::integer<>1 then raise exception 'READ_COUNT_MISMATCH: %',inbox; end if;
end $test$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.u('inbox-owner'),
  'role','authenticated')::text,true) as ignored \gset
set local role authenticated;
do $test$ begin
  perform public.get_customer_pro_in_app_inbox('pro-inbox-local','synthetic-inbox-token');
  raise exception 'OWNER_WITH_CUSTOMER_TOKEN_WAS_NOT_BLOCKED';
exception when sqlstate '42501' then
  if sqlerrm<>'PRO_IN_APP_CUSTOMER_ROLE_DENIED' then raise; end if;
end $test$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('role','anon')::text,true) as ignored \gset
set local role anon;
do $test$ begin
  perform public.get_customer_pro_in_app_inbox('pro-inbox-local','synthetic-inbox-token');
  raise exception 'ANONYMOUS_WITH_CUSTOMER_TOKEN_WAS_NOT_BLOCKED';
exception when sqlstate '42501' then
  if sqlerrm<>'PRO_IN_APP_AUTH_REQUIRED' then raise; end if;
end $test$;
reset role;

update pro_inbox_entitlements set offer_enabled=false,reward_enabled=false;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.u('inbox-customer'),
  'role','authenticated')::text,true) as ignored \gset
set local role authenticated;
do $test$
declare inbox jsonb;
begin
  inbox:=public.get_customer_pro_in_app_inbox('pro-inbox-local','synthetic-inbox-token');
  if (inbox->>'available')::boolean or (inbox->>'unread_count')::integer<>0
    or jsonb_array_length(inbox->'items')<>0 then
    raise exception 'DOWNGRADE_DID_NOT_HIDE_INBOX: %',inbox;
  end if;
end $test$;
reset role;

do $test$
declare before_count bigint;
begin
  select count(*) into before_count from public.customer_pro_in_app_notifications;
  if public.enqueue_customer_pro_in_app_notification_internal(
      pg_temp.u('inbox-restaurant'),pg_temp.u('inbox-customer-row'),
      'OFFER_PUBLISHED','blocked-after-downgrade',pg_temp.u('inbox-offer'),null,now()) then
    raise exception 'BASIC_OR_DOWNGRADE_EVENT_WAS_CREATED';
  end if;
  if (select count(*) from public.customer_pro_in_app_notifications)<>before_count then
    raise exception 'DOWNGRADE_CHANGED_NOTIFICATION_COUNT';
  end if;
end $test$;

-- Deleted sources leave the historical event safe to read with generic copy.
set local session_replication_role = replica;
update public.customer_pro_in_app_notifications set offer_id=null
where restaurant_id=pg_temp.u('inbox-restaurant') and event_type='OFFER_PUBLISHED';
update public.customer_pro_in_app_notifications set reward_id=null
where restaurant_id=pg_temp.u('inbox-restaurant') and event_type='POINT_REWARD_AVAILABLE';
set local session_replication_role = origin;
update pro_inbox_entitlements set offer_enabled=true,reward_enabled=true;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.u('inbox-customer'),
  'role','authenticated')::text,true) as ignored \gset
set local role authenticated;
do $test$
declare inbox jsonb;
begin
  inbox:=public.get_customer_pro_in_app_inbox('pro-inbox-local','synthetic-inbox-token');
  if inbox->>'available' <> 'true'
    or not exists(select 1 from jsonb_array_elements(inbox->'items') item
      where item->>'event_type'='OFFER_PUBLISHED' and item->>'title'='Neues Angebot')
    or not exists(select 1 from jsonb_array_elements(inbox->'items') item
      where item->>'event_type'='POINT_REWARD_AVAILABLE' and item->>'title'='Belohnung erreicht') then
    raise exception 'DELETED_SOURCE_FALLBACK_FAILED: %',inbox;
  end if;
end $test$;
reset role;

rollback;
select 'PRO_CUSTOMER_IN_APP_INBOX_PASS';
