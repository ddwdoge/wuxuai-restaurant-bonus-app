# Onboarding Header UX Restructure Report

## Ursache

Der Onboarding-Titel, Sitzungsaktionen, Fortschritt und die Step-Navigation lagen ohne klare Ebenen in einem gemeinsamen Kopfbereich. Lange Restaurantnamen und deutsche Step-Titel beanspruchten dadurch zu viel Breite und schwächten die visuelle Hierarchie.

## Geänderte Dateien

- `src/modules/admin/AdminLayout.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/styles.css`
- `tests/onboarding-header-ux.test.mjs`

## Was wurde geändert

- Der Hauptheader bündelt Eyebrow, Titel und Untertitel links sowie Restaurantauswahl, Hilfe und bestehendes Account-Menü rechts.
- Die Owner-Rolle bleibt im bestehenden Account-Menü und wird nicht mehr als separates Element im Onboarding gezeigt.
- Fortschrittsangabe, aktueller Schritt, Prozentwert und zugänglicher Fortschrittsbalken bilden eine eigene Ebene.
- Die sieben Schritte besitzen gleiche Höhe und Grundbreite, zentrierte Beschriftungen mit maximal zwei Zeilen sowie eigene Aktiv-, Abschluss- und Zukunftszustände.
- Auf kleinen Displays scrollt ausschließlich die Step-Leiste horizontal; der aktive Schritt wird automatisch zentriert.
- Tabletansichten verwenden drei gleichmäßige Spalten, damit lange deutsche Titel ohne Trennung oder Abschneiden lesbar bleiben.
- Bei 1280 px wird das Account-Menü platzsparend als Avatar dargestellt; Rolle und Abmelden bleiben im geöffneten Menü erreichbar.
- Der Abschlussinhalt besitzt einen klaren Abstand zur Step-Navigation.
- Restaurantauswahl, Hilfe, Account und Formularaktionen haben mindestens 44 px Touchhöhe.

## Was wurde nicht geändert

- Keine Onboarding-Geschäftslogik wurde für diese Header-Aufgabe verändert.
- Bestehender Restaurantwechsel, Account-Flow und Logout werden wiederverwendet.
- Keine Datenbank-, RPC-, RLS- oder Security-Änderung.
- Keine Migration.
- Kein Push, Merge oder Deployment.

## Produktbegriff

Schritt 3 bleibt `Geöffnet`. Die gesperrte Engineering Bible (`docs/08_FLOW_01_ONBOARDING.md`) definiert diesen V1-Titel ausdrücklich; deshalb wurde er nicht in `Öffnungszeiten` umbenannt.

## Responsive und Accessibility

Geprüfte Breiten: 390, 430, 720, 768, 1024, 1280 und 1440 px.

- Dokumentbreite entsprach an allen geprüften Breiten der Viewportbreite.
- Keine abgeschnittenen Step-Titel.
- Keine betroffenen Controls unter 44 x 44 px.
- Lange Restaurantnamen werden kontrolliert gekürzt.
- Aktiver Schritt besitzt `aria-current="step"`.
- Fortschrittsanzeige besitzt `role="progressbar"` und numerische ARIA-Werte.
- Hilfe- und Account-Aktionen bleiben per Tastatur erreichbar und nutzen bestehende Fokuszustände.
- 720 px wurde zusätzlich als effektive Layoutbreite für 1440 px bei 200-%-Vergrößerung geprüft.

Die geschützte Onboarding-Route konnte ohne vorhandene Owner-Anmeldedaten nicht als echter Tenant geöffnet werden. Die visuelle Prüfung erfolgte deshalb mit einem datenfreien lokalen QA-Gerüst, das die reale JSX-Struktur und die aktuelle `src/styles.css` verwendet. Authentifizierte Restaurantauswahl und Account-Menü bleiben ein offener manueller Sichtprüfungspunkt.

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 330/330 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich

## Risiken

- Physische Browserprüfung mit 200-%-Zoom und authentifiziertem Owner-Zugang bleibt für die visuelle Freigabe offen.
- Im Working Tree liegen bereits weitere, nicht zu dieser Aufgabe gehörende geprüfte Änderungen. Sie wurden weder verworfen noch committed.

## Status

`READY_FOR_VISUAL_REVIEW`
