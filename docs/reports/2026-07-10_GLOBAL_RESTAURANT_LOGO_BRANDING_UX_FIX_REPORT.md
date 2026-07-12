# WUXUAI Bonus V1

## Globaler Restaurant-Branding UX Fix

Datum: 2026-07-10

Status: LOCK

## Aufgabe

Restaurant-Logos sollen in den wichtigsten Portalbereichen groesser, klarer und proportional korrekt dargestellt werden. Es wurden nur UI/UX-Anpassungen vorgenommen.

Nicht geaendert:

- keine Backend-Logik
- keine Migration
- keine RPC
- keine Punkte-Logik
- keine Belohnungs-Logik
- keine Tages-PIN-Validierung

## Geaenderte Dateien

- `src/styles.css`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/ReferralLanding.tsx`
- `src/modules/admin/AdminLayout.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/staff/StaffTablet.tsx`

## Branding-Fix

Es gibt jetzt gemeinsame UI-Klassen fuer Restaurant-Branding:

- `restaurant-brand-header`
- `restaurant-logo-frame`
- `restaurant-logo-image`
- `restaurant-logo-placeholder`
- `restaurant-brand-title`
- `restaurant-brand-subtitle`

Logos werden proportional angezeigt mit:

- `object-fit: contain`
- `object-position: center`
- kontrollierten Maximalbreiten und Maximalhoehen
- groesserem Logo-Rahmen
- sauberem Fallback, wenn kein Logo vorhanden ist

## Gepruefte Bereiche

### Customer Portal

Der Header zeigt jetzt ein groesseres Restaurantlogo, den Restaurantnamen und den Hinweis `Bonus fuer Gaeste` als zusammenhaengenden Brandblock.

### Punkte sammeln

Die Punkte-sammeln-Ansicht nutzt denselben Customer-Portal-Header. Die Tages-PIN-Eingabe bleibt maskiert und wurde nicht logisch veraendert.

### Mein Bonus / Kundenuebersicht

Die Kundenuebersicht nutzt denselben Brandblock. Logos werden nicht mehr in ein zu kleines Quadrat gepresst.

### Belohnungen / Willkommensgeschenke

Die Darstellung bleibt innerhalb des Customer Portals und profitiert vom verbesserten Header. Keine Belohnungslogik wurde veraendert.

### Referral Landing

Die Freunde-Einladungsseite zeigt Restaurantlogo und Restaurantname jetzt ebenfalls als klaren Brandblock.

### Restaurant Portal / Admin Header

Der Admin-Header zeigt jetzt Restaurantlogo, Restaurantname und `Restaurant Portal`. Das Logo ist nicht mehr nur ein kleiner Punkt.

### QR Center

Die QR-Vorschaukarten fuer neue Gaeste und Bonuspunkte zeigen jetzt Restaurantlogo und Restaurantname im Brandblock.

### Staff Portal

Die Mitarbeiteransicht zeigt Restaurantname und Logo im Header, sofern das Branding eindeutig zum geladenen Restaurant passt. Bei fehlendem Logo erscheint ein neutraler Platzhalter.

### Onboarding Preview

Die Live-Vorschau im Onboarding nutzt dieselben Branding-Klassen und zeigt Logos proportional.

## Responsive Pruefung

Geprueft per CSS-Struktur und Build:

- Mobile: Logo-Rahmen mindestens 56 x 56 px, Bild maximal 48 px hoch und 96 px breit.
- Tablet/Desktop: groesserer Logo-Rahmen, Bild maximal 64 px hoch und 120 px breit.
- Kein festes quadratisches Bild-Cropping.
- Lange Restaurantnamen duerfen umbrechen.
- Keine horizontale Scrolllogik hinzugefuegt.

## Tages-PIN

Die Tages-PIN im Customer Portal bleibt als geschuetztes Feld umgesetzt:

- `type="password"`
- `inputMode="numeric"`
- maximale Laenge 4
- bestehende Ziffernfilterung unveraendert

## Selbstpruefung

- Keine Supabase-Migration geaendert.
- Keine RPC-Datei geaendert.
- Keine Business-Regel geaendert.
- Sichtbare neue Texte sind Deutsch.
- Keine V2-Funktion eingebaut.

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` wurde in diesem Projekt nicht gefunden. Die vorhandenen Regeln aus `AGENTS.md`, `docs/00_START_HIER.md`, `docs/04_RESTAURANT_PORTAL.md`, `docs/05_CUSTOMER_PORTAL.md`, `docs/06_STAFF_PORTAL.md`, `docs/15_DESIGN_SYSTEM.md` und `docs/18_CODEX_REGELN.md` wurden beruecksichtigt.

## Build

`npm run build` wurde erfolgreich ausgefuehrt.

## Offene Risiken

- Kein echter Browser-Screenshot wurde in diesem Durchlauf erstellt.
- Staff Portal zeigt das Admin-Branding nur, wenn es eindeutig zum geladenen Restaurant passt. Dadurch wird falsches Branding vermieden; bei nicht geladenem Branding erscheint der Platzhalter.

## Ergebnis

Status: LOCK
