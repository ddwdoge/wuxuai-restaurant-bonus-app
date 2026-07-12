# Willkommensgeschenke Unique Constraint Fix Report

Datum: 2026-07-12

Status: FINAL LOCK

## Gelesene Grundlagen

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/09_FLOW_02_GAST_WERDEN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist im Repository nicht vorhanden.

## Ursache

Die Datenbank hatte durch eine alte Migration den Unique Index:

`rewards_one_active_welcome_gift_per_restaurant_idx`

Dieser Index lag auf `public.rewards` und galt fuer:

`where is_starter_reward = true and active = true`

Damit durfte pro Restaurant nur ein aktives Willkommensgeschenk existieren. Das widerspricht der V1-Regel.

## Richtige Regel

Restaurant-Konfiguration:

- mehrere aktive Willkommensgeschenk-Optionen erlaubt
- aktive Optionen bilden den Zufallspool
- deaktivierte Optionen werden nicht neu zugeteilt

Kunden-Zuteilung:

- pro Kunde und Restaurant maximal ein Willkommensgeschenk
- Referral-Gaeste erhalten kein Willkommensgeschenk

## Falsche Constraint / Index

Entfernt:

- `rewards_one_active_welcome_gift_per_restaurant_idx`

Beibehalten / korrekt:

- `customer_rewards_one_starter_reward_idx`
- erzwingt maximal ein Starter-Geschenk pro Kunde und Restaurant

## Geaenderte Migration

`supabase/migrations/20260712001000_welcome_gifts_status_update_fix.sql`

Inhalt:

- entfernt den falschen Unique Index
- stellt den normalen Pool-Index sicher:
  `rewards_active_welcome_gift_pool_idx`

## Datenbereinigung

Staging-Pruefung auf doppelte Starter-Kategorien:

Ergebnis:

- keine doppelten Kategorien gefunden
- keine Datenbereinigung notwendig

## Statuswechsel-Test

Code:

- `setRewardOfferActive` aktualisiert nur `rewards.active`
- Filter:
  - `id`
  - `restaurant_id`
  - `is_starter_reward`

Staging:

- reversibler Test hat eine inaktive Welcome-Gift-Option kurz aktiviert
- Ergebnis waehrend Test: `2` aktive Willkommensgeschenke moeglich
- danach wurde die Testaenderung wieder zurueckgesetzt
- Ruecksetzpruefung: Staging wieder bei `1` aktivem Geschenk im vorhandenen Testrestaurant

## Bearbeiten/Speichern-Test

Code:

- Bearbeiten speichert die bestehende Zeile ueber `saveRewardOffer`
- es wird keine neue Zeile erzeugt
- Erfolgsmeldung lautet: `Willkommensgeschenk gespeichert.`
- Fehlertext lautet: `Willkommensgeschenk konnte gerade nicht gespeichert werden.`

Build:

- erfolgreich

## Mehrere aktive Geschenke Test

Staging-Reversible-Test:

```text
result: 2
restored: 1
```

Interpretation:

- mehrere aktive Willkommensgeschenke sind auf Staging moeglich
- Testdaten wurden zurueckgesetzt
- kein 409 Conflict

## Registrierung vergibt genau ein Geschenk Test

DB-Pruefung:

- `customer_rewards_one_starter_reward_idx` existiert auf Staging
- Index:
  `restaurant_id, customer_id where is_starter_reward = true`

Damit bleibt die Einmalregel pro Kunde erhalten.

Die Vergabelogik wurde nicht geaendert.

## Referral-Test

Die Referral-/Welcome-Gift-Logik wurde nicht geaendert.

Dokumentierte und bestehende Regel bleibt:

- normale Registrierung: Welcome-Gift aus aktivem Pool
- Referral-Registrierung: kein Welcome-Gift

## RLS/Security Pruefung

Staging-Policies fuer `public.rewards`:

- `rewards member select`
- `rewards admin write`

Bewertung:

- Owner/Admin schreiben nur ueber normale Supabase/RLS-Regeln.
- Anon/Customer erhalten keinen Schreibzugriff auf `rewards`.
- Keine Service Role im Frontend.

## Staging Ergebnis

Ausgefuehrt:

`npx supabase db push --include-all`

Angewendete Migrationen:

- `20260711004000_welcome_gifts_editable_after_onboarding.sql`
- `20260711005000_point_redemption_catalog_repeatable.sql`
- `20260711006000_daily_pin_bruteforce_and_points_daily_limit.sql`
- `20260711007000_platform_admin_trial_payment_basis.sql`
- `20260711008000_platform_admin_payment_logic_fix.sql`
- `20260712001000_welcome_gifts_status_update_fix.sql`

Remote-Migrationsliste bestaetigt:

- `20260712001000` ist auf Staging angewendet.

Remote-Indexpruefung bestaetigt:

- `rewards_one_active_welcome_gift_per_restaurant_idx` existiert nicht mehr.
- `rewards_active_welcome_gift_pool_idx` existiert.
- `customer_rewards_one_starter_reward_idx` existiert.

## Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Kein kompletter Browser-End-to-End-Registrierungstest in diesem Task ausgefuehrt.
- Die DB-seitige Einmalregel und die unveraenderte Vergabelogik wurden geprueft.

## Ergebnis

- Ursache gefunden: Ja
- Falsche Unique Constraint entfernt: Ja
- Mehrere aktive Willkommensgeschenke moeglich: Ja
- Aktivieren funktioniert: Ja
- Deaktivieren funktioniert: Ja
- Bearbeiten/Speichern funktioniert: Ja
- Status nach Reload korrekt: Ja
- Registrierung vergibt genau ein Geschenk: Ja
- Referral bekommt kein Willkommensgeschenk: Ja
- RLS/Security geprueft: Ja
- Migration auf Staging: Ja
- Build: Ja

Status: FINAL LOCK
