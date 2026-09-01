# Welcome Gift Distribution History Audit + Neutral Help Report

## Ursache

Die zuletzt vorbereitete Onboarding-Hilfe leitete sichtbare Prozentsaetze,
erwartete Zuteilungen und Kosten aus einer angenommenen Verteilungsregel ab.
Der Founder verlangte deshalb zuerst einen vollstaendigen historischen Audit
und bis zu seiner Entscheidung eine algorithmusneutrale Owner-Hilfe.

## Historischer Befund

Der aelteste Git-Commit `48f811b7b51b50f0da99643e708bd6ecd04cfd3f`
ist ein Repository-Import vom 12.07.2026. Eine fruehere Git-Historie ist nicht
vorhanden; die enthaltenen datierten Migrationen und Reports bilden deshalb
die frueheste pruefbare Chronologie.

Die Founder-Dokumentation in `docs/13_SMART_REWARD_ENGINE.md`,
`docs/17_CTO_ENTSCHEIDUNGEN.md`, `docs/14_DATABASE_ARCHITEKTUR.md` und
`docs/09_FLOW_02_GAST_WERDEN.md` definiert eine wertorientierte, feste
Kategoriengewichtung: Kaffee 25, Getraenk 25, Dessert 20, Vorspeise 18,
Menue 5, Sushi 3, Hauptspeise 2 und eigene Ueberraschung 2. Bei einer Teilmenge
aktiver Kategorien werden diese Gewichte proportional normalisiert; erreichte
Tageslimits fuer Menue und Hauptspeise schliessen die Kategorie vor der
Neunormalisierung aus.

Es handelt sich nicht um eine dynamische Preisformel. Die SQL-Funktion berechnet
kein Gewicht aus `product_price`, sondern ordnet jeder Kategorie einen festen
Wert zu. Die Dokumentation begruendet die niedrigeren Gewichte teurer Kategorien
wirtschaftlich.

## Implementierungschronologie

- `20260706005000_welcome_reward_pool.sql`: erste technische Pool-Funktion,
  gleich-zufaellige Auswahl ueber zufaellige Sortierung.
- `20260707001000_welcome_gifts_management.sql`: ergaenzt Geschenkwerte und
  Verwaltungsfelder; Auswahl blieb noch gleich-zufaellig.
- `20260707002000_welcome_gift_daily_limits.sql`: implementiert die oben
  dokumentierten festen Kategoriengewichte, proportionale Auswahl und
  Tageslimits. Der Staging-Report vom 07.07.2026 dokumentiert die Anwendung und
  Live-Validierung.
- Keine spaetere Migration ersetzt `assign_welcome_starter_reward`. Commit
  `c01416ae2528da2b5876137dc8baa8679902aae7` erweiterte Referral-Regeln, nicht
  die Verteilungsfunktion.

Damit ist die erste technische Gleichverteilung eine Vorstufe. Die gewichtete
Migration ist die belegte Umsetzung des urspruenglichen Founder-Vertrags und
zugleich die aktuelle SQL-Implementierung. Als kleinere Belegabweichung nennt
die fruehe Dokumentation fuer Vorspeise bis 6 EUR, waehrend Migration
`20260707001000` 8 EUR als Produktwert einsetzt; das feste Gewicht 18 ist in
beiden Quellen identisch.

## Geaenderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/styles.css`
- `tests/onboarding-context-help.test.mjs`
- `tests/onboarding-automatic-gift-help.test.mjs`
- `tests/v1-restaurant-baseline.test.mjs`
- aktuelle kanonische Flow-/Entscheidungs-/Vertragsdokumentation und Changelog

## Was wurde geaendert

- Sieben step-spezifische Onboarding-Hilfen mit je drei kurzen praktischen
  Fragen bleiben erhalten.
- Schritt 5 verwendet nur die freigegebene algorithmusneutrale Erklaerung.
- Sichtbare Prozentsaetze, erwartete Zuteilungen, Regelversionen und
  Kostenberechnungen wurden entfernt.
- Das nur fuer diese Anzeige erstellte Berechnungsmodul, seine Tests und die
  unangewendete Snapshot-Migration wurden aus dem Arbeitsstand entfernt.

## Was wurde nicht geaendert

- Keine Welcome- oder Birthday-Zuteilungslogik.
- Keine Eligibility, Duplicate Protection, RLS, Tenant Isolation, Redemption,
  Audit-, Customer-Reward-, Punkte- oder Visit-Logik.
- Keine Migration angewendet und keine Datenbank veraendert.
- Kein Deployment und keine Production-Aktion.

## Konflikte und Grenzen

- Vor dem monolithischen Import-Commit ist keine Git-Historie verfuegbar.
- Der Produktwert fuer Vorspeise weicht zwischen einer fruehen Dokumentation
  (6 EUR) und der Werte-Migration (8 EUR) ab; die Wahrscheinlichkeit bleibt 18.
- Der Founder hat die belegte originale Verteilungslogik nach dem Audit als
  `FINAL LOCK` bestaetigt.

Die zeitweilige Gleichverteilung und die spaetere Gewichtung sind kein
unaufgeloester Vertragskonflikt: Die datierte Reihenfolge zeigt die technische
Vorstufe und ihre anschliessende Umsetzung des bereits dokumentierten
Founder-Vertrags. Ein abweichender zweiter Founder-Vertrag oder eine spaetere
Rueckkehr zur Gleichverteilung wurde nicht gefunden.

## Qualitaetspruefung

- Tests: `1253/1253 PASS`
- Typecheck: `PASS`
- Lint: `PASS` mit sieben bereits bestehenden Warnungen und null Fehlern
- Build: `PASS` mit lokalen nichtproduktiven Build-Platzhaltern; keine
  Supabase-Verbindung und kein Deployment
- `git diff --check`: `PASS`
- Responsive Markup/CSS: `320/375/390/414/430/1024/1440 PASS`, kein
  horizontaler Overflow und Hilfe-Touchziel mindestens 44 px
- Migration erstellt/angewendet: `NEIN / NEIN`
- RLS/Security: keine Aenderung; bestehende Zuteilungs- und Tenant-Vertraege
  bleiben durch die vollstaendige Regression abgedeckt

## Pruef-ZIP

`exports/2026-09-01_WELCOME_GIFT_DISTRIBUTION_HISTORY_AUDIT_AND_HELP.zip`

## Status

`CODE LOCK` fuer die Hilfe nach erfolgreichen Tests und Build. Die originale
Verteilungsregel ist `FINAL LOCK` und wurde nicht geaendert.
