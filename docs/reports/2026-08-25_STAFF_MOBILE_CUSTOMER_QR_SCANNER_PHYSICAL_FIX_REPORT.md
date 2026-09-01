# Staff Mobile Customer QR Scanner – Physical iPhone Fix

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `ed608d96ecb0f9defbb69719b505a75e6c91f5df`

## Ursache

Der bisherige Staff-Scanner öffnete die iPhone-Kamera korrekt, decodierte den
Videoframe aber ausschließlich über `window.BarcodeDetector`. Auf dem realen
iPhone Safari entstand dadurch trotz aktiver Kamera und sichtbarem QR kein
Decode-Event. Die bestehende Anwendung enthielt bereits einen erprobten
ZXing-Scanner im Customer-Restaurantwechsel, der Staff-Flow verwendete ihn
jedoch nicht.

Bewiesene Fehlerstufe des ursprünglichen Builds: **B – Decoder liefert keinen
Wert**.

## Geänderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/loyalty/customerPointsQr.mjs`
- `src/modules/loyalty/customerPointsQr.d.mts`
- `src/modules/loyalty/loyaltyService.ts`
- `tests/staff-mobile-customer-qr-scanner.test.mjs`
- `tests/staff-qr-primary-action-ui.test.mjs`
- `tests/restaurant-controlled-points.test.mjs`
- `docs/19_CHANGELOG.md`
- dieser Report

## Änderung

- Der Staff-Scanner verwendet `BrowserQRCodeReader.decodeFromConstraints` aus
  der bereits installierten Bibliothek `@zxing/browser`.
- Kameraeinstellung: Rückkamera über `facingMode: environment`, `autoPlay`,
  `muted` und `playsInline`.
- ZXing liest den vollständigen Videoframe. Es existiert kein abweichender
  versteckter Crop und kein Canvas mit falschen Abmessungen.
- Ein Single-Scan-Guard stoppt Decoder und Kamera nach dem ersten gültigen
  Treffer und verhindert doppelte Verarbeitung.
- Nicht passende QR-Werte lassen den Scanner aktiv und zeigen einen
  verständlichen Wiederholungszustand; Telefon-, Namens- und Gästecode-Suche
  bleiben als Fallback erhalten.
- Staff und Owner-Modus verwenden weiterhin dieselbe `StaffTablet`-Komponente.
- Der persönliche Punkte-QR verwendet jetzt `OperationalQrCode`: schwarz auf
  weiß, 270 Pixel, Fehlerkorrektur M, vier Module Ruhezone, ohne Logo oder
  Transparenz.
- Erzeugung und Parsing des aktuellen Payloads verwenden denselben zentralen
  Vertrag.
- Die Kundenkarte steht im Staff-Kundenbereich an erster Stelle, gefolgt von
  Schnellsuche/QR-Scan und erst danach dem Punkteformular.
- Ohne ausgewählten Gast oder kurzlebigen QR-Kontext bleibt der Punktebereich
  inaktiv. „Anderen Gast wählen“ löscht nur die aktuelle Auswahl und öffnet die
  gemeinsame Suche.
- Bei manueller Auswahl sind Name und Punktestand sofort sichtbar. Beim
  kurzlebigen Punkte-QR zeigt die Karte sofort den erkannten QR-Kontext; Name,
  Punktestand und 2×-Status erscheinen erst nach der bestehenden serverseitigen
  Punkte-Vorschau. Der QR enthält diese Daten absichtlich nicht, und es wurde
  kein neuer Identitäts-RPC eingeführt.

## Payload und Sicherheit

Sichere Struktur:

```json
{"type":"wuxuai_points_credit","token":"<kurzlebige Referenz>"}
```

Der Report enthält keinen echten Token. Der QR enthält keine Namen,
Telefonnummern, E-Mail-Adressen oder Kundencodes. Hashing, fünfminütige
Gültigkeit, Single Use, serverseitige Restaurantbindung und Punkteberechnung
bleiben im bestehenden Backend unverändert. Ein fremder, ungültiger oder
abgelaufener QR wird neutral als ungültig beziehungsweise nicht zum Restaurant
gehörig angezeigt; direkte Cross-Tenant-Auflösung bleibt unmöglich.

## Was nicht geändert wurde

- Staff-, Owner- und Customer-Authentifizierung
- Tenant-RLS, Grants und RPC-Signaturen
- Tages-PIN und Staff-/Owner-Actor-Attribution
- Punkte-, Referral- und Einlösungslogik
- Datenbank und Migrationen
- Production und Stripe

## Automatisierte Prüfung

- Kunden-QR programmgesteuert gerendert und mit ZXing wieder decodiert: PASS
- Aktueller Payload und achtstelliger Ersatzcode: PASS
- Alte/unpassende Payloadtypen und sechsstellige Einlösecodes: blockiert
- ZXing-Kamera, Rückkamera, Single-Scan und manuelles Fallback: PASS
- Operational-QR-Kontrast und Ruhezone: PASS
- Restaurantbindung und Cross-Tenant-Schutz: bestehende serverseitige Tests PASS
- Tests: 932/932 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS

## Physische Abnahme

Staging-Deployment:

- Cloudflare Worker: `wuxuai-restaurant-bonus-app`
- Aktuelle Version: `45a82137-2c91-4f2d-8413-203763c85e6b`
- Worker-URL: `https://wuxuai-restaurant-bonus-app.dongdongwu4899.workers.dev`
- Staging-Domain: `https://bonus.wuxuaisbi.com`
- Domain liefert den neuen Bundle `StaffTablet-CFUbI0zb.js`: PASS
- Bundle enthält ZXing und keinen aktiven `BarcodeDetector`-Scanner: PASS

Vom ursprünglichen Fehler reproduziert:

- Kamera öffnet: PASS
- Kamerastream sichtbar: PASS
- QR sichtbar im Frame: PASS
- Decode-Event im alten Build: FAIL

Für den neuen Build noch offen:

- denselben QR mit nativer iPhone-Kamera erkennen
- Staff-iPhone scannt Kunden-QR vom Laptop
- Staff-iPhone scannt Kunden-QR vom zweiten Telefon
- Owner-Modus scannt Kunden-QR
- aktueller und neu erzeugter QR desselben Restaurants
- QR eines anderen Restaurants wird sicher blockiert
- Punktebuchung und echte Staff-/Owner-Attribution nach dem Scan
- sinnvolle Abstände und optional gedruckter QR

Diese Punkte dürfen erst nach Deployment des neuen Staging-Builds und echter
Gerätebestätigung auf PASS gesetzt werden.

## Risiken und Status

Die Codeursache ist behoben und die Regression ist grün. Ohne den verpflichtenden
physischen iPhone-Test ist weder Customer QR Mobile Scanner Final Ready noch ein
Staff V1 Final Lock zulässig.

Status: **CODE LOCK – PHYSICAL IPHONE GATE OPEN**
