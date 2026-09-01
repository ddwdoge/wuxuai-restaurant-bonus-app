-- Customer identity V1: restaurant-scoped phone identity without SMS OTP.

create or replace function public.normalize_customer_phone(input_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  compact text;
begin
  compact := regexp_replace(trim(coalesce(input_phone, '')), '[^0-9+]', '', 'g');
  if compact like '00%' then compact := '+' || substr(compact, 3); end if;
  if compact ~ '^0[0-9]+$' then compact := '+43' || substr(compact, 2); end if;
  if compact ~ '^43[0-9]+$' then compact := '+' || compact; end if;
  if compact !~ '^\+[1-9][0-9]{7,14}$' then return null; end if;
  return compact;
end;
$$;

alter table public.customers add column if not exists normalized_phone text;
alter table public.customers add column if not exists phone_locked_at timestamptz;
alter table public.customers add column if not exists birthday_locked_at timestamptz;
alter table public.customers add column if not exists identity_updated_at timestamptz;

do $$
begin
  if exists (select 1 from public.customers where phone is null) then
    raise exception 'CUSTOMER_IDENTITY_MIGRATION_MISSING_PHONE';
  end if;
  if exists (
    select 1 from public.customers
    where phone is not null and public.normalize_customer_phone(phone) is null
  ) then
    raise exception 'CUSTOMER_IDENTITY_MIGRATION_INVALID_PHONE';
  end if;
  if exists (
    select 1
    from public.customers
    where phone is not null
    group by restaurant_id, public.normalize_customer_phone(phone)
    having count(*) > 1
  ) then
    raise exception 'CUSTOMER_IDENTITY_MIGRATION_DUPLICATES_FOUND';
  end if;
end;
$$;

update public.customers
set normalized_phone = public.normalize_customer_phone(phone),
    phone = public.normalize_customer_phone(phone),
    phone_locked_at = coalesce(phone_locked_at, created_at),
    birthday_locked_at = case
      when birthday is not null or birthday_day is not null or birthday_month is not null
        then coalesce(birthday_locked_at, birthday_updated_at, created_at)
      else birthday_locked_at
    end
where phone is not null;

alter table public.customers alter column normalized_phone set not null;

create unique index if not exists customers_restaurant_normalized_phone_unique_idx
  on public.customers (restaurant_id, normalized_phone);

create or replace function public.guard_customer_identity_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_value text;
  trusted_change boolean := coalesce(current_setting('wuxuai.customer_identity_change', true), '') = 'on';
begin
  if new.phone is null then raise exception 'Telefonnummer ist erforderlich.'; end if;
  if new.phone is not null then
    normalized_value := public.normalize_customer_phone(new.phone);
    if normalized_value is null then raise exception 'Bitte gib eine gültige Telefonnummer ein.'; end if;
    new.phone := normalized_value;
    new.normalized_phone := normalized_value;
  else
    new.normalized_phone := null;
  end if;

  if tg_op = 'INSERT' then
    if new.phone is not null then new.phone_locked_at := coalesce(new.phone_locked_at, now()); end if;
    if new.birthday is not null or new.birthday_day is not null or new.birthday_month is not null then
      new.birthday_locked_at := coalesce(new.birthday_locked_at, now());
    end if;
    return new;
  end if;

  if not trusted_change and (
    new.phone is distinct from old.phone
    or new.normalized_phone is distinct from old.normalized_phone
    or new.birthday is distinct from old.birthday
    or new.birthday_day is distinct from old.birthday_day
    or new.birthday_month is distinct from old.birthday_month
  ) then
    raise exception 'Identitätsdaten können nur durch autorisierten Restaurant-Support geändert werden.';
  end if;

  if new.phone is distinct from old.phone then new.phone_locked_at := now(); end if;
  if new.birthday is distinct from old.birthday
     or new.birthday_day is distinct from old.birthday_day
     or new.birthday_month is distinct from old.birthday_month then
    new.birthday_locked_at := now();
  end if;
  if trusted_change then new.identity_updated_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists guard_customer_identity_fields on public.customers;
create trigger guard_customer_identity_fields
before insert or update on public.customers
for each row execute function public.guard_customer_identity_fields();

create table if not exists public.restaurant_security_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  sms_verification_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.restaurant_security_settings enable row level security;
drop policy if exists "restaurant security settings admin read" on public.restaurant_security_settings;
create policy "restaurant security settings admin read"
on public.restaurant_security_settings for select to authenticated
using (public.is_restaurant_admin(restaurant_id));
revoke insert, update, delete on public.restaurant_security_settings from anon, authenticated;

create or replace function public.audit_safe_metadata(input_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare result jsonb;
begin
  if input_value is null then return '{}'::jsonb; end if;
  if jsonb_typeof(input_value) = 'object' then
    select coalesce(jsonb_object_agg(entry.key,
      case when lower(entry.key) ~ '(phone|telephone|birthday|birthdate|date_of_birth|password|secret|authorization|auth_token|access_token|refresh_token|customer_token|referral_token|session_token|daily_pin|pin_code|pin_hash|code_hash|raw_code)'
        then to_jsonb('[ENTFERNT]'::text)
        else public.audit_safe_metadata(entry.value) end), '{}'::jsonb)
    into result from jsonb_each(input_value) entry;
    return result;
  end if;
  if jsonb_typeof(input_value) = 'array' then
    select coalesce(jsonb_agg(public.audit_safe_metadata(item.value)), '[]'::jsonb)
    into result from jsonb_array_elements(input_value) item;
    return result;
  end if;
  if jsonb_typeof(input_value) = 'string' and length(input_value #>> '{}') > 500 then
    return to_jsonb(left(input_value #>> '{}', 500));
  end if;
  return input_value;
end;
$$;

create or replace function public.prepare_customer_registration(
  input_restaurant_slug text,
  input_phone text,
  input_source text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  existing_customer_id uuid;
  normalized_value text := public.normalize_customer_phone(input_phone);
begin
  if normalized_value is null then raise exception 'Bitte gib eine gültige Telefonnummer ein.'; end if;
  select * into restaurant_record from public.restaurants
  where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(restaurant_record.id::text || ':' || normalized_value, 0));
  perform public.write_audit_event(restaurant_record.id, null, 'customer', null,
    'CUSTOMER_REGISTRATION_ATTEMPT', 'started', input_source, 'customers', null, null,
    jsonb_build_object('identity_scope', 'restaurant_phone'));

  select id into existing_customer_id from public.customers
  where restaurant_id = restaurant_record.id and normalized_phone = normalized_value
  limit 1;
  if existing_customer_id is not null then
    perform public.write_audit_event(restaurant_record.id, existing_customer_id, 'customer', null,
      'CUSTOMER_DUPLICATE_ACCOUNT_BLOCKED', 'blocked', input_source, 'customers',
      existing_customer_id, null, jsonb_build_object('reason', 'restaurant_phone_exists'));
    perform public.write_audit_event(restaurant_record.id, existing_customer_id, 'customer', null,
      'CUSTOMER_LOGIN_FAILED', 'blocked', input_source, 'customers', existing_customer_id,
      null, jsonb_build_object('reason', 'known_device_required'));
    return jsonb_build_object('allowed', false, 'restaurant_id', restaurant_record.id,
      'error_code', 'CUSTOMER_ACCOUNT_EXISTS',
      'error_message', 'Für diese Telefonnummer besteht bereits ein Bonuskonto. Bitte verwende dein bestehendes Gerät oder wende dich an das Restaurant.');
  end if;
  return jsonb_build_object('allowed', true, 'restaurant_id', restaurant_record.id,
    'normalized_phone', normalized_value);
end;
$$;
revoke execute on function public.prepare_customer_registration(text, text, text) from public, anon, authenticated;

create or replace function public.register_restaurant_customer_legal(
  input_restaurant_slug text, input_first_name text, input_phone text, input_birthday date,
  input_device_id text, input_terms_accepted boolean, input_privacy_acknowledged boolean,
  input_marketing_push boolean default false, input_marketing_sms boolean default false,
  input_marketing_email boolean default false, input_birthday_processing boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result_payload jsonb; guard_payload jsonb; restaurant_record public.restaurants%rowtype;
  customer_id_value uuid; customer_token_value text;
begin
  if not input_terms_accepted or not input_privacy_acknowledged then
    raise exception 'Teilnahmebedingungen und Datenschutzerklärung müssen bestätigt werden.';
  end if;
  select * into restaurant_record from public.restaurants where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  if (select count(*) from public.legal_documents d join public.legal_document_versions v on v.id = d.current_published_version_id
      where d.restaurant_id = restaurant_record.id and d.document_type in ('participation_terms', 'privacy') and v.status = 'published') <> 2 then
    raise exception 'Rechtliche Informationen sind noch nicht verfügbar. Bitte versuche es später erneut.';
  end if;
  guard_payload := public.prepare_customer_registration(input_restaurant_slug, input_phone, 'customer_registration');
  if not coalesce((guard_payload->>'allowed')::boolean, false) then
    return jsonb_build_object('success', false, 'error_code', guard_payload->>'error_code',
      'error_message', guard_payload->>'error_message');
  end if;
  perform set_config('wuxuai.customer_identity_change', 'on', true);
  result_payload := public.register_restaurant_customer(input_restaurant_slug, input_first_name,
    guard_payload->>'normalized_phone', case when input_birthday_processing then input_birthday else null end, input_device_id);
  customer_token_value := result_payload #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, customer_token_value);
  perform public.record_customer_legal_state(restaurant_record.id, customer_id_value, 'customer_registration',
    input_terms_accepted, input_privacy_acknowledged, input_marketing_push, false,
    input_marketing_email, input_birthday_processing);
  if input_birthday_processing and input_birthday is not null then
    update public.customers set birthday_day = extract(day from input_birthday)::integer,
      birthday_month = extract(month from input_birthday)::integer, birthday_updated_at = now()
    where id = customer_id_value;
  end if;
  return result_payload || jsonb_build_object('success', true);
end;
$$;

create or replace function public.register_referral_customer_legal(
  input_restaurant_slug text, input_referral_token text, input_first_name text, input_phone text,
  input_birthday date, input_device_id text, input_terms_accepted boolean,
  input_privacy_acknowledged boolean, input_marketing_push boolean default false,
  input_marketing_sms boolean default false, input_marketing_email boolean default false,
  input_birthday_processing boolean default false
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result_payload jsonb; guard_payload jsonb; restaurant_record public.restaurants%rowtype;
  customer_id_value uuid; customer_token_value text;
begin
  if not input_terms_accepted or not input_privacy_acknowledged then
    raise exception 'Teilnahmebedingungen und Datenschutzhinweis müssen bestätigt werden.';
  end if;
  select * into restaurant_record from public.restaurants where slug = trim(input_restaurant_slug) and status = 'active';
  if restaurant_record.id is null then raise exception 'Restaurant wurde nicht gefunden.'; end if;
  if (select count(*) from public.legal_documents d join public.legal_document_versions v on v.id = d.current_published_version_id
      where d.restaurant_id = restaurant_record.id and d.document_type in ('participation_terms', 'privacy') and v.status = 'published') <> 2 then
    raise exception 'Rechtliche Informationen sind noch nicht verfügbar. Bitte versuche es später erneut.';
  end if;
  guard_payload := public.prepare_customer_registration(input_restaurant_slug, input_phone, 'referral_registration');
  if not coalesce((guard_payload->>'allowed')::boolean, false) then
    return jsonb_build_object('success', false, 'error_code', guard_payload->>'error_code',
      'error_message', guard_payload->>'error_message');
  end if;
  perform set_config('wuxuai.customer_identity_change', 'on', true);
  result_payload := public.register_referral_customer(input_restaurant_slug, input_referral_token,
    input_first_name, guard_payload->>'normalized_phone',
    case when input_birthday_processing then input_birthday else null end, input_device_id);
  customer_token_value := result_payload #>> '{customer,customer_qr_token}';
  customer_id_value := public.resolve_customer_from_public_token(restaurant_record.id, customer_token_value);
  perform public.record_customer_legal_state(restaurant_record.id, customer_id_value, 'referral_registration',
    input_terms_accepted, input_privacy_acknowledged, input_marketing_push, false,
    input_marketing_email, input_birthday_processing);
  if input_birthday_processing and input_birthday is not null then
    update public.customers set birthday_day = extract(day from input_birthday)::integer,
      birthday_month = extract(month from input_birthday)::integer, birthday_updated_at = now()
    where id = customer_id_value;
  end if;
  return result_payload || jsonb_build_object('success', true);
end;
$$;

create or replace function public.mask_customer_phone(input_phone text)
returns text language sql immutable set search_path = public as $$
  select case when input_phone is null then null
    when length(input_phone) <= 8 then left(input_phone, 3) || ' ****'
    else left(input_phone, 4) || ' **** ' || right(input_phone, 4) end;
$$;

create or replace function public.customer_display_name(input_name text)
returns text language sql immutable set search_path = public as $$
  select case when position(' ' in trim(coalesce(input_name, ''))) = 0 then trim(coalesce(input_name, ''))
    else split_part(trim(input_name), ' ', 1) || ' ' || left(split_part(trim(input_name), ' ', 2), 1) || '.' end;
$$;

create or replace function public.list_restaurant_customers_safe(input_restaurant_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_restaurant_admin(input_restaurant_id) then raise exception 'Keine Berechtigung.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', c.id, 'restaurant_id', c.restaurant_id, 'name', public.customer_display_name(c.name),
    'phone', public.mask_customer_phone(c.phone), 'email', null, 'birthday', null,
    'customer_code', c.customer_code, 'points_balance', c.points_balance,
    'stamp_balance', c.stamp_balance, 'membership_level', c.membership_level,
    'created_at', c.created_at) order by c.created_at)
    from public.customers c where c.restaurant_id = input_restaurant_id), '[]'::jsonb);
end;
$$;

create or replace function public.get_customer_identity_summary(input_restaurant_slug text, input_customer_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare restaurant_record public.restaurants%rowtype; customer_record public.customers%rowtype;
begin
  select * into restaurant_record from public.restaurants where slug = trim(input_restaurant_slug) and status = 'active';
  select c.* into customer_record from public.customer_qr_tokens t join public.customers c on c.id = t.customer_id
  where t.restaurant_id = restaurant_record.id and c.restaurant_id = restaurant_record.id
    and t.token_hash = public.hash_public_token(input_customer_token) and t.active = true
    and (t.expires_at is null or t.expires_at > now()) limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  perform public.write_audit_event(restaurant_record.id, customer_record.id, 'customer',
    customer_record.id, 'CUSTOMER_LOGIN_SUCCESS', 'success', 'customer_portal',
    'customers', customer_record.id, null, jsonb_build_object('method', 'restaurant_token'));
  perform public.write_audit_event(restaurant_record.id, customer_record.id, 'customer',
    customer_record.id, 'CUSTOMER_RESTAURANT_CONTEXT_CHANGED', 'success', 'customer_portal',
    'restaurants', restaurant_record.id, null, jsonb_build_object('source', 'current_url'));
  return jsonb_build_object('phone_masked', public.mask_customer_phone(customer_record.phone),
    'birthday_masked', case when customer_record.birthday_day is null or customer_record.birthday_month is null then null
      else lpad(customer_record.birthday_day::text, 2, '0') || '.' || lpad(customer_record.birthday_month::text, 2, '0') || '.****' end);
end;
$$;

create or replace function public.can_manage_customer_identity(input_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.restaurant_members rm where rm.restaurant_id = input_restaurant_id
    and rm.user_id = auth.uid() and rm.role in ('owner', 'admin'));
$$;

create or replace function public.get_customer_identity_support_detail(input_restaurant_id uuid, input_customer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare customer_record public.customers%rowtype;
begin
  if not public.can_manage_customer_identity(input_restaurant_id) then raise exception 'Keine Berechtigung.'; end if;
  select * into customer_record from public.customers where id = input_customer_id and restaurant_id = input_restaurant_id;
  if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;
  perform public.write_audit_event(input_restaurant_id, input_customer_id, 'restaurant_user', auth.uid(),
    'CUSTOMER_SENSITIVE_DATA_VIEWED', 'success', 'owner_portal', 'customers', input_customer_id,
    null, jsonb_build_object('purpose', 'identity_support'));
  return jsonb_build_object('customer_id', customer_record.id, 'name', customer_record.name,
    'phone', customer_record.phone, 'birthday_day', customer_record.birthday_day,
    'birthday_month', customer_record.birthday_month);
end;
$$;

create or replace function public.support_update_customer_identity(
  input_restaurant_id uuid, input_customer_id uuid, input_change_type text,
  input_new_phone text, input_birthday_day integer, input_birthday_month integer,
  input_identity_verified boolean, input_verification_method text, input_reason text
)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare customer_record public.customers%rowtype; normalized_value text; raw_token text := null;
begin
  if not public.can_manage_customer_identity(input_restaurant_id) then raise exception 'Keine Berechtigung.'; end if;
  if not input_identity_verified then raise exception 'Bitte bestätige die Identitätsprüfung.'; end if;
  if length(trim(coalesce(input_verification_method, ''))) < 3 or length(trim(coalesce(input_reason, ''))) < 3 then
    raise exception 'Prüfart und Änderungsgrund sind erforderlich.';
  end if;
  select * into customer_record from public.customers where id = input_customer_id
    and restaurant_id = input_restaurant_id for update;
  if customer_record.id is null then raise exception 'Gast wurde nicht gefunden.'; end if;
  perform set_config('wuxuai.customer_identity_change', 'on', true);
  perform public.write_audit_event(input_restaurant_id, input_customer_id, 'restaurant_user', auth.uid(),
    'CUSTOMER_IDENTITY_VERIFIED_BY_RESTAURANT', 'success', 'owner_portal', 'customers', input_customer_id,
    null, jsonb_build_object('verification_method', left(trim(input_verification_method), 80),
      'change_type', input_change_type, 'reason', left(trim(input_reason), 200)));

  if input_change_type = 'phone' then
    normalized_value := public.normalize_customer_phone(input_new_phone);
    if normalized_value is null then raise exception 'Bitte gib eine gültige Telefonnummer ein.'; end if;
    if exists(select 1 from public.customers where restaurant_id = input_restaurant_id
      and normalized_phone = normalized_value and id <> input_customer_id) then
      raise exception 'Diese Telefonnummer ist bereits mit einem anderen Kundenkonto dieses Restaurants verbunden. Eine automatische Zusammenführung ist nicht möglich.';
    end if;
    update public.customers set phone = normalized_value, normalized_phone = normalized_value where id = input_customer_id;
    update public.customer_qr_tokens set active = false, rotated_at = now()
      where restaurant_id = input_restaurant_id and customer_id = input_customer_id and active = true;
    delete from public.customer_devices where restaurant_id = input_restaurant_id and customer_id = input_customer_id;
    raw_token := encode(gen_random_bytes(32), 'hex');
    insert into public.customer_qr_tokens(restaurant_id, customer_id, token_hash, active)
      values(input_restaurant_id, input_customer_id, public.hash_public_token(raw_token), true);
    perform public.write_audit_event(input_restaurant_id, input_customer_id, 'restaurant_user', auth.uid(),
      'CUSTOMER_PHONE_CHANGED_BY_SUPPORT', 'success', 'owner_portal', 'customers', input_customer_id, null,
      jsonb_build_object('reason', left(trim(input_reason), 200)));
    perform public.write_audit_event(input_restaurant_id, input_customer_id, 'restaurant_user', auth.uid(),
      'CUSTOMER_SESSIONS_REVOKED', 'success', 'owner_portal', 'customers', input_customer_id, null, '{}'::jsonb);
    perform public.write_audit_event(input_restaurant_id, input_customer_id, 'restaurant_user', auth.uid(),
      'CUSTOMER_TOKEN_ROTATED', 'success', 'owner_portal', 'customers', input_customer_id, null, '{}'::jsonb);
  elsif input_change_type = 'birthday' then
    if public.v1_birthday_date(input_birthday_day, input_birthday_month, 2024) is null then
      raise exception 'Bitte gib einen gültigen Geburtstag ein.';
    end if;
    update public.customers set birthday_day = input_birthday_day, birthday_month = input_birthday_month,
      birthday = make_date(2000, input_birthday_month, least(input_birthday_day,
        extract(day from (make_date(2000, input_birthday_month, 1) + interval '1 month - 1 day'))::integer)),
      birthday_updated_at = now() where id = input_customer_id;
    perform public.write_audit_event(input_restaurant_id, input_customer_id, 'restaurant_user', auth.uid(),
      'CUSTOMER_BIRTHDATE_CHANGED_BY_SUPPORT', 'success', 'owner_portal', 'customers', input_customer_id, null,
      jsonb_build_object('reason', left(trim(input_reason), 200)));
  else
    raise exception 'Unbekannte Änderung.';
  end if;
  return jsonb_build_object('success', true, 'customer_id', input_customer_id,
    'new_customer_token', raw_token);
end;
$$;

create or replace function public.resolve_customer_qr_token(input_restaurant_id uuid, input_customer_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare customer_record public.customers%rowtype;
begin
  if not public.is_restaurant_admin(input_restaurant_id) then raise exception 'Keine Berechtigung.'; end if;
  select c.* into customer_record from public.customer_qr_tokens t join public.customers c on c.id = t.customer_id
  where t.restaurant_id = input_restaurant_id and c.restaurant_id = input_restaurant_id
    and t.token_hash = public.hash_public_token(input_customer_token) and t.active = true
    and (t.expires_at is null or t.expires_at > now()) limit 1;
  if customer_record.id is null then raise exception 'Kundenzugang ist nicht gültig.'; end if;
  return jsonb_build_object('id', customer_record.id, 'restaurant_id', customer_record.restaurant_id,
    'name', public.customer_display_name(customer_record.name), 'phone', public.mask_customer_phone(customer_record.phone),
    'email', null, 'birthday', null, 'customer_code', customer_record.customer_code,
    'points_balance', customer_record.points_balance, 'stamp_balance', customer_record.stamp_balance,
    'membership_level', customer_record.membership_level, 'created_at', customer_record.created_at);
end;
$$;

revoke execute on function public.update_customer_birthday(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.register_restaurant_customer(text, text, text, date) from public, anon, authenticated;
revoke execute on function public.register_restaurant_customer(text, text, text, date, text) from public, anon, authenticated;
revoke execute on function public.register_referral_customer(text, text, text, text, date) from public, anon, authenticated;
revoke execute on function public.register_referral_customer(text, text, text, text, date, text) from public, anon, authenticated;
revoke execute on function public.register_campaign_customer(text, text, text, text, date) from public, anon, authenticated;
revoke execute on function public.register_campaign_customer(text, text, text, text, date, text) from public, anon, authenticated;
revoke select, insert, update, delete on public.customers from anon, authenticated;

revoke execute on function public.list_restaurant_customers_safe(uuid) from public, anon;
grant execute on function public.list_restaurant_customers_safe(uuid) to authenticated;
revoke execute on function public.get_customer_identity_summary(text, text) from public;
grant execute on function public.get_customer_identity_summary(text, text) to anon, authenticated;
revoke execute on function public.can_manage_customer_identity(uuid) from public, anon;
grant execute on function public.can_manage_customer_identity(uuid) to authenticated;
revoke execute on function public.get_customer_identity_support_detail(uuid, uuid) from public, anon;
grant execute on function public.get_customer_identity_support_detail(uuid, uuid) to authenticated;
revoke execute on function public.support_update_customer_identity(uuid, uuid, text, text, integer, integer, boolean, text, text) from public, anon;
grant execute on function public.support_update_customer_identity(uuid, uuid, text, text, integer, integer, boolean, text, text) to authenticated;
revoke execute on function public.resolve_customer_qr_token(uuid, text) from public, anon;
grant execute on function public.resolve_customer_qr_token(uuid, text) to authenticated;
revoke execute on function public.register_restaurant_customer_legal(text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.register_restaurant_customer_legal(text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;
revoke execute on function public.register_referral_customer_legal(text, text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) from public;
grant execute on function public.register_referral_customer_legal(text, text, text, text, date, text, boolean, boolean, boolean, boolean, boolean, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
