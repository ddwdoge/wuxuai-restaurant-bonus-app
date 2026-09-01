-- Customer phone hardening: strict characters, supported country codes and E.164 output.
-- This migration is additive and intentionally does not repair, delete or merge legacy data.

create or replace function public.normalize_customer_phone(input_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  raw_value text := trim(coalesce(input_phone, ''));
  compact text;
begin
  if raw_value = '' or raw_value !~ '^[0-9+() -]+$' then
    return null;
  end if;

  compact := regexp_replace(raw_value, '[() -]', '', 'g');
  if compact like '00%' then compact := '+' || substr(compact, 3); end if;
  if compact ~ '^0[0-9]+$' then compact := '+43' || substr(compact, 2); end if;
  if compact ~ '^43[0-9]+$' then compact := '+' || compact; end if;
  if compact ~ '^[0-9]+$' then compact := '+43' || compact; end if;

  if compact !~ '^\+[1-9][0-9]{7,14}$' then
    return null;
  end if;
  if not (
    compact like '+43%' or compact like '+49%' or compact like '+41%'
    or compact like '+39%' or compact like '+420%' or compact like '+421%'
    or compact like '+36%' or compact like '+386%' or compact like '+385%'
  ) then
    return null;
  end if;

  return compact;
end;
$$;

comment on function public.normalize_customer_phone(text) is
  'Validates supported V1 phone formats and returns E.164. It never guesses digits or persists raw input.';

revoke execute on function public.normalize_customer_phone(text) from public, anon, authenticated;
