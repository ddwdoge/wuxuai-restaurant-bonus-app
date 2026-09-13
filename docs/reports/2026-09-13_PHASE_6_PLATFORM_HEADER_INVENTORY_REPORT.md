# WUXUAI® Bonus – Plattformweite Mobile-Header-Inventur

Datum: 2026-09-13

Branch: `codex/v1-phase-6-compact-mobile-ui`

Ausgangs-Commit: `feb53edfe2e9954b6b9ee0f5ca81b34264ff2f78`
Status: INVENTORY COMPLETE / HEADER FIX PENDING

## Ursache

Der gemeinsame Customer-`AppShell` rendert außerhalb des Restaurantportals den Sprachumschalter in `.customer-language-row` als eigene obere Zeile. Dadurch entsteht insbesondere bei „Meine Lokale“ und „Lokale entdecken“ unnötige mobile Höhe. Die übrigen Rollen verwenden den Umschalter bereits innerhalb einer vorhandenen Header-/Aktionsgruppe.

## Inventur

| Nr. | Route/Bereich | Header-Komponente | Sprachbuttonposition vor Fix | Weitere Headeraktionen | Mobile | Desktop |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `/`, `/login`, `/restaurant/login`, `/register`, Passwort-/E-Mail-Auth | `PublicPageShell` / `.public-premium-hero-row` | neben Eyebrow im Hero-Header | kontextabhängig keine | PASS | PASS |
| 2 | `/customer/login`, `/customer/register`, Customer-Callback/E-Mail-Aktion | `AppShell` + Customer-Auth-Card | eigene `.customer-language-row` | Formular-/Zurückaktionen in Card | FAIL | PASS mit unnötiger Zusatzzeile |
| 3 | `/customer/:slug`, `/w/:slug` | `CustomerHeader` | rechts neben Info-Button | Restaurantwechsel, Info | PASS | PASS |
| 4 | `/customer`, `/customer/locations`, `/customer/account` | `CentralCustomerPage` Header | eigene `.customer-language-row` | „Lokale entdecken“ | FAIL | PASS mit unnötiger Zusatzzeile |
| 5 | `/customer/restaurants` | `PartnerRestaurantFinderPage` Header | eigene `.customer-language-row` | Zurück; dekorativer Standortkontext | FAIL | PASS mit unnötiger Zusatzzeile |
| 6 | Restaurant-/Lokalauswahl im Customer Portal | `CustomerHeader` | rechts in Restaurantkopf | Dropdown, Info | PASS | PASS |
| 7 | Customer Einlösen / persönlicher QR im Restaurantportal | `CustomerHeader` | rechts in Restaurantkopf | Restaurantwechsel, Info | PASS | PASS |
| 8 | `/customer/:slug/offers` | `CustomerOffersPage` Header | eigene `.customer-language-row` | Zurück | FAIL | PASS mit unnötiger Zusatzzeile |
| 9 | Referral und Customer-Restaurantzugang | `AppShell` + Auth-/Referral-Card | eigene `.customer-language-row` | Card-Aktionen | FAIL | PASS mit unnötiger Zusatzzeile |
| 10 | `/staff/login`, `/auth/staff-invite` | `PublicPageShell` | bestehende Hero-Aktionszeile | keine zusätzliche Headeraktion | PASS | PASS |
| 11 | `/staff/:slug` | `StaffTablet` Header | neben Menübutton | Menü | PASS | PASS |
| 12 | Owner Login | `PublicPageShell` | bestehende Hero-Aktionszeile | keine zusätzliche Headeraktion | PASS | PASS |
| 13 | Owner Onboarding | `onboarding-account-actions` | neben Profilaktion | Profil | PASS | PASS |
| 14 | Owner Verwaltung | `AdminLayout` / `.topbar-actions` | in rechter Aktionsgruppe | Status, Tenant, Profil/Menü | PASS | PASS |
| 15 | Platform-Admin Login | `PublicPageShell` | bestehende Hero-Aktionszeile | keine zusätzliche Headeraktion | PASS | PASS |
| 16 | Platform Admin / Audit / Health | `.platform-admin-header-actions` | in rechter Aktionsgruppe | Rolle, Zurück, Aktualisieren, Abmelden | PASS | PASS |

## Klassifikation

- HEADER INVENTORY: 16/16
- UNCLASSIFIED HEADERS: 0
- Gemeinsame Ursache der Fehler: genau ein Pfad (`AppShell` ohne integrierten Header).
- Gemeinsame bereits konforme Komponente: `LanguageSelector` mit bestehendem nativen Select, Persistenz, sieben Sprachcodes und lokalisiertem zugänglichem Namen.

## Eingriffsgrenze

Der Fix darf nur die Positionierung des vorhandenen `LanguageSelector` ändern. Navigation, Zielrouten, Spracheinstellung, Persistenz, Übersetzungen, Rollen, Auth, Businesslogik, Bottom Navigation und Seiteninhalt bleiben unverändert. Customer Home behält den bereits gesperrten `CustomerHeader` unverändert.
