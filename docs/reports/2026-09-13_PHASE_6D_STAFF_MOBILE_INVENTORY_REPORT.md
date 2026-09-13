# WUXUAI® Bonus – Phase 6D Staff Mobile Inventur

Datum: 2026-09-13
Branch: `codex/v1-phase-6-compact-mobile-ui`
Ausgangs-Commit: `54bab1007d88f860b1774049e5ce13c45a0cb727`
Status: INVENTORY COMPLETE / IMPLEMENTATION VERIFIED

## Ursache

Vor Phase 6D musste der tatsächlich gerenderte Staff-Umfang gegen Router, aktuelle Komponenten und den autoritativen V1-Vertrag abgegrenzt werden. Insbesondere durfte der historische sechsstellige Staff-Einlöseablauf nicht mit dem aktuellen kundeninitiierten 15-Minuten-Präsentationsvertrag vermischt werden.

## Route- und Oberflächeninventur

| Nr. | Route / Zustand | Komponente | Primäre Aktion | Sicherheitsrelevanz | Drawer/Dialog | Responsive / I18n / ARIA |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | `/auth/staff-invite` | `StaffInvitePage` | Einladung mit persönlichem Passwort annehmen | Persönliche Authentifizierung; keine Rollenautorität aus Metadaten | Keine Staff-Drawer | Öffentliche Auth-Fläche; sieben Sprachen über bestehendes I18n; Feldlabels und Fehler erforderlich |
| 2 | `/staff/login` | `StaffLoginPage` | Persönlich anmelden | Persönliche Sitzung; Restaurant- und Rollenprüfung folgt serverseitig | Keine Staff-Drawer | Öffentliche Auth-Fläche; mobile Form; sieben Sprachen und ARIA erforderlich |
| 3 | `/staff` | `StaffIndexRoute` | Auf erlaubten Restaurantkontext weiterleiten | Guard/Redirect; kein eigener visueller Screen | Kein Drawer | REDIRECT/GUARD |
| 4 | `/staff/:slug` Ladezustand | `StaffRestaurantRouteGate` | Warten / erneut prüfen | Serverbestätigter Portalzugriff | Kein Drawer | Loading/Error müssen mobil umbrechen und lokalisiert sein |
| 5 | `/staff/:slug` verweigert | `StaffRestaurantRouteGate` | Zur sicheren Staff-Anmeldung | Rolle, Restaurant und Mandantentrennung | Kein Drawer | Keine technischen Details; lokalisierte Meldung |
| 6 | Staff Start | `StaffTablet` Home | Kunden-QR scannen | Einstieg in serverkontrollierte Punktebuchung | Scanner-Drawer | Hauptaktion im ersten Viewport; 44-px-Ziele; sieben Sprachen |
| 7 | Restaurant-/Standortkontext | `StaffTablet` Header + `TenantProvider` | Kontext lesen | Operative Aktion muss im freigegebenen Restaurant bleiben | Mehr-Drawer für Sitzung | Name darf umbrechen/ellipsieren; Rolle und Datum lokalisiert |
| 8 | Prozessübersicht | `StaffTablet` Home / aktiver Vorgang | Aktuellen Schritt lesen oder fortsetzen | Kein Stufensprung; QR → Gast → Betrag → Vorschau → PIN | Aktiver-Vorgang-Leiste | Aktueller Schritt muss textlich erkennbar sein |
| 9 | QR-Scanner | `StaffTablet` + ZXing | Kunden-QR erfassen | 5-Minuten-QR, Einmalverwendung und Tokenvertrag unverändert | Großer Scanner-Drawer, Klasse D | Kamera-/Rahmenzustand, Safe Area, Fokus, kein Token in Logs/Evidenz |
| 10 | Kamera verweigert/nicht verfügbar | `StaffTablet` Scannerfehler | Kamera erneut versuchen oder manuell suchen | Keine Umgehung der QR-/Rollenprüfung | Scanner-Drawer | Feldnaher Fehler, Retry erreichbar, Screenreader-Alert |
| 11 | Manuelle Alternative | `StaffTablet` Kundensuche | Gast bzw. gültigen Ersatz-/Kundencode suchen | Serverseitige Auflösung; kein freier Punktezugang | Scanner-Drawer oder Staff-Suche | Keine sechsstellige Einlösecode-Reaktivierung; lange Treffer umbrechen |
| 12 | Kundenerkennung/-status | `StaffTablet` Customer Context | Erkannten Gast bestätigen / anderen wählen | Korrekte Restaurant-Mitgliedschaft serverseitig | Scanner-Drawer | Name, aktueller Punktestand und Status vor Betrag sichtbar |
| 13 | Bonusberechnungsbetrag | `StaffTablet` Amount Form | Serverseitige Vorschau anfordern | Limits, Rundung und Berechnung bleiben serverseitig | Klasse-B-Scanner-/Formular-Drawer | Dezimaltastatur, lokaler Wertebereich, Aktion bei Keyboard sichtbar |
| 14 | Punktevorschau | `StaffTablet` Preview | Mit Tages-PIN fortfahren | Serverergebnis, kein clientseitiges Vertrauen | Scanner-Drawer | Basis, Bonus, Ergebnis und Warnung kompakt sichtbar |
| 15 | 4-stellige Tages-PIN | `StaffTablet` PIN Form | Punktebuchung bestätigen | Exakt vierstellig, automatisch erzeugt, servergeprüft; Fehlversuchs-/Tageslimits unverändert | Klasse-B-PIN-Sheet | VisualViewport, Safe Area, Fokusfalle, primäre Aktion volle Breite |
| 16 | Punktebestätigung | `StaffTablet` Feedback | Fertig / nächsten Gast scannen | Idempotenz und doppelte Buchung serverseitig | PIN-/Scanner-Drawer | Ergebnis bleibt bis explizitem Abschluss sichtbar |
| 17 | Blockiert/ungültig/abgelaufen | `classifyPointsActionError` + Feedback | Anderen Gast wählen / schließen / erneut versuchen | Kein technischer Fehlertext; falscher/abgelaufener PIN und QR getrennt | PIN-/Scanner-Drawer | Alert, Feldbezug, keine Secrets |
| 18 | Geschenk-/Prämieneinlösung | Kein aktiver Staff-Eingabeflow; read-only Tages-KPI | Kundenpräsentation visuell prüfen | Aktueller Vertrag: 15-Minuten-Präsentation, keine Staff-Codeeingabe | Kein eigener Staff-Drawer | SHARED/CONTRACTUAL: Customer-Präsentation; keine neue Staff-Logik |
| 19 | Erfolg/Fehler/Loading/Retry | `StaffTablet` Statuskarten und Drawer-Feedback | Fortsetzen, erneut versuchen oder sicher beenden | Kein stilles Wiederholen schreibender Requests | Mehrere bestehende Drawerzustände | Text + Symbol, nicht nur Farbe; Fokus auf Meldung |
| 20 | Minimieren/Abbrechen/Ersetzen | `StaffTablet` Active Task + Confirm Drawers | Vorgang behalten, minimieren oder kontrolliert abbrechen | Eingaben nicht unkontrolliert verwerfen; nur ein aktiver Vorgang | Zwei kompakte Bestätigungsdrawer | Hintergrundscroll gesperrt; kritische Dismiss-Regeln erforderlich |
| 21 | Tages-PIN-Anzeige | `StaffTablet` PIN Card + Detail Drawer | PIN lesen / Detail schließen | Nur berechtigte Staff-/Operator-Sitzung; keine Speicherung/Logs | Info-Drawer, Klasse A | Vier Stellen, Datum/23:59, lokalisierte ARIA; keine Screenshot-Evidenz mit echter PIN |
| 22 | Mehr/Hilfe/Sitzung | `StaffTablet` More Drawer | Navigation oder Abmelden | Persönliche Sitzung kontrolliert beenden | Info-/Navigation-Drawer | 44-px-Ziele, Fokusfalle und lokalisierte Labels |
| 23 | Bottom Navigation | `StaffTablet` fixed nav | Start/QR/PIN/Suchen/Mehr | Keine neue Berechtigung; nur Ansichtssteuerung | Kein Drawer | Safe Area; Inhalte nicht verdecken; 320–768 px |

## Klassifikation

- ROUTER ENTRIES: 4/4 klassifiziert.
- VISUAL ROUTES: 3 (`/auth/staff-invite`, `/staff/login`, `/staff/:slug`).
- REDIRECT/GUARD: 1 (`/staff`).
- OPERATIVE ZUSTÄNDE: 20/20 klassifiziert.
- UNCLASSIFIED STAFF ROUTES: 0.
- UNCLASSIFIED STAFF DRAWERS: 0.

## Vertragliche Abgrenzung

Die Klassen `.staff-redemption-*` und `.staff-code-inputs` sind im aktuellen `staff-premium.css` vorhanden, werden aber von keinem aktuellen React-Staff-Screen referenziert. Sie sind historische, nicht gerenderte Styles. Sie werden in Phase 6D weder reaktiviert noch als Beleg für einen Staff-Einlösecode verwendet. Maßgeblich bleibt der aktuelle 15-Minuten-Präsentationsvertrag aus `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`.

Ein manueller Kundensuchweg existiert. Ein separater aktiver sechsstelliger Ersatz-/Einlösecode-Flow existiert im aktuellen Staff-Produkt nicht und wird nicht erfunden.

## Bereits konform / umgesetzte Restarbeiten

Bereits vorhanden sind ZXing-Kameraerfassung, serverseitige Vorschau und Bestätigung, vierstelliges PIN-Feld, VisualViewport-Anpassung, Focus Trap, Focus Return, Body-Scroll-Lock, Safe-Area-Padding, aktive Vorgangsminimierung und explizite Abbruchbestätigungen.

Umgesetzte Phase-6D-Restarbeiten:

1. kompakter, textlich eindeutiger Fünf-Schritt-Überblick;
2. sichtbare Kamera-Retry-Aktion;
3. Client-Formular erst bei exakt vier PIN-Ziffern aktivieren, ohne Serververtrag zu verändern;
4. kritische PIN-/Abbruchdrawer gegen Escape-/Overlay-Dismiss absichern;
5. Scanner-Drawer inhaltsgetrieben statt unnötig starr hoch, Kameraansicht weiterhin ausreichend groß;
6. Staff-Systemtexte, ARIA, Datum und dynamische Fehler in allen sieben Sprachen explizit über das bestehende I18n-System führen;
7. responsive Regressionen bei 320/360/375/390/430/768 und Desktop prüfen.

Zusätzlich verhindert die UI bereits vor dem bestehenden Serververtrag Requests
für leere, negative, ungültige oder außerhalb des vorhandenen Limits liegende
Beträge. Die Bestätigungsübersicht zeigt den bezahlten Betrag, den erkannten
Gast und die serverseitig berechneten Punkte. Betrag und PIN nutzen die
dynamische Viewporthöhe, damit Feld und Hauptaktion bei geöffneter Tastatur
erreichbar bleiben. Serverseitige Limits, Rundung, Punkteberechnung und
Bestätigung wurden nicht verändert.

## Automatisierte Verifikation vor Staging

- Focused Staff/Operator Tests: 205/205 PASS.
- Security Contracts: 62/62 PASS.
- Full Tests: 1744/1744 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 8 vorbestehende Warnungen.
- Build mit der öffentlich ausgelieferten Staging-Konfiguration: PASS.
- Secret Scan der vorgesehenen Commitdateien: PASS.
- Git Diff Check: PASS.
- Migration History: 149/149; 0 offen; keine neue Migration.

## Was nicht geändert wird

Keine Auth-, Rollen-, RLS-, Mandanten-, QR-, PIN-, Punkte-, Geschenk-, Einlöse-, API-, Datenbank-, Preis-, Stripe-, Country- oder Production-Logik. Keine Migration. Keine realen Punkte- oder Einlösevorgänge.
