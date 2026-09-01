# Owner Branding - Compact Smart Logo Editor V2

## Ursache

Der bestehende Logo-Editor verteilte Live-Vorschau, drei hohe Regler,
Verwendungsvorschauen und Speichern vertikal in einem langen Drawer. Dadurch
ging auf Laptop-Höhen der visuelle Zusammenhang zwischen Änderung und Ergebnis
verloren. Die breite Haupt-LogoStage übernahm zudem prozentuales Wide-Logo-
Padding, das bei der kompakten Bühnenhöhe den sichtbaren Bildinhalt vollständig
verdrängen konnte.

## Geänderte Dateien

- `src/modules/admin/pages/SettingsPage.tsx`
- `src/shared/components/AppDrawer.tsx`
- `src/styles.css`
- `tests/owner-smart-logo-presentation.test.mjs`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/19_CHANGELOG.md`
- `design-qa.md`

Die ausschließlich zur lokalen visuellen Prüfung verwendeten Dateien
`logo-editor-qa.html` und `src/logo-editor-qa.tsx` wurden wieder entfernt.

## Was wurde geändert

- Zentrierter Workspace mit maximal 90 Prozent Viewporthöhe.
- Kompakter Kopf und fest erreichbarer Aktionsbereich.
- Reale Live-Vorschau innerhalb eines gestrichelten, nur im Editor sichtbaren
  Sicherheitsrahmens.
- Kompakte 44-Pixel-Schrittsteuerungen für Größe, Horizontal und Vertikal.
- Getrennte Aktionen für automatische Anpassung und Zurücksetzen auf den beim
  Öffnen gespeicherten Zustand.
- Vier gleich große Nutzungsvorschauen für Gäste-Header, Restaurantdetails,
  QR Starter Kit und Mitarbeiter-Header über `RestaurantLogoStage`.
- Sofortige synchrone Aktualisierung aller fünf LogoStage-Instanzen.
- Einspaltige mobile Darstellung; nur der Editorinhalt scrollt.

## Was wurde nicht geändert

- Smart-Logo-Algorithmus und dessen Grenzwerte.
- Logo-Dateien, Upload oder Storage-Vertrag.
- Persistenzfelder und Datenbank.
- RLS, Rollen, QR-Payloads oder Bonuslogik.
- Production oder Staging-Deployment.

## Visuelle Prüfung

- 1280 x 720: kompletter Arbeitsablauf ohne internen Scrollweg.
- 1366 x 768, 1440 x 900 und 1440 x 1024: dieselben Desktop-Regeln; durch
  kleinere Höhen nicht enger als der verifizierte 1280-x-720-Fall.
- 390 und 430: einspaltig, kein globales Überlaufen, Footer sichtbar.
- 768 und 1024: drei Steuerungen und vier Vorschauen pro Zeile, kein globales
  Überlaufen.
- Browserkonsole: keine Fehler; sieben bekannte Lint-Warnungen liegen außerhalb
  dieses Scopes.

## Qualität

- Smart-Logo-Tests: 8/8 PASS.
- Vollständige Tests: 1042/1042 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen.
- Build: PASS.
- `git diff --check`: PASS.
- Secret-Prüfung der Änderungen: PASS.

## Migration und Staging

- Migration: keine.
- Auf Staging angewendet: nein.
- Echter Owner-Save/Reload auf Staging: noch nicht durchgeführt.

## Risiken

Der Code- und Browserzustand ist geprüft. Für einen `FINAL LOCK` fehlt noch die
Verifikation des Speicherns und erneuten Ladens im authentifizierten Staging-
Ownerkonto mit den vorgesehenen realen Logoformaten.

Status: CODE LOCK
