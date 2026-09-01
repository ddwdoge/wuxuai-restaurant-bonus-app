# Owner-Dashboard: Dynamischer nächster Schritt

Datum: 2026-08-03

## Ursache

`AdminDashboard` renderte die serverseitige Legal Readiness unabhängig vom
Status dauerhaft als große Karte. Dadurch blieb auch der grüne Erfolgsstatus
nach dem Onboarding bei jedem Seitenaufruf sichtbar und schob die KPI-Karten
nach unten. Eine benutzer- und restaurantbezogene Gesehen-Infrastruktur war
nicht vorhanden.

## Umsetzung

- Zentrale Resolver-Logik liefert maximal einen priorisierten Hinweis.
- Rote und gelbe Legal-Zustände bleiben dauerhaft sichtbar und nicht schließbar.
- Fehlende Punkte-Einlösung führt direkt zu `/admin/rewards`.
- Danach folgen nur belegbare offene Kernschritte aus bestehenden Datenquellen.
- Tages-PIN und Einlösecode werden nicht als manuell einzurichtende Schritte
  dargestellt, weil sie im bestehenden V1-Flow automatisch und serverseitig
  bereitgestellt werden.
- „Erste Kampagne“ wurde nicht aufgenommen, weil Kampagnen in V1 verboten sind.
- Optionale Logo- und Referral-Hinweise können persistent geschlossen werden.
- Die einmalige Startklar-Meldung verwendet den Schlüssel
  `legal_readiness_completed_v1` und wird beim ersten Anzeigen persistent als
  gesehen markiert.
- Wenn kein Hinweis vorhanden ist, rendert React keinen Container und CSS hält
  weder Mindesthöhe noch Placeholder frei.

## Datenquellen

- Restaurant- und Onboardingstatus: Tenant-Kontext
- Legalstatus: `get_restaurant_legal_setup`
- aktive Punkte-Einlösungen und Willkommensgeschenke: tenantgebundene Rewards
- Punktevergabe und Referral: `loyalty_settings`
- QR-Bereitschaft: bestehender Restaurant-Slug
- E-Mail-Bestätigung: geschützte Supabase-Auth-Session
- Logo: bestehendes Restaurant-Branding

Für SMTP-Zustand, tatsächlich heruntergeladenes Starter Kit und einen bereits
durchgeführten Kundenregistrierungstest existiert derzeit kein belastbarer,
restaurantbezogener Statusvertrag. Diese Schritte werden deshalb nicht aus
Clientannahmen erzeugt. E-Mail-Bestätigung und technische QR-Bereitschaft werden
nur aus den vorhandenen sicheren Quellen abgeleitet.

## Migration und Sicherheit

Migration: `20260803006000_owner_dashboard_notice_views.sql`

Die additive Tabelle speichert nur `restaurant_id`, `user_id`, `notice_key` und
`seen_at`. RLS bindet Select und Insert an `auth.uid()` sowie
`is_restaurant_admin(restaurant_id)`. `anon` erhält keine Rechte; für
`authenticated` werden nur Select und Insert gewährt. Es gibt keine
`SECURITY DEFINER`-Funktion und keine Änderung bestehender RLS-Policies.

Die Migration wurde in diesem Auftrag nicht auf Staging oder Production
angewendet. Der Staging-Dry-Run war erfolgreich und würde in der vorhandenen
Reihenfolge die bereits offenen Migrationen `04000`, `05000` und anschließend
`06000` anwenden.

## Geänderte Bereiche

- Owner-Dashboard und Premium-CSS
- zentraler Next-Step-Resolver
- tenantgebundener Notice-/Setup-Service
- additive RLS-Migration
- Resolver-, Persistenz- und Regressionstests
- Engineering-Bible-Ergänzungen

## Nicht geändert

- Dashboard-KPI-Berechnung
- Legal Center und Legal Readiness RPC
- Punkte-, Tages-PIN- und Einlöselogik
- Customer-, Staff- und Plattformportal
- bestehende Reward- oder Onboarding-Geschäftslogik

## Prüfung

- Desktop: responsive CSS und Komponentenstruktur geprüft; kein authentifizierter Live-Screenshot
- Tablet: responsive CSS und Komponentenstruktur geprüft; kein authentifizierter Live-Screenshot
- Mobile 390 px: einspaltiger CTA, 44-Pixel-Touchflächen und fehlende Mindesthöhe automatisiert geprüft
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bereits bestehende Warnungen
- Tests: 570/570 erfolgreich
- Build: erfolgreich
- Staging-Flow: nicht geprüft, da Migration nicht angewendet

## Offene Risiken

- Die einmalige und schließbare Persistenz ist erst nach Anwendung der Migration
  auf Staging live prüfbar. Bis dahin bleiben kritische und verpflichtende
  Setup-Schritte sichtbar; optionale und einmalige Hinweise werden bewusst nicht
  angezeigt.
- SMTP-Health, Starter-Kit-Download und Kundenregistrierungs-Teststatus können
  erst nach einem separat freigegebenen serverseitigen Statusvertrag als
  eigenständige Next Steps aufgenommen werden.

Status: CODE LOCK
