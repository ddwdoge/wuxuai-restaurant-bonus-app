# Willkommensgeschenke Kundenportal Verbindung Fix Report

Datum: 2026-07-08

## Ursache

Die normale Gastregistrierung mit Device-ID rief intern noch die alte Registrierung auf. Diese ältere Funktion konnte aktive Campaign-Starter-Offers ausgeben und dadurch Coupons oder sofort aktive Rewards erzeugen. Das widerspricht der V1-Regel, dass normale Restaurant-QR-Registrierung nur ein gesperrtes Willkommensgeschenk reserviert.

Zusätzlich stellte das Kundenportal gesperrte Willkommensgeschenke wie normale Punkte-Belohnungen dar. Dadurch erschienen Texte wie fehlende Punkte oder rechnerischer Umsatz, obwohl Willkommensgeschenke keine Punkte kosten.

## Geänderte Dateien

- `supabase/migrations/20260708001000_v1_registration_welcome_gift_connection_fix.sql`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/styles.css`

## DB/RPC-Änderungen

Neue Migration:

- `20260708001000_v1_registration_welcome_gift_connection_fix.sql`

Änderung:

- `register_restaurant_customer(text,text,text,date)` erstellt nur Gast, Customer Token und Audit.
- Keine Campaign-Starter-Offers mehr bei normaler Restaurant-QR-Registrierung.
- `register_restaurant_customer(text,text,text,date,text)` hängt danach ausschließlich die neue Willkommensgeschenk-Logik an.
- Rückgabe setzt `campaign` auf `null`.
- Alte Tabellen bleiben bestehen, werden nicht gelöscht.

Akzeptanz:

- Keine neuen `campaign_customer_offers` durch normale Registrierung.
- Kein Coupon durch normale Registrierung.
- Kein sofort aktiver Reward aus alter Campaign-Logik.
- Maximal ein gesperrtes Willkommensgeschenk.

## Kundenportal-Fix

Direkt nach Registrierung:

- Anzeige: "Dein Willkommensgeschenk wurde für dich reserviert."
- Anzeige: "Es wird nach deiner ersten bezahlten Bestellung freigeschaltet."

Bei gesperrtem Willkommensgeschenk:

- Anzeige: "🎁 Dein Willkommensgeschenk wartet auf dich."
- Anzeige: "Nach deiner ersten bezahlten Bestellung wird es freigeschaltet."
- Keine 0-Punkte-Fehlanzeige.
- Keine 0-Euro-Umsatzanzeige.

Bei freigeschaltetem Willkommensgeschenk:

- Anzeige: "🎉 Dein Willkommensgeschenk ist freigeschaltet."
- Anzeige: "Du kannst es bei deinem nächsten Besuch einlösen."

Nach erfolgreicher Punktebuchung wird das Kundenportal neu geladen, damit die Freischaltung sichtbar wird.

## Standardwerte-Fix

Die Standardwerte in `WelcomeGiftsPage` entsprechen jetzt der Bible:

- Kaffee: 4 €
- Getränk: 4 €
- Dessert: 6 €
- Vorspeise: 6 €
- Menü: 16 €
- Hauptspeise: 20 €
- Sushi: 20 €
- Eigene Belohnung: 15 €

## QR Center-Fix

Sichtbarer Button "QR herunterladen" erzeugt jetzt PNG:

- `gaeste-qr.png`
- `bonus-qr.png`

SVG ist nicht mehr der sichtbare Hauptdownload im QR Center.

## Dashboard-Label-Fix

KPI-Label geändert:

- von "Bonus Boost Einladungen"
- zu "Bonus Boost aktiv"

Die Datenquelle wurde nicht geändert.

## Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Die neue Migration wurde lokal erstellt, aber in diesem Schritt nicht gegen Staging gepusht.
- Browser-E2E mit echter Registrierung wurde in diesem Schritt nicht ausgeführt.
- Alte Campaign-Dateien existieren weiterhin im Codebestand, sind aber nicht Teil der sichtbaren V1-UI.

## Status

LOCK
