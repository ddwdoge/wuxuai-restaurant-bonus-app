# Cloudflare Wrangler und GitHub Auto-Deploy

Datum: 2026-07-15

## Ursache

Cloudflare meldete `Keine Wrangler-Konfiguration erkannt`, weil im Root des
GitHub-Repositories weder `wrangler.jsonc`, `wrangler.json` noch
`wrangler.toml` vorhanden war. Zusätzlich fehlten ein reproduzierbarer
Wrangler-CLI-Eintrag und Deploy-Skripte in `package.json`.

Das Projekt ist eine React/Vite-SPA. Vite erzeugt ausschließlich statische
Dateien in `dist/`; ein separater Worker-Entry-Point existiert nicht und wird
für diesen Deployment-Typ nicht benötigt.

## Geänderte Dateien

- `wrangler.jsonc`
- `.nvmrc`
- `.env.example`
- `package.json`
- `package-lock.json`
- `docs/21_PRODUCTION_GO_LIVE_PLAN.md`
- `docs/19_CHANGELOG.md`
- `docs/reports/2026-07-15_CLOUDFLARE_WRANGLER_GITHUB_AUTODEPLOY_REPORT.md`

## Wrangler-Konfiguration

Die neue Konfiguration definiert:

- Worker-Name `wuxuai-restaurant-bonus-os`
- Compatibility Date `2026-07-15`
- Assets-Verzeichnis `./dist`
- SPA-Fallback `single-page-application`
- `keep_vars: true`, damit Dashboard-Variablen bei Deployments erhalten bleiben
- offizielles Wrangler-JSON-Schema

Es wurde bewusst kein `main` und kein Assets-Binding eingetragen. Das Projekt
ist ein reiner statischer Assets-Worker und enthält keine parallele
Worker-Funktion.

## GitHub Auto-Deploy

Cloudflare Workers Builds muss den Repository-Root verwenden:

```text
Produktionsbranch: main
Root-Verzeichnis: /
Build-Befehl: npm run build
Deploy-Befehl: npm run deploy
Preview-Deploy-Befehl: npm run deploy:preview
Node-Version: 22
```

Wrangler ist als exakte Dev-Abhängigkeit `4.111.0` gespeichert. `.nvmrc` und
`package.json#engines` legen Node 22 oder neuer fest.

## Environment Variables

Erforderliche Cloudflare-Buildvariablen:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_APP_BASE_URL
```

Diese Werte müssen unter Workers Builds als Build-Variablen gesetzt werden.
Vite benötigt sie beim Build; Worker-Runtime-Bindings allein reichen dafür
nicht. Es wurden keine echten Werte in Git geschrieben.

Nicht zulässig und nicht übernommen:

- `SUPABASE_ACCESS_TOKEN`
- Supabase Service-Role-Key
- `.env`
- `.env.local`

## Lokale Validierung

### Qualität

- `npm run lint`: erfolgreich, 0 Fehler; 12 bestehende Warnungen außerhalb des
  Deployment-Scopes
- `npm test`: erfolgreich, 5 von 5 Tests
- `npm audit`: erfolgreich, 0 bekannte Schwachstellen
- `npm run build`: erfolgreich mit Node 24 gegen den festgelegten Standard
  Node 22+

### Wrangler

- `npm run deploy:check`: erfolgreich
- Wrangler-Version: `4.111.0`
- `wrangler.jsonc`: erkannt und ohne Schemafehler gelesen
- Assets: 28 Dateien aus `dist/` erkannt
- Bindings: keine erforderlich

### SPA-Routing

Lokaler Assets-Worker mit Wrangler geprüft:

- `/`: HTTP 200
- `/admin`: HTTP 200
- `/admin/settings/branding`: HTTP 200
- `/staff/akakiko-hietzing`: HTTP 200
- `/w/akakiko-hietzing`: HTTP 200

Alle direkten Routen lieferten `text/html` über den vorgesehenen SPA-Fallback.

## Was nicht geändert wurde

- keine UI
- keine Produktlogik
- keine Supabase-Migration
- keine RPCs oder RLS-Policies
- keine Auth-, Punkte-, Tages-PIN- oder Einlösungslogik
- kein echter Cloudflare-Deploy

## Offene Risiken

Die lokale Konfiguration ist deployfähig. Nicht aus dem Repository heraus
prüfbar sind aktuell:

1. ob das richtige GitHub-Repository im Cloudflare-Projekt verbunden ist,
2. ob der Produktionsbranch `main` ausgewählt ist,
3. ob die drei Vite-Variablen im Produktions-Build-Trigger gesetzt sind,
4. ob ein Push den Workers Build und Live-Deploy erfolgreich auslöst.

Vor Live-Freigabe muss im Cloudflare-Dashboard ein GitHub-Build ausgelöst und
die Live-URL inklusive einer direkten Customer-Route geprüft werden.

## Status

**NOT READY**

Begründung: Konfiguration, Build, Sicherheit und lokaler Worker-Flow sind grün;
der externe GitHub-Auto-Deploy und seine Buildvariablen wurden noch nicht live
verifiziert.
