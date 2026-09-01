# WUXUAI Bonus V1 – Staff Portal Belohnung einlösen Datenbank-Verbindung

Status: **FINAL LOCK**

## Gelesene Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Workspace nicht.

## Datenquelle Staff Portal Rewards

Vorher:

- Staff Portal lud allgemeine `rewards` und `coupons`.
- Verfügbarkeit wurde aus Kundenpunkten und eingelösten IDs abgeleitet.
- Staff Portal enthielt noch einen alten Einlösepfad über Staff-Session/Freigabe.

Nachher:

- Staff Portal lädt pro Kunde ausschließlich `customer_rewards` mit zugehörigem `rewards`-Datensatz.
- Es werden keine Coupons geladen.
- Es werden keine allgemeinen, nicht zugeteilten Rewards geladen.
- Es werden keine redeemed oder expired Rewards angezeigt.
- Locked Willkommensgeschenke werden nur als gesperrter Hinweis angezeigt, nicht als einlösbar.

Neue Staff-Datenfunktion:

```text
loadStaffCustomerRewards(restaurantId, customerId)
```

Quelle:

```text
customer_rewards
→ rewards
```

Filter:

- `restaurant_id`
- `customer_id`
- `status in ('active', 'locked')`
- Reward aktiv
- Reward nicht abgelaufen
- Reward gehört zum gleichen Restaurant

## Geprüfte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/rewards/rewardService.ts`
- `supabase/migrations/20260709004000_tages_pin_reward_redemption_lock.sql`

## Geprüfte RPCs / Queries

- `redeem_customer_reward(input_customer_token text, input_reward_id uuid)`
- direkte Staff-Query über `customer_rewards` + `rewards`
- Grants für alte Funktionen:
  - `create_redemption_code(text, uuid)`
  - `redeem_reward_with_pin(text, uuid, text, text)`

## Kundenportal → Redeemed Status

Staging-Live-Test mit temporärem Testgast:

Vor Einlösung:

```text
staff_available_before = 1
```

Kundenportal-RPC:

```text
redeem_customer_reward(...)
```

Nach Einlösung:

```text
redeemed_status = redeemed
redeemed_at_set = true
customer_redeem_audit_written = true
```

## Staff Portal Anzeige nach Redeemed

Nach Einlösung:

```text
staff_available_after = 0
redeemed_hidden_after = true
```

Bewertung:

- Eingelöste Belohnung ist nicht mehr verfügbar.
- Staff Portal würde danach „Keine verfügbare Belohnung.“ anzeigen.

## Locked Rewards

Test:

```text
locked_as_available_before = 0
```

Bewertung:

- Gesperrtes Willkommensgeschenk wird nicht als verfügbare Belohnung angezeigt.
- Staff Portal zeigt stattdessen den Hinweis „Willkommensgeschenk noch gesperrt.“

## RLS / Security Prüfung

Test:

```text
foreign_rewards_visible = 0
```

Bewertung:

- Fremde Rewards werden nicht sichtbar.
- Staff-Query filtert über `restaurant_id` und `customer_id`.
- RLS bleibt primäre Schutzschicht.

## Alte Logik Prüfung

In Staff/Customer/Reward-Modulen wurden keine aktiven sichtbaren V1-Wege gefunden für:

- `redeem_reward_with_pin`
- `create_redemption_code`
- `customer_pin_redemption_codes`
- Kellner-PIN
- Mitarbeiter-PIN
- Einlöse-PIN
- 6-stelliger Code
- Freigabe im Reward-Flow

Staging-Grants:

```text
create_redemption_code_anon_execute = false
redeem_reward_with_pin_anon_execute = false
redeem_customer_reward_anon_execute = true
```

Bewertung:

- Alte Code+PIN-Logik ist für anon nicht ausführbar.
- V1-konformer Kundenportal-RPC bleibt öffentlich erreichbar, aber tokengebunden.

## Build Ergebnis

```text
npm run build
erfolgreich
```

## Offene Risiken

- Der Live-Test wurde serverseitig über temporäre Staging-Daten ausgeführt, nicht per Browser-Klick.
- `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` fehlt weiterhin im Workspace.
- Demo-Fallbacks existieren in Service-Modulen weiterhin nur für nicht konfigurierte Supabase-Umgebungen. Im Supabase-Betrieb nutzt Staff Portal echte DB-Daten.

## Status

**FINAL LOCK**
