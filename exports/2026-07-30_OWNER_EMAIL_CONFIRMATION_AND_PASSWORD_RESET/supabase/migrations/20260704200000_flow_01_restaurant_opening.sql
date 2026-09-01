alter table public.restaurants
add column if not exists restaurant_type text,
add column if not exists language text not null default 'de',
add column if not exists opening_hours jsonb not null default '{}'::jsonb,
add column if not exists special_days jsonb not null default '[]'::jsonb,
add column if not exists holidays jsonb not null default '[]'::jsonb,
add column if not exists smart_open_enabled boolean not null default true,
add column if not exists onboarding_status text not null default 'draft'
  check (onboarding_status in ('draft', 'ready')),
add column if not exists onboarding_checklist jsonb not null default '{}'::jsonb;

alter table public.rewards
add column if not exists image_url text,
add column if not exists category text,
add column if not exists available_products text[] not null default '{}'::text[];

alter table public.coupons
add column if not exists media_url text,
add column if not exists media_type text
  check (media_type in ('image', 'pdf'));

comment on column public.restaurants.opening_hours is
'Flow 01 weekly opening schedule, keyed by weekday with open/close/enabled values.';

comment on column public.restaurants.special_days is
'Flow 01 special opening days as JSON array.';

comment on column public.restaurants.holidays is
'Flow 01 restaurant holidays as JSON array.';

comment on column public.restaurants.onboarding_checklist is
'Flow 01 readiness checklist persisted per tenant.';
