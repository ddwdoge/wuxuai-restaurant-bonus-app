-- Isolated, fail-closed confirmation-link delivery. No approved document,
-- recipient, token, provider configuration or scheduler is seeded here.
begin;

create table public.customer_offer_email_confirmation_outbox (
  request_id uuid primary key references public.customer_offer_email_request_receipts(request_id) on delete restrict,
  consent_id uuid not null references public.customer_offer_email_consents(id) on delete restrict,
  status text not null default 'PENDING' check
    (status in ('PENDING','CLAIMED','SUBMITTING','ACCEPTED','UNKNOWN','SKIPPED')),
  expires_at timestamptz not null,
  claim_id uuid,
  claim_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  provider_started_at timestamptz,
  provider_accepted_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (status='CLAIMED' and claim_id is not null and claim_expires_at is not null
      and provider_started_at is null)
    or (status='SUBMITTING' and claim_id is not null and claim_expires_at is null
      and provider_started_at is not null)
    or (status='PENDING' and claim_id is null and claim_expires_at is null
      and provider_started_at is null)
    or status in ('ACCEPTED','UNKNOWN','SKIPPED'))
);
create index customer_offer_email_confirmation_outbox_due_idx
  on public.customer_offer_email_confirmation_outbox(status,created_at);
alter table public.customer_offer_email_confirmation_outbox enable row level security;
revoke all on public.customer_offer_email_confirmation_outbox
  from public,anon,authenticated,service_role;

alter table public.customer_offer_email_consents
  add column pending_offer_email_request_id uuid
    references public.customer_offer_email_request_receipts(request_id) on delete restrict;

-- Keep old token rows as history. Only one unused confirmation token can exist
-- per consent; a new request invalidates the previous link before a new claim.
alter table public.customer_offer_email_tokens
  drop constraint customer_offer_email_tokens_consent_id_purpose_key;
alter table public.customer_offer_email_tokens
  drop constraint customer_offer_email_tokens_offer_email_request_id_key;
create index customer_offer_email_tokens_request_history_idx
  on public.customer_offer_email_tokens(offer_email_request_id);
create unique index customer_offer_email_tokens_one_unused_confirmation
  on public.customer_offer_email_tokens(consent_id,purpose) where used_at is null;

-- The old Edge/DB pairing must fail closed during any future rollout.
revoke execute on function public.request_authenticated_customer_offer_email_confirmation(
  uuid,uuid,uuid,text,text,uuid,uuid,text,text) from service_role;

create or replace function public.request_authenticated_customer_offer_email_confirmation_v2(
  input_auth_user_id uuid,input_auth_session_id uuid,input_restaurant_id uuid,
  input_frequency text,input_request_id uuid,input_expected_document_id uuid,
  input_expected_version text,input_expected_sha256 text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare account_id_value uuid; customer_id_value uuid; email_value text;
  consent_id_value uuid; existing public.customer_offer_email_consents%rowtype;
  document_row public.platform_legal_document_versions%rowtype;
  prior public.customer_offer_email_request_receipts%rowtype;
  normalized_frequency text:=upper(trim(coalesce(input_frequency,'')));
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'OFFER_EMAIL_SERVICE_REQUIRED' using errcode='42501';
  end if;
  if input_auth_user_id is null or input_auth_session_id is null
    or input_restaurant_id is null or input_request_id is null
    or normalized_frequency not in ('WEEKLY','MONTHLY') then
    raise exception 'OFFER_EMAIL_REQUEST_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('offer-email-document-publication',0));
  select * into document_row from public.current_offer_email_consent_document_internal();
  if document_row.id is null then
    raise exception 'OFFER_EMAIL_DOCUMENT_UNAVAILABLE' using errcode='42501';
  end if;
  if document_row.id is distinct from input_expected_document_id
    or document_row.version is distinct from input_expected_version
    or document_row.content_sha256 is distinct from input_expected_sha256 then
    raise exception 'OFFER_EMAIL_DOCUMENT_STALE' using errcode='40001';
  end if;
  select a.id,m.customer_id,lower(u.email)
    into account_id_value,customer_id_value,email_value
  from public.customer_accounts a
  join auth.users u on u.id=a.auth_user_id and u.email_confirmed_at is not null
  join auth.sessions s on s.id=input_auth_session_id and s.user_id=u.id
    and (s.not_after is null or s.not_after>statement_timestamp())
  join public.customer_account_emails ae on ae.account_id=a.id
    and ae.status='CONFIRMED' and lower(ae.email)=lower(u.email)
  join public.customer_account_memberships m on m.account_id=a.id
    and m.restaurant_id=input_restaurant_id
  join public.customers c on c.id=m.customer_id and c.restaurant_id=m.restaurant_id
    and c.membership_status='active'
    and (c.auth_user_id is null or c.auth_user_id=u.id)
  join public.restaurants r on r.id=m.restaurant_id and r.status='active'
  join public.branches b on b.id=c.branch_id and b.restaurant_id=r.id and b.status='active'
  where u.id=input_auth_user_id and a.disabled_at is null
    and a.email_confirmed_at is not null
  for update of a;
  if account_id_value is null or email_value is null then
    raise exception 'OFFER_EMAIL_CUSTOMER_SCOPE_INVALID' using errcode='42501';
  end if;
  if not public.restaurant_entitlement_enabled(input_restaurant_id,'offer_notifications') then
    raise exception 'OFFER_EMAIL_PRO_REQUIRED' using errcode='42501';
  end if;
  select * into prior from public.customer_offer_email_request_receipts
    where request_id=input_request_id;
  if prior.request_id is not null then
    if prior.auth_user_id=input_auth_user_id
      and prior.auth_session_id=input_auth_session_id
      and prior.document_version_id=document_row.id
      and prior.document_sha256=document_row.content_sha256
      and exists(select 1 from public.customer_offer_email_consents c
        where c.id=prior.consent_id and c.account_id=account_id_value
          and c.restaurant_id=input_restaurant_id) then
      return jsonb_build_object('requested',false,'reason','REQUEST_REPLAY');
    end if;
    raise exception 'OFFER_EMAIL_REQUEST_CONFLICT' using errcode='23505';
  end if;
  if (select count(*) from public.customer_offer_email_request_receipts receipt
      where receipt.auth_user_id=input_auth_user_id
        and receipt.created_at>statement_timestamp()-interval '24 hours')>=5 then
    raise exception 'OFFER_EMAIL_RATE_LIMITED' using errcode='42501';
  end if;
  select * into existing from public.customer_offer_email_consents
    where account_id=account_id_value and restaurant_id=input_restaurant_id for update;
  if existing.status='ACTIVE' and existing.consent_document_version_id=document_row.id
    and existing.consent_content_sha256=document_row.content_sha256 then
    return jsonb_build_object('requested',false,'reason','ALREADY_ACTIVE');
  end if;
  if existing.status='PENDING_CONFIRMATION'
    and existing.consent_document_version_id=document_row.id
    and existing.consent_content_sha256=document_row.content_sha256
    and existing.confirmation_requested_at>statement_timestamp()-interval '5 minutes' then
    return jsonb_build_object('requested',false,'reason','ALREADY_PENDING');
  end if;
  insert into public.customer_offer_email_consents(
    account_id,restaurant_id,customer_id,email,frequency,status,
    consent_version,consent_document_version_id,consent_content_sha256,
    source,confirmation_requested_at,updated_at)
  values(account_id_value,input_restaurant_id,customer_id_value,email_value,
    normalized_frequency,'PENDING_CONFIRMATION',document_row.version,document_row.id,
    document_row.content_sha256,'authenticated_customer_ui',clock_timestamp(),clock_timestamp())
  on conflict(account_id,restaurant_id) do update set
    customer_id=excluded.customer_id,email=excluded.email,frequency=excluded.frequency,
    status='PENDING_CONFIRMATION',consent_version=excluded.consent_version,
    consent_document_version_id=excluded.consent_document_version_id,
    consent_content_sha256=excluded.consent_content_sha256,source=excluded.source,
    consented_at=null,withdrawn_at=null,confirmation_requested_at=clock_timestamp(),
    email_confirmed_at=null,updated_at=clock_timestamp()
  returning id into consent_id_value;
  update public.customer_offer_email_tokens set used_at=clock_timestamp()
    where consent_id=consent_id_value and purpose='CONFIRM' and used_at is null;
  update public.customer_offer_email_confirmation_outbox set status='SKIPPED',
    updated_at=clock_timestamp()
    where consent_id=consent_id_value and status in ('PENDING','CLAIMED');
  insert into public.customer_offer_email_request_receipts(
    request_id,consent_id,document_version_id,document_version,document_sha256,
    auth_user_id,auth_session_id)
  values(input_request_id,consent_id_value,document_row.id,document_row.version,
    document_row.content_sha256,input_auth_user_id,input_auth_session_id);
  update public.customer_offer_email_consents
    set pending_offer_email_request_id=input_request_id where id=consent_id_value;
  insert into public.customer_offer_email_confirmation_outbox(
    request_id,consent_id,expires_at)
  values(input_request_id,consent_id_value,clock_timestamp()+interval '24 hours');
  perform public.write_audit_event(input_restaurant_id,customer_id_value,'customer',
    customer_id_value,'OFFER_EMAIL_CONSENT_REQUESTED','pending',
    'authenticated_customer_ui','customer_offer_email_consents',consent_id_value,
    input_request_id,jsonb_build_object('document_id',document_row.id,
      'version',document_row.version,'sha256',document_row.content_sha256));
  return jsonb_build_object('requested',true);
end;
$function$;
revoke all on function public.request_authenticated_customer_offer_email_confirmation_v2(
  uuid,uuid,uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.request_authenticated_customer_offer_email_confirmation_v2(
  uuid,uuid,uuid,text,uuid,uuid,text,text) to service_role;

create or replace function public.offer_email_confirmation_delivery_valid_internal(input_request_id uuid)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare receipt public.customer_offer_email_request_receipts%rowtype;
  document_row public.platform_legal_document_versions%rowtype;
begin
  select * into receipt from public.customer_offer_email_request_receipts
    where request_id=input_request_id;
  select * into document_row from public.current_offer_email_consent_document_internal();
  return coalesce(receipt.request_id is not null and document_row.id is not null
    and receipt.created_at+interval '24 hours'>statement_timestamp()
    and receipt.document_version_id=document_row.id
    and receipt.document_version=document_row.version
    and receipt.document_sha256=document_row.content_sha256
    and exists(select 1
      from public.customer_offer_email_consents consent
      join public.customer_accounts account on account.id=consent.account_id
        and account.auth_user_id=receipt.auth_user_id and account.disabled_at is null
        and account.email_confirmed_at is not null
      join auth.users u on u.id=receipt.auth_user_id and u.email_confirmed_at is not null
      join auth.sessions s on s.id=receipt.auth_session_id and s.user_id=u.id
        and (s.not_after is null or s.not_after>statement_timestamp())
      join public.customer_account_emails ae on ae.account_id=account.id
        and ae.status='CONFIRMED' and lower(ae.email)=lower(u.email)
      join public.customer_account_memberships m on m.account_id=account.id
        and m.restaurant_id=consent.restaurant_id and m.customer_id=consent.customer_id
      join public.customers customer on customer.id=m.customer_id
        and customer.restaurant_id=m.restaurant_id and customer.membership_status='active'
        and (customer.auth_user_id is null or customer.auth_user_id=u.id)
      join public.restaurants r on r.id=m.restaurant_id and r.status='active'
      join public.branches b on b.id=customer.branch_id and b.restaurant_id=r.id
        and b.status='active'
      where consent.id=receipt.consent_id and consent.status='PENDING_CONFIRMATION'
        and consent.pending_offer_email_request_id=receipt.request_id
        and consent.consent_document_version_id=document_row.id
        and consent.consent_version=document_row.version
        and consent.consent_content_sha256=document_row.content_sha256
        and lower(consent.email)=lower(u.email)
        and public.restaurant_entitlement_enabled(consent.restaurant_id,'offer_notifications')
    ),false);
end;
$function$;
revoke all on function public.offer_email_confirmation_delivery_valid_internal(uuid)
  from public,anon,authenticated,service_role;

create or replace function public.claim_customer_offer_email_confirmation_delivery()
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare delivery public.customer_offer_email_confirmation_outbox%rowtype;
  raw_token text; delivery_claim_id uuid; email_value text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'OFFER_EMAIL_SERVICE_REQUIRED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('offer-email-document-publication',0));
  select * into delivery from public.customer_offer_email_confirmation_outbox
    where (status='PENDING' or
      (status='CLAIMED' and claim_expires_at<=statement_timestamp()))
      and attempt_count<10
    order by created_at,request_id for update skip locked limit 1;
  if delivery.request_id is null then return jsonb_build_object('claimed',false); end if;
  if delivery.expires_at<=statement_timestamp()
    or not public.offer_email_confirmation_delivery_valid_internal(delivery.request_id) then
    update public.customer_offer_email_confirmation_outbox
      set status='SKIPPED',claim_id=null,claim_expires_at=null,updated_at=clock_timestamp()
      where request_id=delivery.request_id;
    return jsonb_build_object('claimed',false,'skipped',true);
  end if;
  raw_token:=encode(extensions.gen_random_bytes(32),'hex');
  delivery_claim_id:=extensions.gen_random_uuid();
  update public.customer_offer_email_tokens set used_at=clock_timestamp()
    where consent_id=delivery.consent_id and purpose='CONFIRM' and used_at is null;
  insert into public.customer_offer_email_tokens(
    consent_id,purpose,token_hash,expires_at,offer_email_request_id)
  values(delivery.consent_id,'CONFIRM',public.hash_public_token(raw_token),
    delivery.expires_at,delivery.request_id);
  update public.customer_offer_email_confirmation_outbox
    set status='CLAIMED',claim_id=delivery_claim_id,
      claim_expires_at=clock_timestamp()+interval '1 minute',
      attempt_count=attempt_count+1,updated_at=clock_timestamp()
    where request_id=delivery.request_id;
  select consent.email into email_value from public.customer_offer_email_consents consent
    where consent.id=delivery.consent_id;
  return jsonb_build_object('claimed',true,'request_id',delivery.request_id,
    'claim_id',delivery_claim_id,'token',raw_token,'email',email_value,
    'expires_at',delivery.expires_at);
end;
$function$;
revoke all on function public.claim_customer_offer_email_confirmation_delivery()
  from public,anon,authenticated;
grant execute on function public.claim_customer_offer_email_confirmation_delivery()
  to service_role;

create or replace function public.begin_customer_offer_email_confirmation_delivery(
  input_request_id uuid,input_claim_id uuid,input_token text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare delivery public.customer_offer_email_confirmation_outbox%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'OFFER_EMAIL_SERVICE_REQUIRED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('offer-email-document-publication',0));
  select * into delivery from public.customer_offer_email_confirmation_outbox
    where request_id=input_request_id for update;
  if delivery.request_id is null or delivery.status<>'CLAIMED'
    or delivery.claim_id is distinct from input_claim_id
    or delivery.claim_expires_at<=statement_timestamp()
    or delivery.expires_at<=statement_timestamp()
    or not exists(select 1 from public.customer_offer_email_tokens token
      where token.offer_email_request_id=input_request_id
        and token.consent_id=delivery.consent_id and token.purpose='CONFIRM'
        and token.token_hash=public.hash_public_token(input_token)
        and token.used_at is null and token.expires_at>statement_timestamp())
    or not public.offer_email_confirmation_delivery_valid_internal(input_request_id) then
    return jsonb_build_object('authorized',false);
  end if;
  update public.customer_offer_email_confirmation_outbox
    set status='SUBMITTING',provider_started_at=clock_timestamp(),
      claim_expires_at=null,updated_at=clock_timestamp()
    where request_id=input_request_id;
  return jsonb_build_object('authorized',true);
end;
$function$;
revoke all on function public.begin_customer_offer_email_confirmation_delivery(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.begin_customer_offer_email_confirmation_delivery(uuid,uuid,text)
  to service_role;

create or replace function public.complete_customer_offer_email_confirmation_delivery(
  input_request_id uuid,input_claim_id uuid,input_accepted boolean,
  input_provider_message_id text default null
)
returns boolean language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'OFFER_EMAIL_SERVICE_REQUIRED' using errcode='42501';
  end if;
  update public.customer_offer_email_confirmation_outbox
    set status=case when input_accepted is true then 'ACCEPTED' else 'UNKNOWN' end,
      provider_accepted_at=case when input_accepted is true then clock_timestamp()
        else null end,
      provider_message_id=case when input_accepted is true
        then left(nullif(trim(input_provider_message_id),''),240) else null end,
      updated_at=clock_timestamp()
    where request_id=input_request_id and claim_id=input_claim_id
      and status='SUBMITTING';
  return found;
end;
$function$;
revoke all on function public.complete_customer_offer_email_confirmation_delivery(
  uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.complete_customer_offer_email_confirmation_delivery(
  uuid,uuid,boolean,text) to service_role;

notify pgrst,'reload schema';
commit;
