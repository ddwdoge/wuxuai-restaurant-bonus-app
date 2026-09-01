# WUXUAI Bonus V1 - Live App E2E Workflow Bug Test Report

Datum: 2026-07-13  
Live URL: `https://wuxuai-restaurant-bonus-os.dongdongwu4899.workers.dev`  
Status: **NOT READY**

## Gelesene Grundlage

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
- `docs/15_DESIGN_SYSTEM.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Repository nicht. Der Selbstkontroll-Loop wurde nach `AGENTS.md` und `docs/18_CODEX_REGELN.md` angewendet.

## Getestete Umgebung

- Live-App: Cloudflare Workers URL oben
- Browser-Automation: Chrome/Playwright und In-App-Browser
- Viewports: Desktop 1280px, 1024px, Tablet 768px, Mobile 430px und 390px
- Lokaler Build: `npm run build`
- Login-Daten: keine echten Owner-/Staff-Zugangsdaten vorhanden

## Getestetes Restaurant

Geprüfter öffentlicher Slug:

```text
akakiko-hietzing
```

## Ergebnis Live App Start

Bestanden:

- `/` lädt mit HTTP 200.
- Keine weiße Seite.
- Keine Console-Fehler auf der Startseite.
- `Customer QR / Bonus` ist live nicht mehr sichtbar.
- Gast-Karte ist deutsch: `Gast-Bonus öffnen`.
- Mobile 390px: `scrollWidth = 390`, kein horizontaler Scroll.

Nicht bestanden:

- `/login` zeigt live sichtbar `Demo-Modus aktiv.`
- Admin- und Register-Flows laufen live ohne echte Auth in den Demo-Onboarding-Kontext.

## Ergebnis Routing

Geprüfte Routen:

- `/`
- `/customer`
- `/w/akakiko-hietzing`
- `/customer/akakiko-hietzing`
- `/w/not-existing-restaurant`
- `/admin`
- `/admin/settings`
- `/admin/rewards`
- `/admin/welcome-gifts`
- `/admin/qr`
- `/admin/staff`
- `/staff/akakiko-hietzing`
- `/login`
- `/register`
- `/platform-admin`

Ergebnisse:

- `/customer` ohne Token zeigt eine saubere deutsche Gast-Info-Seite.
- `/platform-admin` leitet auf `/` zurück.
- `/admin`, `/register`, `/admin/rewards`, `/admin/qr`, `/admin/staff` und `/staff/akakiko-hietzing` landen live im Demo-Onboarding statt in einem echten Auth-Gate oder echten Datenfluss.
- `/w/akakiko-hietzing` und `/customer/akakiko-hietzing` zeigen: `Daten konnten gerade nicht geladen werden.`

## Ergebnis Restaurant Portal

Nicht vollständig live prüfbar.

Blocker:

- Live-App läuft sichtbar im Demo-Modus.
- Admin-Bereich ist ohne echte Anmeldung erreichbar und zeigt Demo-Restaurant `Kai Sushi`.
- `/admin/settings` zeigt `Kai Sushi` und Restaurant Portal statt echte Live-/Supabase-Daten.
- Dadurch sind Dashboard, Punkteeinlösung, Willkommensgeschenke, Gäste, QR Center, Mitarbeiter und Einstellungen nicht als echte Live-Flows validierbar.

## Ergebnis Einstellungen

Nicht bestanden.

Beobachtung:

- `/admin/settings` ist ohne Login erreichbar.
- Sichtbarer Demo-Inhalt:
  - `Kai Sushi`
  - `Restaurant Portal`
  - `Abo & Testphase`
- Das widerspricht V1-Regel: keine Demo-Fallbacks im Production-Betrieb.

## Ergebnis Onboarding

Nicht bestanden.

Beobachtung:

- `/register` führt live nach kurzer Ladephase auf `/admin/onboarding`.
- Onboarding nutzt Demo-/Tenant-Kontext.
- Ein echter Restaurant-Owner-Registrierungsflow wurde dadurch nicht live validierbar.

## Ergebnis QR Center

Nicht live prüfbar.

Grund:

- `/admin/qr` wird auf `/admin/onboarding` umgeleitet.
- Kein echter Owner-Login und kein echter Restaurant-Kontext vorhanden.
- QR-Downloads, Starter Kit PDF und echte QR-Ziele konnten live nicht geprüft werden.

## Ergebnis Customer Portal

Teilweise bestanden.

Bestanden:

- `/customer` ohne Token ist sauber deutsch.
- Kein Demo-Restaurant auf `/customer`.

Nicht bestanden:

- `/w/akakiko-hietzing` lädt kein echtes Restaurant.
- Console-Fehler:

```text
Kundenportal konnte nicht geladen werden. Error: Restaurant konnte nicht geladen werden.
```

Folgen:

- Customer Portal für echtes Restaurant nicht nutzbar.
- Registrierung über Restaurant-QR nicht testbar.
- Punkte sammeln, Willkommensgeschenk, Punkteeinlösung und Bonus Boost nicht live testbar.

## Ergebnis Registrierung

Nicht geprüft / blockiert.

Grund:

- Der echte Customer-Slug lädt nicht.
- `/register` öffnet Demo-Onboarding statt echte Restaurant-Owner-Registrierung.
- Es wurden keine Testdaten an Live/Supabase gesendet.

## Ergebnis Willkommensgeschenk

Nicht geprüft / blockiert.

Grund:

- Normale Gastregistrierung über `/w/akakiko-hietzing` ist blockiert.
- Keine Zuteilung, kein locked/unlocked Status und keine Einlösung live prüfbar.

## Ergebnis Tages-PIN

Nicht geprüft / blockiert.

Grund:

- Staff Portal `/staff/akakiko-hietzing` landet im Demo-Onboarding.
- Keine echte Mitarbeiteransicht, keine Tages-PIN, keine PIN-Prüfung live sichtbar.

## Ergebnis Punkte sammeln

Nicht geprüft / blockiert.

Grund:

- Customer Portal für `akakiko-hietzing` lädt nicht.
- Tages-PIN nicht erreichbar.
- Keine Live-Punktebuchung möglich.

## Ergebnis Punkteeinlösung

Nicht geprüft / blockiert.

Grund:

- Restaurant Portal und Customer Portal sind im Live-Kontext nicht echt nutzbar.
- Keine aktive Punkteeinlösung live sichtbar.
- Punkteabzug, Mehrfach-Einlösung und finale Kundenbestätigung konnten nicht live geprüft werden.

## Ergebnis Staff Portal

Nicht bestanden.

Beobachtung:

- `/staff/akakiko-hietzing` landet auf `/admin/onboarding`.
- Dadurch ist der Mitarbeiterbereich für den geprüften Live-Slug nicht nutzbar.

## Ergebnis Bonus Boost

Nicht geprüft / blockiert.

Grund:

- Customer Portal für echten Slug lädt nicht.
- Referral-/Punktebuchungsflow konnte nicht live ausgeführt werden.

## Ergebnis RLS / Security

Nicht bestanden / nicht vollständig prüfbar.

Kritischer Befund:

- Live-Build läuft offenbar ohne Supabase-Konfiguration oder mit fehlender Runtime-Konfiguration.
- Dadurch aktivieren `AuthProvider` und `TenantProvider` den Demo-Fallback.
- Admin-geschützte Bereiche sind ohne echte Session erreichbar.

Codepfade:

- `src/shared/lib/supabase.ts`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/tenant/TenantProvider.tsx`
- `src/app/App.tsx`

Nicht direkt live prüfbar:

- RLS auf Kundendaten
- Restaurant-zu-Restaurant-Isolation
- Tages-PIN-RPC
- Punktebuchungs-RPC
- Willkommensgeschenk-RPC

## Responsive Ergebnisse

Bestanden auf Startseite:

- 390px: kein horizontaler Scroll
- 430px: kein horizontaler Scroll
- 768px: kein horizontaler Scroll
- 1024px: kein horizontaler Scroll
- Desktop: kein horizontaler Scroll

Nicht vollständig prüfbar:

- Customer Portal mit echtem Restaurant
- Restaurant Portal nach echter Anmeldung
- Staff Portal
- QR Center
- Punkteeinlösungskarten

## Alte Logik Prüfung

Gefunden:

- `campaignService` und `PublicCampaignLanding` existieren weiterhin im Code.
- Alte Campaign-/Coupon-Migrationen existieren in der Historie.
- `create_redemption_code` und `redeem_reward_with_pin` existieren noch in alter Migration, werden in späterer Migration aber per `revoke execute` gesperrt.
- Demo-Daten `Kai Sushi` sind live sichtbar, was im Production-Betrieb kritisch ist.

Kein aktueller doppelter Migrations-Timestamp gefunden:

- `find supabase/migrations ... | uniq -d` lieferte keine Dublette.

## Kritische Bugs

### KRITISCH 1 - Live-App läuft im Demo-Modus

Beschreibung:

- `/login` zeigt `Demo-Modus aktiv.`
- `/admin/settings` zeigt `Kai Sushi`.
- `/admin` und `/register` öffnen Demo-Onboarding ohne echte Auth.

Betroffene Persona:

- Restaurant Owner
- WUXUAI Betreiber
- System

Betroffene Dateien:

- `src/shared/lib/supabase.ts`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/tenant/TenantProvider.tsx`
- Deployment-/Cloudflare-Environment

Empfohlener Fix:

- Live-Deployment muss mit gültigem `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` gebaut werden.
- Demo-Fallback darf in Production nicht aktiv werden.
- Bei fehlender Supabase-Konfiguration muss die App eine sichere Fehlermeldung zeigen, nicht Owner-Demozugriff.

### KRITISCH 2 - Echter Customer-Slug lädt live nicht

Beschreibung:

- `/w/akakiko-hietzing` zeigt nur `Daten konnten gerade nicht geladen werden.`
- Console: `Restaurant konnte nicht geladen werden.`

Betroffene Persona:

- Gast
- Restaurant Owner

Betroffene Flows:

- Registrierung
- Mein Bonus
- Punkte sammeln
- Willkommensgeschenk
- Punkteeinlösung
- Bonus Boost

Empfohlener Fix:

- Live Supabase-Konfiguration und `get_public_customer_portal` gegen Staging/Live prüfen.
- Sicherstellen, dass Restaurant-Slug `akakiko-hietzing` existiert und public RPC Zugriff korrekt erlaubt.

### KRITISCH 3 - Staff Portal ist live nicht erreichbar

Beschreibung:

- `/staff/akakiko-hietzing` leitet in Demo-Onboarding.
- Tages-PIN und Punktebuchung sind live nicht prüfbar.

Betroffene Persona:

- Mitarbeiter
- Restaurant Owner

Empfohlener Fix:

- Auth-/Tenant-/Setup-Gate mit echter Supabase-Konfiguration prüfen.
- Staff-Route darf im Live-Betrieb nicht in Demo-Onboarding landen.

## Mittlere Bugs

### MITTEL 1 - Live-Seitentitel nutzt alten Produktnamen

Beobachtung:

- Browser-Titel: `WUXUAI Restaurant Growth OS`

Empfehlung:

- Später auf `WUXUAI Bonus` ändern.

### MITTEL 2 - Bible-Konflikt Flow 04

Beobachtung:

- `docs/11_FLOW_04_PUNKTE_SAMMELN.md` beschreibt Rechnungsbereiche.
- Spätere Aufgaben verlangten freie Rechnungsbetragseingabe.

Empfehlung:

- CTO-Entscheidung/Bible bereinigen, bevor Punkte-Sammeln final bewertet wird.

## Kleine Bugs

Keine kleinen Bugs priorisiert, weil kritische Live-Konfigurationsblocker zuerst behoben werden müssen.

## Screenshots / Artefakte

Screenshots und JSON-Ergebnisse:

- `docs/reports/assets/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST/live-route-results.json`
- `docs/reports/assets/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST/home-desktop.png`
- `docs/reports/assets/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST/customer-no-token-desktop.png`
- `docs/reports/assets/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST/customer-akakiko-desktop.png`
- `docs/reports/assets/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST/admin-settings-desktop.png`
- `docs/reports/assets/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST/staff-akakiko-desktop.png`
- `docs/reports/assets/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST/home-390.png`
- `docs/reports/assets/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST/home-430.png`
- `docs/reports/assets/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST/home-768.png`
- `docs/reports/assets/2026-07-13_LIVE_APP_E2E_WORKFLOW_BUG_TEST/home-1024.png`

## Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Keine echten Owner-/Staff-Zugangsdaten vorhanden.
- Keine Live-Registrierung durchgeführt, weil echter Restaurant-Slug nicht lädt.
- Keine DB/RPC/RLS-Liveprüfung möglich, solange Production im Demo-Modus läuft und Customer-Slug scheitert.
- Kein FINAL LOCK möglich.

## Empfohlene Fix-Reihenfolge

1. Live-Deployment-Konfiguration reparieren: Supabase Env setzen und Demo-Fallback in Production verhindern.
2. `/w/akakiko-hietzing` gegen echte Supabase-Daten reparieren.
3. Auth-/Setup-Gate für `/admin`, `/register`, `/staff/:slug` live prüfen.
4. Danach vollständigen Flow erneut live testen: Registrierung, Willkommensgeschenk, Tages-PIN, Punkte sammeln, Punkteeinlösung, Bonus Boost, Dashboard KPI.

## Status

NOT READY
