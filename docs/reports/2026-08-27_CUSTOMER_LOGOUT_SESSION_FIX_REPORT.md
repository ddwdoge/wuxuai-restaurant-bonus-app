# WUXUAI Bonus - Customer Logout Session Fix

Datum: 2026-08-27  
Umgebung: Supabase- und Cloudflare-Staging  
Production: LOCKED

## Ursache

Die Abmeldung im restaurantbezogenen Customer Portal entfernte nur den lokal
gespeicherten restaurantbezogenen Customer Access. Anschliessend wurde dieselbe
Restaurantseite neu geladen. Die weiterhin gueltige zentrale Supabase-Session
erkannte die bestehende Customer Membership, oeffnete sie serverseitig erneut
und stellte wieder einen restaurantbezogenen Zugang aus. Dadurch erschien der
Kunde unmittelbar wieder angemeldet.

Der Fehler war kein Supabase-Verbindungs-, RLS- oder Membership-Fehler.

## Geaenderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `tests/customer-logout.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-27_CUSTOMER_LOGOUT_SESSION_FIX_REPORT.md`

## Was wurde geaendert

- Der lokale Restaurantzugang und ein aktiver lokaler Einloesungszustand werden
  weiterhin entfernt.
- Danach wird die zentrale Supabase-Kundensitzung ueber den bestehenden
  `AuthProvider.signOut()` beendet.
- Die Navigation fuehrt auch bei einer nicht vollstaendig bestaetigten
  Online-Abmeldung kontrolliert zu `/customer/login`.
- Ein Regressionstest verhindert die fruehere Navigation zur selben
  Restaurantseite ohne zentrale Abmeldung.

## Was wurde nicht geaendert

- Keine Datenbankmigration.
- Keine RLS-, RPC-, Grant- oder Tenant-Aenderung.
- Keine Membership-, Punkte-, Reward- oder Customer-Daten wurden geaendert.
- Keine Owner-, Staff- oder Platform-Admin-Authentifizierung wurde geaendert.

## Verifikation

- Fehler vor Fix live reproduziert: Abmelden oeffnete innerhalb von rund zwei
  Sekunden erneut denselben vollstaendigen Kundenbereich.
- Staging-Deployment: `c3b4bfe2-fa76-4d25-a146-dfbb05149cf2`.
- Nach Fix: Abmelden fuehrt zu `/customer/login`.
- Reload: Loginseite bleibt sichtbar.
- Direkter erneuter Restaurantaufruf: keine Kundendaten; Anmeldung erforderlich.
- Tests: 1040/1040 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bereits bestehende Warnungen.
- Build: PASS.
- `git diff --check`: PASS.

## Risiken

Keine offene funktionale Abmelderisiko im geprueften Customer-Flow. Die
Anwendung loescht absichtlich keine Membership oder Punkte; Abmelden beendet
nur den Zugang auf dem aktuellen Browsergeraet.

## Status

FINAL LOCK
