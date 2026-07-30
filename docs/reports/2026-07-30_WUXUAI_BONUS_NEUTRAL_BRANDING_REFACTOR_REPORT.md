# WUXUAI Bonus - Neutral Branding Refactor Report

Datum: 2026-07-30  
Status: BLOCKER_RESOLVED_BY_PRODUCT_DECISION

## Auflösung

Der Product Owner hat am 2026-07-30 ausdrücklich entschieden, WUXUAI Bonus ab
V1 branchenneutral zu positionieren. Die bisherige Restaurant-only-Wording-
Regel wurde ersetzt.

Verbindlicher Decision Record:

`docs/product/DECISION_2026-07-30_WUXUAI_BONUS_BUSINESS_NEUTRAL.md`

Die neutrale Branding-Implementierung ist damit fachlich freigegeben und folgt
in einem separaten Implementierungsauftrag.

## Ursache

Die angeforderte branchenneutrale V1-Oberflaeche und die Auswahl weiterer
Branchen widersprechen mehreren aktuell als verbindlich markierten Regeln der
Engineering Bible.

Die neue Spezifikation verlangt unter anderem Baeckerei, Einzelhandel,
Friseursalon, Kosmetikstudio, Fitnessstudio und Dienstleistung als aktive
Onboarding-Auswahl. Der aktuelle Projektstandard ordnet diese Erweiterung
ausdruecklich V2 zu und schreibt fuer V1 eine restaurantfokussierte UX vor.

## Verbindliche Konfliktstellen

- `AGENTS.md`: V1 bleibt auf Restaurant/Cafe fokussiert; V2 darf nur auf
  ausdruecklichen Auftrag vorbereitet werden.
- `docs/00_START_HIER.md`: Die V1-UX bleibt restaurantfokussiert.
- `docs/08_FLOW_01_ONBOARDING.md`: Baeckerei, Bubble Tea, Friseur und
  Einzelhandel sind als V2 vorbereitet; die sieben Onboarding-Schritte sind
  restaurantbezogen als FIX dokumentiert.
- `docs/17_CTO_ENTSCHEIDUNGEN.md`: Die Branchenerweiterung ist als V2
  dokumentiert.
- `docs/18_CODEX_REGELN.md`: Branchenerweiterung ist V2 und darf nicht ohne
  ausdrueckliche Freigabe in V1 gebaut werden.
- `docs/15_DESIGN_SYSTEM.md`: Sichtbare Begriffe und Beispiele sind fuer V1
  weiterhin auf Restaurantbetreiber ausgerichtet.

## Geaenderte Dateien

- Nur dieser Konfliktbericht.

## Was wurde geaendert

- Der Widerspruch zwischen aktueller Spezifikation und Engineering Bible wurde
  nachvollziehbar dokumentiert.

## Was wurde nicht geaendert

- Keine UI-Texte oder Branding-Texte.
- Keine Onboarding-Schritte oder Dropdowns.
- Keine Branchenkonfiguration.
- Keine Businesslogik.
- Keine Datenbank, Migration, RPC, RLS oder Security-Regel.
- Keine Legal-Texte.

## Erforderliche Entscheidung

Vor der Implementierung muss die Engineering Bible durch eine ausdrueckliche
CTO-Entscheidung aktualisiert werden. Dabei muss mindestens entschieden werden:

1. Ist die Branchenerweiterung ab sofort verbindlicher V1-Scope?
2. Ersetzt die neutrale Terminologie die restaurantfokussierte V1-Sprache in
   allen Portalen?
3. Werden `docs/00_START_HIER.md`, `docs/08_FLOW_01_ONBOARDING.md`,
   `docs/17_CTO_ENTSCHEIDUNGEN.md`, `docs/18_CODEX_REGELN.md` und
   `docs/15_DESIGN_SYSTEM.md` entsprechend aktualisiert?
4. Ist der bisherige V1-Pilotfokus Restaurant/Cafe weiterhin ein Marktsegment,
   waehrend die UI bereits branchenneutral wird, oder wird auch der Pilot-Scope
   erweitert?

Nach dieser Freigabe koennen zentrale Terminologie- und Branchenkonfiguration,
abhaengige Dropdowns und die sichtbare UI konsistent umgesetzt werden, ohne
interne Tabellen, RPCs oder RLS-Vertraege umzubenennen.

## Build Ergebnis

Nicht ausgefuehrt, da kein Produktcode geaendert wurde und die Umsetzung durch
einen verbindlichen Produktkonflikt blockiert ist.

## Migration

Keine.

## Risiken

Eine Umsetzung ohne aktualisierte CTO-Entscheidung wuerde eine V2-Funktion in
den aktuell gesperrten V1-Scope einfuehren. Eine reine Textneutralisierung ohne
passende Produkt- und Flow-Freigabe wuerde zudem sichtbare UI, Onboarding,
Legal-Begriffe und bestehende restaurantbezogene Produktregeln widerspruechlich
machen.

## Status

READY_FOR_NEUTRAL_BRANDING_IMPLEMENTATION
