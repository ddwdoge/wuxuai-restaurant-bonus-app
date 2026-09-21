# WUXUAI® BONUS – Phase 7C.5 Owner Capacity UI und Warnvertrag

Datum: 2026-09-21
Branch: `codex/v1-release-integration`
Ausgangs-HEAD: `7d57e73634a8052587e580b0ba82e11b86ccd72e`
Status: **OWNER CAPACITY UI LOCAL CODE LOCK / WARNING DISPATCH NOT READY – FOUNDER DECISION REQUIRED**

## Ursache

Die serverseitigen Capacity-Resolver und das Offer-/Customer-Enforcement waren
bereits kanonisch, dem Owner fehlte jedoch eine vollständige, schreibfreie
Darstellung von Tarif, Nutzung, Add-ons, Restkapazitaet und Over-Limit-Zustand.
Der Founder-Vertrag bestaetigt 80/90/100 Prozent, sieben Tage Prognosehorizont
und mindestens 28 vollstaendige Historientage. Er definiert noch nicht den
exakten Deduplizierungsschluessel, das Wiederholungsintervall, den Cooldown und
die Entwarnungs-/Rearm-Regel. Deshalb wurde kein Warning-Dispatcher gebaut.

## Geaenderte Dateien

- `supabase/migrations/20260921004000_owner_capacity_read_contract.sql`
- `src/modules/capacity/ownerCapacityService.ts`
- `src/modules/capacity/ownerCapacityMessages.mjs`
- `src/modules/capacity/ownerCapacityMessages.d.mts`
- `src/modules/admin/pages/OwnerCapacityPage.tsx`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/app/App.tsx`
- `src/styles.css`
- `tests/phase-7c5-owner-capacity-ui.test.mjs`
- `tests/phase-7c5-owner-capacity-contract.local.sql`
- `tests/phase6-mobile-reference.test.mjs`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Was wurde geaendert

- Neue Owner-Route `/admin/settings/tarif-kapazitaet`, auffindbar unter
  Einstellungen.
- Ein autorisierter Snapshot zeigt effektiven Tarif und Preis, Land,
  Commercial-Lock, Payment-Status, Basislimit, aktive Add-on-Einheiten,
  Add-on-Kapazitaet, Gesamtlimit, Nutzung, Restkapazitaet, Zeitraum und
  `as_of`.
- `AVAILABLE`, `WARNING_80`, `WARNING_90`, `AT_LIMIT` und `OVER_LIMIT` werden
  serverseitig aus Resolverwerten bestimmt. Preise und Produktlimits werden
  nicht im Client hardcodiert.
- Die Over-Limit-Ansicht erhaelt vorhandene Inhalte und erklaert, dass nur
  weitere Aktivierung serverseitig blockiert wird.
- „Kapazitaet erhoehen“ oeffnet nur eine Informationsansicht. Sie besitzt
  keinen Checkout und keine Mutation.
- Status-, Limit- und Add-on-Texte sind fuer DE/EN/FR/IT/ES/ZH/KO vorhanden.
- Fortschrittsanzeigen besitzen Text und ARIA-Werte; Warnungen verwenden
  Symbol und Text statt Farbe allein.

## Was wurde nicht geaendert

- Keine Migration 153, 154 oder 155 wurde veraendert.
- Kein Warning-Dispatcher, Scheduler, Outbox-Write, App-Versand oder
  E-Mail-Versand.
- Keine Add-on-Buchung, automatische Abbuchung oder Tarif-/Entitlement-
  Aenderung.
- Keine Lockerung von RLS, Country Gate, Commercial Release Lock oder
  TEST_ONLY-Vertraegen.
- Kein Commit, Push, Staging-Zugriff, Deployment, Stripe- oder
  Production-Zugriff.
- Keine realen Produkt-, Kunden-, Subscription- oder Billingdaten wurden
  veraendert.

## Datenbank und Sicherheit

Die additive lokale Migration 156 ersetzt nur die bestehende Funktion
`get_restaurant_capacity(uuid)`. Der zentrale interne Capacity-Resolver bleibt
Autoritaet. Die Funktion ist `stable`, `security definer`, besitzt einen festen
`search_path` und prueft Owner- beziehungsweise Platform-Admin-Autoritaet.
Direkter Aufruf bleibt fuer `public`, `anon` und `service_role` entzogen;
`authenticated` erhaelt nur den funktionsintern autorisierten Aufruf.

Die lokale SQL-Matrix bestaetigte Owner-Zugriff, Cross-Tenant-Sperre,
Anonymous-Sperre, fehlende Browserfreigabe interner Resolver, BASIC 0/5,
4/5, 5/5 und 6/5 sowie die autoritativen Add-on-Katalogwerte. Der Snapshot
enthaelt keine Kundenidentitaeten und keine andere PII. AT blieb LOCKED.

## Migrationstests

- Fresh-Replay durch Migration 156: PASS
- Historischer Replay bis Migration 155: PASS
- Upgrade 155 → 156: PASS
- zweifache direkte Wiederholungsanwendung: PASS
- Funktionsdefinition nach Repeat byte-stabil: PASS
- lokaler DB-Lint auf Fehlerniveau: PASS

Die lokale Browser-Fixture war vollstaendig synthetisch. Fuer den bereits
vorhandenen Kassa-Gate-Test wurde nur im isolierten lokalen Stack die
synthetische Owner-Bestaetigung gesetzt. Es gab keine reale Datenmutation.

## UI-, Responsive- und Browserpruefung

Chromium und WebKit wurden bei 320, 375, 390, 430, 767, 768, 1024 und
1440 CSS-px geprueft. Alle sieben Sprachen renderten ohne Runtime-Fehler oder
sichtbare Translation Keys. Es gab keinen horizontalen Overflow. Alle
sichtbaren Buttons und Links waren mindestens 44 CSS-px gross.

Seitenaufruf und die Drawer-Schliesswege X, Escape und Abbrechen erzeugten
jeweils null schreibende Netzwerkaufrufe. Tastaturbedienung und der bestehende
Drawer-Vertrag blieben erhalten.

## Testergebnisse

- Focused Capacity-UI-Tests: PASS, 8/8
- Warning-Contract-Tests: PASS fuer den deaktivierten Zustand; Dispatcher
  absichtlich nicht implementiert
- Security Contracts: PASS
- Full Tests: PASS, 1914/1914
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 8 vorbestehende Warnungen ausserhalb des Scopes
- Build: PASS; bekannte Vite-Chunk-Groessenwarnung
- `git diff --check`: PASS

## Offene Founder-Entscheidung

Vor einem Warning-Dispatcher muessen verbindlich festgelegt werden:

1. exakter idempotenter Deduplizierungsschluessel je Kapazitaetsart und Kanal;
2. Wiederholungsintervall und Cooldown;
3. Entwarnungs- und erneute Aktivierungsregel;
4. Verhalten bei gleichzeitigem Schwellen- und Prognoseereignis.

Bis dahin bleiben `dispatch_active=false` und `forecast_active=false`. Das
Oeffnen der Owner-Seite erzeugt niemals ein Warnereignis.

## Risiken

- Die UI-Migration ist nur lokal geprueft und nicht auf Staging angewendet.
- App- und E-Mail-Warnungen sind fachlich absichtlich nicht bereit.
- Der spaetere Billing-Anschluss benoetigt eine separat freigegebene,
  schreibende Schnittstelle; aktuell existiert nur die Informationsansicht.

## Prozessbereinigung

- Task-eigene Hintergrundprozesse gestartet: 2 (lokaler Supabase-Stack und
  Vite-QA-Server)
- Task-eigene Hintergrundprozesse gestoppt: 2
- Task-eigene Hintergrundprozesse noch aktiv: 0
- Fremde Container oder Prozesse veraendert: Nein
- RAM-Cleanup: PASS

## Abschluss

- Aufgabe: Phase 7C.5 Owner Capacity UI; Warning-Vertrag bis zur sicheren Stopgrenze
- Build: Ja
- Migration: Erstellt, nur lokal; nicht auf Staging angewendet
- Flow-Test: Ja, lokal in Chromium und WebKit
- RLS/Security: Ja
- Alte Logik geprueft: Ja
- Offene Risiken: Warning-Dispatch-Entscheidung und spaeteres Staging-Gate
- Status: **OWNER CAPACITY UI LOCAL CODE LOCK / WARNING DISPATCH NOT READY – FOUNDER DECISION REQUIRED**
