# KPI-Fix und Audit-Merge Report

Datum: 20.07.2026

## Ausgangsstand

- Arbeitsbranch: `fix/premium-kpis-redemption`
- uncommitteter Premium- und Audit-Stand wurde als Ausgangsbasis erhalten
- Referenzen:
  - `exports/2026-07-20_CUSTOMER_PREMIUM_DESIGN_KPI_FIX.zip`
  - `exports/2026-07-20_AUDIT_UND_SICHERER_TESTMODUS.zip`
- keine vollständige Datei aus der älteren KPI-ZIP überschrieben

## Portierte Korrekturen

1. Einlösecode nach Reload nur nach tokengebundener Serverprüfung anzeigen.
2. `Kunden gesamt` im Dashboard anzeigen.
3. `Neue Kunden diese Woche` ab Montag 00:00 in Restaurant-Zeitzone berechnen.
4. `Heute aktiv` als eindeutige Gäste mit final erfolgreicher Loyalty-Aktion zählen.
5. `Einlösungen heute` um finale Punkte-Einlöseereignisse ergänzen.

## Verworfen aus der Referenz

- `redemption_started` als verbraucht zu behandeln
- Session Storage direkt nach Code-Erstellung zu löschen
- Browser-Zeitzone als Business-Wahrheit zu verwenden
- ungefilterte Tabellen-Counts ohne Testkundenausschluss
- jedes `reward_redemption_event` unabhängig vom finalen Status zu zählen
- Emoji-Icons und den älteren Dashboard-/App-Stand zu übernehmen

## Datenquellen

- Kunden gesamt: eindeutige Zeilen aus `customers`
- Neue Kunden heute/diese Woche: `customers.created_at`
- Heute aktiv: Union der Kunden-IDs aus erfolgreichen `points_transactions`,
  `stamp_transactions`, finalen `reward_redemption_events`, finalen
  Welcome-/Birthday-`customer_rewards` und `coupon_redemptions`
- Einlösungen heute: stabile, quellpräfixierte IDs aus finalen Geschenk-,
  Punkte- und Coupon-Einlösungen
- Punkte/Stempel heute: erfolgreiche Earn-Transaktionen

Alle kundenbezogenen Quellen filtern `is_test_customer = false` und
`restaurant_id = input_restaurant_id`.

## Zeit und Deduplizierung

`get_restaurant_dashboard_kpis` verwendet `restaurants.timezone_name`, mit
`Europe/Vienna` als validiertem Fallback. Tagesgrenzen berücksichtigen
Sommer-/Winterzeit. Die Woche beginnt über ISO-Wochentag am Montag. `Heute
aktiv` verwendet `count(distinct customer_id)`. Einlösungen verwenden
quellpräfixierte fachliche IDs und ausschließlich finale Statuswerte.

## Redemption-Reload

Der Client speichert zusätzlich `redemption_id`. `get_customer_redemption_status`
validiert Restaurant-Slug, Kundentoken, Restaurantzugehörigkeit, Code- und
Quellstatus. Nur `active` plus `started` beziehungsweise
`redemption_started` wird wiederhergestellt. Der offene Drawer fragt den
Server periodisch ab und entfernt den Code nach bestätigtem Verbrauch.

## Migration und Sicherheit

- Migration: `20260720003000_dashboard_kpis_and_redemption_status.sql`
- Dry-Run: erfolgreich
- Staging-Push: erfolgreich
- lokale/remote Historie: synchron
- anonyme Status-RPC: HTTP 200 mit sicherer Negativantwort
- KPI-RPC: nur `authenticated`, zusätzlich Restaurantmitgliedschaft geprüft
- Status-RPC: `anon`/`authenticated`, aber nur tokengebundene Minimalantwort
- RLS nicht gelockert
- Auditroute `/admin/platform/audit` und `PlatformAuditPage` erhalten

## Tests

- Typecheck: erfolgreich
- Tests: 43/43 erfolgreich
- Lint: 0 Fehler, 9 vorhandene Warnungen
- Build: erfolgreich
- responsive Raster: 390 px eine Spalte, 768 px zwei Spalten, 1440 px vier Spalten

## Offene Risiken

- Ein erneuter vollständiger Staging-E2E-Lauf mit markiertem Testkunden und
  authentifiziertem Restaurant-Owner war ohne gültigen Testzugang in dieser
  Sitzung nicht möglich.
- Deshalb sind reale KPI-Vorher-/Nachher-Werte sowie die Audit-Testsession nach
  diesem Merge noch nicht abschließend bestätigt.

## Status

NOT READY bis der kontrollierte Staging-Testkundenlauf einschließlich
Owner-Dashboard und Audit-Testsession abgeschlossen ist.
