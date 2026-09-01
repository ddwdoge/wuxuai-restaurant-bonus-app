# Restaurant-Adressgeocodierung mit Nominatim

Datum: 23.08.2026  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `c245e1b`  
Zielumgebung: Supabase Staging `bwhv…qaya`

## Ursache und Ausgangslage

Der vorhandene Standortbereich speicherte bereits Adresse, Koordinaten und
Sichtbarkeit am primären `branches`-Datensatz. Owner mussten Breitengrad und
Längengrad jedoch prominent selbst eingeben. Eine Geocoding-Funktion, ein
Provider-Cache und ein anwendungsweites Nominatim-Limit existierten nicht.
Leaflet, OpenStreetMap-Kacheln, Marker, Finder-RPC und tenantgebundene
Branch-Updates waren bereits vorhanden und wurden weiterverwendet.

## Umsetzung

- Das Hauptformular verlangt nur Adresse, Postleitzahl, Ort und Land.
- `Adresse auf Karte anzeigen` startet genau einen serverseitigen Request.
- Ein Treffer wird übernommen; mehrere Treffer erscheinen unter `Welche
  Adresse meinst du?`; kein Treffer und Rate Limit besitzen deutsche
  Retry-Zustände.
- Adressänderungen löschen die UI-Koordinaten sofort und blockieren Speichern,
  bis die neue Adresse geprüft wurde.
- Koordinaten bleiben in einem eingeklappten, nur lesbaren Detailbereich
  sichtbar und werden gemeinsam mit den bestehenden Standortfeldern gespeichert.
- Die vorhandene Leaflet-Karte, der OSM-Tile-Layer, die Markerlogik und die
  öffentliche Finder-Regel bleiben unverändert.

## Server- und Sicherheitsvertrag

`owner-location-geocode` prüft den Supabase-JWT mit `auth.getUser`, danach die
aktive Restaurantzuordnung als Owner oder Admin. Erst anschließend wird aus den
vier Geschäftsadressfeldern eine normalisierte Anfrage gebildet. Der
Nominatim-Endpunkt ist fest auf HTTPS gesetzt und kann nicht aus Clientdaten
überschrieben werden.

An Nominatim gehen ausschließlich Straße/Hausnummer, Postleitzahl, Ort und
Ländercode sowie ein identifizierender WUXUAI-User-Agent. Restaurant-ID,
User-ID, Auth-Token, Owner-, Kunden-, Kontakt-, Zahlungs- und Legaldaten werden
nicht in Provider-URL, Header oder Payload übernommen. Die Function schreibt
keine Anfrageinhalte in Logs.

Die additive Migration `20260823001000_owner_location_geocoding_cache.sql`
war trotz vorhandener Koordinatenfelder erforderlich, weil ein In-Memory-Limit
über mehrere Edge-Isolates nicht anwendungsweit sicher wäre. Sie ergänzt:

- einen 24 Stunden gültigen, SHA-256-adressierten Ergebnis-Cache,
- Löschung abgelaufener Cachezeilen bei neuen Provider-Aufrufen,
- einen atomar beanspruchten globalen Nominatim-Slot von 1,1 Sekunden,
- RLS und vollständig entzogene Browserrechte,
- ausschließlich `service_role`-Zugriff auf Cache und Slot-RPC,
- `SECURITY DEFINER` mit festem `search_path = pg_catalog, public`.

Bestehende Branch-RLS, Public-Finder-RPCs und Tenant-Updates wurden nicht
gelockert oder ersetzt.

## Provider- und Staging-Prüfung

- Offizielle Nominatim-Regeln geprüft: Button-Auslösung, kein Autocomplete,
  höchstens ein Request pro Sekunde, identifizierender User-Agent und Cache.
- `Am Platz 3, 1130 Wien, AT`: vier plausible Treffer; erster Treffer im
  Wiener Bezirk Hietzing.
- `Stephansplatz 1, 1010 Wien, AT`: ein plausibler Treffer im 1. Bezirk.
- Migration-Dry-Run: nur `20260823001000_owner_location_geocoding_cache.sql`.
- Migration auf Staging angewendet; lokale und Remote-Historie synchron.
- Staging DB Linter: 0 Fehler.
- Edge Function auf `bwhv…qaya` deployt.
- Unauthentifizierter Function-Aufruf: HTTP 401, kein Provider-Aufruf.

Ein authentifizierter Owner-Smoke-Test konnte nicht abgeschlossen werden: Die
verfügbare Browser-Sitzung wurde korrekt auf `/restaurant/login` umgeleitet und
es wurden keine Zugangsdaten angefordert oder verwendet. Deshalb werden Live-
Speichern, Refresh sowie die Viewports 390/430/768/1024/1440 nicht als Staging-
PASS behauptet.

## Legal und Datenschutz

Das verbindliche Legal-Paket V0.9 wurde nicht still überschrieben. Das Addendum
`2026-08-23_OWNER_LOCATION_GEOCODING_V0_9_DRAFT.md` dokumentiert den
Geschäftsadress-Datenfluss, die technische Supabase-Server-IP, den Link zur OSM
Foundation Privacy Policy, einen knappen AGB-Drittanbieterhinweis und die noch
offene Production-Rechtsprüfung. Status bleibt
`DRAFT_LEGAL_REVIEW_REQUIRED`. Eine neue Kunden-Checkbox oder automatische
Reacceptance wurde nicht eingeführt.

## Qualität

- Tests: 709/709 erfolgreich, davon 6 neue Geocoding-Vertragstests.
- Typecheck: erfolgreich.
- Lint: 0 Fehler, 8 unveränderte Warnungen.
- Build: erfolgreich.
- `git diff --check`: erfolgreich.
- Keine Secrets, `.env`-Dateien, Dumps oder Buildartefakte im vorgesehenen Diff.

## Ergebnis

```text
ADDRESS-ONLY OWNER FLOW:
PASS

MANUAL COORDINATES REQUIRED:
NO

SERVER-SIDE GEOCODING:
PASS

NOMINATIM:
PASS

ONLY BUSINESS ADDRESS SENT:
PASS

OWNER/CUSTOMER/AUTH DATA SENT:
NO

RATE LIMIT <= 1 REQUEST/SECOND:
PASS

BUTTON-ONLY REQUEST:
PASS

CACHE:
PASS

MULTIPLE RESULTS:
PASS

NO RESULT:
PASS

ADDRESS CHANGE INVALIDATES OLD POSITION:
PASS

LATITUDE/LONGITUDE SAVED:
PASS

MAP:
PASS

MARKER:
PASS

PUBLIC RESTAURANT SEARCH REGRESSION:
PASS

PRIVACY TEXT UPDATED:
YES

AGB THIRD-PARTY NOTICE:
YES

LEGAL VERSIONING REVIEWED:
YES

RLS / TENANT SECURITY:
PASS

MOBILE:
FAIL – authentifizierte Staging-Viewports noch offen

DESKTOP:
FAIL – authentifizierter Staging-Smoke-Test noch offen

TESTS:
709/709 PASS

TYPECHECK:
PASS

LINT:
PASS (0 Fehler, 8 bestehende Warnungen)

BUILD:
PASS

STAGING VERIFIED:
NO

LOCATION GEOCODING READY:
NO

PRODUCTION:
LOCKED

STRIPE:
DEFERRED
```

## Offenes Gate

Mit einem autorisierten Staging-Owner sind der vollständige Klickflow,
Speichern/Refresh, Kartenmarker und die fünf Responsive-Viewports zu prüfen.
Bis dahin gilt maximal CODE LOCK und kein FINAL LOCK.
