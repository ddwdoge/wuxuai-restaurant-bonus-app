create table if not exists public.owner_geocoding_cache (
  address_hash text primary key check (address_hash ~ '^[0-9a-f]{64}$'),
  results jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_geocoding_cache_expires_idx
on public.owner_geocoding_cache (expires_at);

alter table public.owner_geocoding_cache enable row level security;
revoke all on table public.owner_geocoding_cache from anon, authenticated;
grant select, insert, update, delete on table public.owner_geocoding_cache to service_role;

create table if not exists public.external_provider_rate_limits (
  provider_key text primary key,
  next_allowed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.external_provider_rate_limits enable row level security;
revoke all on table public.external_provider_rate_limits from anon, authenticated;
grant select, insert, update on table public.external_provider_rate_limits to service_role;

insert into public.external_provider_rate_limits (provider_key, next_allowed_at)
values ('nominatim_search', now())
on conflict (provider_key) do nothing;

create or replace function public.claim_owner_geocoding_provider_slot()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claimed boolean := false;
begin
  delete from public.owner_geocoding_cache
  where expires_at <= statement_timestamp();

  update public.external_provider_rate_limits
  set next_allowed_at = statement_timestamp() + interval '1.1 seconds',
      updated_at = statement_timestamp()
  where provider_key = 'nominatim_search'
    and next_allowed_at <= statement_timestamp()
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.claim_owner_geocoding_provider_slot() from public, anon, authenticated;
grant execute on function public.claim_owner_geocoding_provider_slot() to service_role;
