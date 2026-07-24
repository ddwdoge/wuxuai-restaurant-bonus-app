# Restaurant Growth OS v13 – Legal & Maps Hardening

Datum: 24.07.2026

Ausgangsbranch: `codex/legal-compliance-layer`

Ausgangscommit: `f9343f95d85e3d87ab4a1de02d18172751502289`

Arbeitsbranch: `codex/v13-legal-maps-hardening`

## Ursache

- Die Finder-Route war bereits lazy, importierte die vollständige Leaflet-Karte
  jedoch direkt. Dadurch wurde der rund 190-kB-Kartenchunk beim Öffnen des
  Finders sofort Teil der Seitenabhängigkeiten; die Owner-Einstellungen hatten
  denselben direkten Kartenimport.
- `legalCompliance.mjs` wurde über eine manuelle `.d.mts`-Datei typisiert.
- `get_public_legal_center` erzeugte bei normalen öffentlichen Aufrufen Legal-
  Vorlagen und war damit nicht read-only.
- Der öffentliche Portal-Load behandelte Legal-Fehler zu leise; die
  Registrierung durfte gleichzeitig nicht ohne Pflichtdokumente fortfahren.
- Identische Dokumentkopien mit Suffix ` 2.md` lagen unreferenziert im
  Dokumentationsbaum.

## Geänderte Bereiche

- `src/modules/customer/LazyPartnerRestaurantMap.tsx`
- `src/modules/customer/PartnerRestaurantFinderPage.tsx`
- `src/modules/customer/PartnerRestaurantMap.tsx`
- `src/modules/admin/pages/SettingsPage.tsx`
- `vite.config.ts`
- `src/modules/legal/legalCompliance.ts`
- `src/modules/legal/legalService.ts`
- `src/modules/legal/LegalCenterPage.tsx`
- `src/modules/legal/OwnerLegalSettingsPage.tsx`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/ReferralLanding.tsx`
- `supabase/migrations/20260724002000_legal_maps_hardening.sql`
- `tests/legal-compliance-layer.test.mjs`
- Architektur-, RPC-, Security-, Legal-Review- und Changelog-Dokumentation

Die alte `legalCompliance.mjs` und ihre manuelle `legalCompliance.d.mts` wurden
entfernt. Zehn byte-identische und unreferenzierte `* 2.md`-Dateien wurden nach
Hash-, Referenz- und Historienprüfung entfernt. Inhaltlich abweichende Dateien
mit gleichem Suffix bleiben erhalten.

## Maps Hardening

### Vorher

- App-Start: kein Leaflet im initialen Netzwerk.
- Finder-Öffnung: direkte Abhängigkeit auf den Kartenchunk.
- Kartenchunk: `190,77 kB`, gzip `54,70 kB`.
- Entry-Bundle: `23,80 kB`, gzip `7,52 kB`.
- Finder-Seitenchunk: `9,22 kB`, gzip `3,40 kB`.

### Nachher

- Karte wird über `React.lazy()` erst innerhalb des Finders beziehungsweise der
  Markervorschau geladen.
- `vendor-maps`: `186,90 kB`, gzip `53,12 kB`.
- Kartenkomponente: `1,77 kB`, gzip `1,04 kB`.
- Lazy-Wrapper: `1,39 kB`, gzip `0,75 kB`.
- Entry-Bundle: `23,81 kB`, gzip `7,53 kB`.
- Finder-Seitenchunk: `9,62 kB`, gzip `3,49 kB`.
- `node_modules`-Regel erfasst ausschließlich Leaflet, React Leaflet und Marker
  Cluster; lokale Source-Dateien werden nicht dem Vendor-Chunk zugeordnet.

Production Preview bestätigte: Die Startseite lud nur Entry, React, Router, UI
und Supabase, keinen Maps-Asset. Nach Öffnen des Finders wurden Lazy-Wrapper,
Kartenkomponente und `vendor-maps` nachgeladen. Vier Partnerrestaurants, Marker,
Cluster und OpenStreetMap-Attribution waren sichtbar. Im normalen Lauf gab es
keine Console- oder unerwarteten Netzwerkfehler.

Für den Negativtest wurde der generierte Maps-Chunk auf einem separaten
Preview-Port vorübergehend entfernt. Der deutsche Kartenfallback erschien,
während alle vier Restaurants und Aktionen in der Listenansicht nutzbar
blieben. Der Build wurde danach vollständig neu erzeugt.

## TypeScript-Migration

- Legal-Konstanten sind `as const` typisiert.
- `ConsentType` und `ParticipationTermField` werden aus den Konstanten
  abgeleitet.
- Keine `any`-Typen und keine manuelle Declaration-Datei.
- Die TypeScript-Implementierung wird im Test transkompiliert und tatsächlich
  ausgeführt; Typecheck validiert den Source-Vertrag.

## Public Legal Center und Backfill

Die additive Folgemigration:

- härtet `ensure_restaurant_legal_templates` so, dass vorhandene Titel,
  Versionen und veröffentlichte Versionen nicht überschrieben werden,
- ergänzt nur fehlende Profile, Dokumente, Erstversionen und Retention-Regeln,
- führt einen einmaligen idempotenten Backfill für bestehende Restaurants aus,
- entfernt jede Template-Erzeugung aus `get_public_legal_center`,
- liefert bei fehlender Konfiguration `legal_ready = false` und
  `missing_configuration = true`,
- lässt die kontrollierten Owner-Pfade `get_restaurant_legal_setup` und
  `save_restaurant_legal_setup` unverändert als Initialisierungswege bestehen,
- prüft Pflichtdokumente serverseitig vor normaler und Referral-Registrierung.

Die `SECURITY DEFINER`-Funktionen besitzen einen festen `search_path`. Grants
werden explizit neu gesetzt. Es wurden keine RLS-Policies geändert, keine
Public-Select-Policy ergänzt und keine Tabellenrechte geöffnet.

## DSGVO-Datenexport

Legal-Annahmen enthalten nur:

- Dokumenttyp und -titel
- Version und Hash
- Gültigkeitsdatum
- Annahmezeit
- Sprache und Quelle

`rendered_text`, HTML, Markdown und Template-Inhalte werden nicht in den
personenbezogenen Export aufgenommen. Kunden- und Restaurant-Scope bleiben über
Tokenauflösung und explizite Filter erhalten.

## Portal-Fehlerverhalten

- Bestehende Kunden laden Restaurant, Punkte und Punkteeinlösungen unabhängig
  vom Legal Center.
- Bei Legal-RPC-Fehler bleibt das Bonuskonto nutzbar; ein ruhiger Hinweis und
  Retry werden angezeigt.
- Neue Registrierungen und Referral-Registrierungen bleiben bis zum Laden
  veröffentlichter Pflichtdokumente deaktiviert.
- Fehlende Konfiguration besitzt einen eigenen sichtbaren Zustand.
- Restaurant-/Token-Priorität und QR-Kontextlogik wurden nicht verändert.

## Consent-Nachweis

Dokumentiert wurden Restaurant, Kunde, Einwilligungsart, Dokumentversion/-hash,
Serverzeit, Quelle, optional minimierte Browserklasse, pseudonymisierte
Sitzungs-/Anfragekennung und Testsession. Vollständige IP-Adressen bleiben
ausgeschlossen. Die juristische Eignung je Kommunikationskanal, möglicher
Double-Opt-in für SMS/E-Mail und die Trennung von Browser-Push-Permission und
Marketingeinwilligung bleiben ausdrücklich Gegenstand rechtlicher Prüfung.

## Tests und Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bereits bestehende Warnungen
- Tests: 134/134 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Bundle-Analyse: erfolgreich
- Production Preview: erfolgreich
- Normaler Preview: 0 Console Errors, 0 unerwartete Network Errors
- Maps-Importfehler: kontrollierter Fallback, Liste bleibt funktionsfähig

## Migration und Staging

- Migration erstellt: Ja, `20260724002000_legal_maps_hardening.sql`
- `npx supabase db push --dry-run --include-all`: erfolgreich
- Migration angewendet: Nein
- Dry-Run zeigt zwei ausstehende Migrationen:
  - `20260724001000_legal_compliance_layer.sql`
  - `20260724002000_legal_maps_hardening.sql`
- Production wurde nicht verändert.

## Was nicht geändert wurde

- Keine Punkte-, Reward-, Referral-, Bonus-Boost-, KPI- oder QR-Produktlogik
- Keine RLS-Lockerung
- Keine neuen Public-Select-Policies
- Keine IP-Speicherung
- Keine Retention-Ausführung statt Dry-Run
- Kein Merge nach `main`
- Kein Deployment

## Offene Risiken

- Beide Legal-Migrationen müssen in Reihenfolge auf Staging angewendet und die
  RPCs dort live geprüft werden, bevor eine finale Freigabe möglich ist.
- Standardvorlagen ersetzen keine österreichische Rechts- und Steuerprüfung.
- Consent-Nachweis und Double-Opt-in-Anforderungen sind je Kanal juristisch zu
  bestätigen.
- Physischer Mobile-Safari- und Screenreader-Test bleibt offen.

Status: **READY_FOR_REVIEW**
