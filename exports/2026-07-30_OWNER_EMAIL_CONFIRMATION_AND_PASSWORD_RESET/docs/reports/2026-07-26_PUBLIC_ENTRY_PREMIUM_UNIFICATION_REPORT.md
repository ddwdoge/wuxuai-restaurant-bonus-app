# Öffentliche Einstiegsseiten – Premium-Vereinheitlichung

Datum: 2026-07-26
Branch: `codex/v13-legal-maps-hardening`
Ausgangscommit: `82a0f18`

## Vorherige Komponentenstruktur

- Start- und Gastseite verwendeten eigene `public-*`-Strukturen in der globalen Stylesammlung.
- Login und Registrierung verwendeten globale Admin-nahe Klassen wie `auth-shell`, `card`, `form`, `field`, `input` und `button`.
- Hero, Kartenbreite, Feldhöhe, Fehlermeldungen und Sekundäraktionen waren dadurch nicht konsistent.
- Die Authentifizierungs- und Registrierungsfunktionen selbst waren bereits vorhanden und wurden beibehalten.

## Neue gemeinsame Komponenten

In `PublicPageComponents.tsx` wurden ausschließlich für öffentliche Einstiegsseiten ergänzt:

- `PublicPageShell`
- `PublicContentCard`
- `PublicFormField`
- `PublicPrimaryButton`
- `PublicPrimaryLink`
- `PublicEntryCard`

Die Darstellung liegt portalbegrenzt in `public-entry-premium.css`. Bestehende Premium-Tokens aus `styles.css` bleiben die zentrale Farb-, Radius-, Schatten- und Bewegungsgrundlage.

## Geänderte Seiten

- `/`: drei gleichartige, vollständig anklickbare Einstiegskarten
- `/login` und `/restaurant/login`: gemeinsame Premium-Formularkarte, unveränderter `signIn`-Flow
- `/register`: gemeinsame Felder, unveränderter `registerRestaurantOwner`-Flow
- `/customer`: kompakte dreistufige Gast-Anleitung ohne neue Authentifizierungslogik

## Entfernte Alt-Styles

Die nicht mehr verwendeten globalen Regeln für `public-shell`, `public-entry`, `public-entry-card`, `guest-entry-page` und `guest-entry-card` einschließlich ihrer alten Breakpoint-Sonderregeln wurden entfernt. Styles anderer Portale sowie die gemeinsame `AppDrawer`-Basis wurden nicht verändert.

## Responsive-Ergebnisse

| Breite | Startseite | Login | Registrierung | Gastseite | Horizontaler Overflow |
| ---: | --- | --- | --- | --- | --- |
| 320 px | bestanden | bestanden | bestanden | bestanden | nein |
| 375 px | bestanden | bestanden | bestanden | bestanden | nein |
| 390 px | bestanden | bestanden | bestanden | bestanden | nein |
| 430 px | bestanden | bestanden | bestanden | bestanden | nein |
| 768 px | bestanden | bestanden | bestanden | bestanden | nein |
| 1024 px | bestanden | bestanden | bestanden | bestanden | nein |
| 1440 px | bestanden | bestanden | bestanden | bestanden | nein |

Alle Formulareingaben sind 52 px hoch. Alle Links und Buttons erreichen mindestens 44 px. Die Registrierung bleibt bei kleinen Viewports scrollbar; Safe-Area-Abstände sind oben und unten berücksichtigt.

## Accessibility

- genau ein `main` und ein `h1` je geprüfter Seite
- sichtbare Labels mit `htmlFor`/`id`-Verknüpfung
- Hilfs- und Fehlertexte über `aria-describedby`
- allgemeine Fehler als Live-Regionen
- Ladezustände mit `aria-busy` und stabilem Vollbreitenbutton
- native Formulare unterstützen Enter
- Einstiegskarten unterstützen Link-Aktivierung per Enter und zusätzlich per Leertaste
- sichtbare `focus-visible`-Ringe und reduzierte Bewegung
- Icons sind dekorativ; Text bleibt allein verständlich

## Screenshots

### 390 px

- [Startseite](assets/2026-07-26_public_entry/home-390.png)
- [Login](assets/2026-07-26_public_entry/login-390.png)
- [Registrierung](assets/2026-07-26_public_entry/register-390.png)
- [Gastseite](assets/2026-07-26_public_entry/guest-390.png)

### 430 px

- [Startseite](assets/2026-07-26_public_entry/home-430.png)
- [Login](assets/2026-07-26_public_entry/login-430.png)
- [Registrierung](assets/2026-07-26_public_entry/register-430.png)
- [Gastseite](assets/2026-07-26_public_entry/guest-430.png)

### 1440 px

- [Startseite](assets/2026-07-26_public_entry/home-1440.png)
- [Login](assets/2026-07-26_public_entry/login-1440.png)
- [Registrierung](assets/2026-07-26_public_entry/register-1440.png)
- [Gastseite](assets/2026-07-26_public_entry/guest-1440.png)

## Technische Prüfung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bereits bestehende Warnungen
- Tests: 162/162 erfolgreich
- Build: erfolgreich
- Browser-Konsole: 0 Fehler
- horizontale Überläufe: 0
- Migration: keine
- RLS/Security: nicht verändert

## Portalgrenzen

Customer-Portal nach Restaurantkontext, Owner-Dashboard, Staff-Tablet und Plattformportal wurden in diesem Auftrag nicht umgebaut. Die bereits offene Drawer-Vereinheitlichung und der Reward-Bildeditor blieben erhalten.

## Offene physische Tests

Ein physischer iPhone-Safari-Test mit eingeblendeter Bildschirmtastatur ist weiterhin offen. Die Browser-Abnahme deckt Safari-Safe-Area-CSS und alle geforderten Layoutbreiten ab, ersetzt aber keinen physischen Gerätetest.

## Status

`READY_FOR_VISUAL_REVIEW`
