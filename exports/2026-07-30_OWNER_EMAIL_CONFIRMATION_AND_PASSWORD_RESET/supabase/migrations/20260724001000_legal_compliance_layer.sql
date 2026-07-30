-- WUXUAI Bonus legal compliance foundation for Austria / EU.
-- Additive only. Templates require independent legal and tax review before production.

alter table public.restaurants
  add column if not exists operational_ready boolean not null default false,
  add column if not exists legal_ready boolean not null default false,
  add column if not exists security_ready boolean not null default false,
  add column if not exists legal_transition_exempt boolean not null default true;

alter table public.customers
  add column if not exists membership_status text not null default 'active';

alter table public.customers
  drop constraint if exists customers_membership_status_allowed;

alter table public.customers
  add constraint customers_membership_status_allowed
  check (membership_status in ('active', 'termination_requested', 'terminated', 'restricted'));

create table if not exists public.restaurant_legal_profiles (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  company_name text not null default '',
  legal_form text not null default '',
  street text not null default '',
  postal_code text not null default '',
  city text not null default '',
  country text not null default 'Österreich',
  email text not null default '',
  phone text,
  commercial_register_number text not null default '',
  commercial_register_court text not null default '',
  vat_id text not null default '',
  chamber_membership text,
  supervisory_authority text,
  complaint_contact text not null default '',
  accessibility_contact text,
  legal_review_status text not null default 'required'
    check (legal_review_status in ('required', 'in_review', 'reviewed')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.legal_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  document_type text not null check (document_type in ('participation_terms', 'privacy', 'imprint', 'storage', 'accessibility')),
  title text not null,
  current_published_version_id uuid,
  created_at timestamptz not null default now(),
  unique (restaurant_id, document_type)
);

create table if not exists public.legal_document_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  document_id uuid not null references public.legal_documents(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  version text not null,
  language text not null default 'de-AT',
  effective_date date not null,
  content jsonb not null default '{}'::jsonb,
  rendered_text text not null,
  document_hash text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  reacceptance_required boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (document_id, version)
);

alter table public.legal_documents
  drop constraint if exists legal_documents_current_version_fk;

alter table public.legal_documents
  add constraint legal_documents_current_version_fk
  foreign key (current_published_version_id) references public.legal_document_versions(id) on delete set null;

create table if not exists public.customer_legal_acceptances (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  document_type text not null,
  document_version_id uuid not null references public.legal_document_versions(id) on delete restrict,
  document_hash text not null,
  accepted_at timestamptz not null default now(),
  language text not null default 'de-AT',
  acceptance_source text not null,
  test_session_id text,
  unique (customer_id, document_version_id)
);

create table if not exists public.customer_consents (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  consent_type text not null check (consent_type in ('marketing_push', 'marketing_sms', 'marketing_email', 'personalized_recommendations', 'birthday_processing')),
  status text not null check (status in ('granted', 'withdrawn', 'denied')),
  granted_at timestamptz,
  withdrawn_at timestamptz,
  version text not null default '1.0',
  source text not null,
  proof_metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (restaurant_id, customer_id, consent_type)
);

create table if not exists public.consent_events (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  consent_type text not null,
  previous_status text,
  next_status text not null,
  version text not null,
  source text not null,
  proof_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.privacy_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  request_type text not null check (request_type in ('access', 'export', 'rectification', 'deletion', 'restriction', 'membership_termination', 'complaint')),
  status text not null default 'requested' check (status in ('requested', 'in_review', 'completed', 'rejected', 'cancelled')),
  customer_message text,
  resolution_note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  handled_by uuid references auth.users(id) on delete set null
);

create table if not exists public.program_terminations (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  planned_end_at timestamptz not null,
  last_points_earning_at timestamptz not null,
  final_redemption_at timestamptz not null,
  customer_notice text not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  check (last_points_earning_at <= planned_end_at),
  check (planned_end_at <= final_redemption_at)
);

create unique index if not exists program_terminations_one_scheduled_idx
  on public.program_terminations (restaurant_id)
  where status = 'scheduled';

create table if not exists public.retention_policies (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  category text not null check (category in ('active_membership', 'inactive_membership', 'redemptions', 'audit_logs', 'consent_proofs', 'push_subscriptions', 'test_data', 'support_cases')),
  retention_months integer check (retention_months is null or retention_months between 1 and 240),
  legal_basis_note text not null default 'Vor Production rechtlich prüfen.',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (restaurant_id, category)
);

create table if not exists public.customer_message_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  message_category text not null check (message_category in ('TRANSACTIONAL', 'PROGRAM_SERVICE', 'MARKETING')),
  channel text not null check (channel in ('push', 'sms', 'email', 'in_app')),
  purpose text not null,
  authorized boolean not null,
  blocked_reason text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, idempotency_key)
);

alter table public.restaurant_legal_profiles enable row level security;
alter table public.legal_documents enable row level security;
alter table public.legal_document_versions enable row level security;
alter table public.customer_legal_acceptances enable row level security;
alter table public.customer_consents enable row level security;
alter table public.consent_events enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.program_terminations enable row level security;
alter table public.retention_policies enable row level security;
alter table public.customer_message_attempts enable row level security;

create policy restaurant_legal_profiles_owner_select on public.restaurant_legal_profiles
  for select to authenticated using (public.is_restaurant_admin(restaurant_id));
create policy legal_documents_owner_select on public.legal_documents
  for select to authenticated using (public.is_restaurant_admin(restaurant_id));
create policy legal_document_versions_owner_select on public.legal_document_versions
  for select to authenticated using (public.is_restaurant_admin(restaurant_id));
create policy legal_acceptances_owner_select on public.customer_legal_acceptances
  for select to authenticated using (public.is_restaurant_admin(restaurant_id));
create policy customer_consents_owner_select on public.customer_consents
  for select to authenticated using (public.is_restaurant_admin(restaurant_id));
create policy consent_events_owner_select on public.consent_events
  for select to authenticated using (public.is_restaurant_admin(restaurant_id));
create policy privacy_requests_owner_select on public.privacy_requests
  for select to authenticated using (public.is_restaurant_admin(restaurant_id));
create policy program_terminations_owner_select on public.program_terminations
  for select to authenticated using (public.is_restaurant_admin(restaurant_id));
create policy retention_policies_owner_select on public.retention_policies
  for select to authenticated using (restaurant_id is not null and public.is_restaurant_admin(restaurant_id));
create policy customer_message_attempts_owner_select on public.customer_message_attempts
  for select to authenticated using (public.is_restaurant_admin(restaurant_id));

create or replace function public.prevent_legal_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Veröffentlichte Rechtsdokumente sind unveränderlich. Bitte eine neue Version erstellen.';
end;
$$;

drop trigger if exists legal_document_versions_immutable on public.legal_document_versions;
create trigger legal_document_versions_immutable
before update or delete on public.legal_document_versions
for each row execute function public.prevent_legal_version_mutation();

create or replace function public.legal_terms_complete(input_content jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(input_content, '{}'::jsonb) ?& array[
    'program_operator_name', 'program_operator_address', 'contact_email',
    'points_earning_rule', 'daily_booking_limit', 'excluded_transactions',
    'points_validity_months', 'reward_validity_rule', 'redemption_conditions',
    'cash_payout_prohibited', 'transfer_prohibited', 'cancellation_rule',
    'fraud_and_blocking_rule', 'program_termination_rule', 'final_redemption_period',
    'complaint_contact', 'effective_date', 'language', 'version'
  ] and not exists (
    select 1 from jsonb_each_text(coalesce(input_content, '{}'::jsonb)) e
    where e.key = any(array[
      'program_operator_name', 'program_operator_address', 'contact_email',
      'points_earning_rule', 'daily_booking_limit', 'excluded_transactions',
      'points_validity_months', 'reward_validity_rule', 'redemption_conditions',
      'cash_payout_prohibited', 'transfer_prohibited', 'cancellation_rule',
      'fraud_and_blocking_rule', 'program_termination_rule', 'final_redemption_period',
      'complaint_contact', 'effective_date', 'language', 'version'
    ]) and nullif(trim(e.value), '') is null
  );
$$;

create or replace function public.ensure_restaurant_legal_templates(input_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  restaurant_record public.restaurants%rowtype;
  document_id_value uuid;
  version_id_value uuid;
  terms_content jsonb;
  body_text text;
  item record;
begin
  select * into restaurant_record from public.restaurants where id = input_restaurant_id;
  if restaurant_record.id is null then return; end if;

  insert into public.restaurant_legal_profiles (restaurant_id, company_name, complaint_contact)
  values (restaurant_record.id, restaurant_record.name, coalesce(restaurant_record.owner_phone, ''))
  on conflict (restaurant_id) do nothing;

  terms_content := jsonb_build_object(
    'program_operator_name', restaurant_record.name,
    'program_operator_address', 'Vom Restaurant vor Veröffentlichung zu ergänzen',
    'contact_email', 'Vom Restaurant vor Veröffentlichung zu ergänzen',
    'points_earning_rule', 'Punkte werden nach der im Restaurant veröffentlichten Bonusregel vergeben.',
    'daily_booking_limit', 'Höchstens zwei erfolgreiche Punktebuchungen pro lokalem Kalendertag.',
    'excluded_transactions', 'Stornierte, missbräuchliche oder nicht bestätigte Vorgänge sind ausgeschlossen.',
    'points_validity_months', '12',
    'reward_validity_rule', 'Die Gültigkeit wird bei der jeweiligen Punkteeinlösung angezeigt.',
    'redemption_conditions', 'Die Einlösung wird vom Gast bestätigt und durch das Restaurant geprüft.',
    'cash_payout_prohibited', 'Punkte haben keinen Geldwert und werden nicht bar ausgezahlt.',
    'transfer_prohibited', 'Punkte sind weder zwischen Kunden noch zwischen Restaurants übertragbar.',
    'cancellation_rule', 'Stornierte Vorgänge können nach nachvollziehbarer Prüfung korrigiert werden.',
    'fraud_and_blocking_rule', 'Bei begründetem Missbrauchsverdacht kann das Restaurant Vorgänge prüfen und sperren.',
    'program_termination_rule', 'Ein Programmende wird mit letzter Sammel- und Einlösefrist angekündigt.',
    'final_redemption_period', 'Wird bei einer geplanten Beendigung gesondert bekanntgegeben.',
    'complaint_contact', 'Vom Restaurant vor Veröffentlichung zu ergänzen',
    'effective_date', current_date::text,
    'language', 'de-AT',
    'version', '1.0-template'
  );

  for item in select * from (values
    ('participation_terms', 'Bonusprogramm-Teilnahmebedingungen', terms_content,
      'Das Bonusprogramm wird vom Restaurant angeboten. Punkte haben keinen Geldwert, sind nicht auszahlbar und gelten nur bei diesem Restaurant. Diese Vorlage ersetzt keine individuelle Rechtsberatung.'),
    ('privacy', 'Datenschutzerklärung', '{}'::jsonb,
      'Das Restaurant verarbeitet die für seine Bonusmitgliedschaft erforderlichen Kundendaten. WUXUAI stellt die technische Plattform bereit. Details und Rechtsgrundlagen müssen vor Production individuell rechtlich geprüft werden.'),
    ('imprint', 'Impressum', '{}'::jsonb,
      'Die vollständigen Unternehmensangaben des Restaurants werden hier nach Pflege durch den Betreiber veröffentlicht.'),
    ('storage', 'Cookie- und Speicherinformationen', '{}'::jsonb,
      'Die App verwendet technisch notwendige Browser-Speicherungen für Kundenzuordnung, Sicherheit und aktive Einlösevorgänge. Marketing-Speicherungen werden nicht ohne Einwilligung aktiviert.'),
    ('accessibility', 'Barrierefreiheitserklärung', '{}'::jsonb,
      'WUXUAI Bonus wird schrittweise barrierefrei gestaltet. Bekannte Einschränkungen und Kontaktmöglichkeiten werden vor Production geprüft und veröffentlicht.')
  ) as values_table(document_type, title, content, rendered_text)
  loop
    insert into public.legal_documents (restaurant_id, document_type, title)
    values (restaurant_record.id, item.document_type, item.title)
    on conflict (restaurant_id, document_type) do update set title = excluded.title
    returning id into document_id_value;

    if not exists (select 1 from public.legal_document_versions where document_id = document_id_value) then
      body_text := item.rendered_text;
      insert into public.legal_document_versions (
        document_id, restaurant_id, version, language, effective_date, content,
        rendered_text, document_hash, status, reacceptance_required
      ) values (
        document_id_value, restaurant_record.id, '1.0-template', 'de-AT', current_date,
        item.content, body_text,
        encode(extensions.digest(convert_to(body_text || item.content::text, 'UTF8'), 'sha256'), 'hex'),
        'published', false
      ) returning id into version_id_value;

      update public.legal_documents set current_published_version_id = version_id_value where id = document_id_value;
    end if;
  end loop;

  insert into public.retention_policies (restaurant_id, category, retention_months, legal_basis_note)
  select restaurant_record.id, category, months, 'Vor Production durch Datenschutzberatung freigeben.'
  from (values
    ('active_membership', null::integer), ('inactive_membership', 24), ('redemptions', 84),
    ('audit_logs', 36), ('consent_proofs', 84), ('push_subscriptions', 12),
    ('test_data', 1), ('support_cases', 24)
  ) as defaults(category, months)
  on conflict (restaurant_id, category) do nothing;
end;
$$;

do $$
declare restaurant_record record;
begin
  for restaurant_record in select id from public.restaurants loop
    perform public.ensure_restaurant_legal_templates(restaurant_record.id);
  end loop;
end;
$$;

create or replace function public.get_public_legal_center(
  input_restaurant_slug text,
  input_customer_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  profile_record public.restaurant_legal_profiles%rowtype;
  customer_id_value uuid;
  documents_payload jsonb;
  consents_payload jsonb := '[]'::jsonb;
begin
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  perform public.ensure_restaurant_legal_templates(restaurant_record.id);
  select * into profile_record from public.restaurant_legal_profiles where restaurant_id = restaurant_record.id;

  if nullif(trim(coalesce(input_customer_token, '')), '') is not null then
    customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, input_customer_token);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_type', d.document_type, 'title', d.title, 'version_id', v.id,
    'version', v.version, 'language', v.language, 'effective_date', v.effective_date,
    'content', v.content, 'rendered_text', v.rendered_text, 'document_hash', v.document_hash,
    'reacceptance_required', v.reacceptance_required,
    'accepted', case when customer_id_value is null then null else exists (
      select 1 from public.customer_legal_acceptances a
      where a.restaurant_id = restaurant_record.id and a.customer_id = customer_id_value
        and a.document_version_id = v.id
    ) end
  ) order by d.document_type), '[]'::jsonb)
  into documents_payload
  from public.legal_documents d
  join public.legal_document_versions v on v.id = d.current_published_version_id
  where d.restaurant_id = restaurant_record.id and v.status = 'published';

  if customer_id_value is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
        'consent_type', consent_type, 'status', status, 'version', version, 'updated_at', updated_at
      ) order by consent_type), '[]'::jsonb)
      into consents_payload
      from public.customer_consents
      where restaurant_id = restaurant_record.id and customer_id = customer_id_value;
  end if;

  return jsonb_build_object(
    'restaurant', jsonb_build_object('name', restaurant_record.name, 'slug', restaurant_record.slug),
    'roles', jsonb_build_object(
      'program_operator', restaurant_record.name,
      'platform_provider', 'WUXUAI',
      'notice', 'Bonusprogramm angeboten durch: ' || restaurant_record.name || '. Technisch bereitgestellt durch WUXUAI.'
    ),
    'imprint', jsonb_build_object(
      'company_name', profile_record.company_name, 'legal_form', profile_record.legal_form,
      'street', profile_record.street, 'postal_code', profile_record.postal_code,
      'city', profile_record.city, 'country', profile_record.country, 'email', profile_record.email,
      'phone', profile_record.phone, 'commercial_register_number', profile_record.commercial_register_number,
      'commercial_register_court', profile_record.commercial_register_court, 'vat_id', profile_record.vat_id,
      'chamber_membership', profile_record.chamber_membership,
      'supervisory_authority', profile_record.supervisory_authority,
      'complaint_contact', profile_record.complaint_contact
    ),
    'documents', documents_payload,
    'consents', consents_payload,
    'customer_recognized', customer_id_value is not null,
    'points_validity', jsonb_build_object(
      'months', (select nullif(v.content->>'points_validity_months', '')::integer
        from public.legal_documents d join public.legal_document_versions v on v.id = d.current_published_version_id
        where d.restaurant_id = restaurant_record.id and d.document_type = 'participation_terms'),
      'oldest_expiry_at', null,
      'calculation_status', 'not_reliably_calculable',
      'notice', 'Ein konkretes ältestes Punkte-Ablaufdatum wird erst angezeigt, wenn es aus dem Transaktionsverlauf verlässlich berechnet werden kann.'
    ),
    'program', coalesce((select jsonb_build_object(
      'status', 'scheduled', 'planned_end_at', t.planned_end_at,
      'last_points_earning_at', t.last_points_earning_at,
      'final_redemption_at', t.final_redemption_at,
      'customer_notice', t.customer_notice
    ) from public.program_terminations t
      where t.restaurant_id = restaurant_record.id and t.status = 'scheduled' limit 1),
      jsonb_build_object('status', 'active')),
    'product_notice', 'Punkte sind kein Geld, kein Bankguthaben und kein allgemeines Zahlungsmittel. Sie sind nicht auszahlbar, nicht verkäuflich und nicht übertragbar. Punkte und Punkteeinlösungen werden je Restaurant getrennt geführt.'
  );
end;
$$;

create or replace function public.accept_current_legal_documents(
  input_restaurant_slug text,
  input_customer_token text,
  input_source text default 'legal_center'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_id_value uuid;
  version_record record;
  accepted_count integer := 0;
begin
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, input_customer_token);
  if customer_id_value is null then raise exception 'Bonuskonto wurde nicht erkannt.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(customer_id_value::text || ':legal-acceptance', 0));

  for version_record in
    select d.document_type, v.id, v.document_hash, v.language
    from public.legal_documents d
    join public.legal_document_versions v on v.id = d.current_published_version_id
    where d.restaurant_id = restaurant_record.id
      and d.document_type in ('participation_terms', 'privacy')
      and v.status = 'published'
  loop
    insert into public.customer_legal_acceptances (
      restaurant_id, customer_id, document_type, document_version_id, document_hash,
      language, acceptance_source, test_session_id
    ) select restaurant_record.id, customer_id_value, version_record.document_type,
      version_record.id, version_record.document_hash, version_record.language,
      left(coalesce(input_source, 'legal_center'), 80), c.test_session_id
    from public.customers c where c.id = customer_id_value
    on conflict (customer_id, document_version_id) do nothing;

    if found then
      accepted_count := accepted_count + 1;
      perform public.write_audit_event(restaurant_record.id, customer_id_value, 'customer', customer_id_value,
        'LEGAL_DOCUMENT_ACCEPTED', 'success', left(coalesce(input_source, 'legal_center'), 80),
        'legal_document_versions', version_record.id, null,
        jsonb_build_object('document_type', version_record.document_type, 'reacceptance', true));
    end if;
  end loop;
  return jsonb_build_object('accepted_versions', accepted_count, 'status', 'accepted');
end;
$$;

create or replace function public.record_customer_legal_state(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_source text,
  input_terms_accepted boolean,
  input_privacy_acknowledged boolean,
  input_marketing_push boolean,
  input_marketing_sms boolean,
  input_marketing_email boolean,
  input_birthday_processing boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  version_record record;
  consent_item record;
  next_status text;
begin
  if not input_terms_accepted or not input_privacy_acknowledged then
    raise exception 'Teilnahmebedingungen und Datenschutzerklärung müssen bestätigt werden.';
  end if;

  for version_record in
    select d.document_type, v.id, v.document_hash, v.language
    from public.legal_documents d
    join public.legal_document_versions v on v.id = d.current_published_version_id
    where d.restaurant_id = input_restaurant_id
      and d.document_type in ('participation_terms', 'privacy')
      and v.status = 'published'
  loop
    insert into public.customer_legal_acceptances (
      restaurant_id, customer_id, document_type, document_version_id, document_hash,
      language, acceptance_source, test_session_id
    ) select input_restaurant_id, input_customer_id, version_record.document_type,
      version_record.id, version_record.document_hash, version_record.language,
      left(coalesce(input_source, 'customer_registration'), 80), c.test_session_id
    from public.customers c where c.id = input_customer_id
    on conflict (customer_id, document_version_id) do nothing;

    perform public.write_audit_event(input_restaurant_id, input_customer_id, 'customer', input_customer_id,
      'LEGAL_DOCUMENT_ACCEPTED', 'success', input_source, 'legal_document_versions',
      version_record.id, null, jsonb_build_object('document_type', version_record.document_type));
  end loop;

  if (select count(*) from public.customer_legal_acceptances
      where restaurant_id = input_restaurant_id and customer_id = input_customer_id
        and document_type in ('participation_terms', 'privacy')) < 2 then
    raise exception 'Veröffentlichte Rechtsdokumente fehlen.';
  end if;

  for consent_item in select * from (values
    ('marketing_push', input_marketing_push), ('marketing_sms', input_marketing_sms),
    ('marketing_email', input_marketing_email), ('birthday_processing', input_birthday_processing)
  ) as consents(consent_type, granted)
  loop
    next_status := case when consent_item.granted then 'granted' else 'denied' end;
    insert into public.customer_consents (
      restaurant_id, customer_id, consent_type, status, granted_at, withdrawn_at,
      version, source, proof_metadata, updated_at
    ) values (
      input_restaurant_id, input_customer_id, consent_item.consent_type, next_status,
      case when consent_item.granted then now() else null end, null, '1.0', input_source,
      jsonb_build_object('explicit_choice', true), now()
    ) on conflict (restaurant_id, customer_id, consent_type) do update set
      status = excluded.status, granted_at = excluded.granted_at,
      withdrawn_at = excluded.withdrawn_at, source = excluded.source,
      proof_metadata = excluded.proof_metadata, updated_at = now();

    insert into public.consent_events (
      restaurant_id, customer_id, consent_type, previous_status, next_status,
      version, source, proof_metadata
    ) values (
      input_restaurant_id, input_customer_id, consent_item.consent_type, null,
      next_status, '1.0', input_source, jsonb_build_object('explicit_choice', true)
    );

    perform public.write_audit_event(input_restaurant_id, input_customer_id, 'customer', input_customer_id,
      case when consent_item.granted then 'CONSENT_GRANTED' else 'CONSENT_DECLINED' end,
      'success', input_source, 'customer_consents', null, null,
      jsonb_build_object('consent_type', consent_item.consent_type));
  end loop;
end;
$$;

create or replace function public.register_restaurant_customer_legal(
  input_restaurant_slug text,
  input_first_name text,
  input_phone text,
  input_birthday date,
  input_device_id text,
  input_terms_accepted boolean,
  input_privacy_acknowledged boolean,
  input_marketing_push boolean default false,
  input_marketing_sms boolean default false,
  input_marketing_email boolean default false,
  input_birthday_processing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result_payload jsonb;
  restaurant_record public.restaurants%rowtype;
  customer_id_value uuid;
  customer_token_value text;
begin
  if not input_terms_accepted or not input_privacy_acknowledged then
    raise exception 'Teilnahmebedingungen und Datenschutzerklärung müssen bestätigt werden.';
  end if;
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  perform public.ensure_restaurant_legal_templates(restaurant_record.id);

  result_payload := public.register_restaurant_customer(
    input_restaurant_slug, input_first_name, input_phone,
    case when input_birthday_processing then input_birthday else null end,
    input_device_id
  );
  customer_token_value := result_payload #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, customer_token_value);
  perform public.record_customer_legal_state(
    restaurant_record.id, customer_id_value, 'customer_registration',
    input_terms_accepted, input_privacy_acknowledged,
    input_marketing_push, input_marketing_sms, input_marketing_email,
    input_birthday_processing
  );
  if input_birthday_processing and input_birthday is not null then
    update public.customers set
      birthday_day = extract(day from input_birthday)::integer,
      birthday_month = extract(month from input_birthday)::integer,
      birthday_updated_at = now()
    where id = customer_id_value;
  end if;
  return result_payload;
end;
$$;

create or replace function public.register_referral_customer_legal(
  input_restaurant_slug text,
  input_referral_token text,
  input_first_name text,
  input_phone text,
  input_birthday date,
  input_device_id text,
  input_terms_accepted boolean,
  input_privacy_acknowledged boolean,
  input_marketing_push boolean default false,
  input_marketing_sms boolean default false,
  input_marketing_email boolean default false,
  input_birthday_processing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result_payload jsonb;
  restaurant_record public.restaurants%rowtype;
  customer_id_value uuid;
  customer_token_value text;
begin
  if not input_terms_accepted or not input_privacy_acknowledged then
    raise exception 'Teilnahmebedingungen und Datenschutzerklärung müssen bestätigt werden.';
  end if;
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  perform public.ensure_restaurant_legal_templates(restaurant_record.id);

  result_payload := public.register_referral_customer(
    input_restaurant_slug, input_referral_token, input_first_name, input_phone,
    case when input_birthday_processing then input_birthday else null end,
    input_device_id
  );
  customer_token_value := result_payload #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, customer_token_value);
  perform public.record_customer_legal_state(
    restaurant_record.id, customer_id_value, 'referral_registration',
    input_terms_accepted, input_privacy_acknowledged,
    input_marketing_push, input_marketing_sms, input_marketing_email,
    input_birthday_processing
  );
  if input_birthday_processing and input_birthday is not null then
    update public.customers set
      birthday_day = extract(day from input_birthday)::integer,
      birthday_month = extract(month from input_birthday)::integer,
      birthday_updated_at = now()
    where id = customer_id_value;
  end if;
  return result_payload;
end;
$$;

create or replace function public.enforce_birthday_processing_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.birthday_day, new.birthday_month) is distinct from (old.birthday_day, old.birthday_month)
      and not public.is_restaurant_admin(new.restaurant_id)
      and not exists (
        select 1 from public.customer_consents cc
        where cc.restaurant_id = new.restaurant_id and cc.customer_id = new.id
          and cc.consent_type = 'birthday_processing'
          and cc.status = 'granted' and cc.withdrawn_at is null
      ) then
    raise exception 'Für die Geburtstagsverarbeitung fehlt eine Einwilligung.';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_birthday_processing_consent_trigger on public.customers;
create trigger enforce_birthday_processing_consent_trigger
before update of birthday_day, birthday_month on public.customers
for each row execute function public.enforce_birthday_processing_consent();

create or replace function public.update_customer_consent(
  input_restaurant_slug text,
  input_customer_token text,
  input_consent_type text,
  input_granted boolean,
  input_source text default 'consent_center'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_id_value uuid;
  previous_status_value text;
  next_status_value text;
begin
  if input_consent_type not in ('marketing_push', 'marketing_sms', 'marketing_email', 'personalized_recommendations', 'birthday_processing') then
    raise exception 'Einwilligungsart ist nicht gültig.';
  end if;
  select * into restaurant_record from public.restaurants where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, input_customer_token);
  if customer_id_value is null then raise exception 'Bonuskonto wurde nicht erkannt.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(customer_id_value::text || ':' || input_consent_type, 0));
  select status into previous_status_value from public.customer_consents
  where restaurant_id = restaurant_record.id and customer_id = customer_id_value and consent_type = input_consent_type;
  next_status_value := case when input_granted then 'granted' else 'withdrawn' end;

  if previous_status_value = next_status_value then
    return jsonb_build_object('consent_type', input_consent_type, 'status', next_status_value, 'updated_at', now());
  end if;

  insert into public.customer_consents (
    restaurant_id, customer_id, consent_type, status, granted_at, withdrawn_at,
    version, source, proof_metadata, updated_at
  ) values (
    restaurant_record.id, customer_id_value, input_consent_type, next_status_value,
    case when input_granted then now() else null end,
    case when not input_granted then now() else null end,
    '1.0', left(coalesce(input_source, 'consent_center'), 80),
    jsonb_build_object('explicit_choice', true), now()
  ) on conflict (restaurant_id, customer_id, consent_type) do update set
    status = excluded.status,
    granted_at = case when excluded.status = 'granted' then now() else customer_consents.granted_at end,
    withdrawn_at = case when excluded.status = 'withdrawn' then now() else null end,
    source = excluded.source, proof_metadata = excluded.proof_metadata, updated_at = now();

  if previous_status_value is distinct from next_status_value then
    insert into public.consent_events (
      restaurant_id, customer_id, consent_type, previous_status, next_status,
      version, source, proof_metadata
    ) values (
      restaurant_record.id, customer_id_value, input_consent_type, previous_status_value,
      next_status_value, '1.0', input_source, jsonb_build_object('explicit_choice', true)
    );
    perform public.write_audit_event(restaurant_record.id, customer_id_value, 'customer', customer_id_value,
      case when input_granted then 'CONSENT_GRANTED' else 'CONSENT_WITHDRAWN' end,
      'success', input_source, 'customer_consents', null, null,
      jsonb_build_object('consent_type', input_consent_type));
  end if;
  return jsonb_build_object('consent_type', input_consent_type, 'status', next_status_value, 'updated_at', now());
end;
$$;

create or replace function public.create_customer_privacy_request(
  input_restaurant_slug text,
  input_customer_token text,
  input_request_type text,
  input_customer_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_id_value uuid;
  request_id_value uuid;
  event_type_value text;
begin
  if input_request_type not in ('access', 'export', 'rectification', 'deletion', 'restriction', 'membership_termination', 'complaint') then
    raise exception 'Anfrageart ist nicht gültig.';
  end if;
  select * into restaurant_record from public.restaurants where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, input_customer_token);
  if customer_id_value is null then raise exception 'Bonuskonto wurde nicht erkannt.'; end if;
  if exists (select 1 from public.privacy_requests where customer_id = customer_id_value
      and restaurant_id = restaurant_record.id and request_type = input_request_type
      and status in ('requested', 'in_review') and created_at > now() - interval '24 hours') then
    raise exception 'Eine entsprechende Anfrage ist bereits offen.';
  end if;
  insert into public.privacy_requests (restaurant_id, customer_id, request_type, customer_message)
  values (restaurant_record.id, customer_id_value, input_request_type, nullif(left(trim(coalesce(input_customer_message, '')), 1000), ''))
  returning id into request_id_value;
  if input_request_type = 'access' then event_type_value := 'DATA_ACCESS_REQUESTED';
  elsif input_request_type = 'rectification' then event_type_value := 'DATA_RECTIFICATION_REQUESTED';
  elsif input_request_type = 'deletion' then event_type_value := 'DELETION_REQUEST_CREATED';
  elsif input_request_type = 'restriction' then event_type_value := 'DATA_RESTRICTION_REQUESTED';
  elsif input_request_type = 'membership_termination' then event_type_value := 'MEMBERSHIP_TERMINATION_REQUESTED';
  else event_type_value := 'PRIVACY_REQUEST_CREATED'; end if;
  if input_request_type = 'membership_termination' then
    update public.customers set membership_status = 'termination_requested' where id = customer_id_value;
  end if;
  perform public.write_audit_event(restaurant_record.id, customer_id_value, 'customer', customer_id_value,
    event_type_value, 'success', 'legal_center', 'privacy_requests', request_id_value,
    null, jsonb_build_object('request_type', input_request_type));
  return jsonb_build_object('request_id', request_id_value, 'status', 'requested');
end;
$$;

create or replace function public.get_customer_data_export(
  input_restaurant_slug text,
  input_customer_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  export_payload jsonb;
begin
  select * into restaurant_record from public.restaurants where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  select c.* into customer_record from public.customers c
  join public.customer_qr_tokens t on t.customer_id = c.id and t.restaurant_id = c.restaurant_id
  where c.restaurant_id = restaurant_record.id and t.active = true
    and t.token_hash = public.hash_public_token(input_customer_token) limit 1;
  if customer_record.id is null then raise exception 'Bonuskonto wurde nicht erkannt.'; end if;
  export_payload := jsonb_build_object(
    'created_at', now(),
    'restaurant', jsonb_build_object('name', restaurant_record.name, 'slug', restaurant_record.slug),
    'membership', jsonb_build_object(
      'name', customer_record.name, 'phone', customer_record.phone, 'email', customer_record.email,
      'birthday', customer_record.birthday, 'customer_code', customer_record.customer_code,
      'points_balance', customer_record.points_balance, 'stamp_balance', customer_record.stamp_balance,
      'membership_status', customer_record.membership_status, 'created_at', customer_record.created_at
    ),
    'points_transactions', (select coalesce(jsonb_agg(jsonb_build_object(
      'type', type, 'points', points, 'reason', reason, 'created_at', created_at
    ) order by created_at), '[]'::jsonb) from public.points_transactions
      where customer_id = customer_record.id and restaurant_id = restaurant_record.id),
    'legal_acceptances', (select coalesce(jsonb_agg(jsonb_build_object(
      'document_type', document_type, 'document_hash', document_hash,
      'accepted_at', accepted_at, 'language', language
    ) order by accepted_at), '[]'::jsonb) from public.customer_legal_acceptances
      where customer_id = customer_record.id and restaurant_id = restaurant_record.id),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object(
      'consent_type', consent_type, 'status', status, 'granted_at', granted_at,
      'withdrawn_at', withdrawn_at, 'updated_at', updated_at
    ) order by consent_type), '[]'::jsonb) from public.customer_consents
      where customer_id = customer_record.id and restaurant_id = restaurant_record.id)
  );
  perform public.write_audit_event(restaurant_record.id, customer_record.id, 'customer', customer_record.id,
    'DATA_EXPORT_CREATED', 'success', 'legal_center', 'customers', customer_record.id,
    null, jsonb_build_object('restaurant_scoped', true));
  return export_payload;
end;
$$;

create or replace function public.authorize_customer_message(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_message_category text,
  input_channel text,
  input_purpose text,
  input_idempotency_key uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  consent_type_value text;
  authorized_value boolean := true;
begin
  if input_message_category not in ('TRANSACTIONAL', 'PROGRAM_SERVICE', 'MARKETING') then
    raise exception 'Nachrichtenkategorie ist nicht gültig.';
  end if;
  if input_channel not in ('push', 'sms', 'email', 'in_app') then raise exception 'Nachrichtenkanal ist nicht gültig.'; end if;
  if not exists (select 1 from public.customers where id = input_customer_id and restaurant_id = input_restaurant_id) then
    raise exception 'Kunde gehört nicht zum Restaurant.';
  end if;
  if input_message_category = 'MARKETING' then
    consent_type_value := 'marketing_' || input_channel;
    authorized_value := input_channel = 'in_app' or exists (
      select 1 from public.customer_consents
      where restaurant_id = input_restaurant_id and customer_id = input_customer_id
        and consent_type = consent_type_value and status = 'granted' and withdrawn_at is null
    );
  end if;
  insert into public.customer_message_attempts (
    restaurant_id, customer_id, message_category, channel, purpose,
    authorized, blocked_reason, idempotency_key
  ) values (
    input_restaurant_id, input_customer_id, input_message_category, input_channel,
    left(input_purpose, 120), authorized_value,
    case when authorized_value then null else 'no_valid_consent' end,
    input_idempotency_key
  ) on conflict (restaurant_id, idempotency_key) do update set
    authorized = customer_message_attempts.authorized
  returning authorized into authorized_value;
  if not authorized_value then
    perform public.write_audit_event(input_restaurant_id, input_customer_id, 'system', null,
      'MARKETING_MESSAGE_BLOCKED_NO_CONSENT', 'blocked', 'messaging',
      'customer_message_attempts', null, input_idempotency_key,
      jsonb_build_object('channel', input_channel, 'purpose', left(input_purpose, 120)));
  end if;
  return authorized_value;
end;
$$;

create or replace function public.get_restaurant_legal_setup(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare result_payload jsonb;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  perform public.ensure_restaurant_legal_templates(input_restaurant_id);
  select jsonb_build_object(
    'profile', to_jsonb(p) - 'updated_by',
    'documents', (select coalesce(jsonb_agg(jsonb_build_object(
      'document_type', d.document_type, 'title', d.title, 'version_id', v.id,
      'version', v.version, 'effective_date', v.effective_date,
      'content', v.content, 'rendered_text', v.rendered_text,
      'status', v.status, 'reacceptance_required', v.reacceptance_required
    ) order by d.document_type), '[]'::jsonb)
      from public.legal_documents d left join public.legal_document_versions v
        on v.id = d.current_published_version_id where d.restaurant_id = input_restaurant_id),
    'readiness', jsonb_build_object(
      'operational_ready', r.operational_ready, 'legal_ready', r.legal_ready,
      'security_ready', r.security_ready, 'transition_exempt', r.legal_transition_exempt
    ),
    'termination', (select to_jsonb(t) - 'created_by' from public.program_terminations t
      where t.restaurant_id = input_restaurant_id and t.status = 'scheduled' limit 1),
    'privacy_requests', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', pr.id, 'request_type', pr.request_type, 'status', pr.status,
      'created_at', pr.created_at,
      'customer_reference', 'Konto ' || upper(left(encode(extensions.digest(convert_to(pr.customer_id::text, 'UTF8'), 'sha256'), 'hex'), 8))
    ) order by pr.created_at), '[]'::jsonb)
      from public.privacy_requests pr
      where pr.restaurant_id = input_restaurant_id and pr.status in ('requested', 'in_review'))
  ) into result_payload
  from public.restaurant_legal_profiles p join public.restaurants r on r.id = p.restaurant_id
  where p.restaurant_id = input_restaurant_id;
  return result_payload;
end;
$$;

create or replace function public.save_restaurant_legal_setup(
  input_restaurant_id uuid,
  input_profile jsonb,
  input_terms jsonb,
  input_privacy_text text,
  input_effective_date date,
  input_reacceptance_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  terms_document_id uuid;
  privacy_document_id uuid;
  terms_version_id uuid;
  privacy_version_id uuid;
  next_version text;
  terms_text text;
  legal_ready_value boolean;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  if not public.legal_terms_complete(input_terms) then raise exception 'Pflichtangaben der Teilnahmebedingungen fehlen.'; end if;
  if (input_terms->>'points_validity_months') !~ '^[1-9][0-9]{0,2}$'
      or (input_terms->>'points_validity_months')::integer > 240 then
    raise exception 'Punktegültigkeit muss zwischen 1 und 240 Monaten liegen.';
  end if;
  if length(trim(coalesce(input_privacy_text, ''))) < 120 then raise exception 'Datenschutzerklärung ist zu kurz.'; end if;
  if nullif(trim(input_profile->>'company_name'), '') is null
      or nullif(trim(input_profile->>'street'), '') is null
      or nullif(trim(input_profile->>'postal_code'), '') is null
      or nullif(trim(input_profile->>'city'), '') is null
      or nullif(trim(input_profile->>'email'), '') is null
      or nullif(trim(input_profile->>'complaint_contact'), '') is null then
    raise exception 'Pflichtangaben für Impressum und Beschwerdekontakt fehlen.';
  end if;
  perform public.ensure_restaurant_legal_templates(input_restaurant_id);
  insert into public.restaurant_legal_profiles (
    restaurant_id, company_name, legal_form, street, postal_code, city, country,
    email, phone, commercial_register_number, commercial_register_court, vat_id,
    chamber_membership, supervisory_authority, complaint_contact,
    accessibility_contact, legal_review_status, updated_at, updated_by
  ) values (
    input_restaurant_id, trim(input_profile->>'company_name'), trim(coalesce(input_profile->>'legal_form', '')),
    trim(input_profile->>'street'), trim(input_profile->>'postal_code'), trim(input_profile->>'city'),
    trim(coalesce(input_profile->>'country', 'Österreich')), trim(input_profile->>'email'),
    nullif(trim(input_profile->>'phone'), ''), trim(coalesce(input_profile->>'commercial_register_number', '')),
    trim(coalesce(input_profile->>'commercial_register_court', '')), trim(coalesce(input_profile->>'vat_id', '')),
    nullif(trim(input_profile->>'chamber_membership'), ''), nullif(trim(input_profile->>'supervisory_authority'), ''),
    trim(input_profile->>'complaint_contact'), nullif(trim(input_profile->>'accessibility_contact'), ''),
    'required', now(), auth.uid()
  ) on conflict (restaurant_id) do update set
    company_name = excluded.company_name, legal_form = excluded.legal_form,
    street = excluded.street, postal_code = excluded.postal_code, city = excluded.city,
    country = excluded.country, email = excluded.email, phone = excluded.phone,
    commercial_register_number = excluded.commercial_register_number,
    commercial_register_court = excluded.commercial_register_court, vat_id = excluded.vat_id,
    chamber_membership = excluded.chamber_membership, supervisory_authority = excluded.supervisory_authority,
    complaint_contact = excluded.complaint_contact, accessibility_contact = excluded.accessibility_contact,
    updated_at = now(), updated_by = auth.uid();

  select id into terms_document_id from public.legal_documents where restaurant_id = input_restaurant_id and document_type = 'participation_terms';
  select id into privacy_document_id from public.legal_documents where restaurant_id = input_restaurant_id and document_type = 'privacy';
  next_version := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  terms_text := format(
    'Das Bonusprogramm wird von %s betrieben. Punkte werden ausschließlich restaurantbezogen geführt. Punkte sind kein Geld, kein Bankguthaben, keine E-Wallet und kein allgemeines Zahlungsmittel. Sie sind nicht auszahlbar, nicht verkäuflich und nicht übertragbar. %s',
    input_terms->>'program_operator_name', input_terms->>'redemption_conditions'
  );
  insert into public.legal_document_versions (
    document_id, restaurant_id, version, language, effective_date, content,
    rendered_text, document_hash, status, reacceptance_required, created_by
  ) values (
    terms_document_id, input_restaurant_id, next_version, coalesce(input_terms->>'language', 'de-AT'),
    input_effective_date, input_terms, terms_text,
    encode(extensions.digest(convert_to(terms_text || input_terms::text, 'UTF8'), 'sha256'), 'hex'),
    'published', input_reacceptance_required, auth.uid()
  ) returning id into terms_version_id;
  update public.legal_documents set current_published_version_id = terms_version_id where id = terms_document_id;

  insert into public.legal_document_versions (
    document_id, restaurant_id, version, language, effective_date, content,
    rendered_text, document_hash, status, reacceptance_required, created_by
  ) values (
    privacy_document_id, input_restaurant_id, next_version, 'de-AT', input_effective_date,
    jsonb_build_object('roles_separated', true), trim(input_privacy_text),
    encode(extensions.digest(convert_to(trim(input_privacy_text), 'UTF8'), 'sha256'), 'hex'),
    'published', input_reacceptance_required, auth.uid()
  ) returning id into privacy_version_id;
  update public.legal_documents set current_published_version_id = privacy_version_id where id = privacy_document_id;

  legal_ready_value := public.legal_terms_complete(input_terms)
    and length(trim(input_privacy_text)) >= 120;
  update public.restaurants set
    operational_ready = onboarding_status in ('ready', 'completed'),
    legal_ready = legal_ready_value,
    security_ready = true,
    legal_transition_exempt = false
  where id = input_restaurant_id;
  perform public.write_audit_event(input_restaurant_id, null, 'admin', auth.uid(),
    'LEGAL_DOCUMENT_PUBLISHED', 'success', 'restaurant_portal', 'legal_document_versions',
    terms_version_id, null, jsonb_build_object('terms_version_id', terms_version_id,
      'privacy_version_id', privacy_version_id, 'reacceptance_required', input_reacceptance_required));
  if input_reacceptance_required then
    perform public.write_audit_event(input_restaurant_id, null, 'admin', auth.uid(),
      'LEGAL_REACCEPTANCE_REQUIRED', 'success', 'restaurant_portal', 'legal_document_versions',
      terms_version_id, null, jsonb_build_object('privacy_version_id', privacy_version_id));
  end if;
  return public.get_restaurant_legal_setup(input_restaurant_id);
end;
$$;

create or replace function public.schedule_program_termination(
  input_restaurant_id uuid,
  input_planned_end_at timestamptz,
  input_last_points_earning_at timestamptz,
  input_final_redemption_at timestamptz,
  input_customer_notice text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare termination_id_value uuid;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  if input_last_points_earning_at > input_planned_end_at or input_planned_end_at > input_final_redemption_at then
    raise exception 'Die Fristen sind nicht in der richtigen Reihenfolge.';
  end if;
  if input_planned_end_at <= now() + interval '7 days' then raise exception 'Das Programmende benötigt eine angemessene Vorlaufzeit.'; end if;
  if length(trim(coalesce(input_customer_notice, ''))) < 40 then raise exception 'Kundenhinweis ist zu kurz.'; end if;
  insert into public.program_terminations (
    restaurant_id, planned_end_at, last_points_earning_at, final_redemption_at,
    customer_notice, created_by
  ) values (
    input_restaurant_id, input_planned_end_at, input_last_points_earning_at,
    input_final_redemption_at, trim(input_customer_notice), auth.uid()
  ) returning id into termination_id_value;
  perform public.write_audit_event(input_restaurant_id, null, 'admin', auth.uid(),
    'PROGRAM_TERMINATION_SCHEDULED', 'success', 'restaurant_portal',
    'program_terminations', termination_id_value, null,
    jsonb_build_object('planned_end_at', input_planned_end_at,
      'last_points_earning_at', input_last_points_earning_at,
      'final_redemption_at', input_final_redemption_at));
  return jsonb_build_object('id', termination_id_value, 'status', 'scheduled');
end;
$$;

create or replace function public.get_reward_accounting_export(
  input_restaurant_id uuid,
  input_from timestamptz,
  input_to timestamptz,
  input_reward_id uuid default null,
  input_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare export_payload jsonb;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  if input_from is null or input_to is null or input_from >= input_to then raise exception 'Zeitraum ist nicht gültig.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'restaurant_id', rc.restaurant_id, 'reward_id', rc.reward_id, 'reward_name', rw.title,
    'reward_category', rw.category, 'regular_sales_price', rw.product_price,
    'points_consumed', coalesce((rc.metadata->>'points_spent')::integer, 0),
    'redeemed_at', rc.redeemed_at, 'staff_confirmation', rc.redeemed_at is not null,
    'redemption_code', 'Referenz ' || left(rc.id::text, 8),
    'receipt_reference', null, 'tax_category', null, 'status', rc.status,
    'reversal_reference', null, 'audit_event_id', al.id
  ) order by rc.created_at), '[]'::jsonb) into export_payload
  from public.redemption_codes rc
  join public.rewards rw on rw.id = rc.reward_id and rw.restaurant_id = rc.restaurant_id
  left join lateral (
    select id from public.audit_log
    where restaurant_id = rc.restaurant_id and entity_id = rc.id
    order by created_at desc limit 1
  ) al on true
  where rc.restaurant_id = input_restaurant_id
    and rc.created_at >= input_from and rc.created_at < input_to
    and (input_reward_id is null or rc.reward_id = input_reward_id)
    and (input_status is null or rc.status = input_status);
  perform public.write_audit_event(input_restaurant_id, null, 'admin', auth.uid(),
    'REWARD_ACCOUNTING_EXPORT_CREATED', 'success', 'restaurant_portal',
    'redemption_codes', null, null,
    jsonb_build_object('from', input_from, 'to', input_to,
      'reward_filter', input_reward_id, 'status_filter', input_status));
  return jsonb_build_object(
    'created_at', now(), 'rows', export_payload,
    'notice', 'Die steuerliche und kassentechnische Behandlung ist mit der Buchhaltung oder Steuerberatung abzustimmen. WUXUAI erteilt keine Steuerberatung.'
  );
end;
$$;

create or replace function public.preview_retention_cleanup(
  input_restaurant_id uuid,
  input_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_restaurant_admin(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  return jsonb_build_object(
    'dry_run', true,
    'as_of', input_as_of,
    'inactive_memberships', (select count(*) from public.customers c
      where c.restaurant_id = input_restaurant_id and c.membership_status <> 'active'),
    'expired_push_subscriptions', (select count(*) from public.customer_push_subscriptions s
      where s.restaurant_id = input_restaurant_id and s.active = false),
    'completed_privacy_requests', (select count(*) from public.privacy_requests p
      where p.restaurant_id = input_restaurant_id and p.status = 'completed'),
    'executed', false,
    'notice', 'Dieser Lauf zeigt nur Kandidaten. Es wurden keine Daten gelöscht oder anonymisiert.'
  );
end;
$$;

create or replace function public.enforce_discoverable_legal_readiness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare restaurant_record public.restaurants%rowtype;
begin
  if new.is_discoverable = true then
    if tg_op = 'UPDATE' then
      if old.is_discoverable = true then
        return new;
      end if;
    end if;
    select * into restaurant_record from public.restaurants where id = new.restaurant_id;
    if not restaurant_record.operational_ready or not restaurant_record.legal_ready or not restaurant_record.security_ready then
      raise exception 'Öffentliche Aktivierung erfordert Betriebs-, Rechts- und Sicherheitsbereitschaft.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_discoverable_legal_readiness_trigger on public.branches;
create trigger enforce_discoverable_legal_readiness_trigger
before insert or update of is_discoverable on public.branches
for each row execute function public.enforce_discoverable_legal_readiness();

revoke all on public.restaurant_legal_profiles, public.legal_documents,
  public.legal_document_versions, public.customer_legal_acceptances,
  public.customer_consents, public.consent_events, public.privacy_requests,
  public.program_terminations, public.retention_policies,
  public.customer_message_attempts from anon;

revoke execute on function public.get_public_legal_center(text, text) from public;
grant execute on function public.get_public_legal_center(text, text) to anon, authenticated;
revoke execute on function public.accept_current_legal_documents(text, text, text) from public;
grant execute on function public.accept_current_legal_documents(text, text, text) to anon, authenticated;
revoke execute on function public.register_restaurant_customer_legal(text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.register_restaurant_customer_legal(text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;
revoke execute on function public.register_referral_customer_legal(text, text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.register_referral_customer_legal(text, text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;
revoke execute on function public.update_customer_consent(text, text, text, boolean, text) from public;
grant execute on function public.update_customer_consent(text, text, text, boolean, text) to anon, authenticated;
revoke execute on function public.create_customer_privacy_request(text, text, text, text) from public;
grant execute on function public.create_customer_privacy_request(text, text, text, text) to anon, authenticated;
revoke execute on function public.get_customer_data_export(text, text) from public;
grant execute on function public.get_customer_data_export(text, text) to anon, authenticated;

revoke execute on function public.get_restaurant_legal_setup(uuid) from public, anon;
grant execute on function public.get_restaurant_legal_setup(uuid) to authenticated;
revoke execute on function public.save_restaurant_legal_setup(uuid, jsonb, jsonb, text, date, boolean) from public, anon;
grant execute on function public.save_restaurant_legal_setup(uuid, jsonb, jsonb, text, date, boolean) to authenticated;
revoke execute on function public.schedule_program_termination(uuid, timestamptz, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.schedule_program_termination(uuid, timestamptz, timestamptz, timestamptz, text) to authenticated;
revoke execute on function public.get_reward_accounting_export(uuid, timestamptz, timestamptz, uuid, text) from public, anon;
grant execute on function public.get_reward_accounting_export(uuid, timestamptz, timestamptz, uuid, text) to authenticated;
revoke execute on function public.preview_retention_cleanup(uuid, timestamptz) from public, anon;
grant execute on function public.preview_retention_cleanup(uuid, timestamptz) to authenticated;
revoke execute on function public.authorize_customer_message(uuid, uuid, text, text, text, uuid) from public, anon, authenticated;

-- Remove direct anonymous bypasses. Registration now goes through the legal wrappers.
revoke execute on function public.register_restaurant_customer(text, text, text, date) from anon, authenticated;
revoke execute on function public.register_restaurant_customer(text, text, text, date, text) from anon, authenticated;
revoke execute on function public.register_referral_customer(text, text, text, text, date) from anon, authenticated;
revoke execute on function public.register_referral_customer(text, text, text, text, date, text) from anon, authenticated;
