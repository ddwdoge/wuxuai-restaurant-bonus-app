-- Additive, presentation-only metadata for adaptive restaurant logo rendering.
alter table public.restaurant_branding
  add column if not exists logo_fit_mode text not null default 'auto',
  add column if not exists logo_scale numeric(5, 3) not null default 1,
  add column if not exists logo_position_x numeric(6, 5) not null default 0.5,
  add column if not exists logo_position_y numeric(6, 5) not null default 0.5;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_branding_logo_fit_mode_valid'
      and conrelid = 'public.restaurant_branding'::regclass
  ) then
    alter table public.restaurant_branding
      add constraint restaurant_branding_logo_fit_mode_valid
      check (logo_fit_mode in ('auto', 'manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_branding_logo_scale_valid'
      and conrelid = 'public.restaurant_branding'::regclass
  ) then
    alter table public.restaurant_branding
      add constraint restaurant_branding_logo_scale_valid
      check (logo_scale between 0.75 and 3);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_branding_logo_position_x_valid'
      and conrelid = 'public.restaurant_branding'::regclass
  ) then
    alter table public.restaurant_branding
      add constraint restaurant_branding_logo_position_x_valid
      check (logo_position_x between 0 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurant_branding_logo_position_y_valid'
      and conrelid = 'public.restaurant_branding'::regclass
  ) then
    alter table public.restaurant_branding
      add constraint restaurant_branding_logo_position_y_valid
      check (logo_position_y between 0 and 1);
  end if;
end
$$;

comment on column public.restaurant_branding.logo_fit_mode is
  'Presentation mode only: automatic aspect-aware contain or owner-adjusted manual transform.';
comment on column public.restaurant_branding.logo_scale is
  'Non-destructive logo presentation scale. The original uploaded object is unchanged.';
comment on column public.restaurant_branding.logo_position_x is
  'Normalized horizontal logo presentation position from 0 to 1.';
comment on column public.restaurant_branding.logo_position_y is
  'Normalized vertical logo presentation position from 0 to 1.';

-- Preserve the hardened token checks while adding safe presentation metadata
-- to the existing portal payload. No direct table grants are added.
create or replace function public.get_public_customer_portal(
  input_restaurant_slug text,
  input_customer_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_id_value uuid;
  token_active boolean;
  token_expires_at timestamptz;
  membership_status_value text;
  portal_payload jsonb;
  branding_record public.restaurant_branding%rowtype;
begin
  select r.id
  into restaurant_id_value
  from public.restaurants r
  where r.slug = trim(input_restaurant_slug)
    and r.status = 'active';

  if restaurant_id_value is null then
    return public.get_public_customer_portal_unchecked(input_restaurant_slug, input_customer_token);
  end if;

  if nullif(trim(coalesce(input_customer_token, '')), '') is not null then
    select t.active, t.expires_at, c.membership_status
    into token_active, token_expires_at, membership_status_value
    from public.customer_qr_tokens t
    join public.customers c
      on c.id = t.customer_id
     and c.restaurant_id = restaurant_id_value
    where t.restaurant_id = restaurant_id_value
      and t.token_hash = public.hash_public_token(input_customer_token)
    order by t.created_at desc
    limit 1;

    if not found then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCESS_TOKEN_INVALID';
    end if;

    if not token_active or (token_expires_at is not null and token_expires_at <= now()) then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_ACCESS_TOKEN_REVOKED';
    end if;

    if membership_status_value is distinct from 'active' then
      raise exception using errcode = 'P0001', message = 'CUSTOMER_MEMBERSHIP_INACTIVE';
    end if;
  end if;

  portal_payload := public.get_public_customer_portal_unchecked(input_restaurant_slug, input_customer_token);

  select rb.*
  into branding_record
  from public.restaurant_branding rb
  where rb.restaurant_id = restaurant_id_value;

  if branding_record.id is not null then
    portal_payload := jsonb_set(
      portal_payload,
      '{branding}',
      coalesce(portal_payload -> 'branding', '{}'::jsonb) || jsonb_build_object(
        'logo_fit_mode', branding_record.logo_fit_mode,
        'logo_scale', branding_record.logo_scale,
        'logo_position_x', branding_record.logo_position_x,
        'logo_position_y', branding_record.logo_position_y
      ),
      true
    );
  end if;

  return portal_payload;
end;
$$;

revoke execute on function public.get_public_customer_portal(text, text) from public;
grant execute on function public.get_public_customer_portal(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
