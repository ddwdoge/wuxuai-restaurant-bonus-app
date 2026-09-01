# Register Canonical Commercial Copy Deploy Report

Datum: 2026-08-30

## Ursache

Der aktive Source und das vor dem Auftrag live ausgelieferte Worker-Bundle enthielten bereits den kanonischen V1-Vertrag. Die vom Founder beobachtete 30-Tage-Fassung stammte aus einem bereits geladenen aelteren SPA-Dokument im Safari-Tab. Eine interne SPA-Navigation zu `/register` kann den bereits im Speicher befindlichen JavaScript-Stand weiterverwenden. Ein normaler Reload laedt den aktuellen Build; Website-Daten muessen nicht geloescht werden.

## Verifikation vor Deployment

- Kanonischer HEAD: `8be3df14f00b4e18cb8d781c2ee594385da5315a`
- Vorher aktive Worker-Version: `9cff8636-b82d-43a3-895b-2b340f7a8974`
- Live- und lokales Main-Bundle waren byteidentisch: SHA-256 `db72c9351a2a1ca9244909be6fe0a268e2456b77b4f63a135923d250a80406e8`
- Live- und lokales Register-Bundle waren byteidentisch: SHA-256 `222d7d1baf78dc212b42214087a411656f40588a18fc840598ab4c7fa5fe8744`
- Aktive Legacy-Pricing-Texte in `src`, `public`, `index.html` und `dist`: 0
- Ziel-Worker: `wuxuai-restaurant-bonus-app`
- Supabase-Ziel: `bwhvfjuwixgwduoeqaya`

## Deployment

- Worker-Version: `f5f314f8-6ce7-488a-bb64-c8a7733265ad`
- Zeitstempel: `2026-08-30T12:45:03.245Z`
- Tag: `commit-8be3df14`
- Message: `Canonical register commercial contract; commit 8be3df14f00b4e18cb8d781c2ee594385da5315a`
- Route: `bonus.wuxuaisbi.com/*`

## Live-Ergebnis

`/register` zeigt nach frischem Aufruf und normalem Reload:

- `3 MONATE KOSTENLOS`
- `Restaurant starten`
- `3 Monate kostenlos starten`
- `Danach 59 EUR pro Monat exkl. USt.`
- `Kein Zahlungsmittel erforderlich.`

Der HTML-Einstieg verwendet `no-cache, must-revalidate`. Gehashte Assets bleiben absichtlich immutable. Die bestehende Stale-Chunk- und BFCache-Recovery blieb unveraendert.

## Geaenderte Dateien

- Nur dieser Report.

## Was wurde nicht geaendert

- Kein Anwendungscode
- Keine Preis- oder Trial-Logik
- Keine Datenbankmigration
- Keine Domain- oder Worker-Zuordnung
- Keine Supabase-Konfiguration
- Keine Production-Aktion
- Kein Stripe-Verhalten

## Qualitaet

- Tests: 1132/1132 PASS
- Typecheck: PASS
- Lint: PASS mit 0 Fehlern und 7 bestehenden Warnungen
- Build: PASS
- `git diff --check`: PASS

## Risiken

Ein bereits im Speicher laufender Browser-Tab kann von einem Server nicht rueckwirkend ersetzt werden. Ein normaler Reload ist ausreichend. Der physische iPhone-Nachweis muss vom Founder am Geraet bestaetigt werden; automatisiert wurde der Live-Flow im Browser verifiziert.

## Status

CODE LOCK bis zur physischen iPhone-Bestaetigung. Production bleibt LOCKED. Stripe bleibt DEFERRED.
