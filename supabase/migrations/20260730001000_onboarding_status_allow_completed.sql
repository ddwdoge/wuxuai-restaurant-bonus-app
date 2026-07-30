alter table public.restaurants
  drop constraint if exists restaurants_onboarding_status_check;

alter table public.restaurants
  add constraint restaurants_onboarding_status_check
  check (onboarding_status in ('draft', 'ready', 'completed'));
