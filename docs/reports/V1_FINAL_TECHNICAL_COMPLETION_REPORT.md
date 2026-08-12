# V1 Final Technical Completion Report

Stand: 2026-08-11  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `54eb858a1b88038119c818a1add84185cdf2047e`

## 1. Was bereits vorhanden war

Zentrale Kundenanmeldung, restaurantbezogene Mitgliedschaften, 15-Minuten-
Präsentationsfenster, Birthday Pool, jährliche Geburtstagszuteilung,
Punkteschwellenlogik, private Mail-Outbox, Cron-Funktionen und 658 Tests waren
vorhanden. Der allgemeine App-Mailtransport und die Staging-Aktivierung fehlten.

## 2. Was neu implementiert wurde

- Serveronly-Dispatcher auf der bestehenden Outbox
- Sichere deutsche Templates für Geburtstag, Reminder und Punkteschwelle
- Queue-Lease, begrenzte Wiederholungen, persistente Fehler- und Versandzeiten
- Schutz vor paralleler Doppelreservierung mit `FOR UPDATE SKIP LOCKED`
- HTTPS-Rückkehr zum richtigen Restaurant nach zentraler Kundenanmeldung
- Callback-Rücklink als mindestens 44 px hohe Premium-Touchfläche
- Manuelle Pilotcheckliste und aktualisierte Security-/RPC-Dokumentation

## 3. Mail Dispatcher Status

Code und Bundle-Preflight sind erfolgreich. Unterstützt werden ausschließlich
`BIRTHDAY_GIFT_ASSIGNED`, `BIRTHDAY_GIFT_EXPIRY_REMINDER` und
`POINT_REWARD_AVAILABLE`. Browserzugriff auf Queue und Reserve-/Complete-RPCs
bleibt entzogen. Der Dispatcher ist mangels freigegebener Secrets nicht auf
Staging deployt. **MANUAL SECRET REQUIRED.**

Eine SMTP-Annahme unmittelbar vor einem Worker-Abbruch kann technisch nicht
vollständig als Exactly-once garantiert werden. Deterministische Message-ID,
Lease, persistenter Status und Retry reduzieren dieses Restrisiko; der Provider
muss dieselbe Message-ID deduplizieren können.

## 4. Birthday Mail Status

Zuteilung erfolgt 14 Tage vor dem Geburtstag, einmal je Kunde/Restaurant/Jahr
aus dem aktiven Pool. Der Mailjob wird unabhängig von der Kerntransaktion
erzeugt. Der Reminder wird einmalig drei Tage vor Ablauf und nur für aktive,
nicht eingelöste Geschenke erzeugt. Realer Versand bleibt manuell zu prüfen.

## 5. Points Mail Status

Die Benachrichtigung entsteht beim ersten Übergang von unterhalb auf mindestens
die Reward-Schwelle. Weitere Punkte oberhalb erzeugen keine Duplikate. Nach
Unterschreiten wird der Zustand wieder aktiviert. Restaurant und Reward bleiben
getrennt; inaktive Rewards werden ignoriert.

## 6. Migration Status

Dry-Run und Anwendung auf `wuxuai-bonus-staging` waren erfolgreich:

- `20260804002000_central_customer_account_offer_emails.sql`
- `20260804003000_central_customer_login_restaurant_context.sql`
- `20260809001000_v1_release_gift_presentations_notifications.sql`
- `20260811001000_transactional_email_reservation_ambiguity_fix.sql`

Ein PostgreSQL-Parserfehler in den beiden zentralen Kundenkonto-Migrationen
wurde vor ihrer ersten erfolgreichen Anwendung korrigiert. Die additive
Reparatur `20260811001000` beseitigt eine vom Remote-Linter gefundene
Mehrdeutigkeit des Dispatcher-Versuchszählers.

## 7. Staging Status

`supabase migration list --linked` zeigt alle lokalen Versionen remote.
Der abschließende `db push --dry-run --include-all` meldet `upToDate: true`.
Kein Production-Lauf und kein Cloudflare-Deployment wurden ausgeführt.

## 8. RLS Status

Die Outbox hat RLS aktiviert und keine Browser-Policies. Direkte Rechte für
`anon` und `authenticated` bleiben entzogen. Reserve und Abschluss sind nur für
`service_role` ausführbar und besitzen einen festen `search_path`. Der
Staging-DB-Linter meldet den Dispatcher nach der Reparatur fehlerfrei.

Der Linter nennt weiterhin ältere Legacy-Funktionen mit bereits bestehenden
Fehlern, unter anderem alte Redemption-Overloads und alte Registrierungs-RPCs.
Diese wurden im engen Abschluss-Scope nicht verändert; die aktiven V1-Verträge
und Entziehungen werden durch die bestehende Suite geprüft. Separate Triage vor
Production bleibt empfohlen.

## 9. E2E Status

Automatisiert geprüft wurden Queuevertrag, Deduplizierung, Lease, Retry,
Template-Sicherheit, Birthday- und Threshold-Produzenten sowie bestehende Auth-,
Gift-, Tenant- und Redemption-Verträge. 30 lokale Browserläufe über sechs
öffentliche Einstiege und fünf Viewports zeigten keinen Overflow und keine
Console-Fehler. Authentifizierte Staging-E2E-Flows und realer Mailversand konnten
ohne Testkonto/Secrets nicht vollständig durchgeführt werden.

## 10. Testanzahl

667/667 erfolgreich, davon 9 neue Dispatcher- und Mailvertragstests.

## 11. Typecheck

Erfolgreich.

## 12. Lint

Erfolgreich, 0 Fehler und 8 bestehende Warnungen.

## 13. Build

Production-Build erfolgreich. Edge-Function-Bundle-Preflight erfolgreich.
Deno-/lokales Supabase-Serve war ohne Docker nicht verfügbar.

## 14. Offene MANUAL ACCESS Punkte

- SMTP-, Scheduler-, Absender-, App-URL- und Service-Role-Secrets sicher setzen
- Dispatcher-Edge-Function auf Staging deployen
- geschützten Scheduler konfigurieren
- Providerzustellung, Retry und Bounce-Verhalten beobachten
- echte Auth-, Birthday- und Points-Mails prüfen

## 15. Offene physische Tests

- iPhone Safari
- installierte PWA
- Screenshot-Erkennbarkeit der Live-Präsentation
- Kellner-Lesbarkeit innerhalb 1–2 Sekunden
- Rückkehr aus Mailclient und App-Wiederaufnahme

## 16. Stripe Status

**DEFERRED.** Keine Stripe-Implementierung oder Konfiguration wurde verändert.

## Finale Bewertung

TECHNICALLY READY FOR MANUAL PILOT TEST: **NO**  
PILOT READY: **NO**

### CODEX COMPLETED

- Dispatcher, Templates, Queue-Hardening und Tests
- Staging-Migrations-Dry-Run, Anwendung, Synchronitäts- und DB-Lint-Prüfung
- Typecheck, Lint, 667 Tests, Build und lokale Responsive-Prüfung
- Pilotcheckliste und technische Dokumentation

### USER MUST DO

- Secrets sicher bereitstellen
- Staging-Dispatcher deployen und Scheduler aktivieren
- echte Mail-, Auth-, Safari-, PWA- und Kellnertests durchführen

### BLOCKED BY CREDENTIAL

- Reale SMTP-Zustellung und Edge-Function-Aktivierung

### STRIPE DEFERRED

YES
