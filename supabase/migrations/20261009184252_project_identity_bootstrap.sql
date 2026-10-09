-- Administrative bootstrap only. No STAGING marker or product gate is opened.
begin;
create schema project_bootstrap;
revoke all on schema project_bootstrap from public,anon,authenticated,service_role;

create table project_bootstrap.database_anchor (
  singleton boolean primary key default true check(singleton),
  anchor uuid not null default extensions.gen_random_uuid()
);
insert into project_bootstrap.database_anchor(singleton) values(true);

create table project_bootstrap.binding (
  singleton boolean primary key default true check(singleton),
  binding_id uuid not null unique default extensions.gen_random_uuid(),
  project_ref text not null check(project_ref ~ '^[a-z]{20}$'),
  backend_url text not null,
  auth_issuer text not null,
  app_origin text not null check(app_origin ~ '^https://[a-z0-9.-]+$'),
  database_anchor uuid not null,
  database_system_id text not null,
  database_name text not null,
  hosting_account_id text not null,
  worker_name text not null,
  request_id uuid not null unique,
  operator_ref text not null,
  installed_at timestamptz not null default clock_timestamp(),
  check(backend_url='https://'||project_ref||'.supabase.co'),
  check(auth_issuer=backend_url||'/auth/v1'),
  check(project_ref not in ('bwhvfjuwixgwduoeqaya','fuqhljgesclipzduhykl')),
  check(app_origin not in ('https://app.bonus.wuxuaisbi.com','https://staging-app.bonus.wuxuaisbi.com'))
);
create table project_bootstrap.installation_audit (
  binding_id uuid primary key references project_bootstrap.binding(binding_id),
  request_id uuid not null unique,
  operator_ref text not null,
  session_actor name not null,
  evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default clock_timestamp()
);
alter table project_bootstrap.database_anchor enable row level security;
alter table project_bootstrap.binding enable row level security;
alter table project_bootstrap.installation_audit enable row level security;
revoke all on all tables in schema project_bootstrap from public,anon,authenticated,service_role;

create function project_bootstrap.immutable() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'PROJECT_BINDING_IMMUTABLE' using errcode='42501'; end $$;
revoke all on function project_bootstrap.immutable() from public,anon,authenticated,service_role;
create trigger immutable_anchor before update or delete or truncate on project_bootstrap.database_anchor
for each statement execute function project_bootstrap.immutable();
create trigger immutable_binding before update or delete or truncate on project_bootstrap.binding
for each statement execute function project_bootstrap.immutable();
create trigger immutable_audit before update or delete or truncate on project_bootstrap.installation_audit
for each statement execute function project_bootstrap.immutable();

-- Non-secret fingerprint. A service credential proves REST access to this DB;
-- the administrator must compare it with the independent TLS SQL connection.
create function public.get_project_bootstrap_anchor() returns jsonb
language sql stable security definer set search_path=pg_catalog,project_bootstrap
as $$ select jsonb_build_object('anchor',a.anchor,'system_id',c.system_identifier::text,
  'database_name',current_database()) from project_bootstrap.database_anchor a,
  pg_catalog.pg_control_system() c where a.singleton $$;
revoke all on function public.get_project_bootstrap_anchor() from public,anon,authenticated;
grant execute on function public.get_project_bootstrap_anchor() to service_role;

-- Not exposed by PostgREST; SECURITY INVOKER + session_user guards prevent
-- a SECURITY DEFINER wrapper or SET ROLE from becoming a provisioning path.
create function project_bootstrap.install(input_binding jsonb,input_evidence_sha256 text)
returns jsonb language plpgsql volatile security invoker
set search_path=pg_catalog,project_bootstrap,public as $$
declare old project_bootstrap.binding%rowtype; actual jsonb; created uuid;
begin
  if session_user<>'postgres' or current_user<>'postgres' then
    raise exception 'PROJECT_BOOTSTRAP_ADMIN_CONNECTION_REQUIRED' using errcode='42501';
  end if;
  if input_binding is null or jsonb_typeof(input_binding)<>'object'
    or (select count(*) from jsonb_object_keys(input_binding))<>12
    or not input_binding ?& array['project_ref','backend_url','auth_issuer','app_origin',
      'database_anchor','database_system_id','database_name','hosting_account_id','worker_name',
      'request_id','operator_ref','environment']
    or input_binding->>'environment' is distinct from 'STAGING'
    or input_evidence_sha256 is null or input_evidence_sha256 !~ '^[a-f0-9]{64}$'
    or coalesce(input_binding->>'operator_ref','') !~ '^[A-Za-z0-9_.:-]{3,100}$'
    or coalesce(input_binding->>'hosting_account_id','') !~ '^[a-f0-9]{32}$'
    or coalesce(input_binding->>'worker_name','') !~ '^[a-z0-9][a-z0-9-]{2,62}$' then
    raise exception 'PROJECT_BINDING_INVALID' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('project-bootstrap-install',0));
  actual:=public.get_project_bootstrap_anchor();
  if actual->>'anchor' is distinct from input_binding->>'database_anchor'
    or actual->>'system_id' is distinct from input_binding->>'database_system_id'
    or actual->>'database_name' is distinct from input_binding->>'database_name' then
    raise exception 'PROJECT_DATABASE_MISMATCH' using errcode='42501';
  end if;
  select * into old from project_bootstrap.binding where singleton for update;
  if old.binding_id is not null then
    if (to_jsonb(old)-array['singleton','binding_id','installed_at'])
      is distinct from (input_binding-'environment') then
      raise exception 'PROJECT_BINDING_CONFLICT' using errcode='23505';
    end if;
    return jsonb_build_object('binding_id',old.binding_id,'installed',false,'replay',true);
  end if;
  insert into project_bootstrap.binding(project_ref,backend_url,auth_issuer,app_origin,
    database_anchor,database_system_id,database_name,hosting_account_id,worker_name,request_id,operator_ref)
  values(input_binding->>'project_ref',input_binding->>'backend_url',input_binding->>'auth_issuer',
    input_binding->>'app_origin',(input_binding->>'database_anchor')::uuid,
    input_binding->>'database_system_id',input_binding->>'database_name',input_binding->>'hosting_account_id',
    input_binding->>'worker_name',(input_binding->>'request_id')::uuid,input_binding->>'operator_ref')
  returning binding_id into created;
  insert into project_bootstrap.installation_audit(binding_id,request_id,operator_ref,session_actor,evidence_sha256)
  values(created,(input_binding->>'request_id')::uuid,input_binding->>'operator_ref',session_user,input_evidence_sha256);
  return jsonb_build_object('binding_id',created,'installed',true,'replay',false);
end $$;
revoke all on function project_bootstrap.install(jsonb,text) from public,anon,authenticated,service_role;

-- A consumer must still compare its actual backend/origin with this snapshot.
-- This does not replace any existing TEST_ONLY, membership, legal or AAL2 gate.
create function public.get_server_project_binding() returns jsonb
language sql stable security definer set search_path=pg_catalog,project_bootstrap
as $$ select to_jsonb(b)-array['singleton','operator_ref','request_id']
  from project_bootstrap.binding b,project_bootstrap.database_anchor a,pg_catalog.pg_control_system() c
  where b.singleton and a.singleton and b.database_anchor=a.anchor
    and b.database_name=current_database() and b.database_system_id=c.system_identifier::text $$;
revoke all on function public.get_server_project_binding() from public,anon,authenticated;
grant execute on function public.get_server_project_binding() to service_role;

-- Deliberately returns no project details. Uses verified gateway claims and
-- a live DB session, not an issuer supplied as a function argument.
create function public.project_binding_session_matches() returns boolean
language sql stable security definer set search_path=pg_catalog,public,auth
as $$ select coalesce(auth.role()='authenticated' and auth.uid() is not null
  and (public.get_server_project_binding()->>'auth_issuer')=auth.jwt()->>'iss'
  and exists(select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id'
    and s.user_id=auth.uid() and (s.not_after is null or s.not_after>statement_timestamp())),false) $$;
revoke all on function public.project_binding_session_matches() from public,anon,authenticated,service_role;
grant execute on function public.project_binding_session_matches() to authenticated;
notify pgrst,'reload schema';
commit;
