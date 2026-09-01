-- Publish the initial legal package and activate the existing restaurant atomically.
-- This is additive and keeps all tenant and RLS boundaries unchanged.

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
      and new.created_at = old.created_at
      and new.created_by is not distinct from old.created_by
      and new.master_template_id is not distinct from old.master_template_id then
    return new;
  end if;

  raise exception 'Veröffentlichte Rechtsdokumente sind unveränderlich. Bitte eine neue Version erstellen.';
end;
$$;

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
set search_path = public, extensions
as $$
declare
  draft_record record;
  draft_count integer := 0;
  invalid_draft_count integer := 0;
  mandatory_draft_count integer := 0;
  mandatory_published_count integer := 0;
  published_count integer := 0;
  request_id_value uuid := coalesce(input_request_id, extensions.gen_random_uuid());
  legal_ready_value boolean;
  initial_package_value boolean := false;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'LEGAL_PUBLICATION_NOT_AUTHORIZED';
  end if;
  if not input_confirmed then
    raise exception using errcode = 'P0001', message = 'LEGAL_PUBLICATION_CONFIRMATION_REQUIRED';
  end if;
  if input_effective_date is null then
    raise exception using errcode = '22004', message = 'LEGAL_EFFECTIVE_DATE_REQUIRED';
  end if;

  select
    count(*),
    count(*) filter (
      where v.master_template_id is null
        or nullif(trim(v.document_hash), '') is null
        or jsonb_typeof(v.content) is distinct from 'object'
        or v.content = '{}'::jsonb
        or nullif(trim(v.rendered_text), '') is null
    ),
    count(distinct d.document_type) filter (
      where d.document_type in ('participation_terms', 'privacy')
    )
  into draft_count, invalid_draft_count, mandatory_draft_count
  from public.legal_document_versions v
  join public.legal_documents d
    on d.id = v.document_id
   and d.restaurant_id = v.restaurant_id
  where v.restaurant_id = input_restaurant_id
    and v.status = 'draft'
    and not exists (
      select 1
      from public.legal_document_versions newer
      where newer.document_id = v.document_id
        and newer.restaurant_id = v.restaurant_id
        and newer.status = 'draft'
        and newer.created_at > v.created_at
    );

  if draft_count = 0 then
    select count(distinct d.document_type)
    into mandatory_published_count
    from public.legal_documents d
    join public.legal_document_versions v
      on v.id = d.current_published_version_id
     and v.document_id = d.id
     and v.restaurant_id = d.restaurant_id
    where d.restaurant_id = input_restaurant_id
      and d.document_type in ('participation_terms', 'privacy')
      and v.status = 'published'
      and v.effective_date <= input_effective_date
      and v.master_template_id is not null;

    if mandatory_published_count = 2 then
      return public.get_restaurant_legal_setup(input_restaurant_id);
    end if;
    raise exception using errcode = 'P0001', message = 'LEGAL_DRAFTS_MISSING';
  end if;
  if invalid_draft_count > 0 then
    raise exception using errcode = 'P0001', message = 'LEGAL_DRAFT_INVALID';
  end if;
  if mandatory_draft_count <> 2 then
    raise exception using errcode = 'P0001', message = 'LEGAL_REQUIRED_DOCUMENTS_MISSING';
  end if;

  select not exists (
    select 1
    from public.legal_document_versions v
    where v.restaurant_id = input_restaurant_id
      and v.status = 'published'
  ) into initial_package_value;

  for draft_record in
    select distinct on (v.document_id) v.*
    from public.legal_document_versions v
    where v.restaurant_id = input_restaurant_id
      and v.status = 'draft'
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
    where id = draft_record.document_id
      and restaurant_id = input_restaurant_id;

    published_count := published_count + 1;
  end loop;

  legal_ready_value := public.restaurant_legal_bundle_is_current(
    input_restaurant_id,
    input_effective_date
  );

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
      'reacceptance_required', input_reacceptance_required,
      'initial_package', initial_package_value
    )
  );

  return public.get_restaurant_legal_setup(input_restaurant_id);
end;
$$;

revoke execute on function public.publish_restaurant_legal_drafts(uuid, date, boolean, boolean, uuid)
  from public, anon;
grant execute on function public.publish_restaurant_legal_drafts(uuid, date, boolean, boolean, uuid)
  to authenticated;

create or replace function public.complete_restaurant_onboarding(
  input_restaurant_id uuid,
  input_profile jsonb,
  input_activation jsonb,
  input_publication_confirmed boolean default false,
  input_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  restaurant_record public.restaurants%rowtype;
  effective_date_value date := (clock_timestamp() at time zone 'Europe/Vienna')::date;
  request_id_value uuid := coalesce(input_request_id, extensions.gen_random_uuid());
  legal_ready_value boolean := false;
  readiness_value jsonb;
  published_count integer := 0;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'ONBOARDING_NOT_AUTHORIZED';
  end if;
  if not input_publication_confirmed then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_PUBLICATION_CONFIRMATION_REQUIRED';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for update;

  if restaurant_record.id is null then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_RESTAURANT_NOT_FOUND';
  end if;

  if restaurant_record.status = 'active'
      and restaurant_record.onboarding_status = 'completed'
      and public.restaurant_legal_bundle_is_current(input_restaurant_id, effective_date_value) then
    return jsonb_build_object(
      'restaurant', to_jsonb(restaurant_record),
      'legal', public.get_restaurant_legal_setup(input_restaurant_id),
      'already_completed', true
    );
  end if;

  if nullif(trim(input_activation->>'name'), '') is null
      or nullif(trim(input_activation->>'restaurant_type'), '') is null
      or nullif(trim(input_activation->>'language'), '') is null
      or jsonb_typeof(input_activation->'opening_hours') is distinct from 'object'
      or jsonb_typeof(input_activation->'special_days') is distinct from 'array'
      or jsonb_typeof(input_activation->'holidays') is distinct from 'array'
      or jsonb_typeof(input_activation->'onboarding_checklist') is distinct from 'object' then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_ACTIVATION_DATA_INCOMPLETE';
  end if;

  perform public.generate_restaurant_legal_package(
    input_restaurant_id,
    input_profile,
    false
  );

  perform public.publish_restaurant_legal_drafts(
    input_restaurant_id,
    effective_date_value,
    false,
    true,
    request_id_value
  );

  select count(distinct d.document_type) into published_count
  from public.legal_documents d
  join public.legal_document_versions v
    on v.id = d.current_published_version_id
   and v.document_id = d.id
   and v.restaurant_id = d.restaurant_id
  where d.restaurant_id = input_restaurant_id
    and v.status = 'published'
    and v.effective_date <= effective_date_value
    and v.master_template_id is not null;

  if published_count < 2 then
    raise exception using errcode = 'P0001', message = 'ONBOARDING_LEGAL_PACKAGE_INCOMPLETE';
  end if;

  update public.restaurants
  set name = trim(input_activation->>'name'),
      status = 'active',
      restaurant_type = trim(input_activation->>'restaurant_type'),
      language = trim(input_activation->>'language'),
      opening_hours = input_activation->'opening_hours',
      special_days = input_activation->'special_days',
      holidays = input_activation->'holidays',
      smart_open_enabled = coalesce((input_activation->>'smart_open_enabled')::boolean, true),
      onboarding_status = 'completed',
      onboarding_checklist = input_activation->'onboarding_checklist',
      operational_ready = true,
      security_ready = true,
      legal_update_required_at = null
  where id = input_restaurant_id
  returning * into restaurant_record;

  legal_ready_value := public.restaurant_legal_bundle_is_current(
    input_restaurant_id,
    effective_date_value
  );

  update public.restaurants
  set legal_ready = legal_ready_value
  where id = input_restaurant_id
  returning * into restaurant_record;

  readiness_value := public.restaurant_registration_readiness(
    input_restaurant_id,
    effective_date_value
  );

  if not legal_ready_value
      or coalesce((readiness_value->>'registration_allowed')::boolean, false) is not true then
    raise exception using
      errcode = 'P0001',
      message = 'ONBOARDING_LEGAL_READINESS_FAILED',
      detail = coalesce(readiness_value->>'label', 'Kundenregistrierung ist nicht freigegeben.');
  end if;

  perform public.write_audit_event(
    input_restaurant_id, null, 'admin', auth.uid(),
    'RESTAURANT_ONBOARDING_COMPLETED', 'success', 'restaurant_onboarding',
    'restaurants', input_restaurant_id, request_id_value,
    jsonb_build_object(
      'effective_date', effective_date_value,
      'published_versions', published_count,
      'legal_ready', legal_ready_value,
      'registration_allowed', true
    )
  );

  return jsonb_build_object(
    'restaurant', to_jsonb(restaurant_record),
    'legal', public.get_restaurant_legal_setup(input_restaurant_id),
    'already_completed', false
  );
end;
$$;

revoke execute on function public.complete_restaurant_onboarding(uuid, jsonb, jsonb, boolean, uuid)
  from public, anon;
grant execute on function public.complete_restaurant_onboarding(uuid, jsonb, jsonb, boolean, uuid)
  to authenticated;

comment on function public.complete_restaurant_onboarding(uuid, jsonb, jsonb, boolean, uuid) is
  'Owner-only atomic publication and activation of the existing onboarding restaurant.';

notify pgrst, 'reload schema';
