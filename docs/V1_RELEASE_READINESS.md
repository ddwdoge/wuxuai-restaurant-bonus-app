# WUXUAI Restaurant Bonus V1 Release Readiness

Stand: 2026-08-11

## Technisch abgeschlossen

- Zentraler Kundenlogin, restaurantbezogene Mitgliedschaften und QR-Kontext
- Serverzeitgebundene Präsentationsfenster für Punkte-, Willkommens- und
  Geburtstagsgeschenke
- Idempotente Geburtstagszuteilung 14 Tage vorher und einmaliger Reminder
- Reaktivierbare Punkteschwellen-Benachrichtigung je Restaurant und Reward
- Private Transaktionsmail-Outbox mit Lease, Retry, Fehlerstatus und
  Service-Role-Grenze
- Serveronly-Mail-Dispatcher für die drei bestehenden V1-Mailtypen
- Staging-Migrationen bis `20260811001000` vollständig synchron

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 8 bestehende Warnungen
- Tests: 667/667 erfolgreich
- Production-Build: erfolgreich
- `git diff --check`: erfolgreich
- 30 lokale Browserprüfungen auf 390/430/768/1024/1440 px: kein Overflow,
  keine Console-Fehler; Callback-Touchfläche auf Premium-Buttongröße korrigiert

## Manuelle Aktivierung erforderlich

Der Dispatcher ist nicht deployt, weil in dieser Sitzung keine freigegebenen
SMTP-, Scheduler-, Absender-, App-URL- oder Service-Role-Secrets verfügbar sind.
Es wurden keine Zugangsdaten erfunden oder aus Auth SMTP exportiert.

**MANUAL SECRET REQUIRED**

- `TRANSACTIONAL_MAIL_SCHEDULER_SECRET`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`
- `APP_BASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Nach sicherer Secret-Hinterlegung muss die Edge Function
`transactional-mail-dispatcher` auf Staging deployt, durch einen geschützten
Scheduler aufgerufen und mit echten Geburtstag-/Schwellenmails geprüft werden.

## Offene Pilot-Gates

- Echte Auth-Bestätigungsmail und Callback
- Echte Geburtstag- und Punkteschwellenmail inklusive CTA
- Vollständige Staging-E2E-Flows mit isolierten Testkonten
- Physischer iPhone-Safari-Test
- Installierte PWA inklusive Wiederaufnahme
- Kellner-Lesbarkeit und Screenshot-Erkennbarkeit
- Legacy-DB-Lint-Befunde separat triagieren; sie liegen außerhalb dieses
  Dispatcher-Scopes und wurden nicht verändert

## Stripe

Stripe bleibt ausdrücklich **DEFERRED**. Kein Checkout, keine Webhooks, keine
Keys und keine simulierte Subscription wurden ergänzt.

## Bewertung

- TECHNICALLY READY FOR MANUAL PILOT TEST: **NO**
- PILOT READY: **NO**

Begründung: Code, Tests und Staging-Schema sind vorbereitet. Der reale
Transaktionsmailtransport ist ohne manuell bereitgestellte Secrets und
Staging-Deployment noch nicht aktiv; echte E2E- und Geräteprüfungen fehlen.
