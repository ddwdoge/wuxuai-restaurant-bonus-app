# WUXUAI Bonus – Owner Branding Smart Logo System

Datum: 2026-08-27  
Branch: `codex/v1-canonical-recovery`

## Ursache

Restaurantlogos wurden in mehreren Portalen durch voneinander unabhängige
`img`-Renderer und feste weiße, häufig quadratische Rahmen dargestellt. Breite
und hohe Logos nutzten dadurch nur einen kleinen Teil der Fläche. Zoom,
Position und sichere Fehlerzustände waren nicht zentral definiert; QR-PDFs
verwendeten nochmals eine eigene Canvas-Berechnung.

## Geänderte Bereiche

- gemeinsame `RestaurantLogoStage` und formatabhängige Fit-Geometrie
- Owner-Einstellungen unter `Einstellungen → Aussehen`
- Customer-Header, Kundenkonto, Referral und Restaurantdetails
- Owner- und Staff-Header
- QR-Center und Onboarding-Starter-Kit einschließlich Canvas-Ausgabe
- Branding-Domainmodell, Tenant-Ladevorgang und Customer-Portal-Payload
- additive Darstellungsmetadaten in `restaurant_branding`
- Vertrags-, Sicherheits- und Darstellungsprüfungen

## Umsetzung

- Auto-Fit erkennt quadratisch, breit und hoch und verwendet proportionalen
  `contain`-Fit mit formatabhängiger Ruhezone.
- Der Owner kann Skalierung von 75 bis 300 Prozent sowie X-/Y-Position ändern
  und jederzeit auf automatische Einpassung zurücksetzen.
- Vier Vorschaukontexte zeigen Gäste-Header, Restaurantdetails, QR Starter Kit
  und Mitarbeiter-Header vor dem Speichern.
- PNG und WebP können auf transparente Innenabstände geprüft werden. Eine
  Korrektur wird nur vorgeschlagen und verändert die Originaldatei nicht.
- Feste weiße oder farbige Bildhintergründe werden nicht entfernt.
- Fehlende oder defekte URLs zeigen einen stabilen Restaurant-Fallback. Das
  Browser-Fehlerbild und sichtbarer Ersatz-Alttext werden nicht gerendert.
- Die alte `/admin/branding`-Route leitet auf die kanonische Aussehen-Seite um,
  damit kein zweiter Branding-Editor bestehen bleibt.

## Migration

Datei: `20260827001000_restaurant_logo_presentation.sql`

Neue Felder:

- `logo_fit_mode`: `auto | manual`
- `logo_scale`: 0,75 bis 3
- `logo_position_x`: 0 bis 1
- `logo_position_y`: 0 bis 1

Die Migration ist additiv, verändert keine bestehenden Bildobjekte und keine
RLS-Policy oder Tabellenrechte. Der bestehende gehärtete öffentliche
Customer-Portal-RPC behält Token-, Ablauf- und Membership-Prüfung und ergänzt
nur die vier Darstellungswerte. `EXECUTE` bleibt auf `anon` und
`authenticated` begrenzt; `public` wird widerrufen.

Migration erstellt: Ja  
Migration auf Staging angewendet: Nein  
`supabase db push --include-all`: Nicht ausgeführt  
DB-Linter gegen Staging: Nicht ausgeführt

## Upload-Vertrag

- PNG, JPG/JPEG, WebP und SVG
- maximal 5 MB
- empfohlen 1024 × 1024 Pixel
- mindestens 512 Pixel in Breite oder Höhe
- breite Dateien werden nicht wegen eines nicht-quadratischen Formats abgelehnt

## Tests

Getestete Logoformen:

- quadratisch
- breit
- sehr breit
- hochformatig
- transparent
- mit festem Hintergrund
- mit transparentem Innenabstand
- fehlend beziehungsweise defekt

Responsive Fixture:

- 320: PASS
- 375: PASS
- 390: PASS
- 430: PASS
- 768: PASS
- 1024: PASS
- 1440: PASS
- globaler horizontaler Overflow: NEIN
- Seitenverhältnis erhalten: PASS

Qualität:

- Tests: 1039/1039 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 7 bereits bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Secret-Scan des Diffs: PASS

## Nicht geändert

- Auth und Rollenlogik
- Punkte, Rewards, Einlösung und Referral
- Restaurant- und Customer-Zuordnung
- QR-Payloads und Routing
- Storage-Public/Private-Vertrag
- RLS-Policies und bestehende Tabellenrechte
- Production und Stripe

## Risiken

- Die neue Persistenz ist bis zur kontrollierten Staging-Anwendung der
  Migration nicht live verfügbar.
- Ein echter Owner-Upload und die vier Zielkontexte wurden noch nicht gegen die
  verbundene Staging-Datenbank auf einem physischen Gerät bestätigt.
- SVG wird wie bisher unterstützt. Unvertrauenswürdige SVG-Inhalte werden nicht
  inline in das DOM geschrieben, sondern nur als Bildquelle geladen.

## Statusmatrix

SMART LOGO SYSTEM: PASS  
AUTO FIT: PASS  
SQUARE LOGO: PASS  
WIDE LOGO: PASS  
VERY WIDE LOGO: PASS  
TALL LOGO: PASS  
TRANSPARENT LOGO: PASS  
SOLID BACKGROUND LOGO: PASS  
INTERNAL WHITESPACE LOGO: PASS  
MISSING LOGO FALLBACK: PASS  
BROKEN LOGO FALLBACK: PASS  
OWNER ZOOM: PASS  
OWNER POSITION: PASS  
RESET AUTO: PASS  
CUSTOMER HEADER: PASS  
RESTAURANT DETAILS: PASS  
QR STARTER KIT: PASS  
STAFF HEADER: PASS  
ORIGINAL ASSET PRESERVED: YES  
BUSINESS LOGIC CHANGED: NO  
DB MIGRATION: `20260827001000_restaurant_logo_presentation.sql`  
PRODUCTION: LOCKED  
STRIPE: DEFERRED

Status: **CODE LOCK**
