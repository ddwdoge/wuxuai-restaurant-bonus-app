# TEST_ONLY Marker Name Snapshot Refresh – Local Report

Datum: 2026-09-30
Branch: `codex/v1-release-integration`
Ausgangs-HEAD: `b826699cf5ccbcbd5d3d5ca2d4bb2485c3179bac`
Status: **LOCAL CODE LOCK**

## Ursache

Der bestehende aktive TEST_ONLY-Marker des pseudonymisierten Zieltenants
`tenant-e3a60c9be3ee` enthält noch den Restaurantnamens-Snapshot
`WUXUAI TEST ONLY – PRO PHASE 1`. Der autoritative, regulär und auditiert
geänderte Restaurantname lautet `Wuxuai test only`. Organisation und Owner
bleiben identisch. Die bestehende exakte TEST_ONLY-Prüfung muss erhalten
bleiben; deshalb wurde kein Bypass und kein generischer Marker-Editor gebaut.

## Geänderte Dateien

1. `supabase/migrations/20260930001000_test_only_marker_name_snapshot_refresh.sql`
2. `tests/test-only-marker-name-snapshot-refresh.test.mjs`
3. `tests/test-only-marker-name-snapshot-refresh.local.mjs`
4. dieser Bericht

Fremde und vorbestehende Dateien, insbesondere
`supabase/.temp/cli-latest`, wurden nicht verändert oder aufgenommen.

## Implementierter Vertrag

Migration 188 ergänzt genau einen engen RPC:

`refresh_platform_test_tenant_marker_name_snapshot(uuid, text, text, text, uuid)`

Der RPC verlangt fail-closed:

- aktive Platform-Owner-/Platform-Admin-Rolle;
- eine serverseitig noch vorhandene Auth-Session;
- einen aktuell verifizierten, zur Session gehörenden TOTP-Faktor;
- AAL2 und einen TOTP-AMR innerhalb des bestehenden Zehn-Minuten-Fensters;
- einen aktiven bestehenden Marker;
- unveränderte Tenant-, Organisations- und Owner-Bindung einschließlich
  autoritativer Owner-Membership;
- serverseitige STAGING-Umgebung und einen weiterhin eindeutig synthetischen
  WUXUAI-Testnamen;
- erwarteten alten Marker-Snapshot, erwarteten aktuellen Restaurantnamen und
  eine requestgebundene starke Bestätigung;
- einen nach der Markierung append-only protokollierten exakten Restaurant-Rename.

Der RPC sperrt Ziel und Request mit Transaction-Advisory-Locks, sperrt die
Markerzeile `FOR UPDATE` und liest das Restaurant `FOR SHARE`. Er ändert
ausschließlich `platform_test_tenant_registry.restaurant_name`. Browser- und
generische `service_role`-DML sowie direkter Zugriff auf die neue Evidenztabelle
sind entzogen.

## Audit und Datenschutz

Eine erfolgreiche echte Änderung erzeugt genau eine Zeile in
`platform_test_tenant_marker_refresh_audit` mit Marker-/Tenantbindung, alter
und neuer Namensfassung, Actor, SHA-256-Sessionfingerprint, Zeitpunkt,
`TEST_ONLY_NAME_SNAPSHOT_REFRESH`, Policy-Version und Payload-Hash. Die Tabelle
ist gegen UPDATE, DELETE und TRUNCATE geschützt. Sie speichert keine Session-ID,
Tokens, TOTP-Codes, E-Mail-Adresse oder andere Zugangsdaten.

Eine Wiederholung nach bereits erfolgreichem Refresh ist read-only und erzeugt
kein weiteres Audit. Eine abweichende Wiederverwendung derselben Idempotency-ID
wird als Konflikt abgewiesen.

## Lokale Prüfergebnisse

- Fresh Replay bis 188: **PASS**
- Upgrade 187 → 188: **PASS**; vor dem Upgrade war Migration 188 nicht vorhanden
- Repeat-Dry-Run: **PASS**, `migrations: []`
- DB-Lint `public` und `extensions`, Level Error: **PASS**, 0 Befunde
- fokussierter Migration-/Source-Test: **7/7 PASS**
- reale lokale Auth-/SQL-Sicherheitsmatrix: **PASS**
- 24 parallele Refresh-Aufrufe: **PASS**, exakt 1 Mutation und 1 Auditzeile
- idempotente Wiederholung: **PASS**, 0 zusätzliche Auditzeilen
- AAL1, veraltetes Recent-TOTP, fehlender/unverifizierter/fremder Faktor,
  Owner, Staff, Customer, Anonymous, falsche Bindungen, fehlender/inaktiver
  Marker, nicht auditierter Rename und stale Snapshot: **fail-closed PASS**
- direkter Tabellenzugriff und Änderung anderer Markerfelder: **fail-closed PASS**
- bestehende AAL2-/PRO-/Inbox-/Trial-Regressions: **58/58 PASS**
- bestehende TEST_ONLY-/BASIC-/Control-Center-Regressions: **35/35 PASS**
- Migrationen 001–187: **187/187 bytegleich zu HEAD**
- Secret Scan über den neuen Scope: **PASS**
- Diff Check: **PASS**

Full Suite, Typecheck, Lint und App-Build wurden nicht wiederholt, weil weder
Produkt- noch Runtimecode geändert wurde. Die Änderung besteht ausschließlich
aus einer additiven Datenbankmigration und ihren Tests; der Auftrag verlangt
diese Gates nur bei Produkt-/Runtimeänderungen.

## Migration

- Datei: `20260930001000_test_only_marker_name_snapshot_refresh.sql`
- SHA-256: `6e4f72f5a97663a78a4a5cbf190563f53248bfc82204349181fd2062480dae6a`
- lokal: **188/188 geprüft**
- Staging: **nicht angewendet; unverändert 187/187 gemäß Ausgangslage**

## Konkret erwartete spätere Staging-Mutation

Nur nach separater ausdrücklicher Freigabe und erneutem vollständigem
serverseitigem Preflight:

- Ziel: `tenant-e3a60c9be3ee`
- bestehender Marker-Snapshot: `WUXUAI TEST ONLY – PRO PHASE 1`
- autoritativer aktueller Restaurantname: `Wuxuai test only`
- erwartete Mutation: exakt 1 UPDATE ausschließlich des Marker-Namenssnapshots
- erwartetes Auditdelta: exakt 1 append-only
  `TEST_ONLY_NAME_SNAPSHOT_REFRESH`-Ereignis
- erwartete sonstige Writes: **0**

Keine Änderung von Tenant, Organisation, Owner, Markerstatus, Restaurant,
Membership, Rolle, Trial, PRO, Inbox, Billing, Stripe oder Entitlement ist
zulässig.

## Nicht ausgeführt

- kein Commit und kein Push;
- keine Staging-Migration und kein Staging-Refresh;
- kein PRO-Test-Override;
- keine Offer-, Reward- oder Inbox-Testdaten;
- keine Production-, Stripe-LIVE-, LEGACY- oder reale Datenänderung.

## Offene Freigaben

Vor jeder externen Änderung sind getrennt freizugeben:

1. enger Commit und normaler Fast-forward-Push;
2. Anwendung ausschließlich von Migration 188 auf das verifizierte Staging;
3. exakt ein Marker-Refresh für `tenant-e3a60c9be3ee` mit frischer legitimer
   Platform-Admin-AAL2-/Recent-TOTP-Sitzung.

Dieser Reparaturtest ist kein Production-Readiness-Nachweis.

## Status

**LOCAL CODE LOCK**
**STAGING MIGRATION / MARKER REFRESH NOT EXECUTED**
**PRODUCTION READINESS NOT DERIVED**
