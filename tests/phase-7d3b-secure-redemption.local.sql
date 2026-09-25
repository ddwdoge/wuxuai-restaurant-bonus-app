\set ON_ERROR_STOP on
begin;
create temporary table redemption_fixture (
  owner_id uuid default gen_random_uuid(),
  staff_id uuid default gen_random_uuid(),
  customer_user_id uuid default gen_random_uuid(),
  organization_id uuid default gen_random_uuid(),
  restaurant_id uuid default gen_random_uuid(),
  branch_id uuid default gen_random_uuid(),
  customer_id uuid default gen_random_uuid(),
  account_id uuid default gen_random_uuid(),
  reward_id uuid default gen_random_uuid(),
  other_reward_id uuid default gen_random_uuid(),
  extra_reward_1 uuid default gen_random_uuid(),
  extra_reward_2 uuid default gen_random_uuid(),
  extra_reward_3 uuid default gen_random_uuid(),
  welcome_reward_id uuid default gen_random_uuid(),
  birthday_reward_id uuid default gen_random_uuid(),
  welcome_gift_id uuid default gen_random_uuid(),
  birthday_gift_id uuid default gen_random_uuid()
);
insert into redemption_fixture default values;
grant select on redemption_fixture to service_role, authenticated, anon;

set local session_replication_role = replica;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select user_id,'authenticated','authenticated',user_id||'@example.invalid',now(),'{}','{}',now(),now()
from redemption_fixture f cross join lateral unnest(array[f.owner_id,f.staff_id,f.customer_user_id]) user_id;
insert into public.organizations(id,owner_id,name)
select organization_id,owner_id,'D3B SYNTHETIC LOCAL' from redemption_fixture;
insert into public.restaurants(id,owner_id,name,slug,organization_id)
select restaurant_id,owner_id,'D3B SYNTHETIC LOCAL','d3b-'||left(restaurant_id::text,12),
  organization_id from redemption_fixture;
insert into public.branches(id,organization_id,restaurant_id,name,slug,country)
select branch_id,organization_id,restaurant_id,'D3B LOCAL','d3b-'||left(branch_id::text,12),'AT'
from redemption_fixture;
update public.restaurants r set primary_branch_id=f.branch_id from redemption_fixture f where r.id=f.restaurant_id;
insert into public.branch_subscriptions(organization_id,branch_id,status,subscription_status,
  selected_plan,plan_key,payment_status)
select organization_id,branch_id,'active','active','BASIC','BASIC','paid'
from redemption_fixture;
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
select restaurant_id,organization_id,branch_id,owner_id,'owner' from redemption_fixture;
insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
select restaurant_id,organization_id,branch_id,staff_id,'staff' from redemption_fixture;
insert into public.staff_members(restaurant_id,organization_id,branch_id,auth_user_id,name,pin_hash,role,active,account_status)
select restaurant_id,organization_id,branch_id,staff_id,'D3B Staff','synthetic','staff',true,'active'
from redemption_fixture;
insert into public.customers(id,restaurant_id,organization_id,branch_id,auth_user_id,name,
  customer_code,points_balance,membership_status,is_test_customer,normalized_phone,phone)
select customer_id,restaurant_id,organization_id,branch_id,customer_user_id,
  'D3B Synthetic Customer','D3B-LOCAL',1000,'active',true,'+436600000001','+436600000001' from redemption_fixture;
insert into public.customer_accounts(id,auth_user_id,email,first_name,email_confirmed_at)
select account_id,customer_user_id,customer_user_id||'@example.invalid','D3B',now() from redemption_fixture;
insert into public.customer_account_memberships(account_id,restaurant_id,customer_id)
select account_id,restaurant_id,customer_id from redemption_fixture;
insert into public.rewards(id,restaurant_id,organization_id,branch_id,title,description,
  required_points,required_stamps,active,is_starter_reward)
select reward_id,restaurant_id,organization_id,branch_id,'D3B Reward','Synthetic local only',
  100,0,true,false from redemption_fixture;
insert into public.rewards(id,restaurant_id,organization_id,branch_id,title,description,
  required_points,required_stamps,active,is_starter_reward)
select other_reward_id,restaurant_id,organization_id,branch_id,'D3B Other Reward',
  'Synthetic local only',100,0,true,false from redemption_fixture;
insert into public.rewards(id,restaurant_id,organization_id,branch_id,title,description,
  required_points,required_stamps,active,is_starter_reward)
select item.reward_id,f.restaurant_id,f.organization_id,f.branch_id,'D3B Extra',
  'Synthetic local only',100,0,true,false
from redemption_fixture f cross join lateral (values
  (f.extra_reward_1),(f.extra_reward_2),(f.extra_reward_3)) item(reward_id);
insert into public.rewards(id,restaurant_id,organization_id,branch_id,title,description,
  required_points,required_stamps,active,is_starter_reward)
select item.reward_id,f.restaurant_id,f.organization_id,f.branch_id,item.title,'Synthetic local only',
  0,0,true,true from redemption_fixture f cross join lateral (values
    (f.welcome_reward_id,'D3B Welcome'),(f.birthday_reward_id,'D3B Birthday')) item(reward_id,title);
insert into public.customer_rewards(id,restaurant_id,organization_id,branch_id,customer_id,
  reward_id,status,gift_type,is_starter_reward,valid_from,valid_until)
select item.gift_id,f.restaurant_id,f.organization_id,f.branch_id,f.customer_id,item.reward_id,
  'active',item.gift_type,true,now()-interval '1 day',now()+interval '7 days'
from redemption_fixture f cross join lateral (values
  (f.welcome_gift_id,f.welcome_reward_id,'welcome'),
  (f.birthday_gift_id,f.birthday_reward_id,'birthday')) item(gift_id,reward_id,gift_type);
set local session_replication_role = origin;

do $check$
declare f redemption_fixture%rowtype; result jsonb; request_id uuid; correlation_id uuid;
  pin_value text; redemption_id uuid;
begin
  select * into f from redemption_fixture;
  if public.secure_redemption_actor_role(f.owner_id,f.restaurant_id,f.branch_id) <> 'OWNER'
    or public.secure_redemption_actor_role(f.staff_id,f.restaurant_id,f.branch_id) <> 'STAFF'
    or public.secure_redemption_actor_role(f.customer_user_id,f.restaurant_id,f.branch_id) <> 'CUSTOMER'
    or public.secure_redemption_actor_role(f.customer_user_id,f.restaurant_id,gen_random_uuid()) is not null then
    raise exception 'D3B_ROLE_BINDING_FAILED';
  end if;
  perform set_config('request.jwt.claim.role','service_role',true);
  result := public.secure_redemption_edge_mutate(f.owner_id,
    jsonb_build_object('action','rotate_pin','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
      'request_id',gen_random_uuid(),'correlation_id',gen_random_uuid(),'idempotency_key',gen_random_uuid()));
  pin_value := result->>'pin';
  if length(pin_value) <> 6 then raise exception 'D3B_PIN_ROTATION_FAILED'; end if;
  request_id := gen_random_uuid(); correlation_id := gen_random_uuid();
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','start','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
      'source_type','points','entitlement_id',f.reward_id,'request_id',request_id,
      'correlation_id',correlation_id,'idempotency_key',request_id));
  if result->>'status' <> 'REQUESTED' then raise exception 'D3B_START_FAILED %', result->>'error_code'; end if;
  redemption_id := (result->>'redemption_id')::uuid;
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','start','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
      'source_type','points','entitlement_id',f.reward_id,'request_id',request_id,
      'correlation_id',correlation_id,'idempotency_key',request_id));
  if result->>'redemption_id' <> redemption_id::text or result->>'already_started' <> 'true' then
    raise exception 'D3B_START_REPLAY_NOT_IDEMPOTENT'; end if;
  perform set_config('request.jwt.claim.sub',f.customer_user_id::text,true);
  result := public.get_secure_redemption_status('d3b-'||left(f.restaurant_id::text,12),redemption_id);
  if result->>'status' <> 'REQUESTED' or result->>'source_id' <> f.reward_id::text then
    raise exception 'D3B_OWN_STATUS_UNAVAILABLE'; end if;
  result := public.get_secure_redemption_status('foreign-tenant',redemption_id);
  if result->>'found' <> 'false' then raise exception 'D3B_STATUS_TENANT_LEAK'; end if;
  perform set_config('request.jwt.claim.sub',f.staff_id::text,true);
  result := public.get_secure_redemption_queue('d3b-'||left(f.restaurant_id::text,12));
  if jsonb_array_length(result->'requests') <> 1 then raise exception 'D3B_STAFF_QUEUE_UNAVAILABLE'; end if;
  begin
    perform public.get_secure_redemption_queue('foreign-tenant');
    raise exception 'D3B_FOREIGN_QUEUE_OPEN';
  exception when insufficient_privilege then
    if sqlerrm <> 'REDEMPTION_STAFF_REQUIRED' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',f.customer_user_id::text,true);
  begin
    perform public.get_secure_redemption_queue('d3b-'||left(f.restaurant_id::text,12));
    raise exception 'D3B_CUSTOMER_QUEUE_OPEN';
  exception when insufficient_privilege then
    if sqlerrm <> 'REDEMPTION_STAFF_REQUIRED' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','',true);
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','verify_pin','redemption_id',redemption_id,'pin',pin_value,
      'request_id',gen_random_uuid(),'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
  if result->>'status' <> 'PIN_VERIFIED' then raise exception 'D3B_PIN_VERIFY_FAILED %', result->>'error_code'; end if;
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','swipe','redemption_id',redemption_id,
      'request_id',gen_random_uuid(),'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
  if result->>'status' <> 'REDEEMED' then raise exception 'D3B_SWIPE_FAILED %', result->>'error_code'; end if;
  if (select points_balance from public.customers where id=f.customer_id) <> 900 then
    raise exception 'D3B_POINTS_INCORRECT';
  end if;
end;
$check$;

do $check$
declare f redemption_fixture%rowtype; result jsonb; test_redemption_id uuid; correlation_id uuid;
  wrong_pin text; pin_hash_value text; attempt integer;
begin
  select * into f from redemption_fixture;
  perform set_config('request.jwt.claim.role','service_role',true);
  correlation_id := gen_random_uuid();
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','start','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
      'source_type','points','entitlement_id',f.reward_id,'request_id',gen_random_uuid(),
      'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
  test_redemption_id := (result->>'redemption_id')::uuid;
  if test_redemption_id is null then raise exception 'D3B_STAFF_START_FAILED %', result->>'error_code'; end if;
  begin
    perform public.secure_redemption_edge_mutate(f.customer_user_id,
      jsonb_build_object('action','swipe','redemption_id',test_redemption_id,
        'request_id',gen_random_uuid(),'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
    raise exception 'D3B_SELF_SWIPE_BYPASS';
  exception when insufficient_privilege then
    if sqlerrm <> 'REDEMPTION_CONFIRMATION_REQUIRED' then raise; end if;
  end;
  result := public.secure_redemption_edge_mutate(f.staff_id,
    jsonb_build_object('action','approve','redemption_id',test_redemption_id,
      'request_id',gen_random_uuid(),'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
  if result->>'status' <> 'REDEEMED' then raise exception 'D3B_STAFF_APPROVAL_FAILED %', result->>'error_code'; end if;
  if (select points_balance from public.customers where id=f.customer_id) <> 800 then
    raise exception 'D3B_STAFF_DOUBLE_SPEND'; end if;

  correlation_id := gen_random_uuid();
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','start','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
      'source_type','points','entitlement_id',f.reward_id,'request_id',gen_random_uuid(),
      'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
  test_redemption_id := (result->>'redemption_id')::uuid;
  if test_redemption_id is null then raise exception 'D3B_OWNER_START_FAILED %', result->>'error_code'; end if;
  result := public.secure_redemption_edge_mutate(f.owner_id,
    jsonb_build_object('action','approve','redemption_id',test_redemption_id,
      'request_id',gen_random_uuid(),'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
  if result->>'status' <> 'REDEEMED' then raise exception 'D3B_OWNER_APPROVAL_FAILED %', result->>'error_code'; end if;
  if (select points_balance from public.customers where id=f.customer_id) <> 700 then
    raise exception 'D3B_OWNER_DOUBLE_SPEND'; end if;

  correlation_id := gen_random_uuid();
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','start','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
      'source_type','points','entitlement_id',f.reward_id,'request_id',gen_random_uuid(),
      'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
  test_redemption_id := (result->>'redemption_id')::uuid;
  if test_redemption_id is null then raise exception 'D3B_RATE_START_FAILED %', result->>'error_code'; end if;
  select pin_hash into pin_hash_value from public.redemption_confirmation_pins
  where restaurant_id=f.restaurant_id and branch_id=f.branch_id;
  wrong_pin := case when extensions.crypt('000000',pin_hash_value)=pin_hash_value then '000001' else '000000' end;
  for attempt in 1..5 loop
    result := public.secure_redemption_edge_mutate(f.customer_user_id,
      jsonb_build_object('action','verify_pin','redemption_id',test_redemption_id,'pin',wrong_pin,
        'request_id',gen_random_uuid(),'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
    if result->>'error_code' <> 'REDEMPTION_PIN_INVALID' then raise exception 'D3B_PIN_ERROR_NOT_GENERIC'; end if;
  end loop;
  if (select failed_pin_attempts from public.secure_redemption_requests where id=test_redemption_id) <> 5 then
    raise exception 'D3B_PIN_ATTEMPT_LIMIT_FAILED'; end if;
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','verify_pin','redemption_id',test_redemption_id,'pin',wrong_pin,
      'request_id',gen_random_uuid(),'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
  if (select count(*) from public.secure_redemption_pin_attempts where redemption_id=test_redemption_id) <> 5
    or result->>'error_code' <> 'REDEMPTION_PIN_INVALID' then raise exception 'D3B_SIXTH_ATTEMPT_NOT_BLOCKED'; end if;
end;
$check$;

-- The synthetic fixture isolates the gift cases from the already-proven
-- principal hourly request cap; no production timestamp is modified.
set local session_replication_role = replica;
update public.secure_redemption_requests
set requested_at = requested_at - interval '2 hours',
    expires_at = expires_at - interval '2 hours',
    completed_at = case when status in ('REQUESTED','PIN_VERIFIED')
      then statement_timestamp() - interval '2 hours' else completed_at end,
    status = case when status in ('REQUESTED','PIN_VERIFIED') then 'EXPIRED' else status end
where customer_id = (select customer_id from redemption_fixture);
set local session_replication_role = origin;

do $check$
declare f redemption_fixture%rowtype; result jsonb; gift_id uuid; correlation_id uuid;
  request_id uuid; kind text;
begin
  select * into f from redemption_fixture;
  perform set_config('request.jwt.claim.role','service_role',true);
  foreach kind in array array['welcome','birthday'] loop
    gift_id := case when kind='welcome' then f.welcome_gift_id else f.birthday_gift_id end;
    request_id := gen_random_uuid(); correlation_id := gen_random_uuid();
    result := public.secure_redemption_edge_mutate(f.customer_user_id,
      jsonb_build_object('action','start','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
        'source_type','gift','entitlement_id',gift_id,'request_id',request_id,
        'correlation_id',correlation_id,'idempotency_key',request_id));
    if result->>'status' <> 'REQUESTED' then raise exception 'D3B_GIFT_START_FAILED %', result->>'error_code'; end if;
    result := public.secure_redemption_edge_mutate(f.staff_id,
      jsonb_build_object('action','approve','redemption_id',result->>'redemption_id',
        'request_id',gen_random_uuid(),'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
    if result->>'status' <> 'REDEEMED'
      or (select status from public.customer_rewards where id=gift_id) <> 'redeemed' then
      raise exception 'D3B_GIFT_CONFIRM_FAILED %', result->>'error_code'; end if;
  end loop;
end;
$check$;

do $check$
declare f redemption_fixture%rowtype; result jsonb;
begin
  select * into f from redemption_fixture;
  result := public.confirm_customer_redemption_swipe(null,'points',f.reward_id,gen_random_uuid());
  if result->>'error_code' <> 'REDEMPTION_CONFIRMATION_REQUIRED' then
    raise exception 'D3B_LEGACY_SELF_SWIPE_NOT_CLOSED'; end if;
  if has_function_privilege('authenticated','public.start_customer_points_presentation(text,uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','public.start_customer_gift_presentation(text,uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.consume_redemption_code(uuid,text,text)','EXECUTE')
    or has_function_privilege('authenticated','public.secure_redemption_edge_mutate(uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.secure_redemption_finalize(uuid,text,uuid,uuid,uuid,uuid)','EXECUTE')
    or has_table_privilege('authenticated','public.secure_redemption_requests','INSERT') then
    raise exception 'D3B_DIRECT_BROWSER_WRITE_OPEN'; end if;
  begin
    update public.secure_redemption_audit set event_type='TAMPERED';
    raise exception 'D3B_AUDIT_MUTABLE';
  exception when insufficient_privilege then
    if sqlerrm <> 'REDEMPTION_AUDIT_IMMUTABLE' then raise; end if;
  end;
end;
$check$;

do $check$
declare f redemption_fixture%rowtype; result jsonb; test_redemption_id uuid;
  correlation_id uuid; existing_attempts integer; extra_reward uuid;
begin
  select * into f from redemption_fixture;
  perform set_config('request.jwt.claim.role','service_role',true);
  correlation_id := gen_random_uuid();
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','start','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
      'source_type','points','entitlement_id',f.other_reward_id,'request_id',gen_random_uuid(),
      'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
  test_redemption_id := (result->>'redemption_id')::uuid;
  if test_redemption_id is null then raise exception 'D3B_HOURLY_RATE_START_FAILED %', result->>'error_code'; end if;
  select count(*) into existing_attempts from public.secure_redemption_pin_attempts
  where actor_user_id=f.customer_user_id and restaurant_id=f.restaurant_id
    and branch_id=f.branch_id and attempted_at > statement_timestamp()-interval '1 hour';
  insert into public.secure_redemption_pin_attempts (
    redemption_id,idempotency_key,actor_user_id,restaurant_id,branch_id,successful)
  select test_redemption_id,gen_random_uuid(),f.customer_user_id,f.restaurant_id,f.branch_id,false
  from generate_series(1,20-existing_attempts);
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','verify_pin','redemption_id',test_redemption_id,'pin','000000',
      'request_id',gen_random_uuid(),'correlation_id',correlation_id,'idempotency_key',gen_random_uuid()));
  if result->>'error_code' <> 'REDEMPTION_PIN_RATE_LIMIT'
    or (select count(*) from public.secure_redemption_pin_attempts
      where actor_user_id=f.customer_user_id and restaurant_id=f.restaurant_id
        and branch_id=f.branch_id and attempted_at > statement_timestamp()-interval '1 hour') <> 20 then
    raise exception 'D3B_PRINCIPAL_RATE_LIMIT_FAILED';
  end if;
  foreach extra_reward in array array[f.extra_reward_1,f.extra_reward_2] loop
    result := public.secure_redemption_edge_mutate(f.customer_user_id,
      jsonb_build_object('action','start','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
        'source_type','points','entitlement_id',extra_reward,'request_id',gen_random_uuid(),
        'correlation_id',gen_random_uuid(),'idempotency_key',gen_random_uuid()));
    if result->>'status' <> 'REQUESTED' then raise exception 'D3B_VELOCITY_SETUP_FAILED %', result->>'error_code'; end if;
  end loop;
  result := public.secure_redemption_edge_mutate(f.customer_user_id,
    jsonb_build_object('action','start','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
      'source_type','points','entitlement_id',f.extra_reward_3,'request_id',gen_random_uuid(),
      'correlation_id',gen_random_uuid(),'idempotency_key',gen_random_uuid()));
  if result->>'error_code' <> 'REDEMPTION_REQUEST_RATE_LIMIT' then
    raise exception 'D3B_SIXTH_REQUEST_NOT_BLOCKED'; end if;
end;
$check$;
set local session_replication_role = replica;
update public.restaurants set activation_status='pending_activation'
where id=(select restaurant_id from redemption_fixture);
set local session_replication_role = origin;
do $check$
declare f redemption_fixture%rowtype; pending_id uuid; pending_correlation uuid;
begin
  select * into f from redemption_fixture;
  select id, correlation_id into pending_id, pending_correlation
  from public.secure_redemption_requests
  where customer_id=f.customer_id and source_id=f.other_reward_id and status='REQUESTED'
  limit 1;
  if pending_id is null then raise exception 'D3B_PENDING_GUARD_FIXTURE_MISSING'; end if;
  begin
    perform public.secure_redemption_edge_mutate(f.staff_id,
      jsonb_build_object('action','approve','redemption_id',pending_id,
        'request_id',gen_random_uuid(),'correlation_id',pending_correlation,
        'idempotency_key',gen_random_uuid()));
    raise exception 'D3B_PENDING_FINALIZATION_BYPASS';
  exception when insufficient_privilege then
    if sqlerrm <> 'RESTAURANT_NOT_OPERATIONAL' then raise; end if;
  end;
  begin
    perform public.secure_redemption_edge_mutate(f.customer_user_id,
      jsonb_build_object('action','start','restaurant_slug','d3b-'||left(f.restaurant_id::text,12),
        'source_type','points','entitlement_id',f.extra_reward_3,
        'request_id',gen_random_uuid(),'correlation_id',gen_random_uuid(),
        'idempotency_key',gen_random_uuid()));
    raise exception 'D3B_PENDING_START_BYPASS';
  exception when insufficient_privilege then
    if sqlerrm <> 'RESTAURANT_NOT_OPERATIONAL' then raise; end if;
  end;
end;
$check$;
rollback;
select 'D3B_SYNTHETIC_ROLLBACK_PASS';
