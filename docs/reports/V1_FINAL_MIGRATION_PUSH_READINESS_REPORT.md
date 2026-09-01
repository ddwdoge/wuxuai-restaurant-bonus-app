# V1 Final Migration & Push Readiness Report

Stand: 2026-08-13 (Europe/Vienna)

Branch: `codex/v1-release-finishing-sprint`

Commit: `c5cf4b91fe605518d3f4fe85dd701752f6a784a4`

## Entscheidung

Der chronologische Stack aus 90 lokalen Migrationen lässt sich auf einer leeren
PostgreSQL-17-Datenbank vollständig anwenden. Auch der simulierte Upgrade-Pfad
von Migration 86 auf 90 erhält die repräsentativen Tenant-, Customer-, Punkte-,
Reward-, Redemption- und Legal-Daten. Staging ist mit allen 90 Migrationen
synchron; der Dry-Run ist leer.

Der Code ist trotzdem noch **nicht bereit zum Push**: `supabase db lint --linked`
meldet sieben Laufzeitfehler in älteren RPCs. Besonders kritisch sind die
mehrdeutigen `normalized_phone`-Referenzen in Registrierungs-RPCs, weil der
aktive Legal-Registrierungsvertrag intern auf diese Basisfunktionen verweist.
Die drei fehlerhaften alten Redemption-RPCs sind für Browserrollen entzogen,
werden aber noch in Legacy-Services referenziert. Diese Befunde müssen mit einer
additiven Forward-Fix-Migration und anschließendem Live-Regressionstest behoben
werden. In diesem reinen Audit wurden historische Migrationen nicht verändert.

## Migration Inventory

- Lokale Migrationen: **90**
- Remote registrierte Migrationen: **90**
- Doppelte Timestamps: **0**
- Remote-only / local-only Versionen: **0 / 0**
- Statische DDL-Vorkommen im Gesamtstack: 260 Tabellenänderungen, 305
  Funktionsdefinitionen, 37 Trigger, 100 Policies, 8 Cron-Schedules und 238
  Constraint-/Check-Definitionen.
- Abhängigkeit je Zeile: jeweils die unmittelbar vorherige Version; explizite
  Objektabhängigkeiten wurden zusätzlich durch den Clean-Database-Lauf geprüft.
- Der Dateiname beschreibt den fachlichen Zweck. Die Objektzahlen wurden aus
  dem SQL inventarisiert; für die Release-Migration sind die Objekte unten
  einzeln dokumentiert.

Chronologische vollständige Liste:

```text
20260704120000 wuxuai_foundation
20260704143000 loyalty_core_staff_actions
20260704150000 rewards_coupon_redemption
20260704160000 campaign_qr_onboarding
20260704170000 staff_daily_flow_hardening
20260704180000 pilot_onboarding_safe_staff
20260704190000 critical_security_hardening
20260704191000 high_production_hardening
20260704200000 flow_01_restaurant_opening
20260704210000 flow_02_guest_join
20260704220000 flow_03_reward_redemption
20260704230000 flow_04_bonus_points_collection
20260704231000 flow_04_bill_ranges_smart_upsell
20260704240000 flow_05_bonus_boost_referrals
20260704241000 flow_05_final_polish_bonus_boost_kpis
20260704242000 flow_05_device_referral_abuse_protection
20260704243000 multi_branch_architecture_prep
20260704244000 supabase_extensions_search_path_fix
20260704244500 bonus_amount_tiers_default_fix
20260706001000 owner_registration_trial
20260706002000 onboarding_draft_persistence
20260706003000 restaurant_media_storage
20260706004000 fix_restaurant_media_storage_rls
20260706004100 restrict_restaurant_media_storage_roles
20260706005000 welcome_reward_pool
20260706006000 fix_owner_trial_subscription_upsert
20260706007000 reward_management_v2_prep
20260707001000 welcome_gifts_management
20260707002000 welcome_gift_daily_limits
20260708001000 v1_registration_welcome_gift_connection_fix
20260709001000 bonus_tiers_use_min_amount
20260709002000 bonus_generosity_multipliers
20260709003000 customer_pin_redemption_codes
20260709004000 tages_pin_reward_redemption_lock
20260710001000 fix_get_today_restaurant_pin_rpc
20260711001000 staff_daily_pin_loyalty_action
20260711002000 staff_daily_pin_loyalty_first_collection_effects
20260711003000 drop_ambiguous_collect_bonus_points_legacy_signature
20260711004000 welcome_gifts_editable_after_onboarding
20260711005000 point_redemption_catalog_repeatable
20260711006000 daily_pin_bruteforce_and_points_daily_limit
20260711007000 platform_admin_trial_payment_basis
20260711008000 platform_admin_payment_logic_fix
20260712001000 welcome_gifts_status_update_fix
20260712002000 loyalty_redemption_return_rate
20260713001000 tenant_isolation_reward_rpc_security_final
20260713002000 platform_admin_restaurant_management
20260713003000 redeem_customer_reward_anon_security_decision
20260713004000 live_go_hardening_rate_limit_owner_race
20260714002000 daily_pin_booking_gifts_redemption_v1
20260720001000 audit_and_safe_test_mode
20260720002000 persist_pin_and_points_failures
20260720003000 dashboard_kpis_and_redemption_status
20260720004000 audit_trigger_table_field_guard
20260722001000 staff_redemption_code_preview
20260722002000 premium_portals_final_readiness
20260722003000 v1_retention_features
20260723001000 partner_restaurant_finder
20260724001000 legal_compliance_layer
20260724002000 legal_maps_hardening
20260726001000 owner_reward_image_webp
20260726002000 reward_image_crop_metadata
20260727001000 customer_identity_v1_no_sms
20260728001000 v1_bonus_activity_journal
20260728002000 referral_bonus_duration_settings
20260729001000 customer_repeat_qr_access_hardening
20260729002000 customer_phone_e164_hardening
20260729003000 customer_identity_security_verification_fix
20260729004000 redemption_rate_dropdown
20260729005000 legal_readiness_effective_date_guard
20260729006000 automated_restaurant_legal_onboarding
20260730001000 onboarding_status_allow_completed
20260730002000 onboarding_initial_legal_package_publication
20260731001000 restaurant_controlled_points_collection
20260801001000 shared_points_bonus_engine
20260802001000 enforce_minimum_points_amount
20260802002000 mark_minimum_validator_stable
20260803001000 harden_points_idempotency_receipts_and_dml
20260803002000 scope_reverse_idempotency_by_operation
20260803003000 remove_receipts_from_v1_points_flow
20260803004000 aggregate_partner_local_finder
20260803005000 wuxuai_legal_packet_v0_9_templates
20260803006000 owner_dashboard_notice_views
20260803007000 points_redemption_presentation_window
20260803008000 points_presentation_legal_template
20260804001000 restaurant_offers_v1
20260804002000 central_customer_account_offer_emails
20260804003000 central_customer_login_restaurant_context
20260809001000 v1_release_gift_presentations_notifications
20260811001000 transactional_email_reservation_ambiguity_fix
```

Überlagerungen sind überwiegend bewusste Forward-Fixes. Vier Constraints sind
bewusst `NOT VALID`: Redemption-Return-Rate sowie drei Punkte-Checks. Sie gelten
für neue/aktualisierte Zeilen, vermeiden aber eine erfundene Bereinigung von
Legacy-Daten. Historische Migrationen wurden nicht rückwirkend editiert.

## Clean Database Migration Test

Testumgebung: isolierter PostgreSQL 17 mit `pg_cron` 1.6.7 und minimalem lokalen
Supabase-Systemschema-Bootstrap (`auth`, `storage`, Rollen und `pgcrypto`). Alle
90 unveränderten SQL-Dateien wurden chronologisch jeweils transaktional mit
`ON_ERROR_STOP=1` angewendet.

Ergebnis: **90/90 PASS**, kein manueller Eingriff zwischen Migrationen.

## Existing Database Upgrade Test

Ein Previous-V1-Stand nach Migration `20260804001000` wurde mit anonymisierten
repräsentativen Daten aufgebaut. Danach wurden die vier Migrationen
`20260804002000`, `20260804003000`, `20260809001000` und `20260811001000`
chronologisch angewendet.

Vorher/Nachher unverändert:

- 1 Organisation, Restaurant, Branch, Owner-Membership und Customer
- 2 Rewards und 2 Customer-Gifts (Welcome + Birthday)
- Punktestand 180 und 1 Ledger-Transaktion
- 1 historischer aktiver sechsstelliger Redemption-Code
- 1 Legal-Dokument, veröffentlichte Version und Akzeptanz
- Restaurant-ID, Slug und Tenant-Zuordnung
- Kern-FK-Waisen: 0

Neue Account-, Membership-, Gift-Presentation-, Mail-Outbox- und Notification-
State-Tabellen wurden angelegt. Ergebnis: **PASS**.

## Latest Migration Verification

`20260809001000_v1_release_gift_presentations_notifications.sql` wurde sowohl
im Clean- als auch im Upgrade-Lauf real ausgeführt.

- Tabellen: `gift_redemption_presentations`,
  `customer_transactional_email_deliveries`,
  `customer_reward_notification_state`
- Gift-Präsentationen sind assignmentgebunden, 15 Minuten gültig, haben eine
  eindeutige öffentliche Referenz und genau eine aktive Präsentation je Gift.
- Start ist restaurant-, customer-token-, membership- und
  idempotency-key-gebunden; Payload-Mismatch wird getrennt behandelt.
- Welcome und Birthday verwenden den bestehenden `customer_rewards`-Vertrag;
  Punkte-Präsentationen bleiben über die vorherige Migration kompatibel.
- Birthday Assignment nutzt Restaurant-Zeitzone, 14-Tage-Vorlauf,
  aktiven Birthday-Pool und `restaurant + customer + year`-Idempotenz.
- Assignment, Reminder und Point-Threshold verwenden eindeutige Event-Keys.
- Dreifachaufruf Birthday-Cron: 1 bestehendes Jahres-Geschenk, 0 Duplikate.
- Dreifachaufruf Reminder und Gift-Finalizer: 0 doppelte Events/Finalisierungen.
- `20260811001000` ersetzt nur die mehrdeutige Mail-Reservierung; Zugriff bleibt
  ausschließlich `service_role`.

## RLS Verification

**PASS für den aktuellen V1-Datenvertrag.** RLS ist auf allen sieben neuen
Account-, Token-, Membership-, Gift-Presentation-, Outbox- und Notification-
Tabellen aktiv. `anon` und `authenticated` besitzen dort keine direkten
Tabellenrechte. Sensitive Outbox-/Raw-Email-Funktionen sind nicht für
Browserrollen ausführbar. Tenant- und Customer-Grenzen werden in den
freigegebenen RPCs serverseitig geprüft.

## Cron Verification

Sieben aktive, eindeutige Jobs; doppelte Jobnamen: 0:

- `wuxuai-v1-birthday-gifts-daily` – täglich 01:30
- `wuxuai-v1-birthday-gift-reminders` – täglich 01:45
- `wuxuai-v1-complete-gift-presentations` – jede Minute
- `wuxuai-v1-complete-points-presentations` – jede Minute
- `wuxuai-v1-expire-redemption-codes` – jede Minute
- `wuxuai-v1-expiry-reminders-daily` – täglich 02:10
- `wuxuai-v1-expire-bonus-boosts` – täglich 02:20

Die DB-Tagesgrenzen werden in den Funktionen restaurantbezogen berechnet. Der
Mail-Dispatcher wird bewusst nicht als paralleler DB-Cron angelegt. Für dessen
Staging-Betrieb sind Provider-/Dispatcher-Secrets manuell zu konfigurieren.
Ergebnis: **PASS**.

## Function Security

- Alle `SECURITY DEFINER`-Funktionen besitzen einen expliziten `search_path`.
- Direkte Browserrechte auf neue sensitive Tabellen sind entzogen.
- Die Release-Mailreservierung ist nur für `service_role` freigegeben.
- Keine Service-Role-Credentials wurden im Client oder Diff gefunden.

Remote-DB-Lint-Blocker:

1. `register_campaign_customer`, zwei `register_referral_customer`-Overloads und
   zwei `register_restaurant_customer`-Overloads: `normalized_phone` ist
   mehrdeutig (`42702`). Der aktive Legal-Registrierungsflow verweist intern auf
   eine Basisregistrierung; daher ist dies vor Push live zu reparieren.
2. `redeem_reward`, `redeem_reward_with_staff_session` und
   `redeem_reward_with_pin`: `ON CONFLICT` findet keinen passenden Unique-
   Constraint (`42P10`). Browser-Execute ist entzogen, aber der alte
   `rewardService` enthält noch eine Referenz.
3. Weitere Lint-Warnungen: ungenutzte Parameter, fehlender expliziter Return in
   `ensure_today_restaurant_pin` und zu starke Volatilitätsdeklarationen. Diese
   sind sekundär, müssen aber im Forward-Fix erneut gelintet werden.

## Legacy Logic

- Historische sechsstellige Redemption-Codes: **LEGACY BUT REQUIRED** für
  Status-/Historienkompatibilität; kein paralleler neuer Gift-Start.
- Alter Birthday Customer Draw: Execute entzogen; automatischer Birthday-Cron
  ist primär. **SAFE TO REMOVE LATER** nach Daten-/App-Nachweis.
- Campaign-Modul/Public Landing: V1-fremd und verweist auf einen fehlerhaften,
  entzogenen RPC. **SAFE TO REMOVE LATER**, aktuell Push-Readiness-Risiko.
- Alte Staff-Session-/PIN-Redemption-RPCs: Execute entzogen, aber Service-Code
  enthält eine Legacy-Referenz. **SAFE TO REMOVE LATER** nach Callsite-Audit.

## Test Results

- Node Unit-/Contract-/Security-/Gift-/Birthday-/Redemption-/Notification-Tests:
  **670/670 PASS**
- Echte lokale DB-Migrationstests: Clean 90/90, Upgrade 4/4
- RLS/Grant-/Cron-Schemaabfragen: PASS
- Ein echter Browser-/Staging-E2E-Flow war nicht Teil dieses Audits.

## Typecheck

`npm run typecheck`: **PASS**

## Lint

`npm run lint`: **PASS**, 0 ESLint-Fehler. Der separate DB-Linter hat die oben
genannten Legacy-RPC-Fehler gefunden.

## Build

`npm run build`: **PASS** (Vite, 2012 Module).

## Secret Scan

**PASS für den aktuellen Diff und den geprüften Repository-Inhalt.** Keine
Private Keys, Live-Keys, Service-Role-Werte, SMTP-Passwörter, DB-Credentials oder
Tokens gefunden. 65 historisch versionierte ZIPs wurden zusätzlich inhaltlich
nach Credential-Mustern geprüft; vier enthalten nur `.env.example`. Die große
Zahl alter ZIPs bleibt Repository-Hygiene-Schuld, ist aber kein neu hinzugefügtes
Artefakt dieses Branches.

## Git Status

Vor dem Report war der Working Tree sauber. Danach sind ausschließlich dieser
Auditreport und der bewusst erzeugte, bereinigte Prüfexport neu. Keine gestagten
Dateien, Dumps, Screenshots, Build-Ausgaben, `.env`-Dateien oder temporären
Testdateien. `git diff --check`: PASS.

Prüfexport: `exports/2026-08-13_V1_FINAL_MIGRATION_PUSH_READINESS.zip`
(702 Einträge, 4,9 MB, ZIP-Integrität PASS; `.git`, `node_modules`, `.env*`,
`dist`, `build`, alte ZIPs, Dumps und Backups ausgeschlossen).

## Staging Dry Run

- Projekt-Ref: `bwhv…qaya` (bestätigtes Staging)
- `migration list`: lokal 90 / remote 90, vollständig synchron
- `db push --linked --dry-run --include-all`:
  `upToDate=true`, Migrationen/Seeds/Rollen jeweils leer
- Es wurde **kein** `db push` ausgeführt.

## Remaining Blockers

1. Additive Forward-Fix-Migration für die mehrdeutigen aktiven
   Registrierungs-Basis-RPCs; danach Staging-Live-Registrierung testen.
2. Legacy-Redemption-RPCs entweder korrekt reparieren oder nach belegtem
   Callsite-/Historienaudit endgültig aus dem aktiven App-Vertrag entfernen.
3. Remote `supabase db lint --linked --level warning` muss ohne Error-Level-
   Befunde laufen.
4. Erst danach erneuter Staging-Dry-Run, 670 Tests und echter Staging-Flow.

## Recommended Commit

Noch **kein Commit/Push empfohlen**, bevor die RPC-Blocker behoben sind. Danach:

```text
fix(db): repair legacy registration and redemption rpc contracts
```

## Final Status

```text
ALL LOCAL MIGRATIONS PASS:
YES

CLEAN DATABASE PASS:
YES

EXISTING DATABASE UPGRADE PASS:
YES

RLS PASS:
YES

CRON PASS:
YES

TESTS:
670/670 PASS

TYPECHECK:
PASS

LINT:
PASS

BUILD:
PASS

SECRET SCAN:
PASS

STAGING DRY RUN:
PASS

STAGING MIGRATION READY:
NO

CODE READY TO PUSH:
NO

PRODUCTION READY:
NO

STRIPE:
DEFERRED
```

Status: **NOT READY**
