-- Additive runtime binding. Historical migrations and bootstrap bytes stay intact.
begin;
create function project_bootstrap.require_runtime_binding(require_user boolean)
returns void language plpgsql stable security definer
set search_path=pg_catalog,public,project_bootstrap as $$
begin
  if public.get_server_project_binding() is null
    or (require_user and not public.project_binding_session_matches()) then
    raise exception 'PROJECT_BINDING_REQUIRED' using errcode='42501';
  end if;
end $$;
revoke all on function project_bootstrap.require_runtime_binding(boolean)
  from public,anon,authenticated,service_role;

-- Replace only the old issuer predicate in exactly these four existing bodies.
-- CREATE OR REPLACE retains OID, owner, ACL, signature and all remaining guards.
-- Abort the entire migration if an expected predecessor is not present.
do $migration$
declare spec record; target regprocedure; definition text; old_source text;
  before_owner oid; before_acl aclitem[]; needle text; replacement text;
begin
  for spec in select * from (values
    ('public.platform_test_join_permit_active_internal(uuid)',true),
    ('public.require_platform_test_only_join_scope_internal(uuid,uuid,text,text)',false),
    ('public.get_customer_test_only_join_status(text,uuid)',false),
    ('public.require_active_operator_test_legal_customer_internal(uuid,uuid)',false)
  ) as targets(signature,positive) loop
    target:=spec.signature::regprocedure;
    select prosrc,proowner,proacl into old_source,before_owner,before_acl from pg_proc where oid=target;
    needle:=case when spec.positive then
      'auth.jwt()->>''iss''=''https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1'''
      else 'auth.jwt()->>''iss'' is distinct from ''https://bwhvfjuwixgwduoeqaya.supabase.co/auth/v1''' end;
    replacement:=case when spec.positive then 'public.project_binding_session_matches()'
      else 'not public.project_binding_session_matches()' end;
    if (length(old_source)-length(replace(old_source,needle,'')))<>length(needle) then
      raise exception 'PROJECT_BINDING_PREDECESSOR_MISMATCH: %',spec.signature;
    end if;
    definition:=pg_get_functiondef(target);
    execute replace(definition,needle,replacement);
    if exists(select 1 from pg_proc where oid=target and
      (prosrc is distinct from replace(old_source,needle,replacement)
       or proowner<>before_owner or proacl is distinct from before_acl)) then
      raise exception 'PROJECT_BINDING_FUNCTION_PARITY_FAILED';
    end if;
  end loop;

  -- Protect direct RPC entry as well as the Edge entry. No business logic,
  -- claims, roles, billing/activation state or table rights are changed.
  for spec in select * from (values
    ('public.prepare_basic_test_checkout(uuid,uuid,text)',true),
    ('public.complete_basic_test_checkout(uuid,text)',false),
    ('public.record_basic_stripe_test_event(text,text,text,timestamptz,text,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid,uuid,boolean)',false),
    ('public.secure_redemption_edge_mutate(uuid,jsonb)',false)
  ) as targets(signature,user_required) loop
    target:=spec.signature::regprocedure;
    select prosrc,proowner,proacl into old_source,before_owner,before_acl from pg_proc where oid=target;
    if position(E'\nbegin\n' in old_source)=0 then
      raise exception 'PROJECT_BINDING_PREDECESSOR_MISMATCH: %',spec.signature;
    end if;
    replacement:=regexp_replace(old_source,E'\nbegin\n',E'\nbegin\n  perform project_bootstrap.require_runtime_binding('
      ||case when spec.user_required then 'true' else 'false' end||E');\n');
    definition:=pg_get_functiondef(target);
    execute replace(definition,old_source,replacement);
    if exists(select 1 from pg_proc where oid=target and
      (prosrc is distinct from replacement or proowner<>before_owner or proacl is distinct from before_acl)) then
      raise exception 'PROJECT_BINDING_FUNCTION_PARITY_FAILED';
    end if;
  end loop;
end $migration$;
notify pgrst,'reload schema';
commit;
