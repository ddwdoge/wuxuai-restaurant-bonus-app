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

Der oeffentliche kanonische Offer-RPC fuer `wu-und-xu-group-gmbh` lieferte am
2026-09-01 genau drei veroeffentlichte und nutzbare Angebote: `test`, `Kopie
von Kopie von Kopie von testte` und `miso`.

- CURRENT OFFER COUNT: 3
- OFFER SETUP COMPLETE: YES
- BIRTHDAY COMPLETE: YES, belegt durch drei aktive branchpassende Rewards im
  Birthday-Pool und den spaeteren Birthday-Catch-up-Live-Gate.
- QR COMPLETE: YES, der aktive Restaurant-Slug und QR-Center-Final-Lock sind
  vorhanden.
- STAFF COMPLETE: YES, der aktive Staff-Zugang und der spaetere
  Staff-/Multi-Role-Live-Gate sind dokumentiert.
- NEXT RECOMMENDATION: NONE, sofern keine ungesehene objektive Aktion vorliegt.
- HEUTE FUER DICH: HIDDEN, sofern keine ungesehene objektive Aktion vorliegt.

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

## Was wurde nicht geaendert

- Keine Offer-Erstellung und keine Offer-Businesslogik.
- Keine Punkte-, Birthday-Catch-up-, Referral-, Multi-Role-, Legal-, QR- oder
  Tenantlogik.
- Keine RLS-, RPC-, Datenbank- oder Migrationsaenderung.
- Keine Production-Bereitstellung.

## Pruefung

- Fokustests: 31/31 PASS.
- Gesamttests: 1229/1229 PASS.
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
- Tenant-Scope: Der bestehende tenantgebundene Setup- und Warnungsloader bleibt
  unveraendert.

## Risiken und Status

Der physische iPhone-Gate bleibt ausschliesslich beim Founder und ist bis dahin
PENDING. Development/Test wurde in dieser Aufgabe nicht deployed.

Status: CODE LOCK nach erfolgreichen technischen Gates; kein FINAL LOCK ohne
Founder-Test.
