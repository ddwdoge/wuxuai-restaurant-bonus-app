# WUXUAI Bonus V1 – aktueller Implementierungsstatus

Stand: 2026-09-23. Kanonischer Branch `codex/v1-release-integration`,
gepruefter Basis-HEAD vor diesem Dokumentationsabgleich
`2c4e632fb242bc90cfc2fd4b3044ccaa79dbdd47`.
Staging-Angaben stammen aus den letzten eingecheckten Gate-Berichten; dieses
Dokumentationsaudit hat Staging nicht erneut verbunden. Production ist LOCKED.
`UNKNOWN` bedeutet nicht nachgewiesen, nicht automatisch fehlgeschlagen.

| Phase | Feature | Migration | Lokal | Staging | Production | Lock-Typ | Commit | Letzter Evidenzbericht | Offenes Restgate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Image | Gemeinsamer 16:9-Bildvertrag | Keine | PASS | PASS | LOCKED | FINAL LOCK fuer gepruefte Bildflaechen | UNKNOWN | [Renderer-Paritaet](reports/2026-09-20_REDEMPTION_RENDERER_PARITY_FIX_REPORT.md) | Production gesondert |
| 7B.4F | Platform Admin, Touch und Locked-Country-Pilot-Preview | UNKNOWN (Phase-spezifische Migration nicht isoliert) | PASS | PASS | LOCKED | FINAL LOCK fuer freigegebenen Staging-Scope | `f28a154` (Evidenz) | [7B.4F](reports/2026-09-21_PHASE_7B_4F_TOUCH_TARGET_LOCKED_PILOT_PREVIEW_REPORT.md) | Country Release nicht erfolgt |
| 7C.2B | Zentraler Capacity-Katalog | 153 | PASS | PASS | LOCKED | STAGING LOCK | `ab9b989` | [7C.2B](reports/2026-09-21_PHASE_7C_2B_CAPACITY_STAGING_GATE_REPORT.md) | Production |
| 7C.3B | Offer-Capacity-Enforcement | 154 | PASS | PASS | LOCKED | STAGING BACKEND LOCK | `277a252` | [7C.3B](reports/2026-09-21_PHASE_7C_3B_OFFER_CAPACITY_STAGING_GATE_REPORT.md) | Production |
| 7C.4B | Customer-Capacity-Enforcement | 155 | PASS | PASS | LOCKED | STAGING BACKEND LOCK | `013b843` | [7C.4B](reports/2026-09-21_PHASE_7C_4B_CUSTOMER_CAPACITY_STAGING_GATE_REPORT.md) | Production |
| 7C.5C | Owner Capacity UI und Warning-Dispatcher | 156–157 | PASS | PASS | LOCKED | STAGING LOCK | `8d01d4e` | [7C.5C](reports/2026-09-21_PHASE_7C_5C_CAPACITY_UI_WARNING_STAGING_GATE_REPORT.md) | Allgemeine externe Zustellung separat |
| 7C.5D3 | Isolierte ZeptoMail-Testzustellung | 158 | PASS | PASS, nur synthetisch | LOCKED | STAGING DELIVERY FINAL LOCK fuer isolierten Test | `0bfaea5` | [7C.5D3](reports/2026-09-22_PHASE_7C_5D3_ZEPTOMAIL_STAGING_DELIVERY_REPORT.md) | Reale Zustellung nicht freigegeben |
| 7C.5E | 21 historische Customer-Outbox-Eintraege quarantiniert | 159 | PASS | PASS | LOCKED | HISTORICAL OUTBOX QUARANTINE LOCK | `29a2c55` | [7C.5E](reports/2026-09-22_PHASE_7C_5E_HISTORICAL_STAGING_OUTBOX_QUARANTINE_REPORT.md) | Keine allgemeine Queue-Freigabe |
| 7C.5F | Einmaliger synthetischer Scheduler | 160–162 | PASS | PASS, Einmallauf | LOCKED | SYNTHETIC SCHEDULER DELIVERY LOCK | `55f2daa` | [7C.5F](reports/2026-09-22_PHASE_7C_5F_AUTOMATIC_MAIL_SCHEDULER_REPORT.md) | Allgemeiner Customer-/Capacity-Scheduler deaktiviert |
| 7C.6B2 | Pending Activation und Live-Gates | 163 | PASS | Vertrag installiert | LOCKED | STAGING TECHNICAL GATE | `063eb40` | [7C.6B5B](reports/2026-09-23_PHASE_7C_6B5B_PLATFORM_ADMIN_BILLING_STAGING_GATE_REPORT.md) | Positiver Pending-Staging-Flow separat autorisieren |
| 7C.6B3 | Kanonischer Billing-Katalog und Seller-/Provider-Grundlage | 164 | PASS | PASS | LOCKED | STAGING TECHNICAL GATE | `4e3da2e` | [7C.6B3](reports/2026-09-23_PHASE_7C_6B3_CANONICAL_BILLING_CATALOG_REPORT.md) | Seller-/Stripe-Verifikation und Provider-Bindung |
| 7C.6B5 | Platform-Admin Billing Readiness | 165 | PASS | PASS, 165/165; Deployment `29d37aaf-1bf0-487e-a1ee-e65263b7a202` | LOCKED | STAGING LOCK | `c7f5fb9` / `2c4e632` Evidenz | [7C.6B5B](reports/2026-09-23_PHASE_7C_6B5B_PLATFORM_ADMIN_BILLING_STAGING_GATE_REPORT.md) | Positiver Pending-Flow deferred; Seller/Provider unbound |
| 7C.6C | Stripe Sandbox | Keine | App-Integration NOT STARTED | TEST Provider UNBOUND | LIVE UNBOUND | NO PROVIDER LOCK | Founder-Angabe, kein App-Commit | NOT RECORDED | Konto/Land/vier Produkte und Preise read-only inventarisieren |
| Vor Production | Platform-Admin TOTP-MFA/AAL2 | Keine | PLANNED | NOT VERIFIED | REQUIRED BEFORE PRODUCTION | NO LOCK | NOT RECORDED | NOT RECORDED | Implementieren und physisch pruefen |

Stripe-Sandbox: Konto und vier monatliche Produkte/Preise wurden vom Founder
gemeldet, in diesem Audit aber nicht extern verifiziert. Das ist keine
Anwendungsbindung. BASIC 59 EUR netto/Monat: 5 Angebote, 3.000 aktive
eindeutige Kunden; PRO 149 EUR netto/Monat: 15 Angebote, 15.000 aktive
eindeutige Kunden, nie unbegrenzt. Offer Add-on: 19 EUR netto/Monat je +5
Angebote; Customer Add-on: 29 EUR netto/Monat je +5.000 Kunden. Das
Kundenfenster sind exakt rollierende 365 Tage. Neue Registrierung erzeugt
PENDING_ACTIVATION ohne Trial; Setup/Preview bleibt erlaubt, Live-Aktionen
gesperrt. Ein voller kostenloser BASIC-/PRO-Kalendermonat beginnt erst nach
verifizierter Provideraktivierung; Add-ons besitzen keinen Trial. Historische
rechtmaessige Trials bleiben geschuetzt. Seller `WUXUAI Digital & Trading
GmbH` ist als operative Verkaeuferin, SaaS-Vertragspartnerin und
Rechnungsausstellerin PLANNED; WU & XU Group GmbH haelt IP, Marken, Domains
und Designs und ist Lizenzgeberin. TEST und LIVE Provider UNBOUND; Live
Billing BLOCKED. AT + PRO LOCKED.

## Migrationen 153–165 (Repository-Dateinamen)

Alle 13 Dateien sind im Basiscommit enthalten; der letzte eingecheckte
Staging-Gate-Bericht belegt 165/165. Insbesondere sind 163, 164 und 165 auf
Staging angewendet; 165 ist nicht mehr nur lokal. Historische Migrationen
nicht umschreiben.

| Nr. | Datei |
| --- | --- |
| 153 | `20260921001000_central_capacity_entitlements.sql` |
| 154 | `20260921002000_offer_capacity_enforcement.sql` |
| 155 | `20260921003000_customer_capacity_enforcement.sql` |
| 156 | `20260921004000_owner_capacity_read_contract.sql` |
| 157 | `20260921005000_capacity_warning_dispatch.sql` |
| 158 | `20260922001000_capacity_warning_synthetic_staging_test.sql` |
| 159 | `20260922002000_customer_outbox_quarantine_contract.sql` |
| 160 | `20260922003000_synthetic_mail_scheduler_test_contract.sql` |
| 161 | `20260922004000_synthetic_mail_scheduler_jwt_transport.sql` |
| 162 | `20260922005000_synthetic_mail_scheduler_single_run.sql` |
| 163 | `20260922006000_pending_activation_registration_and_live_gates.sql` |
| 164 | `20260922007000_billing_catalog_reconciliation.sql` |
| 165 | `20260923001000_platform_admin_billing_readiness_reads.sql` |

## Nicht implementiert / gesondert freizugeben

- Positive Pending-Registrierung auf Staging, Stripe-Checkout/Webhook/Portal,
  versionierte TEST-/LIVE-Price-Bindings und Live Billing.
- Allgemeiner Scheduler fuer reale Customer-/Capacity-Mails; nur isolierte
  synthetische Testzustellung und Einmallauf sind nachgewiesen.
- Platform-Admin TOTP-MFA/AAL2 vor Production, KYB-Dokumentenpruefung und
  der neue zweigleisige 15-Minuten-Einloesevertrag aus Phase 7D.
- Production-Deployment, Country Release und oeffentliche PRO-Freigabe.

Verbindlicher Produktvertrag: [V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md](V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md).
