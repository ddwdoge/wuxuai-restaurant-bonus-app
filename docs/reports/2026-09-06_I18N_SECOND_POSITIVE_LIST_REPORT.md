# WUXUAI Bonus - zweite sichere i18n-Positivliste

## Ursache

Der erste Quellscan erfasste JSXText und statische sichtbare Attribute, jedoch nicht alle sichtbaren Texte aus JSX-Ausdrücken, Bedingungen, Templates, Konkatenationen, UI-Konfigurationen und Copy-Helpern. Die physische QA zeigte dadurch deutsche Resttexte in nichtdeutschen Oberflächen.

## Inventur

| Klasse | Anzahl |
| --- | ---: |
| `STATIC_UI_COPY_EXTERNAL_OK` | 755 |
| `LEGAL_UI_LABEL_EXTERNAL_OK` | 265 |
| Gesamt extern geeignet | 1.020 |
| `LEGAL_DOCUMENT_BODY_LOCAL_ONLY` | 9 |
| `PERSONAL_OR_EXAMPLE_DATA_LOCAL_ONLY` | 5 |
| `TECHNICAL_IDENTIFIER_LOCAL_ONLY` | 16 |
| `OWNER_OR_USER_CONTENT_LOCAL_ONLY` | 0 |
| `INTERNAL_LOG_DEBUG_LOCAL_ONLY` | 0 |
| Texte mit Placeholder-Signatur | 105 |
| Sichtbar und unklassifiziert | 0 |

Die maschinenlesbare Liste mit Fundstellen, Klassifikation und Placeholdern steht in `docs/reports/2026-09-06_I18N_SECOND_POSITIVE_LIST.json`. Die eigentliche Übergabedatei liegt ausschließlich lokal unter `/private/tmp/wuxuai-second-approved-ui-copy.json`.

## Datenschutzprüfung

- Personen-/E-Mail-/Telefon-/Adress-/UUID-Daten in externer Liste: 0
- echte Restaurant-, Kunden- oder Owner-Laufzeitwerte: 0
- Legal-Dokumentkörper oder ausgeschlossene rechtliche Klauseln in externer Liste: 0
- Secrets, API-Schlüssel, Providerwerte oder Projekt-Refs in externer Liste: 0
- Staging-/Production-Geschäftsdaten: 0

Template-Ausdrücke enthalten ausschließlich statische Placeholder-Schemata wie `${name}` oder `${offer.title}`. Es werden keine Laufzeitwerte aufgelöst oder gespeichert.

## Legal-Abgrenzung

Kurze Bedienelemente, Status- und Zustimmungstexte werden als `LEGAL_UI_LABEL_EXTERNAL_OK` vorgeschlagen. Rechtliche Disclaimer, Klauselprosa und Dokumentkörper bleiben `LEGAL_DOCUMENT_BODY_LOCAL_ONLY`. Dynamische Inhalte aus `rendered_text` und `draft_rendered_text` werden nicht extrahiert.

## Leakage-Detektor

`scripts/audit-i18n-german-leakage.mjs` meldet fehlende Recovery-Schlüssel und nichtdeutsche Katalogwerte, die noch dem deutschen Original entsprechen. Erwarteter Ausgangsstand vor einer zweiten Übersetzungsfreigabe: 1.020 Treffer je EN, FR, IT, ES, ZH und KO. Der Detektor meldet keinen falschen grünen Zustand.

## Was wurde nicht geändert

- keine Übersetzung der zweiten Liste
- keine externe Übermittlung
- kein Staging-Deployment
- keine Production-Änderung
- keine Datenbank-, RLS-, Rollen- oder Businesslogikänderung

## Verifikation

- fokussierte Positivlisten-/Placeholder-/Leakage-Tests: 5/5 PASS
- vollständige Tests: 1327/1327 PASS
- Typecheck: PASS
- Lint: PASS (0 Fehler, 9 bestehende Warnungen)
- Build: PASS mit ausschließlich Staging-Buildvariablen
- Secret Scan: PASS
- `git diff --check`: PASS
- externe Übermittlung in dieser Aufgabe: NEIN
- Production geändert: NEIN

## Freigegebener Übersetzungslauf

Der Founder hat die externe Übersetzung der exakt 1.020 freigegebenen Texte
für `translate.googleapis.com` genehmigt. Der serielle Lauf hat folgende
Checkpoint-Stände sicher gespeichert:

- EN: 1.020/1.020
- FR: 1.020/1.020
- IT: 1.020/1.020
- ES: 1.020/1.020
- ZH: 1.020/1.020
- KO: 20/1.020

Google beantwortet den nächsten offenen KO-Batch auch nach zehn Minuten Pause
weiterhin mit HTTP `429`. Es wurde
kein anderer Anbieter, kein paralleler Request und keine Browser-Weiterleitung
verwendet. Die ausgeschlossenen 30 Texte und alle dynamischen Laufzeitdaten
blieben lokal.

Der lokal generierte Zwischenkatalog verwendet für offene Einträge bewusst den
deutschen Quelltext als Fallback und ist nicht für ein Deployment freigegeben.
Der Leakage-Detektor meldet `ready=false`; eine physische Staging-QA und ein
Staging-Deployment wurden deshalb nicht begonnen. Der konsistente Zwischenstand
besteht 1.328/1.328 Tests, Typecheck, Build, Secret Scan und
`git diff --check`; Lint meldet 0 Fehler und 9 bestehende Warnungen.

## Status

`NOT READY - GOOGLE TRANSLATE HTTP 429 AT KO 21`
