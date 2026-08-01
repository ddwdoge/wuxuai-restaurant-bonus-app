# Restaurantgesteuerte Punktevergabe: Integrationsbericht

## Ausgangslage und Ursache

Der erste Entwurf berechnete restaurantgesteuerte Punkte separat mit `floor`
und berücksichtigte keinen aktiven Bonus Boost. Der bestehende Kundenflow nutzt
hingegen gerundete Basispunkte, den höchsten aktiven restaurantgebundenen Boost
und qualifiziert Referrals erst nach der ersten erfolgreichen Punktebuchung.

## Gemeinsame Bonus-Engine

`calculate_points_award_v1` ist die einzige Berechnung für beide Modi. Eingaben
sind Restaurant, Customer und servervalidierter Centbetrag. Ergebnis sind
Basispunkte, Multiplikator, Endpunkte, Regelversion, Rate, Boost-Quelle und
Ablaufzeit. `award_points_v1` berechnet erneut, schreibt Snapshot und Balance und
ruft anschließend die gemeinsamen Erfolgsfolgen auf.

Die vorhandene Großzügigkeit wirkt über `amount_per_point`. Der höchste aktive
Boost wird genau einmal angewendet. Abgelaufene oder fremde Boosts werden
ignoriert. V1 besitzt keinen aktiven Kampagnen-Punktemultiplikator; Aktionen und
Kampagnen bleiben gemäß Bible außerhalb des V1-Punktepfads. Es existiert kein
separates Wochenlimit. Das Tageslimit von zwei positiven Buchungen und das
Transaktionslimit bleiben erhalten.

Der kundeninitiierte Flow verwendet weiterhin den serverseitigen Mindestbetrag
der gewählten Bon-Stufe. Der restaurantgesteuerte Flow verwendet den vom Staff
erfassten und serverseitig validierten exakten Betrag. Wenn beide Flows denselben
Centbetrag an die gemeinsame Engine geben, ist das Ergebnis identisch.

## Referral und Erstbuchung

Erstbuchung ist die erste erfolgreiche positive `earn`-Transaktion derselben
Restaurant-Membership. Historische und migrierte positive Buchungen zählen.
Preview, Fehler und Idempotenz-Retries zählen nicht. Storno entfernt die
historische Erstbuchung nicht und reaktiviert keinen Boost.

Die Qualifizierung wird nach dem Transaktionsinsert unter kundenbezogenem
Advisory Lock geprüft. Der pending Referral wird mit `FOR UPDATE` gesperrt und
atomar aktiviert. Referrer und geworbener Gast erhalten den bestehenden 2×-Boost
mit der zum Qualifizierungszeitpunkt gespeicherten restaurantbezogenen Dauer.

## Preview und Confirmation

Preview ruft ausschließlich die lesende Engine auf und verändert keine
Referral-, Reward- oder QR-Zustände. Confirmation validiert Modus, Restaurant,
Membership, Betrag, Limit, QR, Rate Limit, Bonnummer, Tageslimit und Tages-PIN
erneut. Danach wird unter Lock neu berechnet. Der Client übermittelt keine
Punktezahl. Ein paralleler Retry prüft den Idempotenzschlüssel nach dem QR-Lock
erneut und gibt denselben gespeicherten Erfolg zurück.

## SECURITY DEFINER und Berechtigungen

Neue interne Funktionen:

- `calculate_points_award_v1`: gemeinsame lesende Berechnung
- `apply_successful_points_effects_v1`: Erstqualifizierung und Reward-Freischaltung
- `award_points_v1`: atomare Transaktion, Balance und Snapshot

Alle verwenden `search_path = public, pg_temp`. EXECUTE ist `public`, `anon` und
`authenticated` entzogen. Sie sind nur aus den eng begrenzten öffentlichen
SECURITY-DEFINER-Funktionen erreichbar. Legacy-Signaturen von
`collect_bonus_points` sind ebenfalls für Browserrollen gesperrt.

Öffentlich erreichbar bleiben:

- `collect_bonus_points_v1`: `anon`, `authenticated`, geheimer Kundenzugang
- `preview_restaurant_controlled_points`: nur `authenticated`, Staff-Tenantprüfung
- `confirm_restaurant_controlled_points`: nur `authenticated`, Staff-Tenantprüfung
- `get_public_points_collection_mode`: `anon`, `authenticated`; liefert nur den Modus

Roh-QR, Kundenzugang und Tages-PIN werden weder gespeichert noch auditiert.

## Migration und Prüfung

- `20260731001000_restaurant_controlled_points_collection.sql`
- `20260801001000_shared_points_bonus_engine.sql`
- Remote-Dry-Run gegen eindeutig verknüpftes `wuxuai-bonus-staging`: erfolgreich;
  beide Migrationen würden in dieser Reihenfolge angewendet.
- Migration auf Staging angewendet: Nein.
- Kontrollierter Staging-Preflight am 1. August 2026: Ziel, Remote-Stand,
  Dry-Run, Teilzustand, anonymisierte Bestandszahlen und Grant-Baseline geprüft.
- Restorestatus: blockiert. Die Supabase-Backupabfrage meldet keine verfügbaren
  physischen Backups und kein PITR. Entsprechend wurde vor dem ersten Write
  abgebrochen.
- Lokaler `supabase db reset`: blockiert, weil Docker und Podman nicht installiert sind.
- Destruktive Datenänderungen: keine; neue Snapshot-Spalten sind nullable.
- Bestandsrestaurants bleiben `customer_initiated_only`; neue Settings verwenden
  `restaurant_controlled_only`.

## Tests

- 30 fokussierte Punkteflow-Vertrags- und Securitytests erfolgreich
- Gesamtsuite: 459/459 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Echter Datenbank-Paralleltest: offen
- Echter Staging-Flow: offen
- Physisches iPhone/PWA/Staff-Tablet: offen

## Risiken

1. Ohne lokalen PostgreSQL-Container wurde die PL/pgSQL-Migration noch nicht
   gegen eine frische Datenbank ausgeführt; der Remote-Dry-Run ist kein Ersatz.
2. Der kundeninitiierte Bonstufenflow verwendet bewusst den Stufen-Mindestbetrag,
   während der Staff-Flow den exakten Rechnungsbetrag verwendet. Die Engine ist
   identisch, die fachlichen Eingabebeträge können jedoch abweichen.
3. Ausschlüsse wie Lieferplattformen können ohne Kassenintegration nur durch
   Staff-Anweisung und Audit, nicht technisch anhand einer Zahlungsquelle geprüft werden.
4. Reale Parallelität, Kamera, Safari, PWA und schwaches Netz sind noch offen.
5. Vor einer Staging-Anwendung muss ein tatsächlich wiederherstellbarer
   Backup-/Restorepunkt bestätigt werden.

Prüf-ZIP: `exports/2026-08-01_RESTAURANT_CONTROLLED_POINTS_INTEGRATION.zip`
(vollständiger aktueller Quellstand ohne Git-Metadaten, Abhängigkeiten,
Umgebungsdateien, Buildausgaben oder ältere Archive).

Status: **NOT READY**
