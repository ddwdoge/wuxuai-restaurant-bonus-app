# BASIC V1 – Wiener Zeitvertrag und Final Code Lock

Datum: 2026-09-28

Ausgangs-HEAD: `8f39b744bc721bcaef4490d4b2639bc736517e3f`

Implementierungscommit: `dab1c786411f36e11e503153f1330b1d4cb5db0e`

Branch: `codex/v1-release-integration`

## Ursache

Der auf Staging erhaltene synthetische Alt-Trial zeigt serverseitig gelieferte
Zeitpunkte, die den UTC-Instants `2026-09-11T08:31:00Z` und
`2026-12-11T08:31:00Z` entsprechen. Die korrekte Owner-Formatierung machte
daraus `11.09.2026, 10:31 MESZ` und `11.12.2026, 09:31 MEZ`. Damit entstand
die Abweichung bereits durch die frühere serverseitige UTC-Monatsaddition; sie
wurde weder von der UI noch erst vom Bericht erzeugt.

Migration 183 berechnete neue Grenzen bereits über `Europe/Vienna` und liefert
für das verbindliche Beispiel korrekt `2026-12-11T09:31:00Z`, also
`11.12.2026, 10:31 MEZ`. Die DST-Auflösung war jedoch nur implizites
PostgreSQL-Verhalten. Zusätzlich akzeptierte die UI für erhaltene Alt-Trials
auch gleiche UTC-Uhrzeiten und bezeichnete den abweichenden Altzeitraum dadurch
irreführend als „Drei Kalendermonate“.

## Geänderter Vertrag

- Ein oder drei Kalendermonate werden ab der Wiener Ortszeit des Starts
  berechnet; Monatsenden werden auf den letzten gültigen Tag geklemmt.
- Das Ende ist exklusiv.
- Die 60 Kalendertage der Abwicklung verwenden denselben Wiener Vertrag.
- Nicht existente Frühlingszeit: Verschiebung um die einstuendige DST-Luecke
  nach vorn, zum Beispiel `02:30` auf `03:30 MESZ`.
- Doppelte Herbstzeit: spätere Instanz, also CET.
- Die Serverfunktion stoppt fail-closed, falls die Zeitzonendaten die
  dokumentierte Frühlingsauflösung nicht mehr liefern.
- Bereits gespeicherte Grenzen werden nicht verändert. Als `Europe/Vienna`
  markierte bestehende Trial- und Grace-Zeilen müssen beim Anwenden der
  Migration bereits mit dem neuen Resolver übereinstimmen, sonst bricht die
  Migration ab.
- Ein historischer UTC-Zeitraum wird in der Owner-UI als
  „Historischer Zeitraum – Wiener Ortszeit abweichend“ ausgewiesen und nicht
  als kanonischer Ein-/Drei-Monats-Vertrag umgedeutet.

## Geänderte Dateien

- `supabase/migrations/20260928004000_basic_vienna_time_boundary_contract.sql`
- `tests/basic-vienna-time-boundary.local.sql`
- `tests/basic-paid-pilot-readiness.test.mjs`
- `tests/basic-owner-trial-contract.test.mjs`
- `src/modules/billing/basicTrialPresentation.mjs`
- `src/modules/billing/basicTrialPresentation.d.mts`
- `src/modules/admin/pages/SettingsPage.tsx`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/21_PRODUCTION_GO_LIVE_PLAN.md`

Migration-185-SHA-256:
`ba27f88ef697cbae7b76db45036c4f3ccee76e1c3982126d525dfdf47a0fe510`

Migrationen 001–184 wurden nicht verändert. Migration 185 enthält keine
Business-DML und keine rückwirkende Zeitkorrektur.

## Prüfungen

- Fokussierte Node-Tests: 11/11 PASS.
- Fokussierter PostgreSQL-Zeitvertrag: PASS.
- Geprüft: 1/3 Monate, Sommer→Winter, Winterfälle, Monatsende, Schaltjahr,
  Frühlingslücke, Herbst-Doppelzeit, 60-Tage-Grenzen und exklusives Ende.
- Fresh Replay: 185/185 PASS.
- Repeat-Migration: leer.
- Lokaler DB-Lint: PASS, 0 Fehler.
- Full Suite: 2103/2103 PASS. Ein erster Sandboxlauf hatte ausschließlich drei
  `listen EPERM`-Fehler; derselbe Stand bestand außerhalb der Port-Sandbox
  vollständig.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 8 vorbestehende Warnungen.
- Build: PASS.
- Secret Scan: PASS.
- Diff Checks: PASS.

## Staging

- Projektbindung: verifiziertes Staging-Projekt.
- Migration vor Änderung: 184/184.
- Angewendet: ausschließlich Migration 185.
- Migration danach: 185/185.
- Repeat-Dry-Run: leer.
- Remote-DB-Lint: PASS, 0 Fehler.
- Konsistenzcheck vorhandener `Europe/Vienna`-Trial-/Grace-Zeilen: PASS.
- Bestehender synthetischer Alt-Trial blieb unverändert sichtbar:
  `11.09.2026, 10:31 MESZ` bis exklusiv `11.12.2026, 09:31 MEZ`.
- Neue UI-Klassifikation physisch nach Auth-Hydration bestätigt:
  „Historischer Zeitraum – Wiener Ortszeit abweichend“.
- Expliziter Staging-Worker:
  `wuxuai-restaurant-bonus-app-staging`.
- Aktive Worker-Version:
  `7e89c92e-27ba-474f-a090-f2f1a5469168`.
- Hauptasset: `/assets/index-hNuLVz-e.js`.
- Lokaler und ausgelieferter Asset-SHA-256:
  `d9f8c1f58a413148e9ad1267909c1b0dad75f5540e978a0da8fb0b7f8ce0a62e`.
- Edge Functions: unverändert.
- Production und Stripe LIVE: unverändert.

## Fortgeltende externe Gates

Diese technische Zeitkorrektur setzt keinen Gate-Wert künstlich auf bereit:

- Legal: finale reale Pilot-/Vertragsfreigabe OPEN.
- Privacy: Verantwortlichkeit, Zweck/Rechtsgrundlage, Aufbewahrung und Löschung
  für reale KYB-/Pilotdaten OPEN.
- Tax: steuerliche Einordnung des kostenlosen Pilots sowie finaler
  Price-/Invoice-/Automatic-Tax-Vertrag OPEN.
- KYB: verbindlicher realer Dokumentkatalog, Nachforderung, Ablehnung und
  manuelle Freigaberegel OPEN.
- Kassa: fachlich/rechtlich freigegebener Nachweis je realem Betrieb OPEN.
- Seller: GmbH-Gründung und finale Seller-/KYB-Verifikation OPEN.
- Stripe: TEST-Zahlungsabnahme durch Seller/Tax blockiert; LIVE vollständig
  gesperrt.
- Allgemeine AT-Länderfreigabe und Production bleiben gesperrt.

## Status

**BASIC FINAL CODE LOCK / PRODUCTION EXTERNAL GATES OPEN**

Dieser Status bestätigt den BASIC-Zeitvertrag und die Staging-Parität. Er ist
keine Freigabe eines realen Piloten, keiner Zahlung und keiner Production-
Aktivierung.
