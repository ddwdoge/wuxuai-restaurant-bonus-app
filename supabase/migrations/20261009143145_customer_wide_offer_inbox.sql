begin;

-- Central Auth identity, not client-provided customer or restaurant IDs.
-- Keep the existing TEST_ONLY/legal visibility and effective PRO gates.
create function public.customer_offer_inbox_memberships_internal()
returns table(restaurant_id uuid, customer_id uuid, branch_id uuid, name text, slug text)
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare account_id_value uuid := public.read_authenticated_customer_account_id();
begin
  perform public.customer_verified_session_id();
  return query
  select r.id, c.id, b.id, r.name, r.slug
  from public.customer_account_memberships m
  join public.customers c on c.id=m.customer_id and c.restaurant_id=m.restaurant_id
    and c.membership_status='active'
  join public.restaurants r on r.id=m.restaurant_id and r.status='active'
  join public.branches b on b.id=r.primary_branch_id and b.restaurant_id=r.id and b.status='active'
    and b.organization_id=r.organization_id and c.organization_id=r.organization_id and c.branch_id=b.id
  where m.account_id=account_id_value
    and (c.auth_user_id is null or c.auth_user_id=auth.uid())
    and public.pro_in_app_test_scope_allowed_internal(r.id,c.id)
    and public.restaurant_entitlement_enabled(r.id,'offer_notifications');
end;
$function$;
revoke all on function public.customer_offer_inbox_memberships_internal()
  from public, anon, authenticated, service_role;

create function public.get_customer_offer_inbox(
  input_limit integer default 20,
  input_before_created_at timestamptz default null,
  input_before_id uuid default null
)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare result jsonb; page_size integer := least(greatest(coalesce(input_limit,20),1),50);
begin
  if (input_before_created_at is null) <> (input_before_id is null) then
    raise exception 'INBOX_CURSOR_INVALID' using errcode='22023';
  end if;
  with memberships as materialized (
    select * from public.customer_offer_inbox_memberships_internal()
  ), visible as materialized (
    select n.id,n.created_at,n.read_at,o.id as offer_id,o.title,
      m.restaurant_id,m.name as restaurant_name,m.slug as restaurant_slug
    from memberships m
    join public.customer_pro_in_app_notifications n
      on n.restaurant_id=m.restaurant_id and n.customer_id=m.customer_id
      and n.event_type='OFFER_PUBLISHED'
    join public.restaurant_offers o on o.id=n.offer_id and o.restaurant_id=m.restaurant_id
      and o.branch_id=m.branch_id and o.status='PUBLISHED' and o.is_active
      and o.valid_to>statement_timestamp()
  ), page as materialized (
    select * from visible
    where input_before_created_at is null or (created_at,id)<(input_before_created_at,input_before_id)
    order by created_at desc,id desc limit page_size+1
  ), shown as materialized (
    select * from page order by created_at desc,id desc limit page_size
  )
  select jsonb_build_object(
    'available',exists(select 1 from memberships),
    'unread_count',(select count(*) from visible where read_at is null),
    'items',coalesce((select jsonb_agg(to_jsonb(shown) order by created_at desc,id desc) from shown),'[]'::jsonb),
    'next_cursor',case when (select count(*) from page)>page_size then
      (select jsonb_build_object('created_at',created_at,'id',id) from shown order by created_at,id limit 1)
      else null end
  ) into result;
  return result;
end;
$function$;
revoke all on function public.get_customer_offer_inbox(integer,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_customer_offer_inbox(integer,timestamptz,uuid) to authenticated;

-- Opening is an atomic read + single-event acknowledgement. No batch mark,
-- no analytics, no QR issuance, no points/reward/consent/queue writes.
create function public.open_customer_offer_inbox_entry(input_notification_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare notification public.customer_pro_in_app_notifications%rowtype;
  offer_record public.restaurant_offers%rowtype; membership record; read_time timestamptz;
begin
  -- Authorize before locking an entry: foreign IDs cannot lock another tenant.
  select n.* into notification
  from public.customer_pro_in_app_notifications n
  join public.customer_offer_inbox_memberships_internal() m
    on m.restaurant_id=n.restaurant_id and m.customer_id=n.customer_id
  where n.id=input_notification_id and n.event_type='OFFER_PUBLISHED'
  for update of n;
  if notification.id is null then
    raise exception 'INBOX_OFFER_UNAVAILABLE' using errcode='42501';
  end if;
  -- A request waiting for a parallel opener rechecks current access afterwards.
  select * into membership from public.customer_offer_inbox_memberships_internal() m
    where m.restaurant_id=notification.restaurant_id and m.customer_id=notification.customer_id;
  if membership.restaurant_id is null then
    raise exception 'INBOX_OFFER_UNAVAILABLE' using errcode='42501';
  end if;
  select * into offer_record from public.restaurant_offers o
    where o.id=notification.offer_id and o.restaurant_id=membership.restaurant_id
      and o.branch_id=membership.branch_id and o.status='PUBLISHED' and o.is_active
      and o.valid_to>statement_timestamp()
    for share;
  if offer_record.id is null or offer_record.valid_to<=clock_timestamp() then
    raise exception 'INBOX_OFFER_UNAVAILABLE' using errcode='42501';
  end if;
  update public.customer_pro_in_app_notifications
    set read_at=coalesce(read_at,statement_timestamp())
    where id=notification.id returning read_at into read_time;
  return jsonb_build_object('id',notification.id,'read_at',read_time,'offer',jsonb_build_object(
    'id',offer_record.id,'restaurant_id',membership.restaurant_id,'branch_id',membership.branch_id,
    'restaurant_name',membership.name,'restaurant_slug',membership.slug,
    'offer_type',offer_record.offer_type,'title',offer_record.title,
    'short_description',offer_record.short_description,'description',offer_record.description,
    'image_url',offer_record.image_url,'image_zoom',offer_record.image_zoom,
    'image_position_x',offer_record.image_position_x,'image_position_y',offer_record.image_position_y,
    'image_aspect_ratio',offer_record.image_aspect_ratio,'image_crop_version',offer_record.image_crop_version,
    'current_price',offer_record.current_price,'previous_price',offer_record.previous_price,
    'currency',offer_record.currency,'valid_from',offer_record.valid_from,'valid_to',offer_record.valid_to,
    'weekdays',offer_record.weekdays,'time_from',offer_record.time_from,'time_to',offer_record.time_to,
    'button_label',offer_record.button_label,'published_at',offer_record.published_at,
    'status',offer_record.status,'is_active',offer_record.is_active
  ));
end;
$function$;
revoke all on function public.open_customer_offer_inbox_entry(uuid) from public,anon,authenticated,service_role;
grant execute on function public.open_customer_offer_inbox_entry(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
