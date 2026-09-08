-- Keep branch creation compatible with the canonical BASIC/PRO/PREMIUM plan catalog.

create or replace function public.ensure_restaurant_branch(input_restaurant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  restaurant_record public.restaurants%rowtype;
  organization_id_value uuid;
  branch_id_value uuid;
begin
  select *
  into restaurant_record
  from public.restaurants
  where id = input_restaurant_id
  for update;

  if restaurant_record.id is null then
    raise exception 'restaurant not found';
  end if;

  organization_id_value := restaurant_record.organization_id;

  if organization_id_value is null then
    insert into public.organizations (owner_id, name, status)
    values (restaurant_record.owner_id, restaurant_record.name, restaurant_record.status)
    returning id into organization_id_value;

    update public.restaurants
    set organization_id = organization_id_value
    where id = restaurant_record.id;
  end if;

  select id
  into branch_id_value
  from public.branches
  where restaurant_id = restaurant_record.id
  limit 1;

  if branch_id_value is null then
    insert into public.branches (
      organization_id,
      restaurant_id,
      name,
      slug,
      status
    )
    values (
      organization_id_value,
      restaurant_record.id,
      restaurant_record.name,
      restaurant_record.slug,
      restaurant_record.status
    )
    returning id into branch_id_value;
  end if;

  update public.restaurants
  set primary_branch_id = branch_id_value
  where id = restaurant_record.id
    and primary_branch_id is distinct from branch_id_value;

  insert into public.branch_subscriptions (
    organization_id,
    branch_id,
    status,
    plan_key
  )
  values (
    organization_id_value,
    branch_id_value,
    'trialing',
    'BASIC'
  )
  on conflict (branch_id) do nothing;

  return branch_id_value;
end;
$$;
