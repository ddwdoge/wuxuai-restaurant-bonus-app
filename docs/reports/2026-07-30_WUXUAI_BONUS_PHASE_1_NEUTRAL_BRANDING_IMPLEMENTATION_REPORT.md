# WUXUAI Bonus – Phase 1 Neutral Branding Implementation Report

Datum: 2026-07-30  
Branch: `codex/v13-legal-maps-hardening`

## Ursache

Die sichtbare Produktsprache war historisch auf Restaurants zugeschnitten.
Dadurch erschienen Produktname, Einstiege, Rollen, Einstellungen und
Onboarding branchenspezifisch, obwohl WUXUAI Bonus künftig lokale Unternehmen
neutral ansprechen soll.

## Umsetzung

- Der sichtbare Produktname lautet `WUXUAI Bonus`.
- Der Leitsatz lautet `Kundenbindung für lokale Unternehmen`.
- Gemeinsame Begriffe liegen zentral in
  `src/config/productTerminology.ts`.
- Die öffentliche Startseite zeigt genau zwei Einstiege:
  `Betreiber-Login` und `Kunden-Bonus öffnen`.
- Login, Registrierung, Betreiber-Shell, Dashboard, Einstellungen, QR Center,
  Onboarding, Kundenportal, Teambereich, Berichte und Plattformansichten wurden
  im sichtbaren Scope neutralisiert.
- Die sichtbaren Onboarding-Schritte lauten: Unternehmen, Aussehen, Geöffnet,
  Punkteeinlösung, Willkommensgeschenke, Rechtliches und Startklar.
- Browser-Titel und öffentliche Meta-Beschreibung verwenden das neutrale
  Branding.
- Die Terminologiematrix dokumentiert neutralisierte, interne,
  branchenspezifische und rechtlich sensible Begriffe.

## Unverändert

- Datenbanktabellen, Spalten und Constraints
- RPC-Signaturen und API-Verträge
- RLS-Policies und Rollenprüfung
- bestehende Routen und interne Komponentenbezeichnungen
- Punkte-, Reward-, QR-, Tenant-, Audit- und Auth-Logik
- rechtliche Mastertemplates und veröffentlichte Dokumentinhalte

Interne technische Namen mit `restaurant` sind als
`INTERNAL_LEGACY_NAMING_ACCEPTED` klassifiziert. Rechtliche Inhalte bleiben
`LEGAL_REVIEW_REQUIRED`; eine mechanische Wortersetzung wäre fachlich riskant.

## Geänderte Bereiche

- `src/config/productTerminology.ts`
- öffentliche Startseite und Auth-Seiten
- Betreiber-Shell, Dashboard, Onboarding und Verwaltungsseiten
- Kundenportal, Partnerfinder und QR-Einstiege
- Teambereich und Einlösefehlertexte
- Legal-Center-Beschriftungen und Plattformansichten
- Browser-Metadaten, relevante Styles und Regressionstests
- Engineering Bible, Changelog und Terminologiematrix

## Prüfung

- Öffentliche Startseite: 390, 430, 768, 1280 und 1440 px ohne horizontalen
  Overflow geprüft.
- Login: 390 und 1440 px ohne horizontalen Overflow geprüft.
- Registrierung: 390 und 1440 px ohne horizontalen Overflow geprüft.
- öffentlicher Kunden-Einstieg: 390 und 1440 px ohne horizontalen Overflow
  geprüft.
- Geschützte Betreiber-, Onboarding- und Teambereiche konnten in der isolierten
  Browser-Sitzung ohne authentifizierte Testrolle nicht vollständig visuell
  abgenommen werden.
- Ein physischer 200-Prozent-Browserzoom wurde nicht abschließend bestätigt.
- Ein PWA-Manifest ist im Repository nicht vorhanden; der bestehende Service
  Worker enthält keinen abweichenden sichtbaren Produktnamen.
- Keine sichtbaren E-Mail-Templates wurden im geprüften Scope gefunden.

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bereits bestehende Warnungen
- Tests: 341 von 341 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Migration: keine
- RLS/Security: nicht verändert
- Push, Merge und Deployment: nicht durchgeführt

## Prüfartefakt

Vollständiges Projekt-Prüf-ZIP:

`exports/2026-07-30_WUXUAI_BONUS_PHASE_1_NEUTRAL_BRANDING_IMPLEMENTATION.zip`

Ausgeschlossen sind Git-Metadaten, `node_modules`, lokale `.env`-Dateien,
Build-Ausgaben, ältere ZIP-Exporte und Secrets.

## Risiken

- Geschützte Ansichten benötigen noch die visuelle Abnahme mit realen
  Betreiber- und Teamrollen.
- 200-Prozent-Zoom und ein physischer Mobile-Safari-Lauf bleiben visuelle
  Review-Gates.
- Rechtliche Mastertexte benötigen eine separate fachjuristische Prüfung vor
  einer eventuellen sprachlichen Neutralisierung.

## Status

`READY_FOR_VISUAL_REVIEW`
