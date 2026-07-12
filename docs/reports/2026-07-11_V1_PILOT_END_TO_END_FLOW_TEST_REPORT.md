# WUXUAI Bonus V1 - Pilot End-to-End Flow Test Report

Datum: 2026-07-11

Status: **NOT READY**

## Gelesene Bible-Dateien

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

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Repository nicht. Der Selbstkontroll-Loop wurde nach `AGENTS.md`, `docs/18_CODEX_REGELN.md` und den vorhandenen Reports angewendet.

## Testdaten / Testumgebung

- Projektordner: `/Users/dongdongwu/Documents/wuxuai restaurant bonus app`
- Lokaler Server: `http://127.0.0.1:5176/`
- Supabase Link-Datei: `bwhvfjuwixgwduoeqaya`
- `.env.local`: vorhanden
- `SUPABASE_ACCESS_TOKEN`: nicht in der Shell-Umgebung gesetzt

Der Browser-DOM wurde für die öffentliche Startseite geprüft. Programmatische Navigation im eingebetteten Browser war in dieser Session eingeschränkt. Die weiteren UI-Prüfungen wurden daher über Codepfade, Routing, vorhandene lokale Implementierung und Build validiert.

## Restaurant Portal Ergebnis

Geprüft:

- `/admin` ist über `ProtectedRoute` geschützt.
- `RestaurantSetupGate` schützt den Admin-Bereich und erlaubt während Setup `/admin/onboarding` und `/admin/settings`.
- Admin-Navigation enthält:
  - Dashboard
  - Punkteeinlösung
  - Willkommensgeschenke
  - Gäste
  - QR Center
  - Mitarbeiter
  - Einstellungen
- Das V1-Modul `Aktionen` ist nicht in der Admin-Navigation sichtbar.
- Dashboard zeigt die V1-KPI:
  - Neue Mitglieder heute
  - Vergebene Bonuspunkte heute
  - Eingelöste Punkteeinlösungen
  - Bonus Boost aktiv
  - Wiederkehrende Gäste
- Der Button `Neue Aktion starten` ist im Dashboard-Code nicht vorhanden.
- Schnellzugriffe zeigen QR Center, Punkteeinlösung, Gäste und Mitarbeiter.

Ergebnis: **teilweise bestanden**

Nicht live geprüft:

- Login mit echter Owner-Session
- Dashboard-KPI-Abgleich gegen frisch erzeugte Testaktionen

## Onboarding / Restaurant Setup Ergebnis

Geprüft:

- Onboarding-Routing ist vorhanden.
- Setup-Gate blockiert Admin-Seiten, solange Onboarding nicht abgeschlossen ist.
- Einstellungen bleiben während Setup erreichbar.
- Restaurant Starter Kit ist in der Onboarding-Struktur vorhanden.

Ergebnis: **teilweise bestanden**

Nicht live geprüft:

- Neuer Restaurant-Owner durchläuft Onboarding vollständig.
- Onboarding-Draft wird in dieser Aufgabe nicht neu erzeugt.

## QR Center Ergebnis

Geprüft:

- QR Center enthält:
  - Neue Gäste QR
  - Kassa QR
  - Kassa-Aufsteller
  - Mitarbeiter QR
  - Restaurant Starter Kit PDF
- Gäste-QR verweist auf `/customer/:slug`.
- Kassa-QR verweist auf `/w/:slug`.
- Mitarbeiter-QR verweist auf `/staff/:slug`.
- PNG-Download ist für einzelne QR-Karten sichtbar.
- Starter Kit PDF wird über `buildQrCenterStarterKitPdf` erzeugt.
- Restaurantname und Branding werden aus Tenant-Kontext verwendet.

Ergebnis: **teilweise bestanden**

Nicht live geprüft:

- PDF-Download im echten Browser geöffnet.
- QR-Codes mit Kamera gescannt.

## Registrierung Ergebnis

Geprüft:

- `CustomerPortal` nutzt `registerRestaurantGuest`.
- Registrierung ruft `register_restaurant_customer` RPC mit Restaurant-Slug, Vorname, Telefon, Geburtstag und `device_id`.
- Customer Token wird lokal gespeichert.
- Customer Portal lädt öffentliche Daten über `get_public_customer_portal`.
- Keine Campaign-Starter-Offer-Logik im sichtbaren Customer-Portal-Flow gefunden.

Ergebnis: **nicht vollständig bestanden**

Nicht live geprüft:

- Neuer Gast wurde nicht gegen Staging registriert.
- Willkommensgeschenk-Zuteilung wurde in diesem Lauf nicht erneut live erzeugt.

## Customer Portal Reihenfolge Ergebnis

Geprüft in `src/modules/customer/CustomerPortal.tsx`:

1. Bonus Boost
2. Große Punkte-Anzeige
3. `Mit Punkten einlösbar`
4. `Dein Willkommensgeschenk`
5. `Dein persönlicher Bonus-QR`
6. `Bonuskonto speichern`

Zusätzlich geprüft:

- `Nächste Belohnungen` ist im Customer-Portal-Code nicht vorhanden.
- Normale Punkteeinlösungen werden von Willkommensgeschenken getrennt.
- Eingelöste Willkommensgeschenke werden aus der sichtbaren Liste entfernt.
- QR steht nicht mehr im oberen Hauptbereich.
- Tages-PIN-Feld ist als Passwortfeld maskiert.
- Öffentliche Startseite zeigte keine horizontale Scrollbar.

Ergebnis: **bestanden nach Code-/DOM-Prüfung**

## Tages-PIN / Punkte sammeln Ergebnis

Geprüft:

- Customer Portal sammelt Punkte über `collectBonusPoints`.
- RPC-Aufruf verwendet:
  - `input_restaurant_slug`
  - `input_customer_token`
  - `input_amount_tier_key`
  - `input_daily_pin`
  - `input_device_id`
- Fehlende Tages-PIN wird lokal blockiert.
- Falsche Tages-PIN wird über deutsche Fehlermeldung gemappt.
- Staff-Portal-Punktebuchung nutzt `apply_staff_daily_pin_loyalty_action`.
- Alte lokale Migration `20260711003000_drop_ambiguous_collect_bonus_points_legacy_signature.sql` entfernt den mehrdeutigen alten Weg.

Ergebnis: **teilweise bestanden**

Nicht live geprüft:

- Richtige Tages-PIN bucht in diesem Lauf Punkte gegen Staging.
- Falsche Tages-PIN blockiert in diesem Lauf gegen Staging.
- `points_transactions` und `audit_log` wurden in diesem Lauf nicht live neu geprüft.

Vorhandener Vorreport:

- `docs/reports/2026-07-10_TAGES_PIN_REWARD_FINAL_KONSISTENZ_REPORT.md` dokumentiert einen früheren erfolgreichen Staging-Live-Test für Tages-PIN.

## Staff Portal Ergebnis

Geprüft:

- `/staff/:slug` ist über `ProtectedRoute` geschützt.
- Staff-Tablet lädt Tages-PIN separat über `loadTodayRestaurantPin`.
- Fehler beim Laden von Mitarbeiterdaten blockiert die Tages-PIN nicht direkt.
- `QR scannen` startet sichtbar `startQrScanner`.
- Kamera-Fehler werden auf Deutsch angezeigt.
- Punkte/Stempel geben öffnet Tages-PIN-Flow.
- Dialog-Texte verwenden `Tages-PIN`.

Ergebnis: **teilweise bestanden**

Nicht live geprüft:

- Authentifizierter Staff-Zugriff auf `/staff/akakiko-hietzing`.
- Kamera-Berechtigungsdialog im Browser.
- Tages-PIN-Anzeige mit echter Staff-/Owner-Session in diesem Lauf.

## Willkommensgeschenk Ergebnis

Geprüft:

- Customer Portal trennt Willkommensgeschenke von normalen Punkteeinlösungen.
- Locked/Unlocked-Texte sind deutsch.
- `redeemCustomerReward` behandelt Willkommensgeschenke als einmalig.
- Nach Einlösung werden Willkommensgeschenke lokal aus der Ansicht entfernt.

Ergebnis: **teilweise bestanden**

Nicht live geprüft:

- Neue Zuteilung bei Registrierung.
- Freischaltung nach erster Punktebuchung.
- Einlösung eines echten Willkommensgeschenks in diesem Lauf.

Vorhandener Vorreport:

- `docs/reports/2026-07-08_STAGING_WILLKOMMENSGESCHENKE_KUNDENPORTAL_VERBINDUNG_VALIDIERUNG_REPORT.md` dokumentiert den früheren Staging-Lock der Verbindung Registrierung -> Willkommensgeschenk -> Kundenportal.

## Punkteeinlösung Ergebnis

Geprüft:

- Customer Portal zeigt normale aktive Rewards als `Mit Punkten einlösbar`.
- Normale Punkteeinlösungen bleiben nach Einlösung sichtbar.
- Status wird nach Punkteabzug anhand neuem Punktestand neu berechnet.
- Willkommensgeschenke bleiben einmalig.
- `redeem_customer_reward` in der lokalen Migration zieht Punkte serverseitig ab.
- `reward_redemption_events`, `points_transactions` und `audit_log` werden in der lokalen Migration geschrieben.

Ergebnis: **nicht vollständig bestanden**

Blocker:

- Die neue lokale Migration `20260711005000_point_redemption_catalog_repeatable.sql` konnte in diesem Lauf nicht gegen Staging verifiziert werden.
- `npx supabase migration list` konnte ohne `SUPABASE_ACCESS_TOKEN` nicht ausgeführt werden.
- Deshalb ist nicht bewiesen, dass Staging die neue Mehrfach-Einlösung/Punkteabzug-Logik bereits enthält.

## Bonus Boost Ergebnis

Geprüft:

- Customer Portal zeigt Bonus Boost oben.
- Aktiver Boost zeigt Multiplikator, Restzeit und Fortschritt.
- Punktekarte zeigt bei aktivem Boost ein Feuer-Badge.
- Punkte-Sammeln-Erfolg kann Normalpunkte, Bonuspunkte und Gesamtpunkte anzeigen, wenn die RPC diese Daten liefert.
- Referral-Link-Erzeugung läuft über `create_referral_link`.

Ergebnis: **teilweise bestanden**

Nicht live geprüft:

- Neue Referral-Registrierung.
- Aktivierung nach erster Punktebuchung.
- 2x-Punkte-Effekt in einem neuen Staging-Test.

## Dashboard KPI Ergebnis

Geprüft:

- Dashboard lädt KPI aus `loadRewardKpis`, `loadNewMembersToday`, `loadBonusBoostKpis`.
- KPI-Bezeichnung `Bonus Boost aktiv` ist vorhanden.
- KPI-Bezeichnung nutzt `Eingelöste Punkteeinlösungen`.

Ergebnis: **teilweise bestanden**

Nicht live geprüft:

- KPI-Zahlen nach frisch erzeugten E2E-Testaktionen.

## RLS / Security Ergebnis

Geprüft:

- Frontend verwendet nur Supabase URL und Anon Key.
- Keine Service-Role im Frontend-Code gefunden.
- `ProtectedRoute` defaultet nicht auf Owner.
- Admin-Rolle wird über AuthProvider/Tenant-Mitgliedschaft defensiv geprüft.
- Customer Portal lädt Kundendaten über sichere RPC mit Customer Token.
- Tages-PIN wird nicht im Customer Portal angezeigt.
- Staff Tages-PIN kommt über RPC.
- Normale Punkteeinlösung sendet keinen Punktestand als Wahrheit an den Server.

Ergebnis: **teilweise bestanden**

Nicht live geprüft:

- Anon-Direktzugriffe auf Tabellen in diesem Lauf.
- Cross-Tenant-RLS mit zwei echten Restaurants in diesem Lauf.

## Mobile Ergebnis

Geprüft:

- Admin CSS zeigt Sidebar ab Desktop und Hamburger nur unter 1024px.
- Drawer ist kompakt und nicht `100vh`.
- Customer Portal Reihenfolge ist mobile-first.
- Punkteeinlösungen sind einspaltig bis Tablet.
- Öffentliche Startseite im aktuellen Browser-DOM hatte keine horizontale Scrollbar.

Ergebnis: **teilweise bestanden**

Nicht live geprüft:

- Jede einzelne geschützte Seite mit echter Auth-Session bei 390px.

## Build Ergebnis

`npm run build` erfolgreich.

Wichtige Chunks:

- `CustomerPortal-W94G7yuf.js`: 26.85 kB
- `StaffTablet-BNl9ZqVT.js`: 16.29 kB
- `AdminDashboard-Cse5EkQf.js`: 3.19 kB
- `vendor-supabase-CGP4Gsz0.js`: 214.35 kB

## SQL / RPC / RLS Fehler

In diesem Lauf:

- Kein Build-Fehler.
- Kein TypeScript-Fehler.
- Supabase CLI Migrationsprüfung zuerst durch Netzwerkrestriktion blockiert.
- Mit Netzwerkfreigabe anschließend blockiert durch fehlenden `SUPABASE_ACCESS_TOKEN`.

Fehler:

```text
LegacyPlatformAuthRequiredError: Access token not provided.
```

## Offene Risiken

KRITISCH:

- Staging-Migrationsstand konnte in diesem Lauf nicht verifiziert werden.
- Die neue lokale Migration `20260711005000_point_redemption_catalog_repeatable.sql` ist für den aktuellen Punkteeinlösungs-Fix kritisch, aber in diesem Lauf nicht auf Staging bestätigt.
- Der vollständige E2E-Live-Flow mit Registrierung, Tages-PIN, Punktebuchung, Willkommensgeschenk-Freischaltung, Bonus Boost und Punkteeinlösung wurde in diesem Lauf nicht erneut gegen Staging ausgeführt.

MITTEL:

- `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` fehlt, obwohl es laut Auftrag gelesen werden soll.
- Geschützte Restaurant-/Staff-Seiten konnten ohne authentifizierte Session nur statisch und über Codepfade geprüft werden.

KLEIN:

- QR-PDF wurde in diesem Lauf nicht visuell geöffnet.
- Browser-Multi-Route-Navigation war in der eingebetteten Browser-API eingeschränkt.

## Bewertung

Der lokale Build und die lokale Code-/UI-Struktur sind weitgehend konsistent mit V1.

Für einen echten Pilot-`FINAL LOCK` fehlt aber der erneute Live-Nachweis gegen Staging, insbesondere für:

- aktuelle Migrationen
- Tages-PIN-Punktebuchung
- Willkommensgeschenk-Freischaltung
- Bonus Boost Aktivierung
- wiederholbare Punkteeinlösung mit Punkteabzug
- Dashboard-KPI-Abgleich nach Testaktionen

## Status

**NOT READY**
