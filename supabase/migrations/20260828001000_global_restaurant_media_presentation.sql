-- Shared photo presentation contract for restaurant-owned 16:9 media.
-- Original uploads remain unchanged; legacy rows keep centered cover defaults.

alter table public.restaurant_offers
  add column if not exists image_zoom numeric(5, 3) not null default 1,
  add column if not exists image_position_x numeric(6, 5) not null default 0.5,
  add column if not exists image_position_y numeric(6, 5) not null default 0.5,
  add column if not exists image_aspect_ratio text not null default '16:9',
  add column if not exists image_crop_version smallint not null default 1;

alter table public.branches
  add column if not exists public_cover_image_zoom numeric(5, 3) not null default 1,
  add column if not exists public_cover_image_position_x numeric(6, 5) not null default 0.5,
  add column if not exists public_cover_image_position_y numeric(6, 5) not null default 0.5,
  add column if not exists public_cover_image_aspect_ratio text not null default '16:9',
  add column if not exists public_cover_image_crop_version smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurant_offers_image_zoom_valid' and conrelid = 'public.restaurant_offers'::regclass) then
    alter table public.restaurant_offers add constraint restaurant_offers_image_zoom_valid check (image_zoom between 0.1 and 4);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurant_offers_image_position_x_valid' and conrelid = 'public.restaurant_offers'::regclass) then
    alter table public.restaurant_offers add constraint restaurant_offers_image_position_x_valid check (image_position_x between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurant_offers_image_position_y_valid' and conrelid = 'public.restaurant_offers'::regclass) then
    alter table public.restaurant_offers add constraint restaurant_offers_image_position_y_valid check (image_position_y between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurant_offers_image_aspect_ratio_valid' and conrelid = 'public.restaurant_offers'::regclass) then
    alter table public.restaurant_offers add constraint restaurant_offers_image_aspect_ratio_valid check (image_aspect_ratio = '16:9');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurant_offers_image_crop_version_valid' and conrelid = 'public.restaurant_offers'::regclass) then
    alter table public.restaurant_offers add constraint restaurant_offers_image_crop_version_valid check (image_crop_version >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'branches_public_cover_image_zoom_valid' and conrelid = 'public.branches'::regclass) then
    alter table public.branches add constraint branches_public_cover_image_zoom_valid check (public_cover_image_zoom between 0.1 and 4);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'branches_public_cover_image_position_x_valid' and conrelid = 'public.branches'::regclass) then
    alter table public.branches add constraint branches_public_cover_image_position_x_valid check (public_cover_image_position_x between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'branches_public_cover_image_position_y_valid' and conrelid = 'public.branches'::regclass) then
    alter table public.branches add constraint branches_public_cover_image_position_y_valid check (public_cover_image_position_y between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'branches_public_cover_image_aspect_ratio_valid' and conrelid = 'public.branches'::regclass) then
    alter table public.branches add constraint branches_public_cover_image_aspect_ratio_valid check (public_cover_image_aspect_ratio = '16:9');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'branches_public_cover_image_crop_version_valid' and conrelid = 'public.branches'::regclass) then
    alter table public.branches add constraint branches_public_cover_image_crop_version_valid check (public_cover_image_crop_version >= 1);
  end if;
end $$;

create or replace function public.save_restaurant_offer_image_presentation(
  input_restaurant_id uuid,
  input_offer_id uuid,
  input_image_zoom numeric,
  input_image_position_x numeric,
  input_image_position_y numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  offer_record public.restaurant_offers%rowtype;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception using errcode = '42501', message = 'OFFER_ACCESS_DENIED';
  end if;

  update public.restaurant_offers
  set image_zoom = input_image_zoom,
      image_position_x = input_image_position_x,
      image_position_y = input_image_position_y,
      image_aspect_ratio = '16:9',
      image_crop_version = 1
  where id = input_offer_id
    and restaurant_id = input_restaurant_id
  returning * into offer_record;

  if offer_record.id is null then
    raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND';
  end if;

  perform public.write_audit_event(
    input_restaurant_id, null, 'admin', auth.uid(),
    'OFFER_IMAGE_PRESENTATION_UPDATED', 'success', 'owner_portal',
    'restaurant_offer', offer_record.id, null,
    jsonb_build_object('image_crop_version', offer_record.image_crop_version)
  );

  return to_jsonb(offer_record);
end;
$$;

revoke all on function public.save_restaurant_offer_image_presentation(uuid, uuid, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.save_restaurant_offer_image_presentation(uuid, uuid, numeric, numeric, numeric) to authenticated;

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

  select * into source_record
  from public.restaurant_offers
  where id = input_offer_id
    and restaurant_id = input_restaurant_id;

  if source_record.id is null then
    raise exception using errcode = 'P0002', message = 'OFFER_NOT_FOUND';
  end if;

  insert into public.restaurant_offers (
    restaurant_id, branch_id, offer_type, title, short_description, description,
    image_url, image_zoom, image_position_x, image_position_y,
    image_aspect_ratio, image_crop_version,
    current_price, previous_price, valid_from, valid_to, weekdays,
    time_from, time_to, button_label
  ) values (
    source_record.restaurant_id, source_record.branch_id, source_record.offer_type,
    left('Kopie von ' || source_record.title, 120), source_record.short_description,
    source_record.description, source_record.image_url, source_record.image_zoom,
    source_record.image_position_x, source_record.image_position_y,
    source_record.image_aspect_ratio, source_record.image_crop_version,
    source_record.current_price, source_record.previous_price,
    source_record.valid_from, source_record.valid_to, source_record.weekdays,
    source_record.time_from, source_record.time_to, source_record.button_label
  ) returning * into offer_record;

  perform public.write_audit_event(
    input_restaurant_id, null, 'admin', auth.uid(), 'OFFER_DUPLICATED',
    'success', 'owner_portal', 'restaurant_offer', offer_record.id, null,
    jsonb_build_object('source_offer_id', source_record.id)
  );

  return to_jsonb(offer_record);
end;
$$;

revoke all on function public.duplicate_restaurant_offer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.duplicate_restaurant_offer(uuid, uuid) to authenticated;

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
      'image_zoom', o.image_zoom,
      'image_position_x', o.image_position_x,
      'image_position_y', o.image_position_y,
      'image_aspect_ratio', o.image_aspect_ratio,
      'image_crop_version', o.image_crop_version,
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
      and o.valid_to > now()
      and (
        (input_restaurant_slug is not null and r.slug = trim(input_restaurant_slug))
        or (input_restaurant_slug is null and b.is_discoverable = true)
      )
    order by priority, o.published_at desc
    limit least(greatest(coalesce(input_limit, 20), 1), 100)
  ) visible_offers;
$$;

revoke all on function public.get_public_restaurant_offers(text, integer) from public, anon, authenticated;
grant execute on function public.get_public_restaurant_offers(text, integer) to anon, authenticated;

do $$
begin
  if to_regprocedure('public.get_partner_local_finder_without_media_presentation(jsonb,integer,integer)') is null then
    alter function public.get_partner_local_finder(jsonb, integer, integer)
      rename to get_partner_local_finder_without_media_presentation;
  end if;
end $$;

revoke all on function public.get_partner_local_finder_without_media_presentation(jsonb, integer, integer) from public, anon, authenticated;

create or replace function public.get_partner_local_finder(
  input_customer_tokens jsonb default '{}'::jsonb,
  input_limit integer default 100,
  input_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select public.get_partner_local_finder_without_media_presentation(
      input_customer_tokens,
      input_limit,
      input_offset
    ) as payload
  ), enriched_items as (
    select coalesce(jsonb_agg(
      item || jsonb_build_object(
        'cover_image_zoom', branch.public_cover_image_zoom,
        'cover_image_position_x', branch.public_cover_image_position_x,
        'cover_image_position_y', branch.public_cover_image_position_y,
        'cover_image_aspect_ratio', branch.public_cover_image_aspect_ratio,
        'cover_image_crop_version', branch.public_cover_image_crop_version
      ) order by item_index
    ), '[]'::jsonb) as items
    from base
    cross join lateral jsonb_array_elements(base.payload -> 'items') with ordinality entries(item, item_index)
    join public.branches branch on branch.id = (item ->> 'branch_id')::uuid
  )
  select jsonb_set(base.payload, '{items}', enriched_items.items, true)
  from base, enriched_items;
$$;

revoke all on function public.get_partner_local_finder(jsonb, integer, integer) from public, anon, authenticated;
grant execute on function public.get_partner_local_finder(jsonb, integer, integer) to anon, authenticated;

notify pgrst, 'reload schema';
