-- Additive catalog page capacity. Migration 205 is immutable.
-- TEST_ONLY extra units are technical permits, never a paid entitlement.
begin;

alter table public.restaurant_menu_catalogs
  add constraint restaurant_menu_draft_text_bytes check (octet_length(draft_text) <= 100000),
  add constraint restaurant_menu_published_text_bytes check
    (published_text is null or octet_length(published_text) <= 100000);

alter table public.restaurant_menu_test_addon_events
  add column extra_page_units integer not null default 0
    check (extra_page_units between 0 and 1000),
  add constraint restaurant_menu_revoke_has_no_units
    check (action <> 'REVOKE' or extra_page_units = 0);

create function public.menu_page_count_internal(input_pages jsonb)
returns integer language plpgsql immutable security definer
set search_path=pg_catalog,pg_temp as $$
declare item jsonb; count_value integer; total integer:=0;
begin
 if jsonb_typeof(input_pages) <> 'array' then return null; end if;
 for item in select value from jsonb_array_elements(input_pages) loop
   if coalesce(item->>'page_count','') !~ '^[0-9]{1,2}$' then return null; end if;
   count_value:=(item->>'page_count')::integer;
   if count_value not between 1 and 50
     or (item->>'mime_type'='image/jpeg' and count_value<>1)
     or item->>'mime_type' not in ('image/jpeg','application/pdf') then return null; end if;
   total:=total+count_value;
 end loop;
 return total;
end $$;
revoke all on function public.menu_page_count_internal(jsonb)
  from public,anon,authenticated,service_role;

-- Pure tariff arithmetic; this function does not assert any entitlement.
create function public.menu_page_capacity_for_plan_internal(input_plan text,input_units integer)
returns integer language sql immutable set search_path=pg_catalog,pg_temp as $$
 select case when input_units not between 0 and 1000 then null
   when input_plan='PRO' then 15+input_units*10
   when input_plan='BASIC' then 10+input_units*10
   else 0 end;
$$;
revoke all on function public.menu_page_capacity_for_plan_internal(text,integer)
  from public,anon,authenticated,service_role;

create function public.menu_page_limit_internal(input_restaurant_id uuid,input_branch_id uuid)
returns integer language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
declare plan_value text; units_value integer:=0;
begin
 if public.restaurant_menu_access_internal(input_restaurant_id,input_branch_id) is not true then
   return 0; end if;
 plan_value:=public.resolve_restaurant_entitlements_internal(input_restaurant_id)->>'effective_plan';
 if plan_value not in ('PRO','BASIC') then return 0; end if;
 if exists(select 1 from public.business_verification_environment
      where singleton and environment='STAGING')
   and exists(select 1 from public.platform_test_tenant_registry marker
      join public.restaurants r on r.id=marker.restaurant_id
      where r.id=input_restaurant_id and r.primary_branch_id=input_branch_id
        and marker.organization_id=r.organization_id
        and marker.owner_user_id=r.owner_id and marker.restaurant_name=r.name
        and marker.deleted_at is null) then
   select coalesce(g.extra_page_units,0) into units_value
   from public.restaurant_menu_test_addon_events g
   where g.restaurant_id=input_restaurant_id and g.branch_id=input_branch_id
     and g.action='GRANT' and g.starts_at<=statement_timestamp()
     and g.expires_at>statement_timestamp()
     and not exists(select 1 from public.restaurant_menu_test_addon_events x
       where x.action='REVOKE' and x.grant_id=g.id)
   order by g.created_at desc,g.id desc limit 1;
 end if;
 return public.menu_page_capacity_for_plan_internal(plan_value,coalesce(units_value,0));
end $$;
revoke all on function public.menu_page_limit_internal(uuid,uuid)
  from public,anon,authenticated,service_role;

-- Catalog row is locked by manage_owner_menu_catalog. The restaurant lock
-- serializes capacity publication with grants; NOWAIT avoids reversing the
-- Restaurant->Catalog order used by the upload/cleanup transactions.
create function public.menu_capacity_publish_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare page_count_value integer; limit_value integer;
begin
 if new.published_at is null then return new; end if;
 if tg_op='UPDATE' then
   if new.published_pages is not distinct from old.published_pages
     and new.published_version is not distinct from old.published_version
     and old.published_at is not null then return new; end if;
 end if;
 perform 1 from public.restaurants r where r.id=new.restaurant_id
   and r.organization_id=new.organization_id and r.primary_branch_id=new.branch_id
   for update nowait;
 if not found then raise exception 'MENU_BRANCH_MISMATCH' using errcode='42501'; end if;
 limit_value:=public.menu_page_limit_internal(new.restaurant_id,new.branch_id);
 page_count_value:=public.menu_page_count_internal(new.published_pages);
 if limit_value=0 then raise exception 'MENU_ENTITLEMENT_INACTIVE' using errcode='42501'; end if;
 if page_count_value is null or page_count_value=0 then
   raise exception 'MENU_PAGE_COUNT_UNVERIFIED' using errcode='22023'; end if;
 if page_count_value>limit_value then
   raise exception 'MENU_PAGE_CAPACITY_EXCEEDED' using errcode='54000'; end if;
 return new;
end $$;
revoke all on function public.menu_capacity_publish_guard()
  from public,anon,authenticated,service_role;
create trigger menu_capacity_publish_guard
  before insert or update on public.restaurant_menu_catalogs
  for each row execute function public.menu_capacity_publish_guard();

-- Existing 205 readers remain as private delegates. The public signatures
-- stay byte-compatible; only the current capacity-filtered wrappers are exposed.
alter function public.get_owner_menu_catalog(uuid) rename to get_owner_menu_catalog_v205;
revoke all on function public.get_owner_menu_catalog_v205(uuid)
  from public,anon,authenticated,service_role;
create function public.get_owner_menu_catalog(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
declare result_value jsonb; c public.restaurant_menu_catalogs%rowtype;
  draft_count integer; published_count integer; limit_value integer;
begin
 result_value:=public.get_owner_menu_catalog_v205(input_restaurant_id);
 select * into c from public.restaurant_menu_catalogs
  where restaurant_id=input_restaurant_id and branch_id=(result_value->>'branch_id')::uuid;
 draft_count:=public.menu_page_count_internal(coalesce(c.draft_pages,'[]'::jsonb));
 published_count:=public.menu_page_count_internal(coalesce(c.published_pages,'[]'::jsonb));
 limit_value:=public.menu_page_limit_internal(input_restaurant_id,(result_value->>'branch_id')::uuid);
 return result_value||jsonb_build_object('draft_page_count',draft_count,
   'published_page_count',published_count,'page_limit',limit_value,
   'media_within_limit',c.published_at is not null and published_count is not null
     and published_count<=limit_value and limit_value>0);
end $$;
revoke all on function public.get_owner_menu_catalog(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_owner_menu_catalog(uuid) to authenticated;

create or replace function public.menu_safe_pages_internal(input_pages jsonb)
returns jsonb language sql immutable security definer
set search_path=pg_catalog,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',page.value->>'id','filename',page.value->>'filename',
   'mime_type',page.value->>'mime_type',
   'byte_size',(page.value->>'byte_size')::bigint,
   'sha256',page.value->>'sha256',
   'page_count',(page.value->>'page_count')::integer)
   order by page.ordinality),'[]'::jsonb)
 from jsonb_array_elements(coalesce(input_pages,'[]'::jsonb))
   with ordinality as page(value,ordinality);
$$;
revoke all on function public.menu_safe_pages_internal(jsonb)
  from public,anon,authenticated,service_role;

alter function public.get_customer_menu_catalog(text,text)
  rename to get_customer_menu_catalog_v205;
revoke all on function public.get_customer_menu_catalog_v205(text,text)
  from public,anon,authenticated,service_role;
create function public.get_customer_menu_catalog(input_restaurant_slug text,input_customer_token text)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
declare result_value jsonb; c public.restaurant_menu_catalogs%rowtype;
  count_value integer; limit_value integer;
begin
 result_value:=public.get_customer_menu_catalog_v205(input_restaurant_slug,input_customer_token);
 if result_value->>'available' is distinct from 'true' then return result_value; end if;
 if result_value->>'version' is null then return result_value; end if;
 select * into c from public.restaurant_menu_catalogs
   where id=(result_value->>'catalog_id')::uuid
     and restaurant_id=(result_value->>'restaurant_id')::uuid
     and branch_id=(result_value->>'branch_id')::uuid;
 count_value:=public.menu_page_count_internal(c.published_pages);
 limit_value:=public.menu_page_limit_internal(c.restaurant_id,c.branch_id);
 if count_value is not null and count_value>0 and count_value<=limit_value then
   return result_value||jsonb_build_object('page_count',count_value,'page_limit',limit_value); end if;
 if result_value->>'text' is null then return jsonb_build_object('available',false); end if;
 return result_value||jsonb_build_object('version',null,'hash',null,'published_at',null,
   'pages','[]'::jsonb,'page_count',null,'page_limit',limit_value);
end $$;
revoke all on function public.get_customer_menu_catalog(text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.get_customer_menu_catalog(text,text) to anon,authenticated;

-- The claim is an irreversible tombstone for a single private object path.
-- A late registration cannot resurrect a file selected for Storage cleanup.
create table public.restaurant_menu_storage_cleanup_claims (
  storage_path text primary key,
  object_id uuid not null,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  claimed_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  check(storage_path like restaurant_id::text || '/' || branch_id::text || '/%')
);
create index restaurant_menu_cleanup_target_idx
  on public.restaurant_menu_storage_cleanup_claims(restaurant_id,branch_id,claimed_at);
alter table public.restaurant_menu_storage_cleanup_claims enable row level security;
revoke all on public.restaurant_menu_storage_cleanup_claims from public,anon,authenticated,service_role;

-- Technical draft budget, independent of the commercial publication limit.
-- A reservation with an uploaded object continues to consume capacity after
-- expiry until registration or the existing orphan-cleanup protocol removes it.
create table public.restaurant_menu_upload_reservations (
  storage_path text primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  page_id uuid not null,
  mime_type text not null check(mime_type in ('image/jpeg','application/pdf')),
  byte_size bigint not null check(byte_size between 1 and 10485760),
  page_count integer not null check(page_count between 1 and 50),
  content_sha256 text not null check(content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  registered_at timestamptz,
  released_at timestamptz,
  check(storage_path like restaurant_id::text || '/' || branch_id::text || '/%'),
  check(registered_at is null or released_at is null)
);
create index restaurant_menu_upload_reservation_target_idx
  on public.restaurant_menu_upload_reservations(restaurant_id,branch_id,expires_at);
alter table public.restaurant_menu_upload_reservations enable row level security;
revoke all on public.restaurant_menu_upload_reservations from public,anon,authenticated,service_role;

create function public.reserve_owner_menu_upload(
  input_actor_id uuid,input_restaurant_id uuid,input_branch_id uuid,input_page_id uuid,
  input_storage_path text,input_mime_type text,input_byte_size bigint,
  input_content_sha256 text,input_page_count integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,storage,pg_temp as $$
declare r public.restaurants%rowtype; existing public.restaurant_menu_upload_reservations%rowtype;
  object_count integer; pending_count integer; used_bytes bigint; pending_bytes bigint;
  draft_pages integer; pending_pages integer;
begin
 select * into r from public.restaurants where id=input_restaurant_id for update;
 if r.id is null or r.primary_branch_id is distinct from input_branch_id
   or not exists(select 1 from public.restaurant_members m where m.restaurant_id=r.id
      and m.organization_id=r.organization_id and m.branch_id=input_branch_id
      and m.user_id=input_actor_id and m.role in ('owner','admin','manager')) then
   raise exception 'MENU_RESERVATION_OWNER_DENIED' using errcode='42501'; end if;
 if input_mime_type not in ('image/jpeg','application/pdf')
   or input_byte_size not between 1 and 10485760
   or input_page_count not between 1 and 50
   or (input_mime_type='image/jpeg' and input_page_count<>1)
   or input_content_sha256 !~ '^[0-9a-f]{64}$'
   or input_storage_path is distinct from
      (r.id::text||'/'||input_branch_id::text||'/'||input_page_id::text||
       case when input_mime_type='image/jpeg' then '.jpg' else '.pdf' end)
   or exists(select 1 from public.restaurant_menu_storage_cleanup_claims c
      where c.storage_path=input_storage_path)
   or exists(select 1 from storage.objects o where o.bucket_id='restaurant-menu-private'
      and o.name=input_storage_path) then
   raise exception 'MENU_RESERVATION_INVALID' using errcode='22023'; end if;
 select * into existing from public.restaurant_menu_upload_reservations
   where storage_path=input_storage_path for update;
 if existing.storage_path is not null then
   if existing.actor_id=input_actor_id and existing.restaurant_id=r.id
      and existing.branch_id=input_branch_id and existing.page_id=input_page_id
      and existing.mime_type=input_mime_type and existing.byte_size=input_byte_size
      and existing.page_count=input_page_count and existing.content_sha256=input_content_sha256
      and existing.expires_at>clock_timestamp() and existing.registered_at is null
      and existing.released_at is null then
     return jsonb_build_object('reserved',true,'expires_at',existing.expires_at,'replay',true); end if;
   raise exception 'MENU_RESERVATION_PATH_USED' using errcode='23505'; end if;
 -- One MVCC snapshot: an in-flight upload is charged either as a stored
 -- object or as its unresolved reservation, even after its registration TTL.
 -- Only an explicit release or reconciled cleanup frees the quota.
 with object_usage as (
   select count(*) as files,coalesce(sum(case
     when coalesce(o.metadata->>'size','') ~ '^[0-9]+$'
       then (o.metadata->>'size')::bigint else 10485760 end),0) as bytes
   from storage.objects o where o.bucket_id='restaurant-menu-private'
     and o.name like r.id::text||'/'||input_branch_id::text||'/%'
 ), pending_usage as (
   select count(*) as files,coalesce(sum(q.byte_size),0) as bytes,
     coalesce(sum(q.page_count),0) as pages
   from public.restaurant_menu_upload_reservations q
   where q.restaurant_id=r.id and q.branch_id=input_branch_id
     and q.registered_at is null and q.released_at is null
     and not exists(select 1 from storage.objects o
       where o.bucket_id='restaurant-menu-private' and o.name=q.storage_path)
 )
 select o.files,o.bytes,p.files,p.bytes,p.pages
   into object_count,used_bytes,pending_count,pending_bytes,pending_pages
   from object_usage o cross join pending_usage p;
 select coalesce(sum((p.value->>'page_count')::integer),0) into draft_pages
   from public.restaurant_menu_catalogs c,
   lateral jsonb_array_elements(c.draft_pages) p
   where c.restaurant_id=r.id and c.branch_id=input_branch_id;
 -- 50 files, 50 MiB and the derived 50*50 technical draft-page ceiling.
 -- Tariff capacity is checked independently when a version is published.
 if object_count+pending_count+1>50 or used_bytes+pending_bytes+input_byte_size>52428800
   or draft_pages+pending_pages+input_page_count>2500 then
   raise exception 'MENU_UPLOAD_QUOTA' using errcode='54000'; end if;
 insert into public.restaurant_menu_upload_reservations
   (storage_path,restaurant_id,organization_id,branch_id,actor_id,page_id,
    mime_type,byte_size,page_count,content_sha256,expires_at)
 values(input_storage_path,r.id,r.organization_id,input_branch_id,input_actor_id,
   input_page_id,input_mime_type,input_byte_size,input_page_count,input_content_sha256,
   clock_timestamp()+interval '15 minutes');
 return jsonb_build_object('reserved',true,'replay',false);
end $$;
revoke all on function public.reserve_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.reserve_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,integer)
  to service_role;

create function public.release_owner_menu_upload_reservation(
  input_actor_id uuid,input_restaurant_id uuid,input_branch_id uuid,input_storage_path text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,storage,pg_temp as $$
declare q public.restaurant_menu_upload_reservations%rowtype;
begin
 select * into q from public.restaurant_menu_upload_reservations
   where storage_path=input_storage_path for update;
 if q.storage_path is null or q.actor_id is distinct from input_actor_id
   or q.restaurant_id is distinct from input_restaurant_id
   or q.branch_id is distinct from input_branch_id then
   raise exception 'MENU_RESERVATION_RELEASE_DENIED' using errcode='42501'; end if;
 if q.registered_at is not null then
   raise exception 'MENU_RESERVATION_ALREADY_REGISTERED' using errcode='42501'; end if;
 if exists(select 1 from storage.objects o where o.bucket_id='restaurant-menu-private'
   and o.name=input_storage_path) then
   raise exception 'MENU_RESERVATION_OBJECT_PRESENT' using errcode='40001'; end if;
 update public.restaurant_menu_upload_reservations set released_at=clock_timestamp()
   where storage_path=input_storage_path and released_at is null;
 return jsonb_build_object('released',true);
end $$;
revoke all on function public.release_owner_menu_upload_reservation(uuid,uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function public.release_owner_menu_upload_reservation(uuid,uuid,uuid,text)
  to service_role;

-- The 205 upload signature cannot assert PDF page count and is disabled.
revoke all on function public.register_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,text)
  from public,anon,authenticated,service_role;
create function public.register_owner_menu_upload(
  input_actor_id uuid,input_restaurant_id uuid,input_branch_id uuid,input_page_id uuid,
  input_storage_path text,input_mime_type text,input_byte_size bigint,
  input_content_sha256 text,input_filename text,input_page_count integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,storage,pg_temp as $$
declare r public.restaurants%rowtype; c public.restaurant_menu_catalogs%rowtype;
  reservation public.restaurant_menu_upload_reservations%rowtype;
  page_value jsonb; used_bytes bigint;
begin
 select * into r from public.restaurants where id=input_restaurant_id for update;
 if r.id is null or r.primary_branch_id is distinct from input_branch_id
   or not exists(select 1 from public.restaurant_members m where m.restaurant_id=r.id
      and m.organization_id=r.organization_id and m.branch_id=input_branch_id
      and m.user_id=input_actor_id and m.role in ('owner','admin','manager')) then
   raise exception 'MENU_UPLOAD_FORBIDDEN' using errcode='42501'; end if;
 if input_mime_type not in ('image/jpeg','application/pdf')
   or input_byte_size not between 1 and 10485760
   or input_page_count not between 1 and 50
   or (input_mime_type='image/jpeg' and input_page_count<>1)
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
 if jsonb_array_length(c.draft_pages)>=50 then raise exception 'MENU_FILE_LIMIT' using errcode='54000'; end if;
 if exists(select 1 from public.restaurant_menu_storage_cleanup_claims claim
   where claim.storage_path=input_storage_path) then
   raise exception 'MENU_UPLOAD_PATH_CLAIMED' using errcode='42501'; end if;
 select * into reservation from public.restaurant_menu_upload_reservations
   where storage_path=input_storage_path for update;
 if reservation.storage_path is null or reservation.restaurant_id is distinct from r.id
   or reservation.organization_id is distinct from r.organization_id
   or reservation.branch_id is distinct from input_branch_id
   or reservation.actor_id is distinct from input_actor_id
   or reservation.page_id is distinct from input_page_id
   or reservation.mime_type is distinct from input_mime_type
   or reservation.byte_size is distinct from input_byte_size
   or reservation.page_count is distinct from input_page_count
   or reservation.content_sha256 is distinct from input_content_sha256
   or reservation.expires_at<=clock_timestamp() or reservation.released_at is not null
   or reservation.registered_at is not null then
   raise exception 'MENU_UPLOAD_RESERVATION_INVALID' using errcode='42501'; end if;
 page_value:=jsonb_build_object('id',input_page_id,'storage_path',input_storage_path,
   'mime_type',input_mime_type,'byte_size',input_byte_size,'sha256',input_content_sha256,
   'filename',input_filename,'page_count',input_page_count);
 update public.restaurant_menu_catalogs set draft_pages=c.draft_pages || jsonb_build_array(page_value),
   draft_revision=c.draft_revision+1,updated_at=now() where id=c.id;
 update public.restaurant_menu_upload_reservations set registered_at=clock_timestamp()
   where storage_path=input_storage_path;
 perform public.write_audit_event(r.id,null,'admin',input_actor_id,'MENU_PAGE_UPLOADED',
   'success','catalog_media_gateway','restaurant_menu_catalogs',c.id,null,
   jsonb_build_object('branch_id',input_branch_id,'page_id',input_page_id,
     'hash',input_content_sha256,'page_count',input_page_count));
 return jsonb_build_object('page_id',input_page_id,'draft_revision',c.draft_revision+1);
end $$;
revoke all on function public.register_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,text,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.register_owner_menu_upload(uuid,uuid,uuid,uuid,text,text,bigint,text,text,integer)
  to service_role;

-- Reconcile an ambiguous registration response under the same lock order as
-- registration. Only a proven unregistered, unreferenced object is claimed
-- for compensation; a committed registration is returned as a receipt.
create function public.claim_owner_menu_failed_upload(
  input_actor_id uuid,input_restaurant_id uuid,input_branch_id uuid,
  input_page_id uuid,input_storage_path text,input_content_sha256 text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,storage,pg_temp as $$
declare r public.restaurants%rowtype; c public.restaurant_menu_catalogs%rowtype;
  q public.restaurant_menu_upload_reservations%rowtype;
  object_row storage.objects%rowtype;
  claim_row public.restaurant_menu_storage_cleanup_claims%rowtype;
begin
 select * into r from public.restaurants where id=input_restaurant_id for update;
 if r.id is null or r.primary_branch_id is distinct from input_branch_id
   or not exists(select 1 from public.restaurant_members m where m.restaurant_id=r.id
      and m.organization_id=r.organization_id and m.branch_id=input_branch_id
      and m.user_id=input_actor_id and m.role in ('owner','admin','manager')) then
   raise exception 'MENU_UPLOAD_CLAIM_OWNER_DENIED' using errcode='42501'; end if;
 select * into c from public.restaurant_menu_catalogs where restaurant_id=r.id
   and organization_id=r.organization_id and branch_id=input_branch_id for update;
 select * into q from public.restaurant_menu_upload_reservations
   where storage_path=input_storage_path for update;
 if q.storage_path is null or q.actor_id is distinct from input_actor_id
   or q.restaurant_id is distinct from r.id or q.organization_id is distinct from r.organization_id
   or q.branch_id is distinct from input_branch_id or q.page_id is distinct from input_page_id
   or q.content_sha256 is distinct from input_content_sha256 then
   raise exception 'MENU_UPLOAD_CLAIM_MISMATCH' using errcode='42501'; end if;
 if q.registered_at is not null then
   return jsonb_build_object('state','REGISTERED','page_id',input_page_id,
     'draft_revision',c.draft_revision); end if;
 if q.released_at is not null then
   return jsonb_build_object('state','UNKNOWN'); end if;
 if exists(select 1 from jsonb_array_elements(coalesce(c.draft_pages,'[]'::jsonb)
     || coalesce(c.published_pages,'[]'::jsonb)) p
   where p->>'storage_path'=input_storage_path) then
   return jsonb_build_object('state','REFERENCED'); end if;
 select * into object_row from storage.objects o where o.bucket_id='restaurant-menu-private'
   and o.name=input_storage_path;
 if object_row.id is null then return jsonb_build_object('state','UNKNOWN'); end if;
 insert into public.restaurant_menu_storage_cleanup_claims
   (storage_path,object_id,restaurant_id,organization_id,branch_id,actor_id)
 values(input_storage_path,object_row.id,r.id,r.organization_id,input_branch_id,input_actor_id)
 on conflict(storage_path) do nothing;
 select * into claim_row from public.restaurant_menu_storage_cleanup_claims
   where storage_path=input_storage_path for update;
 if claim_row.object_id is distinct from object_row.id
   or claim_row.restaurant_id is distinct from r.id
   or claim_row.organization_id is distinct from r.organization_id
   or claim_row.branch_id is distinct from input_branch_id
   or claim_row.deleted_at is not null then
   raise exception 'MENU_UPLOAD_CLAIM_CONFLICT' using errcode='42501'; end if;
 return jsonb_build_object('state','CLAIMED','object_id',object_row.id);
end $$;
revoke all on function public.claim_owner_menu_failed_upload(uuid,uuid,uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_owner_menu_failed_upload(uuid,uuid,uuid,uuid,text,text)
  to service_role;

create function public.remove_owner_menu_draft_page(
 input_restaurant_id uuid,input_branch_id uuid,input_page_id uuid,
 input_expected_draft_revision integer
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare c public.restaurant_menu_catalogs%rowtype; next_pages jsonb;
begin
 if auth.uid() is null
   or public.is_restaurant_admin(input_restaurant_id) is distinct from true then
   raise exception 'MENU_OWNER_FORBIDDEN' using errcode='42501'; end if;
 select * into c from public.restaurant_menu_catalogs
   where restaurant_id=input_restaurant_id and branch_id=input_branch_id for update;
 if c.id is null then raise exception 'MENU_BRANCH_MISMATCH' using errcode='42501'; end if;
 if c.draft_revision is distinct from input_expected_draft_revision then
   raise exception 'MENU_VERSION_STALE' using errcode='40001'; end if;
 if not exists(select 1 from jsonb_array_elements(c.draft_pages) page
   where page->>'id'=input_page_id::text) then
   raise exception 'MENU_PAGE_MISSING' using errcode='P0002'; end if;
 select coalesce(jsonb_agg(page.value order by page.ordinality),'[]'::jsonb)
   into next_pages from jsonb_array_elements(c.draft_pages)
   with ordinality page(value,ordinality)
   where page.value->>'id'<>input_page_id::text;
 update public.restaurant_menu_catalogs set draft_pages=next_pages,
   draft_revision=c.draft_revision+1,updated_at=now() where id=c.id;
 perform public.write_audit_event(c.restaurant_id,null,'admin',auth.uid(),
   'MENU_DRAFT_PAGE_REMOVED','success','restaurant_portal',
   'restaurant_menu_catalogs',c.id,null,
   jsonb_build_object('branch_id',c.branch_id,'page_id',input_page_id));
 return public.get_owner_menu_catalog(c.restaurant_id);
end $$;
revoke all on function public.remove_owner_menu_draft_page(uuid,uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.remove_owner_menu_draft_page(uuid,uuid,uuid,integer)
  to authenticated;

-- Existing 205 grant read stays compatible and adds the number of synthetic
-- capacity units. The only grant path for units has its own recent MFA gate.
alter function public.get_platform_test_menu_addon(uuid)
  rename to get_platform_test_menu_addon_v205;
revoke all on function public.get_platform_test_menu_addon_v205(uuid)
  from public,anon,authenticated,service_role;
create function public.get_platform_test_menu_addon(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $$
declare result_value jsonb; units_value integer:=0;
begin
 result_value:=public.get_platform_test_menu_addon_v205(input_restaurant_id);
 if result_value->>'grant_id' is not null then
   select extra_page_units into units_value
   from public.restaurant_menu_test_addon_events
   where id=(result_value->>'grant_id')::uuid and restaurant_id=input_restaurant_id;
 end if;
 return result_value||jsonb_build_object('extra_page_units',coalesce(units_value,0));
end $$;
revoke all on function public.get_platform_test_menu_addon(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_platform_test_menu_addon(uuid) to authenticated;

create function public.grant_platform_test_menu_capacity(
 input_restaurant_id uuid,input_branch_id uuid,input_extra_page_units integer,
 input_expires_at timestamptz,input_reason text,input_request_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare r public.restaurants%rowtype; prior public.restaurant_menu_test_addon_events%rowtype;
  current_grant uuid; event_id uuid; payload_hash_value text;
begin
 if auth.uid() is null
   or coalesce(public.current_platform_role() in ('platform_owner','platform_admin'),false) is not true then
   raise exception 'MENU_CAPACITY_ADMIN_DENIED' using errcode='42501'; end if;
 perform public.require_recent_platform_auth_internal();
 if input_restaurant_id is null or input_branch_id is null or input_request_id is null
   or input_extra_page_units is null or input_extra_page_units not between 1 and 1000
   or input_expires_at is null or input_expires_at<=statement_timestamp()
   or input_expires_at>statement_timestamp()+interval '24 hours'
   or length(trim(coalesce(input_reason,''))) not between 10 and 500 then
   raise exception 'MENU_CAPACITY_REQUEST_INVALID' using errcode='22023'; end if;
 payload_hash_value:=encode(extensions.digest(convert_to(jsonb_build_object(
   'actor',auth.uid(),'restaurant',input_restaurant_id,'branch',input_branch_id,
   'units',input_extra_page_units,'expires_at',input_expires_at,
   'reason',trim(input_reason))::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('menu-addon-request:'||input_request_id::text,0));
 select * into prior from public.restaurant_menu_test_addon_events
   where request_id=input_request_id;
 if prior.id is not null then
   if prior.actor_id is distinct from auth.uid()
     or prior.payload_hash is distinct from payload_hash_value
     or prior.extra_page_units is distinct from input_extra_page_units then
     raise exception 'MENU_CAPACITY_REPLAY_CONFLICT' using errcode='22023'; end if;
   return jsonb_build_object('event_id',prior.id,'grant_id',prior.id,
     'extra_page_units',prior.extra_page_units,'idempotent',true); end if;
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
   raise exception 'MENU_CAPACITY_TEST_SCOPE_DENIED' using errcode='42501'; end if;
 select g.id into current_grant from public.restaurant_menu_test_addon_events g
 where g.restaurant_id=r.id and g.organization_id=r.organization_id
   and g.branch_id=input_branch_id and g.action='GRANT'
   and g.starts_at<=statement_timestamp() and g.expires_at>statement_timestamp()
   and not exists(select 1 from public.restaurant_menu_test_addon_events x
     where x.action='REVOKE' and x.grant_id=g.id)
 order by g.created_at desc,g.id desc limit 1;
 if current_grant is not null then
   raise exception 'MENU_CAPACITY_STALE_EXPECTATION' using errcode='40001'; end if;
 insert into public.restaurant_menu_test_addon_events
 (restaurant_id,organization_id,branch_id,action,starts_at,expires_at,
  actor_id,request_id,payload_hash,reason,extra_page_units)
 values(r.id,r.organization_id,input_branch_id,'GRANT',statement_timestamp(),
   input_expires_at,auth.uid(),input_request_id,payload_hash_value,
   trim(input_reason),input_extra_page_units)
 returning id into event_id;
 perform public.write_audit_event(r.id,null,'admin',auth.uid(),
   'MENU_TEST_CAPACITY_GRANT','success','platform_admin',
   'restaurant_menu_test_addon_events',event_id,null,
   jsonb_build_object('actor_scope','platform_admin','branch_id',input_branch_id,
     'request_id',input_request_id,'extra_page_units',input_extra_page_units,
     'expires_at',input_expires_at));
 return jsonb_build_object('event_id',event_id,'grant_id',event_id,
   'extra_page_units',input_extra_page_units,'idempotent',false);
end $$;
revoke all on function public.grant_platform_test_menu_capacity(uuid,uuid,integer,timestamptz,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.grant_platform_test_menu_capacity(uuid,uuid,integer,timestamptz,text,uuid)
  to authenticated;

-- Service-only Storage deletion protocol. One-hour grace covers upload aborts
-- and concurrent requests; only exact unreferenced tenant paths are claimed.
-- Owner identity is established by the Edge gateway via Auth getUser.
create function public.claim_owner_menu_orphan_cleanup(
  input_actor_id uuid,input_restaurant_id uuid,input_branch_id uuid,input_limit integer default 50
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,storage,pg_temp as $$
declare r public.restaurants%rowtype; c public.restaurant_menu_catalogs%rowtype;
  object_row storage.objects%rowtype; claim_row public.restaurant_menu_storage_cleanup_claims%rowtype;
  paths_value jsonb:='[]'::jsonb; claimed_count integer:=0;
begin
 if input_actor_id is null or input_restaurant_id is null or input_branch_id is null
   or input_limit not between 1 and 50 then
   raise exception 'MENU_CLEANUP_REQUEST_INVALID' using errcode='22023'; end if;
 select * into r from public.restaurants where id=input_restaurant_id for update;
 if r.id is null or r.primary_branch_id is distinct from input_branch_id
   or not exists(select 1 from public.restaurant_members m
      where m.restaurant_id=r.id and m.organization_id=r.organization_id
        and m.branch_id=input_branch_id and m.user_id=input_actor_id
        and m.role in ('owner','admin','manager')) then
   raise exception 'MENU_CLEANUP_OWNER_DENIED' using errcode='42501'; end if;
 select * into c from public.restaurant_menu_catalogs
   where restaurant_id=r.id and organization_id=r.organization_id
     and branch_id=input_branch_id for update;
 -- An ambiguous Storage failure retains its quota. The grace is much longer
 -- than the hosted Edge invocation bound; only absence of the exact object
 -- permits release. Referenced and historically published paths are untouched.
 update public.restaurant_menu_upload_reservations q set released_at=clock_timestamp()
   where q.restaurant_id=r.id and q.organization_id=r.organization_id
     and q.branch_id=input_branch_id and q.registered_at is null
     and q.released_at is null
     and q.expires_at<=clock_timestamp()-interval '1 hour'
     and not exists(select 1 from storage.objects o
       where o.bucket_id='restaurant-menu-private' and o.name=q.storage_path);
 -- A previous Storage deletion may have succeeded before its finalization.
 -- Return such claims even though the object can no longer be rediscovered.
 for claim_row in select claim.* from public.restaurant_menu_storage_cleanup_claims claim
   where claim.restaurant_id=r.id and claim.organization_id=r.organization_id
     and claim.branch_id=input_branch_id and claim.deleted_at is null
     and not exists(select 1 from storage.objects o
       where o.bucket_id='restaurant-menu-private' and o.name=claim.storage_path)
   order by claim.claimed_at limit input_limit
 loop
   paths_value:=paths_value||jsonb_build_array(jsonb_build_object(
     'path',claim_row.storage_path,'object_id',claim_row.object_id,'missing',true));
   claimed_count:=claimed_count+1;
 end loop;
 for object_row in select o.* from storage.objects o
   where o.bucket_id='restaurant-menu-private'
     and o.name like r.id::text||'/'||input_branch_id::text||'/%'
     and o.name ~ ('^'||r.id::text||'/'||input_branch_id::text||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|pdf)$')
     and o.created_at <= statement_timestamp()-interval '1 hour'
     -- Only unresolved 206 uploads are disposable. Registered pages and
     -- pre-206 objects may carry historical publication evidence.
     and exists(select 1 from public.restaurant_menu_upload_reservations q
       where q.storage_path=o.name and q.restaurant_id=r.id
         and q.organization_id=r.organization_id and q.branch_id=input_branch_id
         and q.registered_at is null and q.released_at is null)
     and not exists(select 1 from jsonb_array_elements(coalesce(c.draft_pages,'[]'::jsonb)) p
       where p->>'storage_path'=o.name)
     and not exists(select 1 from jsonb_array_elements(coalesce(c.published_pages,'[]'::jsonb)) p
       where p->>'storage_path'=o.name)
   order by o.created_at,o.id limit greatest(0,input_limit-claimed_count)
 loop
   insert into public.restaurant_menu_storage_cleanup_claims
     (storage_path,object_id,restaurant_id,organization_id,branch_id,actor_id)
   values(object_row.name,object_row.id,r.id,r.organization_id,input_branch_id,input_actor_id)
   on conflict(storage_path) do nothing;
   select * into claim_row from public.restaurant_menu_storage_cleanup_claims
     where storage_path=object_row.name;
   if claim_row.object_id is distinct from object_row.id
     or claim_row.restaurant_id is distinct from r.id
     or claim_row.branch_id is distinct from input_branch_id
     or claim_row.deleted_at is not null then
     raise exception 'MENU_CLEANUP_CLAIM_CONFLICT' using errcode='42501'; end if;
   paths_value:=paths_value||jsonb_build_array(jsonb_build_object(
     'path',object_row.name,'object_id',object_row.id));
   claimed_count:=claimed_count+1;
 end loop;
 return jsonb_build_object('restaurant_id',r.id,'branch_id',input_branch_id,
   'claimed',claimed_count,'objects',paths_value);
end $$;
revoke all on function public.claim_owner_menu_orphan_cleanup(uuid,uuid,uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_owner_menu_orphan_cleanup(uuid,uuid,uuid,integer)
  to service_role;

create function public.finalize_owner_menu_orphan_cleanup(
  input_actor_id uuid,input_restaurant_id uuid,input_branch_id uuid,
  input_storage_path text,input_object_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,storage,pg_temp as $$
declare claim_row public.restaurant_menu_storage_cleanup_claims%rowtype;
  r public.restaurants%rowtype;
begin
 -- Match failed-upload reconciliation's lock order to avoid claim/q deadlocks.
 select * into r from public.restaurants where id=input_restaurant_id for update;
 perform 1 from public.restaurant_menu_catalogs
   where restaurant_id=input_restaurant_id and branch_id=input_branch_id for update;
 perform 1 from public.restaurant_menu_upload_reservations
   where storage_path=input_storage_path for update;
 select * into claim_row from public.restaurant_menu_storage_cleanup_claims
   where storage_path=input_storage_path for update;
 if claim_row.storage_path is null or claim_row.restaurant_id is distinct from input_restaurant_id
   or claim_row.branch_id is distinct from input_branch_id
   or claim_row.object_id is distinct from input_object_id
   or r.id is null or r.organization_id is distinct from claim_row.organization_id
   or r.primary_branch_id is distinct from input_branch_id
   or not exists(select 1 from public.restaurant_members m
     where m.restaurant_id=r.id and m.organization_id=r.organization_id
       and m.branch_id=input_branch_id and m.user_id=input_actor_id
       and m.role in ('owner','admin','manager')) then
   raise exception 'MENU_CLEANUP_CLAIM_DENIED' using errcode='42501'; end if;
 if exists(select 1 from storage.objects o
    where o.bucket_id='restaurant-menu-private' and o.name=input_storage_path) then
   raise exception 'MENU_CLEANUP_OBJECT_PRESENT' using errcode='40001'; end if;
 if claim_row.deleted_at is not null then
   return jsonb_build_object('deleted',true,'idempotent',true); end if;
 update public.restaurant_menu_storage_cleanup_claims set deleted_at=clock_timestamp()
   where storage_path=input_storage_path;
 update public.restaurant_menu_upload_reservations set released_at=clock_timestamp()
   where storage_path=input_storage_path and registered_at is null and released_at is null;
 perform public.write_audit_event(input_restaurant_id,null,'admin',input_actor_id,
   'MENU_ORPHAN_OBJECT_DELETED','success','catalog_media_gateway',
   'restaurant_menu_storage_cleanup_claims',input_object_id,null,
   jsonb_build_object('branch_id',input_branch_id,'storage_path',input_storage_path));
 return jsonb_build_object('deleted',true,'idempotent',false);
end $$;
revoke all on function public.finalize_owner_menu_orphan_cleanup(uuid,uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.finalize_owner_menu_orphan_cleanup(uuid,uuid,uuid,text,uuid)
  to service_role;

commit;
notify pgrst, 'reload schema';
