# WUXUAI Bonus V1 - Pilot NOT READY Blocker Analyse

Datum: 2026-07-11

Status: **ANALYSE LOCK**

## Zusammenfassung

Der Pilot End-to-End Test ist **NOT READY**, weil zentrale Live-Verbindungen nicht erneut gegen Supabase Staging bewiesen wurden.

Der Build war erfolgreich und viele UI-/Codepfade sind lokal plausibel. Das reicht laut CTO-Entscheidung 70 aber nicht für `FINAL LOCK`.

Hauptgrund:

```text
Staging-Migrationen und echte Flow-Verbindungen konnten ohne Supabase Access Token
nicht verifiziert werden.
```

Dadurch wurden die wichtigsten Pilotketten nicht vollständig live geprüft:

1. Registrierung
2. Punkte sammeln mit Tages-PIN
3. Willkommensgeschenk-Zuteilung und Freischaltung
4. Punkteeinlösung mit Punkteabzug und erneuter Einlösbarkeit
5. Bonus Boost Aktivierung
6. Dashboard-KPI-Abgleich
7. RLS/Security gegen echte Staging-Daten
8. Mobile-Flow mit echter Session

## Gelesene Dateien

- `docs/reports/2026-07-11_V1_PILOT_END_TO_END_FLOW_TEST_REPORT.md`
- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/09_FLOW_02_GAST_WERDEN.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/12_FLOW_05_BONUS_BOOST.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis:

`docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert nicht im Repository. Der Selbstkontroll-Loop ist stattdessen in `docs/17_CTO_ENTSCHEIDUNGEN.md` Abschnitt 70 und `docs/18_CODEX_REGELN.md` dokumentiert.

## Warum NOT READY

Laut `docs/17_CTO_ENTSCHEIDUNGEN.md` Abschnitt 70 gilt:

- kein theoretisches `FINAL LOCK`
- kein `FINAL LOCK` ohne Staging-Test bei Migrationen oder Flow-Verbindungen
- kein `FINAL LOCK`, wenn Verbindung, Sicherheit oder Migration nicht vollständig geprüft wurden

Der E2E-Report benennt genau diese Lücken:

- `SUPABASE_ACCESS_TOKEN` fehlte in der Shell-Umgebung.
- `npx supabase migration list` konnte nicht gegen Staging prüfen.
- Die kritische lokale Migration `20260711005000_point_redemption_catalog_repeatable.sql` wurde nicht als auf Staging angewendet bestätigt.
- Der vollständige E2E-Live-Flow wurde nicht erneut ausgeführt.
- Geschützte Admin-/Staff-Seiten wurden ohne authentifizierte Session nur statisch geprüft.

Damit ist der Status korrekt **NOT READY**.

## Kritische Bugs / Blocker

### KRITISCH 1 - Staging-Migrationsstand nicht verifizierbar

Beschreibung:

Die Supabase CLI konnte den Staging-Migrationsstand nicht prüfen, weil kein `SUPABASE_ACCESS_TOKEN` in der Umgebung vorhanden war.

Betroffener Flow:

- System
- alle Staging-Live-Flows

Betroffene Persona:

- System
- Restaurant Owner
- Mitarbeiter
- Gast

Betroffene Dateien:

- `supabase/.temp/project-ref`
- `supabase/migrations/*`
- `docs/reports/2026-07-11_V1_PILOT_END_TO_END_FLOW_TEST_REPORT.md`

Betroffene RPCs:

- alle pilotrelevanten RPCs, weil ihr Staging-Stand nicht bewiesen wurde

Betroffene Tabellen:

- alle pilotrelevanten Tabellen, weil der Staging-Stand nicht bewiesen wurde

Schweregrad:

**KRITISCH**

Empfohlener Fix:

1. Staging-Zugriff lokal sauber bereitstellen, ohne Secrets in Git oder Report zu schreiben.
2. `npx supabase migration list` ausführen.
3. `npx supabase db push --include-all` nur falls Migrationen offen sind.
4. Angewendete Migrationen dokumentieren.

Reihenfolge:

**Fix 1**

### KRITISCH 2 - Punkteeinlösung-Migration nicht auf Staging bestätigt

Beschreibung:

Die lokale Migration `20260711005000_point_redemption_catalog_repeatable.sql` enthält die neue V1-Regel:

- normale Punkteeinlösungen bleiben sichtbar
- Punkte werden abgezogen
- Einlösehistorie wird geschrieben
- erneute Einlösung ist bei genug Punkten möglich

Im E2E-Report wurde nicht bestätigt, dass diese Migration auf Staging angewendet ist.

Betroffener Flow:

- Flow 03 - Punkteeinlösung verwenden
- Customer Portal
- Dashboard KPI
- Audit

Betroffene Persona:

- Gast
- Restaurant Owner
- System

Betroffene Dateien:

- `supabase/migrations/20260711005000_point_redemption_catalog_repeatable.sql`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/rewards/rewardService.ts`

Betroffene RPCs:

- `get_public_customer_portal`
- `redeem_customer_reward`

Betroffene Tabellen:

- `reward_redemption_events`
- `rewards`
- `customers`
- `points_transactions`
- `audit_log`
- `customer_qr_tokens`
- `customer_rewards`

Schweregrad:

**KRITISCH**

Empfohlener Fix:

1. Nach Staging-Zugriff prüfen, ob `20260711005000_point_redemption_catalog_repeatable.sql` angewendet wurde.
2. Falls nicht: Migration anwenden.
3. Live testen:
   - Kunde mit genug Punkten löst Punkteeinlösung ein.
   - Punkte werden abgezogen.
   - Produkt bleibt sichtbar.
   - Produkt wird bei fehlenden Punkten gesperrt.
   - erneute Einlösung bei genug Punkten funktioniert.
   - Audit und `reward_redemption_events` werden geschrieben.

Reihenfolge:

**Fix 4**, nach Registrierung und Punkte sammeln.

### KRITISCH 3 - Registrierung wurde nicht live geprüft

Beschreibung:

Der E2E-Report bestätigt nur Codepfade:

- `CustomerPortal` nutzt `registerRestaurantGuest`.
- `registerRestaurantGuest` ruft `register_restaurant_customer`.
- Token wird lokal gespeichert.

Nicht live geprüft wurde:

- neuer Gast registriert sich gegen Staging
- Customer wird erstellt
- Customer Token wird erstellt
- genau ein Willkommensgeschenk wird reserviert
- keine Campaign-/Coupon-Altlogik greift

Betroffener Flow:

- Flow 02 - Gast werden
- Start des gesamten Pilotflows

Betroffene Persona:

- Gast
- System

Betroffene Dateien:

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/customer/customerTokenStorage.ts`
- `supabase/migrations/20260708001000_v1_registration_welcome_gift_connection_fix.sql`

Betroffene RPCs:

- `get_public_customer_portal`
- `register_restaurant_customer`

Betroffene Tabellen:

- `restaurants`
- `restaurant_branding`
- `loyalty_settings`
- `customers`
- `customer_qr_tokens`
- `customer_rewards`
- `rewards`
- `audit_log`

Schweregrad:

**KRITISCH**

Empfohlener Fix:

1. Nach Staging-Migrationscheck normalen Registrierungstest ausführen.
2. Testgast mit eindeutiger Telefonnummer anlegen.
3. Direkt prüfen:
   - `customers`
   - `customer_qr_tokens`
   - `customer_rewards`
   - `audit_log`
4. Customer Portal mit Token öffnen.

Reihenfolge:

**Fix 2**

### KRITISCH 4 - Punkte sammeln mit Tages-PIN wurde nicht live geprüft

Beschreibung:

Der E2E-Report bestätigt lokale Codepfade:

- Customer Portal ruft `collect_bonus_points` mit Tages-PIN.
- Staff Portal lädt Tages-PIN über `get_today_restaurant_pin`.
- Staff-Punktebuchung nutzt `apply_staff_daily_pin_loyalty_action`.

Nicht live geprüft wurde:

- richtige Tages-PIN bucht Punkte
- falsche Tages-PIN blockiert
- `points_transactions` wird geschrieben
- `audit_log` wird geschrieben
- erste Punktebuchung schaltet Willkommensgeschenk frei
- Referral-Erstbuchung aktiviert Bonus Boost

Betroffener Flow:

- Flow 04 - Punkte sammeln
- Willkommensgeschenk-Freischaltung
- Bonus Boost Aktivierung

Betroffene Persona:

- Gast
- Mitarbeiter
- System

Betroffene Dateien:

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/staff/StaffTablet.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- `supabase/migrations/20260709004000_tages_pin_reward_redemption_lock.sql`
- `supabase/migrations/20260710001000_fix_get_today_restaurant_pin_rpc.sql`
- `supabase/migrations/20260711002000_staff_daily_pin_loyalty_first_collection_effects.sql`
- `supabase/migrations/20260711003000_drop_ambiguous_collect_bonus_points_legacy_signature.sql`

Betroffene RPCs:

- `get_today_restaurant_pin`
- `collect_bonus_points`
- `apply_staff_daily_pin_loyalty_action`

Betroffene Tabellen:

- `restaurant_daily_pins`
- `customers`
- `customer_qr_tokens`
- `points_transactions`
- `customer_rewards`
- `referrals`
- `customer_bonus_boosts`
- `audit_log`

Schweregrad:

**KRITISCH**

Empfohlener Fix:

1. Tages-PIN für Testrestaurant laden.
2. Punkte sammeln ohne PIN testen.
3. Punkte sammeln mit falscher PIN testen.
4. Punkte sammeln mit richtiger PIN testen.
5. Danach prüfen:
   - Punktebilanz
   - `points_transactions`
   - `audit_log`
   - Willkommensgeschenk-Freischaltung
   - Bonus Boost Aktivierung bei Referral-Gast

Reihenfolge:

**Fix 3**

## Mittlere Bugs / Blocker

### MITTEL 1 - Willkommensgeschenk-Lifecycle nicht erneut live geprüft

Ursache:

Downstream-Abhängigkeit von Registrierung und Punkte sammeln.

Nicht geprüft:

- locked nach Registrierung
- unlocked nach erster Punktebuchung
- Einlösung ohne PIN
- nach Einlösung verschwunden
- nicht mehrfach einlösbar

Betroffene RPCs:

- `register_restaurant_customer`
- `collect_bonus_points`
- `redeem_customer_reward`

Betroffene Tabellen:

- `customer_rewards`
- `rewards`
- `audit_log`

Schweregrad:

**MITTEL**, wird aber kritisch, falls Registrierung/Punkte sammeln beim Fix funktionieren und dieser Teil danach fehlschlägt.

### MITTEL 2 - Bonus Boost Lifecycle nicht erneut live geprüft

Ursache:

Referral-Test wurde in diesem E2E-Lauf nicht ausgeführt.

Nicht geprüft:

- Referral-Link erzeugen
- Referral-Gast registrieren
- kein Willkommensgeschenk für Referral-Gast
- erste Punktebuchung aktiviert Boost
- beide Kunden erhalten Boost
- 2x-Effekt sichtbar und in Punktebuchung wirksam

Betroffene RPCs:

- `create_referral_link`
- `register_referral_customer`
- `collect_bonus_points`
- `get_public_customer_portal`
- `get_bonus_boost_kpis`

Betroffene Tabellen:

- `referrals`
- `customer_bonus_boosts`
- `customers`
- `points_transactions`
- `audit_log`

Schweregrad:

**MITTEL**, für vollständigen Pilot-E2E aber Pflicht.

### MITTEL 3 - Dashboard KPI nicht gegen Testaktionen abgeglichen

Ursache:

Es wurden keine frischen Staging-Testaktionen erzeugt.

Nicht geprüft:

- Neue Mitglieder heute steigt nach Registrierung.
- Vergebene Bonuspunkte heute steigt nach Punktebuchung.
- Eingelöste Punkteeinlösungen steigt nach Punkteeinlösung.
- Bonus Boost aktiv passt zu aktivierten Boosts.
- Wiederkehrende Gäste passt zur Logik.

Betroffene Dateien:

- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/rewards/rewardService.ts`
- `src/modules/loyalty/loyaltyService.ts`

Betroffene RPCs / Queries:

- `get_bonus_boost_kpis`
- direkte Tabellenabfragen in `loadRewardKpis`

Betroffene Tabellen:

- `customers`
- `points_transactions`
- `stamp_transactions`
- `customer_rewards`
- `coupon_redemptions`
- `rewards`
- `coupons`
- `customer_bonus_boosts`

Schweregrad:

**MITTEL**

### MITTEL 4 - RLS/Security nicht live geprüft

Ursache:

Kein Staging-Access-Token und keine zweite echte Tenant-/User-Konstellation im Testlauf.

Nicht geprüft:

- anon liest keine internen Tabellen
- fremder authenticated User sieht keine fremden Daten
- Customer Token öffnet nur eigenes Bonuskonto
- Restaurant A sieht nicht Restaurant B
- Tages-PIN ist nicht öffentlich lesbar
- alte Punktebuchungswege ohne Tages-PIN sind auf Staging wirklich inaktiv

Betroffene Dateien:

- `src/shared/lib/supabase.ts`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/ProtectedRoute.tsx`
- `src/modules/tenant/TenantProvider.tsx`
- `supabase/migrations/*`

Betroffene Tabellen:

- `restaurants`
- `restaurant_members`
- `customers`
- `customer_qr_tokens`
- `restaurant_daily_pins`
- `customer_rewards`
- `reward_redemption_events`
- `audit_log`

Schweregrad:

**MITTEL**, kann bei Fehlerfund sofort kritisch werden.

### MITTEL 5 - Mobile geschützte Flows nicht mit echter Session geprüft

Ursache:

Browser-Multi-Route-Navigation war eingeschränkt und geschützte Admin-/Staff-Seiten benötigen echte Auth-Session.

Nicht geprüft:

- Restaurant Portal mobile mit echter Owner-Session
- Staff Portal mobile mit echter Staff-/Owner-Session
- Customer Portal mobile nach echter Registrierung
- QR Center mobile
- keine horizontale Scrollbar auf allen geschützten Seiten

Betroffene Dateien:

- `src/styles.css`
- `src/modules/admin/AdminLayout.tsx`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/staff/StaffTablet.tsx`
- `src/modules/admin/pages/QrCenterPage.tsx`

Schweregrad:

**MITTEL**

### MITTEL 6 - Bible-Konflikt: Staff-Dokument beschreibt normale Belohnung noch einmalig

Ursache:

`docs/06_STAFF_PORTAL.md` Abschnitt 4.2 und 7.2 beschreibt Belohnungseinlösung noch als verbraucht und nicht erneut einlösbar.

Das widerspricht:

- `docs/05_CUSTOMER_PORTAL.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md` Abschnitt 69

Aktuelle V1-Regel:

- normale Punkteeinlösungen bleiben sichtbar
- Punkte werden abgezogen
- erneute Einlösung ist bei genügend Punkten möglich
- nur Willkommensgeschenke sind einmalig

Betroffene Dateien:

- `docs/06_STAFF_PORTAL.md`

Schweregrad:

**MITTEL**

Empfohlener Fix:

Dokumentation angleichen, ohne Produktlogik zu ändern.

### MITTEL 7 - Bible-Konflikt: Flow 04 beschreibt Rechnungsbereiche, Code nutzt Rechnungsbetrag-Eingabe

Ursache:

`docs/11_FLOW_04_PUNKTE_SAMMELN.md` verbietet freie Betragseingabe und beschreibt Rechnungsbereich-Auswahl.

Der aktuelle `CustomerPortal` nutzt ein Feld `Rechnungsbetrag`, berechnet daraus aber weiterhin die erreichte Mindeststufe.

Betroffene Dateien:

- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/18_CODEX_REGELN.md`
- `src/modules/customer/CustomerPortal.tsx`

Schweregrad:

**MITTEL**

Empfohlener Fix:

Produktentscheidung klären:

- entweder Bible an die aktuelle Rechnungsbetrag-UX anpassen,
- oder Customer Portal wieder auf explizite Rechnungsbereich-Auswahl zurückführen.

Keine Änderung ohne Founder-Entscheidung.

## Kleine Bugs / Punkte

### KLEIN 1 - QR-PDF nicht visuell erneut geöffnet

Ursache:

Der E2E-Lauf öffnete das Starter Kit PDF nicht visuell im Browser.

Betroffene Datei:

- `src/modules/admin/pages/QrCenterPage.tsx`

Schweregrad:

**KLEIN**

### KLEIN 2 - Eingebetteter Browser konnte nicht frei durch alle Routen navigieren

Ursache:

Die Browser-API in der Session erlaubte keine programmatische Multi-Route-Navigation.

Betroffene Prüfung:

- mobile Screenshots
- geschützte Route-Snapshots

Schweregrad:

**KLEIN**

## Nicht geprüfte Bereiche mit Ursache

### 1. Registrierung geprüft: Nein

Warum nicht geprüft:

- Kein neuer Staging-Testgast wurde erzeugt.
- Staging-Migrationsstand war nicht verifiziert.

Technischer Fehler:

- Nein, kein Codefehler bewiesen.

Fehlender Testdatensatz:

- Ja.

Fehlende Staging-Verbindung:

- Ja, wegen fehlendem `SUPABASE_ACCESS_TOKEN`.

UI-Blocker:

- Nein.

DB/RPC/RLS-Blocker:

- Nicht bewiesen, aber wegen nicht verifizierter Staging-Migration offen.

Pilotkritisch:

- Ja.

### 2. Punkte sammeln mit Tages-PIN geprüft: Nein

Warum nicht geprüft:

- Keine echte Tages-PIN aus Staging in diesem Lauf verwendet.
- Kein Live-Test mit richtiger/falscher PIN.

Technischer Fehler:

- Nein, kein neuer Codefehler bewiesen.

Fehlender Testdatensatz:

- Ja.

Fehlende Staging-Verbindung:

- Ja.

UI-Blocker:

- Nein.

DB/RPC/RLS-Blocker:

- Offen, weil Staging-Migrationen nicht verifiziert wurden.

Pilotkritisch:

- Ja.

### 3. Willkommensgeschenk geprüft: Nein

Warum nicht geprüft:

- Abhängig von erfolgreicher Registrierung und erster Punktebuchung.

Technischer Fehler:

- Nein, nicht bewiesen.

Fehlender Testdatensatz:

- Ja.

Fehlende Staging-Verbindung:

- Ja.

DB/RPC/RLS-Blocker:

- Offen.

Pilotkritisch:

- Ja als Flow-Kette, aber nach Registrierung/Punkte sammeln zu prüfen.

### 4. Punkteeinlösung geprüft: Nein

Warum nicht geprüft:

- Die neue Migration für wiederholbare Punkteeinlösung wurde nicht auf Staging bestätigt.

Technischer Fehler:

- Potenziell ja, falls Staging noch alte Logik hat.

Fehlender Testdatensatz:

- Ja.

Fehlende Staging-Verbindung:

- Ja.

DB/RPC/RLS-Blocker:

- Ja, Migrationsstand offen.

Pilotkritisch:

- Ja.

### 5. Bonus Boost geprüft: Nein

Warum nicht geprüft:

- Kein Referral-Gast wurde in diesem Lauf registriert.
- Keine erste Punktebuchung für Referral-Gast.

Technischer Fehler:

- Nein, nicht bewiesen.

Fehlender Testdatensatz:

- Ja.

Fehlende Staging-Verbindung:

- Ja.

DB/RPC/RLS-Blocker:

- Offen.

Pilotkritisch:

- Ja für Gesamtflow, nach Punkte sammeln zu prüfen.

### 6. Dashboard KPIs geprüft: Nein

Warum nicht geprüft:

- Keine frischen Testaktionen erzeugt.
- Daher kein Soll/Ist-Abgleich möglich.

Technischer Fehler:

- Nein, nicht bewiesen.

Fehlender Testdatensatz:

- Ja.

Fehlende Staging-Verbindung:

- Ja.

Pilotkritisch:

- Mittel.

### 7. RLS/Security geprüft: Nein

Warum nicht geprüft:

- Keine Live-Anon-/Fremduser-/Cross-Tenant-Abfragen in diesem Lauf.

Technischer Fehler:

- Nein, nicht bewiesen.

Fehlende Staging-Verbindung:

- Ja.

DB/RPC/RLS-Blocker:

- Offen.

Pilotkritisch:

- Ja, falls beim Test Fehler gefunden werden.

### 8. Mobile geprüft: Nein

Warum nicht geprüft:

- Keine vollständige mobile Browserprüfung aller geschützten Flows mit echter Session.

Technischer Fehler:

- Nein, nicht bewiesen.

UI-Blocker:

- Nicht bewiesen.

Pilotkritisch:

- Mittel.

## Betroffene Hauptdateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/ReferralLanding.tsx`
- `src/modules/customer/customerTokenStorage.ts`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/rewards/rewardService.ts`
- `src/modules/staff/StaffTablet.tsx`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/ProtectedRoute.tsx`
- `src/modules/tenant/TenantProvider.tsx`
- `src/styles.css`
- `docs/06_STAFF_PORTAL.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`

## Betroffene RPCs

- `get_public_customer_portal`
- `register_restaurant_customer`
- `get_today_restaurant_pin`
- `collect_bonus_points`
- `apply_staff_daily_pin_loyalty_action`
- `redeem_customer_reward`
- `create_referral_link`
- `register_referral_customer`
- `get_bonus_boost_kpis`

## Betroffene Migrationen

- `supabase/migrations/20260708001000_v1_registration_welcome_gift_connection_fix.sql`
- `supabase/migrations/20260709004000_tages_pin_reward_redemption_lock.sql`
- `supabase/migrations/20260710001000_fix_get_today_restaurant_pin_rpc.sql`
- `supabase/migrations/20260711002000_staff_daily_pin_loyalty_first_collection_effects.sql`
- `supabase/migrations/20260711003000_drop_ambiguous_collect_bonus_points_legacy_signature.sql`
- `supabase/migrations/20260711004000_welcome_gifts_editable_after_onboarding.sql`
- `supabase/migrations/20260711005000_point_redemption_catalog_repeatable.sql`

## Betroffene Tabellen

- `restaurants`
- `restaurant_branding`
- `loyalty_settings`
- `restaurant_members`
- `customers`
- `customer_qr_tokens`
- `customer_rewards`
- `rewards`
- `reward_redemption_events`
- `restaurant_daily_pins`
- `points_transactions`
- `stamp_transactions`
- `referrals`
- `customer_bonus_boosts`
- `audit_log`
- `coupons`
- `coupon_redemptions`

## Empfohlene Fix-Reihenfolge

### Fix 1 - Staging-Verbindung und Migrationen verifizieren

Ziel:

- `SUPABASE_ACCESS_TOKEN` sicher bereitstellen.
- `npx supabase migration list` ausführen.
- offene Migrationen exakt auflisten.
- `20260711005000_point_redemption_catalog_repeatable.sql` auf Staging bestätigen.

Warum zuerst:

Ohne verifizierten Staging-Stand ist jeder Live-Test uneindeutig.

### Fix 2 - Registrierung live testen

Ziel:

- normaler Gast registriert sich über `/customer/:slug`
- Customer, Token und gesperrtes Willkommensgeschenk entstehen
- keine Campaign-/Coupon-Altlogik greift

Warum danach:

Ohne registrierten Gast gibt es keine belastbaren Folgeflows.

### Fix 3 - Punkte sammeln mit Tages-PIN live testen

Ziel:

- falsche PIN blockiert
- richtige PIN bucht Punkte
- `points_transactions` und `audit_log` entstehen
- Willkommensgeschenk wird bei Erstbuchung freigeschaltet

Warum danach:

Ohne Punktebuchung funktionieren weder Willkommensgeschenk-Freischaltung noch Bonus Boost.

### Fix 4 - Punkteeinlösung live testen

Ziel:

- normale Punkteeinlösung zieht Punkte ab
- Produkt bleibt sichtbar
- Status wird neu berechnet
- erneute Einlösung bei genug Punkten möglich
- `reward_redemption_events` und Audit werden geschrieben

Warum danach:

Die neueste lokale Migration betrifft genau diesen kritischen V1-Fix.

### Fix 5 - Willkommensgeschenk live testen

Ziel:

- locked nach Registrierung
- unlocked nach erster Punktebuchung
- Einlösung ohne PIN
- nach Einlösung verschwunden
- nicht mehrfach einlösbar

### Fix 6 - Bonus Boost live testen

Ziel:

- Referral ohne Willkommensgeschenk
- Boost erst nach erster Punktebuchung
- beide Kunden erhalten Boost
- 2x-Effekt sichtbar und wirksam

### Fix 7 - Dashboard KPI abgleichen

Ziel:

- KPI nach Testaktionen mit Tabellenwerten vergleichen.

### Fix 8 - RLS/Security live prüfen

Ziel:

- anon
- fremder authenticated User
- Cross-Tenant
- Customer Token
- Tages-PIN
- alte RPC-Wege

### Fix 9 - Mobile geschützte Flows prüfen

Ziel:

- Customer Portal
- Restaurant Portal
- Staff Portal
- QR Center
- keine horizontale Scrollbar

## Welcher Fix zuerst gemacht werden muss

**Fix 1 - Staging-Verbindung und Migrationen verifizieren**

Begründung:

Der aktuelle NOT-READY-Hauptgrund ist nicht ein bestätigter UI- oder Codefehler, sondern fehlende Staging-Abnahme. Ohne verifizierten Migrationsstand kann nicht sicher bewertet werden, ob Flow-Fehler aus Code, Datenbankstand oder fehlenden Testdaten entstehen.

## Anzahl Blocker

- Kritische Bugs / Blocker: 4
- Mittlere Bugs / Blocker: 7
- Kleine Bugs / Punkte: 2

## Status

**ANALYSE LOCK**
