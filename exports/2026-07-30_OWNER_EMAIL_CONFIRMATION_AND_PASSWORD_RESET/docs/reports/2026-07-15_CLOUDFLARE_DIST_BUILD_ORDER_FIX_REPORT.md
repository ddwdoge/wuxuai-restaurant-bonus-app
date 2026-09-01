# Cloudflare `dist` Build-Reihenfolge Fix

Datum: 2026-07-15

## Ursache

Cloudflare startete den Deploy, obwohl das von Vite generierte Verzeichnis
`/opt/buildhome/repo/dist` noch nicht existierte. `dist/` ist korrekt in
`.gitignore` eingetragen und wird nicht aus Git geladen. Es entsteht erst durch
`npm run build`.

Cloudflare Workers Builds trennt Build und Deploy. Ohne den Build-Befehl
`npm run build` erreicht `wrangler deploy` die konfigurierte
`assets.directory`, bevor Vite die Dateien erzeugt hat.

## Repository-Analyse

1. `npm run build` war im Projekt vorhanden, wurde im fehlerhaften Cloudflare-
   Ablauf aber nicht vor dem Deploy ausgeführt.
2. Nach einem lokalen sauberen Build existieren `dist/`, `dist/index.html` und
   27 erzeugte Dateien.
3. `vite.config.ts` ist korrekt. Vite verwendet das Standard-Ausgabeverzeichnis
   `dist` und benötigt kein abweichendes `outDir`.
4. `wrangler.jsonc` ist als Assets-only-Worker korrekt.
5. `assets.directory: "./dist"` ist korrekt relativ zum Repository-Root.
6. Cloudflare muss zuerst `npm run build` und danach den Deploy ausführen.

## Geänderte Dateien

- `wrangler.jsonc`
- `package.json`
- `docs/21_PRODUCTION_GO_LIVE_PLAN.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-15_CLOUDFLARE_DIST_BUILD_ORDER_FIX_REPORT.md`

## Umsetzung

- `wrangler.jsonc` enthält jetzt `build.command: npm run build` für direkte
  lokale Wrangler-Aufrufe.
- `npm run deploy` baut vor `wrangler deploy` zusätzlich selbstständig.
- `npm run deploy:preview` baut vor `wrangler versions upload` ebenfalls.
- `assets.directory` bleibt korrekt `./dist`.
- `dist/` wird weiterhin nicht versioniert.

## Cloudflare Build-Konfiguration

Verbindliche Einstellungen unter `Settings > Build > Build Configuration`:

```text
Produktionsbranch: main
Root directory: /
Build command: npm run build
Deploy command: npm run deploy
Non-production deploy command: npm run deploy:preview
Node version: 22
```

Benötigte Buildvariablen:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_APP_BASE_URL
```

Die Variablen müssen Buildvariablen sein, weil Vite sie während des Builds in
das Frontend übernimmt. Es wurden keine geheimen Werte in Git geschrieben.

## Lokale Tests

### Sauberer Installations- und Buildtest

- vorhandenes `dist/` vor dem Test entfernt
- `npm install`: erfolgreich
- vor Build: `dist/` fehlt wie erwartet
- `npm run build`: erfolgreich
- nach Build: `dist/` vorhanden
- `dist/index.html`: vorhanden
- erzeugte Dateien: 27

### Wrangler-Test ohne vorhandenes `dist/`

- `dist/` erneut entfernt
- `npm run deploy:check` ausgeführt
- Wrangler startete `[custom build] npm run build`
- anschließend 28 Assets aus `dist/` erkannt
- Dry-Run erfolgreich

### Weitere Prüfungen

- Tests: 5 von 5 erfolgreich
- Lint: 0 Fehler, 12 bestehende Warnungen außerhalb dieses Scopes
- keine UI-, Datenbank-, RPC- oder Produktlogik geändert

## Cloudflare-Dashboard

Die lokale Wrangler-OAuth-Sitzung ist aktiv. Das Browser-Dashboard verlangte
jedoch eine separate Anmeldung, deshalb konnten die sichtbaren Workers-Build-
Felder nicht direkt gespeichert werden. Die Repository-Skripte sind defensiv
aufgebaut; für die verbindliche Live-Prüfung muss der Cloudflare-Trigger die
oben dokumentierte Build-Reihenfolge zeigen.

## Offene Risiken

- Nach dem Push muss der Cloudflare-Build-Log geprüft werden.
- `npm run build` muss vor dem Upload sichtbar erfolgreich sein.
- Die Live-URL muss anschließend die neue Asset-Hash-Version liefern.

## Git-Status

- lokaler Commit erstellt: `Fix Cloudflare dist build order`
- Push nach `origin/main` versucht
- Push blockiert: lokale GitHub-HTTPS-Credentials nicht verfügbar
- SSH-Fallback geprüft, aber für GitHub ist kein freigegebener Public Key hinterlegt
- der Push muss nach erneuter GitHub-Anmeldung wiederholt werden

## Status

**NOT READY** bis der GitHub-Auto-Deploy mit der korrigierten Cloudflare-
Buildkonfiguration live erfolgreich bestätigt ist.
