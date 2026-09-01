# Platform Admin V1 – Loop 3D Staging Live Gate

## Ausgangsstand

- Repository: `/private/tmp/wuxuai-v1-canonical-recovery`
- Branch: `codex/v1-canonical-recovery`
- Commit: `c01416ae2528da2b5876137dc8baa8679902aae7`
- Working Tree vor Deployment: sauber
- Migration `20260825001000_platform_admin_referral_limit_contract.sql`:
  lokal und auf Staging synchron

## Cloudflare und Deployment

Die gespeicherte Wrangler-OAuth-Sitzung war abgelaufen. Der reguläre
Cloudflare-OAuth-Flow wurde erneut durchgeführt und erfolgreich bestätigt. Es
wurden keine API- oder OAuth-Tokens ausgegeben oder im Repository gespeichert.

- Worker: `wuxuai-restaurant-bonus-app`
- Staging-Domain: `https://bonus.wuxuaisbi.com`
- Worker-URL: `https://wuxuai-restaurant-bonus-app.dongdongwu4899.workers.dev`
- Version: `788716b3-a429-4121-9ad5-60642bb4bd36`
- Deployment: 25.08.2026, 01:18 Europe/Vienna
- Buildquelle: Commit `c01416a`
- Supabase-Konfiguration: bestätigtes Staging-Projekt `bwhv…qaya`

Es wurde kein Production-Projekt und keine Production-Datenbank verwendet.

## Live-Ergebnis

Die Custom-Domain liefert die neue Restaurant-Control-Center-Oberfläche. Der
authentifizierte Platform Admin konnte `/platform-admin` öffnen und das echte
Testrestaurant „Wuxuai bonus“ auswählen.

Bestätigt sichtbar:

- Konto und Vertrag einschließlich Restaurant-, SaaS-, Trial- und Setupstatus
- Nutzung mit echten Nullwerten
- Referral-Vertrag mit 14 Tagen, Einladender 100 %, Freund 50 %
- `Einladungen pro Kunde / Monat: 5` aus dem live erreichbaren Control-Center-RPC
- Referral-KPIs ohne alte 30/15-Texte
- Einlösungen im 15-Minuten-Vertrag ohne primäre sechsstellige Code-UX
- Registration-, E-Mail-, Standort- und Staff-Health
- Cron als „Keine Telemetrie verfügbar“
- bereinigter, unveränderbarer Audit-Auszug
- Bonusnetzwerk als V2 und nicht aktiviert
- Stripe als nicht aktiviert/zurückgestellt
- `0`, `–` und unavailable werden getrennt dargestellt

Bei 424 px betrugen `scrollWidth` und `clientWidth` jeweils 424 px. Es lag kein
globaler horizontaler Overflow vor.

## Sicherheit

- Platform Admin live: erlaubt
- anonymer direkter RPC-Aufruf: HTTP 401, SQLSTATE 42501
- kein Platform-Admin-Payload an Anon ausgegeben
- statische und automatisierte Rollenverträge für Owner, Staff und Customer:
  grün

Echte negative Owner-, Staff- und Customer-Sitzungen standen in diesem Lauf
nicht zur Verfügung. Diese drei Live-Rollengates werden deshalb nicht als
vollständig verifiziert markiert.

## Offene Live-Gates

Der aktive Platform Admin besitzt nur das noch nicht abgeschlossene
Testrestaurant „Wuxuai bonus“ als Owner-Tenant. Der Owner-Bereich leitet deshalb
korrekt ins Onboarding und erlaubt keinen Zugriff auf die Referral-Einstellungen.
Ein 5 → 3 → 5-Test über den bestehenden Owner-Flow war ohne fremde Zugangsdaten
oder unzulässige Onboarding-Manipulation nicht möglich. Es wurden keine Daten als
Abkürzung geändert.

Die authentifizierte Browseroberfläche stand live mit 424 px zur Verfügung.
390, 430, 768, 1024 und 1440 px sind automatisiert abgedeckt, konnten aber nicht
alle mit derselben echten Platform-Admin-Sitzung live emuliert werden.

## Qualität

- Tests: 876/876 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build und Cloudflare-Custom-Build: PASS
- DB-Linter Staging: 0 Fehler
- Migration History: synchron
- Anon-Direktzugriff: blockiert
- Production: gesperrt
- Stripe: zurückgestellt

## Status

`CODE LOCK / NOT FINAL LOCK`

Deployment und primärer Platform-Admin-Liveflow sind erfolgreich. Final Ready
bleibt bis zum Owner-Dynamiktest, den drei echten negativen Rollensitzungen und
der vollständigen Live-Viewport-Matrix offen.
