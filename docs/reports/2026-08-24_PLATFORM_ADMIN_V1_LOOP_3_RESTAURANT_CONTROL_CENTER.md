# WUXUAI Bonus - Platform Admin V1 Loop 3 Restaurant Control Center

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Authoritative Base: `919141181223aa414ef004a09aa3f02637f2b7fd`  
Status: `BLOCKED_BY_BACKEND_CONTRACT`

## Ursache

Die vorhandene Restaurantdetailseite und ihre geschuetzte RPC bilden eine
sichere Basis, liefern aber nicht alle fuer Loop 3 verbindlichen Daten. Eine
vollstaendige Umsetzung wuerde eine additive Aenderung des serverseitigen
Plattformvertrags erfordern. Abschnitt 30 des Auftrags verlangt in diesem Fall
einen STOP vor der Umsetzung.

## Wiederverwendbare vorhandene Grundlage

Die bestehende Seite `PlatformAdminPage.tsx` und die RPC
`get_platform_restaurant_detail(uuid)` liefern bereits:

- Restaurantname, Slug, Owner und Owner-E-Mail
- Restaurant-, SaaS-, Zahlungs- und Testphasenstatus
- Beginn und Ende der Testphase
- Onboardingstatus, Erstellungszeit und letzte Aktivitaet
- Kundenanzahl, Punkte heute und Einloesungen heute
- aktive Willkommensgeschenke und aktive Booster
- Branding und die letzten acht Audit-Eintraege
- sichere Portal-Links ohne Impersonation
- serverseitig autorisierte und auditierte Status-/Abo-Aktionen
- keine Hard-Delete-Aktion

Die Plattformrolle stammt weiterhin ausschliesslich aus aktiven
`platform_admins`-Eintraegen. Der Browser verwendet keine Service-Role und
keine breiten Tabellenzugriffe.

## Fehlende autoritative Daten

### Nutzung und Einloesungen

- Keine testbereinigten 30-Tage-Punkte oder neuen Kunden
- Keine 30-Tage-Einloesungen aus dem aktuellen
  `redemption_activity_journal.finalized_at`-Vertrag
- Keine letzte Einloesung und keine Aufteilung nach Punkte-, Welcome- und
  Birthday-Einloesung
- Bestehende Detailwerte normalisieren fehlende Daten im UI teilweise auf `0`;
  damit ist ein RPC-Fehler nicht sicher von einem echten Nullwert getrennt

### Referral und 2x-Booster

- Kein Referral-Enabled-Status
- Keine konfigurierte Owner-Dauer
- Keine qualifizierten Empfehlungen
- Keine testbereinigte aktive Boosterzahl
- Keine durch Booster erzeugten Zusatzpunkte

Die benoetigten Tabellen und Restaurant-RPCs existieren, sind aber nicht als
plattformweit autorisierter Detail-Payload freigegeben. Owner-RPCs duerfen
nicht als Plattformzugriff missbraucht werden.

### Systemzustand

Die vorhandene Detail-RPC liefert keine belastbaren, aggregierten Signale fuer:

- Kundenregistrierung und Legal-RPC-Fehler
- E-Mail-Fehler und Versandrueckstand
- Adressvollstaendigkeit, Koordinaten, Sichtbarkeit und Geocodingstatus
- Staff-Anzahl, Tages-PIN-Verfuegbarkeit und QR-Flow
- Cron-Verfuegbarkeit

Diese Werte aus Browserabfragen oder dem begrenzten Auditfeed zu schaetzen
waere keine autoritative Health-Pruefung.

### Interne Notizen und manuelle Zahlungen

- Das Schema besitzt keinen nachgewiesenen internen, actor- und
  zeitstempelgebundenen Plattform-Notizvertrag.
- Die bestehende Zahlungsaktion kann nur den Zahlungsstatus und einen
  Audit-Grund setzen. Datum, Betrag und interne Referenz sind kein eigener
  strukturierter Zahlungsdatensatz.
- Deshalb wurden weder eine Notizarchitektur noch frei erfundene Zahlungsfelder
  im UI angelegt.

## Minimal notwendiger Backendvertrag

Eine additive Reparatur-/Erweiterungsmigration sollte die bestehende
`get_platform_restaurant_detail(uuid)`-Architektur erweitern oder eine eng
zugeordnete Detail-Health-RPC schaffen. Sie muss:

- die Plattformrolle erneut aus `platform_admins` pruefen,
- einen festen sicheren `search_path` besitzen,
- `EXECUTE` nur den benoetigten authentifizierten Plattformrollen gewaehren,
- alle Abfragen an die uebergebene `restaurant_id` binden,
- Testkunden und Testereignisse ausschliessen,
- aktuelle Referral-, Booster- und Redemption-Vertraege verwenden,
- 30-Tage-Aggregate vollstaendig serverseitig berechnen,
- Blockfehler getrennt von echten Nullwerten liefern,
- nur PII-arme Health-Summaries ausgeben,
- keine PINs, Tokens, SMTP-Daten oder Endkunden-PII zurueckgeben,
- bestehende Tenant-RLS unangetastet lassen.

Ein separater Notiz- oder strukturierter manueller Zahlungsvertrag soll nur
nach eigener Produkt- und Schemafreigabe entstehen.

## Geaenderte Dateien

- `docs/reports/2026-08-24_PLATFORM_ADMIN_V1_LOOP_3_RESTAURANT_CONTROL_CENTER.md`

## Was wurde nicht geaendert

- Keine Platform-Admin-UI
- Keine Plattform-RPC und keine Datenbankmigration
- Keine RLS-, Grant- oder Rollenlogik
- Keine Referral-, Punkte-, Redemption-, Auth-, Legal-, Geocoding-, Staff-,
  Owner- oder Customer-Logik
- Keine interne Notizfunktion
- Keine neue Zahlungslogik und keine Stripe-Integration
- Keine Anwendung von `20260824004000`
- Kein Push, Merge oder Deployment

## Qualitaetspruefung

- Tests: `822/822 PASS`
- Typecheck: `PASS`
- Lint: `PASS`, 0 Fehler und 7 bereits bestehende Warnungen
- Build: `PASS`
- `git diff --check`: `PASS`
- Secret-Scan: `PASS`

## Risiken

- Eine UI-only-Umsetzung wuerde fehlende Health- und KPI-Werte erfinden oder
  Fehler als Null darstellen.
- Der aktuelle Detailvertrag zaehlt nicht alle neuen Metriken testbereinigt.
- Eine Verwendung restaurantbezogener Owner-RPCs durch Platform Admin wuerde
  Rollen- und Tenantvertraege vermischen.

## Entscheidung

Da Loop 3 einen neuen DB-Vertrag benoetigt, wurde entsprechend der absoluten
Migrationsregel vor der Implementierung gestoppt.

`PLATFORM ADMIN LOOP 3 READY: NO`

`READY FOR LOOP 4: NO`

`PRODUCTION: LOCKED`

`STRIPE: DEFERRED`
