# P0-Fix: QR-Restaurantkontext

Datum: 23.07.2026
Branch: `codex/fix-qr-restaurant-context`

## Ursache

React Router verwendete beim Wechsel von `/w/:slug` oder `/customer/:slug` dieselbe
`CustomerPortal`-Instanz weiter. Dadurch blieben Restaurant-, Registrierungs- und
Token-State des vorherigen Restaurants erhalten. Zusätzlich hatte der Token einer
alten Registrierung Vorrang vor einem Token der aktuellen URL. Ein Ladefehler beim
neuen Slug konnte deshalb den alten Kontext sichtbar lassen.

## Geänderte Dateien

- `src/app/App.tsx`
- `src/modules/customer/CustomerPortal.tsx`
- `tests/customer-qr-restaurant-context.test.mjs`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/19_CHANGELOG.md`

## Umsetzung

- Die beiden Kundenrouten verwenden einen gemeinsamen Route-Wrapper mit einem
  Schlüssel aus Routenart und aktuellem URL-Slug.
- Bei QR-Wechsel wird das Portal neu aufgebaut und alter komponentenlokaler State
  vollständig verworfen.
- Der Restaurant-Slug kommt ausschließlich aus `useParams()` der aktuellen URL.
- Ein expliziter URL-Token gewinnt vor Registrierungs- und lokal gespeichertem
  Token.
- Die Punktebuchung verwendet weiterhin `restaurantSlug` und `activeToken` des
  aktuellen URL-Kontexts.

## Server- und Sicherheitsprüfung

Die bestehende RPC `collect_bonus_points_v1` sucht das aktive Restaurant anhand
des übergebenen Slugs und akzeptiert nur einen Token sowie Kunden, deren
`restaurant_id` diesem Restaurant entspricht. Ein Token von Restaurant A kann
daher keine Buchung für Restaurant B auslösen. Es wurden keine RPCs, Migrationen,
RLS-Regeln, Tages-PIN- oder Punkteberechnungen geändert.

## Validierung

- Restaurant A geöffnet: Akakiko Hietzing sichtbar.
- Danach Restaurant B geöffnet: Wuxuai food sichtbar; A vollständig verworfen.
- Browser-Zurück/-Vor: jeweils Restaurant aus der URL sichtbar.
- Refresh auf Restaurant B: Restaurant B bleibt aktiv.
- Ungültiger QR nach Restaurant A: neutrale Fehleransicht, kein alter Restaurantname.
- Mobile Production-Preview bei 390 px: Wechsel und Refresh korrekt, kein
  horizontaler Overflow.
- PWA-Build und Service-Worker-Datei wurden erzeugt; der QR-Wechsel wurde über den
  Production-Preview geprüft.
- Native Mobile-Safari-Geräteprüfung ist in der lokalen Chromium-Testumgebung nicht
  verfügbar. Die URL-/State-Logik ist browserunabhängig und der Safari-kompatible
  390-px-Viewport wurde geprüft.

## Automatisierte Tests

Sieben neue Regressionstests prüfen:

1. Neuaufbau bei geändertem QR-Slug.
2. URL-Slug als einzige Restaurantquelle.
3. URL-Token-Priorität vor lokalem State.
4. Slug-getrennte lokale Tokens.
5. Punktebuchung mit aktuellem URL-Slug.
6. Serverseitige Restaurantbindung von Token und Kunde.
7. Kein Fallback bei ungültigem QR.

Gesamtergebnis: 89 von 89 Tests erfolgreich.

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 8 bereits bestehende Warnungen
- Tests: 89/89 erfolgreich
- Build: erfolgreich
- Migration: keine
- RLS/Security: geprüft, unverändert

## Offene Risiken

- Ein echter Test auf einem physischen Mobile-Safari-Gerät und einer installierten
  PWA bleibt als zusätzliche Geräteabnahme vor Produktion sinnvoll.
- Für einen echten Punktebuchungstest nach Restaurantwechsel werden kontrollierte
  Staging-Tokens und eine gültige Tages-PIN benötigt; die atomare Serverbindung ist
  im bestehenden SQL und durch Regressionstests bestätigt.

## Status

CODE LOCK. Der P0-Codefix, die automatisierten Tests und der lokale Browserflow
sind grün. Ein FINAL LOCK erfordert zusätzlich die physische Mobile-Safari/PWA-
Abnahme und einen vollständigen Staging-Punktebuchungsflow nach Restaurantwechsel.
