# WUXUAI Bonus - Role-Aware Portal Login Final Staging Gate

Datum: 2026-08-25
Branch: `codex/v1-canonical-recovery`
Commit: `a2c99043ed6fd301c3070c7dcedf80bb0963bf90`

## Deployment

- Cloudflare-Projekt: `wuxuai-restaurant-bonus-app`
- Staging-Domain: `https://bonus.wuxuaisbi.com`
- Deployment-ID: `e4459801-cbef-4400-be12-b2d2996108b0`
- Deployment-Zeitpunkt: `2026-08-25T19:45:05.489Z`
- Supabase-Staging: `bwhv...qaya`
- Production: nicht veraendert

Der erste lokale Upload wurde sofort zurueckgerollt, weil der Build ohne die
oeffentlichen Vite-Supabase-Variablen erzeugt worden war. Die vorherige
funktionierende Staging-Version wurde wiederhergestellt. Danach wurden genau
eine Staging-URL und ein Publishable-Key aus der bereits funktionierenden
oeffentlichen Staging-Ausgabe validiert, ohne Werte auszugeben, und der
freigegebene Commit mit dieser bestaetigten Konfiguration neu gebaut. Custom
Domain und Worker liefern danach denselben neuen Einstiegspunkt.

## Reale Rollenmatrix

Es wurden echte Staging-Sitzungen verwendet. Customer- und Staff-Konten sind
im Bericht anonymisiert; das ausdruecklich freigegebene interne Konto ist
`office@wuxuaisbi.com`.

| Identitaet | Zielportal | Ergebnis |
| --- | --- | --- |
| Customer | Customer | PASS; Home und Memberships geladen |
| Staff-only | Customer | BLOCKED; Staff-Meldung und Staff-CTA |
| Owner-only | Customer | BLOCKED; Betreiber-Meldung und Owner-CTA |
| Customer | Staff | BLOCKED; restaurantbezogene Staff-Meldung |
| Staff-only | Staff | PASS; richtiges Restaurant geladen |
| Staff-only | Owner | BLOCKED; Staff-Meldung und bestaetigter Staff-CTA |
| Customer | Owner | BLOCKED; verstaendliche Customer-Meldung |
| Owner-only | Owner | PASS |
| Platform Admin | Platform Admin | PASS |
| Owner-only | Platform Admin | BLOCKED |
| Staff-only | Platform Admin | BLOCKED |
| Customer | Platform Admin | BLOCKED |

## Mischrolle

`office@wuxuaisbi.com` besitzt auf Staging sowohl die aktive
`platform_admins`-Zuordnung als auch eine eigenstaendige Owner-Beziehung zum
Testtenant. Beide Portale wurden unabhaengig erfolgreich geoeffnet. Der eigene
Staff-Bereich ist aufgrund der bestehenden Owner-Beziehung ebenfalls erlaubt;
das Customer-Portal bleibt ohne Customer-Beziehung gesperrt. Es wird keine
globale Einzelrolle erzwungen.

## Authentifizierung und Kontowechsel

- Falsches Passwort wurde auf Customer-, Owner- und Staff-Login geprueft.
- Alle drei Oberflaechen zeigen nur den generischen Fehler
  `E-Mail-Adresse oder Passwort ist nicht korrekt.`
- Vor erfolgreicher Authentifizierung wurde keine Rolle offengelegt.
- `Mit anderem Konto anmelden` loescht die aktuelle Sitzung, fuehrt zum
  vorgesehenen Login zurueck und hinterlaesst keinen sichtbaren alten
  Portalzustand.

## RPC-Unterdrueckung und Alt-Tab-Befund

Beim ersten Staff-gegen-Customer-Test zeigte ein bereits vor der finalen
Aktualisierung geladener Tab noch den alten Customer-Ladefehler. Die
serverseitige Gegenpruefung ergab fuer genau dieses Staff-Konto:

- `staff_access = true`
- `customer_access = false`
- keine Customer-Account-Zeile
- keine Customer-Membership
- keine Platform-Admin-Zuordnung

Nach einem echten Reload derselben authentifizierten Sitzung erschien sofort
`Falscher Anmeldebereich`; die Customer-Fachoberflaeche wurde nicht gerendert.
Der automatisierte Vertragstest bestaetigt zusaetzlich, dass Customer-Routen
vor `get_customer_account()` stoppen. Der Befund ist ein alter SPA-/BFCache-
Zustand und kein Rollen- oder Datenbankfehler.

## Mobile Live

Die reale Staff-gegen-Customer-Rollenkarte wurde mit 320, 375, 390, 414, 430,
768 und 1024 Pixel geprueft. Auf jeder Breite waren Meldung, Haupt-CTA und
Kontowechsel sichtbar. Es gab keinen leeren Zustand und keinen horizontalen
Ueberlauf.

## Qualitaet und Datenbank

- Tests: 981/981 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS vor dem Bericht
- Secret Scan: PASS; nur bekannte Variablennamen, keine Werte
- Migration `20260825007000`: lokal/remote synchron
- DB-Linter: 0 Fehler
- RLS und bestehende Tenantvertraege: unveraendert

Die vollstaendige Testsuite deckt Customer-Registrierung, E-Mail-Bestaetigung,
Owner- und Staff-Login, Staff-QR, Teamverwaltung, Platform Admin, Referral,
Punkte, Rewards, Redemption und QR Center weiterhin ab.

## Ergebnis

- STAGING UI DEPLOYED: YES
- CUSTOMER -> CUSTOMER: PASS
- STAFF -> CUSTOMER: BLOCKED
- OWNER -> CUSTOMER: BLOCKED
- CUSTOMER -> STAFF: BLOCKED
- STAFF -> STAFF: PASS
- STAFF -> OWNER: BLOCKED
- CUSTOMER -> OWNER: BLOCKED
- OWNER -> OWNER: PASS
- PLATFORM ADMIN -> PLATFORM ADMIN: PASS
- OWNER -> PLATFORM ADMIN: BLOCKED
- STAFF -> PLATFORM ADMIN: BLOCKED
- CUSTOMER -> PLATFORM ADMIN: BLOCKED
- ROLE DISCLOSURE BEFORE AUTH: NO
- WRONG PORTAL RPC PREVENTED: PASS
- SWITCH ACCOUNT: PASS
- MIXED ROLE: PASS
- 320-1024 LIVE: PASS
- DB LINTER: PASS
- TESTS: 981/981 PASS
- ROLE-AWARE PORTAL LOGIN FINAL LOCK: YES
- PRODUCTION: LOCKED
- STRIPE: DEFERRED
- Status: FINAL LOCK
