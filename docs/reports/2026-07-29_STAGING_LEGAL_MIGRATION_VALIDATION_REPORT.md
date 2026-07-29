# Staging Legal Migration Validation

Datum: 29.07.2026, 22:34 CEST  
Branch: `codex/v13-legal-maps-hardening`  
Commit vor Report-Änderung: `f313b114d4f4432bfe57300f0a5759ea3e6c722a`

## Ziel und Umgebung

Die offenen Legal-Migrationen wurden ausschließlich auf das bestätigte
Supabase-Projekt `wuxuai-bonus-staging` mit maskierter Project-Ref
`bwh...qaya` in `eu-west-1` angewendet. Das Projekt war `ACTIVE_HEALTHY` und
lokal verknüpft. Es erfolgten kein Production-Lauf, kein Push, kein Merge und
kein Cloudflare-Deployment.

Der Arbeitsbaum war vor dem Migrationslauf sauber. Die lokale Historie war bis
`20260729003000` mit Remote synchron; `040`, `050` und `060` waren vollständig
lokal vorhanden und remote ausstehend.

## Backup-Prüfung

Die Supabase-CLI meldete WAL-Unterstützung, aber keine verfügbaren physischen
Backups und kein aktiviertes PITR. Deshalb wurden die additiven Migrationen
über getrennte temporäre Migrationsansichten jeweils einzeln geplant,
angewendet und anschließend in der Remote-Historie geprüft.

Es wurden keine Staging-Daten manuell korrigiert, gelöscht oder zusammengeführt.

## Migrationsergebnis

| Reihenfolge | Migration | Isolierter Dry-Run | Anwendung | Remote-Historie |
| --- | --- | --- | --- | --- |
| 1 | `20260729004000_redemption_rate_dropdown.sql` | nur `040` | erfolgreich | registriert |
| 2 | `20260729005000_legal_readiness_effective_date_guard.sql` | nur `050` | erfolgreich | registriert |
| 3 | `20260729006000_automated_restaurant_legal_onboarding.sql` | nur `060` | erfolgreich | registriert |

Kein Lauf meldete SQL-Fehler, fehlende Objekte, Constraint-Verletzungen oder
Policy-Löschungen. Migration `040` lässt bestehende Legacy-Werte durch den
`NOT VALID`-Constraint unangetastet. Der finale globale Dry-Run meldete:

`Remote database is up to date.`

## Schema-Validierung

Die read-only Tabelleninspektion bestätigte auf Staging:

- `legal_master_templates` mit fünf Einträgen,
- `restaurant_legal_profiles`,
- `legal_documents` mit fünf Einträgen,
- `legal_document_versions` mit fünf Einträgen,
- `customer_legal_acceptances`,
- `program_terminations`,
- `loyalty_settings`.

Die geschützten RPCs `get_restaurant_legal_setup` und
`publish_restaurant_legal_drafts` sind über PostgREST auflösbar, für `anon`
aber nicht ausführbar. Der Standard-Schema-Dump war nicht verfügbar, weil auf
dem Rechner kein Docker Desktop und kein lokaler PostgreSQL-Client installiert
ist. Spalten-, Trigger- und Constraint-Verträge wurden deshalb anhand der
angewendeten Migration, Remote-Historie und Tabelleninspektion validiert; eine
zusätzliche Katalogabfrage im SQL Editor bleibt sinnvoll.

## RLS und Security

Live bestätigt:

- direkter `anon`-Zugriff auf `legal_master_templates`: `401 / 42501`,
- `get_restaurant_legal_setup` als `anon`: `401 / 42501`,
- `publish_restaurant_legal_drafts` als `anon`: `401 / 42501`,
- öffentlicher Legal-RPC existiert und antwortet strukturiert,
- die getesteten alten Slugs sind nach dem Staging-Testdaten-Reset nicht mehr
  vorhanden,
- der öffentliche Partnerrestaurant-Endpunkt liefert aktuell keine
  freigegebenen Standorte.

Nicht live ausführbar ohne Rollen-Sitzungen:

- Owner A gegen Restaurant A und B,
- Staff-Veröffentlichungsversuch,
- Cross-Tenant Owner-Zugriff,
- öffentliche Auslieferung einer aktiven und einer zukünftigen Version.

Es wurden keine RLS- oder Berechtigungsregeln nach der Migration gelockert.

## Legal Readiness

Serverseitig implementiert und durch Migration sowie automatisierte Tests
bestätigt:

- fehlende Pflichtdaten blockieren,
- fehlende Teilnahmebedingungen blockieren,
- fehlende Datenschutzerklärung blockiert,
- nur veröffentlichte und bereits wirksame Pflichtversionen zählen,
- Unternehmensänderungen erzeugen Entwürfe,
- aktive veröffentlichte Versionen werden nicht still überschrieben,
- Veröffentlichung erfordert Owner-/Admin-Berechtigung, Gültigkeitsdatum und
  ausdrückliche Bestätigung.

Eine positive Live-Readiness konnte nicht erzeugt werden, weil kein
authentifizierter Test-Owner und kein freigegebenes Testrestaurant bereitstand.

## Owner-, Customer- und Programmende-Flows

Der Browseraufruf der Owner-Route leitete ohne vorhandene Sitzung korrekt auf
den Restaurant-Login. Zugangsdaten wurden nicht ausgegeben oder improvisiert.
Deshalb bleiben folgende E2E-Prüfungen offen:

- Dashboard-Ampel und Legal Center als Owner,
- Legal-Paket erzeugen, Vorschau und bestätigte Veröffentlichung,
- Änderung erzeugt neuen Draft bei unveränderter Altversion,
- Customer-Registrierung vor und nach grüner Readiness,
- Legal-Links, Pflichtzustimmungen, Retry und Duplicate-Schutz,
- Rollen-, Tenant- und Staff-Negativtests,
- vollständiger Programmende-Lifecycle.

Es wurden keine Testrestaurants, Testkunden, Rollen oder Legal-Dokumente nur
für einen scheinbar positiven Test erzeugt.

## Technische Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 315 von 315 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Migrationen lokal/remote: synchron

## Offene Risiken

1. Kein physisches Staging-Backup und kein PITR über CLI verfügbar.
2. Authentifizierter Owner-/Staff-/Cross-Tenant-Test fehlt.
3. Positiver und negativer Customer-Registration-E2E fehlt.
4. Future-`effective_from` und Programmende sind noch nicht mit isolierten
   Live-Datensätzen geprüft.
5. Zusätzliche Katalogprüfung für Trigger, Indizes und Constraints sollte im
   Supabase SQL Editor erfolgen, falls Docker weiterhin fehlt.

## Status

`READY_FOR_STAGING_VALIDATION`

Die Migrationsebene ist erfolgreich und vollständig synchron. Für
`READY_FOR_MERGE_REVIEW` fehlen die authentifizierten Rollen-, Tenant-, Owner-
und Customer-E2E-Prüfungen.
