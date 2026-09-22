\set ON_ERROR_STOP on
begin;
create temporary table legacy_active_fixture as
select r.id,r.owner_id,r.primary_branch_id from public.restaurants r
join public.branch_subscriptions s on s.branch_id=r.primary_branch_id
where r.activation_status is null and s.subscription_status='active' order by r.id limit 1;
grant select on legacy_active_fixture to authenticated;
do $$ begin
 if (select count(*) from legacy_active_fixture)<>1 then raise exception 'Missing upgrade legacy fixture'; end if;
end $$;
insert into public.country_launch_existing_businesses(restaurant_id)
select id from legacy_active_fixture on conflict do nothing;
select set_config('request.jwt.claim.sub',owner_id::text,true) from legacy_active_fixture;
select public.accept_kassa_separation_acknowledgement(id,'kassa-separation-de-v1','de',gen_random_uuid()) is not null from legacy_active_fixture;
update public.restaurants set operational_ready=true,legal_ready=true,security_ready=true,status='active'
where id=(select id from legacy_active_fixture);
update public.branches set status='active' where id=(select primary_branch_id from legacy_active_fixture);
create temporary table subscription_before as
select to_jsonb(s) as value from public.branch_subscriptions s where branch_id=(select primary_branch_id from legacy_active_fixture);
select set_config('request.jwt.claim.sub',owner_id::text,true) from legacy_active_fixture;
do $$ declare t uuid:=(select id from legacy_active_fixture); begin
 if public.restaurant_activation_state_internal(t)->>'operational'<>'true' then raise exception 'LEGACY_ACTIVE_BLOCKED'; end if;
 if public.restaurant_activation_state_internal(t)->>'status'<>'LEGACY' then raise exception 'LEGACY_STATUS_CHANGED'; end if;
 perform public.ensure_restaurant_branch(t);
 if (select to_jsonb(s) from public.branch_subscriptions s where branch_id=(select primary_branch_id from legacy_active_fixture))<>(select value from subscription_before) then raise exception 'LEGACY_SUBSCRIPTION_CHANGED'; end if;
 perform public.require_restaurant_operational(t,'local_legacy_regression');
end $$;
set local role authenticated;
do $$ begin
 if public.get_restaurant_activation_state((select id from legacy_active_fixture))->>'operational'<>'true' then raise exception 'LEGACY_OWNER_READ_BLOCKED'; end if;
end $$;
reset role;
rollback;
select 'LEGACY_ACTIVE_LOCAL_PASS';
