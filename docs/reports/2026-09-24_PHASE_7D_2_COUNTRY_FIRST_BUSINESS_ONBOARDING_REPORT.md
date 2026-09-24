# Phase 7D.2 – Country-first business onboarding / local gate

Date: 2026-09-24. Branch: `codex/v1-7d-country-first-onboarding`; base: `f38287249494f6c9c6ba4fc89c5d010e498cade1`. Local implementation commit: `6426041`.

## Ursache und Scope

Migration 169 enthält die gesicherte Business-Verification-Statusmaschine und `manage_business_verification`, aber keine Owner-Einreichung und keine adminseitige Queue/Detail-Read-Modelle. Deshalb ergänzt ausschließlich die additive, lokal committed, aber nicht remote angewendete Migration 170 diese Verträge. Migration 169 bleibt bytegleich (SHA-256 `d9d3b7aac0266bfaad0434aae3e3b8fab5bd683ae6e2c615e2cb9cacd1cd5629`). Die temporäre `supabase/config.toml`-Änderung für die isolierte Testinstanz wurde vollständig zurückgestellt.

## Änderung

- Registrierung zeigt die serverseitig gelesene Länderauswahl vor allen weiteren Eingaben. Gesperrte Länder bleiben nicht auswählbar. Ein Landwechsel nach Eingaben benötigt Bestätigung; Eingaben werden nicht stillschweigend verworfen.
- Owner-Seite bindet bestehende Legal-Setup-Daten und autoritative Verification-Read-RPCs, bietet manuelle Einreichung mit Request-/Correlation-ID und zeigt die digitale Methode nur deaktiviert. Einreichung bleibt Pending, ohne Trial, Entitlement oder Checkout.
- Migration 170 ergänzt eine private, append-only Owner-Submission mit idempotenter Pending-/Country-/Tenant-Prüfung, Owner-Status-Read und adminseitige Queue/Detail-Reads. Das Read-Modell liefert die serverseitig zulässigen Aktionen.
- Platform-Admin-Seite nutzt ausschließlich den bestehenden RPC `manage_business_verification` aus Migration 169 für `START_REVIEW`, `REJECT`, `SUSPEND`, `CORRECT_PROFILE`, `GRANT_TEST` und `REVOKE_TEST`. Sie verlangt Grund, Begründung, exakte Phrase und frische Anmeldung; nach Erfolg wird der Serverzustand neu geladen. X/Escape/Abbrechen sind reine UI-Aktionen.
- Pending-Banner, Owner-Einstellungen und Platform-Menü verlinken die neuen Seiten. Der bestehende Drawer-/Keyboard-Vertrag bleibt erhalten.

Keine reale `VERIFIED`-Aktion, keine neue Admin-Mutation, keine automatische digitale Prüfung, keine Dokumentdatei, keine Stripe-Anbindung, keine Staging-/Production-Änderung.

## Lokale Nachweise

| Gate | Ergebnis |
| --- | --- |
| Migration 169→170 | PASS; nur Migration 170 angewendet |
| Repeat 1/2 | PASS; beide Male keine ausstehende Migration |
| Fresh-Replay | PASS; 170/170 |
| Migration 170 SHA-256 | `9dae2f14846577cd8743fa710a1191110c3e321b8b407c1f60328ff056785441` |
| SQL-Fokus/Rollen/Recent Auth/Phrase | PASS, rollback-geschützt; Owner, Staff, Customer, Anonymous und Service Role geprüft |
| 24-fache Parallelität | PASS: Owner-Einreichung und jede der sechs Admin-Aktionen mit identischer Request-ID; je ein Effekt |
| Bestehender Migration-169-Test | PASS |
| DB-Lint | Exit 0; nur vorbestehende Legacy-Warnungen, keine neue 170-Warnung beobachtet |
| Chromium/WebKit | PASS: 226 lokale Prüfungen über DE/EN/FR/IT/ES/ZH/KO und 320/375/390/430/767/768/1024/1440 px; kein Overflow, sichtbare Touchziele ≥44 px |
| Browser-Read-Only | PASS: kein neuer Verification-Decision-Audit-Datensatz durch Seitenaufruf, Sprache, Resize oder Drawer/Escape |
| Full Tests | PASS: 1.980/1.980 |
| Typecheck | PASS |
| Lint | PASS: 0 Fehler, 8 vorbestehende Warnungen außerhalb des neuen Scopes |
| Build | PASS mit task-lokalem Anon-Testschlüssel nur im Prozessspeicher; bekannte Chunk-Größenwarnung |
| Secret Scan / Diff-Checks | PASS, kein erkennbarer Secretwert in neuen/geänderten Taskdateien |
| Testdaten-Cleanup | PASS: task-eigene Supabase-Container und Volumes entfernt; synthetische Fälle/Entscheidungen/Einreichungen/Testmarker zuvor 0 |

Der Server bleibt für Berechtigung, Status, Land, Trial, Subscription, Entitlements und Testbindung autoritativ. `GRANT_TEST` ist ausschließlich testgebunden und auf höchstens 24 Stunden begrenzt; lokale Testproben setzten die Umgebung nur synthetisch. AT + PRO, Seller, Tax und positiver Stripe-Pfad bleiben gesperrt.

## Grenzen und offene Gates

- Kein Staging-Test; Staging bleibt nach zuletzt dokumentiertem Stand 168/168. Migration 169 und 170 sind dort nicht angewendet.
- Der Founder hat die engen lokalen Commits und ein Git-Bundle ausdrücklich freigegeben. Der Implementierungscommit enthält ausschließlich die 15 geprüften Source-, Migrations- und Testdateien. Das bestehende secret-freie Prüf-ZIP stimmt bytegleich mit allen 16 ursprünglichen Taskdateien vor dieser Evidenzkorrektur überein. Nur dieser Bericht ändert sich nach dem technischen Code Lock; die technische Test-Evidenz wird daher übernommen.
- Kein Fetch oder Push: Der Remote-Gate bleibt offen. Das Git-Bundle wird aus den lokalen Commits mit `f382872…` als Voraussetzung erstellt und separat verifiziert; Bundle-Tip und SHA-256 stehen in der Abschlussausgabe, nicht als selbstreferenzieller Wert in diesem Commit.
- Ein produktiver KYB-Dokumentupload, externe digitale Verifikation und reale positive Aktivierung sind ausdrücklich nicht implementiert.

Status: **PHASE 7D.2 LOCAL CODE LOCK / LOCAL COMMITS AND BUNDLE SECURED (nach separater Bundle-Verifikation) / REMOTE PUSH DEFERRED BY DNS.** Kein Staging- oder Final-Lock.
