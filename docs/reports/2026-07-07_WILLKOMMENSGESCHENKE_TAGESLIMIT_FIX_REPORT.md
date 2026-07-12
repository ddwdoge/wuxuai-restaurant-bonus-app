# Willkommensgeschenke Tageslimit Fix Report

Datum: 2026-07-07

## Aufgabe

Restaurant Portal bereinigen und Willkommensgeschenke wirtschaftlich absichern.

## Geänderte Bereiche

- Aktionen aus sichtbarem V1-Routing entfernt.
- Aktionen aus QR Center und Kundenportal entfernt.
- Dashboard von interner Aktionen-KPI-Abhängigkeit gelöst.
- Willkommensgeschenke bleiben eigener Bereich im Restaurant Portal.
- Willkommensgeschenk-Zuteilung serverseitig gehärtet.
- Dokumentation für Smart Reward Engine, Gast-Flow, CTO-Entscheidungen und Changelog aktualisiert.

## Entfernte Aktionen

- Öffentliche Route `/c/:restaurantSlug/:campaignSlug` entfernt.
- Public Campaign Landing wird nicht mehr im App-Routing geladen.
- QR Center zeigt keine Aktions-QR mehr.
- Kundenportal zeigt keine Angebots-/Aktionskarte mehr.
- Dashboard nutzt keine Campaign-KPI mehr für neue Mitglieder.

Hinweis: Die alte Campaign-Seite liegt noch im Codebestand, ist aber nicht mehr geroutet oder sichtbar. Datenbanktabellen wurden bewusst nicht gelöscht.

## Dashboard-Anpassung

Das Dashboard bleibt fokussiert auf:

- Neue Mitglieder heute
- Vergebene Bonuspunkte heute
- Eingelöste Belohnungen
- Bonus Boost Einladungen
- Wiederkehrende Gäste
- Schnellzugriffe: QR Center, Belohnungen, Gäste, Mitarbeiter
- Heute für dich

Der Button "Neue Aktion starten" ist nicht vorhanden.

## Willkommensgeschenke

Willkommensgeschenke bleiben getrennt von Punkte-Belohnungen.

Neue Regel:

- Nur normale Erstanmeldung über Restaurant-QR erhält ein zufälliges Willkommensgeschenk.
- Freunde-Einladungen erhalten kein Willkommensgeschenk.
- Willkommensgeschenk wird zuerst gesperrt zugeteilt.
- Freischaltung erfolgt erst nach erster erfolgreicher Punktebuchung.
- Einlösung wird erst ab einem späteren Besuch erlaubt.

## Zufallslogik

Die Auswahl läuft serverseitig gewichtet:

- Kaffee: 25 Prozent
- Getränk: 25 Prozent
- Dessert: 20 Prozent
- Vorspeise: 18 Prozent
- Menü: 5 Prozent
- Sushi: 3 Prozent
- Hauptspeise: 2 Prozent
- Eigene Belohnung: 2 Prozent

Wenn eine Kategorie nicht aktiv ist oder ihr Tageslimit erreicht hat, wird sie übersprungen. Die Wahrscheinlichkeit wird auf die übrigen aktiven Kategorien neu verteilt.

## Tageslimits V1

- Gratis Menü: maximal 3 Vergaben pro Tag
- Gratis Hauptspeise: maximal 3 Vergaben pro Tag
- Alle anderen Kategorien: kein Tageslimit in V1

## Migration

Neue Migration:

- `supabase/migrations/20260707002000_welcome_gift_daily_limits.sql`

Enthält:

- Status `locked` für `customer_rewards`
- `unlocked_at` für Willkommensgeschenk-Freischaltung
- gewichtete Auswahlfunktion
- Tageslimit-Funktion
- sichere Zuteilung nur bei normaler Restaurant-QR-Registrierung
- Freischaltung nach erster Punktebuchung
- Redemption-Schutz für gesperrte oder am selben Tag freigeschaltete Willkommensgeschenke
- Audit-Logs für Zuteilung und Freischaltung

Die Migration wurde lokal erstellt, aber nicht gegen Staging ausgeführt.

## Nicht Gebaut

- Keine Aktionen
- Keine Kampagnen-UI
- Keine KI
- Kein POS
- Kein SMS/WhatsApp
- Keine V2-Wochenplanung
- Keine neue Produktlogik

## Selbstprüfung

Durchgeführt:

- Aktive Routen auf `/admin/campaigns` geprüft.
- Dashboard auf alte Campaign-KPI-Abhängigkeit geprüft.
- QR Center und Kundenportal auf sichtbare Aktionen geprüft.
- Dokumentation auf neue Tageslimit-Regel aktualisiert.
- Build ausgeführt.

## Build Ergebnis

`npm run build` erfolgreich.

## Offene Risiken

- Die neue Migration muss noch gegen Supabase Staging angewendet und mit echten RPC-Aufrufen validiert werden.
- Legacy-Dateien für Campaigns sind weiterhin im Repository vorhanden, aber nicht sichtbar geroutet.

## Status

LOCK
