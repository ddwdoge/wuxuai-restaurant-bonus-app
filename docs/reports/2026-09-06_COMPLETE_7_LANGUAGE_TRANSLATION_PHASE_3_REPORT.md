# WUXUAI Bonus - Phase 3 Übersetzungsbericht

## Ursache

Die Phase sollte alle sichtbaren Oberflächen in DE, EN, FR, IT, ES, ZH und KO bereitstellen. Für externe maschinelle Übersetzung war ausschließlich eine geprüfte Positivliste mit exakt 1.217 statischen UI-Texten freigegeben. 188 ausgeschlossene Texte mussten lokal bleiben.

## Geänderte Dateien

- zentraler generierter Sieben-Sprachen-Katalog und Runtime-Provider
- globale persistente Sprachwahl
- locale-aware Datums-, Zahlen- und EUR-Darstellung in betroffenen UI-Modulen
- reproduzierbare Klassifizierungs-, Katalog-, Hardcoded- und Terminologieprüfungen
- fokussierte i18n-, Legal- und Unified-UI-Tests
- Phase-1-/Phase-2-Dateien im bestehenden isolierten Branch bleiben Teil desselben noch uncommitteten Arbeitsstands

## Was wurde geändert

- 1.217 freigegebene `STATIC_UI_COPY`-Quelltexte wurden als First-Pass verarbeitet.
- Google Translate erhielt ausschließlich diese Positivliste. EN, FR, IT und ES wurden vollständig geliefert; nach einem Provider-Rate-Limit wurden fehlende ZH- und KO-Einträge lokal mit Offline-Modellen vervollständigt.
- 188 ausgeschlossene Texte wurden nicht extern übertragen und nicht übersetzt.
- Alle sieben Kataloge besitzen 1.405 identische Schlüssel; fehlende Werte und sichtbare Rohschlüssel in der automatisierten Matrix: 0.
- Platzhalter, `WUXUAI® Bonus`, `BASIC`, `PRO` und `PREMIUM` bleiben geschützt.
- Owner-erzeugte Inhalte werden nicht automatisch übersetzt.

## Was wurde nicht geändert

- keine Punkte-, QR-, Tages-PIN-, Geschenk-, Angebots- oder Entitlement-Logik
- keine RLS- oder Rollenänderung in Phase 3
- keine Datenbankanwendung in Phase 3
- kein Staging-Deployment des unvollständigen Übersetzungsstands
- keine Production-Änderung
- keine Legal-Dokumentkörper übersetzt

## Prüfungen

- fokussierte i18n/Legal/UI-Tests: 24/24 PASS
- vollständige Tests: 1322/1322 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 9 Warnungen
- Build mit Staging-Supabase und Staging-App-URL: PASS
- `git diff --check`: PASS
- Terminologieprüfung der 1.217 freigegebenen Texte: 0 Fehler
- Key-Parity: PASS, 1.405/1.405 je Sprache
- Responsive Browsermatrix: 245/245 PASS bei 320, 375, 390, 414, 430, 768 und 1024 px
- horizontales Overflow: 0 in der Matrix
- Sprachwahl-Touchfläche: mindestens 44 px

## Physische Prüfung und Blocker

Repräsentative Screenshots in FR, ZH und KO zeigen weiterhin deutsche Sätze. Nachgewiesene Beispiele:

- `Richte dein Bonusprogramm ...` wird aus einem Template-String zusammengesetzt.
- `Melde dich an, um deine Lokale ...` und `Noch kein Kundenkonto?` liegen in JSX-Ausdrucksbedingungen.
- Passwort-Hilfetexte werden als Ausdrucks-Props übergeben.
- statische Legal-UI-Beschriftungen liegen innerhalb der 188 ausgeschlossenen lokalen Texte.

Diese Texte waren nicht Bestandteil der exakt freigegebenen 1.217er Positivliste. Sie dürfen nicht nachträglich an den Übersetzungsdienst übermittelt werden. Der bisherige AST-Zähler meldet sie deshalb fälschlich als außerhalb seines Inventars, obwohl sie sichtbar sind.

## Datenminimierung

- extern übermittelt: exakt 1.217 statische UI-Texte
- extern nicht übermittelt: 188 ausgeschlossene Texte sowie sämtliche dynamischen Werte
- Nutzer-, Restaurant-, Datenbank-, Auth-, Token-, Secret-, Provider-, Log- und Legal-Dokumentdaten: 0

## Risiken

- P0: nicht-deutsche Oberflächen enthalten nachweislich deutsche Resttexte.
- P0: die aktuelle Inventarmethode erfasst sichtbare Ausdrucks- und Template-Texte nicht vollständig.
- P1: die maschinellen Übersetzungen benötigen nach vollständiger Extraktion weiterhin fachliche Terminologie- und Rollenprüfung.

## Status

`NOT READY`

Die ergänzende Inventur und Founder-Freigabe liegen inzwischen vor. Der zweite
Google-Translate-Lauf ist für EN, FR, IT, ES und ZH mit jeweils 1.020/1.020
checkpointed. KO steht bei 20/1.020; der nächste KO-Batch bleibt wegen HTTP
`429` blockiert. Erst nach vollständiger Google-Verarbeitung, Leakage 0,
Placeholder-/Key-Parity und physischer Staging-QA darf Phase 3 abgeschlossen
werden.
