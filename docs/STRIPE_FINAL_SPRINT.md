# WUXUAI Restaurant Bonus – Stripe Final Sprint

Stand: 2026-08-09  
Status: **DEFERRED – KEINE IMPLEMENTIERUNG IN DIESEM SPRINT**

Voraussetzung sind die gegründete Betreiberfirma, ein Firmenbankkonto und ein
Stripe-Konto mit den korrekten Rechtsträgerdaten. Bestehende Billing-Felder
bleiben unverändert erhalten.

## Späterer Ablauf

1. Stripe-Firmenkonto vollständig verifizieren
2. Produkt und Price für das freigegebene Preismodell anlegen
3. Serverinitiierte Checkout Session implementieren
4. Restaurant eindeutig einem Stripe Customer zuordnen
5. Subscription-Vertrag und Statusmodell anbinden
6. Signierte Webhooks mit Replay-Schutz implementieren
7. Stripe Customer Portal serverseitig öffnen
8. `invoice.paid` idempotent verarbeiten
9. `invoice.payment_failed` mit Grace-Period verarbeiten
10. `customer.subscription.updated` verarbeiten
11. `customer.subscription.deleted` verarbeiten
12. Restaurantzugriff aus verifiziertem Subscriptionstatus ableiten
13. Test-Mode-E2E inklusive Retry, Replay und Fehlerfällen durchführen
14. Live Mode erst nach Firmen-, Bank- und Domainprüfung aktivieren
15. Production-Verifikation mit Monitoring und Rollback durchführen

## Sicherheitsregeln

- Keine Secret Keys im Browser, Repository oder Report
- Keine Subscription allein aufgrund eines Client-Redirects aktivieren
- Webhook-Signatur und Event-Idempotenz serverseitig prüfen
- Tenant-Zuordnung aus internen stabilen IDs auflösen
- Keine Fake-Zahlung oder manuelle Statussimulation als produktiven Flow zeigen
- Production-Aktivierung nur per separater Freigabe
