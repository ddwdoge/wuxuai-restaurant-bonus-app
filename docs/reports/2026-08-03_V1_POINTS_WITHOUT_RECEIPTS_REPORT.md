# V1-Punkteflow ohne Bonnummer

Datum: 03.08.2026
Branch: `codex/restaurant-controlled-points-flow`
Ausgangscommit: `5173a9d1bf353fc2ed02fcc4cd9280ec04814b60`

## Ursache

Die fruehere Sicherheitsarbeit hatte eine optionale Bonnummer in den
restaurantgesteuerten Punktevertrag, den Idempotenz-Fingerprint und einen
Eindeutigkeitsindex aufgenommen. Die verbindliche Produktentscheidung fuer V1
lautet dagegen: keine POS-/Kassenintegration und keine Bonnummer in Customer-,
Staff- oder Owner-Flows.

## Geaenderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/modules/loyalty/loyaltyService.ts`
- `supabase/migrations/20260803003000_remove_receipts_from_v1_points_flow.sql`
- `tests/v1-points-without-receipts.test.mjs`
- `tests/restaurant-controlled-points.test.mjs`
- `tests/points-idempotency-receipt-dml-hardening.test.mjs`
- Engineering-Bible-Dateien fuer Produkt, Portale, Flow, Datenbank, RPC,
  Security, Pilot-Testplan, CTO-Entscheidungen und Changelog

## Was wurde geaendert

- Bonnummer-Eingabe aus dem Staff-Confirm-Schritt entfernt.
- Bonnummer aus dem TypeScript-Servicevertrag und RPC-Payload entfernt.
- Neuer aktiver Browservertrag mit genau fuenf Parametern:
  `confirm_restaurant_controlled_points(uuid,text,integer,text,uuid)`.
- Historischen sechsparametrigen Vertrag in
  `confirm_restaurant_controlled_points_with_legacy_receipt_v1` umbenannt und
  fuer `public`, `anon` und `authenticated` gesperrt.
- Aktiver V1-Einstieg delegiert ausschliesslich mit `NULL` als historischem
  Belegwert.
- Bonnummer-Eindeutigkeitsindex entfernt. Historische Werte wurden nicht
  veraendert oder geloescht.
- Reverse-Fingerprint V2 bindet Restaurant, Operation `reverse`,
  Originaltransaktion, serverseitig autorisierte Rolle und normalisierte
  Begruendung.
- Engineering Bible und Pilot-Testmatrix auf die V1-Entscheidung aktualisiert.

## Was wurde nicht geaendert

- Keine Production-Datenbank und kein Deployment.
- Keine RLS-Policy gelockert oder deaktiviert.
- Keine Service-Role im Browser.
- Keine QR-, Tages-PIN-, Punkte-, Boost-, Referral- oder Reward-Logik ersetzt.
- Keine historischen Migrationen umgeschrieben.
- Nullable Spalte `points_transactions.receipt_number` bleibt als inaktiver
  V3/V4-Platzhalter erhalten.
- Kein Push und kein Merge.

## Migration

Migration:
`20260803003000_remove_receipts_from_v1_points_flow.sql`

- additiv/kompatibel: Ja
- Dry-Run: erfolgreich; exakt diese eine Migration geplant
- auf Staging angewendet: Ja
- lokale und Remote-Migrationsversion `20260803003000`: synchron
- Datenloeschung: Nein
- RLS-Aenderung: Nein
- Production angewendet: Nein

## Sicherheitspruefung

- QR-Referenz weiterhin gehasht, fuenf Minuten gueltig und Single-Use.
- Tages-PIN weiterhin serverseitig geprueft.
- Betrag, Punkte, Rate, Boost und Limits weiterhin serverseitig.
- Earn-Retry bleibt tenant- und payloadgebunden.
- Earn und Reverse koennen denselben Client-Key als getrennte Operationen
  verwenden.
- Reverse-Retry erzeugt keine zweite Gegenbuchung.
- Geaenderter Betrag sowie geaenderter Gast/QR liefern
  `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.
- Der historische Receipt-RPC ist fuer Browserrollen nicht ausfuehrbar.
- Neue Staging-Transaktionen enthielten keine Bonnummer.
- Testfixtures wurden nach beiden Live-Laeufen vollstaendig entfernt.

## Staging-Ergebnis

Projekt: `wuxuai-bonus-staging` (Project Ref maskiert: `bwhv...qaya`)

Live-Lauf 1, Earn/Reverse/Parallelitaet: 24/24 erfolgreich.

- Earn-Retry gleiche Transaktion
- Earn und Reverse mit gleichem Key
- Reverse-Retry gleiche Gegenbuchung
- Earn/Reverse mit unterschiedlichem Key
- Reverse-Payload-Mismatch
- paralleler Earn/Reverse
- parallele Reverse-Retries
- keine doppelte Gegenbuchung
- Grants, RLS, Legacy-RPC und Receipt-Index

Live-Lauf 2, Payload/Tenant/Bestandsflow: 16/16 erfolgreich.

- geaenderter Betrag blockiert
- geaenderter Gast/QR blockiert
- zweiter Tenant sauber getrennt
- Mindestbetrag und Restaurantlimit serverseitig
- abgelehnte Buchungen verbrauchen den QR nicht
- kundeninitiierter Bestandsflow weiterhin funktionsfaehig und idempotent
- alle neuen Transaktionen ohne Receipt-Wert

## Qualitaet

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bereits bestehende Warnungen
- Tests: 550/550 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Supabase Schema Lint: 7 bekannte Legacy-Fehler; keine neue/geaenderte
  Funktion dieses Auftrags betroffen

## Risiken

- Der private historische sechsparametrige Funktionskoerper bleibt als
  Kompatibilitaetsabhaengigkeit bestehen. Der einzige aktive V1-Einstieg uebergibt
  dort fest `NULL`; Browserrollen besitzen kein Ausfuehrungsrecht.
- Die Staff-UI wurde lokal kompiliert und automatisiert geprueft, aber gemaess
  Auftrag nicht auf eine Staging-Web-App deployed. Eine echte Browserabnahme des
  neuen Builds ist deshalb noch offen.
- Die sieben bestehenden Schema-Lint-Fehler gehoeren zu aelteren Reward- und
  Registrierungsfunktionen und sollten separat bereinigt werden.

## Pruefexport

Vollstaendiger bereinigter Quellstand:
`exports/2026-08-03_V1_POINTS_WITHOUT_RECEIPTS.zip`

Der Export enthaelt 609 Eintraege und keine `.git`-Daten, Abhaengigkeiten,
Build-Ausgaben, Umgebungsdateien, alten ZIPs oder Supabase-/Wrangler-Lokalstate.

Status: **CODE LOCK / STAGING DB VERIFIED**
