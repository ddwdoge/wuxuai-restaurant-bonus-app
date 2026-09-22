\set ON_ERROR_STOP on
begin;
create temporary table security_fixture(owner_id uuid default gen_random_uuid(), outsider_id uuid default gen_random_uuid(), admin_id uuid default gen_random_uuid(), customer_id uuid default gen_random_uuid(), tenant uuid, slug text);
insert into security_fixture default values;
grant select,update on security_fixture to authenticated,anon,service_role;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'authenticated','authenticated','roles-'||actor||'@example.invalid',now(),'{}','{"role":"platform_owner"}',now(),now()
from security_fixture f cross join lateral unnest(array[f.owner_id,f.outsider_id,f.admin_id,f.customer_id]) actor;
insert into public.platform_admins(user_id,role,active) select admin_id,'platform_owner',true from security_fixture;
select set_config('request.jwt.claim.sub',owner_id::text,true) from security_fixture;
set local role authenticated;
update security_fixture set tenant=(public.start_restaurant_owner_trial('Synthetic Roles','Synthetic Roles',null,'AT')->'restaurant'->>'id')::uuid;
update security_fixture f set slug=r.slug from public.restaurants r where r.id=f.tenant;
reset role;
create function pg_temp.must_deny(statement text) returns void language plpgsql as $$
begin
 begin execute statement; exception when insufficient_privilege then return; end;
 raise exception 'SECURITY_BYPASS: %',statement;
end $$;
grant execute on function pg_temp.must_deny(text) to authenticated,anon,service_role;
-- Private contracts and audit/context DML may never be exposed through API roles.
do $$ declare signature text; api_role text; relation text; begin
 foreach signature in array array['resolve_branch_creation_lifecycle_internal(uuid)','restaurant_activation_state_internal(uuid)','require_restaurant_operational(uuid,text)','guard_pending_activation_transition()','guard_pending_activation_operational_write()','protect_pending_registration_audit()','save_pending_restaurant_setup_internal(uuid,jsonb,jsonb,uuid)'] loop
  foreach api_role in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(api_role,'public.'||signature,'EXECUTE') then raise exception 'PRIVATE_RPC_EXPOSED: % / %',signature,api_role; end if;
  end loop;
 end loop;
 foreach relation in array array['pending_registration_audit','country_launch_creation_context'] loop
  foreach api_role in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(api_role,'public.'||relation,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'PRIVATE_DML_EXPOSED: % / %',relation,api_role; end if;
  end loop;
 end loop;
 foreach relation in array array['restaurants','restaurant_members','branch_subscriptions','customers','points_transactions','pending_registration_audit'] loop
  if not (select relrowsecurity from pg_class where oid=('public.'||relation)::regclass) then raise exception 'RLS_DISABLED: %',relation; end if;
 end loop;
end $$;
set local role authenticated;
do $$ declare t uuid:=(select tenant from security_fixture); b uuid; begin
 select primary_branch_id into b from public.restaurants where id=t;
 if public.get_restaurant_activation_state(t)->>'setup_allowed'<>'true' then raise exception 'Owner setup denied'; end if;
 perform pg_temp.must_deny(format('update public.branches set status=''active'' where id=%L',b));
 begin
  update public.branches set is_discoverable=true where id=b;
  raise exception 'SECURITY_BYPASS_DISCOVERABLE';
 exception when insufficient_privilege then null;
 when raise_exception then
  if sqlerrm<>'Öffentliche Aktivierung erfordert Betriebs-, Rechts- und Sicherheitsbereitschaft.' then raise; end if;
 end;
 perform pg_temp.must_deny(format('update public.restaurants set owner_id=%L where id=%L',(select outsider_id from security_fixture),t));
 begin
  delete from public.restaurants where id=t;
  if found then raise exception 'SECURITY_BYPASS_OWNER_DELETE'; end if;
 exception when insufficient_privilege then null;
 end;
 if not exists(select 1 from public.restaurants where id=t) then raise exception 'PENDING_RESTAURANT_REMOVED'; end if;
 perform pg_temp.must_deny(format('select public.create_customer_points_credit_qr(%L,%L)',(select slug from security_fixture),'synthetic-invalid-token'));
end $$;
reset role;
select set_config('request.jwt.claim.sub',outsider_id::text,true) from security_fixture;
set local role authenticated;
do $$ declare t uuid:=(select tenant from security_fixture); begin
 perform pg_temp.must_deny(format('select public.get_restaurant_activation_state(%L)',t));
 if exists(select 1 from public.restaurants where id=t) then raise exception 'FOREIGN_TENANT_READ'; end if;
 update public.restaurants set name='Forbidden' where id=t;
 if found then raise exception 'FOREIGN_TENANT_WRITE'; end if;
end $$;
reset role;
-- Real server-bound staff/customer identities, not metadata claims.
insert into public.restaurant_members(restaurant_id,user_id,role)
select (select id from public.restaurants where activation_status is null order by id limit 1),outsider_id,'staff' from security_fixture;
insert into public.customer_accounts(auth_user_id) select customer_id from security_fixture;
set local role authenticated;
do $$ declare t uuid:=(select tenant from security_fixture); begin
 perform pg_temp.must_deny(format('select public.get_restaurant_activation_state(%L)',t));
 if exists(select 1 from public.restaurants where id=t) then raise exception 'STAFF_PENDING_TENANT_READ'; end if;
 update public.restaurants set name='Forbidden staff edit' where id=t;
 if found then raise exception 'STAFF_PENDING_TENANT_WRITE'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',customer_id::text,true) from security_fixture;
set local role authenticated;
do $$ declare t uuid:=(select tenant from security_fixture); begin
 perform pg_temp.must_deny(format('select public.get_restaurant_activation_state(%L)',t));
 if exists(select 1 from public.restaurants where id=t) then raise exception 'CUSTOMER_PENDING_TENANT_READ'; end if;
 update public.restaurants set name='Forbidden customer edit' where id=t;
 if found then raise exception 'CUSTOMER_PENDING_TENANT_WRITE'; end if;
 begin
  perform public.get_customer_restaurant_context((select slug from security_fixture));
  raise exception 'PENDING_PUBLIC_CONTEXT_EXPOSED';
 exception when raise_exception then
  if sqlerrm<>'CUSTOMER_ACCOUNT_CONTEXT_INVALID' then raise; end if;
 end;
 begin
  perform public.join_customer_account_restaurant((select slug from security_fixture),true,true,null,null);
  raise exception 'PENDING_CUSTOMER_JOIN_ALLOWED';
 exception when raise_exception then
  if sqlerrm<>'CUSTOMER_ACCOUNT_CONTEXT_INVALID' then raise; end if;
 end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',admin_id::text,true) from security_fixture;
set local role authenticated;
do $$ declare t uuid:=(select tenant from security_fixture); begin
 if public.get_restaurant_activation_state(t)->>'status'<>'PENDING_ACTIVATION' then raise exception 'Platform read failed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$ begin
 perform pg_temp.must_deny(format('select public.get_restaurant_activation_state(%L)',(select tenant from security_fixture)));
end $$;
reset role;
set local role service_role;
do $$ declare t uuid:=(select tenant from security_fixture); b uuid; relation text; begin
 select primary_branch_id into b from public.restaurants where id=t;
 perform pg_temp.must_deny(format('select public.get_restaurant_activation_state(%L)',t));
 perform pg_temp.must_deny(format('update public.branch_subscriptions set trial_started_at=now() where branch_id=%L',b));
 perform pg_temp.must_deny(format('update public.branch_subscriptions set stripe_customer_id=''synthetic_forbidden'' where branch_id=%L',b));
 perform pg_temp.must_deny(format('update public.branch_subscriptions set selected_plan=''PRO'' where branch_id=%L',b));
 perform pg_temp.must_deny(format('delete from public.branch_subscriptions where branch_id=%L',b));
 perform pg_temp.must_deny(format('update public.restaurants set activation_status=null where id=%L',t));
 perform pg_temp.must_deny(format('update public.restaurant_branding set primary_color=''#ffffff'' where restaurant_id=%L',t));
 foreach relation in array array['customer_qr_tokens','customer_points_qr_references','customer_rewards',
  'customer_account_memberships','points_transactions','stamp_transactions','points_collection_requests',
  'points_idempotency_claims','redemption_activity_journal','points_redemption_presentations',
  'gift_redemption_presentations','staff_sessions','customer_transactional_email_deliveries',
  'customer_offer_email_deliveries','capacity_usage_daily_snapshots','capacity_warning_states',
  'capacity_warning_episodes','capacity_warning_deliveries'] loop
  perform pg_temp.must_deny(format('insert into public.%I(restaurant_id) values(%L)',relation,t));
 end loop;
end $$;
reset role;
rollback;
select 'PENDING_ROLE_SECURITY_PASS';
