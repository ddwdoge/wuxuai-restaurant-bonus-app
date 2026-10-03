-- Migration 193: one read-only AT/de-AT control model. Migration 192 is immutable.
begin;
create function public.get_platform_at_legal_bundle_control(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp set timezone='UTC' as $f$
declare
  manifest jsonb; candidate jsonb; current_policy jsonb; snapshot public.legal_bundle_snapshots%rowtype;
  bundle_hash text; effective text:='NOT_FOUND'; technical text:='BLOCKED';
  gates text[]:='{}'::text[]; actions text[]:='{}'::text[]; field text; kind text; item jsonb;
  failure text; has_publication boolean:=false;
begin
  perform public.require_legal_bundle_admin_internal();
  if input_restaurant_id is null then
    raise exception 'LEGAL_BUNDLE_REQUEST_INVALID' using errcode='22023';
  end if;
  if public.resolve_restaurant_legal_jurisdiction(input_restaurant_id)->>'country' is distinct from 'AT' then
    return jsonb_build_object('restaurant_id',input_restaurant_id,'country','AT','locale','de-AT',
      'technical_status','BLOCKED','effective_status','NOT_FOUND','candidate',null,'snapshot',null,
      'blocking_reasons',jsonb_build_array('AT_JURISDICTION_REQUIRED'),'allowed_actions','[]'::jsonb);
  end if;
  select jsonb_build_object('revision_id',(select revision_id::text from public.legal_bundle_policy_revisions r
      where r.country_code='AT' and r.policy_state=to_jsonb(p) order by revision_id desc limit 1),
    'change_ref',p.change_ref,'real_intake_status',p.real_intake_status,'legal_status',p.legal_status,
    'privacy_status',p.privacy_status,'document_catalog_status',p.document_catalog_status,'retention_status',p.retention_status)
    into current_policy from public.country_kyb_intake_policies p where p.country_code='AT';
  -- Policy blockers remain visible even when document references are missing.
  foreach field in array array['real_intake_status','legal_status','privacy_status','document_catalog_status','retention_status'] loop
    if current_policy->>field is distinct from (case when field='real_intake_status' then 'READY' else 'VERIFIED' end) then
      gates:=array_append(gates,upper(field)||'_BLOCKED');
    end if;
  end loop;
  begin
    -- The existing preview resolves exact latest versions; no document bodies
    -- or legal-profile/contact data leave this read model.
    candidate:=public.get_platform_legal_bundle_preflight(input_restaurant_id);
    manifest:=public.legal_bundle_manifest_internal(input_restaurant_id,
      (candidate->'terms'->>'id')::uuid,(candidate->'privacy'->>'id')::uuid);
  exception when sqlstate '42501' or sqlstate '22023' then
    get stacked diagnostics failure=message_text;
    gates:=array_append(gates,case failure
      when 'LEGAL_BUNDLE_POLICY_REVISION_REQUIRED' then 'POLICY_REVISION_REQUIRED'
      when 'LEGAL_BUNDLE_DOCUMENT_INVALID' then 'CURRENT_DOCUMENTS_REQUIRED'
      when 'LEGAL_BUNDLE_DOCUMENT_STALE' then 'CURRENT_DOCUMENTS_REQUIRED'
      when 'LEGAL_BUNDLE_TEMPLATE_REQUIRED' then 'CURRENT_TEMPLATES_REQUIRED'
      when 'LEGAL_BUNDLE_TEMPLATE_STALE' then 'CURRENT_TEMPLATES_REQUIRED'
      else 'CURRENT_REFERENCES_UNAVAILABLE' end);
    candidate:=null;
  end;
  if candidate is not null then
    technical:=candidate->>'technical_status';
    bundle_hash:=candidate->>'bundle_sha256';
    foreach kind in array array['terms','privacy'] loop
      item:=manifest->kind;
      if item->>'status' is distinct from 'published' then
        gates:=array_append(gates,upper(kind)||'_DOCUMENT_NOT_PUBLISHED');
      end if;
      if item->'template'->>'review_status' is distinct from 'REVIEWED'
        or coalesce(item->'content'->>'template_review_status','REVIEWED') is distinct from 'REVIEWED'
        or coalesce(item->'content'->>'legal_packet_status','REVIEWED') is distinct from 'REVIEWED'
        or coalesce(item->'template'->'content'->>'legal_packet_status','REVIEWED') is distinct from 'REVIEWED' then
        gates:=array_append(gates,upper(kind)||'_LEGAL_REVIEW_REQUIRED');
      end if;
      if (item->'template'->>'active')::boolean is not true then
        gates:=array_append(gates,upper(kind)||'_TEMPLATE_INACTIVE');
      end if;
      if item->>'effective_date'>to_char(current_date,'YYYY-MM-DD') then
        gates:=array_append(gates,upper(kind)||'_EFFECTIVE_DATE_PENDING');
      end if;
    end loop;
    if technical='BLOCKED' and cardinality(gates)=0 then gates:=array_append(gates,'TECHNICAL_GATES_BLOCKED'); end if;
    select * into snapshot from public.legal_bundle_snapshots
      where restaurant_id=input_restaurant_id and country='AT' and locale='de-AT'
      order by (bundle_sha256=bundle_hash) desc,created_at desc,bundle_id desc limit 1;
    actions:=array_append(actions,'snapshot');
  else
    select * into snapshot from public.legal_bundle_snapshots
      where restaurant_id=input_restaurant_id and country='AT' and locale='de-AT'
      order by created_at desc,bundle_id desc limit 1;
  end if;
  if snapshot.bundle_id is not null then
    effective:=public.legal_bundle_effective_status_internal(snapshot.bundle_id);
    has_publication:=exists(select 1 from public.legal_bundle_publication_events
      where bundle_id=snapshot.bundle_id and action='publish');
    if candidate is not null and snapshot.bundle_sha256=bundle_hash
      and effective in ('READY','WITHDRAWN')
      and public.legal_bundle_effective_status_internal(snapshot.bundle_id,true)='READY' then
      actions:=array_append(actions,'publish');
    end if;
    -- A stale publication must still be withdrawable under Migration 192.
    if has_publication and effective<>'WITHDRAWN' then actions:=array_append(actions,'withdraw'); end if;
    if effective='STALE' then gates:=array_append(gates,'SNAPSHOT_STALE'); end if;
    if effective='WITHDRAWN' then gates:=array_append(gates,'PUBLICATION_WITHDRAWN'); end if;
  else
    gates:=array_append(gates,'SNAPSHOT_REQUIRED');
  end if;
  if effective<>'PUBLISHED' then gates:=array_append(gates,'PUBLICATION_REQUIRED'); end if;
  return jsonb_build_object('restaurant_id',input_restaurant_id,'country','AT','locale','de-AT',
    'technical_status',technical,'effective_status',effective,'candidate',candidate,
    'snapshot',case when snapshot.bundle_id is null then null else jsonb_build_object(
      'bundle_id',snapshot.bundle_id,'bundle_sha256',snapshot.bundle_sha256,'effective_status',effective,
      'terms',jsonb_build_object('id',snapshot.terms_version_id,'version',snapshot.terms_version,
        'sha256',snapshot.terms_sha256,'status',snapshot.manifest->'terms'->>'status'),
      'privacy',jsonb_build_object('id',snapshot.privacy_version_id,'version',snapshot.privacy_version,
        'sha256',snapshot.privacy_sha256,'status',snapshot.manifest->'privacy'->>'status')) end,
    'policy_revision',case when candidate is null then current_policy else candidate->'policy_revision' end,
    'blocking_reasons',to_jsonb(gates),'allowed_actions',to_jsonb(actions));
end $f$;
revoke all on function public.get_platform_at_legal_bundle_control(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_platform_at_legal_bundle_control(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
