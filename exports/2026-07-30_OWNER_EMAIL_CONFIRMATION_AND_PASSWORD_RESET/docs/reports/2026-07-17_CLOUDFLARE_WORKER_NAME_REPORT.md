# Cloudflare Worker-Name

Datum: 2026-07-17

## Aufgabe

Den Worker-Namen in `wrangler.jsonc` auf
`wuxuai-restaurant-bonus-app` setzen.

## Geänderte Datei

- `wrangler.jsonc`

## Prüfung

- Worker-Name: `wuxuai-restaurant-bonus-app`
- `npm run deploy:check`: erfolgreich
- Custom Build `npm run build`: erfolgreich
- Wrangler erkannte 28 Dateien aus `dist/`
- keine UI-, Produkt-, Datenbank- oder RPC-Änderung

## Offenes Risiko

Der tatsächliche Cloudflare-Deploy und der daraus resultierende Live-Hostname
wurden nicht ausgeführt. Die bestehende dokumentierte Live-URL wurde deshalb
nicht vorzeitig geändert.

## Status

**NOT READY** bis der neue Worker-Name nach Deploy im Cloudflare-Projekt
bestätigt wurde.
