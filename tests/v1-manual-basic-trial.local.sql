\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica;

create function pg_temp.synthetic_uuid(label text) returns uuid language sql immutable as $$
  select (substr(md5(label),1,8)||'-'||substr(md5(label),9,4)||'-4'||substr(md5(label),14,3)
    ||'-8'||substr(md5(label),18,3)||'-'||substr(md5(label),21,12))::uuid
$$;

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values(pg_temp.synthetic_uuid('trial-admin'),'authenticated','authenticated',
  'trial-admin@example.invalid','',now(),now(),now());
insert into auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at)
values(pg_temp.synthetic_uuid('trial-factor'),pg_temp.synthetic_uuid('trial-admin'),
  'Synthetic manual trial TOTP','totp','verified',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at,factor_id,aal,not_after)
values(pg_temp.synthetic_uuid('trial-session'),pg_temp.synthetic_uuid('trial-admin'),now(),now(),
  pg_temp.synthetic_uuid('trial-factor'),'aal2',now()+interval '2 hours');
insert into public.platform_admins(user_id,role,active)
values(pg_temp.synthetic_uuid('trial-admin'),'platform_admin',true);

create function pg_temp.seed_trial_tenant(label text) returns uuid language plpgsql as $$
declare owner_id uuid:=pg_temp.synthetic_uuid(label||'-owner');
  organization_id uuid:=pg_temp.synthetic_uuid(label||'-organization');
  restaurant_id uuid:=pg_temp.synthetic_uuid(label||'-restaurant');
  branch_id uuid:=pg_temp.synthetic_uuid(label||'-branch');
  subscription_id uuid:=pg_temp.synthetic_uuid(label||'-subscription');
  operator_id uuid:=pg_temp.synthetic_uuid(label||'-operator');
  case_id uuid:=pg_temp.synthetic_uuid(label||'-case');
  revision_id uuid:=pg_temp.synthetic_uuid(label||'-revision');
begin
  insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
  values(owner_id,'authenticated','authenticated',label||'@example.invalid','',now(),now(),now());
  insert into public.organizations(id,owner_id,name) values(organization_id,owner_id,'SYNTHETIC '||label);
  insert into public.restaurants(id,owner_id,name,slug,status,organization_id,activation_status,
    operational_ready,security_ready,legal_ready,onboarding_status)
  values(restaurant_id,owner_id,'SYNTHETIC '||label,lower(label),'draft',organization_id,
    'pending_activation',false,false,false,'draft');
  insert into public.branches(id,organization_id,restaurant_id,name,slug,country,address,postal_code,city,status)
  values(branch_id,organization_id,restaurant_id,'SYNTHETIC '||label,lower(label)||'-main','AT',
    'Synthetic Road 1','1000','Synthetic City','draft');
  update public.restaurants set primary_branch_id=branch_id where id=restaurant_id;
  insert into public.restaurant_members(restaurant_id,organization_id,branch_id,user_id,role)
  values(restaurant_id,organization_id,branch_id,owner_id,'owner');
  insert into public.kassa_compliance_acknowledgements(
    restaurant_id,user_id,text_version,ui_language,legal_country
  ) values(restaurant_id,owner_id,'kassa-separation-de-v1','de','AT');
  insert into public.branch_subscriptions(id,organization_id,branch_id,status,subscription_status,
    plan_key,selected_plan,payment_status)
  values(subscription_id,organization_id,branch_id,'pending_activation','pending_activation',
    'BASIC','BASIC','not_required');
  insert into public.organization_legal_profiles(id,organization_id,company_name,legal_form,
    registered_address_source,address_source_restaurant_id,address_source_branch_id,email,
    commercial_register_number,vat_id,responsible_person,legal_review_status,updated_by)
  values(operator_id,organization_id,'Synthetic '||label||' GmbH','GmbH','restaurant',restaurant_id,
    branch_id,label||'@example.invalid','FN SYNTHETIC','ATU00000000','Synthetic Representative',
    'reviewed',owner_id);
  insert into public.restaurant_legal_profiles(restaurant_id,company_name,legal_form,street,
    postal_code,city,country,email,commercial_register_number,vat_id,complaint_contact,
    legal_review_status,operator_profile_id,registered_address_source,address_source_restaurant_id)
  values(restaurant_id,'Synthetic '||label||' GmbH','GmbH','Synthetic Road 1','1000','Synthetic City',
    'AT',label||'@example.invalid','FN SYNTHETIC','ATU00000000',label||'@example.invalid',
    'reviewed',operator_id,'restaurant',restaurant_id);
  insert into public.business_verification_cases(id,restaurant_id,country_code,verification_method,
    status,test_only,decided_at,expires_at,created_by)
  values(case_id,restaurant_id,'AT','MANUAL','VERIFIED',false,now(),now()+interval '1 year',
    pg_temp.synthetic_uuid('trial-admin'));
  insert into public.business_verified_profile_revisions(id,case_id,revision,legal_name,legal_form,
    register_identifier,vat_id,business_street,business_postal_code,business_city,business_country,
    authorized_representative,status,decision_ref,created_by)
  values(revision_id,case_id,1,'Synthetic '||label||' GmbH','GmbH','FN SYNTHETIC','ATU00000000',
    'Synthetic Road 1','1000','Synthetic City','AT','Synthetic Representative','VERIFIED',
    pg_temp.synthetic_uuid(label||'-decision'),pg_temp.synthetic_uuid('trial-admin'));
  insert into public.legal_operator_publication_decisions(id,restaurant_id,case_id,profile_revision_id,
    action,field_mapping_version,reason_code,redacted_reason,actor_id,aal2_verified_at,
    session_expires_at,auth_session_sha256,request_id,correlation_id)
  values(pg_temp.synthetic_uuid(label||'-publication'),restaurant_id,case_id,revision_id,'APPROVED',
    'AT_V1_LEGAL_OPERATOR_V1','SYNTHETIC_TRIAL_REVIEW','Synthetic local trial review only',
    pg_temp.synthetic_uuid('trial-admin'),now(),now()+interval '1 hour',repeat('c',64),
    pg_temp.synthetic_uuid(label||'-publication-request'),pg_temp.synthetic_uuid(label||'-publication-correlation'));
  return restaurant_id;
end $$;

select pg_temp.seed_trial_tenant('trial-one');
select pg_temp.seed_trial_tenant('trial-three');
select pg_temp.seed_trial_tenant('trial-legal');
select pg_temp.seed_trial_tenant('trial-kassa');
delete from public.legal_operator_publication_decisions
  where restaurant_id=pg_temp.synthetic_uuid('trial-legal-restaurant');
delete from public.kassa_compliance_acknowledgements
  where restaurant_id=pg_temp.synthetic_uuid('trial-kassa-restaurant');
set local session_replication_role=origin;

-- AAL1 remains blocked.
select set_config('request.jwt.claims',jsonb_build_object(
  'sub',pg_temp.synthetic_uuid('trial-admin'),'role','authenticated','aal','aal1',
  'session_id',pg_temp.synthetic_uuid('trial-session'),'amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
set local role authenticated;
do $test$ begin
  perform public.activate_v1_manual_basic_trial(pg_temp.synthetic_uuid('trial-one-restaurant'),1::smallint,
    'Synthetic one month decision','BASIC-TRIAL SYNTHETIC trial-one 1 MONATE AKTIVIEREN',
    pg_temp.synthetic_uuid('trial-one-request'),pg_temp.synthetic_uuid('trial-one-correlation'));
  raise exception 'AAL1_WAS_NOT_BLOCKED';
exception when sqlstate '42501' then
  if sqlerrm<>'MANUAL_TRIAL_NOT_AUTHORIZED' and sqlerrm<>'RECENT_PLATFORM_TOTP_REQUIRED' then raise; end if;
end $test$;

-- Fresh AAL2 can activate one and three calendar months.
select set_config('request.jwt.claims',jsonb_build_object(
  'sub',pg_temp.synthetic_uuid('trial-admin'),'role','authenticated','aal','aal2',
  'session_id',pg_temp.synthetic_uuid('trial-session'),'amr',jsonb_build_array(
    jsonb_build_object('method','totp','timestamp',extract(epoch from clock_timestamp())::bigint)))::text,true);
-- A locked country cannot be opened by the trial RPC.
do $test$ begin
  perform public.activate_v1_manual_basic_trial(pg_temp.synthetic_uuid('trial-one-restaurant'),1::smallint,
    'Synthetic country gate decision','BASIC-TRIAL SYNTHETIC trial-one 1 MONATE AKTIVIEREN',
    pg_temp.synthetic_uuid('trial-country-request'),pg_temp.synthetic_uuid('trial-country-correlation'));
  raise exception 'COUNTRY_GATE_WAS_NOT_BLOCKED';
exception when sqlstate '42501' then
  if sqlerrm<>'MANUAL_TRIAL_PILOT_READINESS_NOT_READY' then raise; end if;
end $test$;
reset role;
update public.country_kyb_intake_policies set real_intake_status='READY',legal_status='VERIFIED',
  privacy_status='VERIFIED',document_catalog_status='VERIFIED',retention_status='VERIFIED'
where country_code='AT';
update public.country_launch_readiness set status='ready',evidence_ref='LOCAL_SYNTHETIC_TRIAL',
  document_version_refs=case when check_key='required_documents'
    then array['LOCAL_SYNTHETIC_DOCUMENT'] else '{}' end
where country_code='AT' and check_key in
  ('legal','privacy','tax','translation','technical_smoke','required_documents');
insert into public.country_basic_pilot_policy_versions(
  country_code,revision,state,evidence_reference,valid_from,revision_reason
) values ('AT',2,'APPROVED','LOCAL_SYNTHETIC_COUNSEL_DECISION',now(),
  'Synthetic local approval used only inside the rolled-back security test');
update public.country_launch_policy set enabled=true,market_status='prepared',activated_at=null
where country_code='AT';
set local role authenticated;
-- Missing KYB/legal publication approval remains fail-closed.
do $test$ begin
  perform public.activate_v1_manual_basic_trial(pg_temp.synthetic_uuid('trial-legal-restaurant'),1::smallint,
    'Synthetic legal gate decision','BASIC-TRIAL SYNTHETIC trial-legal 1 MONATE AKTIVIEREN',
    pg_temp.synthetic_uuid('trial-legal-request'),pg_temp.synthetic_uuid('trial-legal-correlation'));
  raise exception 'LEGAL_GATE_WAS_NOT_BLOCKED';
exception when sqlstate '42501' then
  if sqlerrm<>'MANUAL_TRIAL_LEGAL_KYB_NOT_READY' then raise; end if;
end $test$;
-- Missing owner/admin Kassa acknowledgement remains fail-closed.
do $test$ begin
  perform public.activate_v1_manual_basic_trial(pg_temp.synthetic_uuid('trial-kassa-restaurant'),1::smallint,
    'Synthetic Kassa gate decision','BASIC-TRIAL SYNTHETIC trial-kassa 1 MONATE AKTIVIEREN',
    pg_temp.synthetic_uuid('trial-kassa-request'),pg_temp.synthetic_uuid('trial-kassa-correlation'));
  raise exception 'KASSA_GATE_WAS_NOT_BLOCKED';
exception when sqlstate '42501' then
  if sqlerrm<>'KASSA_ACKNOWLEDGEMENT_REQUIRED' then raise; end if;
end $test$;
select public.activate_v1_manual_basic_trial(pg_temp.synthetic_uuid('trial-one-restaurant'),1::smallint,
  'Synthetic one month decision','BASIC-TRIAL SYNTHETIC trial-one 1 MONATE AKTIVIEREN',
  pg_temp.synthetic_uuid('trial-one-request'),pg_temp.synthetic_uuid('trial-one-correlation'));
select public.activate_v1_manual_basic_trial(pg_temp.synthetic_uuid('trial-three-restaurant'),3::smallint,
  'Synthetic three month decision','BASIC-TRIAL SYNTHETIC trial-three 3 MONATE AKTIVIEREN',
  pg_temp.synthetic_uuid('trial-three-request'),pg_temp.synthetic_uuid('trial-three-correlation'));
-- Same request is idempotent.
select public.activate_v1_manual_basic_trial(pg_temp.synthetic_uuid('trial-one-restaurant'),1::smallint,
  'Synthetic one month decision','BASIC-TRIAL SYNTHETIC trial-one 1 MONATE AKTIVIEREN',
  pg_temp.synthetic_uuid('trial-one-request'),pg_temp.synthetic_uuid('trial-one-correlation'));
reset role;

do $test$ begin
  if (select count(*) from public.manual_basic_trial_decisions)<>2 then
    raise exception 'TRIAL_DECISION_COUNT_INVALID'; end if;
  if exists(select 1 from public.manual_basic_trial_decisions
    where ends_at<>public.vienna_calendar_month_boundary_internal(starts_at,calendar_months)) then
    raise exception 'CALENDAR_MONTH_BOUNDARY_INVALID'; end if;
  if exists(select 1 from public.basic_post_trial_redemption_grace g
    join public.manual_basic_trial_decisions d on d.id=g.trial_decision_id
    where g.boundary_timezone<>'Europe/Vienna'
      or g.ends_at<>public.vienna_calendar_day_boundary_internal(d.ends_at,60)) then
    raise exception 'VIENNA_GRACE_BOUNDARY_INVALID'; end if;
  if exists(select 1 from public.branch_subscriptions
    where id in (pg_temp.synthetic_uuid('trial-one-subscription'),pg_temp.synthetic_uuid('trial-three-subscription'))
      and (status<>'trialing' or subscription_status<>'trialing' or plan_key<>'BASIC'
        or payment_status<>'not_required' or stripe_customer_id is not null
        or stripe_subscription_id is not null)) then
    raise exception 'TRIAL_SUBSCRIPTION_INVALID'; end if;
  if (select count(*) from public.billing_trial_claims where restaurant_id in
    (pg_temp.synthetic_uuid('trial-one-restaurant'),pg_temp.synthetic_uuid('trial-three-restaurant')))<>2 then
    raise exception 'TRIAL_CLAIM_COUNT_INVALID'; end if;
  if not (public.restaurant_activation_state_internal(pg_temp.synthetic_uuid('trial-one-restaurant'))->>'operational')::boolean then
    raise exception 'ACTIVE_TRIAL_NOT_OPERATIONAL'; end if;
end $test$;

-- Direct billing mutation remains blocked without the private activation context.
set local role authenticated;
do $test$ begin
  update public.branch_subscriptions set stripe_customer_id='cus_SYNTHETIC0001'
    where id=pg_temp.synthetic_uuid('trial-one-subscription');
  raise exception 'DIRECT_STRIPE_WRITE_WAS_NOT_BLOCKED';
exception when sqlstate '42501' then
  if sqlerrm<>'BILLING_PROVIDER_ACTIVATION_REQUIRED'
    and sqlerrm not like 'permission denied for table branch_subscriptions%' then raise; end if;
end $test$;
reset role;

-- Synthetic time travel: expiry causes no charge/extension and blocks active use.
set local session_replication_role=replica;
update public.manual_basic_trial_decisions set starts_at=starts_at-interval '4 months',
  ends_at=public.vienna_calendar_month_boundary_internal(starts_at-interval '4 months',calendar_months)
where restaurant_id=pg_temp.synthetic_uuid('trial-one-restaurant');
update public.branch_subscriptions s set
  trial_started_at=d.starts_at,trial_ends_at=d.ends_at,current_period_start=d.starts_at,
  current_period_end=d.ends_at,current_period_ends_at=d.ends_at
from public.manual_basic_trial_decisions d
where s.id=pg_temp.synthetic_uuid('trial-one-subscription')
  and d.restaurant_id=pg_temp.synthetic_uuid('trial-one-restaurant');
set local session_replication_role=origin;
do $test$ begin
  if public.restaurant_activation_state_internal(pg_temp.synthetic_uuid('trial-one-restaurant'))->>'reason_code'
    is distinct from 'TRIAL_ENDED_PAYMENT_ACCEPTANCE_REQUIRED' then
    raise exception 'EXPIRED_TRIAL_NOT_BLOCKED'; end if;
  if (public.restaurant_activation_state_internal(pg_temp.synthetic_uuid('trial-one-restaurant'))->>'operational')::boolean then
    raise exception 'EXPIRED_TRIAL_STILL_OPERATIONAL'; end if;
  if exists(select 1 from public.branch_subscriptions
    where id=pg_temp.synthetic_uuid('trial-one-subscription')
      and (payment_status<>'not_required' or stripe_customer_id is not null or stripe_subscription_id is not null)) then
    raise exception 'EXPIRED_TRIAL_PAYMENT_SIDE_EFFECT'; end if;
end $test$;

rollback;
select 'LOCAL_V1_MANUAL_BASIC_TRIAL_PASS';
