# Staff QR – Individual Staff Login Routing Fix

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `e62154842b55a92a976dcddede3cad1a3e92b0b8`

## Ursache

Der Mitarbeiter-QR wurde als `/staff/:slug` erzeugt. Diese Route lag im
allgemeinen `ProtectedRoute`; ohne Sitzung leitete dieser jede Restaurantrolle
pauschal auf `/restaurant/login` um. Die dortige `LoginPage` enthält
Owner-spezifische Texte, vervollständigt eine ausstehende Owner-Registrierung
und navigiert nach `/admin`. Ein eigener Staff-Login-Einstieg existierte nicht.

## Änderung

- `/staff/login?restaurant=:slug` als eigener deutscher Mitarbeiter-Login mit
  persönlicher E-Mail und persönlichem Passwort ergänzt.
- QR Center, Onboarding Starter Kit, Owner-Teamseite, Dashboard und Platform
  Control Center auf den neuen Staff-Login-Link umgestellt.
- Alte `/staff/:slug`-Drucke bleiben kompatibel und leiten ausgeloggt unter
  Beibehaltung des validierten Slugs zum Staff-Login weiter.
- Invite-Abschluss löst den gerade aktivierten Restaurant-Slug innerhalb der
  Invite-Session auf, meldet die Invite-Session lokal ab und öffnet danach den
  passenden Staff-Login.
- Staff-Logout führt zurück zum restaurantbezogenen Staff-Login.
- Staff-Routen akzeptieren nur `staff` und `supervisor`; Owner-, Manager-,
  Customer- und Plattformrollen werden nicht als Staff interpretiert.

## Serververtrag und Security

Migration:
`20260825004000_staff_qr_individual_login_routing.sql`

`get_public_staff_login_context(text)`:

- gibt für ein aktives Restaurant nur Anzeigename und Slug zurück;
- `SECURITY DEFINER`, fester `search_path = public, pg_temp`;
- `EXECUTE` nur für `anon` und `authenticated`.

`get_my_staff_restaurant_access(text)`:

- verlangt `auth.uid()`;
- bindet User, Restaurant-Slug, `restaurant_members` und `staff_members`;
- akzeptiert nur `staff`/`supervisor`, `active = true`,
  `account_status = 'active'` und nicht archivierte Zuordnungen;
- `SECURITY DEFINER`, fester `search_path = public, pg_temp`;
- `EXECUTE` nur für `authenticated`, anonym auf Staging mit HTTP 401 /
  SQLSTATE 42501 bestätigt.

URL, Local Storage oder Client-Metadaten verleihen keine Berechtigung. Owner-
und Plattformpasswörter werden im Staff-Flow nicht verlangt oder verarbeitet.
Normale Tenant-RLS wurde nicht gelockert.

## Staging

- Verknüpftes Projekt: `bwhvfjuwixgwduoeqaya` (Staging).
- Dry-Run: ausschließlich Migration `20260825004000`.
- Migration auf Staging angewendet: Ja.
- Lokale/Remote Migration History synchron: Ja.
- DB-Linter: 0 Fehler.
- Öffentlicher Kontext-RPC: HTTP 200, korrekter Slug.
- Geschützter RPC als anon: HTTP 401 / SQLSTATE 42501.
- Cloudflare-App mit neuem UI-Code deployt: Nein.

## UI und Verhalten

Lokal mit Staging-Konfiguration geprüft:

- Legacy `/staff/wu-und-xu-group-gmbh` leitet auf
  `/staff/login?restaurant=wu-und-xu-group-gmbh`.
- Überschrift `Mitarbeiterbereich`, Restaurantname sowie persönliche E-Mail-
  und Passwortfelder sichtbar.
- Kein `Restaurant Login` und keine Owner-Registrierungslogik sichtbar.
- 390, 430, 768, 1024 und 1440 px ohne horizontalen Overflow.
- Eingaben und Anmeldebutton: 52 px hoch.
- Keine Browser-Fehler; zwei bestehende React-Router-Future-Warnungen.

## Qualität

- Tests: 898/898 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen.
- Build: PASS.
- `git diff --check`: PASS.
- DB-Linter Staging: 0 Fehler.

## Nicht geändert

- Keine zweite Auth-Architektur.
- Keine Owner-Registrierungsänderung.
- Keine Punkte-, Tages-PIN-, Reward- oder Customer-Änderung.
- Keine Service Role im Browser.
- Keine Production-Aktion, kein Stripe, kein Push, kein Merge.

## Offene Risiken

- Der UI-Code ist noch nicht auf die Cloudflare-Staging-App deployt.
- Ein echter Staff-Login, Suspended-Staff-Login und Cross-Tenant-Login wurden
  in diesem Lauf automatisiert und serververtraglich, aber nicht mit realen
  Passwörtern im deployten Browser ausgeführt.
- Der physische iPhone-Safari-Scan bleibt ein manuelles Release-Gate.

## Ergebnis

STAFF QR CURRENT ROOT CAUSE: Allgemeiner ProtectedRoute leitete anonyme
`/staff/:slug`-Aufrufe zum Owner-Login um.  
STAFF QR DESTINATION: PASS (lokal), Staging-UI-Deployment offen.  
INDIVIDUAL STAFF LOGIN: PASS (Code und lokale UI).  
OWNER PASSWORD REQUIRED: NO.  
RESTAURANT CONTEXT: PASS.  
ACTIVE STAFF: PASS automatisiert, echter Live-Login offen.  
SUSPENDED STAFF: BLOCKED automatisiert, echter Live-Login offen.  
CROSS-TENANT: BLOCKED automatisiert, echter Live-Login offen.  
OWNER AUTO-STAFF: NO.  
PLATFORM ADMIN AUTO-STAFF: NO.  
LEGACY STAFF QR COMPATIBILITY: PASS.  
PHYSICAL IPHONE SAFARI: FAIL – nicht durchgeführt.  
TESTS: 898/898 PASS.  
STAFF QR LOGIN FLOW READY: NO – Deployment und physischer Staff-E2E offen.  
PRODUCTION: LOCKED.  
STRIPE: DEFERRED.

Status: **CODE LOCK / NOT READY FOR FINAL LOCK**
