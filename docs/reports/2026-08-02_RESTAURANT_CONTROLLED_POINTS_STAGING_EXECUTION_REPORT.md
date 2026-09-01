# Staging-Ausfuehrung: restaurantgesteuerte Punktevergabe

## Ergebnis

Der kontrollierte Lauf wurde ausschliesslich gegen `wuxuai-bonus-staging`
(Project Ref maskiert: `bwhv...qaya`) ausgefuehrt. Production, GitHub und
Cloudflare wurden nicht veraendert.

Vor dem ersten Datenbank-Write wurde ein vollstaendiger logischer Restorepunkt
erstellt und verifiziert. Beide freigegebenen Migrationen wurden danach einzeln
und in der vorgesehenen Reihenfolge angewendet. Der erste echte Staging-E2E-Test
hat einen kritischen fachlichen Fehler gefunden: Eine restaurantgesteuerte
Buchung ueber 0,50 EUR wurde akzeptiert. Mit aktivem 2x-Boost entstanden zwei
Punkte. Erwartet war eine serverseitige Ablehnung unterhalb von 1,00 EUR.

Entsprechend der Stop-Regel wurden alle weiteren E2E-, Parallelitaets-,
Referral-, Storno- und Modustests beendet. Es wurde kein Hotfix ausgefuehrt.

## Ausgangszustand

- Branch: `codex/restaurant-controlled-points-flow`
- Commit: `5173a9d1bf353fc2ed02fcc4cd9280ec04814b60`
- Zeitpunkt des Restorepunkts: 2. August 2026, Europe/Vienna
- Remote-Migrationen vor dem Lauf: synchron bis `20260730002000`
- Offene Migrationen vor dem Lauf: genau `20260731001000` und
  `20260801001000`
- Restaurants: 3
- Branches: 3
- Restaurant-Memberships: 3
- Loyalty Settings: 3
- Kunden: 0
- Punktetransaktionen: 0
- Punkte-Nettosumme: 0
- Rewards: 6
- Audit-Eintraege: 30

## Logischer Restorepunkt

Sicherer lokaler Speicherort ausserhalb des Repositorys:

`~/.wuxuai-backups/staging-20260802-restaurant-controlled-points`

Der Ordner besitzt Modus `0700`, die Dateien Modus `0600`. Der Pfad ist nicht
Teil von Git oder des Pruefexports.

| Datei | SHA-256 |
| --- | --- |
| `public-schema.sql` | `c00e7f3c6502c66fcba7d79af68cc107b2c80e1aa06080d56d9f0183979b2d3c` |
| `public-data.sql` | `6054246d114c11c3a770ad67939d251c72fd26f472ac08b92d8d70b5eb3108f1` |
| `public-full.dump` | `886acf1c670878e5be087903e76d59cfde19ba34e52e129184198e9914f4fc3d` |
| `migration-history.sql` | `6aeca1df74b419fe65bc70668e32b23827d0022ad34524e6ab0956dd23160620` |
| `function-signatures-grants.csv` | `a5d509041c1672b34c708c12309d67aa01e64d4029cf4e6b134260f48f62cfa3` |
| `rls-policies.csv` | `d0f8309505953eaa68b715b4327c549c2ca89048fa2f254e857ee533abe027f3` |
| `table-grants.csv` | `f159289aeb85c9a6f5f60cd79eee9cc3da164c1ce3f0d738d184e550559db9fe` |
| `table-rls-grants.csv` | `8824b5c5ad72feea257b67d3b4f98e8846cb2ae8b1fae8e7350946c4fdea5c61` |
| `row-counts.txt` | `db378289a270699bfb777bbd73050bb50dd751f55f8d67908ef9e4bb20ba87bd` |
| `manifest.txt` | `007304579f899d8b62ff56d99fa9def3b3d83c07f06e14ab1a523bceb9620dd5` |
| `rollback-plan.md` | `5549677743379899271a8d0c99b8d3b7d4b0a2daf41d517848140121af2ce78f` |

## Restore-Verifikation

- Alle Dateien vorhanden, lesbar und nicht leer: Ja
- Exportprozesse ohne Fehler beendet: Ja
- SHA-256-Pruefsummen verifiziert: Ja
- Schema syntaktisch geparst: Ja, 1.281 Statements
- Custom-Dump-Inhaltsliste lesbar: Ja, 984 Eintraege
- Tabellen-Daten im Custom Dump: 53
- Tabellen im Data-Dump gegen Staging abgeglichen: 53/53
- Zeilenzahlabweichungen: 0
- Funktionen im Custom Dump: 281
- Policies im Custom Dump: 74
- Trigger im Custom Dump: 54
- Constraints im Custom Dump: 266
- Indizes im Custom Dump: 62
- Sequenzen im Custom Dump: 3
- Migration-History vor dem Lauf: 73 Eintraege
- Grants und RLS separat exportiert: Ja
- Secret-Pruefung: keine Zugangsdaten, JWTs, Service-Role-Keys,
  Refresh-Tokens, SMTP-Passwoerter, Klartext-PINs oder QR-Rohtokens gefunden
- Vollstaendiger physischer Test-Restore: nicht verfuegbar, weil lokal weder
  Docker noch Podman installiert ist

Restoregrad:

`RESTORE FILES VERIFIED, FULL RESTORE EXECUTION NOT AVAILABLE`

## Angewendete Migrationen

1. `20260731001000_restaurant_controlled_points_collection.sql`
   - SHA-256:
     `afbed67b991e9bd7e576340bb7d1c11e9d200701ee98e5ad5d22adce84cdd894`
   - isolierter Remote-Dry-Run und Staging-Anwendung: erfolgreich
   - Bestandsrestaurants: weiterhin `customer_initiated_only`
   - Default fuer neue Restaurants: `restaurant_controlled_only`
   - Maximalbetrag: Default 30.000 Cent, Constraint 100 bis 100.000 Cent
   - RLS fuer QR-Referenzen und Credit-Attempts: aktiv
   - Direkte Browser-DML-Rechte auf sensible Tabellen: keine

2. `20260801001000_shared_points_bonus_engine.sql`
   - SHA-256:
     `b9b9cb34979bfd7fe9105a9c760f8076a12423d7f9e344bc6b1e9fa630aa42a7`
   - isolierter Remote-Dry-Run und Staging-Anwendung: erfolgreich
   - Snapshot-Spalten und Constraints: vorhanden
   - interne Engine-Funktionen: `SECURITY DEFINER`, fester
     `search_path = public, pg_temp`, kein EXECUTE fuer Browserrollen
   - Legacy-Collect-Signaturen: fuer Browserrollen entzogen
   - oeffentliche Preview-/Confirm-Rechte: nur fuer die vorgesehenen Rollen

Nach der Anwendung sind lokale und Remote-Migrationen bis einschliesslich
`20260801001000` synchron.

## Kritischer E2E-Befund

Isolierter Testfall:

1. Neues Testrestaurant ueber die echten Datenbanktrigger erstellt.
2. Default `restaurant_controlled_only` bestaetigt.
3. Testkunde, gueltige QR-Referenz, korrekte Tages-PIN und aktiver 2x-Boost
   innerhalb einer isolierten Testtransaktion vorbereitet.
4. Restaurantgesteuerte Buchung mit 50 Cent bestaetigt.

Beobachtung:

- Request wurde akzeptiert.
- Eine Punktetransaktion wurde erzeugt.
- Basispunkt wurde auf 1 gerundet.
- Boost ergab 2 gutgeschriebene Punkte.

Ursache im Datenbankvertrag:

- `calculate_points_award_v1` sowie Preview und Confirmation pruefen derzeit nur
  auf `amount_cents > 0` und auf das Restaurant-Maximum.
- Die verbindliche Untergrenze von 100 Cent wird in der
  restaurantgesteuerten Buchungsfunktion nicht serverseitig erzwungen.
- Der Constraint 100 bis 100.000 Cent schuetzt nur den konfigurierbaren
  Maximalbetrag, nicht den Betrag einer einzelnen Punktebuchung.

Der Fehler ist sicherheits- und konsistenzrelevant. Er muss mit einer neuen
additiven Reparaturmigration in Engine, Preview und Confirmation behoben und
anschliessend erneut parallel sowie end-to-end getestet werden.

## Bereinigung und Datenintegritaet

Die isolierten Testdaten wurden trotz des Fehlers vollstaendig entfernt. Der
Post-Test-Abgleich entspricht exakt dem Ausgangsbestand:

- Restaurants 3, Branches 3, Members 3, Settings 3
- Kunden 0, Customer Tokens 0
- Punktetransaktionen 0, Punkte-Nettosumme 0
- QR-Referenzen 0, Credit-Attempts 0
- Bonus-Boosts 0, Customer Rewards 0, Tages-PINs 0
- Rewards 6, Audit-Eintraege 30
- Testsession- und Fixture-Reste 0

Es wurden keine Staging-Bestandsdaten veraendert. Die zwei Migrationen bleiben
angewendet; ein ungeprueftes Zurueckrollen wurde nicht vorgenommen.

## Nicht ausgefuehrte Tests

Wegen des kritischen Befunds wurden bewusst nicht mehr ausgefuehrt:

- parallele QR- und Idempotenztests
- beide Punkte-Modi im vollstaendigen E2E-Vergleich
- Referral-Qualifizierung und Erstbuchung
- Storno/Gegenbuchung
- Rate-Limit- und Anomalietests
- physisches iPhone Safari, installierte PWA und Staff-Tablet

## Rollback- und Reparaturentscheidung

Bevorzugt ist eine additive Reparaturmigration. Sie muss mindestens den
Mindestbetrag von 100 Cent konsistent in gemeinsamer Engine, Preview und finaler
Confirmation erzwingen. Danach sind die gestoppten Tests mit einer neuen
eindeutigen Testsession vollstaendig nachzuholen.

Ein vollstaendiger Restore ist derzeit nicht erforderlich, weil die Migrationen
additiv angewendet wurden, die Testdaten bereinigt sind und der Ausgangsbestand
unveraendert blieb. Der verifizierte Restorepunkt bleibt fuer den Notfall
erhalten.

## Offene Risiken

1. Betragswerte zwischen 1 und 99 Cent koennen aktuell serverseitig akzeptiert
   werden.
2. Parallelitaet, Idempotenz, Referral und Storno sind nach dem realen
   Migrationslauf noch nicht abschliessend verifiziert.
3. Ein physischer Restoretest ist mangels Docker/Podman offen.
4. Physische Mobilgeraete- und PWA-Tests sind offen.

## Projektchecks

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 459/459 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich

Pruef-ZIP:
`exports/2026-08-02_RESTAURANT_CONTROLLED_POINTS_STAGING_EXECUTION.zip`

## Reparaturstatus

Der Mindestbetragsfehler wurde mit den additiven Migrationen `20260802001000`
und `20260802002000` behoben und auf Staging verifiziert. Details:
`docs/reports/2026-08-02_MINIMUM_POINTS_AMOUNT_REPAIR_REPORT.md`

Status: **REPAIR VERIFIED – CONTINUE STAGING TESTS**
