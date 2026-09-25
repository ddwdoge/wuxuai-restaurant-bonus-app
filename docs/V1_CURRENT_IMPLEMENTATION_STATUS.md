# WUXUAI Bonus V1 – aktueller Implementierungsstatus

Stand: 2026-09-24. Kanonischer Branch `codex/v1-release-integration`,
gepruefter Remote-HEAD vor diesem Dokumentationsabgleich
`4e03f9142eab853ac3130998f59f08a870bc6ba2`.
Der aktuelle Staging-Migrationsstand ist 168/168. Die untenstehenden
Phasenzeilen mit 165/165 oder 166/166 sind historische Gates ihrer Phase,
nicht der gegenwaertige Gesamtstand.
Production ist LOCKED.
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
| 7C.6C2B | Vier versionierte Stripe-Sandbox-Bindungen; getrennte Tax Readiness | 166 | PASS | PASS, damals 166/166; TEST VERIFIED, Tax PENDING_CONFIGURATION | LIVE UNBOUND / LOCKED | STAGING BACKEND LOCK, kein positiver Checkout | `045cd8f` (Implementierung) | [7C.6C2B](reports/2026-09-24_PHASE_7C_6C2B_TEST_PROVIDER_BINDING_STAGING_GATE_REPORT.md) | Positive Aktivierung und LIVE separat |
| 7C.6C3B | Negativer Checkout-/signierter technischer Webhook-Pfad, CORS-/Owner-/Staff-Restgate | 167–168 | PASS | PASS, 168/168; 0 Stripe-/Provideraufrufe, 0 positive Aktivierungen | LOCKED | STAGING NEGATIVE BILLING RESTGATE LOCK | `4e03f91` (letzte Evidenz) | [7C.6C3B2B](reports/2026-09-24_PHASE_7C_6C3B2B_OWNER_RESTGATE_REPORT.md) | Positiver Stripe-Checkout, echter Stripe-Webhook, Trial-/Entitlement-Aktivierung offen |
| 7D.3B | Sichere Einlösebestätigung mit separater PIN oder Staff/Owner-Freigabe | 171 | LOCAL CODE LOCK | NICHT ANGEWENDET | LOCKED | LOCAL CODE LOCK; KEIN STAGING/FINAL LOCK | Dieser Branch; Hash im Evidenzbericht | [7D.3B](reports/2026-09-25_PHASE_7D_3B_SECURE_REDEMPTION_CONFIRMATION_REPORT.md) | Remote-Push und Staging-Gate offen |
| Vor Production | Platform-Admin TOTP-MFA/AAL2 | Keine | PLANNED | NOT VERIFIED | REQUIRED BEFORE PRODUCTION | NO LOCK | NOT RECORDED | NOT RECORDED | Implementieren und physisch pruefen |

Stripe-Sandbox: Konto und vier monatliche Produkte/Preise wurden in 7C.6C1C
read-only verifiziert und in 7C.6C2B ausschliesslich als TEST gebunden.
Das ist keine Checkout- oder Billing-Autoritaet. BASIC 59 EUR netto/Monat:
5 Angebote, 3.000 aktive
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
und Designs und ist Lizenzgeberin. TEST Provider VERIFIED bei getrennter Tax
Readiness PENDING_CONFIGURATION; LIVE Provider UNBOUND. Live Billing BLOCKED.
AT + PRO kommerziell LOCKED; AT ist technisch im Registrierungs-Gate
aktiviert, nicht oeffentlich freigegeben.

## Migrationen 153–168 (Repository-Dateinamen)

Migrationen 153–168 sind auf Staging angewendet; der aktuelle Nachweis belegt
168/168. Migration 169 ist lokal 169/169 vollstaendig geprueft und im LOCAL
CODE LOCK; auf Staging wurde sie nicht angewendet. Ein Staging- oder Final-
Lock besteht dafuer nicht. Historische Migrationen nicht umschreiben.

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
| 166 | `20260924001000_test_provider_binding_tax_readiness.sql` |
| 167 | `20260924002000_checkout_webhook_architecture_blocked.sql` |
| 168 | `20260924003000_staging_negative_billing_readiness.sql` |

## Nicht implementiert / gesondert freizugeben

- Positive Pending-Registrierung auf Staging, Stripe-Checkout/Webhook/Portal,
  LIVE-Price-Bindings und Live Billing.
- Allgemeiner Scheduler fuer reale Customer-/Capacity-Mails; nur isolierte
  synthetische Testzustellung und Einmallauf sind nachgewiesen.
- Platform-Admin TOTP-MFA/AAL2 vor Production, KYB-Dokumentenpruefung und
  der neue zweigleisige 15-Minuten-Einloesevertrag aus Phase 7D.
- Production-Deployment, Country Release und oeffentliche PRO-Freigabe.

Verbindlicher Produktvertrag: [V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md](V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md).
