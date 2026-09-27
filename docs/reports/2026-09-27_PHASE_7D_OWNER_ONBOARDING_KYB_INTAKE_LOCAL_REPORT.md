# Phase 7D – Owner-Onboarding und KYB-Intake

Stand: 27.09.2026
Status: **LOCAL CODE LOCK / STAGING-ANWENDUNG AUSSTEHEND**

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

## Noch nicht ausgeführt

- erfolgreicher frischer GitHub-Fetch und Fast-forward-Push
- Anwendung der Migration 178 auf Staging
- Cloudflare-Staging-Autobuild des neuen Source-Stands
- positiver synthetischer Owner-Upload-/Versions-/Download-Flow
- Platform-Admin-AAL2-Ansicht des synthetischen Falls
- negative physische Rollen- und Tenant-Prüfungen auf Staging

## Offene Rechtsentscheidungen

- abschließender Dokumentkatalog je Rechtsform
- Pflicht- beziehungsweise optionale Einordnung der Dokumenttypen
- zulässige Dateiformate und Inhaltsanforderungen aus rechtlicher Sicht
- Aufbewahrungs- und Löschfristen
- Datenschutzinformation und Rechtsgrundlage für KYB-Unterlagen
- Vollmachts- und Vertretungsnachweise je Rechtsform
- Regeln für reale Einreichung und manuelle Freigabefähigkeit

Production, Stripe, Customer-Mail-Scheduler und der LEGACY-Tenant wurden nicht verändert.
