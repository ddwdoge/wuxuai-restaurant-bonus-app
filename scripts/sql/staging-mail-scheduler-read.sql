-- Separate administrative runtime metadata proof. Never output cron commands:
-- commands can contain scheduler credentials. No dispatcher call is made.
BEGIN READ ONLY;
SELECT current_setting('transaction_read_only') AS transaction_read_only,
  current_setting('cron.launch_active_jobs',true) AS cron_launch_active_jobs,
  count(*) FILTER (WHERE active AND (
    command ~* '(transactional.mail.dispatcher|customer.*mail|dispatch.*mail|dispatch.*email)'
    OR jobname LIKE 'wuxuai-staging-synthetic-mail-%')) AS active_relevant_mail_jobs,
  count(*) FILTER (WHERE command ILIKE '%transactional-mail-dispatcher%')
    AS dispatcher_job_definitions
FROM cron.job;
COMMIT;
