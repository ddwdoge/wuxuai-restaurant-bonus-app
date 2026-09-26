begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000173',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'platform-aal2-local@example.invalid', '',
  clock_timestamp(), clock_timestamp(), clock_timestamp()
);

insert into public.platform_admins (user_id, role, active)
values ('10000000-0000-4000-8000-000000000173', 'platform_admin', true);

insert into auth.mfa_factors (
  id, user_id, friendly_name, factor_type, status, created_at, updated_at
) values
  ('30000000-0000-4000-8000-000000001731', '10000000-0000-4000-8000-000000000173', 'Local current TOTP', 'totp', 'verified', clock_timestamp(), clock_timestamp()),
  ('30000000-0000-4000-8000-000000001732', '10000000-0000-4000-8000-000000000173', 'Local expired-session TOTP', 'totp', 'verified', clock_timestamp(), clock_timestamp());

insert into auth.sessions (id, user_id, created_at, updated_at, factor_id, aal, not_after)
values
  ('20000000-0000-4000-8000-000000001731', '10000000-0000-4000-8000-000000000173', clock_timestamp(), clock_timestamp(), null, 'aal1', null),
  ('20000000-0000-4000-8000-000000001732', '10000000-0000-4000-8000-000000000173', clock_timestamp(), clock_timestamp(), null, 'aal2', null),
  ('20000000-0000-4000-8000-000000001733', '10000000-0000-4000-8000-000000000173', clock_timestamp(), clock_timestamp(), '30000000-0000-4000-8000-000000001731', 'aal2', null),
  ('20000000-0000-4000-8000-000000001734', '10000000-0000-4000-8000-000000000173', clock_timestamp(), clock_timestamp(), '30000000-0000-4000-8000-000000001731', 'aal2', null),
  ('20000000-0000-4000-8000-000000001735', '10000000-0000-4000-8000-000000000173', clock_timestamp(), clock_timestamp(), '30000000-0000-4000-8000-000000001732', 'aal2', clock_timestamp() - interval '1 minute');

-- AAL1 can discover only its own role so the TOTP gate can be rendered, but it
-- receives no server-side Platform Admin authority.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000173',
  'role','authenticated','aal','aal1','session_id','20000000-0000-4000-8000-000000001731',
  'amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from clock_timestamp())::bigint))
)::text, true);

do $test$
begin
  if public.current_platform_role() is not null or public.is_platform_admin() then
    raise exception 'AAL1_PLATFORM_AUTHORITY_NOT_BLOCKED';
  end if;
end $test$;

set local role authenticated;
do $test$
begin
  if public.get_current_platform_role() is distinct from 'platform_admin' then
    raise exception 'AAL1_ROLE_DISCOVERY_FAILED';
  end if;
  begin
    perform public.get_platform_restaurants();
    raise exception 'AAL1_DIRECT_RPC_NOT_BLOCKED';
  exception when others then
    if sqlerrm <> 'Nicht berechtigt.' then raise; end if;
  end;
end $test$;
reset role;

-- A non-TOTP AAL2 factor remains insufficient for the TOTP-specific contract.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000173',
  'role','authenticated','aal','aal2','session_id','20000000-0000-4000-8000-000000001732',
  'amr',jsonb_build_array(jsonb_build_object('method','phone','timestamp',extract(epoch from clock_timestamp())::bigint))
)::text, true);

do $test$
begin
  if public.current_platform_role() is not null or public.is_platform_admin() then
    raise exception 'NON_TOTP_AAL2_NOT_BLOCKED';
  end if;
end $test$;

-- A current TOTP AAL2 session receives its role and passes recent-auth checks.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000173',
  'role','authenticated','aal','aal2','session_id','20000000-0000-4000-8000-000000001733',
  'amr',jsonb_build_array(
    jsonb_build_object('method','password','timestamp',extract(epoch from clock_timestamp() - interval '1 hour')::bigint),
    jsonb_build_object('method','totp','timestamp',extract(epoch from clock_timestamp())::bigint)
  )
)::text, true);

do $test$
begin
  if public.current_platform_role() is distinct from 'platform_admin' or not public.is_platform_admin() then
    raise exception 'TOTP_AAL2_AUTHORITY_MISSING';
  end if;
  perform public.require_recent_platform_auth_internal();
end $test$;

set local role authenticated;
do $test$
begin
  perform public.get_platform_restaurants();
end $test$;
reset role;

-- AAL2 remains valid for ordinary protected access, while an old TOTP proof is
-- rejected by actions that separately require recent authentication.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000173',
  'role','authenticated','aal','aal2','session_id','20000000-0000-4000-8000-000000001734',
  'amr',jsonb_build_array(jsonb_build_object(
    'method','totp','timestamp',extract(epoch from clock_timestamp() - interval '11 minutes')::bigint
  ))
)::text, true);

do $test$
begin
  if public.current_platform_role() is distinct from 'platform_admin' then
    raise exception 'VALID_AAL2_ROLE_UNEXPECTEDLY_MISSING';
  end if;
  begin
    perform public.require_recent_platform_auth_internal();
    raise exception 'EXPIRED_RECENT_TOTP_NOT_BLOCKED';
  exception when insufficient_privilege then
    if sqlerrm <> 'RECENT_PLATFORM_TOTP_REQUIRED' then raise; end if;
  end;
end $test$;

-- Removing the verified factor invalidates a previously valid AAL2 session even
-- if its auth.sessions row has not yet been removed.
delete from auth.mfa_factors
where id = '30000000-0000-4000-8000-000000001731';

select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000173',
  'role','authenticated','aal','aal2','session_id','20000000-0000-4000-8000-000000001733',
  'amr',jsonb_build_array(jsonb_build_object(
    'method','totp','timestamp',extract(epoch from clock_timestamp())::bigint
  ))
)::text, true);

do $test$
begin
  if public.current_platform_role() is not null or public.is_platform_admin() then
    raise exception 'REMOVED_TOTP_FACTOR_AAL2_NOT_BLOCKED';
  end if;
end $test$;

-- A signed, unexpired AAL2 JWT loses Platform authority immediately when its
-- backing Auth session no longer exists.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000173',
  'role','authenticated','aal','aal2','session_id','20000000-0000-4000-8000-000000001736',
  'amr',jsonb_build_array(jsonb_build_object(
    'method','totp','timestamp',extract(epoch from clock_timestamp())::bigint
  ))
)::text, true);

do $test$
begin
  if public.current_platform_role() is not null or public.is_platform_admin() then
    raise exception 'REVOKED_SESSION_AAL2_NOT_BLOCKED';
  end if;
end $test$;

set local role authenticated;
do $test$
begin
  if public.get_current_platform_role() is not null then
    raise exception 'REVOKED_SESSION_ROLE_DISCOVERY_NOT_BLOCKED';
  end if;
  begin
    perform public.get_platform_restaurants();
    raise exception 'REVOKED_SESSION_DIRECT_RPC_NOT_BLOCKED';
  exception when others then
    if sqlerrm <> 'Nicht berechtigt.' then raise; end if;
  end;
end $test$;
reset role;

-- A retained session row whose explicit not_after has elapsed is also denied.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub','10000000-0000-4000-8000-000000000173',
  'role','authenticated','aal','aal2','session_id','20000000-0000-4000-8000-000000001735',
  'amr',jsonb_build_array(jsonb_build_object(
    'method','totp','timestamp',extract(epoch from clock_timestamp())::bigint
  ))
)::text, true);

do $test$
begin
  if public.current_platform_role() is not null or public.is_platform_admin() then
    raise exception 'EXPIRED_SESSION_AAL2_NOT_BLOCKED';
  end if;
end $test$;

-- An expired/missing authenticated session has neither discovery nor authority.
select set_config('request.jwt.claims', '{}'::jsonb::text, true);
do $test$
begin
  if public.current_platform_role() is not null
    or public.is_platform_admin() then
    raise exception 'MISSING_SESSION_NOT_BLOCKED';
  end if;
end $test$;

set local role authenticated;
do $test$
begin
  if public.get_current_platform_role() is not null then
    raise exception 'MISSING_SESSION_DISCOVERY_NOT_BLOCKED';
  end if;
end $test$;
reset role;

rollback;
