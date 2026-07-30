create or replace function public.create_staff_member_with_pin(
  input_restaurant_id uuid,
  input_name text,
  input_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_id uuid;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then
    raise exception 'not allowed';
  end if;

  if length(trim(coalesce(input_name, ''))) < 2 then
    raise exception 'staff name is required';
  end if;

  if length(coalesce(input_pin, '')) < 4 then
    raise exception 'staff pin must have at least 4 digits';
  end if;

  insert into public.staff_members (
    restaurant_id,
    name,
    pin_hash,
    role,
    active
  )
  values (
    input_restaurant_id,
    trim(input_name),
    extensions.crypt(input_pin, extensions.gen_salt('bf')),
    'staff',
    true
  )
  returning id into staff_id;

  return staff_id;
end;
$$;

grant execute on function public.create_staff_member_with_pin(uuid, text, text)
to authenticated;
