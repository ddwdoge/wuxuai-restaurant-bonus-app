# Customer Restaurant Hero Image Fallback

Datum: 25.08.2026  
Branch: `codex/v1-canonical-recovery`  
Ausgangs-Commit: `3e62e1e19c308281814594a886b820da0b7eb33d`

## Ursache

Die Customer-Detailansicht liest das Titelbild aus
`public.branches.public_cover_image_url`; der aggregierte Finder-RPC gibt den
Wert als `cover_image_url` zurueck. Fuer `WU und XU Group GmbH` ist auf Staging
der Wert `http://wuxugroup.com` gespeichert.

Der HTTP-Aufruf antwortet zuerst mit `301` auf `https://wuxugroup.com/` und
anschliessend mit `200` sowie `Content-Type: text/html; charset=utf-8`. Die
Adresse zeigt damit auf eine Website und nicht auf eine dekodierbare
Bildressource. Der bisherige rohe `<img>`-Renderer besass keinen Lade- oder
Fehlerzustand. Safari zeigte deshalb Alternativtext und das native Symbol fuer
ein defektes Bild.

Klassifikation: fehlerhafte Bildadresse und nicht unterstuetzter Inhaltstyp
(`D` und `F`). Es handelt sich nicht um ein Supabase-Storage-Objekt, keine
abgelaufene signierte URL und keinen privaten Bucketfehler.

## Live-Pruefung

- Staging-Projekt: `bwhvfjuwixgwduoeqaya`
- Feld: `branches.public_cover_image_url`
- Cover-Adresse: `http://wuxugroup.com`
- Cover-Ziel: externe Website
- HTTP: `301` -> `200`
- Content-Type: `text/html; charset=utf-8`
- Bildobjekt vorhanden: Nein, externe HTML-Ressource
- Logo-Fallback: Bucket `restaurant-media`
- Logo-Fallback HTTP: `200`
- Logo-Fallback Content-Type: `image/png`
- Storage-Vertrag: Bucket bleibt unveraendert oeffentlich fuer freigegebene
  Restaurantmedien; kein Bucket und keine Policy wurden geaendert.

## Geaenderte Dateien

- `src/modules/customer/components/RestaurantHeroImage.tsx`
- `src/modules/customer/PartnerRestaurantFinderPage.tsx`
- `src/modules/customer/partner-restaurant-finder.css`
- `tests/customer-restaurant-hero-image.test.mjs`
- `tests/customer-mobile-chips-logo.test.mjs`
- `tests/restaurant-hero-image-fixture.html`
- `docs/19_CHANGELOG.md`
- dieser Report

## Was wurde geaendert

- Gemeinsame Customer-Komponenten fuer Restaurant-Hero und Restaurantlogo
  eingefuehrt.
- Explizite Zustaende `loading`, `valid`, `missing` und `error` umgesetzt.
- Titelbild bleibt bis zum erfolgreichen `load` unsichtbar; bei `error` wird
  das fehlerhafte `<img>` entfernt.
- Fallback-Reihenfolge: Restaurantlogo, danach neutrales Lokal-Symbol mit
  Restaurantinitiale.
- Fehlerzustand wird nur bei einer neuen Quelladresse zurueckgesetzt. Es gibt
  keine Retry-Schleife.
- Hero, Bild und Fallback behalten dieselbe feste Hoehe. Im mobilen Drawer
  verwendet der Hero exakt die verfuegbare Breite.
- Auch Listen- und Detail-Logos verwenden denselben abgesicherten Ladefehlerpfad.

## Was wurde nicht geaendert

- Keine Datenbankdaten wurden veraendert.
- Keine Migration, RLS-, Grant-, Storage- oder Bucket-Aenderung.
- Keine Aenderung an Finder, Karte, Customer Auth, Punkten, Rewards, Referral
  oder Routing.
- Der fehlerhafte Staging-Wert wurde nicht stillschweigend ersetzt. Er kann
  ueber den bestehenden Owner-Standortflow durch eine echte HTTPS-Bildadresse
  ersetzt werden.

## Tests und Visual QA

- Valides Titelbild: Bild sichtbar.
- Kein Titelbild: Logo-Fallback sichtbar.
- Defekte Titelbildadresse: Logo-Fallback sichtbar.
- Defektes Titelbild und fehlendes Logo: neutraler Fallback sichtbar.
- Browser-Fragezeichen: nicht sichtbar.
- Sichtbarer Alternativtext bei Bildfehler: nicht vorhanden.
- Layoutsprung: keiner; alle Hero-Zustaende messen 112 px.
- Breiten `320`, `375`, `390`, `414`, `430`, `768`, `1024`: jeweils ohne
  horizontalen Ueberlauf.
- Vollstaendige Tests: `990/990 PASS`.
- Typecheck: PASS.
- Lint: PASS mit 0 Fehlern und 7 unveraenderten Bestandswarnungen.
- Build: PASS.
- `git diff --check`: PASS.
- Pruef-ZIP: `exports/2026-08-25_CUSTOMER_RESTAURANT_HERO_IMAGE_FALLBACK.zip`
  (vollstaendiger Quellstand, 850 Dateien; ohne `.git`, Abhaengigkeiten,
  Build-Ausgaben, Umgebungsdateien, Secrets und alte Archive).

## Risiken

- Der Staging-Datensatz enthaelt weiterhin die fachlich falsche Website-Adresse.
  Kunden sehen nach Auslieferung des Codes sicher den Fallback; ein echtes
  Titelbild erfordert weiterhin eine gueltige Bildadresse im Owner-Flow.
- Der Fix ist lokal und noch nicht auf Staging deployt. Ein echter iPhone-Test
  des neuen Renderers ist daher erst nach gesondert freigegebenem Deployment
  moeglich.

## Status

`CODE LOCK`
