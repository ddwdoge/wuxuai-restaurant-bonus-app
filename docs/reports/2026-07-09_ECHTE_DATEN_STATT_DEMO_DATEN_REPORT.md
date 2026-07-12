# WUXUAI Bonus V1 – Echte Daten statt Demo-Daten

Datum: 2026-07-09

Status: LOCK

## Ziel

Echte Restaurantseiten dürfen bei aktiver Supabase-Verbindung keine Demo-,
Seed- oder Platzhalterdaten anzeigen.

Wenn keine echten Daten vorhanden sind, zeigt die UI einen leeren Zustand.

## Ursache

Demo-Daten existieren im Projekt weiterhin für No-Supabase- und Demo-Betrieb.
Ein sichtbarer Produktionspfad enthielt außerdem noch einen Demo-Placeholder
im Onboarding.

Zusätzlich wurden Ladefehler teilweise direkt aus technischen Supabase-Fehlern
ins UI übernommen.

## Geänderte Dateien

- `src/modules/tenant/TenantProvider.tsx`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/modules/admin/pages/AdminDashboard.tsx`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/15_DESIGN_SYSTEM.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`

## Umsetzung

### TenantProvider

- Bei aktiver Supabase-Verbindung wird kein Demo-Restaurant als Fallback gesetzt.
- Fehler beim Laden von Restaurant oder Mitgliedschaft werden intern geloggt.
- Bei Ladefehlern werden Restaurants, aktives Restaurant und Branding geleert.
- Branding wird geleert, wenn kein aktives Restaurant vorhanden ist.

### Belohnungen

- Bei Supabase-Ladefehlern erscheint nur:

```text
Daten konnten gerade nicht geladen werden.
```

- Technische Fehler werden intern geloggt.
- Leerer Zustand angepasst:

```text
Noch keine Punkte-Belohnungen erstellt.
Erstelle deine erste Belohnung, damit Gäste ein klares Ziel beim Sammeln haben.
```

- Button:

```text
Erste Belohnung erstellen
```

### Willkommensgeschenke

- Bei Ladefehlern erscheint nur:

```text
Daten konnten gerade nicht geladen werden.
```

- Technische Fehler werden intern geloggt.
- Leerer Zustand angepasst:

```text
Noch keine Willkommensgeschenke eingerichtet.
Willkommensgeschenke erhalten neue Gäste einmalig nach der Anmeldung. Du kannst sie hier später bearbeiten.
```

### Dashboard

- Dashboard-KPI zeigen echte Werte oder 0.
- Ladefehler werden intern geloggt.
- Keine Demo-KPI bei aktiver Supabase-Verbindung.

### Kundenportal

- Ladefehler werden intern geloggt.
- Im UI erscheint nur ein ruhiger deutscher Fehlertext.
- Belohnungen und Willkommensgeschenke bleiben aus echten Portal-RPC-Daten.

### Onboarding

- Sichtbarer Demo-Placeholder `Kai Sushi` wurde aus dem Onboarding entfernt.

## Demo-Daten-Prüfung

Gesucht nach:

- `demoRewards`
- `demoCustomers`
- `Kai Sushi`
- `Gratis Mochi`
- `Gratis Lunch Drink`
- `10. Besuch gratis Dessert`

Ergebnis:

- Demo-Namen liegen nur noch in `src/shared/lib/demoData.ts`.
- Service-Verwendungen sind an `!supabase` gebunden.
- Kein sichtbarer Produktionspfad zeigt diese Demo-Namen.

## Dokumentation

Die Regel wurde in der Bible ergänzt:

```text
Keine Demo- oder Platzhalterdaten in echten Restaurantseiten.
Wenn Supabase aktiv ist, werden nur echte Tenant-Daten angezeigt.
Wenn keine Daten vorhanden sind, zeigt die UI einen leeren Zustand.
```

## Build

Ausgeführt:

```bash
npm run build
```

Ergebnis:

Erfolgreich.

## Offene Risiken

- Bestehende Staging-Seed-Daten bleiben echte Daten, wenn sie in Supabase liegen.
- Diese Aufgabe löscht keine Datenbankdaten.
- Expliziter Demo-Modus bleibt erlaubt, wenn Supabase nicht konfiguriert ist.

## Status

LOCK
