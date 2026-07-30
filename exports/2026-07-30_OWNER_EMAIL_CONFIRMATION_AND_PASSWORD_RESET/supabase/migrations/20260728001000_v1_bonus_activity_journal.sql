-- V1 bonus activity journal. This is an internal bonus-program record,
-- not a cash-register, RKSV, accounting, or tax record.

create sequence if not exists public.redemption_activity_number_seq;

create table if not exists public.redemption_activity_journal (
  id uuid primary key default gen_random_uuid(),
  activity_number text not null unique,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  customer_reference text not null,
  source_type text not null,
  source_id uuid not null,
  reward_id uuid references public.rewards(id) on delete set null,
  reward_type text not null check (reward_type in (
    'POINT_REWARD', 'WELCOME_GIFT', 'BIRTHDAY_GIFT',
    'REFERRAL_REWARD', 'PROMOTIONAL_GIFT', 'MANUAL_COMPENSATION'
  )),
  reward_name_snapshot text,
  reward_description_snapshot text,
  points_spent integer not null default 0 check (points_spent >= 0),
  quantity integer not null default 1 check (quantity > 0),
  redeemed_at timestamptz not null,
  redeemed_by uuid,
  actor_role text not null,
  redemption_code_reference text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELLED')),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,
  cancellation_audit_id uuid references public.audit_log(id) on delete set null,
  audit_reference uuid references public.audit_log(id) on delete set null,
  snapshot_completeness text not null check (snapshot_completeness in (
    'complete', 'partial_legacy', 'missing_source_data'
  )),
  is_test_event boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_type, source_id),
  check (
    (status = 'ACTIVE' and cancelled_at is null and cancelled_by is null and cancellation_reason is null)
    or
    (status = 'CANCELLED' and cancelled_at is not null and cancelled_by is not null and length(trim(cancellation_reason)) >= 10)
  )
);

create index if not exists redemption_activity_journal_restaurant_time_idx
on public.redemption_activity_journal (restaurant_id, redeemed_at desc);

create index if not exists redemption_activity_journal_branch_time_idx
on public.redemption_activity_journal (branch_id, redeemed_at desc);

create index if not exists redemption_activity_journal_type_status_idx
on public.redemption_activity_journal (restaurant_id, reward_type, status, redeemed_at desc);

alter table public.redemption_activity_journal enable row level security;

create or replace function public.is_bonus_report_admin(input_restaurant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurant_id = input_restaurant_id
      and rm.user_id = auth.uid()
      and rm.role in ('owner', 'admin')
  );
$$;

revoke execute on function public.is_bonus_report_admin(uuid) from public, anon, authenticated;

drop policy if exists "bonus activity journal owner select" on public.redemption_activity_journal;
create policy "bonus activity journal owner select"
on public.redemption_activity_journal for select
using (public.is_bonus_report_admin(restaurant_id));

revoke all on public.redemption_activity_journal from public, anon, authenticated;

create or replace function public.protect_redemption_activity_journal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Einlösungsaktivitäten dürfen nicht gelöscht werden.';
  end if;

  if coalesce(current_setting('wuxuai.allow_activity_cancellation', true), '') <> 'on' then
    raise exception 'Historische Einlösungsaktivitäten dürfen nicht geändert werden.';
  end if;

  if new.id is distinct from old.id
     or new.activity_number is distinct from old.activity_number
     or new.restaurant_id is distinct from old.restaurant_id
     or new.organization_id is distinct from old.organization_id
     or new.branch_id is distinct from old.branch_id
     or new.customer_id is distinct from old.customer_id
     or new.customer_reference is distinct from old.customer_reference
     or new.source_type is distinct from old.source_type
     or new.source_id is distinct from old.source_id
     or new.reward_id is distinct from old.reward_id
     or new.reward_type is distinct from old.reward_type
     or new.reward_name_snapshot is distinct from old.reward_name_snapshot
     or new.reward_description_snapshot is distinct from old.reward_description_snapshot
     or new.points_spent is distinct from old.points_spent
     or new.quantity is distinct from old.quantity
     or new.redeemed_at is distinct from old.redeemed_at
     or new.redeemed_by is distinct from old.redeemed_by
     or new.actor_role is distinct from old.actor_role
     or new.redemption_code_reference is distinct from old.redemption_code_reference
     or new.audit_reference is distinct from old.audit_reference
     or new.snapshot_completeness is distinct from old.snapshot_completeness
     or new.is_test_event is distinct from old.is_test_event
     or new.created_at is distinct from old.created_at then
    raise exception 'Historische Snapshotfelder dürfen nicht geändert werden.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_redemption_activity_journal_trigger on public.redemption_activity_journal;
create trigger protect_redemption_activity_journal_trigger
before update or delete on public.redemption_activity_journal
for each row execute function public.protect_redemption_activity_journal();

create or replace function public.write_redemption_activity(
  input_redemption_code_id uuid,
  input_redeemed_by uuid,
  input_actor_role text,
  input_audit_reference uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code_record public.redemption_codes%rowtype;
  reward_record public.rewards%rowtype;
  customer_record public.customers%rowtype;
  points_value integer := 0;
  activity_id_value uuid;
  activity_number_value text;
  reward_type_value text;
begin
  select * into code_record
  from public.redemption_codes
  where id = input_redemption_code_id and status = 'redeemed';
  if code_record.id is null then raise exception 'Abgeschlossene Einlösung wurde nicht gefunden.'; end if;

  select * into reward_record from public.rewards where id = code_record.reward_id;
  select * into customer_record from public.customers where id = code_record.customer_id;

  if code_record.redemption_type = 'points_redemption' then
    select coalesce(points_spent, 0) into points_value
    from public.reward_redemption_events
    where id = code_record.source_id;
    reward_type_value := 'POINT_REWARD';
  elsif code_record.redemption_type = 'welcome_gift' then
    reward_type_value := 'WELCOME_GIFT';
  elsif code_record.redemption_type = 'birthday_gift' then
    reward_type_value := 'BIRTHDAY_GIFT';
  elsif code_record.redemption_type = 'referral_reward' then
    reward_type_value := 'REFERRAL_REWARD';
  elsif code_record.redemption_type = 'promotional_gift' then
    reward_type_value := 'PROMOTIONAL_GIFT';
  elsif code_record.redemption_type = 'manual_compensation' then
    reward_type_value := 'MANUAL_COMPENSATION';
  else
    raise exception 'Einlösungsart kann nicht protokolliert werden.';
  end if;

  activity_number_value := 'WXB-'
    || to_char(coalesce(code_record.redeemed_at, now()) at time zone 'Europe/Vienna', 'YYYY')
    || '-' || lpad(nextval('public.redemption_activity_number_seq')::text, 8, '0');

  insert into public.redemption_activity_journal (
    activity_number, restaurant_id, organization_id, branch_id, customer_id,
    customer_reference, source_type, source_id, reward_id, reward_type,
    reward_name_snapshot, reward_description_snapshot, points_spent, quantity,
    redeemed_at, redeemed_by, actor_role, redemption_code_reference,
    status, audit_reference, snapshot_completeness, is_test_event
  ) values (
    activity_number_value, code_record.restaurant_id, code_record.organization_id,
    code_record.branch_id, code_record.customer_id,
    left(encode(extensions.digest(code_record.customer_id::text, 'sha256'), 'hex'), 16),
    code_record.redemption_type, code_record.source_id, code_record.reward_id,
    reward_type_value, reward_record.title, reward_record.description, points_value, 1,
    coalesce(code_record.redeemed_at, now()), input_redeemed_by,
    coalesce(nullif(trim(input_actor_role), ''), 'system'),
    'WUXUAI-' || upper(left(code_record.id::text, 8)), 'ACTIVE',
    input_audit_reference, 'complete', coalesce(customer_record.is_test_customer, false)
  )
  on conflict (source_type, source_id) do nothing
  returning id into activity_id_value;

  if activity_id_value is null then
    select id into activity_id_value
    from public.redemption_activity_journal
    where source_type = code_record.redemption_type and source_id = code_record.source_id;
  end if;

  return activity_id_value;
end;
$$;

revoke execute on function public.write_redemption_activity(uuid, uuid, text, uuid)
from public, anon, authenticated;

-- Legacy backfill uses only values that were already persisted with the event.
-- It never joins current reward master data for historical names or values.
insert into public.redemption_activity_journal (
  activity_number, restaurant_id, organization_id, branch_id, customer_id,
  customer_reference, source_type, source_id, reward_id, reward_type,
  reward_name_snapshot, reward_description_snapshot, points_spent, quantity,
  redeemed_at, redeemed_by, actor_role, redemption_code_reference,
  status, audit_reference, snapshot_completeness, is_test_event
)
select
  'WXB-' || to_char(rc.redeemed_at at time zone 'Europe/Vienna', 'YYYY')
    || '-' || lpad(nextval('public.redemption_activity_number_seq')::text, 8, '0'),
  rc.restaurant_id, rc.organization_id, rc.branch_id, rc.customer_id,
  left(encode(extensions.digest(rc.customer_id::text, 'sha256'), 'hex'), 16),
  rc.redemption_type, rc.source_id, rc.reward_id,
  case rc.redemption_type
    when 'points_redemption' then 'POINT_REWARD'
    when 'welcome_gift' then 'WELCOME_GIFT'
    when 'birthday_gift' then 'BIRTHDAY_GIFT'
    when 'referral_reward' then 'REFERRAL_REWARD'
    when 'promotional_gift' then 'PROMOTIONAL_GIFT'
    when 'manual_compensation' then 'MANUAL_COMPENSATION'
    else 'PROMOTIONAL_GIFT'
  end,
  nullif(rc.metadata->>'title', ''), null,
  coalesce(rre.points_spent, 0), 1, rc.redeemed_at, al.actor_id,
  coalesce(al.actor_type, 'legacy'), 'WUXUAI-' || upper(left(rc.id::text, 8)),
  'ACTIVE', al.id,
  case
    when nullif(rc.metadata->>'title', '') is null then 'missing_source_data'
    else 'partial_legacy'
  end,
  coalesce(c.is_test_customer, false)
from public.redemption_codes rc
left join public.reward_redemption_events rre
  on rc.redemption_type = 'points_redemption' and rre.id = rc.source_id
left join public.customers c on c.id = rc.customer_id
left join lateral (
  select a.id, a.actor_id, a.actor_type
  from public.audit_log a
  where a.restaurant_id = rc.restaurant_id
    and (a.entity_id = rc.id or a.target_id = rc.id)
    and coalesce(a.event_type, upper(a.action)) in ('REWARD_REDEEMED', 'REDEMPTION_CODE_CONSUMED')
  order by a.created_at desc
  limit 1
) al on true
where rc.status = 'redeemed' and rc.redeemed_at is not null
  and rc.redemption_type in (
    'points_redemption', 'welcome_gift', 'birthday_gift',
    'referral_reward', 'promotional_gift', 'manual_compensation'
  )
on conflict (source_type, source_id) do nothing;

-- Legacy coupon redemptions have no immutable title or points snapshot.
insert into public.redemption_activity_journal (
  activity_number, restaurant_id, organization_id, branch_id, customer_id,
  customer_reference, source_type, source_id, reward_id, reward_type,
  reward_name_snapshot, reward_description_snapshot, points_spent, quantity,
  redeemed_at, redeemed_by, actor_role, redemption_code_reference,
  status, snapshot_completeness, is_test_event
)
select
  'WXB-' || to_char(cr.redeemed_at at time zone 'Europe/Vienna', 'YYYY')
    || '-' || lpad(nextval('public.redemption_activity_number_seq')::text, 8, '0'),
  cr.restaurant_id, cr.organization_id, cr.branch_id, cr.customer_id,
  left(encode(extensions.digest(cr.customer_id::text, 'sha256'), 'hex'), 16),
  'legacy_coupon_redemption', cr.id, null, 'PROMOTIONAL_GIFT',
  null, null, 0, 1, cr.redeemed_at, cr.staff_member_id,
  case when cr.staff_member_id is null then 'legacy' else 'staff' end,
  'WUXUAI-' || upper(left(cr.id::text, 8)), 'ACTIVE', 'missing_source_data',
  coalesce(c.is_test_customer, false)
from public.coupon_redemptions cr
left join public.customers c on c.id = cr.customer_id
on conflict (source_type, source_id) do nothing;

create or replace function public.cancel_redemption_activity(
  input_restaurant_id uuid,
  input_activity_id uuid,
  input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_record public.redemption_activity_journal%rowtype;
  audit_id_value uuid;
begin
  if not public.is_bonus_report_admin(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  if length(trim(coalesce(input_reason, ''))) < 10 then raise exception 'Ein Stornogrund mit mindestens 10 Zeichen ist erforderlich.'; end if;

  select * into activity_record
  from public.redemption_activity_journal
  where id = input_activity_id and restaurant_id = input_restaurant_id
  for update;
  if activity_record.id is null then raise exception 'Einlösungsaktivität wurde nicht gefunden.'; end if;
  if activity_record.status = 'CANCELLED' then
    return jsonb_build_object('id', activity_record.id, 'status', activity_record.status,
      'activity_number', activity_record.activity_number);
  end if;

  audit_id_value := public.write_audit_event(
    activity_record.restaurant_id, activity_record.customer_id, 'admin', auth.uid(),
    'BONUS_ACTIVITY_CANCELLED', 'success', 'restaurant_portal',
    'redemption_activity_journal', activity_record.id, null,
    jsonb_build_object('activity_number', activity_record.activity_number,
      'reason', left(trim(input_reason), 500), 'no_points_reversal', true)
  );

  perform set_config('wuxuai.allow_activity_cancellation', 'on', true);
  update public.redemption_activity_journal
  set status = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = left(trim(input_reason), 500), cancellation_audit_id = audit_id_value
  where id = activity_record.id;

  return jsonb_build_object('id', activity_record.id, 'status', 'CANCELLED',
    'activity_number', activity_record.activity_number,
    'notice', 'Das Protokoll wurde storniert. Es wurde keine Kassen- oder Punktebuchung erzeugt.');
end;
$$;

revoke execute on function public.cancel_redemption_activity(uuid, uuid, text) from public, anon;
grant execute on function public.cancel_redemption_activity(uuid, uuid, text) to authenticated;

create or replace function public.get_bonus_activity_report(
  input_restaurant_id uuid,
  input_year integer,
  input_month integer default null,
  input_branch_id uuid default null,
  input_reward_type text default null,
  input_status text default null,
  input_include_test boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  period_from timestamptz;
  period_to timestamptz;
  report_rows jsonb;
  report_summary jsonb;
  excluded_test_count integer;
  restaurant_name_value text;
begin
  if not public.is_bonus_report_admin(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  if input_year < 2000 or input_year > 2100 then raise exception 'Jahr ist nicht gültig.'; end if;
  if input_month is not null and (input_month < 1 or input_month > 12) then raise exception 'Monat ist nicht gültig.'; end if;
  if input_branch_id is not null and not exists (
    select 1 from public.branches where id = input_branch_id and restaurant_id = input_restaurant_id
  ) then raise exception 'Filiale ist nicht gültig.'; end if;

  if input_month is null then
    period_from := make_date(input_year, 1, 1)::timestamp at time zone 'Europe/Vienna';
    period_to := make_date(input_year + 1, 1, 1)::timestamp at time zone 'Europe/Vienna';
  else
    period_from := make_date(input_year, input_month, 1)::timestamp at time zone 'Europe/Vienna';
    period_to := (make_date(input_year, input_month, 1) + interval '1 month')::timestamp at time zone 'Europe/Vienna';
  end if;

  select name into restaurant_name_value from public.restaurants where id = input_restaurant_id;

  select count(*) into excluded_test_count
  from public.redemption_activity_journal j
  where j.restaurant_id = input_restaurant_id
    and j.redeemed_at >= period_from and j.redeemed_at < period_to
    and j.is_test_event = true
    and (input_branch_id is null or j.branch_id = input_branch_id)
    and (input_reward_type is null or j.reward_type = upper(input_reward_type))
    and (input_status is null or j.status = case lower(input_status)
      when 'redeemed' then 'ACTIVE' when 'cancelled' then 'CANCELLED' else upper(input_status) end);

  select jsonb_build_object(
    'total', count(*),
    'active', count(*) filter (where j.status = 'ACTIVE'),
    'cancelled', count(*) filter (where j.status = 'CANCELLED'),
    'points_spent', coalesce(sum(j.points_spent), 0),
    'quantity', coalesce(sum(j.quantity), 0),
    'point_rewards', count(*) filter (where j.reward_type = 'POINT_REWARD'),
    'welcome_gifts', count(*) filter (where j.reward_type = 'WELCOME_GIFT'),
    'birthday_gifts', count(*) filter (where j.reward_type = 'BIRTHDAY_GIFT'),
    'referral_rewards', count(*) filter (where j.reward_type = 'REFERRAL_REWARD'),
    'promotional_gifts', count(*) filter (where j.reward_type = 'PROMOTIONAL_GIFT'),
    'manual_compensations', count(*) filter (where j.reward_type = 'MANUAL_COMPENSATION'),
    'customers', count(distinct j.customer_reference),
    'complete_snapshots', count(*) filter (where j.snapshot_completeness = 'complete'),
    'incomplete_legacy_records', count(*) filter (where j.snapshot_completeness <> 'complete')
  ) into report_summary
  from public.redemption_activity_journal j
  where j.restaurant_id = input_restaurant_id
    and j.redeemed_at >= period_from and j.redeemed_at < period_to
    and (input_include_test or not j.is_test_event)
    and (input_branch_id is null or j.branch_id = input_branch_id)
    and (input_reward_type is null or j.reward_type = upper(input_reward_type))
    and (input_status is null or j.status = case lower(input_status)
      when 'redeemed' then 'ACTIVE' when 'cancelled' then 'CANCELLED' else upper(input_status) end);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', j.id,
    'activity_number', j.activity_number,
    'redeemed_at', j.redeemed_at,
    'branch_id', j.branch_id,
    'branch_name', b.name,
    'customer_reference', j.customer_reference,
    'reward_id', j.reward_id,
    'reward_type', j.reward_type,
    'reward_name_snapshot', j.reward_name_snapshot,
    'reward_description_snapshot', j.reward_description_snapshot,
    'points_spent', j.points_spent,
    'quantity', j.quantity,
    'actor_role', j.actor_role,
    'redemption_code_reference', j.redemption_code_reference,
    'status', j.status,
    'cancelled_at', j.cancelled_at,
    'cancellation_reason', j.cancellation_reason,
    'snapshot_completeness', j.snapshot_completeness,
    'is_test_event', j.is_test_event
  ) order by j.redeemed_at desc), '[]'::jsonb) into report_rows
  from public.redemption_activity_journal j
  left join public.branches b on b.id = j.branch_id and b.restaurant_id = j.restaurant_id
  where j.restaurant_id = input_restaurant_id
    and j.redeemed_at >= period_from and j.redeemed_at < period_to
    and (input_include_test or not j.is_test_event)
    and (input_branch_id is null or j.branch_id = input_branch_id)
    and (input_reward_type is null or j.reward_type = upper(input_reward_type))
    and (input_status is null or j.status = case lower(input_status)
      when 'redeemed' then 'ACTIVE' when 'cancelled' then 'CANCELLED' else upper(input_status) end);

  perform public.write_audit_event(input_restaurant_id, null, 'admin', auth.uid(),
    'BONUS_ACTIVITY_REPORT_VIEWED', 'success', 'restaurant_portal',
    'redemption_activity_journal', null, null,
    jsonb_build_object('year', input_year, 'month', input_month,
      'branch_id', input_branch_id, 'include_test', input_include_test));

  return jsonb_build_object(
    'restaurant_name', restaurant_name_value,
    'timezone', 'Europe/Vienna',
    'period_from', period_from,
    'period_to', period_to,
    'test_data_excluded', not input_include_test,
    'excluded_test_count', case when input_include_test then 0 else excluded_test_count end,
    'cancelled_included', input_status is null or lower(input_status) = 'cancelled',
    'summary', report_summary,
    'rows', report_rows,
    'legal_notice', 'Dieser Bericht dokumentiert ausschließlich Aktivitäten des WUXUAI Bonusprogramms. Er ist kein Kassenbeleg, keine Registrierkasse und keine steuerliche oder buchhalterische Aufzeichnung. Die ordnungsgemäße Erfassung steuerlich, buchhalterisch oder kassentechnisch relevanter Vorgänge im eigenen Kassensystem obliegt dem Restaurantbetreiber.',
    'legal_status', 'LEGAL_REVIEW_REQUIRED'
  );
end;
$$;

revoke execute on function public.get_bonus_activity_report(uuid, integer, integer, uuid, text, text, boolean)
from public, anon;
grant execute on function public.get_bonus_activity_report(uuid, integer, integer, uuid, text, text, boolean)
to authenticated;

-- Keep the existing RPC signature as a compatibility contract, but source rows
-- from the immutable journal and exclude test activity by default.
create or replace function public.get_reward_accounting_export(
  input_restaurant_id uuid,
  input_from timestamptz,
  input_to timestamptz,
  input_reward_id uuid default null,
  input_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  export_payload jsonb;
  complete_count integer;
  incomplete_count integer;
begin
  if not public.is_bonus_report_admin(input_restaurant_id) then raise exception 'Nicht berechtigt.'; end if;
  if input_from is null or input_to is null or input_from >= input_to then raise exception 'Zeitraum ist nicht gültig.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'activity_number', j.activity_number,
    'restaurant_id', j.restaurant_id,
    'branch_id', j.branch_id,
    'reward_id', j.reward_id,
    'reward_name', j.reward_name_snapshot,
    'reward_category', j.reward_type,
    'points_consumed', j.points_spent,
    'quantity', j.quantity,
    'redeemed_at', j.redeemed_at,
    'staff_confirmation', j.redeemed_by is not null,
    'redemption_code', j.redemption_code_reference,
    'status', j.status,
    'cancelled_at', j.cancelled_at,
    'cancellation_reason', j.cancellation_reason,
    'actor_role', j.actor_role,
    'snapshot_completeness', j.snapshot_completeness,
    'historical_value_notice', case when j.snapshot_completeness = 'complete'
      then null else 'Historischer Wert nicht vorhanden' end,
    'audit_event_id', j.audit_reference
  ) order by j.redeemed_at), '[]'::jsonb),
  count(*) filter (where j.snapshot_completeness = 'complete'),
  count(*) filter (where j.snapshot_completeness <> 'complete')
  into export_payload, complete_count, incomplete_count
  from public.redemption_activity_journal j
  where j.restaurant_id = input_restaurant_id
    and j.redeemed_at >= input_from and j.redeemed_at < input_to
    and not j.is_test_event
    and (input_reward_id is null or j.reward_id = input_reward_id)
    and (input_status is null or j.status = case lower(input_status)
      when 'redeemed' then 'ACTIVE' when 'cancelled' then 'CANCELLED' else upper(input_status) end);

  perform public.write_audit_event(input_restaurant_id, null, 'admin', auth.uid(),
    'BONUS_ACTIVITY_EXPORT_CREATED', 'success', 'restaurant_portal',
    'redemption_activity_journal', null, null,
    jsonb_build_object('from', input_from, 'to', input_to,
      'reward_filter', input_reward_id, 'status_filter', input_status,
      'test_data_excluded', true));

  return jsonb_build_object(
    'created_at', now(),
    'rows', export_payload,
    'test_data_excluded', true,
    'cancelled_included', input_status is null or lower(input_status) = 'cancelled',
    'complete_snapshots', complete_count,
    'incomplete_legacy_records', incomplete_count,
    'notice', 'Dieser Export dokumentiert ausschließlich Aktivitäten des WUXUAI Bonusprogramms. Er ist kein Kassenbeleg, keine Registrierkasse und keine steuerliche oder buchhalterische Aufzeichnung.',
    'legal_status', 'LEGAL_REVIEW_REQUIRED'
  );
end;
$$;

revoke execute on function public.get_reward_accounting_export(uuid, timestamptz, timestamptz, uuid, text)
from public, anon;
grant execute on function public.get_reward_accounting_export(uuid, timestamptz, timestamptz, uuid, text)
to authenticated;

-- Preserve the existing secure consume contract and add one journal write in
-- the same transaction after the final server-side status transition.
create or replace function public.consume_redemption_code(
  input_restaurant_id uuid,
  input_code text,
  input_staff_session_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code_record public.redemption_codes%rowtype;
  staff_record public.staff_members%rowtype;
  code_hash_value text;
  reward_title text;
  audit_id_value uuid;
  activity_id_value uuid;
  actor_role_value text;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    if nullif(trim(coalesce(input_staff_session_token, '')), '') is null then
      raise exception 'Nicht berechtigt.';
    end if;
    staff_record := public.get_staff_from_session(input_restaurant_id, input_staff_session_token);
    if staff_record.id is null then raise exception 'Mitarbeitersitzung ist nicht gültig.'; end if;
  end if;

  if trim(coalesce(input_code, '')) !~ '^[0-9]{6}$' then raise exception 'Einlösecode ist nicht gültig.'; end if;
  perform public.expire_redemption_codes(now());
  code_hash_value := encode(extensions.digest(trim(input_code), 'sha256'), 'hex');

  select * into code_record from public.redemption_codes
  where restaurant_id = input_restaurant_id and code_hash = code_hash_value
  order by case status when 'active' then 0 when 'redeemed' then 1 else 2 end,
    created_at desc
  limit 1
  for update;
  if code_record.id is null then raise exception 'Einlösecode ist nicht gültig.'; end if;
  if code_record.status = 'expired' or code_record.expires_at <= now() then raise exception 'Einlösecode ist abgelaufen.'; end if;

  if code_record.status = 'redeemed' then
    perform public.write_audit_event(
      code_record.restaurant_id, code_record.customer_id,
      case when staff_record.id is null then 'admin' else 'staff' end,
      coalesce(staff_record.id, auth.uid()), 'REWARD_REDEMPTION_BLOCKED', 'blocked',
      'staff_portal', 'redemption_codes', code_record.id, code_record.idempotency_key,
      jsonb_build_object('reason', 'already_redeemed',
        'redemption_type', code_record.redemption_type, 'reward_id', code_record.reward_id)
    );
    return jsonb_build_object('success', false, 'error_code', 'REWARD_REDEMPTION_BLOCKED',
      'error_message', 'Einlösecode wurde bereits verwendet.');
  end if;

  if code_record.status <> 'active' then raise exception 'Einlösecode ist nicht mehr verfügbar.'; end if;

  update public.redemption_codes
  set status = 'redeemed', redeemed_at = now(), deactivated_at = now()
  where id = code_record.id and status = 'active';

  if code_record.redemption_type = 'points_redemption' then
    update public.reward_redemption_events
    set status = 'redeemed', completed_at = now(), redeemed_at = now()
    where id = code_record.source_id and status = 'started';
  else
    update public.customer_rewards
    set status = 'redeemed', redeemed_at = now(), staff_member_id = staff_record.id
    where id = code_record.source_id and status = 'redemption_started';
  end if;

  actor_role_value := case when staff_record.id is null then 'admin' else 'staff' end;
  audit_id_value := public.write_audit_event(
    code_record.restaurant_id, code_record.customer_id, actor_role_value,
    coalesce(staff_record.id, auth.uid()), 'REWARD_REDEEMED', 'success',
    'staff_portal', 'redemption_codes', code_record.id, code_record.idempotency_key,
    jsonb_build_object('redemption_type', code_record.redemption_type,
      'source_id', code_record.source_id, 'reward_id', code_record.reward_id)
  );

  activity_id_value := public.write_redemption_activity(
    code_record.id, coalesce(staff_record.id, auth.uid()), actor_role_value, audit_id_value
  );

  select title into reward_title from public.rewards where id = code_record.reward_id;
  return jsonb_build_object('success', true, 'redemption_type', code_record.redemption_type,
    'title', reward_title, 'redeemed_at', now(), 'activity_id', activity_id_value,
    'notice', 'Einlösung im Bonusprogramm dokumentiert. Falls erforderlich, bitte im Kassensystem des Restaurants erfassen.');
end;
$$;

revoke execute on function public.consume_redemption_code(uuid, text, text) from public;
grant execute on function public.consume_redemption_code(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
