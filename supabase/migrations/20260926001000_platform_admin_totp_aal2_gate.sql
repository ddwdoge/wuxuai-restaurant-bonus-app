-- Platform Admin TOTP/AAL2 gate.
--
-- The role-discovery RPC intentionally remains available at AAL1 so an
-- authenticated Platform Admin can reach the TOTP enrollment/challenge UI.
-- Every existing server-side Platform Admin authorization path goes through
-- current_platform_role() or is_platform_admin(); both now fail closed unless
-- the JWT maps to a current Auth session bound to a still-verified TOTP factor
-- and proves AAL2 with a TOTP authentication method.

begin;

create or replace function public.platform_session_current_internal()
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from auth.sessions session_record
      where session_record.id = case
        when coalesce(auth.jwt()->>'session_id', '') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          then (auth.jwt()->>'session_id')::uuid
        else null
      end
        and session_record.user_id = auth.uid()
        and (session_record.not_after is null or session_record.not_after > statement_timestamp())
    ),
    false
  );
$function$;

revoke all on function public.platform_session_current_internal()
from public, anon, authenticated, service_role;

create or replace function public.platform_totp_factor_current_internal()
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select coalesce(
    exists (
      select 1
      from auth.sessions session_record
      join auth.mfa_factors factor_record
        on factor_record.id = session_record.factor_id
       and factor_record.user_id = session_record.user_id
       and factor_record.factor_type = 'totp'
       and factor_record.status = 'verified'
      where session_record.id = case
        when coalesce(auth.jwt()->>'session_id', '') ~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          then (auth.jwt()->>'session_id')::uuid
        else null
      end
        and session_record.user_id = auth.uid()
        and session_record.aal = 'aal2'
    ),
    false
  );
$function$;

revoke all on function public.platform_totp_factor_current_internal()
from public, anon, authenticated, service_role;

create or replace function public.platform_totp_aal2_verified_internal()
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select coalesce(
    auth.uid() is not null
    and auth.jwt()->>'sub' = auth.uid()::text
    and public.platform_session_current_internal()
    and public.platform_totp_factor_current_internal()
    and auth.jwt()->>'aal' = 'aal2'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) as method
      where case
        when jsonb_typeof(method) = 'string' then trim(both '"' from method::text) = 'totp'
        when jsonb_typeof(method) = 'object' then method->>'method' = 'totp'
        else false
      end
    ),
    false
  );
$function$;

revoke all on function public.platform_totp_aal2_verified_internal()
from public, anon, authenticated, service_role;

create or replace function public.current_platform_role()
returns text
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select pa.role
  from public.platform_admins pa
  where pa.user_id = auth.uid()
    and pa.active = true
    and public.platform_totp_aal2_verified_internal()
  limit 1;
$function$;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select coalesce(
    public.current_platform_role() in (
      'platform_owner',
      'platform_admin',
      'app_admin',
      'super_admin',
      'wuxuai_admin',
      'support',
      'billing_admin',
      'security_admin',
      'viewer'
    ),
    false
  );
$function$;

-- Role discovery is deliberately separate from authorization. It reveals only
-- the caller's own active platform role and lets the UI offer TOTP setup before
-- current_platform_role() starts authorizing protected reads or writes.
create or replace function public.get_current_platform_role()
returns text
language sql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
  select pa.role
  from public.platform_admins pa
  where pa.user_id = auth.uid()
    and pa.active = true
    and public.platform_session_current_internal()
  limit 1;
$function$;

revoke all on function public.current_platform_role()
from public, anon, authenticated, service_role;
revoke all on function public.is_platform_admin()
from public, anon, authenticated, service_role;
revoke all on function public.get_current_platform_role()
from public, anon, authenticated, service_role;
grant execute on function public.get_current_platform_role() to authenticated;

-- Sensitive Platform Admin actions already call this helper. A successful TOTP
-- challenge must count as the recent authentication event even when the first
-- factor login is older than ten minutes.
create or replace function public.require_recent_platform_auth_internal()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
stable
as $function$
declare
  actor_id_value uuid := auth.uid();
  claims_value jsonb := auth.jwt();
  authenticated_at_value timestamptz;
begin
  if actor_id_value is null
    or claims_value->>'sub' is distinct from actor_id_value::text
    or nullif(claims_value->>'session_id', '') is null
    or not public.platform_totp_aal2_verified_internal() then
    raise exception 'RECENT_PLATFORM_TOTP_REQUIRED' using errcode = '42501';
  end if;

  select max(to_timestamp((method->>'timestamp')::double precision))
  into authenticated_at_value
  from jsonb_array_elements(coalesce(claims_value->'amr', '[]'::jsonb)) as method
  where jsonb_typeof(method) = 'object'
    and method->>'method' = 'totp'
    and coalesce(method->>'timestamp', '') ~ '^[0-9]+([.][0-9]+)?$';

  if authenticated_at_value is null
    or authenticated_at_value > statement_timestamp() + interval '1 minute'
    or authenticated_at_value < statement_timestamp() - interval '10 minutes' then
    raise exception 'RECENT_PLATFORM_TOTP_REQUIRED' using errcode = '42501';
  end if;
end;
$function$;

revoke all on function public.require_recent_platform_auth_internal()
from public, anon, authenticated, service_role;

comment on function public.platform_totp_aal2_verified_internal() is
  'Internal fail-closed Platform Admin authorization predicate: current JWT must map to a live Auth session and its still-verified TOTP factor, and must prove AAL2 with a TOTP AMR method.';
comment on function public.platform_session_current_internal() is
  'Internal live-session predicate for Platform access: JWT session_id must still exist for auth.uid() and must not be past not_after.';
comment on function public.platform_totp_factor_current_internal() is
  'Internal current-factor predicate: the JWT session must still reference a verified TOTP factor owned by auth.uid().';
comment on function public.get_current_platform_role() is
  'Returns only the authenticated caller own active Platform role for pre-AAL2 MFA routing; never use this RPC as an action authorization predicate.';

notify pgrst, 'reload schema';

commit;
