# Willkommensgeschenke Status Update Fix Report

Datum: 2026-07-12

Status: LOCK

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

Der Button fuer Aktivieren/Deaktivieren nutzte den allgemeinen `saveRewardOffer`-Pfad. Dadurch wurde beim reinen Statuswechsel ein komplettes Reward-Update mit vielen Geschenkdetails ausgefuehrt. Dieser breite Pfad ist anfaellig fuer Spalten-, Constraint- und Branch-Scope-Probleme.

Zusaetzlich existiert in der Migrationshistorie ein alter Unique-Index `rewards_one_active_welcome_gift_per_restaurant_idx`, der nur ein aktives Willkommensgeschenk pro Restaurant erlaubt. Das widerspricht der aktuellen V1-Regel: Willkommensgeschenke bilden einen aktiven Pool.

## Geaenderte Dateien

- `src/modules/rewards/rewardService.ts`
- `supabase/migrations/20260712001000_welcome_gifts_status_update_fix.sql`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-12_WILLKOMMENSGESCHENKE_STATUS_UPDATE_FIX_REPORT.md`

## Betroffene Tabelle / RPC

Tabelle:

- `public.rewards`

Betroffene Spalten:

- `active`
- `is_starter_reward`
- `restaurant_id`

RPC:

- Keine RPC geaendert.

## Fix

`setRewardOfferActive` fuehrt fuer `source = "reward"` jetzt ein schmales Update aus:

- nur `active` wird geaendert
- Filter auf `id`
- Filter auf `restaurant_id`
- Filter auf `is_starter_reward`
- Rueckgabe ueber `rewardSelect`

Der allgemeine Vollspeicherpfad bleibt fuer echte Bearbeitungen bestehen.

Die neue Migration entfernt defensiv erneut den alten Unique-Index und stellt den Pool-Index sicher:

- `drop index if exists public.rewards_one_active_welcome_gift_per_restaurant_idx`
- `rewards_active_welcome_gift_pool_idx`

## RLS-Pruefung

Bestehende RLS-Policy:

- `rewards admin write`
- erlaubt Schreibzugriff nur fuer `public.is_restaurant_admin(restaurant_id)`

Der Frontend-Fix nutzt keine Service Role. Anon und Customer koennen den Status nicht direkt aendern. Restaurant Owner/Admin bleiben auf das eigene `restaurant_id` begrenzt.

## Aktivieren-Test

Statisch und per Build geprueft:

- Inaktives Geschenk ruft `setRewardOfferActive(gift, true)` auf.
- UI aktualisiert die Karte mit dem Rueckgabewert.
- Erfolgsmeldung: `Willkommensgeschenk aktiviert.`

## Deaktivieren-Test

Statisch und per Build geprueft:

- Aktives Geschenk ruft `setRewardOfferActive(gift, false)` auf.
- UI aktualisiert die Karte mit dem Rueckgabewert.
- Erfolgsmeldung: `Willkommensgeschenk deaktiviert.`

## Reload-Test

Nach erfolgreichem Update wird der Status in `public.rewards.active` gespeichert. Beim Reload liest `loadRewardOffers` echte Reward-Daten erneut aus Supabase.

## Abo-Fehler

Die Willkommensgeschenke-Seite ist nicht von Subscription-Daten abhaengig. Der Statuswechsel nutzt nur `restaurant_id`, `id`, `is_starter_reward` und `active`. Ein separater Abo-Ladefehler blockiert diesen Update-Pfad nicht.

## Build-Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Kein Live-Staging-Update wurde in diesem Task ausgefuehrt, weil diese Aufgabe keinen Staging-Push verlangte.
- Falls Staging die spaetere Editable-Welcome-Gifts-Migration noch nicht hat, muss die neue Migration vor Live-Nutzung angewendet werden.

## Ergebnis

- Ursache gefunden: Ja
- Aktivieren repariert: Ja
- Deaktivieren repariert: Ja
- RLS/Security geprueft: Ja
- Build erfolgreich: Ja

Status: LOCK
