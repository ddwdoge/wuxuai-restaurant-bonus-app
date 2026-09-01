# Restaurant Portal UI/UX Pass

Datum: 2026-07-08  
Status: UI LOCK

## Geprüfte Seiten

- Dashboard
- Belohnungen
- Willkommensgeschenke
- Gäste
- QR Center
- Mitarbeiter
- Einstellungen

## Geänderte Dateien

- `src/app/App.tsx`
- `src/modules/admin/AdminLayout.tsx`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/admin/pages/BrandingPage.tsx`
- `src/modules/admin/pages/CustomersPage.tsx`
- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/pages/StaffPage.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/modules/staff/StaffTablet.tsx`
- `src/styles.css`
- Entfernt: `src/modules/admin/pages/CampaignsPage.tsx`

## UI/UX Verbesserungen

### Dashboard

- Bleibt fokussiert auf KPI, Schnellzugriffe und genau eine Karte „Heute für dich“.
- Kein Button „Neue Aktion starten“.
- Empfehlungstext restaurantfreundlicher formuliert.

### Belohnungen

- Gespeicherte Belohnungen behalten kompakte Karten mit festem Bildbereich.
- Leerzustand als klare Karte ergänzt.
- Technische Beschreibung „Smart Reward Engine“ aus neuen Belohnungsbeschreibungen entfernt.
- Punkte bleiben automatisch berechnet; keine manuelle Punkte-Eingabe.

### Willkommensgeschenke

- Leerzustand klarer und eigenständig.
- Trennung von normalen Punkte-Belohnungen bleibt sichtbar.
- Keine Punkte-Eingabe und keine Vermischung mit Belohnungen.

### Gäste

- Seite lädt bestehende Gästedaten über die vorhandene Kundenquelle.
- Suche nach Name, Telefon oder Gästecode ergänzt.
- Gästekarten zeigen Name, Kontakt, Punkte, Stempel, Status und Gästecode.
- Leerer Zustand ergänzt.

### QR Center

- Starter-Kit-Karte ergänzt.
- PNG-Downloads bleiben sichtbar als „QR als Bild speichern“.
- SVG ist keine Hauptaktion.
- Druck/PDF-Aktion ist gebündelt in „Druckvorlage öffnen“.

### Mitarbeiter

- Neuer Restaurant-Portal-Menüpunkt `/admin/staff` als einfache V1-Struktur.
- Seite zeigt Team, Team PINs und heutige Aktivität als Platzhalterkarten.
- Team Tablet bleibt erreichbar.
- Sichtbare Staff-/Redemption-Texte in deutsche Restaurant-Sprache geändert.

### Einstellungen

- Bestehende Navigationsübersicht bleibt erhalten.
- Direkte Aussehen-Seite nutzt deutsche Restaurant-Sprache statt technischer Begriffe.

## Offene DATA CONTRACT Punkte

- Gäste: Es gibt aktuell keine eigene `last_activity`-Anzeige im Kundenmodell. Die Seite zeigt deshalb Mitglied seit `created_at` und einen einfachen Status aus vorhandenen Daten.
- Gäste: Bonus-Boost-pro-Gast ist im aktuellen Gästelistenmodell nicht direkt enthalten.
- Mitarbeiter: Mitarbeiterliste, Aktiv/Inaktiv und Tagesaktivität sind als UI-Struktur vorbereitet. Die Datenanbindung bleibt offen und wurde nicht ergänzt.
- QR Center: Die Druckvorlage nutzt aktuell die Browser-Druckfunktion. Eine eigene QR-Center-PDF-Datei kann später angeschlossen werden, ohne die UI-Struktur zu ändern.

## Bestätigung: Keine Backendänderungen

- Keine neue Migration.
- Keine neuen RPCs.
- Keine Supabase-Policy geändert.
- Keine Businessregel geändert.
- Keine Aktionen/Kampagnen zurückgebracht.
- Keine KI, kein POS, kein SMS/WhatsApp.

## Build-Ergebnis

Ergebnis: bestanden.

Befehl:

```bash
npm run build
```

Build lief erfolgreich durch.

## Status

UI LOCK
