# Smart Setup Action Center Report

Datum: 2026-09-01

## Ursache

Der zentrale Resolver gab nach vollstaendig abgeschlossenem Setup weiterhin
immer `operational_new_offer` zurueck. Dadurch blieb `Heute fuer dich`
dauerhaft sichtbar und konnte nach einer erfolgreichen Offer-Veroeffentlichung
erneut zum Offer-Editor fuehren. Gleichzeitig wurde die bestehende
Punkteanomalie als zweite, parallele Dashboard-Karte gerendert. Die
Setup-Bereitschaft fuer Offers war zudem inline statt als explizit getesteter
kanonischer Vertrag implementiert.

## Aktueller Development/Test-Zustand

Die erste Diagnose verwendete versehentlich den historischen Pilot-Slug
`wu-und-xu-group-gmbh`. Dieser Tenant ist nicht der im aktuellen
Founder-Gate geoeffnete Betrieb und darf dessen Setup-Zustand nicht belegen.
Der aktuelle Betrieb ist `WUXUAI Bonus Testbetrieb` mit dem Slug
`wuxuai-bonus`.

Die am 2026-09-01 erneut gelesenen oeffentlichen autoritativen Vertraege
belegen fuer diesen aktuellen Betrieb:

- PUBLICATION COMPLETE: YES. Restaurant und Standort sind aktiv und
  auffindbar, die Adresse und Koordinaten sind vollstaendig; das Legal Center
  meldet `legal_ready = true`, `missing_configuration = false`, ein aktives
  Programm und alle fuenf Pflichtdokumente als veroeffentlicht.
- POINT REDEMPTION COMPLETE: YES. Der Partner-Finder meldet eine aktive
  Nicht-Starter-Punkteeinloesung.
- OFFER SETUP COMPLETE: YES. Vier `PUBLISHED`, aktive und am Prueftag nicht
  abgelaufene Angebote (`kaka`, `tako`, `torte`, `tisch`) sind vorhanden.
- BIRTHDAY COMPLETE: YES. Der authentifizierte Dashboard-Vertrag meldete den
  Geburtstagspool als bereit; der oeffentliche Finder bestaetigt unabhaengig
  den aktiven Starter-Gift-Pool.
- QR COMPLETE: YES. Restaurantstatus `active` und kanonischer Slug
  `wuxuai-bonus` bilden die objektiv erkennbare technische QR-Bereitschaft.
  Ein physischer Drucknachweis wird weiterhin nicht erfunden.
- STAFF COMPLETE: NO. Der bisherige Loader zaehlte eine rohe historische
  `staff_members.active`-Zeile. Der bestehende Owner-Staff-Vertrag liefert
  keinen kanonisch aktiven und damit nutzbaren Staff-Zugang fuer den aktuellen
  Betrieb.
- CURRENT RESOLVER RESULT: `null`, weil der rohe Staff-Zaehler faelschlich
  `staffReady = true` lieferte und damit alle sechs Gates als erfuellt galten.
- EXPECTED RESOLVER RESULT: `setup_staff_access`.
- NEXT RECOMMENDATION: `Mitarbeiterzugang einrichten`.
- HEUTE FUER DICH: VISIBLE, direkt unter dem Dashboard-Kopf, nach Auslieferung
  dieses Fixes. Der physische Founder-Gate bleibt bis zum Deployment offen.

## Geaenderte Dateien

- `src/modules/admin/ownerDashboardSetupStatus.mjs`
- `src/modules/admin/ownerDashboardSetupStatus.d.mts`
- `src/modules/admin/dashboardNoticeService.ts`
- `src/modules/admin/ownerDashboardRecommendation.mjs`
- `src/modules/admin/ownerDashboardRecommendation.d.mts`
- `src/modules/admin/ownerSmartSetupContinuation.mjs`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/admin/admin-premium.css`
- `tests/owner-dashboard-smart-setup-assistant.test.mjs`
- `tests/owner-smart-setup-continuation.test.mjs`
- `tests/dashboard-next-step.test.mjs`
- aktuelle kanonische Dokumentation und dieser Report

## Was wurde geaendert

- Der Offer-Setup-Status verwendet einen zentralen, rein lesenden Vertrag fuer
  `PUBLISHED`, `is_active = true` und ein noch nicht abgelaufenes `valid_to`.
  Zukuenftiger Start, Wochentage und Tageszeiten schliessen Setup nicht wieder
  auf.
- Die permanente Wachstumsempfehlung nach abgeschlossenem Setup wurde
  entfernt.
- `Heute fuer dich` steht bei offenem Setup oder einer Aktion direkt unter dem
  Dashboard-Kopf.
- Eine ungesehene Punkteanomalie erscheint im selben Resolver als genau eine
  Aktion. Kritische Publikations- und Legal-Zustaende bleiben davor.
- Nach erfolgreichem Save laedt der bereits vorhandene Fortsetzungsvertrag den
  Serverzustand neu und berechnet die naechste Empfehlung ohne manuellen
  Refresh.
- Die Staff-Bereitschaft verwendet jetzt denselben tenantgebundenen
  Owner-Staff-RPC wie die Teamverwaltung und akzeptiert ausschliesslich den
  Status `active`; Legacy-, invited-, suspended- und archived-Zustaende sind
  nicht vollstaendig.
- Publikation ist nur vollstaendig, wenn Restaurantstatus, Legal-Freigabe der
  Kundenregistrierung und oeffentliche Discovery-Bereitschaft gemeinsam
  erfuellt sind. QR-Bereitschaft verlangt einen aktiven Restaurantstatus und
  einen gueltigen kanonischen Slug.

## Was wurde nicht geaendert

- Keine Offer-Erstellung und keine Offer-Businesslogik.
- Keine Punkte-, Birthday-Catch-up-, Referral-, Multi-Role-, Legal-, QR- oder
  Tenantlogik.
- Keine RLS-, RPC-, Datenbank- oder Migrationsaenderung.
- Keine Production-Bereitstellung.

## Pruefung

- Fokustests inklusive False-Complete-Regression: 15/15 PASS.
- Gesamttests: 1231/1231 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 7 bereits vorhandene Warnungen ausserhalb des Scopes.
- Build: PASS mit Fail-Closed-Build-Guard und nicht geheimen Testplatzhaltern.
- `git diff --check`: PASS.
- Responsive Browser-Gate: 320, 375, 390, 414 und 430 px PASS.
- Horizontale Ueberbreite: 0 px in allen fuenf Viewports.
- Die Aktionskarte stand in allen fuenf Viewports vor den Kennzahlen und
  vollstaendig innerhalb des ersten 844-px-Viewports.
- CTA-Hoehe: mindestens 140 px bei 375 bis 430 px und 209 px bei 320 px.
- Action-Center-Drawer: Oeffnen PASS, Actor-Anzeige PASS, Schliessen PASS.

## Migration und Sicherheit

- Migration: Keine.
- RLS/Security: Keine Regel, Policy, Grant oder RPC geaendert.
- Tenant-Scope: Setup-, Staff- und Warnungsloader bleiben an die konkrete
  `restaurant_id` und die bestehenden Owner-Berechtigungen gebunden.

## Risiken und Status

Der physische iPhone-Gate bleibt ausschliesslich beim Founder und ist bis dahin
PENDING. Development/Test wurde in dieser Aufgabe nicht deployed.

Status: CODE LOCK nach erfolgreichen technischen Gates; kein FINAL LOCK ohne
Founder-Test.
