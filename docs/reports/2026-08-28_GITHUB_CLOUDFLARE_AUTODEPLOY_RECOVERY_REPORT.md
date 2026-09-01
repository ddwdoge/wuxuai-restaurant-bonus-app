# GitHub zu Cloudflare Autodeploy Recovery

Datum: 2026-08-28  
Repository: `ddwdoge/wuxuai-restaurant-bonus-app`  
Branch: `codex/v1-canonical-recovery`  
Gepruefter Commit: `1116319b1cb2acb597137ec12966651e2d1916bb`

## Ursache

Der lokale und der echte GitHub-Remote-Branch zeigen auf denselben Commit.
GitHub meldet fuer diesen Push weder Cloudflare-Check-Runs noch Commit-Status.
Im aktuell angemeldeten GitHub-Konto `wuxuaisbi` sind keine GitHub Apps
installiert. Die fuer Workers Builds erforderliche App `Cloudflare Workers and
Pages` ist daher nicht vorhanden und kann keine Push-Ereignisse an Cloudflare
liefern.

Zusaetzlich besteht eine Identitaetsabweichung: Der Browser ist als
`wuxuaisbi` angemeldet, das Repository gehoert jedoch `ddwdoge`. Der
Installationsdialog bietet deshalb nur `wuxuaisbi/WUXUAI-Bonus-os` an. Diese
falsche Installation wurde nicht bestaetigt.

Die letzten zehn Cloudflare-Worker-Deployments haben als Quelle
`Unknown (deployment)` und keinen Git-Commit. Sie wurden ueber den lokal
vorhandenen Vertrag `npm run deploy -> wrangler deploy` hochgeladen und werden
deshalb im Dashboard als `Manuell bereitgestellt` klassifiziert.

## Aktueller Deploymentvertrag

- GitHub Actions: nicht vorhanden
- eingecheckter Deployweg: Wrangler CLI
- aktive Workers-Builds-Verbindung: nicht nachweisbar / GitHub App fehlt
- aktuell beobachteter Branch: keiner
- aktueller Push-Branch: `codex/v1-canonical-recovery`
- automatische Deployments: deaktiviert durch fehlende Repository-Verbindung

## Build-Sicherheitskorrektur

Der bisherige `npm run build` startete Vite auch dann, wenn die beiden
Supabase-Buildvariablen fehlten. Der neue Guard
`scripts/validate-build-env.mjs` verlangt:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Es werden nur fehlende Variablennamen, niemals Werte ausgegeben. Ein Build ohne
Variablen endet vor TypeScript/Vite mit Status 1; mit der bestaetigten lokalen
Staging-Konfiguration laeuft der Produktionsbuild erfolgreich durch.

## Geaenderte Dateien

- `package.json`
- `scripts/validate-build-env.mjs`
- `tests/build-env-guard.test.mjs`
- `docs/19_CHANGELOG.md`
- dieser Bericht

## Verifikation

- lokaler HEAD: `1116319b1cb2acb597137ec12966651e2d1916bb`
- Remote-HEAD: `1116319b1cb2acb597137ec12966651e2d1916bb`
- Push: PASS
- Cloudflare-Check-Runs fuer letzten Push: 0
- Cloudflare-Commit-Status fuer letzten Push: 0
- GitHub Apps im angemeldeten Konto: 0
- Fail-Closed-Negativtest: PASS
- Tests: 1048/1048 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build mit Staging-Variablen: PASS
- Datenbank/RLS: unveraendert

## Erforderliche autorisierte Aktion

1. GitHub im Testbrowser als Repository-Eigentuemer `ddwdoge` anmelden.
2. `Cloudflare Workers and Pages` nur fuer
   `ddwdoge/wuxuai-restaurant-bonus-app` installieren.
3. In Cloudflare beim Worker `wuxuai-restaurant-bonus-app` unter
   `Settings -> Builds` dieses Repository verbinden.
4. Produktionsbranch des Staging-Workers auf
   `codex/v1-canonical-recovery` setzen.
5. Buildvariablen beider Pflichtnamen im Workers-Build-Trigger bestaetigen.
6. Erst danach den Guard committen und den kontrollierten Push ausfuehren.

## Nicht durchgefuehrt

- keine Installation im falschen GitHub-Konto
- keine Cloudflare-Einstellungsveraenderung
- kein manueller Staging-Deploy
- kein Push oder Merge
- keine Production-, Datenbank- oder Businesslogik-Aktion

Status: NOT READY - korrekte GitHub-Anmeldung und App-Autorisierung erforderlich
