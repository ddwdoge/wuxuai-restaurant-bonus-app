# V1 Legacy RPC Lint Fix - Final Push Gate

Datum: 2026-08-13

Branch: `codex/v1-release-finishing-sprint`

Ausgangscommit: `c5cf4b91fe605518d3f4fe85dd701752f6a784a4`

## Umfang

Dieser Forward-Fix behebt ausschliesslich sieben Fehler des Supabase-DB-Linters
in bestehenden Registrierungs- und Einloesungs-RPCs. Historische Migrationen,
UI, Produktlogik, RLS-Policies und aktive V1-Vertraege wurden nicht umgebaut.

## Original 7 Linter Errors

| Nr. | RPC | SQLSTATE | PL/pgSQL-Zeile | Ursache | Verwendung |
| ---: | --- | --- | ---: | --- | --- |
| 1 | `redeem_reward(uuid,uuid,text,uuid,text)` | `42P10` | 100 | `ON CONFLICT` verwies auf keinen aktuellen Unique-/Exclusion-Vertrag | Legacy-Kompatibilitaet, direkte Browser-Ausfuehrung entzogen |
| 2 | `register_campaign_customer(text,text,text,text,date)` | `42702` | 52 | Variable und Kundenspalte `normalized_phone` waren mehrdeutig | Aktiver V1-Legacy-Call-Site in `campaignService` |
| 3 | `redeem_reward_with_staff_session(uuid,uuid,text,uuid,text)` | `42P10` | 90 | Nicht mehr passender allgemeiner `ON CONFLICT`-Vertrag | Aktiver Legacy-Call-Site in `rewardService` |
| 4 | `register_referral_customer(text,text,text,text,date)` | `42702` | 49 | Variable und Kundenspalte `normalized_phone` waren mehrdeutig | Basiskontrakt des Legal-/Referral-Flows |
| 5 | `register_restaurant_customer(text,text,text,date)` | `42702` | 34 | Variable und Kundenspalte `normalized_phone` waren mehrdeutig | Basiskontrakt des Legal-Registrierungsflows |
| 6 | `redeem_reward_with_pin(text,uuid,text,text)` | `42P10` | 147 | Nicht mehr passender allgemeiner `ON CONFLICT`-Vertrag | Historische PIN-Kompatibilitaet, direkte Ausfuehrung entzogen |
| 7 | `register_referral_customer(text,text,text,text,date,text)` | `42702` | 73 | Variable und Kundenspalte `normalized_phone` waren mehrdeutig | Device-ergaenzender Basiskontrakt des Referral-Flows |

Die Fehler wurden gegen das verbundene Staging-Schema erneut reproduziert,
bevor die neue Migration erstellt wurde.

## Root Cause per RPC

Die vier Registrierungsvertraege verwendeten einen PL/pgSQL-Bezeichner, der mit
der spaeter hinzugefuegten Kundenspalte `normalized_phone` kollidierte. Der Fix
benennt die lokale Variable in `normalized_phone_value` um und qualifiziert die
Kundenabfrage ueber `existing_customer` eindeutig. Telefon-Normalisierung,
Restaurantfilter und transaktionaler Advisory Lock bleiben erhalten.

Die drei Einloesungsvertraege gingen von einem allgemeinen Unique-Vertrag fuer
`customer_rewards` aus. Dieser Vertrag existiert absichtlich nicht mehr, da
normale Punktebelohnungen wiederholt erworben werden duerfen. Vorhanden sind nur
fachlich begrenzte partielle Eindeutigkeiten fuer Willkommens- und
Geburtstagsgeschenke. Ein breiter Unique-Constraint waere daher eine
Produktregression gewesen.

## Functions Fixed

Die additive Migration
`20260813001000_fix_legacy_rpc_lint_errors.sql` definiert exakt die sieben oben
genannten Signaturen neu. Alle bleiben `SECURITY DEFINER`, besitzen einen festen
`search_path`, und ihre direkte Ausfuehrung bleibt fuer `public`, `anon` und
`authenticated` entzogen.

## Constraints / ON CONFLICT Fixes

Bei einer Reward-Einloesung wird nun deterministisch der aelteste passende,
noch nicht eingeloeste Zuteilungsdatensatz mit Row Lock aktualisiert. Existiert
keiner, wird ein neuer Einloesungsdatensatz angelegt. Dadurch bleibt die
Wiederholbarkeit normaler Rewards erhalten und parallele Zugriffe werden nicht
auf einen erfundenen Constraint gestuetzt.

Die Campaign-Zuteilung verwendet fuer den betroffenen Legacy-Pfad ein
`INSERT ... SELECT ... WHERE NOT EXISTS` mit vollstaendigem Tenant-, Kunden- und
Reward-Scope. Es wurde kein neuer Unique-Constraint angelegt und kein
historischer Constraint veraendert.

## Registration Regression Tests

- Laufzeittest in einer Transaktion: normale Restaurantregistrierung bestanden.
- Leerwertvalidierung fuer Telefonnummer bestanden.
- Telefonnummer mit Leerzeichen wurde normalisiert.
- Wiederholter Aufruf erzeugte keinen zweiten Kunden.
- Campaign-Registrierung und wiederholter Aufruf bestanden; die Reward-Zuteilung blieb einmalig.
- Referral-Basisvertrag und Device-Wrapper bestanden; der bestehende Kunde wurde wiederverwendet.
- Alle Laufzeittestdaten wurden per `ROLLBACK` verworfen.
- Contract-Tests pruefen Restaurant-Scope, Alias-Qualifizierung, Advisory Lock und unveraenderte aktive Legal-Wrapper.

Die vorhandene Suite deckt zusaetzlich Customer Identity, Restaurantkontext,
Duplicate Prevention, Tenant-Isolation und parallele/idempotente V1-Flows ab.

## Redemption Regression Tests

- `redeem_reward`: erfolgreicher Reward-Pfad und blockierter Zweitversuch bestanden.
- `redeem_reward_with_staff_session`: erfolgreicher Pfad und blockierter Zweitversuch bestanden.
- `redeem_reward_with_pin`: erfolgreicher Pfad, Single-Use-Code und blockierter Zweitversuch bestanden.
- Alle drei Tests liefen mit echten lokalen Tabellen/Funktionen und wurden vollstaendig zurueckgerollt.
- Contract-Tests pruefen die deterministische Row-Lock-Auswahl, den Insert-Fallback und das Fehlen eines breiten Unique-Constraints.
- Die aktive 15-Minuten-Praesentation sowie Welcome-/Birthday-/historische Vertraege wurden nicht ersetzt.

## Clean DB Result

Alle 91 lokalen Migrationen wurden in Dateireihenfolge auf einer leeren lokalen
PostgreSQL-Datenbank ausgefuehrt. Die neue Migration lief als letzte Datei ohne
Fehler; das resultierende Schema enthaelt die erwarteten Tabellen und alle sieben
reparierten Funktionen. Ergebnis: **PASS**.

## Upgrade Result

Die vorherigen 90 Migrationen wurden mit repraesentativen Restaurant-, Branch-,
Kunden-, Punkte-, Reward-, Zuteilungs- und Legal-Daten aufgebaut. Danach wurde
nur die Forward-Fix-Migration angewendet. IDs, Restaurant-Slug, Punktestand und
Datensatzanzahlen blieben identisch; die geprueften Kernbeziehungen ergaben null
verwaiste Datensaetze. Ergebnis: **PASS**.

## DB Linter Result

`supabase db lint --schema public --level warning --fail-on error` meldet auf
dem resultierenden Upgrade-Schema **0 Fehler**. Die urspruenglichen sieben
SQLSTATE-Fehler sind beseitigt. Verbleibend sind ausschliesslich bereits
vorhandene Warnungen, unter anderem ein fehlender expliziter Return-Pfad in
`ensure_today_restaurant_pin` sowie ungenutzte Parameter/Variablen in anderen
Funktionen. Diese Warnungen sind nicht Teil dieses eng begrenzten Sprints.

## RLS Result

RLS ist auf `restaurants`, `customers`, `rewards` und `customer_rewards`
weiterhin aktiv. Die sieben Funktionen behalten feste `search_path`-Werte.
`anon` und `authenticated` besitzen fuer keine der sieben Signaturen direkte
EXECUTE-Rechte. Es wurden keine Policies oder Tabellen-Grants gelockert.
Ergebnis: **PASS**.

## Tests

- Neue direkte Contract-Tests: 9/9 bestanden.
- Vollstaendige Projektsuite: 679/679 bestanden.
- Lokale transaktionale RPC-Laufzeitchecks: Registrierung 3/3 und Redemption 3/3 bestanden.

## Typecheck

`npm run typecheck`: **PASS**.

## Lint

`npm run lint`: **PASS**, 0 Fehler und 8 bereits vorhandene Warnungen.

## Build

`npm run build`: **PASS** (Vite, 2012 Module transformiert).

## Secret Scan

Die neue Migration, der neue Test und dieser Bericht enthalten keine
Zugangsdaten, Tokens, `.env`-Inhalte oder Dumps. Ergebnis: **PASS**.

## Staging Dry Run

Das verknuepfte Projekt wurde maskiert als `bwhv...` bestaetigt.
`supabase migration list --linked` zeigt die bisherigen 90 Migrationen remote
und nur `20260813001000` lokal offen. Der Dry-Run plant exakt:

`20260813001000_fix_legacy_rpc_lint_errors.sql`

Keine Seeds, Rollen oder weiteren Migrationen wuerden angewendet. Es wurde kein
echter DB Push ausgefuehrt. Ergebnis: **PASS**.

## Git Diff

Erlaubter Scope:

- `supabase/migrations/20260813001000_fix_legacy_rpc_lint_errors.sql`
- `tests/legacy-rpc-lint-fix.test.mjs`
- `docs/reports/V1_LEGACY_RPC_LINT_FIX_FINAL_PUSH_GATE.md`

Der bereits vorgefundene ungetrackte Bericht
`docs/reports/V1_FINAL_MIGRATION_PUSH_READINESS_REPORT.md` wurde nicht veraendert
oder verworfen. Keine UI-Datei, historische Migration, `.env`, ZIP, Dump oder
Build-Ausgabe ist Teil des vorgesehenen Diffs.

## Remaining Risks

- Die Migration ist auf Staging nur geplant, noch nicht angewendet. Daher bleibt
  der Remote-Linter bis zu einem spaeter freigegebenen Staging-Push auf dem alten Stand.
- Die vorhandenen DB-Lint-Warnungen ausserhalb der sieben Fehler bleiben bewusst offen.
- Kein Production-Lauf, Push, Merge oder Deployment wurde ausgefuehrt.

## Gate

Der Code- und Migrationsstand ist fuer einen kontrollierten Staging-Push bereit.
Production bleibt ausdruecklich nicht freigegeben; Stripe bleibt zurueckgestellt.
