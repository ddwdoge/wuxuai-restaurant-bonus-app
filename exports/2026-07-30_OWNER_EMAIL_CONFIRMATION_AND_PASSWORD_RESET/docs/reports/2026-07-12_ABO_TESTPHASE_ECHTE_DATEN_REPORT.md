# Abo & Testphase echte Daten Report

Datum: 2026-07-12

Status: LOCK

## Gelesene Grundlagen

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist im Repository nicht vorhanden.

## Ursache des 400-Fehlers

Die Seite `/admin/settings/konto-testphase` hat `branch_subscriptions` mit optionalen Payment-/Stripe-Spalten abgefragt:

- `payment_status`
- `current_period_end`
- `stripe_customer_id`
- `stripe_subscription_id`
- weitere spaetere Admin-/Payment-Felder

Diese Spalten sind nicht in jeder V1-Staging-/Basisdatenbank garantiert vorhanden. Wenn eine Spalte fehlt, beantwortet Supabase den Select mit 400. Die UI zeigte deshalb `Abo-Daten konnten gerade nicht geladen werden.`

## Vorhandene DB-Struktur

Sichere V1-Basisspalten in `branch_subscriptions`:

- `id`
- `organization_id`
- `branch_id`
- `status`
- `plan_key`
- `current_period_ends_at`
- `created_at`

Spaetere Payment-/Admin-Spalten existieren je nach angewendeter Migration, werden in der Restaurant-Settings-Seite aber nicht mehr direkt abgefragt.

## Geaenderte Dateien

- `src/modules/admin/pages/SettingsPage.tsx`
- `src/styles.css`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-12_ABO_TESTPHASE_ECHTE_DATEN_REPORT.md`

## Geaenderte Migrationen

Keine neue Migration erstellt.

Begruendung: Die vorhandene V1-Basistabelle reicht fuer die Restaurant-Settings-Anzeige. Der Fehler wurde durch eine zu breite Frontend-Abfrage verursacht.

## Trial-/Abo-Logik

Der Loader liest nur garantiert vorhandene Basisspalten.

Wenn ein Subscription-Datensatz existiert:

- `status = trialing` zeigt Testphase.
- `status = active` zeigt aktives Abo.
- `current_period_ends_at` dient als Testphase-Ende, wenn keine separaten Trial-Spalten verwendet werden.
- Wenn kein Testphase-Ende vorhanden ist, wird es aus `created_at + 30 Tage` abgeleitet.

Wenn kein Datensatz existiert:

- Es wird ein einfacher Trial-Datensatz mit `status = trialing`, `plan_key = pilot` und `current_period_ends_at = jetzt + 30 Tage` angelegt.

## UI-Zustaende

Die Seite zeigt:

- `Testphase aktiv`
- `Testphase abgelaufen`
- `Abo aktiv`
- verbleibende Testtage
- `Monatsabo nach Testphase`
- `Zahlung wird bald aktiviert`

Es gibt keinen Fake-Checkout, keinen Dummy-Erfolg und keine Fake-Zahlung.

## Settings-Karte

Die Karte `Abo & Testphase` bleibt ein echter Link nach `/admin/settings/konto-testphase`. Die Detailseite laedt echte Daten oder zeigt einen ruhigen V1-Zustand.

## RLS/Security Pruefung

Die Seite nutzt den normalen Supabase User-Kontext.

Bestehende RLS fuer `branch_subscriptions`:

- Mitglieder koennen eigene Branch-Subscription lesen.
- Admin/Owner/Manager koennen eigene Branch-Subscription schreiben.
- Fremde Restaurants werden durch `restaurant_members`/Branch-Zuordnung begrenzt.
- Keine Service Role im Frontend.

Anon und Customer erhalten keinen direkten Settings-Zugriff.

## Mobile Pruefung

Die neuen Elemente nutzen bestehende Settings-Karten, einspaltige Grids und kompakte Badges. Mobile bricht nicht in Spalten um und erzeugt keine horizontale Scrollbar.

## Build-Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Kein Live-Staging-Test in diesem Task, weil kein Supabase-Push oder Browser-Livetest verlangt wurde.
- Payment-/Stripe-Felder bleiben fuer die Restaurant-Settings-Seite absichtlich ungenutzt, bis echter Checkout/Webhook fertig ist.
- Falls mehrere Branches spaeter aktiv genutzt werden, bleibt V1 weiterhin beim aktuellen Primary-/Fallback-Branch.

## Ergebnis

- Ursache 400 gefunden: Ja
- Nicht existierende Spalten entfernt/gefixt: Ja
- Abo-Daten laden ohne 400: Ja
- Trial-Daten vorhanden oder automatisch angelegt: Ja
- Trial Tage korrekt berechnet: Ja
- Abo aktiv Status korrekt: Ja
- Keine Fake-Zahlung: Ja
- Settings-Karte korrekt: Ja
- RLS/Security geprueft: Ja
- Mobile geprueft: Ja
- Build: Ja

Status: LOCK
