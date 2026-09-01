# Referral Customer Lifecycle UX Report

Datum: 2026-08-24

## Ursache

Die aktive Boost-Antwort enthielt bereits Start, Ende und Beguenstigtenrolle.
Der Customer-Status-RPC unterschied jedoch nur aggregierte Einladungszahlen und
den letzten ausgehenden Referral-Status. Dadurch konnte die UI weder den
eingeladenen Freund im Zustand vor der ersten qualifizierten Punktebuchung noch
einen abgelaufenen Boost autoritativ darstellen.

## Umsetzung

- `get_customer_referral_invite_status` loest den Lebenszyklus
  restaurant- und kundenbezogen aus `referrals`, `customer_bonus_boosts` und
  `referral_boost_grants` auf.
- Prioritaet: aktiv, Friend wartet auf Qualifikation, Referrer wartet auf
  Qualifikation, wartet auf Registrierung, abgelaufen.
- Die Startseite zeigt Pending-Zustaende kompakt direkt beim Punktestand.
- Aktive Booster zeigen `Dein Bonus` oder `Dein Einladungsbonus`, exakten
  Ablauf in Europe/Vienna und eine Restzeit in Tagen, Stunden und Minuten.
- Das serverseitige kombinierte Enddatum bleibt bei mehreren Grants die
  sichtbare Autoritaet. Der Multiplikator bleibt maximal 2x.
- Es werden keine Freundesnamen, Tokens oder anderen personenbezogenen Daten
  ueber den Status-RPC ausgegeben.

## Nicht geaendert

- Referral-Qualifikation
- volle Referrer- und halbe Friend-Dauer
- Punkteberechnung und maximaler Multiplikator
- Laufzeitverlaengerung und Idempotenz
- Auth, RLS, Grants und Owner-Einstellungen

## Pruefung

- Verhaltenstests fuer alle vier Lebenszykluszustaende
- serverseitige Restaurant-/Kundenbindung
- exakte Zeitformatierung fuer Europe/Vienna
- 14 Tage, 1 Tag und 2 Stunden 15 Minuten Restzeit
- rollenbezogene 100-/50-Prozent-Texte
- kein aktiver 30-/15-Tage-Text im Customer Portal
- Stacked Expiry verwendet das serverseitige `active_until`

## Staging und Mobile

Die erweiterte Migration `20260824006000` ist wegen der weiterhin offenen
vorherigen Migration `20260824005000` nicht auf Staging angewendet. Daher wurde
kein echter Referral-Lebenszyklus gegen Staging und kein physischer
iPhone-Safari-Test ausgegeben. Production bleibt gesperrt.

## Qualitaetsgates

- Tests: 852/852 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen
- Build: PASS
- `git diff --check`: PASS
- Responsive Vertrage fuer 320, 375, 390, 414, 430, 768 und 1024 Pixel:
  automatisiert PASS; physischer Safari-Nachweis offen

## Risiken

- Vollstaendige Live-Verifikation erst nach kontrollierter Migrationsreihenfolge.
- Safari und installierte PWA muessen mit realem serverseitigem Pending- und
  Ablaufzustand separat geprueft werden.

Status: CODE LOCK, NICHT FINAL LOCK
