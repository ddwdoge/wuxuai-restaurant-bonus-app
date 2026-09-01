# Live Redemption Close State Fix

Datum: 2026-08-23  
Branch: `codex/v1-release-finishing-sprint`

## Ursache

Die gemeinsame Statusfunktion für die 15-minütige Präsentation öffnete den
Drawer bei jeder aktiven oder abgeschlossenen Serverantwort. Dieselbe Funktion
wird beim initialen Laden und im Polling aufgerufen. Dadurch setzte die nächste
Statusantwort eine bewusste Schließaktion unmittelbar wieder zurück.

Zusätzlich war der Wiederöffnungs-Hinweis als fixierte Pille über dem Inhalt
positioniert. Das machte die Einlösung zwar erreichbar, belegte aber dauerhaft
eine schwebende Ebene der mobilen Oberfläche.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customer-premium.css`
- `tests/live-redemption-close-state.test.mjs`
- `docs/19_CHANGELOG.md`

## Umsetzung

- Nur die beiden ausdrücklich vom Kunden gestarteten Punkte- und
  Geschenkpräsentationen übergeben `openDrawer: true`.
- Hydration, Polling und serverseitige Finalisierung aktualisieren den Zustand,
  ohne die UI automatisch wieder zu öffnen.
- Schließen beendet weder Präsentation noch Countdown und startet keine neue
  Einlösung.
- Der weiterhin aktive Vorgang erscheint als kompakter, nicht fixierter Hinweis
  mit Reward-Titel, Restzeit und der Aktion `Anzeigen`.
- Der Hinweis ist per Tastatur erreichbar und besitzt einen sichtbaren
  Fokuszustand.
- Der Screen-Wake-Lock wird nur gehalten, während der Präsentations-Drawer
  tatsächlich geöffnet ist.

## Nicht geändert

- keine Punkte- oder Reward-Businesslogik
- keine Reportinglogik
- keine RPC-, RLS-, Audit- oder Tenantlogik
- keine Datenbankmigration
- keine Staff-, Owner- oder Plattformoberfläche

## Tests

Automatisiert geprüft werden initiales Öffnen, bewusstes Schließen,
Hydration/Polling ohne Wiederöffnung, Abschluss ohne Wiederöffnung, manueller
Reopen, Countdown, normaler Seitenfluss, Fokuszustand und Wake-Lock-Verhalten.

- gezielte Regressionen: 10/10 erfolgreich
- vollständige Testsuite: 758/758 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 8 bestehende Warnungen
- Production-Build: erfolgreich
- `git diff --check`: erfolgreich

Ein physischer iPhone-/PWA-Test sowie ein echter Staging-Präsentationslauf sind
für den finalen UX-Lock weiterhin erforderlich.

## Abschlussstatus

```text
AUTO OPEN ON INITIAL START: PASS
CLOSE BUTTON: PASS
STAYS CLOSED AFTER CLOSE: PASS
POLLING REOPENS DRAWER: NO
ROUTE CHANGE REOPENS DRAWER: NO
REFRESH FORCES DRAWER: NO
APP REOPEN FORCES DRAWER: NO
ACTIVE REDEMPTION INDICATOR: PASS
MANUAL REOPEN: PASS
COUNTDOWN CONTINUES: PASS
AUTO FINALIZATION: PASS
REPORTING: PASS
BUSINESS LOGIC CHANGED: NO
DB MIGRATION: NONE
TESTS: 758/758 PASS
TYPECHECK: PASS
LINT: PASS (0 Fehler, 8 bestehende Warnungen)
BUILD: PASS
LIVE REDEMPTION UX READY: NO
```

`LIVE REDEMPTION UX READY` bleibt bis zum echten Staging-Lauf und den
physischen Mobile-Prüfungen auf `NO`. Der Quellstand ist automatisiert geprüft
und als Code-Stand bereit für diese Abnahme.
