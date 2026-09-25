-- Phase 7D.4B: customer reads never bootstrap identity or issue QR credentials.
-- This migration is local-only until a separate, fingerprinted Staging gate.
begin;

-- The credential grain is the restaurant-scoped customer row. A central
-- membership has a unique customer_id and therefore resolves to this grain.
alter table public.customer_qr_tokens
  add column if not exists revoked_at timestamptz;

create or replace function public.protect_customer_qr_token_history()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
begin
  if tg_op='DELETE' then
    raise exception 'CUSTOMER_TOKEN_DELETE_FORBIDDEN' using errcode='42501';
  end if;
  if old.id is distinct from new.id
    or old.created_at is distinct from new.created_at
    or old.expires_at is distinct from new.expires_at
    or old.restaurant_id is distinct from new.restaurant_id
    or old.customer_id is distinct from new.customer_id
    or old.token_hash is distinct from new.token_hash
    or (old.active is false and new.active is true)
    or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
    or (new.active and new.revoked_at is not null) then
    raise exception 'CUSTOMER_TOKEN_HISTORY_IMMUTABLE' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.protect_customer_qr_token_history()
  from public,anon,authenticated;
drop trigger if exists protect_customer_qr_token_history on public.customer_qr_tokens;
create trigger protect_customer_qr_token_history
  before update or delete on public.customer_qr_tokens
  for each row execute function public.protect_customer_qr_token_history();

create table if not exists public.customer_token_recovery_receipts (
  account_id uuid not null references public.customer_accounts(id),
  restaurant_id uuid not null references public.restaurants(id),
  customer_id uuid not null references public.customers(id),
  auth_session_id uuid not null,
  request_id uuid not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (account_id, request_id),
  unique (account_id, restaurant_id, auth_session_id)
);
alter table public.customer_token_recovery_receipts enable row level security;
revoke all on public.customer_token_recovery_receipts from public, anon, authenticated;

create table if not exists public.customer_portal_session_contexts (
  account_id uuid not null references public.customer_accounts(id),
  auth_session_id uuid not null,
  restaurant_id uuid not null references public.restaurants(id),
  updated_at timestamptz not null default now(),
  primary key (account_id, auth_session_id)
);
alter table public.customer_portal_session_contexts enable row level security;
revoke all on public.customer_portal_session_contexts from public, anon, authenticated;

create table if not exists public.customer_login_audit_receipts (
  account_id uuid not null references public.customer_accounts(id),
  auth_session_id uuid not null,
  restaurant_id uuid not null references public.restaurants(id),
  created_at timestamptz not null default now(),
  primary key (account_id, auth_session_id)
);
alter table public.customer_login_audit_receipts enable row level security;
revoke all on public.customer_login_audit_receipts from public, anon, authenticated;

create or replace function public.read_authenticated_customer_account_id()
returns uuid language plpgsql stable security definer
set search_path = pg_catalog, public, auth, pg_temp as $function$
declare account_id_value uuid;
begin
  if auth.uid() is null then
    raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end if;
  select a.id into account_id_value
  from public.customer_accounts a join auth.users u on u.id=a.auth_user_id
  where a.auth_user_id=auth.uid() and a.disabled_at is null
    and u.email_confirmed_at is not null;
  if account_id_value is null then
    raise exception 'CUSTOMER_ACCOUNT_NOT_FOUND' using errcode='42501';
  end if;
  return account_id_value;
end;
$function$;
revoke all on function public.read_authenticated_customer_account_id() from public, anon, authenticated;

-- Explicit onboarding remains the sole account-bootstrap path. Existing
-- accounts must not receive last_seen/email writes from this helper.
create or replace function public.ensure_authenticated_customer_account()
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, auth, pg_temp as $function$
declare
  user_record auth.users%rowtype;
  account_id_value uuid;
  first_name_value text;
  phone_value text;
  birthday_value date;
begin
  if auth.uid() is null then raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501'; end if;
  select * into user_record from auth.users where id=auth.uid();
  if user_record.id is null or user_record.email_confirmed_at is null then
    raise exception 'CUSTOMER_EMAIL_CONFIRMATION_REQUIRED' using errcode='42501';
  end if;
  select id into account_id_value from public.customer_accounts
    where auth_user_id=user_record.id and disabled_at is null;
  if account_id_value is not null then return account_id_value; end if;
  first_name_value:=trim(coalesce(user_record.raw_user_meta_data->>'customer_first_name',''));
  phone_value:=public.normalize_customer_phone(user_record.raw_user_meta_data->>'customer_phone');
  begin
    birthday_value:=nullif(user_record.raw_user_meta_data->>'customer_birthday','')::date;
  exception when others then birthday_value:=null;
  end;
  if first_name_value='' or char_length(first_name_value)>80 then
    raise exception 'CUSTOMER_PROFILE_INCOMPLETE' using errcode='P0001';
  end if;
  if phone_value is null then raise exception 'CUSTOMER_PROFILE_PHONE_INVALID' using errcode='P0001'; end if;
  insert into public.customer_accounts
    (auth_user_id,email,first_name,phone,normalized_phone,birthday,email_confirmed_at)
  values (user_record.id,lower(user_record.email),first_name_value,phone_value,phone_value,
    birthday_value,user_record.email_confirmed_at)
  returning id into account_id_value;
  insert into public.customer_account_emails(account_id,email,status,confirmed_at,updated_at)
  values(account_id_value,lower(user_record.email),'CONFIRMED',user_record.email_confirmed_at,now())
  on conflict(account_id) do update set email=excluded.email,status='CONFIRMED',
    confirmed_at=excluded.confirmed_at,updated_at=now();
  return account_id_value;
exception when unique_violation then
  raise exception 'CUSTOMER_ACCOUNT_ALREADY_EXISTS' using errcode='P0001';
end;
$function$;

-- Token lifecycle events are emitted at the table boundary, including
-- legacy registration/support code. No raw token or token hash is audited.
create or replace function public.audit_customer_qr_token_lifecycle()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $function$
declare
  event_name text;
  request_value uuid;
  correlation_value text;
  actor_value uuid;
  actor_kind text;
begin
  if tg_op='INSERT' then
    if new.active is not true then return new; end if;
    event_name:='CUSTOMER_TOKEN_CREATED';
  elsif tg_op='UPDATE' and old.active is true and new.active is false then
    event_name:='CUSTOMER_TOKEN_REVOKED';
  else
    return new;
  end if;
  begin request_value:=nullif(current_setting('wuxuai.customer_token_request_id',true),'')::uuid;
  exception when others then request_value:=null; end;
  correlation_value:=nullif(current_setting('wuxuai.customer_token_correlation_id',true),'');
  if auth.uid() is not null and exists (
    select 1 from public.customer_account_memberships m
    join public.customer_accounts a on a.id=m.account_id
    where m.restaurant_id=new.restaurant_id and m.customer_id=new.customer_id
      and a.auth_user_id=auth.uid() and a.disabled_at is null
  ) then
    actor_kind:='customer'; actor_value:=new.customer_id;
  else
    actor_kind:='system'; actor_value:=null;
  end if;
  perform public.write_audit_event(new.restaurant_id,new.customer_id,actor_kind,actor_value,
    event_name,'success','customer_token_lifecycle','customer_qr_tokens',new.id,
    request_value,jsonb_build_object('correlation_id',correlation_value,
      'reason',coalesce(nullif(current_setting('wuxuai.customer_token_audit_reason',true),''),'server_transition')));
  return new;
end;
$function$;
revoke all on function public.audit_customer_qr_token_lifecycle() from public, anon, authenticated;
drop trigger if exists audit_customer_qr_token_lifecycle on public.customer_qr_tokens;
create trigger audit_customer_qr_token_lifecycle
  after insert or update of active on public.customer_qr_tokens
  for each row execute function public.audit_customer_qr_token_lifecycle();

-- A repeatable, deterministic reconciliation precedes the unique index:
-- newest valid (created_at, id) survives; if none is valid, none survives.
-- Rows are revoked, never deleted. The lifecycle trigger appends the audit.
lock table public.customer_qr_tokens in share row exclusive mode;
select set_config('wuxuai.customer_token_audit_reason','HISTORICAL_TOKEN_RECONCILIATION',true);
with ranked as (
  select id,active,expires_at,
    row_number() over (partition by restaurant_id,customer_id
      order by case when active and (expires_at is null or expires_at>now()) then 0 else 1 end,
        created_at desc,id desc) as position,
    bool_or(active and (expires_at is null or expires_at>now()))
      over (partition by restaurant_id,customer_id) as has_valid
  from public.customer_qr_tokens where active
)
update public.customer_qr_tokens t
set active=false,rotated_at=coalesce(t.rotated_at,now()),revoked_at=coalesce(t.revoked_at,now())
from ranked r where t.id=r.id
  and (r.position>1 or not r.has_valid);
create unique index if not exists customer_qr_tokens_one_active_per_customer_idx
  on public.customer_qr_tokens(restaurant_id,customer_id) where active;

-- Explicit first-time membership insertion is the only membership-open audit.
create or replace function public.audit_customer_membership_opened()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
begin
  perform public.write_audit_event(new.restaurant_id,new.customer_id,'customer',new.customer_id,
    'CUSTOMER_MEMBERSHIP_OPENED','success','customer_membership_transition',
    'customer_account_memberships',new.id,null,jsonb_build_object('transition','first_join'));
  return new;
end;
$function$;
revoke all on function public.audit_customer_membership_opened() from public,anon,authenticated;
drop trigger if exists audit_customer_membership_opened on public.customer_account_memberships;
create trigger audit_customer_membership_opened after insert on public.customer_account_memberships
  for each row execute function public.audit_customer_membership_opened();

create or replace function public.get_customer_account()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  account_id_value uuid:=public.read_authenticated_customer_account_id();
  account_record public.customer_accounts%rowtype;
begin
  select * into account_record from public.customer_accounts where id=account_id_value;
  return jsonb_build_object(
    'profile',jsonb_build_object(
      'first_name',account_record.first_name,
      'phone_masked',public.mask_customer_phone(account_record.phone),
      'birthday_masked',case when account_record.birthday is null then null
        else to_char(account_record.birthday,'DD.MM.')||'****' end,
      'email',account_record.email,
      'email_status',case when account_record.email_confirmed_at is null
        then 'PENDING_CONFIRMATION' else 'CONFIRMED' end),
    'memberships',coalesce((
      select jsonb_agg(jsonb_build_object(
        'restaurant_id',restaurant.id,
        'branch_id',branch.id,
        'name',coalesce(branch.name,restaurant.name),
        'slug',restaurant.slug,
        'logo_url',branding.logo_url,
        'address',branch.address,
        'postal_code',branch.postal_code,
        'city',branch.city,
        'country',branch.country,
        'opening_hours',restaurant.opening_hours,
        'special_days',restaurant.special_days,
        'holidays',restaurant.holidays,
        'membership_status',customer.membership_status,
        'points_balance',customer.points_balance,
        'visits_count',coalesce(visit.visits_count,0),
        'last_visit_at',visit.last_visit_at,
        'available_rewards',coalesce(reward.available_rewards,'[]'::jsonb),
        'next_reward',reward.next_reward,
        'active_gifts',coalesce(gift.active_gifts,0),
        'new_offer_count',coalesce(offer.new_offer_count,0),
        'email_preference',coalesce(consent.frequency,'NEVER'),
        'email_consent_status',coalesce(consent.status,'NOT_GRANTED')
      ) order by visit.last_visit_at desc nulls last,membership.linked_at desc,restaurant.name)
      from public.customer_account_memberships membership
      join public.customers customer on customer.id=membership.customer_id
        and customer.restaurant_id=membership.restaurant_id
      join public.restaurants restaurant on restaurant.id=membership.restaurant_id
      left join public.restaurant_branding branding on branding.restaurant_id=restaurant.id
      left join lateral (
        select b.* from public.branches b where b.restaurant_id=restaurant.id and b.status='active'
        order by (b.id=restaurant.primary_branch_id) desc,b.created_at limit 1
      ) branch on true
      left join lateral (
        select count(*)::integer visits_count,max(t.created_at) last_visit_at
        from public.points_transactions t where t.restaurant_id=restaurant.id
          and t.customer_id=customer.id and t.type='earn' and t.points>0
      ) visit on true
      left join lateral (
        select
          (select coalesce(jsonb_agg(jsonb_build_object(
            'id',r.id,'title',r.title,'required_points',r.required_points,
            'image_url',r.image_url,'expires_at',r.expires_at)
            order by r.required_points,r.title),'[]'::jsonb)
           from public.rewards r where r.restaurant_id=restaurant.id and r.active=true
             and not r.is_starter_reward and r.required_points<=customer.points_balance
             and (r.expires_at is null or r.expires_at>now())) available_rewards,
          (select jsonb_build_object(
            'id',r.id,'title',r.title,'required_points',r.required_points,
            'missing_points',greatest(r.required_points-customer.points_balance,0),
            'image_url',r.image_url,'expires_at',r.expires_at)
           from public.rewards r where r.restaurant_id=restaurant.id and r.active=true
             and not r.is_starter_reward and r.required_points>customer.points_balance
             and (r.expires_at is null or r.expires_at>now())
           order by r.required_points,r.title,r.id limit 1) next_reward
      ) reward on true
      left join lateral (
        select count(*)::integer active_gifts from public.customer_rewards cr
        where cr.restaurant_id=restaurant.id and cr.customer_id=customer.id and cr.status='active'
      ) gift on true
      left join lateral (
        select count(*)::integer new_offer_count from public.restaurant_offers ro
        where ro.restaurant_id=restaurant.id and ro.status='PUBLISHED' and ro.is_active=true
          and ro.valid_from<=now() and ro.valid_to>now()
          and ro.published_at>=now()-interval '14 days'
      ) offer on true
      left join public.customer_offer_email_consents consent
        on consent.account_id=account_id_value and consent.restaurant_id=restaurant.id
      where membership.account_id=account_id_value
    ),'[]'::jsonb),
    'offers','[]'::jsonb,
    'email_delivery',coalesce((select jsonb_build_object(
      'available',setting.delivery_enabled and setting.provider_status in ('STAGING_ONLY','ACTIVE'),
      'provider_status',setting.provider_status)
      from public.customer_offer_email_delivery_settings setting where setting.id=true),
      jsonb_build_object('available',false,'provider_status','NOT_CONFIGURED'))
  );
end;
$function$;

create or replace function public.get_customer_restaurant_context(input_restaurant_slug text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  account_id_value uuid:=public.read_authenticated_customer_account_id();
  restaurant_record public.restaurants%rowtype;
  membership_record public.customer_account_memberships%rowtype;
begin
  select * into restaurant_record from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  if restaurant_record.id is null then
    raise exception 'CUSTOMER_ACCOUNT_CONTEXT_INVALID' using errcode='P0001';
  end if;
  select * into membership_record from public.customer_account_memberships
    where account_id=account_id_value and restaurant_id=restaurant_record.id;
  return jsonb_build_object(
    'restaurant_id',restaurant_record.id,
    'restaurant_name',restaurant_record.name,
    'restaurant_slug',restaurant_record.slug,
    'membership_exists',membership_record.id is not null,
    'legal_ready',public.restaurant_legal_bundle_is_current(restaurant_record.id,current_date));
end;
$function$;

create or replace function public.get_customer_restaurant_access(
  input_restaurant_slug text,input_customer_token text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  context_value jsonb:=public.get_customer_restaurant_context(input_restaurant_slug);
  account_id_value uuid:=public.read_authenticated_customer_account_id();
  token_is_valid boolean:=false;
begin
  if coalesce((context_value->>'membership_exists')::boolean,false)
    and nullif(trim(coalesce(input_customer_token,'')),'') is not null then
    select exists(
      select 1 from public.customer_account_memberships m
      join public.customers c on c.id=m.customer_id and c.restaurant_id=m.restaurant_id
      join public.customer_qr_tokens t on t.customer_id=m.customer_id
        and t.restaurant_id=m.restaurant_id
      where m.account_id=account_id_value
        and m.restaurant_id=(context_value->>'restaurant_id')::uuid
        and c.membership_status='active' and t.active
        and t.revoked_at is null
        and (t.expires_at is null or t.expires_at>now())
        and t.token_hash=public.hash_public_token(input_customer_token)
    ) into token_is_valid;
  end if;
  return context_value||jsonb_build_object('token_valid',token_is_valid);
end;
$function$;
revoke all on function public.get_customer_restaurant_access(text,text) from public,anon;
grant execute on function public.get_customer_restaurant_access(text,text) to authenticated;

-- Compatibility entry point for explicit join/referral RPCs. It validates
-- the membership but never issues or returns a credential on its own.
create or replace function public.open_customer_account_membership(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  account_id_value uuid:=public.read_authenticated_customer_account_id();
  membership_record record;
begin
  select r.slug,c.membership_status into membership_record
  from public.customer_account_memberships m
  join public.restaurants r on r.id=m.restaurant_id
  join public.customers c on c.id=m.customer_id and c.restaurant_id=m.restaurant_id
  where m.account_id=account_id_value and m.restaurant_id=input_restaurant_id;
  if membership_record.slug is null then
    raise exception 'CUSTOMER_MEMBERSHIP_NOT_FOUND' using errcode='P0001';
  end if;
  if membership_record.membership_status is distinct from 'active' then
    raise exception 'CUSTOMER_MEMBERSHIP_INACTIVE' using errcode='P0001';
  end if;
  return jsonb_build_object('restaurant_slug',membership_record.slug,'customer_token',null);
end;
$function$;

create or replace function public.get_customer_identity_summary(
  input_restaurant_slug text,input_customer_token text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
begin
  select * into restaurant_record from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  select c.* into customer_record from public.customer_qr_tokens t
  join public.customers c on c.id=t.customer_id and c.restaurant_id=t.restaurant_id
  where t.restaurant_id=restaurant_record.id
    and t.token_hash=public.hash_public_token(input_customer_token)
    and t.active and t.revoked_at is null
    and (t.expires_at is null or t.expires_at>now()) limit 1;
  if customer_record.id is null then
    raise exception 'CUSTOMER_ACCESS_TOKEN_INVALID' using errcode='42501';
  end if;
  return jsonb_build_object('phone_masked',public.mask_customer_phone(customer_record.phone),
    'birthday_masked',case when customer_record.birthday_day is null
      or customer_record.birthday_month is null then null
      else lpad(customer_record.birthday_day::text,2,'0')||'.'
        ||lpad(customer_record.birthday_month::text,2,'0')||'.****' end);
end;
$function$;

-- Only an explicit customer action with a freshly authenticated, signed
-- session may replace a browser credential. A replay cannot reveal it again.
create or replace function public.recover_customer_membership_token(
  input_restaurant_slug text, input_request_id uuid, input_correlation_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,extensions,pg_temp as $function$
declare
  claims_value jsonb:=auth.jwt();
  session_value uuid;
  account_value uuid;
  membership_value public.customer_account_memberships%rowtype;
  customer_value public.customers%rowtype;
  restaurant_value public.restaurants%rowtype;
  raw_value text;
  token_value uuid;
  revoked_count integer;
begin
  if input_request_id is null or input_correlation_id is null then
    raise exception 'CUSTOMER_RECOVERY_IDS_REQUIRED' using errcode='22023';
  end if;
  account_value:=public.read_authenticated_customer_account_id();
  if claims_value->>'sub' is distinct from auth.uid()::text
    or nullif(claims_value->>'session_id','') is null then
    raise exception 'RECENT_CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end if;
  begin
    session_value:=(claims_value->>'session_id')::uuid;
  exception when others then
    raise exception 'RECENT_CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end;
  if not exists(select 1 from auth.sessions s
    where s.id=session_value and s.user_id=auth.uid()
      and s.created_at<=statement_timestamp()+interval '1 minute'
      and s.created_at>=statement_timestamp()-interval '10 minutes'
      and (s.not_after is null or s.not_after>statement_timestamp())) then
    raise exception 'RECENT_CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end if;
  select * into restaurant_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  if restaurant_value.id is null then
    raise exception 'CUSTOMER_ACCOUNT_CONTEXT_INVALID' using errcode='42501';
  end if;
  select * into membership_value from public.customer_account_memberships
    where account_id=account_value and restaurant_id=restaurant_value.id;
  if membership_value.id is null then
    raise exception 'CUSTOMER_MEMBERSHIP_NOT_FOUND' using errcode='42501';
  end if;
  select * into customer_value from public.customers
    where id=membership_value.customer_id and restaurant_id=restaurant_value.id
      and membership_status='active';
  if customer_value.id is null then
    raise exception 'CUSTOMER_MEMBERSHIP_INACTIVE' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(membership_value.id::text,0));
  if exists(select 1 from public.customer_token_recovery_receipts
    where account_id=account_value and (request_id=input_request_id
      or (restaurant_id=restaurant_value.id and auth_session_id=session_value))) then
    raise exception 'CUSTOMER_RECOVERY_REAUTH_REQUIRED' using errcode='42501';
  end if;
  insert into public.customer_token_recovery_receipts
    (account_id,restaurant_id,customer_id,auth_session_id,request_id,correlation_id)
  values(account_value,restaurant_value.id,customer_value.id,session_value,
    input_request_id,input_correlation_id);
  perform set_config('wuxuai.customer_token_request_id',input_request_id::text,true);
  perform set_config('wuxuai.customer_token_correlation_id',input_correlation_id::text,true);
  perform set_config('wuxuai.customer_token_audit_reason','EXPLICIT_RECOVERY',true);
  update public.customer_qr_tokens set active=false,revoked_at=now(),rotated_at=now()
    where restaurant_id=restaurant_value.id and customer_id=customer_value.id and active;
  get diagnostics revoked_count=row_count;
  raw_value:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.customer_qr_tokens(restaurant_id,customer_id,token_hash,active)
  values(restaurant_value.id,customer_value.id,public.hash_public_token(raw_value),true)
  returning id into token_value;
  perform public.write_audit_event(restaurant_value.id,customer_value.id,'customer',
    customer_value.id,'CUSTOMER_TOKEN_ROTATED','success','explicit_customer_recovery',
    'customer_qr_tokens',token_value,input_request_id,
    jsonb_build_object('correlation_id',input_correlation_id,
      'previous_active_revoked',revoked_count));
  return jsonb_build_object('customer_token',raw_value,'restaurant_slug',restaurant_value.slug);
end;
$function$;
revoke all on function public.recover_customer_membership_token(text,uuid,uuid)
  from public,anon;
grant execute on function public.recover_customer_membership_token(text,uuid,uuid)
  to authenticated;

create or replace function public.customer_verified_session_id()
returns uuid language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare claims_value jsonb:=auth.jwt(); session_value uuid;
begin
  if auth.uid() is null or claims_value->>'sub' is distinct from auth.uid()::text
    or nullif(claims_value->>'session_id','') is null then
    raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end if;
  begin session_value:=(claims_value->>'session_id')::uuid;
  exception when others then
    raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end;
  if not exists(select 1 from auth.sessions s where s.id=session_value
    and s.user_id=auth.uid() and (s.not_after is null or s.not_after>statement_timestamp())) then
    raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end if;
  return session_value;
end;
$function$;
revoke all on function public.customer_verified_session_id() from public,anon,authenticated;

-- The client calls this only after a successful Auth sign-in. A signed fresh
-- session plus the receipt permit one login audit, never a page-view audit.
create or replace function public.record_customer_login_success(input_restaurant_slug text)
returns boolean language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare
  account_value uuid:=public.read_authenticated_customer_account_id();
  session_value uuid:=public.customer_verified_session_id();
  membership_value public.customer_account_memberships%rowtype;
begin
  if not exists(select 1 from auth.sessions s where s.id=session_value
    and s.user_id=auth.uid() and s.created_at>=statement_timestamp()-interval '10 minutes') then
    raise exception 'RECENT_CUSTOMER_AUTH_REQUIRED' using errcode='42501';
  end if;
  select m.* into membership_value from public.customer_account_memberships m
  join public.restaurants r on r.id=m.restaurant_id
  where m.account_id=account_value
    and (nullif(trim(coalesce(input_restaurant_slug,'')),'') is null
      or r.slug=trim(input_restaurant_slug))
  order by m.linked_at,m.id limit 1;
  if membership_value.id is null then return false; end if;
  insert into public.customer_login_audit_receipts
    (account_id,auth_session_id,restaurant_id)
  values(account_value,session_value,membership_value.restaurant_id)
  on conflict(account_id,auth_session_id) do nothing;
  if not found then return false; end if;
  perform public.write_audit_event(membership_value.restaurant_id,
    membership_value.customer_id,'customer',membership_value.customer_id,
    'CUSTOMER_LOGIN_SUCCESS','success','authenticated_customer_sign_in',
    'customer_account_memberships',membership_value.id,null,
    jsonb_build_object('auth_session_verified',true));
  return true;
end;
$function$;
revoke all on function public.record_customer_login_success(text) from public,anon;
grant execute on function public.record_customer_login_success(text) to authenticated;

-- An explicit switch may set an initial context; only a real change appends
-- CONTEXT_CHANGED. None of the route/read RPCs invoke this function.
create or replace function public.set_customer_portal_context(
  input_restaurant_slug text,input_request_id uuid,input_correlation_id uuid)
returns boolean language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare
  account_value uuid:=public.read_authenticated_customer_account_id();
  session_value uuid:=public.customer_verified_session_id();
  membership_value public.customer_account_memberships%rowtype;
  prior_restaurant uuid;
begin
  if input_request_id is null or input_correlation_id is null then
    raise exception 'CUSTOMER_CONTEXT_IDS_REQUIRED' using errcode='22023';
  end if;
  select m.* into membership_value from public.customer_account_memberships m
  join public.restaurants r on r.id=m.restaurant_id and r.status='active'
  join public.customers c on c.id=m.customer_id and c.restaurant_id=m.restaurant_id
    and c.membership_status='active'
  where m.account_id=account_value and r.slug=trim(input_restaurant_slug);
  if membership_value.id is null then
    raise exception 'CUSTOMER_MEMBERSHIP_NOT_FOUND' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(account_value::text||session_value::text,0));
  select restaurant_id into prior_restaurant from public.customer_portal_session_contexts
    where account_id=account_value and auth_session_id=session_value;
  if prior_restaurant=membership_value.restaurant_id then return false; end if;
  insert into public.customer_portal_session_contexts
    (account_id,auth_session_id,restaurant_id)
  values(account_value,session_value,membership_value.restaurant_id)
  on conflict(account_id,auth_session_id) do update
    set restaurant_id=excluded.restaurant_id,updated_at=now();
  if prior_restaurant is not null then
    perform public.write_audit_event(membership_value.restaurant_id,
      membership_value.customer_id,'customer',membership_value.customer_id,
      'CUSTOMER_CONTEXT_CHANGED','success','explicit_restaurant_switch',
      'customer_account_memberships',membership_value.id,input_request_id,
      jsonb_build_object('correlation_id',input_correlation_id));
  end if;
  return prior_restaurant is not null;
end;
$function$;
revoke all on function public.set_customer_portal_context(text,uuid,uuid)
  from public,anon;
grant execute on function public.set_customer_portal_context(text,uuid,uuid)
  to authenticated;
commit;
