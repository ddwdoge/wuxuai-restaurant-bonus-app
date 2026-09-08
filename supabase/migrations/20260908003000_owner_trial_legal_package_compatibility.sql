-- Keep the existing Staging trial legal-package contract compatible with BASIC.
create or replace function public.generate_restaurant_legal_package(
  input_restaurant_id uuid,
  input_profile jsonb,
  input_reacceptance_required boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  loyalty_record public.loyalty_settings%rowtype;
  template_record public.legal_master_templates%rowtype;
  document_id_value uuid;
  version_id_value uuid;
  version_value text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  profile_value jsonb;
  previous_profile jsonb := '{}'::jsonb;
  changed_profile_fields text[] := '{}'::text[];
  content_value jsonb;
  rendered_value text;
  hash_value text;
  is_trial_context boolean := false;
  is_austria boolean := false;
  publication_status text;
  legal_ready_value boolean := false;
  selected_template_count integer := 0;
  field_name text;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'LEGAL_PROFILE_NOT_AUTHORIZED';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for update;

  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'LEGAL_PROFILE_RESTAURANT_NOT_FOUND';
  end if;

  select * into loyalty_record
  from public.loyalty_settings
  where restaurant_id = input_restaurant_id;

  select coalesce(to_jsonb(p), '{}'::jsonb)
  into previous_profile
  from public.organization_legal_profiles p
  where p.organization_id = restaurant_record.organization_id;

  previous_profile := coalesce(previous_profile, '{}'::jsonb);
  profile_value := coalesce(input_profile, '{}'::jsonb);

  select exists (
    select 1
    from public.branches b
    join public.branch_subscriptions s on s.branch_id = b.id
    where b.restaurant_id = input_restaurant_id
      and (
        s.plan_key = 'pilot'
        or (s.plan_key = 'BASIC' and s.status = 'trialing')
      )
  ) into is_trial_context;

  select count(distinct document_type)
  into selected_template_count
  from public.legal_master_templates
  where active
    and language = 'de-AT'
    and (is_trial_context or review_status = 'REVIEWED');

  if selected_template_count < 5 then
    raise exception using errcode = 'P0001', message = 'LEGAL_MASTER_PACKAGE_UNAVAILABLE';
  end if;

  profile_value := public.upsert_organization_legal_profile(
    input_restaurant_id,
    profile_value
  );

  is_austria := lower(trim(profile_value->>'country')) in (
    'at', 'austria', 'osterreich', 'oesterreich', 'österreich'
  );

  foreach field_name in array array[
    'company_name', 'legal_form', 'commercial_register_number', 'vat_id',
    'responsible_person', 'registered_address_source', 'street', 'postal_code',
    'city', 'country'
  ] loop
    if coalesce(previous_profile->>field_name, '') is distinct from coalesce(profile_value->>field_name, '') then
      changed_profile_fields := array_append(changed_profile_fields, field_name);
    end if;
  end loop;

  for template_record in
    select distinct on (document_type) *
    from public.legal_master_templates
    where active
      and language = 'de-AT'
      and (is_trial_context or review_status = 'REVIEWED')
    order by document_type, created_at desc
  loop
    publication_status := 'draft';

    content_value := template_record.content_template
      || jsonb_build_object(
        'program_operator_name', profile_value->>'company_name',
        'program_operator_legal_form', profile_value->>'legal_form',
        'program_operator_address', concat_ws(', ',
          profile_value->>'street',
          concat_ws(' ', profile_value->>'postal_code', profile_value->>'city'),
          profile_value->>'country'
        ),
        'company_registration_number', nullif(trim(profile_value->>'commercial_register_number'), ''),
        'vat_id', nullif(trim(profile_value->>'vat_id'), ''),
        'authorized_representative', nullif(trim(profile_value->>'responsible_person'), ''),
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
        case when nullif(trim(profile_value->>'responsible_person'), '') is not null
          then 'Vertretungsberechtigt: ' || trim(profile_value->>'responsible_person') end,
        case when nullif(trim(profile_value->>'commercial_register_number'), '') is not null
          then (case when is_austria then 'Firmenbuchnummer: ' else 'Unternehmensregistrierungsnummer: ' end)
            || trim(profile_value->>'commercial_register_number') end,
        case when nullif(trim(profile_value->>'vat_id'), '') is not null
          then 'Umsatzsteuer-ID: ' || trim(profile_value->>'vat_id') end,
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
      'publication_mode', case when is_trial_context then 'trial' else 'production' end,
      'published', false,
      'reacceptance_required', input_reacceptance_required,
      'changed_profile_fields', to_jsonb(changed_profile_fields)
    )
  );

  return public.get_restaurant_legal_setup(input_restaurant_id);
end;
$$;

revoke execute on function public.generate_restaurant_legal_package(uuid, jsonb, boolean)
  from public, anon;
grant execute on function public.generate_restaurant_legal_package(uuid, jsonb, boolean)
  to authenticated;

comment on function public.generate_restaurant_legal_package(uuid, jsonb, boolean) is
  'Owner-only legal package generation; legacy pilot and BASIC trial subscriptions share the existing pre-commercial template contract.';
