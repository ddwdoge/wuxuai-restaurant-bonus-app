-- Additive forward fix: keep FN/UID optional and move the canonical legal
-- operator identity to the existing organization tier. Restaurant legal
-- profiles remain an explicitly linked compatibility projection for existing
-- document and readiness contracts. Published versions stay immutable.

create table if not exists public.organization_legal_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  company_name text not null,
  legal_form text not null,
  registered_address_source text not null default 'separate'
    check (registered_address_source in ('restaurant', 'separate')),
  address_source_restaurant_id uuid references public.restaurants(id) on delete restrict,
  street text,
  postal_code text,
  city text,
  country text,
  email text not null,
  phone text,
  commercial_register_number text,
  commercial_register_court text,
  vat_id text,
  chamber_membership text,
  supervisory_authority text,
  complaint_contact text,
  accessibility_contact text,
  responsible_person text,
  legal_review_status text not null default 'required'
    check (legal_review_status in ('required', 'in_review', 'reviewed')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint organization_legal_profile_address_source_valid check (
    (
      registered_address_source = 'restaurant'
      and address_source_restaurant_id is not null
      and street is null
      and postal_code is null
      and city is null
      and country is null
    )
    or (
      registered_address_source = 'separate'
      and address_source_restaurant_id is null
      and nullif(trim(street), '') is not null
      and nullif(trim(postal_code), '') is not null
      and nullif(trim(city), '') is not null
      and nullif(trim(country), '') is not null
    )
  )
);

alter table public.organization_legal_profiles enable row level security;

drop policy if exists organization_legal_profiles_admin_select
  on public.organization_legal_profiles;
create policy organization_legal_profiles_admin_select
on public.organization_legal_profiles
for select to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = organization_legal_profiles.organization_id
      and (
        o.owner_id = auth.uid()
        or exists (
          select 1
          from public.restaurants r
          join public.restaurant_members rm on rm.restaurant_id = r.id
          where r.organization_id = o.id
            and rm.user_id = auth.uid()
            and rm.role in ('owner', 'admin', 'manager')
        )
      )
  )
);

revoke all on public.organization_legal_profiles from public, anon, authenticated;
grant select on public.organization_legal_profiles to authenticated;

alter table public.restaurant_legal_profiles
  add column if not exists operator_profile_id uuid
    references public.organization_legal_profiles(id) on delete restrict,
  add column if not exists registered_address_source text not null default 'separate'
    check (registered_address_source in ('restaurant', 'separate')),
  add column if not exists address_source_restaurant_id uuid
    references public.restaurants(id) on delete restrict;

insert into public.organization_legal_profiles (
  organization_id, company_name, legal_form, registered_address_source,
  street, postal_code, city, country, email, phone,
  commercial_register_number, commercial_register_court, vat_id,
  chamber_membership, supervisory_authority, complaint_contact,
  accessibility_contact, responsible_person, legal_review_status,
  updated_at, updated_by
)
select distinct on (r.organization_id)
  r.organization_id,
  p.company_name,
  p.legal_form,
  'separate',
  p.street,
  p.postal_code,
  p.city,
  p.country,
  p.email,
  p.phone,
  nullif(trim(p.commercial_register_number), ''),
  nullif(trim(p.commercial_register_court), ''),
  nullif(trim(p.vat_id), ''),
  p.chamber_membership,
  p.supervisory_authority,
  nullif(trim(p.complaint_contact), ''),
  p.accessibility_contact,
  p.responsible_person,
  p.legal_review_status,
  p.updated_at,
  p.updated_by
from public.restaurant_legal_profiles p
join public.restaurants r on r.id = p.restaurant_id
where r.organization_id is not null
  and nullif(trim(p.company_name), '') is not null
  and nullif(trim(p.legal_form), '') is not null
  and nullif(trim(p.street), '') is not null
  and nullif(trim(p.postal_code), '') is not null
  and nullif(trim(p.city), '') is not null
  and nullif(trim(p.country), '') is not null
  and nullif(trim(p.email), '') is not null
order by r.organization_id, p.updated_at desc
on conflict (organization_id) do nothing;

update public.restaurant_legal_profiles p
set operator_profile_id = op.id
from public.restaurants r
join public.organization_legal_profiles op on op.organization_id = r.organization_id
where r.id = p.restaurant_id
  and p.operator_profile_id is null;

create index if not exists restaurant_legal_profiles_operator_profile_idx
on public.restaurant_legal_profiles (operator_profile_id);

create or replace function public.upsert_organization_legal_profile(
  input_restaurant_id uuid,
  input_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  operator_profile_record public.organization_legal_profiles%rowtype;
  profile_value jsonb := coalesce(input_profile, '{}'::jsonb);
  use_restaurant_address boolean := false;
  resolved_street text;
  resolved_postal_code text;
  resolved_city text;
  resolved_country text;
  is_austria boolean := false;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'LEGAL_PROFILE_NOT_AUTHORIZED';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for update;

  if restaurant_record.id is null or restaurant_record.organization_id is null then
    raise exception using errcode = 'P0001', message = 'LEGAL_OPERATOR_ORGANIZATION_MISSING';
  end if;

  use_restaurant_address := lower(coalesce(
    profile_value->>'registered_address_matches_restaurant',
    case when profile_value->>'registered_address_source' = 'restaurant' then 'true' else 'false' end
  ))
    in ('true', 't', '1', 'yes', 'ja');

  if use_restaurant_address then
    resolved_street := nullif(trim(restaurant_record.address), '');
    resolved_postal_code := nullif(trim(restaurant_record.postal_code), '');
    resolved_city := nullif(trim(restaurant_record.city), '');
    resolved_country := nullif(trim(restaurant_record.country), '');

    if resolved_street is null
        or resolved_postal_code is null
        or resolved_city is null
        or resolved_country is null then
      raise exception using errcode = 'P0001', message = 'LEGAL_RESTAURANT_ADDRESS_INCOMPLETE';
    end if;
  else
    resolved_street := nullif(trim(profile_value->>'street'), '');
    resolved_postal_code := nullif(trim(profile_value->>'postal_code'), '');
    resolved_city := nullif(trim(profile_value->>'city'), '');
    resolved_country := nullif(trim(profile_value->>'country'), '');
  end if;

  profile_value := profile_value || jsonb_build_object(
    'company_name', nullif(trim(profile_value->>'company_name'), ''),
    'legal_form', nullif(trim(profile_value->>'legal_form'), ''),
    'street', resolved_street,
    'postal_code', resolved_postal_code,
    'city', resolved_city,
    'country', resolved_country,
    'email', nullif(trim(profile_value->>'email'), ''),
    'complaint_contact', coalesce(
      nullif(trim(profile_value->>'complaint_contact'), ''),
      nullif(trim(profile_value->>'email'), '')
    ),
    'registered_address_matches_restaurant', use_restaurant_address,
    'registered_address_source', case when use_restaurant_address then 'restaurant' else 'separate' end,
    'address_source_restaurant_id', case when use_restaurant_address then restaurant_record.id else null end,
    'organization_id', restaurant_record.organization_id
  );

  if profile_value->>'company_name' is null
      or profile_value->>'legal_form' is null
      or resolved_street is null
      or resolved_postal_code is null
      or resolved_city is null
      or resolved_country is null
      or profile_value->>'email' is null then
    raise exception using errcode = 'P0001', message = 'LEGAL_PROFILE_REQUIRED_FIELDS_MISSING';
  end if;

  is_austria := lower(resolved_country) in (
    'at', 'austria', 'osterreich', 'oesterreich', 'österreich'
  );

  if is_austria and coalesce(profile_value->>'commercial_register_number', '')
      ~* '^FN\s*[0-9]{1,7}\s*[A-Z]$' then
    profile_value := jsonb_set(
      profile_value,
      '{commercial_register_number}',
      to_jsonb(
        'FN '
        || substring(upper(profile_value->>'commercial_register_number') from '[0-9]{1,7}')
        || ' '
        || lower(substring(upper(profile_value->>'commercial_register_number') from '([A-Z])\s*$'))
      )
    );
  end if;

  if is_austria and nullif(trim(profile_value->>'vat_id'), '') is not null then
    profile_value := jsonb_set(
      profile_value,
      '{vat_id}',
      to_jsonb(upper(regexp_replace(profile_value->>'vat_id', '[\s.\-]+', '', 'g')))
    );
  end if;

  insert into public.organization_legal_profiles (
    organization_id, company_name, legal_form, registered_address_source,
    address_source_restaurant_id, street, postal_code, city, country,
    email, phone, commercial_register_number, commercial_register_court,
    vat_id, chamber_membership, supervisory_authority, complaint_contact,
    accessibility_contact, responsible_person, legal_review_status,
    updated_at, updated_by
  ) values (
    restaurant_record.organization_id,
    profile_value->>'company_name',
    profile_value->>'legal_form',
    case when use_restaurant_address then 'restaurant' else 'separate' end,
    case when use_restaurant_address then restaurant_record.id else null end,
    case when use_restaurant_address then null else resolved_street end,
    case when use_restaurant_address then null else resolved_postal_code end,
    case when use_restaurant_address then null else resolved_city end,
    case when use_restaurant_address then null else resolved_country end,
    profile_value->>'email',
    nullif(trim(profile_value->>'phone'), ''),
    nullif(trim(profile_value->>'commercial_register_number'), ''),
    nullif(trim(profile_value->>'commercial_register_court'), ''),
    nullif(trim(profile_value->>'vat_id'), ''),
    nullif(trim(profile_value->>'chamber_membership'), ''),
    nullif(trim(profile_value->>'supervisory_authority'), ''),
    nullif(trim(profile_value->>'complaint_contact'), ''),
    nullif(trim(profile_value->>'accessibility_contact'), ''),
    nullif(trim(profile_value->>'responsible_person'), ''),
    'required',
    now(),
    auth.uid()
  )
  on conflict (organization_id) do update set
    company_name = excluded.company_name,
    legal_form = excluded.legal_form,
    registered_address_source = excluded.registered_address_source,
    address_source_restaurant_id = excluded.address_source_restaurant_id,
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
    updated_at = now(),
    updated_by = auth.uid()
  returning * into operator_profile_record;

  insert into public.restaurant_legal_profiles (
    restaurant_id, operator_profile_id, company_name, legal_form,
    registered_address_source, address_source_restaurant_id,
    street, postal_code, city, country, email, phone,
    commercial_register_number, commercial_register_court, vat_id,
    chamber_membership, supervisory_authority, complaint_contact,
    accessibility_contact, responsible_person, restaurant_operator,
    legal_review_status, updated_at, updated_by
  ) values (
    input_restaurant_id, operator_profile_record.id,
    operator_profile_record.company_name, operator_profile_record.legal_form,
    operator_profile_record.registered_address_source,
    operator_profile_record.address_source_restaurant_id,
    resolved_street, resolved_postal_code, resolved_city, resolved_country,
    operator_profile_record.email, operator_profile_record.phone,
    coalesce(operator_profile_record.commercial_register_number, ''),
    coalesce(operator_profile_record.commercial_register_court, ''),
    coalesce(operator_profile_record.vat_id, ''),
    operator_profile_record.chamber_membership,
    operator_profile_record.supervisory_authority,
    coalesce(operator_profile_record.complaint_contact, operator_profile_record.email),
    operator_profile_record.accessibility_contact,
    operator_profile_record.responsible_person,
    operator_profile_record.company_name,
    operator_profile_record.legal_review_status,
    now(), auth.uid()
  )
  on conflict (restaurant_id) do update set
    operator_profile_id = excluded.operator_profile_id,
    company_name = excluded.company_name,
    legal_form = excluded.legal_form,
    registered_address_source = excluded.registered_address_source,
    address_source_restaurant_id = excluded.address_source_restaurant_id,
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
    legal_review_status = excluded.legal_review_status,
    updated_at = now(),
    updated_by = auth.uid();

  return profile_value || jsonb_build_object(
    'id', operator_profile_record.id,
    'operator_profile_id', operator_profile_record.id
  );
end;
$$;

revoke execute on function public.upsert_organization_legal_profile(uuid, jsonb)
  from public, anon, authenticated;

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
  is_pilot boolean := false;
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
      and s.plan_key = 'pilot'
  ) into is_pilot;

  select count(distinct document_type)
  into selected_template_count
  from public.legal_master_templates
  where active
    and language = 'de-AT'
    and (is_pilot or review_status = 'REVIEWED');

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
      and (is_pilot or review_status = 'REVIEWED')
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
      'publication_mode', case when is_pilot then 'pilot' else 'production' end,
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
  'Owner-only organization legal operator upsert and immutable restaurant document draft generation; optional registration and VAT identifiers never gate onboarding.';

create or replace function public.restaurant_legal_bundle_is_current(
  input_restaurant_id uuid,
  input_as_of date default current_date
)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.restaurants r
    join public.restaurant_legal_profiles p on p.restaurant_id = r.id
    join public.organization_legal_profiles op on op.id = p.operator_profile_id
      and op.organization_id = r.organization_id
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
set search_path = public, pg_temp
stable
as $$
declare
  restaurant_record public.restaurants%rowtype;
  profile_record public.restaurant_legal_profiles%rowtype;
  operator_link_valid boolean := false;
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

  select exists (
    select 1
    from public.organization_legal_profiles op
    where op.id = profile_record.operator_profile_id
      and op.organization_id = restaurant_record.organization_id
  ) into operator_link_valid;

  if not operator_link_valid then missing_fields := array_append(missing_fields, 'Betreiberdaten'); end if;
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
    and operator_link_valid
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

-- The historical all-in-one editor writes the restaurant projection directly
-- and would bypass the canonical organization operator. The current Owner UI
-- uses generate_restaurant_legal_package instead.
revoke execute on function public.save_restaurant_legal_setup(
  uuid, jsonb, jsonb, text, date, boolean
) from authenticated;

create or replace function public.get_public_legal_center(
  input_restaurant_slug text,
  input_customer_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
    and profile_record.operator_profile_id is not null
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
      'program_operator', profile_record.company_name,
      'platform_provider', 'WUXUAI',
      'notice', 'Bonusprogramm angeboten durch: '
        || profile_record.company_name
        || '. Technisch bereitgestellt durch WUXUAI.'
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

revoke execute on function public.get_public_legal_center(text, text) from public;
grant execute on function public.get_public_legal_center(text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
