# Customer Home Points Info Compaction Report

Datum: 2026-09-01
Status: CODE LOCK / PHYSICAL FOUNDER PENDING

## Ursache

`CustomerPortal.tsx` renderte direkt nach der Punktekarte einen eigenen
`premium-legal-notice`-Absatz. Dieser dauerhaft sichtbare Block belegte auf
Mobilgeraeten vertikalen Raum und schob `Aktuelles & Angebote` nach unten,
obwohl der Text zugaenglich bleiben, aber nicht permanent sichtbar sein muss.

## Geaenderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/components/PremiumCustomerUi.tsx`
- `src/modules/customer/customer-premium.css`
- `tests/customer-home-points-info-compaction.test.mjs`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/19_CHANGELOG.md`
- dieser Report

## Was wurde geaendert

- `PointsCard` besitzt einen optionalen Infobutton direkt neben dem Titel.
- Der Button verwendet das bestehende Icon-System, ein echtes
  `button`-Element, die Beschriftung `Informationen zu Punkten` und eine
  44-Pixel-Touchflaeche.
- Der unveraenderte Punktehinweis erscheint in einem kompakten `AppDrawer` mit
  Fokusmanagement, Escape-Unterstuetzung und Fokus-Rueckgabe.
- Der permanente Home-Hinweis wurde entfernt, sodass Angebote im normalen
  Dokumentfluss nach oben ruecken.

## Was wurde nicht geaendert

- Punkteberechnung, Punktestand und Punktegueltigkeit
- Bonus-Boost, Fortschritt und Reward-Schwellen
- Offers, Rewards, Gifts und Referral
- Teilnahmebedingungen, Legal Center und Consent
- RLS, RPCs, Supabase und Datenbank

## Pruefung

- Fokussierter Regressionstest: 3/3 PASS
- Gesamtsuite: 1217/1217 PASS
- Typecheck: PASS
- Lint: PASS
- Build: PASS mit nicht produktiven Build-Platzhaltern
- `git diff --check`: PASS
- Mobile 320/375/390/414/430: PASS
- Infobutton: bei allen Zielbreiten 44 x 44 Pixel
- Badge-/Titelkollision: keine
- Horizontaler Overflow: keiner
- Drawer-Inhalt und Schliessen: PASS
- Desktop 1024: PASS

## Migration

Keine.

## Risiken

Der physische Founder-Test auf iPhone ist noch offen. Bis dahin gilt maximal
CODE LOCK.
