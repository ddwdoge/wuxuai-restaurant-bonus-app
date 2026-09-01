-- v13 hardening: public legal reads stay read-only and customer exports stay minimal.

-- Keep the controlled setup helper additive as well: an existing document title
-- or published version must never be replaced by a template backfill.
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

-- Idempotent backfill for restaurants that predate the legal layer. Existing
-- versions are preserved by ensure_restaurant_legal_templates.
do $$
declare
  restaurant_record record;
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
stable
as $$
declare
  restaurant_record public.restaurants%rowtype;
  profile_record public.restaurant_legal_profiles%rowtype;
  customer_id_value uuid;
  documents_payload jsonb := '[]'::jsonb;
  consents_payload jsonb := '[]'::jsonb;
  legal_ready_value boolean := false;
begin
  select * into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;

  select * into profile_record
  from public.restaurant_legal_profiles
  where restaurant_id = restaurant_record.id;

  legal_ready_value := profile_record.restaurant_id is not null
    and (
      select count(*) = 2
      from public.legal_documents d
      join public.legal_document_versions v
        on v.id = d.current_published_version_id
      where d.restaurant_id = restaurant_record.id
        and d.document_type in ('participation_terms', 'privacy')
        and v.status = 'published'
    );

  if nullif(trim(coalesce(input_customer_token, '')), '') is not null then
    customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, input_customer_token);
  end if;

  if legal_ready_value then
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
      'reacceptance_required', v.reacceptance_required,
      'accepted', case when customer_id_value is null then null else exists (
        select 1
        from public.customer_legal_acceptances a
        where a.restaurant_id = restaurant_record.id
          and a.customer_id = customer_id_value
          and a.document_version_id = v.id
      ) end
    ) order by d.document_type), '[]'::jsonb)
    into documents_payload
    from public.legal_documents d
    join public.legal_document_versions v
      on v.id = d.current_published_version_id
    where d.restaurant_id = restaurant_record.id
      and v.status = 'published';
  end if;

  if customer_id_value is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'consent_type', consent_type,
      'status', status,
      'version', version,
      'updated_at', updated_at
    ) order by consent_type), '[]'::jsonb)
    into consents_payload
    from public.customer_consents
    where restaurant_id = restaurant_record.id
      and customer_id = customer_id_value;
  end if;

  return jsonb_build_object(
    'legal_ready', legal_ready_value,
    'missing_configuration', not legal_ready_value,
    'restaurant', jsonb_build_object('name', restaurant_record.name, 'slug', restaurant_record.slug),
    'roles', jsonb_build_object(
      'program_operator', restaurant_record.name,
      'platform_provider', 'WUXUAI',
      'notice', 'Bonusprogramm angeboten durch: ' || restaurant_record.name || '. Technisch bereitgestellt durch WUXUAI.'
    ),
    'imprint', jsonb_build_object(
      'company_name', profile_record.company_name,
      'legal_form', profile_record.legal_form,
      'street', profile_record.street,
      'postal_code', profile_record.postal_code,
      'city', profile_record.city,
      'country', profile_record.country,
      'email', profile_record.email,
      'phone', profile_record.phone,
      'commercial_register_number', profile_record.commercial_register_number,
      'commercial_register_court', profile_record.commercial_register_court,
      'vat_id', profile_record.vat_id,
      'chamber_membership', profile_record.chamber_membership,
      'supervisory_authority', profile_record.supervisory_authority,
      'complaint_contact', profile_record.complaint_contact
    ),
    'documents', documents_payload,
    'consents', consents_payload,
    'customer_recognized', customer_id_value is not null,
    'points_validity', jsonb_build_object(
      'months', case when legal_ready_value then (
        select nullif(v.content->>'points_validity_months', '')::integer
        from public.legal_documents d
        join public.legal_document_versions v on v.id = d.current_published_version_id
        where d.restaurant_id = restaurant_record.id
          and d.document_type = 'participation_terms'
      ) else null end,
      'oldest_expiry_at', null,
      'calculation_status', 'not_reliably_calculable',
      'notice', 'Ein konkretes ältestes Punkte-Ablaufdatum wird erst angezeigt, wenn es aus dem Transaktionsverlauf verlässlich berechnet werden kann.'
    ),
    'program', coalesce((
      select jsonb_build_object(
        'status', 'scheduled',
        'planned_end_at', t.planned_end_at,
        'last_points_earning_at', t.last_points_earning_at,
        'final_redemption_at', t.final_redemption_at,
        'customer_notice', t.customer_notice
      )
      from public.program_terminations t
      where t.restaurant_id = restaurant_record.id
        and t.status = 'scheduled'
      limit 1
    ), jsonb_build_object('status', 'active')),
    'product_notice', 'Punkte sind kein Geld, kein Bankguthaben und kein allgemeines Zahlungsmittel. Sie sind nicht auszahlbar, nicht verkäuflich und nicht übertragbar. Punkte und Punkteeinlösungen werden je Restaurant getrennt geführt.'
  );
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
  select * into restaurant_record
  from public.restaurants
  where slug = trim(input_restaurant_slug)
    and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;

  select c.* into customer_record
  from public.customers c
  join public.customer_qr_tokens t
    on t.customer_id = c.id
   and t.restaurant_id = c.restaurant_id
  where c.restaurant_id = restaurant_record.id
    and t.active = true
    and t.token_hash = public.hash_public_token(input_customer_token)
  limit 1;
  if customer_record.id is null then raise exception 'Bonuskonto wurde nicht erkannt.'; end if;

  export_payload := jsonb_build_object(
    'created_at', now(),
    'restaurant', jsonb_build_object('name', restaurant_record.name, 'slug', restaurant_record.slug),
    'membership', jsonb_build_object(
      'name', customer_record.name,
      'phone', customer_record.phone,
      'email', customer_record.email,
      'birthday', customer_record.birthday,
      'customer_code', customer_record.customer_code,
      'points_balance', customer_record.points_balance,
      'stamp_balance', customer_record.stamp_balance,
      'membership_status', customer_record.membership_status,
      'created_at', customer_record.created_at
    ),
    'points_transactions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'type', pt.type,
        'points', pt.points,
        'reason', pt.reason,
        'created_at', pt.created_at
      ) order by pt.created_at), '[]'::jsonb)
      from public.points_transactions pt
      where pt.customer_id = customer_record.id
        and pt.restaurant_id = restaurant_record.id
    ),
    'legal_acceptances', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'document_type', a.document_type,
        'document_title', d.title,
        'document_version', v.version,
        'document_hash', a.document_hash,
        'effective_date', v.effective_date,
        'accepted_at', a.accepted_at,
        'language', a.language,
        'acceptance_source', a.acceptance_source
      ) order by a.accepted_at), '[]'::jsonb)
      from public.customer_legal_acceptances a
      join public.legal_document_versions v on v.id = a.document_version_id
      join public.legal_documents d on d.id = v.document_id
      where a.customer_id = customer_record.id
        and a.restaurant_id = restaurant_record.id
        and v.restaurant_id = restaurant_record.id
        and d.restaurant_id = restaurant_record.id
    ),
    'consents', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'consent_type', consent_type,
        'status', status,
        'granted_at', granted_at,
        'withdrawn_at', withdrawn_at,
        'updated_at', updated_at
      ) order by consent_type), '[]'::jsonb)
      from public.customer_consents
      where customer_id = customer_record.id
        and restaurant_id = restaurant_record.id
    )
  );

  perform public.write_audit_event(
    restaurant_record.id,
    customer_record.id,
    'customer',
    customer_record.id,
    'DATA_EXPORT_CREATED',
    'success',
    'legal_center',
    'customers',
    customer_record.id,
    null,
    jsonb_build_object('restaurant_scoped', true)
  );
  return export_payload;
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
  if (select count(*) from public.legal_documents d
      join public.legal_document_versions v on v.id = d.current_published_version_id
      where d.restaurant_id = restaurant_record.id
        and d.document_type in ('participation_terms', 'privacy')
        and v.status = 'published') <> 2 then
    raise exception 'Rechtliche Informationen sind noch nicht verfügbar. Bitte versuche es später erneut.';
  end if;

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
    raise exception 'Teilnahmebedingungen und Datenschutzhinweis müssen bestätigt werden.';
  end if;
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  if (select count(*) from public.legal_documents d
      join public.legal_document_versions v on v.id = d.current_published_version_id
      where d.restaurant_id = restaurant_record.id
        and d.document_type in ('participation_terms', 'privacy')
        and v.status = 'published') <> 2 then
    raise exception 'Rechtliche Informationen sind noch nicht verfügbar. Bitte versuche es später erneut.';
  end if;

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

revoke execute on function public.get_public_legal_center(text, text) from public;
grant execute on function public.get_public_legal_center(text, text) to anon, authenticated;
revoke execute on function public.get_customer_data_export(text, text) from public;
grant execute on function public.get_customer_data_export(text, text) to anon, authenticated;
revoke execute on function public.register_restaurant_customer_legal(text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.register_restaurant_customer_legal(text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;
revoke execute on function public.register_referral_customer_legal(text, text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.register_referral_customer_legal(text, text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
