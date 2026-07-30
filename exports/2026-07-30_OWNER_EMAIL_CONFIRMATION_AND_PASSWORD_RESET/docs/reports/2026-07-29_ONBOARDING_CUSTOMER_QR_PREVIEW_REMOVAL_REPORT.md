# Onboarding Customer QR Preview Removal

Datum: 29.07.2026  
Branch: `codex/v13-legal-maps-hardening`

## Ursache

Der Onboarding-Schritt „Aussehen“ enthielt bereits echte Restaurant- und
Bonus-QR-Codes sowie die Aktion „Als Gast ansehen“. Diese Aktion öffnete direkt
`/customer/<restaurant-slug>`, obwohl Onboarding, Legal Readiness und
Programmfreigabe noch nicht abgeschlossen sein mussten.

## Geänderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/styles.css`
- `tests/onboarding-customer-qr-preview-removal.test.mjs`

## Änderung

- Die komplette rechte Gast-Testfläche wurde aus „Aussehen“ entfernt.
- Restaurant-QR, Mein-Bonus-QR und „Als Gast ansehen“ existieren dort nicht
  mehr.
- Der direkte `window.open`-Handler zum Kundenportal wurde entfernt.
- Die Bonuskarten-Vorschau nutzt eine zentrierte, responsive Einzelspalte bis
  `680px` Breite.
- „Bonus öffnen“ ist ein rein visuelles, nicht fokussierbares und nicht
  klickbares Vorschau-Element ohne Link oder Navigation.
- Logo, Restaurantname, Punkteanzeige, Markenfarbe und Akzentfarbe bleiben in
  der Vorschau erhalten.

## Unverändert

- Die echten QR-Codes bleiben im Restaurant Starter Kit erhalten.
- Starter-Kit-Download und QR-Code-Bereich wurden nicht verändert.
- Onboarding-, Kunden-, Punkte-, Legal- und Freigabelogik wurden nicht
  verändert.
- Keine Datenbank-, RPC- oder RLS-Änderung.

## Responsive

Die Vorschau besitzt keine leere zweite Spalte mehr, ist durch `minmax(0,
680px)`, `width: 100%` und `box-sizing: border-box` auf Desktop, Tablet und
Mobile begrenzt und zentriert. Die bestehende Mobile-Einzelspaltenregel bleibt
kompatibel.

## Tests

Neue Regressionstests prüfen:

- keine Kunden-QRs im Aussehen-Schritt,
- kein Text „Als Gast ansehen“,
- kein Link oder Handler zum Kundenportal,
- rein visueller Beispielbutton,
- zentrierte responsive Vorschau,
- Starter-Kit-QRs und Download weiterhin vorhanden.

Ergebnis:

- gezielte Tests: 4 von 4 erfolgreich
- vollständige Testsuite: 319 von 319 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich

## Nicht durchgeführt

- Kein Commit
- Kein Push
- Kein Merge
- Kein Deployment
- Keine Migration

## Status

`READY_FOR_VISUAL_REVIEW`
