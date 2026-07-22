create or replace function public.inspect_redemption_code(
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
  reward_record public.rewards%rowtype;
  restaurant_name text;
  source_status text;
  staff_record public.staff_members%rowtype;
  code_hash_value text;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    if nullif(trim(coalesce(input_staff_session_token, '')), '') is null then
      raise exception 'Nicht berechtigt.';
    end if;

    staff_record := public.get_staff_from_session(input_restaurant_id, input_staff_session_token);
    if staff_record.id is null then
      raise exception 'Mitarbeitersitzung ist nicht gültig.';
    end if;
  end if;

  if trim(coalesce(input_code, '')) !~ '^[0-9]{6}$' then
    raise exception 'Einlösecode ist nicht gültig.';
  end if;

  perform public.expire_redemption_codes(now());
  code_hash_value := encode(extensions.digest(trim(input_code), 'sha256'), 'hex');

  select rc.*
  into code_record
  from public.redemption_codes rc
  where rc.restaurant_id = input_restaurant_id
    and rc.code_hash = code_hash_value
  order by case rc.status when 'active' then 0 when 'redeemed' then 1 else 2 end,
    rc.created_at desc
  limit 1;

  if code_record.id is null then
    raise exception 'Einlösecode ist nicht gültig.';
  end if;
  if code_record.status = 'expired' or code_record.expires_at <= now() then
    raise exception 'Einlösecode ist abgelaufen.';
  end if;
  if code_record.status = 'redeemed' then
    raise exception 'Einlösecode wurde bereits verwendet.';
  end if;
  if code_record.status <> 'active' then
    raise exception 'Einlösecode ist nicht mehr verfügbar.';
  end if;

  if code_record.redemption_type = 'points_redemption' then
    select re.status
    into source_status
    from public.reward_redemption_events re
    where re.id = code_record.source_id
      and re.restaurant_id = code_record.restaurant_id
      and re.customer_id = code_record.customer_id;

    if source_status is distinct from 'started' then
      raise exception 'Punkteeinlösung ist nicht mehr verfügbar.';
    end if;
  else
    select cr.status
    into source_status
    from public.customer_rewards cr
    where cr.id = code_record.source_id
      and cr.restaurant_id = code_record.restaurant_id
      and cr.customer_id = code_record.customer_id;

    if source_status is distinct from 'redemption_started' then
      raise exception 'Geschenk ist nicht mehr verfügbar.';
    end if;
  end if;

  select r.* into reward_record
  from public.rewards r
  where r.id = code_record.reward_id
    and r.restaurant_id = code_record.restaurant_id;

  if reward_record.id is null then
    raise exception 'Punkteeinlösung ist nicht mehr verfügbar.';
  end if;

  select r.name into restaurant_name
  from public.restaurants r
  where r.id = code_record.restaurant_id;

  return jsonb_build_object(
    'valid', true,
    'status', 'active',
    'redemption_type', code_record.redemption_type,
    'title', reward_record.title,
    'description', nullif(trim(reward_record.description), ''),
    'category', nullif(trim(reward_record.category), ''),
    'product_price', reward_record.product_price,
    'required_points', reward_record.required_points,
    'required_stamps', reward_record.required_stamps,
    'restaurant_name', restaurant_name,
    'expires_at', code_record.expires_at
  );
end;
$$;

revoke execute on function public.inspect_redemption_code(uuid, text, text) from public;
grant execute on function public.inspect_redemption_code(uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
