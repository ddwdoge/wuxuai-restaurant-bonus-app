# WUXUAI Bonus V1 - GitHub-Dev-Integrationsbericht

Datum: 2026-08-03
Status: Vorbereitung fuer GitHub Desktop

## Ausgangslage

- Ausgangsbranch: `codex/restaurant-controlled-points-flow`
- Ausgangscommit: `5173a9d1bf353fc2ed02fcc4cd9280ec04814b60`
- Verbindliche V1-Basis: `release/v1-restaurant-bonus`
- V1-Basis-Commit und Merge-Base: `0f318c26199bcfcf7520d64413dc1e7eb502f78d`
- Neuer Integrationsbranch: `dev`
- Origin: `ddwdoge/wuxuai-restaurant-bonus-app`
- Push in diesem Auftrag: Nein

Der Branch `dev` wurde direkt aus dem geprueften V1-Arbeitsstand erstellt. Der
separate Branch `future/v2-business-neutral` wurde weder eingebunden noch
veraendert.

## Enthaltener V1-Funktionsstand

Der integrierte Stand enthaelt die V1-Grundlagen fuer:

- Owner-Registrierung, E-Mail-Bestaetigung und Passwort-Reset
- Restaurant-Onboarding einschliesslich `completed`-Status und idempotenter Aktivierung
- automatische Legal-Paket-Erzeugung, Legal Center und Null-Sicherheit
- Oeffnungszeiten mit Mittagspause und Pflichtfeld-Markierungen
- kontextbezogene Onboarding-Hilfe
- restaurantbezogene QR-Kundenwiedererkennung und Telefonnummernnormalisierung
- restaurantkontrollierte Punktevergabe ohne Bonnummern sowie bestehenden Tages-PIN-Flow
- Reward-Einloesung, unveraenderbare Einloesungs-/Punktejournale und Berichte
- konfigurierbare Referral-Dauer
- Partnerlokal-Finder mit restaurantbezogenen Punkten und Rewards
- Reward-Fotoupload und Premium Public UI
- bestehende RLS-, Rollen- und Tenant-Isolation

Die Integration fuegt keine branchenneutralen V2-Profile, V2-Assistenten,
experimentellen Branchen-Dropdowns oder andere V2-Module hinzu.

## Legal-Paket V0.9

Die Referenz `2026-08-03_WUXUAI_LEGAL_PACKET_V0_9_INTEGRATED.zip` wurde vor der
Uebernahme isoliert mit dem Repository verglichen. Es wurden ausschliesslich
folgende Legal-Artefakte selektiv uebernommen:

- `docs/legal/packet/` mit 13 versionierten Dokumenten
- der Legal-Implementierungsbericht
- Migration `20260803005000_wuxuai_legal_packet_v0_9_templates.sql`

App-Code aus der ZIP wurde nicht kopiert. Zwei abweichende technische
Statusbezeichnungen in TOM und Anwaltspaket wurden auf den verbindlichen Status
`DRAFT_LEGAL_REVIEW_REQUIRED` vereinheitlicht. Alle Texte bleiben Entwurf; kein
Dokument wird als `REVIEWED` oder anwaltlich geprueft ausgewiesen. Die Firmendaten
der geplanten WUXUAI GmbH bleiben Platzhalter.

## Migrationsstatus

Vergleich gegen das verknuepfte Supabase-Staging-Projekt
`wuxuai-bonus-staging` (`bwhv...qaya`):

| Migration | Lokal | Staging | Status |
| --- | --- | --- | --- |
| `20260803003000_remove_receipts_from_v1_points_flow.sql` | Ja | Ja | Synchron |
| `20260803004000_aggregate_partner_local_finder.sql` | Ja | Nein | Offen |
| `20260803005000_wuxuai_legal_packet_v0_9_templates.sql` | Ja | Nein | Offen |

`supabase db push --dry-run --linked` war erfolgreich und plante ausschliesslich
`04000` und `05000` in dieser Reihenfolge ein. In diesem Auftrag wurde keine
Migration angewendet. Es erfolgte insbesondere keine Production-Verbindung und
keine Production-Anwendung.

## Sicherheits- und Dateipruefung

- `.env` und `.env.local` sind lokal vorhanden, werden ignoriert und nicht gestagt.
- Keine ZIP-Datei wird committed; `exports/*.zip` bleibt ignoriert.
- Keine Dateien aus `node_modules`, `dist`, Browserprofilen oder temporaeren Ordnern.
- Hochkonfidenz-Scan auf Supabase-Service-Keys, GitHub-/Cloudflare-/Stripe-Tokens,
  JWTs, private Schluessel und Auth-Geheimnisse: keine Treffer.
- Die Legal-Migration ist additiv und aendert weder RLS noch Grants.

## Qualitaetspruefung

Die finale Pruefkette wurde mit dem vollstaendigen Integrationsstand ausgefuehrt:

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bereits bestehende Warnungen
- Tests: 561/561 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich

## Offene Risiken und naechste Schritte

- Migrationen `20260803004000` und `20260803005000` muessen vor einem zugehoerigen
  Staging-Flow separat geprueft und freigegeben angewendet werden.
- Das Legal-Paket V0.9 bleibt `DRAFT_LEGAL_REVIEW_REQUIRED` und benoetigt vor einer
  Production-Nutzung die vorgesehene juristische Pruefung.
- Der Branch wird in diesem Auftrag nicht gepusht, nicht nach `main` gemerged und
  nicht deployed. Der Push erfolgt anschliessend kontrolliert ueber GitHub Desktop.
