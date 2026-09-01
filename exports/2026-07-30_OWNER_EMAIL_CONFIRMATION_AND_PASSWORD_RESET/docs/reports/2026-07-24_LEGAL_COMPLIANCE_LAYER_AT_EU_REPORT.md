# WUXUAI Bonus – Legal Compliance Layer Österreich / EU

Datum: 24.07.2026
Branch: `codex/legal-compliance-layer`
Ausgangsbranch: `codex/partner-restaurant-finder`
Ausgangscommit: `161fc2b`

## Zusammenfassung

Der bisherige Stand besaß keine zusammenhängende technische Legal-Schicht. Rechtliche Rollen, versionierte Restaurantbedingungen, dokumentierte Annahmen, getrennte Marketingeinwilligungen, Datenschutzanfragen, Retention-Dry-Run und Reward-Buchhaltungsexport waren nicht vollständig wirksam verbunden.

Die neue Grundlage setzt diese Bereiche additiv und restaurantbezogen um. Sie ist ausdrücklich keine Garantie vollständiger Rechtskonformität und keine Production-Freigabe. Texte, Rollenmodell, Aufbewahrungsfristen, Programmende und steuerliche Behandlung benötigen externe österreichische Rechts- und Steuerprüfung.

## Bestandsprüfung vor Änderung

| Bereich | Ausgangszustand |
| --- | --- |
| Impressum / öffentliches Legal Center | nicht vorhanden |
| Datenschutzseite | teilweise dokumentiert, kein versionierter Kundenflow |
| Teilnahmebedingungen je Restaurant | nicht vorhanden |
| Registrierungs-Pflichtannahme | nicht vorhanden |
| Marketing-Consent | technisch nicht zentral durchgesetzt |
| Push-Consent | freiwillige Push-Subscription vorhanden, kein allgemeiner Marketingnachweis |
| SMS-/E-Mail-Consent | nicht vorhanden |
| Dokumentversionierung / Acceptance | nicht vorhanden |
| Löschung / Datenexport | nicht vorhanden |
| Kundenbeschwerde | nicht als strukturierter Datenschutzworkflow vorhanden |
| Retention | kein konfigurierbarer Dry-Run |
| Reward-/Steuerexport | nicht vorhanden |
| Accessibility | Premium-Komponenten teilweise vorhanden; Legal-Erklärung fehlte |

## Geänderte Dateien

- `supabase/migrations/20260724001000_legal_compliance_layer.sql`
- `src/modules/legal/LegalCenterPage.tsx`
- `src/modules/legal/OwnerLegalSettingsPage.tsx`
- `src/modules/legal/legalService.ts`
- `src/modules/legal/legalCompliance.mjs`
- `src/modules/legal/legalCompliance.d.mts`
- `src/modules/legal/legal-center.css`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/ReferralLanding.tsx`
- `src/modules/customer/PartnerRestaurantFinderPage.tsx`
- `src/modules/customer/customer-premium.css`
- `src/modules/customer/partner-restaurant-finder.css`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/admin/pages/SettingsPage.tsx`
- `src/modules/admin/admin-premium.css`
- `src/app/App.tsx`
- `tests/legal-compliance-layer.test.mjs`
- Fach- und Changelog-Dokumentation unter `docs/` und `docs/legal/`

## Datenbank und RPCs

Neue additive Tabellen:

- `restaurant_legal_profiles`
- `legal_documents`
- `legal_document_versions`
- `customer_legal_acceptances`
- `customer_consents`
- `consent_events`
- `privacy_requests`
- `program_terminations`
- `retention_policies`
- `customer_message_attempts`

Neue beziehungsweise gekapselte Kern-RPCs:

- `get_public_legal_center`
- `register_restaurant_customer_legal`
- `register_referral_customer_legal`
- `accept_current_legal_documents`
- `update_customer_consent`
- `create_customer_privacy_request`
- `get_customer_data_export`
- `authorize_customer_message`
- `get_restaurant_legal_setup`
- `save_restaurant_legal_setup`
- `schedule_program_termination`
- `get_reward_accounting_export`
- `preview_retention_cleanup`

Die bisherigen öffentlichen Registrierungs-RPCs verlieren Browserrollen-EXECUTE, damit Pflichtannahmen nicht umgangen werden. Die neuen Wrapper verwenden weiterhin die bestehende Registrierungslogik.

## Umgesetzte Durchsetzung

- Pflichtannahme von Teilnahmebedingungen und Datenschutzhinweis serverseitig.
- Marketing-Push, SMS und E-Mail separat, freiwillig und standardmäßig aus.
- Marketing-Servergate blockiert unbekannte, abgelehnte oder widerrufene Einwilligungen.
- Dokumentversionen sind unveränderlich, gehasht und restaurantbezogen.
- Erneute Annahme aktueller Versionen ist tokengebunden und idempotent.
- Consent-Widerruf verändert weder Mitgliedschaft noch Punktestand.
- Öffentliche Legal-Daten nur über begrenzte RPC; keine öffentliche Tabellen-Lesepolicy.
- Owner-Zugriff prüft serverseitig das eigene Restaurant.
- Datenschutzexport ist kunden- und restaurantbezogen.
- Löschung und Mitgliedschaftsbeendigung erzeugen Anfragen statt ungeprüfter Sofortlöschung.
- Programmende erzwingt geordnete Fristen und deaktiviert das Restaurant nicht sofort.
- Retention bleibt ein dokumentierter Dry-Run; es werden keine Daten gelöscht.
- Reward-CSV verwendet eine maskierte Referenz statt des vollständigen sechsstelligen Codes.
- Public Discoverability neuer Standorte verlangt Betriebs-, Rechts- und Sicherheitsbereitschaft.

## RLS / Security

- RLS für alle neuen Tabellen aktiv.
- Neue Owner-Select-Policies prüfen `is_restaurant_admin(restaurant_id)`.
- `anon` erhält keine direkte Tabellenberechtigung auf Legal-, Consent- oder Datenschutzdaten.
- Kundenvorgänge prüfen Kundentoken und Restaurant serverseitig.
- Marketing-Autorisierung ist für `public`, `anon` und `authenticated` nicht direkt ausführbar.
- Keine Service-Role, Tokens, PINs, Auth-Header oder vollständigen Einlösecodes im Frontend oder Audit ergänzt.
- Bestehende RLS-Policies wurden nicht gelockert.

## Punkte, Programm und Steuern

- Punkte werden als restaurantbezogenes Nicht-Geld-Produkt erklärt.
- Gültigkeitsmonate werden aus den aktuellen Teilnahmebedingungen angezeigt.
- Kein konkretes historisches Ablaufdatum wird erfunden: Der bestehende Transaktionsverlauf erlaubt noch keine verlässliche Zuordnung verbleibender Punkte nach Verbrauch.
- Keine rückwirkende Verfallsbuchung umgesetzt.
- Buchhaltungsexport enthält technische Daten; keine Umsatzsteuerautomatik oder steuerliche Einordnung.

## Tests und QA

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bereits vorhandene Warnungen
- Tests: 126/126 erfolgreich
- Neue Legal-Tests: 23
- Build: erfolgreich
- Migration List: erfolgreich, `20260724001000` nur lokal
- Migration Dry-Run gegen Staging: erfolgreich; ausschließlich `20260724001000` ausstehend
- Migration auf Staging angewendet: Nein
- Production-Migration: Nein
- Responsive Legal Center: 390 / 430 / 768 / 1024 / 1440 Pixel geprüft
- Horizontaler Overflow: 0
- Kleinste geprüfte Touchfläche: 44 Pixel
- Sichtbare technische Feldschlüssel: 0
- Console Errors im lokalen visuellen Test: 0
- Unerwartete Network Errors im kontrollierten lokalen Test: 0
- Physischer Screenreader-/Mobile-Safari-Test: nicht durchgeführt

## Nicht umgesetzt / offene Risiken

1. Finale Rechtstexte, Impressumsdetails, Rollenverteilung und ein möglicher Auftragsverarbeitungsvertrag sind extern zu prüfen.
2. Die Migration wurde bewusst nicht auf Staging angewendet; RPC-, Grant- und RLS-Verhalten sind daher noch nicht live verifiziert.
3. Der vollständige Owner-Backoffice-Abschluss von Datenschutzanfragen einschließlich geprüfter Löschung, Sperrung oder Anonymisierung bleibt ein Folgeblock.
4. Allgemeine manuelle Punkteingabe ist laut Engineering Bible verboten. Ein gesonderter, eng begrenzter Korrekturflow mit Grund, Bearbeiter und Vorher-/Nachher-Wert wurde deshalb nicht eigenmächtig gebaut.
5. Konkrete historische Punkte-Ablaufdaten benötigen eine fachlich definierte Verbrauchsreihenfolge und Datenmigration.
6. Mitarbeiterfilter und belastbare Kassen-/Bonreferenzen sind in historischen Einlösungsdaten nicht durchgehend vorhanden.
7. Retention-Ausführung, Programmbeendigung und Kundenbenachrichtigung sind nur vorbereitet; keine Production-Automation wurde aktiviert.
8. Steuerliche Behandlung jeder Reward-Kategorie bleibt Aufgabe von Buchhaltung oder Steuerberatung.
9. Physische Mobile-Safari-, Tastatur-, Screenreader- und externe Accessibility-Prüfung stehen aus.

## Status

`PARTIALLY_IMPLEMENTED`

Begründung: Die technische Legal-Grundlage, UI, Versionierung, Einwilligungen, Datenschutzanfragen, Readiness, Dry-Run und Exporte sind implementiert und lokal geprüft. Für `READY_FOR_LEGAL_REVIEW` fehlen noch die Staging-Verifikation der Migration sowie der fachlich freigegebene Abschlussworkflow für Datenschutzanfragen und manuelle Korrekturen. Eine Production-Freigabe ist ausdrücklich ausgeschlossen.
