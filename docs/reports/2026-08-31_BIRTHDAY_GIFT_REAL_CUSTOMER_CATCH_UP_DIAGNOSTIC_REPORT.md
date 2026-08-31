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

## Founder-freigegebener kanonischer Catch-up-Lauf

Nach der Root-Cause-Feststellung wurde der kanonische Job ausschliesslich auf
Development/Test ausgefuehrt. Es wurde kein direkter Insert verwendet.

Erster Lauf:

```sql
select public.issue_birthday_gifts(now());
```

Globales Ergebnis des kanonischen Jobs:

```text
issued: 3
skipped: 1
mode: automatic_14_day_window
```

Der Job prueft vertragsgemaess alle aktuell berechtigten Development/Test-
Kunden. Fuer den geprueften Zielkunden entstand genau eine Zuweisung fuer
`birthday_year = 2026`.

Zielkunden-Verifikation nach dem ersten Lauf:

- Birthday Gifts 2026: **1**
- Reward: `Eigene Ueberraschung`
- Reward aktiv: **JA**
- Birthday Pool aktiviert: **JA**
- Starter-Gift-Pool: **JA**
- Restaurant- und Branch-Zuordnung korrekt: **JA**
- Assignment Source: `birthday_automatic_v1_catch_up`
- Audit Events: **1 / PASS**
- E-Mail-Queue-Eintraege: **1 / PASS**, Status `PENDING`
- Punktebalance: `340`, unveraendert
- Punktetransaktionen: `2`, unveraendert
- Visits: `2`, unveraendert
- letzter Visit: unveraendert
- Stamp Balance: `0`, unveraendert

Die Audit-Metadaten fuer Geburtstag und Geburtstagsjahr werden durch die
bestehende Sicherheitsfunktion als `[ENTFERNT]` gespeichert. Der Audit-Vertrag
ist trotzdem vollstaendig erfuellt: Event, Aktion, Status, Actor, Restaurant,
Customer und Zielobjekt stimmen mit der Zuweisung ueberein.

Idempotenzpruefung durch einen erneuten kanonischen Lauf:

```text
issued: 0
skipped: 4
mode: automatic_14_day_window
```

Danach blieben fuer den Zielkunden unveraendert:

- Birthday Gifts 2026: **1**
- Audit Events: **1**
- E-Mail-Queue-Eintraege: **1**
- Punktebalance und Punktetransaktionen: unveraendert
- Visits und letzter Visit: unveraendert

## Datenmutation

- manuelle `customer_rewards`-Zuweisung: **NEIN**
- direkter Insert: **NEIN**
- Aufruf von `assign_birthday_gift_if_eligible(...)`: **NEIN**
- kanonischer `issue_birthday_gifts(now())`-Lauf auf Development/Test: **JA**
- kanonischer Idempotenzlauf auf Development/Test: **JA**
- Update an Customer oder Membership: **NEIN**
- Production-Mutation: **NEIN**
- Datenbank-/Codeaenderung: **NEIN**

## Abschluss

- Aufgabe: Realen Birthday-Catch-up-Datensatz pruefen und Ursache bestimmen
- Build: Ja, unveraenderter aktueller Code-Stand bereits mit 2067 Modulen PASS
- Migration: Keine neue; `20260831001000` auf Development/Test vorhanden
- Flow-Test: Ja, kanonischer Catch-up und Idempotenz live auf Development/Test
- RLS/Security: Ja, keine Grants veraendert; kein direkter Insert
- Alte Logik geprueft: Ja
- Report: `docs/reports/2026-08-31_BIRTHDAY_GIFT_REAL_CUSTOMER_CATCH_UP_DIAGNOSTIC_REPORT.md`
- Pruef-ZIP: `exports/2026-08-31_BIRTHDAY_GIFT_REAL_CUSTOMER_CATCH_UP_DIAGNOSTIC.zip`
- Offene Risiken: keine fuer den geprueften realen Catch-up-Datensatz
- Status: FINAL LOCK fuer den geprueften Birthday-Gift-14-Day-Catch-up
