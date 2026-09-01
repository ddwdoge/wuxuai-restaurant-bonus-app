# WUXUAI Bonus V1 – Bonus Boost 2× Sichtbarkeit Report

Status: **LOCK**
Datum: 2026-07-11

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/12_FLOW_05_BONUS_BOOST.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Repository nicht. Die Selbstprüfung wurde nach `AGENTS.md` und `docs/18_CODEX_REGELN.md` durchgeführt.

## Problem

Bonus Boost war zwar vorhanden, aber der 2× Effekt war im Kundenportal nicht stark genug sichtbar. Gäste mussten aus mehreren Stellen ableiten, ob sie aktuell doppelte Punkte sammeln.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/styles.css`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/12_FLOW_05_BONUS_BOOST.md`
- `docs/19_CHANGELOG.md`

## Boost-Karte

Bei aktivem Boost zeigt die obere Karte jetzt:

- `🔥 2× Punkte aktiv`
- `Du sammelst aktuell doppelte Punkte.`
- Restzeit nach V1-Regel:
  - `Noch XX Tage gültig`
  - `Noch 1 Tag gültig`
  - `Nur noch heute aktiv`

Wenn kein aktiver Boost vorhanden ist, bleibt die Einladungskarte sichtbar:

- `🔥 Lade einen Freund ein`
- `Ihr sammelt beide 30 Tage lang 2× Punkte, sobald dein Freund erstmals Punkte sammelt.`
- Button `Freund einladen`

Abgelaufene Boosts werden nicht mehr als aktiv angezeigt.

## Punktekarte

Die große Punktekarte zeigt bei aktivem Boost:

- Punktezahl mit Feuer-Symbol
- Badge `2× Bonus Boost aktiv`
- Hinweis `Jede Punktebuchung zählt aktuell doppelt.`

Ohne Boost bleibt die normale Punkteanzeige unverändert.

## Punkte-Sammeln-Erfolgsmeldung

Nach erfolgreicher Punktebuchung nutzt die Erfolgskarte ausschließlich die RPC-Antwort:

- `base_points`
- `points_added`
- `bonus_multiplier`

Bei aktivem Boost wird angezeigt:

- `Normal: XX Punkte`
- `Bonus Boost: +XX Punkte`
- `Gesamt: XX Punkte 🔥`

Ohne Boost wird angezeigt:

- `Punkte gesammelt!`
- `XX Punkte wurden gutgeschrieben.`

## Info-Drawer

Der „So funktioniert’s“-Drawer erklärt Bonus Boost jetzt kontextuell:

- bei aktivem Boost den aktuellen Multiplikator
- bei inaktivem Boost den Einladungsvorteil
- Beispiel `Normal: 50 Punkte. Mit Bonus Boost: 100 Punkte.`
- Hinweis, dass die Restzeit oben sichtbar ist

## Geprüfte Datenquelle

Keine neue Backend-Logik wurde gebaut.

Verwendete bestehende Daten:

- `customer.bonus_boost.multiplier`
- `customer.bonus_boost.active_until`
- `customer.bonus_boost.remaining_days`
- `BonusPointCollectionResult.base_points`
- `BonusPointCollectionResult.points_added`
- `BonusPointCollectionResult.bonus_multiplier`

## Mobile Prüfung

CSS und JSX wurden mobile-first geprüft:

- Boost-Statistiken fallen auf kleinen Breiten auf eine Spalte.
- Punktekarte bleibt full-width.
- Boost-Erfolgskarten fallen auf kleinen Breiten auf eine Spalte.
- Keine neue horizontale Layoutstruktur wurde eingeführt.

Ein automatischer Browser-Screenshot konnte nicht erstellt werden, weil der gebündelte Playwright-Browser in der lokalen Runtime nicht installiert ist. Der lokale Dev-Server antwortete erfolgreich.

## Build-Ergebnis

`npm run build` wurde erfolgreich ausgeführt.

## Offene Risiken

- Kein echter Staging-Test mit aktivem Live-Boost wurde in dieser Aufgabe durchgeführt.
- Keine Backendänderung wurde vorgenommen, da die benötigten Rückgabewerte bereits vorhanden sind.

## Status

**LOCK**
