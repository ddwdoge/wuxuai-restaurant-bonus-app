# WUXUAI BONUS – Phase 7C.4 Customer-Capacity-Enforcement

Datum: 2026-09-21
Branch: `codex/v1-release-integration`
Ausgangs-HEAD/Remote: `31fa1574477a45b54b4513bda792829d3a6e0497`
Status: **PHASE 7C.4 LOCAL CODE LOCK**

## Ursache

Migration 153 stellte die zentrale endliche Capacity-Berechnung bereit, setzte
das Kundenlimit an den autoritativen Aktivitaetsledgern aber noch nicht
schreibend durch. Damit konnten direkte serverseitige Schreibpfade bei
erreichtem Limit eine neue aktive Kundenidentitaet erzeugen.

## Founder-Vertrag und Eintrittspfade

- Zaehlgrain: eine eindeutige Kundenidentitaet pro Restaurant. Vorrangig gilt
  `customer_account_memberships.account_id`, sonst `customer_id`.
- Fenster: exakt `[as_of - 365 Tage, as_of)` nach Serverzeit.
- Qualifizierend: positive, nicht aufgehobene `earn`-Punktebuchung aus
  `restaurant_controlled` oder `customer_initiated`; oder aktive,
  nicht stornierte, nicht synthetische abgeschlossene Redemption-Journalzeile.
- Nicht qualifizierend: Registrierung, Membership, Login, Ansicht, Testkunde,
  Testevent, abgelehnte, stornierte oder aufgehobene Aktivitaet.
- Alle Punktepfade konvergieren auf `points_transactions`; Punkte-, Reward-,
  Welcome-, Birthday- und sonstige Geschenkeinloesungen konvergieren auf
  `redemption_activity_journal`. Die Trigger auf diesen beiden Ledgern decken
  dadurch RPC-, API- und vertrauenswuerdige direkte DML-Pfade ab.
- Erste blockierte Aktion: ausschliesslich die erste qualifizierende Aktivitaet
  einer zuvor nicht aktiven Identitaet, falls sie das effektive Limit
  ueberschreiten wuerde. Registrierung und Login bleiben moeglich; bestehende
  aktive Kunden bleiben funktionsfaehig.

## Geaenderte Dateien

- `supabase/migrations/20260921003000_customer_capacity_enforcement.sql`
- `tests/phase-7c4-customer-capacity-contract.test.mjs`
- `tests/phase-7c4-customer-capacity-contract.local.sql`
- `tests/phase-7c4-customer-capacity-concurrency.local.mjs`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Umsetzung

- Ein privacy-minimaler interner Helper bildet die kanonische aktive
  Identitaetsmenge aus beiden Ledgern.
- `resolve_restaurant_capacity_internal` verwendet diese gemeinsame Menge und
  bleibt alleinige Limit-, Usage-, Remaining- und Over-Limit-Autoritaet.
- AFTER-Trigger auf beiden Ledgern erkennen nur neue qualifizierende
  Identitaeten. Sie sperren den Restaurant-Tenant transaktional, vergleichen
  den Zustand mit und ohne aktuelle Zeile und werfen bei Ueberschreitung den
  stabilen Fehler `CUSTOMER_CAPACITY_REACHED`.
- Auch das Verschieben einer historischen Punktezeile in das aktive Fenster
  durch vertrauenswuerdige direkte DML durchlaeuft die Erstaktivierungspruefung;
  das Redemption-Journal besitzt zusaetzlich seinen bestehenden strengeren
  Unveraenderbarkeitsvertrag.
- Sichere Fehlerdetails enthalten nur Capacity-Fakten, keine Kundenkennung,
  E-Mail, Telefonnummer oder Auth-Metadaten.
- Der Read-Vertrag meldet `offers=true` und `active_customers=true` unter
  `write_enforcement`; es wurde keine Owner-UI gebaut.
- Bestehende partielle Indizes werden fuer beide rollierenden
  Aktivitaetsabfragen als Index-Only-Scans verwendet.

## Lokale Vertragsmatrix 1–30

1. BASIC 2.999, naechste Aktivitaet erfolgreich: PASS.
2. BASIC 3.000, Grenze exakt erreicht: PASS.
3. BASIC 3.001, `CUSTOMER_CAPACITY_REACHED`: PASS.
4. BASIC + 1 Add-on 8.000/8.001: PASS.
5. PRO 15.000/15.001: PASS.
6. PRO + 2 Add-ons 25.000/25.001: PASS.
7. Gleicher Kunde mehrfach aktiv, einmal gezaehlt: PASS.
8. Mehrere Besuche beziehungsweise Aktivitaeten, einmal gezaehlt: PASS.
9. Mehrere Punktebuchungen, einmal gezaehlt: PASS.
10. Mehrere Einloesungen, einmal gezaehlt: PASS.
11. Aktivitaet exakt an der unteren 365-Tage-Grenze enthalten: PASS.
12. Aktivitaet knapp innerhalb enthalten: PASS.
13. Aktivitaet knapp ausserhalb ausgeschlossen; obere Grenze ausgeschlossen:
    PASS.
14. BASIC auf PRO erweitert Kapazitaet ohne Datenmutation: PASS.
15. PRO auf BASIC erzeugt kontrolliertes Over-Limit und blockiert nur neue
    Identitaeten: PASS.
16. Add-on-Aktivierung erhoeht das effektive Limit: PASS.
17. Mehrere Add-on-Einheiten werden additiv beruecksichtigt: PASS.
18. Add-on-Ende reduziert das Limit ohne Datenloeschung: PASS.
19. PAST_DUE nach Grace Period reduziert das Limit: PASS.
20. Plan- und Add-on-Zustand werden gemeinsam zentral aufgeloest: PASS.
21. Over-Limit erhaelt Kunden-, Membership-, Punkte- und Redemptiondaten:
    PASS.
22. Tenant-Isolation: PASS.
23. Getrennte Restaurants zaehlen getrennt: PASS.
24. Owner-/Staff-/Customer-/Anonymous-Vertrag ueber authentifizierte
    Tenant-Autorisierung und Tabellen-ACLs: PASS.
25. Country Gate bleibt alleinige PRO-Autoritaet: PASS.
26. TEST_ONLY-Bestand und Vertrag unveraendert: PASS.
27. RPC-/API-Bypass durch Ledgertrigger verhindert: PASS.
28. Browser-Direkt-DML durch ACL/RLS verhindert; vertrauenswuerdige DML bleibt
    durch Trigger geschuetzt: PASS.
29. Wiederholte Anwendung und wiederholte Aktivitaet idempotent: PASS.
30. Fresh 155/155, historisch 154, Upgrade 154→155 und Repeat 1/2: PASS.

## Parallelitaet und Bereinigung

- 96 parallele Erstaktivierungen gegen eine isolierte Fuenfergrenze: exakt 5
  Erfolge und 91 stabile Capacity-Fehler.
- 24 parallele Punktebuchungen derselben fuenften Identitaet: 24 Erfolge,
  Usage bleibt 5/5.
- Keine Deadlocks, keine Teilwrites und keine verwaisten Customer-,
  Membership-, Activity- oder Planzeilen.
- SQL-Matrix endet mit Rollback; Parallelitaetsharness prueft den globalen
  Bestandsfingerprint nach Cleanup.

## Migration, Security und Performance

- Fresh-Replay aller Migrationen bis 155: PASS.
- Historischer Replay bis 154 und Nachweis, dass 155 fehlt: PASS.
- Upgrade 154→155: PASS.
- Direkte Wiederanwendung Lauf 1 und Lauf 2: PASS.
- Migrationen 153 und 154 gegen HEAD bytegleich: PASS.
- DB-Lint: PASS, keine Fehler.
- RLS auf `points_transactions` und `redemption_activity_journal`: PASS.
- Interne Helper-/Triggerausfuehrung fuer `anon`, `authenticated` und
  `service_role` entzogen: PASS.
- SECURITY DEFINER mit festem `pg_catalog, public, pg_temp` Search Path: PASS.
- Query-Plan verwendet `points_transactions_capacity_activity_idx` und
  `redemption_activity_capacity_idx`: PASS.

## Technische Gates

- Focused Customer-Capacity-Tests: PASS, 8/8.
- Focused Security-/Regressionstests: PASS, 65/65.
- Full Test Suite: PASS, 1.906/1.906.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler; 8 bereits bestehende Warnungen in unveraenderten
  Dateien.
- Build: PASS; nur der bekannte Vite-Chunkgroessenhinweis.
- `git diff --check`: PASS.
- Secret Scan: PASS; ZIP wird separat ohne `.env`, generierte Builds,
  Abhaengigkeiten oder Credentials erzeugt.

## Was nicht geaendert wurde

- Keine bestehende Migration, Produkt-UI, Owner-Warnung oder Kaufoberflaeche.
- Keine Staging-/Production-Migration und kein Deployment.
- Kein Commit, Push, Stripe-Zugriff, Live-Billing, PRO-Grant,
  TEST_ONLY-Markierung oder Country Release.
- Keine realen Kunden-, Punkte-, Einloesungs- oder Subscriptiondaten.

## Risiken

- Migration 155 ist ausschliesslich lokal geprueft und nicht auf Staging
  angewendet; daher kein Staging Lock und kein FINAL LOCK.
- Acht bekannte Lint-Warnungen und der Build-Chunkhinweis liegen ausserhalb
  dieses Datenbankscopes.
- Owner-UI, Capacity-Warnungen, Add-on-Kauf und Billing bleiben ausdruecklich
  Folgephasen.

## Abschluss

- Aufgabe: Phase 7C.4 serverseitiges Customer-Capacity-Enforcement
- Build: Ja
- Migration: Erstellt / lokal Fresh, Upgrade und Repeat geprueft / nicht auf Staging angewendet
- Flow-Test: Ja, lokal synthetisch; kein Staging-Flow
- RLS/Security: Ja
- Alte Logik geprueft: Ja; beide autoritativen Aktivitaetsledger erfasst
- Report: `docs/reports/2026-09-21_PHASE_7C_4_CUSTOMER_CAPACITY_ENFORCEMENT_REPORT.md`
- Pruef-ZIP: `exports/2026-09-21_PHASE_7C_4_CUSTOMER_CAPACITY_ENFORCEMENT.zip`
- Offene Risiken: separates Staging-Gate erforderlich
- Status: **PHASE 7C.4 LOCAL CODE LOCK**
