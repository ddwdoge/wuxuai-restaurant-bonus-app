# WUXUAI BONUS P1 - Birthday Gift Real Customer Catch-up Diagnostic

Stand: 2026-08-31

Ziel: Development/Test Supabase `bwhvfjuwixgwduoeqaya`

## Auftrag

Fuer den aktuellen Restaurantkunden mit Geburtstag 06.09. wurde unmittelbar
und ausschliesslich lesend geprueft, ob in `customer_rewards` bereits eine
Zuweisung mit `gift_type = 'birthday'` und `birthday_year = 2026` besteht.
Vor Feststellung der Ursache durfte keine Zuweisung erzeugt werden.

## Live-Befund

- Restaurant: `Kaffee Konditorei baeckerei`
- Restaurant-Slug: `wu-und-xu-group-gmbh`
- Restaurantstatus: `active`
- Restaurant-Zeitzone: `Europe/Vienna`
- lokales Datum: `2026-08-31`
- Geburtstag: `06.09.`
- Abstand: `+6` lokale Kalendertage
- Customer-Membership: `active`
- zentrale Account-Membership: vorhanden
- Customer und Account-Membership angelegt: `2026-08-30 19:47:21 UTC`
- Birthday-Pool: 3 aktive, branchpassende Rewards
- `customer_rewards` Birthday 2026: **0**
- vorhandene Birthday-Zuweisung 2026: **NEIN**

## Runtime-Vertrag

- Migration `20260831001000` ist live vorhanden.
- Trigger `customer_account_membership_birthday_gift_catch_up` ist aktiviert.
- Trigger `customer_birthday_gift_eligibility_change` ist aktiviert.
- Cron-Job 6 ist aktiv und ruft taeglich um `01:30 UTC`
  `select public.issue_birthday_gifts(now());` auf.
- Letzter Lauf: `2026-08-31 01:30 UTC`, Status `succeeded`.

## Root Cause

Der reale Kunde und seine zentrale Membership bestanden bereits vor Anwendung
der neuen Catch-up-Migration. Die Migration erstellt:

1. einen Trigger fuer neue Membership-Inserts,
2. einen Trigger fuer spaetere Birthday-/Membership-Status-Aenderungen,
3. die neue Window-Logik fuer den bestehenden taeglichen Cron.

Trigger werden bei der Migration nicht rueckwirkend fuer bestehende Zeilen
ausgeloest. Die Migration enthaelt ausserdem keinen einmaligen Aufruf von
`issue_birthday_gifts(now())`. Der letzte taegliche Cron war bereits um
`01:30 UTC` gelaufen, bevor die neue Migration spaeter am selben Tag angewendet
wurde. Damit gab es fuer diesen bestehenden Datensatz nach Aktivierung der
neuen Logik noch kein ausloesendes Ereignis.

Dies ist kein Eligibility-, Pool-, Membership-, Tenant- oder Cron-Fehler. Es
ist eine einmalige Deployment-/Backfill-Luecke zwischen dem letzten Cronlauf
und der Migrationsanwendung.

## Datenmutation

- manuelle `customer_rewards`-Zuweisung: **NEIN**
- Aufruf von `assign_birthday_gift_if_eligible(...)`: **NEIN**
- Aufruf von `issue_birthday_gifts(...)`: **NEIN**
- Update an Customer oder Membership: **NEIN**
- Datenbank-/Codeaenderung: **NEIN**

## Sichere naechste Wege

- Regulär warten: Der naechste aktive Cronlauf prueft den Kunden erneut im
  weiterhin gueltigen Fenster.
- Nach ausdruecklicher Founder-Freigabe: den kanonischen, idempotenten
  `issue_birthday_gifts(now())`-Job einmal kontrolliert auf Development/Test
  ausfuehren. Keine direkte Row-Zuweisung verwenden.

## Abschluss

- Aufgabe: Realen Birthday-Catch-up-Datensatz pruefen und Ursache bestimmen
- Build: Ja, unveraenderter aktueller Code-Stand bereits mit 2067 Modulen PASS
- Migration: Keine neue; `20260831001000` auf Development/Test vorhanden
- Flow-Test: Ja, ausschliesslich lesende Live-Datenbankdiagnose
- RLS/Security: Ja, keine Grants oder Daten veraendert
- Alte Logik geprueft: Ja
- Report: `docs/reports/2026-08-31_BIRTHDAY_GIFT_REAL_CUSTOMER_CATCH_UP_DIAGNOSTIC_REPORT.md`
- Pruef-ZIP: `exports/2026-08-31_BIRTHDAY_GIFT_REAL_CUSTOMER_CATCH_UP_DIAGNOSTIC.zip`
- Offene Risiken: bestehender Kunde wartet ohne kontrollierten Lauf bis zum naechsten Cron
- Status: NOT READY fuer diesen realen Datensatz bis Zuweisung kanonisch erfolgt und nachgeprueft ist
