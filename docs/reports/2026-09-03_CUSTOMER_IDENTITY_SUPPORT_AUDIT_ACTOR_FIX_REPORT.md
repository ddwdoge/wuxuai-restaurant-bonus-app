# Customer Identity Support Audit Actor Fix

Datum: 2026-09-03

## Ursache

Der geschuetzte RPC `get_customer_identity_support_detail` bestand die kanonische Owner-/Admin- und Tenant-Pruefung. Anschliessend versuchte er jedoch, den verpflichtenden Lesezugriff mit `actor_type = 'restaurant_user'` zu protokollieren. Der Check-Constraint von `audit_log.actor_type` erlaubt nur `admin`, `staff`, `customer` und `system`. Dadurch schlug der Audit-Insert fehl und die gesamte RPC-Transaktion wurde zurueckgerollt. Die UI zeigte deshalb faelschlich die generische Berechtigungsmeldung.

## Geaenderte Dateien

- `supabase/migrations/20260903003000_customer_identity_support_audit_actor_fix.sql`
- `tests/customer-identity-support-audit-actor-fix.test.mjs`
- dieser Bericht

## Was wurde geaendert

- Der bestehende Detail-RPC wurde unveraendert neu definiert, bis auf den Audit-Actor `restaurant_user` -> `admin`.
- `SECURITY DEFINER`, fester `search_path`, kanonische Owner-/Admin-Aufloesung, Restaurantbindung und minimale Execute-Grants bleiben erhalten.
- Ein Regressionstest sichert Actor-Vertrag, Tenant-Filter und Grants.

## Was wurde nicht geaendert

- Keine Frontend-Aenderung.
- Keine Erweiterung der Owner-, Admin- oder Staff-Berechtigungen.
- Keine RLS-Deaktivierung und kein direkter Browserzugriff auf `customers`.
- Keine Customer-Identitaetsdaten geaendert.
- Keine Businesslogik, kein Deployment und keine Cloudflare-/DNS-Aenderung.

## Pruefung

- Volltests: 1274/1274 PASS
- Fokustests Customer Identity: 14/14 PASS
- Typecheck: PASS
- Lint: PASS (0 Fehler, 7 bestehende Warnungen)
- Production-Build: PASS mit lokalen, nicht geheimen Build-Platzhaltern
- Git diff check: PASS
- Secret Scan im Aenderungsscope: PASS

## Migration

- Staging `bwhvfjuwixgwduoeqaya`: Pre-Dry-Run exakt 1 pending; Migration angewendet; Post-Dry-Run 0 pending; DB-Linter 0 Fehler.
- Production `fuqhljgesclipzduhykl`: Pre-Dry-Run exakt 1 pending; Migration angewendet; Migration History 122; Post-Dry-Run 0 pending; DB-Linter 0 Fehler.

## Echter Production-Flow

Der bestehende, authentifizierte Owner des Restaurants `WUXUAI PRODUCTION TEST - DELETE` konnte den Gast `test k.` in der maskierten Gaesteliste finden und danach den geschuetzten Drawer `Identitaetsdaten korrigieren` vollstaendig laden. Es wurde keine Aenderung gespeichert. Die normale Gaestesuche blieb maskiert.

## Sicherheit

- Same-Tenant Owner/Admin: durch den bestehenden Resolver erlaubt.
- Staff ohne Owner/Admin-Rolle: blockiert.
- Cross-Tenant: durch `restaurant_id` in Autorisierung und Customer-Lookup blockiert.
- Unauthenticated/anon: Execute weiterhin entzogen.
- Multi-Role: Rollenpruefung bleibt additiv ueber die kanonische Restaurant-Mitgliedschaft.

## Risiken

Keine offene sicherheitsrelevante Regression im betroffenen Flow. Der Zugriff erzeugt weiterhin absichtlich ein minimiertes Audit-Ereignis; Customer-Businessdaten wurden nicht veraendert.

Status: FINAL LOCK
