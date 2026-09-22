\set ON_ERROR_STOP on
begin;
create temporary table pending_fixture(actor uuid default gen_random_uuid(),tenant uuid);
insert into pending_fixture default values;
grant all on pending_fixture to authenticated,service_role;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'authenticated','authenticated','pending-'||actor||'@example.invalid',now(),'{}','{}',now(),now() from pending_fixture;
select set_config('request.jwt.claim.sub',actor::text,true) from pending_fixture;
set local role authenticated;
update pending_fixture set tenant=(public.start_restaurant_owner_trial('Synthetic Owner','Pending Local',null,'AT')->'restaurant'->>'id')::uuid;
do $$ declare a jsonb; begin
  a:=public.get_restaurant_activation_state((select tenant from pending_fixture));
  if a->>'status'<>'PENDING_ACTIVATION' or (a->>'operational')::boolean then raise exception 'pending state failed'; end if;
  a:=public.get_restaurant_capacity((select tenant from pending_fixture));
  if a#>>'{offers,effective_limit}'<>'0' or a#>>'{active_customers,effective_limit}'<>'0' then raise exception 'capacity active'; end if;
  if public.start_restaurant_owner_trial('Ignored','Ignored',null)->>'already_exists'<>'true' then raise exception 'resume failed'; end if;
end $$;
reset role;
create function pg_temp.assert_denied(statement text) returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when insufficient_privilege then return;
  end;
  raise exception 'Expected permission denial: %',statement;
end $$;
grant execute on function pg_temp.assert_denied(text) to authenticated,service_role,anon;
set local role authenticated;
do $$ declare t uuid:=(select tenant from pending_fixture); b uuid; payload jsonb; begin
  select primary_branch_id into b from public.restaurants where id=t;
  update public.restaurants set name='Pending Draft Edited',opening_hours='{}' where id=t;
  update public.restaurant_branding set primary_color='#123456' where restaurant_id=t;
  update public.loyalty_settings set amount_per_point=2 where restaurant_id=t;
  insert into public.rewards(restaurant_id,title,reward_type,required_points,active)
    values(t,'Synthetic Draft','reward',5,false);
  perform public.save_restaurant_offer(t,null,b,'NEWS','Synthetic Draft','Local only',null,null,null,null,
    now(),now()+interval '1 day',null,null,null,null);
  perform pg_temp.assert_denied(format('update public.restaurants set operational_ready=true where id=%L',t));
  perform pg_temp.assert_denied(format('update public.restaurants set status=''active'' where id=%L',t));
  perform pg_temp.assert_denied(format('update public.restaurants set activation_status=null where id=%L',t));
  perform pg_temp.assert_denied(format('update public.rewards set active=true where restaurant_id=%L',t));
  perform pg_temp.assert_denied(format('update public.restaurant_offers set status=''PUBLISHED'',is_active=true where restaurant_id=%L',t));
  perform pg_temp.assert_denied(format('select public.get_today_restaurant_pin(%L)',t));
  perform pg_temp.assert_denied(format('select public.create_staff_member_with_pin(%L,''Local staff'',''7418'')',t));
  if public.get_current_portal_access()->>'staff_access'<>'false' then raise exception 'pending staff access'; end if;
  if public.get_current_portal_access()->>'owner_access'<>'true' then raise exception 'missing setup access'; end if;
  payload:=public.complete_restaurant_onboarding(t,
    '{"company_name":"Synthetic Local","legal_form":"Einzelunternehmen","street":"Testweg 1","postal_code":"1010","city":"Wien","country":"AT","email":"local@example.invalid","responsible_person":"Synthetic Owner","complaint_contact":"local@example.invalid"}',
    '{"name":"Pending Draft Edited"}',false,null);
  if payload->>'activation_status'<>'PENDING_ACTIVATION' then raise exception 'setup activation leak'; end if;
end $$;
reset role;
set local role service_role;
do $$ declare t uuid:=(select tenant from pending_fixture); b uuid; begin
  select primary_branch_id into b from public.restaurants where id=t;
  perform pg_temp.assert_denied(format('update public.branch_subscriptions set status=''active'',subscription_status=''active'' where branch_id=%L',b));
  perform pg_temp.assert_denied(format('insert into public.country_launch_existing_businesses(restaurant_id) values(%L)',t));
  perform pg_temp.assert_denied(format('insert into public.customers(restaurant_id,name,phone,normalized_phone) values(%L,''Synthetic Customer'',''+436600000001'',''+436600000001'')',t));
  perform pg_temp.assert_denied(format('insert into public.restaurant_daily_pins(restaurant_id,pin_code,valid_until) values(%L,''7418'',now()+interval ''1 day'')',t));
  perform pg_temp.assert_denied(format('update public.pending_registration_audit set actor_ref=null where restaurant_ref=%L',t));
end $$;
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$ begin
  perform pg_temp.assert_denied(format('select public.get_restaurant_activation_state(%L)',(select tenant from pending_fixture)));
  if exists(select 1 from public.restaurants where id=(select tenant from pending_fixture)) then raise exception 'tenant leak'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',actor::text,true) from pending_fixture;
do $$ begin
  if (select count(*) from public.branch_subscriptions s join public.branches b on b.id=s.branch_id where b.restaurant_id=(select tenant from pending_fixture)
      and s.subscription_status='pending_activation' and s.trial_started_at is null and s.trial_ends_at is null
      and s.current_period_start is null and s.current_period_end is null and s.current_period_ends_at is null)<>1 then raise exception 'subscription failed'; end if;
  if exists(select 1 from public.audit_log where restaurant_id=(select tenant from pending_fixture) and action='owner_trial_started') then raise exception 'trial audit created'; end if;
  if (select count(*) from public.pending_registration_audit where restaurant_ref=(select tenant from pending_fixture))<>1 then raise exception 'pending audit failed'; end if;
end $$;
rollback;
-- Late failure must roll back all rows created by the public wrapper.
begin;
create function pg_temp.fail_pending_audit() returns trigger language plpgsql as $$
begin raise exception 'FORCED_LATE_FAILURE' using errcode='P0001'; end $$;
create trigger zz_local_late_failure before insert on public.pending_registration_audit
for each row execute function pg_temp.fail_pending_audit();
create temporary table rollback_fixture(actor uuid default gen_random_uuid());
insert into rollback_fixture default values;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'authenticated','authenticated','rollback-'||actor||'@example.invalid',now(),'{}','{}',now(),now() from rollback_fixture;
select set_config('request.jwt.claim.sub',actor::text,true) from rollback_fixture;
do $$ begin
  begin
    perform public.start_restaurant_owner_trial('Synthetic Rollback','Synthetic Rollback',null,'AT');
    raise exception 'LATE_FAILURE_NOT_TRIGGERED';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'FORCED_LATE_FAILURE' then raise; end if;
  end;
  if exists(select 1 from public.restaurants where owner_id=(select actor from rollback_fixture))
    or exists(select 1 from public.organizations where owner_id=(select actor from rollback_fixture))
    or exists(select 1 from public.restaurant_members where user_id=(select actor from rollback_fixture))
    or exists(select 1 from public.pending_registration_audit where actor_ref=(select actor from rollback_fixture))
    then raise exception 'PARTIAL_REGISTRATION_REMAINS'; end if;
end $$;
rollback;
select 'PENDING_REGISTRATION_LOCAL_PASS';
