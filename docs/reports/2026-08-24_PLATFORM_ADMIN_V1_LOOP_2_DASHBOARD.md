# WUXUAI Bonus - Platform Admin V1 Loop 2 Dashboard

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Authoritative Base: `919141181223aa414ef004a09aa3f02637f2b7fd`  
Status: `BLOCKED_BY_BACKEND_CONTRACT`

## Ursache

Loop 2 verlangt testbereinigte, periodengenaue und mandantenuebergreifende
Plattform-KPIs. Der aktuelle geschuetzte Plattformvertrag liefert diese Daten
nicht vollstaendig:

- `get_platform_restaurants()` liefert Restaurantzeilen und einen alten
  Tages-Summary, aber keine 7-/30-/90-Tage-KPIs.
- `customer_count` in dieser RPC zaehlt alle Restaurantkunden und unterscheidet
  `customers.is_test_customer` nicht.
- Einloesungen werden in der bestehenden Plattform-RPC aus Legacy-Tabellen
  gezaehlt. Der aktuelle Reporting-Vertrag verwendet dagegen
  `redemption_activity_journal.finalized_at` und schliesst
  `is_test_event = true` aus.
- `get_platform_audit_events()` ist fuer Audit-Ansichten gedacht und auf 500
  Ergebnisse begrenzt. Es ist deshalb keine vollstaendige KPI-Quelle.
- Qualifizierte Empfehlungen und aktive 2x-Booster stehen nicht im Payload von
  `get_platform_restaurants()`.
- `get_platform_restaurant_detail()` liefert aktive Booster nur je Restaurant,
  zaehlt dort aber ebenfalls nicht durchgaengig testbereinigt und wuerde eine
  N+1-Abfrage ueber alle Tenants erfordern.

Eine reine Browseraggregation wuerde damit entweder falsche Nullwerte, bei
mehr als 500 Audit-Ereignissen unvollstaendige Werte oder Testdaten als
Geschaefts-KPIs anzeigen. Das widerspricht den verbindlichen Regeln
`ERROR != ZERO`, `No fake metrics`, Datenminimierung und serverseitiger
Plattform-Autorisierung.

## Bestehende sichere Grundlage

- Plattformrolle kommt serverseitig aus `platform_admins`.
- `/platform-admin` ist durch den zentralen Plattform-Scope geschuetzt.
- Der Browser verwendet nur eng begrenzte Plattform-RPCs und keine
  Service-Role.
- Migration `20260824003000_platform_admin_foundation_hardening.sql` ist auf
  Staging angewendet.
- Migration `20260824004000_authenticated_referral_registration_bridge.sql`
  bleibt unangewendet.
- Normale Tenant-RLS wurde in diesem Loop nicht veraendert.

## Interner Test-Tenant

Der bekannte versehentlich erzeugte Tenant `Wuxuai bonus` darf wegen seiner
Audit-Referenzen nicht geloescht werden. Das Schema enthaelt aktuell jedoch
keinen autoritativen Restaurantmarker wie `internal_test` oder
`is_test_tenant`. Eine hartcodierte Erkennung nur ueber Name, Owner-E-Mail oder
Staging-UUID waere nicht dauerhaft belastbar und koennte spaetere echte
Tenants falsch klassifizieren.

## Minimal erforderlicher Backendvertrag

Fuer eine sichere Fortsetzung ist eine additive, eng begrenzte Plattform-RPC
noetig, beispielsweise `get_platform_dashboard(input_period_days,
input_search, input_status, input_limit, input_offset)`. Sie muss:

- `current_platform_role()` beziehungsweise die gehaertete
  `platform_admins`-Quelle serverseitig pruefen,
- einen festen sicheren `search_path` besitzen,
- nur fuer benoetigte authentifizierte Plattformrollen ausfuehrbar sein,
- aktive echte SaaS-Kunden und Lokale serverseitig zaehlen,
- interne Test-Tenants ueber einen autoritativen Marker ausschliessen,
- Endkunden mit `customers.is_test_customer = false` zaehlen,
- Einloesungen aus `redemption_activity_journal` mit `finalized_at` und
  `is_test_event = false` zaehlen,
- qualifizierte Empfehlungen anhand des aktuellen Referral-Vertrags zaehlen,
- aktive 2x-Booster anhand Serverzeit und ohne Testkunden zaehlen,
- 7, 30 und 90 Tage unterstuetzen,
- Suche, Filter und Pagination serverseitig anbieten,
- Fehler als Fehler liefern; fehlgeschlagene Abfragen duerfen nicht zu `0`
  normalisiert werden,
- keine Endkunden-PII ausgeben.

Die Test-Tenant-Klassifikation braucht entweder einen bereits vorhandenen,
nachweislich autoritativen Marker oder eine kleine additive Schemaentscheidung.
Diese Entscheidung darf nicht still im UI getroffen werden.

## Geaenderte Dateien

- `docs/reports/2026-08-24_PLATFORM_ADMIN_V1_LOOP_2_DASHBOARD.md`

## Was wurde nicht geaendert

- Kein Dashboard-Produktcode
- Keine Plattform-Autorisierung
- Keine RLS-Policy und kein Grant
- Keine Datenbankmigration
- Keine Anwendung von `20260824004000`
- Keine Referral-, Punkte-, Redemption-, Auth-, Owner-, Staff- oder
  Customer-Logik
- Kein Push, Merge oder Deployment

## Qualitaetspruefung

- Tests: `822/822 PASS`
- Typecheck: `PASS`
- Lint: `PASS`, 0 Fehler und 7 bereits bestehende Warnungen
- Build: `PASS`
- `git diff --check`: `PASS`
- Secret-Scan: `PASS`

## Risiken

- Ohne den neuen Backendvertrag koennen die geforderten KPIs nicht als
  vollstaendig und testbereinigt bezeichnet werden.
- Eine UI-only-Umsetzung koennte SaaS-Kundenstatus und Plattformidentitaet zwar
  optisch trennen, wuerde aber die fachlich wichtigeren KPI-Vertraege nicht
  erfuellen.
- Der interne Test-Tenant wuerde ohne autoritativen Marker normale
  Geschaefts-KPIs weiter beeinflussen.

## Entscheidung

Der Auftrag fordert bei notwendiger DB-Migration ausdruecklich einen STOP vor
jeder Umsetzung. Deshalb wurde keine Migration erstellt oder angewendet und
kein unvollstaendiges Dashboard gebaut.

`PLATFORM ADMIN LOOP 2 READY: NO`

`READY FOR LOOP 3: NO`

`PRODUCTION: LOCKED`

`STRIPE: DEFERRED`
