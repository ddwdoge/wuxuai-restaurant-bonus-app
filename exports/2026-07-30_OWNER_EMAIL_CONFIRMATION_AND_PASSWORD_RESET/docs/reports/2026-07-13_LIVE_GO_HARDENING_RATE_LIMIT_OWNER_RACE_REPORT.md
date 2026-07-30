# Live-Go Hardening Rate-Limit und Owner Race Report

Datum: 2026-07-13

Status: NOT READY

## Ursache

Vor dem Live-Go gab es zwei technische Risiken:

- `redeem_customer_reward(customer_token, reward_id)` war als öffentliche Customer-Portal-RPC bewusst erreichbar, hatte aber kein eigenes Einlöseversuchs-Limit. Ungültige Tokens, fremde Rewards oder bereits eingelöste Rewards konnten dadurch zu häufig probiert werden.
- `completePendingOwnerRegistration` konnte bei langsamer Supabase-Auth-Session zu früh abbrechen. Zusätzlich war die Owner-Trial-RPC nicht vollständig idempotent und konnte bei Wiederholung unnötige Duplikat-Risiken erzeugen.

## Geänderte Dateien

- `supabase/migrations/20260713004000_live_go_hardening_rate_limit_owner_race.sql`
- `src/modules/rewards/rewardService.ts`
- `src/modules/auth/registerOwnerService.ts`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

### Rate-Limit für `redeem_customer_reward`

- Neue Tabelle `customer_reward_redemption_attempts` protokolliert Einlöseversuche.
- `customer_token` wird nicht im Klartext gespeichert, sondern nur als Hash.
- Maximal 5 Einlöseversuche pro Token-Hash in 10 Minuten.
- Bei Überschreitung gibt die RPC eine deutsche Fehlermeldung zurück:
  `Zu viele Einlöseversuche. Bitte warte kurz und versuche es erneut.`
- Erwartete Fehlerfälle werden als JSON-Antwort zurückgegeben, damit das Attempt Logging nicht durch SQL-Rollback verloren geht.
- Fremde Rewards, ungültige Tokens, gesperrte Willkommensgeschenke, bereits eingelöste Willkommensgeschenke und fehlende Punkte werden weiterhin serverseitig blockiert.
- Legacy Code+PIN-RPCs bleiben für `anon` und `authenticated` entzogen.

### Frontend-Verhalten

- `redeemCustomerReward` wertet `success: false` aus RPC-Antworten aus.
- Deutsche Server-Fehlermeldungen werden als UI-Fehler weitergegeben.
- Erfolgreiche Einlösungen behalten die bestehende Result-Struktur.

### Owner Registration Race Fix

- `completePendingOwnerRegistration` wartet mit kurzem Backoff auf eine belastbare Supabase-Session.
- Falls Auth noch nicht bereit ist, bleibt die Pending Registration im Browser erhalten.
- Pending-Daten werden erst nach erfolgreicher Trial-/Restaurant-Erstellung entfernt.
- `start_restaurant_owner_trial` wurde idempotent gemacht:
  - vorhandenes Restaurant für denselben Owner wird wiederverwendet,
  - Membership wird per Upsert gesichert,
  - Branch Subscription wird per Upsert gesichert,
  - bestehende Trial-/Subscription-Werte werden nicht unnötig überschrieben.

## Was wurde nicht geändert

- Keine neue Produktlogik.
- Keine UI-Neugestaltung.
- Keine Tages-PIN-Logik.
- Keine Punkteformel.
- Keine Bonus-Boost-Logik.
- Keine Willkommensgeschenk-Zufallslogik.
- Keine Aktionen/Kampagnen.
- Keine 6-stellige Code- oder PIN-Einlösung.

## Migration

Erstellt:

- `20260713004000_live_go_hardening_rate_limit_owner_race.sql`

Auf Staging angewendet:

- Nein

Grund:

- In der lokalen Umgebung war kein `SUPABASE_ACCESS_TOKEN` gesetzt. Deshalb wurde kein `npx supabase db push --include-all` gegen Staging ausgeführt.

## Staging Ergebnis

Nicht durchgeführt.

Offene Staging-Prüfungen:

- Migration auf Supabase Staging anwenden.
- `redeem_customer_reward` mit gültigem Token und eigenem Reward testen.
- Fremden Reward testen.
- Ungültigen Token mehrfach testen und Rate-Limit bestätigen.
- Bereits eingelöstes Willkommensgeschenk mehrfach testen.
- Owner Registration nach E-Mail-Bestätigung und wiederholtem Login testen.

## RLS / Security

Code-Prüfung:

- `customer_reward_redemption_attempts` hat RLS aktiv.
- Direkter öffentlicher Tabellenzugriff ist nicht erlaubt.
- Restaurant-Mitglieder können eigene Attempts lesen, wenn `restaurant_id` vorhanden ist.
- Einfügen erfolgt über Security-Definer-RPC.
- `customer_token` wird in Attempts nicht im Klartext gespeichert.
- `redeem_customer_reward` bleibt bewusst für `anon` und `authenticated` ausführbar, weil Kunden über Token identifiziert werden.

Live-/Staging-Prüfung:

- Nicht durchgeführt.

## Tests

### Code-Prüfung

- Rate-Limit-Pfad geprüft.
- Invalid-Token-Pfad geprüft.
- Foreign-Reward-Pfad geprüft.
- Redeemed-/Locked-Pfade geprüft.
- Normale Punkteeinlösungspfad geprüft.
- Willkommensgeschenk-Einlösungspfad geprüft.
- Owner Registration Retry-Pfad geprüft.
- Owner Registration Idempotenz-RPC geprüft.
- Alte Code+PIN-RPC Grants geprüft.

### Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Migration ist noch nicht auf Supabase Staging angewendet.
- Kein Live-Staging-Test der Rate-Limit-Grenze.
- Kein Live-Staging-Test der Owner Registration Race Condition.
- Keine echte RLS-/Grant-Verifikation gegen Staging.

## Status

NOT READY

Begründung:

Der Code-Build ist erfolgreich und die Hardening-Änderungen sind implementiert. Wegen neuer Migration und Security-relevantem RPC-Verhalten ist nach Engineering Bible jedoch Staging-Migration plus echter Flow-Test Pflicht. Beides konnte ohne Supabase Access Token nicht durchgeführt werden.
