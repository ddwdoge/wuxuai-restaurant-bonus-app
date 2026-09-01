# WUXUAI Bonus V1 - Geschenk-Einloesung Produktkonflikt

Datum: 2026-08-03  
Branch: `dev`  
Ausgangscommit: `f24eb7f195d9d196ade6997b638ed614e7741202`

## Ursache

Der angeforderte Ablauf soll ein Geschenk nach einer rein kundenseitig gestarteten
15-Minuten-Anzeige automatisch als eingelöst markieren. Damit entfallen der
sechsstellige Einloesecode und die serverseitige Mitarbeiterbestaetigung.

Dieser Ablauf widerspricht dem aktuell als `FIX / V1` und ausdruecklich vorrangig
markierten Produkt- und Sicherheitsvertrag:

- `docs/05_CUSTOMER_PORTAL.md`: Nach der Kundenbestaetigung erzeugt der Server
  einen einmaligen sechsstelligen Code mit 15 Minuten Gueltigkeit.
- `docs/06_STAFF_PORTAL.md`: Das Restaurantpersonal prueft den Code
  serverseitig; der Code wird erst bei erfolgreicher Verwendung verbraucht.
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`: Die CTO-Entscheidung vom
  2026-07-14 hat Vorrang vor aelteren Direkt-Einloesungsbeschreibungen.
- `docs/17_CTO_ENTSCHEIDUNGEN.md`: Willkommens-, Geburtstags- und
  Punkteeinloesungen verwenden den einmaligen sechsstelligen Code und eine
  Mitarbeiterbestaetigung ohne PIN.

Nach `AGENTS.md` hat die Engineering Bible Vorrang vor einer einzelnen Aufgabe.
Bei einem Widerspruch darf der bestehende Vertrag nicht eigenmaechtig ersetzt
werden.

## Bestehender technischer Vertrag

Der aktuelle Code folgt der Engineering Bible:

- `start_customer_redemption` prueft Restaurant, Kunde, Geschenkstatus und
  Idempotenz serverseitig, setzt Geschenke auf `redemption_started` und erzeugt
  einen gehasht gespeicherten sechsstelligen Code.
- `consume_redemption_code` prueft Restaurant und Staff-/Owner-Berechtigung,
  sperrt abgelaufene oder bereits verwendete Codes und markiert Code und
  Geschenk atomar als eingeloest.
- `expire_redemption_codes` markiert nicht verwendete Codes als abgelaufen. Ein
  reiner Zeitablauf wird nicht als erfolgreiche Einloesung verbucht.
- Das Kundenportal stellt Code, Countdown und serverseitig restaurierten Status
  dar; das Mitarbeiterportal prueft und verbraucht den Code.

## Warum der neue Ablauf nicht minimal-invasiv ist

Die automatische Verbuchung nach 15 Minuten wuerde fachlich behaupten, dass das
Restaurant das Geschenk ausgegeben hat, obwohl keine serverseitige
Restaurantbestaetigung vorliegt. Animation, aktuelle Uhrzeit und wechselnder
Sichtcode erschweren Screenshots, belegen aber keine Ausgabe. Der Umbau wuerde
ausserdem Staff-Flow, Audit-Semantik, Statusmodell, Ablaufbehandlung und bestehende
Regressionstests gleichzeitig veraendern.

## Geaenderte Dateien

- Nur dieser Konfliktbericht.

## Was wurde nicht geaendert

- Keine Customer-, Staff- oder Owner-Komponente.
- Keine Einloese-, Reward- oder Geschenklogik.
- Keine Migration, RPC, RLS-Policy oder Berechtigung.
- Kein bestehender Einloesecode- oder Auditvertrag.

## Technische Pruefung

- Typecheck: erfolgreich.
- Lint: 0 Fehler, 6 bestehende Warnungen.
- Tests: 570 von 570 erfolgreich.
- Build: erfolgreich.
- `git diff --check`: erfolgreich.

Die Pruefung bestaetigt den stabilen Ausgangsstand. Sie ist keine fachliche
Freigabe fuer den widerspruechlichen neuen Einloeseablauf.

## Erforderliche Freigabe vor einer Umsetzung

Vor einer Umsetzung muss die Engineering Bible ausdruecklich und konsistent
superseded werden. Mindestens `docs/05_CUSTOMER_PORTAL.md`,
`docs/06_STAFF_PORTAL.md`, `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md` und
`docs/17_CTO_ENTSCHEIDUNGEN.md` muessen denselben neuen Vertrag festlegen.
Zusaetzlich ist eine ausdrueckliche Security-/Audit-Entscheidung erforderlich,
ob Zeitablauf ohne Restaurantbestaetigung als `redeemed` gelten darf.

## Risiken

- Ohne Mitarbeiterbestaetigung kann eine gestartete, aber nicht ausgegebene
  Leistung als eingeloest verbucht werden.
- Ein bewegtes Browserbild ist kein serverseitiger Ausgabenachweis.
- Der neue Ablauf wuerde vorhandene Staff- und Audit-Auswertungen semantisch
  brechen, wenn diese weiterhin eine bestaetigte Ausgabe erwarten.

## Status

`NOT READY` - verbindlicher Produkt- und Sicherheitskonflikt.
