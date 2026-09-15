-- Synthetic dependency schema ONLY; production functions are loaded unchanged
-- by the local runner. This is not a dump of Staging or the full migration history.
-- Replace only the synthetic helper from the existing base with real pgcrypto.
drop function extensions.gen_random_uuid();
create extension pgcrypto with schema extensions;
create schema storage;
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create table public.organizations(id uuid primary key, owner_id uuid, name text);
alter table public.restaurants add column slug text;
alter table public.branches add column name text, add column city text, add column postal_code text;
alter table public.branch_subscriptions add column stripe_customer_id text, add column stripe_subscription_id text;
create table public.platform_admins(user_id uuid primary key, role text, active boolean default true);
create table public.restaurant_members(restaurant_id uuid, user_id uuid, role text);
create table public.staff_members(id uuid default gen_random_uuid(), restaurant_id uuid, auth_user_id uuid);
create table public.customers(id uuid default gen_random_uuid(), restaurant_id uuid, auth_user_id uuid, is_test_customer boolean);
create table public.customer_account_memberships(id uuid default gen_random_uuid(), restaurant_id uuid, account_id uuid);
create table public.points_transactions(id uuid default gen_random_uuid(), restaurant_id uuid);
create table public.redemption_activity_journal(id uuid default gen_random_uuid(), restaurant_id uuid, status text);
create table public.kassa_redemption_workflows(id uuid default gen_random_uuid(), restaurant_id uuid, status text);
create table public.points_redemption_presentations(id uuid default gen_random_uuid(), restaurant_id uuid, status text);
create table public.gift_redemption_presentations(id uuid default gen_random_uuid(), restaurant_id uuid, status text);
create table public.audit_log(id uuid default gen_random_uuid(), restaurant_id uuid, action text);
create table public.customer_rewards(id uuid default gen_random_uuid(), restaurant_id uuid);
create table public.customer_qr_tokens(restaurant_id uuid);
create table public.customer_points_qr_references(restaurant_id uuid);
create table public.daily_pin_attempts(restaurant_id uuid);
create table public.rewards(restaurant_id uuid);
create table public.kassa_compliance_acknowledgements(restaurant_id uuid);
create table public.customer_transactional_email_deliveries(restaurant_id uuid);
create table public.customer_reward_notification_state(restaurant_id uuid);
create table public.customer_legal_acceptances(restaurant_id uuid);
create table public.customer_consents(restaurant_id uuid);
create table public.consent_events(restaurant_id uuid);
create table public.legal_documents(restaurant_id uuid);
create table public.platform_security_flags(restaurant_id uuid);
create table public.restaurant_onboarding_drafts(restaurant_id uuid);
create table public.loyalty_settings(restaurant_id uuid);
create table public.restaurant_branding(restaurant_id uuid);
create or replace function public.country_launch_readiness_snapshot(text)
returns jsonb language sql stable as $$select '{"ready":false}'::jsonb$$;

-- Auth JWT verification belongs to the gateway; only signed-claim inputs are
-- simulated through test.actor/test.jwt. Platform roles use actual DB rows.
create function public.fixture_tenant(n integer) returns uuid
language plpgsql as $$
declare r uuid := ('7b4c0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
begin
  insert into auth.users values(r);
  insert into public.organizations values(r,r,'Synthetic organization');
  insert into public.restaurants(id,organization_id,primary_branch_id,name,owner_id,slug)
    values(r,r,r,'WUXUAI TEST '||n,r,'synthetic-'||n);
  insert into public.branches(id,restaurant_id,organization_id,country,name) values(r,r,r,'AT','Synthetic location');
  insert into public.restaurant_members values(r,r,'owner');
  return r;
end$$;
