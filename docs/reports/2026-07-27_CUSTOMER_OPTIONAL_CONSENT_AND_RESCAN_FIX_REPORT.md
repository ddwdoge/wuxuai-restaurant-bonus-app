# Customer Optional Consent und Restaurant-Neuscan Fix

Datum: 27.07.2026

Branch: `codex/v13-legal-maps-hardening`

Ausgangscommit: `c04a939`

## Ursache

Die gemeinsame Registrierungsvalidierung und beide Submit-Handler behandelten
ein ausgefülltes Geburtstagsfeld ohne freiwillige Geburtstagseinwilligung als
Pflichtfehler. Dadurch blieb der Abschluss trotz gültiger Pflichtfelder,
Teilnahmebedingungen und Datenschutzbestätigung blockiert.

Im bestehenden Punkte-sammeln-Einstieg gab es außerdem keine echte Aktion zum
erneuten Scannen eines Restaurant-QR. Der Restaurantwechsel war nur über einen
externen neuen QR-Aufruf möglich.

## Geänderte Dateien

- `package.json`
- `package-lock.json`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/ReferralLanding.tsx`
- `src/modules/customer/components/CustomerRestaurantScanner.tsx`
- `src/modules/customer/customerRegistration.mjs`
- `src/modules/customer/customerRestaurantQr.mjs`
- `src/modules/customer/customerRestaurantQr.d.mts`
- `src/modules/customer/customer-premium.css`
- `tests/customer-mobile-registration-flow.test.mjs`
- `tests/customer-restaurant-rescan.test.mjs`
- `tests/legal-compliance-layer.test.mjs`
- `docs/19_CHANGELOG.md`

## Validierung und Consent

`customerRegistrationCanSubmit` verlangt weiterhin:

- geladenen Legal-Vertrag,
- gültigen Vornamen,
- gültige Telefonnummer,
- akzeptierte Teilnahmebedingungen,
- bestätigte Datenschutzkenntnisnahme.

Geburtstagsverarbeitung, Push-, SMS- und E-Mail-Marketing bleiben optional und
standardmäßig `false`. Die Restaurant- und Referral-Registrierung verwenden
dieselbe Validierung. Ein vorhandenes Geburtstagsdatum wird vom bestehenden
serverseitigen Vertrag nur gespeichert, wenn die freiwillige
Geburtstagsverarbeitung aktiv bestätigt wurde. Ohne Kanal-Einwilligung bleibt
Marketing serverseitig blockiert.

Ein realer Staging-Registrierungsdurchlauf mit synthetischem Testkunden wurde
ohne freiwillige Einwilligungen erfolgreich abgeschlossen. Es wurden keine
Zugangstoken oder personenbezogenen Testwerte dokumentiert.

## Restaurant-Neuscan

Der Customer-Sammel-Flow besitzt jetzt die sekundäre Aktion
`Anderes Restaurant scannen`. Der neue Owner-unabhängige Customer-Scanner:

- verwendet die Gerätekamera über ZXing,
- bevorzugt die rückseitige Kamera,
- akzeptiert nur absolute HTTP(S)-Links der aktuellen oder konfigurierten
  öffentlichen App-Origin,
- akzeptiert ausschließlich bestehende `/w/:slug`- und
  `/customer/:slug`-Restaurantpfade,
- verwirft Query-Parameter einschließlich fremder Kundentoken,
- setzt Bon-Stufe, Tages-PIN und lokales Buchungsergebnis vor dem Wechsel
  zurück,
- navigiert nach gültigem Scan auf den neuen `/w/:slug`-Kontext,
- startet bei ungültigem Scan weder Fallback noch Punktebuchung.

Fehlertext:

`Dieser QR-Code konnte keinem Restaurant zugeordnet werden.`

Aktionen:

- `Erneut scannen`
- `Abbrechen`

Abbrechen führt bewusst nach `/customer`. Dadurch bleibt kein zuvor erkanntes
Restaurant stillschweigend aktiv. Kundenzugänge bleiben weiterhin durch die
bestehende Token-Speicherung je Restaurant getrennt.

## QR-Kontext A nach B

Automatisierte Verhaltenstests bestätigen getrennte Zielpfade für Restaurant A
und B sowie das Entfernen von Token- und Reward-Querydaten. Im lokalen Browser
wurde Restaurant B ohne Daten von A geladen und beim erneuten Öffnen von A das
bestehende restaurantbezogene Kundenkonto wiedererkannt. Kein neues
Kundenkonto wurde dabei erzeugt.

Die vorhandenen Regressionstests bestätigen weiterhin:

- URL-Slug bleibt einzige Restaurantquelle,
- URL-Token gewinnt vor lokalem Token,
- Browser-History und Reload verwenden den aktuellen URL-Kontext,
- Punkte-RPC bindet Kundentoken und Kunde serverseitig an das URL-Restaurant,
- aktive Einlösungen bleiben restaurant- und tokenbezogen.

## Mobile und Accessibility

Geprüft im lokalen Browser:

- 390 px: kein horizontaler Overflow,
- 430 px: `scrollWidth` entspricht `innerWidth`,
- Scan-Aktion: 44 px Höhe,
- Abbrechen-Aktion: 46 px Höhe,
- Scanner-Drawer bei 430 px vollständig innerhalb des Viewports,
- sichtbare Fokuszustände,
- native Button-Tastaturbedienung,
- Status- und Fehlerausgabe über Live-Region,
- Browserkonsole: 0 Fehler.

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 184/184 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Migration: keine
- RLS/Security: nicht verändert
- Punkte- und Rewardlogik: nicht verändert
- Owner-, Staff- und Plattformportal: nicht verändert

## Offene physische Tests

Nicht in dieser lokalen Umgebung verifizierbar und deshalb noch offen:

- echter QR-Kamerawechsel A nach B auf einem physischen iPhone,
- Apple-Kamera-App nach Safari,
- Safari BFCache mit Zurück/Vorwärts auf dem Gerät,
- Kamera zunächst verweigern und später in Safari erlauben.

Die Kamera-Fehlerpfade und BFCache-/URL-Verträge sind automatisiert geprüft,
ersetzen aber keinen physischen Gerätetest.

## Status

**CHANGES_REQUIRED** - Code, Staging-Registrierung, Browser-Responsive-Test,
Tests und Build sind erfolgreich. Für eine vollständige mobile Freigabe fehlt
noch der ausdrücklich geforderte physische iPhone-Safari-Kameratest.
