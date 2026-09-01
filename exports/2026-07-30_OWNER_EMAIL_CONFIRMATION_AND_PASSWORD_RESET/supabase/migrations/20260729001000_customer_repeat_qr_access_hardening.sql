-- Repeat-QR access hardening: keep the public contract and require an active,
-- restaurant-scoped token membership before delegating to the existing portal.

do $$
begin
  if to_regprocedure('public.get_public_customer_portal_unchecked(text,text)') is null then
    alter function public.get_public_customer_portal(text, text)
      rename to get_public_customer_portal_unchecked;
  end if;
end
$$;

revoke execute on function public.get_public_customer_portal_unchecked(text, text)
from public, anon, authenticated;

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
  token_found boolean := false;
  token_active boolean;
  token_expires_at timestamptz;
  membership_status_value text;
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
    select true, t.active, t.expires_at, c.membership_status
    into token_found, token_active, token_expires_at, membership_status_value
    from public.customer_qr_tokens t
    join public.customers c
      on c.id = t.customer_id
     and c.restaurant_id = restaurant_id_value
    where t.restaurant_id = restaurant_id_value
      and t.token_hash = public.hash_public_token(input_customer_token)
    order by t.created_at desc
    limit 1;

    if not token_found then
      raise exception using
        errcode = 'P0001',
        message = 'CUSTOMER_ACCESS_TOKEN_INVALID';
    end if;

    if not token_active or (token_expires_at is not null and token_expires_at <= now()) then
      raise exception using
        errcode = 'P0001',
        message = 'CUSTOMER_ACCESS_TOKEN_REVOKED';
    end if;

    if membership_status_value is distinct from 'active' then
      raise exception using
        errcode = 'P0001',
        message = 'CUSTOMER_MEMBERSHIP_INACTIVE';
    end if;
  end if;

  return public.get_public_customer_portal_unchecked(input_restaurant_slug, input_customer_token);
end;
$$;

revoke execute on function public.get_public_customer_portal(text, text) from public;
grant execute on function public.get_public_customer_portal(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
