-- LOCAL CANDIDATE ONLY / NOT FOR DB PUSH: delivery integration and positive
-- browser/runtime security proof remain open. No approved text is seeded.
-- Offer-email consent uses the existing immutable platform document registry.
-- There is intentionally no released document, publication event, or sender seed.
begin;

alter table public.platform_legal_document_versions
  add column approval_reference text,
  add column approved_by uuid references auth.users(id) on delete restrict;
alter table public.platform_legal_document_versions
  drop constraint platform_legal_document_versions_document_type_check,
  drop constraint platform_legal_document_versions_source_origin_check,
  drop constraint platform_legal_document_versions_review_status_check,
  drop constraint platform_legal_document_versions_published_at_check;
alter table public.platform_legal_document_versions
  add constraint platform_legal_document_versions_document_type_check
    check (document_type in ('platform_terms','participation_terms','platform_privacy',
      'owner_privacy','staff_privacy','cookie_tracking','platform_imprint','offer_email_consent')),
  add constraint platform_legal_document_versions_source_origin_check
    check (source_origin in ('COUNSEL_REVIEW_PACKAGE','COUNSEL_APPROVED')),
  add constraint platform_legal_document_versions_review_status_check
    check (review_status in ('DRAFT_LEGAL_REVIEW_REQUIRED','REVIEWED')),
  add constraint platform_legal_document_versions_publication_check check (
    (document_type <> 'offer_email_consent' and source_origin='COUNSEL_REVIEW_PACKAGE'
      and review_status='DRAFT_LEGAL_REVIEW_REQUIRED' and published_at is null
      and approval_reference is null and approved_by is null)
    or (document_type='offer_email_consent' and (
      (review_status='DRAFT_LEGAL_REVIEW_REQUIRED' and published_at is null
        and approval_reference is null and approved_by is null)
      or (review_status='REVIEWED' and published_at is not null
        and approval_reference ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
        and approved_by is not null
        and source_origin='COUNSEL_APPROVED'))));

create table public.offer_email_consent_publication_events (
  event_sequence bigint generated always as identity primary key,
  document_version_id uuid not null references public.platform_legal_document_versions(id) on delete restrict,
  action text not null check (action in ('PUBLISH','WITHDRAW')),
  request_id uuid not null unique,
  actor_id uuid not null references auth.users(id) on delete restrict,
  approval_reference text not null check (approval_reference ~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.offer_email_consent_publication_events enable row level security;
revoke all on public.offer_email_consent_publication_events from public,anon,authenticated,service_role;
create trigger offer_email_consent_publication_events_immutable
  before update or delete or truncate on public.offer_email_consent_publication_events
  for each statement execute function public.protect_legal_bundle_append_only();

create or replace function public.current_offer_email_consent_document_internal()
returns public.platform_legal_document_versions
language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare document_row public.platform_legal_document_versions%rowtype;
begin
  select d.* into document_row
  from public.offer_email_consent_publication_events e
  join public.platform_legal_document_versions d on d.id=e.document_version_id
  where e.event_sequence=(select max(event_sequence) from public.offer_email_consent_publication_events)
    and e.action='PUBLISH' and d.document_type='offer_email_consent'
    and d.review_status='REVIEWED' and d.published_at<=statement_timestamp()
    and d.locale='de-AT' and d.approval_reference=e.approval_reference
    and d.content_sha256=encode(extensions.digest(convert_to(d.body_markdown,'UTF8'),'sha256'),'hex')
    and d.source_origin='COUNSEL_APPROVED';
  return document_row;
end;
$function$;
revoke all on function public.current_offer_email_consent_document_internal()
  from public,anon,authenticated,service_role;

-- A future reviewed text enters only as a new immutable version. No version
-- or approval is inserted by this migration. The reference is an external
-- review reference, not an assertion inferred from the UI.
create or replace function public.publish_offer_email_consent_version(
  input_version text,input_body_markdown text,input_content_sha256 text,
  input_source_packet_sha256 text,input_source_entry text,
  input_external_approval_confirmed boolean,input_approval_reference text,
  input_expected_event_sequence bigint,input_request_id uuid
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare prior public.offer_email_consent_publication_events%rowtype;
  document_id uuid; event_id bigint;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_request_id is null or input_external_approval_confirmed is distinct from true
    or input_version !~ '^[A-Za-z0-9_.-]{3,80}$'
    or input_content_sha256 !~ '^[0-9a-f]{64}$'
    or input_source_packet_sha256 !~ '^[0-9a-f]{64}$'
    or input_approval_reference !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
    or nullif(trim(input_source_entry),'') is null
    or length(input_body_markdown) not between 1 and 100000
    or input_content_sha256 is distinct from
      encode(extensions.digest(convert_to(input_body_markdown,'UTF8'),'sha256'),'hex') then
    raise exception 'OFFER_EMAIL_APPROVAL_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('offer-email-document-publication',0));
  select * into prior from public.offer_email_consent_publication_events
    where request_id=input_request_id;
  if prior.event_sequence is not null then
    if prior.action='PUBLISH' and prior.approval_reference=input_approval_reference
      and exists(select 1 from public.platform_legal_document_versions d
        where d.id=prior.document_version_id and d.version=input_version
          and d.content_sha256=input_content_sha256) then
      return jsonb_build_object('event_sequence',prior.event_sequence,
        'document_version_id',prior.document_version_id,'replayed',true);
    end if;
    raise exception 'OFFER_EMAIL_REQUEST_CONFLICT' using errcode='23505';
  end if;
  if (select max(event_sequence) from public.offer_email_consent_publication_events)
       is distinct from input_expected_event_sequence then
    raise exception 'OFFER_EMAIL_PUBLICATION_STALE' using errcode='40001';
  end if;
  insert into public.platform_legal_document_versions(
    document_type,version,locale,source_zip_sha256,source_entry,
    source_origin,body_markdown,content_sha256,review_status,published_at,
    approval_reference,approved_by)
  values('offer_email_consent',input_version,'de-AT',input_source_packet_sha256,
    input_source_entry,'COUNSEL_APPROVED',input_body_markdown,input_content_sha256,
    'REVIEWED',clock_timestamp(),input_approval_reference,auth.uid())
  returning id into document_id;
  insert into public.offer_email_consent_publication_events(
    document_version_id,action,request_id,actor_id,approval_reference)
  values(document_id,'PUBLISH',input_request_id,auth.uid(),input_approval_reference)
  returning event_sequence into event_id;
  return jsonb_build_object('event_sequence',event_id,
    'document_version_id',document_id,'replayed',false);
end;
$function$;
revoke all on function public.publish_offer_email_consent_version(
  text,text,text,text,text,boolean,text,bigint,uuid) from public,anon,service_role;
grant execute on function public.publish_offer_email_consent_version(
  text,text,text,text,text,boolean,text,bigint,uuid) to authenticated;

create or replace function public.withdraw_offer_email_consent_version(
  input_expected_event_sequence bigint,input_approval_reference text,input_request_id uuid
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare prior public.offer_email_consent_publication_events%rowtype;
  current_event public.offer_email_consent_publication_events%rowtype;
  event_id bigint;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_request_id is null or input_approval_reference !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$' then
    raise exception 'OFFER_EMAIL_WITHDRAW_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('offer-email-document-publication',0));
  select * into prior from public.offer_email_consent_publication_events
    where request_id=input_request_id;
  if prior.event_sequence is not null then
    if prior.action='WITHDRAW' and prior.approval_reference=input_approval_reference then
      return jsonb_build_object('event_sequence',prior.event_sequence,'replayed',true);
    end if;
    raise exception 'OFFER_EMAIL_REQUEST_CONFLICT' using errcode='23505';
  end if;
  select * into current_event from public.offer_email_consent_publication_events
    order by event_sequence desc limit 1;
  if current_event.event_sequence is null or current_event.action<>'PUBLISH'
    or current_event.event_sequence is distinct from input_expected_event_sequence then
    raise exception 'OFFER_EMAIL_PUBLICATION_STALE' using errcode='40001';
  end if;
  insert into public.offer_email_consent_publication_events(
    document_version_id,action,request_id,actor_id,approval_reference)
  values(current_event.document_version_id,'WITHDRAW',input_request_id,auth.uid(),input_approval_reference)
  returning event_sequence into event_id;
  return jsonb_build_object('event_sequence',event_id,'replayed',false);
end;
$function$;
revoke all on function public.withdraw_offer_email_consent_version(bigint,text,uuid)
  from public,anon,service_role;
grant execute on function public.withdraw_offer_email_consent_version(bigint,text,uuid)
  to authenticated;

alter table public.customer_offer_email_consents
  add column consent_document_version_id uuid references public.platform_legal_document_versions(id) on delete restrict,
  add column consent_content_sha256 text check (consent_content_sha256 is null
    or consent_content_sha256 ~ '^[0-9a-f]{64}$');

create table public.customer_offer_email_request_receipts (
  request_id uuid primary key,
  consent_id uuid not null references public.customer_offer_email_consents(id) on delete restrict,
  document_version_id uuid not null references public.platform_legal_document_versions(id) on delete restrict,
  document_version text not null,
  document_sha256 text not null check(document_sha256 ~ '^[0-9a-f]{64}$'),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  auth_session_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index customer_offer_email_request_rate_idx
  on public.customer_offer_email_request_receipts(auth_user_id,created_at desc);
alter table public.customer_offer_email_request_receipts enable row level security;
revoke all on public.customer_offer_email_request_receipts from public,anon,authenticated,service_role;
create trigger customer_offer_email_request_receipts_immutable
  before update or delete or truncate on public.customer_offer_email_request_receipts
  for each statement execute function public.protect_legal_bundle_append_only();

-- Historical tokens have no request receipt and cannot activate under the
-- new confirmation contract. Each new token points at one immutable request.
alter table public.customer_offer_email_tokens
  add column offer_email_request_id uuid unique
    references public.customer_offer_email_request_receipts(request_id) on delete restrict;

create table public.customer_offer_email_decision_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  consent_id uuid not null references public.customer_offer_email_consents(id) on delete restrict,
  document_version_id uuid not null references public.platform_legal_document_versions(id) on delete restrict,
  document_version text not null,
  document_sha256 text not null check(document_sha256 ~ '^[0-9a-f]{64}$'),
  account_id uuid not null references public.customer_accounts(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check(action in ('CONFIRM','WITHDRAW')),
  request_id uuid not null unique,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.customer_offer_email_decision_receipts enable row level security;
revoke all on public.customer_offer_email_decision_receipts from public,anon,authenticated,service_role;
create trigger customer_offer_email_decision_receipts_immutable
  before update or delete or truncate on public.customer_offer_email_decision_receipts
  for each statement execute function public.protect_legal_bundle_append_only();

create or replace function public.get_current_offer_email_consent_document(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare account_id_value uuid:=public.read_authenticated_customer_account_id();
  session_id_value uuid:=public.customer_verified_session_id();
  document_row public.platform_legal_document_versions%rowtype;
begin
  if session_id_value is null or not exists(
    select 1 from public.customer_account_memberships m
    join public.customers c on c.id=m.customer_id and c.restaurant_id=m.restaurant_id
      and c.membership_status='active'
    join public.customer_accounts a on a.id=m.account_id and a.auth_user_id=auth.uid()
      and a.email_confirmed_at is not null and a.disabled_at is null
    join public.restaurants r on r.id=m.restaurant_id and r.status='active'
    join public.branches b on b.id=c.branch_id and b.restaurant_id=r.id
      and b.status='active'
    where m.account_id=account_id_value and m.restaurant_id=input_restaurant_id
      and (c.auth_user_id is null or c.auth_user_id=auth.uid()))
    or not public.restaurant_entitlement_enabled(input_restaurant_id,'offer_notifications') then
    return jsonb_build_object('available',false);
  end if;
  select * into document_row from public.current_offer_email_consent_document_internal();
  if document_row.id is null then return jsonb_build_object('available',false); end if;
  return jsonb_build_object('available',true,'document_id',document_row.id,
    'version',document_row.version,'sha256',document_row.content_sha256,
    'locale',document_row.locale,'text',document_row.body_markdown,
    'current_consent_active',coalesce((select public.offer_email_current_consent_authorized_internal(consent.id)
      from public.customer_offer_email_consents consent
      where consent.account_id=account_id_value and consent.restaurant_id=input_restaurant_id),false));
end;
$function$;
revoke all on function public.get_current_offer_email_consent_document(uuid)
  from public,anon,service_role;
grant execute on function public.get_current_offer_email_consent_document(uuid) to authenticated;

-- Service-only because the raw one-time token must never enter a browser RPC.
-- The Edge endpoint authenticates getUser first and derives the recipient from
-- the confirmed Auth identity. The session is rechecked here before any write.
create or replace function public.request_authenticated_customer_offer_email_confirmation(
  input_auth_user_id uuid,input_auth_session_id uuid,input_restaurant_id uuid,
  input_frequency text,input_confirmation_token text,input_request_id uuid,
  input_expected_document_id uuid,input_expected_version text,input_expected_sha256 text
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare account_id_value uuid; customer_id_value uuid; email_value text;
  consent_id_value uuid; existing public.customer_offer_email_consents%rowtype;
  document_row public.platform_legal_document_versions%rowtype;
  normalized_frequency text:=upper(trim(coalesce(input_frequency,'')));
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'OFFER_EMAIL_SERVICE_REQUIRED' using errcode='42501';
  end if;
  if input_auth_user_id is null or input_auth_session_id is null
    or input_restaurant_id is null or input_request_id is null
    or normalized_frequency not in ('WEEKLY','MONTHLY')
    or length(coalesce(input_confirmation_token,''))<64 then
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
  join public.branches b on b.id=c.branch_id and b.restaurant_id=r.id
    and b.status='active'
  where u.id=input_auth_user_id and a.disabled_at is null
    and a.email_confirmed_at is not null
  for update of a;
  if account_id_value is null or email_value is null then
    raise exception 'OFFER_EMAIL_CUSTOMER_SCOPE_INVALID' using errcode='42501';
  end if;
  if not public.restaurant_entitlement_enabled(input_restaurant_id,'offer_notifications') then
    raise exception 'OFFER_EMAIL_PRO_REQUIRED' using errcode='42501';
  end if;
  if exists(select 1 from public.customer_offer_email_request_receipts r
    where r.request_id=input_request_id) then
    return jsonb_build_object('requested',false,'reason','REQUEST_REPLAY');
  end if;
  if (select count(*) from public.customer_offer_email_request_receipts r
      where r.auth_user_id=input_auth_user_id
        and r.created_at>statement_timestamp()-interval '24 hours')>=5 then
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
  insert into public.customer_offer_email_request_receipts(
    request_id,consent_id,document_version_id,document_version,document_sha256,
    auth_user_id,auth_session_id)
  values(input_request_id,consent_id_value,document_row.id,document_row.version,document_row.content_sha256,
    input_auth_user_id,input_auth_session_id);
  delete from public.customer_offer_email_tokens where consent_id=consent_id_value;
  insert into public.customer_offer_email_tokens(
    consent_id,purpose,token_hash,expires_at,offer_email_request_id)
  values(consent_id_value,'CONFIRM',public.hash_public_token(input_confirmation_token),
    clock_timestamp()+interval '24 hours',input_request_id);
  perform public.write_audit_event(input_restaurant_id,customer_id_value,'customer',
    customer_id_value,'OFFER_EMAIL_CONSENT_REQUESTED','pending',
    'authenticated_customer_ui','customer_offer_email_consents',consent_id_value,
    input_request_id,jsonb_build_object('document_id',document_row.id,
      'version',document_row.version,'sha256',document_row.content_sha256));
  return jsonb_build_object('requested',true,'document_id',document_row.id,
    'version',document_row.version,'sha256',document_row.content_sha256);
end;
$function$;
revoke all on function public.request_authenticated_customer_offer_email_confirmation(
  uuid,uuid,uuid,text,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.request_authenticated_customer_offer_email_confirmation(
  uuid,uuid,uuid,text,text,uuid,uuid,text,text) to service_role;
-- The older service RPC accepted a caller-chosen version and recipient.
-- No in-repository caller remains; deny it rather than leave a second entry.
revoke all on function public.request_customer_offer_email_confirmation(
  text,uuid,text,text,text,text,text,text) from public,anon,authenticated,service_role;

create or replace function public.confirm_customer_offer_email(input_confirmation_token text)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare token_hash_value text:=public.hash_public_token(input_confirmation_token);
  token_record public.customer_offer_email_tokens%rowtype;
  consent_record public.customer_offer_email_consents%rowtype;
  document_row public.platform_legal_document_versions%rowtype;
  account_id_value uuid:=public.read_authenticated_customer_account_id();
  session_id_value uuid:=public.customer_verified_session_id();
begin
  if session_id_value is null or length(coalesce(input_confirmation_token,''))<64 then
    return jsonb_build_object('confirmed',false);
  end if;
  if (select count(*) from public.customer_offer_email_token_attempts attempt
    where attempt.token_hash=token_hash_value and attempt.purpose='CONFIRM'
      and attempt.created_at>statement_timestamp()-interval '15 minutes')>=10 then
    raise exception 'CUSTOMER_EMAIL_TOO_MANY_ATTEMPTS' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('offer-email-document-publication',0));
  select * into token_record from public.customer_offer_email_tokens t
    where t.token_hash=token_hash_value and t.purpose='CONFIRM';
  if token_record.id is null or token_record.used_at is not null
    or token_record.expires_at<=statement_timestamp() then
    return jsonb_build_object('confirmed',false,'error_code','CUSTOMER_EMAIL_CONFIRMATION_INVALID');
  end if;
  select * into consent_record from public.customer_offer_email_consents c
    where c.id=token_record.consent_id for update;
  select * into token_record from public.customer_offer_email_tokens t
    where t.id=token_record.id for update;
  if token_record.id is null or token_record.used_at is not null
    or token_record.expires_at<=statement_timestamp() then
    return jsonb_build_object('confirmed',false,'error_code','CUSTOMER_EMAIL_CONFIRMATION_INVALID');
  end if;
  select * into document_row from public.current_offer_email_consent_document_internal();
  if consent_record.id is null or consent_record.status<>'PENDING_CONFIRMATION'
    or consent_record.account_id<>account_id_value or document_row.id is null
    or not exists (select 1 from public.customer_offer_email_request_receipts receipt
      where receipt.request_id=token_record.offer_email_request_id
        and receipt.consent_id=consent_record.id
        and receipt.auth_user_id=auth.uid()
        and receipt.document_version_id=document_row.id
        and receipt.document_version=document_row.version
        and receipt.document_sha256=document_row.content_sha256)
    or consent_record.consent_document_version_id is distinct from document_row.id
    or consent_record.consent_version is distinct from document_row.version
    or consent_record.consent_content_sha256 is distinct from document_row.content_sha256
    or not exists(select 1 from public.customer_accounts a
      join auth.users u on u.id=a.auth_user_id and u.email_confirmed_at is not null
      join public.customer_account_emails ae on ae.account_id=a.id
        and ae.status='CONFIRMED' and lower(ae.email)=lower(u.email)
      join public.customer_account_memberships m on m.account_id=a.id
        and m.restaurant_id=consent_record.restaurant_id
        and m.customer_id=consent_record.customer_id
      join public.customers customer on customer.id=m.customer_id
        and customer.restaurant_id=m.restaurant_id
        and customer.membership_status='active'
        and (customer.auth_user_id is null or customer.auth_user_id=u.id)
      join public.restaurants r on r.id=m.restaurant_id and r.status='active'
      join public.branches b on b.id=customer.branch_id and b.restaurant_id=r.id
        and b.status='active'
      where a.id=account_id_value and a.auth_user_id=auth.uid()
        and a.disabled_at is null and a.email_confirmed_at is not null
        and lower(consent_record.email)=lower(u.email))
    or not public.restaurant_entitlement_enabled(consent_record.restaurant_id,'offer_notifications') then
    return jsonb_build_object('confirmed',false,'error_code','CUSTOMER_EMAIL_SCOPE_OR_VERSION_INVALID');
  end if;
  update public.customer_offer_email_tokens set used_at=clock_timestamp()
    where id=token_record.id;
  update public.customer_offer_email_consents set status='ACTIVE',
    consented_at=clock_timestamp(),email_confirmed_at=clock_timestamp(),
    withdrawn_at=null,updated_at=clock_timestamp()
    where id=consent_record.id;
  insert into public.customer_offer_email_decision_receipts(
    consent_id,document_version_id,document_version,document_sha256,
    account_id,customer_id,restaurant_id,auth_user_id,action,request_id)
  values(consent_record.id,document_row.id,document_row.version,
    document_row.content_sha256,account_id_value,consent_record.customer_id,
    consent_record.restaurant_id,auth.uid(),'CONFIRM',token_record.id);
  insert into public.customer_offer_email_token_attempts(token_hash,purpose,successful)
    values(token_hash_value,'CONFIRM',true);
  perform public.write_audit_event(consent_record.restaurant_id,
    consent_record.customer_id,'customer',consent_record.customer_id,
    'OFFER_EMAIL_CONSENT_CONFIRMED','success','offer_email_confirmation',
    'customer_offer_email_consents',consent_record.id,token_record.id,
    jsonb_build_object('document_id',document_row.id,'version',document_row.version,
      'sha256',document_row.content_sha256));
  return jsonb_build_object('confirmed',true,'document_id',document_row.id,
    'version',document_row.version,'sha256',document_row.content_sha256);
end;
$function$;
revoke all on function public.confirm_customer_offer_email(text)
  from public,anon,service_role;
grant execute on function public.confirm_customer_offer_email(text) to authenticated;

create or replace function public.withdraw_authenticated_customer_offer_email(
  input_restaurant_id uuid,input_request_id uuid
)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare account_id_value uuid:=public.read_authenticated_customer_account_id();
  session_id_value uuid:=public.customer_verified_session_id();
  consent_record public.customer_offer_email_consents%rowtype;
begin
  if session_id_value is null or input_restaurant_id is null or input_request_id is null then
    raise exception 'OFFER_EMAIL_REQUEST_INVALID' using errcode='22023';
  end if;
  select consent.* into consent_record
  from public.customer_offer_email_consents consent
  join public.customer_account_memberships m
    on m.account_id=consent.account_id and m.restaurant_id=consent.restaurant_id
    and m.customer_id=consent.customer_id
  join public.customer_accounts a on a.id=m.account_id and a.auth_user_id=auth.uid()
  where consent.account_id=account_id_value
    and consent.restaurant_id=input_restaurant_id for update of consent;
  if consent_record.id is null then
    return jsonb_build_object('withdrawn',false,'reason','NOT_GRANTED');
  end if;
  if consent_record.status='WITHDRAWN' then
    return jsonb_build_object('withdrawn',true,'changed',false);
  end if;
  update public.customer_offer_email_consents set status='WITHDRAWN',
    frequency='NEVER',withdrawn_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=consent_record.id;
  update public.customer_offer_email_tokens set used_at=clock_timestamp()
    where consent_id=consent_record.id and purpose='CONFIRM' and used_at is null;
  if consent_record.consent_document_version_id is not null
    and consent_record.consent_content_sha256 is not null then
    insert into public.customer_offer_email_decision_receipts(
      consent_id,document_version_id,document_version,document_sha256,
      account_id,customer_id,restaurant_id,auth_user_id,action,request_id)
    values(consent_record.id,consent_record.consent_document_version_id,
      consent_record.consent_version,consent_record.consent_content_sha256,
      consent_record.account_id,consent_record.customer_id,consent_record.restaurant_id,
      auth.uid(),'WITHDRAW',input_request_id);
  end if;
  perform public.write_audit_event(consent_record.restaurant_id,
    consent_record.customer_id,'customer',consent_record.customer_id,
    'OFFER_EMAIL_CONSENT_WITHDRAWN','success','authenticated_customer_ui',
    'customer_offer_email_consents',consent_record.id,input_request_id,
    jsonb_build_object('document_id',consent_record.consent_document_version_id,
      'version',consent_record.consent_version,
      'sha256',consent_record.consent_content_sha256));
  return jsonb_build_object('withdrawn',true,'changed',true);
end;
$function$;
revoke all on function public.withdraw_authenticated_customer_offer_email(uuid,uuid)
  from public,anon,service_role;
grant execute on function public.withdraw_authenticated_customer_offer_email(uuid,uuid)
  to authenticated;

create or replace function public.offer_email_current_consent_authorized_internal(input_consent_id uuid)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare consent_row public.customer_offer_email_consents%rowtype;
  document_row public.platform_legal_document_versions%rowtype;
begin
  select * into consent_row from public.customer_offer_email_consents
    where id=input_consent_id;
  select * into document_row from public.current_offer_email_consent_document_internal();
  return coalesce(consent_row.status='ACTIVE' and document_row.id is not null
    and consent_row.consent_document_version_id=document_row.id
    and consent_row.consent_version=document_row.version
    and consent_row.consent_content_sha256=document_row.content_sha256
    and exists(select 1 from public.customer_offer_email_decision_receipts receipt
      where receipt.consent_id=consent_row.id and receipt.action='CONFIRM'
        and receipt.document_version_id=document_row.id
        and receipt.document_version=document_row.version
        and receipt.document_sha256=document_row.content_sha256
        and receipt.account_id=consent_row.account_id
        and receipt.customer_id=consent_row.customer_id
        and receipt.restaurant_id=consent_row.restaurant_id),false);
end;
$function$;
revoke all on function public.offer_email_current_consent_authorized_internal(uuid)
  from public,anon,authenticated,service_role;


-- Preserve the existing queue and dispatcher contracts; only replace their
-- consent-version predicate with the authoritative document/receipt check.
create or replace function public.enqueue_customer_transactional_email(
  input_restaurant_id uuid, input_customer_id uuid, input_event_type text,
  input_event_key text, input_reward_id uuid default null,
  input_customer_reward_id uuid default null, input_payload jsonb default '{}'::jsonb,
  input_available_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  account_id_value uuid;
begin
  if input_event_type not in (
    'BIRTHDAY_GIFT_ASSIGNED', 'BIRTHDAY_GIFT_EXPIRY_REMINDER',
    'POINT_REWARD_AVAILABLE', 'OFFER_PUBLISHED'
  ) then
    return false;
  end if;

  -- A confirmed offer address never grants reward-email permission.
  if input_event_type = 'POINT_REWARD_AVAILABLE' then
    return false;
  end if;

  select membership.account_id into account_id_value
  from public.customer_account_memberships membership
  join public.customer_account_emails email
    on email.account_id = membership.account_id and email.status = 'CONFIRMED'
  join public.customer_accounts account
    on account.id = membership.account_id and account.disabled_at is null
  join public.customers customer
    on customer.id = membership.customer_id
   and customer.restaurant_id = membership.restaurant_id
  where membership.restaurant_id = input_restaurant_id
    and membership.customer_id = input_customer_id
    and (
      input_event_type <> 'OFFER_PUBLISHED'
      or (
        customer.membership_status = 'active'
        and account.auth_user_id is not null
        and account.email_confirmed_at is not null
        and (customer.auth_user_id is null or customer.auth_user_id = account.auth_user_id)
        and public.restaurant_entitlement_enabled(input_restaurant_id, 'offer_notifications')
        and exists (
          select 1 from public.customer_offer_email_consents consent
          where consent.account_id = membership.account_id
            and consent.restaurant_id = membership.restaurant_id
            and consent.customer_id = membership.customer_id
            and consent.status = 'ACTIVE'
            and consent.frequency in ('WEEKLY', 'MONTHLY')
            and consent.email_confirmed_at is not null
            and consent.withdrawn_at is null
            and public.offer_email_current_consent_authorized_internal(consent.id)
            and lower(trim(consent.email)) = lower(trim(email.email))
        )
      )
    )
  limit 1;

  if account_id_value is null then
    return false;
  end if;

  insert into public.customer_transactional_email_deliveries (
    account_id, restaurant_id, customer_id, reward_id, customer_reward_id,
    event_type, event_key, payload, available_at
  ) values (
    account_id_value, input_restaurant_id, input_customer_id, input_reward_id,
    input_customer_reward_id, input_event_type, input_event_key,
    coalesce(input_payload, '{}'::jsonb), input_available_at
  ) on conflict (event_type, event_key) do nothing;
  return found;
exception when others then
  return false;
end;
$function$;

create or replace function public.customer_transactional_email_dispatch_block_reason(
  input_delivery_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  delivery_record public.customer_transactional_email_deliveries%rowtype;
begin
  select * into delivery_record
  from public.customer_transactional_email_deliveries
  where id = input_delivery_id;

  if delivery_record.id is null then
    return 'DELIVERY_NOT_FOUND';
  end if;

  if delivery_record.event_type = 'OFFER_PUBLISHED' then
    if not public.restaurant_entitlement_enabled(
      delivery_record.restaurant_id, 'offer_notifications'
    ) then
      return 'PRO_ENTITLEMENT_INACTIVE';
    end if;

    -- The canonical Owner publisher keys an event by the exact offer,
    -- publication revision and Customer. No payload field or title is trusted.
    if not exists (
      select 1
      from public.restaurant_offers offer
      join public.restaurants restaurant
        on restaurant.id = offer.restaurant_id
       and restaurant.status = 'active'
      join public.branches branch
        on branch.id = offer.branch_id
       and branch.restaurant_id = offer.restaurant_id
       and branch.status = 'active'
      where offer.restaurant_id = delivery_record.restaurant_id
        and offer.status = 'PUBLISHED'
        and offer.is_active is true
        and offer.valid_from <= statement_timestamp()
        and offer.valid_to > statement_timestamp()
        and offer.id::text || ':' || offer.publication_version::text || ':'
          || delivery_record.customer_id::text = delivery_record.event_key
    ) then
      return 'OFFER_SOURCE_INACTIVE';
    end if;

    if not exists (
      select 1
      from public.customer_offer_email_consents consent
      join public.customer_account_memberships membership
        on membership.account_id = consent.account_id
       and membership.restaurant_id = consent.restaurant_id
       and membership.customer_id = consent.customer_id
      join public.customers customer
        on customer.id = consent.customer_id
       and customer.restaurant_id = consent.restaurant_id
      join public.customer_account_emails account_email
        on account_email.account_id = consent.account_id
       and account_email.status = 'CONFIRMED'
      join public.customer_accounts account
        on account.id = consent.account_id
       and account.auth_user_id is not null
       and account.email_confirmed_at is not null
       and account.disabled_at is null
      where consent.account_id = delivery_record.account_id
        and consent.restaurant_id = delivery_record.restaurant_id
        and consent.customer_id = delivery_record.customer_id
        and consent.status = 'ACTIVE'
        and consent.frequency in ('WEEKLY', 'MONTHLY')
        and consent.email_confirmed_at is not null
        and consent.withdrawn_at is null
        and public.offer_email_current_consent_authorized_internal(consent.id)
        and consent.updated_at <= delivery_record.created_at
        and lower(trim(consent.email)) = lower(trim(account_email.email))
        and customer.membership_status = 'active'
        and (customer.auth_user_id is null or customer.auth_user_id = account.auth_user_id)
    ) then
      return 'OFFER_EMAIL_CONSENT_INACTIVE';
    end if;

    return null;
  end if;

  if delivery_record.event_type = 'POINT_REWARD_AVAILABLE' then
    if not public.restaurant_entitlement_enabled(
      delivery_record.restaurant_id, 'reward_notifications'
    ) then
      return 'PRO_ENTITLEMENT_INACTIVE';
    end if;
    return 'REWARD_EMAIL_CONSENT_CONTRACT_MISSING';
  end if;

  return null;
end;
$function$;

-- Legacy periodic summary callers remain callable, but the same current
-- version/hash/receipt gate now protects their list and reservation steps.
create or replace function public.list_due_customer_offer_email_consents(
  input_frequency text,
  input_limit integer default 250
)
returns table (
  consent_id uuid,
  restaurant_id uuid,
  account_id uuid,
  customer_id uuid,
  email text,
  frequency text,
  period_key text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'CUSTOMER_EMAIL_SERVICE_REQUIRED';
  end if;
  -- The former periodic sender exposes a raw recipient before its provider
  -- step and has no proven final authorization call. No recipient is released.
  return;
end;
$$;

create or replace function public.reserve_customer_offer_email_delivery(
  input_consent_id uuid,
  input_frequency text,
  input_period_key text,
  input_unsubscribe_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'CUSTOMER_EMAIL_SERVICE_REQUIRED';
  end if;
  -- No in-repository caller performs a final source/consent check immediately
  -- before a provider for this legacy periodic path. Keep it closed until a
  -- separately reviewed sender implements that last irreversible boundary.
  return jsonb_build_object('reserved', false, 'reason', 'LEGACY_SENDER_NOT_RELEASED');
end;
$$;
notify pgrst,'reload schema';
commit;
