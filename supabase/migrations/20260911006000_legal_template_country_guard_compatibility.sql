-- Keep the shared legal-template helper compatible with the fail-closed
-- Country Launch Gate. The legal-document and retention backfill body remains
-- unchanged; only the obsolete country-less profile placeholder is replaced
-- with validation of the existing canonical profile.

create or replace function public.ensure_restaurant_legal_templates(input_restaurant_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  restaurant_record public.restaurants%rowtype;
  profile_record public.restaurant_legal_profiles%rowtype;
  document_id_value uuid;
  version_id_value uuid;
  terms_content jsonb;
  body_text text;
  item record;
begin
  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for share;

  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'LEGAL_PROFILE_RESTAURANT_NOT_FOUND';
  end if;

  select * into profile_record
  from public.restaurant_legal_profiles
  where restaurant_id = restaurant_record.id
  for share;

  if profile_record.restaurant_id is null then
    raise exception using errcode = 'P0001', message = 'LEGAL_PROFILE_REQUIRED';
  end if;

  if nullif(trim(profile_record.company_name), '') is null
      or nullif(trim(profile_record.legal_form), '') is null
      or nullif(trim(profile_record.street), '') is null
      or nullif(trim(profile_record.postal_code), '') is null
      or nullif(trim(profile_record.city), '') is null
      or nullif(trim(profile_record.country), '') is null
      or profile_record.country !~ '^[A-Z]{2}$'
      or nullif(trim(profile_record.email), '') is null then
    raise exception using errcode = 'P0001', message = 'LEGAL_PROFILE_INCOMPLETE';
  end if;

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
    on conflict (restaurant_id, document_type) do nothing;

    select id into document_id_value
    from public.legal_documents
    where restaurant_id = restaurant_record.id
      and document_type = item.document_type;

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

      update public.legal_documents
      set current_published_version_id = version_id_value
      where id = document_id_value
        and current_published_version_id is null;
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

revoke execute on function public.ensure_restaurant_legal_templates(uuid)
  from public, anon, authenticated;

comment on function public.ensure_restaurant_legal_templates(uuid) is
  'Private idempotent legal-template backfill for restaurants with an existing complete canonical legal profile.';
