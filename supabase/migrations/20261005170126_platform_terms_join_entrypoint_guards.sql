-- Targeted entrypoint gates only. Migration 194/195 remain byte-identical.
-- The pre-existing AT bundle trigger from 194 is not expanded or replaced.
begin;

create function public.require_platform_terms_for_join_internal(input_restaurant_id uuid)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public,auth,pg_temp as $function$
declare terms_status jsonb; document jsonb;
begin
  if auth.uid() is null or input_restaurant_id is null then
    raise exception 'PLATFORM_TERMS_ACCEPTANCE_REQUIRED' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'platform-terms-test-publication:'||input_restaurant_id::text,0));
  terms_status:=public.get_platform_customer_terms_status();
  if terms_status->>'status' is distinct from 'ACCEPTED' then
    raise exception 'PLATFORM_TERMS_ACCEPTANCE_REQUIRED' using errcode='42501';
  end if;
  document:=terms_status->'document';
  if coalesce((document->>'test_only')::boolean,false) is not true
    or (document->>'restaurant_id')::uuid is distinct from input_restaurant_id
    or not exists(select 1 from public.platform_terms_test_identities binding
      where binding.auth_user_id=auth.uid()
        and binding.restaurant_id=input_restaurant_id
        and binding.test_session_id=document->>'test_session_id') then
    raise exception 'PLATFORM_TERMS_TEST_TENANT_DENIED' using errcode='42501';
  end if;
end;
$function$;
revoke all on function public.require_platform_terms_for_join_internal(uuid)
  from public,anon,authenticated,service_role;

-- Every publicly used exact-bundle join/registration checks platform terms
-- before the underlying customer, membership, gift, or audit writer runs.
create or replace function public.join_customer_account_restaurant_at_legal(
  input_restaurant_slug text,input_terms_accepted boolean,input_privacy_acknowledged boolean,
  input_device_id text,input_existing_customer_token text,input_bundle_id text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid; joined jsonb; token_value text; receipt jsonb;
begin
  if input_terms_accepted is distinct from true or input_privacy_acknowledged is distinct from true then
    raise exception 'CUSTOMER_LEGAL_ACCEPTANCE_REQUIRED' using errcode='22023';
  end if;
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  perform public.require_platform_terms_for_join_internal(restaurant_id_value);
  perform public.require_current_at_legal_bundle_internal(restaurant_id_value,input_bundle_id);
  perform set_config('wuxuai.at_legal_bundle_id',input_bundle_id,true);
  joined:=public.join_customer_account_restaurant(input_restaurant_slug,true,true,
    input_device_id,input_existing_customer_token);
  token_value:=coalesce(joined->>'customer_token',nullif(trim(input_existing_customer_token),''));
  if token_value is null then
    raise exception 'CUSTOMER_LEGAL_TOKEN_INVALID' using errcode='42501';
  end if;
  perform public.accept_current_legal_documents(input_restaurant_slug,token_value,'customer_join');
  receipt:=public.record_customer_at_legal_consent_internal(restaurant_id_value,
    token_value,input_bundle_id,input_request_id,'customer_join');
  return joined||jsonb_build_object('legal_receipt',receipt);
end;
$function$;

create or replace function public.join_authenticated_customer_referral_at_legal(
  input_restaurant_slug text,input_referral_token text,input_terms_accepted boolean,
  input_privacy_acknowledged boolean,input_device_id text,input_bundle_id text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid; joined jsonb; token_value text; receipt jsonb;
begin
  if input_terms_accepted is distinct from true or input_privacy_acknowledged is distinct from true then
    raise exception 'CUSTOMER_LEGAL_ACCEPTANCE_REQUIRED' using errcode='22023';
  end if;
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  perform public.require_platform_terms_for_join_internal(restaurant_id_value);
  perform public.require_current_at_legal_bundle_internal(restaurant_id_value,input_bundle_id);
  perform set_config('wuxuai.at_legal_bundle_id',input_bundle_id,true);
  joined:=public.join_authenticated_customer_referral(input_restaurant_slug,input_referral_token,
    true,true,input_device_id);
  token_value:=joined->>'customer_token';
  if token_value is null then
    raise exception 'CUSTOMER_LEGAL_TOKEN_INVALID' using errcode='42501';
  end if;
  perform public.accept_current_legal_documents(input_restaurant_slug,token_value,'referral_join');
  receipt:=public.record_customer_at_legal_consent_internal(restaurant_id_value,
    token_value,input_bundle_id,input_request_id,'referral_join');
  return joined||jsonb_build_object('legal_receipt',receipt);
end;
$function$;

create or replace function public.register_restaurant_customer_at_legal(
  input_restaurant_slug text,input_first_name text,input_phone text,input_birthday date,
  input_device_id text,input_terms_accepted boolean,input_privacy_acknowledged boolean,
  input_marketing_push boolean,input_marketing_sms boolean,input_marketing_email boolean,
  input_birthday_processing boolean,input_bundle_id text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid; result_payload jsonb; token_value text; receipt jsonb;
begin
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  perform public.require_platform_terms_for_join_internal(restaurant_id_value);
  perform public.require_current_at_legal_bundle_internal(restaurant_id_value,input_bundle_id);
  perform set_config('wuxuai.at_legal_bundle_id',input_bundle_id,true);
  result_payload:=public.register_restaurant_customer_legal(input_restaurant_slug,
    input_first_name,input_phone,input_birthday,input_device_id,input_terms_accepted,
    input_privacy_acknowledged,input_marketing_push,input_marketing_sms,input_marketing_email,
    input_birthday_processing);
  if coalesce((result_payload->>'success')::boolean,false) is not true then return result_payload; end if;
  token_value:=result_payload#>>'{customer,customer_qr_token}';
  receipt:=public.record_customer_at_legal_consent_internal(restaurant_id_value,
    token_value,input_bundle_id,input_request_id,'customer_registration');
  return result_payload||jsonb_build_object('legal_receipt',receipt);
end;
$function$;


-- Existing accounts retain their read path. Only the new-account INSERT arm
-- of each explicit account bootstrap requires current acceptance.
create or replace function public.ensure_authenticated_customer_account()
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, auth, pg_temp as $function$
declare
  user_record auth.users%rowtype;
  account_id_value uuid;
  first_name_value text;
  phone_value text;
  birthday_value date;
begin
  if auth.uid() is null then raise exception 'CUSTOMER_AUTH_REQUIRED' using errcode='42501'; end if;
  select * into user_record from auth.users where id=auth.uid();
  if user_record.id is null or user_record.email_confirmed_at is null then
    raise exception 'CUSTOMER_EMAIL_CONFIRMATION_REQUIRED' using errcode='42501';
  end if;
  select id into account_id_value from public.customer_accounts
    where auth_user_id=user_record.id and disabled_at is null;
  if account_id_value is not null then return account_id_value; end if;
  perform public.require_current_platform_customer_terms_internal();
  first_name_value:=trim(coalesce(user_record.raw_user_meta_data->>'customer_first_name',''));
  phone_value:=public.normalize_customer_phone(user_record.raw_user_meta_data->>'customer_phone');
  begin
    birthday_value:=nullif(user_record.raw_user_meta_data->>'customer_birthday','')::date;
  exception when others then birthday_value:=null;
  end;
  if first_name_value='' or char_length(first_name_value)>80 then
    raise exception 'CUSTOMER_PROFILE_INCOMPLETE' using errcode='P0001';
  end if;
  if phone_value is null then raise exception 'CUSTOMER_PROFILE_PHONE_INVALID' using errcode='P0001'; end if;
  insert into public.customer_accounts
    (auth_user_id,email,first_name,phone,normalized_phone,birthday,email_confirmed_at)
  values (user_record.id,lower(user_record.email),first_name_value,phone_value,phone_value,
    birthday_value,user_record.email_confirmed_at)
  returning id into account_id_value;
  insert into public.customer_account_emails(account_id,email,status,confirmed_at,updated_at)
  values(account_id_value,lower(user_record.email),'CONFIRMED',user_record.email_confirmed_at,now())
  on conflict(account_id) do update set email=excluded.email,status='CONFIRMED',
    confirmed_at=excluded.confirmed_at,updated_at=now();
  return account_id_value;
exception when unique_violation then
  raise exception 'CUSTOMER_ACCOUNT_ALREADY_EXISTS' using errcode='P0001';
end;
$function$;

create or replace function public.activate_authenticated_customer_account(
  input_first_name text,
  input_phone text,
  input_birthday date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  user_record auth.users%rowtype;
  account_record public.customer_accounts%rowtype;
  first_name_value text := btrim(coalesce(input_first_name, ''));
  phone_value text := public.normalize_customer_phone(input_phone);
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'CUSTOMER_AUTH_REQUIRED';
  end if;

  select * into user_record from auth.users where id = auth.uid();
  if not found or user_record.email_confirmed_at is null then
    raise exception using errcode = '42501', message = 'CUSTOMER_EMAIL_CONFIRMATION_REQUIRED';
  end if;
  if first_name_value = '' or char_length(first_name_value) > 80 then
    raise exception using errcode = '22023', message = 'CUSTOMER_PROFILE_INCOMPLETE';
  end if;
  if phone_value is null then
    raise exception using errcode = '22023', message = 'CUSTOMER_PROFILE_PHONE_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('customer-account:' || auth.uid()::text, 0));

  select * into account_record
  from public.customer_accounts
  where auth_user_id = auth.uid() and disabled_at is null
  for update;

  if found then
    update public.customer_accounts
    set email = lower(user_record.email),
        email_confirmed_at = user_record.email_confirmed_at,
        first_name = coalesce(nullif(first_name, ''), first_name_value),
        phone = coalesce(phone, phone_value),
        normalized_phone = coalesce(normalized_phone, phone_value),
        birthday = coalesce(birthday, input_birthday),
        last_seen_at = now()
    where id = account_record.id
    returning * into account_record;
  else
    perform public.require_current_platform_customer_terms_internal();
    insert into public.customer_accounts (
      auth_user_id, email, email_confirmed_at, first_name, phone,
      normalized_phone, birthday
    ) values (
      auth.uid(), lower(user_record.email), user_record.email_confirmed_at,
      first_name_value, phone_value, phone_value, input_birthday
    ) returning * into account_record;
  end if;

  insert into public.customer_account_emails (
    account_id, email, status, confirmed_at, updated_at
  ) values (
    account_record.id, lower(user_record.email), 'CONFIRMED',
    user_record.email_confirmed_at, now()
  ) on conflict (account_id) do update
    set email = excluded.email,
        status = 'CONFIRMED',
        confirmed_at = excluded.confirmed_at,
        updated_at = now();

  return account_record.id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'CUSTOMER_ACCOUNT_ALREADY_EXISTS';
end;
$$;

create or replace function public.register_referral_customer_at_legal(
  input_restaurant_slug text,input_referral_token text,input_first_name text,input_phone text,
  input_birthday date,input_device_id text,input_terms_accepted boolean,
  input_privacy_acknowledged boolean,input_marketing_push boolean,input_marketing_sms boolean,
  input_marketing_email boolean,input_birthday_processing boolean,
  input_bundle_id text,input_request_id uuid
) returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare restaurant_id_value uuid; result_payload jsonb; token_value text; receipt jsonb;
begin
  select id into restaurant_id_value from public.restaurants
    where slug=trim(input_restaurant_slug) and status='active';
  perform public.require_platform_terms_for_join_internal(restaurant_id_value);
  perform public.require_current_at_legal_bundle_internal(restaurant_id_value,input_bundle_id);
  perform set_config('wuxuai.at_legal_bundle_id',input_bundle_id,true);
  result_payload:=public.register_referral_customer_legal(input_restaurant_slug,
    input_referral_token,input_first_name,input_phone,input_birthday,input_device_id,
    input_terms_accepted,input_privacy_acknowledged,input_marketing_push,input_marketing_sms,
    input_marketing_email,input_birthday_processing);
  if coalesce((result_payload->>'success')::boolean,false) is not true then return result_payload; end if;
  token_value:=result_payload#>>'{customer,customer_qr_token}';
  receipt:=public.record_customer_at_legal_consent_internal(restaurant_id_value,
    token_value,input_bundle_id,input_request_id,'referral_registration');
  return result_payload||jsonb_build_object('legal_receipt',receipt);
end;
$function$;
-- Historical browser-callable writers would bypass the new platform receipt.
-- The exact-bundle wrappers above still call them as their privileged owner.
revoke execute on function
  public.join_customer_account_restaurant(text,boolean,boolean,text,text),
  public.join_authenticated_customer_referral(text,text,boolean,boolean,text),
  public.register_restaurant_customer_legal(text,text,text,date,text,boolean,boolean,boolean,boolean,boolean,boolean),
  public.register_referral_customer_legal(text,text,text,text,date,text,boolean,boolean,boolean,boolean,boolean,boolean),
  public.register_restaurant_customer(text,text,text,date),
  public.register_restaurant_customer(text,text,text,date,text),
  public.register_referral_customer(text,text,text,text,date,text)
  from public,anon,authenticated;
revoke execute on function
  public.register_restaurant_customer_at_legal(text,text,text,date,text,boolean,boolean,boolean,boolean,boolean,boolean,text,uuid),
  public.register_referral_customer_at_legal(text,text,text,text,date,text,boolean,boolean,boolean,boolean,boolean,boolean,text,uuid)
  from public,anon;
grant execute on function
  public.register_restaurant_customer_at_legal(text,text,text,date,text,boolean,boolean,boolean,boolean,boolean,boolean,text,uuid),
  public.register_referral_customer_at_legal(text,text,text,text,date,text,boolean,boolean,boolean,boolean,boolean,boolean,text,uuid)
  to authenticated;

commit;
