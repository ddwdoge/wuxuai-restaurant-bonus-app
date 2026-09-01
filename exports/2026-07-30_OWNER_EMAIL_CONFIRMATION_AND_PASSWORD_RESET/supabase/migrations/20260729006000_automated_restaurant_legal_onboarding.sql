-- Automated, tenant-scoped legal package generation for onboarding.
-- Master templates require independent legal review before production use.

create table if not exists public.legal_master_templates (
  id uuid primary key default extensions.gen_random_uuid(),
  document_type text not null check (document_type in ('participation_terms', 'privacy', 'imprint', 'storage', 'accessibility')),
  version text not null,
  language text not null default 'de-AT',
  title text not null,
  content_template jsonb not null default '{}'::jsonb,
  rendered_text_template text not null,
  review_status text not null default 'DRAFT_LEGAL_REVIEW_REQUIRED'
    check (review_status in ('DRAFT_LEGAL_REVIEW_REQUIRED', 'REVIEWED')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (document_type, version, language)
);

alter table public.legal_master_templates enable row level security;
revoke all on public.legal_master_templates from public, anon, authenticated;

alter table public.restaurants
  add column if not exists legal_update_required_at timestamptz;

alter table public.restaurant_legal_profiles
  add column if not exists responsible_person text,
  add column if not exists restaurant_operator text;

alter table public.legal_document_versions
  add column if not exists master_template_id uuid references public.legal_master_templates(id) on delete restrict,
  add column if not exists published_at timestamptz,
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists publication_request_id uuid;

alter table public.customer_legal_acceptances
  add column if not exists mandatory boolean not null default true;

alter table public.program_terminations
  add column if not exists read_only_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists completion_report jsonb;

create or replace function public.set_program_termination_lifecycle_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.read_only_at := coalesce(new.read_only_at, new.final_redemption_at);
  return new;
end;
$$;

revoke execute on function public.set_program_termination_lifecycle_defaults()
  from public, anon, authenticated;

drop trigger if exists program_termination_lifecycle_defaults on public.program_terminations;
create trigger program_termination_lifecycle_defaults
before insert on public.program_terminations
for each row execute function public.set_program_termination_lifecycle_defaults();

insert into public.legal_master_templates (
  document_type, version, language, title, content_template, rendered_text_template,
  review_status, active
) values
  (
    'participation_terms', '2026.07-pilot-1', 'de-AT', 'Bonusprogramm-Teilnahmebedingungen',
    jsonb_build_object(
      'points_earning_rule', 'Punkte werden nach der im Restaurant veröffentlichten Bonusregel vergeben.',
      'daily_booking_limit', 'Höchstens zwei erfolgreiche Punktebuchungen pro lokalem Kalendertag.',
      'excluded_transactions', 'Stornierte, missbräuchliche oder nicht bestätigte Vorgänge sind ausgeschlossen.',
      'points_validity_months', '12',
      'reward_validity_rule', 'Die Gültigkeit wird bei der jeweiligen Punkteeinlösung angezeigt.',
      'redemption_conditions', 'Die Einlösung wird vom Gast verbindlich bestätigt und durch das Restaurant geprüft.',
      'cash_payout_prohibited', 'Punkte haben keinen Geldwert und werden nicht bar ausgezahlt.',
      'transfer_prohibited', 'Punkte sind weder zwischen Kunden noch zwischen Restaurants übertragbar.',
      'cancellation_rule', 'Stornierte Vorgänge können nach nachvollziehbarer Prüfung korrigiert werden.',
      'fraud_and_blocking_rule', 'Bei begründetem Missbrauchsverdacht kann das Restaurant Vorgänge prüfen und sperren.',
      'program_termination_rule', 'Ein Programmende wird mit letzter Sammel- und Einlösefrist angekündigt.',
      'final_redemption_period', 'Wird bei einer geplanten Beendigung gesondert bekanntgegeben.',
      'language', 'de-AT'
    ),
    'Das Bonusprogramm wird vom Restaurant betrieben. Punkte gelten nur für dieses Restaurant, haben keinen Geldwert, sind nicht auszahlbar und nicht übertragbar. Einlösungen werden vom Gast bestätigt und vom Restaurant geprüft.',
    'DRAFT_LEGAL_REVIEW_REQUIRED', true
  ),
  (
    'privacy', '2026.07-pilot-1', 'de-AT', 'Datenschutzerklärung',
    jsonb_build_object('roles_separated', true, 'data_minimization', true),
    'Das Restaurant verarbeitet die für die Bonusmitgliedschaft erforderlichen Kundendaten. WUXUAI stellt die technische Plattform bereit. Marketing-Einwilligungen sind freiwillig und können widerrufen werden. Diese Pilotvorlage erfordert vor Production eine unabhängige rechtliche Prüfung.',
    'DRAFT_LEGAL_REVIEW_REQUIRED', true
  ),
  (
    'imprint', '2026.07-pilot-1', 'de-AT', 'Impressum', '{}'::jsonb,
    'Die Unternehmensangaben des Restaurants werden aus den im Onboarding bestätigten Stammdaten erzeugt.',
    'DRAFT_LEGAL_REVIEW_REQUIRED', true
  ),
  (
    'storage', '2026.07-pilot-1', 'de-AT', 'Cookie- und Speicherinformationen', '{}'::jsonb,
    'Technisch notwendige Browser-Speicherungen werden für Kundenzuordnung, Sicherheit und aktive Einlösevorgänge verwendet. Marketing-Speicherungen werden nicht ohne Einwilligung aktiviert.',
    'DRAFT_LEGAL_REVIEW_REQUIRED', true
  ),
  (
    'accessibility', '2026.07-pilot-1', 'de-AT', 'Barrierefreiheitserklärung', '{}'::jsonb,
    'WUXUAI Bonus wird schrittweise barrierefrei gestaltet. Hinweise können über den angegebenen Kontakt gemeldet werden.',
    'DRAFT_LEGAL_REVIEW_REQUIRED', true
  )
on conflict (document_type, version, language) do nothing;

create or replace function public.generate_restaurant_legal_package(
  input_restaurant_id uuid,
  input_profile jsonb,
  input_reacceptance_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  restaurant_record public.restaurants%rowtype;
  loyalty_record public.loyalty_settings%rowtype;
  template_record public.legal_master_templates%rowtype;
  document_id_value uuid;
  version_id_value uuid;
  version_value text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  profile_value jsonb;
  content_value jsonb;
  rendered_value text;
  hash_value text;
  is_pilot boolean := false;
  publication_status text;
  legal_ready_value boolean := false;
  selected_template_count integer := 0;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for update;

  if restaurant_record.id is null then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;

  select * into loyalty_record
  from public.loyalty_settings
  where restaurant_id = input_restaurant_id;

  profile_value := coalesce(input_profile, '{}'::jsonb)
    || jsonb_build_object(
      'company_name', coalesce(nullif(trim(input_profile->>'company_name'), ''), restaurant_record.name),
      'country', coalesce(nullif(trim(input_profile->>'country'), ''), 'Österreich'),
      'complaint_contact', coalesce(
        nullif(trim(input_profile->>'complaint_contact'), ''),
        nullif(trim(input_profile->>'email'), '')
      )
    );

  if nullif(trim(profile_value->>'company_name'), '') is null
      or nullif(trim(profile_value->>'legal_form'), '') is null
      or nullif(trim(profile_value->>'street'), '') is null
      or nullif(trim(profile_value->>'postal_code'), '') is null
      or nullif(trim(profile_value->>'city'), '') is null
      or nullif(trim(profile_value->>'country'), '') is null
      or nullif(trim(profile_value->>'email'), '') is null then
    raise exception 'Pflichtangaben für die rechtlichen Dokumente fehlen.';
  end if;

  select exists (
    select 1
    from public.branches b
    join public.branch_subscriptions s on s.branch_id = b.id
    where b.restaurant_id = input_restaurant_id
      and s.plan_key = 'pilot'
  ) into is_pilot;

  select count(distinct document_type)
  into selected_template_count
  from public.legal_master_templates
  where active
    and language = 'de-AT'
    and (is_pilot or review_status = 'REVIEWED');

  if selected_template_count < 5 then
    raise exception 'Für diese Umgebung ist kein vollständig freigegebenes Legal-Paket verfügbar.';
  end if;

  insert into public.restaurant_legal_profiles (
    restaurant_id, company_name, legal_form, street, postal_code, city, country,
    email, phone, commercial_register_number, commercial_register_court, vat_id,
    chamber_membership, supervisory_authority, complaint_contact,
    accessibility_contact, responsible_person, restaurant_operator,
    legal_review_status, updated_at, updated_by
  ) values (
    input_restaurant_id, trim(profile_value->>'company_name'), trim(profile_value->>'legal_form'),
    trim(profile_value->>'street'), trim(profile_value->>'postal_code'), trim(profile_value->>'city'),
    trim(profile_value->>'country'), trim(profile_value->>'email'),
    nullif(trim(profile_value->>'phone'), ''),
    coalesce(trim(profile_value->>'commercial_register_number'), ''),
    coalesce(trim(profile_value->>'commercial_register_court'), ''),
    coalesce(trim(profile_value->>'vat_id'), ''),
    nullif(trim(profile_value->>'chamber_membership'), ''),
    nullif(trim(profile_value->>'supervisory_authority'), ''),
    trim(profile_value->>'complaint_contact'),
    nullif(trim(profile_value->>'accessibility_contact'), ''),
    nullif(trim(profile_value->>'responsible_person'), ''),
    nullif(trim(profile_value->>'restaurant_operator'), ''),
    'required',
    now(), auth.uid()
  )
  on conflict (restaurant_id) do update set
    company_name = excluded.company_name,
    legal_form = excluded.legal_form,
    street = excluded.street,
    postal_code = excluded.postal_code,
    city = excluded.city,
    country = excluded.country,
    email = excluded.email,
    phone = excluded.phone,
    commercial_register_number = excluded.commercial_register_number,
    commercial_register_court = excluded.commercial_register_court,
    vat_id = excluded.vat_id,
    chamber_membership = excluded.chamber_membership,
    supervisory_authority = excluded.supervisory_authority,
    complaint_contact = excluded.complaint_contact,
    accessibility_contact = excluded.accessibility_contact,
    responsible_person = excluded.responsible_person,
    restaurant_operator = excluded.restaurant_operator,
    updated_at = now(),
    updated_by = auth.uid();

  for template_record in
    select distinct on (document_type) *
    from public.legal_master_templates
    where active
      and language = 'de-AT'
      and (is_pilot or review_status = 'REVIEWED')
    order by document_type, created_at desc
  loop
    publication_status := 'draft';

    content_value := template_record.content_template
      || jsonb_build_object(
        'program_operator_name', profile_value->>'company_name',
        'program_operator_address', concat_ws(', ',
          profile_value->>'street',
          concat_ws(' ', profile_value->>'postal_code', profile_value->>'city'),
          profile_value->>'country'
        ),
        'contact_email', profile_value->>'email',
        'complaint_contact', profile_value->>'complaint_contact',
        'effective_date', current_date::text,
        'version', template_record.version,
        'template_version', template_record.version,
        'template_review_status', template_record.review_status,
        'loyalty_mode', loyalty_record.loyalty_mode,
        'points_per_euro', loyalty_record.amount_per_point,
        'redemption_rate_percent', loyalty_record.redemption_return_rate,
        'cash_register_boundary',
          'WUXUAI dokumentiert Bonuspunkte und Einlösungsaktivitäten. Das Restaurant erfasst relevante Vorgänge im eigenen Kassensystem.'
      );

    rendered_value := case template_record.document_type
      when 'imprint' then concat_ws(E'\n',
        profile_value->>'company_name',
        profile_value->>'legal_form',
        profile_value->>'street',
        concat_ws(' ', profile_value->>'postal_code', profile_value->>'city'),
        profile_value->>'country',
        'Kontakt: ' || (profile_value->>'email')
      )
      else template_record.rendered_text_template
    end;

    hash_value := encode(
      extensions.digest(convert_to(rendered_value || content_value::text, 'UTF8'), 'sha256'),
      'hex'
    );

    insert into public.legal_documents (restaurant_id, document_type, title)
    values (input_restaurant_id, template_record.document_type, template_record.title)
    on conflict (restaurant_id, document_type) do update set title = excluded.title
    returning id into document_id_value;

    if not exists (
      select 1
      from public.legal_document_versions
      where document_id = document_id_value
        and document_hash = hash_value
    ) then
      insert into public.legal_document_versions (
        document_id, restaurant_id, version, language, effective_date, content,
        rendered_text, document_hash, status, reacceptance_required, created_by,
        master_template_id
      ) values (
        document_id_value, input_restaurant_id, version_value, 'de-AT', current_date,
        content_value, rendered_value, hash_value, publication_status,
        input_reacceptance_required, auth.uid(), template_record.id
      )
      returning id into version_id_value;
    else
      select id into version_id_value
      from public.legal_document_versions
      where document_id = document_id_value
        and document_hash = hash_value
      order by created_at desc
      limit 1;
    end if;

  end loop;

  legal_ready_value := public.restaurant_legal_bundle_is_current(input_restaurant_id, current_date);

  update public.restaurants
  set legal_ready = legal_ready_value,
      operational_ready = onboarding_status in ('ready', 'completed'),
      security_ready = true,
      legal_transition_exempt = false,
      legal_update_required_at = now()
  where id = input_restaurant_id;

  perform public.write_audit_event(
    input_restaurant_id, null, 'admin', auth.uid(),
    'LEGAL_PACKAGE_GENERATED', 'success', 'restaurant_onboarding',
    'legal_documents', null, null,
    jsonb_build_object(
      'master_template_version', '2026.07-pilot-1',
      'publication_mode', case when is_pilot then 'pilot' else 'production' end,
      'published', false,
      'reacceptance_required', input_reacceptance_required
    )
  );

  return public.get_restaurant_legal_setup(input_restaurant_id);
end;
$$;

revoke execute on function public.generate_restaurant_legal_package(uuid, jsonb, boolean)
  from public, anon;
grant execute on function public.generate_restaurant_legal_package(uuid, jsonb, boolean)
  to authenticated;

create or replace function public.mark_restaurant_legal_update_required()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.restaurants
  set legal_update_required_at = now()
  where id = new.restaurant_id;
  return new;
end;
$$;

revoke execute on function public.mark_restaurant_legal_update_required()
  from public, anon, authenticated;

drop trigger if exists loyalty_settings_mark_legal_update on public.loyalty_settings;
drop trigger if exists loyalty_settings_mark_legal_update_insert on public.loyalty_settings;
drop trigger if exists loyalty_settings_mark_legal_update_update on public.loyalty_settings;

create trigger loyalty_settings_mark_legal_update_insert
after insert on public.loyalty_settings
for each row execute function public.mark_restaurant_legal_update_required();

create trigger loyalty_settings_mark_legal_update_update
after update of amount_per_point, redemption_return_rate, loyalty_mode
on public.loyalty_settings
for each row execute function public.mark_restaurant_legal_update_required();

create or replace function public.prevent_legal_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
      and old.status = 'draft'
      and new.status = 'published'
      and new.document_id = old.document_id
      and new.restaurant_id = old.restaurant_id
      and new.version = old.version
      and new.language = old.language
      and new.content = old.content
      and new.rendered_text = old.rendered_text
      and new.document_hash = old.document_hash
      and new.reacceptance_required = old.reacceptance_required
      and new.created_at = old.created_at
      and new.created_by is not distinct from old.created_by
      and new.master_template_id is not distinct from old.master_template_id then
    return new;
  end if;

  raise exception 'Veröffentlichte Rechtsdokumente sind unveränderlich. Bitte eine neue Version erstellen.';
end;
$$;

create or replace function public.restaurant_legal_bundle_is_current(
  input_restaurant_id uuid,
  input_as_of date default current_date
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.restaurants r
    join public.restaurant_legal_profiles p on p.restaurant_id = r.id
    where r.id = input_restaurant_id
      and r.status = 'active'
      and nullif(trim(p.company_name), '') is not null
      and nullif(trim(p.legal_form), '') is not null
      and nullif(trim(p.street), '') is not null
      and nullif(trim(p.postal_code), '') is not null
      and nullif(trim(p.city), '') is not null
      and nullif(trim(p.country), '') is not null
      and nullif(trim(p.email), '') is not null
      and coalesce(nullif(trim(p.complaint_contact), ''), nullif(trim(p.email), '')) is not null
      and not exists (
        select 1 from public.program_terminations t
        where t.restaurant_id = r.id and t.status = 'scheduled'
      )
  ) and (
    select count(distinct d.document_type) = 2
    from public.legal_documents d
    join public.legal_document_versions v on v.document_id = d.id
    where d.restaurant_id = input_restaurant_id
      and d.document_type in ('participation_terms', 'privacy')
      and v.restaurant_id = d.restaurant_id
      and v.status = 'published'
      and v.effective_date <= input_as_of
      and v.master_template_id is not null
  );
$$;

revoke execute on function public.restaurant_legal_bundle_is_current(uuid, date)
  from public, anon, authenticated;

create or replace function public.restaurant_registration_readiness(
  input_restaurant_id uuid,
  input_as_of date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  restaurant_record public.restaurants%rowtype;
  profile_record public.restaurant_legal_profiles%rowtype;
  missing_fields text[] := '{}'::text[];
  active_required_count integer := 0;
  draft_count integer := 0;
  termination_active boolean := false;
  registration_allowed boolean := false;
  status_value text := 'red';
  reason_value text := 'Kundenregistrierung blockiert';
  updated_value timestamptz;
begin
  select * into restaurant_record from public.restaurants where id = input_restaurant_id;
  select * into profile_record from public.restaurant_legal_profiles where restaurant_id = input_restaurant_id;

  if nullif(trim(profile_record.company_name), '') is null then missing_fields := array_append(missing_fields, 'Unternehmensname'); end if;
  if nullif(trim(profile_record.legal_form), '') is null then missing_fields := array_append(missing_fields, 'Rechtsform'); end if;
  if nullif(trim(profile_record.street), '') is null then missing_fields := array_append(missing_fields, 'Straße und Hausnummer'); end if;
  if nullif(trim(profile_record.postal_code), '') is null then missing_fields := array_append(missing_fields, 'Postleitzahl'); end if;
  if nullif(trim(profile_record.city), '') is null then missing_fields := array_append(missing_fields, 'Ort'); end if;
  if nullif(trim(profile_record.country), '') is null then missing_fields := array_append(missing_fields, 'Land'); end if;
  if nullif(trim(profile_record.email), '') is null then missing_fields := array_append(missing_fields, 'Kontakt-E-Mail'); end if;

  select count(distinct d.document_type)
  into active_required_count
  from public.legal_documents d
  join public.legal_document_versions v on v.document_id = d.id
  where d.restaurant_id = input_restaurant_id
    and d.document_type in ('participation_terms', 'privacy')
    and v.restaurant_id = d.restaurant_id
    and v.status = 'published'
    and v.effective_date <= input_as_of
    and v.master_template_id is not null;

  select count(*) into draft_count
  from public.legal_document_versions v
  where v.restaurant_id = input_restaurant_id and v.status = 'draft';

  select exists (
    select 1 from public.program_terminations t
    where t.restaurant_id = input_restaurant_id and t.status = 'scheduled'
  ) into termination_active;

  registration_allowed := restaurant_record.id is not null
    and restaurant_record.status = 'active'
    and cardinality(missing_fields) = 0
    and active_required_count = 2
    and not termination_active;

  if registration_allowed and (restaurant_record.legal_update_required_at is not null or draft_count > 0) then
    status_value := 'yellow';
    reason_value := 'Neue Dokumentversionen müssen geprüft und veröffentlicht werden.';
  elsif registration_allowed then
    status_value := 'green';
    reason_value := 'Alle Pflichtangaben und aktiven Dokumentversionen sind verfügbar.';
  elsif termination_active then
    reason_value := 'Das geplante Programmende blockiert neue Registrierungen.';
  elsif restaurant_record.status is distinct from 'active' then
    reason_value := 'Das Restaurantprogramm ist nicht aktiv.';
  elsif cardinality(missing_fields) > 0 then
    reason_value := 'Pflichtangaben fehlen: ' || array_to_string(missing_fields, ', ') || '.';
  else
    reason_value := 'Teilnahmebedingungen oder Datenschutzerklärung sind nicht aktiv.';
  end if;

  select greatest(
    coalesce(profile_record.updated_at, '-infinity'::timestamptz),
    coalesce(restaurant_record.legal_update_required_at, '-infinity'::timestamptz),
    coalesce(max(v.created_at), '-infinity'::timestamptz)
  ) into updated_value
  from public.legal_document_versions v
  where v.restaurant_id = input_restaurant_id;

  return jsonb_build_object(
    'status', status_value,
    'label', case status_value
      when 'green' then 'Bereit für Kundenregistrierung'
      when 'yellow' then 'Prüfung erforderlich'
      else 'Kundenregistrierung blockiert'
    end,
    'reason', reason_value,
    'registration_allowed', registration_allowed,
    'last_updated_at', nullif(updated_value, '-infinity'::timestamptz),
    'missing_profile_fields', to_jsonb(missing_fields),
    'active_required_documents', active_required_count,
    'draft_documents', draft_count,
    'program_active', restaurant_record.status = 'active' and not termination_active,
    'legal_update_required', restaurant_record.legal_update_required_at is not null
  );
end;
$$;

revoke execute on function public.restaurant_registration_readiness(uuid, date)
  from public, anon, authenticated;

create or replace function public.publish_restaurant_legal_drafts(
  input_restaurant_id uuid,
  input_effective_date date,
  input_reacceptance_required boolean default false,
  input_confirmed boolean default false,
  input_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  draft_record record;
  published_count integer := 0;
  request_id_value uuid := coalesce(input_request_id, extensions.gen_random_uuid());
  legal_ready_value boolean;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;
  if not input_confirmed then
    raise exception 'Die Veröffentlichung muss ausdrücklich bestätigt werden.';
  end if;
  if input_effective_date is null then
    raise exception 'Ein Gültigkeitsdatum ist erforderlich.';
  end if;

  for draft_record in
    select distinct on (v.document_id) v.*
    from public.legal_document_versions v
    where v.restaurant_id = input_restaurant_id and v.status = 'draft'
    order by v.document_id, v.created_at desc
  loop
    update public.legal_document_versions
    set status = 'published',
        effective_date = input_effective_date,
        reacceptance_required = input_reacceptance_required,
        published_at = now(),
        published_by = auth.uid(),
        publication_request_id = request_id_value
    where id = draft_record.id;

    update public.legal_documents
    set current_published_version_id = draft_record.id
    where id = draft_record.document_id and restaurant_id = input_restaurant_id;
    published_count := published_count + 1;
  end loop;

  if published_count = 0 then
    raise exception 'Es gibt keine vorbereiteten Dokumentversionen.';
  end if;

  legal_ready_value := public.restaurant_legal_bundle_is_current(input_restaurant_id, current_date);
  update public.restaurants
  set legal_ready = legal_ready_value,
      legal_update_required_at = null
  where id = input_restaurant_id;

  perform public.write_audit_event(
    input_restaurant_id, null, 'admin', auth.uid(),
    'LEGAL_DOCUMENT_PUBLISHED', 'success', 'restaurant_portal',
    'legal_document_versions', null, request_id_value,
    jsonb_build_object(
      'published_versions', published_count,
      'effective_date', input_effective_date,
      'reacceptance_required', input_reacceptance_required
    )
  );

  return public.get_restaurant_legal_setup(input_restaurant_id);
end;
$$;

revoke execute on function public.publish_restaurant_legal_drafts(uuid, date, boolean, boolean, uuid)
  from public, anon;
grant execute on function public.publish_restaurant_legal_drafts(uuid, date, boolean, boolean, uuid)
  to authenticated;

create or replace function public.get_restaurant_legal_setup(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare result_payload jsonb;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;

  perform public.ensure_restaurant_legal_templates(input_restaurant_id);

  select jsonb_build_object(
    'profile', to_jsonb(p) - 'updated_by',
    'documents', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'document_type', d.document_type,
        'title', d.title,
        'version_id', v.id,
        'version', v.version,
        'language', v.language,
        'effective_date', v.effective_date,
        'content', v.content,
        'rendered_text', v.rendered_text,
        'document_hash', v.document_hash,
        'status', v.status,
        'reacceptance_required', v.reacceptance_required,
        'created_at', v.created_at,
        'published_at', v.published_at,
        'last_updated_at', greatest(v.created_at, coalesce(dv.created_at, v.created_at)),
        'acceptance_count', (
          select count(*) from public.customer_legal_acceptances a
          where a.restaurant_id = input_restaurant_id and a.document_version_id = v.id
        ),
        'active_state', case when v.id is null then 'missing' else 'active' end,
        'responsible_owner', case when coalesce(v.published_by, v.created_by) is null then 'System' else 'Restaurant-Owner' end,
        'master_template_version', coalesce(mt.version, v.content->>'template_version'),
        'draft_version_id', dv.id,
        'draft_version', dv.version,
        'draft_created_at', dv.created_at,
        'draft_effective_date', dv.effective_date,
        'draft_rendered_text', dv.rendered_text,
        'draft_content', dv.content,
        'draft_master_template_version', coalesce(dmt.version, dv.content->>'template_version')
      ) order by d.document_type), '[]'::jsonb)
      from public.legal_documents d
      left join lateral (
        select candidate.*
        from public.legal_document_versions candidate
        where candidate.document_id = d.id
          and candidate.restaurant_id = d.restaurant_id
          and candidate.status = 'published'
          and candidate.effective_date <= current_date
          and candidate.master_template_id is not null
        order by candidate.effective_date desc, candidate.created_at desc
        limit 1
      ) v on true
      left join lateral (
        select candidate.*
        from public.legal_document_versions candidate
        where candidate.document_id = d.id
          and candidate.restaurant_id = d.restaurant_id
          and candidate.status = 'draft'
        order by candidate.created_at desc
        limit 1
      ) dv on true
      left join public.legal_master_templates mt on mt.id = v.master_template_id
      left join public.legal_master_templates dmt on dmt.id = dv.master_template_id
      where d.restaurant_id = input_restaurant_id
    ),
    'readiness', jsonb_build_object(
      'operational_ready', r.operational_ready,
      'legal_ready', r.legal_ready,
      'security_ready', r.security_ready,
      'transition_exempt', r.legal_transition_exempt,
      'registration', public.restaurant_registration_readiness(input_restaurant_id, current_date)
    ),
    'legal_update_required', r.legal_update_required_at is not null,
    'termination', (
      select to_jsonb(t) - 'created_by'
      from public.program_terminations t
      where t.restaurant_id = input_restaurant_id
        and t.status = 'scheduled'
      limit 1
    ),
    'privacy_requests', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'request_type', pr.request_type,
        'status', pr.status,
        'created_at', pr.created_at,
        'customer_reference', 'Konto ' || upper(left(encode(
          extensions.digest(convert_to(pr.customer_id::text, 'UTF8'), 'sha256'
        ), 'hex'), 8))
      ) order by pr.created_at), '[]'::jsonb)
      from public.privacy_requests pr
      where pr.restaurant_id = input_restaurant_id
        and pr.status in ('requested', 'in_review')
    )
  )
  into result_payload
  from public.restaurant_legal_profiles p
  join public.restaurants r on r.id = p.restaurant_id
  where p.restaurant_id = input_restaurant_id;

  return result_payload;
end;
$$;

revoke execute on function public.get_restaurant_legal_setup(uuid)
  from public, anon;
grant execute on function public.get_restaurant_legal_setup(uuid)
  to authenticated;
