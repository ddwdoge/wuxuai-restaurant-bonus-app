# Platform Admin V1 - Loop 3A Backend Contract

Datum: 2026-08-24

Branch: `codex/v1-canonical-recovery`

Ausgangscommit: `919141181223aa414ef004a09aa3f02637f2b7fd`

Status: **CODE LOCK / MIGRATION NICHT ANGEWENDET**

## Ursache

Der bestehende RPC `get_platform_restaurant_detail` liefert nur eine kleine
Legacy-Auswahl und zählt Einlösungen aus alten Tabellen. Er unterscheidet
außerdem fehlende Daten nicht zuverlässig von echten Nullwerten. Damit war er
keine sichere Grundlage für das Restaurant Control Center.

## Neuer Vertrag

Die additive Migration
`20260824005000_platform_admin_restaurant_control_center.sql` ergänzt den
read-only RPC `get_platform_restaurant_control_center(uuid)`. Die Funktion:

- prüft die autoritative Plattformrolle erneut über `is_platform_admin()` und
  damit über aktive `platform_admins`-Einträge;
- verwendet `SECURITY DEFINER` mit `search_path = public, pg_temp`;
- ist für `public` und `anon` gesperrt und nur für `authenticated` ausführbar;
- liefert Aggregate für genau ein angefordertes Restaurant;
- gibt keine Kundenlisten, Telefonnummern, Geburtstage, PINs, Token, SMTP-
  Inhalte oder rohe Audit-Metadaten aus;
- fängt Query-Fehler nicht pauschal ab. Ein Datenbankfehler bleibt deshalb ein
  RPC-Fehler und wird nicht in eine Null umgewandelt.

Der TypeScript-Service stellt den neuen Vertrag bereit. Die bestehende UI wird
in Loop 3A noch nicht auf ihn umgestellt.

## Quelleninventar

| Bereich | Autoritative Quelle | Filter | Zeit | Testausschluss | Fehlende Daten |
| --- | --- | --- | --- | --- | --- |
| Restaurant | `restaurants`, `profiles`, `auth.users` | exakte `restaurant_id` | n/a | n/a | Restaurant fehlt: RPC-Fehler |
| Abo/Testphase | primäre `branches`, `branch_subscriptions` | Branch gehört zum Restaurant | Serverzeit | n/a | `unavailable` |
| Kunden | `customers` | Restaurant | rollierende 30 Tage | `is_test_customer = false` | echte Null ist `available: 0` |
| Punkte | `points_transactions` + `customers` | `type = earn`, Restaurant | Heute in Restaurant-Zeitzone; 30 Tage rollierend | Testkunden ausgeschlossen | echte Null ist `available: 0` |
| Einlösungen | `redemption_activity_journal` | finalisiert, `ACTIVE`, drei V1-Typen | Heute in Restaurant-Zeitzone; 30 Tage rollierend | `is_test_event = false` | echte Null ist `available: 0` |
| Willkommensgeschenke | `rewards` | aktiv und `is_starter_reward` | aktuell | n/a | echte Null ist `available: 0` |
| Geburtstagsgeschenke | `customer_rewards` + `customers` | `gift_type = birthday`, aktiv/präsentiert | aktuell | Testkunden ausgeschlossen | echte Null ist `available: 0` |
| Empfehlungen | `referrals` + `customers` | `qualified_at` gesetzt | 30 Tage rollierend | Test-Referrer ausgeschlossen | echte Null ist `available: 0` |
| 2x-Booster | `customer_bonus_boosts` + `customers` | aktiv und nicht abgelaufen | aktuell | Testkunden ausgeschlossen | echte Null ist `available: 0` |
| Booster-Zusatzpunkte | deduplizierte `audit_log`-Punkteevents | Referral-Boost und numerische Base-/Final-Werte | 30 Tage rollierend | Testevents und Testkunden ausgeschlossen | echte Null ist `available: 0` |
| Registrierung | `audit_log` | `CUSTOMER_REGISTERED` | 24 Stunden / 7 Tage | Testevents ausgeschlossen | kein Signal: `unavailable` |
| E-Mail | `customer_transactional_email_deliveries` + `customers` | Restaurant | 24 Stunden / aktuell | Testkunden ausgeschlossen | keine Zustellung: `unavailable` |
| Standort | primäre `branches` | Restaurant und gültige Koordinaten | aktuell | n/a | kein Branch: `unavailable` |
| Geocoding-Lauf | keine restaurantgebundene Telemetrie | n/a | n/a | n/a | `unavailable` |
| Staff | `staff_members`, `restaurant_daily_pins`, `loyalty_settings` | aktiv, Restaurant/Branch | PIN aktuell gültig | n/a | fehlende Basis: `unavailable` |
| Cron | keine belastbare restaurantgebundene Job-Telemetrie | n/a | n/a | n/a | `unavailable` |
| Audit | `audit_log` | Restaurant, letzte 20 | Serverzeit | Testevents ausgeschlossen | leere Liste |

Alle Tagesgrenzen werden als halboffenes Intervall vom lokalen Tagesbeginn bis
zum nächsten lokalen Tagesbeginn in `restaurants.timezone_name` berechnet. Der
Fallback ist `Europe/Vienna`. Die als `30d` bezeichneten Kennzahlen sind
bewusst rollierende 30-Tage-Fenster.

## Health-Regeln

Registrierung:

- `error`: mindestens drei fehlgeschlagene oder blockierte Events in 24 Stunden
- `warning`: mindestens ein Fehler in 24 Stunden oder 7 Tagen
- `healthy`: mindestens ein erfolgreicher Vorgang und keine obige Warnung
- `unavailable`: keine autoritative Aktivität

E-Mail:

- `error`: mindestens drei fehlgeschlagene Zustellungen in 24 Stunden
- `warning`: mindestens ein Fehler oder ein offener Retry
- `healthy`: mindestens eine erfolgreiche Zustellung ohne offene Warnung
- `unavailable`: keine Zustelltelemetrie

Einlösung:

- `error`: mindestens drei Fehler/Blockierungen in 24 Stunden
- `warning`: mindestens ein Fehler/Blockierung in 24 Stunden
- `healthy`: erfolgreicher Auditvorgang oder finalisierte Einlösung vorhanden
- `unavailable`: kein autoritatives Signal

Standort ist `healthy`, wenn Adresse und gültige Koordinaten vorhanden sind,
sonst `warning`; ohne Branch ist der Zustand `unavailable`. Staff ist nur bei
vorhandener Punkteflow-Konfiguration, aktivem Mitarbeiter, gültiger Tages-PIN
und verfügbarem QR-Flow `healthy`.

Gesamtzustand:

1. irgendein `error` ergibt `error`;
2. sonst irgendein `warning` ergibt `warning`;
3. nur wenn alle ausgewerteten Subsysteme `healthy` sind, ergibt sich `healthy`;
4. fehlende Telemetrie ergibt ansonsten `unknown`.

`unknown` wird niemals als gesund dargestellt.

## Audit und Datenschutz

Der RPC gibt nur die letzten 20 nicht als Test markierten Events zurück. Bekannte
Schlüssel erhalten lesbare Labels. Vorher-/Nachher-Daten werden beim bestehenden
Abo-Event auf Abo-, Zahlungs- und Trialstatus begrenzt. Die vollständigen
Audit-Metadaten werden nicht ausgegeben, damit etwa historische Provider-IDs
nicht in den Browser gelangen.

## Zahlungen und Schreibaktionen

Die bestehende Schreib-RPC bleibt unverändert. Restaurantstatus, Abostatus und
Trial-Verlängerung bleiben serverseitig rollenvalidiert und auditiert. Eine
strukturierte manuelle Zahlungsakte existiert nicht. Der neue Vertrag meldet
`manual_payment` deshalb ausdrücklich als `deferred`; Stripe oder eine neue
Zahlungsarchitektur wurden nicht gebaut.

## Migration und Reihenfolge

Verbindliche Reihenfolge:

1. `20260824003000_platform_admin_foundation_hardening.sql` - Staging angewendet
2. `20260824004000_authenticated_referral_registration_bridge.sql` - offen
3. `20260824005000_platform_admin_restaurant_control_center.sql` - lokal vorbereitet

`05000` wurde nicht auf Staging angewendet und darf `04000` nicht überspringen.
Normale Tenant-RLS, Customer-, Owner-, Staff-, Punkte-, Referral-, Einlösungs-
und E-Mail-Flows wurden nicht verändert.

## Prüfung

- lokaler PostgreSQL-Compile mit Stub-Schema: PASS
- lokaler Lauf mit synthetischem Restaurant ohne Betriebsdaten: PASS
- echte Nullwerte: als `available: 0` bestätigt
- fehlender Branch/Abo/Telemetrie: als `unavailable` bestätigt
- negativer Plattformrollenfall: `PLATFORM_ADMIN_ACCESS_DENIED` bestätigt
- neue Vertragstests: 10/10 PASS
- vollständige Tests: 832/832 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Staging-Migration: NICHT ANGEWENDET
- DB-Linter gegen Staging: NICHT AUSGEFÜHRT

## Risiken

- `04000` muss vor `05000` kontrolliert auf Staging angewendet werden.
- Cron- und letzter Geocoding-Lauf bleiben ohne restaurantgebundene Telemetrie
  bewusst `unavailable`.
- Die UI nutzt weiterhin den alten Detailvertrag, bis Loop 3B ausdrücklich
  freigegeben wird.
- Eine strukturierte manuelle Zahlungsakte bleibt zurückgestellt.

## Ergebnis

Der sichere, autoritative Backendvertrag ist lokal bereit. Wegen der bewusst
nicht angewendeten Migration lautet der Projektstatus **CODE LOCK**, nicht
FINAL LOCK.
