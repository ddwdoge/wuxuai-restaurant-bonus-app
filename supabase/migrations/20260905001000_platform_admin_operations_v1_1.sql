-- Platform Admin Operations V1.1: explicit, audited support actions only.
-- Billing, gift assignment, daily PIN values and arbitrary table writes remain out of scope.

create table if not exists public.platform_admin_operations (
  id uuid primary key default extensions.gen_random_uuid(),
  platform_admin_user_id uuid not null references auth.users(id) on delete restrict,
  platform_admin_role text not null,
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  tenant_id uuid not null references public.restaurants(id) on delete restrict,
  severity text not null check (severity in ('NORMAL', 'SENSITIVE', 'CRITICAL')),
  reason text,
  support_reference text,
  before_state jsonb,
  after_state jsonb,
  result text not null check (result in ('SUCCESS', 'BLOCKED', 'FAILED')),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (platform_admin_user_id, action_type, tenant_id, idempotency_key)
);

create index if not exists platform_admin_operations_tenant_time_idx
on public.platform_admin_operations (tenant_id, created_at desc);

alter table public.platform_admin_operations enable row level security;
revoke all on table public.platform_admin_operations from public, anon, authenticated;

create table if not exists public.platform_security_flags (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  flag_key text not null check (flag_key in ('suspected_account_compromise', 'qr_misuse', 'pin_abuse', 'tenant_review')),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLEARED')),
  reason text not null,
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  cleared_by uuid references auth.users(id) on delete restrict,
  cleared_at timestamptz,
  unique (restaurant_id, flag_key)
);

alter table public.platform_security_flags enable row level security;
revoke all on table public.platform_security_flags from public, anon, authenticated;

create or replace function public.platform_operation_role_can_write(input_action text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case
    when input_action in ('tenant_suspend', 'tenant_unsuspend', 'security_flag_set', 'security_flag_clear')
      then public.current_platform_role() in ('platform_owner', 'platform_admin', 'security_admin')
    else public.current_platform_role() in ('platform_owner', 'platform_admin', 'support')
  end;
$$;

revoke execute on function public.platform_operation_role_can_write(text) from public, anon, authenticated;

create or replace function public.get_platform_restaurant_operations(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare result jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Nicht berechtigt.' using errcode = '42501'; end if;
  if not exists (select 1 from public.restaurants where id = input_restaurant_id) then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;

  select jsonb_build_object(
    'contract_version', 'platform_admin_operations_v1_1',
    'restaurant', jsonb_build_object(
      'id', r.id, 'name', r.name, 'status', r.status,
      'organization_status', o.status,
      'published', coalesce(b.is_discoverable, false),
      'branch_id', b.id
    ),
    'owner', jsonb_build_object(
      'user_id', r.owner_id,
      'email', u.email,
      'email_confirmed', u.email_confirmed_at is not null,
      'last_sign_in_at', u.last_sign_in_at,
      'membership_present', exists (
        select 1 from public.restaurant_members rm
        where rm.restaurant_id = r.id and rm.user_id = r.owner_id and rm.role = 'owner'
      ),
      'memberships', coalesce((
        select jsonb_agg(jsonb_build_object('restaurant_id', rm.restaurant_id, 'role', rm.role, 'created_at', rm.created_at))
        from public.restaurant_members rm where rm.user_id = r.owner_id
      ), '[]'::jsonb)
    ),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sm.id, 'name', sm.name, 'email', sm.email, 'role', sm.role,
        'status', sm.account_status, 'active', sm.active,
        'auth_linked', sm.auth_user_id is not null,
        'membership_present', exists (
          select 1 from public.restaurant_members rm
          where rm.restaurant_id = sm.restaurant_id and rm.user_id = sm.auth_user_id and rm.role in ('staff', 'supervisor')
        ),
        'last_invited_at', sm.last_invited_at
      ) order by sm.created_at desc) from public.staff_members sm where sm.restaurant_id = r.id
    ), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'points_balance', c.points_balance,
        'membership_status', c.membership_status,
        'auth_linked', c.auth_user_id is not null,
        'central_membership_present', cam.id is not null,
        'account_disabled', ca.disabled_at is not null
      ) order by c.created_at desc) from public.customers c
      left join public.customer_account_memberships cam on cam.customer_id = c.id and cam.restaurant_id = c.restaurant_id
      left join public.customer_accounts ca on ca.id = cam.account_id
      where c.restaurant_id = r.id
    ), '[]'::jsonb),
    'points_journal', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pt.id, 'customer_id', pt.customer_id, 'type', pt.type, 'points', pt.points,
        'reason', pt.reason, 'source', pt.collection_source,
        'staff_user_id', pt.staff_user_id, 'created_at', pt.created_at
      ) order by pt.created_at desc) from (
        select * from public.points_transactions where restaurant_id = r.id order by created_at desc limit 100
      ) pt
    ), '[]'::jsonb),
    'gifts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cr.id, 'customer_id', cr.customer_id, 'reward_id', cr.reward_id,
        'status', cr.status, 'gift_type', cr.gift_type, 'created_at', cr.created_at, 'redeemed_at', cr.redeemed_at
      ) order by cr.created_at desc) from (
        select * from public.customer_rewards where restaurant_id = r.id order by created_at desc limit 100
      ) cr
    ), '[]'::jsonb),
    'gift_presentations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', gp.id, 'customer_id', gp.customer_id, 'customer_reward_id', gp.customer_reward_id,
        'status', gp.status, 'expires_at', gp.expires_at, 'redeemed_at', gp.redeemed_at,
        'expired_at', gp.expired_at, 'created_at', gp.created_at
      ) order by gp.created_at desc) from (
        select * from public.gift_redemption_presentations where restaurant_id = r.id order by created_at desc limit 100
      ) gp
    ), '[]'::jsonb),
    'redemptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', raj.id, 'customer_id', raj.customer_id, 'reward_type', raj.reward_type,
        'status', raj.status, 'redeemed_at', raj.redeemed_at, 'actor_role', raj.actor_role
      ) order by raj.redeemed_at desc) from (
        select * from public.redemption_activity_journal where restaurant_id = r.id order by redeemed_at desc limit 100
      ) raj
    ), '[]'::jsonb),
    'qr_evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', qr.id, 'customer_id', qr.customer_id, 'expires_at', qr.expires_at,
        'consumed_at', qr.consumed_at, 'revoked_at', qr.revoked_at, 'created_at', qr.created_at
      ) order by qr.created_at desc) from (
        select * from public.customer_points_qr_references where restaurant_id = r.id order by created_at desc limit 100
      ) qr
    ), '[]'::jsonb),
    'pin_evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id, 'customer_id', pa.customer_id, 'valid_date', pa.valid_date,
        'failed_attempts', pa.failed_attempts, 'locked_until', pa.locked_until, 'last_failed_at', pa.last_failed_at
      ) order by pa.updated_at desc) from (
        select * from public.daily_pin_attempts where restaurant_id = r.id order by updated_at desc limit 100
      ) pa
    ), '[]'::jsonb),
    'mail_queue', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', mail.id, 'customer_id', mail.customer_id, 'event_type', mail.event_type,
        'status', mail.status, 'attempt_count', mail.attempt_count,
        'available_at', mail.available_at, 'failed_at', mail.failed_at,
        'last_error_code', mail.last_error_code
      ) order by mail.created_at desc) from (
        select * from public.customer_transactional_email_deliveries where restaurant_id = r.id order by created_at desc limit 100
      ) mail
    ), '[]'::jsonb),
    'security_flags', coalesce((
      select jsonb_agg(to_jsonb(flag) - 'reason' || jsonb_build_object('reason', flag.reason) order by flag.opened_at desc)
      from public.platform_security_flags flag where flag.restaurant_id = r.id
    ), '[]'::jsonb),
    'operations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', op.id, 'action_type', op.action_type, 'entity_type', op.entity_type,
        'entity_id', op.entity_id, 'severity', op.severity, 'reason', op.reason,
        'support_reference', op.support_reference, 'result', op.result, 'created_at', op.created_at
      ) order by op.created_at desc) from (
        select * from public.platform_admin_operations where tenant_id = r.id order by created_at desc limit 100
      ) op
    ), '[]'::jsonb)
  ) into result
  from public.restaurants r
  left join public.organizations o on o.id = r.organization_id
  left join public.branches b on b.id = coalesce(r.primary_branch_id, (
    select b2.id from public.branches b2 where b2.restaurant_id = r.id order by b2.created_at limit 1
  ))
  left join auth.users u on u.id = r.owner_id
  where r.id = input_restaurant_id;

  return result;
end;
$$;

revoke execute on function public.get_platform_restaurant_operations(uuid) from public, anon;
grant execute on function public.get_platform_restaurant_operations(uuid) to authenticated;

create or replace function public.execute_platform_admin_operation(
  input_restaurant_id uuid,
  input_action text,
  input_entity_id uuid,
  input_reason text,
  input_support_reference text,
  input_confirmation text,
  input_idempotency_key uuid,
  input_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id_value uuid := auth.uid();
  role_value text := public.current_platform_role();
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  severity_value text;
  entity_type_value text;
  before_value jsonb;
  after_value jsonb;
  amount_value integer;
  next_balance integer;
  branch_id_value uuid;
  operation_id_value uuid;
begin
  if actor_id_value is null or not public.platform_operation_role_can_write(input_action) then
    raise exception 'Nicht berechtigt.' using errcode = '42501';
  end if;
  if input_idempotency_key is null then raise exception 'Vorgangskennung fehlt.'; end if;
  select * into restaurant_record from public.restaurants where id = input_restaurant_id for update;
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;

  if input_action not in (
    'restaurant_activate', 'restaurant_inactivate', 'restaurant_publish', 'restaurant_unpublish',
    'tenant_suspend', 'tenant_unsuspend', 'security_flag_set', 'security_flag_clear',
    'owner_membership_repair', 'staff_suspend', 'staff_reactivate', 'staff_invitation_revoke',
    'customer_membership_repair', 'customer_deactivate', 'customer_reactivate',
    'points_support_correction', 'qr_invalidate', 'gift_presentation_expire',
    'transactional_mail_retry'
  ) then raise exception 'Aktion ist nicht freigegeben.'; end if;

  severity_value := case
    when input_action in ('tenant_suspend', 'tenant_unsuspend') then 'CRITICAL'
    when input_action in ('restaurant_publish', 'restaurant_unpublish', 'security_flag_set', 'security_flag_clear',
      'owner_membership_repair', 'staff_suspend', 'staff_reactivate', 'staff_invitation_revoke',
      'customer_membership_repair', 'customer_deactivate', 'customer_reactivate',
      'points_support_correction', 'qr_invalidate', 'gift_presentation_expire', 'transactional_mail_retry') then 'SENSITIVE'
    else 'NORMAL' end;
  if severity_value <> 'NORMAL' and length(trim(coalesce(input_reason, ''))) < 10 then
    raise exception 'Eine nachvollziehbare Begründung mit mindestens 10 Zeichen ist erforderlich.';
  end if;
  if severity_value <> 'NORMAL' and input_confirmation <> 'CONFIRMED' then
    raise exception 'Bestätigung fehlt.';
  end if;
  if severity_value = 'CRITICAL' and input_confirmation <> 'CONFIRMED:' || restaurant_record.name then
    raise exception 'Restaurantname wurde nicht korrekt bestätigt.';
  end if;

  select id into operation_id_value from public.platform_admin_operations
  where platform_admin_user_id = actor_id_value and action_type = input_action
    and tenant_id = input_restaurant_id and idempotency_key = input_idempotency_key;
  if operation_id_value is not null then
    return jsonb_build_object('success', true, 'idempotent', true, 'operation_id', operation_id_value);
  end if;

  branch_id_value := coalesce(restaurant_record.primary_branch_id, public.ensure_restaurant_branch(input_restaurant_id));
  entity_type_value := split_part(input_action, '_', 1);

  if input_action in ('restaurant_activate', 'restaurant_inactivate') then
    if restaurant_record.status = 'suspended' then raise exception 'Gesperrte Tenants werden nur über die Sicherheitsaktion entsperrt.'; end if;
    before_value := jsonb_build_object('status', restaurant_record.status);
    update public.restaurants set status = case when input_action = 'restaurant_activate' then 'active' else 'draft' end
    where id = input_restaurant_id;
    update public.branches set status = case when input_action = 'restaurant_activate' then 'active' else 'draft' end
    where restaurant_id = input_restaurant_id and status <> 'suspended';
    select jsonb_build_object('status', status) into after_value from public.restaurants where id = input_restaurant_id;

  elsif input_action in ('restaurant_publish', 'restaurant_unpublish') then
    before_value := jsonb_build_object('is_discoverable', (select is_discoverable from public.branches where id = branch_id_value));
    if input_action = 'restaurant_publish' then
      if restaurant_record.status <> 'active' or not coalesce((public.restaurant_registration_readiness(input_restaurant_id, current_date)->>'registration_allowed')::boolean, false) then
        raise exception 'Restaurant ist nicht veröffentlichungsbereit.';
      end if;
      update public.branches set is_discoverable = true where id = branch_id_value and status = 'active';
    else
      update public.branches set is_discoverable = false where id = branch_id_value;
    end if;
    select jsonb_build_object('is_discoverable', is_discoverable) into after_value from public.branches where id = branch_id_value;

  elsif input_action in ('tenant_suspend', 'tenant_unsuspend') then
    before_value := jsonb_build_object('restaurant_status', restaurant_record.status);
    update public.restaurants set status = case when input_action = 'tenant_suspend' then 'suspended' else 'active' end where id = input_restaurant_id;
    update public.organizations set status = case when input_action = 'tenant_suspend' then 'suspended' else 'active' end where id = restaurant_record.organization_id;
    update public.branches set status = case when input_action = 'tenant_suspend' then 'suspended' else 'active' end,
      is_discoverable = case when input_action = 'tenant_suspend' then false else is_discoverable end
    where restaurant_id = input_restaurant_id;
    after_value := jsonb_build_object('restaurant_status', case when input_action = 'tenant_suspend' then 'suspended' else 'active' end);

  elsif input_action in ('security_flag_set', 'security_flag_clear') then
    if coalesce(input_payload->>'flag_key', '') not in ('suspected_account_compromise', 'qr_misuse', 'pin_abuse', 'tenant_review') then
      raise exception 'Sicherheitskennzeichnung ist ungültig.';
    end if;
    select to_jsonb(f) into before_value from public.platform_security_flags f
      where restaurant_id = input_restaurant_id and flag_key = input_payload->>'flag_key';
    insert into public.platform_security_flags (restaurant_id, flag_key, status, reason, opened_by, cleared_by, cleared_at)
    values (input_restaurant_id, input_payload->>'flag_key', case when input_action = 'security_flag_set' then 'OPEN' else 'CLEARED' end,
      trim(input_reason), actor_id_value, case when input_action = 'security_flag_clear' then actor_id_value end,
      case when input_action = 'security_flag_clear' then now() end)
    on conflict (restaurant_id, flag_key) do update set
      status = excluded.status, reason = excluded.reason,
      cleared_by = excluded.cleared_by, cleared_at = excluded.cleared_at;
    select to_jsonb(f) into after_value from public.platform_security_flags f
      where restaurant_id = input_restaurant_id and flag_key = input_payload->>'flag_key';

  elsif input_action = 'owner_membership_repair' then
    if input_entity_id is distinct from restaurant_record.owner_id then raise exception 'Betreiberzuordnung ist nicht kanonisch.'; end if;
    before_value := jsonb_build_object('membership_present', exists(select 1 from public.restaurant_members where restaurant_id=input_restaurant_id and user_id=input_entity_id and role='owner'));
    insert into public.restaurant_members (restaurant_id, user_id, role) values (input_restaurant_id, input_entity_id, 'owner')
    on conflict (restaurant_id, user_id) do update set role = 'owner'
    where public.restaurant_members.user_id = restaurant_record.owner_id;
    after_value := jsonb_build_object('membership_present', true);

  elsif input_action in ('staff_suspend', 'staff_reactivate', 'staff_invitation_revoke') then
    select to_jsonb(sm) into before_value from public.staff_members sm where sm.id=input_entity_id and sm.restaurant_id=input_restaurant_id for update;
    if before_value is null then raise exception 'Mitarbeiter wurde nicht gefunden.'; end if;
    update public.staff_members set
      active = input_action = 'staff_reactivate',
      account_status = case when input_action='staff_reactivate' then 'active' when input_action='staff_suspend' then 'suspended' else 'archived' end,
      suspended_at = case when input_action='staff_suspend' then now() else null end,
      archived_at = case when input_action='staff_invitation_revoke' then now() else archived_at end,
      updated_at = now()
    where id=input_entity_id;
    if input_action = 'staff_reactivate' then
      insert into public.restaurant_members (restaurant_id, user_id, role)
      select sm.restaurant_id, sm.auth_user_id, sm.role from public.staff_members sm
      where sm.id=input_entity_id and sm.auth_user_id is not null
      on conflict (restaurant_id, user_id) do update set role=excluded.role
      where public.restaurant_members.role in ('staff','supervisor');
    end if;
    if input_action <> 'staff_reactivate' then
      delete from public.restaurant_members rm using public.staff_members sm
      where sm.id=input_entity_id and rm.restaurant_id=sm.restaurant_id and rm.user_id=sm.auth_user_id and rm.role in ('staff','supervisor');
    end if;
    select to_jsonb(sm) into after_value from public.staff_members sm where sm.id=input_entity_id;

  elsif input_action in ('customer_deactivate', 'customer_reactivate') then
    select * into customer_record from public.customers where id=input_entity_id and restaurant_id=input_restaurant_id for update;
    if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;
    before_value := jsonb_build_object('membership_status', customer_record.membership_status);
    update public.customers set membership_status = case when input_action='customer_deactivate' then 'restricted' else 'active' end where id=input_entity_id;
    after_value := jsonb_build_object('membership_status', case when input_action='customer_deactivate' then 'restricted' else 'active' end);

  elsif input_action = 'customer_membership_repair' then
    select * into customer_record from public.customers where id=input_entity_id and restaurant_id=input_restaurant_id for update;
    if customer_record.id is null or customer_record.auth_user_id is null then raise exception 'Kanonische Kundenidentität fehlt.'; end if;
    if not exists (select 1 from public.customer_accounts ca where ca.auth_user_id=customer_record.auth_user_id and ca.disabled_at is null) then
      raise exception 'Aktives Kundenkonto wurde nicht gefunden.';
    end if;
    before_value := jsonb_build_object('membership_present', exists(select 1 from public.customer_account_memberships where customer_id=input_entity_id));
    insert into public.customer_account_memberships (account_id, restaurant_id, customer_id, last_opened_at)
    select ca.id, input_restaurant_id, input_entity_id, now() from public.customer_accounts ca where ca.auth_user_id=customer_record.auth_user_id
    on conflict (customer_id) do update set account_id=excluded.account_id, restaurant_id=excluded.restaurant_id, last_opened_at=excluded.last_opened_at;
    after_value := jsonb_build_object('membership_present', exists(select 1 from public.customer_account_memberships where customer_id=input_entity_id));

  elsif input_action = 'points_support_correction' then
    amount_value := (input_payload->>'amount')::integer;
    if amount_value is null or amount_value = 0 or abs(amount_value) > 500 then raise exception 'Korrekturbetrag ist ungültig.'; end if;
    if length(trim(coalesce(input_support_reference,''))) < 3 then raise exception 'Support-Referenz fehlt.'; end if;
    select * into customer_record from public.customers where id=input_entity_id and restaurant_id=input_restaurant_id for update;
    if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;
    next_balance := customer_record.points_balance + amount_value;
    if next_balance < 0 then raise exception 'Punktestand darf nicht negativ werden.'; end if;
    before_value := jsonb_build_object('points_balance', customer_record.points_balance);
    insert into public.points_transactions (restaurant_id, customer_id, type, points, reason, collection_source, idempotency_key)
    values (input_restaurant_id, input_entity_id, 'adjust', amount_value, trim(input_reason), 'platform_support_correction', input_idempotency_key);
    update public.customers set points_balance=next_balance where id=input_entity_id;
    after_value := jsonb_build_object('points_balance', next_balance, 'correction', amount_value);

  elsif input_action = 'qr_invalidate' then
    select jsonb_build_object('revoked_at', revoked_at, 'consumed_at', consumed_at, 'expires_at', expires_at) into before_value
      from public.customer_points_qr_references where id=input_entity_id and restaurant_id=input_restaurant_id for update;
    if before_value is null then raise exception 'QR-Referenz wurde nicht gefunden.'; end if;
    if before_value->>'consumed_at' is not null then raise exception 'Verbrauchter QR kann nicht verändert werden.'; end if;
    update public.customer_points_qr_references set revoked_at=coalesce(revoked_at, now()) where id=input_entity_id and restaurant_id=input_restaurant_id;
    select jsonb_build_object('revoked_at', revoked_at, 'consumed_at', consumed_at, 'expires_at', expires_at) into after_value
      from public.customer_points_qr_references where id=input_entity_id;

  elsif input_action = 'gift_presentation_expire' then
    select jsonb_build_object('status', status, 'expires_at', expires_at) into before_value
      from public.gift_redemption_presentations where id=input_entity_id and restaurant_id=input_restaurant_id for update;
    if before_value is null or before_value->>'status' <> 'REDEMPTION_STARTED' or (before_value->>'expires_at')::timestamptz > now() then
      raise exception 'Nur abgelaufene aktive Präsentationen können bereinigt werden.';
    end if;
    update public.gift_redemption_presentations set status='EXPIRED', expired_at=now()
      where id=input_entity_id and restaurant_id=input_restaurant_id;
    update public.customer_rewards gift set
      status=case when gift.valid_until is not null and gift.valid_until <= now() then 'expired' else 'active' end,
      redemption_started_at=null
    from public.gift_redemption_presentations presentation
    where presentation.id=input_entity_id and presentation.customer_reward_id=gift.id and gift.status='redemption_started';
    after_value := jsonb_build_object('status', 'EXPIRED');

  elsif input_action = 'transactional_mail_retry' then
    select jsonb_build_object('status', status, 'attempt_count', attempt_count) into before_value
      from public.customer_transactional_email_deliveries where id=input_entity_id and restaurant_id=input_restaurant_id for update;
    if before_value is null or before_value->>'status' <> 'FAILED' then raise exception 'Nur fehlgeschlagene E-Mails können erneut eingeplant werden.'; end if;
    update public.customer_transactional_email_deliveries set status='PENDING', available_at=now(), processing_started_at=null,
      failed_at=null, last_error_code=null, last_error=null, updated_at=now() where id=input_entity_id;
    after_value := jsonb_build_object('status', 'PENDING', 'attempt_count', (before_value->>'attempt_count')::integer);
  end if;

  insert into public.platform_admin_operations (
    platform_admin_user_id, platform_admin_role, action_type, entity_type, entity_id, tenant_id,
    severity, reason, support_reference, before_state, after_state, result, idempotency_key
  ) values (
    actor_id_value, role_value, input_action, entity_type_value, input_entity_id, input_restaurant_id,
    severity_value, nullif(trim(coalesce(input_reason,'')),''), nullif(trim(coalesce(input_support_reference,'')),''),
    before_value, after_value, 'SUCCESS', input_idempotency_key
  ) returning id into operation_id_value;

  return jsonb_build_object('success', true, 'idempotent', false, 'operation_id', operation_id_value, 'after', after_value);
end;
$$;

revoke execute on function public.execute_platform_admin_operation(uuid,text,uuid,text,text,text,uuid,jsonb) from public, anon;
grant execute on function public.execute_platform_admin_operation(uuid,text,uuid,text,text,text,uuid,jsonb) to authenticated;

create or replace function public.get_platform_auth_support_target(
  input_restaurant_id uuid,
  input_action text,
  input_entity_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
declare result jsonb;
begin
  if not public.platform_operation_role_can_write(input_action) then
    raise exception 'Nicht berechtigt.' using errcode = '42501';
  end if;
  if input_action in ('owner_confirmation_resend', 'owner_password_recovery') then
    select jsonb_build_object('email', u.email, 'entity_id', r.owner_id, 'entity_type', 'owner') into result
    from public.restaurants r join auth.users u on u.id=r.owner_id
    where r.id=input_restaurant_id and r.owner_id=input_entity_id;
  elsif input_action = 'staff_invitation_resend' then
    select jsonb_build_object('email', sm.email, 'entity_id', sm.id, 'entity_type', 'staff') into result
    from public.staff_members sm
    where sm.restaurant_id=input_restaurant_id and sm.id=input_entity_id
      and sm.email is not null and sm.account_status in ('invited','active');
  else
    raise exception 'Auth-Supportaktion ist nicht freigegeben.';
  end if;
  if result is null then raise exception 'Ziel wurde nicht gefunden.'; end if;
  return result;
end;
$$;

revoke execute on function public.get_platform_auth_support_target(uuid,text,uuid) from public, anon;
grant execute on function public.get_platform_auth_support_target(uuid,text,uuid) to authenticated;

create or replace function public.record_platform_auth_support_operation(
  input_restaurant_id uuid,
  input_action text,
  input_entity_id uuid,
  input_reason text,
  input_support_reference text,
  input_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare operation_id_value uuid;
begin
  if not public.platform_operation_role_can_write(input_action) then raise exception 'Nicht berechtigt.' using errcode='42501'; end if;
  if input_action not in ('owner_confirmation_resend','owner_password_recovery','staff_invitation_resend') then raise exception 'Aktion ist nicht freigegeben.'; end if;
  if length(trim(coalesce(input_reason,''))) < 10 then raise exception 'Begründung fehlt.'; end if;
  insert into public.platform_admin_operations (
    platform_admin_user_id, platform_admin_role, action_type, entity_type, entity_id, tenant_id,
    severity, reason, support_reference, after_state, result, idempotency_key
  ) values (
    auth.uid(), public.current_platform_role(), input_action,
    case when input_action like 'owner_%' then 'owner' else 'staff' end,
    input_entity_id, input_restaurant_id, 'SENSITIVE', trim(input_reason),
    nullif(trim(coalesce(input_support_reference,'')),''), jsonb_build_object('delivery_requested', true),
    'SUCCESS', input_idempotency_key
  ) on conflict (platform_admin_user_id, action_type, tenant_id, idempotency_key)
    do update set idempotency_key=excluded.idempotency_key
  returning id into operation_id_value;
  return operation_id_value;
end;
$$;

revoke execute on function public.record_platform_auth_support_operation(uuid,text,uuid,text,text,uuid) from public, anon;
grant execute on function public.record_platform_auth_support_operation(uuid,text,uuid,text,text,uuid) to authenticated;

-- Keep the legacy subscription endpoint for trial/subscription status only.
alter function public.update_platform_restaurant_subscription(uuid,text,text,text,integer,text)
rename to update_platform_restaurant_subscription_internal_v1;
revoke execute on function public.update_platform_restaurant_subscription_internal_v1(uuid,text,text,text,integer,text)
from public, anon, authenticated;

create or replace function public.update_platform_restaurant_subscription(
  input_restaurant_id uuid,
  input_subscription_status text default null,
  input_payment_status text default null,
  input_restaurant_status text default null,
  input_trial_extension_days integer default null,
  input_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if input_payment_status is not null then
    raise exception 'Manuelle Zahlungsstatus sind bis zur Stripe-Integration gesperrt.' using errcode = '42501';
  end if;
  if input_restaurant_status is not null then
    raise exception 'Restaurant-Lifecycle wird über den Operations-Vertrag verwaltet.' using errcode = '42501';
  end if;
  return public.update_platform_restaurant_subscription_internal_v1(
    input_restaurant_id, input_subscription_status, null, null, input_trial_extension_days, input_reason
  );
end;
$$;

revoke execute on function public.update_platform_restaurant_subscription(uuid,text,text,text,integer,text) from public, anon;
grant execute on function public.update_platform_restaurant_subscription(uuid,text,text,text,integer,text) to authenticated;

notify pgrst, 'reload schema';
