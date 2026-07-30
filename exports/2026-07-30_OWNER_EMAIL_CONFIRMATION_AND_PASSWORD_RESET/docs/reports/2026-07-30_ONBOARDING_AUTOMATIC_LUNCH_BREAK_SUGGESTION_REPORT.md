# Automatischer Mittagspausenvorschlag im Onboarding

Datum: 30.07.2026  
Branch: `release/v1-restaurant-bonus`

## Ursache

Nach Aktivierung einer Mittagspause mussten vier zusammenhängende Grenzen
manuell und doppelt gepflegt werden. Zusätzlich stellte `Mittagspause entfernen`
die ursprüngliche Tagesendzeit nicht zuverlässig wieder her, weil `close` nach
der Aufteilung nur noch das Ende des ersten Blocks enthielt.

## Umsetzung

Die zentrale Funktion `suggestLunchBreak` verarbeitet Beginn und Ende einer
Tagesöffnung. Optional kann sie einen gültigen globalen Pausenstandard
bevorzugen. Ohne Standard gelten folgende V1-Regeln:

- Vorschlag nur ab acht Stunden Tagesöffnung
- Pausendauer abhängig von der Gesamtdauer: zwei bis drei Stunden
- mindestens 90 Minuten Öffnung vor und nach der Pause
- identische Grenzen zwischen Öffnungsblock 1 und Pause
- identische Grenzen zwischen Pause und Öffnungsblock 2
- keine Überlappung und keine stillen Änderungen gespeicherter Werte

Verbindliche Beispiele:

| Tagesöffnung | Automatischer Vorschlag |
| --- | --- |
| 11:00–22:00 | 14:00–17:00 |
| 10:00–20:00 | 14:00–16:30 |
| 11:30–23:00 | 14:30–17:30 |
| 11:00–16:00 | kein Vorschlag |

## UI-Verhalten

- Der Klick auf `Mittagspause hinzufügen` füllt alle Grenzen sofort aus.
- Der Hinweis erklärt, dass alle Zeiten weiterhin anpassbar sind.
- Kurze Tage zeigen: `Für diese Öffnungszeit ist keine sinnvolle Mittagspause verfügbar.`
- Eine ungültige Änderung der äußeren Öffnungszeit zeigt zusätzlich:
  `Die Öffnungszeit wurde geändert. Bitte prüfe die Mittagspause.`
- Bereits aktivierte Pausen besitzen keine erneute automatische Berechnung.
- `Mittagspause entfernen` übernimmt das Ende des zweiten Blocks wieder als
  Ende der durchgehenden Tagesöffnung.
- Unter 520 px stehen die Zeitfelder einspaltig untereinander.

## Daten und Sicherheit

- Bestehende gespeicherte Öffnungszeiten werden nicht verändert.
- Die vorhandene `opening_hours`-JSON-Struktur wird weiterverwendet.
- Migration: keine
- RLS/Security: unverändert
- Auth-, Punkte-, Reward-, PIN-, QR- und Tenant-Logik: unverändert

## Tests

- drei verbindliche lange Tagesöffnungen
- kurzer Tag ohne Vorschlag
- optionaler globaler Pausenstandard
- exakte Block-/Pausengrenzen
- mindestens 90 Minuten je Öffnungsblock
- gespeicherte manuelle Pause bleibt unverändert
- Pause entfernen stellt die Tagesendzeit wieder her
- Warn- und Hinweistexte vorhanden
- Kundenanzeige und Europe/Vienna bleiben unverändert geprüft

## Qualitätsergebnis

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 362/362 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Responsive CSS: 390/430 px einspaltige Zeitfelder, Touchaktion mindestens 44 px
- Migration: keine
- RLS/Security: unverändert

## Offenes visuelles Gate

Die geschützte Onboarding-Route erfordert eine Owner-Sitzung. Die Komponente und
ihre responsive CSS-Regel sind automatisiert geprüft; eine visuelle Abnahme mit
echter Owner-Sitzung bei 390/430 px, 200-%-Zoom und physischem Mobile Safari ist
noch erforderlich.
