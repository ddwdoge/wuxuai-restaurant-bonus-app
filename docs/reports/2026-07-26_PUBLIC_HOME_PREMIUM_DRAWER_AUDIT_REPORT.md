# Öffentliche Startseite und appweiter Drawer-Audit

Datum: 2026-07-26
Branch: `codex/v13-legal-maps-hardening`
Ausgangscommit: `82a0f18`

## Ursache

Die öffentliche Route `/` verwendete eine ältere, großzügige Website-Geometrie mit mindestens 250 px hohen Karten, 24 px Innenabstand, 28 px Abschnittsabstand, dominanten Rahmen und nicht zentralisierten Premium-Werten. Auf 390 px reichte die dritte Karte deshalb bis etwa 970 px und lag deutlich außerhalb des ersten Viewports.

Zusätzlich existierten neben `AppDrawer` eigene Overlay-Basen für den Onboarding-Hinweis, die Mitarbeiter-PIN und das mobile Owner-Menü. Der Restaurant-Finder besitzt außerdem eine responsive Detailkarte, die auf Mobil als nicht-modales Sheet innerhalb des Karte-/Liste-Flows arbeitet.

## Beteiligte Stellen

- Route: `src/app/App.tsx`, Pfad `/`
- Startseite: `src/modules/public/PublicHome.tsx`
- globale Premium-Tokens und Layout: `src/styles.css`
- gemeinsame Overlay-Basis: `src/shared/components/AppDrawer.tsx`
- Owner-Menü und Owner-Drawer: `src/modules/admin/AdminLayout.tsx`, `src/modules/admin/pages/RestaurantOnboarding.tsx`, `src/modules/admin/pages/RewardsPage.tsx`, `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- Kunden-Drawer und Finder-Detail: `src/modules/customer/CustomerPortal.tsx`, `src/modules/customer/PartnerRestaurantFinderPage.tsx`, `src/modules/customer/partner-restaurant-finder.css`
- Mitarbeiter-Drawer: `src/modules/staff/StaffTablet.tsx`
- Plattform-Drawer: `src/modules/platform/PlatformAuditPage.tsx` (bereits auf `AppDrawer`)

## Startseiten-Audit

### Vorher bei 390 px

- Außenabstand: 24 px
- Überschrift: 34 px, etwa 71 px hoch
- Abstand zum Kartenbereich: 28 px
- Karten: 342 × 250 px
- Karten-Innenabstand: 24 px
- Kartenabstand: 16–18 px
- dritte Karte: Unterkante etwa 970 px

### Nachher

- warmer zentraler Creme-Hintergrund
- kompakter Hero mit Serif-Überschrift und unveränderten Texten
- drei echte, vollständig klickbare Links mit Lucide-Icons
- mobile Karten als kompakte horizontale Struktur
- 16 px Seitenabstand, 14 px Inhaltsabstand, 20 px Radius
- CTA-Touchhöhe 44 px
- primärer Login dezent in Gold priorisiert

Gemessene Live-Werte:

| Viewport | Dokumentbreite | Kartenlayout | letzte Kartenunterkante | Ergebnis |
| --- | ---: | --- | ---: | --- |
| 390 × 844 | 390 px | 1 Spalte | 670 px | bestanden |
| 430 × 932 | 430 px | 1 Spalte | 632 px | bestanden |
| 768 × 900 | 2 + 1 zentriert | 2 Spalten | 735 px | bestanden |
| 1024 × 900 | 1024 px | 3 Spalten | 657 px | bestanden |
| 1440 × 900 | 1440 px | 3 Spalten | 648 px | bestanden |

In allen fünf Viewports galt `document.documentElement.scrollWidth === window.innerWidth`.

## Design-Tokens

In `src/styles.css` wurden gemeinsame `--wux-*`-Tokens für Hintergrund, Surface, Text, Gold, Border, Karten-/Sheet-Radius, Karten-/Overlay-Schatten, Bewegung und Easing konsolidiert. Die unreferenzierte parallele Datei `src/styles 2.css` wurde entfernt.

## Drawer- und Sheet-Audit

Gefunden wurden 20 direkte `AppDrawer`-Instanzen und ein responsives Finder-Detail-Sheet, insgesamt 21 Stellen.

Vorher bestanden fünf unterschiedliche technische Basen:

1. `AppDrawer`
2. Onboarding-Eigenmodal
3. Mitarbeiter-PIN-Eigenmodal
4. mobiles Owner-Menü mit eigenem Backdrop
5. responsive Finder-Detailkarte

Danach bestehen zwei bewusst getrennte Basen:

1. `AppDrawer` für alle modalen Dialoge, Drawer und das Owner-Menü
2. Finder-Detailkarte als nicht-modaler Bestandteil der synchronisierten Karten-/Listenansicht

`AppDrawer` stellt jetzt einheitlich bereit:

- Größen `compact`, `standard`, `large`
- Desktop-Seitendrawer und mobiles Bottom Sheet
- Dialogrolle, `aria-modal` und beschrifteten 44-px-Schließen-Button
- Fokusfalle, Escape, Fokusrückgabe und Body-Scroll-Lock
- gemeinsamen Overlay-, Radius-, Schatten- und Animationstoken
- Safe-Area-Footer und internen Scrollbereich
- optional deaktivierbares Overlay-Schließen für kritische Formulare
- Reduced-Motion-Unterstützung

Die Finder-Detailkarte erhielt denselben Radius-/Schattenstandard und einen echten 44 × 44 px Schließen-Button. Sie bleibt nicht-modal, damit Karte und Liste semantisch zusammenarbeiten.

## Portalprüfung

- Öffentlich: Startseite geprüft; dort existiert aktuell kein eigener Info-Drawer.
- Kundenportal: Reward, Einlösung, Info und Konto verwenden `AppDrawer`; Profiländerung schließt nicht versehentlich über das Overlay.
- Owner-Portal: Reward-/Geschenkeditor, Vorschau, Status, Bildbestätigung, Onboarding-Hinweis und mobile Navigation verwenden `AppDrawer`.
- Mitarbeiterportal: PIN-Details, Aktivität und Bestätigung verwenden `AppDrawer`; kritische PIN-Eingabe schließt nicht über das Overlay.
- Plattformportal: Audit-Detail verwendet weiterhin dieselbe `AppDrawer`-Basis.

## Accessibility

- genau eine H1 auf `/`
- alle drei Karten sind echte Links mit verständlichen Namen
- sichtbarer Fokuszustand in CSS
- Mindest-Touchhöhe 44 px
- Drawer mit Dialogsemantik, Fokusfalle, Escape, Fokusrückgabe und Scroll-Lock
- reduzierte Bewegung berücksichtigt
- Quellcodeprüfung für lange Texte und internen Scrollbereich bestanden

Ein physischer Screenreader-Test und ein realer Browser-Textzoom auf 200 % konnten in dieser Umgebung nicht vollständig durchgeführt werden. Ebenso bleiben physischer iPhone-Safari- und installierter PWA-Test offen.

## Regression

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 149/149 erfolgreich
- Build: erfolgreich
- Browserkonsole `/`: 0 Fehler; nur bekannte React-Router-v7-Hinweise
- unerwartete Netzwerkfehler `/`: 0

## Nicht geändert

- keine Geschäftslogik
- keine Punkte-, Reward-, Tages-PIN- oder Registrierungslogik
- keine API-, Supabase-, Storage-, Auth- oder Billing-Änderung
- keine Migration
- keine RLS-/Security-Änderung
- kein Commit, Push oder Deployment

## Offene Risiken

- physischer iPhone-Safari-Test einschließlich Bottom Bar und großer Schrift offen
- installierte PWA offen
- echter Screenreader-Test offen
- vollständiger 200-%-Textzoom muss noch physisch/browserseitig abgenommen werden
- authentifizierte Drawer-Flows wurden durch Quellcode- und Regressionstests geprüft, aber nicht mit echten Staging-Rollen komplett durchgeklickt

Status: `READY_FOR_VISUAL_REVIEW`
