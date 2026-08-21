-- Align offer audit writes with the established audit_log actor_type contract.
-- The original offer RPCs used restaurant_user, while audit_log accepts admin,
-- staff, customer, and system. No table, RLS, or business-rule change is made.

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
    input_restaurant_id, null, 'admin', auth.uid(), event_type_value,
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
    input_restaurant_id, null, 'admin', auth.uid(), event_type_value,
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
    input_restaurant_id, null, 'admin', auth.uid(), 'OFFER_DUPLICATED',
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
    input_restaurant_id, null, 'admin', auth.uid(), 'OFFER_DRAFT_DELETED',
    'success', 'owner_portal', 'restaurant_offer', deleted_id, null, '{}'::jsonb
  );
  return true;
end;
$$;

revoke all on function public.save_restaurant_offer(uuid, uuid, uuid, text, text, text, text, text, numeric, numeric, timestamptz, timestamptz, integer[], time, time, text) from public, anon, authenticated;
revoke all on function public.change_restaurant_offer_status(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.duplicate_restaurant_offer(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_restaurant_offer_draft(uuid, uuid) from public, anon, authenticated;

grant execute on function public.save_restaurant_offer(uuid, uuid, uuid, text, text, text, text, text, numeric, numeric, timestamptz, timestamptz, integer[], time, time, text) to authenticated;
grant execute on function public.change_restaurant_offer_status(uuid, uuid, text) to authenticated;
grant execute on function public.duplicate_restaurant_offer(uuid, uuid) to authenticated;
grant execute on function public.delete_restaurant_offer_draft(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
