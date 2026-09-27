-- V1 KYB/legal publication boundary.
-- Owner-entered data and uploaded evidence never become public merely because
-- they are complete. A future explicit Platform-Admin decision must bind one
-- immutable VERIFIED profile revision to the public legal operator snapshot.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260927003000', 0));

create table if not exists public.legal_operator_publication_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  profile_revision_id uuid not null references public.business_verified_profile_revisions(id) on delete restrict,
  action text not null check (action in ('APPROVED','REVOKED')),
  supersedes_decision_id uuid references public.legal_operator_publication_decisions(id) on delete restrict,
  field_mapping_version text not null check (field_mapping_version ~ '^[A-Z0-9_]{3,80}$'),
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  redacted_reason text not null check (length(trim(redacted_reason)) between 10 and 500),
  actor_id uuid not null references auth.users(id) on delete restrict,
  aal2_verified_at timestamptz not null,
  session_expires_at timestamptz not null,
  auth_session_sha256 text not null check (auth_session_sha256 ~ '^[0-9a-f]{64}$'),
  request_id uuid not null unique,
  correlation_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  check (
    (action='APPROVED' and supersedes_decision_id is null)
    or (action='REVOKED' and supersedes_decision_id is not null)
  ),
  check (aal2_verified_at<=created_at and aal2_verified_at>=created_at-interval '5 minutes'),
  check (session_expires_at>created_at)
);

create index if not exists legal_operator_publication_decisions_latest_idx
  on public.legal_operator_publication_decisions(restaurant_id, created_at desc, id desc);

alter table public.legal_operator_publication_decisions enable row level security;
revoke all on public.legal_operator_publication_decisions from public, anon, authenticated, service_role;

create or replace function public.protect_legal_operator_publication_decisions()
returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $function$
begin
  raise exception 'LEGAL_OPERATOR_PUBLICATION_DECISION_IMMUTABLE' using errcode='42501';
end
$function$;
revoke all on function public.protect_legal_operator_publication_decisions()
  from public,anon,authenticated,service_role;

drop trigger if exists legal_operator_publication_decisions_immutable
  on public.legal_operator_publication_decisions;
create trigger legal_operator_publication_decisions_immutable
  before update or delete or truncate on public.legal_operator_publication_decisions
  for each statement execute function public.protect_legal_operator_publication_decisions();

create or replace function public.legal_operator_publication_ready_internal(
  input_restaurant_id uuid,
  input_as_of timestamptz default statement_timestamp()
) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
  with latest_decision as (
    select d.*
    from public.legal_operator_publication_decisions d
    where d.restaurant_id=input_restaurant_id
    order by d.created_at desc,d.id desc
    limit 1
  )
  select coalesce(bool_and(
    d.action='APPROVED'
    and d.field_mapping_version='AT_V1_LEGAL_OPERATOR_V1'
    and exists(select 1 from public.platform_admins pa where pa.user_id=d.actor_id
      and pa.active and pa.role in ('platform_owner','platform_admin'))
    and d.aal2_verified_at<=d.created_at and d.aal2_verified_at>=d.created_at-interval '5 minutes'
    and d.session_expires_at>d.created_at
    and c.status='VERIFIED' and c.test_only=false
    and c.decided_at<=input_as_of and c.expires_at>input_as_of
    and rev.status='VERIFIED' and rev.effective_from<=input_as_of
    and policy.real_intake_status='READY'
    and policy.legal_status='VERIFIED'
    and policy.privacy_status='VERIFIED'
    and policy.document_catalog_status='VERIFIED'
    and policy.retention_status='VERIFIED'
    and trim(rev.legal_name)=trim(op.company_name)
    and trim(rev.legal_form)=trim(op.legal_form)
    and rev.register_identifier is not distinct from nullif(trim(op.commercial_register_number),'')
    and rev.vat_id is not distinct from nullif(trim(op.vat_id),'')
    and trim(rev.business_street)=trim(case when op.registered_address_source='restaurant' then b.address else op.street end)
    and trim(rev.business_postal_code)=trim(case when op.registered_address_source='restaurant' then b.postal_code else op.postal_code end)
    and trim(rev.business_city)=trim(case when op.registered_address_source='restaurant' then b.city else op.city end)
    and rev.business_country=case
      when lower(trim(case when op.registered_address_source='restaurant' then b.country else op.country end))
        in ('at','austria','osterreich','oesterreich','österreich') then 'AT'
      else upper(trim(case when op.registered_address_source='restaurant' then b.country else op.country end)) end
    and rev.authorized_representative is not distinct from nullif(trim(op.responsible_person),'')
  ),false)
  from latest_decision d
  join public.business_verification_cases c on c.id=d.case_id and c.restaurant_id=d.restaurant_id
  join public.business_verified_profile_revisions rev on rev.id=d.profile_revision_id and rev.case_id=c.id
  join public.restaurants r on r.id=d.restaurant_id
  join public.organization_legal_profiles op on op.organization_id=r.organization_id
  join public.branches b on b.id=r.primary_branch_id and b.restaurant_id=r.id and b.organization_id=r.organization_id
  join public.country_kyb_intake_policies policy on policy.country_code=c.country_code;
$function$;
revoke all on function public.legal_operator_publication_ready_internal(uuid,timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.enforce_legal_operator_publication_gate()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $function$
begin
  if new.status='published'
    and (tg_op='INSERT' or old.status is distinct from 'published')
    and not public.legal_operator_publication_ready_internal(new.restaurant_id,statement_timestamp()) then
    raise exception 'LEGAL_OPERATOR_MANUAL_APPROVAL_REQUIRED' using errcode='42501';
  end if;
  return new;
end
$function$;
revoke all on function public.enforce_legal_operator_publication_gate()
  from public,anon,authenticated,service_role;

drop trigger if exists a_legal_operator_publication_gate on public.legal_document_versions;
create trigger a_legal_operator_publication_gate
  before insert or update on public.legal_document_versions
  for each row execute function public.enforce_legal_operator_publication_gate();

create or replace function public.restaurant_legal_bundle_is_current(
  input_restaurant_id uuid,input_as_of date default current_date
) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
  select public.legal_operator_publication_ready_internal(input_restaurant_id,statement_timestamp())
  and exists (
    select 1 from public.restaurants r
    join public.restaurant_legal_profiles p on p.restaurant_id=r.id
    join public.organization_legal_profiles op on op.id=p.operator_profile_id and op.organization_id=r.organization_id
    where r.id=input_restaurant_id and r.status='active'
      and nullif(trim(p.company_name),'') is not null
      and nullif(trim(p.legal_form),'') is not null
      and nullif(trim(p.street),'') is not null
      and nullif(trim(p.postal_code),'') is not null
      and nullif(trim(p.city),'') is not null
      and nullif(trim(p.country),'') is not null
      and nullif(trim(p.email),'') is not null
      and coalesce(nullif(trim(p.complaint_contact),''),nullif(trim(p.email),'')) is not null
      and not exists(select 1 from public.program_terminations t where t.restaurant_id=r.id and t.status='scheduled')
  ) and (
    select count(distinct d.document_type)=2
    from public.legal_documents d join public.legal_document_versions v on v.document_id=d.id
    where d.restaurant_id=input_restaurant_id and d.document_type in ('participation_terms','privacy')
      and v.restaurant_id=d.restaurant_id and v.status='published'
      and v.effective_date<=input_as_of and v.master_template_id is not null
  );
$function$;
revoke all on function public.restaurant_legal_bundle_is_current(uuid,date)
  from public,anon,authenticated;

create or replace function public.restaurant_registration_readiness(
  input_restaurant_id uuid,input_as_of date default current_date
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  r public.restaurants%rowtype; p public.restaurant_legal_profiles%rowtype;
  operator_link_valid boolean:=false; approval_ready boolean:=false;
  missing_fields text[]:='{}'::text[]; active_required_count integer:=0;
  draft_count integer:=0; termination_active boolean:=false;
  registration_allowed boolean:=false; status_value text:='red';
  reason_value text:='Kundenregistrierung blockiert'; updated_value timestamptz;
begin
  select * into r from public.restaurants where id=input_restaurant_id;
  select * into p from public.restaurant_legal_profiles where restaurant_id=input_restaurant_id;
  select exists(select 1 from public.organization_legal_profiles op
    where op.id=p.operator_profile_id and op.organization_id=r.organization_id) into operator_link_valid;
  approval_ready:=public.legal_operator_publication_ready_internal(input_restaurant_id,statement_timestamp());
  if not operator_link_valid then missing_fields:=array_append(missing_fields,'Betreiberdaten'); end if;
  if nullif(trim(p.company_name),'') is null then missing_fields:=array_append(missing_fields,'Unternehmensname'); end if;
  if nullif(trim(p.legal_form),'') is null then missing_fields:=array_append(missing_fields,'Rechtsform'); end if;
  if nullif(trim(p.street),'') is null then missing_fields:=array_append(missing_fields,'Straße und Hausnummer'); end if;
  if nullif(trim(p.postal_code),'') is null then missing_fields:=array_append(missing_fields,'Postleitzahl'); end if;
  if nullif(trim(p.city),'') is null then missing_fields:=array_append(missing_fields,'Ort'); end if;
  if nullif(trim(p.country),'') is null then missing_fields:=array_append(missing_fields,'Land'); end if;
  if nullif(trim(p.email),'') is null then missing_fields:=array_append(missing_fields,'Kontakt-E-Mail'); end if;
  if not approval_ready then missing_fields:=array_append(missing_fields,'manuell freigegebene Betreiberangaben'); end if;
  select count(distinct d.document_type) into active_required_count
  from public.legal_documents d join public.legal_document_versions v on v.document_id=d.id
  where d.restaurant_id=input_restaurant_id and d.document_type in ('participation_terms','privacy')
    and v.restaurant_id=d.restaurant_id and v.status='published'
    and v.effective_date<=input_as_of and v.master_template_id is not null;
  select count(*) into draft_count from public.legal_document_versions v
    where v.restaurant_id=input_restaurant_id and v.status='draft';
  select exists(select 1 from public.program_terminations t
    where t.restaurant_id=input_restaurant_id and t.status='scheduled') into termination_active;
  registration_allowed:=r.id is not null and r.status='active' and operator_link_valid
    and approval_ready and cardinality(missing_fields)=0 and active_required_count=2 and not termination_active;
  if registration_allowed and (r.legal_update_required_at is not null or draft_count>0) then
    status_value:='yellow'; reason_value:='Neue Dokumentversionen müssen geprüft und veröffentlicht werden.';
  elsif registration_allowed then
    status_value:='green'; reason_value:='Manuell freigegebene Betreiberangaben und aktive Dokumentversionen sind verfügbar.';
  elsif not approval_ready then
    reason_value:='Betreiberangaben sind noch nicht manuell freigegeben oder müssen nach einer Änderung erneut geprüft werden.';
  elsif termination_active then reason_value:='Das geplante Programmende blockiert neue Registrierungen.';
  elsif r.status is distinct from 'active' then reason_value:='Das Restaurantprogramm ist nicht aktiv.';
  elsif cardinality(missing_fields)>0 then reason_value:='Pflichtangaben fehlen: '||array_to_string(missing_fields,', ')||'.';
  else reason_value:='Teilnahmebedingungen oder Datenschutzerklärung sind nicht aktiv.'; end if;
  select greatest(coalesce(p.updated_at,'-infinity'::timestamptz),
    coalesce(r.legal_update_required_at,'-infinity'::timestamptz),
    coalesce(max(v.created_at),'-infinity'::timestamptz)) into updated_value
  from public.legal_document_versions v where v.restaurant_id=input_restaurant_id;
  return jsonb_build_object('status',status_value,'label',case status_value
    when 'green' then 'Bereit für Kundenregistrierung' when 'yellow' then 'Prüfung erforderlich'
    else 'Kundenregistrierung blockiert' end,'reason',reason_value,
    'registration_allowed',registration_allowed,'last_updated_at',nullif(updated_value,'-infinity'::timestamptz),
    'missing_profile_fields',to_jsonb(missing_fields),'active_required_documents',active_required_count,
    'draft_documents',draft_count,'program_active',r.status='active' and not termination_active,
    'legal_update_required',r.legal_update_required_at is not null,
    'operator_profile_manually_approved',approval_ready);
end
$function$;
revoke all on function public.restaurant_registration_readiness(uuid,date)
  from public,anon,authenticated;

create or replace function public.get_public_legal_center(
  input_restaurant_slug text,input_customer_token text default null
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  r public.restaurants%rowtype; p public.restaurant_legal_profiles%rowtype;
  customer_id_value uuid; documents_payload jsonb:='[]'::jsonb;
  consents_payload jsonb:='[]'::jsonb; legal_ready_value boolean:=false;
begin
  select * into r from public.restaurants where slug=trim(input_restaurant_slug) and status='active';
  if r.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  select * into p from public.restaurant_legal_profiles where restaurant_id=r.id;
  legal_ready_value:=p.restaurant_id is not null and p.operator_profile_id is not null
    and public.restaurant_legal_bundle_is_current(r.id,current_date);
  if nullif(trim(coalesce(input_customer_token,'')),'') is not null then
    customer_id_value:=public.resolve_customer_from_public_token(r.id,input_customer_token);
  end if;
  if legal_ready_value then
    select coalesce(jsonb_agg(jsonb_build_object(
      'document_type',d.document_type,'title',d.title,'version_id',v.id,'version',v.version,
      'language',v.language,'effective_date',v.effective_date,'content',v.content,
      'rendered_text',v.rendered_text,'document_hash',v.document_hash,'status',v.status,
      'reacceptance_required',v.reacceptance_required,
      'accepted',case when customer_id_value is null then null else exists(
        select 1 from public.customer_legal_acceptances a where a.restaurant_id=r.id
          and a.customer_id=customer_id_value and a.document_version_id=v.id) end
    ) order by d.document_type),'[]'::jsonb) into documents_payload
    from public.legal_documents d join public.legal_document_versions v
      on v.id=d.current_published_version_id and v.restaurant_id=d.restaurant_id
    where d.restaurant_id=r.id and v.status='published' and v.effective_date<=current_date;
  end if;
  if customer_id_value is not null then
    select coalesce(jsonb_agg(jsonb_build_object('consent_type',consent_type,'status',status,
      'version',version,'updated_at',updated_at) order by consent_type),'[]'::jsonb)
    into consents_payload from public.customer_consents
    where restaurant_id=r.id and customer_id=customer_id_value;
  end if;
  return jsonb_build_object(
    'legal_ready',legal_ready_value,'missing_configuration',not legal_ready_value,
    'restaurant',jsonb_build_object('name',r.name,'slug',r.slug),
    'roles',case when legal_ready_value then jsonb_build_object(
      'program_operator',p.company_name,'platform_provider','WUXUAI','end_user','Kunde',
      'notice','Bonusprogramm angeboten durch: '||p.company_name||'. Technisch bereitgestellt durch WUXUAI.'
    ) else jsonb_build_object('program_operator',null,'platform_provider','WUXUAI','end_user','Kunde',
      'notice','Betreiberangaben sind noch nicht manuell freigegeben.') end,
    'imprint',case when legal_ready_value then jsonb_build_object(
      'company_name',p.company_name,'legal_form',p.legal_form,'street',p.street,
      'postal_code',p.postal_code,'city',p.city,'country',p.country,'email',p.email,
      'phone',p.phone,'commercial_register_number',p.commercial_register_number,
      'commercial_register_court',p.commercial_register_court,'vat_id',p.vat_id,
      'chamber_membership',p.chamber_membership,'supervisory_authority',p.supervisory_authority,
      'complaint_contact',p.complaint_contact) else '{}'::jsonb end,
    'documents',documents_payload,'consents',consents_payload,
    'customer_recognized',customer_id_value is not null,
    'points_validity',jsonb_build_object('months',case when legal_ready_value then (
      select nullif(v.content->>'points_validity_months','')::integer
      from public.legal_documents d join public.legal_document_versions v
        on v.id=d.current_published_version_id and v.restaurant_id=d.restaurant_id
      where d.restaurant_id=r.id and d.document_type='participation_terms'
        and v.status='published' and v.effective_date<=current_date) else null end,
      'oldest_expiry_at',null,'calculation_status','not_reliably_calculable',
      'notice','Ein konkretes ältestes Punkte-Ablaufdatum wird erst angezeigt, wenn es aus dem Transaktionsverlauf verlässlich berechnet werden kann.'),
    'program',coalesce((select jsonb_build_object('status','scheduled','planned_end_at',t.planned_end_at,
      'last_points_earning_at',t.last_points_earning_at,'final_redemption_at',t.final_redemption_at,
      'customer_notice',t.customer_notice) from public.program_terminations t
      where t.restaurant_id=r.id and t.status='scheduled' limit 1),jsonb_build_object('status','active')),
    'product_notice','Punkte sind kein Geld, kein Bankguthaben und kein allgemeines Zahlungsmittel. Sie sind nicht auszahlbar, nicht verkäuflich und nicht übertragbar. Punkte und Punkteeinlösungen werden je Restaurant getrennt geführt.'
  );
end
$function$;
revoke all on function public.get_public_legal_center(text,text) from public;
grant execute on function public.get_public_legal_center(text,text) to anon,authenticated;

comment on table public.legal_operator_publication_decisions is
  'Append-only binding for a future explicit manual Platform-Admin approval of one verified operator profile revision. No V1 approval writer is released by this migration.';
comment on function public.legal_operator_publication_ready_internal(uuid,timestamptz) is
  'Fail-closed public legal source resolver. Completeness, upload or register evidence alone never approves or activates.';

notify pgrst,'reload schema';
commit;
