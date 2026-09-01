# Live-Go Hardening Staging Final Report

Datum: 2026-07-14

Status: NOT READY

## Aufgabe

Staging-Finalprüfung für den Live-Go-Hardening-Block:

- Migration `20260713004000_live_go_hardening_rate_limit_owner_race.sql` auf Supabase Staging anwenden.
- Rate-Limit für `redeem_customer_reward` live prüfen.
- Customer Portal ohne Login prüfen.
- Owner Registration Retry/Idempotenz live prüfen.
- RLS/RPC live prüfen.
- Build ausführen.

## Gelesene Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-13_LIVE_GO_HARDENING_RATE_LIMIT_OWNER_RACE_REPORT.md`
- `docs/reports/2026-07-13_LIVE_GO_HARDENING_NOT_READY_ANALYSE.md`

Hinweis:

- `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Repository nicht als eigene Datei.
- Die Selbstkontroll-Regeln wurden aus `AGENTS.md` und `docs/18_CODEX_REGELN.md` angewendet.

## Supabase Zugriff

Staging-Projektlink vorhanden:

- Projektname: `wuxuai-bonus-staging`
- Projekt-Ref: `bwhvfjuwixgwduoeqaya`

Zugriff:

- `SUPABASE_ACCESS_TOKEN`: nicht gesetzt
- Supabase CLI: vorhanden (`2.109.1`)
- `npx supabase migration list`: fehlgeschlagen

Fehler:

```text
Access token not provided. Supply an access token by running `supabase login` or setting the SUPABASE_ACCESS_TOKEN environment variable.
```

Bewertung:

Supabase Staging ist korrekt verlinkt, aber nicht authentifiziert. Der Auftrag verlangt in diesem Fall Stoppen und `NOT READY`.

## migration list Ergebnis

Nicht erfolgreich.

Grund:

- Supabase-Zugriff fehlt.

## db push Ergebnis

Nicht ausgeführt.

Grund:

- Zugriff fehlt.
- Laut Auftrag darf bei fehlendem Zugriff nicht weitergemacht werden.

## Angewendete Migrationen

Nicht geprüft.

Die Zielmigration wurde nicht auf Staging angewendet:

- `20260713004000_live_go_hardening_rate_limit_owner_race.sql`

## Rate-Limit Live-Tests

Nicht durchgeführt.

Nicht geprüft:

- gültiger `customer_token` + eigener unlocked Reward
- fremder Reward
- ungültiger `customer_token` mehrfach
- deutsche Rate-Limit-Fehlermeldung
- Attempt Logging
- erneute Einlösung eines bereits eingelösten Rewards

## Customer Portal ohne Login Test

Nicht durchgeführt.

Nicht geprüft:

- Customer Portal ohne Supabase Auth Login
- `customer_token` als Besitznachweis
- normale Punkteeinlösung ohne PIN
- keine aktive Code+PIN Legacy
- deutsche Fehlertexte

## Owner Registration Live-/Retry-Test

Nicht durchgeführt.

Nicht geprüft:

- normaler Owner Register Flow
- Restaurant wird erstellt oder gefunden
- Membership wird erstellt oder gefunden
- Trial/Subscription wird erstellt oder gefunden
- Retry/Idempotenz
- Pending Data bleibt bei Session-Verzögerung erhalten

## RLS/RPC Live-Test

Nicht durchgeführt.

Nicht geprüft:

- anon kann Rate-Limit Attempts nicht direkt lesen
- anon kann interne Restaurantdaten nicht direkt lesen
- anon kann Tages-PIN nicht lesen
- `redeem_customer_reward` ist nur über `customer_token` sicher nutzbar
- fremder Reward wird blockiert
- authenticated User sieht keine fremden Restaurantdaten

## Build Ergebnis

Nicht ausgeführt.

Grund:

- Der Auftrag verlangt bei fehlendem Supabase-Zugriff das Stoppen.
- Der vorherige Code-Block hatte bereits einen erfolgreichen Build, aber dieser Final-Staging-Lauf wurde wegen fehlendem Zugriff vor Build gestoppt.

## Offene Risiken

- Migration nicht auf Staging angewendet.
- Rate-Limit nicht live geprüft.
- Attempt Logging nicht live geprüft.
- Owner Registration Race Fix nicht live geprüft.
- RLS/RPC nicht live geprüft.
- Kein FINAL LOCK möglich.

## Erforderlicher nächster Schritt

Supabase-Zugriff herstellen:

- entweder `supabase login`
- oder `SUPABASE_ACCESS_TOKEN` temporär in der lokalen Shell setzen

Danach erneut ausführen:

```bash
npx supabase migration list
npx supabase db push --include-all
```

Anschließend die Live-Staging-Tests für Rate-Limit, Customer Portal, Owner Registration und RLS/RPC durchführen.

## Status

NOT READY
