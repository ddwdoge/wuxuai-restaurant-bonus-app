-- V1 informational restaurant offers. This module is intentionally independent
-- from rewards, points, coupons, redemptions and the historical campaigns model.

create table if not exists public.restaurant_offers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete restrict,
  offer_type text not null check (offer_type in (
    'WEEKLY_OFFER', 'MONTHLY_OFFER', 'LUNCH_MENU', 'NEW_DISH',
    'SEASONAL_OFFER', 'EVENT', 'NEWS'
  )),
  title text not null,
  short_description text not null,
  description text,
  image_url text,
  current_price numeric(12, 2),
  previous_price numeric(12, 2),
  currency text not null default 'EUR' check (currency = 'EUR'),
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  weekdays integer[],
  time_from time,
  time_to time,
  button_label text not null default 'Angebot ansehen',
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PUBLISHED', 'DISABLED', 'ARCHIVED')),
  is_active boolean not null default false,
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint restaurant_offers_title_length check (char_length(trim(title)) between 1 and 120),
  constraint restaurant_offers_short_description_length check (char_length(trim(short_description)) between 1 and 240),
  constraint restaurant_offers_description_length check (description is null or char_length(description) <= 4000),
  constraint restaurant_offers_valid_period check (valid_to > valid_from),
  constraint restaurant_offers_current_price check (current_price is null or current_price > 0),
  constraint restaurant_offers_previous_price check (
    previous_price is null or (current_price is not null and previous_price > current_price)
  ),
  constraint restaurant_offers_time_pair check (
    (time_from is null and time_to is null) or
    (time_from is not null and time_to is not null and time_to > time_from)
  ),
  constraint restaurant_offers_weekdays_valid check (
    weekdays is null or weekdays <@ array[1, 2, 3, 4, 5, 6, 7]
  )
);

create table if not exists public.restaurant_offer_metrics (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  offer_id uuid not null references public.restaurant_offers(id) on delete cascade,
  metric_date date not null,
  event_type text not null check (event_type in (
    'OFFER_VIEWED', 'OFFER_CTA_CLICKED', 'OFFER_ROUTE_CLICKED', 'OFFER_BONUS_OPENED'
  )),
  event_count bigint not null default 0 check (event_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (offer_id, metric_date, event_type)
);

create index if not exists restaurant_offers_owner_idx
  on public.restaurant_offers (restaurant_id, status, valid_from desc);
create index if not exists restaurant_offers_public_idx
  on public.restaurant_offers (restaurant_id, valid_from, valid_to)
  where status = 'PUBLISHED' and is_active = true;
create index if not exists restaurant_offer_metrics_owner_idx
  on public.restaurant_offer_metrics (restaurant_id, offer_id, metric_date desc);

alter table public.restaurant_offers enable row level security;
alter table public.restaurant_offer_metrics enable row level security;

drop policy if exists "restaurant offers admin read" on public.restaurant_offers;
create policy "restaurant offers admin read"
on public.restaurant_offers for select to authenticated
using (public.is_restaurant_admin(restaurant_id));

drop policy if exists "restaurant offer metrics admin read" on public.restaurant_offer_metrics;
create policy "restaurant offer metrics admin read"
on public.restaurant_offer_metrics for select to authenticated
using (public.is_restaurant_admin(restaurant_id));

revoke all on table public.restaurant_offers from anon, authenticated;
revoke all on table public.restaurant_offer_metrics from anon, authenticated;

create or replace function public.validate_restaurant_offer_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  overlapping_count integer := 0;
begin
  new.title := trim(new.title);
  new.short_description := trim(new.short_description);
  new.description := nullif(trim(coalesce(new.description, '')), '');
  new.image_url := nullif(trim(coalesce(new.image_url, '')), '');
  new.button_label := coalesce(nullif(trim(new.button_label), ''), 'Angebot ansehen');
  new.updated_at := now();

  if new.branch_id is not null and not exists (
    select 1 from public.branches b
    where b.id = new.branch_id and b.restaurant_id = new.restaurant_id
  ) then
    raise exception using errcode = 'P0001', message = 'OFFER_BRANCH_INVALID';
  end if;

  if new.offer_type = 'LUNCH_MENU' and (
    coalesce(cardinality(new.weekdays), 0) = 0 or
    new.time_from is null or new.time_to is null
  ) then
    raise exception using errcode = 'P0001', message = 'OFFER_LUNCH_WINDOW_REQUIRED';
  end if;

  if new.status = 'PUBLISHED' and new.is_active then
    if new.branch_id is null then
      raise exception using errcode = 'P0001', message = 'OFFER_BRANCH_REQUIRED';
    end if;
    if new.valid_to > now() then
      -- Serializes concurrent publications per restaurant. The checked moments
      -- cover the candidate start and every overlapping offer start.
      perform pg_advisory_xact_lock(hashtextextended(new.restaurant_id::text, 0));
      select coalesce(max((
      select count(*)::integer
      from public.restaurant_offers existing
      where existing.restaurant_id = new.restaurant_id
        and existing.id <> new.id
        and existing.status = 'PUBLISHED'
        and existing.is_active = true
        and existing.valid_from <= points.checked_at
        and existing.valid_to > points.checked_at
    )), 0)
      into overlapping_count
      from (
      select new.valid_from as checked_at
      union
      select existing.valid_from
      from public.restaurant_offers existing
      where existing.restaurant_id = new.restaurant_id
        and existing.id <> new.id
        and existing.status = 'PUBLISHED'
        and existing.is_active = true
        and existing.valid_from < new.valid_to
        and existing.valid_to > new.valid_from
      ) points;

      if overlapping_count >= 5 then
        raise exception using errcode = 'P0001', message = 'OFFER_ACTIVE_LIMIT_REACHED';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_restaurant_offer_row_trigger on public.restaurant_offers;
create trigger validate_restaurant_offer_row_trigger
before insert or update on public.restaurant_offers
for each row execute function public.validate_restaurant_offer_row();

create or replace function public.list_restaurant_offers(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
stable
as $$
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'OFFER_ACCESS_DENIED';
  end if;

  return coalesce((
    select jsonb_agg(
      to_jsonb(o) || jsonb_build_object(
        'branch_name', b.name,
        'views', coalesce(metrics.views, 0),
        'clicks', coalesce(metrics.clicks, 0)
      ) order by o.created_at desc
    )
    from public.restaurant_offers o
    left join public.branches b on b.id = o.branch_id
    left join lateral (
      select
        sum(m.event_count) filter (where m.event_type = 'OFFER_VIEWED')::bigint as views,
        sum(m.event_count) filter (where m.event_type <> 'OFFER_VIEWED')::bigint as clicks
      from public.restaurant_offer_metrics m
      where m.offer_id = o.id
    ) metrics on true
    where o.restaurant_id = input_restaurant_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_restaurant_offer(
  input_restaurant_id uuid,
  input_offer_id uuid,
  input_branch_id uuid,
  input_offer_type text,
  input_title text,
  input_short_description text,
  input_description text,
  input_image_url text,
  input_current_price numeric,
  input_previous_price numeric,
  input_valid_from timestamptz,
  input_valid_to timestamptz,
  input_weekdays integer[],
  input_time_from time,
  input_time_to time,
  input_button_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  offer_record public.restaurant_offers%rowtype;
  event_type_value text;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'OFFER_ACCESS_DENIED';
  end if;

  if input_offer_id is null then
    insert into public.restaurant_offers (
      restaurant_id, branch_id, offer_type, title, short_description,
      description, image_url, current_price, previous_price, valid_from,
      valid_to, weekdays, time_from, time_to, button_label
    ) values (
      input_restaurant_id, input_branch_id, input_offer_type, input_title,
      input_short_description, input_description, input_image_url,
      input_current_price, input_previous_price, input_valid_from, input_valid_to,
      input_weekdays, input_time_from, input_time_to, input_button_label
    ) returning * into offer_record;
    event_type_value := 'OFFER_CREATED';
  else
    update public.restaurant_offers
    set branch_id = input_branch_id,
        offer_type = input_offer_type,
        title = input_title,
        short_description = input_short_description,
        description = input_description,
        image_url = input_image_url,
        current_price = input_current_price,
        previous_price = input_previous_price,
        valid_from = input_valid_from,
        valid_to = input_valid_to,
        weekdays = input_weekdays,
        time_from = input_time_from,
        time_to = input_time_to,
        button_label = input_button_label
    where id = input_offer_id and restaurant_id = input_restaurant_id
    returning * into offer_record;
    if offer_record.id is null then
      raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND';
    end if;
    event_type_value := 'OFFER_UPDATED';
  end if;

  perform public.write_audit_event(
    input_restaurant_id, null, 'restaurant_user', auth.uid(), event_type_value,
    'success', 'owner_portal', 'restaurant_offer', offer_record.id, null,
    jsonb_build_object('offer_type', offer_record.offer_type, 'status', offer_record.status)
  );
  return to_jsonb(offer_record);
end;
$$;

create or replace function public.change_restaurant_offer_status(
  input_restaurant_id uuid,
  input_offer_id uuid,
  input_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  offer_record public.restaurant_offers%rowtype;
  event_type_value text;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'OFFER_ACCESS_DENIED';
  end if;

  if input_action = 'PUBLISH' then
    select * into offer_record from public.restaurant_offers
    where id = input_offer_id and restaurant_id = input_restaurant_id;
    if offer_record.id is null then
      raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND';
    end if;
    if offer_record.valid_to <= now() then
      raise exception using errcode = 'P0001', message = 'OFFER_PERIOD_EXPIRED';
    end if;
    update public.restaurant_offers
    set status = 'PUBLISHED', is_active = true,
        published_at = coalesce(published_at, now()), published_by = auth.uid(),
        archived_at = null
    where id = input_offer_id and restaurant_id = input_restaurant_id
    returning * into offer_record;
    event_type_value := 'OFFER_PUBLISHED';
  elsif input_action = 'DISABLE' then
    update public.restaurant_offers
    set status = 'DISABLED', is_active = false
    where id = input_offer_id and restaurant_id = input_restaurant_id
    returning * into offer_record;
    event_type_value := 'OFFER_DISABLED';
  elsif input_action = 'ARCHIVE' then
    update public.restaurant_offers
    set status = 'ARCHIVED', is_active = false, archived_at = now()
    where id = input_offer_id and restaurant_id = input_restaurant_id
    returning * into offer_record;
    event_type_value := 'OFFER_ARCHIVED';
  else
    raise exception using errcode = '22023', message = 'OFFER_ACTION_INVALID';
  end if;

  if offer_record.id is null then
    raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND';
  end if;

  perform public.write_audit_event(
    input_restaurant_id, null, 'restaurant_user', auth.uid(), event_type_value,
    'success', 'owner_portal', 'restaurant_offer', offer_record.id, null,
    jsonb_build_object('offer_type', offer_record.offer_type, 'status', offer_record.status)
  );
  return to_jsonb(offer_record);
end;
$$;

create or replace function public.duplicate_restaurant_offer(
  input_restaurant_id uuid,
  input_offer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_record public.restaurant_offers%rowtype;
  offer_record public.restaurant_offers%rowtype;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'OFFER_ACCESS_DENIED';
  end if;
  select * into source_record from public.restaurant_offers
  where id = input_offer_id and restaurant_id = input_restaurant_id;
  if source_record.id is null then
    raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND';
  end if;

  insert into public.restaurant_offers (
    restaurant_id, branch_id, offer_type, title, short_description, description,
    image_url, current_price, previous_price, valid_from, valid_to, weekdays,
    time_from, time_to, button_label
  ) values (
    source_record.restaurant_id, source_record.branch_id, source_record.offer_type,
    left('Kopie von ' || source_record.title, 120), source_record.short_description,
    source_record.description, source_record.image_url, source_record.current_price,
    source_record.previous_price, source_record.valid_from, source_record.valid_to,
    source_record.weekdays, source_record.time_from, source_record.time_to,
    source_record.button_label
  ) returning * into offer_record;

  perform public.write_audit_event(
    input_restaurant_id, null, 'restaurant_user', auth.uid(), 'OFFER_DUPLICATED',
    'success', 'owner_portal', 'restaurant_offer', offer_record.id, null,
    jsonb_build_object('source_offer_id', source_record.id)
  );
  return to_jsonb(offer_record);
end;
$$;

create or replace function public.delete_restaurant_offer_draft(
  input_restaurant_id uuid,
  input_offer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_id uuid;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'OFFER_ACCESS_DENIED';
  end if;
  delete from public.restaurant_offers
  where id = input_offer_id and restaurant_id = input_restaurant_id and status = 'DRAFT'
  returning id into deleted_id;
  if deleted_id is null then
    raise exception using errcode = 'P0001', message = 'OFFER_DRAFT_DELETE_BLOCKED';
  end if;
  perform public.write_audit_event(
    input_restaurant_id, null, 'restaurant_user', auth.uid(), 'OFFER_DRAFT_DELETED',
    'success', 'owner_portal', 'restaurant_offer', deleted_id, null, '{}'::jsonb
  );
  return true;
end;
$$;

create or replace function public.get_public_restaurant_offers(
  input_restaurant_slug text default null,
  input_limit integer default 20
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select coalesce(jsonb_agg(payload order by priority, published_at desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', o.id,
      'restaurant_id', o.restaurant_id,
      'restaurant_name', r.name,
      'restaurant_slug', r.slug,
      'branch_id', o.branch_id,
      'branch_name', b.name,
      'offer_type', o.offer_type,
      'title', o.title,
      'short_description', o.short_description,
      'description', o.description,
      'image_url', o.image_url,
      'current_price', o.current_price,
      'previous_price', o.previous_price,
      'currency', o.currency,
      'valid_from', o.valid_from,
      'valid_to', o.valid_to,
      'weekdays', o.weekdays,
      'time_from', o.time_from,
      'time_to', o.time_to,
      'button_label', o.button_label,
      'published_at', o.published_at
    ) as payload,
    case o.offer_type
      when 'LUNCH_MENU' then 1 when 'WEEKLY_OFFER' then 2
      when 'MONTHLY_OFFER' then 3 when 'SEASONAL_OFFER' then 4
      when 'NEW_DISH' then 5 when 'EVENT' then 6 else 7
    end as priority,
    o.published_at
    from public.restaurant_offers o
    join public.restaurants r on r.id = o.restaurant_id and r.status = 'active'
    join public.branches b on b.id = o.branch_id and b.restaurant_id = r.id and b.status = 'active'
    where o.status = 'PUBLISHED'
      and o.is_active = true
      and o.valid_from <= now()
      and o.valid_to > now()
      and (
        o.weekdays is null
        or cardinality(o.weekdays) = 0
        or extract(isodow from now() at time zone 'Europe/Vienna')::integer = any(o.weekdays)
      )
      and (
        o.time_from is null
        or o.time_to is null
        or (
          (now() at time zone 'Europe/Vienna')::time >= o.time_from
          and (now() at time zone 'Europe/Vienna')::time < o.time_to
        )
      )
      and (
        (input_restaurant_slug is not null and r.slug = trim(input_restaurant_slug))
        or (input_restaurant_slug is null and b.is_discoverable = true)
      )
    order by priority, o.published_at desc
    limit least(greatest(coalesce(input_limit, 20), 1), 100)
  ) visible_offers;
$$;

create or replace function public.record_public_restaurant_offer_event(
  input_offer_id uuid,
  input_event_type text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  offer_record public.restaurant_offers%rowtype;
begin
  if input_event_type not in (
    'OFFER_VIEWED', 'OFFER_CTA_CLICKED', 'OFFER_ROUTE_CLICKED', 'OFFER_BONUS_OPENED'
  ) then
    raise exception using errcode = '22023', message = 'OFFER_EVENT_INVALID';
  end if;
  select o.* into offer_record
  from public.restaurant_offers o
  join public.restaurants r on r.id = o.restaurant_id and r.status = 'active'
  join public.branches b on b.id = o.branch_id and b.restaurant_id = r.id and b.status = 'active'
  where o.id = input_offer_id and o.status = 'PUBLISHED' and o.is_active = true
    and o.valid_from <= now() and o.valid_to > now()
    and (
      o.weekdays is null
      or cardinality(o.weekdays) = 0
      or extract(isodow from now() at time zone 'Europe/Vienna')::integer = any(o.weekdays)
    )
    and (
      o.time_from is null
      or o.time_to is null
      or (
        (now() at time zone 'Europe/Vienna')::time >= o.time_from
        and (now() at time zone 'Europe/Vienna')::time < o.time_to
      )
    );
  if offer_record.id is null then return false; end if;

  insert into public.restaurant_offer_metrics (
    restaurant_id, offer_id, metric_date, event_type, event_count
  ) values (
    offer_record.restaurant_id, offer_record.id,
    (now() at time zone 'Europe/Vienna')::date, input_event_type, 1
  )
  on conflict (offer_id, metric_date, event_type)
  do update set event_count = public.restaurant_offer_metrics.event_count + 1, updated_at = now();
  return true;
end;
$$;

revoke all on function public.validate_restaurant_offer_row() from public, anon, authenticated;
revoke all on function public.list_restaurant_offers(uuid) from public, anon, authenticated;
revoke all on function public.save_restaurant_offer(uuid, uuid, uuid, text, text, text, text, text, numeric, numeric, timestamptz, timestamptz, integer[], time, time, text) from public, anon, authenticated;
revoke all on function public.change_restaurant_offer_status(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.duplicate_restaurant_offer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_restaurant_offer_draft(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_public_restaurant_offers(text, integer) from public, anon, authenticated;
revoke all on function public.record_public_restaurant_offer_event(uuid, text) from public, anon, authenticated;

grant execute on function public.list_restaurant_offers(uuid) to authenticated;
grant execute on function public.save_restaurant_offer(uuid, uuid, uuid, text, text, text, text, text, numeric, numeric, timestamptz, timestamptz, integer[], time, time, text) to authenticated;
grant execute on function public.change_restaurant_offer_status(uuid, uuid, text) to authenticated;
grant execute on function public.duplicate_restaurant_offer(uuid, uuid) to authenticated;
grant execute on function public.delete_restaurant_offer_draft(uuid, uuid) to authenticated;
grant execute on function public.get_public_restaurant_offers(text, integer) to anon, authenticated;
grant execute on function public.record_public_restaurant_offer_event(uuid, text) to anon, authenticated;

comment on table public.restaurant_offers is
  'V1 informational restaurant posts; intentionally independent from rewards and points.';
comment on table public.restaurant_offer_metrics is
  'PII-free daily aggregate counters for public offer interactions.';
