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

Vor Anwendung: 178/178. Die Staging-Anwendung, App-Parität und der synthetische
TEST_ONLY-Resttest sind noch nicht ausgeführt. Der geprüfte Worktree besitzt
keinen eigenen `origin`; der read-only Fetch im kanonischen GitHub-Checkout
lieferte innerhalb des kontrollierten Versuchs keine Remote-Antwort und wurde
beendet. Ohne frisch bestätigte Remote-Parität wird weder Migration 179
angewendet noch die App deployt. Bis dahin kein Staging-Lock.

## Offene Rechtsentscheidungen

Dokumentkatalog je Rechtsform, Zweck/Rechtsgrundlage, Verantwortlicher,
Prüferzugriffe, Aufbewahrung/Löschung, öffentliche Pflichtfelder,
Nachforderung/Ablehnung, Vier-Augen-Prinzip, Freigabegültigkeit und erneute
Prüfung. Reales KYB und kommerzielle Aktivierung bleiben gesperrt.

## Status

LOCAL CODE LOCK / STAGING BLOCKED BY REMOTE PARITY / REAL KYB AND COMMERCIAL ACTIVATION BLOCKED
