-- Allow complete destruction of an isolated TEST-ONLY tenant even when the
-- canonical onboarding flow created tenant-bound legal evidence. Normal legal
-- immutability remains unchanged outside the existing cleanup transaction.

alter function public.get_platform_test_tenant_cleanup_preflight(uuid)
  rename to get_platform_test_tenant_cleanup_preflight_v1;

create function public.get_platform_test_tenant_cleanup_preflight(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
stable
as $$
declare
  result_value jsonb;
  blockers_value jsonb;
begin
  result_value := public.get_platform_test_tenant_cleanup_preflight_v1(input_restaurant_id);

  if coalesce((result_value->>'deleted')::boolean, false) then
    return result_value;
  end if;

  blockers_value := coalesce(result_value->'blockers', '[]'::jsonb)
    - 'IMMUTABLE_LEGAL_EVIDENCE_PRESENT';

  return jsonb_set(
    jsonb_set(
      jsonb_set(result_value, '{contract_version}', '"staging-test-tenant-cleanup-v2"'::jsonb),
      '{blockers}', blockers_value
    ),
    '{eligible}', to_jsonb(jsonb_array_length(blockers_value) = 0)
  );
end;
$$;

revoke all on function public.get_platform_test_tenant_cleanup_preflight_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.get_platform_test_tenant_cleanup_preflight(uuid)
  from public, anon, authenticated;
grant execute on function public.get_platform_test_tenant_cleanup_preflight(uuid)
  to authenticated;

create or replace function public.prevent_legal_version_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE'
     and public.test_tenant_cleanup_context_allows(old.restaurant_id) then
    return old;
  end if;

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

create or replace function public.prevent_legal_document_jurisdiction_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE'
     and public.test_tenant_cleanup_context_allows(old.restaurant_id) then
    return old;
  end if;

  raise exception 'Legal document jurisdiction evidence is immutable';
end;
$$;

revoke all on function public.prevent_legal_version_mutation()
  from public, anon, authenticated;
revoke all on function public.prevent_legal_document_jurisdiction_mutation()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
