# Owner Referral Settings - Final Staging Owner Gate

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Deployment-Commit: `54534cf50375e73db410ffe9f7d4da1fddd10a8b` (`v44`)

## Deployment

- Cloudflare-Worker: `wuxuai-restaurant-bonus-app`
- Staging-Domain: `https://bonus.wuxuaisbi.com`
- Aktive Deployment-ID: `831b113f-4c03-45d5-b00c-8c18e1a0780f`
- Deployment-Zeitpunkt: `2026-08-25T21:31:40.039Z`
- Ausgeliefertes Hauptbundle: `/assets/index-B1i9dggo.js`
- Supabase: Staging-Projekt `bwhvfjuwixgwduoeqaya`
- Production: nicht veraendert

Die zu Beginn lokal freigegebenen Referral-Navigationsaenderungen wurden noch
vor dem finalen Upload als Commit `v44` festgeschrieben. Der ausgelieferte Build
stammt aus diesem Commit. Vor dem Upload wurde ein
fehlendes Vite-Environment im temporaeren Worktree erkannt. Der fehlerhafte
Build wurde nicht deployt. Der finale Build wurde kontrolliert mit der bereits
vorhandenen Staging-Konfiguration aus dem Hauptarbeitsverzeichnis erzeugt; der
Supabase-Schluessel wurde weder ausgegeben noch gespeichert.

## Owner Live-Test

Die echte Owner-Sitzung fuer `Kaffee Konditorei baeckerei` wurde serverseitig
als Owner erkannt. Dashboard und Einstellungsuebersicht waren erreichbar.

- Navigation `Freunde einladen & 2x Bonus`: sichtbar
- Ziel: `/admin/loyalty#freundschaftsbonus`
- Referral aktiv: Ja
- Dauer beim Start: 14 Tage
- Monatliches Einladungslimit beim Start: 5
- Individuelle Dauer: sichtbar, ganze Werte von 1 bis 365

## Speicher- und Reload-Test

Alle Aenderungen wurden ueber die echte Owner-Oberflaeche gespeichert und nach
einem vollstaendigen Reload erneut gelesen:

| Test | Reload | Wiederherstellung |
| --- | --- | --- |
| 14 -> 28 Tage | 28 bestaetigt | 28 -> 14, 14 bestaetigt |
| Limit 5 -> 3 | 3 bestaetigt | 3 -> 5, 5 bestaetigt |

Der finale Staging-Zustand ist wieder Dauer 14 und Limit 5.

## Audit

Vier `REFERRAL_BONUS_SETTINGS_UPDATED`-Ereignisse wurden fuer das richtige
Restaurant gefunden:

- 14 -> 28 bei Limit 5
- 28 -> 14 bei Limit 5
- Limit 5 -> 3 bei Dauer 14
- Limit 3 -> 5 bei Dauer 14

## Sicherheit

- Staff-Zugriff auf den Owner-Bereich wurde im vorherigen Live-Aufruf dieser
  Aufgabe serverseitig mit `Falscher Anmeldebereich` blockiert.
- Customer- und Fremd-Owner-Isolation bleiben durch die unveraenderte
  serverseitige RPC-/Tenant-Pruefung und die automatisierten Vertragstests
  abgedeckt; separate echte Sitzungen standen fuer dieses Gate nicht bereit.
- Keine RLS-, Grant-, RPC- oder Businesslogik wurde geaendert.

## Responsive Gate

Die Breiten 390, 430, 768 und 1024 konnten in der eingebauten Browseransicht
nicht verlaesslich emuliert werden: Die angeforderte Viewport-Umschaltung blieb
messbar bei 1280 CSS-Pixeln. Deshalb wird die Live-Matrix nicht als PASS
behauptet. Die bestehenden responsiven CSS-Regeln und automatisierten Tests
sind gruen, ersetzen aber den geforderten Live-Sichttest nicht.

## Qualitaet

- Tests: 991/991 PASS
- Typecheck: PASS
- Lint: PASS
- Build: PASS
- `git diff --check`: PASS
- Datenbankmigration: keine
- Businesslogik: unveraendert

## Ergebnis

- Staging UI deployed: Ja
- Owner Login: PASS
- Owner Navigation: PASS
- Referral Settings: PASS
- Save/Reload: PASS
- Audit: PASS
- Live Responsive 390-1024: OFFEN
- Production: LOCKED
- Stripe: DEFERRED

Status: **CODE LOCK / NOT FINAL LOCK**

Pruef-ZIP:
`exports/2026-08-25_OWNER_REFERRAL_SETTINGS_FINAL_STAGING_GATE.zip`
