# Supabase Refresh-Token Guard

Datum: 2026-07-30  
Branch: `codex/owner-auth-recovery-hardening`

## Ursache

Der normale Supabase-Client hatte den SDK-Auto-Refresh deaktiviert, der
`AuthProvider` startete ihn jedoch auf geschützten Routen manuell. Fehler des
internen Refresh-Prozesses konnten dadurch nicht zuverlässig klassifiziert und
bereinigt werden. Ein dauerhaft ungültiger oder bereits verwendeter
Refresh-Token konnte wiederholt einen HTTP-400-Fehler auslösen.

## Umsetzung

- Der normale App-Client bleibt ein einmalig exportiertes Singleton.
- Der Owner-Recovery-Client bleibt aus Sicherheitsgründen separat,
  tabgebunden und auf einen eigenen `sessionStorage`-Key beschränkt. Beide
  Clients haben `autoRefreshToken: false`; nur der `AuthProvider` steuert den
  Refresh der normalen App-Sitzung.
- Der Refresh-Controller verwendet Single-Flight und genau ein Intervall.
  Sichtbarkeitswechsel verwenden denselben Controller.
- React Strict Mode ist abgesichert: Der `AuthProvider` wird in `main.tsx`
  einmal gerendert, und jeder Effekt-Cleanup entfernt Auth-Listener,
  Visibility-Listener und Refresh-Intervall.
- Strukturierte Fehler wie `refresh_token_not_found`,
  `refresh_token_already_used`, `invalid_refresh_token`, abgelaufene,
  widerrufene oder wiederverwendete Refresh-Tokens lösen genau einmal aus:
  `supabase.auth.signOut({ scope: "local" })`, gezielte Entfernung des
  projektbezogenen Supabase-Auth-Storage und Redirect nach
  `/restaurant/login`.
- Schlägt der lokale Sign-out selbst fehl, werden Storage und UI-Zustand
  trotzdem kontrolliert bereinigt.
- Netzwerk-, Timeout-, 5xx- und unbekannte temporäre Fehler löschen die lokale
  Sitzung nicht. Der Intervall-Takt verhindert einen unmittelbaren Retry-Loop.
- Öffentliche Routen initialisieren weiterhin keine Supabase-Sitzung.
- Es werden keine Tokens protokolliert oder in Audit-/Analysedaten übernommen.

## Geänderte Dateien

- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/authSessionGuard.mjs`
- `src/modules/auth/authSessionGuard.d.mts`
- `src/modules/auth/registerOwnerService.ts`
- `src/shared/lib/supabase.ts`
- `tests/auth-refresh-token-guard.test.mjs`
- `tests/public-auth-refresh.test.mjs`

## Prüfung

- Auth-/Recovery-Fokustests: 48/48 erfolgreich
- Gesamttests: 429/429 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Migration: keine
- RLS/Security-Policies: nicht verändert

## Offene Risiken

Ein echter, serverseitig bereits verwendeter Refresh-Token wurde in diesem
Arbeitslauf nicht absichtlich gegen Staging erzeugt. Die Fehlerklassifikation,
Single-Flight-Sperre, Bereinigung und Navigation sind automatisiert geprüft;
ein realer Browser-/Staging-Fehlerflow bleibt ein finales Integrations-Gate.

Status: **CODE LOCK**
