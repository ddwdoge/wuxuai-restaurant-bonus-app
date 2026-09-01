# Restaurantgesteuerte Punktevergabe

## Ausgangslage

Branch: `codex/restaurant-controlled-points-flow`

Der bestehende kundeninitiierte Bonstufen-Flow bleibt erhalten. Bestandsrestaurants werden durch die additive Migration ausdrücklich auf `customer_initiated_only` gesetzt. Neue `loyalty_settings` verwenden `restaurant_controlled_only`.

## Umsetzung

- Owner-Auswahl für restaurantgesteuert, kundeninitiiert oder beide
- konfigurierbares Buchungslimit: Standard 30.000 Cent, Minimum 100 Cent, Maximum 100.000 Cent
- fünf Minuten gültiger, opaque Kunden-QR und achtstelliger Ersatzcode
- serverseitig ausschließlich Hashes; direkte Tabellenrechte für Clients entzogen
- serverseitige Vorschau aus Centbetrag und vorhandener `amount_per_point`-Rate
- Tages-PIN-Prüfung mit bestehender Fehlversuchs- und Sperrlogik
- atomare Gutschrift und Single-Use-Verbrauch
- Idempotency-Key, `FOR UPDATE`, Bonnummer- und Kurzzeit-Wiederholungsschutz
- Warnung und Audit ab 80 Prozent des Restaurantlimits
- kompensierende, idempotente Gegenbuchung nur für Owner/Manager
- bestehendes Tageslimit von zwei erfolgreichen Punktebuchungen nach Restaurantzeitzone

## SECURITY DEFINER Review

| Funktion | Zweck | Ausführungsrecht | Search Path |
| --- | --- | --- | --- |
| `get_public_points_collection_mode` | öffentlich nur den aktiven Modus lesen | `anon`, `authenticated` | `public, pg_temp` |
| `update_points_collection_settings` | tenantgebundene Owner-Einstellung und Audit | `authenticated`; Owner/Admin/Manager im RPC | `public, pg_temp` |
| `create_customer_points_credit_qr` | Kundenzugang prüfen und kurzlebige Referenz erzeugen | `anon`, `authenticated`; geheimer Kundenzugang im RPC | `public, extensions, pg_temp` |
| `preview_restaurant_controlled_points` | Staff-Tenant, QR, Betrag und Vorschau prüfen | nur `authenticated` | `public, pg_temp` |
| `confirm_restaurant_controlled_points` | PIN prüfen, QR sperren, Punkte buchen und QR verbrauchen | nur `authenticated` | `public, pg_temp` |
| `reverse_restaurant_controlled_points` | kompensierende Gegenbuchung | nur `authenticated`; Owner/Manager im RPC | `public, pg_temp` |

Für QR- und Attempt-Tabellen wurden `anon` und `authenticated` sämtliche direkten Tabellenrechte entzogen. RLS ist aktiv. Es wurde keine Service Role in den Browser eingebaut.

## Transaktion und Locking

Die finale Bestätigung läuft in einer PostgreSQL-Funktion und damit in einer Transaktion. Die QR-Zeile wird mit `FOR UPDATE` gesperrt. Erst danach werden Status, Ablauf, Restaurant und Mitgliedschaft geprüft. Punktebuchung, Kundenbalance und `consumed_at` werden gemeinsam geschrieben. Der restaurantgebundene Idempotency-Key verwendet den bestehenden eindeutigen Index der Punktetransaktionen. Parallelaufrufe sehen entweder die Sperre, den bereits konsumierten QR oder dasselbe Idempotenzresultat.

## Datenschutz

Der QR enthält nur `{ type, token }`. Name, Telefonnummer, E-Mail, Customer-ID, Kundenzugang, Tages-PIN und Auth-Daten sind ausgeschlossen. Auditdaten enthalten Centbetrag, berechnete Punkte, Regelversion und Rate, aber weder QR-Rohwert noch PIN.

## UX

Owner konfigurieren Modus und Limit unter `Einstellungen -> Bonusprogramm -> Punkte sammeln`. Kunden erhalten im passenden Modus einen kurzlebigen persönlichen QR. Staff scannt diesen, erfasst Betrag und optionale Bonnummer, lädt eine Servervorschau und bestätigt über die Tages-PIN. Nicht erlaubte Modi werden zusätzlich unterhalb der UI blockiert.

## Tests

- 17 neue Vertrags- und Sicherheitstests
- Mandantentrennung, Rollen, Grants, Search Paths und direkte Tabellenrechte
- Bestandsdaten-Backfill und Defaults
- Ablauf, Hash-only, Single Use, Replay, Parallelität und Idempotenz
- Betragsgrenzen, Warnschwelle, Audit, Bonnummer und Rate Limit
- Tages-PIN, Tageslimit und Gegenbuchung
- Client sendet keine vertrauenswürdige Punktezahl

Der nachfolgende Integrationsstand ist im Bericht
`2026-08-01_RESTAURANT_CONTROLLED_POINTS_INTEGRATION_REPORT.md` dokumentiert.
Die dortige Gesamtsuite umfasst 459/459 erfolgreiche Tests.

Prüf-ZIP: `exports/2026-07-31_RESTAURANT_CONTROLLED_POINTS_FLOW.zip` (vollständiger aktueller Quellstand, bereinigt um Git-Metadaten, Abhängigkeiten, Builds, Umgebungsdateien und frühere Exportarchive).

## Nicht durchgeführt

- Migration nicht auf Staging angewendet
- kein echter Staging-Flow
- kein physischer Kamera-/Mobile-Safari-Test
- kein Push, Merge oder Deployment

## Offene Risiken

1. Referral-/Bonus-Boost-Multiplikation und atomare Erstbuchungsqualifizierung
   sind im additiven Integrationsstand umgesetzt, aber noch nicht auf Staging verifiziert.
2. SQL wurde als Migrationsvertrag statisch und per Remote-Dry-Run geprüft, aber
   mangels Docker/Podman noch nicht auf einer frischen lokalen Datenbank ausgeführt.
3. Browser-Kamera, PWA und physisches iPhone sind noch nicht live geprüft.

Status: **NOT READY** bis Migration, RPCs, RLS/Grants und der vollständige Flow auf Staging einschließlich Paralleltests verifiziert sind.
