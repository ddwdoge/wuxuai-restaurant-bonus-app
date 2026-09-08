# WUXUAI Bonus - Staging Staff Scanner Customer Label Consistency

Datum: 2026-09-08

## Ursache

Die serverseitige Staff-Preview-Funktion kuerzte `customers.name` mit
`split_part(customer_record.name, ' ', 1)` auf das erste Wort. Die QR-Identitaet,
Tenant-Zuordnung und Kundenbeziehung waren korrekt; betroffen war ausschliesslich
das zur Vor-Ort-Pruefung ausgegebene `customer_label`.

## Geaenderte Dateien

- `supabase/migrations/20260908007000_staff_scanner_customer_label_consistency.sql`
- `tests/staff-scanner-customer-label-consistency.test.mjs`
- `docs/reports/2026-09-08_STAGING_STAFF_SCANNER_CUSTOMER_LABEL_CONSISTENCY_REPORT.md`

## Was wurde geaendert

- Die bestehende private Preview-Funktion liefert fuer `customer_label` den
  vollstaendigen kanonischen tenant-lokalen Wert `customers.name`.
- Direkte Regressionstests sichern den vollstaendigen Namen, Multiwort-Namen,
  den nicht buchenden Preview-Vertrag, die unveraenderte Tenant-Bindung sowie
  die weiterhin notwendige Tages-PIN-Bestaetigung.
- Migration `20260908007000` wurde ausschliesslich auf Staging
  `bwhvfjuwixgwduoeqaya` angewendet.

## Was wurde nicht geaendert

- Keine Aenderung an QR-Identitaet, Ablaufzeit, Einmalverwendung oder Tenant-Bindung.
- Keine Aenderung an Tages-PIN, Punkteberechnung oder finaler Punktebuchung.
- Keine Aenderung an Kundenkonto, Membership, RLS oder Grants.
- Keine Aenderung am Customer-Home-Gruss. Dessen bewusste Anzeige des ersten
  Namensbestandteils via `.split(" ")[0]` ist eine separate UX-Konsistenzfrage.
- Keine Production-Migration, kein Production-Deployment und keine Production-Daten.

## Build- und Testergebnis

- Fokussierte Staff-/Scanner-/Points-Tests: 50/50 PASS.
- Gesamttests: 1361/1361 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 9 bereits bestehende Warnungen ausserhalb dieses Scopes.
- Build mit den bestehenden oeffentlichen Staging-Buildwerten: PASS.
- Secret Scan des Aenderungsscope: PASS.
- `git diff --check` einschliesslich neuer Dateien: PASS.

## Migration und Staging

- Pre-Dry-Run: exakt eine ausstehende Migration, `20260908007000`.
- Staging Push: PASS; exakt `20260908007000` angewendet.
- Post-Dry-Run: PASS; 0 ausstehende Migrationen.
- DB Linter: PASS ohne neue Fehler; nur bereits bestehende, nicht zugehoerige Warnungen.

## Physischer Flow-Test

- Frischer persoenlicher Kunden-QR wurde auf Staging erkannt.
- Preview mit 1,00 EUR zeigte exakt `WUXUAI Testkunde`.
- Preview zeigte den unveraenderten Ausgangsstand von 32 Punkten und +1 erwarteten Punkt.
- Die UI blieb vor der finalen Aktion `Mit Tages-PIN bestaetigen` stehen.
- Keine Tages-PIN wurde eingegeben; keine finale Punktebuchung wurde ausgeloest.
- Der Kundenbereich zeigte danach weiterhin 32 Punkte.
- Der SQL-Vertrag und die Regressionstests bestaetigen, dass die Preview weder
  `customer_points_qr_references.consumed_at` setzt noch eine
  `points_transactions`-Zeile erzeugt.

## Sicherheit

- `SECURITY DEFINER` und `search_path = public, pg_temp` bleiben erhalten.
- Die private delegierte Funktion bleibt fuer `public`, `anon` und
  `authenticated` ohne direkten Execute-Grant.
- Tenant- und Restaurant-Membership-Pruefung bleiben unveraendert.
- Es werden keine E-Mail-Adresse, Auth-ID, Account-ID, Membership-ID oder
  QR-Tokenwerte im Scanner ausgegeben.
- RLS/Security: PRESERVED.

## Risiken

Keine offenen Risiken im freigegebenen Scanner-Label-Scope. Die Customer-Home-
Begruessung verwendet weiterhin nur den ersten Namensbestandteil und sollte bei
Bedarf als eigener UX-Auftrag bewertet werden.

## Status

STAGING FINAL LOCK fuer den Staff-Scanner-Label-Fix.
READY TO CONTINUE PHYSICAL KASSA FLOW.
