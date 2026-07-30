# WUXUAI Bonus V1 – Punkteeinlösung Begriffswechsel Report

Datum: 2026-07-11

Status: LOCK

## Gelesene Grundlagen

- AGENTS.md
- docs/00_START_HIER.md
- docs/04_RESTAURANT_PORTAL.md
- docs/05_CUSTOMER_PORTAL.md
- docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md
- docs/13_SMART_REWARD_ENGINE.md
- docs/17_CTO_ENTSCHEIDUNGEN.md
- docs/18_CODEX_REGELN.md

Hinweis: docs/21_CODEX_SELBSTKONTROLL_LOOP.md ist in diesem Workspace nicht vorhanden. Der Selbstkontroll-Loop wurde aus docs/18_CODEX_REGELN.md und den bestehenden Reports angewendet.

## Aufgabe

Der sichtbare Begriff fuer normale Punkte-Belohnungen wurde in V1 auf Punkteeinloesung geaendert.

Nicht geaendert:

- Datenbank
- RPCs
- Reward Engine
- Punkteberechnung
- Tages-PIN
- Willkommensgeschenke
- technische Dateinamen wie RewardsPage, rewardService oder rewards

## Geaenderte Dateien

- src/modules/admin/AdminLayout.tsx
- src/modules/admin/pages/AdminDashboard.tsx
- src/modules/admin/pages/RewardsPage.tsx
- src/modules/admin/pages/QrCenterPage.tsx
- src/modules/admin/pages/RestaurantOnboarding.tsx
- src/modules/admin/pages/SettingsPage.tsx
- src/modules/admin/pages/LoyaltyPage.tsx
- src/modules/admin/pages/WelcomeGiftsPage.tsx
- src/modules/customer/CustomerPortal.tsx
- src/modules/staff/StaffTablet.tsx
- src/modules/campaigns/PublicCampaignLanding.tsx
- src/modules/rewards/rewardService.ts
- docs/04_RESTAURANT_PORTAL.md
- docs/05_CUSTOMER_PORTAL.md
- docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md
- docs/13_SMART_REWARD_ENGINE.md
- docs/17_CTO_ENTSCHEIDUNGEN.md
- docs/19_CHANGELOG.md

## UI-Aenderungen

### Restaurant Portal

- Sidebar zeigt Punkteeinloesung statt Belohnungen.
- Mobile Drawer nutzt dieselbe Navigation und zeigt damit ebenfalls Punkteeinloesung.
- Dashboard Schnellzugriff zeigt Punkteeinloesung.
- Dashboard Empfehlung zeigt Neue Punkteeinloesung erstellen.

### Punkteeinloesung Seite

- Seitentitel ist Punkteeinloesung.
- Untertitel erklaert, dass Produkte mit gesammelten Punkten einloesbar sind.
- Wizard zeigt Neue Punkteeinloesung erstellen.
- Wizard fragt: Was soll mit Punkten einloesbar sein?
- Eigene Belohnung wurde im Punkte-Wizard zu Eigenes Produkt.
- Erfolgs- und Fehlermeldungen sprechen von Punkteeinloesung.

### Kundenportal

- Normaler Punktebereich spricht von Punkteeinloesungen.
- Anzahl zeigt einloesbar statt bereit.
- Freigeschaltete normale Punkteprodukte werden als Einloesbar mit Punkten bezeichnet.
- Finale Einloesebestaetigung nutzt:
  - Punkte wirklich einloesen?
  - Nach der Bestaetigung ist diese Einloesung verbraucht und kann nicht erneut verwendet werden.
  - Punkteeinloesung erfolgreich.

### Staff Portal

- Mitarbeiterbereich spricht von Punkteeinloesung pruefen.
- Verfuegbare Belohnungen wurde zu Verfuegbare Punkteeinloesungen.
- Bereits verwendete Punkteeinloesungen werden nicht erneut angezeigt.

## Willkommensgeschenke

Willkommensgeschenke bleiben ein eigener Bereich.

Sie wurden nicht in Punkteeinloesung umbenannt und behalten ihre eigene Produktlogik:

- keine Punkte
- einmalig nach Registrierung
- getrennt vom normalen Punktebereich

## Dokumentation

Die betroffenen Bible-Dateien wurden auf den neuen sichtbaren Begriff aktualisiert.

docs/17_CTO_ENTSCHEIDUNGEN.md enthaelt eine neue LOCK-Entscheidung:

- Sichtbarer Begriff: Punkteeinloesung
- Technische reward-Namen duerfen aus Stabilitaetsgruenden bestehen bleiben.

docs/19_CHANGELOG.md enthaelt eine neue Phase fuer den Begriffswechsel.

## Selbstpruefung

Geprueft:

- Keine neuen Migrationen.
- Keine neuen RPCs.
- Keine Datenbanklogik geaendert.
- Keine Punkteberechnung geaendert.
- Keine Tages-PIN-Logik geaendert.
- Keine Aktionen/Kampagnen wieder eingefuehrt.
- Sichtbare normale Punktebereiche nutzen Punkteeinloesung.
- Willkommensgeschenke bleiben getrennt.

Bekannte bewusste Ausnahmen:

- Technische Namen wie rewardService, RewardsPage, rewards bleiben bestehen.
- Historische Changelog-Stellen koennen alte Begriffe enthalten, wenn sie fruehere Projektphasen beschreiben.
- Onboarding-Texte zu Willkommens-Belohnungen bleiben unveraendert, weil sie nicht die normale Punkteeinloesung betreffen.

## Build

`npm run build` wurde ausgefuehrt.

Ergebnis: erfolgreich.

## Offene Risiken

Keine funktionalen Risiken aus dieser Aufgabe, da nur sichtbare Begriffe und Dokumentation angepasst wurden.

## Status

LOCK
