# WUXUAI Bonus - Starter Kit Page 3 Staff Collision Final Fix

Datum: 2026-08-28  
Branch: `codex/v1-canonical-recovery`  
Staging Worker Version: `6a199d3e-4073-4812-a351-acae0af77b17`

## Ursache

Die reale Referenzdatei `WUXUAI-Starter-Kit_Kaffee-Konditorei-Baeckerei_2026-08-28 (3).pdf` wurde vollstaendig gerendert und geprueft. Seite 1 und 2 sind sauber. Seite 3 enthaelt noch die alte lange Fassung `Persoenlich anmelden fuer Tages-PIN, Gaestepruefung und Restaurant-Service.`; ihre zweite Zeile wird vom anschliessend gezeichneten weissen QR-Rahmen ueberdeckt.

Zum Zeitpunkt dieser PDF war auf Staging Worker-Version `47b606c6-20be-448f-84b5-4dcacb432d08` aktiv. Diese Version hatte die zuvor bereitgestellte Version ueberschrieben und enthielt noch den alten Text-/QR-Vertrag. Der alte Vertrag positionierte Beschreibung und QR mit unabhaengigen absoluten Y-Werten und reservierte keinen verbindlichen Zwei-Zeilen-Block mit physischem Mindestabstand.

## Geometrie des korrigierten Vertrags

- A6-Canvas: `1240 x 1748 px`, entsprechend `297,64 x 419,53 pt` beziehungsweise `105 x 148 mm`
- Markenblock unten: `314 px` = `26,59 mm`
- Restaurantname oben: `326 px` = `27,60 mm`
- Mitarbeiter-Ueberschrift: `y 378 px`, Blockende `456 px`
- Beschreibung oben: `448 px`
- Beschreibung: maximal `2` Zeilen, `34 px` Zeilenhoehe
- Reservierte Beschreibungshoehe: `68 px` = `16,32 pt` = `5,76 mm`
- Beschreibung unten: `516 px`
- Expliziter Abstand zum QR-Rahmen: `50 px` = `12,00 pt` = `4,23 mm`
- QR-Rahmen oben: abgeleitet bei `566 px`
- QR-Module oben: `610 px`
- QR-Modulgroesse: unveraendert `680 x 680 px`
- Quiet-Zone/Rahmenabstand: unveraendert `44 px`
- Mitarbeiterhinweis: `y 1360 px`
- Footer: `y 1650 px`

Der Page-3-QR beginnt nun nicht mehr aus einer unabhaengigen Konstante. Seine Position wird aus `Beschreibung oben + reservierte Zweizeilenhoehe + 4,23 mm Abstand + Quiet-Zone` abgeleitet. Das Ergebnis bleibt geometrisch bei `y 610 px`; QR-Groesse, Payload und Scanbarkeit bleiben unveraendert.

## Geaenderte Dateien

- `src/shared/lib/starterKitPages.mjs`
- `src/shared/lib/starterKitPages.d.mts`
- `src/modules/admin/pages/QrCenterPage.tsx`
- `tests/starter-kit-premium-print.test.mjs`

## Verifikation

- Referenz-PDF `(3)` mit Poppler gerendert: Seite 1 PASS, Seite 2 PASS, Seite 3 Defekt reproduziert
- Staging-Version `6a199d3e-4073-4812-a351-acae0af77b17` zu 100 Prozent aktiviert
- Staging zeigt nur die kurze Fassung `Anmelden fuer Tages-PIN, Gaestepruefung und Restaurant-Service.`
- Alte `Persoenlich anmelden ...`-Fassung im aktiven DOM: nicht vorhanden
- Staging-Vorschau Beschreibung/QR-Kollision: `false`
- Sichtbarer Abstand in der aktuellen einzeiligen deutschen Vorschau: `7,07 mm`
- Vertraglich reservierter Mindestabstand nach einem vollen Zweizeilenblock: `4,23 mm`
- DE, EN, FR, IT, ES: maximal zwei Zeilen im automatisierten Layouttest
- Langer Restaurantname: gebundene Einzeilen-Darstellung PASS
- Page 1 und Page 2: Geometrie unveraendert

## Qualitaet

- Tests: `1094/1094 PASS`
- Typecheck: PASS
- Lint: PASS, `0` Fehler und `7` bestehende Warnungen ausserhalb dieses Scopes
- Build: PASS
- Migration: NONE
- Businesslogik: unveraendert

## Offener Nachweis

Der automatisierte In-App-Browser kann den programmatisch erzeugten Blob-Download nicht als lokale Datei an die Pruefumgebung uebergeben. Die aktive Staging-Vorschau und der gemeinsame PDF-Vertrag sind korrigiert. Fuer FINAL LOCK muss aus Version `6a199d3e-4073-4812-a351-acae0af77b17` einmal manuell eine neue PDF heruntergeladen und deren Seite 3 geprueft werden.

Status: **CODE LOCK / ACTUAL PDF RECHECK REQUIRED**
