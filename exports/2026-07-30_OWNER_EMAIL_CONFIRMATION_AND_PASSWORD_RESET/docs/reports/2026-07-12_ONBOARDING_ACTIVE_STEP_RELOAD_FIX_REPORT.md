# Onboarding Active Step Reload Fix Report

Datum: 2026-07-13

Status: NOT READY

## Ursache

Der gespeicherte Onboarding-Schritt wurde nicht eindeutig als menschlicher Schritt `1–7` in den internen UI-Index `0–6` übersetzt.

Die UI arbeitet intern 0-basiert:

- Index `0` = Schritt 1
- Index `1` = Schritt 2
- Index `3` = Punkteeinlösung
- Index `4` = Willkommens-Belohnungen

Der Auftrag verlangt, dass der gespeicherte Datenbankwert als sichtbarer Schritt verstanden wird:

- DB `current_step = 1` → UI Schritt 1
- DB `current_step = 2` → UI Schritt 2
- DB `current_step = 4` → UI Schritt „Punkteeinlösung“
- DB `current_step = 5` → UI Schritt „Willkommens-Belohnungen“

## Geänderte Dateien

- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`

## Was wurde geändert

- Neue Drafts speichern `current_step` als menschlichen Schritt `1–7`.
- Beim Laden wird `current_step - 1` als interner UI-Index verwendet.
- Bestehende Drafts mit `onboardingStructureVersion = 2` bleiben kompatibel, weil diese Version kurzzeitig 0-basiert gespeichert wurde.
- `onboarding_status = ready` und `onboarding_status = completed` leiten beide zum Dashboard.
- Während Onboarding-Daten laden, rendert die UI nur:
  `Onboarding wird geladen …`
- Dadurch wird vor dem Datenload kein sichtbarer Schritt-1-Inhalt gerendert.

## Was wurde nicht geändert

- Keine Datenbankänderung.
- Keine neue Migration.
- Keine neue Produktlogik.
- Keine Änderung an Punkte-, Tages-PIN-, QR-, Willkommensgeschenk- oder Punkteeinlösungslogik.
- Keine neue Speicherung gebaut.

## Mapping

```text
DB current_step = 1 -> UI index 0 -> Restaurant
DB current_step = 2 -> UI index 1 -> Aussehen
DB current_step = 3 -> UI index 2 -> Geöffnet
DB current_step = 4 -> UI index 3 -> Punkteeinlösung
DB current_step = 5 -> UI index 4 -> Willkommens-Belohnungen
DB current_step = 6 -> UI index 5 -> Restaurant Starter Kit
DB current_step = 7 -> UI index 6 -> Startklar
```

## Prüfung

Codeprüfung:

- `loadOnboardingDraft` normalisiert gespeicherten Schritt korrekt.
- `RestaurantOnboarding` setzt `setStep(draft.currentStep)` erst nach erfolgreichem Laden.
- `draftLoading` verhindert Rendering des Wizard-Inhalts vor Datenload.
- Kein anderer `useEffect` setzt `step` zurück auf `0`.
- Autosave läuft erst nach `draftLoading = false`.
- `saveOnboardingDraft` speichert neue Schritte als `currentStep + 1`.

Build:

- `npm run build` erfolgreich.

## Nicht live geprüft

- Reload bei Schritt 2 im Browser.
- Reload bei Punkteeinlösung im Browser.
- Reload bei Willkommens-Belohnungen im Browser.
- Mobile 390px Browserprüfung.
- Staging-Supabase-Flow.

## Offene Risiken

- Ohne echten Browser-/Staging-Test bleibt offen, ob die produktive Staging-Zeile exakt `current_step` nutzt und keine externe alte Logik den Wert überschreibt.
- Bestehende ältere Drafts ohne `onboardingStructureVersion` werden gemäß aktueller Vorgabe als 1-basiert behandelt.

## Status

NOT READY

Grund: Code-Fix und Build sind abgeschlossen, aber die geforderten Reload-Akzeptanztests wurden nicht live im Browser gegen echte Staging-Daten geprüft.
