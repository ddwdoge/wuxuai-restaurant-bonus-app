# Customer Mobile QR Registration Flow Fix

Datum: 2026-07-27  
Branch: `codex/v13-legal-maps-hardening`

## Ursache

Der öffentliche Portal-Loader führte den Supabase-RPC genau einmal aus. Ein
kurzer Netzwerk- oder Supabase-Fehler wurde deshalb sofort als endgültiger
Fehler angezeigt. Supabase selbst wird synchron beim Modulstart initialisiert;
eine asynchrone Client-Initialisierung vor der Restaurantabfrage besteht nicht.
Ohne den ursprünglichen Safari-Network-Log lässt sich nicht beweisen, ob der
konkrete erste Fehler vom Mobilnetz, Safari oder Supabase stammte. Der im Code
bestätigte UX-Fehler war die fehlende Fehlertoleranz.

Die Registrierungsansicht liegt im dunklen Sammeln-Flow. Die weiße Karte setzte
keine eigene Textfarbe und erbte dadurch helle Schrift. Der `Fertig`-Button war
nur an den Legal-Loader gebunden, nicht an alle Pflichtfelder.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customer-premium.css`
- `src/modules/customer/customerRedemptionSession.mjs`
- `src/modules/customer/customerRedemptionSession.d.mts`
- `src/modules/customer/customerRegistration.mjs`
- `src/modules/customer/customerRegistration.d.mts`
- `src/modules/loyalty/loyaltyService.ts`
- `tests/customer-mobile-registration-flow.test.mjs`
- `docs/19_CHANGELOG.md`

## Umsetzung

- Ein kontrollierter automatischer Retry nach 450 ms hält Restaurant-Slug und
  Kundenzugang unverändert.
- Bei Route-Wechsel wird vor dem zweiten Request abgebrochen.
- Erst nach zwei fehlgeschlagenen Versuchen erscheint der manuelle
  `Erneut versuchen`-Zustand.
- Restaurantfehler und ungültige Kundenzugänge werden nicht wiederholt.
- Alle sechs Checkboxen sind initial `false`.
- Der bestehende RPC besitzt ebenfalls `false` als Default für Marketing und
  Geburtstagsverarbeitung.
- Das bestehende native Geburtstagsfeld und seine freiwillige Verarbeitung
  wurden auf ausdrückliche Produktentscheidung nicht verändert.
- `Fertig` verlangt gültigen Vornamen, gültige Telefonnummer,
  Teilnahmebedingungen und Datenschutzkenntnisnahme.
- Freiwillige Optionen sind standardmäßig eingeklappt; eine feste mobile
  Aktionsleiste beachtet die Safe Area.

## Nicht geändert

- restaurantbezogene QR- und Tokenbindung
- Tages-PIN und Punkteberechnung
- Registrierungs-RPC und Datenbankstruktur
- bestehende Kundendaten
- Owner-, Staff- und Plattformportal
- RLS und Security-Policies

## Prüfung

- Staging-Restaurant `wuxuai-cafehous` wurde beim ersten lokalen Aufruf erkannt.
- Responsive Browserprüfung: 375, 390 und 430 px ohne horizontalen Overflow.
- Weiße Karte: Überschrift und Checkboxtexte `rgb(31, 31, 31)`.
- Geburtstagsfeld: bestehendes natives Datumsfeld unverändert.
- Checkboxen initial: 6 von 6 nicht ausgewählt.
- Nur beide Pflichtcheckboxen aktivieren den Button zusammen mit gültigem Namen
  und Telefon; freiwillige Checkboxen bleiben aus.
- Physischer iPhone-Safari-Test: offen.
- Vollständige echte Neuregistrierung und Punktebuchung wurden nicht ausgeführt,
  damit keine zusätzlichen Staging-Kundendaten erzeugt werden.

## Risiken

- Der konkrete ursprüngliche Safari-Request wurde nicht mit Network-Log
  aufgezeichnet; die genaue externe Fehlerquelle bleibt daher unbekannt.
- Physischer iPhone Safari, Bildschirmtastatur und erneuter QR-Scan eines realen
  Testkunden bleiben als manuelle Abnahme offen.

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 171/171 erfolgreich
- Build: erfolgreich
- Browserkonsole im lokalen geprüften Flow: 0 Fehler
- Unerwartete Netzfehler im lokalen geprüften Flow: 0
- Migration: keine
- RLS/Security: unverändert

Status: CHANGES_REQUIRED bis zur physischen Safari- und vollständigen
Staging-E2E-Abnahme.
