-- Forward-only repair for the live Staff Portal authorization gap discovered
-- after individual Staff authentication was activated on Staging.

create or replace function public.list_restaurant_customers_safe(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.restaurants r
    join public.restaurant_members rm
      on rm.restaurant_id = r.id
     and rm.user_id = auth.uid()
    where r.id = input_restaurant_id
      and r.status = 'active'
      and (
        rm.role in ('owner', 'admin', 'manager')
        or (
          rm.role in ('staff', 'supervisor')
          and exists (
            select 1
            from public.staff_members sm
            where sm.restaurant_id = r.id
              and sm.auth_user_id = auth.uid()
              and sm.active = true
              and sm.account_status = 'active'
              and sm.archived_at is null
          )
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'STAFF_CUSTOMER_LIST_ACCESS_DENIED';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'restaurant_id', c.restaurant_id,
      'name', public.customer_display_name(c.name),
      'phone', public.mask_customer_phone(c.phone),
      'email', null,
      'birthday', null,
      'customer_code', c.customer_code,
      'points_balance', c.points_balance,
      'stamp_balance', c.stamp_balance,
      'membership_level', c.membership_level,
      'created_at', c.created_at
    ) order by c.created_at)
    from public.customers c
    where c.restaurant_id = input_restaurant_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_restaurant_customers_safe(uuid)
from public, anon, authenticated;
grant execute on function public.list_restaurant_customers_safe(uuid)
to authenticated;

create or replace function public.apply_staff_daily_pin_loyalty_action_v1(
  input_restaurant_id uuid,
  input_customer_id uuid,
  input_daily_pin text,
  input_loyalty_mode text,
  input_points integer,
  input_stamps integer,
  input_reason text,
  input_rule_id uuid,
  input_bill_amount numeric,
  input_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  restaurant_record public.restaurants%rowtype;
  customer_record public.customers%rowtype;
  branch_id_value uuid;
  request_record public.points_collection_requests%rowtype;
  request_result jsonb;
  safe_message text;
  actor_role_value text;
  actor_type_value text;
  actor_id_value uuid;
  staff_member_id_value uuid;
  transaction_id_value uuid;
  audit_id_value uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'STAFF_ACTION_ACCESS_DENIED';
  end if;

  select rm.role
    into actor_role_value
  from public.restaurant_members rm
  where rm.restaurant_id = input_restaurant_id
    and rm.user_id = auth.uid()
    and rm.role in ('owner', 'admin', 'manager', 'staff', 'supervisor')
  limit 1;

  if actor_role_value in ('staff', 'supervisor') then
    select sm.id
      into staff_member_id_value
    from public.staff_members sm
    where sm.restaurant_id = input_restaurant_id
      and sm.auth_user_id = auth.uid()
      and sm.active = true
      and sm.account_status = 'active'
      and sm.archived_at is null
    limit 1;

    if staff_member_id_value is null then
      raise exception using errcode = '42501', message = 'STAFF_ACTION_ACCESS_DENIED';
    end if;
    actor_type_value := 'staff';
    actor_id_value := staff_member_id_value;
  elsif actor_role_value in ('owner', 'admin', 'manager') then
    actor_type_value := 'admin';
    actor_id_value := auth.uid();
  else
    raise exception using errcode = '42501', message = 'STAFF_ACTION_ACCESS_DENIED';
  end if;

  if input_idempotency_key is null then
    raise exception 'Buchungs-ID fehlt.';
  end if;

  select * into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
    and status = 'active';

  select * into customer_record
  from public.customers
  where id = input_customer_id
    and restaurant_id = input_restaurant_id;

  if restaurant_record.id is null or customer_record.id is null then
    raise exception 'Gast wurde nicht gefunden.';
  end if;

  branch_id_value := coalesce(
    customer_record.branch_id,
    restaurant_record.primary_branch_id,
    public.restaurant_primary_branch_id(input_restaurant_id)
  );

  insert into public.points_collection_requests (
    restaurant_id,
    organization_id,
    branch_id,
    customer_id,
    idempotency_key,
    source
  ) values (
    input_restaurant_id,
    restaurant_record.organization_id,
    branch_id_value,
    input_customer_id,
    input_idempotency_key,
    'staff_portal'
  ) on conflict do nothing;

  select * into request_record
  from public.points_collection_requests
  where restaurant_id = input_restaurant_id
    and branch_id = branch_id_value
    and customer_id = input_customer_id
    and idempotency_key = input_idempotency_key
  for update;

  if request_record.status = 'completed' then
    return request_record.result_payload;
  end if;

  begin
    request_result := public.apply_staff_daily_pin_loyalty_action(
      input_restaurant_id,
      input_customer_id,
      input_daily_pin,
      input_loyalty_mode,
      input_points,
      input_stamps,
      input_reason,
      input_rule_id,
      input_bill_amount
    );
  exception when others then
    safe_message := case
      when sqlerrm = 'Du hast heute bereits Punkte gesammelt.' then
        'Du hast heute bereits zweimal Punkte gesammelt. Morgen kannst du wieder Punkte sammeln.'
      when sqlerrm in (
        'Die Tages-PIN ist nicht korrekt.',
        'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.'
      ) then sqlerrm
      else 'Punkte konnten gerade nicht gebucht werden. Bitte versuche es erneut.'
    end;

    if sqlerrm in (
      'Die Tages-PIN ist nicht korrekt.',
      'Zu viele falsche Versuche. Bitte wende dich an das Restaurant.'
    ) then
      request_result := public.persist_daily_pin_rejection(
        input_restaurant_id,
        input_customer_id,
        branch_id_value,
        null,
        'staff_portal',
        actor_type_value,
        input_idempotency_key
      );
    else
      perform public.write_audit_event(
        input_restaurant_id,
        input_customer_id,
        actor_type_value,
        actor_id_value,
        'POINTS_ADD_FAILED',
        case when sqlerrm = 'Du hast heute bereits Punkte gesammelt.' then 'blocked' else 'failed' end,
        'staff_portal',
        'points_collection_requests',
        request_record.id,
        input_idempotency_key,
        jsonb_build_object(
          'reason', safe_message,
          'actor_restaurant_role', actor_role_value,
          'staff_member_id', staff_member_id_value
        ),
        'POINTS_COLLECTION_FAILED',
        safe_message
      );
      request_result := jsonb_build_object(
        'success', false,
        'error_code', 'POINTS_COLLECTION_FAILED',
        'error_message', safe_message
      );
    end if;
  end;

  update public.points_collection_requests
  set status = 'completed',
      result_payload = request_result,
      completed_at = now()
  where id = request_record.id;

  if coalesce((request_result->>'success')::boolean, true) then
    transaction_id_value := nullif(request_result->>'transaction_id', '')::uuid;
    audit_id_value := nullif(request_result->>'audit_id', '')::uuid;

    if transaction_id_value is not null then
      update public.points_transactions
      set idempotency_key = input_idempotency_key,
          staff_member_id = staff_member_id_value
      where id = transaction_id_value
        and restaurant_id = input_restaurant_id
        and customer_id = input_customer_id;

      update public.stamp_transactions
      set staff_member_id = staff_member_id_value
      where id = transaction_id_value
        and restaurant_id = input_restaurant_id
        and customer_id = input_customer_id;
    end if;

    if audit_id_value is not null then
      update public.audit_log
      set actor_type = actor_type_value,
          actor_id = actor_id_value,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
            'actor_restaurant_role', actor_role_value,
            'staff_member_id', staff_member_id_value,
            'operational_access_mode', case
              when actor_type_value = 'admin' then 'operator'
              else 'staff'
            end
          )
      where id = audit_id_value
        and restaurant_id = input_restaurant_id;
    end if;
  end if;

  return request_result;
end;
$$;

revoke all on function public.apply_staff_daily_pin_loyalty_action_v1(
  uuid, uuid, text, text, integer, integer, text, uuid, numeric, uuid
) from public, anon, authenticated;
grant execute on function public.apply_staff_daily_pin_loyalty_action_v1(
  uuid, uuid, text, text, integer, integer, text, uuid, numeric, uuid
) to authenticated;

notify pgrst, 'reload schema';
