# WUXUAI Bonus V1 – Customer Portal UX Reorder + Punkteeinlösung Report

Datum: 2026-07-11

Status: LOCK

## Gelesene Grundlagen

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

Hinweis: docs/21_CODEX_SELBSTKONTROLL_LOOP.md ist in diesem Workspace nicht vorhanden. Der Selbstkontroll-Loop wurde anhand von AGENTS.md, docs/18_CODEX_REGELN.md und den bestehenden Selbstkontroll-Reports angewendet.

## Problem

Im Customer Portal standen der persönliche Bonus-QR und „Bonuskonto speichern“ zu weit oben. Dadurch waren Punkte, Punkteeinlösungen und Willkommensgeschenk weniger präsent als die eigentlichen Hauptinhalte für Gäste.

Zusätzlich existierte eine Sektion „Nächste Punkteeinlösungen“, die aus der alten „Nächste Belohnungen“-Logik kam und in V1 nicht mehr als eigene Sektion sinnvoll ist.

## Zielstruktur

Die Kundenansicht ist jetzt in dieser Reihenfolge aufgebaut:

1. Bonus Boost
2. Punkte
3. Punkteeinlösungen
4. Willkommensgeschenk nur wenn aktiv und nicht eingelöst
5. Persönlicher Bonus-QR
6. Bonuskonto speichern

## Geänderte Dateien

- src/modules/customer/CustomerPortal.tsx
- src/styles.css
- docs/05_CUSTOMER_PORTAL.md
- docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md
- docs/12_FLOW_05_BONUS_BOOST.md
- docs/19_CHANGELOG.md

## Neue Reihenfolge

### 1. Bonus Boost

Bonus Boost bleibt ganz oben.

### 2. Punkte

Die Punkteanzeige ist jetzt eine große, dominante Karte mit:

- „Deine Punkte“
- große Punktezahl
- klare visuelle Priorität vor QR und Speichern

### 3. Punkteeinlösungen

Direkt nach den Punkten folgt:

```text
Mit Punkten einlösbar
```

Die Sektion zeigt normale Punkteeinlösungen aus dem echten Reward-Bereich:

- Bild oder Standardbild
- Produkttitel
- Kategorie
- benötigte Punkte
- Status
- fehlende Punkte, wenn noch nicht einlösbar

Wichtig: Willkommensgeschenke werden nicht in dieser Sektion angezeigt.

### 4. Willkommensgeschenk

Willkommensgeschenk wird separat angezeigt, wenn ein aktives, noch nicht eingelöstes Willkommensgeschenk vorhanden ist.

Wenn das Willkommensgeschenk eingelöst ist, wird es durch die bestehende `status !== "redeemed"`-Filterung nicht mehr angezeigt.

### 5. Persönlicher Bonus-QR

Der persönliche Bonus-QR bleibt funktional erhalten, steht aber weiter unten.

### 6. Bonuskonto speichern

Der Speichern-Block bleibt erhalten, steht aber unter dem QR.

## Entfernt

- Alte obere QR/Punkte/Punkteeinlösung-KPI-Mischsektion
- Redundanter Block „1 einlösbar / 0 zum Sammeln“
- Sektion „Nächste Punkteeinlösungen“
- Leerer Platzhalter für fehlende nächste Punkteeinlösungen

## Willkommensgeschenk-Verhalten

Willkommensgeschenke bleiben getrennt von Punkteeinlösungen.

Sie erscheinen nur, wenn sie aktiv und nicht eingelöst sind.

Eingelöste Willkommensgeschenke verschwinden aus der sichtbaren Kundenansicht.

## Nicht geändert

- Token-Speicherung
- Auto-Login
- QR-Funktion
- Bonus-Boost-Mechanik
- Tages-PIN
- Staff Portal
- Restaurant Portal Navigation
- Datenbankstruktur
- Reward-Berechnung
- Willkommensgeschenk-Zufallslogik
- Referral-Logik
- Freischaltung nach erster Punktebuchung

## Mobile Prüfung

Mobile-First geprüft über Struktur und CSS:

- Punktekarte ist Full Width.
- Punkteeinlösungen sind standardmäßig einspaltig.
- Erst ab Tablet-Breite wird die Punkteeinlösungs-Liste zweispaltig.
- QR-Karte und Bonuskonto-Speichern-Block stehen unterhalb der Hauptinhalte.
- Keine horizontale Layoutstruktur wurde für Mobile erzwungen.

## Build

`npm run build` wurde ausgeführt.

Ergebnis: erfolgreich.

## Offene Risiken

Keine Backend- oder Logikrisiken aus dieser Aufgabe, da nur Customer-Portal-Reihenfolge, sichtbare Begriffe und CSS angepasst wurden.

## Status

LOCK
