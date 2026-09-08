-- Permit the existing read preflight to take its narrow row lock while it
-- validates the one foreign customer relation selected for cleanup.
alter function public.get_platform_foreign_test_customer_cleanup_preflight(uuid)
  volatile;
