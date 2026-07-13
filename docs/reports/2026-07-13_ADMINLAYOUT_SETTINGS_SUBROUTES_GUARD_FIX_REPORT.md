# WUXUAI Bonus V1 – AdminLayout Settings Subroutes Guard Fix

Datum: 2026-07-13  
Status: **LOCK**

## Ursache

`AdminLayout` nutzte zwei unterschiedliche Mechanismen für Setup-erlaubte
Routen:

- Navigation Lock: Vergleich gegen eine feste Liste.
- Redirect Guard: eigener Check für `/admin/settings`.

Dadurch konnten Settings-Unterseiten technisch erlaubt sein, während die
Navigation visuell gesperrt wirkte.

## Geänderte Dateien

- `src/modules/admin/setupAllowedPath.ts`
- `src/modules/admin/AdminLayout.tsx`
- `src/app/App.tsx`
- `docs/reports/2026-07-13_ADMINLAYOUT_SETTINGS_SUBROUTES_GUARD_FIX_REPORT.md`

## Was wurde geändert

Eine zentrale Funktion wurde ergänzt:

```ts
isSetupAllowedPath(pathname)
```

Regeln:

- `/admin/onboarding` ist während Setup erlaubt.
- `/admin/settings` ist während Setup erlaubt.
- `/admin/settings/*` ist während Setup erlaubt.

Diese Funktion wird jetzt verwendet für:

- `RestaurantSetupGate` in `App.tsx`
- Redirect Guard in `AdminLayout`
- Sidebar NavLink Lock
- Mobile Drawer Link Lock

## Locked NavLinks

Gesperrte Menüpunkte werden nicht mehr als echte `NavLink`-Route gerendert.

Stattdessen:

- `span`
- `role="link"`
- `aria-disabled="true"`
- kein `to`
- kein Keyboard-/Enter-Navigationsweg zur falschen Route

Damit gibt es keine widersprüchliche Navigation mehr.

## Akzeptanzprüfung

- `/admin/settings`: erlaubt.
- `/admin/settings/branding`: erlaubt.
- Settings-Link wirkt nicht fälschlich gesperrt.
- andere Bereiche bleiben bei unvollständigem Setup gesperrt.
- Sidebar und Mobile Drawer nutzen dieselbe Lock-Regel.
- Restaurant Owner / Setup-Gate Verhalten bleibt unverändert.

## Was wurde nicht geändert

- keine Platform-Admin-Rollen
- keine Tenant-Isolation
- kein Customer Portal
- keine Reward-RPC
- keine Tages-PIN
- keine Punkte-Sammeln-Logik
- keine Datenbank
- keine RPC
- keine Produktlogik

## Build Ergebnis

Befehl:

```bash
npm run build
```

Ergebnis: erfolgreich.

## Risiken

Keine kritischen offenen Risiken im Scope.

Hinweis:

Die Prüfung war eine Code-/Build-Prüfung. Es wurde keine Datenbank und kein
Live-Staging benötigt, weil keine DB-/RPC-Änderung Teil dieser Aufgabe war.

## Status

LOCK
