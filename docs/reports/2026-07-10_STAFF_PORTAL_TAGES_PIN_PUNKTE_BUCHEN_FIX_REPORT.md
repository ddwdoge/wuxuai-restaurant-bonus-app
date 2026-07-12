# WUXUAI Bonus V1 – Staff Portal Tages-PIN Punkte buchen Fix

Status: **NOT READY**

## Gelesene Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Workspace nicht.

## Ursache

Der Dialog im Mitarbeiterbereich für „Punkte/Stempel geben“ nutzte weiterhin den alten Staff-Session-Weg:

- Frontend: `createStaffSession(...)`
- RPC: `apply_loyalty_staff_session_action(...)`
- sichtbarer Text: „Team PIN“

Dadurch wurde die automatisch erzeugte Tages-PIN nicht akzeptiert. Fehler wurden zusätzlich zu allgemein als „Aktion konnte nicht gespeichert werden.“ angezeigt.

## Geänderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- `supabase/migrations/20260711001000_staff_daily_pin_loyalty_action.sql`
- `docs/reports/2026-07-10_STAFF_PORTAL_TAGES_PIN_PUNKTE_BUCHEN_FIX_REPORT.md`

## Alter Team-PIN Bezug entfernt

In `src` wurden die sichtbaren Texte entfernt:

- „Team PIN“
- „Staff PIN“
- „Mitarbeiter-PIN“
- „Kellner-PIN“
- „Aktion konnte nicht gespeichert werden.“

Der Punkte-/Stempel-Dialog zeigt jetzt „Tages-PIN“ und den Hinweis:

```text
Bitte prüfe die heutige Tages-PIN in der Mitarbeiteransicht.
```

## Verwendete RPC / Service-Funktion

Die Staff-Punktebuchung ruft jetzt auf:

```text
apply_staff_daily_pin_loyalty_action
```

Nicht mehr:

```text
apply_loyalty_staff_session_action
```

Der alte RPC wird durch die Migration serverseitig blockiert und wirft:

```text
Die Tages-PIN ist erforderlich.
```

## Tages-PIN Prüfung

Die neue RPC prüft serverseitig:

- Restaurant-Mitgliedschaft
- aktives Restaurant
- Tages-PIN vorhanden
- Tages-PIN gültig bis heute 23:59
- Tages-PIN stimmt mit `restaurant_daily_pins` überein
- Kunde gehört zum Restaurant
- Bonusmodus passt
- keine doppelte identische Buchung innerhalb von 30 Sekunden

## Fehlermeldungen

Neu gemappt:

- fehlende PIN: „Bitte gib die Tages-PIN ein.“
- falsche PIN: „Die Tages-PIN ist nicht korrekt. Bitte prüfe die heutige Tages-PIN in der Mitarbeiteransicht.“
- abgelaufene PIN: „Die Tages-PIN ist nicht mehr gültig. Bitte prüfe die heutige Tages-PIN in der Mitarbeiteransicht.“
- Server/RPC-Fehler: „Punkte konnten gerade nicht gebucht werden. Bitte versuche es erneut.“

## Audit

Die neue RPC schreibt `audit_log` mit:

- `restaurant_id`
- `target_id = customer_id`
- `action = staff_loyalty_credit`
- `source = staff_portal`
- `confirmed_by_daily_pin = true`
- Punkte/Stempel/Betrag/Regel/Transaktions-ID
- `created_at` über Tabellenstandard

## Getestete Fälle

- Codeprüfung: Staff-Punktebuchung nutzt Tages-PIN-RPC.
- Codeprüfung: alter sichtbarer Team-PIN-Text in `src` entfernt.
- Codeprüfung: falsche/fehlende Tages-PIN bekommt spezifische deutsche Fehlermeldung.
- Codeprüfung: alter Staff-Session-Punkte-RPC wird durch Migration blockiert.
- Build: erfolgreich.

Nicht live geprüft:

- Staging-Migration wurde in diesem Lauf nicht angewendet.
- Richtige Tages-PIN wurde nicht gegen eine echte Staging-Datenbank gebucht.
- Audit-Eintrag wurde nicht live in Staging verifiziert.

## Build Ergebnis

```text
npm run build
erfolgreich
```

## Offene Risiken

- Die Migration `20260711001000_staff_daily_pin_loyalty_action.sql` muss noch auf Staging angewendet werden.
- Der Live-Test mit echter Tages-PIN und echter Staff-Buchung steht noch aus.
- Wenn ein Restaurant im Staff-Portal nicht als authentifizierter Restaurant-Member geöffnet wird, blockiert `is_restaurant_member` die Buchung korrekt.

## Status

**NOT READY**

Grund: Code und Build sind vorbereitet, aber Staging-Migration und echter Live-Test wurden in diesem Lauf nicht durchgeführt.
