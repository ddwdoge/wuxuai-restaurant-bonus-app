# Owner Direct Photo und Bonusregeln Scope Report

Datum: 2026-07-26
Branch: `codex/v13-legal-maps-hardening`
Ausgangscommit: `82a0f18`

## Ursache

Der bestehende `OwnerRewardImageUploader` war nur in den Erstellen-/Bearbeiten-Formularen eingebunden. Die Medienfläche der Übersichtskarte in `PremiumOwnerRewardCard` war passiv und konnte deshalb keine native Dateiauswahl öffnen.

Teil B des Auftrags widerspricht mehreren verbindlichen V1-Regeln der Engineering Bible. Manuell gesetzte Rewardpunkte, frei konfigurierbare tägliche Buchungslimits, Aktionen und Filialzuordnungen sind für V1 ausdrücklich gesperrt. Diese Produktlogik wurde deshalb nicht implementiert.

## Geänderte Dateien

- `src/modules/admin/components/OwnerRewardImageUploader.tsx`
- `src/modules/admin/components/PremiumOwnerRewardCard.tsx`
- `src/modules/admin/pages/RewardsPage.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/modules/admin/admin-premium.css`
- `src/modules/rewards/rewardService.ts`
- `tests/owner-premium-rewards.test.mjs`

## Direkter Fotoaustausch

- Reward- und Willkommensgeschenkkarten verwenden den bestehenden Owner-Uploader direkt in ihrer Medienfläche.
- Der Medienbereich ist ein echtes HTML-Button-Element und unterstützt Tab, Enter und Leertaste nativ.
- Sichtbare Aktionen: `Foto hinzufügen` und `Foto ändern`.
- JPG, PNG und WebP bis 5 MB verwenden die bestehende Validierung.
- Nach der Auswahl öffnet eine kompakte Vorschau mit `Abbrechen` und `Foto speichern`.
- Der vollständige Reward-Editor wird nicht geöffnet.
- Der Upload verwendet den bestehenden Bucket und den restaurantbezogenen Storage-Pfad.
- Die Datenbankaktualisierung schreibt ausschließlich `rewards.image_url` und filtert nach Reward-ID, Restaurant-ID und Starter-Reward-Typ.
- Bei einem fehlgeschlagenen Datenbankschritt wird das neu hochgeladene Objekt entfernt; das bisherige Bild bleibt erhalten.
- Andere Rewardfelder werden nicht aktualisiert.

## Sicherheit

- Keine öffentliche Schreibberechtigung ergänzt.
- Keine RLS- oder Policy-Änderung.
- Kein Service-Role-Key im Frontend.
- Storage-Pfad bleibt restaurantbezogen.
- Datenbankupdate ist zusätzlich auf `id`, `restaurant_id` und `is_starter_reward` begrenzt; bestehende RLS bleibt die serverseitige Autorität.
- Kunden-, Mitarbeiter- und Plattformportal wurden nicht geändert.

## Nicht umgesetzt: Bonusregeln

Folgende Anforderungen benötigen zuerst eine neue CTO-Entscheidung und eine Anpassung der Engineering Bible:

- manuell editierbare Rewardpunkte und Punkteschwellen
- editierbare Punktewerte je Bonstufe
- frei editierbares Tagesmaximum
- zeitlich begrenzte Aktionen
- Filialzuordnung in der V1-UI
- freie Multiplikatorlogik
- neue Versionierungs-, Aktivierungs- und Legal-Review-Architektur für Bonusregeln

Verbindliche Konflikte:

- `docs/00_START_HIER.md`: Punkte werden automatisch aus Europreisen berechnet; keine manuellen Punkteschwellen; keine Filialkomplexität in V1.
- `docs/04_RESTAURANT_PORTAL.md`: manuelle Punkte-Eingabe und Punkte-Dropdown verboten.
- `docs/13_SMART_REWARD_ENGINE.md`: Restaurantbesitzer dürfen Punkte nicht manuell eingeben; Aktionen dürfen nicht wieder eingeführt werden.
- `docs/17_CTO_ENTSCHEIDUNGEN.md`: keine manuelle Punkte-Eingabe; Aktionen aus V1 entfernt; Filialen sind V2-UI.

Es wurden daher keine Bonusregeln-Seite, keine neue Migration, keine RPC und kein Audit-Event für Teil B erstellt. Bestehende Kundenpunkte und Transaktionen wurden nicht verändert.

## Prüfung

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 141/141 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Authentifizierter Owner-Upload gegen Staging: nicht durchgeführt, da keine Owner-Sitzung oder Testzugangsdaten verfügbar waren
- Browser-Laufzeit: geschützte Owner-Route leitet ohne Sitzung korrekt zu `/restaurant/login`
- Physischer Datei-Picker und Reload-Persistenz: noch mit authentifiziertem Staging-Owner zu prüfen

## Migration

Keine neue Migration. Die bereits bestehende Upload-/Storage-Struktur wurde wiederverwendet.

## Offene Risiken

1. Der echte Upload, die RLS-Autorisierung und die Reload-Persistenz benötigen eine authentifizierte Staging-Abnahme.
2. Teil B bleibt wegen des dokumentierten Bible-Konflikts offen.
3. Alte Bildobjekte werden beim Austausch nicht automatisch gelöscht. Das verhindert versehentliche Fremdlöschungen, kann aber verwaiste Storage-Objekte hinterlassen.

## Status

`CHANGES_REQUIRED`

Teil A ist lokal implementiert und technisch geprüft. Der Gesamtauftrag kann wegen Teil B und der noch fehlenden authentifizierten Staging-Abnahme nicht als `READY_FOR_REVIEW` gelten.
