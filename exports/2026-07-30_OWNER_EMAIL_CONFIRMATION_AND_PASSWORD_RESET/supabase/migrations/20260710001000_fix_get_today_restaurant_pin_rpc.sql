create table if not exists public.restaurant_daily_pins (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  pin_code text not null check (pin_code ~ '^[0-9]{4}$'),
  valid_date date not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists restaurant_daily_pins_restaurant_branch_date_idx
on public.restaurant_daily_pins (
  restaurant_id,
  coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  valid_date
);

create index if not exists restaurant_daily_pins_valid_idx
on public.restaurant_daily_pins (restaurant_id, branch_id, valid_date, valid_until);

alter table public.restaurant_daily_pins enable row level security;

drop policy if exists "restaurant daily pins member select" on public.restaurant_daily_pins;
create policy "restaurant daily pins member select"
on public.restaurant_daily_pins for select
using (public.is_restaurant_member(restaurant_id));

create or replace function public.generate_daily_pin_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  random_bytes bytea;
  random_value integer;
begin
  random_bytes := gen_random_bytes(2);
  random_value := (get_byte(random_bytes, 0) * 256 + get_byte(random_bytes, 1)) % 10000;
  return lpad(random_value::text, 4, '0');
end;
$$;

create or replace function public.ensure_today_restaurant_pin(
  input_restaurant_id uuid,
  input_branch_id uuid default null
)
returns public.restaurant_daily_pins
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  branch_id_value uuid;
  pin_record public.restaurant_daily_pins%rowtype;
  next_pin text;
  attempts integer := 0;
begin
  select *
  into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
    and status = 'active';

  if restaurant_record.id is null then
    raise exception 'Restaurant wurde nicht gefunden.';
  end if;

  branch_id_value := coalesce(input_branch_id, restaurant_record.primary_branch_id, public.restaurant_primary_branch_id(restaurant_record.id));

  select *
  into pin_record
  from public.restaurant_daily_pins
  where restaurant_id = restaurant_record.id
    and branch_id is not distinct from branch_id_value
    and valid_date = current_date
  limit 1;

  if pin_record.id is not null then
    return pin_record;
  end if;

  loop
    attempts := attempts + 1;
    next_pin := public.generate_daily_pin_code();

    begin
      insert into public.restaurant_daily_pins (
        restaurant_id,
        branch_id,
        pin_code,
        valid_date,
        valid_from,
        valid_until
      )
      values (
        restaurant_record.id,
        branch_id_value,
        next_pin,
        current_date,
        current_date::timestamptz,
        (current_date + interval '1 day' - interval '1 second')::timestamptz
      )
      returning * into pin_record;

      return pin_record;
    exception
      when unique_violation then
        select *
        into pin_record
        from public.restaurant_daily_pins
        where restaurant_id = restaurant_record.id
          and branch_id is not distinct from branch_id_value
          and valid_date = current_date
        limit 1;

        if pin_record.id is not null then
          return pin_record;
        end if;

        if attempts >= 8 then
          raise exception 'Tages-PIN konnte nicht erstellt werden.';
        end if;
    end;
  end loop;
end;
$$;

create or replace function public.get_today_restaurant_pin(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pin_record public.restaurant_daily_pins%rowtype;
begin
  if not public.is_restaurant_member(input_restaurant_id) then
    raise exception 'Nicht berechtigt.';
  end if;

  pin_record := public.ensure_today_restaurant_pin(input_restaurant_id, null);

  return jsonb_build_object(
    'pin_code', pin_record.pin_code,
    'valid_until', pin_record.valid_until
  );
end;
$$;

revoke execute on function public.generate_daily_pin_code()
from public, anon, authenticated;

revoke execute on function public.ensure_today_restaurant_pin(uuid, uuid)
from public, anon, authenticated;

revoke execute on function public.get_today_restaurant_pin(uuid)
from public, anon;

grant execute on function public.get_today_restaurant_pin(uuid)
to authenticated;

notify pgrst, 'reload schema';
