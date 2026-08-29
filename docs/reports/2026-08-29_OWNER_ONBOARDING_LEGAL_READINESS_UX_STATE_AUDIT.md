# WUXUAI Bonus - Owner Onboarding und rechtliche Freigabe

Datum: 2026-08-29  
Branch: `codex/v1-canonical-recovery`  
Produktionsstatus: LOCKED  
Stripe: DEFERRED

## Ursache

### Willkommensgeschenke

Die Auswahl verwendete ab 360 Pixel weiterhin
`grid-template-columns: repeat(2, minmax(0, 1fr))`. Nur unter 360 Pixel wurde
auf eine Spalte gewechselt. Dadurch wurden Geschenkekarten und der horizontal
angeordnete Empfehlungstext auf typischen iPhone-Breiten abgeschnitten.

### Rechtliche Freigabe

Die Seite lud zwar den autoritativen serverseitigen Vertrag
`get_restaurant_legal_setup`, leitete die sichtbare Veröffentlichung aber
zusätzlich lokal nur aus `hasDrafts` ab. Bei fehlenden aktiven
Pflichtdokumenten und gleichzeitig fehlenden Entwürfen entstand dadurch:

```text
Pflichtdokumente: Offen
Veröffentlichung: Erledigt
Kundenregistrierung: Blockiert
```

Die Veröffentlichung war damit nicht an die vom Server gemeldete Anzahl
aktiver Pflichtdokumente gebunden.

## Autoritativer Vertrag

Es wurde keine zweite Backend-Autorität eingeführt. Die bestehende
`SECURITY DEFINER`-Kette bleibt unverändert:

```text
get_restaurant_legal_setup(restaurant_id)
-> restaurant_registration_readiness(restaurant_id, current_date)
-> missing_profile_fields
-> active_required_documents
-> draft_documents
-> program_active
-> registration_allowed
```

Der neue `resolveOwnerLegalReadiness` übersetzt ausschließlich diese Daten in
verständliche Owner-Zustände. Er erteilt selbst keine Freigabe.

## Geänderte Dateien

- `src/modules/legal/ownerLegalReadiness.mjs`
- `src/modules/legal/ownerLegalReadiness.d.mts`
- `src/modules/legal/OwnerLegalSettingsPage.tsx`
- `src/modules/admin/admin-premium.css`
- `src/styles.css`
- `tests/owner-onboarding-legal-readiness.test.mjs`
- `tests/automated-legal-onboarding.test.mjs`
- `tests/owner-legal-points-validity-null.test.mjs`
- `docs/19_CHANGELOG.md`
- dieser Report

## Was wurde geändert

- Kompakte Owner-Reise mit drei Schritten: Unternehmensdaten, Dokumente prüfen,
  veröffentlichen.
- Separate sichtbare Zustände für Bonusprogramm und Kundenregistrierung.
- Veröffentlichung ist nur erledigt, wenn zwei aktive Pflichtdokumente vorliegen
  und kein offener Entwurf besteht.
- Kontextabhängige Hauptaktion:
  `Dokumente vorbereiten`, `Dokumente prüfen`,
  `Geprüfte Version veröffentlichen` oder `Dokumente ansehen`.
- Dokumentdetails und Vorlagenhinweis sind kompakt aufklappbar.
- Technische Dokumenthüllen-Sprache wurde durch verständliche Owner-Texte
  ersetzt.
- Vor dem Publish-RPC werden Datum, beide Pflichtentwürfe, Vorlage, Inhalt und
  Vorschau einzeln validiert.
- Willkommensgeschenke werden bei 320 bis 699 Pixel in genau einer Spalte
  angezeigt; Empfehlungstext steht darunter.

## Was wurde nicht geändert

- Keine automatische Dokumentannahme oder Veröffentlichung.
- Keine Änderung an `restaurant_registration_readiness` oder dem
  Registrierungs-Gate.
- Keine Änderung an Legal-Versionen, Historie oder Audit.
- Keine RLS-, Grant- oder RPC-Änderung.
- Keine Änderung an Auswahlgrenzen oder zufälliger Zuteilung der
  Willkommensgeschenke.
- Keine Production-Aktion und kein Deployment.

## Tests

- Gezielte Legal-/Onboarding-Tests: 67/67 PASS.
- Vollständige autoritative Suite: 1103/1103 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler, 7 bestehende Warnungen.
- Build mit vorhandener lokaler Staging-Konfiguration: PASS.
- `git diff --check`: PASS.
- Diff-Secret-Scan: PASS.

## Responsive Prüfung

Lokale Browser-Geometrie mit realen CSS-Regeln und den geänderten Komponenten:

| Breite | Ergebnis |
| --- | --- |
| 320 | PASS |
| 375 | PASS |
| 390 | PASS |
| 414 | PASS |
| 430 | PASS |
| 768 | PASS |
| 1024 | PASS |
| 1440 | PASS |

Kein globaler horizontaler Überlauf und keine abgeschnittenen Status- oder
Geschenketexte. Repräsentative Textlängen für DE, EN, FR, IT und ES wurden bei
320 bis 430 Pixel ohne Überlauf geprüft. Die sichtbare V1-Produktsprache bleibt
gemäß Engineering Bible Deutsch.

## Statusmatrix

- COMPANY_DATA_READY: aus `missing_profile_fields`.
- DOCUMENTS_PREPARED: Pflichtentwürfe oder aktive Pflichtdokumente vorhanden.
- DOCUMENTS_REVIEWED: sichtbare Prüfung/Bestätigung vor Publish; kein neuer
  persistenter Rechtsstatus erfunden.
- DOCUMENTS_PUBLISHED: zwei serverseitig aktive Pflichtdokumente, kein offener
  Entwurf.
- CUSTOMER_REGISTRATION_ENABLED: ausschließlich
  `registration_allowed = true`.

## Sicherheitsprüfung

RLS und Grants wurden nicht verändert. Die bestehenden Tests bestätigen:

- Owner-/Tenant-Prüfung erfolgt serverseitig.
- `anon` besitzt kein Veröffentlichungsrecht.
- Staff besitzt kein Veröffentlichungsrecht.
- Historische Legal-Versionen und Kundenbestätigungen bleiben unverändert.
- Veröffentlichung benötigt weiterhin ausdrückliche Bestätigung.

## Offene Risiken

Der geänderte Build wurde nicht auf Staging ausgerollt. Deshalb wurde kein
neues reales Restaurant vollständig durch Onboarding, Dokumentprüfung,
Veröffentlichung und anschließende Kundenregistrierung geführt. Die lokale
Logik, Responsive-Matrix und autoritativen Verträge sind geprüft; für
`FINAL LOCK` bleibt ein kontrollierter Staging-E2E nach Deployment erforderlich.

## Finale Klassifikation

```text
WELCOME GIFT MOBILE ROOT CAUSE:
Two-column grid remained active from 360px upward.

WELCOME GIFT MOBILE: PASS
HORIZONTAL CLIPPING: NO

LEGAL CONTRADICTORY STATE ROOT CAUSE:
Publication completion was inferred from !hasDrafts instead of active required documents.

ONE READINESS CONTRACT: PASS
IMPOSSIBLE STATE: BLOCKED
COMPANY DATA STATUS: PASS
DOCUMENT STATUS: PASS
PUBLICATION STATUS: PASS
CUSTOMER REGISTRATION STATUS: PASS
BONUS PROGRAM STATUS: PASS
EXACT VALIDATION ERRORS: PASS
DOCUMENT PREPARE: PASS
DOCUMENT REVIEW: PASS
DOCUMENT PUBLISH: PASS (contract/local; live Staging pending)
REGISTRATION BEFORE PUBLISH: BLOCKED
REGISTRATION AFTER PUBLISH: ENABLED (contract/local; live Staging pending)
NO MANUAL REFRESH: PASS (RPC response replaces local setup immediately)
DE/EN/FR/IT/ES: PASS (layout stress test; V1 UI remains German)
320-1440: PASS
BUSINESS LOGIC CHANGED: NO
LEGAL GATE WEAKENED: NO
DB MIGRATION: NONE
TESTS: 1103/1103 PASS
OWNER ONBOARDING + LEGAL READINESS FINAL READY: NO - STAGING E2E PENDING
PRODUCTION: LOCKED
STRIPE: DEFERRED
```

Status: **CODE LOCK**
