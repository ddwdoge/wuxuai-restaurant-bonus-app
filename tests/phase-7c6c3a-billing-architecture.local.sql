\set ON_ERROR_STOP on
begin;
create temporary table checkout_fixture(actor uuid default gen_random_uuid(), tenant uuid);
insert into checkout_fixture default values;
grant all on checkout_fixture to authenticated,service_role;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select actor,'authenticated','authenticated','billing-local-'||actor||'@example.invalid',now(),'{}','{}',now(),now()
from checkout_fixture;
select set_config('request.jwt.claim.sub',actor::text,true) from checkout_fixture;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
update checkout_fixture set tenant=(public.start_restaurant_owner_trial('Synthetic Checkout Owner','Local Only',null,'AT')->'restaurant'->>'id')::uuid;
create temporary table before_subscription as
select to_jsonb(s) snapshot from public.branch_subscriptions s join public.branches b on b.id=s.branch_id
where b.restaurant_id=(select tenant from checkout_fixture);
grant select on before_subscription to authenticated,service_role;

create function pg_temp.assert_denied(statement text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when insufficient_privilege or unique_violation or invalid_parameter_value then return;
  end;
  raise exception 'EXPECTED_DENIAL';
end $$;
grant execute on function pg_temp.assert_denied(text) to authenticated,service_role,anon;

do $$ declare answer jsonb; rid uuid:=gen_random_uuid(); tenant uuid:=(select tenant from checkout_fixture);
begin
  answer:=public.request_blocked_test_checkout('BASIC',rid,'/admin/settings/tarif-kapazitaet');
  if answer->>'status'<>'BLOCKED' or not (answer->'blockers' ? 'ARCHITECTURE_ONLY')
    or not (answer->'blockers' ? 'KYB_NOT_VERIFIED')
    or not (answer->'blockers' ? 'COUNTRY_NOT_RELEASED')
    or not (answer->'blockers' ? 'SELLER_NOT_VERIFIED')
    or not (answer->'blockers' ? 'TAX_NOT_READY')
    or not (answer->'blockers' ? 'COMMERCIAL_ACTIVATION_DISABLED') then
    raise exception 'CHECKOUT_GATE_INCOMPLETE';
  end if;
  if public.request_blocked_test_checkout('BASIC',rid,'/admin/settings/tarif-kapazitaet')<>answer then
    raise exception 'CHECKOUT_RETRY_DIFFERENT';
  end if;
  perform pg_temp.assert_denied(format(
    'select public.request_blocked_test_checkout(''PRO'',%L,''/admin/settings/tarif-kapazitaet'')',rid));
end $$;
reset role;
do $$ begin
  if (select count(*) from public.billing_checkout_blocked_requests
      where restaurant_id=(select tenant from checkout_fixture))<>1 then raise exception 'CHECKOUT_DUPLICATE'; end if;
end $$;
set local role authenticated;
select pg_temp.assert_denied('select public.request_blocked_test_checkout(''BASIC'',gen_random_uuid(),''https://evil.invalid'')');
select pg_temp.assert_denied('insert into public.billing_checkout_blocked_requests default values');
select pg_temp.assert_denied('select public.record_local_fake_billing_webhook(null,null,null,null,null,null,null,false)');
reset role;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
select pg_temp.assert_denied($q$select public.request_blocked_test_checkout(
  'BASIC',gen_random_uuid(),'/admin/settings/tarif-kapazitaet')$q$);
reset role;
select set_config('request.jwt.claim.role','anon',true);
set local role anon;
select pg_temp.assert_denied($q$select public.request_blocked_test_checkout(
  'BASIC',gen_random_uuid(),'/admin/settings/tarif-kapazitaet')$q$);
select pg_temp.assert_denied($q$select public.record_local_fake_billing_webhook(
  'evt_anonrejected1',repeat('e',64),'invoice.paid',
  '2026-09-24T09:00:00Z',null,null,'LOCAL_FAKE_ACCOUNT',false)$q$);
reset role;

-- A valid local-only technical event can be recorded, but not activated.
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select pg_temp.assert_denied($q$select public.request_blocked_test_checkout(
  'BASIC',gen_random_uuid(),'/admin/settings/tarif-kapazitaet')$q$);
do $$ declare t uuid:=(select tenant from checkout_fixture); answer jsonb;
begin
  answer:=public.record_local_fake_billing_webhook('evt_localtest0001',repeat('a',64),
    'customer.subscription.created','2026-09-24T09:00:00Z','sub_localtest0001',t,'LOCAL_FAKE_ACCOUNT',false);
  if answer->>'status'<>'ACTIVATION_BLOCKED' or (answer->>'replay')::boolean then
    raise exception 'WEBHOOK_NOT_BLOCKED'; end if;
  answer:=public.record_local_fake_billing_webhook('evt_localtest0001',repeat('a',64),
    'customer.subscription.created','2026-09-24T09:00:00Z','sub_localtest0001',t,'LOCAL_FAKE_ACCOUNT',false);
  if not (answer->>'replay')::boolean then raise exception 'WEBHOOK_REPLAY_FAILED'; end if;
  perform pg_temp.assert_denied($q$select public.record_local_fake_billing_webhook(
    'evt_localtest0001',repeat('b',64),'customer.subscription.created',
    '2026-09-24T09:00:00Z','sub_localtest0001',null,'LOCAL_FAKE_ACCOUNT',false)$q$);
  answer:=public.record_local_fake_billing_webhook('evt_localtest0002',repeat('b',64),
    'customer.subscription.updated','2026-09-24T08:00:00Z','sub_localtest0001',t,'LOCAL_FAKE_ACCOUNT',false);
  if answer->>'status'<>'STALE_EVENT' then raise exception 'WEBHOOK_STALE_FAILED'; end if;
  answer:=public.record_local_fake_billing_webhook('evt_localtest0003',repeat('c',64),
    'customer.subscription.updated','2026-09-24T09:00:00Z','sub_localtest0001',t,'LOCAL_FAKE_ACCOUNT',false);
  if answer->>'status'<>'ORDER_AMBIGUOUS' then raise exception 'WEBHOOK_ORDER_FAILED'; end if;
  perform pg_temp.assert_denied($q$select public.record_local_fake_billing_webhook(
    'evt_livemodetest01',repeat('d',64),'invoice.paid',
    '2026-09-24T10:00:00Z','sub_localtest0001',null,'LOCAL_FAKE_ACCOUNT',true)$q$);
end $$;
select pg_temp.assert_denied('update public.billing_test_webhook_inbox set attempt_count=2');
select pg_temp.assert_denied('insert into public.billing_test_webhook_inbox default values');
reset role;

do $$ begin
  if (select to_jsonb(s) from public.branch_subscriptions s join public.branches b on b.id=s.branch_id
      where b.restaurant_id=(select tenant from checkout_fixture))
    is distinct from (select snapshot from before_subscription) then
    raise exception 'PRODUCT_SUBSCRIPTION_MUTATED';
  end if;
  if exists(select 1 from public.billing_trial_claims c where c.restaurant_id=(select tenant from checkout_fixture)) then
    raise exception 'TRIAL_CLAIM_MUTATED';
  end if;
end $$;
rollback;
