-- Local, uncommitted V1 optional text and image/PDF representations of one menu.
-- No ordering, payments, mail, commercial add-on or real launch activation.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('restaurant-menu-private','restaurant-menu-private',false,10485760,
  array['image/jpeg','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;
-- Deliberately no anon/authenticated Storage policy. Only the server-side
-- media gateway may use its service credential after a fresh DB authorization.

create table public.restaurant_menu_catalogs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  draft_pages jsonb not null default '[]'::jsonb check(jsonb_typeof(draft_pages)='array'),
  draft_text text not null default '' check(length(draft_text)<=20000),
  draft_revision integer not null default 0 check(draft_revision>=0),
  published_pages jsonb not null default '[]'::jsonb check(jsonb_typeof(published_pages)='array'),
  published_text text,
  text_version integer not null default 0 check(text_version>=0),
  text_hash text check(text_hash is null or text_hash ~ '^[0-9a-f]{64}$'),
  text_published_at timestamptz,
  published_version integer not null default 0 check(published_version>=0),
  published_hash text check(published_hash is null or published_hash ~ '^[0-9a-f]{64}$'),
  published_at timestamptz,
  unpublished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(restaurant_id,branch_id),
  check(published_at is null or (published_version>0 and jsonb_array_length(published_pages)>0 and published_hash is not null))
  ,check(text_published_at is null or (text_version>0 and nullif(trim(published_text),'') is not null and text_hash is not null))
);
create index restaurant_menu_published_idx on public.restaurant_menu_catalogs(restaurant_id,branch_id)
  where published_at is not null;
alter table public.restaurant_menu_catalogs enable row level security;
revoke all on public.restaurant_menu_catalogs from public,anon,authenticated,service_role;

-- Only synthetic, separately marked STAGING grants. A future commercial
-- entitlement needs its own reviewed contract and cannot reuse these events.
create table public.restaurant_menu_test_addon_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  action text not null check(action in ('GRANT','REVOKE')),
  grant_id uuid references public.restaurant_menu_test_addon_events(id) on delete restrict,
  starts_at timestamptz,
  expires_at timestamptz,
  actor_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null unique,
  payload_hash text not null check(payload_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check(length(trim(reason)) between 10 and 500),
  created_at timestamptz not null default clock_timestamp(),
  check((action='GRANT' and grant_id is null and starts_at is not null and expires_at>starts_at)
    or (action='REVOKE' and grant_id is not null and starts_at is null and expires_at is null))
);
create index restaurant_menu_test_addon_target_idx on public.restaurant_menu_test_addon_events
  (restaurant_id,branch_id,created_at desc,id);
alter table public.restaurant_menu_test_addon_events enable row level security;
revoke all on public.restaurant_menu_test_addon_events from public,anon,authenticated,service_role;

create function public.menu_test_addon_events_immutable() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin raise exception 'MENU_ADDON_AUDIT_IMMUTABLE' using errcode='42501'; end $$;
revoke all on function public.menu_test_addon_events_immutable() from public,anon,authenticated,service_role;
create trigger menu_test_addon_events_immutable before update or delete on public.restaurant_menu_test_addon_events
for each row execute function public.menu_test_addon_events_immutable();
create trigger menu_test_addon_events_no_truncate before truncate on public.restaurant_menu_test_addon_events
for each statement execute function public.menu_test_addon_events_immutable();

create function public.restaurant_menu_access_internal(input_restaurant_id uuid,input_branch_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
select exists(
  select 1 from public.restaurants r
  join public.branches b on b.id=input_branch_id and b.restaurant_id=r.id and b.organization_id=r.organization_id
  where r.id=input_restaurant_id and r.primary_branch_id=b.id and r.status='active' and b.status='active'
    and coalesce((public.restaurant_activation_state_internal(r.id)->>'operational')::boolean,false)
    and (
      public.resolve_restaurant_entitlements_internal(r.id)->>'effective_plan'='PRO'
      or (
        (select environment from public.business_verification_environment where singleton)='STAGING'
        and exists(select 1 from public.platform_test_tenant_registry marker
          where marker.restaurant_id=r.id and marker.organization_id=r.organization_id
            and marker.owner_user_id=r.owner_id and marker.restaurant_name=r.name and marker.deleted_at is null)
        and exists(select 1 from public.restaurant_menu_test_addon_events grant_event
          where grant_event.restaurant_id=r.id and grant_event.organization_id=r.organization_id
            and grant_event.branch_id=b.id and grant_event.action='GRANT'
            and grant_event.starts_at<=statement_timestamp() and grant_event.expires_at>statement_timestamp()
            and not exists(select 1 from public.restaurant_menu_test_addon_events revoke_event
              where revoke_event.action='REVOKE' and revoke_event.grant_id=grant_event.id))
      )
    )
);
$$;
revoke all on function public.restaurant_menu_access_internal(uuid,uuid) from public,anon,authenticated,service_role;

-- The TEST_ONLY addon is an audited staging permit, not a commercial entitlement.
create function public.get_platform_test_menu_addon(input_restaurant_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.restaurants%rowtype; current_grant public.restaurant_menu_test_addon_events%rowtype;
begin
 if auth.uid() is null or coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false) is not true then
   raise exception 'MENU_ADDON_ADMIN_DENIED' using errcode='42501'; end if;
 select * into r from public.restaurants where id=input_restaurant_id;
 if r.id is null or not exists(select 1 from public.business_verification_environment e
     where e.singleton and e.environment='STAGING')
   or not exists(select 1 from public.platform_test_tenant_registry t
     where t.restaurant_id=r.id and t.organization_id=r.organization_id
       and t.owner_user_id=r.owner_id and t.restaurant_name=r.name and t.deleted_at is null)
   or r.primary_branch_id is null then
   raise exception 'MENU_ADDON_TEST_SCOPE_DENIED' using errcode='42501'; end if;
 select * into current_grant from public.restaurant_menu_test_addon_events g
 where g.restaurant_id=r.id and g.organization_id=r.organization_id and g.branch_id=r.primary_branch_id
   and g.action='GRANT' and g.starts_at<=statement_timestamp() and g.expires_at>statement_timestamp()
   and not exists(select 1 from public.restaurant_menu_test_addon_events x
     where x.action='REVOKE' and x.grant_id=g.id)
 order by g.created_at desc,g.id desc limit 1;
 return jsonb_build_object('restaurant_id',r.id,'branch_id',r.primary_branch_id,
   'grant_id',current_grant.id,'expires_at',current_grant.expires_at,
   'active',current_grant.id is not null);
end $$;
revoke all on function public.get_platform_test_menu_addon(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_platform_test_menu_addon(uuid) to authenticated;

create function public.set_platform_test_menu_addon(
 input_restaurant_id uuid,input_branch_id uuid,input_action text,input_expected_grant_id uuid,
 input_expires_at timestamptz,input_reason text,input_request_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.restaurants%rowtype; prior public.restaurant_menu_test_addon_events%rowtype;
 current_grant public.restaurant_menu_test_addon_events%rowtype; event_id uuid;
 payload_hash_value text; action_value text:=upper(trim(coalesce(input_action,'')));
begin
 if auth.uid() is null or coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false) is not true then
   raise exception 'MENU_ADDON_ADMIN_DENIED' using errcode='42501'; end if;
 perform public.require_recent_platform_auth_internal();
 if input_restaurant_id is null or input_branch_id is null or input_request_id is null
   or action_value not in ('GRANT','REVOKE') or length(trim(coalesce(input_reason,''))) not between 10 and 500
   or (action_value='GRANT' and (input_expires_at<=statement_timestamp()
       or input_expires_at>statement_timestamp()+interval '24 hours'))
   or (action_value='REVOKE' and input_expires_at is not null) then
   raise exception 'MENU_ADDON_REQUEST_INVALID' using errcode='22023'; end if;
 payload_hash_value:=encode(extensions.digest(convert_to(jsonb_build_object(
   'actor',auth.uid(),'restaurant',input_restaurant_id,'branch',input_branch_id,
   'action',action_value,'expected_grant',input_expected_grant_id,
   'expires_at',input_expires_at,'reason',trim(input_reason))::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('menu-addon-request:'||input_request_id::text,0));
 select * into prior from public.restaurant_menu_test_addon_events where request_id=input_request_id;
 if prior.id is not null then
   if prior.actor_id is distinct from auth.uid() or prior.payload_hash is distinct from payload_hash_value then
     raise exception 'MENU_ADDON_REPLAY_CONFLICT' using errcode='22023'; end if;
   return jsonb_build_object('event_id',prior.id,'action',prior.action,
     'grant_id',case when prior.action='GRANT' then prior.id else prior.grant_id end,
     'idempotent',true); end if;
 select * into r from public.restaurants where id=input_restaurant_id for update;
 if r.id is null or r.primary_branch_id is distinct from input_branch_id
   or not exists(select 1 from public.branches b where b.id=input_branch_id
     and b.restaurant_id=r.id and b.organization_id=r.organization_id and b.status='active')
   or not exists(select 1 from public.business_verification_environment e
     where e.singleton and e.environment='STAGING')
   or not exists(select 1 from public.platform_test_tenant_registry t
     where t.restaurant_id=r.id and t.organization_id=r.organization_id
       and t.owner_user_id=r.owner_id and t.restaurant_name=r.name and t.deleted_at is null)
   or upper(r.name) not like '%WUXUAI%'
   or (upper(r.name) not like '%TEST%' and upper(r.name) not like '%SMOKE%') then
   raise exception 'MENU_ADDON_TEST_SCOPE_DENIED' using errcode='42501'; end if;
 select * into current_grant from public.restaurant_menu_test_addon_events g
 where g.restaurant_id=r.id and g.organization_id=r.organization_id and g.branch_id=input_branch_id
   and g.action='GRANT' and g.starts_at<=statement_timestamp() and g.expires_at>statement_timestamp()
   and not exists(select 1 from public.restaurant_menu_test_addon_events x
     where x.action='REVOKE' and x.grant_id=g.id)
 order by g.created_at desc,g.id desc limit 1;
 if current_grant.id is distinct from input_expected_grant_id
   or (action_value='GRANT' and current_grant.id is not null)
   or (action_value='REVOKE' and current_grant.id is null) then
   raise exception 'MENU_ADDON_STALE_EXPECTATION' using errcode='40001'; end if;
 insert into public.restaurant_menu_test_addon_events
 (restaurant_id,organization_id,branch_id,action,grant_id,starts_at,expires_at,
  actor_id,request_id,payload_hash,reason)
 values(r.id,r.organization_id,input_branch_id,action_value,
   case when action_value='REVOKE' then current_grant.id else null end,
   case when action_value='GRANT' then statement_timestamp() else null end,
   input_expires_at,auth.uid(),input_request_id,payload_hash_value,trim(input_reason))
 returning id into event_id;
 perform public.write_audit_event(r.id,null,'admin',auth.uid(),
   'MENU_TEST_ADDON_'||action_value,'success','platform_admin',
   'restaurant_menu_test_addon_events',event_id,null,
   jsonb_build_object('actor_scope','platform_admin','branch_id',input_branch_id,'request_id',input_request_id,
     'expires_at',input_expires_at));
 return jsonb_build_object('event_id',event_id,'action',action_value,
   'grant_id',case when action_value='GRANT' then event_id else current_grant.id end,
   'idempotent',false);
end $$;
revoke all on function public.set_platform_test_menu_addon(uuid,uuid,text,uuid,timestamptz,text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.set_platform_test_menu_addon(uuid,uuid,text,uuid,timestamptz,text,uuid) to authenticated;

create function public.menu_safe_pages_internal(input_pages jsonb) returns jsonb
language sql immutable security definer set search_path=pg_catalog,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',page.value->>'id','filename',page.value->>'filename',
    'mime_type',page.value->>'mime_type','byte_size',(page.value->>'byte_size')::bigint,
    'sha256',page.value->>'sha256') order by page.ordinality),'[]'::jsonb)
  from jsonb_array_elements(coalesce(input_pages,'[]'::jsonb)) with ordinality as page(value,ordinality);
$$;
revoke all on function public.menu_safe_pages_internal(jsonb) from public,anon,authenticated,service_role;

create function public.get_owner_menu_catalog(input_restaurant_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.restaurants%rowtype; c public.restaurant_menu_catalogs%rowtype;
begin
 if auth.uid() is null or public.is_restaurant_admin(input_restaurant_id) is distinct from true then
   raise exception 'MENU_OWNER_FORBIDDEN' using errcode='42501'; end if;
 select * into r from public.restaurants where id=input_restaurant_id;
 if r.id is null or r.primary_branch_id is null then raise exception 'MENU_RESTAURANT_UNAVAILABLE' using errcode='P0002'; end if;
 select * into c from public.restaurant_menu_catalogs where restaurant_id=r.id
   and organization_id=r.organization_id and branch_id=r.primary_branch_id;
 return jsonb_build_object('restaurant_id',r.id,'branch_id',r.primary_branch_id,
   'entitled',public.restaurant_menu_access_internal(r.id,r.primary_branch_id),
   'draft_pages',public.menu_safe_pages_internal(c.draft_pages),'draft_text',coalesce(c.draft_text,''),
   'draft_revision',coalesce(c.draft_revision,0),
   'published',c.published_at is not null,
   'text_published',c.text_published_at is not null,
   'text_version',coalesce(c.text_version,0),'text_hash',c.text_hash,
   'text_published_at',c.text_published_at,
   'published_at',c.published_at,
   'published_pages',public.menu_safe_pages_internal(c.published_pages),
   'published_version',coalesce(c.published_version,0),'published_hash',c.published_hash);
end $$;
revoke all on function public.get_owner_menu_catalog(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_owner_menu_catalog(uuid) to authenticated;

create function public.menu_customer_token_valid_internal(input_restaurant_id uuid,input_branch_id uuid,input_token text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,pg_temp as $$
 select coalesce(nullif(trim(input_token),'') is not null and exists(
   select 1 from public.customer_qr_tokens t join public.customers customer
     on customer.id=t.customer_id and customer.restaurant_id=t.restaurant_id
     and customer.organization_id=t.organization_id and customer.branch_id=t.branch_id
   where t.restaurant_id=input_restaurant_id and t.branch_id=input_branch_id
     and t.token_hash=public.hash_public_token(input_token) and t.active
     and (t.expires_at is null or t.expires_at>statement_timestamp())
     and customer.membership_status='active'),false);
$$;
revoke all on function public.menu_customer_token_valid_internal(uuid,uuid,text) from public,anon,authenticated,service_role;

create function public.get_customer_menu_catalog(input_restaurant_slug text,input_customer_token text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.restaurants%rowtype; c public.restaurant_menu_catalogs%rowtype;
begin
 if nullif(trim(coalesce(input_restaurant_slug,'')),'') is null
   or nullif(trim(coalesce(input_customer_token,'')),'') is null then
   return jsonb_build_object('available',false); end if;
 select * into r from public.restaurants where slug=trim(input_restaurant_slug) and status='active';
 if r.id is null or r.primary_branch_id is null
   or public.restaurant_menu_access_internal(r.id,r.primary_branch_id) is not true
   or public.menu_customer_token_valid_internal(r.id,r.primary_branch_id,input_customer_token) is not true then
   return jsonb_build_object('available',false); end if;
 select * into c from public.restaurant_menu_catalogs where restaurant_id=r.id
   and organization_id=r.organization_id and branch_id=r.primary_branch_id
   and (published_at is not null or text_published_at is not null);
 if c.id is null then return jsonb_build_object('available',false); end if;
 return jsonb_build_object('available',true,'restaurant_id',r.id,'branch_id',r.primary_branch_id,
   'catalog_id',c.id,
   'version',case when c.published_at is not null then c.published_version else null end,
   'hash',case when c.published_at is not null then c.published_hash else null end,
   'published_at',c.published_at,
   'text',case when c.text_published_at is not null then c.published_text else null end,
   'text_version',case when c.text_published_at is not null then c.text_version else null end,
   'text_hash',case when c.text_published_at is not null then c.text_hash else null end,
   'text_published_at',c.text_published_at,
   'pages',case when c.published_at is not null then public.menu_safe_pages_internal(c.published_pages) else '[]'::jsonb end);
end $$;
revoke all on function public.get_customer_menu_catalog(text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_customer_menu_catalog(text,text) to anon,authenticated;

create function public.manage_owner_menu_catalog(
  input_restaurant_id uuid,input_branch_id uuid,input_action text,
  input_page_ids uuid[] default null,input_expected_draft_revision integer default null,
  input_expected_published_version integer default null,
  input_text text default null,
  input_expected_text_version integer default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare r public.restaurants%rowtype; c public.restaurant_menu_catalogs%rowtype;
  next_pages jsonb; action_value text:=upper(trim(coalesce(input_action,'')));
  page_count integer; hash_value text;
begin
 if auth.uid() is null or public.is_restaurant_admin(input_restaurant_id) is distinct from true then
   raise exception 'MENU_OWNER_FORBIDDEN' using errcode='42501'; end if;
 select * into r from public.restaurants where id=input_restaurant_id;
 if r.id is null or r.primary_branch_id is distinct from input_branch_id
   or not exists(select 1 from public.branches b where b.id=input_branch_id
      and b.restaurant_id=r.id and b.organization_id=r.organization_id) then
   raise exception 'MENU_BRANCH_MISMATCH' using errcode='42501'; end if;
 insert into public.restaurant_menu_catalogs(restaurant_id,organization_id,branch_id)
 values(r.id,r.organization_id,input_branch_id) on conflict(restaurant_id,branch_id) do nothing;
 select * into c from public.restaurant_menu_catalogs where restaurant_id=r.id
   and organization_id=r.organization_id and branch_id=input_branch_id for update;
 if input_expected_draft_revision is distinct from c.draft_revision
   or input_expected_published_version is distinct from c.published_version
   or (input_expected_text_version is not null and input_expected_text_version is distinct from c.text_version)
   or (action_value in ('SAVE_TEXT','PUBLISH_TEXT','UNPUBLISH_TEXT') and input_expected_text_version is null) then
   raise exception 'MENU_VERSION_STALE' using errcode='40001'; end if;
 if action_value='SAVE_ORDER' then
   if input_page_ids is null or cardinality(input_page_ids)>50
      or cardinality(input_page_ids)<>jsonb_array_length(c.draft_pages) then
     raise exception 'MENU_ORDER_INVALID' using errcode='22023'; end if;
   select count(distinct id) into page_count from unnest(input_page_ids) id;
   if page_count<>cardinality(input_page_ids) then
     raise exception 'MENU_ORDER_DUPLICATE' using errcode='22023'; end if;
   select coalesce(jsonb_agg(page.value order by wanted.ordinality),'[]'::jsonb),count(*)
     into next_pages,page_count
   from unnest(input_page_ids) with ordinality wanted(id,ordinality)
   join lateral jsonb_array_elements(c.draft_pages) page
     on page.value->>'id'=wanted.id::text;
   if page_count<>cardinality(input_page_ids) then
     raise exception 'MENU_PAGE_FOREIGN' using errcode='42501'; end if;
   update public.restaurant_menu_catalogs set draft_pages=next_pages,
     draft_revision=c.draft_revision+1,updated_at=now() where id=c.id;
 elsif action_value='SAVE_TEXT' then
   if input_text is null or length(input_text)>20000 then
     raise exception 'MENU_TEXT_INVALID' using errcode='22023'; end if;
   update public.restaurant_menu_catalogs set draft_text=input_text,
     draft_revision=c.draft_revision+1,updated_at=now() where id=c.id;
 elsif action_value='PUBLISH_TEXT' then
   if public.restaurant_menu_access_internal(r.id,input_branch_id) is not true then
     raise exception 'MENU_ENTITLEMENT_INACTIVE' using errcode='42501'; end if;
   if nullif(trim(c.draft_text),'') is null then
     raise exception 'MENU_DRAFT_EMPTY' using errcode='22023'; end if;
   hash_value:=encode(extensions.digest(convert_to(c.draft_text,'UTF8'),'sha256'),'hex');
   update public.restaurant_menu_catalogs set published_text=c.draft_text,
     text_version=c.text_version+1,text_hash=hash_value,
     text_published_at=now(),updated_at=now() where id=c.id;
   perform public.write_audit_event(r.id,null,'admin',auth.uid(),'MENU_TEXT_PUBLISHED',
     'success','restaurant_portal','restaurant_menu_catalogs',c.id,null,
     jsonb_build_object('branch_id',input_branch_id,'version',c.text_version+1,'hash',hash_value));
 elsif action_value='UNPUBLISH_TEXT' then
   if c.text_published_at is not null then
     update public.restaurant_menu_catalogs set text_published_at=null,updated_at=now() where id=c.id;
     perform public.write_audit_event(r.id,null,'admin',auth.uid(),'MENU_TEXT_UNPUBLISHED',
       'success','restaurant_portal','restaurant_menu_catalogs',c.id,null,
       jsonb_build_object('branch_id',input_branch_id,'version',c.text_version,'hash',c.text_hash));
   end if;
 elsif action_value='PUBLISH' then
   if public.restaurant_menu_access_internal(r.id,input_branch_id) is not true then
     raise exception 'MENU_ENTITLEMENT_INACTIVE' using errcode='42501'; end if;
   if jsonb_array_length(c.draft_pages)=0 then
     raise exception 'MENU_DRAFT_EMPTY' using errcode='22023'; end if;
   hash_value:=encode(extensions.digest(convert_to(c.draft_pages::text,'UTF8'),'sha256'),'hex');
   update public.restaurant_menu_catalogs set published_pages=c.draft_pages,
     published_version=c.published_version+1,published_hash=hash_value,
     published_at=now(),unpublished_at=null,updated_at=now() where id=c.id;
   perform public.write_audit_event(r.id,null,'admin',auth.uid(),'MENU_CATALOG_PUBLISHED',
     'success','restaurant_portal','restaurant_menu_catalogs',c.id,null,
     jsonb_build_object('branch_id',input_branch_id,'version',c.published_version+1,'hash',hash_value));
 elsif action_value='UNPUBLISH' then
   if c.published_at is not null then
     update public.restaurant_menu_catalogs set published_at=null,unpublished_at=now(),updated_at=now()
       where id=c.id;
     perform public.write_audit_event(r.id,null,'admin',auth.uid(),'MENU_CATALOG_UNPUBLISHED',
       'success','restaurant_portal','restaurant_menu_catalogs',c.id,null,
       jsonb_build_object('branch_id',input_branch_id,'version',c.published_version,'hash',c.published_hash));
   end if;
 else raise exception 'MENU_ACTION_INVALID' using errcode='22023'; end if;
 return public.get_owner_menu_catalog(r.id);
end $$;
revoke all on function public.manage_owner_menu_catalog(uuid,uuid,text,uuid[],integer,integer,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.manage_owner_menu_catalog(uuid,uuid,text,uuid[],integer,integer,text,integer) to authenticated;

-- The Edge gateway validates actual bytes before uploading. Only its private
-- service credential can register an object; browser roles cannot forge MIME,
-- content hash or a foreign object path.
create function public.register_owner_menu_upload(
  input_actor_id uuid,input_restaurant_id uuid,input_branch_id uuid,input_page_id uuid,
  input_storage_path text,input_mime_type text,input_byte_size bigint,
  input_content_sha256 text,input_filename text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,storage,pg_temp as $$
declare r public.restaurants%rowtype; c public.restaurant_menu_catalogs%rowtype;
  page_value jsonb; used_bytes bigint;
begin
 select * into r from public.restaurants where id=input_restaurant_id for share;
 if r.id is null or r.primary_branch_id is distinct from input_branch_id
   or not exists(select 1 from public.restaurant_members m where m.restaurant_id=r.id
      and m.organization_id=r.organization_id and m.branch_id=input_branch_id
      and m.user_id=input_actor_id and m.role in ('owner','admin','manager')) then
   raise exception 'MENU_UPLOAD_FORBIDDEN' using errcode='42501'; end if;
 -- Draft preparation is intentionally allowed without an active add-on. Only
 -- PUBLISH and every new customer read require current entitlement.
 if input_mime_type not in ('image/jpeg','application/pdf')
   or input_byte_size not between 1 and 10485760
   or input_content_sha256 !~ '^[0-9a-f]{64}$'
   or nullif(trim(input_filename),'') is null or length(input_filename)>160
   or input_storage_path is distinct from
      (r.id::text || '/' || input_branch_id::text || '/' || input_page_id::text ||
       case when input_mime_type='image/jpeg' then '.jpg' else '.pdf' end)
   or not exists(select 1 from storage.objects o where o.bucket_id='restaurant-menu-private'
     and o.name=input_storage_path) then
   raise exception 'MENU_UPLOAD_INVALID' using errcode='22023'; end if;
 insert into public.restaurant_menu_catalogs(restaurant_id,organization_id,branch_id)
 values(r.id,r.organization_id,input_branch_id) on conflict(restaurant_id,branch_id) do nothing;
 select * into c from public.restaurant_menu_catalogs where restaurant_id=r.id
   and organization_id=r.organization_id and branch_id=input_branch_id for update;
 select coalesce(sum((o.metadata->>'size')::bigint),0) into used_bytes
 from storage.objects o where o.bucket_id='restaurant-menu-private'
   and o.name like r.id::text || '/' || input_branch_id::text || '/%'
   and coalesce(o.metadata->>'size','') ~ '^[0-9]+$';
 if used_bytes>52428800 then raise exception 'MENU_STORAGE_LIMIT' using errcode='54000'; end if;
 if jsonb_array_length(c.draft_pages)>=50 then raise exception 'MENU_PAGE_LIMIT' using errcode='54000'; end if;
 page_value:=jsonb_build_object('id',input_page_id,'storage_path',input_storage_path,
   'mime_type',input_mime_type,'byte_size',input_byte_size,'sha256',input_content_sha256,
   'filename',input_filename);
 update public.restaurant_menu_catalogs set draft_pages=c.draft_pages || jsonb_build_array(page_value),
   draft_revision=c.draft_revision+1,updated_at=now() where id=c.id;
 perform public.write_audit_event(r.id,null,'admin',input_actor_id,'MENU_PAGE_UPLOADED',
   'success','catalog_media_gateway','restaurant_menu_catalogs',c.id,null,
   jsonb_build_object('branch_id',input_branch_id,'page_id',input_page_id,'hash',input_content_sha256));
 return jsonb_build_object('page_id',input_page_id,'draft_revision',c.draft_revision+1);
end $$;
revoke all on function public.register_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.register_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,text) to service_role;

create function public.resolve_owner_menu_object_path(
  input_actor_id uuid,input_restaurant_id uuid,input_page_id uuid
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare c public.restaurant_menu_catalogs%rowtype; page_value jsonb;
begin
 select * into c from public.restaurant_menu_catalogs where restaurant_id=input_restaurant_id;
 if c.id is null or not exists(select 1 from public.restaurant_members m
   where m.restaurant_id=c.restaurant_id and m.organization_id=c.organization_id
     and m.branch_id=c.branch_id and m.user_id=input_actor_id and m.role in ('owner','admin','manager')) then
   return jsonb_build_object('available',false); end if;
 select value into page_value from jsonb_array_elements(c.draft_pages || c.published_pages)
   where value->>'id'=input_page_id::text limit 1;
 if page_value is null then return jsonb_build_object('available',false); end if;
 return jsonb_build_object('available',true,'path',page_value->>'storage_path',
   'mime_type',page_value->>'mime_type','sha256',page_value->>'sha256');
end $$;
revoke all on function public.resolve_owner_menu_object_path(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.resolve_owner_menu_object_path(uuid,uuid,uuid) to service_role;

create function public.resolve_customer_menu_object_path(
  input_restaurant_slug text,input_customer_token text,input_page_id uuid,input_version integer
) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
declare response_value jsonb; c public.restaurant_menu_catalogs%rowtype; page_value jsonb;
begin
 response_value:=public.get_customer_menu_catalog(input_restaurant_slug,input_customer_token);
 if response_value->>'available' is distinct from 'true'
   or (response_value->>'version')::integer is distinct from input_version then
   return jsonb_build_object('available',false); end if;
 select * into c from public.restaurant_menu_catalogs where id=(response_value->>'catalog_id')::uuid
   and published_at is not null and published_version=input_version;
 select value into page_value from jsonb_array_elements(c.published_pages)
   where value->>'id'=input_page_id::text limit 1;
 if page_value is null then return jsonb_build_object('available',false); end if;
 return jsonb_build_object('available',true,'path',page_value->>'storage_path',
   'mime_type',page_value->>'mime_type','sha256',page_value->>'sha256');
end $$;
revoke all on function public.resolve_customer_menu_object_path(text,text,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.resolve_customer_menu_object_path(text,text,uuid,integer) to service_role;

commit;
notify pgrst, 'reload schema';
