# I18N / Legal Architecture Phase 1 Report

## Ursache

Die E-Mail-Schicht unterstützt bereits sieben Sprachen, während die sichtbare UI überwiegend deutsch und dezentral hartcodiert ist. Das bestehende Rechtsmodell versioniert Dokumente und Annahmen, speichert aber den Rechtsraum nicht explizit je Dokumentversion. UI-Sprache und Rechtsraum durften deshalb vor einer Vollübersetzung nicht gekoppelt werden.

## Geänderte Dateien

- zentrale UI-Sprach-, Katalog- und Formatter-Module
- Rechtsraum-Resolver für Anwendung und Datenbank
- Forward-Migration `20260906001000_i18n_legal_jurisdiction_architecture.sql`
- lesende Platform-Admin-Anzeige und Service-RPC
- direkte Architektur-, Fallback-, Rollen- und RLS-Tests
- reproduzierbares Hardcoding-Inventar
- Architektur-, Datenbank-, Admin- und Changelog-Dokumentation

## Was wurde geändert

- Exakter Sprachvertrag DE/EN/FR/IT/ES/ZH/KO eingeführt.
- Auswahlfolge explizit → Gerät/Browser → EN zentralisiert.
- Bestehende E-Mail-Sprachlogik ohne Verhaltensänderung auf gemeinsame Kennungen ausgerichtet.
- Rechtsraum wird aus rechtlicher Organisationsadresse oder dem dafür bestimmten Geschäftsstandort ermittelt.
- Dokumentversionen können unveränderbar einem Rechtsraum zugeordnet werden.
- Platform Admin kann den Status lesen, aber nicht Rechtstexte oder Rechtsräume frei ändern.
- 1.906 sichtbare strukturelle UI-Textvorkommen erfasst.

## Was wurde nicht geändert

- keine vollständigen Übersetzungen
- keine länderspezifischen Rechtstexte oder Rechtsberatung
- keine Preise, Stripe-, PRO-, Premium-, Gift-Card- oder POS-Logik
- keine Produkt-, Punkte-, Geschenk-, Angebots-, Auth- oder Mandantenlogik
- keine Production-Konfiguration oder Production-Daten

## Audit-Klassifikation

| Bereich | Zustand |
| --- | --- |
| Owner | HARDCODED, Architektur PREPARED |
| Customer | HARDCODED, Architektur PREPARED |
| Staff | HARDCODED, Architektur PREPARED |
| Platform Admin | HARDCODED, Rechtsraum-Sicht READY |
| Auth | HARDCODED, E-Mail-Templates READY |
| Onboarding | HARDCODED |
| Offers | HARDCODED |
| Points | HARDCODED |
| Gifts | HARDCODED |
| Settings | HARDCODED |
| Support | PARTIAL |
| Emails | READY |

## Migration

Die Migration ist additiv. Sie ändert keine bestehende Annahme und keinen bestehenden Rechtstext. Browserrollen erhalten keinen direkten Tabellenzugriff. Die Platform-Admin-RPC prüft `is_platform_admin()` serverseitig.

- Ziel: Staging `bwhvfjuwixgwduoeqaya`
- Pre-Dry-Run: exakt eine Pending-Migration (`20260906001000`)
- Anwendung: erfolgreich
- Post-Dry-Run: 0 Pending-Migrationen
- Migrationshistorie: lokal/remote synchron bis `20260906001000`
- DB-Linter, Fehlerstufe: 0 Fehler
- Anonymer RPC-Aufruf: HTTP 401, blockiert

## Prüfung

- fokussierte I18N-/Rechtsraumtests: 9/9 PASS
- Platform-Admin-Tests: 53/53 PASS
- vollständige Tests: 1307/1307 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 8 bereits vorhandene Warnungen
- Build mit Staging-Projektvariablen: PASS
- Secret Scan: 0 Treffer
- `git diff --check`: PASS
- Staging Worker: `wuxuai-restaurant-bonus-app-staging`
- Staging Worker Version: `2650056f-2923-4e89-a83a-0af8a3b4f768`
- Production: unverändert
- Prüfexport: `exports/2026-09-06_I18N_LEGAL_ARCHITECTURE_PHASE_1.zip`

## Physischer Staging-Nachweis

- autorisierte Platform-Admin-Identität erreicht `/admin/platform`: PASS
- Anzeige `Sprache & Rechtsraum`: PASS
- geprüfter Tenant: Betriebssprache `Deutsch`, Geschäftsland `AT`, Rechtsraum `AT`, Quelle `Hauptstandort`
- UI-Sprache/Rechtsraum-Trennung sichtbar erklärt: PASS
- fehlende veröffentlichte Dokumentstände werden als nicht verfügbar gezeigt: PASS
- Bearbeitungsmöglichkeit im Legal-/I18N-Panel: keine
- Panel-Überlauf bei 320/375/390/430/768/1024 px: 0
- App-eigene Browserfehler: 0
- beobachteter globaler Überlauf bei exakt 320 px: 6 px in bestehender Registrierungs-Telemetrie, nicht durch das neue Panel verursacht; für die Unified-UI-Phase inventarisiert

## Risiken

- Vollständige UI-Kataloge und physische Layout-QA folgen bewusst erst in den nächsten Roadmap-Phasen.
- Länderspezifische Rechtsinhalte bleiben bis zur rechtlichen Prüfung nicht verfügbar.
- Ein nicht normalisierbares Geschäftsland ergibt wahrheitsgemäß `LEGAL_CONTENT_NOT_AVAILABLE`.

## Status

Code, Migration, DB-Linter, Build, Zugriffsschutz und der autorisierte echte Staging-Flow sind geprüft. Die Phase-1-Architektur ist `FINAL LOCK`. Vollübersetzung, Rechtstexte und der bestehende 320-px-Telemetrieüberlauf bleiben ausdrücklich Folgeaufgaben der festgelegten Roadmap und sind keine Erweiterung dieser Phase.
