# Customer Portal Reihenfolge Punkteeinlösung – Report

Datum: 2026-07-11

Status: LOCK

## Gelesene Bible-Dateien

- AGENTS.md
- docs/00_START_HIER.md
- docs/05_CUSTOMER_PORTAL.md
- docs/09_FLOW_02_GAST_WERDEN.md
- docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md
- docs/11_FLOW_04_PUNKTE_SAMMELN.md
- docs/12_FLOW_05_BONUS_BOOST.md
- docs/13_SMART_REWARD_ENGINE.md
- docs/17_CTO_ENTSCHEIDUNGEN.md
- docs/18_CODEX_REGELN.md

Hinweis:

`docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist in diesem Workspace nicht vorhanden.
Der Selbstkontroll-Loop wurde anhand von AGENTS.md und docs/18_CODEX_REGELN.md
angewendet.

## Ursache

Die Kundenansicht war bereits teilweise in der richtigen Reihenfolge, aber die
finale V1-Trennung musste geschärft werden:

- Punkte sollten direkt nach Bonus Boost klarer dominieren.
- Normale Punkteprodukte mussten konsequent als Punkteeinlösungen erscheinen.
- Der Button für normale Punkteprodukte war zu allgemein.
- Der Einlöse-Dialog nutzte dieselbe Sprache für Punkteeinlösung und
  Willkommensgeschenk.
- Die Dokumentation musste die finale Reihenfolge erneut eindeutig festhalten.

## Geänderte Dateien

- src/modules/customer/CustomerPortal.tsx
- src/styles.css
- docs/05_CUSTOMER_PORTAL.md
- docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md
- docs/12_FLOW_05_BONUS_BOOST.md
- docs/13_SMART_REWARD_ENGINE.md
- docs/19_CHANGELOG.md
- docs/reports/2026-07-11_CUSTOMER_PORTAL_REIHENFOLGE_PUNKTEEINLOESUNG_REPORT.md

## Neue Reihenfolge

Finale Reihenfolge in „Mein Bonus“:

1. Bonus Boost
2. Punkte
3. Punkteeinlösungen
4. Willkommensgeschenk nur wenn relevant und nicht eingelöst
5. Persönlicher Bonus-QR
6. Bonuskonto speichern

## Entfernte Blöcke

Geprüft:

- Keine sichtbare Sektion „Nächste Belohnungen“ im CustomerPortal.
- Keine doppelte Belohnungs-Zusammenfassung im CustomerPortal.
- QR-Code und Bonuskonto speichern stehen unter Punkte, Punkteeinlösungen und
  Willkommensgeschenk.

## Willkommensgeschenk-Verhalten

Geprüft und nicht verändert:

- Willkommensgeschenk wird aus `visibleRewards` nur angezeigt, wenn es nicht
  eingelöst ist.
- Eingelöstes Willkommensgeschenk verschwindet, weil `status = redeemed` aus
  der sichtbaren Liste herausgefiltert wird.
- Willkommensgeschenk bleibt getrennt von normalen Punkteeinlösungen.
- Willkommensgeschenk-Texte im Dialog unterscheiden sich von normalen
  Punkteeinlösungen.

## Mobile Prüfung

Geprüft:

- CustomerPortal bleibt in einer mobilen Ein-Spalten-Reihenfolge.
- Punktekarte ist full width und visuell dominant.
- Punkteeinlösungen sind Karten unter der Punktekarte.
- Persönlicher QR und Bonuskonto speichern stehen weiter unten.
- Keine neue horizontale Layout-Regel wurde eingeführt.

## Nicht geändert

- Keine neue Produktlogik.
- Keine Datenbankänderung.
- Keine RPC-Änderung.
- Keine Tages-PIN-Änderung.
- Keine Bonus-Boost-Änderung.
- Keine Willkommensgeschenk-Zuteilungslogik.
- Keine QR-Token-Logik.
- Keine Auth- oder RLS-Änderung.

## Build-Ergebnis

`npm run build`

Ergebnis:

Erfolgreich.

## Offene Risiken

- Mobile Prüfung erfolgte über Code-/CSS-Prüfung und Build, nicht als neuer
  Live-Staging-Test.
- Die Businessdaten im CustomerPortal hängen weiterhin vom bestehenden
  Public-Portal-RPC ab.

## Status

LOCK
