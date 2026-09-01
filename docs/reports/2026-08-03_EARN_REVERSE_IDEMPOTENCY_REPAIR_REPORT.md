# Earn-/Reverse-Idempotenzreparatur auf Staging

Datum: 2026-08-03
Branch: `codex/restaurant-controlled-points-flow`
Ausgangscommit: `5173a9d1bf353fc2ed02fcc4cd9280ec04814b60`
Staging-Projekt: `wuxuai-bonus-staging` (`bwhv...qaya`)

## Ursache

Der bisherige partielle Unique-Index
`points_transactions_restaurant_idempotency_idx` behandelte einen
`idempotency_key` innerhalb eines Restaurants operationenübergreifend als
eindeutig. Eine erfolgreiche Earn-Buchung und ihre fachlich getrennte
Gegenbuchung konnten deshalb nicht denselben Client-Key verwenden. Der legitime
Reverse-Insert kollidierte mit der Earn-Zeile und endete mit SQLSTATE `23505`.

## Geänderte Dateien

- `supabase/migrations/20260803002000_scope_reverse_idempotency_by_operation.sql`
- `tests/points-reverse-operation-idempotency.test.mjs`
- `docs/reports/2026-08-03_EARN_REVERSE_IDEMPOTENCY_REPAIR_REPORT.md`

## Was wurde geändert

1. Der Ledger-Idempotenzindex ist nun nach `restaurant_id`, fachlicher
   Operation (`earn`, `reverse`, sonstige Quelle) und `idempotency_key`
   getrennt.
2. Reverse besitzt ein eigenes tenantbezogenes Claim-Register
   `points_reverse_idempotency_claims` mit aktivem RLS und ohne direkte Rechte
   für `anon` oder `authenticated`.
3. Reverse-Payloads werden serverseitig mit SHA-256 über Restaurant,
   Operationstyp, Originaltransaktion und normalisierte Begründung gebunden.
4. Derselbe Reverse-Retry liefert das gespeicherte Ergebnis zurück.
5. Ein abweichender Reverse-Payload mit demselben Key liefert weiterhin
   `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.
6. Tenantbezogene Advisory Locks und die bestehende eindeutige
   `reversal_of`-Absicherung verhindern parallele Doppelgegenbuchungen.

## Was wurde nicht geändert

- Earn-Berechnung und Earn-RPCs
- Tages-PIN, QR-Verbrauch und Receipt-Hardening
- Punkte- und Reward-Logik
- bestehende RLS-Policies
- bestehende Grants außerhalb des Reverse-RPC-Vertrags
- Production-Datenbank und Deployment

## Migration

- Migration: `20260803002000_scope_reverse_idempotency_by_operation.sql`
- Additiv/reparierend: Ja
- Dry-Run: genau diese eine Migration erkannt
- Auf Staging angewendet: Ja
- Lokal/Remote synchron: Ja
- Production angewendet: Nein

Die zusätzliche transaktionale DDL-Probe über den eingeschränkten CLI-Login
wurde vor jeder Änderung mit `must be owner of table points_transactions`
abgewiesen. Die Migration wurde anschließend erfolgreich über den offiziellen
Supabase-Migrationsweg ausgeführt.

## Sicherheitsprüfung

- `SECURITY DEFINER` nur für den bestehenden, eng begrenzten Reverse-RPC
- fester `search_path`: `public, extensions, pg_temp`
- `auth.uid()` und Owner-/Manager-Zuordnung serverseitig geprüft
- Reverse-Claim-Tabelle: RLS aktiv
- direkte Claim-Schreibrechte für `anon`: Nein
- direkte Claim-Schreibrechte für `authenticated`: Nein
- Reverse-RPC für `anon`: Nein
- Reverse-RPC für `authenticated`: Ja
- PINs, Tokens und Auth-Daten im Claim/Fingerprint: Nein
- RLS-/Grant-/Receipt-Reparaturen zurückgebaut: Nein

## Automatisierte Tests

Fokussierte Sicherheits- und Idempotenztests:

- 76/76 erfolgreich
- Earn-Retry
- Reverse-Retry
- Earn zu Reverse mit gleichem Key
- Earn zu Reverse mit anderem Key
- paralleler Earn-Retry und Reverse
- Reverse-Payload-Mismatch
- idempotenter Storno
- keine doppelte Gegenbuchung

Gesamte lokale Testsuite:

- 535/535 erfolgreich

## Staging-Live-Test

Isolierte Testsession: `E2E-2026-08-03-EARN-REVERSE-001`

- 20/20 Live-Prüfungen erfolgreich
- Earn -> Retry: gleiche Transaktion, eine Earn-Zeile
- Earn -> Reverse mit gleichem Key: erfolgreich, kein `23505`
- Reverse -> Retry: gleiche Gegenbuchung
- Earn -> Reverse mit anderem Key: erfolgreich
- Parallel Earn-Retry + Reverse mit gleichem Key: erfolgreich
- Parallel Reverse mit gleichem Key: eine Gegenbuchung
- Parallel Reverse mit unterschiedlichen Keys: eine Gegenbuchung
- Reverse-Payload-Mismatch: `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`
- Kundenpunktestand nach Gegenbuchung: korrekt

Ein zusätzlicher breiter Alt-Akzeptanzlauf bestand 54 Prüfungen und verlor dann
die Datenbankverbindung; alle danach gelesenen Werte waren leer und daher nicht
als fachliche Fehler verwertbar. Die dabei angelegten isolierten Fixtures wurden
über eine frische Verbindung vollständig entfernt. Die maßgebliche gezielte
Live-Suite und die komplette lokale Regression blieben vollständig grün.

## Nullbestandsprüfung

- isolierte Testrestaurants: 0
- isolierte Testkunden: 0
- isolierte Ledgerzeilen: 0
- isolierte Earn-Claims: 0
- isolierte Reverse-Claims: 0
- Acceptance-Fixture-Restaurants: 0
- alter globaler Idempotenzindex vorhanden: Nein
- operationenbezogener Idempotenzindex vorhanden: Ja

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 535/535 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Remote DB Lint: keine neuen Reparaturbefunde; sieben bekannte Legacy-Befunde
  außerhalb dieses Scopes bleiben bestehen

## Risiken

- Kein offenes Risiko im reproduzierten Earn-/Reverse-Idempotenzpfad.
- Der breite Legacy-Akzeptanzrunner öffnet sehr viele kurze DB-Verbindungen und
  sollte für zukünftige Komplettläufe auf eine wiederverwendete Verbindung
  umgestellt werden. Das ist kein Produkt- oder Migrationsfehler und war nicht
  Teil dieses Reparaturscopes.

## Status

`FINAL LOCK` für die Earn-/Reverse-Idempotenzreparatur auf Staging.

Kein Push, kein Merge und kein Production-Deployment durchgeführt.
