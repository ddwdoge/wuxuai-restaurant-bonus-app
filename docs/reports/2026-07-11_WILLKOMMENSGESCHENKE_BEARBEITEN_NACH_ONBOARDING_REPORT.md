# Willkommensgeschenke bearbeiten nach Onboarding – Report

Datum: 2026-07-11

Status: LOCK

## Gelesene Dateien

- AGENTS.md
- docs/00_START_HIER.md
- docs/04_RESTAURANT_PORTAL.md
- docs/09_FLOW_02_GAST_WERDEN.md
- docs/13_SMART_REWARD_ENGINE.md
- docs/17_CTO_ENTSCHEIDUNGEN.md
- docs/18_CODEX_REGELN.md

Hinweis:

`docs/21_CODEX_SELBSTKONTROLL_LOOP.md` ist in diesem Workspace nicht vorhanden.
Der Selbstkontroll-Loop wurde anhand von AGENTS.md und docs/18_CODEX_REGELN.md
angewendet.

## Ursache

Die Willkommensgeschenke-Seite hatte bereits eine Grundbearbeitung, war aber
für den Restaurantbetrieb nicht vollständig:

- Kategorie war nicht bearbeitbar.
- Bilder konnten ersetzt, aber nicht auf das Standardbild zurückgesetzt werden.
- Nach Klick auf „Bearbeiten“ sprang die Seite nicht zum Formular.
- Der Speichern-Button war generisch und nicht klar im Bearbeitungsmodus.
- Eine spätere Migration setzte einen Unique-Index auf nur ein aktives
  Willkommensgeschenk pro Restaurant. Das widerspricht dem finalen
  Welcome-Gift-Pool.
- Die Storage-Policies mussten den Pfad `starter-rewards` defensiv absichern.

## Geänderte Dateien

- src/modules/admin/pages/WelcomeGiftsPage.tsx
- src/modules/rewards/rewardService.ts
- src/styles.css
- supabase/migrations/20260711004000_welcome_gifts_editable_after_onboarding.sql
- docs/04_RESTAURANT_PORTAL.md
- docs/09_FLOW_02_GAST_WERDEN.md
- docs/13_SMART_REWARD_ENGINE.md
- docs/17_CTO_ENTSCHEIDUNGEN.md
- docs/19_CHANGELOG.md
- docs/reports/2026-07-11_WILLKOMMENSGESCHENKE_BEARBEITEN_NACH_ONBOARDING_REPORT.md

## Bearbeiten-Flow

Umgesetzt:

- „Bearbeiten“ lädt das bestehende Willkommensgeschenk ins Formular.
- Die Seite scrollt zum Bearbeitungsformular.
- Das Formular erhält kurz eine dezente Hervorhebung.
- Fokus geht auf das Namensfeld.
- Bearbeitbare Felder:
  - Name
  - Kategorie
  - Preisgrenze / Wert bis €
  - Modus Wertgrenze oder festes Produkt
  - Produktname bei festem Produkt
  - Bild
  - Aktiv/Inaktiv
- Buttontext im Bearbeitungsmodus:
  - „Änderungen speichern“
- Erfolgsmeldung:
  - „Willkommensgeschenk aktualisiert.“

## Aktivieren / Deaktivieren

Umgesetzt:

- Aktive Geschenke zeigen „Deaktivieren“.
- Inaktive Geschenke zeigen „Aktivieren“.
- Status wird über `setRewardOfferActive` gespeichert.
- Übersicht wird nach erfolgreichem Speichern sofort aktualisiert.
- Fehler werden deutsch angezeigt.

## Bild-Handling

Umgesetzt:

- Bestehendes Bild wird angezeigt.
- Neues Bild kann hochgeladen werden.
- Erlaubt:
  - PNG
  - JPG
  - JPEG
  - SVG
- Maximale Größe:
  - 5 MB
- Upload-Pfad:
  - `restaurant-media/{restaurant_id}/starter-rewards/reward-{timestamp}.{ext}`
- Bild kann entfernt werden.
- Wenn kein Bild vorhanden ist, wird das WUXUAI Standardbild / Kategorie-Icon angezeigt.
- Bilder bleiben im festen Kartenrahmen und sprengen die Karte nicht.

## DB / RLS Prüfung

Geprüft:

- Reward-Updates laufen weiter über `rewards` und `restaurant_id`.
- `rewards admin write` bleibt RLS-Primärschutz.
- Storage-Upload bleibt nur für authentifizierte Owner/Admin/Manager des eigenen Restaurants erlaubt.
- `anon` und Customer erhalten keine Schreibrechte.
- Keine Service-Role im Frontend.

Migration hinzugefügt:

- `20260711004000_welcome_gifts_editable_after_onboarding.sql`

Die Migration:

- entfernt den alten Unique-Index `rewards_one_active_welcome_gift_per_restaurant_idx`
- legt einen Pool-Index für aktive Willkommensgeschenke an
- setzt Storage-Policies neu mit erlaubtem Pfad `starter-rewards`

Hinweis:

Die Migration muss vor einem echten Supabase-Upload auf Staging/Production
angewendet werden.

## Customer Portal Verbindung

Geprüft:

- Willkommensgeschenke bleiben `is_starter_reward = true`.
- Normale Punkteeinlösungen bleiben getrennt.
- Zukünftige normale Registrierungen verwenden den aktiven Welcome-Gift-Pool.
- Deaktivierte Willkommensgeschenke werden nicht mehr neu zugeteilt.
- Bereits eingelöste Willkommensgeschenke werden durch spätere Bearbeitung
  nicht wieder aktiviert.
- Customer Portal erhält Name, Bild, Wertgrenze und Modus aus den Reward-Daten.

Nicht geändert:

- Zufallszuteilung
- Tageslimits
- Referral-Regel
- Freischaltung nach erster Punktebuchung
- Einlösung

## Mobile Prüfung

Geprüft:

- Formular nutzt bestehende responsive Grid-Regeln.
- Bei kleinen Breiten werden Felder einspaltig.
- Kartenbilder bleiben im festen Bildbereich.
- Buttons bleiben erreichbar.
- Kein neuer horizontaler Layout-Zwang.

## Build-Ergebnis

`npm run build`

Ergebnis:

Erfolgreich.

## Offene Risiken

- Die Migration wurde in dieser Aufgabe lokal erstellt, aber nicht gegen Staging
  angewendet.
- Ein echter Upload-Test mit authentifiziertem Restaurant-Owner ist erst nach
  angewendeter Migration sinnvoll.

## Status

LOCK
