# Phase 7D.4B – Customer Identity und QR-Token-Idempotenz

Stand: 25.09.2026. Ausschließlich lokaler Code Lock; kein Commit, Push, Staging-Apply oder Deployment.

## Ursache

Der frühere Customer-Routenaufruf verwendete einen mutierenden Membership-Opener. Er konnte Account-/Membership-Zeitfelder, einen weiteren QR-Token und Auditzeilen erzeugen. Dies widersprach dem aktuellen Read-only-Page-View-Vertrag.

## Geänderte Dateien und Vertrag

- Additive Migration `20260925001000_customer_identity_qr_token_idempotency.sql` (SHA-256 `a58900bea614382673da57a70b5def1ae719c2807d2a10a0fe06ad1a2e1b0929`): getrennte Lese- und explizite Zustandsübergänge; Token-Historie gegen DELETE/Reaktivierung geschützt; höchstens ein aktiver Token pro Restaurant/Customer-Grain; serverseitige Sperre; einmalige Recovery-Quittung je verifizierter Auth-Session; append-only Lifecycle-Audit mit Request-/Correlation-ID. Bestehende Migrationen 001–171 blieben bytegleich; Migration 171 behielt den bestätigten SHA-256 `f125e43fbd8b9f8041a354ababdd7808f10d8a34d64a011605f3960ecefe52d8`.
- Customer-Route, Auth-Seite und Service: Seitenaufruf liest Kontext und prüft einen vorhandenen Browser-Token. Fehlender/ungültiger Token erzeugt nichts automatisch, sondern zeigt eine ausdrückliche Wiederherstellung. Recovery verlangt eine höchstens zehn Minuten alte, serverseitig verifizierte Auth-Session, widerruft aktive Tokens atomar und liefert genau einen neuen Rohwert einmalig an den aktuellen Browser. Persistiert wird nur dessen Hash. Login-Audit erfolgt nur nach Sign-in; Restaurant-Kontext-Audit nur bei tatsächlichem Wechsel.
- Siebensprachige Recovery-Texte und gezielte 44-px-Touchregel für den Sprachwähler; betroffene fokussierte Tests; aktuelle Customer-/DB-/Produktdokumentation.

Die Autorität bleibt serverseitig: Auth-Session, Customer-Account, Membership, Restaurant und Token müssen zusammenpassen. Anonyme oder fremde Rollen erhalten keine Recovery. Die Route erzeugt weder Account noch Membership, Token oder Login-/Kontext-Audit.

## Historische Token-Reconciliation – lokaler Upgrade-Nachweis

Die Migration sperrt die Tokentabelle transaktionsgebunden und behält pro Ownership-Grain den neuesten gültigen aktiven Token nach `created_at`, danach Token-ID. Alle übrigen aktiven Zeilen werden widerrufen und auditiert; wenn kein Token gültig ist, bleibt keiner aktiv. Es wird keine Tokenzeile gelöscht. Auf einer ausschließlich synthetischen lokalen 171-Fixture wurden zwei gültige Tokens und ein abgelaufener Token geprüft: drei Zeilen erhalten, genau ein gültiger aktiv, zwei widerrufen, zwei Audit-Appends. Beide Repeat-Läufe erzeugten keine weitere Wirkung. Die spätere Staging-Reconciliation erfordert eine separate Freigabe und Vorher-/Nachher-Fingerprints.

## Nachweise

| Gate | Ergebnis |
| --- | --- |
| Fresh Replay | 172/172 PASS |
| Upgrade 171→172 | PASS, deterministische synthetische Reconciliation |
| Repeat 1/2 | PASS, keine zusätzlichen Token-/Auditzeilen |
| DB-Lint | Exit 0; vorhandene Legacy-Warnungen, keine neue unsichere 172-Funktion festgestellt |
| Fokussierte Node-Tests | 12/12 und betroffene Regression 44/44 PASS |
| Lokale SQL-Security/Idempotenz | PASS; 24 Reads 0 Writes |
| 24-fache Parallelität | 24 Recovery-Versuche → genau eine Ausgabe; 24 Reads 0 Writes |
| Physische lokale Browsermatrix | Chromium/WebKit, 7 Sprachen × 8 Breiten × 2 Zustände = 224 PASS; Public-DB-Fingerprints identisch; Touchziele mindestens 44 CSS-px; kein horizontaler Overflow; X/Escape/Abbrechen ohne Public-DB-Writes |
| Full Tests | 1.996/1.996 PASS |
| Typecheck / Lint / Build | PASS / 0 Fehler, 8 vorbestehende Warnungen / PASS |
| Secret Scan / Diff-Checks | PASS / PASS |

Der Build verwendete ausschließlich nicht-geheime lokale Platzhalter für öffentliche Browserbindungen. Das Artefakt wurde nicht deployed. Ein früher fehlgeschlagener lokaler Fixture-Lauf gab einen synthetischen, nicht verwendbaren Token-Hash aus; der Test-Fehlerpfad wurde daraufhin so gehärtet, dass keine Hashwerte mehr ausgegeben werden. Es waren keine realen oder Remote-Credentials betroffen.

## Was nicht geändert wurde und offene Gates

Keine historische Migration, keine Staging- oder Production-Zeile, kein Stripe, keine reale Identität und kein bestehender QR-Token wurden geändert. Keine Staging-Bereinigung, kein Deployment, kein Commit oder Push. Vor einem Staging-Apply sind historische aktive Tokens datensparsam zu fingerprinten und die geplante Reconciliation separat freizugeben; danach sind Rollen-/Tenant- und Browser-Restgates auf Staging erneut erforderlich. Ein FINAL LOCK wird nicht behauptet.

Status: **PHASE 7D.4B CUSTOMER IDENTITY AND QR TOKEN IDEMPOTENCY LOCAL CODE LOCK / STAGING MIGRATION AND CONTROLLED TOKEN RECONCILIATION OPEN**.
