\set target 1 + (:client_id % 10)
update public.restaurant_offers
set status='PUBLISHED', is_active=true
where restaurant_id='7c5c0000-0000-4000-8000-000000000011'
  and title='Concurrency ' || :target::text;
