# WUXUAI Bonus V1 – Tages-PIN technische Umsetzung Report

Datum: 2026-07-09  
Status: **NOT READY**

---

## Aufgabe

Technische Umsetzung des CTO-LOCK:

- Punkte sammeln mit automatisch erzeugter Tages-PIN
- Belohnung einlösen ohne PIN
- Mitarbeiteransicht zeigt heutige Tages-PIN

Nicht gebaut:

- keine Kampagnen
- keine Aktionen
- keine KI
- kein POS
- kein SMS/WhatsApp
- keine manuelle PIN-Verwaltung

---

## Geprüfte bestehende Struktur

Geprüft wurden:

- bestehende `collect_bonus_points` RPCs
- bestehende `redeem_reward_with_staff_session`
- bestehende `create_redemption_code`
- bestehende `redeem_reward_with_pin`
- Customer Portal Punkte sammeln
- Customer Portal Belohnung einlösen
- Staff Tablet / Mitarbeiteransicht
- Membership-Funktion `is_restaurant_member`
- Branch-Grundstruktur mit `primary_branch_id`

Ergebnis:

- Punkte sammeln hatte noch einen öffentlichen Weg ohne Tages-PIN.
- Customer Portal nutzte noch 6-stelligen Einlösecode + Kellner-PIN.
- Staff Tablet zeigte noch keine Tages-PIN.

---

## Neue Migration

Neu:

`supabase/migrations/20260709004000_tages_pin_reward_redemption_lock.sql`

Enthält:

- Tabelle `restaurant_daily_pins`
- RLS für Restaurantmitglieder
- RPC `get_today_restaurant_pin(input_restaurant_id uuid)`
- Helper `ensure_today_restaurant_pin`
- Helper `generate_daily_pin_code`
- neue `collect_bonus_points(..., input_daily_pin, input_device_id)`
- alte `collect_bonus_points`-Signaturen ohne Tages-PIN blockieren mit deutscher Fehlermeldung
- neue RPC `redeem_customer_reward(input_customer_token, input_reward_id)`
- alte öffentliche Einlösecode-RPCs werden für anon/authenticated entzogen

---

## Tages-PIN DB/RPC

Tabelle:

`restaurant_daily_pins`

Felder:

- `id`
- `restaurant_id`
- `branch_id`
- `pin_code`
- `valid_date`
- `valid_from`
- `valid_until`
- `created_at`

Regeln:

- 4-stellig
- nur Zahlen
- pro Restaurant / Branch / Tag eindeutig
- gültig bis 23:59
- serverseitig erstellt
- serverseitig geprüft
- nicht im Frontend berechnet
- nicht durch Restaurantbesitzer verwaltet

Sichtbarkeit:

- `get_today_restaurant_pin` ist nur für authentifizierte Restaurantmitglieder nutzbar.
- anon erhält keinen Zugriff.
- normale Kunden erhalten keinen direkten Zugriff.

---

## Punkte sammeln mit Tages-PIN

Frontend:

- Customer Portal zeigt beim Punkte sammeln:
  - `Bitte Mitarbeiter um die Tages-PIN.`
  - Feld `Tages-PIN`
  - Button `Punkte sammeln`

Backend:

- `collect_bonus_points` verlangt `input_daily_pin`.
- PIN wird serverseitig gegen `restaurant_daily_pins` geprüft.
- Ohne PIN oder falsche PIN werden keine Punkte gebucht.
- Alte RPC-Signaturen ohne Tages-PIN buchen keine Punkte mehr.

Fehler:

- falsche PIN: `Die Tages-PIN ist nicht korrekt.`
- abgelaufene PIN: `Die Tages-PIN ist nicht mehr gültig.`

Weiterhin erhalten:

- Punktebuchung
- Audit Log
- Willkommensgeschenk-Freischaltung nach erster Punktebuchung
- Referral / Bonus Boost Aktivierung
- Device-ID im Audit

---

## Reward-Einlösung ohne PIN

Frontend:

- Customer Portal zeigt keinen Einlösecode mehr.
- Customer Portal fragt keine Kellner-PIN mehr.
- Gast sieht:

```text
Belohnung wirklich einlösen?
Nach der Bestätigung ist diese Belohnung verbraucht und kann nicht erneut verwendet werden.
```

Buttons:

- `Abbrechen`
- `Ja, einlösen`

Nach Erfolg:

```text
Belohnung eingelöst. Zeige diese Bestätigung im Restaurant vor.
```

Backend:

- neue RPC `redeem_customer_reward`
- prüft Kundentoken
- prüft Restaurant
- prüft Belohnung
- prüft Status
- prüft Punkte/Stempel
- markiert atomar als redeemed
- schreibt Audit
- blockiert erneute Einlösung

---

## Mitarbeiteransicht Tages-PIN

Staff Tablet lädt `get_today_restaurant_pin`.

Angezeigt wird:

- `Heutige Tages-PIN`
- PIN groß
- `Diese PIN wird benötigt, wenn Gäste Punkte sammeln.`
- `Gültig bis heute 23:59.`

Die PIN wird nicht im Kundenportal, nicht im Onboarding und nicht öffentlich angezeigt.

---

## Sicherheit / RLS

Umgesetzt:

- `restaurant_daily_pins` hat RLS aktiv.
- Select nur für `is_restaurant_member(restaurant_id)`.
- `get_today_restaurant_pin` prüft Membership serverseitig.
- Tages-PIN wird nicht clientseitig erzeugt.
- Punktebuchung prüft Kundentoken und Restaurant serverseitig.
- Belohnungseinlösung prüft Kundentoken und Restaurant serverseitig.
- Alte öffentliche Code/PIN-RPCs wurden aus dem anon/authenticated Standardpfad entfernt.

Offen für Staging:

- Migration gegen Supabase Staging anwenden.
- RLS real mit anon/authenticated testen.
- RPCs live mit echten Tokens testen.
- Lokale Supabase-CLI-Prüfung konnte in dieser Umgebung nicht abgeschlossen
  werden.

---

## Build

Ausgeführt:

```text
npm run build
```

Ergebnis:

Erfolgreich.

---

## Geänderte Dateien

- `supabase/migrations/20260709004000_tages_pin_reward_redemption_lock.sql`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/rewards/rewardService.ts`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/staff/StaffTablet.tsx`
- `src/modules/admin/pages/StaffPage.tsx`
- `src/styles.css`
- `docs/reports/2026-07-09_TAGES_PIN_TECHNISCHE_UMSETZUNG_REPORT.md`

---

## Offene Risiken

- Staging-Migration wurde in dieser Aufgabe nicht gegen Supabase ausgeführt.
- Alte Funktionen bleiben als Datenbankobjekte teilweise vorhanden, buchen aber ohne Tages-PIN keine Punkte mehr bzw. sind für Code/PIN-Einlösung entzogen.
- Staff Tablet lädt die Tages-PIN nur bei angemeldetem Restaurantmitglied.
- Der Live-Test mit echtem Kundentoken und echter Tages-PIN steht noch aus.

---

## Ergebnis

- Tages-PIN DB/RPC: Ja
- Punkte sammeln mit Tages-PIN: Ja
- Reward-Einlösung ohne PIN: Ja
- Mitarbeiteransicht Tages-PIN: Ja
- Build: Ja

Status: **NOT READY**
