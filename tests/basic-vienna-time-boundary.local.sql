\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.assert_equal(actual timestamptz,expected timestamptz,label text)
returns void language plpgsql as $function$
begin
  if actual is distinct from expected then
    raise exception '%: expected %, got %',label,expected,actual;
  end if;
end
$function$;

select pg_temp.assert_equal(
  public.vienna_calendar_month_boundary_internal('2026-09-11 08:31:00+00',3::smallint),
  '2026-12-11 09:31:00+00','summer-to-winter preserves 10:31 Vienna');
select pg_temp.assert_equal(
  public.vienna_calendar_month_boundary_internal('2026-12-11 09:31:00+00',3::smallint),
  '2027-03-11 09:31:00+00','winter three-month boundary');
select pg_temp.assert_equal(
  public.vienna_calendar_month_boundary_internal('2027-01-31 09:00:00+00',1::smallint),
  '2027-02-28 09:00:00+00','non-leap month end clamps');
select pg_temp.assert_equal(
  public.vienna_calendar_month_boundary_internal('2028-01-31 09:00:00+00',1::smallint),
  '2028-02-29 09:00:00+00','leap month end clamps');

-- 28 March 2027 02:30 does not exist in Vienna: move forward by the gap.
select pg_temp.assert_equal(
  public.vienna_calendar_month_boundary_internal('2027-02-28 01:30:00+00',1::smallint),
  '2027-03-28 01:30:00+00','spring gap shifts to 03:30 CEST');
-- 25 October 2026 02:30 occurs twice: select the later CET occurrence.
select pg_temp.assert_equal(
  public.vienna_calendar_month_boundary_internal('2026-09-25 00:30:00+00',1::smallint),
  '2026-10-25 01:30:00+00','autumn overlap selects later CET');

select pg_temp.assert_equal(
  public.vienna_calendar_day_boundary_internal('2027-01-27 01:30:00+00',60),
  '2027-03-28 01:30:00+00','60-day spring gap boundary');
select pg_temp.assert_equal(
  public.vienna_calendar_day_boundary_internal('2026-08-26 00:30:00+00',60),
  '2026-10-25 01:30:00+00','60-day autumn overlap boundary');

do $test$
declare boundary timestamptz:=public.vienna_calendar_day_boundary_internal(
  '2026-08-26 00:30:00+00',60);
begin
  if coalesce((public.basic_owner_trial_timing_internal(
      boundary,boundary-interval '1 microsecond')->>'trial_active')::boolean,false) is not true then
    raise exception 'PRE_BOUNDARY_MUST_BE_ACTIVE';
  end if;
  if coalesce((public.basic_owner_trial_timing_internal(
      boundary,boundary)->>'trial_active')::boolean,true) is not false then
    raise exception 'EXCLUSIVE_BOUNDARY_MUST_BE_INACTIVE';
  end if;
end
$test$;

rollback;
select 'BASIC_VIENNA_TIME_BOUNDARY_PASS';
