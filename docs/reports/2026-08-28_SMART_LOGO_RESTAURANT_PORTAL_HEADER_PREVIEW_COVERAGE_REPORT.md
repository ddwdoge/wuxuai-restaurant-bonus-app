# Smart Logo Restaurant-Portal Header und Vorschauabdeckung

Datum: 2026-08-28  
Branch: `codex/v1-canonical-recovery`  
Commit-Basis: `6232a6142ff7a5c2b75bba66b9b93e994d09f14e`  
Staging-Version: `bd0d3e93-08e6-4fad-8c76-eb132e4dffff`

## Ursache

Der Restaurant-Portal-Header verwendete bereits die gemeinsame
`RestaurantLogoStage` und die gespeicherten Werte aus `restaurant_branding`.
Eine staerkere historische CSS-Regel in `admin-premium.css` fuegte dieser
Stage jedoch 6 px Innenabstand, einen sichtbaren Rahmen und einen Schatten
hinzu. Dadurch war die gespeicherte Transformation zwar korrekt, die effektive
Darstellungsflaeche wich aber vom Editor und den anderen Portalen ab.

Vor dem Fix ergab die Live-Messung fuer den Owner-Header `padding: 6px`, waehrend
der Editor `padding: 0px` verwendete. Nach dem Fix verwenden beide bei der
gespeicherten Skalierung 135 Prozent dieselbe Transformation
`matrix(1.35, 0, 0, 1.35, 0, 0)` ohne sichtbaren Rahmen oder Schatten.

## Geaenderte Dateien

- `src/modules/admin/admin-premium.css`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/styles.css`
- `tests/owner-smart-logo-presentation.test.mjs`
- `docs/19_CHANGELOG.md`
- `design-qa.md`
- dieser Bericht

## Was wurde geaendert

- Der Owner-Header laesst die kanonische Smart-Logo-Geometrie unveraendert.
- Der Editor zeigt jetzt genau fuenf Vorschauen in dieser Reihenfolge:
  Gaeste-Header, Restaurant-Portal, Mitarbeiter-Header, Restaurantdetails,
  QR Starter Kit.
- Die Restaurant-Portal-Vorschau zeigt dieselbe LogoStage mit denselben
  Skalierungs- und Positionswerten wie der echte Header.
- Die rohe Logo-Vorschau im Onboarding wurde durch die gemeinsame LogoStage
  ersetzt.

## Flaechen-Audit

| Flaeche | Renderer | Praesentationswerte |
| --- | --- | --- |
| Restaurant-Portal-Header | `RestaurantLogoStage` | vollstaendig |
| Customer Header und Konto | `RestaurantLogoStage` | vollstaendig |
| Staff Header | `RestaurantLogoStage` | vollstaendig |
| Restaurantdetails | `RestaurantLogoStage` | vollstaendig |
| QR Center | `RestaurantLogoStage` / Canvas | vollstaendig |
| Starter Kit | Canvas mit `logoCanvasPlacement` | vollstaendig |
| Onboarding-Vorschau | `RestaurantLogoStage` | sichere Standarddarstellung |

Aktive rohe Restaurant-Logo-Renderer: **0**. Der zentrale Restaurantwechsel,
Partner-Finder und die Referral-Landingpage nutzen ebenfalls die kanonische
LogoStage. Ihre oeffentlichen Payloads liefern aktuell nicht in jedem Fall die
optionalen Praesentationsmetadaten; dann greift die dokumentierte sichere
Standarddarstellung. Es wurde dafuer keine Datenbank- oder RPC-Aenderung in
diesen UI-Scope aufgenommen.

## Staging-Ergebnis

- Deployment: PASS
- Owner-Login und Branding-Seite: PASS
- Editor-Vorschauen: 5, korrekte Reihenfolge
- Owner-Header und Editor bei 135 Prozent: identische Transformation
- Save/Reload: 135 -> 140 -> Reload, Owner-Header aktualisiert
- Wiederherstellung: 140 -> 135 -> Save -> Reload, PASS
- globale horizontale Ueberlaeufe in den geprueften Breiten: keine
- graue Seitenflaechen / zusaetzlicher Headerrahmen: keine

## Qualitaet

- Tests: 1045/1045 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 7 bereits bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Migration: keine
- RLS/Security: unveraendert

## Was wurde nicht geaendert

- Logo-Upload und Originaldateien
- Smart-Logo-Algorithmus
- Persistenzschema und RLS
- Bonus-, Customer-, Staff- oder QR-Businesslogik
- Production und Stripe

## Risiken

Fuer die oeffentlichen, restaurantuebergreifenden Listenflaechen kann eine
spaetere additive Payload-Erweiterung sinnvoll sein, falls dort zwingend jede
manuelle Owner-Positionierung statt der sicheren Standarddarstellung erscheinen
soll. Das ist kein roher Renderer und kein Blocker fuer den reparierten
Restaurant-Portal-Header oder die geforderte Editor-Abdeckung.

Status: FINAL LOCK
