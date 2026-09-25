\set ON_ERROR_STOP on
begin;
create temporary table identity_fixture (
  owner_id uuid default gen_random_uuid(),
  user_id uuid default gen_random_uuid(),
  organization_id uuid default gen_random_uuid(),
  restaurant_id uuid default gen_random_uuid(),
  branch_id uuid default gen_random_uuid(),
  customer_id uuid default gen_random_uuid(),
  account_id uuid default gen_random_uuid(),
  session_id uuid default gen_random_uuid(),
  request_id uuid default gen_random_uuid(),
  correlation_id uuid default gen_random_uuid()
);
insert into identity_fixture default values;
grant select on identity_fixture to authenticated;
set local session_replication_role=replica;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select user_id,'authenticated','authenticated',user_id||'@example.invalid',now(),'{}','{}',now(),now()
from identity_fixture;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select owner_id,'authenticated','authenticated',owner_id||'@example.invalid',now(),'{}','{}',now(),now()
from identity_fixture;
insert into auth.sessions(id,user_id,created_at,updated_at)
select session_id,user_id,now(),now() from identity_fixture;
insert into public.organizations(id,owner_id,name)
select organization_id,owner_id,'D4B SYNTHETIC LOCAL' from identity_fixture;
insert into public.restaurants(id,owner_id,name,slug,organization_id)
select restaurant_id,owner_id,'D4B SYNTHETIC LOCAL','d4b-'||left(restaurant_id::text,12),
  organization_id from identity_fixture;
insert into public.branches(id,organization_id,restaurant_id,name,slug,country)
select branch_id,organization_id,restaurant_id,'D4B LOCAL','d4b-'||left(branch_id::text,12),'AT'
from identity_fixture;
update public.restaurants r set primary_branch_id=f.branch_id from identity_fixture f
where r.id=f.restaurant_id;
insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,
  selected_plan,plan_key,payment_status)
select organization_id,branch_id,'active','active','BASIC','BASIC','paid'
from identity_fixture;
insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,name,
  customer_code,membership_status,is_test_customer,normalized_phone,phone)
select customer_id,restaurant_id,organization_id,branch_id,user_id,
  'D4B Synthetic Customer','D4B-LOCAL','active',true,'+436600000001','+436600000001'
from identity_fixture;
insert into public.customer_accounts(id,auth_user_id,email,first_name,email_confirmed_at)
select account_id,user_id,user_id||'@example.invalid','D4B',now() from identity_fixture;
insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
select account_id,restaurant_id,customer_id from identity_fixture;
set local session_replication_role=origin;
create temporary table identity_before as
select (select to_jsonb(a) from public.customer_accounts a where a.id=f.account_id) account_row,
  (select to_jsonb(m) from public.customer_account_memberships m
    where m.account_id=f.account_id and m.restaurant_id=f.restaurant_id) membership_row,
  (select count(*) from public.customer_qr_tokens t where t.customer_id=f.customer_id) token_count,
  (select count(*) from public.audit_log l where l.restaurant_id=f.restaurant_id) audit_count
from identity_fixture f;

do $claims$
declare f identity_fixture%rowtype;
begin
  select * into f from identity_fixture;
  perform set_config('request.jwt.claim.sub',f.user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f.user_id::text,
    'session_id',f.session_id::text,'auth_time',extract(epoch from now())::bigint,
    'role','authenticated')::text,true);
end;
$claims$;
set local role authenticated;

do $test$
declare f identity_fixture%rowtype; slug_value text; context_value jsonb;
begin
  select * into f from identity_fixture;
  slug_value:='d4b-'||left(f.restaurant_id::text,12);
  for i in 1..24 loop
    perform public.get_customer_account();
    perform public.get_customer_restaurant_context(slug_value);
    perform public.get_customer_restaurant_access(slug_value,null);
    perform public.open_customer_account_membership(f.restaurant_id);
  end loop;
  context_value:=public.get_customer_restaurant_access(slug_value,null);
  if context_value->>'token_valid' is distinct from 'false' then
    raise exception 'missing token accepted'; end if;
end;
$test$;
reset role;
do $assert$
declare f identity_fixture%rowtype; b identity_before%rowtype;
begin
  select * into f from identity_fixture; select * into b from identity_before;
  if (select count(*) from public.customer_qr_tokens where customer_id=f.customer_id)<>b.token_count
    or (select count(*) from public.audit_log where restaurant_id=f.restaurant_id)<>b.audit_count
    or (select to_jsonb(a) from public.customer_accounts a where id=f.account_id)<>b.account_row
    or (select to_jsonb(m) from public.customer_account_memberships m
      where account_id=f.account_id and restaurant_id=f.restaurant_id)<>b.membership_row then
    raise exception 'read path wrote'; end if;
end;
$assert$;
set local role authenticated;
do $recovery$
declare f identity_fixture%rowtype; slug_value text; response_value jsonb; token_value text;
  affected integer;
begin
  select * into f from identity_fixture;
  slug_value:='d4b-'||left(f.restaurant_id::text,12);
  response_value:=public.recover_customer_membership_token(slug_value,f.request_id,f.correlation_id);
  token_value:=response_value->>'customer_token';
  if token_value is null or length(token_value)<64 then raise exception 'recovery failed'; end if;
  if public.get_customer_restaurant_access(slug_value,token_value)->>'token_valid' is distinct from 'true' then
    raise exception 'issued token invalid'; end if;
  begin
    perform public.recover_customer_membership_token(slug_value,f.request_id,f.correlation_id);
    raise exception 'recovery replay accepted';
  exception when sqlstate '42501' then null;
  end;
  perform set_config('wuxuai.test_customer_token',token_value,true);
  for i in 1..24 loop
    perform public.get_customer_account();
    perform public.get_customer_restaurant_access(slug_value,token_value);
    perform public.get_customer_identity_summary(slug_value,token_value);
  end loop;
  if public.record_customer_login_success(slug_value) is distinct from true then
    raise exception 'first login audit missing'; end if;
  if public.record_customer_login_success(slug_value) is distinct from false then
    raise exception 'login audit duplicated'; end if;
  if public.set_customer_portal_context(slug_value,gen_random_uuid(),gen_random_uuid())
    is distinct from false then raise exception 'initial context marked changed'; end if;
  if public.set_customer_portal_context(slug_value,gen_random_uuid(),gen_random_uuid())
    is distinct from false then raise exception 'same context marked changed'; end if;
  begin
    update public.customer_qr_tokens set active=false where customer_id=f.customer_id;
    get diagnostics affected=row_count;
    if affected<>0 then raise exception 'customer direct token DML wrote'; end if;
  exception when sqlstate '42501' then null;
  end;
end;
$recovery$;
reset role;
do $final$
declare f identity_fixture%rowtype; token_count integer; audit_count integer;
begin
  select * into f from identity_fixture;
  select count(*) into token_count from public.customer_qr_tokens
    where customer_id=f.customer_id and active;
  select count(*) into audit_count from public.audit_log where restaurant_id=f.restaurant_id;
  if token_count<>1 or audit_count<>(select b.audit_count+3 from identity_before b) then
    raise exception 'recovery side effects invalid'; end if;
end;
$final$;
do $foreign_claims$
declare f identity_fixture%rowtype;
begin
  select * into f from identity_fixture;
  perform set_config('request.jwt.claim.sub',f.owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f.owner_id::text,
    'role','authenticated')::text,true);
end;
$foreign_claims$;
set local role authenticated;
do $denied$
declare f identity_fixture%rowtype; affected integer;
begin
  select * into f from identity_fixture;
  begin
    perform public.get_customer_restaurant_context('d4b-'||left(f.restaurant_id::text,12));
    raise exception 'foreign identity read accepted';
  exception when sqlstate '42501' then null;
  end;
  begin
    update public.customer_qr_tokens set active=false where customer_id=f.customer_id;
    get diagnostics affected=row_count;
    if affected<>0 then raise exception 'direct token DML wrote'; end if;
  exception when sqlstate '42501' then null;
  end;
end;
$denied$;
reset role;
set local role anon;
do $anon$
begin
  begin
    perform public.get_customer_account();
    raise exception 'anonymous account read accepted';
  exception when sqlstate '42501' then null;
  end;
end;
$anon$;
reset role;
rollback;
