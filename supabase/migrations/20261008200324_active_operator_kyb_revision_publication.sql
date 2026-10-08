-- Versioned KYB material-revision and operator-change contract.
-- Local CODE LOCK only; Staging application requires a separate rollout gate.
-- Explicit manual decisions. No seed approvals, country release or activation.
begin;

-- Epochs are append-only, tenant-local and transactionally serialized on the
-- restaurant row. Baselines are NOT approvals and never map legacy receipts.
create table public.operator_material_revisions (
 restaurant_id uuid not null references public.restaurants(id) on delete restrict,
 revision bigint not null check(revision>0),
 source_table text not null, source_id uuid, operation text not null,
 actor_id uuid, created_at timestamptz not null default clock_timestamp(),
 primary key(restaurant_id,revision)
);
alter table public.operator_material_revisions enable row level security;
revoke all on public.operator_material_revisions from public,anon,authenticated,service_role;
create trigger operator_material_revisions_immutable before update or delete or truncate
 on public.operator_material_revisions for each statement
 execute function public.protect_business_verification_append_only();
insert into public.operator_material_revisions(restaurant_id,revision,source_table,source_id,operation)
 select id,1,'restaurants',id,'UPGRADE_BASELINE_UNREVIEWED' from public.restaurants;

-- An active Owner submits a complete material proposal. This immutable row
-- never changes the live operator or branch. Each submission, including B→A,
-- consumes a fresh material revision through the trigger below.
create table public.operator_owner_change_drafts (
 id uuid primary key default extensions.gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 branch_id uuid not null references public.branches(id) on delete restrict,
 owner_id uuid not null references auth.users(id) on delete restrict,
 profile jsonb not null,
 branch_address jsonb not null,
 request_id uuid not null unique,
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp()
);
create index operator_owner_change_drafts_latest
 on public.operator_owner_change_drafts(restaurant_id,created_at desc,id desc);
alter table public.operator_owner_change_drafts enable row level security;
revoke all on public.operator_owner_change_drafts from public,anon,authenticated,service_role;
create trigger operator_owner_change_drafts_immutable before update or delete or truncate
 on public.operator_owner_change_drafts for each statement
 execute function public.protect_business_verification_append_only();

create function public.record_operator_material_revision_internal()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare before_row jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 after_row jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
 keys text[]; before_material jsonb; after_material jsonb; tenant uuid;
 source uuid:=coalesce((after_row->>'id')::uuid,(before_row->>'id')::uuid);
begin
 case tg_table_name
 when 'restaurants' then keys:=array['owner_id','organization_id','primary_branch_id'];
 when 'organizations' then keys:=array['owner_id'];
 when 'organization_legal_profiles' then keys:=array['organization_id','company_name','legal_form',
   'commercial_register_number','commercial_register_court','commercial_register_applicable',
   'vat_id','gisa_number','responsible_person','owner_is_authorized_representative',
   'authorized_representative_role','registered_address_source','address_source_restaurant_id',
   'address_source_branch_id','street','postal_code','city','country'];
 when 'branches' then keys:=array['restaurant_id','organization_id','address','postal_code','city','country'];
 when 'restaurant_members' then
   if before_row->>'role' is distinct from 'owner' and after_row->>'role' is distinct from 'owner' then return null; end if;
   keys:=array['restaurant_id','organization_id','user_id','role'];
 when 'business_verification_documents' then keys:=array['restaurant_id','organization_id','case_id',
   'document_type','version','status','content_sha256','storage_bucket','storage_object_name','mime_type','byte_size'];
 when 'business_verification_cases' then keys:=array['restaurant_id','country_code','verification_method','test_only'];
 when 'business_verification_decisions' then
   if after_row->>'action' not in ('START_REVIEW','REJECT','SUSPEND') then return null; end if;
   keys:=array['id','restaurant_id','case_id','action','profile_revision_id'];
 when 'business_verified_profile_revisions' then
   -- New reviewed drafts are material sources, including Owner submissions
   -- and the existing Admin CORRECT_PROFILE RPC. This writer's VERIFIED result
   -- is an output, not a new source; counting it would invalidate itself.
   if after_row->>'status' is distinct from 'REVIEWED_DRAFT' then return null; end if;
   keys:=array['id','case_id','revision'];
 when 'operator_owner_change_drafts' then keys:=array['id','restaurant_id','organization_id',
   'branch_id','owner_id','profile','branch_address'];
 else raise exception 'OPERATOR_REVISION_SOURCE_INVALID';
 end case;
 select jsonb_object_agg(k,before_row->k),jsonb_object_agg(k,after_row->k)
   into before_material,after_material from unnest(keys) k;
 if tg_op='UPDATE' and before_material is not distinct from after_material then return null; end if;
 -- The reviewed draft already consumed its epoch. Applying precisely that
 -- draft under a private transaction permit is an output, not a second epoch.
 if tg_op='UPDATE' and tg_table_name in ('branches','organization_legal_profiles')
   and exists(select 1 from public.operator_publication_permits permit
     where permit.transaction_id=txid_current() and permit.actor_id=auth.uid()
       and ((tg_table_name='branches' and permit.branch_id=source
         and permit.branch_address=to_jsonb(new)-array['updated_at','updated_by'])
       or (tg_table_name='organization_legal_profiles'
         and permit.organization_id=(after_row->>'organization_id')::uuid
         and permit.profile=to_jsonb(new)-array['updated_at','updated_by']))) then
   return null;
 end if;
 -- Include old AND new bindings. A reassignment invalidates both tenants.
 for tenant in select r.id from public.restaurants r where
   (tg_table_name='restaurants' and r.id=source)
   or (tg_table_name='organizations' and r.organization_id=source)
   or (tg_table_name='organization_legal_profiles' and r.organization_id in
     ((before_row->>'organization_id')::uuid,(after_row->>'organization_id')::uuid))
   or (tg_table_name='branches' and (r.primary_branch_id=source or exists(
     select 1 from public.organization_legal_profiles p where p.organization_id=r.organization_id
       and p.registered_address_source='restaurant' and p.address_source_branch_id=source)))
   or (tg_table_name in ('restaurant_members','business_verification_documents',
     'business_verification_cases','business_verification_decisions',
     'operator_owner_change_drafts') and r.id in
     ((before_row->>'restaurant_id')::uuid,(after_row->>'restaurant_id')::uuid))
   or (tg_table_name='business_verified_profile_revisions' and exists(
     select 1 from public.business_verification_cases c where c.restaurant_id=r.id
       and c.id=(after_row->>'case_id')::uuid))
   order by r.id for update of r
 loop
   insert into public.operator_material_revisions(restaurant_id,revision,source_table,source_id,operation,actor_id)
   select tenant,coalesce(max(revision),0)+1,tg_table_name,source,tg_op,auth.uid()
     from public.operator_material_revisions where restaurant_id=tenant;
 end loop;
 return null;
end $f$;
revoke all on function public.record_operator_material_revision_internal()
 from public,anon,authenticated,service_role;
do $install$
declare source text;
begin
 foreach source in array array['restaurants','organizations','organization_legal_profiles','branches',
   'restaurant_members','business_verification_documents','business_verification_cases','business_verification_decisions',
   'business_verified_profile_revisions','operator_owner_change_drafts'] loop
   execute format('create trigger operator_material_revision after insert or update or delete on public.%I for each row execute function public.record_operator_material_revision_internal()',source);
 end loop;
end $install$;

-- Existing browser RLS permits an admin/owner to add another owner member.
-- A material epoch alone cannot prevent that new person from using the live
-- tenant before review. No active transfer writer exists yet, so fail closed
-- for active owner identity changes; ordinary setup and other roles remain.
create function public.guard_active_operator_transfer_internal()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare material_keys text[]; before_material jsonb; after_material jsonb;
begin
 if tg_table_name='restaurant_members' then
   if new.role='owner' and exists(select 1 from public.restaurants r
     where r.id=new.restaurant_id and r.status='active' and r.owner_id is distinct from new.user_id) then
     raise exception 'ACTIVE_OPERATOR_TRANSFER_REVIEW_REQUIRED' using errcode='42501';
   end if;
 elsif tg_table_name='restaurants' then
   if (old.owner_id,old.organization_id,old.primary_branch_id)
      is distinct from (new.owner_id,new.organization_id,new.primary_branch_id)
      and (old.status='active' or new.status='active') then
     raise exception 'ACTIVE_OPERATOR_TRANSFER_REVIEW_REQUIRED' using errcode='42501';
   end if;
 elsif tg_table_name='organizations' then
   if old.owner_id is distinct from new.owner_id and exists(select 1 from public.restaurants r
     where r.organization_id=old.id and r.status='active') then
     raise exception 'ACTIVE_OPERATOR_TRANSFER_REVIEW_REQUIRED' using errcode='42501';
   end if;
 elsif tg_table_name='branches' then
   if (old.restaurant_id,old.organization_id,old.address,old.postal_code,old.city,old.country)
      is distinct from (new.restaurant_id,new.organization_id,new.address,new.postal_code,new.city,new.country)
      and exists(select 1 from public.restaurants r where r.status='active'
        and (r.primary_branch_id=old.id or r.primary_branch_id=new.id)) then
     if not exists(select 1 from public.operator_publication_permits permit
       where permit.transaction_id=txid_current() and permit.actor_id=auth.uid()
         and permit.branch_id=new.id and permit.branch_address=to_jsonb(new)-array['updated_at','updated_by']) then
       raise exception 'ACTIVE_OPERATOR_DRAFT_REVIEW_REQUIRED' using errcode='42501';
     end if;
   end if;
 elsif tg_table_name='organization_legal_profiles' then
   material_keys:=array['organization_id','company_name','legal_form','commercial_register_number',
     'commercial_register_court','commercial_register_applicable','vat_id','gisa_number',
     'responsible_person','owner_is_authorized_representative','authorized_representative_role',
     'registered_address_source','address_source_restaurant_id','address_source_branch_id',
     'street','postal_code','city','country'];
   select jsonb_object_agg(k,to_jsonb(old)->k),jsonb_object_agg(k,to_jsonb(new)->k)
     into before_material,after_material from unnest(material_keys) k;
   if before_material is distinct from after_material
      and exists(select 1 from public.restaurants r where r.status='active'
        and r.organization_id in (old.organization_id,new.organization_id)) then
     if not exists(select 1 from public.operator_publication_permits permit
       where permit.transaction_id=txid_current() and permit.actor_id=auth.uid()
         and permit.organization_id=new.organization_id
         and permit.profile=to_jsonb(new)-array['updated_at','updated_by']) then
       raise exception 'ACTIVE_OPERATOR_DRAFT_REVIEW_REQUIRED' using errcode='42501';
     end if;
   end if;
 end if;
 return new;
end $f$;
revoke all on function public.guard_active_operator_transfer_internal()
 from public,anon,authenticated,service_role;
create trigger guard_active_owner_member before insert or update of restaurant_id,organization_id,user_id,role
 on public.restaurant_members for each row execute function public.guard_active_operator_transfer_internal();
create trigger guard_active_restaurant_owner before update of owner_id
 on public.restaurants for each row execute function public.guard_active_operator_transfer_internal();
create trigger guard_active_restaurant_binding before update of organization_id,primary_branch_id
 on public.restaurants for each row execute function public.guard_active_operator_transfer_internal();
create trigger guard_active_organization_owner before update of owner_id
 on public.organizations for each row execute function public.guard_active_operator_transfer_internal();
create trigger guard_active_branch_material before update of restaurant_id,organization_id,address,postal_code,city,country
 on public.branches for each row execute function public.guard_active_operator_transfer_internal();
create trigger guard_active_operator_profile before update
 on public.organization_legal_profiles for each row execute function public.guard_active_operator_transfer_internal();

create table public.platform_operator_review_events (
  id uuid primary key default extensions.gen_random_uuid(),
  sequence bigint generated always as identity unique,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  material_revision bigint not null,
  kind text not null check(kind in ('KYB','LEGAL')),
  action text not null check(action in ('FIRST_REVIEW','APPROVE','REVOKE')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  auth_evidence jsonb not null,
  request_id uuid not null unique,
  previous_id uuid references public.platform_operator_review_events(id) on delete restrict,
  snapshot jsonb not null,
  snapshot_sha256 text not null check(snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  check(kind='KYB' or action<>'FIRST_REVIEW'),
  foreign key(restaurant_id,material_revision) references public.operator_material_revisions(restaurant_id,revision)
);
create index platform_operator_review_latest on public.platform_operator_review_events(restaurant_id,kind,sequence desc);
alter table public.platform_operator_review_events enable row level security;
revoke all on public.platform_operator_review_events from public,anon,authenticated,service_role;
revoke all on sequence public.platform_operator_review_events_sequence_seq from public,anon,authenticated,service_role;
create trigger platform_operator_review_immutable before update or delete or truncate
  on public.platform_operator_review_events for each statement
  execute function public.protect_business_verification_append_only();

create table public.operator_publication_events (
 id uuid primary key default extensions.gen_random_uuid(),
 restaurant_id uuid not null references public.restaurants(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 branch_id uuid not null references public.branches(id) on delete restrict,
 draft_id uuid not null references public.operator_owner_change_drafts(id) on delete restrict,
 kyb_review_id uuid not null references public.platform_operator_review_events(id) on delete restrict,
 material_revision bigint not null,
 actor_id uuid not null references auth.users(id) on delete restrict,
 request_id uuid not null unique,
 expected_snapshot_sha256 text not null check(expected_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
 published_live_sha256 text not null check(published_live_sha256 ~ '^[0-9a-f]{64}$'),
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(restaurant_id,material_revision)
   references public.operator_material_revisions(restaurant_id,revision)
);
alter table public.operator_publication_events enable row level security;
revoke all on public.operator_publication_events from public,anon,authenticated,service_role;
create trigger operator_publication_events_immutable before update or delete or truncate
 on public.operator_publication_events for each statement
 execute function public.protect_business_verification_append_only();

-- Ephemeral, non-browser-capable write authority for only the two exact live
-- rows in the same transaction as the audited publication. A custom GUC is
-- deliberately insufficient: a SQL caller could forge one.
create table public.operator_publication_permits (
 transaction_id bigint not null,
 restaurant_id uuid not null,
 organization_id uuid not null,
 branch_id uuid not null,
 actor_id uuid not null,
 profile jsonb not null,
 branch_address jsonb not null,
 primary key(transaction_id,restaurant_id)
);
alter table public.operator_publication_permits enable row level security;
revoke all on public.operator_publication_permits from public,anon,authenticated,service_role;

-- Only material operator fields and the exact current uploaded evidence enter
-- the KYB snapshot. Branding/opening hours are intentionally absent.
create function public.operator_profile_live_internal(input_restaurant_id uuid)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
 select jsonb_build_object('legal_name',op.company_name,'legal_form',op.legal_form,
   'register_identifier',nullif(trim(op.commercial_register_number),''),
   'register_court',nullif(trim(op.commercial_register_court),''),
   'vat_id',nullif(trim(op.vat_id),''),
   'registered_address_source',op.registered_address_source,
   'business_street',case when op.registered_address_source='restaurant' then b.address else op.street end,
   'business_postal_code',case when op.registered_address_source='restaurant' then b.postal_code else op.postal_code end,
   'business_city',case when op.registered_address_source='restaurant' then b.city else op.city end,
   'business_country',case when op.registered_address_source='restaurant' then upper(b.country) else upper(op.country) end,
   'authorized_representative',nullif(trim(op.responsible_person),''),
   'gisa_number',nullif(trim(op.gisa_number),''),
   'owner_is_authorized_representative',op.owner_is_authorized_representative,
   'authorized_representative_role',nullif(trim(op.authorized_representative_role),''),
   'commercial_register_applicable',op.commercial_register_applicable)
 from public.restaurants r
 join public.branches b on b.id=r.primary_branch_id and b.restaurant_id=r.id
   and b.organization_id=r.organization_id
 join public.organization_legal_profiles op on op.organization_id=r.organization_id
 where r.id=input_restaurant_id;
$f$;
revoke all on function public.operator_profile_live_internal(uuid)
 from public,anon,authenticated,service_role;

create function public.submit_owner_operator_change_draft(
 input_restaurant_id uuid,input_organization_id uuid,input_branch_id uuid,
 input_profile jsonb,input_branch_address jsonb,input_expected_revision bigint,input_request_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare r public.restaurants%rowtype; b public.branches%rowtype;
 prior public.operator_owner_change_drafts%rowtype; draft_id uuid; current_revision bigint;
 payload_hash text; proposed_address jsonb;
begin
 if auth.uid() is null or auth.role() is distinct from 'authenticated'
   or input_request_id is null or input_expected_revision is null or input_expected_revision<1
   or jsonb_typeof(input_profile) is distinct from 'object'
   or jsonb_typeof(input_branch_address) is distinct from 'object'
   or (select count(*) from jsonb_object_keys(input_profile))<>15
   or (select count(*) from jsonb_object_keys(input_branch_address))<>4
   or exists(select 1 from jsonb_object_keys(input_profile) key
     where key not in (select jsonb_object_keys(public.operator_profile_live_internal(input_restaurant_id))))
   or exists(select 1 from jsonb_object_keys(input_branch_address) key
     where key not in ('address','postal_code','city','country')) then
   raise exception 'OPERATOR_DRAFT_INVALID' using errcode='22023';
 end if;
 payload_hash:=encode(extensions.digest(convert_to(jsonb_build_object(
   'restaurant',input_restaurant_id,'organization',input_organization_id,'branch',input_branch_id,
   'profile',input_profile,'branch_address',input_branch_address,
   'expected_revision',input_expected_revision)::text,'UTF8'),'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('operator-draft-request:'||input_request_id::text,0));
 select * into prior from public.operator_owner_change_drafts where request_id=input_request_id;
 if prior.id is not null then
   if prior.owner_id is distinct from auth.uid() or prior.payload_sha256 is distinct from payload_hash then
     raise exception 'OPERATOR_DRAFT_REPLAY_CONFLICT' using errcode='22023'; end if;
   return jsonb_build_object('draft_id',prior.id,'restaurant_id',prior.restaurant_id,
     'material_revision',(select revision from public.operator_material_revisions
       where restaurant_id=prior.restaurant_id and source_table='operator_owner_change_drafts'
         and source_id=prior.id),'idempotent',true,'historical_receipt',true);
 end if;
 select * into r from public.restaurants where id=input_restaurant_id for update nowait;
 select * into b from public.branches where id=input_branch_id for update nowait;
 if r.id is null or r.status<>'active' or r.organization_id is distinct from input_organization_id
   or r.primary_branch_id is distinct from input_branch_id or r.owner_id is distinct from auth.uid()
   or b.restaurant_id is distinct from r.id or b.organization_id is distinct from r.organization_id
   or not exists(select 1 from public.organizations o where o.id=r.organization_id and o.owner_id=auth.uid())
   or not exists(select 1 from public.restaurant_members m where m.restaurant_id=r.id
     and m.organization_id=r.organization_id and m.user_id=auth.uid() and m.role='owner') then
   raise exception 'OPERATOR_DRAFT_OWNER_BINDING_REQUIRED' using errcode='42501'; end if;
 select max(revision) into current_revision from public.operator_material_revisions where restaurant_id=r.id;
 if current_revision is distinct from input_expected_revision then
   raise exception 'OPERATOR_DRAFT_STALE' using errcode='40001'; end if;
 proposed_address:=jsonb_build_object('address',nullif(trim(input_branch_address->>'address'),''),
   'postal_code',nullif(trim(input_branch_address->>'postal_code'),''),
   'city',nullif(trim(input_branch_address->>'city'),''),
   'country',upper(trim(input_branch_address->>'country')));
 if coalesce(length(input_profile->>'legal_name'),0) not between 1 and 240
   or coalesce(length(input_profile->>'legal_form'),0) not between 1 and 120
   or coalesce(length(input_profile->>'gisa_number'),0) not between 1 and 120
   or coalesce(length(input_profile->>'authorized_representative'),0) not between 1 and 240
   or coalesce(length(input_profile->>'authorized_representative_role'),0) not between 1 and 120
   or coalesce(length(input_profile->>'business_street'),0) not between 1 and 240
   or coalesce(length(input_profile->>'business_postal_code'),0) not between 1 and 40
   or coalesce(length(input_profile->>'business_city'),0) not between 1 and 120
   or input_profile->>'business_country' is distinct from 'AT'
   or input_profile->>'registered_address_source' is null
   or input_profile->>'registered_address_source' not in ('restaurant','separate')
   or jsonb_typeof(input_profile->'owner_is_authorized_representative') is distinct from 'boolean'
   or jsonb_typeof(input_profile->'commercial_register_applicable') is distinct from 'boolean'
   or (input_profile->>'commercial_register_applicable')::boolean
     and nullif(trim(input_profile->>'register_identifier'),'') is null
   or coalesce(length(input_profile->>'register_identifier'),0)>120
   or coalesce(length(input_profile->>'register_court'),0)>240
   or coalesce(length(input_profile->>'vat_id'),0)>120
   or (proposed_address is distinct from jsonb_build_object('address',b.address,
       'postal_code',b.postal_code,'city',b.city,'country',upper(b.country))
     and (coalesce(length(proposed_address->>'address'),0) not between 1 and 240
       or coalesce(length(proposed_address->>'postal_code'),0) not between 1 and 40
       or coalesce(length(proposed_address->>'city'),0) not between 1 and 120))
   or proposed_address->>'country' is distinct from 'AT'
   or (input_profile->>'registered_address_source'='restaurant' and
     (input_profile->>'business_street',input_profile->>'business_postal_code',
       input_profile->>'business_city',input_profile->>'business_country') is distinct from
     (proposed_address->>'address',proposed_address->>'postal_code',
       proposed_address->>'city',proposed_address->>'country')) then
   raise exception 'OPERATOR_DRAFT_PROFILE_INVALID' using errcode='22023'; end if;
 insert into public.operator_owner_change_drafts(restaurant_id,organization_id,branch_id,
   owner_id,profile,branch_address,request_id,payload_sha256)
 values(r.id,r.organization_id,b.id,auth.uid(),input_profile,proposed_address,input_request_id,payload_hash)
 returning id into draft_id;
 select max(revision) into current_revision from public.operator_material_revisions where restaurant_id=r.id;
 return jsonb_build_object('draft_id',draft_id,'restaurant_id',r.id,
   'material_revision',current_revision,'idempotent',false,'published',false);
end $f$;
revoke all on function public.submit_owner_operator_change_draft(uuid,uuid,uuid,jsonb,jsonb,bigint,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.submit_owner_operator_change_draft(uuid,uuid,uuid,jsonb,jsonb,bigint,uuid)
 to authenticated;

-- Owner-only readback for the active A and the latest unpublished B. The
-- private tables remain inaccessible to browser roles, including after reload.
create function public.get_owner_operator_change_status(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare r public.restaurants%rowtype; b public.branches%rowtype;
 latest public.operator_owner_change_drafts%rowtype;
 current_revision bigint; published_id uuid;
begin
 if auth.uid() is null or auth.role() is distinct from 'authenticated' then
   raise exception 'OPERATOR_OWNER_AUTH_REQUIRED' using errcode='42501'; end if;
 select * into r from public.restaurants where id=input_restaurant_id;
 select * into b from public.branches where id=r.primary_branch_id;
 if r.id is null or r.status<>'active' or r.owner_id is distinct from auth.uid()
   or b.id is null or b.restaurant_id is distinct from r.id
   or b.organization_id is distinct from r.organization_id
   or not exists(select 1 from public.organizations o where o.id=r.organization_id and o.owner_id=auth.uid())
   or not exists(select 1 from public.restaurant_members m where m.restaurant_id=r.id
     and m.organization_id=r.organization_id and m.user_id=auth.uid() and m.role='owner') then
   raise exception 'OPERATOR_OWNER_BINDING_REQUIRED' using errcode='42501'; end if;
 select max(revision) into current_revision from public.operator_material_revisions where restaurant_id=r.id;
 select * into latest from public.operator_owner_change_drafts d
   where d.restaurant_id=r.id order by d.created_at desc,d.id desc limit 1;
 if latest.id is not null then
   select e.id into published_id from public.operator_publication_events e where e.draft_id=latest.id;
 end if;
 return jsonb_build_object('restaurant_id',r.id,'organization_id',r.organization_id,
   'branch_id',b.id,'material_revision',current_revision,
   'live_profile',public.operator_profile_live_internal(r.id),
   'live_branch_address',jsonb_build_object('address',b.address,'postal_code',b.postal_code,
     'city',b.city,'country',b.country),
   'draft',case when latest.id is not null and published_id is null then
     jsonb_build_object('id',latest.id,'request_id',latest.request_id,
       'profile',latest.profile,'branch_address',latest.branch_address,
       'material_revision',(select rev.revision from public.operator_material_revisions rev
         where rev.restaurant_id=r.id and rev.source_table='operator_owner_change_drafts'
           and rev.source_id=latest.id)) else null end);
end $f$;
revoke all on function public.get_owner_operator_change_status(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.get_owner_operator_change_status(uuid) to authenticated;

create function public.operator_review_snapshot_internal(input_restaurant_id uuid,input_kind text)
returns jsonb language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
 select jsonb_build_object(
   'restaurant_id',r.id,'organization_id',r.organization_id,'branch_id',b.id,
   'owner_id',r.owner_id,'case_id',c.id,'country',c.country_code,
   'material_revision',(select max(revision) from public.operator_material_revisions where restaurant_id=r.id),
   'admin_profile',(select to_jsonb(v) from public.business_verified_profile_revisions v
     where v.case_id=c.id and v.status='REVIEWED_DRAFT' order by v.revision desc limit 1),
   'owner_draft',to_jsonb(od),
   'operator',coalesce(od.profile,public.operator_profile_live_internal(r.id)),
   'documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'type',d.document_type,
       'version',d.version,'sha256',d.content_sha256) order by d.id)
     from public.business_verification_documents d
     where d.restaurant_id=r.id and d.organization_id=r.organization_id and d.case_id=c.id
       and d.status='UPLOADED'),'[]'::jsonb),
   'legal',case when input_kind='LEGAL' then jsonb_build_object(
     'kyb_receipt_id',(select e.id from public.platform_operator_review_events e
       where e.restaurant_id=r.id and e.kind='KYB' order by e.sequence desc limit 1),
     'policy',to_jsonb(p),
     'evidence',(select to_jsonb(e) from public.platform_at_legal_policy_evidence e
       join public.legal_bundle_policy_revisions pr on pr.revision_id=e.revision_id
       where pr.country_code='AT' and pr.policy_state=to_jsonb(p) order by pr.revision_id desc limit 1),
     'templates',(select jsonb_agg(jsonb_build_object('id',t.id,'version',t.version,
       'sha256',public.at_legal_template_content_hash_internal(t.document_type,t.version,t.language,t.title,t.content_template,t.rendered_text_template)) order by t.id)
       from public.legal_master_templates t where t.language='de-AT' and t.active and t.review_status='REVIEWED'),
     'artifacts',(select jsonb_agg(jsonb_build_object('id',a.id,'version',a.version,
       'sha256',a.content_sha256) order by a.id) from public.platform_at_legal_policy_artifact_versions a
       where a.active and a.review_status='REVIEWED')) else null end)
 from public.restaurants r
 join public.organizations o on o.id=r.organization_id and o.owner_id=r.owner_id
 join public.branches b on b.id=r.primary_branch_id and b.restaurant_id=r.id and b.organization_id=r.organization_id
 join public.organization_legal_profiles op on op.organization_id=r.organization_id
 join public.business_verification_cases c on c.restaurant_id=r.id and c.country_code='AT'
 join public.country_kyb_intake_policies p on p.country_code=c.country_code
 left join lateral (select d.* from public.operator_owner_change_drafts d
   where d.restaurant_id=r.id order by d.created_at desc,d.id desc limit 1) od on true
 where r.id=input_restaurant_id and upper(b.country)='AT'
   and exists(select 1 from public.restaurant_members m where m.restaurant_id=r.id
     and m.organization_id=r.organization_id and m.user_id=r.owner_id and m.role='owner');
$f$;
revoke all on function public.operator_review_snapshot_internal(uuid,text) from public,anon,authenticated,service_role;

-- A pending draft/review may change the review snapshot, never the published
-- A snapshot. This comparison deliberately excludes the pending epoch,
-- pending draft and newest KYB review receipt, but retains owner/tenant,
-- live operator, uploaded documents and exact legal policy references.
create function public.operator_live_material_sha256_internal(input_restaurant_id uuid)
returns text language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
 select encode(extensions.digest(convert_to((
   (s - array['material_revision','owner_draft','admin_profile','operator','legal'])
   || jsonb_build_object('operator',public.operator_profile_live_internal(input_restaurant_id),
     'legal',(s->'legal')-'kyb_receipt_id'))::text,'UTF8'),'sha256'),'hex')
 from (select public.operator_review_snapshot_internal(input_restaurant_id,'LEGAL') s) source
 where s is not null;
$f$;
revoke all on function public.operator_live_material_sha256_internal(uuid)
 from public,anon,authenticated,service_role;

-- Seal only BASIC restaurants that were already active under the old writer.
-- The old predicates run here, before either resolver is replaced. This is an
-- eligibility record, not a new KYB or Legal approval and not a new trial.
create table public.operator_legacy_upgrade_seals (
 restaurant_id uuid primary key references public.restaurants(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 branch_id uuid not null references public.branches(id) on delete restrict,
 owner_id uuid not null references auth.users(id) on delete restrict,
 subscription_id uuid not null references public.branch_subscriptions(id) on delete restrict,
 trial_decision_id uuid not null references public.manual_basic_trial_decisions(id) on delete restrict,
 case_id uuid not null references public.business_verification_cases(id) on delete restrict,
 profile_revision_id uuid not null references public.business_verified_profile_revisions(id) on delete restrict,
 legal_decision_id uuid not null references public.legal_operator_publication_decisions(id) on delete restrict,
 kyb_snapshot_sha256 text not null check(kyb_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
 legal_snapshot_sha256 text not null check(legal_snapshot_sha256 ~ '^[0-9a-f]{64}$'),
 live_material_sha256 text not null check(live_material_sha256 ~ '^[0-9a-f]{64}$'),
 legacy_kyb_valid_until timestamptz not null,
 sealed_at timestamptz not null default statement_timestamp()
);
alter table public.operator_legacy_upgrade_seals enable row level security;
revoke all on public.operator_legacy_upgrade_seals from public,anon,authenticated,service_role;
create trigger operator_legacy_upgrade_seals_immutable before update or delete or truncate
 on public.operator_legacy_upgrade_seals for each statement
 execute function public.protect_business_verification_append_only();
insert into public.operator_legacy_upgrade_seals(
 restaurant_id,organization_id,branch_id,owner_id,subscription_id,trial_decision_id,case_id,
 profile_revision_id,legal_decision_id,kyb_snapshot_sha256,legal_snapshot_sha256,
 live_material_sha256,legacy_kyb_valid_until)
select r.id,r.organization_id,b.id,r.owner_id,s.id,m.id,c.id,v.id,d.id,
 encode(extensions.digest(convert_to(public.operator_review_snapshot_internal(r.id,'KYB')::text,'UTF8'),'sha256'),'hex'),
 encode(extensions.digest(convert_to(public.operator_review_snapshot_internal(r.id,'LEGAL')::text,'UTF8'),'sha256'),'hex'),
 public.operator_live_material_sha256_internal(r.id),c.expires_at
from public.restaurants r
join public.branches b on b.id=r.primary_branch_id and b.restaurant_id=r.id and b.organization_id=r.organization_id
join public.branch_subscriptions s on s.branch_id=b.id and s.organization_id=r.organization_id
join public.manual_basic_trial_decisions m on m.subscription_id=s.id and m.restaurant_id=r.id
 and m.organization_id=r.organization_id and m.branch_id=b.id
 and m.starts_at=s.trial_started_at and m.ends_at=s.trial_ends_at
join public.business_verification_cases c on c.restaurant_id=r.id and c.country_code='AT' and c.status='VERIFIED' and not c.test_only
join public.legal_operator_publication_decisions d on d.restaurant_id=r.id and d.case_id=c.id and d.action='APPROVED'
join public.business_verified_profile_revisions v on v.id=d.profile_revision_id and v.case_id=c.id and v.status='VERIFIED'
where r.status='active' and b.status='active' and s.plan_key='BASIC'
 and s.status='trialing' and s.subscription_status='trialing'
 and s.trial_started_at<=statement_timestamp() and s.trial_ends_at>statement_timestamp()
 and d.id=(select x.id from public.legal_operator_publication_decisions x
   where x.restaurant_id=r.id order by x.created_at desc,x.id desc limit 1)
 and (public.resolve_business_verification_readiness_internal(r.id,'TEST')->>'real_verified')::boolean
 and public.legal_operator_publication_ready_internal(r.id,statement_timestamp())
 and public.operator_review_snapshot_internal(r.id,'KYB') is not null
 and public.operator_review_snapshot_internal(r.id,'LEGAL') is not null;

create function public.operator_legacy_upgrade_current_internal(input_restaurant_id uuid,input_as_of timestamptz)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
 select input_as_of is not null and isfinite(input_as_of) and exists(
  select 1 from public.operator_legacy_upgrade_seals seal
  join public.restaurants r on r.id=seal.restaurant_id and r.organization_id=seal.organization_id
    and r.primary_branch_id=seal.branch_id and r.owner_id=seal.owner_id and r.status='active'
  join public.branches b on b.id=seal.branch_id and b.restaurant_id=r.id
    and b.organization_id=r.organization_id and b.status='active'
  join public.branch_subscriptions s on s.id=seal.subscription_id and s.branch_id=b.id
    and s.organization_id=r.organization_id and s.plan_key='BASIC'
    and s.status='trialing' and s.subscription_status='trialing'
  join public.manual_basic_trial_decisions m on m.id=seal.trial_decision_id
    and m.subscription_id=s.id and m.restaurant_id=r.id and m.organization_id=r.organization_id
    and m.branch_id=b.id and m.starts_at=s.trial_started_at and m.ends_at=s.trial_ends_at
  join public.business_verification_cases c on c.id=seal.case_id and c.restaurant_id=r.id
    and c.country_code='AT' and c.status='VERIFIED' and not c.test_only
    and c.decided_at<=input_as_of and c.expires_at>input_as_of
  join public.business_verified_profile_revisions v on v.id=seal.profile_revision_id
    and v.case_id=c.id and v.status='VERIFIED' and v.effective_from<=input_as_of
  join public.legal_operator_publication_decisions d on d.id=seal.legal_decision_id
    and d.restaurant_id=r.id and d.case_id=c.id and d.profile_revision_id=v.id and d.action='APPROVED'
  where seal.restaurant_id=input_restaurant_id and input_as_of>=seal.sealed_at
    and (select max(revision) from public.operator_material_revisions where restaurant_id=r.id)=1
    and not exists(select 1 from public.platform_operator_review_events e where e.restaurant_id=r.id)
    and d.id=(select x.id from public.legal_operator_publication_decisions x
      where x.restaurant_id=r.id order by x.created_at desc,x.id desc limit 1)
    and seal.kyb_snapshot_sha256=encode(extensions.digest(convert_to(
      public.operator_review_snapshot_internal(r.id,'KYB')::text,'UTF8'),'sha256'),'hex')
    and seal.legal_snapshot_sha256=encode(extensions.digest(convert_to(
      public.operator_review_snapshot_internal(r.id,'LEGAL')::text,'UTF8'),'sha256'),'hex')
 );
$f$;
revoke all on function public.operator_legacy_upgrade_current_internal(uuid,timestamptz)
 from public,anon,authenticated,service_role;

-- Preserve only the old, still-live A while B is pending. This is never an
-- approval of B, cannot activate a pending tenant and ends permanently on
-- first publication, source change/revocation or old evidence expiry.
create function public.operator_legacy_live_during_draft_internal(input_restaurant_id uuid,input_as_of timestamptz)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
 select input_as_of is not null and isfinite(input_as_of) and exists(
  select 1 from public.operator_legacy_upgrade_seals seal
  join public.restaurants r on r.id=seal.restaurant_id and r.organization_id=seal.organization_id
    and r.primary_branch_id=seal.branch_id and r.owner_id=seal.owner_id and r.status='active'
  join public.organizations o on o.id=r.organization_id and o.owner_id=r.owner_id
  join public.restaurant_members rm on rm.restaurant_id=r.id and rm.organization_id=r.organization_id
    and rm.user_id=r.owner_id and rm.role='owner'
  join public.branches b on b.id=seal.branch_id and b.restaurant_id=r.id
    and b.organization_id=r.organization_id and b.status='active'
  join public.branch_subscriptions s on s.id=seal.subscription_id and s.branch_id=b.id
    and s.organization_id=r.organization_id and s.plan_key='BASIC'
    and s.status='trialing' and s.subscription_status='trialing'
    and s.trial_started_at<=input_as_of and s.trial_ends_at>input_as_of
  join public.manual_basic_trial_decisions m on m.id=seal.trial_decision_id
    and m.subscription_id=s.id and m.restaurant_id=r.id and m.organization_id=r.organization_id
    and m.branch_id=b.id and m.starts_at=s.trial_started_at and m.ends_at=s.trial_ends_at
  join public.business_verification_cases c on c.id=seal.case_id and c.restaurant_id=r.id
    and c.country_code='AT' and c.status='VERIFIED' and not c.test_only
  join public.business_verified_profile_revisions v on v.id=seal.profile_revision_id
    and v.case_id=c.id and v.status='VERIFIED' and v.effective_from<=input_as_of
  join public.legal_operator_publication_decisions d on d.id=seal.legal_decision_id
    and d.restaurant_id=r.id and d.case_id=c.id and d.profile_revision_id=v.id and d.action='APPROVED'
  where seal.restaurant_id=input_restaurant_id and input_as_of>=seal.sealed_at
    and seal.legacy_kyb_valid_until>input_as_of
    and not exists(select 1 from public.operator_publication_events x where x.restaurant_id=r.id)
    and d.id=(select x.id from public.legal_operator_publication_decisions x
      where x.restaurant_id=r.id order by x.created_at desc,x.id desc limit 1)
    and seal.live_material_sha256=public.operator_live_material_sha256_internal(r.id)
 );
$f$;
revoke all on function public.operator_legacy_live_during_draft_internal(uuid,timestamptz)
 from public,anon,authenticated,service_role;

create function public.operator_published_live_during_draft_internal(input_restaurant_id uuid,input_as_of timestamptz)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
 select input_as_of is not null and isfinite(input_as_of) and exists(
  select 1 from public.operator_publication_events pub
  join public.platform_operator_review_events approved on approved.id=pub.kyb_review_id
    and approved.restaurant_id=pub.restaurant_id and approved.kind='KYB'
    and approved.action='APPROVE' and approved.material_revision=pub.material_revision
  join public.restaurants r on r.id=pub.restaurant_id and r.organization_id=pub.organization_id
    and r.primary_branch_id=pub.branch_id and r.status='active'
  join public.organizations o on o.id=r.organization_id and o.owner_id=r.owner_id
  join public.restaurant_members rm on rm.restaurant_id=r.id and rm.organization_id=r.organization_id
    and rm.user_id=r.owner_id and rm.role='owner'
  join public.branches b on b.id=pub.branch_id and b.restaurant_id=r.id
    and b.organization_id=r.organization_id and b.status='active'
  join public.business_verification_cases c on c.restaurant_id=r.id
    and c.status='VERIFIED' and c.country_code='AT' and not c.test_only
  where pub.restaurant_id=input_restaurant_id and pub.created_at<=input_as_of
    and pub.id=(select latest.id from public.operator_publication_events latest
      where latest.restaurant_id=r.id order by latest.created_at desc,latest.id desc limit 1)
    and pub.published_live_sha256=public.operator_live_material_sha256_internal(r.id)
    and not exists(select 1 from public.platform_operator_review_events revoked
      where revoked.restaurant_id=r.id and revoked.kind='KYB' and revoked.action='REVOKE'
        and revoked.sequence>approved.sequence)
    and not exists(select 1 from jsonb_each_text(approved.payload->'document_expiries') expiry
      where expiry.value is not null and expiry.value::timestamptz<=input_as_of)
 );
$f$;
revoke all on function public.operator_published_live_during_draft_internal(uuid,timestamptz)
 from public,anon,authenticated,service_role;

-- Revalidate the exact policy references, not a list of unrelated reviewed
-- documents. No external legal approval is created by this predicate.
create function public.operator_review_legal_sources_current_internal(input_snapshot jsonb)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare evidence jsonb:=input_snapshot->'legal'->'evidence'; areas jsonb;
  area_name text; item jsonb; expected_hash text;
begin
 areas:=evidence->'area_versions';
 if jsonb_typeof(areas) is distinct from 'object' then return false; end if;
 if (select count(*) from jsonb_object_keys(areas))<>4 then return false; end if;
 expected_hash:=encode(extensions.digest(convert_to('WUXUAI_AT_POLICY_EVIDENCE_V1'
   ||public.legal_bundle_canonical_value_v1(areas),'UTF8'),'sha256'),'hex');
 if evidence->>'area_evidence_sha256' is distinct from expected_hash then return false; end if;
 foreach area_name in array array['legal','privacy','document_catalog','retention'] loop
   item:=areas->area_name;
   if jsonb_typeof(item) is distinct from 'object'
     or input_snapshot->'legal'->'policy'->>(area_name||'_status') is distinct from 'VERIFIED'
     or coalesce(item->>'version','')=''
     or coalesce(item->>'sha256','') !~ '^[0-9a-f]{64}$'
     or coalesce(item->>'source_reference','')='' then return false; end if;
   if area_name in ('legal','privacy') then
     if not exists(select 1 from public.legal_master_templates t
       join public.platform_at_legal_template_evidence e on e.template_id=t.id
       where t.document_type=case area_name when 'legal' then 'participation_terms' else 'privacy' end
         and t.language='de-AT' and t.version=item->>'version' and t.active and t.review_status='REVIEWED'
         and e.source_reference=item->>'source_reference' and e.content_sha256=item->>'sha256'
         and public.at_legal_template_content_hash_internal(t.document_type,t.version,t.language,
           t.title,t.content_template,t.rendered_text_template)=item->>'sha256'
         and not exists(select 1 from public.legal_master_templates n
           where n.document_type=t.document_type and n.language=t.language and n.active
             and n.review_status='REVIEWED' and (n.created_at,n.id)>(t.created_at,t.id))) then return false; end if;
   else
     if not exists(select 1 from public.platform_at_legal_policy_artifact_versions a
       where a.area=area_name and a.version=item->>'version' and a.active and a.review_status='REVIEWED'
         and a.source_reference=item->>'source_reference' and a.content_sha256=item->>'sha256'
         and public.at_legal_policy_artifact_hash_internal(a.area,a.version,a.content,a.rendered_text)=item->>'sha256'
         and not exists(select 1 from public.platform_at_legal_policy_artifact_versions n
           where n.area=a.area and n.active and n.review_status='REVIEWED'
             and (n.created_at,n.id)>(a.created_at,a.id))) then return false; end if;
   end if;
 end loop;
 return true;
end $f$;
revoke all on function public.operator_review_legal_sources_current_internal(jsonb)
 from public,anon,authenticated,service_role;

create function public.operator_review_current_internal(input_restaurant_id uuid,input_kind text,input_as_of timestamptz)
returns boolean language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare e public.platform_operator_review_events%rowtype; first_review public.platform_operator_review_events%rowtype;
begin
 if input_kind is null or input_kind not in ('KYB','LEGAL')
   or input_as_of is null or not isfinite(input_as_of) then return false; end if;
 select * into e from public.platform_operator_review_events where restaurant_id=input_restaurant_id
   and kind=input_kind order by sequence desc limit 1;
 if e.id is null or e.action<>'APPROVE' or e.created_at>input_as_of
   or e.material_revision is distinct from (select max(revision) from public.operator_material_revisions where restaurant_id=input_restaurant_id)
   or e.snapshot is distinct from public.operator_review_snapshot_internal(input_restaurant_id,input_kind) then return false; end if;
 if input_kind='KYB' then
   select * into first_review from public.platform_operator_review_events where id=e.previous_id;
   if first_review.action is distinct from 'FIRST_REVIEW' or first_review.actor_id=e.actor_id
     or first_review.kind is distinct from 'KYB'
     or first_review.restaurant_id is distinct from e.restaurant_id
     or first_review.organization_id is distinct from e.organization_id
     or first_review.branch_id is distinct from e.branch_id
     or first_review.material_revision is distinct from e.material_revision
     or first_review.sequence>=e.sequence
     or first_review.payload->'document_expiries' is distinct from e.payload->'document_expiries'
     or first_review.snapshot is distinct from e.snapshot then return false; end if;
   if exists(select 1 from jsonb_each_text(e.payload->'document_expiries') x
     where x.value is not null and x.value::timestamptz<=input_as_of) then return false; end if;
 elsif not public.operator_review_legal_sources_current_internal(e.snapshot) then return false;
 end if;
 return true;
end $f$;
revoke all on function public.operator_review_current_internal(uuid,text,timestamptz) from public,anon,authenticated,service_role;

create function public.get_platform_operator_review(input_restaurant_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare k jsonb; l jsonb; ke public.platform_operator_review_events%rowtype;
 le public.platform_operator_review_events%rowtype; publication public.operator_publication_events%rowtype;
begin
 perform public.require_legal_bundle_admin_internal();
 k:=public.operator_review_snapshot_internal(input_restaurant_id,'KYB');
 l:=public.operator_review_snapshot_internal(input_restaurant_id,'LEGAL');
 if k is null then raise exception 'OPERATOR_REVIEW_BINDING_INVALID' using errcode='42501'; end if;
 select * into ke from public.platform_operator_review_events where restaurant_id=input_restaurant_id and kind='KYB' order by sequence desc limit 1;
 select * into le from public.platform_operator_review_events where restaurant_id=input_restaurant_id and kind='LEGAL' order by sequence desc limit 1;
 select * into publication from public.operator_publication_events
   where restaurant_id=input_restaurant_id order by created_at desc,id desc limit 1;
 return jsonb_build_object('restaurant_name',(select name from public.restaurants where id=input_restaurant_id),
   'kyb',jsonb_build_object('snapshot',k,'hash',encode(extensions.digest(k::text,'sha256'),'hex'),
     'revision',k->'material_revision','previous_id',ke.id,'action',ke.action,'same_reviewer',ke.actor_id=auth.uid(),
     'review_request_id',ke.request_id,
     'review_hash',ke.snapshot_sha256,'review_revision',ke.material_revision,
     'draft_revision',(select rev.revision from public.operator_material_revisions rev
       where rev.restaurant_id=input_restaurant_id and rev.source_table='operator_owner_change_drafts'
         and rev.source_id=(k->'owner_draft'->>'id')::uuid),
     'document_expiries',coalesce(ke.payload->'document_expiries','{}'::jsonb),
     'current',public.operator_review_current_internal(input_restaurant_id,'KYB',statement_timestamp())),
   'publication',case when publication.id is null then null else
     jsonb_build_object('receipt_id',publication.id,'request_id',publication.request_id,'draft_id',publication.draft_id,
       'material_revision',publication.material_revision,'published_at',publication.created_at) end,
   'legal',jsonb_build_object('snapshot',l,'hash',encode(extensions.digest(l::text,'sha256'),'hex'),
     'revision',l->'material_revision','previous_id',le.id,'action',le.action,'current',public.operator_review_current_internal(input_restaurant_id,'LEGAL',statement_timestamp())));
end $f$;
revoke all on function public.get_platform_operator_review(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_platform_operator_review(uuid) to authenticated;

create function public.decide_platform_operator_review(
 input_restaurant_id uuid,input_organization_id uuid,input_branch_id uuid,
 input_kind text,input_action text,input_expected_hash text,input_previous_id uuid,
 input_reference text,input_document_expiries jsonb,input_confirmed boolean,
 input_confirmation text,input_request_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare r public.restaurants%rowtype; c public.business_verification_cases%rowtype;
 previous public.platform_operator_review_events%rowtype; prior public.platform_operator_review_events%rowtype;
 s jsonb; payload_value jsonb; result_value jsonb; profile jsonb; profile_id uuid;
 legal_prior public.legal_operator_publication_decisions%rowtype;
 event_id uuid:=extensions.gen_random_uuid(); legal_id uuid; expires record; totp_at timestamptz;
begin
 perform public.require_legal_bundle_admin_internal();
 if input_request_id is null or input_kind is null or input_kind not in ('KYB','LEGAL')
   or input_action is null or input_action not in ('FIRST_REVIEW','APPROVE','REVOKE')
   or (input_kind='LEGAL' and input_action='FIRST_REVIEW')
   or coalesce(input_reference,'') !~ '^[A-Z0-9][A-Z0-9_-]{2,79}$'
   or coalesce(input_expected_hash,'') !~ '^[0-9a-f]{64}$'
   or input_confirmed is distinct from true or jsonb_typeof(input_document_expiries) is distinct from 'object' then
   raise exception 'OPERATOR_REVIEW_REQUEST_INVALID' using errcode='22023'; end if;
 payload_value:=jsonb_build_object('restaurant',input_restaurant_id,'organization',input_organization_id,
   'branch',input_branch_id,'kind',input_kind,'action',input_action,'hash',input_expected_hash,
   'previous',input_previous_id,'reference',input_reference,'document_expiries',input_document_expiries,
   'confirmation',input_confirmation);
 perform pg_advisory_xact_lock(hashtextextended('operator-review-request:'||input_request_id::text,0));
 select * into prior from public.platform_operator_review_events where request_id=input_request_id;
 if prior.id is not null then
   if prior.actor_id is distinct from auth.uid() or prior.payload is distinct from payload_value then
     raise exception 'OPERATOR_REVIEW_REPLAY_CONFLICT' using errcode='22023'; end if;
   return prior.result||jsonb_build_object('idempotent',true,'historical_receipt',true);
 end if;
 -- Match Owner intake's restaurant-first order. NOWAIT is deliberate: manual
 -- reviews fail without effects under conflicting source mutations rather
 -- than waiting in an inverted lock graph. Retry uses the same request ID.
 select * into r from public.restaurants where id=input_restaurant_id for update nowait;
 lock table public.organizations,public.restaurant_members,public.organization_legal_profiles,
   public.business_verification_documents,public.platform_admins,
   public.legal_master_templates,public.platform_at_legal_template_evidence,
   public.platform_at_legal_policy_artifact_versions,public.platform_at_legal_policy_evidence,
   public.country_kyb_intake_policies,public.legal_bundle_policy_revisions in share mode nowait;
 perform public.require_legal_bundle_admin_internal();
 select max(to_timestamp((m->>'timestamp')::double precision)) into totp_at
   from jsonb_array_elements(auth.jwt()->'amr') m where m->>'method'='totp';
 perform 1 from public.branches where id=r.primary_branch_id for update nowait;
 select * into c from public.business_verification_cases where restaurant_id=r.id for update nowait;
 if r.id is null or r.organization_id is distinct from input_organization_id
   or r.primary_branch_id is distinct from input_branch_id or c.id is null
   or input_confirmation is distinct from input_kind||' '||input_action||' '||r.name then
   raise exception 'OPERATOR_REVIEW_BINDING_INVALID' using errcode='42501'; end if;
 s:=public.operator_review_snapshot_internal(r.id,input_kind);
 if s is null or encode(extensions.digest(s::text,'sha256'),'hex') is distinct from input_expected_hash then
   raise exception 'OPERATOR_REVIEW_STALE' using errcode='40001'; end if;
 if s->>'material_revision' is null then raise exception 'OPERATOR_REVIEW_REVISION_REQUIRED' using errcode='42501'; end if;
 select * into previous from public.platform_operator_review_events where restaurant_id=r.id
   and kind=input_kind order by sequence desc limit 1;
 if previous.id is distinct from input_previous_id then raise exception 'OPERATOR_REVIEW_STALE' using errcode='40001'; end if;
 if input_kind='KYB' then
   if input_action='REVOKE' then
     if previous.action is distinct from 'APPROVE' then raise exception 'OPERATOR_REVIEW_TRANSITION_INVALID'; end if;
     update public.business_verification_cases set status='SUSPENDED',expires_at=null,updated_at=clock_timestamp() where id=c.id;
   else
     if c.status not in ('IN_REVIEW','VERIFIED','SUSPENDED') or c.test_only
       or jsonb_array_length(s->'documents')=0 then raise exception 'OPERATOR_REVIEW_EVIDENCE_REQUIRED' using errcode='42501'; end if;
     for expires in select * from jsonb_each_text(input_document_expiries) loop
       if not exists(select 1 from jsonb_array_elements(s->'documents') d where d->>'id'=expires.key)
         or (expires.value is not null and (not isfinite(expires.value::timestamptz)
           or expires.value::timestamptz<=statement_timestamp())) then
         raise exception 'OPERATOR_REVIEW_DOCUMENT_EXPIRED' using errcode='42501'; end if;
     end loop;
     if (select count(*) from jsonb_object_keys(input_document_expiries))<>jsonb_array_length(s->'documents') then
       raise exception 'OPERATOR_REVIEW_DOCUMENT_REFERENCE_REQUIRED' using errcode='42501'; end if;
     if input_action='APPROVE' then
       if previous.action is distinct from 'FIRST_REVIEW' or previous.actor_id=auth.uid()
         or previous.material_revision is distinct from (s->>'material_revision')::bigint
         or previous.snapshot is distinct from s
         or not exists(select 1 from public.platform_admins a where a.user_id=previous.actor_id
           and a.active and a.role in ('platform_admin','platform_owner'))
         or previous.payload->'document_expiries' is distinct from input_document_expiries then
         raise exception 'OPERATOR_REVIEW_SECOND_PERSON_REQUIRED' using errcode='42501'; end if;
       profile:=s->'operator';
       insert into public.business_verified_profile_revisions(case_id,revision,legal_name,legal_form,
         register_identifier,vat_id,business_street,business_postal_code,business_city,business_country,
         authorized_representative,status,decision_ref,created_by)
       select c.id,coalesce(max(revision),0)+1,profile->>'legal_name',profile->>'legal_form',
         profile->>'register_identifier',profile->>'vat_id',profile->>'business_street',
         profile->>'business_postal_code',profile->>'business_city',profile->>'business_country',
         profile->>'authorized_representative','VERIFIED',event_id,auth.uid()
       from public.business_verified_profile_revisions where case_id=c.id returning id into profile_id;
       update public.business_verification_cases set status='VERIFIED',decided_at=clock_timestamp(),
         expires_at=null,updated_at=clock_timestamp() where id=c.id;
     elsif previous.action='FIRST_REVIEW' and previous.snapshot=s then
       raise exception 'OPERATOR_REVIEW_SECOND_PERSON_REQUIRED' using errcode='42501';
     end if;
   end if;
 else
   select * into legal_prior from public.legal_operator_publication_decisions where restaurant_id=r.id
     order by created_at desc,id desc limit 1;
   if input_action='APPROVE' then
     if not public.operator_review_current_internal(r.id,'KYB',statement_timestamp())
       or c.status<>'VERIFIED'
       or not public.operator_review_legal_sources_current_internal(s) then
       raise exception 'OPERATOR_REVIEW_LEGAL_REFERENCES_REQUIRED' using errcode='42501'; end if;
     select id into profile_id from public.business_verified_profile_revisions where case_id=c.id
       and status='VERIFIED' order by revision desc limit 1;
   else
     if legal_prior.action is distinct from 'APPROVED' then raise exception 'OPERATOR_REVIEW_TRANSITION_INVALID'; end if;
     profile_id:=legal_prior.profile_revision_id;
   end if;
   select max(to_timestamp((m->>'timestamp')::double precision)) into totp_at
     from jsonb_array_elements(auth.jwt()->'amr') m where m->>'method'='totp';
   if totp_at is null or totp_at>clock_timestamp()
     or totp_at<clock_timestamp()-interval '5 minutes' then raise exception 'RECENT_PLATFORM_TOTP_REQUIRED' using errcode='42501'; end if;
   insert into public.legal_operator_publication_decisions(restaurant_id,case_id,profile_revision_id,
     action,supersedes_decision_id,field_mapping_version,reason_code,redacted_reason,actor_id,
     aal2_verified_at,session_expires_at,auth_session_sha256,request_id,correlation_id)
   values(r.id,c.id,profile_id,case input_action when 'APPROVE' then 'APPROVED' else 'REVOKED' end,
     case when input_action='REVOKE' then legal_prior.id else null end,'AT_V1_LEGAL_OPERATOR_V1',
     'EXTERNAL_REVIEW_REFERENCE','External approval reference: '||input_reference,auth.uid(),totp_at,
     to_timestamp((auth.jwt()->>'exp')::double precision),
     encode(extensions.digest(auth.jwt()->>'session_id','sha256'),'hex'),input_request_id,event_id)
   returning id into legal_id;
 end if;
 result_value:=jsonb_build_object('receipt_id',event_id,'kind',input_kind,'action',input_action,
   'restaurant_id',r.id,'organization_id',r.organization_id,'branch_id',r.primary_branch_id,
   'material_revision',s->'material_revision',
   'profile_revision_id',profile_id,'legal_decision_id',legal_id,'idempotent',false);
 insert into public.platform_operator_review_events(id,restaurant_id,organization_id,branch_id,material_revision,kind,
   action,actor_id,auth_evidence,request_id,previous_id,snapshot,snapshot_sha256,payload,result)
 values(event_id,r.id,r.organization_id,r.primary_branch_id,(s->>'material_revision')::bigint,input_kind,input_action,auth.uid(),
   jsonb_build_object('aal','aal2','totp_at',totp_at,'role',public.current_platform_role(),
     'session_sha256',encode(extensions.digest(auth.jwt()->>'session_id','sha256'),'hex')),
   input_request_id,previous.id,s,input_expected_hash,payload_value,result_value);
 return result_value;
end $f$;
revoke all on function public.decide_platform_operator_review(uuid,uuid,uuid,text,text,text,uuid,text,jsonb,boolean,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.decide_platform_operator_review(uuid,uuid,uuid,text,text,text,uuid,text,jsonb,boolean,text,uuid) to authenticated;

create function public.publish_reviewed_operator_change(
 input_restaurant_id uuid,input_organization_id uuid,input_branch_id uuid,input_draft_id uuid,
 input_review_id uuid,input_expected_hash text,input_confirmed boolean,
 input_confirmation text,input_request_id uuid
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $f$
declare r public.restaurants%rowtype; b public.branches%rowtype;
 op public.organization_legal_profiles%rowtype; draft public.operator_owner_change_drafts%rowtype;
 review public.platform_operator_review_events%rowtype; prior public.operator_publication_events%rowtype;
 snapshot jsonb; result_value jsonb; latest_revision bigint; payload_value jsonb;
begin
 perform public.require_legal_bundle_admin_internal();
 if input_request_id is null or input_draft_id is null or input_review_id is null
   or input_confirmed is distinct from true
   or coalesce(input_expected_hash,'') !~ '^[0-9a-f]{64}$' then
   raise exception 'OPERATOR_PUBLICATION_REQUEST_INVALID' using errcode='22023'; end if;
 payload_value:=jsonb_build_object('restaurant',input_restaurant_id,
   'organization',input_organization_id,'branch',input_branch_id,
   'draft',input_draft_id,'review',input_review_id,'hash',input_expected_hash,
   'confirmation',input_confirmation);
 perform pg_advisory_xact_lock(hashtextextended('operator-publication-request:'||input_request_id::text,0));
 select * into prior from public.operator_publication_events where request_id=input_request_id;
 if prior.id is not null then
   if prior.actor_id is distinct from auth.uid() or prior.result->'request' is distinct from payload_value then
     raise exception 'OPERATOR_PUBLICATION_REPLAY_CONFLICT' using errcode='22023'; end if;
   return prior.result||jsonb_build_object('idempotent',true,'historical_receipt',true);
 end if;
 select * into r from public.restaurants where id=input_restaurant_id for update nowait;
 select * into b from public.branches where id=input_branch_id for update nowait;
 select * into op from public.organization_legal_profiles
   where organization_id=input_organization_id for update nowait;
 select * into draft from public.operator_owner_change_drafts where id=input_draft_id;
 select * into review from public.platform_operator_review_events where id=input_review_id;
 select max(revision) into latest_revision from public.operator_material_revisions where restaurant_id=r.id;
 if r.id is null or r.status<>'active'
   or r.organization_id is distinct from input_organization_id
   or r.primary_branch_id is distinct from input_branch_id
   or b.restaurant_id is distinct from r.id or b.organization_id is distinct from r.organization_id
   or op.id is null or draft.restaurant_id is distinct from r.id
   or draft.organization_id is distinct from r.organization_id
   or draft.branch_id is distinct from b.id or draft.owner_id is distinct from r.owner_id
   or review.restaurant_id is distinct from r.id or review.organization_id is distinct from r.organization_id
   or review.branch_id is distinct from b.id or review.kind is distinct from 'KYB'
   or review.action is distinct from 'APPROVE'
   or review.material_revision is distinct from latest_revision
   or not exists(select 1 from public.operator_material_revisions rev
     where rev.restaurant_id=r.id and rev.revision=latest_revision
       and rev.source_table='operator_owner_change_drafts' and rev.source_id=draft.id)
   or input_confirmation is distinct from 'PUBLISH KYB '||r.name then
   raise exception 'OPERATOR_PUBLICATION_BINDING_INVALID' using errcode='42501'; end if;
 if exists(select 1 from public.operator_publication_events published
   where published.draft_id=draft.id) then
   raise exception 'OPERATOR_ALREADY_PUBLISHED' using errcode='42501'; end if;
 snapshot:=public.operator_review_snapshot_internal(r.id,'KYB');
 if snapshot is distinct from review.snapshot
   or encode(extensions.digest(snapshot::text,'sha256'),'hex') is distinct from input_expected_hash
   or review.snapshot_sha256 is distinct from input_expected_hash
   or snapshot->'owner_draft'->>'id' is distinct from draft.id::text
   or not public.operator_review_current_internal(r.id,'KYB',statement_timestamp()) then
   raise exception 'OPERATOR_PUBLICATION_STALE' using errcode='40001'; end if;
 -- Row locks and the unforgeable private permit make the guarded live writes
 -- and their audit receipt one database transaction. No trial/status writes.
 b.address:=draft.branch_address->>'address';
 b.postal_code:=draft.branch_address->>'postal_code';
 b.city:=draft.branch_address->>'city';
 b.country:=draft.branch_address->>'country';
 op.company_name:=draft.profile->>'legal_name';
 op.legal_form:=draft.profile->>'legal_form';
 op.commercial_register_number:=draft.profile->>'register_identifier';
 op.commercial_register_court:=draft.profile->>'register_court';
 op.vat_id:=draft.profile->>'vat_id';
 op.responsible_person:=draft.profile->>'authorized_representative';
 op.gisa_number:=draft.profile->>'gisa_number';
 op.owner_is_authorized_representative:=(draft.profile->>'owner_is_authorized_representative')::boolean;
 op.authorized_representative_role:=draft.profile->>'authorized_representative_role';
 op.commercial_register_applicable:=(draft.profile->>'commercial_register_applicable')::boolean;
 op.registered_address_source:=draft.profile->>'registered_address_source';
 if op.registered_address_source='restaurant' then
   op.address_source_restaurant_id:=r.id; op.address_source_branch_id:=b.id;
   op.street:=null; op.postal_code:=null; op.city:=null; op.country:=null;
 else
   op.address_source_restaurant_id:=null; op.address_source_branch_id:=null;
   op.street:=draft.profile->>'business_street';
   op.postal_code:=draft.profile->>'business_postal_code';
   op.city:=draft.profile->>'business_city';
   op.country:=draft.profile->>'business_country';
 end if;
 op.legal_review_status:='required';
 insert into public.operator_publication_permits(transaction_id,restaurant_id,
   organization_id,branch_id,actor_id,profile,branch_address)
 values(txid_current(),r.id,r.organization_id,b.id,auth.uid(),
   to_jsonb(op)-array['updated_at','updated_by'],
   to_jsonb(b)-array['updated_at','updated_by']);
 update public.branches set address=b.address,postal_code=b.postal_code,city=b.city,country=b.country
   where id=b.id;
 update public.organization_legal_profiles set company_name=op.company_name,legal_form=op.legal_form,
   commercial_register_number=op.commercial_register_number,
   commercial_register_court=op.commercial_register_court,vat_id=op.vat_id,
   responsible_person=op.responsible_person,gisa_number=op.gisa_number,
   owner_is_authorized_representative=op.owner_is_authorized_representative,
   authorized_representative_role=op.authorized_representative_role,
   commercial_register_applicable=op.commercial_register_applicable,
   registered_address_source=op.registered_address_source,
   address_source_restaurant_id=op.address_source_restaurant_id,
   address_source_branch_id=op.address_source_branch_id,
   street=op.street,postal_code=op.postal_code,city=op.city,country=op.country,
   legal_review_status='required',updated_at=clock_timestamp(),updated_by=auth.uid()
   where id=op.id;
 delete from public.operator_publication_permits
   where transaction_id=txid_current() and restaurant_id=r.id;
 -- The compatibility projection is not an independent source of authority.
 update public.restaurant_legal_profiles set company_name=op.company_name,
   legal_form=op.legal_form,registered_address_source=op.registered_address_source,
   address_source_restaurant_id=op.address_source_restaurant_id,
   street=draft.profile->>'business_street',
   postal_code=draft.profile->>'business_postal_code',
   city=draft.profile->>'business_city',country=draft.profile->>'business_country',
   commercial_register_number=coalesce(op.commercial_register_number,''),
   commercial_register_court=coalesce(op.commercial_register_court,''),
   vat_id=coalesce(op.vat_id,''),responsible_person=op.responsible_person,
   restaurant_operator=op.company_name,legal_review_status='required',
   updated_at=clock_timestamp(),updated_by=auth.uid()
   where restaurant_id=r.id and operator_profile_id=op.id;
 if not found then raise exception 'OPERATOR_PUBLICATION_PROJECTION_MISSING' using errcode='42501'; end if;
 if not public.operator_review_current_internal(r.id,'KYB',statement_timestamp()) then
   raise exception 'OPERATOR_PUBLICATION_POSTCHECK_FAILED' using errcode='40001'; end if;
 result_value:=jsonb_build_object('receipt_id',extensions.gen_random_uuid(),
   'restaurant_id',r.id,'organization_id',r.organization_id,'branch_id',b.id,
   'draft_id',draft.id,'kyb_review_id',review.id,'material_revision',latest_revision,
   'published',true,'idempotent',false,'request',payload_value,
   'published_live_sha256',public.operator_live_material_sha256_internal(r.id));
 insert into public.operator_publication_events(id,restaurant_id,organization_id,branch_id,
   draft_id,kyb_review_id,material_revision,actor_id,request_id,expected_snapshot_sha256,
   published_live_sha256,result)
 values((result_value->>'receipt_id')::uuid,r.id,r.organization_id,b.id,draft.id,review.id,
   latest_revision,auth.uid(),input_request_id,input_expected_hash,
   result_value->>'published_live_sha256',result_value);
 return result_value;
end $f$;
revoke all on function public.publish_reviewed_operator_change(uuid,uuid,uuid,uuid,uuid,text,boolean,text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.publish_reviewed_operator_change(uuid,uuid,uuid,uuid,uuid,text,boolean,text,uuid)
 to authenticated;

-- Legacy dated verifications retain their dates. New no-expiry verifications
-- are usable only through the current two-person receipt checked below.
alter table public.business_verification_cases drop constraint business_verification_cases_check;
alter table public.business_verification_cases add constraint business_verification_decision_timestamp
 check(status<>'VERIFIED' or (decided_at is not null
   and (expires_at is null or expires_at>decided_at)));

create or replace function public.resolve_business_verification_readiness_internal(
  input_restaurant_id uuid,input_environment text,input_as_of timestamptz default statement_timestamp()
) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
declare
  case_row public.business_verification_cases%rowtype;
  latest_test public.business_verification_test_receipts%rowtype;
  marker public.platform_test_tenant_registry%rowtype;
  restaurant_row public.restaurants%rowtype;
  branch_country text;
  runtime_environment text;
  real_ready boolean:=false;
  test_ready boolean:=false;
  status_value text:='PENDING_ACTIVATION';
  reason_value text:='BUSINESS_VERIFICATION_PENDING';
begin
  if input_restaurant_id is null or input_environment not in ('TEST','LIVE')
    or input_environment is null or input_as_of is null or not isfinite(input_as_of) then
    return jsonb_build_object('status','UNAVAILABLE','real_verified',false,
      'staging_test_verified',false,'checkout_allowed',false,'live_activation_allowed',false,
      'block_code','BUSINESS_VERIFICATION_CONTEXT_INVALID');
  end if;
  select * into restaurant_row from public.restaurants where id=input_restaurant_id;
  if restaurant_row.id is null then
    return jsonb_build_object('status','UNAVAILABLE','real_verified',false,
      'staging_test_verified',false,'checkout_allowed',false,'live_activation_allowed',false,
      'block_code','BUSINESS_VERIFICATION_NOT_FOUND');
  end if;
  select * into case_row from public.business_verification_cases where restaurant_id=input_restaurant_id;
  select upper(trim(country)) into branch_country from public.branches
    where id=restaurant_row.primary_branch_id and restaurant_id=restaurant_row.id
      and organization_id=restaurant_row.organization_id;
  select environment into runtime_environment from public.business_verification_environment where singleton;
  if case_row.id is not null then
    status_value:=case_row.status;
    if case_row.country_code=branch_country and case_row.status='VERIFIED' and case_row.decided_at<=input_as_of
      and (case_row.expires_at>input_as_of or (case_row.expires_at is null
        and public.operator_review_current_internal(input_restaurant_id,'KYB',input_as_of))
        or public.operator_legacy_live_during_draft_internal(input_restaurant_id,input_as_of)
        or public.operator_published_live_during_draft_internal(input_restaurant_id,input_as_of))
      and (public.operator_review_current_internal(input_restaurant_id,'KYB',input_as_of)
        or public.operator_legacy_upgrade_current_internal(input_restaurant_id,input_as_of)
        or public.operator_legacy_live_during_draft_internal(input_restaurant_id,input_as_of)
        or public.operator_published_live_during_draft_internal(input_restaurant_id,input_as_of))
      and case_row.test_only=false
      and exists(select 1 from public.business_verified_profile_revisions p
        where p.case_id=case_row.id and p.status='VERIFIED'
          and p.business_country=case_row.country_code and p.effective_from<=input_as_of) then
      real_ready:=true;
    end if;
  end if;
  if input_environment='TEST' and runtime_environment='STAGING' and case_row.id is not null
    and case_row.country_code=branch_country
    and case_row.test_only=true then
    select * into marker from public.platform_test_tenant_registry
      where restaurant_id=input_restaurant_id and deleted_at is null;
    select * into latest_test from public.business_verification_test_receipts
      where restaurant_id=input_restaurant_id order by effective_at desc,id desc limit 1;
    test_ready:=marker.restaurant_id is not null
      and marker.organization_id=restaurant_row.organization_id
      and marker.owner_user_id=restaurant_row.owner_id
      and marker.restaurant_name=restaurant_row.name
      and latest_test.action='GRANTED' and latest_test.effective_at<=input_as_of
      and latest_test.expires_at>input_as_of;
  end if;
  if status_value='VERIFIED' and not real_ready then status_value:='REVIEW_REQUIRED'; end if;
  if real_ready then reason_value:='BUSINESS_VERIFICATION_READY';
  elsif test_ready then reason_value:='STAGING_TEST_VERIFIED';
  elsif status_value='SUSPENDED' then reason_value:='BUSINESS_VERIFICATION_SUSPENDED';
  elsif status_value='REJECTED' then reason_value:='BUSINESS_VERIFICATION_REJECTED';
  elsif latest_test.action='GRANTED' and latest_test.expires_at<=input_as_of then
    reason_value:='STAGING_TEST_EXPIRED';
  end if;
  return jsonb_build_object('status',status_value,'country_code',case_row.country_code,
    'verification_method',case_row.verification_method,'real_verified',real_ready,
    'staging_test_verified',test_ready,'valid_until',case when test_ready then latest_test.expires_at
      when real_ready then case_row.expires_at else null end,
    'checkout_allowed',false,'live_activation_allowed',false,'block_code',reason_value);
end $function$;

create or replace function public.legal_operator_publication_ready_internal(
  input_restaurant_id uuid,
  input_as_of timestamptz default statement_timestamp()
) returns boolean language sql stable security definer
set search_path=pg_catalog,public,pg_temp as $function$
  with latest_decision as (
    select d.*
    from public.legal_operator_publication_decisions d
    where d.restaurant_id=input_restaurant_id
    order by d.created_at desc,d.id desc
    limit 1
  )
  select coalesce(bool_and(
    d.action='APPROVED'
    and d.field_mapping_version='AT_V1_LEGAL_OPERATOR_V1'
    and exists(select 1 from public.platform_admins pa where pa.user_id=d.actor_id
      and pa.active and pa.role in ('platform_owner','platform_admin'))
    and d.aal2_verified_at<=d.created_at and d.aal2_verified_at>=d.created_at-interval '5 minutes'
    and d.session_expires_at>d.created_at
    and c.status='VERIFIED' and c.test_only=false
    and c.decided_at<=input_as_of
    and (c.expires_at>input_as_of or (c.expires_at is null
      and public.operator_review_current_internal(input_restaurant_id,'KYB',input_as_of))
      or public.operator_legacy_live_during_draft_internal(input_restaurant_id,input_as_of)
      or public.operator_published_live_during_draft_internal(input_restaurant_id,input_as_of))
    and (public.operator_review_current_internal(input_restaurant_id,'KYB',input_as_of)
      or public.operator_legacy_upgrade_current_internal(input_restaurant_id,input_as_of)
      or public.operator_legacy_live_during_draft_internal(input_restaurant_id,input_as_of)
      or public.operator_published_live_during_draft_internal(input_restaurant_id,input_as_of))
    and (public.operator_review_current_internal(input_restaurant_id,'LEGAL',input_as_of)
      or public.operator_legacy_upgrade_current_internal(input_restaurant_id,input_as_of)
      or public.operator_legacy_live_during_draft_internal(input_restaurant_id,input_as_of))
    and rev.status='VERIFIED' and rev.effective_from<=input_as_of
    and policy.real_intake_status='READY'
    and policy.legal_status='VERIFIED'
    and policy.privacy_status='VERIFIED'
    and policy.document_catalog_status='VERIFIED'
    and policy.retention_status='VERIFIED'
    and trim(rev.legal_name)=trim(op.company_name)
    and trim(rev.legal_form)=trim(op.legal_form)
    and rev.register_identifier is not distinct from nullif(trim(op.commercial_register_number),'')
    and rev.vat_id is not distinct from nullif(trim(op.vat_id),'')
    and trim(rev.business_street)=trim(case when op.registered_address_source='restaurant' then b.address else op.street end)
    and trim(rev.business_postal_code)=trim(case when op.registered_address_source='restaurant' then b.postal_code else op.postal_code end)
    and trim(rev.business_city)=trim(case when op.registered_address_source='restaurant' then b.city else op.city end)
    and rev.business_country=case
      when lower(trim(case when op.registered_address_source='restaurant' then b.country else op.country end))
        in ('at','austria','osterreich','oesterreich','österreich') then 'AT'
      else upper(trim(case when op.registered_address_source='restaurant' then b.country else op.country end)) end
    and rev.authorized_representative is not distinct from nullif(trim(op.responsible_person),'')
  ),false)
  from latest_decision d
  join public.business_verification_cases c on c.id=d.case_id and c.restaurant_id=d.restaurant_id
  join public.business_verified_profile_revisions rev on rev.id=d.profile_revision_id and rev.case_id=c.id
  join public.restaurants r on r.id=d.restaurant_id
  join public.organization_legal_profiles op on op.organization_id=r.organization_id
  join public.branches b on b.id=r.primary_branch_id and b.restaurant_id=r.id and b.organization_id=r.organization_id
  join public.country_kyb_intake_policies policy on policy.country_code=c.country_code;
$function$;

revoke all on function public.resolve_business_verification_readiness_internal(uuid,text,timestamptz),
 public.legal_operator_publication_ready_internal(uuid,timestamptz)
 from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
commit;
