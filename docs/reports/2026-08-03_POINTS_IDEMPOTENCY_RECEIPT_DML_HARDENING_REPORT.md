# Points Idempotency, Receipt and DML Hardening

Datum: 2026-08-03
Branch: `codex/restaurant-controlled-points-flow`
Ausgangscommit: `5173a9d1bf353fc2ed02fcc4cd9280ec04814b60`
Zielumgebung: `wuxuai-bonus-staging` (`bwhv...qaya`)
Production: nicht verändert

## Ursache

1. Bonnummern wurden nur mit einer nicht atomaren `EXISTS`-Abfrage und einem 24-Stunden-Fenster geprüft. Parallele Requests konnten beide vor dem ersten Commit passieren.
2. `(restaurant_id, idempotency_key)` war eindeutig, aber nicht an den fachlichen Request gebunden. Ein alter Erfolg wurde auch bei geändertem Betrag, Kunden, QR oder Bon zurückgegeben.
3. `anon` und `authenticated` besaßen direkte Ledger-DML-Rechte. Die permissive Owner-INSERT-Policy erlaubte mit `collection_source = NULL` einen Engine-Bypass.

## Neue Migration

`supabase/migrations/20260803001000_harden_points_idempotency_receipts_and_dml.sql`

Die Migration ist additiv. Bereits angewendete historische Migrationen wurden nicht verändert.

## Bonnummern

- Kanonisierung: `btrim`, leere Zeichenfolge zu `NULL`, anschließend `upper`.
- Atomare Garantie: partieller Unique-Index auf `restaurant_id` und kanonischer Bonnummer für `type = 'earn'`.
- Restaurantweite Gültigkeit ohne erfundenes Zeitfenster.
- Konfliktcode: `RECEIPT_ALREADY_USED`.
- Der delegierte Punkteflow läuft in einem PL/pgSQL-Unterblock. Ein Unique-Konflikt rollt dessen Ledger-, Balance-, Effekt- und QR-Änderungen vollständig zurück.
- NULL-Bonnummern bleiben für Flows ohne Bon optional.

## Idempotenz

Neue abgeschottete Tabelle: `points_idempotency_claims`.

Primärschlüssel:

`restaurant_id + idempotency_key`

Der SHA-256-Fingerprint enthält ausschließlich serverseitig aufgelöste beziehungsweise normalisierte Fachfelder:

- Restaurant-ID
- Customer-ID
- Collection Source
- Betrag in Cent
- normalisierte Bonnummer
- interne QR-Referenz-ID beim Staff-Flow
- Aktionstyp
- Flow-/Regelkontext

Nicht enthalten: Tages-PIN, Kunden-/Auth-Token, QR-Rohwert, Client-Punkte oder Zeitstempel.

Verhalten:

- identischer Retry: gespeichertes Ergebnis, keine zweite Nebenwirkung
- abweichender Payload: `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`
- anderer Tenant: eigener Claim-Scope
- erfolgreiche Transaktion: Fingerprint zusätzlich in `points_transactions.request_fingerprint`
- retrybare PIN-/Validierungsfehler hinterlassen keinen halbfertigen Claim

## Lock- und Transaktionsstrategie

Feste Reihenfolge für den Staff-Flow:

1. Auth-, Tenant-, Mindest-, Maximal- und Modusprüfung
2. Eingaben kanonisieren und serverseitige QR-ID auflösen
3. tenantgebundener Advisory Lock für den Idempotency-Key
4. tenantgebundener Advisory Lock für die kanonische Bonnummer
5. bestehender QR-Row-Lock und Customer-Lock im delegierten Serververtrag
6. serverseitige Punkteberechnung, Ledger, Balance und Effekte
7. QR-Verbrauch
8. vollständiges Claim-Ergebnis

Alle Schritte laufen in derselben Datenbanktransaktion. Der Unique-Index bleibt die letzte Bonnummern-Autorität.

## DML und RLS

Vorher:

- `anon`: SELECT, INSERT, UPDATE, DELETE und weitere Tabellenrechte
- `authenticated`: SELECT, INSERT, UPDATE, DELETE und weitere Tabellenrechte
- Policy `points transactions admin insert`

Nachher:

- `anon`: nur SELECT gemäß bestehender RLS-Auswertung
- `authenticated`: nur SELECT gemäß bestehender Tenant-Policy
- keine INSERT-/UPDATE-/DELETE-Policy
- direkter Owner-INSERT: SQLSTATE `42501`
- `points_idempotency_claims`: RLS aktiv, keine Browser-Tabellenrechte
- neue Earn-Zeilen benötigen explizit `restaurant_controlled` oder `customer_initiated`
- Constraint ist `NOT VALID`: historische Zeilen werden nicht still verändert, neue ungültige Writes werden blockiert

## Legacy-Pfade

Geprüft wurden aktive und historische Ledger-Schreibpfade, darunter Staff-Actions, Customer Collect, Award Engine, Confirmation, Reward-Redemption und Reverse-RPC.

- alte `collect_bonus_points`-Signaturen: keine Browser-Ausführung
- `award_points_v1` und interne Engine-Helfer: keine Browser-Ausführung
- neuer Staff-Wrapper: nur `authenticated`
- Customer-V1-Wrapper: `anon` und `authenticated`, aber mit serverseitigem Token-/Tenantvertrag und Payload-Claim
- Reverse-RPC: nur `authenticated`, serverseitige Owner-/Manager-Prüfung
- Reward-Transaktionen verwenden `type = 'redeem'` und werden vom neuen Earn-Source-Constraint nicht beschädigt

## Bestandsprüfung und Migration

Vor Anwendung auf Staging:

- Punkte-Transaktionen: 0
- doppelte kanonische Bonnummern: 0
- Earn-Zeilen ohne Source: 0
- lokale/Remote-Migrationen synchron bis `20260802002000`
- transaktionaler SQL-Dry-Run: erfolgreich und vollständig zurückgerollt
- `supabase db push --dry-run`: ausschließlich `20260803001000`

Anwendung:

- Migration `20260803001000`: erfolgreich auf Staging
- lokale/Remote-Migrationen danach synchron: Ja
- Restorepunkt referenziert: `~/.wuxuai-backups/staging-20260802-restaurant-controlled-points`
- Restore-Dump SHA-256: `886acf1c670878e5be087903e76d59cfde19ba34e52e129184198e9914f4fc3d`

## Staging-Verifikation

Vor Reparatur reproduziert:

- gleiche Bonnummer, zwei Kunden parallel: zwei Buchungen
- gleicher Key, geänderter Betrag/Kunde: alter Erfolg
- direkter Owner-Insert mit NULL-Source: erfolgreich

Nach Reparatur:

- gleiche normalisierte Bonnummer, zwei Kunden/QRs/Keys parallel: exakt eine Buchung
- zweiter Parallelrequest: `RECEIPT_ALREADY_USED`
- Nebenwirkungen: eine Balanceänderung, ein QR-Verbrauch, ein Completed Attempt
- gleicher Key, geänderter Betrag: `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`
- gleicher Key, anderer Kunde/QR: `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`
- paralleler identischer Request: eine Ledger-Zeile und eine Nebenwirkung
- direkter Owner-Insert: SQLSTATE `42501`, keine Zeile
- Fixture-Bereinigung: Transaktionen 0, Claims 0, QR-Referenzen 0, Fixture-Restaurants 0

## Automatisierte Prüfungen

- 49 neue Hardening-Tests
- fokussierte Punkteflow-Tests: 90/90
- vollständige Tests: 519/519
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Build: erfolgreich
- SQL-Parser über transaktionalen Staging-Dry-Run: erfolgreich
- Migration-Dry-Run: erfolgreich
- `git diff --check`: erfolgreich
- Secret-Scan: keine Secrets; nur Test-Regex-Begriffe

## Datenbank-Lint

Die neuen Hardening-Funktionen erzeugen keine neuen Remote-Lintbefunde. Der bestehende Remote-Schema-Lint meldet weiterhin sieben historische Fehler in alten Reward-/Registrierungsfunktionen sowie bekannte Warnungen. Diese Befunde wurden nicht durch die Reparatur verursacht und nicht außerhalb des Scopes refaktoriert.

## Offene Risiken

- Die drei ursprünglichen Security-Blocker sind auf Staging geschlossen.
- Die erweiterte Staging-Acceptance-Matrix kann nun fortgesetzt werden; physische Geräte- und Productiontests sind nicht Teil dieser Reparaturfreigabe.
- Keine Production-Migration oder Anwendungsauslieferung wurde durchgeführt.

## Prüfexport

- Vollständiger bereinigter Quellstand: `exports/2026-08-03_POINTS_IDEMPOTENCY_RECEIPT_DML_HARDENING.zip`
- Enthaltene Dateien: 595
- SHA-256: `7fc9277a9908554a79c1088012d01ce92fc4dcb7a0263d292a1b2d89e576ed75`
- Ausgeschlossen: `.git`, `node_modules`, Build-Ausgaben, `.env*`, Supabase-Tempdaten, Wrangler-Tempdaten und ältere ZIP-Artefakte

## Status

`REPAIR VERIFIED – CONTINUE STAGING TESTS`
