# Platform Admin Operations & Health Center - Phase 5

Datum: 2026-09-12

Umgebung: Staging

Status: **FINAL LOCK**

## Ursache

Die erste Staging-Migration
`20260911007000_platform_admin_health_center_read_model.sql` fuehrte im
DB-Linter zu zwei neuen Volatilitaetswarnungen: Der als `STABLE` deklarierte
Health-Snapshot rief zwei bestehende `VOLATILE`-RPCs auf. Die separat
freigegebene additive Forward-Migration
`20260912001000_platform_health_snapshot_volatility_contract.sql` ersetzt nur
`get_platform_health_center()` und bildet deren benoetigte read-only
Berechnungen in einer gemeinsamen CTE-Snapshot-Abfrage ab.

Die beiden bestehenden `VOLATILE`-RPCs wurden weder geaendert noch auf
`STABLE` umdeklariert. Tabellen, Trigger, RLS, Schreibwege und reale Daten
blieben unveraendert.

## Geaenderte Dateien im Phase-5-Scope

- `src/app/App.tsx`
- `src/modules/platform/PlatformAdminPage.tsx`
- `src/modules/platform/PlatformHealthCenterPage.tsx`
- `src/modules/platform/platformAdminService.ts`
- `src/modules/platform/platformHealthCenterView.d.mts`
- `src/modules/platform/platformHealthCenterView.mjs`
- `src/shared/i18n/catalog.mjs`
- `src/shared/i18n/platformHealthMessages.mjs`
- `src/styles.css`
- `supabase/migrations/20260911007000_platform_admin_health_center_read_model.sql`
- `supabase/migrations/20260912001000_platform_health_snapshot_volatility_contract.sql`
- `tests/platform-health-center-read-model.test.mjs`
- `tests/platform-health-center-ui.test.mjs`
- `tests/platform-health-snapshot-volatility-contract.test.mjs`

## Was wurde geaendert

- Ein read-only RPC mit serverseitiger Platform-Admin-Pruefung, festem
  `search_path`, datensparsamer Rueckgabe und minimalem authentifiziertem
  Transport-Grant wurde hinzugefuegt.
- P0/P1/P2/P3-Findings, konsistente KPI-Ableitung, Datenstand und ehrliche
  Nichtverfuegbarkeit wurden vorbereitet.
- Eine geschuetzte Route `/admin/platform/health` mit anklickbaren KPI-Karten,
  Finding-Details, Suche, URL-stabilen Filtern und direkten Verwaltungslinks
  wurde implementiert.
- DE/EN/FR/IT/ES/ZH/KO besitzen identische Health-Center-Schluessel.
- Responsive und barrierearme Kontrollgroessen ab 320 Pixel wurden umgesetzt.
- Betriebs- und Laendernachweise entstehen aus einem gemeinsamen CTE-Snapshot;
  KPI-Summen werden aus exakt derselben Finding-Liste abgeleitet.
- Die sichtbare lokalisierte Finding- und Bereichsbezeichnung ist Teil der
  Suche. Der physisch gefundene E-Mail-Suchfall besitzt eine direkte Regression.
- Alle Health-Center-Aktionen besitzen mindestens 44 Pixel Bedienhoehe.

## Was wurde nicht geaendert

- Keine Tabelle, View oder Trigger wurde angelegt.
- Keine bestehende RLS-Policy und kein bestehender Grant wurde veraendert.
- Keine automatische Reparatur oder sonstige Schreibaktion wurde eingebaut.
- Keine Country-, PRO-, Password- oder Phase-4-Logik wurde geaendert.
- Keine realen Betriebsdaten wurden durch den Health-Center-Test veraendert.
- Production wurde weder migriert noch deployt oder konfiguriert.

## Migration und Staging

- Pre-Dry-Run: genau eine offene Migration, `20260912001000`.
- Auf Staging angewendet: Ja, ausschliesslich `20260912001000`.
- Post-Dry-Run: keine offene Migration.
- Migrationshistorie: 149/149 lokal/remote synchron.
- Staging Worker: `wuxuai-restaurant-bonus-app-staging`.
- Staging Version: `54984d05-3da6-4163-ba37-be79f07e5410`.
- Live-Asset-Bindung: Staging-Ref vorhanden; Production-Ref nicht verwendet.
- Ein erster Deploy-Versuch wurde vor jedem Upload vom Build-Guard gestoppt,
  weil die neue Shell keine Buildvariablen besass. Der anschliessende Deploy
  verwendete nur die bereits verifizierte oeffentliche Staging-Bindung.

## DB-Linter und Snapshot-Konsistenz

- Die zwei neuen Health-Center-Volatilitaetswarnungen sind beseitigt.
- Der Health-Center-RPC erzeugt im vollstaendigen DB-Linter keine Warnung.
- Unveraenderte, bereits vorhandene Linter-Hinweise ausserhalb des
  Phase-5-Scopes bleiben als Baseline sichtbar.
- 16 Wiederholungen in einer Abfrage lieferten konsistente Snapshots.
- Zwei parallele Abfragen mit vier Sekunden Ueberlappung lieferten denselben
  Snapshot-Hash und jeweils 54 Findings.
- KPI-Summe: 0 P0 + 19 P1 + 20 P2 + 15 P3 = 54 Findings.

## Security- und Datenpruefung

- Platform Admin: RPC-Aufruf erfolgreich.
- Anonymous: `42501`, blockiert.
- Owner ohne Platform-Rolle: `42501`, blockiert.
- Staff ohne Platform-Rolle: `42501`, blockiert.
- Customer ohne Platform-Rolle: `42501`, blockiert.
- `authenticated` Transport-Grant vorhanden; `anon` Transport-Grant nicht
  vorhanden.
- KPI-Summe entspricht der Finding-Liste.
- Keine Secrets, Tokens, Recovery-URLs oder Stacktraces in der Rueckgabe.
- Unauthentifizierter Browserzugriff auf `/admin/platform/health` wird zur
  Anmeldung umgeleitet.
- Die bestehenden `VOLATILE`-RPCs werden weder aufgerufen noch neu deklariert.
- `SECURITY DEFINER`, fester `search_path`, minimale Grants und der
  serverseitige Rollencheck sind erhalten.

## Physische Staging-Pruefung

- Platform-Admin-Sitzung und Route: PASS.
- Datenstand, KPI-Karten, Findings, Detaildaten, Auditnachweis und
  Verwaltungslink: PASS.
- P2-KPI: 20 Ergebnisse; Kombination P2 + System: genau ein Ergebnis.
- Suche `E-Mail`: genau ein sichtbares System-Finding; Detailansicht PASS.
- DE, EN, FR, IT, ES, ZH und KO: keine Rohschluessel, keine leeren
  Ueberschriften und kein horizontaler Ueberlauf.
- Responsive Matrix 320, 375, 390, 430, 768 und 1024+ Pixel: PASS.
- Kleinste sichtbare Health-Center-Bedienflaeche: 44 Pixel.
- Browser-Konsole: keine Fehler oder Warnungen.
- Keine UI-Aktion veraenderte Betriebs- oder Systemdaten.

### Finaler Restgate nach dokumentiertem NOT-READY-Checkpoint

- Der vorangegangene Browserbefehl war vor seiner Ausfuehrung in ein
  Werkzeug-Zeitlimit gelaufen. Fuer diesen Restgate wurde die Browserverbindung
  genau einmal neu initialisiert; die bestehende Platform-Admin-Sitzung blieb
  gueltig. Ein weiterer Timeout trat nicht auf.
- Die bereits bestandenen Pruefungen fuer Route, KPI, Finding-Konsistenz,
  Detailansicht, Suche, URL-/Reload-Zustand, Empty State, Schweregrad sowie DE
  und EN wurden nicht wiederholt.
- FR: PASS. `Centre d’exploitation et de sante`, Filter, KPI-Bezeichnungen,
  Datenstand und Empty State waren lokalisiert und ohne sichtbaren Ueberlauf.
- IT: PASS. `Centro operativo e di stato`, Filter, KPI-Bezeichnungen,
  Datenstand und Empty State waren lokalisiert und ohne sichtbaren Ueberlauf.
- ES: PASS. `Centro de operaciones y estado`, Filter, KPI-Bezeichnungen,
  Datenstand und Empty State waren lokalisiert und ohne sichtbaren Ueberlauf.
- ZH: PASS. `运营与健康中心`, Filter, KPI-Bezeichnungen, Datenstand und Empty
  State waren lokalisiert und ohne sichtbaren Ueberlauf.
- KO: PASS. `운영 및 상태 센터`, Filter, KPI-Bezeichnungen, Datenstand und
  Empty State waren lokalisiert und ohne sichtbaren Ueberlauf.
- Alle sieben Sprachen: PASS. In den fuenf offenen Sprachzustaenden waren keine
  Rohschluessel, leeren Pflichtbeschriftungen oder internen Fehlertexte sichtbar.
- Platform Admin: bestehende Staging-Sitzung durfte den Health Center lesen.
- Anonymous: aktueller direkter read-only RPC-Aufruf wurde mit HTTP 401 und
  SQLSTATE `42501` blockiert.
- Owner, Staff und Customer: der aktuelle 9/9-Security-Vertrag bestaetigt, dass
  keine dieser Identitaeten eine Platform-Rolle erhaelt. Der unveraenderte
  Staging-RPC prueft dieselbe serverseitige Rollenquelle; die zuvor physisch
  nachgewiesenen `42501`-Blockaden bleiben damit gueltig.
- Cross-Tenant: PASS. Der Health-RPC akzeptiert keinen Tenant-Parameter,
  blockiert Nicht-Platform-Rollen serverseitig und aendert die vorhandenen
  Tenant-RLS-Vertraege nicht.
- Keine Anmeldung, kein Rollenwechsel, keine Schreibaktion und keine
  Aenderung realer Betriebsdaten wurde ausgeloest.

### Wiederholungsnachweis nach Unterbrechung

- Git-Arbeitsstand erneut verifiziert: Branch
  `codex/pro-phase-1-entitlement-lifecycle`, HEAD
  `0458bfd961774d0f74d42dd375ee701c10bcf080`.
- Das kanonische Development-Remote blieb
  `ddwdoge/wuxuai-restaurant-bonus-app`; das Production-Remote wurde nicht
  verwendet.
- Staging war weiterhin unter
  `https://staging-app.bonus.wuxuaisbi.com` erreichbar und verwendete die
  bereits gepruefte Version `54984d05-3da6-4163-ba37-be79f07e5410`.
- Die authentifizierte Platform-Admin-Startseite zeigte weiterhin die
  vorhandene Cron-, E-Mail- und Registrierungs-Telemetrie ohne erfundenen
  Gesundheitszustand.
- Die Audit-Seite `/admin/platform/audit` wurde erneut read-only geprueft:
  Audit-Liste, Filter, vorhandene Ereignisse und ein bestehender Detaildialog
  waren erreichbar und verstaendlich dargestellt.
- Die Detailansicht zeigte Zeit, Restaurant, Status, Quelle, Akteur, Entitaet
  und bereinigte Metadaten; sensible Telefonnummern waren entfernt.
- Die Audit-Bedienflaechen waren mindestens 45 Pixel hoch. Weder Listen- noch
  Detailansicht verursachten horizontalen Seitenueberlauf.
- Tastaturaktivierung des Audit-Eintrags und Schliessen des Detaildialogs mit
  Escape funktionierten. Browser-Konsole: 0 Fehler, 0 Warnungen.
- Keine Schreibaktion wurde ausgeloest; keine realen Staging-Daten und keine
  Production-Ressourcen wurden veraendert.

## Qualitaetsnachweise

- Fokussierte Tests: 20/20 PASS.
- Zugriff-/Security-Tests: 9/9 PASS.
- Vollstaendige Tests: 1524/1524 PASS.
- Typecheck: PASS.
- Lint: PASS mit 0 Fehlern und 9 bereits vorhandenen Warnungen.
- Build: PASS; nur bestehende Chunk-Groessenwarnung. Ein erster fail-closed
  Versuch ohne die in der neuen Shell fehlenden oeffentlichen Buildvariablen
  wurde nicht als Buildnachweis gewertet. Der erfolgreiche Lauf verwendete
  diese Werte ausschliesslich fluechtig aus dem bereits ausgelieferten
  oeffentlichen Staging-Bundle; sie wurden weder ausgegeben noch gespeichert.
- Secret Scan im Phase-5-Scope: 0 Treffer.
- Neu erzeugtes Pruef-ZIP: 16 explizit freigegebene Dateien; keine `.env`,
  `node_modules`, Build-Verzeichnisse oder alten ZIP-Artefakte. Der Inhalts-Scan
  auf JWTs, Passwoerter, Recovery-Tokens, Service-Role-Schluessel und
  Datenbank-Connection-Strings ergab 0 Treffer.
- `git diff --check`: PASS.
- DB-Linter im Phase-5-Scope: PASS, 0 neue Health-Center-Findings.
- Physische positive Platform-Admin-Pruefung: PASS.
- Migrationshistorie erneut live bestaetigt: 149/149, 0 offen.
- Staging-Version erneut read-only bestaetigt:
  `54984d05-3da6-4163-ba37-be79f07e5410` (Version 273).
- Kein neuer Deploy und keine Production-Aktion.

## Risiken

Der vollstaendige Staging-DB-Linter fuehrt weiterhin bereits vorhandene,
unabhaengige Baseline-Hinweise auf. Sie stammen nicht aus dem Health Center
und duerfen unter dem ausdruecklich auf eine Funktion begrenzten Auftrag nicht
in dieser Migration veraendert werden. Im freigegebenen Phase-5-Scope sind
P0 und P1 null.

## Hintergrundprozesse

- Task-eigene Hintergrundprozesse gestartet: 0.
- Task-eigene Hintergrundprozesse gestoppt: 1. Der aus der vorherigen
  Phase-1/Phase-5-Arbeit verbliebene lokale PostgreSQL-Testserver auf Port
  `55432` (PID `15168`, Datenverzeichnis unter `/private/tmp`) hatte keine
  Client-Verbindung und wurde kontrolliert mit `SIGTERM` beendet.
- Task-eigene Hintergrundprozesse weiterhin aktiv: 0.
- Zurueckbehaltener Prozesszweck: keiner.
- RAM-Cleanup: PASS.
- Fremde Node-Prozesse wurden nicht veraendert.

## Abschluss

- Aufgabe: Platform Admin Operations & Health Center Phase 5
- Build: Ja
- Migration: `20260912001000` auf Staging angewendet
- Flow-Test: Ja, physische Staging-QA bestanden
- RLS/Security: Ja
- Alte Logik geprueft: Ja
- Report: diese Datei
- Pruef-ZIP: `exports/2026-09-12_PLATFORM_ADMIN_OPERATIONS_HEALTH_CENTER_PHASE_5.zip`
- Offene Risiken: keine P0/P1 im freigegebenen Phase-5-Scope
- Status: **FINAL LOCK**
