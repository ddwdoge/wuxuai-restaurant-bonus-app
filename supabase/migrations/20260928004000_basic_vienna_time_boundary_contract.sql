-- BASIC V1 time-boundary contract:
-- - one/three calendar months and the 60-calendar-day grace preserve Vienna wall time;
-- - nonexistent spring-forward wall times move forward by the DST gap;
-- - duplicated fall-back wall times resolve to the later (standard-time) instant;
-- - existing persisted timestamps are never rewritten.
begin;
select pg_advisory_xact_lock(hashtextextended('migration:20260928004000',0));

create function public.resolve_vienna_local_timestamp_internal(input_local timestamp)
returns timestamptz language plpgsql immutable security definer
set search_path=pg_catalog,pg_temp as $function$
declare
  default_candidate timestamptz;
  earlier_candidate timestamptz;
  later_candidate timestamptz;
  selected_candidate timestamptz;
  default_roundtrip timestamp;
begin
  if input_local is null then return null; end if;

  default_candidate:=input_local at time zone 'Europe/Vienna';
  earlier_candidate:=default_candidate-interval '1 hour';
  later_candidate:=default_candidate+interval '1 hour';
  default_roundtrip:=default_candidate at time zone 'Europe/Vienna';

  -- Normal wall times have exactly one matching instant. During the autumn
  -- overlap both candidates match; max(...) deliberately chooses the later
  -- standard-time occurrence.
  select max(candidate) into selected_candidate
  from (values(default_candidate),(earlier_candidate),(later_candidate)) c(candidate)
  where candidate at time zone 'Europe/Vienna'=input_local;
  if selected_candidate is not null then return selected_candidate; end if;

  -- A nonexistent spring-forward wall time has no matching instant.
  -- PostgreSQL's Vienna conversion advances it by the one-hour DST gap. Fail
  -- closed if the timezone database ever stops producing that forward mapping.
  if default_roundtrip>input_local
    and default_roundtrip-input_local=interval '1 hour' then
    return default_candidate;
  end if;
  raise exception 'VIENNA_LOCAL_TIME_UNRESOLVABLE' using errcode='22008';
end
$function$;
revoke all on function public.resolve_vienna_local_timestamp_internal(timestamp)
  from public,anon,authenticated,service_role;

create or replace function public.vienna_calendar_month_boundary_internal(
  input_started_at timestamptz,input_months smallint
) returns timestamptz language sql immutable security definer
set search_path=pg_catalog,pg_temp as $function$
  select case when input_started_at is null or input_months not in (1,3) then null
    else public.resolve_vienna_local_timestamp_internal(
      (input_started_at at time zone 'Europe/Vienna')+make_interval(months=>input_months)
    ) end
$function$;
revoke all on function public.vienna_calendar_month_boundary_internal(timestamptz,smallint)
  from public,anon,authenticated,service_role;

create or replace function public.vienna_calendar_day_boundary_internal(
  input_started_at timestamptz,input_days integer
) returns timestamptz language sql immutable security definer
set search_path=pg_catalog,pg_temp as $function$
  select case when input_started_at is null or input_days<=0 then null
    else public.resolve_vienna_local_timestamp_internal(
      (input_started_at at time zone 'Europe/Vienna')+make_interval(days=>input_days)
    ) end
$function$;
revoke all on function public.vienna_calendar_day_boundary_internal(timestamptz,integer)
  from public,anon,authenticated,service_role;

-- Do not reinterpret or repair old rows. Only rows explicitly written under
-- the Vienna boundary contract must already agree with the clarified rule.
do $check$
begin
  if exists(
    select 1 from public.manual_basic_trial_decisions
    where boundary_timezone='Europe/Vienna'
      and ends_at is distinct from
        public.vienna_calendar_month_boundary_internal(starts_at,calendar_months)
  ) then
    raise exception 'EXISTING_VIENNA_TRIAL_BOUNDARY_MISMATCH' using errcode='23514';
  end if;
  if exists(
    select 1 from public.basic_post_trial_redemption_grace
    where boundary_timezone='Europe/Vienna'
      and ends_at is distinct from public.vienna_calendar_day_boundary_internal(starts_at,60)
  ) then
    raise exception 'EXISTING_VIENNA_GRACE_BOUNDARY_MISMATCH' using errcode='23514';
  end if;
end
$check$;

comment on function public.resolve_vienna_local_timestamp_internal(timestamp) is
  'Resolves a Europe/Vienna wall time: spring gap shifts forward by one hour; autumn overlap selects the later CET occurrence.';
comment on function public.vienna_calendar_month_boundary_internal(timestamptz,smallint) is
  'Exclusive BASIC trial end after one or three Vienna calendar months at the same local wall time, subject to the documented DST resolver.';
comment on function public.vienna_calendar_day_boundary_internal(timestamptz,integer) is
  'Exclusive Vienna calendar-day boundary at the same local wall time, subject to the documented DST resolver.';

notify pgrst,'reload schema';
commit;
