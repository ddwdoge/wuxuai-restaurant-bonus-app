# Automatisiertes Restaurant-Legal-Onboarding

Datum: 29.07.2026  
Branch: `codex/v13-legal-maps-hardening`

## Ursache und vorherige UX

Das bisherige Owner Legal Center verlangte Unternehmensstammdaten, 19 Felder
für Teilnahmebedingungen, einen vollständigen Datenschutz-Freitext,
Veröffentlichungsdatum, erneute Annahme und Programmende auf einer langen
Seite. Interne Codes wie `DRAFT_LEGAL_REVIEW_REQUIRED` wurden direkt angezeigt.
Die vorhandene Template-Funktion erzeugte zwar Dokumente, verwendete aber
unvollständige Platzhalter und war nicht mit dem Onboarding-Abschluss verbunden.

Die Kundenregistrierung wurde durch fehlende aktuelle Teilnahmebedingungen oder
Datenschutzversionen korrekt blockiert. Dieser Sicherheitsmechanismus bleibt
erhalten.

## Neue Onboarding-Eingaben

Schritt 1 der bestehenden sieben Schritte enthält nun einen kompakten Bereich
„Rechtliche Angaben“. Pflicht sind Unternehmensname, Rechtsform, vollständige
Adresse, Land und Kontakt-E-Mail. Der Beschwerdekontakt fällt auf die
Kontakt-E-Mail zurück. Registerdaten, UID, Telefon, Kammer, Aufsicht und
Barrierefreiheitskontakt bleiben optional und blockieren den Start nicht.

Es gibt im Onboarding keine juristischen Freitextfelder.

## Automatische Templates

Die additive Migration
`20260729006000_automated_restaurant_legal_onboarding.sql` führt zentral
versionierte Mastervorlagen ein. Der ownergeschützte RPC
`generate_restaurant_legal_package`:

- prüft Tenant und Owner-/Admin-Berechtigung serverseitig,
- validiert die Pflichtstammdaten,
- lädt zentral aktive Mastervorlagen,
- setzt Restaurant-, Bonus- und Kontaktangaben ein,
- erzeugt unveränderbare Dokumententwürfe,
- überschreibt keine aktive veröffentlichte Version,
- erzeugt `LEGAL_PACKAGE_GENERATED`,
- gibt keine Vorlage oder Schreibfunktion an `anon` frei.

## Legal Readiness

Bereitschaft verlangt serverseitig:

- Unternehmensname,
- Rechtsform,
- vollständige Adresse,
- Land,
- Kontakt-E-Mail,
- Beschwerdekontakt oder E-Mail-Fallback,
- veröffentlichte und bereits gültige Teilnahmebedingungen,
- veröffentlichte und bereits gültige Datenschutzerklärung.

Optionale Firmenbuch-, UID- und Kontaktdaten blockieren nicht.

## Pilot und Production

Pilotrestaurants mit `plan_key = pilot` dürfen sichtbar als rechtlich
prüfbedürftig gekennzeichnete Mastervorlagen als Entwurf verwenden. Auch im
Pilot erfolgt keine stille Veröffentlichung: Der Owner muss Vorschau,
Gültigkeitsdatum und Bestätigung durchlaufen. Für Nicht-Pilot-Betrieb wählt der
Server ausschließlich Mastervorlagen mit Status `REVIEWED`. Fehlt ein
vollständiges geprüftes Paket, wird die Erzeugung blockiert. Es gibt keine
hartcodierte Staging-Ausnahme in einer UI-Komponente.

Keine Vorlage wird in diesem Bericht als endgültig anwaltlich geprüft
bezeichnet.

## Versionierung und Synchronisierung

Veröffentlichte Dokumentversionen werden nicht verändert. Bei geänderten
Stammdaten entsteht zunächst eine neue Entwurfsversion. Relevante Änderungen an
`loyalty_settings` markieren über einen Trigger, dass eine neue Legal-Version
geprüft werden muss. Bild- und Reward-Fotoänderungen lösen dies nicht aus.

Die Veröffentlichung erfolgt über `publish_restaurant_legal_drafts`. Der RPC
verlangt Owner-/Admin-Berechtigung, Restaurantbindung, ein Gültigkeitsdatum und
eine ausdrückliche Bestätigung. Gespeichert werden Owner, Restaurant,
Template-Referenz, Dokument-Hash, Zeitpunkt und eine Request-ID. Der Übergang
von Entwurf zu veröffentlicht ist die einzige zulässige Mutation; danach bleibt
die Version unveränderbar.

## Owner-Übersicht

Die Hauptansicht zeigt kompakte Karten für:

- Impressum,
- Teilnahmebedingungen,
- Datenschutzerklärung,
- Bonusregeln,
- Kassenabgrenzung.

Technische Statuscodes werden in verständliche Begriffe übersetzt.
Unternehmensdaten werden erst auf ausdrückliche Aktion eingeblendet. Optionale
Angaben liegen in einem erweiterten Bereich.

## Dashboard-Statuskarte und Owner-Hinweise

Das Owner-Dashboard zeigt den serverseitig berechneten Status sofort nach dem
Login:

- grün: Kundenregistrierung bereit,
- gelb: aktive Dokumente bleiben gültig, aber Entwürfe oder Änderungen müssen
  geprüft werden,
- rot: Pflichtdaten, aktive Pflichtdokumente oder aktiver Programmstatus fehlen.

Die Karte enthält Ursache, letzte Aktualisierung und den direkten Zugang zum
Legal Center. In-App-Hinweise decken fehlende Pflichtdaten, offene Entwürfe,
geänderte Daten, zukünftige Versionen und Programmende ab. Es wurde keine neue
E-Mail-Kommunikation eingeführt.

## Dokumentdetails und Readiness-Checkliste

Die Owner-Karten zeigen Dokumenttyp, Version, verständlichen Status,
Erstellungs- und Veröffentlichungszeitpunkt, Gültigkeit, Acceptance-Anzahl,
aktive Version, verantwortlichen Owner und verwendetes Mastertemplate. Eine
kurze Checkliste gruppiert Unternehmensdaten, Pflichtdokumente,
Veröffentlichung und Programmstatus.

Der Hinweis „Automatisch erstellt von WUXUAI“ erklärt ausdrücklich, dass die
Vorlagen auf Restaurant- und Bonusdaten beruhen, vor Veröffentlichung geprüft
werden müssen und keine individuelle Rechtsberatung ersetzen.

## Änderungs- und Veröffentlichungsflow

Unternehmensänderungen erzeugen neue Entwürfe. Die bisher aktive Version bleibt
bis zur bestätigten Veröffentlichung unverändert. Vorher sieht der Owner die
geänderten Felder, neuen Versionsnummern, Dokumentvorschau, Gültigkeitsdatum und
Auswirkungen auf neue sowie bestehende Gäste. Die erneute Zustimmung bestehender
Gäste ist standardmäßig aus und muss bewusst aktiviert werden.

Neue Gäste akzeptieren die aktuelle aktive Version. Historische Acceptances
bleiben mit Dokumentversion, Zeitpunkt, Kunde, Restaurant, Quelle und
Pflichtstatus erhalten. Es gibt kein stilles Auto-Accept und keine rückwirkende
Überschreibung.

## Programmende und Kassenabgrenzung

Das Programmende befindet sich im eigenen Owner-Flow
`/admin/settings/program-end`. Letzte Punktevergabe, Ende, letzte Einlösung,
Kundenhinweis und Bestätigung bleiben erforderlich und auditiert. Der Flow
zeigt zusätzlich Start der Beendigung, schreibgeschützte Abschlussphase,
Abschlussbericht und Archivierung. Es erfolgt keine sofortige Löschung, stille
Punktevernichtung oder Änderung historischer Acceptances.

Die Kassenabgrenzung wird aus der Mastervorlage erzeugt. Der bestehende
Bonus-Aktivitätsbericht bleibt erreichbar.

## Customer Registration

Der öffentliche Legal-Endpunkt und das Registration Gate bleiben
restaurantbezogen. Nur aktuelle veröffentlichte Pflichtdokumente geben die
Registrierung frei. Der zentrale Servercheck berücksichtigt zusätzlich aktives
Restaurant, Pflichtprofil, Gültigkeitsdatum, Tenant und Programmende.
Pflichtcheckboxen und freiwillige Einwilligungen wurden nicht gelockert.

Temporäre Ladefehler und echte fehlende Konfiguration sind getrennt. Ein Retry
behält Kundentoken und Sitzung; er erzeugt kein neues Konto und erzwingt keine
optionalen Einwilligungen.

## Tests

Ergänzt wurden Tests für:

- minimale Onboarding-Stammdaten,
- E-Mail-Fallback für Beschwerden,
- optionale Firmenbuch- und UID-Felder,
- zentrale versionierte Mastervorlagen,
- Pilot-/Production-Freigabe,
- unveränderbare Altversionen,
- Owner- und Tenant-Prüfung,
- automatische Erzeugung beim Onboarding,
- Legal Readiness,
- kompakte Owner-Übersicht,
- verständliche Statusbezeichnungen,
- Änderungsmarkierung bei Bonusregeln,
- separaten Programmende-Flow,
- Kassenabgrenzung.
- Dashboard-Ampel grün/gelb/rot,
- getrennte Entwurfs- und Veröffentlichungsphasen,
- unveränderte historische Acceptances,
- ausdrückliche Reacceptance-Auswahl,
- Dokumentdetails und Mastertemplate-Referenz,
- Programmende als Registrierungsblocker,
- Netzwerkfehler versus fehlende Konfiguration,
- Rollen- und Tenantbindung der Veröffentlichung,
- Mobile- und Tastaturverträge.

Ergebnis:

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bereits bestehende Warnungen
- Tests: 315 von 315 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich

## Migration und Staging

Am 29.07.2026 um 22:34 CEST wurden die drei offenen Migrationen einzeln und in
der vorgesehenen Reihenfolge auf das bestätigte Projekt
`wuxuai-bonus-staging` (`bwh...qaya`) angewendet:

1. `20260729004000_redemption_rate_dropdown.sql`: erfolgreich
2. `20260729005000_legal_readiness_effective_date_guard.sql`: erfolgreich
3. `20260729006000_automated_restaurant_legal_onboarding.sql`: erfolgreich

Vor jedem einzelnen Lauf bestätigte ein isolierter Dry-Run, dass ausschließlich
die jeweilige Migration geplant war. Nach jedem Lauf wurde die Remote-Historie
kontrolliert. Der abschließende globale Dry-Run meldet `Remote database is up to
date`.

Die Staging-Tabelleninspektion bestätigt unter anderem
`legal_master_templates`, `restaurant_legal_profiles`, `legal_documents`,
`legal_document_versions`, `customer_legal_acceptances` und
`program_terminations`. Direkter anonymer Zugriff auf Mastertemplates sowie die
geschützten Setup- und Publish-RPCs wird live mit `401 / 42501` abgewiesen.

Für das Staging-Projekt sind WAL-basierte Sicherungen grundsätzlich aktiviert,
es waren über die CLI jedoch keine physischen Backups verfügbar und PITR ist
nicht aktiviert. Die Migrationen wurden daher besonders strikt einzeln
angewendet; es gab keine SQL-Warnungen oder Fehler.

## Responsive und Accessibility

- Mobile CSS: einspaltige Dokumentkarten unter 700 px
- Tablet CSS: zweispaltige Dokumentkarten bis 899 px
- Desktop CSS: dreispaltige Dokumentkarten
- Touchflächen für Kartenlinks, Buttons und erweiterte Bereiche: mindestens
  44 px
- Fokus und native Tastaturbedienung bleiben über Links, Buttons, Inputs und
  `details/summary` erhalten
- Horizontaler Overflow wird durch `minmax(0, 1fr)`, `min-width: 0` und
  vollbreite Mobile-Aktionen vermieden
- Status wird immer zusätzlich als Text ausgegeben und nicht nur über Farbe
- Statusänderungen verwenden Live-Regionen
- Vorschau und Veröffentlichungsbestätigung bleiben nativ per Tastatur
  erreichbar
- Druckansicht des bestehenden öffentlichen Legal Centers bleibt unverändert

Die lokale geschützte Route leitete ohne Authentifizierung korrekt zum
Restaurant-Login weiter. Eine visuelle Owner-Abnahme mit authentifizierter
Session sowie ein physischer Screenreader-/Mobile-Safari-Test wurden nicht
vorgegeben und bleiben offen.

## Offene Anwaltspunkte und Risiken

- Alle Mastertexte benötigen vor Production eine unabhängige rechtliche
  Freigabe.
- Eine authentifizierte Owner-Sitzung und ein freigegebenes Staging-
  Testrestaurant standen nicht zur Verfügung. Owner-A/B-, Staff-,
  Veröffentlichungs- und Customer-Registration-E2E bleiben deshalb offen.
- Der öffentliche Partnerrestaurant-Endpunkt lieferte keine freigegebenen
  Staging-Standorte. Es wurden keine Testdaten oder Rollen improvisiert.
- Der read-only Schema-Dump war ohne Docker Desktop nicht verfügbar. Tabellen,
  RPC-Sichtbarkeit und Migrationshistorie wurden stattdessen über CLI-
  Inspektion und sichere REST-Negativtests geprüft.
- Physische Mobile-Safari- und Screenreader-Tests bleiben Teil der visuellen
  Abnahme.

## Status

Code und UX sind für die visuelle und rechtliche Prüfung vorbereitet. Kein
Production-Deployment, Push oder Merge wurde durchgeführt.

Abschlussstatus: `READY_FOR_STAGING_VALIDATION`

Der Codex-Selbstkontrollstatus bleibt `NOT READY`, bis der authentifizierte
Owner-Onboarding-, Veröffentlichungs-, Tenant-/Rollen- und Customer-
Registration-Flow mit einem isolierten Staging-Testrestaurant end-to-end
geprüft wurde.
