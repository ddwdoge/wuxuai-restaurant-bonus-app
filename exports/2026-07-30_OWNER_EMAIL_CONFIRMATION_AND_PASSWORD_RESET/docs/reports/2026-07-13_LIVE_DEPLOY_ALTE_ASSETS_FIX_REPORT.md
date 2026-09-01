# WUXUAI Bonus V1 – Live Deploy Alte Assets Fix Report

Datum: 2026-07-13  
Live URL: `https://wuxuai-restaurant-bonus-os.dongdongwu4899.workers.dev`  
Status: NOT READY

## Ursache

Der lokale Build enthält die bereinigte Runtime ohne Demo-Daten. Die Live-App
lädt aber weiterhin alte Cloudflare-Assets. Der neue Build wurde nicht live
ausgeliefert.

## Build Ergebnis

Befehl:

```bash
npm run build
```

Ergebnis: erfolgreich.

Aktueller lokaler Build:

```text
dist/index.html
dist/assets/index-BM1hqVYI.js
dist/assets/loyaltyService-DzpkbjDX.js
dist/assets/CustomerPortal-Yntt-8u-.js
```

`dist/` wurde erstellt.

## Lokale Asset-Prüfung

Geprüft:

```text
Kai Sushi
demoData
demoRestaurant
demoBranding
demoUser
isLocalDemoMode
wuxuai-demo-state
Demo-Modus
demo@example
fake
dummy
```

Ergebnis:

- Keine Treffer in `src`.
- Keine Treffer in `dist`.
- Keine alten bekannten Live-Assetnamen in `dist`.

## Deploy-Befehl

Kein Deploy-Befehl ausgeführt.

Grund:

- `package.json` enthält kein `deploy`-Script.
- Keine `wrangler.toml` vorhanden.
- Keine Cloudflare-/Workers-/Pages-Konfigurationsdatei im Projekt vorhanden.
- Lokal ist kein `wrangler`-Binary verfügbar.
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_API_TOKEN` und
  `CF_ACCOUNT_ID` sind im Environment nicht gesetzt.

Laut Auftrag durfte kein Deploy-Befehl geraten werden.

## Cloudflare Env Prüfung

Status: Manuell nötig.

Nicht prüfbar aus Codex, weil keine Cloudflare-Credentials und keine
Projektkonfiguration vorhanden sind.

Manuell prüfen:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_APP_BASE_URL
```

Nicht setzen:

```text
SUPABASE_ACCESS_TOKEN
Service Role Key
```

## Live Asset Prüfung

Live-Root:

```text
HTTP 200
```

Live-HTML lädt weiterhin:

```text
/assets/index-BOgUQdSo.js
/assets/index-9ja449Q2.css
```

Erwarteter neuer lokaler Build:

```text
/assets/index-BM1hqVYI.js
/assets/index-CpRFHEQ3.css
```

Bewertung:

Live lädt nicht den neuen Build.

## Cache Prüfung

Cloudflare Antwort:

```text
cf-cache-status: HIT
cache-control: public, max-age=0, must-revalidate
```

Neue Asset-URLs aus dem lokalen Build werden live nicht als JS-Dateien
ausgeliefert, sondern fallen auf HTML zurück. Das spricht dafür, dass der neue
Build nicht deployed wurde, nicht nur für Browsercache.

## Live Smoke Test

Geprüft:

- `/`
- `/w/akakiko-hietzing`

Ergebnis:

- Beide Routen liefern HTML mit alten Asset-Hashes.
- Der neue Live-Code ist daher nicht aktiv.
- Customer-Slug konnte nicht mit dem neuen Build live validiert werden.

## QR Center Live-Link Prüfung

Nicht live geprüft.

Grund:

- Neuer Build ist nicht live aktiv.
- QR Center benötigt außerdem Restaurant-Portal-Kontext.

Code-seitig nutzt QR Center seit dem vorherigen Fix `VITE_APP_BASE_URL` oder
den aktuellen Origin. Live-Verifikation bleibt offen.

## Was wurde nicht geändert

- Keine Produktlogik.
- Keine UI.
- Keine Datenbank.
- Keine RPCs.
- Keine Tages-PIN.
- Keine Punkte-/Reward-/Willkommensgeschenk-/Bonus-Boost-Logik.

## Offene Risiken

- Cloudflare Deploy muss manuell oder mit sauberer Projektkonfiguration
  ausgeführt werden.
- Cloudflare Env muss manuell geprüft werden.
- Nach Deploy muss geprüft werden, ob Live `index-BM1hqVYI.js` oder einen neu
  erzeugten aktuellen Hash lädt.
- Nach Deploy müssen `/`, `/w/akakiko-hietzing` und QR Center erneut live
  geprüft werden.

## Empfohlener nächster Schritt

Cloudflare Deploy-Konfiguration hinzufügen oder den bestehenden externen
Deploy-Weg dokumentieren, zum Beispiel mit eindeutigem Projekt:

```text
wrangler.toml
oder package.json deploy-Script
oder dokumentierter Cloudflare Pages Deploy-Prozess
```

Danach:

```text
npm run build
Deploy
Live Asset Hash prüfen
Smoke Test
```

## Status

NOT READY
