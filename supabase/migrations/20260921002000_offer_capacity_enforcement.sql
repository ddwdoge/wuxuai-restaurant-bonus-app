-- Phase 7C.3: transactional offer-capacity enforcement.
-- This migration is additive and deliberately leaves all existing migrations unchanged.

create or replace function public.validate_restaurant_offer_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  at_value timestamptz := statement_timestamp();
  old_consumes_capacity boolean := false;
  new_consumes_capacity boolean := false;
  capacity_snapshot jsonb;
  capacity_usage bigint;
  capacity_limit bigint;
begin
  new.title := trim(new.title);
  new.short_description := trim(new.short_description);
  new.description := nullif(trim(coalesce(new.description, '')), '');
  new.image_url := nullif(trim(coalesce(new.image_url, '')), '');
  new.button_label := coalesce(nullif(trim(new.button_label), ''), 'Angebot ansehen');
  new.updated_at := at_value;

  if tg_op = 'UPDATE' and new.restaurant_id is distinct from old.restaurant_id then
    raise exception using errcode = 'P0001', message = 'OFFER_TENANT_IMMUTABLE';
  end if;

  if new.branch_id is not null and not exists (
    select 1
    from public.branches branch
    where branch.id = new.branch_id
      and branch.restaurant_id = new.restaurant_id
  ) then
    raise exception using errcode = 'P0001', message = 'OFFER_BRANCH_INVALID';
  end if;

  if new.offer_type = 'LUNCH_MENU' and (
    coalesce(cardinality(new.weekdays), 0) = 0
    or new.time_from is null
    or new.time_to is null
  ) then
    raise exception using errcode = 'P0001', message = 'OFFER_LUNCH_WINDOW_REQUIRED';
  end if;

  new_consumes_capacity := new.status = 'PUBLISHED'
    and new.is_active = true
    and new.valid_to > at_value;

  if tg_op = 'UPDATE' then
    old_consumes_capacity := old.status = 'PUBLISHED'
      and old.is_active = true
      and old.valid_to > at_value;
  end if;

  -- Existing counted offers may still be edited while a tenant is over limit.
  -- Only a transition into the counted set needs a newly available slot.
  if new_consumes_capacity and not old_consumes_capacity then
    perform pg_advisory_xact_lock(hashtextextended(new.restaurant_id::text, 0));

    capacity_snapshot := public.resolve_restaurant_capacity_internal(
      new.restaurant_id,
      at_value
    );
    capacity_usage := (capacity_snapshot #>> '{offers,usage}')::bigint;
    capacity_limit := (capacity_snapshot #>> '{offers,effective_limit}')::bigint;

    if capacity_limit is null or capacity_usage is null then
      raise exception using
        errcode = 'P0001',
        message = 'OFFER_CAPACITY_UNAVAILABLE';
    end if;

    if capacity_usage >= capacity_limit then
      raise exception using
        errcode = 'P0001',
        message = 'OFFER_CAPACITY_REACHED',
        detail = jsonb_build_object(
          'usage', capacity_usage,
          'effective_limit', capacity_limit,
          'remaining', greatest(capacity_limit - capacity_usage, 0),
          'plan_key', capacity_snapshot #>> '{plan,plan_key}',
          'addon_units', (capacity_snapshot #>> '{offers,addon_units}')::bigint,
          'over_limit', capacity_usage > capacity_limit
        )::text;
    end if;
  end if;

  return new;
end;
$function$;

revoke execute on function public.validate_restaurant_offer_row()
from public, anon, authenticated, service_role;

comment on function public.validate_restaurant_offer_row() is
  'Phase 7C.3 canonical offer write guard. It serializes slot-consuming transitions per tenant and uses only resolve_restaurant_capacity_internal as limit authority.';

create or replace function public.get_restaurant_capacity(input_restaurant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  capacity_snapshot jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;
  if not public.is_restaurant_admin(input_restaurant_id)
     and not public.is_platform_admin() then
    raise exception 'CAPACITY_READ_FORBIDDEN' using errcode = '42501';
  end if;

  capacity_snapshot := public.resolve_restaurant_capacity_internal(
    input_restaurant_id,
    statement_timestamp()
  );
  return jsonb_set(
    capacity_snapshot,
    '{write_enforcement_active}',
    'true'::jsonb,
    true
  );
end;
$function$;

revoke execute on function public.get_restaurant_capacity(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_restaurant_capacity(uuid) to authenticated;

comment on function public.get_restaurant_capacity(uuid) is
  'Authorized read-only capacity snapshot. Phase 7C.3 reports that offer write enforcement is active.';

notify pgrst, 'reload schema';
