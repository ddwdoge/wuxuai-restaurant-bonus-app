-- Phase 7C.5F: permit the trusted server channel to create exactly one
-- scheduler proof for the lifetime of this database. The row-level singleton
-- prevents a second message even after the first run has completed.

create unique index if not exists capacity_warning_synthetic_scheduler_singleton_idx
  on public.capacity_warning_synthetic_scheduler_tests ((true));

revoke execute on function public.schedule_capacity_warning_synthetic_email_test(text, text, timestamptz)
from public, anon, authenticated, service_role;
grant execute on function public.schedule_capacity_warning_synthetic_email_test(text, text, timestamptz)
to service_role;

comment on index public.capacity_warning_synthetic_scheduler_singleton_idx is
  'Phase 7C.5F database-lifetime singleton: at most one authorized scheduler transport proof.';

notify pgrst, 'reload schema';
