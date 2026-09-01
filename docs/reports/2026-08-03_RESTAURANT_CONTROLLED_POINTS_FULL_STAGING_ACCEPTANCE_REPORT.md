# Vollständige Staging-Acceptance: restaurantgesteuerte Punktevergabe

## Ergebnis

Die verbleibende Acceptance-Matrix wurde ausschließlich gegen
`wuxuai-bonus-staging` ausgeführt. Production, GitHub und Cloudflare wurden
nicht verändert. Die bereits reparierten Bonnummern-, Earn-Idempotenz- und
Browser-DML-Sicherheitsfälle sind live stabil.

Ein neuer reproduzierbarer Blocker verhindert die Staging-Abnahme:

> Wird derselbe Idempotenzschlüssel zuerst für eine erfolgreiche Earn-Buchung
> und danach für deren Storno verwendet, antwortet
> `reverse_restaurant_controlled_points` mit PostgreSQL `23505` am Index
> `points_transactions_restaurant_idempotency_idx` statt mit dem kontrollierten
> Fehler `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.

Die fehlgeschlagene Gegenbuchung wird vollständig zurückgerollt. Die
Originalbuchung bleibt bestehen und die Balance bleibt korrekt. Dennoch darf
kein interner Unique-Constraint als API-Fehler sichtbar werden.

Status: **NOT READY**

## Projektstand

- Projekt: WUXUAI Restaurant Bonus
- Branch: `codex/restaurant-controlled-points-flow`
- Commit: `5173a9d1bf353fc2ed02fcc4cd9280ec04814b60`
- Zielprojekt: `wuxuai-bonus-staging`
- Project Ref maskiert: `bwhv...qaya`
- Region: `eu-west-1`
- Remote-Status: `ACTIVE_HEALTHY`
- Production-Aktion: Nein
- Push/Merge/Deployment: Nein

## Migrationen und Restorepunkt

- Lokale und Remote-Migrationen sind synchron bis
  `20260803001000_harden_points_idempotency_receipts_and_dml.sql`.
- `supabase db push --dry-run --linked`: Remote ist aktuell; keine Migration
  und kein Seed würden angewendet.
- Neue Migration in diesem Acceptance-Lauf: Nein.
- Bestehende Migration verändert: Nein.
- Restorepunkt:
  `~/.wuxuai-backups/staging-20260802-restaurant-controlled-points`
- SHA-256 des vollständigen Custom Dumps:
  `886acf1c670878e5be087903e76d59cfde19ba34e52e129184198e9914f4fc3d`
- Restoregrad: Restoredateien und Prüfsummen verifiziert; physische lokale
  Restore-Ausführung mangels Docker/Podman weiterhin nicht verfügbar.

## Ausgangs- und Endbestand

Die anonymisierten Zähler waren vor dem Lauf und nach jeder Bereinigung gleich:

| Bereich | Anfang | Ende |
| --- | ---: | ---: |
| Restaurants | 3 | 3 |
| Kunden | 0 | 0 |
| Restaurant-Memberships | 3 | 3 |
| Ledger-Zeilen | 0 | 0 |
| Bonnummern-Claims | 0 | 0 |
| Kunden-QR-Referenzen | 0 | 0 |
| Idempotenzdatensätze | 0 | 0 |
| Credit-Attempts | 0 | 0 |
| markierte Testrestaurants | 0 | 0 |
| markierte Testkunden | 0 | 0 |

Es wurden zwei isolierte Tenants mit markierten Testkunden verwendet. Ein
älterer Hilfsharness brach nach seinem ersten Fall ab; seine ausschließlich als
`codex-concurrency-*` markierten Fixtures wurden unmittelbar entfernt und der
Nullstand vor dem Hauptlauf erneut bestätigt. Der Hauptlauf verwendete
`codex-acceptance-*`; auch diese Fixtures wurden vollständig entfernt.

## Parallelitätsmatrix

Echte Parallelität wurde über getrennte PostgreSQL-Verbindungen mit gemeinsamem
Startzeitpunkt erzeugt.

| Fall | Ergebnis | Direkter Datenbanknachweis |
| --- | --- | --- |
| gleicher QR, gleicher Key, identischer Payload | Bestanden | beide Antworten referenzieren dieselbe Transaktion; 1 Earn |
| gleicher QR, verschiedene Keys | Bestanden | 1 Earn; QR nur einmal verbraucht |
| gleiche Bonnummer, verschiedene Kunden | Bestanden | 1 Erfolg, 1 `RECEIPT_ALREADY_USED` |
| gleiche Bonnummer, verschiedene QR | Bestanden | 1 Erfolg, 1 kontrollierter Konflikt |
| Bonnummer mit führenden/nachlaufenden Leerzeichen | Bestanden | kanonisch genau einmal |
| Bonnummer mit anderer Groß-/Kleinschreibung | Bestanden | kanonisch genau einmal |
| gleiche Bonnummer in zwei Restaurants | Bestanden | je Tenant 1 Erfolg |
| zwei QR derselben Membership | Bestanden | zwei unabhängige Earns; keine doppelte Reward-Nebenwirkung |
| Preview parallel zu Confirmation | Bestanden | Preview erzeugt keine Ledger-Zeile; Confirmation genau eine |
| Confirmation parallel zu identischem Retry | Bestanden | durch identischen Parallelfall und gespeichertes Ergebnis abgedeckt |
| zwei parallele erste Earn-Buchungen | Bestanden | Referral genau einmal aktiviert; zwei Boostzeilen insgesamt |
| zwei parallele geboostete Buchungen | Teilweise | aktive 2x-Berechnung und parallele Membership-Buchung separat bestanden; eigener kombinierter Race-Fall nach Blocker nicht mehr fortgesetzt |
| Confirmation parallel zu Storno | Nicht abgeschlossen | nach reproduzierbarem Aktions-Idempotenzblocker gestoppt |

Unkontrollierte 500-artige Fehler wurden in den bestandenen Parallelfällen
nicht beobachtet.

## Idempotenzmatrix

| Fall | Ergebnis |
| --- | --- |
| gleicher Key, identischer Payload | gleiche Transaktion, keine zweite Nebenwirkung |
| gleicher Key, anderer Betrag | `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH` |
| gleicher Key, anderer Kunde/Membership | `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH` |
| gleicher Key, andere Bonnummer | `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH` |
| gleicher Key, andere QR-Referenz | `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH` |
| gleicher Key, andere Source | `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH` |
| gleicher Key in anderem Restaurant | getrennt und erfolgreich |
| Retry nach falscher PIN mit korrigierter PIN | erfolgreich; Key und Bonnummer wurden nicht falsch geclaimt |
| Retry nach unbekanntem Client-Ergebnis | gespeichertes Ergebnis, keine Doppelbuchung |
| gleicher Key für Earn und Reverse | **Fehlgeschlagen: SQLSTATE 23505 statt kontrolliertem Mismatch** |

### Reproduzierbarer neue Fehler

Isolierte Wiederholung:

- erfolgreiche Earn-Buchung mit Idempotenzschlüssel K;
- Storno derselben Transaktion erneut mit K;
- Ergebnis: SQLSTATE `23505`;
- verletzter Index: `points_transactions_restaurant_idempotency_idx`;
- Gegenbuchungen: 0;
- Kundenbalance: unverändert korrekt;
- Fixture danach vollständig entfernt.

Ursache: Der Earn-Pfad besitzt seit der Hardening-Migration eine
aktionsgebundene `points_idempotency_claims`-Prüfung. Der bestehende
`reverse_restaurant_controlled_points`-Pfad prüft diese Claim-Tabelle nicht,
bevor er mit demselben Key in `points_transactions` schreibt.

## Receipt-Claim

- `NULL`, leer und nur Leerzeichen: kein Claim, erfolgreiche getrennte Buchung.
- Trimmen: konsistent.
- Groß-/Kleinschreibung: konsistent über `upper`.
- Unicode und lange Bonnummer: serverseitig angenommen und genau einmal
  geclaimt.
- gleiche Bonnummer nach fehlgeschlagener PIN: wieder nutzbar.
- gleiche Bonnummer nach erfolgreicher Buchung: gesperrt.
- gleiche Bonnummer nach Storno: weiterhin gesperrt.
- gleiche Bonnummer in anderem Restaurant: zulässig.
- Fehlervertrag: `RECEIPT_ALREADY_USED`.

Ein expliziter Maximalwert für Bonnummernlänge ist im aktuellen Serververtrag
nicht definiert. Der Live-Test verwendete 242 Zeichen ohne Fehler. Dies ist kein
neuer Blocker, sollte aber als Datenqualitätsgrenze separat produktseitig
entschieden werden.

## Referral, Boost und Erstbuchung

- kein Boost: Multiplikator 1.
- aktiver 2x-Boost: Basispunkt 1, Endpunkte 2.
- Boost kurz vor Ablauf: aktiv.
- abgelaufener Boost: ignoriert.
- Tenantbindung: durch restaurantbezogene Auswahl bestätigt.
- parallele erste Earn-Buchungen: Referral wechselt genau einmal von
  `pending_registered` nach `activated`.
- genau zwei aktive Boostzeilen für Referrer und geworbenen Gast.
- Preview und falsche PIN qualifizieren nicht.
- Storno reaktiviert den ersten Besuch nicht; durch bestehende Serverlogik und
  fokussierte Tests bestätigt.

## Reward- und Geschenk-Effekte

- gesperrtes Willkommensgeschenk wird nach der ersten erfolgreichen positiven
  Buchung aktiv.
- zwei parallele erste Buchungen erzeugen nur eine aktive Zuweisung.
- Preview und falsche PIN erzeugen keine Freischaltung.
- Betrag unter 100 Cent erzeugt keine Nebenwirkung.
- Retry erzeugt keine zweite Freischaltung.
- Mandantentrennung blieb erhalten.

## Punktevergabe-Modi

- `restaurant_controlled_only`: restaurantgesteuerter Pfad aktiv;
  kundeninitiierter RPC serverseitig blockiert.
- `customer_initiated_only`: bestehender Kundenpfad aktiv;
  restaurantgesteuerter RPC serverseitig blockiert.
- `both`: beide serverseitigen Wege aktiv; öffentliche Modusabfrage liefert
  `both`.
- gleicher Key beim Wechsel der Source: kontrollierter Payload-Mismatch.
- Owner kann eigenen Modus ändern; fremder Owner wird blockiert.
- Modusänderungen sind im Audit vorhanden.
- UI-Sichtbarkeit und bereits geöffneter Browserflow wurden nach dem
  Datenbankblocker nicht als bestanden gewertet.

## Betragsgrenzen

- 0, 1 und 99 Cent: `POINTS_AMOUNT_BELOW_MINIMUM`.
- 100 Cent und reguläre Werte: erfolgreich.
- 80 Prozent des Restaurantlimits: Warnmarker aktiv.
- 1 Cent über Restaurantlimit: `POINTS_AMOUNT_LIMIT_EXCEEDED`.
- Ownerwerte 100, 30.000 und 100.000 Cent: akzeptiert.
- Ownerwerte 99 und 100.001 Cent: serverseitig blockiert.
- fremder Owner: blockiert.
- keine automatische Aufteilung beobachtet.

## Tages-PIN

- gültige PIN: erfolgreich.
- falsche PIN: `DAILY_PIN_REJECTED`.
- derselbe QR bleibt danach mit korrekter PIN nutzbar.
- abgelaufener QR: blockiert.
- PIN erscheint weder im QR noch in Audit-Metadaten.
- Vollständige Rotation-, alte-PIN-, parallele Fehlversuchs- und Rate-Limit-
  Matrix wurde nach dem neuen Blocker nicht zu Ende geführt.

## Storno

- Owner-Storno: Gegenbuchung, kein Delete.
- zweites Storno: `already_reversed = true`, keine zweite Gegenbuchung.
- Originaltransaktion bleibt erhalten.
- Bonnummer bleibt geclaimt.
- QR wird nicht reaktiviert.
- fremder Tenant wird blockiert.
- Earn-Key als Storno-Key: neuer Blocker mit SQLSTATE `23505`.
- Manager-, Kunde-, Staff- und echte parallele Storno-Rollenmatrix wurde nach
  dem Blocker nicht vollständig fortgesetzt.

## RLS und direkter Missbrauch

Live/Katalog bestätigt:

- RLS auf `points_transactions` und `points_idempotency_claims` aktiv.
- `anon` und `authenticated` besitzen kein INSERT auf Ledger, Claims,
  QR-Referenzen oder Attempts.
- interne Award- und Fingerprint-Funktionen sind für Browserrollen nicht
  ausführbar.
- Roh-Token- und Roh-Ersatzcode-Spalten existieren nicht.
- der fremde Owner kann Einstellungen und Storno im Testtenant nicht ausführen.
- kein Service-Role-Schlüssel befindet sich im Browsercode oder offenen Diff.

Die vollständige echte Rollenmatrix mit separatem Staff-, Manager- und
Kundenkonto wurde wegen des Serverblockers nicht als abgeschlossen markiert.

## UI, Browser und physische Geräte

Die Aufgabenreihenfolge verlangt UI-/Browser-Abnahme erst nach bestandenem
Datenbanktest. Da die Datenbankmatrix einen reproduzierbaren Blocker enthält,
wurden folgende Punkte nicht als bestanden markiert:

- Desktop Owner-Einstellung und Staff-Scanner;
- langsames Netzwerk und Doppelklick im Browser;
- physisches iPhone Safari;
- installierte PWA;
- physisches Staff-Tablet und Kamera.

Physische Geräte stehen in dieser Codex-Umgebung nicht zur Verfügung.

Kennzeichnung: **MANUAL DEVICE VERIFICATION REQUIRED**, aber der Gesamtstatus
bleibt wegen des Serverfehlers **NOT READY**.

## Testdatenbereinigung

- Testrestaurants: 0 verbleibend.
- Testkunden: 0 verbleibend.
- Ledger: wieder 0.
- Bonnummern-Claims: wieder 0.
- QR-Referenzen: wieder 0.
- Idempotenzdatensätze: wieder 0.
- Attempts: wieder 0.
- bestehende drei Restaurants und drei Owner-Memberships unverändert.
- keine Tokens, PINs oder PII exportiert.

## Qualität

- Fokussierte Punkteflow-Tests: 90/90 erfolgreich.
- Vollständige Tests: 519/519 erfolgreich.
- Typecheck: erfolgreich.
- Lint: 0 Fehler, 6 bestehende Warnungen.
- Build: erfolgreich.
- `git diff --check`: erfolgreich.
- Secret-Scan: 11 offene Projektdateien geprüft, 0 verdächtige Treffer.
- SQL-Parser: Migration ist remote registriert und wurde von PostgreSQL
  akzeptiert; kein neuer SQL-Parsefehler.
- Remote DB-Lint: 7 bestehende Legacy-Fehler in alten Registrierungs- und
  Reward-Funktionen; kein neuer Lintbefund in den Punkte-Hardening-Funktionen.
- Migration-Dry-Run: Remote aktuell, 0 ausstehende Migrationen.

## Additive Reparaturempfehlung

Keine Migration wurde in diesem Lauf erstellt oder angewendet.

Vor erneuter Acceptance wird eine additive Migration empfohlen, die den
Storno-Pfad in denselben aktionsgebundenen Idempotenzvertrag einbindet:

1. `reverse_restaurant_controlled_points` vor dem Ledger-Insert auf
   `(restaurant_id, idempotency_key)` sperren;
2. Claim mit `action_type = restaurant_controlled_reverse` und Fingerprint aus
   Restaurant, Originaltransaktion, fachlicher Aktion und sicher normalisiertem
   Grund anlegen;
3. identischen Retry mit demselben gespeicherten Ergebnis beantworten;
4. abweichenden Payload oder bereits als Earn gebundenen Key mit
   `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH` beantworten;
5. parallele Stornos weiterhin durch Originalzeilenlock und
   `points_transactions_one_reversal_idx` genau einmal halten;
6. keine bestehenden Migrationen ändern und keine RLS-/Grant-Lockerung
   vornehmen;
7. echten Live-Test für Earn-vs-Reverse-Key, identischen Reverse-Retry,
   abweichenden Reverse-Grund und paralleles Reverse ergänzen.

## Offene Risiken

1. Unkontrollierter SQLSTATE `23505` bei Idempotenzschlüssel-Wiederverwendung
   über Earn und Reverse.
2. Confirmation-vs-Storno und vollständige parallele Reverse-Matrix offen.
3. vollständige Tages-PIN-Rotation/Rate-Limit-Matrix offen.
4. vollständige echte Rollenmatrix Staff/Manager/Kunde offen.
5. physisches iPhone Safari, installierte PWA und Staff-Tablet offen.
6. sieben bekannte Legacy-DB-Lintfehler außerhalb dieses Punkte-Hardening-
   Scopes bleiben bestehen.

## Schlussstatus

- Neue Fehler: 1 reproduzierbarer Serververtragfehler.
- Additive Reparaturmigration erstellt: Nein.
- Testdatenbereinigung: vollständig.
- Production verändert: Nein.
- Push/Merge/Deployment: Nein.
- Finaler Status: **NOT READY**
