-- Fixed, credential-free query profile for the existing authorized SQL Editor session.
-- NOLOGIN reader: no independent credential or externally exposed database login.
BEGIN READ ONLY;
SET LOCAL ROLE wuxuai_test_preflight_reader;
SELECT current_user AS effective_role,
  current_setting('transaction_read_only') AS transaction_read_only,
  wuxuai_test_preflight.read_65_to_109() AS preflight;
COMMIT;
