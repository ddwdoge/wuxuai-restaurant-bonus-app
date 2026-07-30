-- Fix two contracts exposed by the post-reset Staging security verification.

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

create or replace function public.support_update_customer_identity(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_change_type text,
  input_new_phone text,
  input_birthday_day integer,
  input_birthday_month integer,
  input_identity_verified boolean,
  input_verification_method text,
  input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  customer_record public.customers%rowtype;
  normalized_value text;
  raw_token text := null;
begin
  if not public.can_manage_customer_identity(input_restaurant_id) then
    raise exception 'Keine Berechtigung.';
  end if;
  if not input_identity_verified then
    raise exception 'Bitte bestätige die Identitätsprüfung.';
  end if;
  if length(trim(coalesce(input_verification_method, ''))) < 3
     or length(trim(coalesce(input_reason, ''))) < 3 then
    raise exception 'Prüfart und Änderungsgrund sind erforderlich.';
  end if;

  select * into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id
  for update;

  if customer_record.id is null then
    raise exception 'Gast wurde nicht gefunden.';
  end if;

  perform set_config('wuxuai.customer_identity_change', 'on', true);
  perform public.write_audit_event(
    input_restaurant_id, input_customer_id, 'admin', auth.uid(),
    'CUSTOMER_IDENTITY_VERIFIED_BY_RESTAURANT', 'success', 'owner_portal',
    'customers', input_customer_id, null,
    jsonb_build_object(
      'verification_method', left(trim(input_verification_method), 80),
      'change_type', input_change_type,
      'reason', left(trim(input_reason), 200)
    )
  );

  if input_change_type = 'phone' then
    normalized_value := public.normalize_customer_phone(input_new_phone);
    if normalized_value is null then
      raise exception 'Bitte gib eine gültige Telefonnummer ein.';
    end if;
    if exists (
      select 1 from public.customers
      where restaurant_id = input_restaurant_id
        and normalized_phone = normalized_value
        and id <> input_customer_id
    ) then
      raise exception 'Diese Telefonnummer ist bereits mit einem anderen Kundenkonto dieses Restaurants verbunden. Eine automatische Zusammenführung ist nicht möglich.';
    end if;

    update public.customers
    set phone = normalized_value,
        normalized_phone = normalized_value
    where id = input_customer_id;

    update public.customer_qr_tokens
    set active = false,
        rotated_at = now()
    where restaurant_id = input_restaurant_id
      and customer_id = input_customer_id
      and active = true;

    delete from public.customer_devices
    where restaurant_id = input_restaurant_id
      and customer_id = input_customer_id;

    raw_token := encode(gen_random_bytes(32), 'hex');
    insert into public.customer_qr_tokens (
      restaurant_id, customer_id, token_hash, active
    ) values (
      input_restaurant_id, input_customer_id,
      public.hash_public_token(raw_token), true
    );

    perform public.write_audit_event(
      input_restaurant_id, input_customer_id, 'admin', auth.uid(),
      'CUSTOMER_PHONE_CHANGED_BY_SUPPORT', 'success', 'owner_portal',
      'customers', input_customer_id, null,
      jsonb_build_object('reason', left(trim(input_reason), 200))
    );
    perform public.write_audit_event(
      input_restaurant_id, input_customer_id, 'admin', auth.uid(),
      'CUSTOMER_SESSIONS_REVOKED', 'success', 'owner_portal',
      'customers', input_customer_id, null, '{}'::jsonb
    );
    perform public.write_audit_event(
      input_restaurant_id, input_customer_id, 'admin', auth.uid(),
      'CUSTOMER_TOKEN_ROTATED', 'success', 'owner_portal',
      'customers', input_customer_id, null, '{}'::jsonb
    );
  elsif input_change_type = 'birthday' then
    if public.v1_birthday_date(input_birthday_day, input_birthday_month, 2024) is null then
      raise exception 'Bitte gib einen gültigen Geburtstag ein.';
    end if;

    update public.customers
    set birthday_day = input_birthday_day,
        birthday_month = input_birthday_month,
        birthday = make_date(
          2000,
          input_birthday_month,
          least(
            input_birthday_day,
            extract(day from (
              make_date(2000, input_birthday_month, 1)
              + interval '1 month - 1 day'
            ))::integer
          )
        ),
        birthday_updated_at = now()
    where id = input_customer_id;

    perform public.write_audit_event(
      input_restaurant_id, input_customer_id, 'admin', auth.uid(),
      'CUSTOMER_BIRTHDATE_CHANGED_BY_SUPPORT', 'success', 'owner_portal',
      'customers', input_customer_id, null,
      jsonb_build_object('reason', left(trim(input_reason), 200))
    );
  else
    raise exception 'Unbekannte Änderung.';
  end if;

  return jsonb_build_object(
    'success', true,
    'customer_id', input_customer_id,
    'new_customer_token', raw_token
  );
end;
$$;

revoke execute on function public.support_update_customer_identity(
  uuid, uuid, text, text, integer, integer, boolean, text, text
) from public, anon;
grant execute on function public.support_update_customer_identity(
  uuid, uuid, text, text, integer, integer, boolean, text, text
) to authenticated;

notify pgrst, 'reload schema';
