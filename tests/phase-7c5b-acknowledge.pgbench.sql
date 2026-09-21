begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"7c5c0000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select public.acknowledge_owner_capacity_warning(
  '7c5c0000-0000-4000-8000-000000000011',
  ((public.get_owner_capacity_warnings('7c5c0000-0000-4000-8000-000000000011')->0->>'episode_id')::uuid)
);
commit;
