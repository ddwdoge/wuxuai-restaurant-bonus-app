# Owner- und Staff-Portal: finales Staging-Live-Gate

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `d20033f1d3b8cb58434b10e98e77ef1dbd475e6f`  
Geprüfter Code-Commit: `a13c11866dc283665d978cb7448c455515704243` (`v35`)  
Umgebung: Cloudflare Staging und Supabase `bwhv…qaya`

## Ursache

Nach Aktivierung des individuellen Staff-Logins zeigten echte Staging-Sitzungen
zwei voneinander unabhängige Lücken:

1. `list_restaurant_customers_safe` erlaubte nur Restaurantadministratoren.
   Ein korrekt authentifiziertes, aktives Staff-Mitglied konnte deshalb den
   eigenen Mitarbeiterbereich öffnen, aber keine minimierte Gästeliste laden.
2. Der Legacy-Tages-PIN-Wrapper ordnete erfolgreiche operative Aktionen nicht
   zuverlässig dem echten Staff-Mitglied beziehungsweise Owner zu.

Im abschließenden Owner-QR-Test wurde zusätzlich ein reiner UI-Zustandsfehler
gefunden: Nach einem neuen Punkte-QR blieb die zuvor ausgewählte Kundenkarte
sichtbar, obwohl die serverseitige Vorschau den QR-Inhaber korrekt auflöste.
Eine Buchung wurde in diesem widersprüchlichen Zustand nicht bestätigt.

## Geänderte Dateien

- `supabase/migrations/20260825006000_staff_operational_access_actor_fix.sql`
- `src/modules/staff/StaffTablet.tsx`
- `tests/staff-operational-access-actor-fix.test.mjs`
- `tests/restaurant-controlled-points.test.mjs`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-08-25_OWNER_STAFF_PORTAL_FINAL_STAGING_LIVE_GATE_REPORT.md`

## Umsetzung

- Die minimierte Gästeliste erlaubt den Zugriff nur bei exakter aktiver
  Restaurantbeziehung: Owner/Admin/Manager oder aktives, nicht archiviertes
  Staff-/Supervisor-Konto.
- Die operative Legacy-Punktefunktion löst den Akteur vor der Buchung
  serverseitig auf. Staff-Audit verwendet die echte `staff_members.id`,
  Betreiber-Audit die echte `auth.uid()` mit Akteurtyp Administration.
- Beide ersetzten Funktionen bleiben `SECURITY DEFINER`, besitzen den festen
  `search_path = public, pg_temp` und sind nur für `authenticated` ausführbar.
- Beim Erkennen eines neuen kurzlebigen Punkte-QR werden die alte sichtbare
  Kundenauswahl und der sichtbare QR-Rohwert sofort geleert. Die autoritative
  Kundenanzeige kommt anschließend aus der serverseitigen Vorschau.
- Keine Punkteformel, Tages-PIN-Regel, QR-Gültigkeit, Referral-, Redemption-
  oder Tenantlogik wurde verändert.

## Staging-Migration

- `20260825005000_owner_own_staff_portal_access.sql`: angewendet
- `20260825006000_staff_operational_access_actor_fix.sql`: angewendet
- lokale/Remote-Migrationshistorie: synchron
- Staging DB-Linter: 0 Fehler
- RLS-Policies: unverändert
- Grants: nur die zwei betroffenen RPC-Verträge eng neu gesetzt

## Staging-Deployment

Der erste lokale Deploy-Versuch wurde vor Wrangler durch Node 20 blockiert und
änderte Staging nicht. Ein danach gestarteter Worker-Build enthielt die
Vite-Supabase-Variablen nicht. Dieser Build wurde nach dem ersten echten Reload
sofort auf die zuvor funktionierende Version zurückgerollt; es erfolgte keine
Datenbank- oder Production-Auswirkung.

Der finale Build erbte die vorhandene bestätigte Staging-Konfiguration nur im
Buildprozess. Keine `.env`-Datei wurde kopiert oder ausgegeben.

- Worker: `wuxuai-restaurant-bonus-app`
- finale Staging-Version: `ab32c011-9ae5-4b7d-9ea9-af0aab213bb8`
- Domain: `https://bonus.wuxuaisbi.com`
- Supabase-Verbindung nach Reload: PASS
- Production-Deployment: Nein

## Live-Ergebnisse

- Owner-Login und Dashboard: PASS
- eigener Staff-Bereich als „Betreiberzugriff“ ohne Staff-Passwort: PASS
- Owner-Kunden-QR, serverseitige Vorschau und kontrollierte Buchung: PASS
- Owner-Audit: Administration, richtiges Restaurant, kein Staff-Akteur: PASS
- echte Staff-Anmeldung und eigener Staff-Bereich: PASS
- Staff-Kunden-QR und kontrollierte Buchung: PASS
- Staff-Audit: Mitarbeiter, richtiges Restaurant: PASS
- Staff-Zugriff auf Owner-Dashboard, Team und Platform Admin: BLOCKIERT
- Staff-Zugriff auf fremden Restaurant-Slug: BLOCKIERT
- gesperrtes Staff-Konto: BLOCKIERT
- Reaktivierung derselben Staff-Identität: PASS
- Owner-Zugriff während Staff-Sperre: PASS
- Platform Admin ohne Ziel-Tenant-Mitgliedschaft: BLOCKIERT
- echte Kundensitzung auf Staff und Platform Admin: BLOCKIERT
- Anon-Zugriff auf geschützten Resolver: SQLSTATE `42501`, BLOCKIERT
- alter Kunde/QR-Rohwert nach neuem Scan sichtbar: NEIN

Der Owner-Punkte-KPI stieg beim kontrollierten Owner-Vorgang um zwei Punkte.
Die Staff-Aktionsanzahl blieb dabei unverändert. Im Plattform-Audit erschienen
Owner und Staff in getrennten erfolgreichen Ereignissen mit den Akteurtypen
Administration und Mitarbeiter.

## Responsive

Der deployte Staff-Bereich war bereits live bei 390, 430, 768 und 1024 Pixeln
ohne globalen horizontalen Overflow geprüft. Der abschließende Fix verändert
nur React-Zustand und keine CSS- oder Layoutregeln.

## Qualität

- Tests: 913/913 PASS
- Typecheck: PASS
- Lint: 0 Fehler, 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret-Scan der geänderten Dateien: PASS
- Staging DB-Linter: 0 Fehler

## Nicht geändert

- Keine Production-Aktion
- Kein Push, Merge oder Commit durch Codex; der geprüfte Code-Commit `v35`
  wurde während der Abnahme extern erstellt und ist mit `origin` synchron
- Keine Service-Role im Browser
- Keine RLS-Lockerung
- Keine Änderung von Customer Auth, Referral, Redemption, Reporting oder Stripe

## Offene Risiken

- Physischer Owner-Staff-QR-Scan auf echtem iPhone: nicht durchgeführt
- Physischer individueller Staff-QR-Scan auf echtem iPhone: nicht durchgeführt
- Reale Kamera-, Safe-Area- und Safari-Berechtigungsprüfung bleibt deshalb ein
  manuelles Pilot-Gate.

## Status

`CODE LOCK` für Migration, Rollenvertrag, Actor-Attribution und deployte
Browser-UX. Kein `FINAL LOCK`, solange die beiden physischen iPhone-QR-Gates
nicht durchgeführt wurden.
