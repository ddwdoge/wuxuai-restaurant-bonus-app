# WUXUAI Bonus - Migration Sequence Gate 05000 -> 06000

Datum: 24.08.2026  
Umgebung: Supabase Staging `bwhv...qaya`  
Production: LOCKED  
Stripe: DEFERRED

## Ausgangslage

Die Remote-Historie war bis `20260824004000` synchron. Lokal standen exakt
`20260824005000_platform_admin_restaurant_control_center.sql` und
`20260824006000_referral_welcome_eligibility_monthly_quota.sql` aus.

## 05000

Der isolierte Dry-Run enthielt ausschliesslich `05000`. Die Migration wurde auf
Staging angewendet. Der Staging-DB-Linter meldete danach 0 Fehler.

Der autorisierte Platform Admin konnte `/platform-admin` aufrufen. Der neue
Control-Center-RPC lieferte Konto-, Nutzungs-, Referral-, Redemption-, Health-
und Audit-Zustaende. Nicht vorhandene Telemetrie blieb als `unavailable`
gekennzeichnet.

## Kritischer Live-Befund

Der direkte Negativtest mit einer normalen authentifizierten Owner-Identitaet
hat einen Fail-open-Fehler nachgewiesen:

- `current_platform_role()` liefert bei fehlender Platform-Admin-Zuordnung
  `NULL`.
- `is_platform_admin()` reichte dieses `NULL` bisher weiter.
- der PL/pgSQL-Guard in `05000` verwendet `if not
  public.is_platform_admin()`.
- `IF NOT NULL` fuehrt den Fehlerzweig nicht aus.
- dadurch konnte ein authentifizierter Nicht-Platform-Admin den neuen RPC
  ausfuehren.

Dieser Befund blockiert die Sicherheitsfreigabe von `05000` und die Anwendung
von `06000`.

## Vorbereitete Reparatur

Additive Migration:

`20260824005500_platform_admin_null_guard_hardening.sql`

Sie ersetzt ausschliesslich das zentrale Rollenpraedikat und normalisiert eine
fehlende oder inaktive Platform-Admin-Rolle mit `coalesce(..., false)` zu
`false`. Der sichere `search_path` bleibt `public, pg_temp`. Direkte
`EXECUTE`-Rechte fuer `public`, `anon` und `authenticated` bleiben entzogen.
RLS, Tenant-Policies und Referral-Logik werden nicht veraendert.

Der aktualisierte Staging-Dry-Run zeigt exakt diese Reihenfolge:

1. `20260824005500_platform_admin_null_guard_hardening.sql`
2. `20260824006000_referral_welcome_eligibility_monthly_quota.sql`

`05500` wurde nach ausdruecklicher Freigabe auf Staging angewendet. Der zuvor
erfolgreiche Owner-Aufruf wird jetzt mit SQLSTATE `42501` und
`PLATFORM_ADMIN_ACCESS_DENIED` blockiert. Anon besitzt kein `EXECUTE`-Recht.
Der autorisierte Platform Admin kann den RPC weiterhin aufrufen. Der DB-Linter
meldete danach 0 Fehler.

## 06000 und neuer Linter-Blocker

`06000` wurde nach bestandenem Platform-Admin-Security-Gate auf Staging
angewendet. Der anschliessende Dry-Run bestaetigte eine synchrone lokale und
Remote-Migrationshistorie.

Der reale Staging-DB-Linter fand danach einen Fehler in
`register_referral_customer`:

- SQLSTATE: `42702`
- Ursache: `phone = normalized_phone` ist auf dem aktuellen Schema mehrdeutig,
  weil `normalized_phone` sowohl als PL/pgSQL-Variable als auch als Spaltenname
  aufgeloest werden kann.

Additive Reparatur vorbereitet:

`20260824006100_referral_registration_phone_ambiguity_fix.sql`

Die Reparatur benennt den lokalen Wert eindeutig als `normalized_phone_value`
und qualifiziert alle Tabellenreferenzen. Welcome-Gift-, Tenant-, Grant- und
Referral-Vertrag bleiben unveraendert. Der isolierte Dry-Run enthielt nur
`06100`. Die Migration wurde nach ausdruecklicher Freigabe auf Staging
angewendet.

Danach:

- lokale/Remote-Migrationshistorie: synchron
- Staging DB Linter: 0 Fehler
- Referral-Registrierungs-RPC: kein `42702` mehr
- RLS auf Referral-, Loyalty-, Reward- und Boost-Tabellen: aktiv

## Transaktionaler Staging-E2E

Ein vollstaendiger Test mit isolierten Testkunden wurde in einer Transaktion
ausgefuehrt und anschliessend per `ROLLBACK` vollstaendig entfernt.

Ergebnis:

- Einladung vor erstem qualifizierenden Besuch: blockiert
- Einladung nach erstem qualifizierenden Besuch: erfolgreich
- gleicher Einladungs-Key: idempotenter Replay ohne neuen Quota-Slot
- Standardlimit: 5
- sechste Einladung: blockiert
- vorheriger Kalendermonat: nicht auf aktuellen Monat angerechnet
- Referral-Registrierung: erfolgreich
- Welcome Gift: exakt 1
- doppeltes Welcome Gift: verhindert
- Status nach Registrierung: `pending_registered`
- Boost vor erstem Punkteereignis des eingeladenen Gasts: inaktiv
- Qualifikation durch erstes Punkteereignis des eingeladenen Gasts: erfolgreich
- konfigurierte Dauer im Testtenant: 30 Tage Referrer / 15 Tage Gast
- Multiplikator: maximal 2
- Punkteberechnung: 20 Basispunkte -> 40 Endpunkte
- Welcome Gift nach Qualifikation weiterhin vorhanden
- weitere erfolgreiche Referral: Verlaengerung statt 4x-Stacking
- Owner-Limitwechsel 3 -> 5: erfolgreich und zurueckgerollt
- verbliebene Testkunden nach Rollback: 0

## Qualitaet

- gezielter Platform-Admin-Test: 11/11 PASS
- vollstaendige Tests: 855/855 PASS
- gezielte 06100-/Referral-Tests: 11/11 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler, 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Staging DB Linter nach 05500: 0 Fehler
- Staging DB Linter nach 06100: 0 Fehler
- Secret Scan: PASS

## Noch offene Gates

- echter Customer-Signup mit E-Mail-Bestaetigung auf dem bereitgestellten Frontend
- physischer iPhone-Safari-Test fuer Pending- und Active-UX
- sichtbare Expiry-Darstellung auf echtem Geraet
- Owner-Reporting mit realem, nicht zurueckgerolltem Pilotvorgang
- keine App-Bereitstellung wurde in diesem Gate durchgefuehrt

## Status

**CODE LOCK - STAGING DB READY, PHYSICAL REFERRAL UI GATES OPEN**
