# Standortkarte – Leaflet-Kachelreparatur

Datum: 23.08.2026  
Branch: `codex/v1-release-finishing-sprint`  
Ausgangscommit: `0a2036e`

## Ursache

Die OpenStreetMap-Infrastruktur war nicht die Ursache:

- `https://bonus.wuxuaisbi.com/admin/settings/standort` liefert keinen
  blockierenden Content-Security-Policy-Header aus.
- Die geprüfte OpenStreetMap-Kachel antwortete über HTTPS mit HTTP 200 und
  `content-type: image/png`.
- Die bestehende Tile-URL war ebenfalls HTTPS; es gab kein Mixed Content.

Der Fehler lag in der lokalen Kartenintegration:

1. Die Karten- und Markerstyles wurden nur von der öffentlichen Finder-Seite
   importiert. Die Owner-Route verwendete dieselbe lazy Kartenkomponente, ohne
   diese Styles selbst zu laden. Das Ergebnis hing damit von der vorherigen
   Navigation und bereits geladenen CSS-Chunks ab.
2. Die lazy gerenderte Leaflet-Karte wurde nach der endgültigen Größe ihres
   dynamischen Owner-Containers nie mit `invalidateSize()` synchronisiert.
   Ein zu früh berechnetes Tile-Grid blieb dadurch bis zu einem späteren
   Browser-Resize unverändert.
3. Ein echter Tile-Fehler hatte keinen Laufzeitstatus. Controls und Attribution
   blieben sichtbar, während die Kartenfläche leer erschien.

## Änderung

- Gemeinsame Kartenstyles liegen nun in
  `src/modules/customer/partner-restaurant-map.css` und werden direkt von der
  Kartenkomponente geladen.
- Die kanonische OSM-Adresse
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png` wird verwendet.
- Ein begrenzter `ResizeObserver` synchronisiert ausschließlich echte
  Größenänderungen. Initial erfolgen zwei Animation-Frames, danach ein
  `invalidateSize({ animate: false })`; es gibt keinen Timer- oder Resize-Loop.
- `tileload` bestätigt eine tatsächlich dekodierte Kachel. `tileerror` und ein
  achtsekündiger Initial-Timeout aktivieren den Fehlerzustand.
- Der Retry erzeugt genau einen neuen TileLayer-Versuch.
- Standortformular, Speicherung, öffentliche Suche und Restaurantkontext wurden
  nicht verändert.

## Netzwerk- und Sicherheitsprüfung

- Staging-Dokument: HTTP 200.
- OpenStreetMap-Testkachel: HTTP 200, PNG, CORS `*`, HSTS aktiv.
- CSP-Blockade: nicht vorhanden.
- Mixed Content: nicht vorhanden.
- Keine Wildcard-CSP ergänzt und keine Security Header geschwächt.
- Keine Migration, keine RLS-, Grant- oder Tenantänderung.

## Browser-Verhaltenstest

Die echte `PartnerRestaurantMap` wurde in einem isolierten lokalen Vite-Harness
mit `48.208174, 16.373819` ausgeführt. Der Harness wurde nach der Prüfung
vollständig entfernt.

- 390 px: 4 dekodierte OSM-Kacheln, Wien-Marker, 44 × 44 px Zoomflächen, kein
  horizontaler Overflow.
- 430 px: 4 dekodierte Kacheln, Marker, kein Overflow.
- 768 px: 8 dekodierte Kacheln, Marker, kein Overflow.
- 1024 px: 8 dekodierte Kacheln, Marker, kein Overflow.
- 1440 px: 8 dekodierte Kacheln, Marker, kein Overflow.
- Resize 768 → 390 ohne Reload: Kartenbreite 720 → 342 px, Kacheln und Marker
  blieben vorhanden.
- Zoom-in: neue Kacheln wurden geladen.
- Provider-Ausfall: verständlicher Fehler und 44 px hoher Retry; Marker und
  Standortdaten blieben nutzbar.
- Ungültige Koordinaten bleiben durch den vorhandenen Owner-Guard von der
  Kartenerzeugung ausgeschlossen.

## Qualität

- Kartentests: 16/16 bestanden.
- Gesamttests: 703/703 bestanden.
- Typecheck: bestanden.
- Lint: 0 Fehler, 8 bestehende Warnungen.
- Build: bestanden.
- `git diff --check`: bestanden.

## Staging

Die öffentliche Staging-Antwort und der Tile-Provider wurden live geprüft. Eine
authentifizierte Prüfung der Owner-Route war in der verfügbaren Browsersitzung
nicht möglich; die Route leitete korrekt auf `/restaurant/login` um. Es wurde
kein Zugang eingegeben und keine Staging- oder Production-Aktion ausgeführt.

## Risiken

- Die authentifizierte Staging-Abnahme nach Bereitstellung dieses Builds ist
  noch offen.
- Externe OSM-Kacheln können trotz funktionierender Integration temporär nicht
  verfügbar oder rate-limitiert sein; dann greift der neue Fehlerzustand.

Status: CODE LOCK / authentifizierte Staging-Abnahme offen
