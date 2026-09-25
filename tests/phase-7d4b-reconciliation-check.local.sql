\set ON_ERROR_STOP on
do $assert$
declare result boolean;
begin
  select
    (select count(*)=3 from public.customer_qr_tokens
      where restaurant_id='7d4b0000-0000-4000-8000-000000000003')
    and (select active from public.customer_qr_tokens
      where id='7d4b0000-0000-4000-8000-000000000012')
    and (select not active and revoked_at is not null from public.customer_qr_tokens
      where id='7d4b0000-0000-4000-8000-000000000011')
    and (select not active and revoked_at is not null from public.customer_qr_tokens
      where id='7d4b0000-0000-4000-8000-000000000013')
    and (select count(*)=2 from public.audit_log where restaurant_id=
      '7d4b0000-0000-4000-8000-000000000003'
      and event_type='CUSTOMER_TOKEN_REVOKED')
  into result;
  if result is distinct from true then raise exception 'RECONCILIATION_CONTRACT_FAILED'; end if;
end;
$assert$;
