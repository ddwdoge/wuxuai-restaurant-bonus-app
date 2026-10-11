-- Synthetic activation/trial readiness evidence for the exact bound staging-v2 tenant.
--
-- This contract consumes the current TEST_ONLY KYB 2/2 receipt chain and the
-- current TEST_ONLY legal publications. It appends evidence only. It never
-- activates a restaurant, starts a trial, grants PRO, opens checkout/catalog,
-- or authorizes mail.
begin;

select pg_advisory_xact_lock(hashtextextended('migration:20261011213000', 0));

create table public.test_only_activation_trial_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  sequence bigint generated always as identity unique,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  material_revision bigint not null,
  action text not null check (action in ('ACTIVATION_READINESS_TEST', 'TRIAL_READINESS_TEST')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  previous_receipt_id uuid references public.test_only_activation_trial_receipts(id) on delete restrict,
  kyb_receipt_id uuid not null references public.test_only_kyb_review_receipts(id) on delete restrict,
  platform_terms_publication_id uuid not null references public.platform_terms_test_publications(id) on delete restrict,
  merchant_legal_publication_id uuid not null references public.at_legal_synthetic_test_publications(id) on delete restrict,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  reference text not null check (reference ~ '^TEST_ONLY_[A-Z0-9][A-Z0-9_-]{2,71}$'),
  decision_payload jsonb not null check (jsonb_typeof(decision_payload) = 'object'),
  auth_evidence jsonb not null check (jsonb_typeof(auth_evidence) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (restaurant_id, material_revision)
    references public.operator_material_revisions(restaurant_id, revision) on delete restrict,
  check ((action = 'ACTIVATION_READINESS_TEST' and previous_receipt_id is null)
    or (action = 'TRIAL_READINESS_TEST' and previous_receipt_id is not null))
);

create index test_only_activation_trial_receipts_latest_idx
  on public.test_only_activation_trial_receipts(restaurant_id, sequence desc);
create index test_only_activation_trial_receipts_actor_idx
  on public.test_only_activation_trial_receipts(actor_id, sequence desc);

create table public.test_only_activation_trial_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  event_sequence bigint generated always as identity unique,
  receipt_id uuid not null unique references public.test_only_activation_trial_receipts(id) on delete restrict,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  case_id uuid not null references public.business_verification_cases(id) on delete restrict,
  material_revision bigint not null,
  action text not null check (action in ('ACTIVATION_READINESS_TEST', 'TRIAL_READINESS_TEST')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  previous_receipt_id uuid references public.test_only_activation_trial_receipts(id) on delete restrict,
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  receipt_sha256 text not null check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in (
    'TEST_ONLY_ACTIVATION_READINESS_RECORDED',
    'TEST_ONLY_TRIAL_READINESS_RECORDED'
  )),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (restaurant_id, material_revision)
    references public.operator_material_revisions(restaurant_id, revision) on delete restrict
);

create index test_only_activation_trial_audit_tenant_idx
  on public.test_only_activation_trial_audit(restaurant_id, event_sequence desc);

alter table public.test_only_activation_trial_receipts enable row level security;
alter table public.test_only_activation_trial_audit enable row level security;
revoke all on public.test_only_activation_trial_receipts,
  public.test_only_activation_trial_audit from public, anon, authenticated, service_role;

create trigger test_only_activation_trial_receipts_immutable
before update or delete or truncate on public.test_only_activation_trial_receipts
for each statement execute function public.protect_business_verification_append_only();

create trigger test_only_activation_trial_audit_immutable
before update or delete or truncate on public.test_only_activation_trial_audit
for each statement execute function public.protect_business_verification_append_only();

create function public.test_only_activation_trial_snapshot_internal(input_restaurant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $function$
  with binding as (
    select public.get_server_project_binding() value
  ), kyb as (
    select receipt.*
    from public.test_only_kyb_review_receipts receipt
    where receipt.restaurant_id = input_restaurant_id
    order by receipt.sequence desc
    limit 1
  ), platform_terms as (
    select publication.*
    from public.platform_terms_test_publications publication
    where publication.restaurant_id = input_restaurant_id
    order by publication.event_sequence desc
    limit 1
  ), merchant_legal as (
    select publication.*
    from public.at_legal_synthetic_test_publications publication
    where publication.restaurant_id = input_restaurant_id
    order by publication.event_sequence desc
    limit 1
  )
  select jsonb_build_object(
    'schema_version', 1,
    'purpose', 'SYNTHETIC_TEST_ONLY_ACTIVATION_TRIAL_READINESS',
    'project', jsonb_build_object(
      'project_ref', binding.value->>'project_ref',
      'auth_issuer', binding.value->>'auth_issuer',
      'app_origin', binding.value->>'app_origin'
    ),
    'restaurant_id', r.id,
    'organization_id', r.organization_id,
    'branch_id', b.id,
    'case_id', c.id,
    'material_revision', revision.revision,
    'kyb', jsonb_build_object(
      'receipt_id', kyb.id,
      'snapshot_sha256', kyb.snapshot_sha256,
      'documents', kyb.document_manifest,
      'synthetic_review_complete', true,
      'real_kyb_verified', false
    ),
    'legal', jsonb_build_object(
      'platform_publication_id', platform_terms.id,
      'platform_version', platform_terms.version,
      'platform_sha256', platform_terms.content_sha256,
      'merchant_publication_id', merchant_legal.id,
      'merchant_bundle_id', merchant_legal.bundle_id,
      'merchant_bundle_hash', merchant_legal.bundle_hash,
      'merchant_manifest', merchant_legal.manifest,
      'synthetic_test_only', true,
      'real_legal_ready', false
    ),
    'baseline', jsonb_build_object(
      'restaurant_status', r.status,
      'activation_status', r.activation_status,
      'branch_status', b.status,
      'subscription_status', s.subscription_status,
      'payment_status', s.payment_status,
      'trial_started_at', s.trial_started_at,
      'trial_ends_at', s.trial_ends_at,
      'stripe_customer_id', s.stripe_customer_id,
      'stripe_subscription_id', s.stripe_subscription_id,
      'real_intake_status', policy.real_intake_status,
      'catalog_access', false
    )
  )
  from public.restaurants r
  join public.organizations o
    on o.id = r.organization_id and o.owner_id = r.owner_id
  join public.branches b
    on b.id = r.primary_branch_id
   and b.restaurant_id = r.id
   and b.organization_id = r.organization_id
  join public.branch_subscriptions s
    on s.branch_id = b.id and s.organization_id = r.organization_id
  join public.business_verification_cases c
    on c.restaurant_id = r.id
  join public.platform_test_tenant_registry marker
    on marker.restaurant_id = r.id
   and marker.organization_id = r.organization_id
   and marker.owner_user_id = r.owner_id
   and marker.restaurant_name = r.name
   and marker.deleted_at is null
  join public.country_kyb_intake_policies policy on policy.country_code = 'AT'
  join lateral (
    select max(material.revision) revision
    from public.operator_material_revisions material
    where material.restaurant_id = r.id
  ) revision on revision.revision is not null
  cross join binding
  cross join kyb
  cross join platform_terms
  cross join merchant_legal
  where r.id = input_restaurant_id
    and binding.value->>'project_ref' = 'mbgveqbhessaunrhfudm'
    and binding.value->>'auth_issuer' = 'https://mbgveqbhessaunrhfudm.supabase.co/auth/v1'
    and binding.value->>'app_origin' = 'https://staging-v2.bonus.wuxuaisbi.com'
    and (select environment from public.business_verification_environment where singleton) = 'STAGING'
    and policy.real_intake_status = 'BLOCKED'
    and policy.test_only_intake_status = 'READY'
    and r.status = 'draft'
    and r.activation_status = 'pending_activation'
    and r.legal_ready is false
    and r.operational_ready is false
    and r.security_ready is false
    and b.status = 'draft'
    and upper(b.country) = 'AT'
    and c.status = 'PENDING_ACTIVATION'
    and c.test_only
    and c.review_started_at is null
    and c.decided_at is null
    and s.status = 'pending_activation'
    and s.subscription_status = 'pending_activation'
    and s.payment_status = 'not_required'
    and s.trial_started_at is null
    and s.trial_ends_at is null
    and s.current_period_start is null
    and s.current_period_end is null
    and s.current_period_ends_at is null
    and s.stripe_customer_id is null
    and s.stripe_subscription_id is null
    and public.test_only_kyb_review_current_internal(r.id, statement_timestamp())
    and kyb.action = 'APPROVE_TEST'
    and kyb.material_revision = revision.revision
    and platform_terms.action = 'PUBLISH_TEST'
    and platform_terms.test_session_id = marker.test_session_id
    and platform_terms.version ~ '^TEST_ONLY_[A-Z0-9_-]{3,80}$'
    and platform_terms.body_markdown like 'TEST ONLY:%'
    and platform_terms.content_sha256 = encode(
      extensions.digest(convert_to(platform_terms.body_markdown, 'UTF8'), 'sha256'), 'hex'
    )
    and merchant_legal.action = 'PUBLISH_TEST'
    and merchant_legal.manifest->>'test_only' = 'true'
    and merchant_legal.manifest->>'restaurant_id' = r.id::text
    and merchant_legal.bundle_hash = public.at_legal_synthetic_manifest_hash_internal(merchant_legal.manifest)
    and merchant_legal.bundle_id = 'at-test-' || merchant_legal.bundle_hash
    and not exists (select 1 from public.legal_operator_publication_decisions d where d.restaurant_id = r.id)
    and not exists (select 1 from public.manual_basic_trial_decisions d where d.restaurant_id = r.id)
    and not exists (select 1 from public.billing_trial_claims claim where claim.restaurant_id = r.id)
    and not exists (select 1 from public.commercial_pro_access_grants grant_row where grant_row.restaurant_id = r.id)
    and not exists (select 1 from public.basic_test_checkout_requests checkout where checkout.restaurant_id = r.id)
    and not exists (select 1 from public.customer_offer_email_deliveries delivery where delivery.restaurant_id = r.id)
    and not public.restaurant_menu_access_internal(r.id, b.id)
    and (select file_size_limit from storage.buckets where id = 'restaurant-menu-private') = 1
    and not exists (select 1 from storage.objects where bucket_id = 'restaurant-menu-private');
$function$;

revoke all on function public.test_only_activation_trial_snapshot_internal(uuid)
from public, anon, authenticated, service_role;

create function public.get_platform_test_only_activation_trial(input_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  snapshot_value jsonb;
  previous public.test_only_activation_trial_receipts%rowtype;
begin
  perform project_bootstrap.require_runtime_binding(true);
  perform public.require_legal_bundle_admin_internal();
  snapshot_value := public.test_only_activation_trial_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then
    raise exception 'TEST_ONLY_ACTIVATION_TRIAL_CONTEXT_INVALID' using errcode = '42501';
  end if;
  select * into previous
  from public.test_only_activation_trial_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.sequence desc
  limit 1;
  return jsonb_build_object(
    'synthetic_test_only', true,
    'real_activation', false,
    'real_trial', false,
    'snapshot', snapshot_value,
    'snapshot_sha256', encode(
      extensions.digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex'
    ),
    'previous_receipt_id', previous.id,
    'previous_action', previous.action,
    'next_action', case
      when previous.id is null then 'ACTIVATION_READINESS_TEST'
      when previous.action = 'ACTIVATION_READINESS_TEST' then 'TRIAL_READINESS_TEST'
      else null
    end,
    'synthetic_chain_complete', previous.action = 'TRIAL_READINESS_TEST'
  );
end;
$function$;

revoke all on function public.get_platform_test_only_activation_trial(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_platform_test_only_activation_trial(uuid) to authenticated;

create function public.decide_platform_test_only_activation_trial(
  input_restaurant_id uuid,
  input_action text,
  input_expected_snapshot_sha256 text,
  input_expected_previous_receipt_id uuid,
  input_reference text,
  input_confirmation text,
  input_request_id uuid
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  snapshot_value jsonb;
  snapshot_sha256_value text;
  previous public.test_only_activation_trial_receipts%rowtype;
  prior_request public.test_only_activation_trial_receipts%rowtype;
  payload_value jsonb;
  auth_evidence_value jsonb;
  result_value jsonb;
  receipt_id_value uuid := extensions.gen_random_uuid();
  receipt_sha256_value text;
  totp_at_value timestamptz;
  previous_totp_at timestamptz;
begin
  perform project_bootstrap.require_runtime_binding(true);
  perform public.require_legal_bundle_admin_internal();
  if input_restaurant_id is null
    or input_action not in ('ACTIVATION_READINESS_TEST', 'TRIAL_READINESS_TEST')
    or coalesce(input_expected_snapshot_sha256, '') !~ '^[0-9a-f]{64}$'
    or coalesce(input_reference, '') !~ '^TEST_ONLY_[A-Z0-9][A-Z0-9_-]{2,71}$'
    or input_request_id is null then
    raise exception 'TEST_ONLY_ACTIVATION_TRIAL_REQUEST_INVALID' using errcode = '22023';
  end if;
  payload_value := jsonb_build_object(
    'restaurant_id', input_restaurant_id,
    'action', input_action,
    'snapshot_sha256', input_expected_snapshot_sha256,
    'previous_receipt_id', input_expected_previous_receipt_id,
    'reference', input_reference,
    'confirmation', input_confirmation
  );
  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-activation-trial-request:' || input_request_id::text, 0
  ));
  select * into prior_request
  from public.test_only_activation_trial_receipts receipt
  where receipt.request_id = input_request_id;
  if prior_request.id is not null then
    if prior_request.actor_id is distinct from auth.uid()
      or prior_request.decision_payload is distinct from payload_value then
      raise exception 'TEST_ONLY_ACTIVATION_TRIAL_REPLAY_CONFLICT' using errcode = '22023';
    end if;
    return prior_request.result || jsonb_build_object('idempotent', true, 'historical_receipt', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'test-only-activation-trial:' || input_restaurant_id::text, 0
  ));
  perform project_bootstrap.require_runtime_binding(true);
  perform public.require_legal_bundle_admin_internal();
  snapshot_value := public.test_only_activation_trial_snapshot_internal(input_restaurant_id);
  if snapshot_value is null then
    raise exception 'TEST_ONLY_ACTIVATION_TRIAL_CONTEXT_INVALID' using errcode = '42501';
  end if;
  snapshot_sha256_value := encode(
    extensions.digest(convert_to(snapshot_value::text, 'UTF8'), 'sha256'), 'hex'
  );
  if snapshot_sha256_value is distinct from input_expected_snapshot_sha256 then
    raise exception 'TEST_ONLY_ACTIVATION_TRIAL_STALE' using errcode = 'P0001';
  end if;
  if input_confirmation is distinct from
    'TEST_ONLY ' || input_action || ' ' || (snapshot_value->>'restaurant_id') then
    raise exception 'TEST_ONLY_ACTIVATION_TRIAL_CONFIRMATION_REQUIRED' using errcode = '22023';
  end if;

  select * into previous
  from public.test_only_activation_trial_receipts receipt
  where receipt.restaurant_id = input_restaurant_id
  order by receipt.sequence desc
  limit 1;
  if previous.id is distinct from input_expected_previous_receipt_id then
    raise exception 'TEST_ONLY_ACTIVATION_TRIAL_STALE' using errcode = 'P0001';
  end if;
  if input_action = 'ACTIVATION_READINESS_TEST' then
    if previous.id is not null then
      raise exception 'TEST_ONLY_ACTIVATION_TRIAL_TRANSITION_INVALID' using errcode = '42501';
    end if;
  elsif previous.id is null or previous.action <> 'ACTIVATION_READINESS_TEST'
    or previous.snapshot_sha256 is distinct from snapshot_sha256_value then
    raise exception 'TEST_ONLY_ACTIVATION_TRIAL_TRANSITION_INVALID' using errcode = '42501';
  end if;

  select max(to_timestamp((method->>'timestamp')::double precision))
  into totp_at_value
  from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) method
  where jsonb_typeof(method) = 'object'
    and method->>'method' = 'totp'
    and coalesce(method->>'timestamp', '') ~ '^[0-9]+([.][0-9]+)?$';
  if input_action = 'TRIAL_READINESS_TEST' then
    previous_totp_at := nullif(previous.auth_evidence->>'totp_at', '')::timestamptz;
    if previous_totp_at is null or totp_at_value is null or totp_at_value <= previous_totp_at then
      raise exception 'TEST_ONLY_ACTIVATION_TRIAL_NEW_TOTP_REQUIRED' using errcode = '42501';
    end if;
  end if;

  auth_evidence_value := jsonb_build_object(
    'aal', 'aal2',
    'amr_method', 'totp',
    'totp_at', totp_at_value,
    'role', public.current_platform_role(),
    'actor_id', auth.uid(),
    'session_sha256', encode(
      extensions.digest(convert_to(auth.jwt()->>'session_id', 'UTF8'), 'sha256'), 'hex'
    )
  );
  result_value := jsonb_build_object(
    'receipt_id', receipt_id_value,
    'action', input_action,
    'restaurant_id', input_restaurant_id,
    'organization_id', (snapshot_value->>'organization_id')::uuid,
    'branch_id', (snapshot_value->>'branch_id')::uuid,
    'case_id', (snapshot_value->>'case_id')::uuid,
    'material_revision', (snapshot_value->>'material_revision')::bigint,
    'snapshot_sha256', snapshot_sha256_value,
    'synthetic_test_only', true,
    'real_activation', false,
    'real_trial', false,
    'synthetic_chain_complete', input_action = 'TRIAL_READINESS_TEST',
    'idempotent', false
  );

  insert into public.test_only_activation_trial_receipts (
    id, restaurant_id, organization_id, branch_id, case_id, material_revision,
    action, actor_id, request_id, previous_receipt_id, kyb_receipt_id,
    platform_terms_publication_id, merchant_legal_publication_id,
    snapshot, snapshot_sha256, reference, decision_payload, auth_evidence, result
  ) values (
    receipt_id_value, input_restaurant_id,
    (snapshot_value->>'organization_id')::uuid,
    (snapshot_value->>'branch_id')::uuid,
    (snapshot_value->>'case_id')::uuid,
    (snapshot_value->>'material_revision')::bigint,
    input_action, auth.uid(), input_request_id, previous.id,
    (snapshot_value#>>'{kyb,receipt_id}')::uuid,
    (snapshot_value#>>'{legal,platform_publication_id}')::uuid,
    (snapshot_value#>>'{legal,merchant_publication_id}')::uuid,
    snapshot_value, snapshot_sha256_value, input_reference,
    payload_value, auth_evidence_value, result_value
  );

  receipt_sha256_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'receipt_id', receipt_id_value,
    'restaurant_id', input_restaurant_id,
    'action', input_action,
    'actor_id', auth.uid(),
    'request_id', input_request_id,
    'previous_receipt_id', previous.id,
    'snapshot_sha256', snapshot_sha256_value,
    'reference', input_reference,
    'auth_evidence', auth_evidence_value,
    'result', result_value
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.test_only_activation_trial_audit (
    receipt_id, restaurant_id, organization_id, branch_id, case_id,
    material_revision, action, actor_id, request_id, previous_receipt_id,
    snapshot_sha256, receipt_sha256, event_type
  ) values (
    receipt_id_value, input_restaurant_id,
    (snapshot_value->>'organization_id')::uuid,
    (snapshot_value->>'branch_id')::uuid,
    (snapshot_value->>'case_id')::uuid,
    (snapshot_value->>'material_revision')::bigint,
    input_action, auth.uid(), input_request_id, previous.id,
    snapshot_sha256_value, receipt_sha256_value,
    case input_action
      when 'ACTIVATION_READINESS_TEST' then 'TEST_ONLY_ACTIVATION_READINESS_RECORDED'
      else 'TEST_ONLY_TRIAL_READINESS_RECORDED'
    end
  );
  return result_value;
end;
$function$;

revoke all on function public.decide_platform_test_only_activation_trial(
  uuid, text, text, uuid, text, text, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.decide_platform_test_only_activation_trial(
  uuid, text, text, uuid, text, text, uuid
) to authenticated;

comment on table public.test_only_activation_trial_receipts is
  'Immutable synthetic TEST_ONLY readiness receipts. They are never real activation, trial, billing, legal or catalog evidence.';
comment on function public.decide_platform_test_only_activation_trial(
  uuid, text, text, uuid, text, text, uuid
) is
  'Appends synthetic activation/trial readiness evidence after current TEST_ONLY KYB and legal evidence; writes no operational or commercial state.';

notify pgrst, 'reload schema';
commit;
