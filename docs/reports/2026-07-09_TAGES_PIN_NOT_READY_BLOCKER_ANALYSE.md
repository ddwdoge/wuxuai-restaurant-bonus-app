# WUXUAI Bonus V1 – Tages-PIN NOT READY Blocker Analyse

Datum: 2026-07-09  
Status: **ANALYSE FERTIG**

---

## NOT-READY Ursache

Der Status **NOT READY** kommt nicht aus einem Build-Fehler.

Der Hauptgrund ist:

> Die neue Tages-PIN-Migration und die neuen RPCs wurden noch nicht gegen eine echte Supabase-Staging-Datenbank angewendet und validiert.

Damit fehlen die echten Nachweise für:

- Migration läuft sauber durch.
- RLS schützt `restaurant_daily_pins`.
- `get_today_restaurant_pin` ist nur für Restaurantmitglieder nutzbar.
- `collect_bonus_points` blockiert live alle Wege ohne Tages-PIN.
- `redeem_customer_reward` löst live ohne PIN korrekt und atomar ein.
- alte Code/PIN-RPCs sind live nicht mehr als V1-Standard nutzbar.

Build laut Report:

```text
npm run build
```

Ergebnis:

```text
Erfolgreich.
```

---

## Blocker-Liste

### Blocker 1 – Staging-Migration nicht angewendet

Schweregrad: **KRITISCH**

Betroffen:

- `supabase/migrations/20260709004000_tages_pin_reward_redemption_lock.sql`

Warum kritisch:

Ohne angewendete Migration existieren in Staging die neuen Tabellen/RPCs nicht sicher.
V1 darf nicht live gehen, wenn die Produktregel nur im Code/Repo steht, aber nicht in der echten Datenbank.

Erforderlicher Nachweis:

- `npx supabase db push --include-all`
- Migration erfolgreich angewendet
- keine SQL-Fehler

---

### Blocker 2 – RLS/Security nicht live geprüft

Schweregrad: **KRITISCH**

Betroffen:

- Tabelle `restaurant_daily_pins`
- Policy `restaurant daily pins member select`
- RPC `get_today_restaurant_pin(input_restaurant_id uuid)`
- Funktion `is_restaurant_member(input_restaurant_id uuid)`

Warum kritisch:

Die Tages-PIN darf niemals öffentlich oder für Kunden lesbar sein.
Der Report bestätigt die geplante RLS-Logik, aber nicht den echten Staging-Test.

Erforderlicher Nachweis:

- anon kann Tages-PIN nicht lesen
- Kunde kann Tages-PIN nicht lesen
- fremder authenticated User kann fremdes Restaurant nicht lesen
- Restaurantmitglied kann eigene Tages-PIN lesen

---

### Blocker 3 – RPCs nicht live mit echten Tokens getestet

Schweregrad: **KRITISCH**

Betroffen:

- `collect_bonus_points(...)`
- `redeem_customer_reward(input_customer_token, input_reward_id)`
- `get_today_restaurant_pin(input_restaurant_id uuid)`

Warum kritisch:

Der Build beweist nur TypeScript/Vite.
Er beweist nicht, dass Supabase-RPCs mit echten Daten, echten Tokens und RLS korrekt laufen.

Erforderlicher Nachweis:

- Punkte sammeln ohne Tages-PIN schlägt fehl
- Punkte sammeln mit falscher Tages-PIN schlägt fehl
- Punkte sammeln mit richtiger Tages-PIN bucht Punkte
- Reward-Einlösung ohne PIN funktioniert
- erneute Einlösung wird blockiert
- Audit Logs werden geschrieben

---

### Blocker 4 – Alte Funktionen existieren weiter als Datenbankobjekte

Schweregrad: **MITTEL**

Betroffen:

- `create_redemption_code(text, uuid)`
- `redeem_reward_with_pin(text, uuid, text, text)`
- alte `collect_bonus_points`-Signaturen ohne Tages-PIN

Analyse:

Der Report sagt:

- alte `collect_bonus_points`-Signaturen buchen keine Punkte mehr
- alte Code/PIN-RPCs werden aus anon/authenticated entzogen

Das ist als Abwärtskompatibilitäts-/Sicherheitsmaßnahme plausibel.
Aber es wurde noch nicht live geprüft.

Warum mittel:

Wenn Grants/Revoke in Staging korrekt greifen, ist es kein Blocker.
Wenn sie nicht greifen, wird es kritisch.

Erforderlicher Nachweis:

- alte Punkte-RPCs ohne Tages-PIN buchen live keine Punkte
- `create_redemption_code` ist für anon/authenticated nicht ausführbar
- `redeem_reward_with_pin` ist für anon/authenticated nicht ausführbar

---

### Blocker 5 – Lokale Supabase-CLI-Prüfung nicht abgeschlossen

Schweregrad: **MITTEL**

Betroffen:

- lokale Validierung
- Migrationstest
- RLS-Test

Analyse:

Im Report steht:

```text
Lokale Supabase-CLI-Prüfung konnte in dieser Umgebung nicht abgeschlossen werden.
```

Warum mittel:

Das ist kein Produktfehler, aber es erklärt, warum kein Datenbankbeweis vorliegt.
Die fehlende echte Staging-Validierung bleibt dadurch offen.

Erforderlicher Nachweis:

- Supabase CLI verfügbar machen oder direkt gegen Staging validieren
- SQL/RPC/RLS-Ergebnis dokumentieren

---

## Fragen aus dem Auftrag

### Ist es ein Build-Problem?

Nein.

Build laut Report:

```text
Erfolgreich.
```

### Ist es ein Staging-/Migration-Problem?

Ja.

Hauptproblem:

```text
Staging-Migration wurde nicht angewendet.
```

### Ist es ein RLS-/Security-Problem?

Es ist ein ungeprüftes RLS-/Security-Risiko.

Die geplante RLS-Regel ist dokumentiert und in der Migration vorgesehen.
Der echte Staging-Beweis fehlt.

### Gibt es noch einen Punktebuchungsweg ohne Tages-PIN?

Laut Report und Code-Scan:

Nein im neuen Standardpfad.

Aber:

Die alten RPC-Signaturen existieren als Datenbankobjekte weiter und sollen blockieren.
Das muss live geprüft werden.

### Ist Reward-Einlösung ohne PIN wirklich aktiv?

Im Frontend-Code ja.

Betroffen:

- `src/modules/rewards/rewardService.ts`
- `src/modules/customer/CustomerPortal.tsx`
- RPC `redeem_customer_reward`

Aber:

Live auf Staging noch nicht bewiesen.

### Wird die Tages-PIN in der Mitarbeiteransicht korrekt angezeigt?

Im Frontend-Code ja.

Betroffen:

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- RPC `get_today_restaurant_pin`

Aber:

Live nur korrekt, wenn der angemeldete User Restaurantmitglied ist und die RPC in Staging funktioniert.

### Fehlt ein echter Staging-Test?

Ja.

Das ist der Hauptgrund für **NOT READY**.

---

## Betroffene Dateien

Migration:

- `supabase/migrations/20260709004000_tages_pin_reward_redemption_lock.sql`

Frontend:

- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/rewards/rewardService.ts`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/staff/StaffTablet.tsx`
- `src/modules/admin/pages/StaffPage.tsx`
- `src/styles.css`

Report:

- `docs/reports/2026-07-09_TAGES_PIN_TECHNISCHE_UMSETZUNG_REPORT.md`

---

## Betroffene RPCs

Neu / geändert:

- `get_today_restaurant_pin(input_restaurant_id uuid)`
- `ensure_today_restaurant_pin(input_restaurant_id uuid, input_branch_id uuid)`
- `collect_bonus_points(input_restaurant_slug text, input_customer_token text, input_amount_tier_key text, input_daily_pin text, input_device_id text)`
- `redeem_customer_reward(input_customer_token text, input_reward_id uuid)`

Alte Pfade, die live geprüft werden müssen:

- `collect_bonus_points(text, text, text)`
- `collect_bonus_points(text, text, text, text)`
- `create_redemption_code(text, uuid)`
- `redeem_reward_with_pin(text, uuid, text, text)`

---

## Empfohlene Fix-Reihenfolge

1. Supabase Staging-Link prüfen.
2. Migration anwenden:

```text
npx supabase db push --include-all
```

3. Prüfen, ob `restaurant_daily_pins` existiert.
4. Prüfen, ob `get_today_restaurant_pin` existiert und nur für Restaurantmitglieder funktioniert.
5. Prüfen, ob alte Punkte-RPCs ohne Tages-PIN keine Punkte buchen.
6. Punkte sammeln live testen:
   - ohne PIN
   - falsche PIN
   - richtige PIN
7. Reward-Einlösung live testen:
   - ohne PIN
   - erneute Einlösung
   - Audit Log
8. RLS mit anon, Kunde, fremdem User und Restaurantmitglied testen.
9. Report aktualisieren und Status erst danach auf LOCK setzen.

---

## Zusammenfassung

Technische Implementierung im Repository:

```text
vorhanden
```

Build:

```text
grün
```

Produktionsfreigabe:

```text
noch nicht möglich
```

Grund:

```text
Staging-Migration, RLS und RPC-Live-Tests fehlen.
```

Status: **ANALYSE FERTIG**
