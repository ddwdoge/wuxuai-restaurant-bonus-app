# WUXUAI Bonus - Platform Admin Final Route and Mixed-Role Security Gate

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Staging: `wuxuai-bonus-staging` (`bwhv...qaya`)  
Platform Admin: `office@wuxuaisbi.com`  
Auth User ID: `5ef968ee-5c8f-44c7-9c32-369e302e457b`

## Realer Browser- und Servernachweis

Die vom Benutzer authentifizierte reale Browser-Sitzung wurde direkt
verwendet.

- `/platform-admin` blieb auf der Plattformroute und renderte vollstaendig.
- Keine Umleitung zum Owner-Dashboard, kein 403 und keine
  Verifikationswarnung.
- Die UI zeigte die autoritative Rolle `Plattform Admin`.
- Der geschuetzte globale Restaurant-Read lieferte acht Restaurants.
- Der geschuetzte Audit-Read unter `/admin/platform/audit` lieferte globale
  Auditdaten.
- Beide Reads laufen ueber die bestehenden Plattform-RPCs und nicht ueber
  direkte globale Browser-Selects.
- Browserwarnungen und Browserfehler: 0.

## Geschuetzte Plattformaktion und Audit

Am eigenen Staging-Testrestaurant wurde der bereits aktive Status erneut als
`active` gespeichert. Alter und neuer Restaurant- sowie Subscription-Status
blieben identisch. Die serverseitig autorisierte Aktion erzeugte den erwarteten
Auditnachweis:

- Actor: `5ef968ee-5c8f-44c7-9c32-369e302e457b`
- Plattformrolle: `platform_admin`
- Ereignis: `PLATFORM_SUBSCRIPTION_UPDATED`
- Ziel: bestehende Branch-Subscription des Testrestaurants
- Zeitpunkt: `2026-08-24T13:39:32.739192Z`
- Status: `success`
- Vorher/Nachher: unveraendert `trialing`

Der zugehoerige Restaurant-Update-Trigger erzeugte zusaetzlich
`ADMIN_RESTAURANTS_UPDATED`, ebenfalls mit identischem Vorher-/Nachher-Status.

## Owner-Beziehung und exakte Ursache

Gefundener Tenant:

- Restaurant ID: `a7afbbef-e835-4e4e-bf5e-91406d31b596`
- Name: `Wuxuai bonus`
- Slug: `wuxuai-bonus`
- Onboarding: `draft`
- Erstellt: `2026-08-24T12:40:59.041727Z`
- Owner-Membership ID: `11fdbc2b-a00e-4c58-acf5-9526b1a34d37`
- Branch ID: `a60a0491-64c3-4bb0-a439-dbbb49a8172b`
- Staff: 0
- Customers: 0

Die Beziehung entstand nach dem Platform-Admin-Bootstrap und exakt beim ersten
spaeteren Login. Der Auditlog enthaelt gleichzeitig `OWNER_TRIAL_STARTED` mit
Quelle `restaurant_portal`. Der Auth-User besitzt nur die Invite-Metadaten
`email_verified` und `invited_as=platform_admin`, keine Owner-Onboarding-
Metadaten.

Der einzige aktive Codepfad fuer diese Kombination ist:

`LoginPage` -> `completePendingOwnerRegistration(email)` ->
`readPendingRegistration(email)` -> `startOwnerTrial(...)`.

Damit stammt der Tenant aus einem im Browser fuer dieselbe E-Mail vorgemerkten
Owner-Registrierungsdatensatz. Die Plattformrolle hat das Restaurant nicht
erzeugt und verlieh keine Owner-Rechte.

## Cleanup-Entscheidung

Die Beziehung ist Staging-Testdaten, wurde aber in diesem Lauf nicht geloescht.
`audit_log.restaurant_id` referenziert `restaurants` mit `on delete cascade`.
Eine Tenantloeschung wuerde deshalb die unveraenderbare Audit-Historie
entfernen. Nur Membership oder Branch zu loeschen wuerde die Ownership ueber
`restaurants.owner_id` nicht vollstaendig beseitigen. Ohne freigegebenen
Audit-Archivierungs- oder Reassignment-Vertrag ist keine sichere vollstaendige
Bereinigung moeglich.

Mixed Role bleibt technisch erlaubt und sicher, weil beide Rollen unabhaengig
autorisiert werden:

- Plattformzugriff: aktiver `platform_admins`-Eintrag
- Ownerzugriff: `restaurant_members` und eigener Restaurant-Tenant
- Owner impliziert keine Plattformrolle
- Plattformrolle impliziert keine Ownerrolle

## Tenant- und Negativmatrix

- Normaler `/admin`-Aufruf in derselben Sitzung zeigte nur `Wuxuai bonus` und
  leitete wegen `onboarding_status=draft` in das eigene Onboarding.
- Kein globaler Plattformzugriff wurde in den normalen Owner-Scope uebertragen.
- Aktive Platform-Admin-Mappings: 1, exakt fuer den freigegebenen User.
- Reale Owner-only-Identitaeten ohne Mapping: 7.
- Reale Customer-only-Identitaeten ohne Mapping: 6.
- Reale Staff-Datensaetze ohne Auth-Plattformrollenbruecke: 4.
- Anon `get_current_platform_role`: HTTP 401.
- Anon Direktzugriff `platform_admins`: HTTP 401.
- Client-Metadaten, Local Storage, Query-Parameter und Request-Rollenfelder
  werden von `current_platform_role()` nicht ausgewertet.
- Der bestehende transaktionale Selbstbefoerderungstest bleibt blockiert.

Es wurden keine fremden Konten impersoniert und keine Zugangsdaten verarbeitet.
Die Negativmatrix folgt der einzigen serverseitigen Rollenautoritaet und wurde
durch die real vorhandenen, nicht zugeordneten Staging-Identitaeten sowie die
autoritativen Vertragstests bestaetigt.

## Qualitaet und Migrationen

- Platform-Admin-Sicherheitstests: 9/9 PASS
- Staging DB Linter: 0 Fehler
- Migration `20260824003000_platform_admin_foundation_hardening.sql`: angewendet
- Migration `20260824004000_authenticated_referral_registration_bridge.sql`:
  nicht angewendet
- Production: gesperrt
- Stripe: zurueckgestellt

## Entscheidung

Die reale Route, die geschuetzten Reads, eine auditierte geschuetzte Aktion,
die Mixed-Role-Trennung und die negative Rollenautoritaet sind nachgewiesen.
Die Platform-Admin-Foundation ist bereit. Migration `04000` darf nun in ihrem
eigenen, separat freigegebenen Dry-Run-/Apply-/E2E-Gate fortgesetzt werden; sie
wurde in diesem Auftrag nicht angewendet.

Status: **PLATFORM ADMIN FOUNDATION READY**
