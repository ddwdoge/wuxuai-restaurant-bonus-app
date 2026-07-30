# Customer Premium Design Migration Report

Datum: 20.07.2026

## Ursache

Das Kundenportal war funktional, wirkte aber wie eine lange technische
Einzelseite. Information, Punkteeinlösungen, QR und Konto hatten keine klare
mobile Navigation. Einzelne Info- und Einlöseansichten erschienen als eigene
Overlays oder weit unten im Dokument.

## Geänderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/ReferralLanding.tsx`
- `src/modules/customer/components/PremiumCustomerUi.tsx`
- `src/modules/customer/customer-premium.css`
- `tests/customer-premium-design.test.mjs`
- `docs/PREMIUM-DESIGN-MIGRATION.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- gemeinsame Premium-Shell und isolierte Design-Tokens
- vierteilige mobile Kundennavigation
- neue Punkte-, Punkteeinlösungs-, Geschenk- und Kontodarstellung
- stabiler Reward-Bildbereich mit neutralem Icon-Fallback
- gemeinsame Drawer für Information, Einlösebestätigung und Einlösecode
- Premium-Zustände für Laden, Fehler, Leerstand und Erfolg
- Freunde-Einladung und Registrierung optisch vereinheitlicht
- Emoji-Icons aus der eigentlichen Kundenoberfläche entfernt

## Was wurde nicht geändert

- keine Datenbank oder Migration
- keine RLS- oder RPC-Änderung
- keine Authentifizierungs- oder Kundentoken-Änderung
- keine Punkte-, Tages-PIN-, Bonus-Boost-, QR-, Referral- oder Einlöselogik
- keine Änderungen an Restaurant-, Staff- oder Plattform-Portal

## Drawer-Prüfung

- mobiler Drawer: 390 × 844 px
- kein horizontaler Überlauf
- Hintergrundscrollen gesperrt
- Escape schließt
- Fokus kehrt zum Info-Button zurück
- Overlay und sichtbarer Schließen-Button sind zentral implementiert

## Responsive Prüfung

- 390 px: Dokumentbreite 390 px, Kundeninhalt 390 px
- 768 px: Dokumentbreite 768 px, Inhalt maximal 760 px
- 1440 px: Dokumentbreite 1440 px, Inhalt maximal 760 px
- kein horizontaler Überlauf auf allen drei Breiten

## Qualität

- Typecheck: erfolgreich
- Tests: 26/26 erfolgreich
- Build: erfolgreich
- Lint: 0 Fehler, 11 bestehende Warnungen außerhalb dieses Scopes

## Staging-Testdaten

- Projekt: verknüpftes Supabase-Staging-Projekt
- Migration `20260714002000`: lokal und remote vorhanden
- Testrestaurant: `Premium E2E ******`
- Testgast: synthetisch, UI-Kennung `PRE-16******`
- Route: `/customer/premium-e2e-******?token=***`
- keine Produktionsdaten und keine echte PII
- PIN, Token, Telefonnummer und Rohcode nicht dokumentiert

## Registrierter Kundenflow

- Restaurantname und Kontext korrekt geladen
- Gast nach normaler Registrierung als bestehender Kunde erkannt
- Willkommensgeschenk nach erster Punktebuchung freigeschaltet
- aktive Punkteeinlösung inklusive Standardbild sichtbar
- Bottom-Navigation mit Start, Einlösen, Sammeln und Konto vorhanden
- Punktestand vor Buchung: `0`
- Bon-Stufe: `20–30 €`
- erfolgreiche Buchung: `+20 Punkte`
- Punktestand nach Buchung und Reload: `20`
- Doppelklick erzeugte nur eine erfolgreiche Buchung

Negativfälle:

- leerer Betrag: clientseitig verständlich blockiert, kein Request
- unvollständige Tages-PIN: verständlich blockiert
- falsche Tages-PIN: verständlich blockiert
- ungültiger Einlösecode: verständlich blockiert
- verwendeter Einlösecode: serverseitig blockiert und nach UI-Fix korrekt als
  bereits verwendet bezeichnet
- ein separat simulierter Netzwerkausfall und ein lokaler Tageswechsel waren
  mit dem vorhandenen Browser-Testzugang nicht belastbar reproduzierbar

## Punkteeinlösung

- Produkt: `Gratis Kaffee`
- benötigte Punkte: `20`
- vor Einlösung: einlösbar bei `20 Punkten`
- Kundenbestätigung: erfolgreich
- Code: sechs Ziffern, dokumentiert als `*** ***`
- Punkte nach Reservierung: `0`
- Staff-Verbrauch: erfolgreich
- zweite Verwendung desselben Codes: serverseitig blockiert
- Staff-Fehlermapping für strukturierte Supabase-Fehler korrigiert

Produktregel: Normale Punkteeinlösungen bleiben als Katalogangebot sichtbar.
Nach dem Punkteabzug war die Karte bei `0 Punkten` korrekt wieder gesperrt.

## Drawer und Responsive

- 390 px: Dokumentbreite 390 px, kein Überlauf
- 768 px: Dokumentbreite 768 px, kein Überlauf
- 1440 px: Dokumentbreite 1440 px, kein Überlauf
- mobiler Drawer: 390 × 844 px
- Desktop-Drawer: 520 px breit, volle Viewport-Höhe
- Scroll-Lock, Escape, Overlay-Klick und Fokus-Rückgabe erfolgreich
- Bottom-Navigation liegt nicht über dem mobilen Drawer

## Console und Netzwerk

- unerwartete Console Errors: `0`
- zwei bekannte React-Router-v7-Hinweise als Warnungen
- erwartete RPC-Fehler für negative PIN-/Code-Tests wurden kontrolliert
  behandelt
- unerwartete Netzwerkfehler: `0`
- keine sichtbaren RLS-, Auth-, 401-, 403-, 404- oder 500-Fehler im
  erfolgreichen Kundenflow

## Dashboard-Kennzahlen

- Neue Mitglieder heute: `1`, korrekt
- Vergebene Bonuspunkte heute: `20`, korrekt
- Gäste-Liste nach vollständiger Session-Wiederherstellung: genau ein Testgast
- Kunden gesamt: nicht als eigene Dashboard-Kennzahl vorhanden
- Neue Kunden diese Woche: nicht vorhanden
- Heute aktiv: nicht vorhanden
- Eingelöste Punkteeinlösungen blieb `0`, obwohl ein
  `reward_redemption_event` verbraucht wurde; die bestehende KPI zählt diesen
  neuen Einlösepfad nicht

## Nachgewiesene Blocker

1. **KRITISCH – verbrauchter Code bleibt sichtbar:** Nach erfolgreichem
   Staff-Verbrauch und Reload zeigt das Kundenportal den lokal gespeicherten
   Code bis zum Zeitablauf weiter. Der Server lehnt ihn korrekt ab, aber die UI
   behauptet weiterhin, er sei gültig. Eine sichere Lösung benötigt einen
   serverseitigen, customer-token-gebundenen Statusabruf.
2. **MITTEL – unvollständige Dashboard-Kundenstatistik:** `Kunden gesamt`,
   `Neue Kunden diese Woche` und `Heute aktiv` fehlen; die Einlösungs-KPI zählt
   den aktuellen `reward_redemption_events`-Pfad nicht.

## Selektiver KPI-/Redemption-Merge

Die beiden oben beschriebenen Codeprobleme wurden anschließend im Branch
`fix/premium-kpis-redemption` selektiv behoben:

- tokengebundene Serverprüfung für lokal gespeicherte Einlösecodes
- Entfernung des Codes nach bestätigtem Verbrauch oder Ablauf
- serverseitige Restaurant-KPIs mit Restaurant-Zeitzone
- neue Werte für Kunden gesamt, neue Kunden heute/diese Woche und heute aktiv
- finale Geschenk-, Punkte- und Coupon-Einlösungen in `Einlösungen heute`
- durchgängiger Ausschluss markierter Testkunden

Die Referenz-ZIP wurde nicht vollständig übernommen. Insbesondere wurden die
fehlerhafte Einordnung von `redemption_started`, Browser-Zeitberechnung,
fehlende Testkundenfilter und ungefilterte Redemption-Events verworfen.

Migration `20260720003000_dashboard_kpis_and_redemption_status.sql` wurde auf
Staging angewendet. Die öffentliche Status-RPC antwortete nach Schema-Reload
mit HTTP 200 und ohne PII. Der vollständige markierte Testkundenlauf mit
Owner-Dashboard-Vorher-/Nachher-Werten ist noch offen.

## RLS und Migration

- keine RLS- oder Security-Regel verändert
- keine neue Migration erstellt oder angewendet
- bestehende Migration `20260714002000` auf Staging bestätigt

## Offene Risiken

- abgelaufene Tages-PIN und echter Netzwerkausfall wurden nicht separat
  reproduziert
- der aktive Code besitzt noch keinen sicheren öffentlichen Statusabruf für
  das Kundenportal
- Dashboard-Kundenkennzahlen erfüllen die Abschlussanforderung noch nicht

## Status

CODE-SEITIG BEHOBEN / GESAMTFREIGABE NOT READY. Die fünf Korrekturen sind
implementiert und automatisiert geprüft. Für READY fehlt der erneute
vollständige Staging-Test mit markiertem Testkunden und authentifiziertem
Owner-Dashboard.
