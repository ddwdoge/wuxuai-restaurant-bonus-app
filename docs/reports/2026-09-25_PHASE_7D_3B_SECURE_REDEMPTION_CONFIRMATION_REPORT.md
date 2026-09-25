# Phase 7D.3B – Secure Redemption Confirmation, lokaler Prüfstand

Stand: 2026-09-25. Branch `codex/v1-7d-redemption-confirmation`, Parent
`475b8210870935486d36cb22196811082f56cb1a`. Kein Commit, Push,
Staging-, Stripe- oder Production-Zugriff. Die vorbestehende ungetrackte
7D.3A-Inventur blieb unangetastet.

## Ursache und Vertrag

Der ältere 15-Minuten-Präsentationsflow konnte über den direkt erreichbaren
Self-Swipe ohne Mitarbeiter- oder PIN-Nachweis finalisieren. Migration 171
legt deshalb einen separaten sechsstelligen, mit `pgcrypto` gesalzen
gehashten und lokal tagesgebundenen Redemption-PIN-Vertrag an. Sie erhält
historische Receipts und Migrationen 001–170. Die vierstellige Tages-PIN zum
Punktesammeln wird nicht wiederverwendet.

Kunden starten einen serverzeitgebundenen Antrag für eine Punkteprämie oder
ein Welcome-/Birthday-Geschenk. Entweder bestätigt Staff/Owner im eigenen
Restaurant und Branch direkt, oder ein Mitarbeiter gibt die separate PIN auf
dem Kundengerät ein und der Kunde swipt nach `PIN_VERIFIED`. Beide Wege nutzen
dieselbe atomare Finalisierung; PIN-Prüfung allein löst nichts ein. Die
gültigen Zustände sind REQUESTED, PIN_VERIFIED, REDEEMED, REJECTED, CANCELLED
und EXPIRED. Legacy-Self-Swipe liefert `REDEMPTION_CONFIRMATION_REQUIRED`.

Alle Mutationen laufen ausschließlich über die neue Edge-Funktion
`redemption-confirmation`: verifizierter Auth-Principal, serverseitige
Rollen-/Tenant-/Branch-Prüfung, exakte Payload-Struktur, kein Client-Actor
und keine vertrauenswürdige Client-IP. Browserrollen haben kein EXECUTE auf
den neuen Mutator oder Finalisierer. Das bestehende Pending-Activation-Gate
wird vor Antragsstart und vor Finalisierung erneut geprüft. Read-RPCs für
eigenen Status und eigene Staff-/Owner-Warteschlange sind getrennt.

Serverseitig gelten fünf falsche PIN-Versuche je Antrag, 20 PIN-Versuche je
Customer-Principal/Restaurant/Branch/Stunde, fünf Anträge je Kunde/Restaurant
pro Stunde, ein aktiver Antrag je Anspruch, 60 Sekunden Cooldown nach
terminalem Fehlschlag und exakt 15 Minuten ursprüngliche Gültigkeit. Keine
PIN, JWT, Service-Credential oder Roh-IP wird in Request-/Auditdaten gespeichert.

## Geänderte Dateien

- Neu: `supabase/migrations/20260924006000_secure_redemption_confirmation.sql`
  (SHA-256 `f125e43fbd8b9f8041a354ababdd7808f10d8a34d64a011605f3960ecefe52d8`).
- Neu: `supabase/functions/redemption-confirmation/index.ts` und
  `supabase/functions/_shared/redemptionEdgeContract.mjs`.
- Neu: `src/modules/rewards/secureRedemptionService.ts`,
  `src/modules/rewards/secureRedemptionMessages.ts`,
  `src/modules/staff/SecureRedemptionQueue.tsx`.
- Angepasst: Customer-Portal, Staff-Tablet und ausschließlich die Geometrie
  der neuen Queue-Bildfläche in `staff-premium.css`.
- Neu: fokussierte Edge-, lokale SQL-, Parallelitäts-, HTTP- und
  Build-Testhelfer; bestehende statische UI-Tests auf den neuen sicheren
  Aufruf aktualisiert.
- Aktuelle lokale Vertragsnotizen in Flow 03, Canonical Product Contract und
  Implementation Status ergänzt. Keine historische Migration umgeschrieben.

Nicht geändert: Bildrenderer-/Crop-Berechnung, Punkte-Sammel-PIN,
Billing/Capacity/KYB-Verträge, Stripe, Staging, Production oder reale Daten.

## Lokale Evidenz

| Gate | Ergebnis |
| --- | --- |
| Fresh Replay | 171/171 PASS |
| Upgrade | 170→171 PASS |
| Repeat | Lauf 1 und 2 ohne ausstehende Migration |
| Migrationen 001–170 | kein Dateidiff |
| DB-Lint | Exit 0; 21 Warnungen in älteren Funktionen, keine neue Redemption-Funktion betroffen |
| Synthetische SQL-Matrix | PASS; rollback-geschützt, inkl. Punkte, Welcome, Birthday, Rollen, Queue/Status-Tenantgrenze, PIN-Grenzen, Pending-Gate, Legacy-Fail-Closed, Direct-DML/ACL, Audit-Immutabilität |
| Parallelität | 24 Staff, 24 PIN-Swipes und 24 gemischt: jeweils genau eine Einlösung; 24 falsche PIN-Versuche: genau fünf gezählt |
| Lokaler Edge-HTTP-Test | Anonym 401, fremde Origin 403, gefälschter Actor 400, Staff-Start 409, Customer-Start/Replay 200, Staff-Finalisierung 200, genau ein Event |
| Full Tests | 1.982/1.982 PASS mit lokalem Loopback-Socket-Zugriff |
| Typecheck | PASS |
| Lint | PASS, 0 Fehler, 8 vorbestehende Warnungen |
| Build | PASS mit ausschließlich lokalem Supabase-URL/Anon-Buildkontext; kein Deployment |
| Diff/Secret Scan | `git diff --check` und `git diff --cached --check` PASS; keine Hochrisiko-Credential-Signatur in den Task-Dateien |

Die lokalen HTTP-Tests nutzten ausschließlich synthetische Auth-Identitäten
und lokal erzeugte kurzlebige Zugangswerte im Prozessspeicher. Die Testdaten
wurden durch Reset verworfen; danach wurden nur die exakt task-eigenen
Supabase-Container und drei task-eigenen Volumes gestoppt/entfernt.

## Phase 7D.3B1 – CORS- und physischer Browser-Reststand

Die Founder-Entscheidung akzeptiert den lokalen Kong-/Gateway-Preflight mit
HTTP 200 und `Access-Control-Allow-Origin: *` als Infrastrukturverhalten,
**nicht** als engen Gateway-CORS-PASS. Die Function prüft jeden mutierenden
POST vor Authentifizierung, Payload-Prüfung und DB-Zugriff gegen die exakte
lokale Origin-Allowlist. Fremder, fehlender und `null`-Origin liefern 403
`REDEMPTION_ORIGIN_BLOCKED`. Ein OPTIONS-Request ohne Origin erreicht die
Function und liefert 403; mit erlaubtem, fremdem oder `null`-Origin antwortet
Kong 200/`*`. OPTIONS gab keine Auth-, PIN-, Tenant- oder Businessdaten preis.
Gefälschte `X-Forwarded-For`-/`Forwarded`-/`Client-IP`-Header ändern die
Ablehnung nicht. 24 parallele fremde-Origin-POSTs lieferten alle 403;
Request-/PIN-Attempt-/Redemption-Event-Zahlen und Kundenpunktesumme waren
vorher/nachher identisch. **Gateway CORS permissive / Application Origin Guard
fail-closed: PASS für die lokale Negativmatrix.** Die Test-Auth-Fixture erzeugte
separat ausschließlich synthetische lokale Benutzer und Membership-Bindungen;
diese Setup-Writes sind keine CORS- oder Businesswirkung.

Der lokale Playwright-Lauf erreichte in Chromium und WebKit die Staff-/Owner-
Queue-Routen und prüfte 3 Rollen × 7 Sprachen × 8 Breiten × 2 Engines =
336 Routen-/Overflow-Prüfungen. Für sichtbare Queue-Medienflächen wurde 16:9
und für aktive Queue-Buttons mindestens 44 CSS-px geprüft. Nach
sprach-/breitenbedingten Page-Reloads blieb der geprüfte Business-Snapshot
(Anträge, Redemption-Events, Punkte) unverändert. WebKit brach beim Reload
laufende Fetches ab; die beruhigte Seite zeigte keine Runtime-Fehler und
kontaktierte keinen externen Host. Keine Produktdatei wurde für 7D.3B1
geändert; fokussierter CORS- und Browser-Test sowie dieser Bericht wurden
ergänzt. Die bisherigen 1.982/1.982 Full Tests, Typecheck, Lint, Build und
171-Fresh-/Upgrade-/Repeat-Gates gelten nur für den bytegleichen Produktcode.

**Noch offen:** Die Browserprobe hat die Customer-Präsentation und die
interaktiven Wege nicht vollständig durchgespielt: Start, PIN-Fehlversuche,
PIN→Swipe, Cancel/Ablauf/Polling, Staff-/Owner-Bestätigung/Ablehnung,
PIN-Rotation mit einmaliger Sichtbarkeit, Drawer-Abbruch via Cancel/X/Escape,
Layout-Shift und Tenant-Grenze sind zwar technisch/SQL-seitig geprüft, aber
nicht als vollständige physische Browsermatrix nachgewiesen. Der 336er-Lauf
beweist Route, Sprache, Breite, Overflow und die genannten Queue-Geometrien;
er darf nicht als End-to-End-Flow-PASS ausgegeben werden. Für Page View wurde
der Business-Snapshot verglichen; ein vollständiger Audit-/Write-Snapshot
für alle UI-Abbruchaktionen fehlt. Kein Staging-Test ist freigegeben.

**Status: NOT READY für LOCAL CODE LOCK.** Exaktes Restgate: vollständige
physische Customer-/Staff-/Owner-Interaktionsmatrix auf frischen isolierten
synthetischen Fixtures einschließlich Audit-/Write-Fingerprints. Kein Commit,
Push, Migration oder Deployment ausgeführt.

Cleanup 7D.3B1: ein task-eigener Supabase-Stack und ein Edge-Serve-Prozess
gestartet und kontrolliert gestoppt; die Browserläufe beendeten ihre
task-eigenen Vite-Prozesse. Task-eigene Container/Volumes und verbleibende
Vite-/Edge-Prozesse: 0. Temporäre lokale Function-Konfiguration entfernt.
Fremde Prozesse, Container und Volumes nicht verändert. Die lokale Supabase-
CLI gab beim ersten Start ihre *lokalen Standard-Testschlüssel* in der
Werkzeugausgabe aus. Keine Staging-/Production-Zugangsdaten waren betroffen;
diese Werte wurden nicht in Source, Report oder ZIP aufgenommen. Der lokale
Stack wurde mit `--no-backup` verworfen. Dieser Ausgabepfad muss vor einem
erneuten lokalen Start unterdrückt oder redigiert werden.

## Phase 7D.3B2 – physischer Interaktions-Resttest: Stopgate

Der Produktstand und Migration 171 blieben bytegleich. Für einen frischen
lokalen Test wurde genau eine synthetische Restaurant-/Customer-/Staff-/Owner-
Fixture vorbereitet. Der anfänglich fehlende `loyalty_settings`-Datensatz
gehörte zur synthetischen Fixture, nicht zum Produktcode; nach seiner
task-lokalen Ergänzung erreichte Chromium bei 390 px das Customer-Portal mit
sichtbarer synthetischer Punkteprämie und einem Einlöse-Button. Es wurde
**keine Einlöseaktion ausgelöst**. Auf Texte, PINs, JWTs oder Customer-Inhalte
wurde für die Diagnose nicht geloggt. Ein abgelehnter Versuch, UI-Textauszüge
zu protokollieren, wurde nicht umgangen.

Danach wurde ein eindeutiger Produkt-Blocker für die verlangte
DE/EN/FR/IT/ES/ZH/KO-Matrix festgestellt: Der bei `PIN_VERIFIED` eingebettete
`SwipeToRedeem` enthält ein fest deutsches ARIA-Label, die sichtbare
Swipe-Beschriftung, den Pending-Text und den Hilfetext. Die Customer-Seite
übergibt keine lokalisierten Texte an diese Komponente. Deshalb würden
mindestens EN/FR/IT/ES/ZH/KO im neuen sicheren Einlöseflow deutsche Texte
zeigen. Belege: `src/modules/customer/components/SwipeToRedeem.tsx` Zeilen
99, 115 und 121 sowie `src/modules/customer/CustomerPortal.tsx` Zeilen
2534–2536. Die sieben Sprachen des übrigen sicheren Status-/PIN-Vertrags
stehen bereits in `secureRedemptionMessages.ts`; Swipe-Texte fehlen dort.

**Engster nötiger Produkt-Diff, nicht ausgeführt:** Swipe-Beschriftung,
Pending-Text, ARIA-Label und Hilfetext als explizite Props oder
gleichwertige i18n-Bindung in `SwipeToRedeem` bereitstellen, sieben Texte
in `secureRedemptionMessages.ts` ergänzen und am sicheren Customer-Aufruf
übergeben. Dazu fokussierte Sprach-/Accessibility-Tests. Keine State-Machine-,
PIN-, SQL-, Rate-Limit-, Rollen-, Tenant- oder Gateway-Änderung erforderlich.

Die Founder-Stopregel für erforderlichen Produktcode wurde befolgt. Daher
wurden Customer-Start/PIN/Swipe, Staff-/Owner-Bestätigung, Ablauf/Abbruch,
24-fach-Browser-Parallelität und die vollständige physische 336er-
Interaktionsmatrix **nicht** als PASS behauptet. Die 7D.3B1-Routenmatrix
bleibt ein separater, begrenzter Nachweis. Es gab ausschließlich erwartete
lokale Fixture-Writes; kein echter Betrieb, keine echte Einlösung und keine
Staging-/Production-Aktion. Die lokalen Testdaten, drei geschützten
temporären CLI-Logs und die task-eigene Runtime wurden ohne Backup entfernt.
Kein Log- oder Testschlüssel wurde in Bericht/ZIP/Git übernommen. Task-eigene
Edge-, Vite-, Container- und Volume-Reste: 0; fremde Prozesse/Container
unverändert.

**Status 7D.3B2: NOT READY.** Offen ist zunächst die ausdrückliche Freigabe
des engen Swipe-i18n-Produkt-Diffs; erst danach kann die vollständige
physische Interaktionsmatrix erneut auf frischen lokalen Fixtures laufen.

## Phase 7D.3B2A – Swipe-i18n-Fix und fortgesetzter lokaler Resttest

Der freigegebene Produkt-Diff betrifft ausschließlich drei sichtbare
Swipe-Texte: `SwipeToRedeem` erhält verpflichtende typisierte Props für
ARIA-Label, Swipe-Beschriftung und Hilfetext. `CustomerPortal` bindet sie an
`secureRedemptionMessages` (DE/EN/FR/IT/ES/ZH/KO). Der bereits lokalisierte
Pending-Text bleibt erhalten. Swipe-Mechanik, PIN, Polling, State Machine,
Edge und SQL blieben unangetastet. Migration 171 bleibt SHA-256
`f125e43fbd8b9f8041a354ababdd7808f10d8a34d64a011605f3960ecefe52d8`.

Fokussierte Tests 21/21, Full Suite 1.991/1.991, Typecheck, Lint (0 Fehler,
8 vorbestehende Warnungen) und lokaler Build bestanden. Die erste Full Suite
scheiterte ausschließlich an `listen EPERM` für drei lokale HTTP-Tests im
Sandbox-Profil; der freigegebene Loopback-Lauf bestand vollständig. Secret-
Scan und beide Diff-Checks ohne neuen Befund. Keine historische Migration
geändert.

Physisch auf ausschließlich synthetischer lokaler Supabase-Fixture geprüft:

- 336 Route-/Overflow-Kombinationen aus Chromium/WebKit, drei Rollen, sieben
  Sprachen und acht Breiten bestanden.
- Customer-Start erreichte `REQUESTED`; ein falscher PIN erhöhte den
  Fehlzähler; ein gültiger PIN erreichte `PIN_VERIFIED` ohne Einlösung.
- 112 echte PIN-verifizierte Swipe-Ansichten (zwei Browser × sieben Sprachen ×
  acht Breiten) zeigten lokalisiertes ARIA-Label und sichtbare Beschriftung,
  mindestens 44 CSS-px Trackhöhe und keinen horizontalen Overflow. Ein
  separater CSS-Geometrietest bestätigte 112/112 Labels ohne horizontalen
  oder vertikalen Textüberlauf.
- Ein Tastatur-Swipe finalisierte genau einen Antrag: `REDEEMED=1`,
  Redemption-Events `=1`, Punkte `1000→900`.
- Staff bestätigte einen weiteren Punkteantrag (`REDEEMED`, Eventzahl `2`,
  Punkte `800`) und lehnte einen dritten ab (`REJECTED`, Eventzahl blieb `2`).
- Owner bestätigte einen weiteren Punkteantrag (`REDEEMED`, Eventzahl `3`,
  Punkte `700`). Owner rotierte die separate Einlöse-PIN zweimal; der alte
  Wert wurde abgelehnt. Fünf falsche Eingaben führten zu genau fünf
  Fehlversuchen ohne Swipe. Customer-Abbruch führte zu `CANCELLED` ohne
  weiteres Redemption-Event.
- Escape am Customer-Drawer hielt den geprüften Snapshot aus Antragsanzahl,
  Redemption-Events und Punktesumme bytegleich. Erwartete synthetische
  Writes waren Anträge, PIN-Rotation/-Fehlversuche, Zustandsübergänge,
  Audit und genau drei bestätigte Einlösungen. In den geprüften Zahlen
  wurde kein unerwarteter Write beobachtet; vollständige Tabellen-
  Fingerprints für alle UI-Aktionen fehlen noch.

Der synthetische Welcome-Gift-Start erzeugte keinen Antrag. Für diese
Fixture ist das nicht als Produktfehler belegt: Die historische
`get_customer_gift_metadata`-RPC bindet Gift-Assignments über
`customer_qr_tokens`; die lokale 7D.3B-Fixture legt keinen solchen Token
an. Gift-/Birthday-Prüfung benötigt eine vollständige sichere synthetische
Token-Fixture. Kein Produktcode außerhalb des Swipe-i18n-Diffs geändert.

**Noch offen für den verlangten vollständigen physischen PASS:** Gift-
und Birthday-Interaktion; 15-Minuten-Ablauf; browserseitige 24-fach-
Konkurrenz; fremder Tenant im UI; X/Abbrechen neben dem geprüften Escape;
Layout-Shift-Messung über Status-/Polling-Wechsel; vollständige Vorher-/
Nachher-Fingerprints aller betroffenen Tabellen. Die früheren SQL-/Security-
und 24-fach-Parallelitätsnachweise bleiben bestanden, ersetzen diese
ausdrücklich angeforderte physische Matrix nicht.

Ein Diagnoseversuch gab einmalig die **synthetische lokale** Tages-PIN als
Teil eines UI-Buttontexts in der Toolausgabe aus. Keine realen
Zugangsdaten waren betroffen. Diese Ausgabe wurde aus dem Testskript
entfernt; PIN-Werte wurden weder in Git, Bericht, ZIP noch in ein
lokales Log übernommen. Kein Commit/Push, Staging oder Production.

Cleanup nach Evidenzsicherung: Der task-eigene Edge-Serve-Prozess wurde
regulär beendet; der isolierte Supabase-Stack wurde mit `--no-backup`
gestoppt. Sechs task-eigene Container und ihre Volumes sowie das exakt
task-eigene temporäre Runtime-Verzeichnis einschließlich geschützter Logs
und ausschließlich synthetischer Testdaten wurden entfernt. Keine fremden
Prozesse, Container oder Volumes wurden verändert.

**Status 7D.3B2A: NOT READY für LOCAL CODE LOCK.** Swipe-i18n-Diff und
bisherige technische/physische Teilgates: PASS. Vollständiges physisches
Restgate: OFFEN.

## Phase 7D.3B3 – finales lokales physisches Restgate (25.09.2026)

Der vorstehende historische Zwischenstatus ist durch diesen Abschnitt ersetzt.
Getestet wurde ausschließlich der isolierte lokale Branch
`codex/v1-7d-redemption-confirmation` auf dem eingefrorenen Produktstand.
Migration 171 blieb unverändert (SHA-256
`f125e43fbd8b9f8041a354ababdd7808f10d8a34d64a011605f3960ecefe52d8`);
Migrationen 001–170 blieben bytegleich. Weder Commit/Push noch Staging-,
Production- oder Stripe-Zugriff fanden statt. Die neuen lokalen `.local.mjs`-
Dateien sind ausschließlich synthetische Testhelfer; Produktcode wurde in
7D.3B3 nicht geändert.

### Physische und fachliche Ergebnisse

- Zwei getrennte Restaurants/Branches mit echten lokalen GoTrue-Identitäten,
  Owner-/Staff-Memberships und Customer-Bindungen wurden über den vorhandenen
  historischen Trial-, Auth-, RLS- und RPC-Vertrag aufgebaut. Keine Trigger,
  Rollen- oder Tokenprüfung wurde umgangen.
- Welcome- und Birthday-Gifts wurden als kanonisch zugewiesene, für den
  betreffenden Customer sichtbare Gifts in Chromium und WebKit geprüft.
  Birthday: Customer-PIN/Swipe sowie Staff-Bestätigung; Welcome:
  Customer-PIN/Swipe nach regulärer Freischaltung sowie Owner-/Staff-Rechte.
  Jede erfolgreiche Einlösung erzeugte genau einen `REDEEMED`-Antrag,
  Gift-Verbrauch, Journal- und maßgeblichen Audit-Eintrag; kostenlose Gifts
  erzeugten keinen Punkte-Redemption-Event. Wiederholung und bereits
  verbrauchte, fremde oder abgelaufene Gift-Tokens wurden abgewiesen.
- Browserseitige 24-fache Konkurrenz wurde für Customer-Swipe, Staff- und
  Owner-Bestätigung sowie beide Giftarten über denselben lokalen HTTP-/Edge-
  Pfad geprüft: jeweils genau eine fachliche Finalisierung, übrige Aufrufe
  idempotent beziehungsweise kontrolliert abgewiesen.
- Serverseitiger 15-Minuten-Ablauf: kontrolliert gealterte ausschließlich
  synthetische Fixture, echte Serverzeit unverändert. PIN, Swipe, Staff und
  Owner wurden nach `EXPIRED` blockiert, Gift/Punkte nicht verbraucht. Die
  60-Sekunden-Sperre verhinderte einen sofortigen Neustart; nach zulässigem
  Restart entstand eine neue Request-ID. Ein konkurrierender Minuten-Cron
  wurde als erwartete technische Gift-Präsentationsbereinigung separat
  klassifiziert, nicht als fremder Einlösewrite.
- Restaurant B konnte A-Anträge weder in der Queue sehen noch bestätigen,
  ablehnen, abbrechen oder per PIN verifizieren; A-Owner konnte B nicht
  abfragen. Die vollständigen Fingerprints aller 133 `public`-Tabellen
  blieben bei diesen Fremdversuchen identisch.
- Reines Dialogschließen über Footer/Abbrechen, X und Escape wurde jeweils
  einzeln gegen vollständige 133-Tabellen-Fingerprints geprüft: **0 Writes**,
  Antrag weiterhin `REQUESTED`. Die fachliche Aktion „Einlöseantrag
  abbrechen“ erzeugte dagegen genau den erlaubten Wechsel zu `CANCELLED`
  samt Audit, ohne Gift-/Punkteverbrauch.
- Für Finalisierung wurden vollständige 133-Tabellen-Fingerprints vor/nach
  jedem geprüften Szenario und zeilen-/spaltenweise Diffs verwendet. Die
  dynamischen synthetischen Primärschlüssel wurden im Test unmittelbar gegen
  `restaurant_id`, `redemption_id` und `entitlement_id` gebunden. Erlaubte
  Änderungen: `audit_log`, `capacity_warning_states`, `customer_rewards`,
  `gift_redemption_presentations`, `kassa_redemption_workflows`,
  `redemption_activity_journal`, `secure_redemption_audit`,
  `secure_redemption_requests`; beim PIN-Pfad zusätzlich
  `redemption_confirmation_pins` und `secure_redemption_pin_attempts`.
  Der Test meldet für jede abweichende Zeile den synthetischen Schlüssel und
  die geänderten Spalten; Löschungen, fremde Tenant-/Gift-/Request-Zeilen
  oder weitere Tabellendiffs führen zum FAIL. Unveränderliche Relationen
  blieben bytegleich.

### Layout und Messgrenze

Chromium und WebKit bestanden je 320/375/390/430/767/768/1024/1440 CSS-px
über **20 echte Staff-Polling-Zyklen** und Customer-Countdown-Re-Renders:
16:9-Medien, PIN, Countdown, Buttons und Queue-Karten blieben geometrisch
stabil; kein horizontaler Overflow, Touchziele mindestens 44 CSS-px und
keine Polling-Writes. Chromium unterstützte den `layout-shift`-Observer auf
allen 16 Seiten; nach stabiler Initialdarstellung meldete er Score 0.
WebKit bot für diese API keine Unterstützung; dort wurden dieselben
Elementrechtecke in jedem Zyklus physisch verglichen.

Die erste Observer-Messung erfasste irrtümlich die einmalige Einblendung der
Staff-Queue (vorheriges Rechteck 0×0); sie war kein Polling-Reflow. Ebenso
erzeugt der bestehende Customer-Portal-Initialaufruf reguläre Access-Audit-
und QR-Token-Zeilen. Deshalb beginnt der schreibfreie Polling-Fingerprint
erst **nach** dem vollständigen Seiten-/Queue-Aufbau. Die getrennten Tests
für reines UI-Schließen und Fremdversuche vergleichen dagegen unmittelbar
vor/nach der jeweiligen Aktion alle 133 Tabellen. Diese Messgrenzen sind
ausdrücklich dokumentiert; es wird kein „Page Load erzeugt 0 Writes“ behauptet.

### Abschlussgates und Grenzen

Focused Redemption/Security/Swipe-i18n: 21/21 PASS. Full Suite: 1.991/1.991
PASS im Loopback-Profil; drei vorherige `listen EPERM` waren ausschließlich
Sandbox-Berechtigung. Typecheck PASS; Lint PASS (0 Fehler, 8 bekannte
Warnungen); Build PASS. Fresh Replay 171/171, Upgrade 162→171,
Repeat 1/2 und DB-Lint PASS (nur bekannte Legacy-Warnungen). Secret-Scan,
`git diff --check` und `git diff --cached --check` PASS. Kein echtes Gift,
keine reale Einlösung und keine Staging-Datenänderung. Das 41-Dateien-Prüf-ZIP
wurde secret-frei erstellt, auf Integrität und nach Entpacken byteweise gegen
die Quellen geprüft. Der lokale Edge-Prozess wurde regulär beendet, der
isolierte Supabase-Stack ohne Backup gestoppt und das exakte task-eigene
Runtime-Verzeichnis samt synthetischen Daten/Logs entfernt. Es laufen keine
task-eigenen Container, Volumes oder Vite-/Edge-Server; der fremde
`welcome-to-docker`-Container blieb unangetastet.

**Status: PHASE 7D.3B LOCAL CODE LOCK / SWIPE I18N 7/7 PASS /
POINT REWARD PASS / WELCOME GIFT PASS / BIRTHDAY GIFT PASS /
CUSTOMER-STAFF-OWNER MATRIX PASS / TENANT ISOLATION PASS /
PARALLEL SERIALIZATION PASS / PHYSICAL BROWSER MATRIX PASS.**
Kein Staging- oder Final-Lock, keine Freigabe für Commit, Push oder Deployment.

## Phase 7D.3B5A – Portalzugang und fail-closed Queue (aktueller Nachtrag)

Der allgemeine Staff-Portalzugang wurde für serverseitig bestätigte
OWNER/ADMIN/MANAGER/STAFF-Rollen des eigenen Restaurants erhalten (einschließlich
des bereits bestehenden Supervisor-Staff-Untertyps). Die Route rendert nur,
wenn die geprüfte Slug exakt der aktuellen Slug entspricht. Eine verspätete
Portalantwort für A kann B nicht autorisieren. Die Queue ist davon getrennt:
Erst die tenantgebundene Serverantwort mit `actor_role=STAFF|OWNER` lässt
Überschrift, Leerzustand, Kundendaten und Aktionen erscheinen. Eine Slug-Änderung
remountet die Queue mit neuem Schlüssel; alte Ergebnisse werden zusätzlich per
Request-Generation und -Sequenz ignoriert. Admin und Manager behalten den
übrigen Portalzugang, erhalten ohne STAFF-/OWNER-Bestätigung aber keine Queue.

Geändert wurden ausschließlich `StaffRestaurantRouteGate.tsx`,
`SecureRedemptionQueue.tsx`, der relevante Abschnitt des kanonischen Vertrags,
ein fokussierter Bestands-Assertionstest sowie lokale Browser-Testdateien.
Migration 171 blieb bytegleich mit SHA-256
`f125e43fbd8b9f8041a354ababdd7808f10d8a34d64a011605f3960ecefe52d8`;
Migrationen 001–170 wurden nicht geändert. Kein Commit, Push, Bundle, Staging-
oder Production-Zugriff.

Der neue physische Chromium-/WebKit-Harness verwendete ausschließlich
kontrollierte synthetische Serverantworten. Er prüfte sechs Rollen, sieben
Sprachen und acht Breiten in 776 DOM-/Layout-/Rennbedingungsprüfungen:
Portalrollen erhalten Zugang, Customer/Anonymous nicht; Admin/Manager sehen
keine Queue; Queue erscheint für Staff/Owner erst nach der separaten Antwort;
Slug A→B, verspätete Portal- und Queue-Antworten, 24 schnelle Wechsel,
Admin-/Manager-Slug-Ablehnung und Unmount/Reload zeigten keine A-Daten unter B.
Keine Browserfehler, kein horizontaler Overflow,
Queue-Buttons mindestens 44 CSS-px; der Mock registrierte 0 Mutationsaufrufe.
Dies ist ein physischer UI-Nachweis, **kein** authentifizierter End-to-End-Test
der vollständigen Customer-/Staff-/Owner-Interaktionen.

Technische Gates nach dem UI-Fix: fokussierte statische Tests 26/26 PASS;
Full Suite 1.991/1.991 PASS mit Loopback-Zugriff; Typecheck PASS; Lint PASS
(0 Fehler, 8 vorbestehende Warnungen); Build PASS. Der isolierte lokale
Supabase-Stack bestand Fresh Replay 171/171, Upgrade 170→171, zwei leere
Repeat-Dry-Runs und DB-Lint (nur Legacy-Warnungen). Die rollback-geschützte
Redemption-SQL-/Security-Matrix bestand; Requests, Audit, PINs, Kunden und
Rewards standen anschließend weiterhin bei 0 Zeilen. Beide Git-Diff-Checks
bestanden. Der Build nutzte ausschließlich einen nicht funktionsfähigen
lokalen Platzhalter-Clientschlüssel; kein Provider-Secret.

**Offenes Restgate:** Die vom Founder ausdrücklich verlangte vollständige
authentifizierte physische Interaktionsmatrix nach diesem UI-Fix wurde nicht
erneut ausgeführt. Insbesondere Admin-/Manager-Zugriff mit echten lokalen
Sessions und Staff-/Owner-Aktionen gegen den lokalen Server wurden in diesem
Nachtrag nicht positiv E2E belegt. Die früheren 7D.3B3-Interaktionsnachweise
betreffen den vorherigen UI-Stand und ersetzen dieses neue Gate nicht.

**Aktueller Status 7D.3B5A: NOT READY – AUTHENTICATED PHYSICAL INTERACTION
RESTGATE OPEN.** Der vorherige 7D.3B3-Lock wird nicht als neuer 7D.3B5A-Lock
ausgegeben.

## Phase 7D.3B6 – echte lokale Sitzungen; physisches Restgate gestoppt

Für dieses Restgate wurden ausschließlich im isolierten lokalen Supabase-Projekt
synthetische Restaurants A/B, echte Auth-Nutzer und Memberships sowie echte
RPC-/Edge-Antworten verwendet. Chrome/Chromium und WebKit arbeiteten gegen die
lokale Anwendung; Race-Tests verzögerten ausschließlich unveränderte echte
Serverantworten. Zugangsdaten, Tokens und PINs sind nicht Bestandteil dieser
Evidenz. Produktdateien und Migration 171 blieben unverändert.

- Echte Owner-, Admin-, Manager-, Staff-, Customer- und Anonymous-Sitzungen:
  Portal- und Queue-Rollenmatrix PASS. Admin/Manager behalten Portalzugang,
  erhalten aber keine Queue. Fremder Tenant bleibt blockiert.
- Echte Slug-Races A/B in Chromium und WebKit: verzögerte Antwort in beiden
  Reihenfolgen, 24 schnelle Wechsel, Reload und Unmount PASS; keine fremden
  Queue-Frames und keine Businesswrites.
- Echte lokale Einlöse-Endpunkte: Birthday-/Welcome-/Punktepfad, Staff-/Owner-
  Bestätigung, PIN-Fehlergrenze, Rotation, Swipe, 24-fache Parallelität,
  Cancel, Reject, Expiry sowie fremde/verbrauchte/ungültige Gift-Tokens PASS.
  Erwartete synthetische Testwrites wurden von unveränderten geschützten
  Fingerprints bei Negativ- und Cross-Tenant-Prüfungen getrennt.
- Erste authentifizierte physische Browsermatrix: 784 Basisprüfungen PASS
  (2 Engines, 7 Sprachen, 8 Breiten, 7 Rollen-/Zustandsansichten).
- Erweiterte physische 44-CSS-px-Prüfung: **FAIL** bei
  `CHROMIUM/de/390/customerPin:PIN_TOUCH`. Der PIN-Dialog enthält mindestens
  ein zu kleines Bedienelement. Die separate Drawer-Schließprüfung über
  Escape/X/Schließen ergab zuvor 0 Public-Table-Writes.

Engste Ursache nach Code-/CSS-Prüfung: Das PIN-Input in
`CustomerPortal.tsx` verwendet `className="input"`. `AppDrawer` rendert über
`createPortal` außerhalb von `.customer-premium-shell`; deshalb greift deren
`min-height: 50px`-Regel nicht. Die globale `.input`-Regel in `src/styles.css`
setzt nur `min-height: 42px`. Der PIN-Button besitzt dagegen über
`.premium-button` bereits `min-height: 44px`. Engster erforderlicher, **noch
nicht freigegebener** Produkt-Diff: gezielte `min-height: 44px`-Regel für
`.premium-redemption-pin-entry .input` in `customer-premium.css` und danach
erneute physische Touch-/Browserprüfung. Keine Produktänderung wurde
vorgenommen.

Gemäß Founder-Stopregel wurden nach diesem Fund weder die übrigen
Browser-/Polling-Gates noch Full Suite, Typecheck, Lint, Build oder
Fresh-/Repeat-/DB-Lint erneut ausgeführt. Die zuvor nach 7D.3B5A bestandenen
Gates werden nicht als aktueller vollständiger PASS ausgegeben. Kein Commit,
Push, Bundle, Staging- oder Production-Zugriff. **Status: NOT READY –
PIN-TOUCH-TARGET PRODUKTFIX ERFORDERT GESONDERTE FREIGABE.**

## Phase 7D.3B7 – gezieltes PIN-Touchziel und finale lokale Nachprüfung

Der einzige Produkt-Diff ist die Regel
`.premium-redemption-pin-entry .input { box-sizing: border-box; min-height: 44px; }`
in `src/modules/customer/customer-premium.css`. Das vorhandene PIN-Markup
genügte; keine Komponente wurde geändert. Globale Inputs, andere Formulare,
PIN-Logik, Renderer, Rollen, RPCs, Edge Function und Migrationen blieben
unverändert.

Der echte Browser maß `getBoundingClientRect()` am interaktiven PIN-Input:
**Mindesthöhe 44 CSS-px, Mindestbreite 248 CSS-px**. Insgesamt bestanden
672 PIN-Zustands-/Breitenprüfungen (Chromium und WebKit, DE/EN/FR/IT/ES/ZH/KO,
320/375/390/430/767/768/1024/1440 px, jeweils leer, fokussiert,
teilweise/vollständig eingegeben, Fehler und Fünf-Fehlversuche-Sperre).
Box-Sizing war `border-box`; alle übrigen sichtbaren Drawer-Buttons maßen
mindestens 44 × 44 CSS-px. Kein horizontaler Overflow, keine Überlappung mit
Button/Status, scrollbar erreichbarer Drawer und keine Mediengeometrie-
sprünge zwischen den PIN-Zuständen. Die 784 Rollen-/Layout-Basisprüfungen
und die sieben lokalisierten Swipe-Texte bestanden ebenfalls in beiden
Engines. Escape, X und Footer-Schließen verursachten 0 Public-Table-Writes.

Mit echten lokalen Supabase-Auth-Sitzungen und Memberships bestanden Owner,
Admin, Manager, Staff, Customer und Anonymous die Portal-/Queue-Matrix:
Portalzugang für OWNER/ADMIN/MANAGER/STAFF des eigenen Betriebs; Queue erst
nach serverseitiger STAFF-/OWNER-Freigabe. Customer/Anonymous und fremde
Tenants sahen keine Queue. Birthday-, Welcome- und Punkte-Einlösungen wurden
über echte lokale RPCs/Edge Function geprüft: REQUESTED, fünf falsche PINs,
PIN_VERIFIED, Swipe oder Staff-/Owner-Bestätigung, genau eine REDEEMED-Wirkung
bei 24 parallelen Aufrufen, exakt einmaliger Punkteabzug beziehungsweise
Gift-Verbrauch. Ablehnung, Cancel, Expiry, PIN-Rotation und fremde,
verbrauchte, abgelaufene oder ungültige Tokens bestanden; deren Negativpfade
hatten identische geschützte Fingerprints. Erwartete synthetische Writes
waren nur Request-/Status-/Audit-, PIN-Fehlversuchs-/Rate-Limit-, Punkte- und
Gift-Verbrauchszeilen. Keine realen Daten wurden berührt.

Echte unveränderte Serverantworten wurden für Slug-Races nur verzögert:
A→B vor `useEffect`, späte A-/B-Antworten, 24 schnelle Wechsel, Reload und
Unmount bestanden in Chromium/WebKit für Owner und Staff; keine fremden
Queue-Frames. Ein erster Lauf auf lange bestehenden synthetischen Fixtures
meldete eine nicht näher klassifizierte Gesamtfingerprint-Abweichung, ohne
dass eine Race-Aktion bewusst Businesswrites auslöste. Dieser Befund wird
nicht als PASS umgedeutet. Die Matrix wurde unmittelbar nach frischem
lokalem Auth-/Migrations-Fixture erneut vollständig ausgeführt und bestand
mit **identischen Public-Table-Fingerprints**; der saubere Kontrolllauf ist
der finale Race-Nachweis. Die genaue Ursache des älteren Fixture-Drifts
blieb nicht nachträglich beweisbar.

Fokussierte Touch-/Redemption-/Security-Tests: **29/29 PASS**. Full Suite:
**1.992/1.992 PASS** mit erlaubter lokaler Loopback-Bindung. Ein erster
Sandbox-Lauf hatte ausschließlich drei `listen EPERM`-Fehler für lokale
HTTP-Tests; keine fachlichen Assertion-Fehler. Typecheck PASS. Lint PASS,
0 Fehler und 8 vorbestehende Warnungen. Build PASS mit funktionslosem
lokalem Platzhalterschlüssel, ohne Remote-Zugriff. Isolierter Migrationstest:
Upgrade 170→171 PASS, zwei No-op-Repeats PASS, Fresh Replay 171/171 PASS,
DB-Lint Exit 0 mit Legacy-Warnungen. Migrationen 001–170 blieben bytegleich;
Migration 171 unverändert mit SHA-256
`f125e43fbd8b9f8041a354ababdd7808f10d8a34d64a011605f3960ecefe52d8`.

Kein Commit, Push, Bundle, Staging-, Production- oder realer Datenzugriff.
**Status: PHASE 7D.3B LOCAL CODE LOCK / AUTHENTICATED LOCAL ROLE MATRIX PASS /
PIN TOUCH TARGET ≥44PX PASS / STAFF PORTAL ACCESS PRESERVED /
REDEMPTION QUEUE STAFF-OWNER ONLY / SECURE REDEMPTION FLOW PASS.**

## Phase 7D.3B8 – lokaler Commit- und Sicherungsstand

- Parent: `475b8210870935486d36cb22196811082f56cb1a`.
- Implementierungscommit: `b2f89fc` (`feat(redemption): require secure restaurant confirmation`). Migration 171, Produktcode, Tests und kanonische Vertragsänderungen wurden separat von diesem Evidenzbericht committed. Migrationen 001–170 blieben bytegleich.
- Endstatus: **PHASE 7D.3B LOCAL CODE LOCK**. Kein Staging- oder Production-Lock. Remote-Push und Staging-Gate bleiben offen.
- Allgemeiner Staff-Portalzugang bleibt für OWNER/ADMIN/MANAGER/STAFF des eigenen Betriebs erhalten. Die Einlöse-Queue wird erst nach separater serverseitiger STAFF-/OWNER-Autorisierung für die exakt aktuelle Restaurant-Slug sichtbar; ADMIN/MANAGER ohne diese Berechtigung erhalten keine Queue. Slug-Wechsel und verspätete Antworten bleiben synchron fail-closed.
- Das interaktive Customer-Redemption-PIN-Feld maß mindestens 44 CSS-px Höhe; die gemessene Mindestbreite betrug 248 CSS-px. Der gezielte Selektor ist `.premium-redemption-pin-entry .input`.
- Der ältere Fingerprint-Drift auf lang bestehenden synthetischen Fixtures bleibt als nicht nachträglich klassifizierbar dokumentiert. Maßgeblich ist der danach frisch isolierte, vollständig wiederholte Kontrolllauf mit identischen Public-Table-Fingerprints und 0 unerwarteten Businesswrites. Eine Ursache des älteren Drifts wird nicht behauptet.
- In dieser Commit-/Bundle-Phase wurden keine Tests wiederholt und kein Staging-, Production- oder sonstiger externer Zugriff ausgeführt. Kein Push.
