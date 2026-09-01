# WUXUAI Bonus - Owner-Bonusprogramm V1 Final Staging Gate

Datum: 2026-08-28  
Branch: `codex/v1-canonical-recovery`  
Commit: `1958fcb2348cf956444f4c725d0e04d8f217e97c`  
Cloudflare Worker: `wuxuai-restaurant-bonus-app`  
Deployment-Version: `d349600c-f4de-4892-8c67-cb359772b0bf`

## Ursache und Ziel

Nach dem Code-Lock musste die reduzierte Owner-Seite `Bonusprogramm` auf der
echten Staging-Umgebung visuell, funktional und mit realen Rollen geprueft
werden. Es wurden keine neuen Funktionen und keine fachlichen Aenderungen
vorgenommen.

## Staging-Deployment

- Der aktuelle Remote-synchrone Commit wurde mit dem bestehenden
  Cloudflare-Worker-Vertrag deployt.
- Der Build verwendete den vorhandenen Fail-Closed-Vertrag fuer die zwei
  erforderlichen Vite-Supabase-Variablen, ohne deren Werte auszugeben.
- Cloudflare bestaetigte die aktive Version
  `d349600c-f4de-4892-8c67-cb359772b0bf` mit 100 Prozent Traffic.
- Keine Production-, Supabase- oder Stripe-Aktion wurde ausgefuehrt.

## Owner-Live-Test

- Echte Owner-Sitzung fuer `Kaffee Konditorei baeckerei`: PASS.
- Sichtbar sind ausschliesslich Seitentitel, kurze Einfuehrung und
  `Freunde einladen & 2x Bonus`.
- Aktivierung, fester Multiplikator 2x, 7/14/28/eigene Dauer und monatliches
  Einladungslimit sind sichtbar und bedienbar.
- Modus, Bonusmodus, Euro pro Punkt, Einloesequote, Stempel, Regelanlage,
  Mindestbetrag, aktive Regeln und technischer Aktivstatus sind nicht sichtbar.
- Der Referral-Bereich folgt mit 22 Pixel Abstand direkt auf den Seitenkopf;
  es gibt keine leeren Legacy-Karten.
- Browser-Konsole: keine Warnungen oder Fehler waehrend des Owner-Gates.

## Persistenz

- Dauer `14 -> 28 -> Speichern -> Reload`: PASS.
- Dauer `28 -> 14 -> Speichern -> Reload`: PASS.
- Monatslimit `5 -> 3 -> Speichern -> Reload`: PASS.
- Monatslimit `3 -> 5 -> Speichern -> Reload`: PASS.
- Abschliessender Staging-Zustand: Dauer 14 Tage, Monatslimit 5.

## Responsive Live-Matrix

| Breite | Ergebnis | Globaler Overflow | Legacy-UI |
| --- | --- | --- | --- |
| 390 px | PASS | Nein | Nicht sichtbar |
| 430 px | PASS | Nein | Nicht sichtbar |
| 768 px | PASS | Nein | Nicht sichtbar |
| 1024 px | PASS | Nein | Nicht sichtbar |
| 1440 px | PASS | Nein | Nicht sichtbar |

Auf 390 und 430 Pixeln ist der Speichern-Button 48 Pixel hoch. Texte,
Pflichtfelder, Vorschau und Aktion bleiben ohne horizontales Scrollen lesbar.

## Rollen-Gate

- Reale Staff-only-Sitzung: `/admin/loyalty` zeigt
  `Falscher Anmeldebereich` und keinen Owner-Inhalt: BLOCKED / PASS.
- Reale Customer-Sitzung: `/admin/loyalty` zeigt
  `Falscher Anmeldebereich` und keinen Owner-Inhalt: BLOCKED / PASS.
- Normale Tenant-RLS, Punkte- und Referral-Vertraege wurden nicht geaendert.

## Qualitaet

- Tests: 1061/1061 PASS.
- Typecheck: PASS.
- Lint: PASS mit 0 Fehlern und 7 bereits bestehenden Warnungen ausserhalb des
  Scopes.
- Production Build: PASS.
- `git diff --check`: PASS.
- DB-Migration: keine.

## Geaenderte Dateien

- Nur dieser Abschlussbericht wurde im Gate neu erstellt.
- Keine Anwendungs-, Businesslogik-, Datenbank- oder Security-Datei geaendert.

## Risiken

Keine offenen Risiken im geprueften Owner-Bonusprogramm-V1-Umfang.

## Status

**FINAL LOCK**

Production bleibt gesperrt. Stripe bleibt zurueckgestellt.
