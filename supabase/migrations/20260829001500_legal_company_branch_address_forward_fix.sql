-- Forward repair for 20260829001000: the canonical V1 location address is
-- stored on branches, not restaurants. Keep the restaurant reference for
-- compatibility and add the explicit branch relationship used as the address
-- source. No legal profile or published document data is rewritten.

alter table public.organization_legal_profiles
  add column if not exists address_source_branch_id uuid
    references public.branches(id) on delete restrict;

alter table public.restaurant_legal_profiles
  add column if not exists address_source_branch_id uuid
    references public.branches(id) on delete restrict;

update public.organization_legal_profiles op
set address_source_branch_id = b.id
from public.restaurants r
join public.branches b on b.restaurant_id = r.id
where op.registered_address_source = 'restaurant'
  and op.address_source_restaurant_id = r.id
  and b.organization_id = op.organization_id
  and op.address_source_branch_id is null;

update public.restaurant_legal_profiles p
set address_source_branch_id = b.id
from public.branches b
where p.registered_address_source = 'restaurant'
  and p.address_source_restaurant_id = b.restaurant_id
  and p.address_source_branch_id is null;

alter table public.organization_legal_profiles
  drop constraint if exists organization_legal_profile_address_source_valid;

alter table public.organization_legal_profiles
  add constraint organization_legal_profile_address_source_valid check (
    (
      registered_address_source = 'restaurant'
      and address_source_restaurant_id is not null
      and address_source_branch_id is not null
      and street is null
      and postal_code is null
      and city is null
      and country is null
    )
    or (
      registered_address_source = 'separate'
      and address_source_restaurant_id is null
      and address_source_branch_id is null
      and nullif(trim(street), '') is not null
      and nullif(trim(postal_code), '') is not null
      and nullif(trim(city), '') is not null
      and nullif(trim(country), '') is not null
    )
  );

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
  branch_record public.branches%rowtype;
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

  select * into branch_record
  from public.branches b
  where b.restaurant_id = restaurant_record.id
    and b.organization_id = restaurant_record.organization_id
  order by (b.id = restaurant_record.primary_branch_id) desc, b.created_at asc
  limit 1;

  use_restaurant_address := lower(coalesce(
    profile_value->>'registered_address_matches_restaurant',
    case when profile_value->>'registered_address_source' = 'restaurant' then 'true' else 'false' end
  )) in ('true', 't', '1', 'yes', 'ja');

  if use_restaurant_address then
    resolved_street := nullif(trim(branch_record.address), '');
    resolved_postal_code := nullif(trim(branch_record.postal_code), '');
    resolved_city := nullif(trim(branch_record.city), '');
    resolved_country := nullif(trim(branch_record.country), '');

    if branch_record.id is null
        or resolved_street is null
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
    'address_source_branch_id', case when use_restaurant_address then branch_record.id else null end,
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
    address_source_restaurant_id, address_source_branch_id,
    street, postal_code, city, country, email, phone,
    commercial_register_number, commercial_register_court, vat_id,
    chamber_membership, supervisory_authority, complaint_contact,
    accessibility_contact, responsible_person, legal_review_status,
    updated_at, updated_by
  ) values (
    restaurant_record.organization_id,
    profile_value->>'company_name',
    profile_value->>'legal_form',
    case when use_restaurant_address then 'restaurant' else 'separate' end,
    case when use_restaurant_address then restaurant_record.id else null end,
    case when use_restaurant_address then branch_record.id else null end,
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
    address_source_branch_id = excluded.address_source_branch_id,
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
    address_source_branch_id, street, postal_code, city, country, email, phone,
    commercial_register_number, commercial_register_court, vat_id,
    chamber_membership, supervisory_authority, complaint_contact,
    accessibility_contact, responsible_person, restaurant_operator,
    legal_review_status, updated_at, updated_by
  ) values (
    input_restaurant_id, operator_profile_record.id,
    operator_profile_record.company_name, operator_profile_record.legal_form,
    operator_profile_record.registered_address_source,
    operator_profile_record.address_source_restaurant_id,
    operator_profile_record.address_source_branch_id,
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
    address_source_branch_id = excluded.address_source_branch_id,
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

notify pgrst, 'reload schema';
