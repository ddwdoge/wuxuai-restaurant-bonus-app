# Onboarding Fortschritt Reload Fix Report

Datum: 2026-07-12

Status: NOT READY

## Ursache

Der Onboarding-Wizard speicherte Draft-Daten zwar per Autosave, aber Schrittwechsel waren nur über den verzögerten Autosave abgesichert. Bei schnellem Refresh oder Seitenwechsel direkt nach „Weiter“ konnte der zuletzt erreichte Schritt dadurch fehlen.

Zusätzlich war die Schritt-Normalisierung im Draft-Service noch auf die frühere Onboarding-Struktur mit entferntem Angebotsschritt ausgelegt. Neue gespeicherte Schritte brauchten eine versionssichere Zuordnung zur aktuellen 7-Schritt-Struktur.

## Geänderte Dateien

- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Schrittwechsel über „Weiter“, „Zurück“ und die Bestätigung der Willkommens-Belohnungen speichern den Draft jetzt sofort.
- Feldänderungen bleiben zusätzlich über den bestehenden Autosave gespeichert.
- Die Checklistenberechnung wurde zentralisiert, damit sofortiges Speichern und Autosave dieselben Daten verwenden.
- Sichtbare Speicherfehler erscheinen jetzt in Deutsch:
  „Fortschritt konnte gerade nicht gespeichert werden.“
- Draft-Daten erhalten eine `onboardingStructureVersion`.
- Neue Drafts werden mit der aktuellen 7-Schritt-Struktur geladen.
- Alte Drafts aus der früheren Angebotsstruktur werden weiter kompatibel auf die aktuelle Struktur gemappt.

## Was wurde nicht geändert

- Keine neue Produktlogik.
- Keine neue Datenbankstruktur.
- Keine neue Migration.
- Keine QR-, Tages-PIN-, Punkte-, Punkteeinlösungs-, Bonus-Boost- oder Willkommensgeschenk-Logik.
- Keine Kampagnen oder Aktionen.

## Migration

Keine neue Migration nötig.

Die bestehende Tabelle `restaurant_onboarding_drafts` enthält bereits:

- `current_step`
- `draft_data`
- `checklist`
- `restaurant_id`
- `organization_id`
- `branch_id`

## Build Ergebnis

`npm run build` erfolgreich.

## Validierung

Codeprüfung:

- `current_step` wird beim Schrittwechsel sofort gespeichert.
- `draft_data` speichert weiter die Formularwerte.
- `starterRewards` und `starterRewardConfirmed` bleiben im Draft enthalten.
- Die Punkteeinlösungsquote bleibt über `form.generosity` und die daraus berechnete Quote erhalten.
- Abgeschlossenes Onboarding leitet bei `onboarding_status = ready` weiter zu `/admin`.

Nicht live geprüft:

- Reload bei Schritt 2.
- Reload bei Schritt „Punkteeinlösung“.
- Reload bei Schritt „Willkommens-Belohnungen“.
- Echte Supabase-Staging-Draft-Verbindung.

Grund: In dieser Umgebung wurde kein eingeloggtes Staging-Restaurant mit aktivem Onboarding-Draft durchgeklickt.

## RLS / Security

Die bestehende RLS-Regel für `restaurant_onboarding_drafts` nutzt `public.is_restaurant_admin(restaurant_id)`.

Geprüft im Code:

- Owner/Admin/Manager können eigene Restaurant-Drafts lesen und schreiben.
- Anon/Customer erhalten keinen direkten Draft-Zugriff.
- Keine Service Role im Frontend.

Nicht live gegen Staging geprüft.

## Offene Risiken

- Echter Reload-Test gegen Staging steht noch aus.
- Falls Staging die Migration `20260706002000_onboarding_draft_persistence.sql` nicht enthält, kann Draft-Speicherung weiterhin nicht funktionieren.
- Falls ein Restaurant keine gültige `restaurant_members` Owner-Zeile hat, blockiert RLS das Speichern korrekt.

## Status

NOT READY

Grund: Code-Fix und Build sind abgeschlossen, aber der echte Reload-Flow wurde nicht live gegen Supabase Staging geprüft.
