# WUXUAI Bonus V1 - Referral Welcome Gift, Eligibility und Monatslimit

Stand: 2026-08-24
Branch: `codex/v1-canonical-recovery`
Status: **CODE LOCK / STAGING PENDING**

## Ursache

Der bestehende Referral-Flow konnte sofort und unbegrenzt Einladungen erzeugen.
Die Referral-Registrierung verwendete zwar den sicheren Customer-Auth- und
Legal-Flow, rief aber die kanonische Welcome-Gift-Zuteilung nicht auf. Dadurch
wich sie von der direkten Registrierung ab. Die Qualifizierung selbst war
bereits korrekt an die erste positive Punktebuchung des eingeladenen Gasts
gebunden.

## Geaenderte Dateien

- `supabase/migrations/20260824006000_referral_welcome_eligibility_monthly_quota.sql`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/ReferralLanding.tsx`
- `src/modules/customer/customerAccountService.ts`
- `src/modules/customer/referralInviteFlow.mjs`
- `src/modules/customer/referralInviteFlow.d.mts`
- `src/modules/admin/pages/LoyaltyPage.tsx`
- `src/shared/types/domain.ts`
- aktuelle Engineering-Bible- und Testdateien

## Was wurde geaendert

- Referral-Registrierung verwendet `assign_welcome_starter_reward` und damit
  denselben bestehenden, restaurantbezogenen Einmaligkeitsvertrag wie direkte
  Registrierung. Das Geschenk bleibt bis zur ersten Punktebuchung gesperrt.
- Einladungserstellung verlangt serverseitig eine positive `earn`-Buchung des
  Referrers im selben Restaurant.
- Defaultlimit sind 5 neue Einladungen pro Gast, Restaurant und lokalem
  Kalendermonat. Owner duerfen 1 bis 100 konfigurieren.
- Nur neue Datensaetze mit `quota_counted = true` zaehlen. Historische
  Einladungen bleiben unveraendert.
- Ein clientseitig kryptografisch erzeugter 256-Bit-Wert macht Retries
  idempotent. In der Datenbank wird nur sein Hash gespeichert; der Rohwert
  erscheint nicht in Audit oder Logs.
- Advisory Lock, Tenant- und Tokenpruefung verhindern parallele Ueberziehung.
- Das Kundenportal zeigt gesperrte Eligibility, Monatsverbrauch und den
  angenommenen, noch nicht qualifizierten Zustand.
- Das Owner-Portal bietet die restaurantbezogene Monatslimit-Einstellung.

## Was wurde nicht geaendert

- Keine Aenderung des 2x-Multiplikators.
- Referrer erhaelt weiterhin 100 Prozent, eingeladener Freund 50 Prozent der
  gespeicherten Restaurantdauer.
- Referrer-Punkte qualifizieren niemals die Einladung des Freundes.
- Keine rueckwirkende Aenderung historischer Referrals, Booster oder
  Willkommensgeschenke.
- Keine Production-Aktion, kein Deployment, kein Push und kein Merge.

## Migration und Sicherheit

- Migration erstellt: Ja.
- Migration additiv: Ja.
- RLS deaktiviert oder gelockert: Nein.
- Neue Tabellenrechte: Nein.
- RPCs verwenden `SECURITY DEFINER` mit festem `search_path`.
- Owner-Update bleibt auf `owner` und `admin` des eigenen Restaurants begrenzt.
- Customer-RPCs validieren Restaurant und geheimen Customer-Token
  serverseitig.
- Staging-Anwendung: Nein. `20260824005000` ist in der lokalen Reihenfolge noch
  vor `20260824006000` offen und darf nicht uebersprungen werden.
- `supabase db push --linked --dry-run --include-all` endete mit Exit 0, lieferte
  in der aktuellen CLI-Umgebung jedoch keine auswertbare Ausgabe. Dies wird
  deshalb nicht als verifizierter Dry-Run gewertet.

## Qualitaet

- Gezielte Referral-Tests: 30/30 PASS.
- Gesamttests: 846/846 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen.
- Build: PASS.
- `git diff --check`: PASS.
- Secret-/Artefaktpruefung im betroffenen Diff: PASS.

## Offene Risiken

- Migration und RPC-Vertraege muessen nach Freigabe der davorliegenden
  Migration zuerst per auswertbarem Dry-Run und danach auf Staging getestet
  werden.
- Echte Paralleltests fuer Einladung 5/6, Token-Retry, Referral-Registrierung
  und Welcome-Gift-Einmaligkeit stehen auf Staging noch aus.
- Customer- und Owner-UI wurden gebaut und statisch getestet, aber noch nicht
  als echter 390-px-Staging-Flow visuell abgenommen.

## Ergebnis

- Aufgabe: Referral V1 Welcome Gift, Eligibility und Monatslimit
- Build: Ja
- Migration: Erstellt / nicht auf Staging angewendet
- Flow-Test: Automatisiert Ja / echter Staging-Flow Nein
- RLS/Security: Ja, Code- und Grant-Vertrag geprueft
- Alte Logik geprueft: Ja
- Pruef-ZIP:
  `exports/2026-08-24_REFERRAL_V1_WELCOME_ELIGIBILITY_MONTHLY_LIMIT.zip`
- Status: **CODE LOCK / kein FINAL LOCK**
