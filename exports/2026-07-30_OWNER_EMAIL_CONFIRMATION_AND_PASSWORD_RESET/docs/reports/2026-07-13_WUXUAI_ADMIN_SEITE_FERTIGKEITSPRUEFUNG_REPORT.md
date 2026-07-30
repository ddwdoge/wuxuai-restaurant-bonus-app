# WUXUAI Bonus V1 – WUXUAI Admin Seite Fertigkeitsprüfung

Datum: 2026-07-13  
Status: **NOT READY**

## Zusammenfassung

Die WUXUAI Admin-Seite ist **keine reine Platzhalterseite**. Es gibt eine
echte interne Plattform-Admin-Basis für Restaurant-Verwaltung unter
`/admin/platform` und `/admin/platform/restaurants/:restaurantId`.

Sie ist aber **noch nicht vollständig fertig**. Mehrere vom Prüfauftrag
genannte Bereiche existieren nicht als eigene Admin-Seiten, und die
entscheidenden Plattform-RPCs wurden in diesem Lauf nicht live gegen Supabase
Staging geprüft.

## Geprüfte Admin-Routen

Vorhanden:

- `/admin` – Restaurant Portal, nicht WUXUAI Admin
- `/admin/settings` – Restaurant Portal Einstellungen
- `/admin/platform` – WUXUAI Admin Restaurant-Verwaltung
- `/admin/platform/restaurants/:restaurantId` – WUXUAI Admin Restaurantdetails
- `/platform-admin` – Kompatibilitätsroute zur Plattformseite
- `/platform-admin/restaurants` – Kompatibilitätsroute zur Plattformseite

Nicht vorhanden:

- `/admin/restaurants`
- `/admin/users`
- `/admin/subscriptions`
- `/admin/system`
- `/admin/support`

Bewertung:

Die interne Restaurant-Verwaltung existiert. Eine vollständige Admin-Struktur
mit User-, Abo-, System- und Support-Seiten existiert noch nicht.

## Zugriffsschutz

Frontend:

- `ProtectedRoute` unterstützt `roleScope="platform"`.
- `/admin/platform` und Detailroute nutzen Plattformrollen statt
  Restaurantrollen.
- Normale Restaurantrollen (`owner`, `admin`, `manager`) sind für
  `/admin/platform` nicht erlaubt.
- Ohne eingeloggten User wird auf `/login` geleitet.
- Ohne Plattformrolle erscheint: `Du hast keinen Zugriff auf diese Seite.`

Plattformrollen:

- `platform_owner`
- `platform_admin`
- `app_admin`
- `super_admin`
- `wuxuai_admin`
- `support`
- `billing_admin`
- `security_admin`
- `viewer`

Read-only Rollen:

- `support`
- `security_admin`
- `viewer`

Diese sehen im Code keine Schreibaktionen.

## Platform Admin Rollenprüfung

`AuthProvider` trennt:

- `restaurantRole`
- `platformRole`

`platformRole` wird aus `app_metadata.role` oder über
`get_current_platform_role()` ermittelt.

Bewertung:

Die Trennung ist vorhanden. Live-Verifikation mit echten kombinierten Rollen
steht aus.

## Echte Daten / Platzhalter

Echte Datenquellen:

- `get_platform_restaurants()`
- `get_platform_restaurant_detail(input_restaurant_id)`
- `update_platform_restaurant_subscription(...)`

Keine gefundenen Fake-Daten:

- keine `demoData`-Imports im Platform Admin
- keine `Kai Sushi`-Daten
- keine hardcodierten Fake-Restaurants
- keine Demo-KPIs

Problem:

Wenn `supabase` nicht konfiguriert ist, gibt `loadPlatformRestaurants()` aktuell
leere Werte zurück. Das ist kein Demo-Datensatz, kann aber eine fehlende
Verbindung als echte leere Plattform tarnen. Für eine fertige Admin-Seite sollte
stattdessen klar `Admin-Daten konnten gerade nicht geladen werden.` erscheinen.

## Restaurant-Verwaltung

Vorhanden:

- Restaurantliste
- Suche nach Name, Slug, Owner-E-Mail
- Filter: Alle, Aktiv, Pausiert, Gesperrt, Trial aktiv, Setup offen
- Detailansicht
- Restaurantname
- Slug
- Owner-E-Mail / Owner-Name
- Status
- Trial / Abo Status
- erstellt am
- letzte Aktivität
- Gäste
- Punkte heute
- Einlösungen heute
- Willkommensgeschenke aktiv
- Bonus Boost aktiv
- Audit-Auszug
- Links zu Restaurant Portal, Gäste-Link, Staff Portal und QR Center

Bewertung:

Restaurant-Verwaltung ist als V1-Basis echt umgesetzt, aber noch nicht live
gegen Staging geprüft.

## User- / Owner-Verwaltung

Nicht vorhanden als eigene Admin-Seite:

- keine `/admin/users` Route
- keine globale Userliste
- keine Owner-Detailverwaltung
- keine Rollenverwaltungsseite

Vorhanden:

- Owner-E-Mail und Owner-Name werden in Restaurantliste / Detailansicht
  angezeigt, sofern RPC-Daten vorhanden sind.

Bewertung:

User-/Owner-Verwaltung ist **nicht fertig**.

## Abo / Trial

Vorhanden:

- Trial Start
- Trial Ende
- verbleibende Trial-Tage
- Abo-Status
- Zahlungsstatus
- Abo aktivieren
- Abo pausieren
- Testphase um 14 Tage verlängern
- Zahlung manuell bestätigen
- Audit über `update_platform_restaurant_subscription(...)`

Nicht vorhanden:

- keine eigene `/admin/subscriptions` Route
- keine Stripe-Automation
- keine globale Abo-/Rechnungsliste

Bewertung:

V1-Basis vorhanden. Vollständige Subscription-Verwaltung nicht fertig.

## Systemstatus

Nicht vorhanden:

- keine `/admin/system` Route
- kein echter Supabase Health Check
- kein RPC-Erreichbarkeitsstatus
- kein Migrationsstatus
- keine Build-/Versionsanzeige
- keine Fehlerliste

Bewertung:

Systemstatus ist **nicht fertig**.

## Demo/Fake-Daten Prüfung

Geprüft in:

- `src/modules/platform`
- `src/app/App.tsx`
- `src/modules/auth`
- Plattform-Admin-Migrationen

Ergebnis:

- Keine Demo-Restaurants.
- Keine Fake-KPIs.
- Keine Mock-User.
- Keine hardcodierten Testdaten.

Gefundene Treffer:

- `placeholder="Restaurant suchen"` ist nur ein Suchfeld-Placeholder.
- `platform-logo-placeholder` ist ein UI-Fallback für fehlendes Logo.

Diese Treffer sind keine Fake-Daten.

## Fake-Klicks

Keine Fake-Klicks gefunden:

- Restaurantzeilen öffnen echte Detailroute.
- Status/Abo/Trial/Zahlung-Aktionen rufen
  `update_platform_restaurant_subscription(...)` auf.
- Read-only Rollen sehen keine Schreibbuttons.

Offen:

- Ob die RPCs in Staging wirklich speichern, wurde nicht live geprüft.

## Security / RLS / RPC Prüfung

Statisch geprüft:

- Plattformseiten verwenden `ProtectedRoute roleScope="platform"`.
- Restaurant Portal und WUXUAI Admin sind geroutet getrennt.
- Plattform-RPCs sind `security definer`, prüfen aber intern
  `is_platform_admin()` bzw. Schreibrollen.
- `anon` bekommt laut Migration keine Execute-Grants auf die Plattform-RPCs.
- Frontend enthält keine Service Role.

Nicht live geprüft:

- `get_platform_restaurants()` mit echtem Platform Admin.
- `get_platform_restaurant_detail(...)` mit echtem Platform Admin.
- `update_platform_restaurant_subscription(...)` mit echter Schreibrolle.
- normaler Restaurant Owner gegen `/admin/platform`.
- anon gegen Plattform-RPCs.
- read-only Rolle gegen Schreib-RPCs.

Grund:

`SUPABASE_ACCESS_TOKEN`, `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` waren
in diesem Lauf nicht im Environment gesetzt. Frühere Reports dokumentieren
außerdem, dass die Admin-Migration nicht auf Staging angewendet werden konnte.

## Mobile Prüfung

Statisch geprüft:

- `.platform-admin-grid` wird unter 1180 px einspaltig.
- Header-Aktionen werden unter 820 px gestapelt.
- Restaurantzeilen wechseln unter 820 px auf Grid.
- Buttons in Admin-Aktionen werden mobil full width.
- Listen sind kartenbasiert, keine klassische breite Tabelle.

Nicht live geprüft:

- echte Plattformrolle / echte Daten auf Mobile.

## Build Ergebnis

Befehl:

```bash
npm run build
```

Ergebnis: erfolgreich.

Wichtiger Chunk:

```text
dist/assets/PlatformAdminPage-DiRdejvH.js
```

## Kritische Blocker

1. **Staging / Live-RPC nicht geprüft**
   - Betroffen: `get_platform_restaurants`,
     `get_platform_restaurant_detail`,
     `update_platform_restaurant_subscription`
   - Risiko: Admin-Seite kann nicht als fertig gelten, solange Rollen, Grants,
     RLS und Daten live nicht validiert sind.

2. **WUXUAI Admin ist nicht vollständig**
   - Fehlend: User-Verwaltung, Systemstatus, Support-Bereich,
     globale Subscription-Seite.
   - Risiko: Die Seite ist eine Restaurant-Verwaltungsbasis, aber kein fertiges
     internes Admin-Portal.

## Mittlere Bugs / Risiken

1. **Fehlende Supabase-Verbindung wird in `loadPlatformRestaurants()` als leere
   Plattform zurückgegeben**
   - Betroffen: `src/modules/platform/platformAdminService.ts`
   - Empfehlung: Verbindungsausfall als Fehler anzeigen, nicht als leere
     Restaurantliste.

2. **Plattformrolle kann aus `app_metadata.role` kommen**
   - Betroffen: `src/modules/auth/AuthProvider.tsx`,
     `current_platform_role()`
   - `app_metadata` ist admin-kontrolliert, aber die finale Security-Abnahme
     sollte DB-/RPC-Rollen live verifizieren.

3. **Live-Deployment war zuletzt nicht auf aktuelle Assets aktualisiert**
   - Betroffen: Cloudflare Worker
   - Risiko: Live-Test der Admin-Seite prüft sonst alten Code.

## Kleine Punkte

1. Einzelne UI-Begriffe sind noch gemischt:
   - `Trial aktiv`
   - `Setup offen`
   Empfehlung: später in reinere Restaurant-/Admin-Sprache ändern:
   `Testphase aktiv`, `Einrichtung offen`.

2. Es gibt keine dedizierte Versionsanzeige im Admin.

## Fazit

Die WUXUAI Admin-Seite ist **nicht nur Platzhalter**. Die
Restaurant-Verwaltungsbasis ist real und RPC-basiert.

Sie ist aber **noch nicht fertig** und nicht LOCK-fähig, weil:

- zentrale Admin-Unterbereiche fehlen,
- Staging-/RLS-/RPC-Tests fehlen,
- die Migration laut Vorreport nicht auf Staging angewendet wurde,
- Live aktuell nicht sicher den neuesten Build lädt.

## Status

NOT READY
