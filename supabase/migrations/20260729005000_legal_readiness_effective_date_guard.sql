-- Legal readiness is tenant-scoped and only current published versions count.
-- Test templates remain explicitly subject to independent legal review.

revoke execute on function public.ensure_restaurant_legal_templates(uuid)
  from public, anon, authenticated;

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
    from public.restaurant_legal_profiles p
    where p.restaurant_id = input_restaurant_id
      and nullif(trim(p.company_name), '') is not null
      and nullif(trim(p.legal_form), '') is not null
      and nullif(trim(p.street), '') is not null
      and nullif(trim(p.postal_code), '') is not null
      and nullif(trim(p.city), '') is not null
      and nullif(trim(p.country), '') is not null
      and nullif(trim(p.email), '') is not null
      and nullif(trim(coalesce(p.complaint_contact, p.email)), '') is not null
  ) and count(distinct d.document_type) = 2
  from public.legal_documents d
  join public.legal_document_versions v
    on v.id = d.current_published_version_id
   and v.restaurant_id = d.restaurant_id
  where d.restaurant_id = input_restaurant_id
    and d.document_type in ('participation_terms', 'privacy')
    and v.status = 'published'
    and v.effective_date <= input_as_of;
$$;

revoke execute on function public.restaurant_legal_bundle_is_current(uuid, date)
  from public, anon, authenticated;

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
    and public.restaurant_legal_bundle_is_current(restaurant_record.id, current_date);

  if nullif(trim(coalesce(input_customer_token, '')), '') is not null then
    customer_id_value := public.resolve_customer_from_public_token(
      restaurant_record.id,
      input_customer_token
    );
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
      'status', v.status,
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
     and v.restaurant_id = d.restaurant_id
    where d.restaurant_id = restaurant_record.id
      and v.status = 'published'
      and v.effective_date <= current_date;
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
    'restaurant', jsonb_build_object(
      'name', restaurant_record.name,
      'slug', restaurant_record.slug
    ),
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
        join public.legal_document_versions v
          on v.id = d.current_published_version_id
         and v.restaurant_id = d.restaurant_id
        where d.restaurant_id = restaurant_record.id
          and d.document_type = 'participation_terms'
          and v.status = 'published'
          and v.effective_date <= current_date
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

create or replace function public.register_restaurant_customer_legal(
  input_restaurant_slug text, input_first_name text, input_phone text,
  input_birthday date, input_device_id text, input_terms_accepted boolean,
  input_privacy_acknowledged boolean, input_marketing_push boolean default false,
  input_marketing_sms boolean default false, input_marketing_email boolean default false,
  input_birthday_processing boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result_payload jsonb;
  guard_payload jsonb;
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
  if not public.restaurant_legal_bundle_is_current(restaurant_record.id, current_date) then
    raise exception 'Rechtliche Informationen sind noch nicht verfügbar. Bitte versuche es später erneut.';
  end if;
  guard_payload := public.prepare_customer_registration(input_restaurant_slug, input_phone, 'customer_registration');
  if not coalesce((guard_payload->>'allowed')::boolean, false) then
    return jsonb_build_object('success', false, 'error_code', guard_payload->>'error_code',
      'error_message', guard_payload->>'error_message');
  end if;
  perform set_config('wuxuai.customer_identity_change', 'on', true);
  result_payload := public.register_restaurant_customer(input_restaurant_slug, input_first_name,
    guard_payload->>'normalized_phone', case when input_birthday_processing then input_birthday else null end,
    input_device_id);
  customer_token_value := result_payload #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, customer_token_value);
  perform public.record_customer_legal_state(restaurant_record.id, customer_id_value, 'customer_registration',
    input_terms_accepted, input_privacy_acknowledged, input_marketing_push, false,
    input_marketing_email, input_birthday_processing);
  if input_birthday_processing and input_birthday is not null then
    update public.customers set birthday_day = extract(day from input_birthday)::integer,
      birthday_month = extract(month from input_birthday)::integer, birthday_updated_at = now()
    where id = customer_id_value;
  end if;
  return result_payload || jsonb_build_object('success', true);
end;
$$;

create or replace function public.register_referral_customer_legal(
  input_restaurant_slug text, input_referral_token text, input_first_name text,
  input_phone text, input_birthday date, input_device_id text,
  input_terms_accepted boolean, input_privacy_acknowledged boolean,
  input_marketing_push boolean default false, input_marketing_sms boolean default false,
  input_marketing_email boolean default false, input_birthday_processing boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result_payload jsonb;
  guard_payload jsonb;
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
  if not public.restaurant_legal_bundle_is_current(restaurant_record.id, current_date) then
    raise exception 'Rechtliche Informationen sind noch nicht verfügbar. Bitte versuche es später erneut.';
  end if;
  guard_payload := public.prepare_customer_registration(input_restaurant_slug, input_phone, 'referral_registration');
  if not coalesce((guard_payload->>'allowed')::boolean, false) then
    return jsonb_build_object('success', false, 'error_code', guard_payload->>'error_code',
      'error_message', guard_payload->>'error_message');
  end if;
  perform set_config('wuxuai.customer_identity_change', 'on', true);
  result_payload := public.register_referral_customer(input_restaurant_slug, input_referral_token,
    input_first_name, guard_payload->>'normalized_phone',
    case when input_birthday_processing then input_birthday else null end, input_device_id);
  customer_token_value := result_payload #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, customer_token_value);
  perform public.record_customer_legal_state(restaurant_record.id, customer_id_value, 'referral_registration',
    input_terms_accepted, input_privacy_acknowledged, input_marketing_push, false,
    input_marketing_email, input_birthday_processing);
  if input_birthday_processing and input_birthday is not null then
    update public.customers set birthday_day = extract(day from input_birthday)::integer,
      birthday_month = extract(month from input_birthday)::integer, birthday_updated_at = now()
    where id = customer_id_value;
  end if;
  return result_payload || jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.get_public_legal_center(text, text) from public;
grant execute on function public.get_public_legal_center(text, text) to anon, authenticated;
revoke execute on function public.register_restaurant_customer_legal(text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.register_restaurant_customer_legal(text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;
revoke execute on function public.register_referral_customer_legal(text, text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.register_referral_customer_legal(text, text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;

comment on function public.restaurant_legal_bundle_is_current(uuid, date) is
  'Internal tenant-scoped gate: both mandatory legal documents must be published and effective.';
