# WUXUAI Bonus Platform Admin Operations & Health Center - Phase 5A Audit

Datum: 2026-09-11

Modus: Read-only Audit

Staging: `bwhvfjuwixgwduoeqaya`
Production: unveraendert und gesperrt

## Ergebnis

Die vorhandenen Platform-Admin-Vertraege liefern mehrere belastbare, serverseitig
autorisierte Teilquellen. Fuer den vollstaendigen Health-Center-Vertrag fehlt
jedoch ein globaler, atomarer Finding-Snapshot. Eine reine Browser-Aggregation
ueber mehrere zeitlich getrennte RPC-Aufrufe kann die geforderte Gleichheit von
KPI-Zahlen und Detailergebnissen nicht garantieren und wuerde Schweregrad,
Ursache und Zielnavigation nur clientseitig bestimmen.

Deshalb ist vor Phase 5B genau eine additive, read-only Forward-Migration
erforderlich. Gemaess Founder-Auftrag wurde keine Migration erstellt und keine
Implementierung begonnen.

Status: **NOT READY - FOUNDER APPROVAL FUER MIGRATION ERFORDERLICH**

## Aktuelle Platform-Admin-Oberflaeche

### KPI-Karten

Auf `/admin/platform` existieren sechs globale KPI-Karten:

1. Restaurants gesamt
2. Aktive Restaurants
3. Testphasen aktiv
4. Testphasen bald ablaufend
5. Gesperrte Restaurants
6. Neue Restaurants heute

Alle sechs Karten sind aktuell nicht anklickbare `article`-Elemente. Sie zeigen
nur Zahlen und besitzen weder Filterziel noch Detailansicht oder URL-Zustand.

### Weitere globale Bereiche

- Cron/Scheduler, Transaktions-E-Mail und Registrierungen werden als drei
  nicht anklickbare Telemetrie-Karten dargestellt.
- Die Restaurantliste besitzt Suche, Statusfilter und anklickbare Zeilen zur
  bestehenden Detailroute `/admin/platform/restaurants/:restaurantId`.
- Country Launch Control zeigt Laenderstatus, Readiness und Audit. Es ist kein
  Finding-Filter und kein Bestandteil eines gemeinsamen Health-Snapshots.
- Das Restaurant Control Center zeigt tenantbezogene Diagnose- und Auditdaten.
  Es ist keine globale Finding-Liste.
- Das Operations-Panel enthaelt Schreibaktionen. Diese duerfen nicht in das
  read-only Health Center uebernommen oder automatisch ausgeloest werden.

## Physischer Auditstatus

Der aktuelle Codex-In-App-Browser hatte keine aktive Platform-Admin-Sitzung fuer
die Staging-App. Der Aufruf von `/admin/platform` wurde am 2026-09-11 auf
`/restaurant/login` umgeleitet. Damit ist die bestehende Zugriffsgrenze sichtbar,
aber ein authentifizierter physischer Platform-Admin-Audit war in diesem Lauf
nicht moeglich. Es wurde nichts eingegeben und keine Sitzung oder Daten geaendert.

## Verfuegbare Datenquellen

| Bereich | Quelle | Klassifikation | Verlaesslicher Umfang |
| --- | --- | --- | --- |
| Restaurant-KPIs | `get_platform_restaurants()` | DATABASE DERIVED | Restaurant-, Setup-, Branch-, Subscription-, Trial- und Aktivitaetsstatus sowie aggregierte Nutzung |
| Tenant Health | `get_platform_restaurant_control_center(uuid)` | DATABASE DERIVED | Setup, Subscription, Nutzung, Redemption, Registrierung, E-Mail, Geolocation, Staff, Audit und Datenstand je Restaurant |
| Entitlements | `get_restaurant_entitlements(uuid)` | DATABASE DERIVED | Effektiver Plan, Override, aktives Angebotsvolumen und Notification-Entitlements |
| Legal/i18n | `get_platform_restaurant_legal_i18n_status(uuid)` | DATABASE DERIVED | Jurisdiktion, Legal-Review-Status und publizierte Dokumente je Restaurant |
| Operations-Diagnose | `get_platform_restaurant_operations(uuid)` | DATABASE DERIVED | Owner/Staff/Customer-Support, Punktejournal, Gifts, QR/PIN, Mail und Security Flags; fuer Health Center zu detailreich |
| Globales Audit | `get_platform_audit_events(...)` | DATABASE DERIVED | Gefilterte, serverseitig begrenzte Auditereignisse |
| Cron | `get_platform_operational_telemetry()` | LIVE DATABASE SOURCE | Sieben kanonische Jobs, Aktivstatus und vorhandene Laufhistorie |
| E-Mail | `get_platform_operational_telemetry()` | DATABASE DERIVED | Queue-Status und Versandereignisse; Provider-/Secret-Konfiguration bleibt UNAVAILABLE |
| Registrierung | `get_platform_operational_telemetry()` | AGGREGATED | Nicht-Test-Registrierungsereignisse aus dem Audit |
| Country Readiness | `get_platform_country_launch_status()` | DATABASE DERIVED | Aktivierung, Marktstatus, Waehrung, Readiness-Pruefungen und begrenztes Audit |
| Erstmalig erkannt | keine kanonische Quelle | UNAVAILABLE | Darf ohne persistentes Finding-Ereignis nicht erfunden werden |
| Migrationsparitaet | keine sichere Runtime-Quelle | UNAVAILABLE | Darf nicht aus Browsercode oder Dateinamen abgeleitet werden |
| E-Mail-Providerkonfiguration | Secrets/Provider | UNAVAILABLE | Darf weder ausgelesen noch als gesund angenommen werden |

## Sicher belegbare Findings

Mit einem serverseitigen globalen Read Model koennen aus bestehenden
autoritativen Tabellen und Funktionen mindestens folgende Zustandsklassen
deterministisch ausgewertet werden:

- Onboarding nicht abgeschlossen.
- Restaurant ohne Branch beziehungsweise aktiven Standortbezug.
- Unvollstaendige Adresse oder fehlende Koordinaten, soweit der bestehende
  Control-Center-Vertrag dies belegt.
- Fehlende Subscription-Zuordnung.
- Nicht eindeutig berechenbarer effektiver Plan.
- Abgelaufener, zukuenftiger oder unvollstaendiger Plan-Override.
- Mehr als fuenf aktive Marketingangebote bei effektivem BASIC-Limit 5.
- Fehlende Loyalty-Konfiguration oder nicht verfuegbare Tages-PIN/QR-Funktion.
- Legal-Jurisdiktion nicht verfuegbar oder Legal-Review-Status offen.
- Country Readiness offen/abgelaufen, Waehrung fehlt oder inkonsistenter
  Aktivierungs-/Marktstatus.
- Fehlgeschlagene beziehungsweise wartende E-Mail-Queue-Eintraege.
- Fehlende/deaktivierte Cron-Jobs oder belegte letzte Fehler.
- Wiederholte, im Audit belegte Registrierungsfehler.

## Nicht belastbare oder ausgeschlossene Findings

Folgende Aussagen duerfen im aktuellen Stand nicht als Fehler oder gesund
ausgegeben werden:

- E-Mail-/SMTP-Konfiguration ist funktionsfaehig, wenn nur keine Queue-Fehler
  vorhanden sind.
- Ein Hintergrundjob ist gesund, wenn keine Laufhistorie existiert.
- Migrationen sind vollstaendig, ohne autoritative Runtime-Paritaetsquelle.
- Erstfund-Zeitpunkt eines dynamisch berechneten Findings ohne persistente oder
  eindeutig passende Audit-Evidenz.
- Provider-, Cloudflare-, Supabase- oder Secret-Zustand aus Browserdaten.
- Allgemeine Sicherheitswarnungen aus blossen Nullwerten.
- Business- oder Legal-Fehler aus nicht autoritativen UI-Fallbacks.

Diese Zustaende muessen als `UNAVAILABLE`, `NO RECENT EVENTS` oder gar nicht
angezeigt werden. Null Nutzung darf nicht mit fehlender Quelle vermischt werden.

## Datenschutz und Sicherheitsgrenzen

- Alle wiederverwendbaren Lesevertraege sind `SECURITY DEFINER` und pruefen die
  Platform-Admin-Rolle serverseitig.
- Direkte globale Tabellenreads sind im Platform-Service nicht vorhanden.
- Der aktuelle Restaurantlistenvertrag liefert Owner-Name und Owner-E-Mail.
  Diese Daten duerfen im Health Center nur dann verwendet werden, wenn fuer die
  konkrete Supportursache notwendig; fuer KPI/Finding-Listen werden sie nicht
  benoetigt.
- Das Operations-RPC liefert Kunden- und Mitarbeitersupportdaten. Das neue
  globale Read Model darf diese personenbezogenen Detailzeilen nicht kopieren.
- Token, QR-Hashes, PIN-Werte, Recovery-URLs, Provider-IDs, Stacktraces und
  Secrets sind ausgeschlossen.
- Owner, Staff, Customer und unauthenticated muessen sowohl am Route-Gate als
  auch am neuen RPC scheitern.

## Warum eine Migration zwingend erforderlich ist

Eine Browserloesung muesste fuer jedes Restaurant mehrere RPCs nacheinander
aufrufen und daraus Findings erzeugen. Das verletzt oder gefaehrdet vier
verbindliche Anforderungen:

1. `SERVER-SIDE DETECTION`: Schweregrad und Finding-Vertrag waeren nur im Client.
2. `KPI/DETAIL CONSISTENCY`: Zusammenfassung und Details kaemen aus verschiedenen
   Datenbank-Snapshots und koennten sich waehrend des Ladens unterscheiden.
3. `EXACT BUSINESS/LOCATION`: Nicht alle noetigen Standort- und Vertragsfelder
   liegen in einem bestehenden globalen, minimalen Payload vor.
4. `DATA MINIMIZATION`: N+1-Aufrufe der detailreichen Support-RPCs wuerden mehr
   personenbezogene Daten in den Browser laden als fuer Findings erforderlich.

Ein serverseitiger, atomarer und minimaler Read-Vertrag ist deshalb die engste
sichere Umsetzung.

## Enger Migrationsvorschlag zur Founder-Freigabe

Vorgeschlagene Datei:

`supabase/migrations/20260911007000_platform_admin_health_center_read_model.sql`

Zulaessiger Umfang:

- Genau eine neue Funktion `public.get_platform_health_center(...)`.
- `STABLE`, `SECURITY DEFINER`, fester `search_path = public, pg_temp`.
- Fail-closed Platform-Admin-Pruefung ueber die bestehende Rollenautoritaet.
- `REVOKE` fuer `public`, `anon`, `authenticated`; anschliessend ausschliesslich
  `GRANT EXECUTE` an `authenticated`, wobei die Funktion intern erneut prueft.
- Ein konsistenter `generated_at`-Zeitpunkt und ein gemeinsamer SQL-Snapshot.
- Ein minimaler JSON-Vertrag aus `summary`, `findings` und sicheren
  Filterdimensionen.
- Zusammenfassungen werden aus derselben Findings-Menge berechnet, die an den
  Client geliefert wird.
- Deterministische Finding-Typen, Schweregrade P0-P3, aktueller/erwarteter Wert,
  Kategorie, Land, Plan, Restaurant-/Branch-Ziel, `last_checked_at`, sichere
  Zielroute und empfohlene naechste Aktion.
- `first_seen_at` nur bei eindeutig zuordenbarer bestehender Audit-Evidenz;
  andernfalls `null`/`UNAVAILABLE`.
- Keine neue Tabelle, keine Persistenz, keine Trigger und keine Schreibaktion.
- Keine Aenderung an RLS, bestehenden Grants, Policies, Businesslogik,
  Country Guard, Entitlements, Legal, Auth oder Production.
- Keine Ausgabe von Owner-E-Mail, Customer-/Staff-Zeilen, Auth-IDs, Tokens,
  Hashes, Secretnamen, Providerpayloads oder Stacktraces.

Vor Staging-Anwendung erforderlich:

- SQL-Vertragstests fuer Platform Admin, Owner, Staff, Customer,
  unauthenticated und Cross-Tenant.
- Fixture-Matrix fuer Nullzustand, P0-P3, stale/unavailable und KPI/Detail-
  Identitaet.
- Dry Run mit exakt einer offenen Migration.
- Founder Approval fuer genau diese additive Forward-Migration.

## Nicht geaendert

- Kein Produkt- oder UI-Code.
- Keine Migration erstellt oder angewendet.
- Keine Datenbank, RLS, Grants, Auth, Country-, PRO-, Password- oder Phase-4-
  Logik geaendert.
- Kein Staging-Deployment.
- Keine realen Staging-Daten geaendert.
- Production vollstaendig unveraendert.

## Gate-Status

- Automatic Findings: BLOCKED bis zum serverseitigen Read Model.
- Clickable KPI Cards: NICHT IMPLEMENTIERT.
- Finding Detail/Filter/URL State: NICHT IMPLEMENTIERT.
- Platform-Admin-Security des Bestands: CODE PASS; physischer Zugriff in diesem
  Lauf nicht authentifiziert.
- Migration: REQUIRED, nicht erstellt.
- Phase 5 Operations & Health Center: NOT READY.

## Verifikation des unveraenderten Ausgangsstands

- Fokussierte Platform-Admin-/Security-Tests: 37/37 PASS.
- Vollstaendige Testsuite: 1504/1504 PASS.
- Typecheck: PASS.
- Lint: PASS mit 0 Fehlern und 9 bereits bestehenden Warnungen.
- Build: PASS mit Staging-URL und nicht geheimem Build-only-Sentinel. Der erste
  Lauf ohne Buildvariablen wurde erwartungsgemaess vom Fail-Closed-Guard
  abgebrochen; es wurde kein echter Key geladen oder ausgegeben.
- Secret Scan: PASS; keine konkreten Google-, Supabase-, Stripe- oder
  PostgreSQL-Credentialmuster im Repository-Arbeitsstand gefunden.
- `git diff --check`: PASS.
- Staging DB Linter (`--linked --level error`): PASS, 0 Findings.
- Staging-Migrationshistorie: lokal/remote synchron bis `20260911006000`,
  0 offene Migrationen.
- RLS/Grant-Codeaudit: PASS fuer die wiederverwendeten Platform-RPCs;
  `SECURITY DEFINER`, serverseitige Rollenpruefung und eingeschraenkte
  Execute-Grants sind vorhanden.
- Staging-Deployment: nicht ausgefuehrt.
- Database changed: NO.
- Real business data changed: NO.
- Production changed: NO.
