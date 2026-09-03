-- Keep the protected identity-support detail flow within the canonical audit actor contract.

create or replace function public.get_customer_identity_support_detail(
  input_restaurant_id uuid,
  input_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_record public.customers%rowtype;
begin
  if not public.can_manage_customer_identity(input_restaurant_id) then
    raise exception 'Keine Berechtigung.';
  end if;

  select * into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id;

  if customer_record.id is null then
    raise exception 'Gast wurde nicht gefunden.';
  end if;

  perform public.write_audit_event(
    input_restaurant_id,
    input_customer_id,
    'admin',
    auth.uid(),
    'CUSTOMER_SENSITIVE_DATA_VIEWED',
    'success',
    'owner_portal',
    'customers',
    input_customer_id,
    null,
    jsonb_build_object('purpose', 'identity_support')
  );

  return jsonb_build_object(
    'customer_id', customer_record.id,
    'name', customer_record.name,
    'phone', customer_record.phone,
    'birthday_day', customer_record.birthday_day,
    'birthday_month', customer_record.birthday_month
  );
end;
$$;

revoke execute on function public.get_customer_identity_support_detail(uuid, uuid) from public, anon;
grant execute on function public.get_customer_identity_support_detail(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
