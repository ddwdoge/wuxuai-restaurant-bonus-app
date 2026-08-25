# Owner Referral / 2x Settings - UI Visibility & Routing Audit

Datum: 2026-08-25  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `018182cb74122202527410693721ce48642483ca`

## Ursache

Die Owner-Oberflaeche und die Route waren bereits vorhanden, aber weder die
Einstellungsuebersicht noch der Bereich `Bonusprogramm` enthielten einen Link
auf `/admin/loyalty`. Der Bereich war deshalb nur durch Kenntnis der direkten
URL erreichbar. Klassifikation: **A (UI vorhanden, kein Menueeintrag)** und
**D (Owner-Navigation enthielt den Bereich nicht)**.

## Bestehender Vertrag

- Komponente: `src/modules/admin/pages/LoyaltyPage.tsx`
- Route: `/admin/loyalty`
- Laden: `loadLoyaltySettings`
- Speichern: `saveReferralBonusSettings`
- RPC: `public.update_referral_bonus_settings`
- Werte: Aktiv/Inaktiv, 7/14/28 Tage, eigener Wert 1-365, fest 2x,
  Monatseinladungslimit 1-100
- Sicherheit: serverseitige Restaurantzuordnung, Owner/Admin-Rolle,
  fester `search_path`, kein Anon-Execute, Audit-Ereignis
  `REFERRAL_BONUS_SETTINGS_UPDATED`

## Geaenderte Dateien

- `src/modules/admin/pages/SettingsPage.tsx`
- `src/modules/admin/pages/LoyaltyPage.tsx`
- `tests/referral-bonus-duration-settings.test.mjs`

## Aenderung

Die Einstellungsuebersicht und der bestehende Bereich `Bonusprogramm` verlinken
jetzt sichtbar auf `Freunde einladen & 2x Bonus`. Das Ziel
`/admin/loyalty#freundschaftsbonus` fokussiert die bereits vorhandene
Referral-Karte. Die Vorschau benennt die volle Bonusdauer des Einladenden und
die halbe Dauer des Freundes eindeutig. Der Hilfetext erklaert das monatliche
Limit ohne technische Begriffe.

## Staging

Staging-Projekt: `bwhvfjuwixgwduoeqaya`  
Pilotrestaurant: `Kaffee Konditorei baeckerei`

Direkt aus dem Staging-Datenstand verifiziert:

- Referral aktiv: Ja
- Multiplikator: 2.00
- Dauer: 14 Tage
- Monatliches Einladungslimit: 5

Der kontrollierte UI-Speichertest `14 -> 28 -> 14` wurde nicht ausgefuehrt.
Die vorhandene Browser-Sitzung wurde beim direkten Aufruf von
`/admin/loyalty` serverseitig als Mitarbeiter erkannt und mit
`Falscher Anmeldebereich` blockiert. Es wurde weder per SQL noch durch eine
Rollenabkuerzung gespeichert. Der Pilotwert blieb 14/5.

## Sicherheit

Die Referral-Engine, RLS, Grants, RPCs und Migrationen wurden nicht geaendert.
Staff wurde im echten Staging-Aufruf blockiert. Customer-, Fremd-Owner- und
Owner-Speichertests sind durch die vorhandenen automatisierten Tenant- und
RPC-Vertragstests abgedeckt, aber in dieser Sitzung nicht mit separaten echten
Konten wiederholt.

## Mobile und Qualitaet

Die neue Navigation verwendet die bestehende responsive
`SettingsLinkCard`-Struktur. Die Referral-Felder wechseln unter 699 px auf eine
Spalte; der Speichern-Button nutzt dort die volle Breite. Ein authentifizierter
Live-Sichttest bei 390/430/768/1024 px war ohne Owner-Sitzung nicht moeglich.

Qualitaetsresultate werden nach dem finalen Lauf eingetragen:

- Tests: 991/991 PASS
- Typecheck: PASS
- Lint: PASS
- Build: PASS
- `git diff --check`: PASS
- Secret Scan: PASS

## Nicht geaendert

- Referral-Qualifikation
- Welcome Gift
- 100/50-Regel
- Quota-Enforcement
- Stacking und Punkte-Engine
- Customer Referral UX
- Datenbank und Migrationen
- Production und Stripe

## Risiken

Die lokale Navigation ist noch nicht auf Staging bereitgestellt. Der echte
Owner-Save/Reload-Test und die vier Live-Viewports bleiben bis zu einer
berechtigten Owner-Sitzung und einer separat freigegebenen Staging-
Bereitstellung offen.

Status: **CODE LOCK / NOT FINAL LOCK**

Pruef-ZIP:
`exports/2026-08-25_OWNER_REFERRAL_SETTINGS_UI_VISIBILITY_ROUTING_AUDIT.zip`
