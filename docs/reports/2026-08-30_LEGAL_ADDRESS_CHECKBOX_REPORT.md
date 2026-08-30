# WUXUAI Bonus – Legal Address Checkbox Report

Datum: 2026-08-30  
Umgebung: `bonus.wuxuaisbi.com` Entwicklungs-/Testumgebung  
Commit: `b4251c6dce970fc2fb4b152a1ec8934c67d1449f`  
Deployment: `596320d6-8bbb-4312-84d0-4fe83b261946`  
Production: LOCKED  
Stripe: DEFERRED

## Ursache

Onboarding und spätere Legal-Einstellungen setzten das native Kontrollfeld
`Geschäftsanschrift entspricht Restaurantadresse` auf `disabled`, solange der
kanonische Primär-Branch noch keine vollständige Adresse besaß. Beide
Event-Handler verweigerten denselben Wechsel zusätzlich. Ein neuer Owner konnte
diese Voraussetzung nicht erfüllen, weil das Onboarding nur die sichtbaren
Geschäftsadressfelder anbot. Dadurch entstand ein Kreiszustand.

## Geänderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/legal/OwnerLegalSettingsPage.tsx`
- `src/modules/legal/legalAddressSourceService.ts`
- `src/modules/legal/legalService.ts`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `tests/owner-legal-company-data-foundation.test.mjs`

## Was wurde geändert

- Das Kontrollfeld bleibt beim neuen Restaurant bedienbar.
- Bei aktivierter gemeinsamer Anschrift und noch leerem Branch bleiben die
  Adressfelder editierbar und werden als Restaurant- und Geschäftsanschrift
  verwendet.
- Ein gemeinsamer, tenant-gebundener Service aktualisiert ausschließlich den
  eigenen Primär-Branch, bevor der vorhandene Legal-RPC die kanonische Beziehung
  speichert.
- Der getrennte Modus führt kein Branch-Update aus und schützt die separate
  Geschäftsanschrift vor späteren Standortänderungen.
- Onboarding und Einstellungen verwenden denselben Adressquellenvertrag.
- FN und UID bleiben optional.

## Was wurde nicht geändert

- Keine Legal-, Readiness- oder Veröffentlichungsregel wurde gelockert.
- Keine RLS-Policy und kein Grant wurde geändert.
- Keine Migration wurde erstellt oder angewendet.
- Keine Production- oder Stripe-Funktion wurde verändert.
- Kein zweiter Testaccount wurde erstellt.

## Prüfung

- Live-Reproduktion vor Fix: Checkbox `[disabled]` auf dem DB-Carbide-Onboarding.
- Live nach Deployment: Checkbox aktiviert, Klick schaltet den Modus ein.
- Gemeinsamer Modus: Adressfelder bei neuem Branch editierbar.
- Ganze Label-Zeile: 64 px hoch; native Input-/Label-Verknüpfung vorhanden.
- Gemeinsamer Draft: Aktivieren, Weiter, Reload, Zurück – weiterhin aktiviert.
- Getrennter Draft: Deaktivieren, Weiter, Reload, Zurück – weiterhin deaktiviert.
- Gewünschter gemeinsamer Modus anschließend wiederhergestellt; Onboarding steht
  auf Schritt 2.
- Tests: 1132/1132 PASS.
- Typecheck: PASS.
- Lint: 0 Fehler; bestehende Warnungen außerhalb des Scopes.
- Build: PASS.
- `git diff --check`: PASS.
- Diff-Secret-Scan: 0 Treffer.

## Offene Live-Prüfungen

- Physischer iPhone-Tap auf 390/430 px durch Founder.
- Vollständiger Onboarding-Abschluss und Prüfung des finalen Branch- und
  Operator-Profils.
- Live-Test der späteren Einstellungen nach abgeschlossenem Onboarding.
- Separater Keyboard-Endgerätetest; die Struktur ist nativ tastaturfähig, die
  Browser-Plugin-Tastatursimulation war nicht belastbar.

## Repository-/Contract-Problem

`docs/AI_IMPLEMENTATION_GUARDRAILS.md` fehlt weiterhin. Das Dokument wurde gemäß
Founder-Anweisung weder rekonstruiert noch erfunden.

## Status

CODE LOCK / LIVE DRAFT PASS. Kein FINAL LOCK, bis physischer iPhone-Test und
vollständiger Owner-Onboarding-Abschluss bestätigt sind.
