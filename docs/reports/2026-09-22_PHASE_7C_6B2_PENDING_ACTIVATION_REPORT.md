# Phase 7C.6B2 – Pending Activation and Live-Gate: lokaler Abschluss

Datum: 2026-09-22.
Status: **PHASE 7C.6B2 PENDING ACTIVATION AND LIVE-GATE LOCAL CODE LOCK**.
Kein Staging-/Production-/FINAL LOCK. Kein Commit oder Push.

## Basis und Ursache

Repository: `/private/tmp/wuxuai-7c5d.8Ablo7/repo`.
Branch: `codex/v1-release-integration`.
HEAD und lokal gespeicherter origin-Ref:
`5e912c5e73c15ac11ef0968ce10915affd05780f`, Parität 0/0.
Kein Remote-Fetch in diesem lokalen Fortsetzungsgate; die Parität bezieht sich
ausdrücklich auf den vorhandenen Remote-Tracking-Ref.

Der gemeinsame Branch-Creator startete bislang auch bei neuer Registrierung
den Legacy-Trial. Die neue serverseitige Lifecycle-Unterscheidung trennt
Pending-Registrierung von Bestandsbetrieben, ohne historische Trial-Daten
umzuschreiben. Der lokale Reset wurde nach erneuter Founder-Freigabe erfolgreich
ausgeführt. Die früheren beiden Freigabe-Zeitlimits waren keine SQL-Fehler.

## Was geändert wurde

- Additive Migration 163:
  `supabase/migrations/20260922006000_pending_activation_registration_and_live_gates.sql`.
  SHA-256:
  `70fbd71826275c44ae79117bda6e668cccd41a0fc9f23867c0bb4930e3633611`.
  Der SQL-Stand blieb während dieser Wiederaufnahme unverändert.
- Neue Registrierung mit BASIC ausschließlich als vorgemerktem Tarif,
  PENDING_ACTIVATION, null Trial-/Perioden-/Providerdaten, ohne wirksame
  Entitlements/Kapazität und ohne owner_trial_started-Audit.
- Private Lifecycle-/Activation-Resolver, geschützter Activation-Read,
  unveränderbarer Pending-Audit, Transition- und DML-Guards.
- Eigene Setup-/Profil-/Branding-/Programm-/Legal-/Offer-/Reward-Drafts erlaubt;
  Live-Aktivierung, QR/PIN, Kundenbindung, Punkte, Einlösung, Staff-Einladung
  und operative Zustellungen bleiben gesperrt.
- Owner-Routing, Registrierung, Onboarding, Settings, Capacity, QR, Staff,
  Publishing und Platform-Anzeige an Pending angepasst.
- Gemeinsame Pending-Texte in sieben Sprachen. Hilfsfunktionen und Texte nach
  `pendingActivation.ts` ausgelagert; React-Komponente bleibt separat.
- Platform-Liste und Control Center verwenden den lokalisierten Pending-Titel.
- Im echten lokalen Browserflow gefunden und eng korrigiert:
  Die Kassenbestätigungsmaske blockierte vorher Pending-Vorschauseiten.
  Nur Pending umgeht diese UI-Maske; der bestehende nicht-pending Pfad und
  die serverseitigen Aktivierungs-/Kassensperren bleiben erhalten.
- Pending-spezifische 44px-Touchregeln inklusive expliziter Select-Höhe für WebKit.
  Keine globale Änderung von aktiven Owner-, Drawer-, Keyboard- oder Bildverträgen.
- Fokussierte SQL-, Parallelitäts-, Browser- und Quelltext-Regressionstests ergänzt.

## Geänderte Dateien / Bereiche

- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md` und dieser Bericht.
- `src/app/App.tsx`, `src/shared/types/domain.ts`.
- `src/modules/tenant/TenantProvider.tsx`, `PendingActivationNotice.tsx`,
  `pendingActivation.ts`, `pendingActivation.css`.
- `src/modules/admin/AdminLayout.tsx`, `setupAllowedPath.ts`.
- Admin-Seiten: `OwnerCapacityPage.tsx`, `QrCenterPage.tsx`,
  `RestaurantOffersPage.tsx`, `RestaurantOnboarding.tsx`, `RewardsPage.tsx`,
  `SettingsPage.tsx`, `StaffPage.tsx`, `WelcomeGiftsPage.tsx`.
- `src/modules/auth/RegisterPage.tsx`,
  `src/modules/legal/OwnerLegalSettingsPage.tsx`,
  `src/modules/offers/restaurantOfferService.ts`,
  `src/modules/onboarding/pilotOnboardingService.ts`.
- Platform: `PlatformAdminPage.tsx`, `PlatformRestaurantControlCenter.tsx`,
  `platformAdminService.ts`.
- `supabase/functions/owner-staff-invite/index.ts`: Activation-Read vor Einladung.
- Migration 163 und `tests/phase-7c6b2-*`.
- Enge Anpassung bestehender Source-Assertions in:
  `existing-customer-owner-registration.test.mjs`,
  `i18n-complete-catalog.test.mjs`, `multi-role-account-foundation.test.mjs`,
  `staff-qr-individual-login-routing.test.mjs`, `v1-commercial-contract.test.mjs`,
  `v1-qr-center-flow.test.mjs`.

Die vorbestehende Änderung `supabase/.temp/cli-latest` ist nicht Teil des Scopes
oder Exports. Ihr SHA-256 blieb
`103e9d7a97f9a66c28586ffae6f8d81a90630d5cb2c537b23ed886a5e0e5ff01`.

## Migrationen und lokale SQL-Nachweise

| Gate | Ergebnis |
| --- | --- |
| Fresh Replay | PASS – alle 163 Migrationen; History 163 / 20260922006000 |
| Historischer Replay | PASS – Reset ausschließlich lokal bis 162 |
| Upgrade 162 → 163 | PASS – SQL auf 162 angewendet, danach CLI-History 163 bestätigt |
| Repeat 163 Lauf 1 / Lauf 2 | PASS / PASS |
| Bestandsfingerprints über Upgrade und Repeats | PASS – Restaurants, Organizations, Branches, Memberships, Subscriptions, Audit, Country Policies unverändert; neue nullable Spalten normalisiert |
| Migrationen 001–162 | 162/162 bytegleich zu HEAD |
| DB-Lint | PASS – `--local --level error`, leere Ergebnisliste |
| Registrierung / Resume | PASS – eine vollständige Pending-Bindung, null Trial-/Periodendaten |
| Später erzwungener Fehler | PASS – keine partiellen Registrierungszeilen |
| 24 parallele Registrierungen | PASS – ein Tenant, Branch, Owner-Membership, Abonnement und Pending-Audit |
| 24 Setup-Speicherungen gegen 24 Aktivierungsversuche | PASS – Drafts gespeichert, alle Aktivierungsversuche blockiert |
| Legacy aktiv / Trial / Subscription | PASS – Upgrade-Fingerprints und separater aktiver Legacy-Flow; Subscription unverändert |
| Eigener Owner / fremder Owner / Staff / Customer / anon / service_role / Platform Admin | PASS – rollen- und tenantgebundene Matrix |
| Private RPC-/Audit-/Kontext-ACLs und RLS | PASS – private Funktionen und Kontext-DML nicht für API-Rollen freigegeben; sensible RLS aktiv |
| Public Customer-Kontext / Beitritt / produktiver QR | PASS – Pending abgewiesen |
| Service-Role Direct DML | PASS – Subscription-/Provider-/Trial-/Planmanipulation sowie QR, Punkte, Einlösungen, Staff-Sessions und beide Outbox-Pfade blockiert |

Neue private Funktionen besitzen feste search_path-Werte. Bestehende öffentliche
Signaturen bleiben erhalten. Kein Trial wurde nachträglich gekürzt oder umgerechnet.

Erwartete Ablehnungen wurden präzise geprüft: RLS kann eine Löschung auf null
Zeilen begrenzen; der ältere Veröffentlichungs-Guard liefert P0001 statt 42501.
Die Legacy-Aktivierungsfixture benötigte die bestehende Kassenbestätigung.
Diese Testfixture-/Assertion-Korrekturen waren keine SQL-Migrations- oder
Sicherheitsdefekte; Schutzregeln wurden dafür nicht abgeschwächt.

## Browser-/Flow-Nachweise

Echte lokale Supabase-Auth-Sitzungen mit synthetischen Owner- und Platform-Konten;
keine Staging-Sitzung und keine gemockte Entitlement-Autorität.
Vite ausschließlich auf 127.0.0.1:56126; API 127.0.0.1:56121.
Nicht-lokale Browseranfragen wurden blockiert.

Finaler Durchlauf: **202 Prüfungen, 0 Fehler**.

- Chromium und WebKit.
- Owner-Breiten: 320 / 375 / 390 / 430 / 767 / 768 / 1024 / 1440 px.
- Owner-Routen: Onboarding, QR, Staff, Tarif/Kapazität, Punkteeinlösungen,
  Willkommensgeschenke und Angebote.
- Touchziele der geprüften Owner-Flächen mindestens 44 CSS-px;
  Checkbox-/Radio-Hitflächen über zugehörige Labels gemessen.
- Kein horizontaler Overflow; keine Runtime-Fehler im finalen Lauf.
- Pending-Texte DE/EN/FR/IT/ES/ZH/KO geprüft.
- Platform-Pending-Liste/Detail zusätzlich in allen sieben Sprachen bei
  390 und 1024 px in beiden Engines geprüft.
- Angebots-Drawer je Owner-Breite mit Abbrechen, X und Escape geschlossen:
  48 Schließprüfungen, keine Speicherung.
- Fingerprints aller öffentlichen lokalen Tabellen vor/nach Seitenaufrufen
  und Schließaktionen identisch. Synthetische Fixture-Erstellung erfolgte
  ausdrücklich vor dem jeweiligen Snapshot.

Frühe Browserläufe identifizierten die Pending-Kassenmaske und kleinere
Touchflächen. Ein WebKit-Testharness führte zunächst einen Reload aus, während
Auth-Reads noch liefen; die dadurch abgebrochenen Requests wurden durch
vollständig abgewartete Navigation beseitigt, nicht durch Lockerung von CORS
oder anderer Security-Konfiguration.

## Abschlussgates und Lint-Klassifikation

- Fokussierte Pending-/Security-Contract-Tests: **18/18 PASS**.
- Vollständige Tests erneut ausgeführt: **1.947/1.947 PASS**.
  Nicht nur die sechs zuvor korrigierten Assertions erneut geprüft.
- Typecheck: PASS.
- Lint: 0 Fehler, 8 vorbestehende Warnungen, 0 neue Warnungen.
- Build: PASS mit Node 24.18.0, ausschließlich lokaler Build-Konfiguration.
  Bekannter Vite-Hinweis auf große Chunks bleibt; kein funktionaler Buildfehler.
- Supabase CLI unverändert 2.116.0.
- Secret-Pattern-Scan der Task-Dateien: keine Treffer.
- `git diff --check` und `git diff --cached --check`: PASS.
- Index nicht verändert; kein Commit und kein Push.

Alle elf ursprünglichen Warnungen einzeln:

| Datei / damalige Zeile | Regel | Einordnung / Behandlung |
| --- | --- | --- |
| AuthProvider.tsx:431 | react-refresh/only-export-components | Vorbestehend, unverändert |
| campaignService.ts:2 | @typescript-eslint/no-unused-vars | Vorbestehend, unverändert |
| CustomerAuthPage.tsx:237 | react-refresh/only-export-components | Vorbestehend, unverändert |
| PlatformOperationsPanel.tsx:62 | react-hooks/exhaustive-deps | Vorbestehend, unverändert |
| PendingActivationNotice.tsx:4 | react-refresh/only-export-components | Neu, durch Auslagerung behoben |
| PendingActivationNotice.tsx:8 | react-refresh/only-export-components | Neu, durch Auslagerung behoben |
| PendingActivationNotice.tsx:18 | react-refresh/only-export-components | Neu, durch Auslagerung behoben |
| TenantProvider.tsx:204 | react-hooks/exhaustive-deps | Vorbestehend, unverändert |
| TenantProvider.tsx:268 | react-hooks/exhaustive-deps | Vorbestehend, unverändert |
| TenantProvider.tsx:274 | react-refresh/only-export-components | Vorbestehend, unverändert |
| I18nProvider.tsx:175 | react-refresh/only-export-components | Vorbestehend, unverändert |

Die acht Alt-Warnungen wurden gegen den Inhalt des Base-Commits mit ESLint
reproduziert. Keine scope-fremde Warnungsbereinigung.

## Unverändert / Grenzen / Risiken

- Keine bestehenden Migrationen geändert.
- Kein Staging-Zugriff, keine Staging-Migration, kein Deployment.
- Production, Stripe, reale Daten, E-Mail-Zustellung und Country-/PRO-Locks
  unberührt. Port 55439 weder verwendet noch verändert.
- Keine Änderung am eingefrorenen Bildrenderer-/Single-Image-Editor-Vertrag.
- Keine Provideraktivierung, Checkout- oder spätere Billing-Freigabe implementiert.
- Kein echter iPhone-Test behauptet; WebKit ist lokale Browserautomatisierung.
- Der Edge-Invite-Guard ist durch Source-/Security-Contracts geprüft, nicht
  durch echten E-Mail-Versand oder externen Edge-Aufruf.
- Die breite Testmatrix ist ein lokaler Code-Lock, keine Produktionsfreigabe.
  Ein späterer Staging-/Provider-/KYB-End-to-End-Gate bleibt erforderlich.
- Lokale Änderungen bleiben absichtlich uncommitted.

## Cleanup und Evidenz

Alle Test-, Typecheck-, Lint-, Build- und Browser-Sitzungen beendet.
Acht explizit gestartete Vite-Prozesse:
24204, 25303, 26750, 28217, 32086, 33263, 37958, 39163.
Alle via SIGTERM beendet; abschließendes PID-Inventar leer.
Die Prozesse erbten die jeweilige Test-Prozessgruppe; eine separate PGID wurde
nicht persistiert. Browser-Unterprozesse wurden über Playwright geschlossen.

Der task-eigene Supabase-Stack mit fünf Services wurde mit
`npx supabase stop --no-backup --project-id wuxuai-phase7b4d-local`
beendet. Task-Container und Task-Volumes anschließend nicht mehr vorhanden.
Synthetische Daten bewusst ohne Backup verworfen; nicht wiederherstellbar,
aber aus Migrationen/Testfixtures reproduzierbar. Keine Quelländerung verworfen.
Der potentiell lokale Schlüssel enthaltende Startlog wurde entfernt und nicht exportiert.
Fremder Container `welcome-to-docker` blieb unverändert laufend.

- TASK-OWNED BACKGROUND PROCESSES STARTED: 8 Vite-Prozesse + 1 Supabase-Stack (5 Services)
- TASK-OWNED BACKGROUND PROCESSES STOPPED: 8 Vite-Prozesse + 1 Supabase-Stack (5 Services)
- TASK-OWNED BACKGROUND PROCESSES STILL RUNNING: 0
- RETAINED PROCESS PURPOSE: NONE
- RAM CLEANUP: PASS
- UNRELATED PROCESSES CHANGED: NO
- FOREIGN CONTAINERS CHANGED: NO

Prüf-ZIP:
`exports/2026-09-22_PHASE_7C_6B2_PENDING_ACTIVATION.zip`.
Enthält ausschließlich Task-Quellen, Migration 163, Tests, Vertrag und diesen
Bericht; keine .env, lokalen Schlüssel, Roh-Auth-Daten, node_modules, dist oder
alten ZIPs. Inventar, Integrität, Bytevergleich zum Source Tree und Secret Scan
werden beim Export geprüft; SHA-256 wird mit der Abschlussausgabe ausgegeben.
