# Phase 7C.6B5B – Platform-Admin Billing Readiness Staging Gate

Stand: 2026-09-23. Branch `codex/v1-release-integration`; geprüfter Source-/Remote-HEAD `c7f5fb9b2b916386991fca20514fd6294ce6637e`. Staging-Projekt ausschließlich `bwhvfjuwixgwduoeqaya` (`wuxuai-bonus-staging`). Production, Stripe, Seller-/Provider-Konfiguration, Edge Functions und Scheduler wurden nicht verändert.

## Ursache, Scope und Test-Äquivalenz

Der neue lokale Read-/Guard-Vertrag benötigte nach Migration 165 das physische Platform-Admin-Restgate. Auf Staging existierten keine `PENDING_ACTIVATION`-Subscriptions und keine Subscription mit NULL-Trialstart oder NULL-Trialende. Die Founder-Entscheidung vom 23.09.2026 akzeptiert für **diese Phase** stattdessen die bestandene lokale Negativ-/24-fach-Parallelitätsmatrix, bytegleiche Migration, Fresh-/Upgrade-/Repeat-Nachweise, Staging-Funktions-/Trigger-/ACL-/RLS-/`search_path`-Parität, eine rollback-geschützte Staging-Guard-Probe, identische Vorher-/Nachher-Fingerprints und den exakten Legacy-Snapshot 16/16. Es wurden keine synthetischen oder realen Staging-Datensätze angelegt. **POSITIVE STAGING PENDING FLOW: NOT EXECUTED / SEPARATE AUTHORIZATION REQUIRED.**

## Datenbank- und Sicherheitsgate

- Migrationshistorie vor/nach Deployment: 165/165; Repeat-Dry-Run leer. Migration `20260923001000_platform_admin_billing_readiness_reads.sql` SHA-256 `4dbda299fd2fd4499f14137e0f3ecdd11a8b5b5efcc0f78f0659bacd320e1220`; Migrationen 001–164 unverändert.
- Legacy-Eligibility-Snapshot und versiegelte Anzahl: 16/16. ID-Fingerprint `46b4f62f420b86dd0e6460200fdfe050`; keine Pending-/zukünftigen oder ungültig gebundenen Zeilen. Vorbestehende Subscription-/Trial-/Periodenzeilen unverändert.
- Vorher/nachher: 88 geschützte Tabellen in neun Gruppen bytegleich fingerprintiert; darunter Billing/Subscriptions `4064fa89c1e801a35fe4c11359e3ccc6`, Tenant `82725ace4e49eaa4f499b06f8ffc7c39`, Customer `8b08b63da33eabeca696d4caa78f681b`, Offers/Rewards/Gifts `facf4a5a9058c41e3f2f428fa1738655`, Points/Redemptions `2f3de13d05db542ce855a9dc2a40f1fd`, Capacity/Add-ons `dcd750484f4e55d150f2ba1d2679c4ce`, Country/Commercial/TEST_ONLY `67005223626d2e6d38e4308f3b49cbdd` und Warnings/Mail `e871934204236f89d2346659898e1415`. Keine Businessmutation oder UI-Write.
- Pending 0; Seller `PLANNED`; TEST/LIVE-Provider `UNBOUND`, Product-/Price-Bindungen 0; AT/PRO `LOCKED`; Grants und Add-on-Einheiten 0. Keine Aktivierung oder Zahlung.
- Staging-Read-RPC: nur Platform Admin; Owner/Staff/Customer/Anonymous blockiert, Service Role ohne Browser-Ausnahme. Fester `search_path` `pg_catalog,public,pg_temp`, minimale Grants, neue Tabellen mit RLS und gesperrter direkter DML. Read-Aufrufe 0 Writes. Rollback-geschützte repräsentative Guard-Probe SQLSTATE `42501`; Subscription-Fingerprint danach identisch.
- DB-Lint Exit 0, 34 bereits vorhandene beziehungsweise durch Funktionsersetzung erneut gemeldete Legacy-Warnungen. Keine neu unsichere Funktion aus Migration 165; scope-fremde Legacy-Funktionen wurden nicht verändert. Lokale Fresh-/Upgrade-/Repeat-, Rollen-, Guard- und Parallelitätsmatrix aus Phase 7C.6B5: PASS. Lokale Full Suite 1.960/1.960 und Chromium/WebKit 118 Checks wurden bei bytegleichem Source-Tree übernommen, nicht erneut ausgeführt.

## Deployment und physische Staging-Prüfung

- Typecheck PASS; Lint PASS (0 Fehler, 8 bekannte Warnungen); Build PASS. Ausschließlich Worker `wuxuai-restaurant-bonus-app-staging` deployt. Vorherige Deployment-ID `366c4c14-2f3c-4f66-a8c7-a430c1afe008`, Version `6694bacb-828d-4310-87b3-4068c0d9dcb2`. Neue Deployment-ID `29d37aaf-1bf0-487e-a1ee-e65263b7a202`, Version `8b5b0dc2-c67a-4daa-969c-5768133b0928`.
- Aktives Hauptasset `assets/index-HGDKcm1H.js`; SHA-256 lokal/ausgeliefert `7ee93939b46adfeda1d9da2343c71d58acfe284270c793fa6a14aac59fac8269`, bytegleich; Staging-Direktroute HTTP 200.
- Legitime bestehende Platform-Admin-Sitzung im Chrome-Staging-Tab bestätigt. Menüzugang und Direktroute `/admin/platform/pro` PASS. Katalog sichtbar: BASIC 59 € / 5 / 3.000, PRO 149 € / 15 / 15.000, Offer-Add-on 19 € / +5, Customer-Add-on 29 € / +5.000; Kundenfenster 365 Tage; Basis-Trial ein Kalendermonat; Add-ons ohne Trial. Kein aktiver 99-€-/Unlimited-Vertrag sichtbar.
- Seller `WUXUAI Digital & Trading GmbH` `PLANNED`, Live Billing `BLOCKED`; Stripe TEST/LIVE sämtlich `UNBOUND`, keine Product-/Price-IDs und keine Aktivierungsaktion. `PENDING_ACTIVATION · 0` mit `SETUP_ONLY`-Hinweis und blockierten produktiven Aktionen. Historische Betriebe als `LEGACY`/`HISTORICAL_TRIAL` gekennzeichnet, nur Bestandsverwaltung dargestellt; keine Aktion ausgeführt. AT/PRO weiterhin gesperrt.
- Sprachmatrix DE/EN/FR/IT/ES/ZH/KO physisch geladen; Preise, 365-Tage-Text, Seller-/Provider- und Pending-Status in allen sieben Ansichten vorhanden; Ausgangssprache Deutsch wiederhergestellt.
- Chrome-Device-Toolbar 320/375/390/430/767/768/1024/1440 CSS-px: Dokumentbreite jeweils gleich Viewportbreite, horizontaler Overflow 0; sichtbare Buttons/Links jeweils mindestens 44 CSS-px hoch/breit. Keine abgeschnittenen Status-/Preiswerte im sichtbaren Layout. Einziger DevTools-Konsolenfehler: `favicon.ico` mit `ERR_CONNECTION_CLOSED`, kein App-Runtime-Fehler.
- Country-Drawer read-only geöffnet; Bestätigung ohne Phrase deaktiviert; Abbrechen, X und Escape schließen ihn. Page Load, Reload, Sprachwechsel, Resize, Menü-/Tabwechsel, Drawer und alle Read-RPCs: 0 nachweisbare Writes anhand identischer Vorher-/Nachher-Fingerprints. Keine Phrase abgesendet.

## Grenzen, Dateien und Status

Produkt-/Migrationsdateien nicht geändert. Geändert wurde nur dieser Evidenzbericht. Die fremde `supabase/.temp/cli-latest` blieb unangetastet (SHA-256 `103e9d7a97f9a66c28586ffae6f8d81a90630d5cb2c537b23ed886a5e0e5ff01`). Kein Staging-Testtenant, Trialstart, Grant, Add-on, E-Mail, Stripe- oder Production-Zugriff; keine reale Datenkorrektur. Kein Merge/Tag. Positive Pending-Onboarding-Abnahme, Seller-Verifikation und Stripe-Provider-Verifikation bleiben offen.

**Status: PHASE 7C.6B5 PLATFORM-ADMIN BILLING READINESS STAGING LOCK / POSITIVE PENDING STAGING FLOW DEFERRED / SELLER AND STRIPE PROVIDER VERIFICATION STILL BLOCKED.**
