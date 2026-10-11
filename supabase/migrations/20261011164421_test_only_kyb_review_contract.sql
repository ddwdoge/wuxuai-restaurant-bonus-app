-- Synthetic two-person KYB review evidence for the bound staging-v2 project.
--
-- This ledger is deliberately independent from business_verification_test_receipts,
-- platform_operator_review_events and every real KYB/legal readiness resolver. It
-- never writes VERIFIED, never activates a tenant and is not a billing, PRO, mail
-- or checkout grant.
begin;

select pg_advisory_xact_lock(hashtextextended('migration:20261011164421', 0));

create table public.test_only_kyb_review_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  sequence bigint generated always as identity unique,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  material_revision bigint not null,
  action text not null check (action in ('FIRST_REVIEW', 'APPROVE_TEST')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  previous_receipt_id uuid references public.test_only_kyb_review_receipts(id) on delete restrict,
  document_manifest jsonb not null check (jsonb_typeof(document_manifest) = 'array'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  reference text not null check (reference ~ '^TEST_ONLY_[A-Z0-9][A-Z0-9_-]{2,71}$'),
  decision_payload jsonb not null check (jsonb_typeof(decision_payload) = 'object'),
  auth_evidence jsonb not null check (jsonb_typeof(auth_evidence) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (restaurant_id, material_revision)
    references public.operator_material_revisions(restaurant_id, revision) on delete restrict,
  check (case when jsonb_typeof(document_manifest) = 'array'
    then jsonb_array_length(document_manifest) = 2 else false end),
  check ((action = 'FIRST_REVIEW' and previous_receipt_id is null)
    or (action = 'APPROVE_TEST' and previous_receipt_id is not null))
);

create index test_only_kyb_review_receipts_latest_idx
  on public.test_only_kyb_review_receipts(restaurant_id, sequence desc);
create index test_only_kyb_review_receipts_actor_idx
  on public.test_only_kyb_review_receipts(actor_id, sequence desc);
create index test_only_kyb_review_receipts_case_idx
  on public.test_only_kyb_review_receipts(case_id, sequence desc);
create index test_only_kyb_review_receipts_previous_idx
  on public.test_only_kyb_review_receipts(previous_receipt_id)
  where previous_receipt_id is not null;

create table public.test_only_kyb_review_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  receipt_id uuid not null unique references public.test_only_kyb_review_receipts(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  material_revision bigint not null,
  action text not null check (action in ('FIRST_REVIEW', 'APPROVE_TEST')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  previous_receipt_id uuid references public.test_only_kyb_review_receipts(id) on delete restrict,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in (
    'TEST_ONLY_KYB_FIRST_REVIEW_RECORDED',
    'TEST_ONLY_KYB_SECOND_REVIEW_RECORDED'
  )),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (restaurant_id, material_revision)
    references public.operator_material_revisions(restaurant_id, revision) on delete restrict
);

create index test_only_kyb_review_audit_tenant_idx
  on public.test_only_kyb_review_audit(restaurant_id, event_sequence desc);
create index test_only_kyb_review_audit_actor_idx
  on public.test_only_kyb_review_audit(actor_id, event_sequence desc);
create index test_only_kyb_review_audit_case_idx
  on public.test_only_kyb_review_audit(case_id, event_sequence desc);
create index test_only_kyb_review_audit_previous_idx
  on public.test_only_kyb_review_audit(previous_receipt_id)
  where previous_receipt_id is not null;

alter table public.test_only_kyb_review_receipts enable row level security;
alter table public.test_only_kyb_review_audit enable row level security;
revoke all on public.test_only_kyb_review_receipts,
  public.test_only_kyb_review_audit from public, anon, authenticated, service_role;

create trigger test_only_kyb_review_receipts_immutable
before update or delete or truncate on public.test_only_kyb_review_receipts
for each statement execute function public.protect_business_verification_append_only();

create trigger test_only_kyb_review_audit_immutable
before update or delete or truncate on public.test_only_kyb_review_audit
for each statement execute function public.protect_business_verification_append_only();

-- Exact, current evidence for one marked synthetic pending tenant. This is a
-- snapshot builder only; it is private and cannot become a readiness grant.
create function public.test_only_kyb_review_snapshot_internal(input_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $function$
  with binding as (
    select public.get_server_project_binding() value
  ), documents as (
    select d.restaurant_id,
      count(*) as document_count,
      count(*) filter (where d.document_type = 'GISA_EXTRACT') as gisa_count,
      count(*) filter (where d.document_type = 'TRADE_LICENSE') as trade_license_count,
      jsonb_agg(jsonb_build_object(
        'id', d.id,
        'type', d.document_type,
        'version', d.version,
        'sha256', d.content_sha256
      ) order by d.document_type collate "C", d.id) as manifest
    from public.business_verification_documents d
    where d.restaurant_id = input_restaurant_id
      and d.status = 'UPLOADED'
      and d.content_sha256 ~ '^[0-9a-f]{64}$'
      and not exists (
        select 1 from public.business_verification_documents newer
        where newer.case_id = d.case_id
          and newer.document_type = d.document_type
          and newer.version > d.version
      )
    group by d.restaurant_id
  )
  select jsonb_build_object(
    'schema_version', 1,
    'purpose', 'SYNTHETIC_TEST_ONLY_KYB_REVIEW',
    'project', jsonb_build_object(
      'project_ref', binding.value->>'project_ref',
      'auth_issuer', binding.value->>'auth_issuer',
      'app_origin', binding.value->>'app_origin'
    ),
    'restaurant_id', r.id,
    'organization_id', r.organization_id,
    'branch_id', b.id,
    'owner_id', r.owner_id,
    'case_id', c.id,
    'country', c.country_code,
    'case_status', c.status,
    'test_only', c.test_only,
    'material_revision', revision.revision,
    'documents', documents.manifest
  )
  from public.restaurants r
  join public.organizations o
    on o.id = r.organization_id and o.owner_id = r.owner_id
  join public.branches b
    on b.id = r.primary_branch_id
   and b.restaurant_id = r.id
   and b.organization_id = r.organization_id
  join public.restaurant_members member
    on member.restaurant_id = r.id
   and member.organization_id = r.organization_id
   and member.user_id = r.owner_id
   and member.role = 'owner'
  join public.branch_subscriptions subscription
    on subscription.branch_id = b.id
   and subscription.organization_id = r.organization_id
  join public.business_verification_cases c
    on c.restaurant_id = r.id
  join public.platform_test_tenant_registry marker
    on marker.restaurant_id = r.id
   and marker.organization_id = r.organization_id
   and marker.owner_user_id = r.owner_id
   and marker.restaurant_name = r.name
   and marker.deleted_at is null
  join documents on documents.restaurant_id = r.id
  join lateral (
    select max(material.revision) revision
    from public.operator_material_revisions material
    where material.restaurant_id = r.id
  ) revision on revision.revision is not null
  cross join binding
  where r.id = input_restaurant_id
    and r.status = 'draft'
    and r.activation_status = 'pending_activation'
    and upper(r.name) like '%WUXUAI%'
    and upper(r.name) ~ '(TEST|SMOKE)'
    and upper(b.country) = 'AT'
    and c.country_code = 'AT'
    and c.verification_method = 'MANUAL'
    and c.status = 'PENDING_ACTIVATION'
    and c.review_started_at is null
    and c.decided_at is null
    and c.test_only
    and subscription.status = 'pending_activation'
    and subscription.subscription_status = 'pending_activation'
    and subscription.payment_status = 'not_required'
    and subscription.trial_started_at is null
    and subscription.trial_ends_at is null
    and subscription.current_period_start is null
    and subscription.current_period_end is null
    and subscription.current_period_ends_at is null
    and subscription.stripe_customer_id is null
    and subscription.stripe_subscription_id is null
    and documents.document_count = 2
    and documents.gisa_count = 1
    and documents.trade_license_count = 1
    and not exists (
      select 1 from public.business_verification_documents pending
      where pending.case_id = c.id and pending.status = 'PENDING_UPLOAD'
    )
    and binding.value->>'project_ref' = 'mbgveqbhessaunrhfudm'
    and binding.value->>'auth_issuer' = 'https://mbgveqbhessaunrhfudm.supabase.co/auth/v1'
    and binding.value->>'app_origin' = 'https://staging-v2.bonus.wuxuaisbi.com'
    and (select environment from public.business_verification_environment where singleton) = 'STAGING'
    and (select real_intake_status from public.country_kyb_intake_policies where country_code = 'AT') = 'BLOCKED'
    and not public.restaurant_menu_access_internal(r.id, b.id)
    and (select file_size_limit from storage.buckets where id = 'restaurant-menu-private') = 1
    and not exists (
      select 1 from public.commercial_pro_access_grants grant_row
      where grant_row.restaurant_id = r.id
    )
    and not exists (
      select 1 from public.basic_test_checkout_requests checkout
      where checkout.restaurant_id = r.id
    );
$function$;

revoke all on function public.test_only_kyb_review_snapshot_internal(uuid)
from public, anon, authenticated, service_role;

create function public.test_only_kyb_review_current_internal(
  input_restaurant_id uuid,
  input_as_of timestamptz default statement_timestamp()
) returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  current_snapshot jsonb;
  approval public.test_only_kyb_review_receipts%rowtype;
  first_review public.test_only_kyb_review_receipts%rowtype;
begin
  if input_restaurant_id is null or input_as_of is null or not isfinite(input_as_of) then
    return false;
  end if;
  current_snapshot := public.test_only_kyb_review_snapshot_internal(input_restaurant_id);
  if current_snapshot is null then return false; end if;
  select * into approval
  from public.test_only_kyb_review_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.sequence desc
  limit 1;
  if approval.id is null
    or approval.action <> 'APPROVE_TEST'
    or approval.created_at > input_as_of
    or approval.material_revision is distinct from (current_snapshot->>'material_revision')::bigint
    or approval.document_manifest is distinct from current_snapshot->'documents'
    or approval.snapshot is distinct from current_snapshot
    or approval.snapshot_sha256 is distinct from encode(
      extensions.digest(convert_to(current_snapshot::text, 'UTF8'), 'sha256'), 'hex'
    ) then
    return false;
  end if;
  select * into first_review
  from public.test_only_kyb_review_receipts receipt
  where receipt.id = approval.previous_receipt_id;
  return coalesce(
    first_review.id is not null
    and first_review.action = 'FIRST_REVIEW'
    and first_review.actor_id <> approval.actor_id
    and first_review.restaurant_id = approval.restaurant_id
    and first_review.organization_id = approval.organization_id
    and first_review.branch_id = approval.branch_id
    and first_review.case_id = approval.case_id
    and first_review.material_revision = approval.material_revision
    and first_review.document_manifest = approval.document_manifest
    and first_review.snapshot = approval.snapshot
    and first_review.snapshot_sha256 = approval.snapshot_sha256
    and exists (
      select 1 from public.platform_admins admin_row
      where admin_row.user_id = first_review.actor_id
        and admin_row.active
        and admin_row.role in ('platform_owner', 'platform_admin')
    )
    and exists (
      select 1 from public.platform_admins admin_row
      where admin_row.user_id = approval.actor_id
        and admin_row.active
        and admin_row.role in ('platform_owner', 'platform_admin')
    ),
    false
  );
end;
$function$;

revoke all on function public.test_only_kyb_review_current_internal(uuid, timestamptz)
from public, anon, authenticated, service_role;

create function public.get_platform_test_only_kyb_review(input_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  snapshot_value jsonb;
  previous public.test_only_kyb_review_receipts%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(true);
  perform public.require_legal_bundle_admin_internal();
  snapshot_value := public.test_only_kyb_review_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then
    raise exception 'TEST_ONLY_KYB_REVIEW_CONTEXT_INVALID' using errcode = '42501';
  end if;
  select * into previous
  from public.test_only_kyb_review_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.sequence desc
  limit 1;
  return jsonb_build_object(
    'synthetic_test_only', true,
    'real_kyb_verified', false,
    'snapshot', snapshot_value,
    'snapshot_sha256', encode(
      extensions.digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex'
    ),
    'material_revision', snapshot_value->'material_revision',
    'documents', snapshot_value->'documents',
    'previous_receipt_id', previous.id,
    'previous_action', previous.action,
    'same_reviewer', previous.actor_id = auth.uid(),
    'synthetic_review_complete', public.test_only_kyb_review_current_internal(
      input_restaurant_id, statement_timestamp()
    )
  );
end;
$function$;

revoke all on function public.get_platform_test_only_kyb_review(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_platform_test_only_kyb_review(uuid) to authenticated;

create function public.decide_platform_test_only_kyb_review(
  input_restaurant_id uuid,
  input_organization_id uuid,
  input_branch_id uuid,
  input_action text,
  input_expected_material_revision bigint,
  input_expected_snapshot_sha256 text,
  input_expected_previous_receipt_id uuid,
  input_documents jsonb,
  input_reference text,
  input_confirmed boolean,
  input_confirmation text,
  input_request_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  restaurant_row public.restaurants%rowtype;
  case_row public.business_verification_cases%rowtype;
  prior_request public.test_only_kyb_review_receipts%rowtype;
  previous public.test_only_kyb_review_receipts%rowtype;
  snapshot_value jsonb;
  snapshot_sha256_value text;
  payload_value jsonb;
  auth_evidence_value jsonb;
  result_value jsonb;
  receipt_id_value uuid := extensions.gen_random_uuid();
  totp_at_value timestamptz;
  receipt_sha256_value text;
begin
  perform project_bootstrap.require_runtime_binding(true);
  perform public.require_legal_bundle_admin_internal();
  if input_restaurant_id is null
    or input_organization_id is null
    or input_branch_id is null
    or input_action is null
    or input_action not in ('FIRST_REVIEW', 'APPROVE_TEST')
    or input_expected_material_revision is null
    or input_expected_material_revision < 1
    or coalesce(input_expected_snapshot_sha256, '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(input_documents) is distinct from 'array'
    or jsonb_array_length(input_documents) <> 2
    or coalesce(input_reference, '') !~ '^TEST_ONLY_[A-Z0-9][A-Z0-9_-]{2,71}$'
    or input_confirmed is distinct from true
    or input_request_id is null then
    raise exception 'TEST_ONLY_KYB_REVIEW_REQUEST_INVALID' using errcode = '22023';
  end if;
  payload_value := jsonb_build_object(
    'restaurant_id', input_restaurant_id,
    'organization_id', input_organization_id,
    'branch_id', input_branch_id,
    'action', input_action,
    'material_revision', input_expected_material_revision,
    'snapshot_sha256', input_expected_snapshot_sha256,
    'previous_receipt_id', input_expected_previous_receipt_id,
    'documents', input_documents,
    'reference', input_reference,
    'confirmation', input_confirmation
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-kyb-review-request:' || input_request_id::text, 0
  ));
  select * into prior_request
  from public.test_only_kyb_review_receipts receipt
  where receipt.request_id = input_request_id;
  if prior_request.id is not null then
    if prior_request.actor_id is distinct from auth.uid()
      or prior_request.decision_payload is distinct from payload_value then
      raise exception 'TEST_ONLY_KYB_REVIEW_REPLAY_CONFLICT' using errcode = '22023';
    end if;
    return prior_request.result || jsonb_build_object(
      'idempotent', true,
      'historical_receipt', true
    );
  end if;

  -- Same lock order as the real operator-review path: restaurant first, then
  -- source tables. NOWAIT prevents a lock inversion with an Owner upload.
  select * into restaurant_row
  from public.restaurants
  where id = input_restaurant_id
  for update nowait;
  lock table public.organizations, public.restaurant_members,
    public.branch_subscriptions, public.business_verification_cases,
    public.business_verification_documents, public.operator_material_revisions,
    public.platform_test_tenant_registry, public.platform_admins
    in share mode nowait;
  perform project_bootstrap.require_runtime_binding(true);
  perform public.require_legal_bundle_admin_internal();

  select max(to_timestamp((method->>'timestamp')::double precision))
  into totp_at_value
  from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) method
  where jsonb_typeof(method) = 'object'
    and method->>'method' = 'totp'
    and coalesce(method->>'timestamp', '') ~ '^[0-9]+([.][0-9]+)?$';

  perform 1 from public.organizations
  where id = restaurant_row.organization_id for share nowait;
  perform 1 from public.branches
  where id = restaurant_row.primary_branch_id for share nowait;
  select * into case_row
  from public.business_verification_cases
  where restaurant_id = restaurant_row.id
  for share nowait;

  if restaurant_row.id is null
    or restaurant_row.organization_id is distinct from input_organization_id
    or restaurant_row.primary_branch_id is distinct from input_branch_id
    or case_row.id is null
    or input_confirmation is distinct from
      'TEST_ONLY KYB ' || input_action || ' ' || restaurant_row.name then
    raise exception 'TEST_ONLY_KYB_REVIEW_BINDING_INVALID' using errcode = '42501';
  end if;

  snapshot_value := public.test_only_kyb_review_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then
    raise exception 'TEST_ONLY_KYB_REVIEW_CONTEXT_INVALID' using errcode = '42501';
  end if;
  snapshot_sha256_value := encode(
    extensions.digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex'
  );
  if (snapshot_value->>'material_revision')::bigint is distinct from input_expected_material_revision
    or snapshot_sha256_value is distinct from input_expected_snapshot_sha256
    or snapshot_value->'documents' is distinct from input_documents then
    raise exception 'TEST_ONLY_KYB_REVIEW_STALE' using errcode = 'P0001';
  end if;

  select * into previous
  from public.test_only_kyb_review_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.sequence desc
  limit 1;
  if previous.id is distinct from input_expected_previous_receipt_id then
    raise exception 'TEST_ONLY_KYB_REVIEW_STALE' using errcode = 'P0001';
  end if;
  if input_action = 'FIRST_REVIEW' then
    if previous.id is not null then
      raise exception 'TEST_ONLY_KYB_REVIEW_TRANSITION_INVALID' using errcode = '42501';
    end if;
  elsif previous.id is null
    or previous.action <> 'FIRST_REVIEW'
    or previous.actor_id = auth.uid()
    or previous.material_revision is distinct from input_expected_material_revision
    or previous.document_manifest is distinct from input_documents
    or previous.snapshot is distinct from snapshot_value
    or previous.snapshot_sha256 is distinct from snapshot_sha256_value
    or not exists (
      select 1 from public.platform_admins admin_row
      where admin_row.user_id = previous.actor_id
        and admin_row.active
        and admin_row.role in ('platform_owner', 'platform_admin')
    ) then
    raise exception 'TEST_ONLY_KYB_REVIEW_SECOND_PERSON_REQUIRED' using errcode = '42501';
  end if;

  auth_evidence_value := jsonb_build_object(
    'aal', 'aal2',
    'amr_method', 'totp',
    'totp_at', totp_at_value,
    'role', public.current_platform_role(),
    'session_sha256', encode(
      extensions.digest(convert_to(auth.jwt()->>'session_id', 'UTF8'), 'sha256'), 'hex'
    )
  );
  result_value := jsonb_build_object(
    'receipt_id', receipt_id_value,
    'action', input_action,
    'restaurant_id', restaurant_row.id,
    'organization_id', restaurant_row.organization_id,
    'branch_id', restaurant_row.primary_branch_id,
    'case_id', case_row.id,
    'material_revision', input_expected_material_revision,
    'snapshot_sha256', snapshot_sha256_value,
    'documents', input_documents,
    'synthetic_test_only', true,
    'real_kyb_verified', false,
    'synthetic_review_complete', input_action = 'APPROVE_TEST',
    'idempotent', false
  );

  insert into public.test_only_kyb_review_receipts (
    id, restaurant_id, organization_id, branch_id, case_id,
    material_revision, action, actor_id, request_id, previous_receipt_id,
    document_manifest, snapshot, snapshot_sha256, reference,
    decision_payload, auth_evidence, result
  ) values (
    receipt_id_value, restaurant_row.id, restaurant_row.organization_id,
    restaurant_row.primary_branch_id, case_row.id,
    input_expected_material_revision, input_action, auth.uid(), input_request_id,
    previous.id, input_documents, snapshot_value, snapshot_sha256_value,
    input_reference, payload_value, auth_evidence_value, result_value
  );

  receipt_sha256_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'receipt_id', receipt_id_value,
    'restaurant_id', restaurant_row.id,
    'organization_id', restaurant_row.organization_id,
    'branch_id', restaurant_row.primary_branch_id,
    'case_id', case_row.id,
    'material_revision', input_expected_material_revision,
    'action', input_action,
    'actor_id', auth.uid(),
    'request_id', input_request_id,
    'previous_receipt_id', previous.id,
    'document_manifest', input_documents,
    'snapshot_sha256', snapshot_sha256_value,
    'reference', input_reference,
    'auth_evidence', auth_evidence_value,
    'result', result_value
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.test_only_kyb_review_audit (
    receipt_id, restaurant_id, organization_id, branch_id, case_id,
    material_revision, action, actor_id, request_id, previous_receipt_id,
    snapshot_sha256, receipt_sha256, event_type
  ) values (
    receipt_id_value, restaurant_row.id, restaurant_row.organization_id,
    restaurant_row.primary_branch_id, case_row.id,
    input_expected_material_revision, input_action, auth.uid(), input_request_id,
    previous.id, snapshot_sha256_value, receipt_sha256_value,
    case input_action
      when 'FIRST_REVIEW' then 'TEST_ONLY_KYB_FIRST_REVIEW_RECORDED'
      else 'TEST_ONLY_KYB_SECOND_REVIEW_RECORDED'
    end
  );
  return result_value;
end;
$function$;

revoke all on function public.decide_platform_test_only_kyb_review(
  uuid, uuid, uuid, text, bigint, text, uuid, jsonb, text, boolean, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.decide_platform_test_only_kyb_review(
  uuid, uuid, uuid, text, bigint, text, uuid, jsonb, text, boolean, text, uuid
) to authenticated;

comment on table public.test_only_kyb_review_receipts is
  'Immutable synthetic TEST_ONLY review receipts. They are never real KYB, legal approval, activation or billing evidence.';
comment on table public.test_only_kyb_review_audit is
  'Separate immutable audit ledger for synthetic TEST_ONLY KYB review actions.';
comment on function public.test_only_kyb_review_current_internal(uuid, timestamptz) is
  'Private synthetic-only predicate. It is intentionally not consumed by real KYB, legal, activation, trial, PRO, checkout or mail gates.';
comment on function public.decide_platform_test_only_kyb_review(
  uuid, uuid, uuid, text, bigint, text, uuid, jsonb, text, boolean, text, uuid
) is
  'Records one of two AAL2/TOTP-bound synthetic review decisions against the same exact current material revision and two-document manifest; never writes VERIFIED.';

notify pgrst, 'reload schema';
commit;
