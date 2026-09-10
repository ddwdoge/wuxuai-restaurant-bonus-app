# WUXUAI Bonus: I18N- und Rechtsraum-Architektur

Status: Phase 1, Staging-Vorbereitung. Diese Datei enthält keine Rechtsberatung und keine länderspezifischen Rechtstexte.

## Austria-Launch-Verhaeltnis - CURRENT 2026-09-10

**SUPERSEDED:** Eine offene vollstaendige QA aller sieben Sprachen darf nicht
mehr pauschal als Austria-Launch-Blocker gelesen werden. Fuer den Launch sind
die vollstaendige deutsche Golden-Path-Oberflaeche und ein integrierter,
nicht ueberlagernder Sprachschalter Pflicht. Die sechs weiteren Zielsprachen
duerfen nur mit ihrem tatsaechlich geprueften Status bezeichnet werden.

Der aktuelle Scope steht in
`docs/V1_AUSTRIA_LAUNCH_MASTER_CONTRACT.md`. Die Trennung von UI-Sprache und
Rechtsraum in diesem Dokument bleibt unveraendert verbindlich.

## Sprachvertrag

Unterstützte UI-Sprachkennungen sind exakt `de`, `en`, `fr`, `it`, `es`, `zh` und `ko`.

Die Auflösung erfolgt in dieser Reihenfolge:

1. explizite Auswahl des Nutzers aus `wuxuai.ui-language`
2. unterstützte Geräte-/Browsersprache
3. Englisch (`en`)

Die explizite Auswahl wird lokal gespeichert. Es wird in Phase 1 kein redundantes Profilfeld angelegt. E-Mail- und UI-Resolver verwenden dieselben Sprachkennungen; die bestehende E-Mail-Lokalisierung bleibt unverändert nutzbar.

## Namensräume

Zentrale Schlüssel beginnen mit einem dieser Namensräume:

`common`, `auth`, `owner`, `customer`, `staff`, `platform`, `onboarding`, `offers`, `points`, `rewards`, `settings`, `errors`, `legal`.

Phase 1 liefert nur ein minimales strukturelles Gerüst. Die vollständige Extraktion und Übersetzung aller sichtbaren Texte ist die nachfolgende Übersetzungsphase.

## Sprache und Rechtsraum

UI-Sprache und Rechtsraum sind zwei unabhängige Dimensionen. Die UI-Sprache darf niemals ein Rechtsdokument für ein Land auswählen.

Der Rechtsraum wird serverseitig aus der rechtlichen Organisationsadresse ermittelt. Verweist diese auf einen Restaurantstandort, wird dessen Geschäftsland verwendet. Ist kein belastbarer Rechtsraum ermittelbar, lautet der Status `LEGAL_CONTENT_NOT_AVAILABLE`; es wird kein Dokument eines anderen Landes eingesetzt.

Jeder veröffentlichte Dokumentstand kann unveränderbar mit einem zweistelligen Rechtsraum verknüpft werden. Bestehende Dokumentversionen, Hashes, Annahmezeitpunkte und Annahmen bleiben unverändert. Die Zuordnung ergänzt die bereits vorhandene Versionierung und ersetzt sie nicht.

## Platform Admin

Der Restaurantbereich zeigt lesend:

- bevorzugte Betriebssprache
- Geschäftsland und Rechtsraumquelle
- rechtlichen Prüfstatus
- veröffentlichte Dokumentversionen, Sprache, Rechtsraum und Anzahl der Annahmen

Die Daten kommen ausschließlich aus einer serverseitig geschützten Platform-Admin-RPC. Es gibt in Phase 1 keine Rechtsraum- oder Rechtstextbearbeitung.

## Formatierung

Datum, Zahl, Euro-Währung und Prozent erhalten zentrale Formatter. EUR bleibt die aktuelle Vertragswährung; internationale Preise sind nicht Bestandteil dieser Phase.

## UI-Inventar

Das reproduzierbare Inventar wird mit `node scripts/audit-i18n-hardcoded.mjs` erzeugt. Erfasst werden JSX-Texte sowie sichtbare Beschriftungsattribute. Der Phase-1-Stand enthält 1.906 Vorkommen:

| Bereich | Vorkommen | Zustand |
| --- | ---: | --- |
| Owner/Restaurant (`admin`) | 596 | HARDCODED |
| Customer | 438 | HARDCODED |
| Platform Admin | 336 | HARDCODED |
| Legal | 162 | HARDCODED, Datenmodell PARTIAL |
| Staff | 153 | HARDCODED |
| Auth | 89 | HARDCODED |
| Reports | 54 | HARDCODED |
| Shared UI | 38 | HARDCODED |
| App shell | 17 | HARDCODED |
| Public | 15 | HARDCODED |
| Campaign compatibility | 7 | HARDCODED |
| Tenant | 1 | HARDCODED |

E-Mail-Lokalisierung: READY. Browsererkennung und explizite UI-Präferenz: READY. Globale UI-Anbindung und vollständige Kataloge: PREPARED, noch nicht ausgerollt.

## Wiederverwendbare UI-Familien

- Buttons und mobile Aktionen: vorhandene `.button`-Varianten
- Eingaben und Auswahl: Formulare, `FormLabel`, `CountrySelect`, `CustomerPhoneField`
- Drawer/Dialoge: `AppDrawer`
- Karten, Badges, Tabellen, Tabs und Navigation: aktuell modulbezogen, in der Unified-UI-Phase zu vereinheitlichen
- Toasts, Leer-, Lade- und Fehlerzustände: vorhanden, aber Texte und Darstellungen noch verstreut
- QR: `OperationalQrCode`
- Medien: `SmartMediaEditor`, `SmartMediaFrame`, `RestaurantLogoStage`, `RewardImageFrame`

## Layout-Risiken für die nächste Phase

- `RestaurantOnboarding.tsx`: lange Formularhilfen und Aktionszeilen in DE/FR/IT/ES
- `StaffTablet.tsx`: dichte Buchungs-, PIN- und Einlösedialoge; CJK-Zeilenumbruch prüfen
- `CustomerPortal.tsx`, `CentralCustomerPage.tsx`, `CustomerOffersPage.tsx`: Karten, Preise und mobile Hauptaktionen
- `PlatformRestaurantControlCenter.tsx`, `PlatformOperationsPanel.tsx`, `PlatformAuditPage.tsx`: Tabellen, Statuszeilen und starke Bestätigungstexte
- `OwnerLegalSettingsPage.tsx`: lange Rechtstexte, Versionsmetadaten und fehlender Rechtsinhalt
- `SettingsPage.tsx` und Öffnungszeiten-Komponenten: schmale Labels und mehrspaltige Eingaben
- Navigationen aller drei Portale: FR/IT/ES-Längen sowie ZH/KO-Schriftmetriken

Für alle genannten Flächen sind 320 bis 430 px, Textvergrößerung, Umbruch ohne horizontales Scrollen und geeignete CJK-Systemschriften in der Unified-UI-/Übersetzungsphase physisch zu prüfen.

## Phase 3: Übersetzungs-First-Pass

Der reproduzierbare Phase-3-Quellscan umfasst 1.831 verwaltete Vorkommen und 1.405 eindeutige Quelltexte. Davon wurden exakt 1.217 als statische UI-Texte für den externen Übersetzungs-First-Pass freigegeben. 188 Texte blieben lokal und wurden nicht an einen Übersetzungsdienst übertragen. Die Positivliste ist im Klassifizierungsbericht festgehalten.

Für die 1.217 freigegebenen Texte sind Katalogeinträge für `de`, `en`, `fr`, `it`, `es`, `zh` und `ko` vollständig vorhanden. Schlüsselparität, geschützte Platzhalter, Markenbegriffe und die zentralen Produktbegriffe wurden automatisiert geprüft. ZH und KO wurden nach dem Rate-Limit des freigegebenen Dienstes ausschließlich lokal mit Offline-Modellen vervollständigt.

Der Runtime-Katalog übersetzt ausschließlich katalogisierte statische Quelltexte. Dynamische Restaurant-, Owner- und Kundendaten werden nicht verändert. Die explizite Sprachwahl bleibt von Rechtsraum und Geschäftsland unabhängig und wird lokal persistiert; ohne Präferenz gilt Gerätesprache und danach Englisch.

Status der Gesamtphase: `NOT READY`. Eine physische Prüfung hat sichtbare deutsche Resttexte in nicht-deutschen Oberflächen nachgewiesen. Sie entstehen aus JavaScript-Ausdrücken und zusammengesetzten Template-Strings, die nicht Bestandteil des eingefrorenen JSXText-/Attribut-Inventars und damit nicht Teil der exakt freigegebenen 1.217er Positivliste waren. Außerdem liegen übersetzbare Legal-UI-Beschriftungen innerhalb der 188 ausdrücklich lokal gehaltenen Texte. Bis eine ergänzende, neu geprüfte Positivliste freigegeben und vollständig verarbeitet ist, darf kein 7-Sprachen-`FINAL LOCK` gemeldet werden.

### Zweite Positivliste

Die Recovery-Inventur erweitert die Erkennung lokal um sichtbare JSX-Ausdrücke, bedingte Texte, Templates, Konkatenationen, UI-Konfigurationsobjekte, UI-Meldungssetter und Copy-Helper. Sie verändert weder den ersten freigegebenen Batch noch einen Sprachkatalog.

Die zweite Liste enthält 755 allgemeine statische UI-Texte und 265 Legal-UI-Beschriftungen, insgesamt 1.020 extern übersetzbare Kandidaten. Lokal ausgeschlossen bleiben 9 rechtliche Klausel-/Dokumenttexte, 5 Personen-/Beispielwerte und 16 technische Kennungen. Dynamische Owner-, Restaurant- und Kundendaten werden weiterhin nicht extrahiert. 105 Einträge enthalten geschützte Placeholder-Signaturen.

Der zugehörige Leakage-Scanner meldet für EN, FR, IT, ES, ZH und KO jeweils 1.020 noch nicht übersetzte Recovery-Texte. Das ist ein erwarteter roter Ausgangsstatus und kein Fehler des Scanners. Externe Übermittlung und Deployment sind bis zur Founder-Freigabe ausdrücklich gesperrt.
