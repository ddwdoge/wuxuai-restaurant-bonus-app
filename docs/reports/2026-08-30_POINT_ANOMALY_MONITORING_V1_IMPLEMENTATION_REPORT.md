# WUXUAI Bonus V1 - Point Anomaly Monitoring Implementation

Datum: 2026-08-30

## Ursache

Die kanonische 80-Prozent-Erkennung und das Audit Event
`HIGH_POINTS_AMOUNT_REVIEW` bestanden bereits. Dem Owner fehlten jedoch ein
tenantgebundenes Read Model, ein kompakter Dashboard-Hinweis und eine
pruefbare Detaildarstellung.

Der fruehere Auditbericht bewertete die Owner-Attribution zu streng: Die spaeter
angewendete zentrale Funktion `write_audit_event` normalisiert bereits
Owner-/Admin-/Manager-Aktionen auf `admin` und bewahrt die konkrete
Restaurantrolle in den Metadaten. Diese bestehende serverseitige Autoritaet
wird nun unveraendert genutzt.

## Was wurde geaendert

- Einziger Warnvertrag: erfolgreiche Einzelbuchung ab 80 Prozent des
  konfigurierten Maximalbetrags.
- Read-only Owner-Service fuer bestehende `HIGH_POINTS_AMOUNT_REVIEW` Events.
- Kompakte Dashboard-Karte `Ungewoehnlich hoher Buchungsbetrag` mit `Pruefen`.
- Detail-Drawer mit Zeitpunkt, Betrag, Punkten, Gast, Actor, Restaurant und
  gekuerzter Buchungsreferenz.
- Bereits gepruefte Hinweise werden ueber die bestehende
  `owner_dashboard_notice_views`-Struktur je Owner ausgeblendet.
- Kanonischer Produktvertrag und fokussierte Regressionstests wurden ergaenzt.

## Was wurde nicht geaendert

- Keine Punkteberechnung und kein Punktelimit.
- Das harte Limit von zwei erfolgreichen Customer-Buchungen pro lokalem Tag
  bleibt unveraendert.
- Keine Staff-Tages-, Buchungsanzahl- oder Betragswarnung.
- Kein Restaurant-Tageslimit.
- Keine automatische Rueckbuchung oder Sperre.
- Keine Customer-UI-Aenderung.
- Keine Datenbankmigration.

## Sicherheit

- Audit und Punktebuchungen werden mit `restaurant_id` gefiltert und bleiben
  durch bestehende RLS-Policies abgesichert.
- Customer-Namen stammen aus dem bestehenden datenminimierten sicheren
  Customer-RPC.
- Nur `admin` und `staff` werden als zulaessige Warn-Actors dargestellt.
- Die Detailansicht schreibt weder Audit- noch Ledgerdaten.

## Status

## Verifikation

- Gesamttests: `1165/1165 PASS`
- Fokussierte Anomalie-Tests: `7/7 PASS`
- Typecheck: `PASS`
- Lint: `PASS` (`0` Fehler, `7` bestehende Warnungen)
- Build: `PASS` (`2067` Module)
- Responsive Fixture: `320`, `390`, `430`, `768`, `1024`, `1440` ohne
  horizontales Overflow; CTA jeweils `44 px` hoch
- Datenbankmigration: `NONE`
- Development/Test-Deployment: nicht Bestandteil dieser Aufgabe
- Echter Development/Test-Flow: noch offen

## Risiken

Der Dashboard-Flow ist in Code, Komponentenvertrag, Security-Scope und
Responsive Fixture verifiziert. Da kein Deployment und kein echter
Development/Test-Flow beauftragt oder ausgefuehrt wurde, ist gemaess
Repository-Regel kein `FINAL LOCK` zulaessig.

Status: `CODE LOCK`
