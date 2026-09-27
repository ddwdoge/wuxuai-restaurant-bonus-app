# V1 Manual BASIC Trial – Local Code Lock Report

Datum: 27.09.2026

Branch: `codex/platform-admin-totp-aal2`

Basis-Commit: `405045a6a04d43185884f76dc51e9d9e2029f4a0`

## Ursache und freigegebener Vertrag

Neue Betriebe bleiben nach Registrierung `PENDING_ACTIVATION` und erhalten
keinen Trial. Migration 180 bereitet den einzigen neuen positiven Pfad vor:
Ein berechtigter Platform Admin darf nach erfolgreichem Country-, KYB-, Legal-
und Kassa-Gate mit aktueller TOTP-/AAL2-Sitzung einen BASIC-Trial von
individuell einem oder drei Kalendermonaten starten.

Der Trial verlangt keine Zahlungsmethode, erzeugt keine Stripe-IDs und loest
keine Belastung oder automatische Verlaengerung aus. Es gibt keine globale
Hoechstzahl von Trial-Betrieben im Code. Die ersten zehn Pilotrestaurants sind
ein organisatorischer Angebotsvertrag, keine technische Kapazitaetsgrenze.

## Geaenderte Funktionen und Wechselwirkungen

Migration `20260927004000_v1_manual_basic_trial_activation.sql` ersetzt eng:

- `guard_pending_activation_transition`
- `guard_billing_activation_write`
- `require_kassa_acknowledgement_for_activation`
- `restaurant_activation_state_internal`

Der neue Mutator `activate_v1_manual_basic_trial` ist serverseitig,
tenantgebunden, per Restaurant serialisiert, request-idempotent und nur fuer
`platform_owner`/`platform_admin` mit frischer TOTP-/AAL2-Bestaetigung
ausfuehrbar. Die Entscheidung wird in
`manual_basic_trial_decisions` unveraenderbar protokolliert. Der kanonische
Subscription-Datensatz wird verwendet; es entsteht kein paralleler
Billing-Pfad.

## Sicherheitsvertrag

- Country-, KYB-, Legal- und Kassa-Gates bleiben verpflichtend.
- Registrierung, Upload, Profilfreigabe und TEST_ONLY-Markierung starten
  keinen Trial.
- Direkte DML-, AAL1-, falsche Rollen- und falsche Tenant-Zugriffe bleiben
  fail-closed.
- Der positive Write erlaubt ausschliesslich
  `pending_activation -> BASIC/trialing` fuer exakt ein oder drei
  Kalendermonate.
- Payment-, Stripe-Customer-, Stripe-Subscription- und Providerfelder bleiben
  leer; bestehende Stripe-State-Guards bleiben aktiv.
- Ein Trial kann je kanonischer Organisation/Restaurant nur einmal beansprucht
  werden. Dies ist keine globale Pilotgrenze.
- Nach Ablauf ohne separat angenommene und providerbestaetigte Bezahlperiode
  wird der Betrieb nicht automatisch belastet oder verlaengert; neue
  produktive Nutzung wird fail-closed blockiert.
- Der fachliche 60-Tage-Vertrag fuer vorhandene Punkte und Belohnungen ist
  weiterhin offen und wird nicht durch Migration 180 erfunden.

## Lokale Nachweise

- Migration 180 SHA-256:
  `885afab3cfef1283d289deae9b05afd86d85a3b3d234e80d7c90de22d0c52c33`
- Migrationen 001–179: gegen `HEAD` unveraendert.
- Fresh Replay: 180/180 PASS.
- Repeat 1/2: PASS; geschuetzte Datenfingerprints unveraendert.
- DB-Lint: PASS, 0 Fehler.
- Fokussierter Strukturvertrag: 6/6 PASS.
- SQL-Sicherheitsmatrix: PASS fuer AAL1-Block, Country-, KYB-/Legal- und
  Kassa-Block, 1-Monats- und 3-Monats-Aktivierung, idempotenten Replay,
  direkten DML-/Stripe-Block und fail-closed Ablauf.
- Parallelitaet: 24 identische Aktivierungen erzeugen genau eine fachliche
  Entscheidung und einen Trial-Claim; 23 Antworten sind idempotent.
- Full Suite: 2.083/2.083 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 8 vorbestehende Warnungen.
- Build: PASS mit geschuetzter lokaler Public-Client-Bindung; temporaere
  Build-Datei entfernt.
- Secret Scan und Diff Checks: PASS.

## Dokumentationsabgleich

Aktuelle Trial-Aussagen in `AGENTS.md`, Codex-Regeln, kanonischem Vertrag,
Admin-/Datenbankregeln, Guardrails, Pilot- und Payment-Plan sowie Legacy-Index
wurden eng auf den Founder-Vertrag vom 27.09.2026 abgeglichen. Historische
Phase-7C- und Dreimonatsberichte wurden nicht umgeschrieben.

Der bereits abgeschlossene Safari-Nachweis zur KYB-Owner-Hydration bleibt als
separate, beobachtete Evidenz im Bericht
`2026-09-27_V1_KYB_SAFARI_HYDRATION_AND_PILOT_BILLING_INVENTORY_REPORT.md`.
Er wurde in diesem Loop nicht wiederholt und ist kein Trial-Aktivierungsnachweis.

## Nicht geaendert

- Keine Staging-Migration oder Staging-Daten.
- Kein Deployment.
- Kein Stripe-Aufruf, Checkout, Webhook oder Testzahlung.
- Keine Production-Aenderung.
- Keine reale Restaurantaktivierung.
- Keine Customer-Mail-Scheduler-Aktivierung.
- `supabase/.temp/cli-latest` und fremde ungetrackte Berichte blieben
  unangetastet.

## Offene Gates

1. Migration 180 ist noch nicht auf Staging angewendet; letzter bestaetigter
   Staging-Stand bleibt ausserhalb dieses Loops unveraendert.
2. Der physische positive AAL2-Platform-Admin-Flow auf Staging ist offen.
3. Ein spaeterer bezahlter Folgezeitraum braucht einen ausdruecklichen
   Annahmevertrag des Betriebs und separate Stripe-TEST-Pruefungen.
4. Erfolgreiche Bestellung, fehlende Zahlungsmethode, fehlgeschlagene Zahlung,
   Kuendigung sowie wiederholte/verspaetete Stripe-Webhooks bleiben offen.
5. Der 60-Tage-Einloesevertrag nach Trialende bleibt eine rechtliche und
   technische Folgeentscheidung.

## Status

**V1 MANUAL BASIC TRIAL ACTIVATION LOCAL CODE LOCK / MIGRATION 180 NOT ON
STAGING / PAID FOLLOW-UP, STRIPE TEST EVENTS AND 60-DAY REDEMPTION OPEN**
