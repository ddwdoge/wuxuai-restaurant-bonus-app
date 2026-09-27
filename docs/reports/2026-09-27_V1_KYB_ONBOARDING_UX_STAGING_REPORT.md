# WUXUAI Bonus V1 – AT-KYB-Onboarding UX und synthetisches Staging-Gate

Datum: 2026-09-27

Scope: rechtlich unabhängige UX-Korrekturen und synthetischer `TEST_ONLY`-Nachweis

Rechtsstatus: `docs/WUXUAI_BONUS_V1_AT_KYB_DECISION_DRAFT.md` bleibt ein Entscheidungsentwurf und ist keine rechtliche Freigabe.

## Ursache

Der bestehende technische KYB-Flow erfasste die wesentlichen strukturierten Angaben bereits im Onboarding und speicherte sie im kanonischen Legal-/KYB-Profil. In der späteren Betriebsverifizierung fehlten jedoch eine konsequente Pflichtfeldkennzeichnung, eine verlässliche gezielte Rücknavigation zum zu korrigierenden Feld sowie ein eindeutig kleiner, touch-tauglicher Korrekturpfad. Rechtlich noch offene Felder und Nachweispflichten durften nicht als bereits verbindlicher Produktvertrag erscheinen.

## Feldabgleich

| Vorschlag aus dem Entscheidungsentwurf | Aktueller technischer Stand | Einordnung |
|---|---|---|
| Land | Im Onboarding erfasst und im Legal-Profil gespeichert | Bereits vorhanden |
| Firmen-/Unternehmensname | Im Onboarding erfasst | Bereits vorhanden |
| Rechtsform | Im Onboarding erfasst; steuert bedingte Felder | Bereits vorhanden |
| Geschäftsanschrift | Im Onboarding erfasst | Bereits vorhanden |
| Kontakt-E-Mail | Im Onboarding/Account-Kontext vorhanden | Bereits vorhanden |
| GISA-Zahl | Für AT im Onboarding erfasst | Bereits vorhanden |
| Vertretungsberechtigte Person und Funktion | Im Onboarding erfasst | Bereits vorhanden |
| Owner ist vertretungsberechtigte Person | Bedingte Angabe im bestehenden Flow | Bereits vorhanden |
| Firmenbuchdaten | Bedingt nach Rechtsform vorhanden | Bereits vorhanden; nur bedingt erforderlich |
| UID | Optional vorhanden | Von Tax-/Billing-Entscheidung abhängig |
| Betriebs-/Anzeigename getrennt vom Rechtsträger | Restaurantname und Legal Name existieren, aber kein neuer eigenständiger KYB-Feldvertrag | Offene Produkt-/Rechtsentscheidung |
| Einzel-/Gesamtvertretung | Kein kanonisches strukturiertes Feld | Technisch fehlend; Rechtsentscheidung erforderlich |
| Exakter Gewerbewortlaut | Kein kanonisches strukturiertes Feld | Technisch fehlend; Rechtsentscheidung erforderlich |
| Vollmachtsdetails | Nur bedingter Nachweis-/Vertretungskontext | Rechtsentscheidung erforderlich |
| Ausweiskopie als Pflicht | Nicht als allgemeine Pflicht implementiert | Bewusst offen; keine neue Pflicht abgeleitet |
| Aufbewahrungsfrist | Nicht endgültig festgelegt | Rechtsentscheidung erforderlich |

Der Upload-Flow fragt die bereits gespeicherten Stammdaten nicht erneut ab. Die Verifikationsseite zeigt eine kompakte Zusammenfassung des kanonischen Legal-Profils und bietet gezielte Korrekturlinks zurück zum jeweiligen Onboarding-/Legal-Feld.

## Geänderte Dateien

Implementierung und Dokumentation wurden in drei eng begrenzten Commits gesichert:

1. `ef727103b2252ba80c839c8bec32bc4368f8d07b` – `fix(kyb): clarify onboarding data corrections`
2. `88168a2e9932c8766484a35788f21a371ccf5ece` – `fix(kyb): preserve targeted profile corrections`
3. `a337fa96bb7a37e2ce379c5b9ab7ee8bb50bf00a` – `fix(kyb): enforce mobile action targets`

Betroffener Scope:

- `docs/WUXUAI_BONUS_V1_AT_KYB_DECISION_DRAFT.md`
- `docs/reports/2026-09-27_AT_KYB_DECISION_DRAFT_REPORT.md`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/legal/OwnerLegalSettingsPage.tsx`
- `src/modules/verification/OwnerBusinessVerificationPage.tsx`
- `src/modules/verification/owner-business-verification.css`
- `tests/phase-7d-kyb-onboarding-ux.test.mjs`

## Was geändert wurde

- Pflichtfelder werden mit `*` und verständlicher Pflichtfeldsemantik gekennzeichnet.
- Firmenbuchangaben werden nur im tatsächlich bedingten Fall als erforderlich dargestellt.
- Die gespeicherten Unternehmensdaten werden in der KYB-Verifikation zusammengefasst; der Upload verlangt keine zweite Stammdateneingabe.
- Korrekturen öffnen den zuständigen Legal-/Onboarding-Abschnitt und fokussieren das konkrete Feld. Die Zielinformation wird über Router-State übertragen, damit Auth-/Route-Hydration sie nicht verliert.
- Die Sprache zur manuellen Prüfung behauptet weder endgültige Dokumentpflichten noch Aufbewahrungsfristen.
- Die KYB-Aktionsziele sind auf kleinen Ansichten mindestens 44 CSS-Pixel hoch.
- Eine Datei über 10 MB wird vor dem Upload fail-closed und verständlich abgewiesen.

## Was nicht geändert wurde

- Keine neue Pflicht zur Ausweiskopie.
- Keine Aufbewahrungs- oder Löschfrist festgelegt.
- Keine Genehmigungs-, Ablehnungs- oder Aktivierungsregel für reale Betriebe eingeführt.
- Keine KYB-Freigabe, Restaurant-Aktivierung, Trial-, Entitlement-, Grant-, Billing- oder Stripe-Logik geändert.
- Keine Migration erstellt oder verändert.
- LEGACY-Tenant, Production, Stripe und Customer-Mail-Scheduler blieben unverändert.

## Lokale Prüfungen

| Prüfung | Ergebnis |
|---|---|
| Fokussierte KYB-/Onboarding-Tests | 31/31 PASS |
| Typecheck | PASS |
| Lint | PASS, 0 Fehler; 8 vorbestehende Warnungen |
| Build | PASS |
| Full Suite | Nicht wiederholt; kein zusätzlicher fachlicher Grund nach den fokussierten Integrationsgates |
| Migration 178 SHA-256 | `6cc3c32b0eefc4760fb396d159fac6cfd2d232683b49f872e8d41d5cfac3ac34` unverändert |

## Staging-Stand

- Datenbankmigrationen: 178/178.
- Aktiver Staging-Worker nach dem finalen UX-Deploy: `276cbcf1-0929-49d1-ba52-987af2cbf5a8`.
- Deployment: 100 %, HTTP 200.
- Ausgelieferter Source-Stand: Commit `a337fa96bb7a37e2ce379c5b9ab7ee8bb50bf00a`.

### Physisch beobachteter synthetischer Owner-Flow

Für den autorisierten `TEST_ONLY`-Tenant `WUXUAI TEST owner test 7d` wurde auf Staging beobachtet:

- `PENDING_ACTIVATION` und gesperrte Live-Funktionen blieben sichtbar.
- Gespeicherte Unternehmensdaten wurden im KYB-Bereich angezeigt.
- Der gezielte GISA-Korrekturlink öffnete die Bearbeitung und fokussierte das GISA-Feld.
- Ein harmloses, ausdrücklich synthetisches PDF wurde als neue GISA-Fassung hochgeladen.
- Die neue Fassung erschien als Version 3; die Versionen 1 und 2 blieben als ersetzte Historie erhalten.
- Der Identitätsnachweis blieb als separate bestehende Version erhalten.
- Eine 11-MiB-Testdatei wurde vor dem Upload mit der Meldung „Die Datei muss zwischen 1 Byte und 10 MB groß sein.“ abgewiesen; es entstand keine weitere Dokumentversion.
- Nach einem harten Asset-Reload erschien einmal zunächst ein leerer Ladezustand; die explizite Aktion „Erneut laden“ stellte das serverseitige Profil und alle vier Dokumenteinträge wieder her. Dieser einmalige Hydration-/Retry-Befund ist kein Freigabenachweis und bleibt als Beobachtung dokumentiert.

### Physisch beobachteter Platform-Admin-Flow

- Der AAL2-geschützte Platform-Admin-Bereich zeigte den synthetischen Tenant mit `PENDING_ACTIVATION` und vier Dokumentversionen.
- Dokumenttypen, Versionen und append-only Auditereignisse waren einsehbar.
- Der private, serverseitig autorisierte Dokumentzugriff wurde erfolgreich geöffnet.
- Es wurde keine Freigabe-, Ablehnungs-, Korrektur- oder Aktivierungsaktion ausgeführt.
- Österreich blieb `Vorbereitet · Nicht live`.

### Responsive-/Browsernachweis

Der finale Staging-Stand wurde in Chromium bei 320, 390, 768 und 1440 CSS-Pixeln geprüft:

- kein horizontaler Seitenoverflow,
- fünf Korrekturpfade sichtbar,
- Korrektur- und Aktionsziele mindestens 44 CSS-Pixel hoch,
- gespeicherte Angaben und Dokumentliste lesbar.

Der authentifizierte Desktop-Owner- und Platform-Admin-Flow wurde ebenfalls in Chromium beobachtet. Eine neue WebKit-/Safari-Matrix wurde in diesem Loop nicht wiederholt und bleibt für diesen engen UX-Diff `OPEN`.

## Schreib- und Sicherheitsnachweis

Erwarteter Staging-Write dieses Tests:

- genau eine neue synthetische GISA-Dokumentversion,
- ausschließlich die dazugehörigen append-only Dokument-/Versions-Audits.

Nicht ausgeführt beziehungsweise unverändert:

- KYB-Genehmigung oder -Ablehnung,
- Restaurant- oder Subscription-Aktivierung,
- Trial, Entitlements, Grants, Billing oder Stripe,
- Country Release,
- Customer-Mail-Scheduler,
- LEGACY-Tenant,
- Production.

Bericht und Export enthalten keine E-Mail-Adressen, User-IDs, Tokens, signierten URLs, Dokumentinhalte oder sonstigen Credentialwerte.

## Entscheidungsliste für die österreichische Rechtsprüfung

Nur folgende Antworten würden den Produktvertrag oder die Datenerhebung tatsächlich ändern:

1. Welche Nachweise sind je Rechtsform für V1 verbindlich; ist eine Ausweiskopie erforderlich oder reichen alternative Identitäts-/Vertretungsnachweise und gegebenenfalls Schwärzungen?
2. Müssen Einzel-/Gesamtvertretung, Prokura und Vollmachtsumfang strukturiert erfasst werden?
3. Muss der exakte Gewerbewortlaut zusätzlich zur GISA-Zahl gespeichert werden?
4. Wer ist datenschutzrechtlich Verantwortlicher, und welche Zwecke/Rechtsgrundlagen gelten je Daten- und Dokumentkategorie?
5. Welche rollenbezogenen Zugriffe, Aufbewahrungs-, Lösch- und Sperrfristen gelten?
6. Welche verbindlichen Regeln gelten für Nachforderung, Ablehnung, erneute Prüfung und manuelle Aktivierung?
7. Ist die UID bereits Teil des KYB-Intakes oder ausschließlich des späteren Tax-/Billing-Vertrags?

## Weiterhin gesperrte reale Flows

- Reale KYB-Einreichung und Verarbeitung realer Geschäftsdokumente.
- Manuelle Freigabe oder Aktivierung eines realen Betriebs.
- Start von Trial, Entitlements, Grants, Billing oder Stripe.
- Öffentliche AT-Freigabe und Production-Rollout.

## Risiko und Status

Der synthetische `TEST_ONLY`-Flow ist technisch konsistent und die rechtlich unabhängigen UX-Korrekturen sind auf Staging geprüft. Die fachliche Freigabe realer KYB-Verarbeitung bleibt von den oben genannten österreichischen Rechts- und Datenschutzentscheidungen abhängig. Der einmal beobachtete leere Initialzustand nach hartem Asset-Reload bleibt als Hydration-/Retry-Beobachtung offen; es wurden keine falschen Freigaben oder Aktivierungen ausgelöst.

## Evidenzexport

- Prüf-ZIP: `exports/2026-09-27_V1_KYB_ONBOARDING_UX_STAGING.zip`
- SHA-256: wird außerhalb des selbst enthaltenen Berichts im Abschluss ausgegeben
- ZIP-Integrität: PASS
- Secret Scan über acht explizite Quellen und den entpackten ZIP-Inhalt: PASS
- Quellenabgleich des entpackten Inhalts: PASS

Status: **STAGING SYNTHETIC FLOW PASS / REAL KYB BLOCKED / NOT PRODUCTION READY**
