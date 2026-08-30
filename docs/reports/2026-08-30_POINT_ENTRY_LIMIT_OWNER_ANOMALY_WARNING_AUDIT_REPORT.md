# WUXUAI Bonus V1 - Point Entry Limit + Owner Anomaly Warning Audit

Datum: 2026-08-30  
Branch: `codex/v1-canonical-recovery`  
Gepruefter HEAD: `bef858ca6ebb3ac94c7f2332510d26d54d4700a7`

## Ergebnis

Die aktive V1-Punktevergabe besitzt bereits mehrere serverseitige Hard Blocks,
eine Staff-seitige Warnung fuer hohe Einzelbetraege und Audit Events. Es gibt
aber keinen festen Maximalwert fuer Punkte pro Buchung und keine kanonischen
Tages-Punkteschwellen fuer Customer, Staff oder Restaurant.

Deshalb wurde kein Owner-Anomaly-System aktiviert. Die Aufgabe verlangt, nicht
vor einer Founder-Entscheidung beliebige Schwellen einzufuehren. Eine
Implementierung waere derzeit ein neuer, nicht freigegebener Produktvertrag.

## Exakte aktuelle Grenzen

| Regel | Aktueller Wert | Klassifikation | Autoritative Quelle |
| --- | --- | --- | --- |
| Maximalpunkte pro Transaktion | Kein fixer Punktewert | NONE als Punkte-Cap | Punkte werden serverseitig aus Betrag, `amount_per_point` und aktivem Boost berechnet: `calculate_points_award_v1` in `20260801001000_shared_points_bonus_engine.sql` |
| Maximaler bonusberechtigter Betrag | Restaurantkonfiguration, Standard EUR 300; erlaubter Bereich EUR 1 bis EUR 1.000 | HARD BLOCK | `points_collection_max_amount_cents` in `20260731001000_restaurant_controlled_points_collection.sql` |
| Maximalpunkte pro Customer/Tag | Kein fixer Punktewert | NONE als Punkte-Cap | Kein Tages-Summenlimit in Punkten vorhanden |
| Erfolgreiche Punktebuchungen pro Customer/Restaurant/lokalem Tag | 2 | HARD BLOCK | `POINTS_DAILY_LIMIT` in `20260731001000_restaurant_controlled_points_collection.sql` und `20260801001000_shared_points_bonus_engine.sql` |
| Maximalpunkte pro Staff/Tag | Kein Limit | NONE | Keine kanonische Staff-Tages-Punkteschwelle vorhanden |
| Maximalpunkte pro Restaurant/Tag | Kein Limit | NONE | Keine kanonische Restaurant-Tages-Punkteschwelle vorhanden |
| Mindestbetrag | EUR 1,00 / 100 Cent | HARD BLOCK | `validate_points_amount_minimum_v1` in `20260802001000_enforce_minimum_points_amount.sql` |
| Hoher Einzelbetrag | Ab 80 Prozent des konfigurierten Maximalbetrags | SOFT WARNING + AUDIT ONLY nach Erfolg | `high_amount_warning` und `HIGH_POINTS_AMOUNT_REVIEW` in den beiden aktiven Punkte-Migrationen; Staff UI in `StaffTablet.tsx` |

Ein universeller Maximalwert in Punkten kann nicht korrekt angegeben werden:
Die finale Punktzahl haengt vom jeweiligen Restaurantwert `amount_per_point`
und einem zur Buchungszeit aktiven Bonus-Multiplikator ab.

## Aktive Hard Blocks und Schutzmechanismen

- Serverseitiger Mindestbetrag: 100 Cent.
- Serverseitiger konfigurierter Maximalbetrag: Standard 30.000 Cent; Owner darf
  innerhalb 100 bis 100.000 Cent konfigurieren.
- Maximal zwei erfolgreiche positive Earn-Transaktionen je
  Customer/Restaurant/lokalem Kalendertag.
- Tages-PIN ist vierstellig, restaurant-/branch-/lokaltaggebunden und nur
  serverseitig autoritativ.
- Nach fuenf falschen Tages-PIN-Versuchen wird der Customer/Branch-Kontext bis
  zum naechsten lokalen Tag gesperrt.
- Customer-Punkte-QR ist opaque, gehasht, fuenf Minuten gueltig und einmalig
  verwendbar; parallele Verwendung wird per Row Lock serialisiert.
- Ab 30 Versuchen desselben Actors im Restaurant innerhalb von fuenf Minuten
  greift ein harter Rate Limit Block.
- Ab drei abgeschlossenen Restaurant-Buchungsversuchen desselben Actors fuer
  denselben Customer innerhalb von fuenf Minuten greift der Rapid-Repeat Block.
- Customer-initiierte Wiederholung innerhalb von fuenf Minuten wird blockiert.
- Payload-gebundene Idempotenz verhindert Doppelbuchung und blockiert die
  Wiederverwendung desselben Keys mit abweichendem Payload.
- Direkte Browser-DML auf dem Punkte-Ledger ist entzogen; Tenant- und
  Rollenpruefungen liegen serverseitig.

## Soft Warning und Audit

- Die Staff-Vorschau zeigt ab 80 Prozent des konfigurierten Maximalbetrags:
  `Hoher Betrag: Bitte den bezahlten Betrag sorgfaeltig pruefen.`
- Nach erfolgreicher Buchung in diesem Bereich wird
  `HIGH_POINTS_AMOUNT_REVIEW` im bestehenden Audit Trail geschrieben.
- Limit-, PIN- und erfolgreiche Punkteereignisse werden ebenfalls auditiert.
- Es gibt aktuell keine Owner-Dashboardkarte, keinen Owner-Detailfilter und
  keine Warnung fuer Customer-, Staff- oder Restaurant-Tagessummen.

## Root Cause fuer fehlendes Owner Monitoring

Die bestehende Implementierung berechnet nur eine transaktionsbezogene
Betragswarnung. Sie aggregiert keine Tages-Punktesummen fuer Customer, Actor
oder Restaurant und exponiert `HIGH_POINTS_AMOUNT_REVIEW` nicht als
Owner-Read-Model.

Die historische Confirm-Funktion uebergibt zwar zunaechst `staff`, die spaeter
angewendete zentrale Funktion `write_audit_event` normalisiert jedoch einen
authentifizierten Owner, Admin oder Manager serverseitig auf `admin` und
speichert die konkrete Restaurantrolle in den Metadaten. Diese nachgelagerte
aktive Migration wurde in der ersten Auditfassung uebersehen. Owner- und
Staff-Aktionen sind damit bereits kanonisch unterscheidbar.

## Empfohlene, noch nicht aktivierte Schwellenstrategie

1. **Hohe Einzelbuchung:** bestehende kanonische Schwelle von 80 Prozent des
   konfigurierten Maximalbetrags wiederverwenden.
2. **Hohe Customer-Tagessumme:** konfigurierbare nullable Schwelle. Als
   nicht-arbiträre Ausgangsoption kann die Punktzahl einer Buchung mit 100
   Prozent des aktuellen Maximalbetrags unter der zur Buchung geltenden
   Punkte-/Boost-Regel dienen. Founder-Freigabe erforderlich.
3. **Hohe Staff-Tagessumme:** konfigurierbare nullable Schwelle. Es gibt keine
   kanonische oder durch Pilotdaten belegte Ausgangszahl; bis zur
   Founder-Freigabe deaktiviert lassen.
4. **Restaurant-Tagessumme:** optional und ebenfalls nullable/deaktiviert, bis
   ein Pilot-Baselinewert freigegeben ist.

Eine spaetere additive Umsetzung sollte Warnungen aus dem kanonischen Ledger
ableiten, die Point-Transaction referenzieren, branch-aware und strikt
tenant-scoped sein und keine Punkte kopieren, blockieren, rueckgaengig machen
oder Staff automatisch sperren.

## Was wurde geaendert

- Nur dieser Auditbericht wurde erstellt.
- Keine Anwendungscodeaenderung.
- Keine Datenbankaenderung oder Migration.
- Keine Schwelle aktiviert.

## Pruefung

- Development/Test Migration History read-only kontrolliert: relevante lokale
  Punkte-Migrationen sind auf dem verknuepften Ziel vorhanden.
- Gezielte Punkte-/PIN-/Idempotenz-/RLS-Regression: 127/127 PASS.
- Vollsuite des aktuellen Arbeitsstands vor diesem Audit: 1158/1158 PASS.
- Typecheck: PASS.
- Lint: PASS (0 Errors; 7 bereits bekannte Warnings).
- Build: PASS.

## Risiken und Entscheidung

- Owner-Anomaly-Warning ist ohne freigegebene Customer-/Staff-Schwellen nicht
  produktvertraglich vollstaendig definierbar.
- Owner/Staff-Actor-Attribution muss vom Owner Warning UI aus der bestehenden
  serverseitigen Audit-Autoritaet uebernommen und getestet werden.
- Die bestehenden Hard Blocks bleiben unveraendert aktiv.

## Status

`NOT READY` fuer Point Anomaly Monitoring V1.

Der Limit- und Anti-Abuse-Audit ist abgeschlossen. Fuer die Aktivierung des
Monitoring Layers ist eine Founder-Entscheidung zu den Customer- und
Staff-Tagesschwellen erforderlich.
