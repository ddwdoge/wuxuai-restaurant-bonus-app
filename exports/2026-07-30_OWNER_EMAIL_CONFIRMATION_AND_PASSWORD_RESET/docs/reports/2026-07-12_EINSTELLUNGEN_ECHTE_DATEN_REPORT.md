# Einstellungen echte Daten Report

Datum: 2026-07-12  
Status: LOCK

## Ursache / Ziel

`/admin/settings` zeigte bisher nur Navigationskarten und Platzhalter-Unterseiten. Das war für V1 nicht ausreichend, weil Restaurantbesitzer echte Einstellungen sehen und speichern können müssen.

Ziel war eine echte Verwaltungsseite ohne Fake-Klicks, ohne Dummy-Daten und ohne Buttons ohne Funktion.

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist im Repository nicht vorhanden. Die Selbstkontroll-Regeln wurden über die vorhandenen LOCK-Dokumente angewendet.

## Geänderte Dateien

- `src/modules/admin/pages/SettingsPage.tsx`
- `src/modules/tenant/TenantProvider.tsx`
- `src/shared/types/domain.ts`
- `src/styles.css`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## Echte Datenquellen

- `restaurants`
  - `name`
  - `slug`
  - `status`
  - `owner_phone`
  - `language`
  - `opening_hours`
  - `primary_branch_id`
  - `organization_id`
- `restaurant_branding`
  - `logo_url`
  - `primary_color`
  - `secondary_color`
  - `button_color`
  - `font_family`
- `branches`
  - Fallback zum Finden der ersten Branch, wenn `primary_branch_id` fehlt.
- `branch_subscriptions`
  - `subscription_status`
  - `payment_status`
  - `plan_key`
  - `trial_started_at`
  - `trial_ends_at`

## Bearbeitbare Felder

### Restaurantdaten

Bearbeitbar:

- Restaurantname
- Telefon

Nur angezeigt:

- Restaurant-Link
- Status
- Sprache

Adresse, Website und Beschreibung wurden nicht gebaut, weil dafür keine stabile Restaurant-Spaltenbasis im aktuellen Schema gefunden wurde.

### Branding

Bearbeitbar:

- Logo
- Markenfarbe
- Buttonfarbe

Logo-Upload nutzt den bestehenden Storage-Bucket `restaurant-media` mit Pfad:

```text
restaurant-media/{restaurant_id}/branding/logo-{timestamp}.{ext}
```

Unterstützt:

- PNG
- JPG
- JPEG
- SVG
- maximal 5 MB

### Öffnungszeiten

Bearbeitbar:

- Montag bis Sonntag
- geöffnet / geschlossen
- von
- bis

Gespeichert wird in `restaurants.opening_hours`.

## Link-Karten

Diese Karten führen zu echten bestehenden Seiten:

- Punkteeinlösung → `/admin/rewards`
- Willkommensgeschenke → `/admin/welcome-gifts`
- Mitarbeiter & Tages-PIN → `/admin/staff`
- QR & Starter Kit → `/admin/qr`

Die Tages-PIN ist nicht manuell bearbeitbar.

## Nicht klickbare Info-Karten

Keine fake-klickbaren Info-Karten wurden eingebaut.

`Abo & Testphase` lädt echte Daten, wenn `branch_subscriptions` vorhanden ist. Wenn keine Subscription vorhanden ist, zeigt die Seite:

```text
Kein Abo eingerichtet
Abo-Verwaltung wird später aktiviert.
```

## Entfernte Platzhalter

Entfernt wurde die alte Detailseite mit:

```text
Die Inhalte für diesen Bereich folgen später.
```

Der globale Save-Button ohne echte Speicherfunktion wurde entfernt.

## Speicherlogik

- Restaurantdaten speichern per Supabase-Update auf `restaurants`.
- Branding speichert per Upsert auf `restaurant_branding`.
- Logo wird vor dem Branding-Upsert in Supabase Storage hochgeladen.
- Öffnungszeiten speichern per Supabase-Update auf `restaurants.opening_hours`.
- Nach Speicherung wird der Tenant-Kontext aktualisiert.

## RLS / Security Prüfung

Statisch geprüft:

- Keine Service-Role im Frontend.
- Supabase-Operationen laufen mit normalem User-Kontext.
- Updates sind auf `details.id` des aktiven Tenant-Restaurants beschränkt.
- RLS bleibt primäre Sicherheit.
- Keine fremden Restaurantdaten werden absichtlich geladen.

Live-RLS gegen Staging wurde in diesem Schritt nicht ausgeführt.

## Mobile Prüfung

Statisch geprüft:

- Einstellungen bleiben Mobile-first.
- Karten sind einspaltig auf Mobile.
- Formulare sind einspaltig auf Mobile.
- Öffnungszeiten wechseln erst ab größerer Breite in ein Mehrspaltenlayout.
- Buttons bleiben sichtbar und umbrechen.
- Kein horizontales Scrollen wurde durch neue feste Breiten eingeführt.

## Build-Ergebnis

`npm run build` erfolgreich.

Wichtige Ausgabe:

- `SettingsPage-BzCLsXxq.js`: 15.90 kB, gzip 4.66 kB
- Build abgeschlossen ohne TypeScript- oder Vite-Fehler.

## Offene Risiken

- Live-Test gegen Supabase Staging wurde nicht durchgeführt.
- Logo-Upload hängt von bestehenden Storage-Policies ab.
- Abo/Testphase ist nur Anzeige. Keine Stripe- oder Payment-Aktion wurde gebaut.
- Adresse, Website und Beschreibung bleiben bewusst ungebaut, bis das Schema dafür stabil freigegeben ist.

## Status

LOCK
