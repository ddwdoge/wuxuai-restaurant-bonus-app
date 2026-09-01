alter table public.rewards
  add column if not exists product_price numeric(10, 2),
  add column if not exists active_days text[] not null default array[
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
  ];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rewards_product_price_nonnegative'
      and conrelid = 'public.rewards'::regclass
  ) then
    alter table public.rewards
      add constraint rewards_product_price_nonnegative
      check (product_price is null or product_price >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'rewards_active_days_allowed'
      and conrelid = 'public.rewards'::regclass
  ) then
    alter table public.rewards
      add constraint rewards_active_days_allowed
      check (
        active_days <@ array[
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday'
        ]
        and array_length(active_days, 1) between 1 and 7
      );
  end if;
end $$;
