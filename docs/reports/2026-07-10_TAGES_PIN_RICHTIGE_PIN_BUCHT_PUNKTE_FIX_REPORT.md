# WUXUAI Bonus V1 – Tages-PIN richtige PIN bucht Punkte Fix

Status: **FINAL LOCK**

## Gelesene Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/reports/2026-07-10_STAFF_PORTAL_TAGES_PIN_PUNKTE_BUCHEN_FIX_REPORT.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Workspace nicht.

## Ursache des Fehlers

Der NOT-READY-Status hatte drei Ursachen:

1. Die Migration `20260711001000_staff_daily_pin_loyalty_action.sql` war noch nicht auf Staging angewendet.
2. Die neue Staff-Tages-PIN-RPC buchte zwar Punkte, löste aber noch nicht die bestehenden First-Collection-Effekte aus. Ein gesperrtes Willkommensgeschenk wurde über Staff-Punktebuchung nicht freigeschaltet.
3. Die alte `collect_bonus_points(text,text,text,text)` Signatur blieb parallel zur neuen 5-Parameter-Signatur mit Default bestehen. Dadurch war ein alter 4-Parameter-Aufruf mehrdeutig statt sauber über Tages-PIN blockiert.

## Betroffene Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- `supabase/migrations/20260711001000_staff_daily_pin_loyalty_action.sql`
- `supabase/migrations/20260711002000_staff_daily_pin_loyalty_first_collection_effects.sql`
- `supabase/migrations/20260711003000_drop_ambiguous_collect_bonus_points_legacy_signature.sql`
- `docs/reports/2026-07-10_TAGES_PIN_RICHTIGE_PIN_BUCHT_PUNKTE_FIX_REPORT.md`

## Betroffene RPCs

- `apply_staff_daily_pin_loyalty_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric)`
- `apply_loyalty_staff_session_action(uuid, uuid, text, text, integer, integer, text, uuid, numeric)`
- `collect_bonus_points(text, text, text)`
- `collect_bonus_points(text, text, text, text, text)`

## Betroffene Migrationen

Auf Staging angewendet:

- `20260711001000_staff_daily_pin_loyalty_action.sql`
- `20260711002000_staff_daily_pin_loyalty_first_collection_effects.sql`
- `20260711003000_drop_ambiguous_collect_bonus_points_legacy_signature.sql`

## Was genau gefixt wurde

- Staff Portal Punkte/Stempel buchen nutzt die Tages-PIN-RPC.
- Richtige Tages-PIN bucht Punkte serverseitig.
- Falsche Tages-PIN blockiert ohne Transaktion.
- Fehlende Tages-PIN blockiert ohne Transaktion.
- Staff-Punktebuchung schreibt `points_transactions`.
- Staff-Punktebuchung schreibt `audit_log` mit `source = staff_portal` und `confirmed_by_daily_pin = true`.
- Bei erster Punktebuchung über Staff Portal wird ein gesperrtes Willkommensgeschenk freigeschaltet.
- Die alte Staff-Session-Punkte-RPC ist blockiert.
- Die mehrdeutige alte 4-Parameter-`collect_bonus_points` Signatur wurde entfernt.

## Live-Test Staging

Testrestaurant:

```text
akakiko-hietzing
```

Testmethode:

- temporärer Testgast
- vorhandenes aktives Willkommensgeschenk referenziert
- Tages-PIN über `get_today_restaurant_pin` geladen
- falsche PIN getestet
- fehlende PIN getestet
- richtige PIN getestet
- Transaktion/Audit/Unlock geprüft
- Testdaten danach wieder entfernt

## Falsche PIN Test

Ergebnis:

```text
wrong_pin_blocked = true
wrong_pin_error = Die Tages-PIN ist nicht korrekt.
```

## Richtige PIN Test

Ergebnis:

```text
correct_pin_points_added = 20
correct_pin_balance = 20
```

## Ohne PIN Test

Ergebnis:

```text
without_pin_blocked = true
without_pin_error = Bitte gib die Tages-PIN ein.
```

## Punkte / Transaction Ergebnis

Ergebnis:

```text
points_transaction_written = true
```

## Audit Ergebnis

Ergebnis:

```text
staff_audit_written = true
```

Audit-Metadaten enthalten:

- `source = staff_portal`
- `confirmed_by_daily_pin = true`
- `daily_pin_id`
- `transaction_id`
- `welcome_gift_unlocked`

## Willkommensgeschenk Unlock Ergebnis

Ergebnis:

```text
welcome_gift_status = active
welcome_gift_unlocked = true
welcome_unlock_audit_written = true
```

## Alte Wege Prüfung

Alter Staff-Session-Punkteweg:

```text
old_path_blocked = true
old_path_error = Die Tages-PIN ist erforderlich.
```

Alte `collect_bonus_points` Wege:

```text
collect_bonus_points_3_arg_blocked = true
collect_bonus_points_3_arg_error = Die Tages-PIN ist nicht korrekt.
collect_bonus_points_4_arg_blocked = true
collect_bonus_points_4_arg_error = Die Tages-PIN ist nicht korrekt.
```

## RLS / Security Prüfung

Ergebnis:

```text
member_context = true
pin_format_ok = true
anon_get_pin_execute_grant = false
anon_staff_action_execute_grant = false
authenticated_staff_action_execute_grant = true
```

Bewertung:

- Staff/Owner-Kontext darf Tages-PIN nutzen.
- Anon darf Tages-PIN nicht auslesen.
- Anon darf Staff-Tages-PIN-Buchung nicht ausführen.
- Authenticated darf RPC ausführen, aber die RPC prüft `is_restaurant_member`.
- Alter Punkteweg ohne Tages-PIN bucht nicht.

## Build Ergebnis

```text
npm run build
erfolgreich
```

## Offene Risiken

- Der Live-Test wurde serverseitig über Staging-SQL ausgeführt, nicht per Browser-Klick im Staff-Portal.
- `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` fehlt weiterhin im Workspace.

## Status

**FINAL LOCK**
