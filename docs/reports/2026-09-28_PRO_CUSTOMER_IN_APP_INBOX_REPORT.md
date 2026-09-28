# PRO Customer In-App-Inbox – Implementierung und Staging-Gate

Stand: 28.09.2026, Europe/Vienna

## Ergebnis

Der technische Pfad fuer zwei PRO-In-App-Ereignisse ist implementiert,
lokal vollstaendig geprueft, committed, gepusht und auf Staging ausgerollt:

- neues veroeffentlichtes Angebot;
- erstmals erreichte Punktebelohnungsschwelle.

Reale Sichtbarkeit bleibt fail-closed. Auf Staging existiert aktuell kein
aktiver synthetischer TEST_ONLY-PRO-Kontext mit aktivem Testkunden. Deshalb
wurde kein Grant erfunden und kein positiver Customer-Browser-PASS behauptet.

## Source und Deployment

- Branch: `codex/v1-release-integration`
- Implementierungscommit:
  `4e2b0909147f84d26c239bd8c4901246e945f4c5`
- Remote-Paritaet nach Push: `0/0`
- Migration:
  `20260928005000_pro_customer_in_app_inbox.sql`
- Migration-SHA-256:
  `dd3ee04ac2767ee15a6e964a2cb0508571ffe7059ff9c4b5db7960e825c027ed`
- Migrationen 001–185: durch den Commit nicht veraendert
- Staging-Projekt: `wuxuai-bonus-staging`, eindeutig verifiziert
- Staging-Migrationen: `186/186`
- Repeat-Dry-Run: leer
- Aktiver Staging-Worker:
  `wuxuai-restaurant-bonus-app-staging`
- Aktive Worker-Version:
  `44c1eee5-6b5a-4736-ba19-55c677c4c0de`
- Aktives Hauptasset: `/assets/index-BQ1tSiSz.js`
- Lokaler und ausgelieferter Asset-SHA-256:
  `3879526fa8a52d199d4af7ad41cdc42714916dd72994ee5236ca721fc86b44ee`
- Edge Functions: unveraendert; fuer diesen Umfang war kein Edge-Deployment
  erforderlich
- Production und Stripe LIVE: unveraendert

## Daten- und Sicherheitsvertrag

Die private Tabelle besitzt RLS und keine direkten Rechte fuer `anon` oder
`authenticated`. Lesen und `read_at`-Aenderung laufen nur ueber enge RPCs.
Die Identitaetspruefung verlangt gleichzeitig:

1. gueltige Supabase-Authentifizierung;
2. passenden restaurantgebundenen Customer-Token;
3. Zuordnung desselben Auth-Users zum aufgeloesten Customer;
4. denselben Restaurant-/Tenant-Kontext;
5. aktuelle ereignisspezifische PRO-Berechtigung;
6. derzeit zusaetzlich STAGING, exakten TEST_ONLY-Marker und synthetischen
   Testkunden.

Die fachliche Eindeutigkeit liegt auf Restaurant, Customer, Ereignistyp und
Ereignisschluessel. Bei Angeboten ist der Schluessel
`offer_id:publication_version`, bei der erstmals erreichten
Belohnungsschwelle die Reward-ID. Gelesen/ungelesen und Zaehler werden aus
derselben materialisierten sichtbaren Menge ermittelt. Ein Downgrade blendet
vorhandene PRO-Eintraege sofort aus, ohne historische Eintraege pauschal zu
loeschen.

Die Notification-Trigger sind nicht autoritativ fuer Businesszustand und
duerfen die ausloesende Angebots- oder Punktebuchung bei einem technischen
Inboxfehler nicht zurueckrollen. Sie erzeugen keine Punkte, Rewards, Angebote,
Aktivierungen, Entitlements, E-Mails, Push-Nachrichten oder Scheduler-Aktionen.

## Lokale Nachweise

- Fokussierte Customer-/i18n-/Security-Tests: 77/77 PASS
- Abschliessende enge Inbox-/Drawer-Regression: 12/12 PASS
- SQL-Rollen-/Tenant-/Downgrade-Vertrag: PASS
- 24 parallele identische Ereignisse: 24/24 Aufrufe PASS, exakt eine Zeile
- Fresh Replay: 186/186 PASS
- Upgrade 185→186: ausschliesslich Migration 186 PASS
- Repeat-Dry-Run: leer
- DB-Lint: keine neue Warnung aus Migration 186; bekannte Altwarnungen bleiben
- Full Suite: 2111/2111 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler und 8 bekannte Warnungen
- Build: PASS, 2.159 Module
- Secret Scan: PASS
- Diff Checks: PASS

Der erste Full-Suite-Lauf in der eingeschraenkten Sandbox hatte drei
`127.0.0.1`-Bindefehler sowie den durch den neuen Drawer erwarteten
Inventarzaehler. Nach der engen Testanpassung bestand derselbe Source-Stand
ausserhalb der Portsandbox 2111/2111.

## Staging-Nachweise

| Gate | Ergebnis | Nachweis |
| --- | --- | --- |
| Projekt und Migration | PASS | verifiziertes Staging, 186/186 |
| Repeat-Dry-Run | PASS | keine ausstehende Migration |
| DB-Lint | PASS mit Altwarnungen | keine neue 186-Warnung |
| Tabellen-ACL | PASS | kein SELECT/INSERT/UPDATE fuer Browserrollen |
| Anonymer Fake-Zugriff | PASS | fail-closed vor Datenausgabe |
| Inbox-Bestand nach Migration | PASS | 0 Zeilen |
| App-/Asset-Paritaet | PASS | Worker-Version und Asset-Hash oben |
| Unauthentifizierter Web-Smoke | PASS | HTTPS-App sichtbar |
| Synthetischer PRO-Positivflow im Customer-Browser | OPEN | 0 geeignete aktive TEST_ONLY-PRO-Kontexte |
| BASIC/Downgrade physisch auf Staging | OPEN | ohne geeigneten Kontext keine kontrollierte Zustandsfolge |

Vor der Migration wurde ein fluechtiger, nicht gespeicherter Gesamtfingerprint
der Public-Daten erstellt. Zwei Versuche des identischen Nachher-Dumps
blockierten und wurden als read-only Prozesse kontrolliert abgebrochen.
Deshalb wird keine bytegleiche Gesamtfingerprint-Paritaet behauptet.
Nachweisbar sind: Migration 186 enthaelt keine Bestandsdatenmutation, die neue
Inbox blieb leer, und es wurden keine synthetischen Events oder
Businessaktionen auf Staging ausgefuehrt.

## Rollen- und Ereignismatrix

| Fall | Lokal | Staging |
| --- | --- | --- |
| Authentifizierter eigener Customer | PASS | positiver Browserflow OPEN |
| Owner/Staff mit Customer-Token | blockiert | ACL/RPC-Vertrag deployed |
| anderer Customer/Tenant | blockiert | ACL/RPC-Vertrag deployed |
| Anonymous | blockiert | negativer Fake-Aufruf PASS |
| BASIC oder PRO-Downgrade | Eintraege unsichtbar, neue Erzeugung blockiert | physische Zustandsfolge OPEN |
| Angebot doppelt/retry | exakt ein Eintrag je Publikationsversion | technischer Vertrag deployed |
| Reward doppelt/24-fach | exakt ein Eintrag je erster Reward-Schwelle | technischer Vertrag deployed |

## Offene fachliche Entscheidungen

Vor einer realen Aktivierung muessen mindestens verbindlich entschieden und
versioniert werden:

- ob und unter welcher Rechtsgrundlage ein Angebots-Inboxeintrag als Werbung
  zulaessig ist;
- ob dafuer eine ausdrueckliche Einwilligung erforderlich ist und wie
  Widerruf sowie Wirkung auf bestehende Eintraege funktionieren;
- rechtliche Einordnung der rein fachlichen
  `Belohnung erreicht`-Benachrichtigung;
- Aufbewahrungsdauer, Loesch-/Anonymisierungsregel und Auskunft/Export;
- endgueltiger Produktvertrag fuer leere Inbox, Downgrade und
  Restaurantbeendigung.

## Unveraendert

- BASIC Final Code Lock
- PRO Commercial/Country Release Lock
- Customer-Mail-Scheduler deaktiviert
- kein E-Mail- oder Push-Versand
- keine Production-Aenderung
- kein Stripe-Zugriff
- keine realen Customer- oder Businesswrites

## Status

`PRO CUSTOMER IN-APP INBOX STAGING TECHNICAL NEGATIVE LOCK /`
`POSITIVE SYNTHETIC CUSTOMER BROWSER GATE OPEN /`
`REAL CONSENT AND RETENTION CONTRACT OPEN /`
`NOT READY FOR REAL CUSTOMERS OR PRODUCTION`
