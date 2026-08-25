# Staging Staff Login Live-Daten Diagnose

Datum: 25.08.2026  
Umgebung: Cloudflare Staging `bonus.wuxuaisbi.com`  
Supabase: `wuxuai-bonus-staging` (`bwhv...qaya`)  
Production: gesperrt

## Ursache

Die auf dem iPhone angezeigte Meldung

> Live-Daten konnten nicht geladen werden. Bitte prüfe die Supabase-Verbindung.

wird im Staff-Login nur verwendet, wenn der Frontend-Build keinen konfigurierten Supabase-Client erzeugen konnte. In diesem Zustand wird der Staff-Kontext-RPC gar nicht aufgerufen.

Der aktuell aktive Staging-Build ist dagegen korrekt konfiguriert:

- Cloudflare-Version: `59f7597d-e09a-481b-a9b0-afa353489b7c`
- erstellt: `2026-08-25T15:02:04.988Z`
- ausgelieferte Supabase-URL verweist auf das bestätigte Staging-Projekt
- ausgelieferter Anon-Schlüssel ist vorhanden; sein Wert wurde nicht ausgegeben
- `get_public_staff_login_context` antwortet für `wu-und-xu-group-gmbh` mit HTTP 200
- Supabase Auth Settings antworten mit HTTP 200
- der Staff-Login leitete mit einer gültigen bestehenden Sitzung in das richtige Staff-Portal weiter

Damit ist der reproduzierte iPhone-Zustand kein aktueller Datenbank-, RLS-, RPC- oder Supabase-Ausfall. Er stammt aus einem vor dem aktuellen Deployment bereits geladenen Frontend-Dokument beziehungsweise Safari-Tab/BFCache-Zustand, in dem die Vite-Supabase-Variablen fehlten. Der Service Worker der Anwendung besitzt keine Fetch- oder Asset-Cache-Logik und ist nicht die Quelle des alten Bundles.

## Failing Request

Im betroffenen Fehlerzustand entsteht kein Supabase-Request: `requireClient()` bricht vor dem Netzwerkzugriff ab, weil der Client fehlt. Daher gelten für diesen Zustand:

- Request URL: keiner
- HTTP-Status: keiner
- RPC: nicht aufgerufen
- SQLSTATE: keiner

Der kontrollierte Request mit dem aktuell ausgelieferten Build:

- Endpoint: `/rest/v1/rpc/get_public_staff_login_context`
- HTTP-Status: 200
- Ergebnis: Restaurantkontext verfügbar und sluggenau

## Cloudflare und Cache

Die aktive HTML-Antwort und die gehashten JavaScript-Bundles liefern `cache-control: public, max-age=0, must-revalidate`. Der aktuelle Hauptbundle enthält sowohl die erwartete Staging-Projekt-URL als auch einen gültigen Anon-Key. Cloudflare meldet für die aktuelle Version keine abweichende Worker-Konfiguration.

Cloudflare speichert bei diesem Deployment keine Git-Commit-SHA in den Versionsmetadaten. Der lokale und remote getrackte Branch steht auf `b5bf73f331df416d4515d99a93e3f5b23f12fd5e`; Zeitpunkt und ausgelieferte Staff-Funktionalität entsprechen diesem Stand, eine kryptografisch gespeicherte Commit-Zuordnung ist in Cloudflare jedoch nicht vorhanden.

## Lösung

Keine Code- oder Datenbankänderung ist erforderlich. Auf dem betroffenen iPhone ist der Staff-Login in einem neuen Safari-Tab aus dem aktuellen QR zu öffnen. Falls der alte Zustand dort weiter erscheint, ausschließlich die Websitedaten von `bonus.wuxuaisbi.com` löschen und erneut öffnen. Ein Cloudflare-Redeploy oder eine Migration wurde nicht durchgeführt.

## Qualität

- Tests: 932/932 bestanden
- Typecheck: bestanden
- Lint: 0 Fehler, 7 bestehende Warnungen
- Build: bestanden
- Supabase Database: erreichbar
- Supabase Auth: erreichbar
- Staff-Kontext-RPC: erreichbar
- RLS-/Grant-Änderung: keine

## Risiken

Der aktuelle Staging-Stand ist technisch gesund. Der physische iPhone-Retest nach Öffnen eines frischen Tabs bleibt als letzter Nachweis offen.

Status: CODE LOCK
