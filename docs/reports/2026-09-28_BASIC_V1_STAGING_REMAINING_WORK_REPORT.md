# BASIC V1 Staging-Restarbeiten

Stand: 28.09.2026, Europe/Vienna

## Scope

Production-Redemption-Fix integrieren und auf Staging negativ pruefen;
Marketing-Domain, Monitoring, Production-Mail, Upgrade-/Backup-/Restore-Vertrag
read-only untersuchen; Release-Manifest fuer den spaeteren Production-Rollout
festhalten. Keine Production-Migration, kein Production-Deployment, keine
Businessaktivierung und kein Stripe-Zugriff.

## Source und Staging-Integration

- Ausgangs- und Remote-HEAD: `f1e767ae2376cb993ea3debce8fa6a8dfc20f032`.
- Enger Commit: `12823a6a9de2b3a346aaa67ada6d63c69817d1b6`.
- Commitumfang: Production-/Staging-Bindung der Redemption-Funktion, fokussierte
  Tests, Production-Runbook und Production-Preparation-Bericht.
- Normaler Fast-forward-Push auf `origin/codex/v1-release-integration`: PASS.
- Remote-Paritaet danach: `0/0`.
- Deployment nur von `redemption-confirmation` auf das verifizierte
  Staging-Projekt: Version 1 → 2, ACTIVE, `verify_jwt=true`.
- Staging-Origin ohne legitime Sitzung: `401 AUTH_REQUIRED`.
- Production-Origin auf Staging: `403 REDEMPTION_ORIGIN_BLOCKED`.
- Fremder Origin auf Staging: `403 REDEMPTION_ORIGIN_BLOCKED`.
- Keine Businesswrites und keine Restaurant-/Subscription-/Trialmutation.
- Der GitHub-/Cloudflare-Pfad lud eine neue Preview-Version hoch, aktivierte sie
  jedoch nicht. Der aktive Staging-Web-Worker blieb unveraendert auf Version
  `7e89c92e-27ba-474f-a090-f2f1a5469168`.

## Marketing-Domain HTTP 530

`bonus.wuxuaisbi.com` loest auf Cloudflare-Proxy-Adressen auf, liefert aber
HTTP 530 mit Cloudflare-Fehler 1016 (`Origin DNS error`). Die beiden getrennten
App-Domains `app.bonus.wuxuaisbi.com` und
`staging-app.bonus.wuxuaisbi.com` liefern HTTPS 200. Damit liegt kein
allgemeiner Worker- oder TLS-Ausfall vor; die Marketing-Domain zeigt auf einen
nicht aufloesbaren beziehungsweise nicht mehr gueltigen Origin.

Konkrete Behebung, noch nicht ausgefuehrt:

1. Den fachlich vorgesehenen Landingpage-Host verbindlich bestimmen.
2. Den aktuellen Cloudflare-DNS-/Custom-Hostname-Eintrag read-only im Dashboard
   gegen diesen Host vergleichen.
3. Nur im separaten Domain-Rollout-Gate den fehlerhaften Origin durch den
   gueltigen Landingpage-Host ersetzen oder eine explizite Worker-Route fuer die
   Landingpage setzen.
4. DNS, Zertifikat, HTTPS 200, Canonical-/Redirect-Vertrag und Trennung von
   `app`/`staging-app` pruefen.

Die Marketing-Domain darf nicht stillschweigend auf die Production-App gelegt
werden; Canonical Contract und Guardrails trennen Landingpage und App.

## Monitoring-Nachweis

Im Repository und im read-only Providerinventar ist kein aktiver externer
Uptime-/Error-/Alarmdienst nachweisbar. Sentry wird im Runbook nur als offene
Anforderung genannt. Cloudflare- und Supabase-Logs sowie das interne Health
Center sind Diagnosequellen, aber kein belegter externer Alarmkanal.

Vor Production erforderlich:

- Uptime-Monitor fuer Production-App und einen harmlosen Health-Endpunkt;
- Error-Tracking mit datensparsamer Redaction;
- Alarmkanal, On-call-Verantwortlicher und P0/P1-Reaktionsweg;
- synthetischer, nicht mutierender Check fuer Auth-/RPC-Erreichbarkeit;
- dokumentierter Testalarm vor Go-Live.

Es wurde keine Monitoring-Konfiguration angelegt oder veraendert.

## Production-Mailkonfiguration

Read-only vorhandene Runtime-Namen umfassen SMTP Host, Port, Benutzer,
Passwort, Absendername/-adresse, App-Basis und Scheduler-Secret. Nicht als
vorhandener Name belegt ist `SMTP_REPLY_TO`. Der aktuelle Dispatcher verlangt
diesen Wert und antwortet sonst fail-closed mit 503. Der Name
`TRANSACTIONAL_MAIL_MODE` ist ebenfalls nicht belegt; sein Code-Default ist
`general`, was keine ausreichende Production-Freigabe darstellt.

Nicht nachgewiesen sind die fachliche Richtigkeit der Werte, Supabase-Auth-SMTP,
SPF/DKIM/DMARC, Redirects, Bounce-/Complaint-Verarbeitung sowie eine physische
Zustellung an ein autorisiertes internes Postfach. Konkrete Behebung erfolgt
erst im Mail-Rollout-Gate: fehlende Namen sicher setzen, Werte ohne Ausgabe
validieren, Auth-Mail separat testen und Customer-Mail-Scheduler deaktiviert
lassen.

## Upgrade-Probe 124–185

Eine neue isolierte lokale Schema-Probe wurde aus dem committed Source
aufgebaut. Ausgangspunkt waren exakt Migrationen 1–123. Ergebnisse:

- Checkpoint 149: Push PASS, DB-Lint PASS.
- Checkpoint 165: Push PASS, DB-Lint PASS.
- Checkpoint 173: Push PASS, DB-Lint PASS.
- Checkpoint 179: Push PASS, DB-Lint PASS.
- Checkpoint 185: Push PASS, DB-Lint PASS.
- Repeat-Dry-Run bei 185: leer / PASS.
- Task-eigener lokaler Stack und Tempdateien danach entfernt.

Die Probe ist schema-/migrationsbezogen und verwendet keine Production-Daten.
Vor Production bleiben ein geschuetzter Snapshot-/Fingerprint-Vergleich sowie
die jeweiligen Rollen-/RLS-/Direkt-RPC-Gates an jedem Checkpoint Pflicht.

## Backup und Restore

Production weist acht physische Backups mit Status `COMPLETED` aus; das neueste
gelesene Backup stammt vom 28.09.2026. WAL-G ist aktiv, PITR ist deaktiviert.
Die installierte Supabase-CLI bietet `backups restore` nur als PITR-Restore.
Damit ist trotz vorhandener Backups kein in diesem Task tatsaechlich
ausgefuehrter oder nachweisbar sofort verfuegbarer Restore-Weg belegt.

Production-Stop-Gate:

- unmittelbar vor Migrationen ein frisches `COMPLETED`-Backup;
- dokumentierter, berechtigter Dashboard-/Support-Restore-Weg fuer das
  physische Backup oder vorab aktivierter und getesteter PITR-Vertrag;
- benannter Restore-Verantwortlicher und akzeptierte RTO/RPO;
- Restore-Probe auf einem isolierten Ziel ohne Ueberschreiben von Production.

Ein SQL-Down-Rollback der Migrationen 124–185 wird nicht behauptet.

## Testnachweise

Der technische Fix wurde vor dem Commit mit 10/10 fokussierten Tests,
2.104/2.104 Gesamttests, Typecheck, Lint ohne Fehler und Build geprueft. In
diesem Folgeauftrag wurde wegen bytegleichem Source keine Full Suite
wiederholt. Die neue isolierte Upgrade-Probe und die physischen Staging-
Negativaufrufe sind oben separat ausgewiesen.

## Ampel

### Staging fertig — GRUEN

- Commit und Remote parity PASS.
- Staging 185/185 bleibt autoritativ.
- Redemption Edge Version 2 aktiv; Origin-/Projektvertrag fail-closed.
- Keine Businesswrites; Production unveraendert.

### Production technisch offen — GELB

- Production weiterhin 123/185 und alter App-/Edge-Stand.
- Restore-Weg nicht praktisch nachgewiesen.
- Marketing-Domain 1016/530.
- externes Monitoring/Alarmierung nicht belegt.
- Production-Mail nicht vollstaendig konfiguriert oder physisch verifiziert.
- Release-Manifest liegt vor; Rollout wurde nicht ausgefuehrt.

### Extern blockiert — ROT

- Legal, Privacy, Tax, reales KYB, Kassa, Seller und Stripe LIVE.
- Keine echte Restaurantaktivierung und keine Production-Freigabe.

Status: **STAGING FERTIG / PRODUCTION TECHNISCH OFFEN / EXTERN BLOCKIERT**
