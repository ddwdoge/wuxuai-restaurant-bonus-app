# Tages-PIN Mitarbeiteransicht Fix Report

Datum: 2026-07-10

Status: NOT READY

## Aufgabe

Die Mitarbeiteransicht sollte bei `/staff/akakiko-hietzing` nicht dauerhaft `----` anzeigen, sondern die heutige automatisch erzeugte 4-stellige Tages-PIN laden und sichtbar machen.

## Ursache für `----`

Die Tages-PIN wurde in `src/modules/staff/StaffTablet.tsx` zusammen mit Mitarbeiterdaten, Gästen, Regeln und Belohnungen in einem gemeinsamen `Promise.all` geladen.

Wenn einer dieser optionalen Staff-Datenaufrufe scheiterte, wurde der gesamte Ladeblock abgebrochen. Dadurch wurde `todayPin` nie gesetzt und die UI zeigte den Fallback `----`.

Zusätzlich war `----` ein stiller Fehlerzustand. Restaurantmitarbeiter konnten nicht erkennen, ob die PIN noch lädt, fehlt oder durch Supabase/RLS blockiert wurde.

## Ursache für `Mitarbeiterdaten konnten nicht geladen werden`

Die Meldung stammt aus demselben gemeinsamen Ladeblock. Fehler aus `loadLoyaltySettings`, `loadLoyaltyRules`, `loadCustomers`, `loadRewardOffers` oder bisher auch `loadTodayRestaurantPin` wurden gemeinsam behandelt.

Dadurch konnte ein Fehler in optionalen Mitarbeiterdaten die Tages-PIN optisch blockieren.

## Geänderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/styles.css`

## Fix

### Staff-Kontext

`StaffTablet` liest jetzt den Restaurant-Slug aus `/staff/:slug` und sucht das passende Restaurant in den geladenen Tenant-Restaurants.

Damit verwendet `/staff/akakiko-hietzing` nicht mehr blind das aktive Admin-Restaurant, sondern den Restaurant-Kontext aus der Staff-URL.

### Tages-PIN separat laden

Die Tages-PIN wird separat über `loadTodayRestaurantPin(restaurantId)` geladen.

Der PIN-Ladepfad ist nicht mehr vom Laden von Gästen, Regeln, Belohnungen oder Mitarbeiterdaten abhängig.

### Sichtbare Zustände

Die UI zeigt jetzt:

- `Tages-PIN wird geladen...`
- echte 4-stellige PIN bei Erfolg
- `Tages-PIN konnte gerade nicht geladen werden.` bei Fehler

Der sichtbare Fallback `----` wurde entfernt.

## RPC / Migration

Keine neue Migration.

Keine RPC geändert.

Bestehende RPC:

- `get_today_restaurant_pin(input_restaurant_id uuid)`

Die RPC:

- prüft `is_restaurant_member(input_restaurant_id)`
- ruft `ensure_today_restaurant_pin(input_restaurant_id, null)` auf
- erstellt serverseitig eine PIN, falls noch keine existiert
- gibt `pin_code` und `valid_until` zurück

## Sicherheitsprüfung

Geprüft im vorhandenen SQL:

- `restaurant_daily_pins` hat RLS aktiv.
- Direkter Select ist nur für Restaurantmitglieder erlaubt.
- Die Staff-Seite liest keine PIN direkt aus Tabellen.
- Die PIN wird nicht im Kundenportal angezeigt.
- Keine Service-Role im Frontend.
- Kein Frontend-Zufallscode.
- Kein Demo-PIN-Fallback in Supabase-Betrieb.

## Lokaler Test

Durchgeführt:

- Codepfad geprüft.
- Build ausgeführt.
- TypeScript erfolgreich.

Nicht vollständig durchgeführt:

- Echte Anzeige einer Supabase-PIN in `/staff/akakiko-hietzing`, weil dafür eine gültige authentifizierte Restaurantmitglied-Session im Browser erforderlich ist.
- Richtige/falsche Tages-PIN bei Punktebuchung live gegen Staging.

## Staging-Test

Nicht durchgeführt.

Grund: Dieser Fix ändert keine Migration und keine RPC. Die vorherige Staging-Validierung für die Tages-PIN war bereits als offen dokumentiert. Ein vollständiger Staging-Test bleibt erforderlich, um die echte Supabase-PIN, automatische Erstellung und Punktebuchung mit richtiger/falscher PIN live zu bestätigen.

## Build-Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Wenn die Migration `20260709004000_tages_pin_reward_redemption_lock.sql` nicht auf Staging/Production angewendet ist, kann die RPC `get_today_restaurant_pin` weiterhin fehlen oder fehlschlagen.
- Wenn der eingeloggte Benutzer kein Restaurantmitglied für den Staff-Slug ist, gibt die RPC korrekt `Nicht berechtigt.` zurück.
- Ein echter Browser-Test mit authentifizierter Staff-/Owner-Session steht noch aus.
- Die angeforderte Datei `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert nicht im Projekt. Die Selbstkontroll-Regeln wurden aus `AGENTS.md`, `docs/18_CODEX_REGELN.md` und `docs/17_CTO_ENTSCHEIDUNGEN.md` angewendet.

## Status

NOT READY

