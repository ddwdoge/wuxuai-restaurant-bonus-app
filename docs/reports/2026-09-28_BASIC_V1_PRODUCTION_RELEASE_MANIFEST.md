# BASIC V1 Production Release Manifest

Stand: 28.09.2026, Europe/Vienna

Dieses Manifest beschreibt den technisch geprüften Release-Kandidaten. Es ist
keine Production-Freigabe und enthält keine Secretwerte.

## Source und aktive Staging-Artefakte

- Integrations-Commit: `12823a6a9de2b3a346aaa67ada6d63c69817d1b6`
- Remote-Parität nach Push: `0/0`
- Staging-Datenbank: `185/185`
- Aktiver Staging-Web-Worker:
  `wuxuai-restaurant-bonus-app-staging`, Version
  `7e89c92e-27ba-474f-a090-f2f1a5469168`
- Aktives Staging-Hauptasset: `/assets/index-hNuLVz-e.js`
- SHA-256 des aktiven Hauptassets:
  `d9f8c1f58a413148e9ad1267909c1b0dad75f5540e978a0da8fb0b7f8ce0a62e`
- Der Push lud eine neue Cloudflare-Preview-Version hoch, aktivierte sie aber
  nicht. Da der Commit keine Web-App-Produktdatei ändert, blieb der aktive
  Staging-Web-Worker bewusst unverändert.
- Staging Edge `redemption-confirmation`: Version 2, ACTIVE,
  `verify_jwt=true`, Bundle-Fingerprint
  `785adcf62694dea41ac3fecf825c2062df3949c54ccbfe45449e612057ed9212`.

## Migrationen 124 bis 185

- `ea37e39ee3e802c9fcc341289ec798c366acdb68c74f65b708c7101628a85642` — `20260904001000_platform_admin_v1_operational_telemetry.sql`
- `029040d4c03f762957a07914524aea3d0920618fc7b5a0efc52db6546f2aaf61` — `20260905001000_platform_admin_operations_v1_1.sql`
- `c090fc49286fd6c2e583084e763ce61c1d12258a60a3d9a6f98f36099d19531f` — `20260905002000_platform_admin_operations_immutable_audit.sql`
- `64af31238c32ffa5ea27012386d16474b34dde2856f2816d10c7e642e9ffb8b7` — `20260905003000_platform_admin_critical_confirmation_fix.sql`
- `c2fdc9c29649a26fd6d0790a5c62b6914aeb6296a25b18ab71cf7db4937f4bce` — `20260905004000_pro_package_entitlements.sql`
- `0c1c4a33b8611ab5a13cde6ecf8cf82e7fae5c4b5714503fd91a6a18ddafed00` — `20260906001000_i18n_legal_jurisdiction_architecture.sql`
- `152cebb01dbef476ab1217bb0606843af30eadd5722e36dcb99b3712678d3740` — `20260906002000_kassa_compliance_v3.sql`
- `ec38ce39d61e6c4f7853a06af28328a4a516a0ef5d23c87888d8cfc1a512d732` — `20260907001000_kassa_test_tenant_cleanup_contract.sql`
- `75a0cede006f507cac8e899ea6758ef59f07884e4a86c62513db9ded2a690009` — `20260908001000_owner_trial_basic_plan_compatibility.sql`
- `3901eecf856f6b46c641788fc704aff0216a7bfdf2fd82413ea06c60b940d9ee` — `20260908002000_owner_branch_basic_plan_compatibility.sql`
- `8c42527db668e98b4472be60157c11a105d5f23d525243038e8f947b039bc53c` — `20260908003000_owner_trial_legal_package_compatibility.sql`
- `077f38fb8b4ff58d14078c1f72d7f8a9e57069affd06a3eb6cdd38e7ede6d992` — `20260908004000_kassa_test_tenant_legal_cleanup_fix.sql`
- `63a0178784c5f2df7f1052bffb32ecb3e422a1d3db46fdf21e4565f26cf9520b` — `20260908005000_kassa_foreign_test_customer_cleanup.sql`
- `d30bd7fe1f853b90de2479dce882f6bfbca47ef5a9609b4f26504a92ead4ca4b` — `20260908006000_kassa_foreign_cleanup_preflight_lock_fix.sql`
- `55a6493372eccb920fd4599364ab3fc6b45ac769b69b0df480fdabf78f08e6cd` — `20260908007000_staff_scanner_customer_label_consistency.sql`
- `2350008a374edbdaa17e158858f8dce938162f1d19cfb32424bf3bf9925cdb97` — `20260908008000_kassa_test_tenant_legal_profile_dependency_fix.sql`
- `026685370d476aabad0e7409cae4357062a7267c8c4fa268efa7759f92039577` — `20260910001000_pro_entitlement_lifecycle.sql`
- `d58f8cef2fedc06a8bc343f3442e2fb39e076e80216ebcd1da2315d54e5b3257` — `20260910002000_pro_lifecycle_null_guards.sql`
- `5a0d40ae237e633fb2ff6febe92e52db509de7249623a876929321766616a93f` — `20260911001000_pro_override_window_and_termination.sql`
- `851fa0e34090612ca68121409e3c760fc5842de97fa6fd43f7c2f083021d0824` — `20260911002000_subscription_browser_write_lock.sql`
- `728433bf8af8cf3f5ba45ea929b9befa94b1317a8442acd4a1e60bb5f7f2caea` — `20260911003000_subscription_admin_request_contract.sql`
- `6cf5b10b52edb06e6a1137a217ee88fe2af17b092f8dacf408cefd9bb98d67e3` — `20260911004000_country_launch_gate.sql`
- `6a5454901f6cc72221160369077f5e4786a010360f9262fffa63b226f567a907` — `20260911005000_country_launch_readiness.sql`
- `efa1e5e604e2b455d692e2445d9d60521f2a4778816ae572cb7befc8fc0675f7` — `20260911006000_legal_template_country_guard_compatibility.sql`
- `a7cff80a8c291ebfd78642381f3c5aee1dccceb63f1519a1f8bdf0d2831c5da0` — `20260911007000_platform_admin_health_center_read_model.sql`
- `db83df11b1b52e689d12981c19c3e4442b10862a7a1bf0af709ba384028a4253` — `20260912001000_platform_health_snapshot_volatility_contract.sql`
- `dce608d4773639506baac868f4879bb13f839e71f317c56bff57a35ac8a0fcba` — `20260915001000_pro_commercial_release_lock.sql`
- `816369d51c871fa49d236a78d5893c077363bfbf1566fc15c589f9ffe12a05f2` — `20260915002000_pro_commercial_control_center_reads.sql`
- `5ff37ab21bab8b3727587d9370dbd581c391d9260f661b7ca0ca860d6f00db91` — `20260915003000_test_tenant_contract_hardening.sql`
- `df2c79aa20abd3555cc6002b0a7d857259f9bc9b1b05056bfc74b59272a5e0b9` — `20260921001000_central_capacity_entitlements.sql`
- `8b5e713771c000a2a41f4be3119d85c90a578f20a00cb559c10337342a185acf` — `20260921002000_offer_capacity_enforcement.sql`
- `6d828bb07b1f1eae5033bdebe8415af5f3242af0e04558218f1dcdb73e2371f4` — `20260921003000_customer_capacity_enforcement.sql`
- `c1253234f4fe4d81a82103b6369d1f2614f398548c3c27f582bfe7beef69c149` — `20260921004000_owner_capacity_read_contract.sql`
- `d700d0bd7eb3ff98262b8b7f6cc5cdb9a14a83c629b83833b60cf5cf82890059` — `20260921005000_capacity_warning_dispatch.sql`
- `499e06cad1434d829a5001135154f2ca4d32ec18dcbbb73de0609519ed78beb5` — `20260922001000_capacity_warning_synthetic_staging_test.sql`
- `ff4d805118488d108cf89345992b6912fa86d2302ac185cc3fdb9df0f7bbc751` — `20260922002000_customer_outbox_quarantine_contract.sql`
- `a3331e2f9ba1e1742f22627bd92c2393c9eadac6521da8cec4afed26ecbcd295` — `20260922003000_synthetic_mail_scheduler_test_contract.sql`
- `aba2c1a1023c4539893196059c3e67b8ce2575eecf8004cb3e91e196becf0787` — `20260922004000_synthetic_mail_scheduler_jwt_transport.sql`
- `5417defbbf51c92536354e70f457cb0cbadafa0d93140fc5b177b9272f509ab1` — `20260922005000_synthetic_mail_scheduler_single_run.sql`
- `70fbd71826275c44ae79117bda6e668cccd41a0fc9f23867c0bb4930e3633611` — `20260922006000_pending_activation_registration_and_live_gates.sql`
- `f6e4bd47ee55aa79bd3fa9aeefacf7c0b80c40ee2ea66c589e0bf8696f406ad5` — `20260922007000_billing_catalog_reconciliation.sql`
- `4dbda299fd2fd4499f14137e0f3ecdd11a8b5b5efcc0f78f0659bacd320e1220` — `20260923001000_platform_admin_billing_readiness_reads.sql`
- `48a46dcd37680ff52c0fbc6a735b41a1a26bf5cb2654afa05cf647fde7b53988` — `20260924001000_test_provider_binding_tax_readiness.sql`
- `f392fa30489bbd073defcf9bc5e7f36b1fd6bc80304f87d4fa972361855f794b` — `20260924002000_checkout_webhook_architecture_blocked.sql`
- `45c4bf29ffb9e7e294d76536fd7b734f2d151a48438d8147780962d1e84f0815` — `20260924003000_staging_negative_billing_readiness.sql`
- `d9d3b7aac0266bfaad0434aae3e3b8fab5bd683ae6e2c615e2cb9cacd1cd5629` — `20260924004000_business_verification_foundation.sql`
- `9dae2f14846577cd8743fa710a1191110c3e321b8b407c1f60328ff056785441` — `20260924005000_country_first_business_verification_submission.sql`

## BASIC Edge Functions für den späteren Production-Rollout

Aus demselben freigegebenen Commit zu deployen:

- `owner-location-geocode`
- `owner-staff-invite`
- `platform-support-auth`
- `redemption-confirmation`
- `transactional-mail-dispatcher` nur fail-closed, solange der allgemeine
  Customer-Mail-Vertrag und Scheduler nicht separat freigegeben sind

Nicht nach Production deployen:

- `billing-basic-test-checkout`
- `billing-stripe-test-webhook`
- `billing-local-fake-webhook`
- `billing-checkout-architecture` aus dem negativen TEST-Vertrag
- synthetische Scheduler-/Testfunktionen

## Konfigurationsnamen ohne Werte

Web-Build:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_BASE_URL`
- `VITE_VAPID_PUBLIC_KEY` nur nach gesonderter Push-Freigabe

Redemption:

- `REDEMPTION_EDGE_MODE`
- `REDEMPTION_PRODUCTION_PROJECT_REF`
- serverseitig bereitgestellte Supabase-Runtime-Bindungen

Transactional Mail:

- `APP_BASE_URL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `SMTP_REPLY_TO`
- `TRANSACTIONAL_MAIL_MODE`
- `TRANSACTIONAL_MAIL_SCHEDULER_SECRET`

`STAGING_TEST_RECIPIENT` ist kein Production-Vertrag. Customer-Mail-Scheduler
und PRO-Mail bleiben aus.

## Upgrade-Probe und Checkpoints

Die isolierte lokale Schema-Probe startete bei 123 und bestand:

- 123 → 149: Migration und DB-Lint PASS
- 149 → 165: Migration und DB-Lint PASS
- 165 → 173: Migration und DB-Lint PASS
- 173 → 179: Migration und DB-Lint PASS
- 179 → 185: Migration und DB-Lint PASS
- Repeat-Dry-Run bei 185: leer / PASS

Die Probe enthält keine Production-Daten und ersetzt weder einen
Production-Snapshot-Test noch einen Restore-Test.

## Production-Smoke-Test

1. HTTPS, CSP, Cache-Regeln, erwartetes Hauptasset und Production-Projektbindung.
2. Owner-, Staff-, Customer- und Platform-Admin-Login mit internen Konten.
3. Platform-Admin-Mutatoren: AAL1 blockiert, TOTP/AAL2 erlaubt nur im eigenen
   autorisierten Kontext.
4. Anon-, falsche Rolle-, Cross-Tenant- und Direkt-RPC-Negativmatrix.
5. Owner-/Staff-/Customer-Portale laden ohne Demo-Fallback; Navigation erzeugt
   keine Businesswrites.
6. Redemption-Negativmatrix und genau-einmal-Vertrag nur synthetisch.
7. Auth-Mail ausschließlich an ein autorisiertes internes Postfach; kein
   allgemeiner Customer-Mail-Scheduler.
8. Keine Stripe-, Trial-, Entitlement- oder Restaurantaktivierung im Smoke-Test.
9. Nachher-Fingerprints, Auditdelta, DB-Lint, Health Center und Logs prüfen.

## Freigabegrenze

Legal, Privacy, Tax, KYB, Kassa, Seller, Stripe LIVE, Production-Mail,
Monitoring/Alarmierung und ein tatsächlich geprobter Restore bleiben offen.
