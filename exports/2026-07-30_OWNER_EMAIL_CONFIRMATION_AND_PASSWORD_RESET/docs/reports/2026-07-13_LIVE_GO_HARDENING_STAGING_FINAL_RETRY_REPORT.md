# Live-Go Hardening Staging Final Retry Report

Datum: 2026-07-14

Status: FINAL LOCK

## Aufgabe

Wiederholung des Staging-Finaltests für den Live-Go-Hardening-Block.

Geprüft wurden:

- Staging-Migrationen
- Rate-Limit für `redeem_customer_reward`
- normaler Customer Flow ohne Supabase Auth Login
- ungültiger Token mit Rate-Limit
- Attempt Logging
- Owner Registration Retry/Idempotenz
- RLS/RPC
- Build

## Gelesene Dateien

- `AGENTS.md`
- `docs/18_CODEX_REGELN.md`
- `docs/reports/2026-07-13_LIVE_GO_HARDENING_STAGING_FINAL_REPORT.md`

## Supabase Zugriff

Staging-Projekt:

- Projektname: `wuxuai-bonus-staging`
- Projekt-Ref: `bwhvfjuwixgwduoeqaya`

Hinweis:

- Die Codex-CLI-Shell hatte weiterhin keinen sichtbaren `SUPABASE_ACCESS_TOKEN` und bekam bei `npx supabase migration list` einen 403.
- Der Founder hat denselben Projektordner lokal mit ausreichenden Supabase-Rechten genutzt und `npx supabase db push --include-all` erfolgreich ausgeführt.
- Die anschließenden Live-Tests wurden aus Codex heraus über die öffentliche Staging-API und den App-Anon-Key durchgeführt, ohne Secrets auszugeben.

## migration list Ergebnis

Vom Founder lokal geprüft.

Remote bestätigt:

- `20260713001000`
- `20260713002000`
- `20260713003000`
- `20260713004000`

## db push Ergebnis

Vom Founder lokal ausgeführt.

Angewendet:

- `20260713001000_tenant_isolation_reward_rpc_security_final.sql`
- `20260713002000_platform_admin_restaurant_management.sql`
- `20260713003000_redeem_customer_reward_anon_security_decision.sql`
- `20260713004000_live_go_hardening_rate_limit_owner_race.sql`

Ergebnis:

- `Finished supabase db push.`

## Rate-Limit Live-Test

Live über Staging-API geprüft.

Test:

- `redeem_customer_reward` sechsmal mit eindeutig ungültigem `customer_token`.

Ergebnis:

- Versuch 1-5: `success=false`, `reason=invalid_token`
- Versuch 6: `success=false`, `reason=rate_limited`
- Deutsche Fehlermeldung:
  `Zu viele Einlöseversuche. Bitte warte kurz und versuche es erneut.`

Bewertung:

- Rate-Limit funktioniert live.
- Attempt Logging funktioniert indirekt live, weil der 6. Versuch nur durch gespeicherte Attempt-Zählung blockiert werden kann.

## Customer Portal ohne Login Test

Live über Staging-API geprüft.

Test:

- `get_public_customer_portal` mit `akakiko-hietzing` ohne Customer Token.
- `register_restaurant_customer` mit neuem Testgast.
- `get_public_customer_portal` erneut mit zurückgegebenem Customer Token.

Ergebnis:

- Restaurant wurde erkannt: `Akakiko Hietzing`
- Registrierung erfolgreich.
- Customer Token wurde erzeugt.
- Portal mit Customer Token geladen.
- Angebote wurden geladen.

Bewertung:

- Normaler Customer Flow funktioniert weiterhin ohne Supabase Auth Login.
- Customer Token reicht weiterhin als Besitznachweis.

## Fremder Reward / Ownership Test

Live über Staging-API geprüft.

Test:

- Echten neuen Customer Token erzeugt.
- `redeem_customer_reward` mit falscher/fremder Reward-ID aufgerufen.

Ergebnis:

- `success=false`
- `reason=foreign_reward`
- Deutsche Fehlermeldung:
  `Diese Punkteeinlösung ist nicht mehr verfügbar.`

Bewertung:

- Fremde oder nicht passende Rewards werden live blockiert.

## Normale Fehlertexte / Punktestand Test

Live über Staging-API geprüft.

Test:

- Sichtbare Punkteeinlösung aus dem Portal mit neuem Gast ohne ausreichende Punkte aufgerufen.

Ergebnis:

- `success=false`
- `reason=locked`
- Deutsche Fehlermeldung:
  `Du hast noch nicht genug Punkte.`

Bewertung:

- Normale Customer-Portal-Fehler bleiben deutsch und kontrolliert.

## Alte Code+PIN Legacy RPC

Live über Staging-API geprüft.

Test:

- `create_redemption_code` mit anon aufgerufen.

Ergebnis:

- HTTP 401
- `permission denied for function create_redemption_code`

Bewertung:

- Alte Code+PIN-Einlösung ist für anon nicht aktiv.

## RLS/RPC Live-Test

Live über Staging-API geprüft.

Tests:

- Direkter anon-Read auf `customer_reward_redemption_attempts`.
- Public RPC `redeem_customer_reward`.
- Fremder/falscher Reward.
- Alte Code+PIN-RPC.

Ergebnis:

- Direkter anon-Read auf Attempts lieferte keine lesbaren Rows.
- `redeem_customer_reward` ist public nutzbar, aber über Token, Ownership und Rate-Limit geschützt.
- Falscher/fremder Reward wurde blockiert.
- Legacy Code+PIN-RPC ist für anon gesperrt.

Bewertung:

- RLS/RPC live geprüft.

## Owner Registration Live-/Retry-Test

Live über Staging-API geprüft.

Test:

- Neuer Owner-Testaccount über Supabase Auth Signup.
- `start_restaurant_owner_trial` mit der zurückgegebenen Auth-Session.
- Danach derselbe RPC-Aufruf erneut mit denselben Daten.

Ergebnis:

- Signup erfolgreich.
- Session wurde zurückgegeben.
- Erster Trial-Aufruf erfolgreich.
- Restaurant vorhanden.
- Branch vorhanden.
- Zweiter Trial-Aufruf erfolgreich.
- Zweiter Aufruf verwendete dasselbe Restaurant.

Bewertung:

- Owner Registration live geprüft.
- Idempotenz live geprüft.
- Duplikate werden verhindert.

## Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

Keine blockierenden offenen Risiken für diesen Hardening-Block.

Hinweis:

- Die Codex-Management-CLI hat weiterhin keinen eigenen Supabase-Adminzugriff. Das ist kein Produktblocker für diesen Abschluss, weil Migration und Migration List lokal im Terminal des Founders erfolgreich gegen Staging ausgeführt wurden und die Live-RPC-/Customer-/Owner-Tests über die öffentliche Staging-API bestätigt wurden.

## Status

FINAL LOCK
