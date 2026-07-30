# WUXUAI Bonus - Engineering Bible Business Neutral Update Report

Datum: 2026-07-30  
Status: ENGINEERING_BIBLE_UPDATED

## Alte Regel

Die Engineering Bible positionierte V1 sichtbar auf Restaurants und Cafés.
Weitere Branchen und neutrale Produktsprache waren als V2 eingeordnet.

## Neue Regel

WUXUAI Bonus ist ab V1 die Kundenbindungsplattform für lokale Unternehmen.
Allgemeine sichtbare Produktsprache ist branchenneutral. Restaurant bleibt die
erste vollständig unterstützte, getestete und pilotierte Referenzbranche.

## Geänderte Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/01_VISION.md`
- `docs/02_PRODUKTREGELN.md`
- `docs/03_UX_REGELN.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/08_FLOW_01_ONBOARDING.md`
- `docs/14_DATABASE_ARCHITEKTUR.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/16_V2_MASTERPLAN.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`
- `docs/21_PRODUCTION_GO_LIVE_PLAN.md`
- `docs/99_V1_ENGINEERING_BIBLE_STATUS.md`

## Decision Record

`docs/product/DECISION_2026-07-30_WUXUAI_BONUS_BUSINESS_NEUTRAL.md`

Decision: WUXUAI Bonus wird ab V1 branchenneutral positioniert.  
Owner: Product Owner  
Supersedes: Restaurant-only V1 wording restriction  
Status: LOCKED

## V1-Umfang

V1 erlaubt neutrale UI-Terminologie, zentrale Branchenprofile,
branchenabhängige Dropdowns, passende Geschenk- und Belohnungsvorlagen sowie
die bestehende generische Reward-Engine. Restaurant bleibt Referenzbranche.

## V2-Abgrenzung

Tiefgreifende branchenspezifische Geschäftslogik, individuelle Termin-,
Buchungs-, Warenwirtschafts- und Kassenabläufe, automatische
Branchenkampagnen, eigene Analytics-Engines und Spezialpakete bleiben V2.

## Terminologiestandard

Allgemeine sichtbare UI verwendet Unternehmen, Geschäft, Betreiber,
Teammitglied und Kunde. Branchenspezifische Begriffe bleiben erlaubt, wenn sie
echte Inhalte darstellen. Eine blinde globale Wortersetzung ist verboten.

## Branchenprofile

Freigegebene Startprofile:

- Restaurant
- Café
- Bäckerei
- Bubble Tea
- Eisdiele
- Einzelhandel
- Friseursalon
- Kosmetikstudio
- Fitnessstudio
- Dienstleistung
- Sonstiges

## Dropdown-Standard

Definierte Optionslisten im Onboarding werden zentral konfiguriert und als
barrierefreie, tastaturbedienbare, Mobile-Safari-taugliche Dropdowns oder
Comboboxen mit mindestens 44 px Touchfläche dargestellt.

## Technische Legacy-Namen

`INTERNAL_LEGACY_NAMING_ACCEPTED`

`restaurants`, `restaurant_id`, bestehende RPCs, RLS-Policies,
Datenbanktypen, Storage-Pfade, URL-Slugs und risikoreiche interne Interfaces
bleiben vorerst unverändert. Es gibt keine Datenbankmigration nur zur
sprachlichen Umbenennung.

## Juristische Einschränkungen

`LEGAL_REVIEW_REQUIRED`

Rechtliche Mastertemplates und veröffentlichte Rechtstexte wurden nicht
inhaltlich neutralisiert. Eine spätere Änderung benötigt gesonderte rechtliche
Prüfung und darf keine unbelegte Aussage zur Rechtssicherheit enthalten.

## Beseitigte Konflikte

- Restaurant-only-V1-Wording ersetzt.
- Branchenauswahl und neutrale Terminologie von V2 nach V1 verschoben.
- Restaurant als Referenzbranche statt Dachbezeichnung festgelegt.
- V2 auf tiefgreifende branchenspezifische Speziallogik begrenzt.
- Technische Legacy-Namen ausdrücklich erlaubt.

## Nicht geändert

- Kein Produktcode.
- Keine UI-Komponente.
- Keine E-Mail oder Manifest-Datei.
- Keine Datenbank, Migration, RPC, RLS oder Security-Regel.
- Keine rechtlichen Dokumentinhalte.

## Offene Punkte

- Das branchenneutrale UI- und Branding-Refactoring folgt als separater
  Implementierungsauftrag.
- Rechtliche Mastertemplates müssen vor branchenübergreifender Verwendung
  fachlich und rechtlich geprüft werden.
- Restaurant bleibt für den ersten Pilot- und physischen Flow-Test maßgeblich.

## Qualitätsprüfung

- Repositoryweite Widerspruchssuche: keine aktive Restaurant-only-V1-Regel
  gefunden.
- Produktcodeänderungen: keine.
- Migration/RPC/RLS/Security: unverändert.
- Typecheck: erfolgreich.
- Lint: 0 Fehler, 6 bereits bestehende Warnungen.
- Tests: 336/336 erfolgreich.
- Build: erfolgreich.
- `git diff --check`: erfolgreich.
