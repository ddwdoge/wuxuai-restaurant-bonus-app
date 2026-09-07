-- Phase 1 only: separate UI language from the tenant's legal jurisdiction.
-- No legal content is created or substituted by this migration.

create or replace function public.normalize_legal_country_code(input_country text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(trim(input_country), '') is null then null
    when upper(trim(input_country)) in ('AT', 'AUSTRIA', 'OESTERREICH', 'ÖSTERREICH') then 'AT'
    when trim(input_country) ~ '^[A-Za-z]{2}$' then upper(trim(input_country))
    else null
  end;
$$;

revoke all on function public.normalize_legal_country_code(text) from public, anon, authenticated;

create or replace function public.resolve_restaurant_legal_jurisdiction(input_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  legal_profile_record public.organization_legal_profiles%rowtype;
  resolved_country text;
  resolved_from text;
begin
  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id;

  if restaurant_record.id is null then
    return jsonb_build_object('status', 'unavailable', 'country', null, 'resolved_from', null);
  end if;

  select * into legal_profile_record
  from public.organization_legal_profiles
  where organization_id = restaurant_record.organization_id;

  if legal_profile_record.id is not null
     and legal_profile_record.registered_address_source = 'separate' then
    resolved_country := public.normalize_legal_country_code(legal_profile_record.country);
    resolved_from := 'organization_legal_profile';
  elsif legal_profile_record.id is not null
        and legal_profile_record.registered_address_source = 'restaurant' then
    select public.normalize_legal_country_code(branch.country)
      into resolved_country
    from public.branches branch
    where branch.restaurant_id = legal_profile_record.address_source_restaurant_id
    order by (branch.id = restaurant_record.primary_branch_id) desc, branch.created_at asc
    limit 1;
    resolved_from := 'registered_address_branch';
  end if;

  if resolved_country is null then
    select public.normalize_legal_country_code(branch.country)
      into resolved_country
    from public.branches branch
    where branch.restaurant_id = restaurant_record.id
    order by (branch.id = restaurant_record.primary_branch_id) desc, branch.created_at asc
    limit 1;
    resolved_from := case when resolved_country is null then null else 'primary_business_branch' end;
  end if;

  return jsonb_build_object(
    'status', case when resolved_country is null then 'unavailable' else 'available' end,
    'country', resolved_country,
    'resolved_from', resolved_from
  );
end;
$$;

revoke all on function public.resolve_restaurant_legal_jurisdiction(uuid) from public, anon, authenticated;

create table if not exists public.legal_document_version_jurisdictions (
  document_version_id uuid primary key
    references public.legal_document_versions(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  legal_country text not null check (legal_country ~ '^[A-Z]{2}$'),
  resolved_from text not null check (
    resolved_from in ('organization_legal_profile', 'registered_address_branch', 'primary_business_branch')
  ),
  created_at timestamptz not null default now()
);

alter table public.legal_document_version_jurisdictions enable row level security;
revoke all on public.legal_document_version_jurisdictions from public, anon, authenticated;

create or replace function public.prevent_legal_document_jurisdiction_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Legal document jurisdiction evidence is immutable';
end;
$$;

revoke all on function public.prevent_legal_document_jurisdiction_mutation() from public, anon, authenticated;

drop trigger if exists legal_document_jurisdiction_immutable
  on public.legal_document_version_jurisdictions;
create trigger legal_document_jurisdiction_immutable
before update or delete on public.legal_document_version_jurisdictions
for each row execute function public.prevent_legal_document_jurisdiction_mutation();

create or replace function public.attach_legal_document_version_jurisdiction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jurisdiction jsonb;
begin
  jurisdiction := public.resolve_restaurant_legal_jurisdiction(new.restaurant_id);

  if jurisdiction ->> 'status' = 'available' then
    insert into public.legal_document_version_jurisdictions (
      document_version_id, restaurant_id, legal_country, resolved_from
    ) values (
      new.id,
      new.restaurant_id,
      jurisdiction ->> 'country',
      jurisdiction ->> 'resolved_from'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.attach_legal_document_version_jurisdiction() from public, anon, authenticated;

drop trigger if exists legal_document_version_attach_jurisdiction
  on public.legal_document_versions;
create trigger legal_document_version_attach_jurisdiction
after insert on public.legal_document_versions
for each row execute function public.attach_legal_document_version_jurisdiction();

insert into public.legal_document_version_jurisdictions (
  document_version_id, restaurant_id, legal_country, resolved_from
)
select
  version.id,
  version.restaurant_id,
  jurisdiction.value ->> 'country',
  jurisdiction.value ->> 'resolved_from'
from public.legal_document_versions version
cross join lateral (
  select public.resolve_restaurant_legal_jurisdiction(version.restaurant_id) as value
) jurisdiction
where jurisdiction.value ->> 'status' = 'available'
on conflict (document_version_id) do nothing;

create or replace function public.get_platform_restaurant_legal_i18n_status(input_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  profile_record public.organization_legal_profiles%rowtype;
  jurisdiction jsonb;
  published_documents jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admin access required';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id;

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  select * into profile_record
  from public.organization_legal_profiles
  where organization_id = restaurant_record.organization_id;

  jurisdiction := public.resolve_restaurant_legal_jurisdiction(restaurant_record.id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_type', document.document_type,
    'version', version.version,
    'language', version.language,
    'effective_date', version.effective_date,
    'legal_country', version_jurisdiction.legal_country,
    'acceptance_count', (
      select count(*)
      from public.customer_legal_acceptances acceptance
      where acceptance.document_version_id = version.id
    )
  ) order by document.document_type), '[]'::jsonb)
  into published_documents
  from public.legal_documents document
  join public.legal_document_versions version
    on version.id = document.current_published_version_id
  left join public.legal_document_version_jurisdictions version_jurisdiction
    on version_jurisdiction.document_version_id = version.id
  where document.restaurant_id = restaurant_record.id;

  return jsonb_build_object(
    'restaurant_id', restaurant_record.id,
    'preferred_language', restaurant_record.language,
    'business_country', jurisdiction ->> 'country',
    'legal_jurisdiction_status', jurisdiction ->> 'status',
    'legal_jurisdiction', jurisdiction ->> 'country',
    'legal_jurisdiction_source', jurisdiction ->> 'resolved_from',
    'legal_review_status', profile_record.legal_review_status,
    'published_documents', published_documents
  );
end;
$$;

revoke all on function public.get_platform_restaurant_legal_i18n_status(uuid) from public, anon, authenticated;
grant execute on function public.get_platform_restaurant_legal_i18n_status(uuid) to authenticated;
