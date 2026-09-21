\set ON_ERROR_STOP on
set session_replication_role = replica;
update public.restaurant_offers
set status='DISABLED', is_active=false
where restaurant_id='7c5c0000-0000-4000-8000-000000000011';
update public.restaurant_offers
set status='PUBLISHED', is_active=true
where restaurant_id='7c5c0000-0000-4000-8000-000000000011'
  and title in (
    'Concurrency 1', 'Concurrency 2', 'Concurrency 3',
    'Concurrency 4', 'Concurrency 5', 'Concurrency 6'
  );
set session_replication_role = origin;
update public.capacity_warning_states
set below_since_date='2026-09-21'
where restaurant_id='7c5c0000-0000-4000-8000-000000000011'
  and capacity_type='offer' and warning_level='80';
