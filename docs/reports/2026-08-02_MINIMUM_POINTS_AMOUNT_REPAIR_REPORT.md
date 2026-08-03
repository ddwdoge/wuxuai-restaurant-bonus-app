# Mindestbetrags-Reparatur für Punktebuchungen

## Ergebnis

Der bestätigte Staging-Fehler wurde mit zwei ausschließlich additiven
Migrationen behoben. Beträge unter 100 Cent werden jetzt vor QR-, PIN-,
Punkte-, Boost-, Referral-, Geschenk-, Balance- oder Erfolgs-Audit-Logik mit
dem stabilen Fehlercode `POINTS_AMOUNT_BELOW_MINIMUM` abgelehnt.

Die Reparatur wurde ausschließlich auf `wuxuai-bonus-staging` angewendet.
Production, GitHub und Cloudflare wurden nicht verändert.

## Ausgangslage

- Branch: `codex/restaurant-controlled-points-flow`
- Commit vor den lokalen Änderungen:
  `5173a9d1bf353fc2ed02fcc4cd9280ec04814b60`
- Staging-Ref maskiert: `bwhv...qaya`
- Verifizierter Restorepunkt:
  `~/.wuxuai-backups/staging-20260802-restaurant-controlled-points`
- Restoregrad:
  `RESTORE FILES VERIFIED, FULL RESTORE EXECUTION NOT AVAILABLE`
- Restore-Dump SHA-256:
  `886acf1c670878e5be087903e76d59cfde19ba34e52e129184198e9914f4fc3d`

## Ursache

`calculate_points_award_v1`, Preview und Confirmation akzeptierten jeden
positiven Centbetrag. Die gerundete Berechnung machte aus 50 Cent einen
Basispunkt; ein aktiver 2x-Boost erhöhte diesen anschließend auf zwei Punkte.

Der vorhandene Constraint von 100 bis 100.000 Cent schützte nur den vom Owner
konfigurierbaren Maximalbetrag. Für den Betrag einer einzelnen Buchung fehlte
eine absolute serverseitige Untergrenze.

## Migrationen

### 20260802001000_enforce_minimum_points_amount.sql

SHA-256:
`3fd3aa72e86bf39e755e8c51f862deb4adf9082a8c9094d7759ab569ac1c6bd4`

Enthält:

- privaten zentralen Validator `validate_minimum_points_amount_v1`
- sichere Wrapper für `calculate_points_award_v1` und `award_points_v1`
- identischen JSON-Fehlervertrag für Preview und Confirmation
- private, nicht für Browserrollen ausführbare Vorimplementierungen
- Trigger auf `points_transactions` als Schutz bestehender Legacy-Abhängigkeiten
- additiven `NOT VALID`-Constraint für neue betragbasierte Earn-Transaktionen
- keine Datenänderung und keine RLS-/Policy-Änderung

### 20260802002000_mark_minimum_validator_stable.sql

SHA-256:
`e9893df789213dd6bb992a8430d985217435d1c75756765dd22ddbbac58d7618`

Der Remote-Lint erkannte, dass die JSON-Konstruktion als `STABLE` und nicht als
`IMMUTABLE` einzustufen ist. Da die bereits angewendete Migration nicht
verändert werden durfte, wurde ausschließlich das Volatilitätsattribut mit
dieser zweiten additiven Migration korrigiert.

## Zentraler Fehlervertrag

- Fehlercode: `POINTS_AMOUNT_BELOW_MINIMUM`
- Nutzertext: `Der Mindestbetrag für eine Punktegutschrift beträgt 1,00 €.`
- Preview und Confirmation: identischer JSON-Vertrag
- interne Engine-Aufrufe: kontrollierter fachlicher PostgreSQL-Fehler `P0001`
- keine internen Tabellen-, Funktions-, PIN-, Token- oder Kundendaten

## Berechtigungen und Sicherheit

- `validate_minimum_points_amount_v1`: kein `SECURITY DEFINER`, kein EXECUTE für
  `public`, `anon` oder `authenticated`
- neue Engine-Wrapper: `SECURITY DEFINER`, fester
  `search_path = public, pg_temp`, kein Browser-EXECUTE
- Preview und Confirmation: `SECURITY DEFINER`, fester `search_path`, nur
  `authenticated`
- private Vorimplementierungen: kein Browser-EXECUTE
- Triggerfunktion: kein `SECURITY DEFINER`, kein Browser-EXECUTE
- RLS weiterhin aktiv auf `points_transactions`, QR-Referenzen und Attempts
- keine Service-Role im Browser

## Nebenwirkungsprüfung auf Staging

Vor dem ersten gültigen Versuch wurden nacheinander geprüft:

- Preview mit 50 Cent
- Confirmation mit 50 Cent ohne Boost
- Confirmation mit 50 Cent und aktivem 2x-Boost
- Preview mit 99 Cent
- Confirmation mit 99 Cent

Alle fünf Aufrufe lieferten `POINTS_AMOUNT_BELOW_MINIMUM`.

Vor dem anschließenden gültigen Versuch:

- Punktetransaktionen: 0
- Balance: unverändert 0
- QR verbraucht: Nein
- Credit-Attempts: 0
- Geschenkstatus: unverändert gesperrt
- Referral-/Boost-Nebenwirkung: keine
- erfolgreiche Bonnummernregistrierung: keine

Danach wurde derselbe QR mit 100 Cent bestätigt:

- erfolgreich: Ja
- genau eine positive Transaktion: Ja
- Basispunkte: 1
- aktiver 2x-Boost einmal angewendet: 2 Punkte
- QR danach verbraucht: Ja
- abgelehnte Transaktionen unter 100 Cent: 0

Die gesamte Fixture wurde anschließend vollständig gelöscht.

## Datenbankzustand nach Bereinigung

- Restaurants: 3
- Branches: 3
- Restaurant-Memberships: 3
- Loyalty Settings: 3
- Kunden: 0
- Punktetransaktionen: 0
- Punkte-Nettosumme: 0
- QR-Referenzen: 0
- Credit-Attempts: 0
- lokale und Remote-Migrationen: synchron bis `20260802002000`

## Prüfungen

- SQL-Parser: 27 Statements plus 2 Statements erfolgreich
- fokussierte Punkteflow-Tests: 41/41 erfolgreich
- Gesamttests: 470/470 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Secret-Scan: 0 gefährliche Treffer
- Remote-Datenbank-Lint: keine Befunde für die neuen Reparaturfunktionen
- bestehende Remote-Lint-Altbefunde außerhalb dieses Scopes: weiterhin offen

## Offene Gates

Die Mindestbetragsreparatur ist verifiziert. Noch separat nachzuholen sind:

- echte Parallelitätsläufe mit gleichem und unterschiedlichem Idempotency-Key
- vollständige Idempotenz-/Replay-Matrix
- Referral-Qualifizierung und Erstbuchung
- Storno/Gegenbuchung
- vollständiger Vergleich beider Punkte-Modi
- Restaurant- und absolute Maximalbetragsmatrix
- physisches iPhone Safari, installierte PWA und Staff-Tablet
- physischer Restoretest, sobald Docker/Podman verfügbar ist

Prüf-ZIP: `exports/2026-08-02_MINIMUM_POINTS_AMOUNT_REPAIR.zip`

Status: **REPAIR VERIFIED – CONTINUE STAGING TESTS**
