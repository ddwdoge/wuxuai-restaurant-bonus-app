# WUXUAI Bonus Unified UI/UX System

Status: **PHASE 2 / STAGING**

## Ziel

Owner, Customer, Staff und Platform Admin verwenden eine gemeinsame visuelle
Grundsprache aus warmer Cremeflaeche, weissen Oberflaechen, dosiertem Gold,
dunkler Typografie, ruhigen Abstaenden und klaren semantischen Zustaenden.
Die Informationsarchitektur und die Businessflows der Rollen bleiben getrennt.

## Kanonische Tokens

Die Tokens liegen in `src/shared/ui/ui-system.css` und decken Abstaende,
Kontroll-, Karten- und Dialogradien, Schatten, Typografie, Hintergruende,
Oberflaechen, Rahmen, Goldakzent, Texthierarchie, Erfolg, Warnung, Fehler,
Information, deaktivierte Zustaende und Fokus ab. Karten verwenden den
kanonischen Radius von 8 Pixeln. Interaktive Bedienelemente sind mindestens
44 mal 44 Pixel gross.

## Kanonische Komponenten

- `UiButton`: Primary, Secondary, Ghost, Danger und Link mit Loading-Zustand.
- `UiField`: Label, Pflicht/Optional, Hilfe, Fehler und Formularinhalt.
- `UiCard`: Default, Interactive, Summary, Warning, Diagnostic und Reward.
- `UiStatus`: Neutral, Success, Warning, Error und Info.
- `UiDialog`: visuelle Normal-, Sensitive- und Critical-Ausgabe auf Basis des
  bestehenden barrierefreien `AppDrawer`. Bestaetigungslogik bleibt beim
  aufrufenden Fachmodul.
- `UiState`: Loading, Empty, Error und Unavailable ohne technische Rohfehler.

Bestehende `.button`, `.input`, `.card`, `.pill`, Portal- und Tabellenklassen
werden waehrend der schrittweisen Migration durch eine gemeinsame
Kompatibilitaetsschicht an dieselben Tokens gebunden. Dadurch bleibt das
Risiko fuer bereits gepruefte Fachflows klein.

## Inventar vor der Vereinheitlichung

Die reproduzierbare Bestandsaufnahme `npm`/Node-Skript
`scripts/audit-ui-system.mjs` fand folgende namensbasierte Varianten:

| Familie | Varianten |
| --- | ---: |
| Buttons | 40 |
| Formulare | 60 |
| Karten/Paneele | 118 |
| Status | 61 |
| Dialoge/Drawer | 29 |
| Navigation/Tabs | 35 |
| Loading/Empty/Error | 66 |
| Tabellen | 9 |

Das Inventar ist eine Migrationsliste, keine Behauptung, dass jede Klasse eine
eigenstaendige Designentscheidung darstellt.

## Responsive und Barrierefreiheit

- Gepruefte Breiten: 320, 360, 375, 390, 414, 430, 768, 1024 und 1280 Pixel.
- Plattformtabellen duerfen horizontal innerhalb ihres eigenen Bereichs
  scrollen und verbreitern niemals das Dokument.
- Registration Telemetry stapelt Kennzahl und Label bei 320 Pixeln und behebt
  den vorher gemessenen globalen Ueberlauf.
- Fokus ist sichtbar; Drawer behalten Escape, Fokusfalle und Fokus-Rueckgabe.
- `prefers-reduced-motion` reduziert Animationen.
- Die System-Fontliste enthaelt sichere Latin-, chinesische und koreanische
  Fallbacks ohne eigene Fontdateien.

## Uebersetzungsschluessel

Navigation, gemeinsame Aktionen, Lade-/Fehlerzustaende, Reward-Status sowie
Platform-Telemetrie und Audit-Filter verwenden die zentrale strukturelle
Schluesselarchitektur. Die sichtbare Sprache bleibt in dieser Phase Deutsch.
Der reproduzierbare strukturelle Hardcoding-Bestand wurde von 1906 auf 1831
Eintraege reduziert. Die restlichen Eintraege bleiben fuer die spaetere
inhaltliche Uebersetzungsphase dokumentiert; Phase 2 erfindet keine finalen
Uebersetzungen.

## Unveraenderte Vertraege

Keine Aenderung an Onboarding-Schritten, Punkten, QR, Gifts, Rewards, Offers,
Planen, Platform-Admin-Berechtigungen, Rechtsraum, Benachrichtigungen, RLS,
Stripe oder Production.
