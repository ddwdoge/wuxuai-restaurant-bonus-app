-- Administrative read-only permission proof; no business rows are selected.
BEGIN READ ONLY;
SET LOCAL ROLE wuxuai_test_preflight_reader;
SELECT jsonb_build_object(
  'role',current_user,'transaction_read_only',current_setting('transaction_read_only'),
  'can_login',(SELECT rolcanlogin FROM pg_catalog.pg_roles WHERE rolname=current_user),
  'superuser',(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user),
  'bypass_rls',(SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user),
  'create_role',(SELECT rolcreaterole FROM pg_catalog.pg_roles WHERE rolname=current_user),
  'fixed_aggregate_execute',has_function_privilege(current_user,'wuxuai_test_preflight.read_65_to_109()','EXECUTE'),
  'direct_table_read_count',(SELECT count(*) FROM unnest(ARRAY[
    'public.restaurants','public.branches','public.customers','public.customer_accounts',
    'public.customer_account_memberships','public.points_transactions','public.rewards',
    'public.customer_rewards','public.customer_reward_notification_state',
    'public.customer_pro_in_app_notifications','public.commercial_pro_access_grants',
    'public.loyalty_settings','public.platform_test_tenant_registry']) t
    WHERE has_table_privilege(current_user,t,'SELECT')),
  'other_callable_definer_functions',(SELECT count(*) FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND p.prorettype <> 'pg_catalog.trigger'::regtype
      AND has_function_privilege(current_user,p.oid,'EXECUTE')),
  'other_callable_volatile_definers',(SELECT count(*) FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef AND p.provolatile='v'
      AND p.prorettype <> 'pg_catalog.trigger'::regtype
      AND has_function_privilege(current_user,p.oid,'EXECUTE')),
  'points_mutator_execute',EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='confirm_restaurant_controlled_points'
      AND has_function_privilege(current_user,p.oid,'EXECUTE'))
) AS access_audit;
COMMIT;
