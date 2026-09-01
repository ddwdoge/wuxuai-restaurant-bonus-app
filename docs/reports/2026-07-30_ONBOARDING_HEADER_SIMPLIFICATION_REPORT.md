# Onboarding Header Simplification Report

## Ursache

Der Onboarding-Wizard zeigte den Fortschritt doppelt: einmal als kompakte Fortschrittsanzeige und zusätzlich als sieben Step-Kacheln. Die zweite Navigation beanspruchte besonders auf Mobile unnötig viel Höhe und verzögerte den Beginn der eigentlichen Aufgabe.

## Geänderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/styles.css`
- `tests/onboarding-header-ux.test.mjs`

## Was wurde geändert

- Die Step-Kacheln 1 bis 7 wurden vollständig aus JSX und CSS entfernt.
- Der nicht mehr benötigte Auto-Scroll-State wurde entfernt.
- Der Fortschrittsbereich ist jetzt die einzige Fortschrittsdarstellung.
- Er zeigt Schritt X von Y, den tatsächlichen Seitentitel, Prozentwert und Fortschrittsbalken.
- Die sieben doppelten Seitentitel innerhalb der Formularkarte wurden entfernt.
- Der aktuelle Schrittinhalt beginnt direkt unter dem Fortschrittsbereich.
- Desktop-Abstände und Titelgröße wurden reduziert.
- Mobile zeigt Restaurantauswahl, zugängliche Hilfeaktion und Account in einer kompakten Zeile.
- Die Hilfe bleibt über `aria-label` verständlich, wenn auf Mobile nur das Icon sichtbar ist.

## Was wurde nicht geändert

- Keine Onboarding-, Autosave-, Aktivierungs- oder Navigationslogik geändert.
- Restaurantwechsel, Hilfe-Drawer, Account-Menü und Logout bleiben unverändert funktionsfähig.
- Keine Datenbank-, RPC-, RLS- oder Security-Änderung.
- Keine Migration.
- Kein Push und kein Merge.

## Responsive Prüfung

Geprüft bei 390, 768, 1024 und 1440 px:

- keine Step-Kacheln im DOM
- keine doppelte Kartenüberschrift
- kein horizontaler Overflow
- keine abgeschnittenen Header- oder Kartenbereiche
- alle Buttons und Auswahlfelder mindestens 44 x 44 px
- Abstand zwischen Fortschritt und Inhalt: 14 px mobil, 20 px ab Tablet

Auf 390 px wurde der Hauptheader gegenüber dem vorherigen Stand um rund 73 px reduziert. Trotz des ausführlicheren Seitentitels im Fortschrittsbereich beginnt der Arbeitsinhalt insgesamt deutlich früher.

Die visuelle Prüfung erfolgte mit einem datenfreien lokalen QA-Gerüst auf Basis der realen JSX-Struktur und des aktuellen Stylesheets. Eine authentifizierte Tenant-Sichtprüfung bleibt Teil der nachfolgenden visuellen Freigabe.

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 330/330 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich

## Risiken

- Authentifizierte Sichtprüfung mit einem echten langen Restaurantnamen steht noch aus.

## Status

`READY_FOR_VISUAL_REVIEW`
