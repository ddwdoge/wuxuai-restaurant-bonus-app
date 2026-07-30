# WUXUAI Bonus V1 – Punkteeinlösung Punkteabzug und Mehrfach-Einlösung Report

Status: **FINAL LOCK**
Datum: 2026-07-11

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Repository nicht. Die Selbstprüfung wurde nach `AGENTS.md` und `docs/18_CODEX_REGELN.md` durchgeführt.

## Ursache

Normale Punkteeinlösungen wurden bisher wie einmalige Kunden-Geschenke behandelt:

- `redeem_customer_reward` schrieb normale Punkteeinlösungen in `customer_rewards` als `redeemed`.
- `get_public_customer_portal` blendete normale Rewards aus, wenn ein passender `customer_rewards.status = redeemed` existierte.
- `CustomerPortal.tsx` entfernte nach jeder Einlösung die Karte lokal aus der Liste.
- Flow-03-Dokumentation beschrieb normale Punkteeinlösungen noch als verbraucht und nicht erneut einlösbar.

Das war fachlich falsch, weil normale Punkteeinlösungen dauerhafte Produktangebote des Restaurants sind.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/rewards/rewardService.ts`
- `src/styles.css`
- `supabase/migrations/20260711005000_point_redemption_catalog_repeatable.sql`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## DB/RPC Änderungen

Neue additive Migration:

`supabase/migrations/20260711005000_point_redemption_catalog_repeatable.sql`

Änderungen:

- Neue Tabelle `reward_redemption_events` für normale Punkteeinlösungs-Historie.
- Branch-/Organization-Scope über vorhandene `add_branch_scope_to_table`.
- RLS aktiviert.
- Admin-Select-Policy für Restaurantmitglieder.
- `get_public_customer_portal` zeigt normale aktive Punkteeinlösungen wieder als Katalogprodukte, auch wenn frühere Einlösehistorie existiert.
- `redeem_customer_reward` trennt:
  - normale Punkteeinlösung: Punkte/Stempel abziehen, `reward_redemption_events`, `points_transactions`, `audit_log`
  - Willkommensgeschenk: `customer_rewards` einmalig auf `redeemed` setzen

## Punkteabzug

Normale Punkteeinlösung:

- Server prüft Kundentoken, Restaurant, aktiven Reward und Punktestand.
- `required_points` wird vom Kundensaldo abgezogen.
- Bei zu wenig Punkten bricht die RPC ab.
- Neuer Punktestand wird zurückgegeben.

## Mehrfache Einlösung

Normale Punkteeinlösungen werden nicht mehr über `customer_rewards` dauerhaft gesperrt.

Wenn nach einer Einlösung noch genügend Punkte vorhanden sind, bleibt das Produkt einlösbar.

Wenn Punkte fehlen, bleibt das Produkt sichtbar und wird gesperrt.

## Kartenstatus nach Einlösung

Customer Portal:

- Normale Punkteeinlösung bleibt nach Erfolg sichtbar.
- Lokaler Status wird mit dem neuen Punktestand neu berechnet.
- Bei fehlenden Punkten erscheint `Noch gesperrt`.
- Schloss-Badge wird auf gesperrten Karten angezeigt.
- Erfolgsmeldung zeigt: `Punkteeinlösung erfolgreich. XX Punkte wurden eingelöst.`

## Willkommensgeschenk-Abgrenzung

Willkommensgeschenke bleiben unverändert:

- einmalig
- kosten keine Punkte
- werden in `customer_rewards` als `redeemed` markiert
- verschwinden nach Einlösung aus der sichtbaren Kundenansicht
- werden nicht mehrfach einlösbar

## RLS/Security

Geprüft:

- Kunden können nur über `customer_token` und RPC einlösen.
- RPC prüft Restaurant-Zugehörigkeit des Tokens.
- RPC prüft Reward-Zugehörigkeit zum Restaurant.
- Frontend sendet keinen Punktestand als Wahrheit.
- Punkteabzug erfolgt serverseitig atomar über `customers` Update mit Mindestpunktestand.
- `reward_redemption_events` hat RLS aktiv.
- Anon liest keine Tabellen direkt.
- Audit wird serverseitig geschrieben.

## Mobile Prüfung

Mobile-first geprüft:

- Produktkarten bleiben kompakt.
- Schloss-Badge sitzt innerhalb des Bildbereichs.
- Keine neue Mehrspaltenpflicht auf Mobile.
- Keine horizontale Layoutstruktur eingeführt.

Ein automatischer Browser-Screenshot wurde nicht erstellt. Der Build validiert TypeScript und Bundle-Erzeugung.

## Build-Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Migration wurde lokal erstellt, aber in dieser Aufgabe nicht gegen Staging gepusht.
- Kein Live-Datenbanktest mit echtem Kunden und echtem Reward wurde in dieser Aufgabe ausgeführt.
- Staff-Portal-Einlösung per `redeem_reward_with_staff_session` wurde nicht umgebaut, weil der Auftrag Customer Portal / normale Punkteeinlösung betrifft und V1 aktuell kundenbestätigte Einlösung ohne PIN nutzt.

## Status

**FINAL LOCK**
