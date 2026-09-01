# Owner-Zugriff auf den eigenen Mitarbeiterbereich

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `07d136cf6b93c0757b1d3fb7e93f9271171d92ca`

## Ursache

Der Owner wurde an zwei unabhängigen Stellen blockiert:

1. Die React-Routen `/staff` und `/staff/:slug` erlaubten ausschließlich die
   Rollen `staff` und `supervisor`.
2. `get_my_staff_restaurant_access` verlangte neben der
   `restaurant_members`-Rolle zwingend eine aktive `staff_members`-Zeile.

Damit konnte eine legitime Owner-, Admin- oder Manager-Beziehung für das eigene
Restaurant den Mitarbeiterbereich nicht öffnen. Der Restaurant-Slug und der
Staff-QR waren nicht die Rollenautorität; die Sperre lag im Rollenvertrag.

## Geänderte Dateien

- `src/app/App.tsx`
- `src/modules/auth/StaffLoginPage.tsx`
- `src/modules/auth/StaffRestaurantRouteGate.tsx`
- `src/modules/auth/staffLoginService.ts`
- `src/modules/auth/staffPortalAccessContext.ts`
- `src/modules/staff/StaffTablet.tsx`
- `supabase/migrations/20260825005000_owner_own_staff_portal_access.sql`
- `tests/owner-own-staff-portal-access.test.mjs`
- `tests/owner-team-management.test.mjs`
- `tests/staff-qr-individual-login-routing.test.mjs`
- `docs/06_STAFF_PORTAL.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`

## Was wurde geändert

- Der äußere Route-Guard lässt Owner, Admins, Manager, Staff und Supervisor bis
  zum restaurantbezogenen Server-Gate passieren.
- Die Resolver-RPC erlaubt den Zugriff nur bei einer exakten autoritativen
  `restaurant_members`-Beziehung für den angefragten aktiven Restaurant-Slug.
- Staff und Supervisor benötigen unverändert zusätzlich eine aktive,
  angenommene und nicht archivierte `staff_members`-Zuordnung.
- Betreiber erhalten `access_mode = operator`; Staff erhält
  `access_mode = staff`.
- Der bestätigte Zugriffsmodus wird über einen React-Context an die
  Staff-Oberfläche übergeben. Betreiber sehen
  „Mitarbeiterbereich – Betreiberzugriff“.
- Die zentrale Audit-Funktion normalisiert bestehende Staff-Portal-Aufrufe bei
  einem echten Owner, Admin oder Manager desselben Restaurants auf
  `actor_type = admin`. `actor_id` bleibt die echte `auth.uid()`; die konkrete
  Restaurantrolle wird in sicheren Metadaten ergänzt.

## Was wurde nicht geändert

- Keine Staff-Impersonation und keine neue `staff_members`-Zeile.
- Keine Änderung von `restaurant_members.role`.
- Keine Plattformrollen-, Kunden- oder Metadaten-Autorisierung.
- Keine Änderung an Punkteberechnung, Tages-PIN, QR-Token, Referral,
  Redemption oder Teamverwaltung.
- Keine Production-Aktion, kein Deployment, kein Push und kein Merge.

## Sicherheit

- Autorität: `auth.uid()` plus exakte `restaurant_members.restaurant_id`-
  Beziehung.
- Staff-Sperrung bleibt für Staff wirksam, beeinflusst aber keine unabhängige
  Betreiberbeziehung.
- Fremde Restaurants bleiben durch den exakten Slug-/Tenant-Join blockiert.
- Eine reine `platform_admin`-Rolle wird nicht ausgewertet und erteilt keinen
  Zugriff.
- Beide ersetzten `SECURITY DEFINER`-Funktionen besitzen den festen
  `search_path = public, pg_temp`.
- Die Resolver-RPC ist nur für `authenticated` ausführbar. Die Audit-Funktion
  bleibt für Browserrollen entzogen.
- Keine Service-Role und keine Secrets im Browser oder in der Migration.

## Qualität

- Tests: 905/905 PASS
- Typecheck: PASS
- Lint: 0 Fehler, 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret-Scan der geänderten und neuen Dateien: PASS
- Staging DB-Linter: 0 Fehler auf dem aktuell angewendeten Schema
- Staging Dry-Run: PASS; exakt `20260825005000_owner_own_staff_portal_access.sql`
  ist ausstehend

## Migration und Staging

- Migration erstellt: Ja
- Migration auf Staging angewendet: Nein
- Grund: Kein ausdrücklicher Staging-Aktivierungs- oder Deploymentauftrag in
  dieser Aufgabe.
- Die UI ist nicht auf Staging deployed.
- Owner-Punktebuchung und Audit-Zuordnung wurden daher nicht als Live-PASS
  ausgegeben.

## Offene Risiken

- Migration kontrolliert auf Staging anwenden.
- Aktuellen Build auf Staging deployen.
- Mit einem echten Ownerkonto eigenes Restaurant und fremdes Restaurant testen.
- Kontrollierte Kunden-QR-Punktebuchung mit Tages-PIN durchführen und
  `actor_type`, `actor_id`, Restaurant, Kunde und Punkte im Audit prüfen.
- Staff-, Customer-, Anon- und reine Platform-Admin-Negativsessions live
  bestätigen.
- Betreiberkennzeichnung auf physischem iPhone prüfen.

## Status

`CODE LOCK` – Code und automatisierte Verträge sind vollständig geprüft; das
Staging-Live-Gate ist noch offen.
