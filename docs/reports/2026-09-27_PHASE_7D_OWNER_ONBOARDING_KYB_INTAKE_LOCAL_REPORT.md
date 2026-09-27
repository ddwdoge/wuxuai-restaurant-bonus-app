# Phase 7D – Owner-Onboarding und KYB-Intake

Stand: 27.09.2026
Status: **STAGING TECHNICAL LOCK / SYNTHETIC TEST_ONLY KYB INTAKE PASS / REAL KYB AND COMMERCIAL ACTIVATION BLOCKED**

## Ursache

Der bisherige KYB-Submit war an die kommerzielle Länderfreigabe gebunden. Österreich ist weiterhin nur `prepared`; dadurch konnte auch ein exakt markierter synthetischer `TEST_ONLY`-Betrieb in `PENDING_ACTIVATION` keine Unterlagen zur technischen Vorprüfung einreichen. Zusätzlich wurden Angaben für den späteren Dokumentabgleich teilweise nochmals im KYB-Bereich erfasst.

## Geänderte Architektur

- Das geführte Owner-Onboarding und die bestehenden Unternehmensdaten erfassen die strukturierten AT-Abgleichsdaten einmalig.
- Die KYB-Seite zeigt vor dem Upload ausschließlich eine Zusammenfassung dieser Daten und führt Korrekturen zurück zu den Unternehmensdaten.
- Migration 178 trennt KYB-Intake von kommerzieller Country Readiness.
- Reale Dokumenteinreichung bleibt blockiert, solange Legal-, Privacy-, Dokumentkatalog- und Aufbewahrungsentscheidungen nicht verifiziert sind.
- Der synthetische Staging-Pfad ist nur für die exakte Kombination `STAGING` + registrierter `TEST_ONLY`-Tenant + `PENDING_ACTIVATION` freigegeben.
- `commercial_activation_allowed=false` bleibt autoritativ. Country Release, Trial, Entitlements, Grants, Billing und Stripe werden nicht aktiviert oder verändert.

## Lokale Nachweise

- Migration 178 Fresh Replay: PASS (178/178)
- Upgrade 177→178: PASS
- Repeat 1/2: leer
- DB-Lint (`error`): PASS
- fokussierte Source-Tests: 17/17 PASS
- SQL Rollen-/Tenant-/Fail-closed-Matrix: PASS, Transaktion vollständig zurückgerollt
- Full Suite: 2.065/2.065 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 8 vorbestehende Warnungen
- Build: PASS mit nicht-produktiven lokalen Platzhalterwerten für den Build-Guard
- Secret Scan und Diff Check: PASS
- Migration-178-SHA-256: `6cc3c32b0eefc4760fb396d159fac6cfd2d232683b49f872e8d41d5cfac3ac34`
- Migrationen 001–177: unverändert

## Source- und Deployment-Parität

- Ausgangs-Remote: `64466607ae0a7c42e25d9bd21d393d2ad3e975c4`
- Bekannte Vorcommits: `dc3295a3482bd8a616bce1efa557f435b68573dd` und `12db52eac1f10161f671e9652b9b239e11ab8f5b`
- Implementierungscommit: `113abcff743407a5cdda4274ac34e4efb3c364be`
- Alle drei Commits wurden ohne Force, Merge oder Rebase per Fast-forward auf
  `codex/v1-release-integration` übertragen.
- Frischer Remote-Abgleich nach dem Push: `0/0` zu `113abcff743407a5cdda4274ac34e4efb3c364be`.
- Die Workers-Build-Konfiguration baut ausschließlich die Assets des bekannten
  Staging-Workers. Sie enthält keinen Migrationsaufruf. Der Git-Push erzeugte
  eine neue, zunächst nicht aktive Version und führte keine Datenbankmigration aus.
- Aktiver Staging-Worker: `wuxuai-restaurant-bonus-app-staging`
- Aktive Version: `ae2d6d65-3e64-4186-9ca9-1aee8dbeb5d7`
- Aktives Deployment: erstellt am `2026-09-27T13:12:42.371Z`, Nachricht
  `Phase 7D KYB intake commit 113abcf`.
- Staging lieferte nach dem kontrollierten Deployment HTTP 200 und die erwarteten
  neuen Assetnamen. Production wurde nicht aufgerufen oder verändert.

## Staging-Migration und Runtime-Bindung

- Projektidentität vor der Änderung: verifiziertes Staging-Projekt
  `bwhvfjuwixgwduoeqaya` / `wuxuai-bonus-staging`.
- Ausgangsstand: 177/177; ausschließlich Migration 178 war offen.
- Migration 178 wurde einmal auf Staging angewendet.
- Endstand: 178/178.
- Repeat-Dry-Run: leer (`Remote database is up to date`).
- DB-Lint auf Fehlerstufe: PASS, keine Ergebnisse.
- Die private serverseitige Environment-Bindung stand zuvor fail-closed auf
  `DISABLED`. Sie wurde im verifizierten Staging-Projekt eng auf `STAGING`
  gesetzt und mit einer aufgabenbezogenen Change-Referenz versehen. Es wurde
  weder ein Secret noch eine Production-Konfiguration verändert.
- Der Resolver akzeptiert weiterhin nur die Kombination `STAGING` + registrierter
  `TEST_ONLY`-Tenant + Restaurant und Subscription in `pending_activation`.
  Die Kennzeichnung „synthetisch“ wird nicht aus Dateiinhalten abgeleitet.

## Physischer synthetischer Staging-Flow

Verwendet wurde ausschließlich der autorisierte synthetische Betrieb
`WUXUAI TEST owner test 7d`. Der LEGACY-Tenant blieb unberührt.

### Owner

- Strukturierte AT-Unternehmens- und Vertretungsdaten wurden einmalig in den
  Unternehmensdaten gespeichert. Die KYB-Seite zeigte diese Daten als kompakte
  Zusammenfassung und verlinkte Korrekturen zurück zum Stammdaten-Schritt.
- Die Seite bezeichnete GISA-Auszug und Identitätsnachweis der Vertretung klar
  und wies ausdrücklich darauf hin, dass Pflichtnachweise und Aufbewahrungsfristen
  noch nicht rechtsverbindlich festgelegt sind.
- Einreichung: PASS; Status blieb `PENDING_ACTIVATION`.
- Upload eines harmlosen, eindeutig synthetischen GISA-Testdokuments: PASS.
- Privater Owner-Download: PASS.
- Versionierter Ersatz: PASS; Fassung 2 ist `UPLOADED`, Fassung 1 blieb als
  `SUPERSEDED` erhalten und wurde nicht gelöscht.
- Upload eines synthetischen Identitätsnachweises der Vertretung: PASS.

### Platform Admin mit TOTP/AAL2

- AAL2-geschützte Queue: PASS; exakt der synthetische Betrieb war als
  `PENDING_ACTIVATION` mit drei Nachweisen sichtbar.
- Dokumentansicht: PASS; GISA Fassung 2, GISA Fassung 1 und Identitätsnachweis
  Fassung 1 wurden mit Status und Version angezeigt.
- Sicherer privater Dokumentzugriff: PASS; der aktuelle GISA-Nachweis wurde über
  den geschützten Objektzugriff geöffnet. Keine signierte URL wurde protokolliert.
- Append-only Verlauf: PASS; Reservierung, Upload-Abschluss und Ersetzung wurden
  getrennt ausgewiesen. Historische Dokument- und Auditzeilen wurden nicht
  verändert oder gelöscht.
- Keine Review-, Freigabe-, Aktivierungs- oder TEST_ONLY-Grant-Aktion wurde in
  der Adminansicht ausgelöst.

## Negative Nachweise und Evidenzgrenze

- Lokale direkte SQL-/Rollenmatrix: Owner des falschen Tenants, Staff, Customer,
  Anonymous, AAL1 und nicht gebundene Umgebung werden fail-closed abgewiesen.
- Physischer Staging-Direktzugriff aus einem nicht berechtigten Portal-Kontext:
  PASS; kein Platform-Admin-Zugriff und keine KYB-Daten sichtbar.
- Physischer positiver Adminzugriff erfolgte ausschließlich mit TOTP/AAL2.
- Eine separate physische Staging-Wiederholung jeder einzelnen negativen Rolle
  wurde in diesem Lauf nicht erzwungen; dafür wird kein eigenständiger physischer
  PASS behauptet. Die serverseitigen direkten Tests und RLS-/RPC-Verträge sind
  der dauerhafte Nachweis.

## Datenwirkung

Erwartete und beobachtete, ausschließlich synthetische Writes:

- ein KYB-Fall und eine Owner-Einreichung für den TEST_ONLY-Betrieb;
- eine Profilrevision;
- drei Dokumentzeilen: zwei GISA-Versionen und ein Identitätsnachweis;
- append-only Dokumentereignisse und Evidence-Metadaten;
- private Storage-Objekte für die synthetischen PDFs.

Unverändert beziehungsweise weiterhin fail-closed:

- Restaurantstatus und Subscription: `pending_activation`;
- Trial-Start und Trial-Claim: 0;
- Stripe Customer/Subscription: nicht gesetzt;
- PRO-Grant, Entitlement und Aktivierung: 0;
- AT: `Vorbereitet · Nicht live`; öffentliche Aktivierung gesperrt;
- Legal, Datenschutz, Steuer, Abrechnung, Stripe, Übersetzungen,
  technischer Funktionstest und erforderliche Rechtsdokumente: nicht konfiguriert;
- Customer-Mail-Scheduler: deaktiviert;
- Production, Stripe und LEGACY-Tenant: unverändert.

Die synthetischen Storage- und Auditobjekte bleiben gemäß dem vorgesehenen
append-only Verfahren erhalten. Es wurde keine physische Löschung ausgeführt.

## Offene Rechtsentscheidungen

- abschließender Dokumentkatalog je Rechtsform
- Pflicht- beziehungsweise optionale Einordnung der Dokumenttypen
- zulässige Dateiformate und Inhaltsanforderungen aus rechtlicher Sicht
- Aufbewahrungs- und Löschfristen
- Datenschutzinformation und Rechtsgrundlage für KYB-Unterlagen
- Vollmachts- und Vertretungsnachweise je Rechtsform
- Regeln für reale Einreichung und manuelle Freigabefähigkeit

## Status

**PHASE 7D OWNER ONBOARDING AND KYB INTAKE STAGING TECHNICAL LOCK / SYNTHETIC TEST_ONLY OWNER-ADMIN FLOW PASS / REAL KYB, COMMERCIAL ACTIVATION AND PRODUCTION BLOCKED**

Production, Stripe, Customer-Mail-Scheduler und der LEGACY-Tenant wurden nicht verändert.
