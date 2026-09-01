-- Customer presentation window for point rewards only.
-- Welcome and birthday gifts keep the existing six-digit staff consume flow.

create table if not exists public.points_redemption_presentations (
  id uuid primary key default extensions.gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  reward_id uuid not null references public.rewards(id) on delete restrict,
  redemption_event_id uuid not null unique references public.reward_redemption_events(id) on delete restrict,
  points_transaction_id uuid references public.points_transactions(id) on delete restrict,
  idempotency_key uuid not null,
  public_reference text not null unique,
  status text not null default 'REDEEMED_ACTIVE' check (
    status in ('REDEEMED_ACTIVE', 'REDEEMED_COMPLETED', 'CANCELLED')
  ),
  points_spent integer not null check (points_spent >= 0),
  stamps_spent integer not null default 0 check (stamps_spent >= 0),
  activated_at timestamptz not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, customer_id, idempotency_key),
  check (expires_at = activated_at + interval '15 minutes'),
  check (
    (status = 'REDEEMED_ACTIVE' and completed_at is null and cancelled_at is null)
    or (status = 'REDEEMED_COMPLETED' and completed_at is not null and cancelled_at is null)
    or (status = 'CANCELLED' and cancelled_at is not null and cancelled_by is not null
      and length(trim(cancellation_reason)) >= 10)
  )
);

create unique index if not exists points_redemption_presentations_one_active_reward_idx
on public.points_redemption_presentations (restaurant_id, customer_id, reward_id)
where status = 'REDEEMED_ACTIVE';

create index if not exists points_redemption_presentations_expiry_idx
on public.points_redemption_presentations (expires_at)
where status = 'REDEEMED_ACTIVE';

alter table public.points_redemption_presentations enable row level security;
revoke all on table public.points_redemption_presentations from public, anon, authenticated;

create or replace function public.points_presentation_visual_code(
  input_presentation_id uuid,
  input_now timestamptz
)
returns text
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select upper(substr(encode(extensions.digest(
    input_presentation_id::text || ':' || floor(extract(epoch from input_now) / 10)::bigint::text,
    'sha256'
  ), 'hex'), 1, 4))
$$;

revoke execute on function public.points_presentation_visual_code(uuid, timestamptz)
from public, anon, authenticated;

create or replace function public.complete_points_redemption_presentations(
  input_now timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  presentation_record public.points_redemption_presentations%rowtype;
  completed_count integer := 0;
begin
  for presentation_record in
    select *
    from public.points_redemption_presentations prp
    where prp.status = 'REDEEMED_ACTIVE'
      and prp.expires_at <= input_now
    for update skip locked
  loop
    update public.points_redemption_presentations
    set status = 'REDEEMED_COMPLETED', completed_at = input_now
    where id = presentation_record.id and status = 'REDEEMED_ACTIVE';

    if found then
      perform public.write_audit_event(
        presentation_record.restaurant_id,
        presentation_record.customer_id,
        'system',
        null,
        'POINT_REDEMPTION_PRESENTATION_COMPLETED',
        'completed',
        'system',
        'points_redemption_presentations',
        presentation_record.id,
        null,
        jsonb_build_object(
          'reward_id', presentation_record.reward_id,
          'redemption_event_id', presentation_record.redemption_event_id,
          'confirmation_method', 'CUSTOMER_PRESENTATION_WINDOW'
        )
      );
      completed_count := completed_count + 1;
    end if;
  end loop;
  return completed_count;
end;
$$;

revoke execute on function public.complete_points_redemption_presentations(timestamptz)
from public, anon, authenticated;

create or replace function public.points_presentation_payload(
  input_presentation_id uuid,
  input_now timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select jsonb_build_object(
    'found', true,
    'presentation_id', prp.id,
    'status', prp.status,
    'active', prp.status = 'REDEEMED_ACTIVE' and prp.expires_at > input_now,
    'activated_at', prp.activated_at,
    'expires_at', prp.expires_at,
    'completed_at', prp.completed_at,
    'server_now', input_now,
    'visual_code', public.points_presentation_visual_code(prp.id, input_now),
    'visual_code_valid_until', to_timestamp((floor(extract(epoch from input_now) / 10) + 1) * 10),
    'redemption_number', prp.public_reference,
    'reward_id', prp.reward_id,
    'reward_title', r.title,
    'reward_description', r.description,
    'reward_image_url', r.image_url,
    'image_zoom', r.image_zoom,
    'image_position_x', r.image_position_x,
    'image_position_y', r.image_position_y,
    'image_aspect_ratio', r.image_aspect_ratio,
    'image_crop_version', r.image_crop_version,
    'restaurant_name', restaurant.name,
    'points_spent', prp.points_spent,
    'stamps_spent', prp.stamps_spent,
    'confirmation_method', 'CUSTOMER_PRESENTATION_WINDOW'
  )
  from public.points_redemption_presentations prp
  join public.rewards r on r.id = prp.reward_id and r.restaurant_id = prp.restaurant_id
  join public.restaurants restaurant on restaurant.id = prp.restaurant_id
  where prp.id = input_presentation_id
$$;

revoke execute on function public.points_presentation_payload(uuid, timestamptz)
from public, anon, authenticated;

create or replace function public.start_customer_points_presentation(
  input_customer_token text,
  input_reward_id uuid,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  token_hash_value text;
  token_record public.customer_qr_tokens%rowtype;
  customer_record public.customers%rowtype;
  reward_record public.rewards%rowtype;
  existing_presentation public.points_redemption_presentations%rowtype;
  presentation_id_value uuid := extensions.gen_random_uuid();
  event_id_value uuid;
  transaction_id_value uuid;
  audit_id_value uuid;
  activity_number_value text;
  activated_at_value timestamptz := statement_timestamp();
  next_points integer;
  next_stamps integer;
begin
  if input_idempotency_key is null then
    raise exception 'Bestätigungs-ID fehlt.';
  end if;

  token_hash_value := public.hash_public_token(input_customer_token);
  select * into token_record
  from public.customer_qr_tokens cqt
  where cqt.token_hash = token_hash_value
    and cqt.active = true
    and (cqt.expires_at is null or cqt.expires_at > now());
  if token_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'points-presentation:' || token_record.restaurant_id::text || ':' ||
      token_record.customer_id::text || ':' || input_idempotency_key::text,
    0
  ));

  select * into customer_record
  from public.customers c
  where c.id = token_record.customer_id
    and c.restaurant_id = token_record.restaurant_id
    and c.branch_id is not distinct from token_record.branch_id
    and c.membership_status = 'active'
  for update;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;

  select * into existing_presentation
  from public.points_redemption_presentations prp
  where prp.restaurant_id = customer_record.restaurant_id
    and prp.customer_id = customer_record.id
    and prp.idempotency_key = input_idempotency_key
  for update;
  if existing_presentation.id is not null then
    if existing_presentation.reward_id <> input_reward_id then
      return jsonb_build_object(
        'success', false,
        'error_code', 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH',
        'error_message', 'Diese Bestätigungs-ID wurde bereits für eine andere Einlösung verwendet.'
      );
    end if;
    perform public.complete_points_redemption_presentations(now());
    return public.points_presentation_payload(existing_presentation.id, now())
      || jsonb_build_object('success', true, 'already_started', true,
        'points_balance', customer_record.points_balance,
        'stamp_balance', customer_record.stamp_balance);
  end if;

  select * into reward_record
  from public.rewards r
  where r.id = input_reward_id
    and r.restaurant_id = customer_record.restaurant_id
    and r.branch_id is not distinct from coalesce(
      customer_record.branch_id,
      public.restaurant_primary_branch_id(customer_record.restaurant_id)
    )
    and r.active = true
    and not r.is_starter_reward
    and (r.expires_at is null or r.expires_at > now());
  if reward_record.id is null then raise exception 'Diese Punkteeinlösung ist nicht mehr verfügbar.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'points-presentation-reward:' || customer_record.restaurant_id::text || ':' ||
      customer_record.id::text || ':' || reward_record.id::text,
    0
  ));

  perform public.complete_points_redemption_presentations(now());
  select * into existing_presentation
  from public.points_redemption_presentations prp
  where prp.restaurant_id = customer_record.restaurant_id
    and prp.customer_id = customer_record.id
    and prp.reward_id = reward_record.id
    and prp.status = 'REDEEMED_ACTIVE'
  limit 1 for update;
  if existing_presentation.id is not null then
    return public.points_presentation_payload(existing_presentation.id, now())
      || jsonb_build_object('success', true, 'already_started', true,
        'points_balance', customer_record.points_balance,
        'stamp_balance', customer_record.stamp_balance);
  end if;

  update public.customers c
  set points_balance = c.points_balance - reward_record.required_points,
      stamp_balance = c.stamp_balance - reward_record.required_stamps
  where c.id = customer_record.id
    and c.restaurant_id = customer_record.restaurant_id
    and c.points_balance >= reward_record.required_points
    and c.stamp_balance >= reward_record.required_stamps
  returning c.points_balance, c.stamp_balance into next_points, next_stamps;
  if next_points is null then raise exception 'Du hast noch nicht genug Punkte.'; end if;

  insert into public.reward_redemption_events (
    restaurant_id, organization_id, branch_id, customer_id, reward_id,
    points_spent, stamps_spent, status, started_at, completed_at, redeemed_at, metadata
  ) values (
    customer_record.restaurant_id, customer_record.organization_id,
    coalesce(customer_record.branch_id, public.restaurant_primary_branch_id(customer_record.restaurant_id)),
    customer_record.id, reward_record.id, reward_record.required_points,
    reward_record.required_stamps, 'redeemed', activated_at_value,
    activated_at_value, activated_at_value,
    jsonb_build_object(
      'customer_confirmation', true,
      'confirmation_method', 'CUSTOMER_PRESENTATION_WINDOW',
      'idempotency_key', input_idempotency_key
    )
  ) returning id into event_id_value;

  if reward_record.required_points > 0 then
    insert into public.points_transactions (
      restaurant_id, organization_id, branch_id, customer_id, type, points,
      reason, idempotency_key, collection_source
    ) values (
      customer_record.restaurant_id, customer_record.organization_id,
      coalesce(customer_record.branch_id, public.restaurant_primary_branch_id(customer_record.restaurant_id)),
      customer_record.id, 'redeem', -reward_record.required_points,
      'Punkteeinlösung per Präsentationsfenster', input_idempotency_key,
      'customer_presentation'
    ) returning id into transaction_id_value;
  end if;

  insert into public.points_redemption_presentations (
    id, restaurant_id, organization_id, branch_id, customer_id, reward_id,
    redemption_event_id, points_transaction_id, idempotency_key, public_reference,
    points_spent, stamps_spent, activated_at, expires_at
  ) values (
    presentation_id_value, customer_record.restaurant_id, customer_record.organization_id,
    coalesce(customer_record.branch_id, public.restaurant_primary_branch_id(customer_record.restaurant_id)),
    customer_record.id, reward_record.id, event_id_value, transaction_id_value,
    input_idempotency_key,
    'WXP-' || upper(left(replace(presentation_id_value::text, '-', ''), 10)),
    reward_record.required_points, reward_record.required_stamps,
    activated_at_value, activated_at_value + interval '15 minutes'
  );

  audit_id_value := public.write_audit_event(
    customer_record.restaurant_id, customer_record.id, 'customer', customer_record.id,
    'POINT_REDEMPTION_PRESENTATION_STARTED', 'completed', 'customer_portal',
    'points_redemption_presentations', presentation_id_value, input_idempotency_key,
    jsonb_build_object(
      'reward_id', reward_record.id,
      'redemption_event_id', event_id_value,
      'points_spent', reward_record.required_points,
      'stamps_spent', reward_record.required_stamps,
      'confirmation_method', 'CUSTOMER_PRESENTATION_WINDOW',
      'expires_at', activated_at_value + interval '15 minutes'
    )
  );

  activity_number_value := 'WXB-'
    || to_char(activated_at_value at time zone 'Europe/Vienna', 'YYYY')
    || '-' || lpad(nextval('public.redemption_activity_number_seq')::text, 8, '0');
  insert into public.redemption_activity_journal (
    activity_number, restaurant_id, organization_id, branch_id, customer_id,
    customer_reference, source_type, source_id, reward_id, reward_type,
    reward_name_snapshot, reward_description_snapshot, points_spent, quantity,
    redeemed_at, redeemed_by, actor_role, redemption_code_reference, status,
    audit_reference, snapshot_completeness, is_test_event
  ) values (
    activity_number_value, customer_record.restaurant_id, customer_record.organization_id,
    coalesce(customer_record.branch_id, public.restaurant_primary_branch_id(customer_record.restaurant_id)),
    customer_record.id,
    left(encode(extensions.digest(customer_record.id::text, 'sha256'), 'hex'), 16),
    'points_presentation', presentation_id_value, reward_record.id, 'POINT_REWARD',
    reward_record.title, reward_record.description, reward_record.required_points, 1,
    activated_at_value, customer_record.id, 'customer',
    'WUXUAI-' || upper(left(replace(presentation_id_value::text, '-', ''), 8)),
    'ACTIVE', audit_id_value, 'complete', coalesce(customer_record.is_test_customer, false)
  );

  return public.points_presentation_payload(presentation_id_value, activated_at_value)
    || jsonb_build_object(
      'success', true,
      'already_started', false,
      'points_balance', next_points,
      'stamp_balance', next_stamps
    );
end;
$$;

revoke execute on function public.start_customer_points_presentation(text, uuid, uuid) from public;
grant execute on function public.start_customer_points_presentation(text, uuid, uuid) to anon, authenticated;

create or replace function public.get_customer_points_presentation(
  input_restaurant_slug text,
  input_customer_token text,
  input_presentation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  presentation_record public.points_redemption_presentations%rowtype;
  server_now_value timestamptz := statement_timestamp();
begin
  select * into restaurant_record
  from public.restaurants r
  where r.slug = trim(input_restaurant_slug) and r.status = 'active';
  if restaurant_record.id is null then return jsonb_build_object('found', false); end if;

  select c.* into customer_record
  from public.customer_qr_tokens cqt
  join public.customers c on c.id = cqt.customer_id and c.restaurant_id = cqt.restaurant_id
  where cqt.restaurant_id = restaurant_record.id
    and cqt.token_hash = public.hash_public_token(input_customer_token)
    and cqt.active = true
    and (cqt.expires_at is null or cqt.expires_at > now())
    and c.membership_status = 'active'
  limit 1;
  if customer_record.id is null then return jsonb_build_object('found', false); end if;

  perform public.complete_points_redemption_presentations(server_now_value);
  if input_presentation_id is null then
    select * into presentation_record
    from public.points_redemption_presentations prp
    where prp.restaurant_id = restaurant_record.id
      and prp.customer_id = customer_record.id
      and prp.status = 'REDEEMED_ACTIVE'
    order by prp.activated_at desc
    limit 1;
  else
    select * into presentation_record
    from public.points_redemption_presentations prp
    where prp.id = input_presentation_id
      and prp.restaurant_id = restaurant_record.id
      and prp.customer_id = customer_record.id;
  end if;
  if presentation_record.id is null then return jsonb_build_object('found', false); end if;
  return public.points_presentation_payload(presentation_record.id, server_now_value);
end;
$$;

revoke execute on function public.get_customer_points_presentation(text, text, uuid) from public;
grant execute on function public.get_customer_points_presentation(text, text, uuid) to anon, authenticated;

create or replace function public.cancel_points_presentation_activity_internal(
  input_restaurant_id uuid,
  input_activity_id uuid,
  input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  activity_record public.redemption_activity_journal%rowtype;
  presentation_record public.points_redemption_presentations%rowtype;
  audit_id_value uuid;
  reversal_transaction_id uuid;
  actor_type_value text;
begin
  if not exists (
    select 1 from public.restaurant_members rm
    where rm.restaurant_id = input_restaurant_id
      and rm.user_id = auth.uid() and rm.role = 'owner'
  ) and coalesce(public.current_platform_role(), '') <> 'support' then
    raise exception 'Nicht berechtigt.';
  end if;
  if length(trim(coalesce(input_reason, ''))) < 10 then
    raise exception 'Ein Stornogrund mit mindestens 10 Zeichen ist erforderlich.';
  end if;

  select * into activity_record
  from public.redemption_activity_journal j
  where j.id = input_activity_id and j.restaurant_id = input_restaurant_id
    and j.source_type = 'points_presentation'
  for update;
  if activity_record.id is null then raise exception 'Einlösungsaktivität wurde nicht gefunden.'; end if;

  select * into presentation_record
  from public.points_redemption_presentations prp
  where prp.id = activity_record.source_id and prp.restaurant_id = input_restaurant_id
  for update;
  if presentation_record.id is null then raise exception 'Einlösung wurde nicht gefunden.'; end if;
  if activity_record.status = 'CANCELLED' or presentation_record.status = 'CANCELLED' then
    return jsonb_build_object('id', activity_record.id, 'status', 'CANCELLED',
      'activity_number', activity_record.activity_number,
      'notice', 'Die Einlösung wurde bereits storniert und die Punkte wurden bereits zurückgebucht.');
  end if;

  update public.customers c
  set points_balance = c.points_balance + presentation_record.points_spent,
      stamp_balance = c.stamp_balance + presentation_record.stamps_spent
  where c.id = presentation_record.customer_id
    and c.restaurant_id = presentation_record.restaurant_id;

  if presentation_record.points_spent > 0 then
    insert into public.points_transactions (
      restaurant_id, organization_id, branch_id, customer_id, type, points,
      reason, idempotency_key, collection_source, reversal_of
    ) values (
      presentation_record.restaurant_id, presentation_record.organization_id,
      presentation_record.branch_id, presentation_record.customer_id,
      'adjust', presentation_record.points_spent, trim(input_reason),
      presentation_record.id, 'presentation_reversal',
      presentation_record.points_transaction_id
    ) returning id into reversal_transaction_id;
  end if;

  actor_type_value := case when public.current_platform_role() = 'support' then 'support' else 'admin' end;
  audit_id_value := public.write_audit_event(
    presentation_record.restaurant_id, presentation_record.customer_id,
    actor_type_value, auth.uid(), 'POINT_REDEMPTION_PRESENTATION_CANCELLED',
    'completed', case when actor_type_value = 'support' then 'platform_portal' else 'owner_portal' end,
    'points_redemption_presentations', presentation_record.id, presentation_record.id,
    jsonb_build_object(
      'reward_id', presentation_record.reward_id,
      'redemption_event_id', presentation_record.redemption_event_id,
      'reversal_transaction_id', reversal_transaction_id,
      'points_returned', presentation_record.points_spent,
      'stamps_returned', presentation_record.stamps_spent,
      'reason', left(trim(input_reason), 500)
    )
  );

  update public.points_redemption_presentations
  set status = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = left(trim(input_reason), 500)
  where id = presentation_record.id;
  update public.reward_redemption_events
  set status = 'cancelled'
  where id = presentation_record.redemption_event_id;

  perform set_config('wuxuai.allow_activity_cancellation', 'on', true);
  update public.redemption_activity_journal
  set status = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid(),
      cancellation_reason = left(trim(input_reason), 500), cancellation_audit_id = audit_id_value
  where id = activity_record.id;

  return jsonb_build_object('id', activity_record.id, 'status', 'CANCELLED',
    'activity_number', activity_record.activity_number,
    'notice', 'Die Einlösung wurde storniert und die Punkte wurden zurückgebucht.');
end;
$$;

revoke execute on function public.cancel_points_presentation_activity_internal(uuid, uuid, text)
from public, anon, authenticated;

create or replace function public.cancel_redemption_activity(
  input_restaurant_id uuid,
  input_activity_id uuid,
  input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  activity_record public.redemption_activity_journal%rowtype;
  audit_id_value uuid;
begin
  select * into activity_record
  from public.redemption_activity_journal
  where id = input_activity_id and restaurant_id = input_restaurant_id;
  if activity_record.source_type = 'points_presentation' then
    return public.cancel_points_presentation_activity_internal(
      input_restaurant_id, input_activity_id, input_reason
    );
  end if;

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

do $$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job
  where jobname = 'wuxuai-v1-complete-points-presentations' limit 1;
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'wuxuai-v1-complete-points-presentations',
    '* * * * *',
    'select public.complete_points_redemption_presentations(now());'
  );
end;
$$;

notify pgrst, 'reload schema';
