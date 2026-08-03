# Staging-Abnahme: restaurantgesteuerte Punktevergabe

## Ergebnis

Die Abnahme wurde ausschliesslich gegen `wuxuai-bonus-staging` ausgefuehrt.
Production, GitHub und Cloudflare wurden nicht veraendert. Drei reproduzierbare
Blocker verhindern die Freigabe:

1. Zwei parallele Buchungen mit derselben Bonnummer koennen fuer verschiedene
   Kunden im selben Restaurant beide erfolgreich sein.
2. Ein bereits verwendeter Idempotenzschluessel ist nicht an Betrag, Bonnummer,
   Kunden-QR und Kunde gebunden. Ein veraenderter Request erhaelt den alten
   Erfolg statt einer Ablehnung.
3. Ein authentifizierter Owner kann `points_transactions` direkt beschreiben,
   wenn `collection_source` leer bleibt. Dadurch lassen sich zentrale Engine,
   Betragspruefung und der vorgesehene Auditpfad umgehen.

Die Testfixtures wurden vollstaendig entfernt. Es wurde keine weitere Migration
erstellt oder angewendet.

Status: **ROLLBACK OR REPAIR REQUIRED**

## Projektstand

- Projekt: WUXUAI Restaurant Bonus
- Branch: `codex/restaurant-controlled-points-flow`
- Commit: `5173a9d1bf353fc2ed02fcc4cd9280ec04814b60`
- Ziel: `wuxuai-bonus-staging`
- Project Ref maskiert: `bwhv...qaya`
- Lokale und Remote-Migrationen: synchron bis einschliesslich
  `20260802002000_mark_minimum_validator_stable.sql`
- Neue Migration in diesem Lauf: Nein
- Production-Aktion: Nein

## Restorepunkt

Der vorhandene logische Restorepunkt blieb unveraendert:

`~/.wuxuai-backups/staging-20260802-restaurant-controlled-points`

SHA-256 des vollstaendigen Custom Dumps:

`886acf1c670878e5be087903e76d59cfde19ba34e52e129184198e9914f4fc3d`

Restoregrad:

`RESTORE FILES VERIFIED, FULL RESTORE EXECUTION NOT AVAILABLE`

## Ausgangs- und Endbestand

Der anonymisierte Bestand war vor dem Lauf und nach der Bereinigung identisch:

| Bereich | Anzahl |
| --- | ---: |
| Restaurants | 3 |
| Branches | 3 |
| Restaurant-Memberships | 3 |
| Loyalty Settings | 3 |
| Kunden | 0 |
| Punktetransaktionen | 0 |
| Punkte-Nettosumme | 0 |
| Kunden-QR-Referenzen | 0 |
| Credit-Attempts | 0 |

Verbliebene Testsession- oder Fixture-Daten: 0.

## Echte Parallelitaet

Die Requests wurden ueber getrennte Datenbankverbindungen auf einen gemeinsamen
Startzeitpunkt synchronisiert. QR-Rohwerte und Tages-PINs blieben ausschliesslich
in temporaeren Prozessen und wurden nicht ausgegeben.

| Test | Ergebnis | Datenbankzustand |
| --- | --- | --- |
| A: gleicher QR, gleicher Key, gleiche Bonnummer | Bestanden | 1 Earn, Balance +1, 1 QR verbraucht, 1 Completed-Attempt; zwei Antworten, davon eine idempotent |
| B: gleicher QR, verschiedene Keys | Bestanden | 1 Earn, Balance +1, 1 QR verbraucht, 1 Completed-Attempt |
| C: gleiche Bonnummer, verschiedene QR/Kunden/Keys | Fehlgeschlagen | 2 Earns, Balance gesamt +2, 2 QR verbraucht, 2 Completed-Attempts |
| D: zwei QR derselben Membership | Teilweise gemessen | Zwei serialisierte Earns wurden im Fixture-Bestand sichtbar; der detaillierte Harness-Response wurde vor der Normalisierung abgebrochen |
| E: Preview parallel zu Confirmation | Nicht ausgefuehrt | Nach kritischem Blocker gestoppt |
| F: Confirmation parallel zu Storno/Retry | Nicht ausgefuehrt | Nach kritischem Blocker gestoppt |

### Ursache Bonnummern-Race

`confirm_restaurant_controlled_points` prueft die Bonnummer mit einer
`exists`-Abfrage. Es gibt weder einen Bonnummern-Eindeutigkeitsindex noch einen
restaurant- und bonnummerbezogenen Advisory Lock. Zwei Transaktionen fuer
verschiedene Kunden koennen die Vorabpruefung gleichzeitig passieren.

## Idempotenzmatrix

| Fall | Ergebnis |
| --- | --- |
| Gleicher QR, Key, Betrag und Bon gleichzeitig | Bestanden; genau eine Buchung |
| Gleicher Key mit veraendertem Betrag | Fehlgeschlagen; alter Erfolg mit altem Betrag wurde zurueckgegeben |
| Gleicher Key mit anderem Kunden | Fehlgeschlagen; Transaktion des ersten Kunden wurde als idempotenter Erfolg zurueckgegeben |
| Gleicher Key in anderem Restaurant | Bestanden; getrennte Transaktionen pro Restaurant |
| Doppelklick | Bestanden fuer identisches Payload durch Paralleltest A |
| Neue ID mit bereits verbrauchtem QR | Nicht erneut isoliert ausgefuehrt |
| Retry nach Netzwerkabbruch | Nicht physisch simuliert |
| Timeout direkt nach Commit | Durch identischen parallelen Retry nur teilweise abgedeckt |

### Ursache fehlende Payload-Bindung

Die Funktion sucht zu Beginn nur nach
`(restaurant_id, idempotency_key)` und gibt die gefundene Transaktion sofort
zurueck. Vor dieser Rueckgabe werden QR, Kunde, Betrag und Bonnummer nicht gegen
den gespeicherten Request verglichen.

## Direkter Tabellenmissbrauch

Katalogbefund:

- RLS auf `points_transactions`: aktiv
- `authenticated` besitzt Tabellenrechte fuer INSERT/UPDATE/DELETE
- Policy `points transactions admin insert` erlaubt Restaurant-Admins INSERT
- interner Idempotenzindex: vorhanden
- Bonnummern-Eindeutigkeitsindex: nicht vorhanden

Live-Probe in einer vollstaendig zurueckgerollten Transaktion:

- Authentifizierter Owner konnte eine Earn-Zeile mit frei gewaehlten 999.999
  Punkten einfuegen.
- `collection_source` war `null`.
- Die serverseitige Punkte-Engine wurde nicht verwendet.
- Der Mindestbetrags-Trigger griff nicht, weil er nur die Quellen
  `customer_initiated` und `restaurant_controlled` prueft.
- Die Probe wurde per `ROLLBACK` vollstaendig verworfen.

Damit ist die Erwartung "keine direkten Browser-DML-Rechte auf sensible
Tabellen" nicht erfuellt.

## RLS, Grants und Funktionen

- `customer_points_qr_references`: RLS aktiv, keine direkten Rechte fuer anon
  oder authenticated.
- `restaurant_points_credit_attempts`: RLS aktiv, keine direkten Rechte fuer
  anon oder authenticated.
- Interne Engine-, Effekt- und Validatorfunktionen: kein EXECUTE fuer
  Browserrollen.
- Preview, Confirmation, Settings und Reversal: nur fuer die vorgesehenen
  authentifizierten Rollen aufrufbar; Rollen- und Tenantpruefung bleibt im RPC.
- Alle geprueften Security-Definer-Funktionen besitzen einen festen
  `search_path`.
- `points_transactions`: kritische direkte Owner-Insert-Luecke wie oben.

## Noch nicht freigabefaehig getestet

Nach den drei kritischen Befunden wurden keine weiteren dauerhaften
Staging-Fixtures aufgebaut. Deshalb sind folgende Abnahmebereiche offen und
duerfen nicht als bestanden gelten:

- vollstaendige Referral-Boost-Matrix
- parallele Erstbuchungsqualifizierung
- Geschenk- und Reward-Nebenwirkungen unter Parallelitaet
- vollstaendiger Vergleich aller drei Punkte-Modi und Moduswechsel
- komplette Maximalbetrags- und Warnschwellenmatrix
- Tages-PIN-Rotation, parallele Fehlversuche und Rate Limit
- parallele Gegenbuchung und Storno gegen laufende Confirmation
- Rollenmatrix Staff, Manager, Kunde und fremder Owner als echte Live-Requests
- physisches iPhone Safari
- installierte PWA
- Staff-Tablet/Kamera

Physischer Status: **MANUAL DEVICE VERIFICATION REQUIRED**.

## Additive Reparaturempfehlung

Keine Reparatur wurde in diesem Lauf implementiert. Vor Fortsetzung der
Abnahme wird eine additive Migration empfohlen, die mindestens:

1. den Idempotenz-Retry erst nach sicherer QR-Aufloesung beantwortet und QR,
   Kunde, Betrag, normalisierte Bonnummer und Quelle mit der gespeicherten
   Transaktion vergleicht;
2. bei Abweichung einen stabilen Fehler wie
   `IDEMPOTENCY_PAYLOAD_MISMATCH` liefert;
3. die Bonnummernpruefung mit einem restaurant- und bonnummerbezogenen
   Transaktions-Lock atomar macht, ohne historische Werte zu erfinden;
4. direkte INSERT-, UPDATE- und DELETE-Rechte auf `points_transactions` fuer
   `anon` und `authenticated` entzieht und die Admin-Insert-Policy entfernt;
5. neue Earn-Transaktionen serverseitig auf eine erlaubte, nicht leere Quelle
   begrenzt, ohne Legacy-Zeilen umzuschreiben;
6. echte Datenbank-Paralleltests fuer Bonnummer, Payload-Bindung und direkten
   DML-Missbrauch ergaenzt.

Nach dieser Reparatur ist die gesamte in diesem Auftrag beschriebene Matrix neu
auszufuehren.

## Qualitaet

- Fokussierte Punkteflow-Tests: 46/46 erfolgreich
- Vollstaendige Tests: 470/470 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Secret-Scan der geaenderten/geprueften Projektdateien: 0 Treffer
- Datenbank-Lint: bestehende Legacy-Befunde; 7 Fehler in alten Funktionen sowie
  bestehende Warnungen, kein neuer Validator-Befund

Die gruenen statischen Tests widerlegen die Live-Befunde nicht. Insbesondere
decken die bisherigen Strukturtests weder das Bonnummern-Race noch die
Idempotenz-Payload-Bindung oder den direkten nullable-source-Insert ab.

## Schlussstatus

- Mindestbetragsreparatur: verifiziert
- Staging-Abnahme des Gesamtflows: fehlgeschlagen
- Testdatenbereinigung: vollstaendig
- Neue Reparaturmigration: Nein
- Push/Merge/Deployment: Nein
- Status: **ROLLBACK OR REPAIR REQUIRED**
