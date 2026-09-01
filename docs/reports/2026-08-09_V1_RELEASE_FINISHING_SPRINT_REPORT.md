# WUXUAI Restaurant Bonus – V1 Release Finishing Sprint

Datum: 2026-08-09  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `e095b0b`  
Stripe: ausdrücklich zurückgestellt

## Ursache und Ausgangszustand

Vor dem Sprint waren der zentrale Kundenlogin, der prefetch-sichere
E-Mail-Bestätigungsparser und das 15-Minuten-Präsentationsfenster für normale
Punktebelohnungen bereits vorhanden. Willkommens- und Geburtstagsgeschenke
verwendeten dagegen primär den sechsstelligen Mitarbeitercode. Der aktuelle
Retention-Vertrag hatte die automatische Geburtstagszuteilung deaktiviert und
durch einen manuellen Kunden-Draw ersetzt. Für Geburtstag- und
Punkte-Schwellen-E-Mails gab es keinen Transaktionsqueue-Vertrag.

Baseline:

- Typecheck: erfolgreich
- Lint: erfolgreich
- Tests: 649/649
- Build: erfolgreich

## Geänderte Dateien

- `supabase/migrations/20260809001000_v1_release_gift_presentations_notifications.sql`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/rewards/rewardService.ts`
- `src/modules/admin/dashboardNoticeService.ts`
- `src/modules/admin/dashboardNextStep.mjs`
- `src/modules/admin/dashboardNextStep.d.mts`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- betroffene Vertrags- und Regressionstests unter `tests/`
- Engineering Bible und Release-Dokumentation unter `docs/`

## Was wurde geändert

### Geschenk-Präsentation

- Additive, RLS-geschützte `gift_redemption_presentations` eingeführt.
- Start ist an Restaurant, Kunden-Token und konkrete Geschenkzuteilung gebunden.
- Advisory Lock, Idempotency-Key und eindeutige Assignment-Zuordnung verhindern
  Doppelklick-, Tab- und Geräterennen.
- Serverzeit setzt exakt 15 Minuten; Browserzustand verlängert nichts.
- Nach Ablauf werden Präsentation und Geschenk idempotent abgeschlossen sowie
  Audit und unveränderbares Journal geschrieben.
- Historische aktive sechsstellige Codes bleiben als Restore-Kompatibilität
  erhalten, werden aber nicht mehr neu als primärer Geschenkflow erzeugt.

### Geburtstag

- Tägliche automatische Zuteilung exakt 14 Tage vor dem Geburtstag.
- Auswahl nur aus aktiven Starter-Geschenken mit
  `birthday_pool_enabled = true`.
- Höchstens eine Zuteilung pro Kunde, Restaurant und Geburtstagsjahr.
- Gültigkeit als halboffenes Zeitfenster vom 14. Tag vorher bis zum Beginn des
  15. Tages danach in der Restaurant-Zeitzone.
- 29. Februar wird über den bestehenden Helper im Nicht-Schaltjahr am
  28. Februar behandelt.
- Der manuelle Browser-Draw besitzt kein EXECUTE-Recht mehr.

### Benachrichtigungen

- Private, RLS-geschützte Queue für:
  - `BIRTHDAY_GIFT_ASSIGNED`
  - `BIRTHDAY_GIFT_EXPIRY_REMINDER`
  - `POINT_REWARD_AVAILABLE`
- Deduplizierung über Eventtyp und fachlichen Event-Key.
- Reminder wird genau drei Tage vor Ablauf nur für aktive Geschenke erzeugt.
- Schwellenbenachrichtigung entsteht nur beim Übergang von unter auf über die
  aktiven Rewardpunkte; nach Unterschreiten wird sie wieder scharfgestellt.
- Queuefehler werden abgefangen und rollen weder Geschenk noch Punkte zurück.
- Reservierung und Abschluss sind ausschließlich `service_role` erlaubt.

Wichtig: Die Queue versendet noch keine E-Mail. Supabase Auth SMTP stellt
keinen allgemeinen Anwendungs-Mailvertrag bereit. Ein freigegebener
serverseitiger Dispatcher/Provider fehlt und bleibt ein Release-Blocker.

### UI und Dashboard

- Willkommens- und Geburtstagsgeschenke verwenden Bestätigung und denselben
  Live-Bildschirm wie Punktebelohnungen.
- Live-Ansicht enthält Bild, Restaurant, MM:SS, Sekundenzeit,
  Sicherheitsmerkmal, Animation und „Live-Einlösung“.
- Eingelöste Geschenke bleiben mit „Eingelöst am …“ in der Historie.
- Manueller Geburtstags-Draw wurde aus dem Primärflow entfernt.
- Dashboard zeigt nach QR-Bereitschaft den priorisierten Schritt
  „Geburtstagsgeschenk aktivieren“ und verlinkt zum vorhandenen Geschenkpool.

## Migration

Erstellt:

- `20260809001000_v1_release_gift_presentations_notifications.sql`

Die Migration ist additiv. Sie löscht keine Tabellen oder historischen Daten,
deaktiviert keine RLS und gewährt keine direkten Browser-Tabellenrechte.

Staging-Verbindung:

- lokaler Project Ref: `bwhv…qaya`
- als bekanntes Staging-Projekt dokumentiert
- Supabase CLI: 2.113.0
- Remote-Liste/Dry-Run: nicht ausgeführt, weil in dieser Sitzung kein
  `SUPABASE_ACCESS_TOKEN` vorhanden ist
- Migration auf Staging angewendet: Nein

## Cron-Jobs und Edge Functions

Neue/ersetzte Cron-Jobs in der Migration:

- `wuxuai-v1-birthday-gifts-daily`
- `wuxuai-v1-birthday-gift-reminders`
- `wuxuai-v1-complete-gift-presentations`

Edge Functions geändert: keine. Es wurde bewusst kein zweiter SMTP-Vertrag und
kein Provider-Workaround gebaut.

## Tests

Neu beziehungsweise erweitert:

- Geschenk-Präsentation und serverseitige Wiederaufnahme
- falscher Kunde und falsches Restaurant
- Idempotenz und Assignment-Bindung
- automatischer Abschluss, Audit und Journal
- Geburtstag exakt 14 Tage vorher
- jährliche Eindeutigkeit und doppelter Cron
- Poolfilter und fehlender Pool
- einmalige Geburtstags- und Reminder-Queue
- Threshold Crossing, Deduplizierung und Rearm
- private Queue und `service_role`-Rechte
- Dashboard-Priorität
- Altcode-Restore als Kompatibilitätspfad

Ergebnis:

- Tests: 658/658 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 8 bestehende Warnungen
- Build: erfolgreich, 2012 Module, Vite 6.4.3
- `git diff --check`: erfolgreich

## UI-Prüfung

Lokale Kundenregistrierung geprüft bei 390, 430, 768, 1024 und 1440 px:

- horizontaler Overflow: 0
- zu kleine sichtbare Touchziele: 0
- Console Errors: 0
- Geburtstag standardmäßig leer
- Submit ohne Pflichtfelder deaktiviert

Physischer Mobile Safari: nicht geprüft.  
Installierte PWA: nicht geprüft.  
Echter Geschenkflow gegen Staging: nicht geprüft, da Migration nicht angewendet.

## Customer Email Confirmation

Im Repository bereits vorhanden und erneut geprüft:

- `emailRedirectTo` zeigt auf `/customer/auth/callback`
- `token_hash`, PKCE-Code und Legacy-Hash werden kontrolliert verarbeitet
- `verifyOtp` ist der bevorzugte Bestätigungsvertrag
- Resend besitzt Cooldown und bewahrt den Return-Pfad
- abgelaufene und doppelt verwendete Links erhalten einen verständlichen Zustand

Ein echter E-Mail-E2E wurde in diesem Sprint nicht behauptet.

### SUPABASE MANUAL ACTION REQUIRED

1. Authentication > URL Configuration
   - Site URL: `https://bonus.wuxuaisbi.com`
   - Redirect URLs:
     - `https://bonus.wuxuaisbi.com/auth/callback`
     - `https://bonus.wuxuaisbi.com/auth/update-password`
     - `https://bonus.wuxuaisbi.com/customer/auth/callback`
2. Authentication > Email Templates > Confirm signup

```html
<a href="{{ .RedirectTo }}#token_hash={{ .TokenHash }}&type=email">
  E-Mail-Adresse bestätigen
</a>
```

3. Kompatiblen App-Stand deployen und mit neuer E-Mail vollständig testen.
4. Einen freigegebenen serverseitigen Transaktionsmail-Dispatcher an die
   Queue-RPCs anbinden und auf Staging zustellen, wiederholen und fehlschlagen
   lassen.

## Was wurde nicht geändert

- Keine Stripe-Implementierung
- Keine Fake-Zahlung oder künstliche Subscription
- Keine Kassenschnittstelle, Bonnummer, Staff-App oder Geschenk-QR-Prüfung
- Keine Service Role im Browser
- Keine Lockerung bestehender RLS-/Tenant-Regeln
- Keine Production-Migration, kein Deployment, kein Push und kein Merge

## Bekannte Restrisiken

1. Migration wurde nicht remote geplant oder auf Staging angewendet.
2. Transaktionsmail-Queue besitzt noch keinen freigegebenen Dispatcher.
3. Auth-Template und Redirect-Allowlist müssen extern bestätigt werden.
4. Echte Cron-, Race-, Jahreswechsel- und Zeitzonenfälle sind auf Staging offen.
5. Physischer Safari- und PWA-Test fehlen.
6. Die Migration setzt die auf Staging bereits vorhandenen Vorgängermigrationen
   für zentralen Kundenaccount und Punkte-Präsentationsfenster voraus.

## Release-Status

- Pilot Ready: **NO** – Staging-Migration, echter Mailversand und Staging-E2E fehlen.
- Public Release Ready without Billing: **NO** – Pilot- und Mobil-Gates sind offen.
- Stripe Ready to Implement: **NO** – Firmengründung und Firmenbankkonto fehlen.
- Ausschließlich auf Stripe/Firmengründung wartend: **Nein**. Vor Stripe sind
  noch die oben genannten technischen Staging-Gates zu schließen.

Status: **NOT READY**
