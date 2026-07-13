# WUXUAI Bonus V1 – redeem_customer_reward anon Security Decision

Datum: 2026-07-13  
Status: **NOT READY**

## Ursache

Der v9-Audit-Befund bewertete `redeem_customer_reward(text, uuid)` pauschal als
kritisch, weil `anon` Execute gesetzt ist.

Die CTO-Entscheidung für V1 lautet jedoch:

`anon` Execute ist für diese RPC bewusst erlaubt, weil das Customer Portal
öffentlich ist und Gäste über `customer_token` identifiziert werden.

Der Zugriff ist nur sicher, wenn die RPC alle Ownership-, Status- und
Audit-Prüfungen serverseitig erzwingt.

## CTO-Entscheidung zu anon

`anon` bleibt bewusst erlaubt.

Grund:

- Kunden nutzen das Customer Portal ohne Login.
- Die finale Einlösung läuft ohne PIN.
- Der Kundentoken ist der öffentliche Kontextanker.
- Sicherheit liegt in der RPC, nicht in Frontend-Auth.

Die neue Migration dokumentiert das direkt am Grant:

```sql
-- Public Customer Portal RPC.
-- anon is intentional because customers are identified by customer_token.
-- Security is enforced inside the function via customer_token + reward ownership.
```

## Geänderte Dateien

- `src/modules/admin/AdminLayout.tsx`
- `supabase/migrations/20260713003000_redeem_customer_reward_anon_security_decision.sql`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-13_REDEEM_CUSTOMER_REWARD_ANON_SECURITY_DECISION_REPORT.md`

## Sicherheitsprüfungen in redeem_customer_reward

Die additive Migration definiert `redeem_customer_reward(text, uuid)` neu.

Geprüft wird:

- `customer_token` wird über `hash_public_token(...)` aufgelöst.
- Der Token muss aktiv und nicht abgelaufen sein.
- Es muss genau ein gültiger Token-Treffer existieren.
- Customer muss zu Token-Restaurant und Token-Branch gehören.
- Reward muss zum selben Restaurant und Branch gehören.
- Reward muss aktiv und nicht abgelaufen sein.
- Willkommensgeschenk muss als `customer_rewards`-Zeile zum selben Customer,
  Restaurant, Branch und Reward gehören.
- Willkommensgeschenk muss `active` sein.
- Willkommensgeschenk muss `unlocked_at` besitzen.
- Bereits eingelöste Willkommensgeschenke werden blockiert.
- Normale Punkteeinlösungen prüfen Punkte und Stempel serverseitig.
- Punkte-/Stempelabzug passiert atomar per `update ... where balance >= required`.
- Einlösungsereignis wird in `reward_redemption_events` geschrieben.
- Punkteabzug wird in `points_transactions` geschrieben.
- Audit wird für Willkommensgeschenk und normale Punkteeinlösung geschrieben.
- Alte aktive 6-stellige Codes für denselben Reward werden nach erfolgreicher
  Einlösung abgelaufen gesetzt.

## Grants

Bewusst gesetzt:

```sql
revoke execute on function public.redeem_customer_reward(text, uuid)
from public;

grant execute on function public.redeem_customer_reward(text, uuid)
to anon, authenticated;
```

Alte Code+PIN-Wege bleiben gesperrt:

```sql
revoke execute on function public.create_redemption_code(text, uuid)
from public, anon, authenticated;

revoke execute on function public.redeem_reward_with_pin(text, uuid, text, text)
from public, anon, authenticated;
```

## Alte Code+PIN RPCs Status

Geprüft in `src/`:

- Frontend nutzt `redeem_customer_reward`.
- Frontend nutzt `create_redemption_code` nicht.
- Frontend nutzt `redeem_reward_with_pin` nicht.

Geprüft in Migration:

- `create_redemption_code(text, uuid)` erhält keinen öffentlichen Grant.
- `redeem_reward_with_pin(text, uuid, text, text)` erhält keinen öffentlichen
  Grant.

## AdminLayout Guard-Fix

Gefixt:

- `isSetupAllowedPath(pathname)` zentralisiert die Setup-Routen.
- Erlaubt während unvollständigem Setup:
  - `/admin/onboarding`
  - `/admin/settings`
  - `/admin/settings/*`
- Navigate Guard und NavLink Lock nutzen dieselbe Funktion.
- Gesperrte Menüpunkte werden als `span role="link" aria-disabled="true"`
  gerendert.
- Gesperrte Menüpunkte besitzen keine irreführende echte `to`-Route mehr.
- Keyboard kann nicht mehr über einen locked NavLink zur falschen Route gehen.

## Tests A bis G

A. Gültiger customer_token + eigener unlocked Reward  
Status: **nicht live geprüft**

B. Gültiger customer_token + fremder Reward  
Status: **nicht live geprüft**

C. Gültiger customer_token + already redeemed Reward  
Status: **nicht live geprüft**

D. Gültiger customer_token + locked Reward  
Status: **nicht live geprüft**

E. Gültiger customer_token + expired Reward  
Status: **nicht live geprüft**

F. Ungültiger customer_token  
Status: **nicht live geprüft**

G. Customer Portal ohne Login und ohne PIN  
Status: **Codepfad geprüft, nicht live geprüft**

Grund:

- `SUPABASE_ACCESS_TOKEN` war nicht im Environment gesetzt.
- `VITE_SUPABASE_URL` war nicht im Environment gesetzt.
- `VITE_SUPABASE_ANON_KEY` war nicht im Environment gesetzt.
- Staging-Migration und echte RPC-Aufrufe konnten deshalb nicht ausgeführt
  werden.

## Build Ergebnis

Befehl:

```bash
npm run build
```

Ergebnis: erfolgreich.

## Was wurde nicht geändert

- keine Tages-PIN-Logik
- keine Punkte-Sammeln-Logik
- keine Customer-Portal-UX
- keine Restaurant-Dashboard-Logik
- keine Onboarding-Logik
- keine QR-Center-Logik
- keine Punkteeinlösungsformel
- keine Willkommensgeschenk-Zufallslogik
- keine Tenant-Isolation außerhalb der Einlöse-RPC

## Offene Risiken

Kritisch:

1. Migration ist noch nicht auf Supabase Staging angewendet.
2. Tests A bis G wurden nicht live gegen Staging ausgeführt.
3. RLS/Grant-Wirkung wurde nur statisch geprüft, nicht live.

Mittel:

1. `create_redemption_code` und `redeem_reward_with_pin` existieren weiterhin
   als Legacy-Funktionen, sind aber für `anon` und `authenticated` entzogen.
2. Branch-Sicherheit ist jetzt explizit in `redeem_customer_reward`, muss aber
   mit echten Multi-Branch-Daten live verifiziert werden.

## Status

**NOT READY**

Begründung:

Code, Migration, Doku und Build sind erledigt. Für **FINAL LOCK** fehlen
Staging-Migration, RPC-Live-Tests A bis G und RLS/Grant-Verifikation.
