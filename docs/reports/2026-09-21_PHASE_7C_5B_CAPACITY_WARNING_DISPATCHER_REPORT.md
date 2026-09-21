# WUXUAI® BONUS – Phase 7C.5B Capacity Warning Dispatcher

Datum: 2026-09-21
Branch: `codex/v1-release-integration`
Base-HEAD/Remote: `7d57e73634a8052587e580b0ba82e11b86ccd72e` / 0–0
Status: **PHASE 7C.5B LOCAL CODE LOCK**

## Ursache

Phase 7C.5 lieferte bereits die autoritative Owner-Capacity-UI und Migration
156, ließ den Dispatcher aber wegen damals fehlender Founder-Regeln bewusst
deaktiviert. Der nun bestätigte Vertrag definiert Schwellen, Prognosebasis,
Deduplizierung, Wiederholung, Quiet Hours und Rearm vollständig. Damit konnte
der Dispatcher additiv und ohne erfundene Produktlogik implementiert werden.

Während der lokalen Vertragsprüfung wurden zwei enge technische Fehler
gefunden und vor den Abschlussgates korrigiert:

1. Eine periodische Dezimaldivision konnte einen mathematisch exakten
   Forecast von 10 als `10.000…1` darstellen und mit `ceil` auf 11 runden.
   Die algebraisch identische Berechnung multipliziert nun vor der Division.
2. Der E-Mail-Reservierungs-RPC deklarierte `text`, lieferte aber drei
   bestehende `varchar`-Felder. Explizite `text`-Casts stellen den RPC-Vertrag
   her.

## Geänderte Dateien

- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`
- `docs/19_CHANGELOG.md`
- `supabase/migrations/20260921005000_capacity_warning_dispatch.sql`
- `supabase/functions/_shared/transactionalMailTemplates.mjs`
- `supabase/functions/transactional-mail-dispatcher/index.ts`
- `src/modules/capacity/ownerCapacityService.ts`
- `src/modules/capacity/ownerCapacityMessages.mjs`
- `src/modules/admin/pages/OwnerCapacityPage.tsx`
- `src/styles.css`
- `tests/phase-7c5b-capacity-warning-dispatch.test.mjs`
- `tests/phase-7c5b-capacity-warning-contract.local.sql`
- `tests/phase-7c5b-concurrency-setup.local.sql`
- `tests/phase-7c5b-evaluate.pgbench.sql`
- `tests/phase-7c5b-delivery.pgbench.sql`
- `tests/phase-7c5b-acknowledge.pgbench.sql`
- `tests/phase-7c5b-rearm-setup.local.sql`
- `tests/phase-7c5b-rearm.pgbench.sql`
- `tests/phase-7c5b-escalation.pgbench.sql`
- dieser Bericht

Der bereits vorhandene, noch uncommittete Phase-7C.5-Umfang bleibt Teil
desselben lokalen Gesamtstands. Migration 156 wurde nicht rückwirkend mit
Dispatcher-Logik vermischt.

## Founder-Warnvertrag

- Capacity-Typen: `offer`, `customer`
- Stufen: 80 %, 90 %, 100 %, `OVER_LIMIT`
- Prognose nur bei exakt 28 lückenlosen vollständigen Tagessnapshots
- Formel:
  `daily_net_growth = (current_usage - usage_28_complete_days_ago) / 28`
- Sieben-Tage-Wert:
  `current_usage + max(0, daily_net_growth * 7)`, konservativ aufgerundet
- Evaluation nach erfolgreicher kapazitätsrelevanter Serveraktion sowie
  täglich 08:00 Uhr lokaler Restaurantzeit
- Zeitzonen-Fallback: `Europe/Vienna`
- Deduplizierung: Restaurant, Capacity-Typ, Warnstufe und Warnperiode;
  App und E-Mail besitzen getrennte Zustellzustände
- Prognose und tatsächliches Erreichen derselben Stufe teilen eine Episode
- 80/90/Forecast einmal pro Warnperiode
- 100/OVER_LIMIT sofort, danach höchstens alle sieben Tage
- E-Mail-Quiet-Hours 22:00–07:00, Freigabe ab 08:00
- Rearm nach sieben vollständigen Tagen unter der Stufe oder nach wirksamer
  Limit-Erhöhung unter die Stufe
- Acknowledge verändert nur die sichtbare App-Zustellung, niemals Capacity,
  Entitlement oder Rearm
- kein automatischer Kauf, Tarifwechsel, Grant, Add-on oder Einzug

## Datenmodell und Ausführung

Migration 157 erstellt private, RLS-geschützte Tabellen für tägliche
Snapshots, Warnperioden, Warnzustände, kanalgetrennte Zustellungen und ein
append-only Audit. Browserrollen erhalten keine direkte Tabellen-DML.
Security-Definer-Funktionen besitzen feste `search_path`-Werte.

Der Evaluator liest Nutzung und Limit ausschließlich aus
`resolve_restaurant_capacity_internal`. Ein tenant- und typbezogener Advisory
Lock serialisiert parallele Auswertungen. Unique Constraints verhindern eine
zweite offene Episode und doppelte Kanalzustellungen. Fehler im
nachgelagerten Warntrigger werden PII-arm protokolliert und rollen eine
ansonsten zulässige Businessaktion nicht zurück.

Der vorhandene `pg_cron`-Vertrag wird stündlich angestoßen und evaluiert nur
Restaurants, deren sichere lokale Stunde 08 ist. Wiederholte Läufe desselben
Tages sind durch den Snapshot-Primärschlüssel idempotent. TEST_ONLY-Tenants
werden vom täglichen Lauf ausgeschlossen.

## App und E-Mail

Die Owner-Seite liest offene App-Warnungen tenantgebunden und schreibfrei.
Das idempotente Acknowledge ist nur für den eigenen Owner möglich, beendet
nur die sichtbare App-Zustellung und lässt die aktive Warnperiode unverändert.

Der bestehende Transactional-Mail-Worker reserviert zuerst die bestehende
Customer-Queue und anschließend freie Capacity-Slots. Ein Fehler der neuen
Capacity-Reservierung hält bereits reservierte Customer-E-Mails nicht mehr
auf. Capacity-E-Mails besitzen stabile Message-IDs, Lease, Retry, terminalen
Fehlerzustand und getrennte Completion-RPC. Empfänger sind ausschließlich
aktive, bestätigte Owner. Lokal wurde nur Render-, Queue-, Empfänger-, Lease-,
Retry- und Deduplizierungslogik geprüft; kein SMTP-Versand wurde ausgelöst.

E-Mail- und App-Texte sind für DE, EN, FR, IT, ES, ZH und KO vorhanden. Der
Link führt nur zu `/admin/settings/tarif-kapazitaet` und kann weder Kauf noch
Grant oder Tarifwechsel auslösen.

## Security und Schreibgrenzen

- Owner: nur eigener Tenant, Read und eigenes Acknowledge
- Staff: Capacity-Warnungs-RPCs blockiert
- Customer: blockiert
- Anonymous: blockiert
- Service Role: ausschließlich begrenzte E-Mail-Reserve/Completion-RPCs
- direkte DML: entzogen
- Warnschlüssel und Audit: keine E-Mail-Adresse und keine unnötige PII
- Country Gate, Commercial Lock, TEST_ONLY und bestehendes Enforcement:
  unverändert
- keine Subscription-, Grant-, Add-on-, Entitlement-, Angebots-, Kunden-,
  Punkte- oder Redemption-Mutation durch den Dispatcher

## Migrationstests

- Fresh-Replay 157/157: PASS
- historischer Replay bis 156: PASS
- Upgrade 156 → 157: PASS
- Repeat Lauf 1: PASS
- Repeat Lauf 2: PASS
- Migrationen 153–156 bytegleich zum vorgefundenen lokalen Stand: PASS
- DB-Lint `--fail-on error`: PASS
- neue DB-Lint-Warnungen aus Migration 157: 0
- RLS, ACLs, Rollenmatrix und feste `search_path`-Werte: PASS
- synthetische Vertragsdaten: transaktional zurückgerollt beziehungsweise
  durch abschließenden Fresh-Reset entfernt

## Testmatrix

Die SQL- und statischen Matrizen bestätigen:

- 79/80/89/90/100/OVER_LIMIT und sofortige höhere Eskalation
- Wiederholung ohne Duplikat
- Prognose 80/90/100, weniger als 28 Tage, exakt 28 Tage, fehlende Basis,
  negatives Wachstum und konservative Rundung
- Plan-/Add-on-Limiterhöhung, Add-on-Ende, Downgrade und Payment-Failure über
  den unveränderten Resolververtrag
- sechs Tage ohne Rearm, sieben vollständige Tage mit Rearm
- Acknowledge ohne Rearm
- 100-/OVER_LIMIT-Reminder vor sieben Tagen blockiert und danach erlaubt
- Prognose→tatsächlich ohne zweite Episode
- App-/E-Mail-Kanalzustände getrennt
- E-Mail-Retry ohne zweite Queue-Zeile, Quiet Hours und Zeitzonen-Fallback
- Seite öffnen ohne Write; Drawer X/Escape/Abbrechen ohne Write
- Owner-Tenant-Isolation; Staff, Customer und Anonymous blockiert
- keine PII-, Entitlement- oder Businessdatenänderung
- bestehende Offer-/Customer-Enforcement-Verträge weiterhin PASS

Parallelität mit `pgbench`:

- 24 identische Evaluationsrequests: 24/24 erfolgreich, genau eine Episode
- 24 Zustellreservierungen: 24/24 erfolgreich, genau ein E-Mail-Lease
- 24 parallele Acknowledge-Aufrufe: 24/24 erfolgreich, genau ein Audit
- 24 parallele Rearm-Aufrufe: 24/24 erfolgreich, genau ein Resolve-Audit
- konkurrierende 80/90/100-Aktivierungen: höchste Stufe 100 offen,
  maximal eine offene Episode je Stufe

## UI, Sprachen und Responsive

Chromium und WebKit wurden physisch mit dem synthetischen lokalen Owner bei
320, 375, 390, 430, 767, 768, 1024 und 1440 CSS-px geprüft. DE/EN/FR/IT/ES/ZH/KO
renderten ohne Fehler auf der Zielseite. Warnkarte und Acknowledge waren
sichtbar, alle sichtbaren Buttons/Links mindestens 44 CSS-px groß und es gab
keinen horizontalen Overflow. Drawer X, Escape und Abbrechen erzeugten null
schreibende Requests. Der lokale Acknowledge-Test änderte nur das synthetische
App-Zustellungs-Flag.

## Technische Gates

- Focused Capacity-/Warning-Tests: PASS, 17/17
- lokale SQL-Verträge: PASS
- Parallelitätsmatrix: PASS
- Full Tests: PASS, 1923/1923
- Typecheck: PASS
- Lint: PASS, 0 Fehler; acht vorbestehende Warnungen außerhalb des Scopes
- Build: PASS mit lokalen nicht geheimen Platzhaltern; bekannte
  Vite-Chunk-Größenwarnung
- Secret-Scan: PASS
- `git diff --check`: PASS

## Was nicht geändert wurde

- Migrationen 153–156
- Business-, Billing-, Stripe-, Subscription-, Grant- oder Entitlement-Logik
- Staging oder Production
- bestehende Offer-/Customer-Enforcement-Autorität
- Country Gate, AT + PRO Lock und TEST_ONLY-Verträge

Kein Commit, Push, Staging-Zugriff, Deployment, echter E-Mail-Versand, reale
App-Nachricht, reale Owner-Bestätigung oder reale Datenänderung wurde
ausgeführt.

## Risiken und Status

Der Stand ist vollständig lokal geprüft. Migration 157 und die App-Anpassung
sind nicht auf Staging angewendet und nicht deployed; deshalb ist kein
Staging Lock oder FINAL LOCK zulässig.

## Artefakte und Prozessbereinigung

- Report:
  `docs/reports/2026-09-21_PHASE_7C_5B_CAPACITY_WARNING_DISPATCHER_REPORT.md`
- Secret-freies Prüf-ZIP:
  `exports/2026-09-21_PHASE_7C_5B_CAPACITY_WARNING_DISPATCHER.zip`
- Task-eigene Hintergrundprozesse gestartet: 1 (Vite-QA-Server)
- Task-eigene Hintergrundprozesse gestoppt: 2 (Vite-QA-Server und der bereits
  laufende task-eigene lokale Supabase-Stack)
- Task-eigene Hintergrundprozesse weiterhin aktiv: 0
- Fremde Prozesse und Container verändert: Nein; `welcome-to-docker` blieb
  unverändert aktiv
- RAM-Cleanup: PASS

Status: **PHASE 7C.5B LOCAL CODE LOCK**
