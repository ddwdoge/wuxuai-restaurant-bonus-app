# Staging TEST_ONLY: tatsächlicher Lesezugriff und verbleibende Rechte-Grenze

Datum: 2026-10-04. Basis: 45b44e0121fbfdf9279f9b37a00a8a29d41e06cf.

## Ergebnis

Der feste SQL-Editor-Leseweg wurde tatsächlich auf `wuxuai-bonus-staging` ausgeführt. Die unabhängige, ausschließlich auf diese Abfrage begrenzte Datenbankberechtigung ist **NOT READY**: geerbte PUBLIC-Funktionsrechte verhindern diese Aussage. Es wurde kein Login, Passwort oder Management-Token erstellt. Der vorhandene Admin-Zugang behält seine bisherigen Rechte; ein SQL-Profil ist keine Zugriffssperre für den Admin.

## Implementierte Schnittstelle

Die parameterlose Funktion `wuxuai_test_preflight.read_65_to_109()` ist STABLE, SECURITY DEFINER mit festem search_path, begrenzt ihre Daten intern auf den registrierten TEST_ONLY-Betrieb `wuxuai-test-only-pro-phase-1` und verlangt eine read-only Transaktion. Keine Geschäftsänderung erfolgt. Mehrdeutige Customer oder Filialen liefern ausschließlich AMBIGUOUS und Anzahlen. Die vollständige PRO-Bedingung verwendet `coalesce(..., false)`; der bestehende serverseitige Resolver wird verwendet. Seine committed Abhängigkeiten wurden als reine SELECT/STABLE-Funktionen geprüft.

Das lokale Profil beginnt mit BEGIN READ ONLY und SET LOCAL ROLE. Die neue Rolle ist NOLOGIN, ohne Superuser, BYPASSRLS, Rollen-/Datenbank-Erstellung oder direkte Rechte auf die 13 relevanten Tabellen. Nur die neue private Aggregatfunktion wurde explizit freigegeben. Die dauerhafte Nutzung erfolgt über den vorhandenen Staging-SQL-Editor, nicht über einen neu eingerichteten nativen Datenbank-Login. Eine neue unabhängige Verbindung wurde nicht behauptet.

## Tatsächlicher Staging-Verbindungstest

Projektidentität über den bestehenden Dashboard-Zugang und den lokalen Staging-Link bestätigt; zusätzlich DDL-Guard für STAGING und exakte TEST_ONLY-Registrierung. Die Dashboard-Anzeige main / PRODUCTION bezeichnet den internen Branch dieses Staging-Projekts.

- Effektive Rolle: `wuxuai_test_preflight_reader`; transaction_read_only: on.
- Aggregat EXECUTE: true; direkte SELECT-Rechte auf 13 Zieltabellen: 0.
- Punkte-Mutator EXECUTE: false.
- Tatsächliches SELECT auf customers: SQLSTATE 42501 / permission denied, ohne Datenausgabe.
- Tatsächlich zusätzlich erreichbare öffentliche SECURITY DEFINER-Funktionen: 5; davon VOLATILE: 3. Triggerfunktionen wurden nicht mitgezählt. Die Funktionen wurden auf Staging nicht aufgerufen.

Diese PUBLIC-Rechte lassen sich nicht durch REVOKE ausschließlich von der neuen Rolle verweigern. Eine Änderung vorhandener PUBLIC-/Produktrechte würde den Scope der neuen Leseschnittstelle überschreiten. Kein Login darf auf dieser Basis eingerichtet oder die Rolle als query-only freigegeben werden. Die feste read-only Sitzung schützt den ausgeführten Preflight, ersetzt aber keine globale Funktions-Allowlist.

## Tatsächlicher Preflight 65 → 109

| Prüfwert | Ergebnis |
|---|---|
| Customer-Kandidat / Membership-Bindung | UNIQUE / true |
| Filiale | WUXUAI TEST ONLY – PRO PHASE 1 |
| Punkte | 65 |
| Erfolgreiche Earn heute / verbleibendes Limit | 0 / 2 |
| Aktive Schwellen 66–109 / aktive 109-Definitionen | 1 / 1 |
| 109-Schwellenzustandszeilen | 1 |
| 109-Customer-Rewards / 109-Reward-Inbox | 0 / 0 |
| Wirksames TEST_ONLY-PRO / gültige Testgrants | false / 0 |
| Grant-Gültigkeitsbeginn und -ende | null / null |
| Reward-Benachrichtigungen | false |
| Collection-Mode | restaurant_controlled_only |

Status: STOP_PRO_TEST_GRANT_NOT_EFFECTIVE. Zusätzlich existiert bereits eine Ziel-Schwellenzustandszeile; daraus wird kein bereits erreichter Reward abgeleitet. Keine Korrektur, kein Grant, keine Punktebuchung und keine Rewardänderung durchgeführt.

## Mail und Scheduler, separat read-only

Cron-Laufzeit: launch_active_jobs = on. Aktive relevante Mail-Jobs: 0; Dispatcher-Jobdefinitionen: 0. Es gibt somit keinen gefundenen Cron-Versandjob. Der Edge-Dispatcher ist deployt; benötigte Secret-Namen sind vorhanden, Werte wurden nicht geöffnet. Eine vollständige Dispatcher-Abschaltung oder der tatsächliche Transportmodus ist damit nicht nachgewiesen. Kein Dispatcher-Aufruf, Scheduler-Start oder Versand wurde ausgelöst. Die Cron-Abfrage gibt niemals Befehle aus, die Zugangsdaten enthalten könnten.

## Lokale Prüfung und Bereinigung

Wegwerfbarer, unverknüpfter lokaler Stack mit 193 committed Migrationen, bestätigten Loopback-Endpunkten und deaktiviertem Cron-Launcher. Synthetische Fixtures nur lokal. Reale SQL-Sitzungen prüften: erlaubtes Aggregat, abgelehnte Tabellenzugriffe, DML/DDL, fehlendes read-only, abgelaufenen Grant, fehlende PRO-Felder, vorhandenen Schwellenzustand, mehrere Customers/Schwellen und vorhandene Inbox. Punkte blieben 65; Earn- und Inbox-Zeilen am Ende 0. Erweiterte lokale ACL-Prüfung reproduzierte die PUBLIC-Rechte-Lücke.

Full Suite genau einmal: 2.232/2.235 bestanden; drei HTTP-Loopback-Tests scheiterten im Sandbox-Kontext mit EPERM. Ausschließlich diese drei wurden mit freigegebenem Loopback-Zugriff erneut ausgeführt: 3/3 PASS. Build im isolierten task-eigenen Verzeichnis PASS; bestehende Chunkgrößenwarnung. Python-Syntaxprüfung PASS. Keine erneute Punkte-/Reward-Golden-Path-E2E-Ausführung.

Lokaler Stack ohne Backup gestoppt, task-eigene Container/Volumes/Netzwerke und temporäre Build-/Logdateien entfernt; temporärer node_modules-Link entfernt. Andere Worktrees und vorhandene Browser-Sitzungen blieben erhalten. Staged Secret-/Token-Scan und git diff --cached --check sind Abschlussgates.

## Änderungen und Grenzen

Keine Anwendungsmigration, kein Produktcode, kein Deployment und keine Businessmutation. Autorisierte Cloudmutation ausschließlich neues diagnostisches Schema/Funktion/Rolle und deren administrative Rechtezuordnung auf Staging. Kein Production- oder Stripe-Zugriff. Git-Abschluss erfolgt ausschließlich für dieses Diagnosepaket.

Stopkriterien: vorhandene PUBLIC-Ausführungsrechte, unwirksames PRO, bestehende Ziel-Schwellenzustandszeile sowie nicht belegte vollständige Mail-Abschaltung. Keine Punktebuchung freigegeben. Status: **NOT READY** für den vollständigen query-only Zugang und den Golden Path; tatsächlicher fester read-only Verbindungstest durchgeführt.
