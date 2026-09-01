# WUXUAI Bonus V1

## Punkte sammeln Button / RPC 400 Fix

Datum: 2026-07-10

Status: CODE LOCK

## Aufgabe

Der Button `Punkte sammeln` im Customer Portal wirkte nach Eingabe von Rechnungsbetrag und Tages-PIN ohne Reaktion. In der Browser-Konsole erschien ein 400-Fehler bei `collect_bonus_points`.

## Ursache des 400 Fehlers

Die aktive RPC-Signatur wurde gegen die Migration geprueft:

```sql
collect_bonus_points(
  input_restaurant_slug text,
  input_customer_token text,
  input_amount_tier_key text,
  input_daily_pin text,
  input_device_id text default null
)
```

Der Frontend-Aufruf nutzt bereits diese benannten Parameter:

- `input_restaurant_slug`
- `input_customer_token`
- `input_amount_tier_key`
- `input_daily_pin`
- `input_device_id`

Der unmittelbare Codefehler lag daher nicht in einem falschen Parameternamen. Der Fehlerpfad war aber fuer Gaeste unklar:

- Supabase/RPC-Fehler wurden roh durchgereicht.
- Die Meldung erschien nur unten im Customer Portal.
- Beim Klick wirkte der Button dadurch wie ohne sichtbare Reaktion.
- Servermeldungen wie falsche Tages-PIN, abgelaufene Tages-PIN, Repeat-Limit oder generische RPC-Fehler wurden nicht sauber in deutsche UI-Meldungen uebersetzt.

## Geaenderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/loyalty/loyaltyService.ts`

## RPC-Signatur

Frontend bleibt auf der aktiven Tages-PIN-Signatur:

```ts
supabase.rpc("collect_bonus_points", {
  input_restaurant_slug,
  input_customer_token,
  input_amount_tier_key,
  input_daily_pin,
  input_device_id,
});
```

Keine Migration wurde erstellt.
Keine RPC wurde geaendert.

## Fehlerbehandlung im Customer Portal

Neue deutsche UI-Meldungen:

- fehlender Betrag: `Bitte gib deinen Rechnungsbetrag ein.`
- fehlende Tages-PIN: `Bitte gib die Tages-PIN ein.`
- falsche Tages-PIN: `Die Tages-PIN ist nicht korrekt.`
- abgelaufene Tages-PIN: `Die Tages-PIN ist nicht mehr gültig. Bitte gib die heutige Tages-PIN ein.`
- erneute Punktebuchung kurz danach: `Für diese Rechnung wurden gerade schon Punkte gesammelt. Bitte warte kurz.`
- generischer RPC-Fehler: `Punkte konnten gerade nicht gutgeschrieben werden. Bitte versuche es erneut.`

Technische Details werden intern per `console.warn` geloggt:

- `error.message`
- `error.details`
- `error.hint`
- `error.code`

Im UI werden keine technischen RPC-Details angezeigt.

## Button-Verhalten

Der Button:

- setzt Loading-State
- zeigt waehrend der Buchung `Punkte werden gutgeschrieben...`
- bleibt nach Fehler erneut klickbar
- zeigt Fehler direkt im Punkte-sammeln-Bereich
- leert nach Erfolg das Tages-PIN-Feld
- zeigt nach Erfolg `Punkte wurden gutgeschrieben.`

## Testfaelle A-D

### Fall A: Betrag 89, falsche Tages-PIN

Codepfad geprueft:

- RPC wird mit `input_daily_pin` aufgerufen.
- RPC-Fehler wird technisch geloggt.
- UI-Meldung: `Die Tages-PIN ist nicht korrekt.`
- Button bleibt klickbar.

### Fall B: Betrag 89, richtige Tages-PIN

Codepfad geprueft:

- RPC wird mit Tages-PIN und Rechnungsstufe aufgerufen.
- Erfolg setzt `collectionResult`.
- Punkteanzeige wird aktualisiert.
- Tages-PIN wird geleert.
- Erfolgsmeldung wird angezeigt.

Echter Staging-Flow wurde in diesem Durchlauf nicht mit einem frischen Testkunden und echter Tages-PIN ausgefuehrt.

### Fall C: Betrag eingegeben, PIN leer

Codepfad geprueft:

- keine RPC-Anfrage
- UI-Meldung: `Bitte gib die Tages-PIN ein.`

### Fall D: PIN eingegeben, Betrag leer

Codepfad geprueft:

- keine RPC-Anfrage
- UI-Meldung: `Bitte gib deinen Rechnungsbetrag ein.`

## Build Ergebnis

`npm run build` wurde erfolgreich ausgefuehrt.

## Selbstpruefung

- Keine Aktionen eingebaut.
- Keine Kampagnen eingebaut.
- Keine KI eingebaut.
- Kein POS eingebaut.
- Kein SMS/WhatsApp eingebaut.
- Keine neue Produktlogik eingebaut.
- Keine Tages-PIN-Validierung im Frontend hinzugefuegt.
- Keine Punkteberechnung geaendert.
- Keine Datenbank geaendert.
- Sichtbare neue UI-Texte sind Deutsch.

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Projekt nicht. Die vorhandenen Regeln aus `AGENTS.md`, `docs/00_START_HIER.md`, `docs/05_CUSTOMER_PORTAL.md`, `docs/11_FLOW_04_PUNKTE_SAMMELN.md` und `docs/18_CODEX_REGELN.md` wurden angewendet.

## Offene Risiken

- Kein echter Browser-/Staging-Test mit frischem Kunden, korrekter Tages-PIN und realer Punktebuchung wurde in diesem Durchlauf ausgefuehrt.
- Wenn Staging wieder eine alte RPC-Signatur oder einen nicht aktualisierten PostgREST-Schema-Cache hat, muss die Staging-Migration/Cache-Situation separat validiert werden.

## Ergebnis

Status: CODE LOCK
