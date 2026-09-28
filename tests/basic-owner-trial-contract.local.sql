\set ON_ERROR_STOP on
begin;

do $test$
declare
  trial_end timestamptz:='2026-10-30 12:00 Europe/Vienna';
  decision_open timestamptz:=((trial_end at time zone 'Europe/Vienna')-interval '7 days') at time zone 'Europe/Vienna';
  timing jsonb;
begin
  if extract(epoch from trial_end-decision_open)<>608400 then
    raise exception 'VIENNA_DST_CALENDAR_WINDOW_NOT_169_HOURS';
  end if;

  timing:=public.basic_owner_trial_timing_internal(trial_end,decision_open-interval '1 day');
  if coalesce((timing->>'decision_available')::boolean,true) then
    raise exception 'DAY_MINUS_EIGHT_WAS_AVAILABLE';
  end if;

  timing:=public.basic_owner_trial_timing_internal(trial_end,decision_open);
  if coalesce((timing->>'decision_available')::boolean,false) is not true
    or coalesce((timing->>'trial_active')::boolean,false) is not true
    or coalesce((timing->>'checkout_allowed')::boolean,true) then
    raise exception 'DAY_MINUS_SEVEN_BOUNDARY_INVALID';
  end if;

  timing:=public.basic_owner_trial_timing_internal(trial_end,trial_end-interval '1 microsecond');
  if coalesce((timing->>'trial_active')::boolean,false) is not true
    or coalesce((timing->>'checkout_allowed')::boolean,true) then
    raise exception 'PRE_END_BOUNDARY_INVALID';
  end if;

  timing:=public.basic_owner_trial_timing_internal(trial_end,trial_end);
  if coalesce((timing->>'trial_active')::boolean,true)
    or coalesce((timing->>'checkout_allowed')::boolean,false) is not true then
    raise exception 'EXCLUSIVE_END_BOUNDARY_INVALID';
  end if;
end
$test$;

rollback;
select 'LOCAL_BASIC_OWNER_TRIAL_CONTRACT_PASS';
