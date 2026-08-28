# WUXUAI Bonus – Restaurant Cover First-Save Smart Media Persistence

Datum: 2026-08-28  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `7b7ae1e2653bd218e3e3c211be780b5d7441218f`

## Ursache

Das Restaurant-Titelbild hatte als einziges Smart-Media-Modul zwei konkurrierende
Persistenzpfade:

1. `uploadCoverImage` lud die Originaldatei hoch und schrieb URL sowie
   `DEFAULT_MEDIA_PRESENTATION` sofort in `branches`.
2. `saveBranding` schrieb später die aktuelle Präsentation aus
   `partnerLocation.coverImagePresentation` erneut.

Damit erzeugte der Upload bereits einen dauerhaft gespeicherten Cover-Zustand mit
`zoom = 1`, `position_x = 0.5` und `position_y = 0.5`, obwohl die eigentliche
Branding-Transaktion mit dem vom Owner gewählten Ausschnitt noch nicht erfolgt
war. Der Create-Pfad war daher nicht gleichwertig zum bestehenden Update-Pfad und
meldete irreführend bereits „Restaurantbild gespeichert“.

Der Shared `SmartMediaEditor` ist nicht die Ursache. Er erhält die Präsentation
kontrolliert aus dem Parent und meldet Drag-, Zoom-, Auto-Fit- und Reset-Werte
unmittelbar über `onPresentationChange` zurück.

## Geänderte Dateien

- `src/modules/admin/pages/SettingsPage.tsx`
- `tests/restaurant-cover-first-save.test.mjs`
- `docs/reports/2026-08-28_RESTAURANT_COVER_FIRST_SAVE_SMART_MEDIA_PERSISTENCE_REPORT.md`

## Was wurde geändert

- Der Cover-Upload speichert nur noch die unveränderte Originaldatei im Storage.
- URL und vorläufige Präsentation werden gemeinsam im kanonischen
  `partnerLocation`-State gehalten.
- `Branding speichern` schreibt URL, Zoom, X und Y in genau einem tenantgebundenen
  `branches`-Update.
- Die gemeinsamen Cover-Felder werden zentral durch
  `coverImagePersistenceFields` erzeugt.
- Ein noch nicht gespeicherter, ersetzter Upload wird entfernt.
- Ein noch nicht gespeicherter Upload wird beim Verlassen der Seite bereinigt.
- „Branding gespeichert“ erscheint erst nach erfolgreichem Branding-Upsert und
  erfolgreichem Cover-Update.
- Die Uploadmeldung erklärt jetzt, dass Ausschnitt und Branding noch gespeichert
  werden müssen.

## Create-/Update-Vertrag

- **Neues Bild:** Storage-Upload → Parent-State → Owner-Anpassung → ein finales
  Branch-Update mit URL und Präsentation.
- **Bestehendes Bild:** Owner-Anpassung → dasselbe finale Branch-Update.
- Der alte Create-Sonderweg mit sofortigem Default-Write existiert nicht mehr.

Für den gemeldeten Testfall sind nach dem ersten finalen Save die Werte
`135 % / 35 % / 65 %` Bestandteil desselben Payloads wie die neue Bild-URL.

## Andere Smart-Media-Module

- Angebote: Datei-Upload und Crop-Payload liegen bereits im selben finalen Save.
- Punkteeinlösungen: Datei-Upload und Crop-Payload liegen bereits im selben finalen Save.
- Willkommensgeschenke: Datei-Upload und Crop-Payload liegen bereits im selben finalen Save.
- Geburtstagsgeschenke verwenden denselben Gift-Save und denselben Crop-Payload.

Diese Module wurden nicht geändert.

## Was wurde nicht geändert

- Smart-Media-Algorithmus, Drag, Pinch-Zoom, Auto-Fit und Reset
- Originaldateien oder deren Pixelinhalt
- Customer Restaurant Finder und Restaurantdetails
- Offers, Rewards, Welcome Gifts und Birthday Gifts
- Smart Logo
- Businesslogik
- RLS, Grants, RPCs oder Datenbankschema
- Production oder Staging-Daten

## Tests und Qualität

- Neuer Regressionstest `NEW MEDIA + ADJUSTMENT + FIRST SAVE`: PASS
- Der Test lehnt den alten `branches`-Default-Write im Uploadpfad explizit ab.
- Andere Medienmodule auf gemeinsamen First-Save-Payload geprüft: PASS
- Vollständige Tests: `1079/1079 PASS`
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 7 bekannte Warnungen außerhalb des Scopes
- Production Build: PASS
- `git diff --check`: PASS
- Secret Scan des Änderungsumfangs: PASS

## Staging

Der reale Staging-Fehler wurde anhand des gemeldeten Owner-Flows und des aktiven
Persistenzpfads nachvollzogen. Der korrigierte Build wurde in dieser Aufgabe nicht
auf Staging deployt. Deshalb sind Hard-Reload, Customer Restaurant Details und
Restaurant Finder mit den neuen Werten noch nicht live bestätigt.

## Risiken

- Der Cover-Payload selbst ist ein einzelnes atomisches Branch-Update. Branding
  und Branch sind weiterhin zwei bestehende Backend-Schreibvorgänge; bei einem
  Fehler erscheint keine Erfolgsmeldung und der Owner kann erneut speichern.
- Ein echter Staging-Save mit neuem Bild A und Bild B sowie `135/35/65` bleibt vor
  einem Final Lock erforderlich.

## Ergebnis

ROOT CAUSE: konkurrierender Cover-Create-Pfad schrieb URL plus Default-Präsentation vor dem finalen Branding-Save  
FIRST SAVE IMAGE: CODE PASS / STAGING OFFEN  
FIRST SAVE SCALE: CODE PASS / STAGING OFFEN  
FIRST SAVE X/Y: CODE PASS / STAGING OFFEN  
CREATE PATH: PASS  
UPDATE PATH: PASS  
STALE STATE / RACE: im alten Doppelpfad möglich; entfernt  
DEFAULT OVERWRITE: NO  
SINGLE SOURCE OF TRUTH: PASS  
ATOMIC COVER SAVE: PASS  
PARTIAL SUCCESS FEEDBACK POSSIBLE: NO  
RELOAD PERSISTENCE: STAGING OFFEN  
SECOND SAVE REQUIRED: NO laut neuem Vertrag  
RESTAURANT COVER: CODE PASS  
OFFER FIRST SAVE: PASS  
REWARD FIRST SAVE: PASS  
WELCOME GIFT FIRST SAVE: PASS  
BIRTHDAY GIFT FIRST SAVE: PASS  
BUSINESS LOGIC CHANGED: NO  
DB MIGRATION: NONE  
TESTS: 1079/1079 PASS  
SMART MEDIA FIRST-SAVE PERSISTENCE FINAL READY: NO – Staging-Flow ausstehend  
PRODUCTION: LOCKED  
STRIPE: DEFERRED

Status: **CODE LOCK**

Prüf-ZIP: `exports/2026-08-28_RESTAURANT_COVER_FIRST_SAVE_SMART_MEDIA_PERSISTENCE_FULL_APP.zip`
