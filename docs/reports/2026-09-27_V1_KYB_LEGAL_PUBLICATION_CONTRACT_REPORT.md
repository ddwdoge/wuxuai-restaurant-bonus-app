# V1 KYB / Legal Publication Contract Report

Datum: 27.09.2026
Scope: V1 Owner-KYB, öffentliche Betreiberangaben und Rechtstextquelle

## Ursache

Die aktuellen Owner- und KYB-Flows erfassen Unternehmens- und
Vertretungsangaben bereits einmalig und zeigen sie in der KYB-Ansicht zur
Kontrolle. Die öffentliche Legal-RPC konnte Betreiberfelder jedoch direkt aus
dem Owner-Profil beziehen. Eine manuell freigegebene, unveränderbare
Profilrevision war nicht zwingend erforderlich. Das widersprach dem neuen
V1-Vertrag.

## Automatische Registerabfragen

Im ausführbaren KYB-/Legal-Pfad existiert keine automatische externe GISA-,
Firmenbuch-, UID-, Adress- oder Identitätsabfrage und kein entsprechender
Scheduler. Die historisch verwendete Bezeichnung „automatisches Legal-Paket“
bezeichnet ausschließlich die lokale Erzeugung von Dokumententwürfen aus
gespeicherten Owner-Angaben. Sie veröffentlicht und verifiziert keinen
Registertreffer.

## Heutige Feldverwendung

Der öffentliche Legal-Vertrag verwendete bisher Unternehmensname, Rechtsform,
Geschäftsanschrift, Kontakt, optionale Telefon-/Firmenbuch-/UID-/Kammer-/
Aufsichts- und Beschwerdeangaben aus `restaurant_legal_profiles`, das auf das
kanonische `organization_legal_profiles` verweist. Teilnahmebedingungen
verwenden zusätzlich Betreibername/-adresse, Kontakt und Bonusregeln. Private
KYB-Dokumenttabellen und interne Prüfnotizen waren nicht Teil der Public-RPC.

Die vollständige vorgeschlagene Zuordnung und alle rechtlich offenen Felder
stehen in `docs/V1_AT_KYB_LEGAL_FIELD_DOCUMENT_MATRIX.md`.

## Geänderte Dateien und Wirkung

- Migration `20260927003000_manual_kyb_legal_publication_gate.sql`:
  append-only Freigabebindung für genau eine `VERIFIED`-Profilrevision,
  Platform-Admin-/AAL2-Evidenz, Public-RPC-Redaktion, serverseitiger
  Publikations- und Registrierungs-Gate, automatische Re-Review-Pflicht bei
  Stammdatenänderung.
- `LegalCenterPage.tsx`, `legalService.ts`, `legal-center.css`:
  sichtbare Trennung Plattformanbieter / Betreiber / Endnutzer.
- Kanonischer Produktvertrag und Feld-/Dokumentmatrix: aktiver technischer
  Vertrag sowie anwaltlich offene Zuordnungen.
- Fokussierte statische und echte lokale SQL-Sicherheitstests.

## Was unverändert bleibt

- Keine automatische KYB-Freigabe oder Restaurantaktivierung.
- Kein realer Freigabe-Writer; der Vertrag bereitet nur das fail-closed
  Datenmodell vor.
- Keine Änderung an Trial, Entitlements, Grants, Billing, Stripe,
  Country Release oder Customer-Mail-Scheduler.
- Keine historischen Migrationen oder Auditzeilen geändert.
- Keine privaten Dokumente, Ausweise, Objektpfade, signierten URLs oder
  Prüfnotizen in der öffentlichen Antwort.

## Lokale Nachweise

- Focused Source-/Contract-Tests: 21/21 PASS vor Härtung; finale neue Suite
  4/4 PASS.
- Fokussierter realer SQL-Test: PASS. Ohne Freigabe 0 öffentliche
  Betreiberfelder und Veröffentlichung blockiert; nach synthetischer,
  AAL2-gebundener Entscheidung Quell-Gate offen; Stammdatenänderung schließt
  ihn wieder.
- Fresh Replay: 179/179 PASS.
- Upgrade 178→179: PASS.
- Repeat-Dry-Run: leer.
- DB-Lint: 0 Fehler.
- Full Suite: 2.070/2.073 im Standardsandboxlauf; die drei einzigen Fehler
  waren lokale HTTP-Listener mit `EPERM`. Exakt diese 3/3 Tests außerhalb der
  Port-Sandbox PASS. Damit fachlich 2.073/2.073 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler, 8 vorbestehende Warnungen.
- Build: PASS mit ausschließlich lokalen öffentlichen Testbindungen im
  Arbeitsspeicher.
- Migration-179-SHA-256:
  `273d112eec20bcc0b79600930a272f46dc3b351034fc2ac7ee5ea59fc03b303f`.

## Staging

### Source-, Migrations- und Deployment-Parität

- Implementierungscommit: `a3ef543d46f85205aa072694ec7d5a173cfc229e`.
- Der kanonische Remote-Branch `codex/v1-release-integration` wurde unmittelbar
  vor dem Rollout auf exakt denselben Commit geprüft.
- Ausgangsstand: 178/178; der Dry-Run enthielt ausschließlich Migration 179.
- Migration 179 wurde genau einmal auf das verifizierte Staging-Projekt
  angewendet. Endstand: 179/179.
- Repeat-Dry-Run: leer. DB-Lint auf Fehlerstufe: PASS.
- Aktiver Staging-Worker: `wuxuai-restaurant-bonus-app-staging`.
- Aktive Staging-Version: `6a80c61d-abf4-4f70-b71a-06223dad296f`.
- Deploymentmeldung bindet die Version an Commit `a3ef543`; Staging liefert
  HTTP 200 und das neu gebaute Entry-Asset `assets/index-2_fxi-0K.js`.
- Root-Worker und Production-Worker wurden nicht deployt oder verändert.

### Daten- und Sicherheitsnachweis

Vor und nach Migration und Deployment wurden 138 bestehende Relationen über
read-only Tabellenstatistiken verglichen. Keine bestehende Relation änderte
ihre Zeilenzahl. Ausschließlich die neue append-only Relation
`legal_operator_publication_decisions` kam mit 0 Zeilen hinzu. Es wurde keine
Freigabeentscheidung erzeugt.

Der bekannte synthetische TEST_ONLY-Owner-/AAL2-Admin-Flow aus Migration 178
bleibt als bereits physisch belegter Intake-/Dokumentvergleich maßgeblich. In
diesem engen Resttest wurde keine weitere Dokumentversion erzeugt und keine
Freigabeaktion ausgeführt. Die öffentliche Rechtstextseite des bekannten
synthetischen Tenants wurde nach Deployment read-only aufgerufen und blieb wie
vorgesehen fail-closed (`Rechtliches nicht verfügbar`), weil keine manuell
freigegebene Profilrevision und keine final verifizierte Legal-/Privacy-/
Dokumentkatalog-/Retention-Policy vorliegen.

Damit sind technisch belegt:

- Upload, vorhandene vollständige Stammdaten und bestehende Dokumentversionen
  veröffentlichen keine Betreiberangaben und aktivieren den Betrieb nicht;
- private KYB-Dokumente und interne Prüfdaten werden durch die neue Public-RPC
  nicht ausgegeben;
- Restaurant/Subscription bleiben `pending_activation`; Trial, Entitlements,
  Grants, Billing und Stripe wurden nicht verändert;
- reale KYB-Verarbeitung und kommerzielle Aktivierung bleiben gesperrt.

## Offene Rechtsentscheidungen

Dokumentkatalog je Rechtsform, Zweck/Rechtsgrundlage, Verantwortlicher,
Prüferzugriffe, Aufbewahrung/Löschung, öffentliche Pflichtfelder,
Nachforderung/Ablehnung, Vier-Augen-Prinzip, Freigabegültigkeit und erneute
Prüfung. Reales KYB und kommerzielle Aktivierung bleiben gesperrt.

## Status

STAGING TECHNICAL LOCK / MANUAL LEGAL PUBLICATION GATE FAIL-CLOSED / REAL KYB, COMMERCIAL ACTIVATION AND PRODUCTION BLOCKED
