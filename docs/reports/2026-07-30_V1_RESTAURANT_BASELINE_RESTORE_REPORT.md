# V1 Restaurant Baseline Restore

Datum: 2026-07-30
Repository: `/Users/dongdongwu/Documents/GitHub/wuxuai-restaurant-bonus-os`

## Ursache

Der aktuelle Entwicklungsstand enthielt ab Commit `fcb2625` den
branchenneutralen Produktumbau mit neuer Terminologie, Branchenprofilen und
Bonusprogramm-Assistent. Die neue Produktentscheidung priorisiert wieder die
einfache restaurantfokussierte V1. V2 muss erhalten bleiben, darf aber nicht
mit V1 vermischt werden.

## Ausgewaehlte V1-Baseline

Verwendet wird Commit `b9b26475c76e0a9925288ea07096a15f713d4d38` auf
`release/v1-restaurant-bonus`.

Der vollstaendig entpackte Inhalt von
`2026-07-30_FULL_STAGING_TEST_DATA_RESET.zip` wurde mit
`2026-07-30_ONBOARDING_STATUS_CONSTRAINT_FIX.zip` verglichen. Alle gemeinsamen
Dateien sind bytegleich; das Reset-ZIP enthaelt als einzigen fachlichen Zusatz
den Reset-Bericht. Die gemeinsamen Dateien des Reset-ZIP entsprechen Commit
`b9b2647` exakt. Finder-Duplikate und alte Archivdateien aus ZIP/Git wurden
nicht in den Arbeitsbaum kopiert.

## V2-Archiv

- Branch: `future/v2-business-neutral`
- Commit: `c79a2b05b70328fa564f6e87cf4a1921e8f9f999`
- Tag: `v2-business-neutral-snapshot-2026-07-30`
- Inhalt: neutraler Phase-1-Umbau plus vollstaendige Phase-2-UX-Vereinfachung
- Pruefung: Typecheck erfolgreich, Lint 0 Fehler/6 bestehende Warnungen,
  352/352 Tests erfolgreich, Build erfolgreich

Es wurde nichts gepusht, gemerged oder deployed.

## Enthaltene V1-Korrekturen

- Restaurant-Slug-Duplikat-Fix
- `onboarding_status` mit `draft`, `ready`, `completed`
- Legal-Migrationen `20260729004000`, `20260729005000`, `20260729006000`
- Public-Auth-Refresh-Fix
- Customer Identity ohne SMS und Telefonnummernormalisierung
- Referral-Dauer und Bonus-Aktivitaetsjournal
- kompakter Onboarding-Header
- keine Kunden-QR-Vorschau vor Onboarding-Abschluss
- restaurantbezogener QR-, Token-, Punkte- und Redemption-Kontext

## Produktregeln der Basis

Die Baseline verwendet eine Mehrfachauswahl fuer Willkommensgeschenke, fordert
mindestens ein Geschenk und empfiehlt drei bis fuenf. Die spaetere Auswahl ist
serverseitig zufaellig. Die Punkteeinloesung verwendet durchschnittlichen Bon,
Besuche, Gastro-Kategorien und die V1-Stufen 3/5/8/10 Prozent. Es gibt keine
Branchenprofile, keinen branchenspezifischen Filter und keinen
Bonusprogramm-Assistenten.

## Staging-Kompatibilitaet

Das lokal verknuepfte Supabase-Projekt ist eindeutig
`wuxuai-bonus-staging` (`bwhv...qaya`, `ACTIVE_HEALTHY`). Lokal und remote sind
72 Migrationen vollstaendig synchron, einschliesslich
`20260730001000_onboarding_status_allow_completed.sql`. V2 Phase 1 und 2
enthalten keine zusaetzliche Migration. Deshalb ist die bestehende
Staging-Datenbank schemawaertskompatibel mit dem V1-Code; es wurde keine
Migration geloescht, repariert, angewendet oder zurueckgerollt.

Die Cloudflare-Deploymenthistorie war in der nicht interaktiven Umgebung ohne
`CLOUDFLARE_API_TOKEN` nicht lesbar. Der aktuell auf Staging ausgelieferte
Codecommit ist daher nicht verifiziert. Es wurde bewusst kein Deployment
gestartet.

## Geaenderte Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/01_VISION.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`
- `docs/product/DECISION_2026-07-30_V1_RESTAURANT_FIRST_V2_DEFERRED.md`
- `docs/reports/2026-07-30_V1_V2_DIFF_MATRIX.md`
- `tests/v1-restaurant-baseline.test.mjs`
- `docs/reports/2026-07-30_V1_RESTAURANT_BASELINE_RESTORE_REPORT.md`

Der V1-Produktcode selbst wurde nicht aus ZIP-Dateien ueberschrieben oder
gegenueber der validierten Referenz veraendert.

## Lokale Qualitaetspruefung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bereits bestehende Warnungen
- Tests: 340/340 erfolgreich, davon 4 neue Baseline-Vertragstests
- Build: erfolgreich
- `git diff --check`: erfolgreich

Die Tests decken unter anderem Owner-Registrierung, idempotente
Restaurantaktivierung, Slug-Stabilitaet, Legal-Paket, Customer Identity,
QR-Kontext, Punkte, Tages-PIN, Redemption, Mehrfachgeschenke und die explizite
Abwesenheit der V2-Branchenprofile ab. Ein authentifizierter Browser-E2E gegen
Staging war nicht Teil dieses reinen Baseline-/Archivierungsauftrags.

## Nicht geaendert

- keine Runtime-Geschaeftslogik
- keine Datenbankmigration
- keine RLS- oder Policy-Regel
- keine Supabase-Daten
- kein Cloudflare-Deployment
- kein Push und kein Merge

## Pruefexport

Vollstaendiges Projekt-ZIP:
`exports/2026-07-30_V1_RESTAURANT_BASELINE_RESTORE.zip`

Enthalten sind Quellcode, Dokumentation, Tests, Public Assets und alle
Migrationen. Ausgeschlossen sind Git-Metadaten, `node_modules`, Build-Ausgaben,
Umgebungsdateien, Supabase-Tempdaten und alte ZIP-Artefakte.

## Offene Risiken

- Visuelle V1-Abnahme fuer das restaurierte Restaurant-Onboarding steht aus.
- Echter lokaler Browser-E2E mit Staging-Owner, Customer und Staff steht aus.
- Der aktuell ausgelieferte Cloudflare-Code konnte ohne API-Token nicht
  identifiziert werden.
- Einzelne historische sichtbare Kurzmarken verwenden noch `WUXUAI Bonus`.
  Die verbindliche V1-Positionierung ist in der Bible auf
  `WUXUAI Restaurant Bonus` gesetzt; die Runtime-Kurzmarken muessen in der
  visuellen Freigabe bewertet werden, ohne den Baseline-Code vorab umzubauen.

## Status

`READY_FOR_V1_VISUAL_REVIEW`
