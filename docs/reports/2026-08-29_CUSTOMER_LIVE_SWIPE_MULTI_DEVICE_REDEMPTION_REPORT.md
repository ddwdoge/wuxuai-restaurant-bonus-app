# WUXUAI Bonus - Customer Live Swipe und Multi-Device Redemption

Datum: 2026-08-29  
Status: CODE LOCK  
Production: LOCKED  
Stripe: DEFERRED

## Ursache

Der bisherige Presentation-Start war zugleich die fachliche Einloesung: Bei
Punktebelohnungen wurden Punkte bereits beim Oeffnen abgezogen; Gift-Fenster
wurden nach Ablauf automatisch als eingeloest abgeschlossen. Damit war die
sichtbare Kundenbestaetigung nicht der autoritative Einloesezeitpunkt und zwei
offene Geraete konnten keinen klaren Live-Nachweis liefern.

## Umsetzung

- Das Oeffnen startet nur noch ein serverseitiges 15-Minuten-Fenster mit Status
  `REDEMPTION_STARTED`.
- Ein bewusster Links-nach-rechts-Swipe bestaetigt die Einloesung. Ein Tap oder
  das blosse Oeffnen loest nichts ein.
- `confirm_customer_redemption_swipe` fuehrt den finalen Zustandswechsel fuer
  Punktebelohnungen, Willkommens- und Geburtstagsgeschenke aus.
- Die Funktion serialisiert konkurrierende Aufrufe mit einem transaktionalen
  Advisory Lock, sperrt Customer und Presentation per `FOR UPDATE` und nutzt
  einen bedingten Compare-and-set-Update von `REDEMPTION_STARTED` auf
  `REDEEMED`.
- Punktabzug, Reward-Event, Journal, Audit und Presentation-Abschluss liegen in
  derselben Datenbanktransaktion.
- Derselbe Idempotency-Key liefert beim Retry das vorhandene Ergebnis. Ein
  zweiter Geraete-Key erhaelt `ALREADY_REDEEMED` mit serverseitigem
  `redeemed_at`.
- Abgelaufene Vorbereitungen werden `EXPIRED`; sie verbrauchen weder Punkte noch
  Geschenke.
- Bei unklarem Netzwerkzustand fragt der Client den autoritativen
  Presentation-Status ab. Erfolg wird niemals optimistisch angezeigt.
- Der bestehende Polling-Vertrag aktualisiert ein zweites offenes Geraet; die
  Datenbank bleibt auch ohne sofortiges UI-Update autoritativ.

## Security-Definer-Vertrag

Neue Funktion:

`public.confirm_customer_redemption_swipe(text, text, uuid, uuid)`

Zweck: finale, atomare Kundenbestaetigung fuer Punkte- und Gift-Einloesungen.

Berechtigungen:

- `EXECUTE`: `anon`, `authenticated`, passend zum bestehenden gehashten
  Customer-Token-Vertrag.
- `PUBLIC`: entzogen.
- Direkte Tabellenrechte auf Presentation-Tabellen: entzogen.
- Tenant, Customer-Token, Restaurant, Branch, Benefit, Gueltigkeit,
  Berechtigung und Kontostand werden innerhalb der Funktion geprueft.

Sicherer `search_path`:

`public, extensions, pg_temp`

Die Migration ersetzt ausserdem die bestehenden Start-, Lade- und
Ablauffunktionen mit festem `search_path`, ohne RLS zu deaktivieren.

## Geaenderte Dateien

- `supabase/migrations/20260829002000_customer_swipe_redemption_atomic_confirmation.sql`
- `src/modules/customer/components/SwipeToRedeem.tsx`
- `src/modules/customer/swipeRedemption.mjs`
- `src/modules/customer/swipeRedemption.d.mts`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/customer-premium.css`
- `src/modules/rewards/rewardService.ts`
- angepasste und neue Redemption-Vertragstests
- Engineering-Bible-Ergaenzungen in Customer-, Redemption-, CTO- und
  Changelog-Dokumenten

## Was nicht geaendert wurde

- Punkteberechnung und Reward-Berechtigungsregeln
- Restaurant Quick Switch
- Staff- und Owner-Flows
- Referral-/2x-Bonus-Logik
- Smart Media
- RLS-Policies
- Production oder Stripe

## Pruefung

- Tests: 1120/1120 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 7 bestehende Warnungen
- Build: PASS
- PostgreSQL-Parser: PASS, 42 Statements
- Responsive Fixture: 320/375/390/414/430 PASS, kein horizontaler Overflow
- `git diff --check`: PASS
- Secret-Scan: PASS
- Staging-Migration: NICHT angewendet
- Physischer Zwei-Geraete-Test: NICHT ausgefuehrt

## Risiken

- Der atomare Vertrag ist lokal durch SQL-Vertrags- und Race-Tests abgesichert,
  aber noch nicht gegen die reale Staging-Datenbank mit zwei physischen
  Geraeten verifiziert.
- Die Migration muss vor einem FINAL LOCK zuerst kontrolliert auf Staging
  angewendet, gelintet und mit Point Reward, Welcome Gift und Birthday Gift
  live getestet werden.
- Bestehende offene Repository-Aenderungen aus dem Legal-/Onboarding-Scope
  wurden nicht zurueckgebaut oder ueberschrieben.

## Ergebnis

MULTI-DEVICE REDEMPTION PROTECTION FINAL READY: NO  
Begruendung: Migration und echter Multi-Device-Staging-Test stehen aus.  
Status: CODE LOCK
