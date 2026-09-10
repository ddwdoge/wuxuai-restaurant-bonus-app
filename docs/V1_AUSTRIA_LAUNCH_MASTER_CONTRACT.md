# WUXUAI Bonus - V1 Austria Launch Master Contract

Status: **CURRENT FOUNDER-APPROVED MASTER CONTRACT**
Stand: **2026-09-10**
Markt: **Oesterreich / Restaurant V1**

Dieses Dokument ist die kanonische Roadmap- und Scope-Quelle fuer den Austria-
Launch. Es ersetzt keine technische Evidenz: Ein Founder-Zielvertrag ist erst
`PASS`, `LOCK` oder `FINAL LOCK`, wenn Code, Sicherheit, Build und der jeweils
erforderliche physische Flow nachgewiesen sind.

Bei Widerspruch mit einer aelteren aktiven Roadmap, Release-Aussage oder
Scope-Zuordnung gilt dieses Dokument. Historische Aussagen bleiben als Beleg
erhalten, werden aber als `SUPERSEDED` behandelt.

## 1. Austria Launch Freeze

WUXUAI Bonus V1 soll so schnell wie sicher und rechtlich belastbar moeglich in
Oesterreich starten.

Vor Production werden nur geschlossen:

- P0- und P1-Fehler,
- notwendige Legal-Gates,
- notwendige Billing-/Stripe-Gates,
- notwendige Core-UX-Gates,
- die abschliessende Golden-Path- und Release-Pruefung.

Optionale groessere Feature-Erweiterungen duerfen den Austria-Launch nicht
verzoegern. Eine Founder-Entscheidung aendert den Zielvertrag, aber nicht
automatisch den technischen Ist-Status.

## 2. Austria Legal

Aktueller Status:

```text
READY FOR PROFESSIONAL REVIEW
COMMERCIAL LAUNCH: NOT READY
```

Verbleibende Kategorien:

- Company-/Operator-Platzhalter,
- B2B-AGB, Leistungsbeschreibung und AVV,
- Datenschutz, Auftragsverarbeiter, Transfers und Aufbewahrung,
- aktuelle Teilnahme- und Punktebedingungen,
- professionelle oesterreichische Rechts- und Steuerpruefung.

Technische Legal-Evidenz oder vorbereitete Dokumente ersetzen diese
professionelle Pruefung nicht.

## 3. V1 Customer Activation UX

Folgende Aktivierungshilfen sind fuer V1 erforderlich:

- Home-Screen-/PWA-Erinnerung,
- nativer Android-Installationsweg, wo der Browser ihn anbietet,
- iOS-Hinweis fuer `Zum Home-Bildschirm`,
- Erinnerung an die Benachrichtigungsbereitschaft,
- Push-Berechtigung erst nach einer ausdruecklichen Nutzeraktion,
- klare Trennung von E-Mail und Push.

Verboten sind eine vorgetaeuschte E-Mail-Berechtigung und ein neues grosses
Kampagnen- oder Notification-System. WUXUAI Bonus bleibt als Web-App ohne
verpflichtende native App nutzbar.

## 4. Globale Passwortsichtbarkeit

Jedes Passwortfeld braucht fuer V1:

- eine Anzeigen-/Ausblenden-Funktion,
- standardmaessig verborgene Eingabe,
- eine barrierearme Beschriftung und Bedienung,
- ein Touch-Ziel von mindestens 44 Pixeln,
- unveraendertes Auth- und Sicherheitsverhalten.

## 5. UI/UX Consistency Gate

Vor Production muessen die aktiven V1-Flows konsistent sein bei:

- Typografie,
- Buttons,
- Formularen,
- Karten,
- Dialogen und Sheets,
- Warnungen und Status,
- Navigation,
- Lade-, Leer- und Fehlerzustaenden,
- Responsive-Verhalten und Safe Areas,
- Barrierefreiheit.

### 5.1 Compact Information Contract

Kanonisches Prinzip:

```text
PRIMARY WORKFLOW FIRST.
SECONDARY EXPLANATION ON DEMAND.
```

Lange Erklaerungen ausserhalb des Primaerflows verwenden das kanonische Info-
Element mit Sheet. Nicht verborgen werden duerfen erforderliche Aktionen,
Status, Preis, Punkte, Ablauf, Fehler sowie verpflichtende Legal- oder
Security-Einwilligungen. Mobile bleibt kompakt und hochwertig; Desktop nutzt
dasselbe Komponentensystem.

### 5.2 Language Switcher

Der Sprachschalter ist fuer V1 erforderlich und wird kompakt in die normale
Header- oder Menuezeile integriert. Er darf weder Inhalt noch Zurueck-,
Schliessen-, Menue- oder Navigationsaktionen ueberdecken. Modal-Stacking und
Safe Areas muessen stimmen. Bevorzugter Trigger: Globus plus Locale-Code oder
nur der klar erkennbare Locale-Code.

### 5.3 Deutscher Rollenterminologie-Vertrag

Technische Rollenwerte bleiben unveraendert: `owner`, `staff`, `customer`,
`platform_admin`.

Sichtbares Deutsch verwendet:

| Nicht mehr verwenden | Aktuelle Bezeichnung |
| --- | --- |
| Staff-Bereich | Mitarbeiterbereich |
| Staff-Seite | Mitarbeiteransicht |
| Owner-Bereich | Inhaberbereich |
| Owner Dashboard | Restaurant-Dashboard |
| Customer Portal | Gaesteportal |
| Customer Account | Gaestekonto |

`Chefbereich` ist nicht erlaubt. In gastgewerblichen Oberflaechen gilt
`Gast/Gaeste`; in neutralen System-, Legal- und Analytics-Kontexten darf
`Kunde/Kunden` verwendet werden. Andere Sprachen verwenden natuerliche
lokalisierte Rollenbegriffe und zeigen keine rohen technischen Enums.

## 6. Login Contract

E-Mail und Passwort bleiben der kanonische Login-Weg. Telefonnummern duerfen
weiterhin nach ihrem bestehenden fachlichen Zweck erfasst werden, autorisieren
aber keinen Login. Telefon-/SMS-Login ist fuer V1 nicht geplant.

## 7. Nearby Discovery

Nearby Discovery ist als Produktrichtung freigegeben. Vor Umsetzung ist ein
Readiness-/Reuse-Audit Pflicht.

Datenschutzvertrag:

- Standort nur nach ausdruecklicher Nutzeraktion,
- keine automatische Standortabfrage beim Login,
- kein Hintergrundtracking,
- kein Bewegungsprofil,
- keine dauerhafte Koordinatenspeicherung ohne begruendeten Vertrag,
- PLZ-/Ort-Fallback.

Die Richtung bleibt fuer Gastronomie, Handel und Dienstleistungen nutzbar. Sie
gehoert nur dann noch in V1, wenn der gepruefte Aufwand klein ist und den Launch
nicht verzoegert; sonst ist sie Post-V1.

## 8. Monatliche Kundenentwicklung

Eine Visualisierung mit Diagramm und kompakter Tabelle fuer neue, gesamte,
aktive und wiederkehrende Kunden sowie Trend ist **POST-V1 HIGH PRIORITY**.
Nur ein trivialer UI-Aufbau auf bereits belastbaren Metriken darf noch als
kleiner V1-Schritt geprueft werden.

## 9. Aktuelle Launch-Reihenfolge

1. Austria Legal Preparation und Professional Review
2. Customer Activation UX
3. Password Visibility
4. UI/UX Consistency Gate inklusive Compact Info, Language Switcher und deutscher Rollenterminologie
5. Git-/Staging-Konsolidierung
6. Stripe Staging und Billing
7. Austria Legal Final nach Stripe
8. Final Golden Path QA
9. Production Release

Nearby Discovery wird zuerst auditiert und nur bei kleinem, launchneutralem
Umfang in V1 aufgenommen. Die monatliche Kundenentwicklung bleibt grundsaetzlich
Post-V1.

## 10. Post-V1 Strategie

Die verbindliche Reihenfolge lautet:

```text
Austria Restaurant V1 LIVE
-> reale Marktvalidierung
-> Core Verticalization Audit
-> Handel
-> Dienstleistungen
-> Oesterreich stabilisieren
-> Deutschland
-> DACH
-> EU
```

Es gibt genau einen Core. Separate geklonte Apps je Branche sind nicht erlaubt.

## 11. Post-V1 Non-Launch-Blocker

Diese Themen blockieren den Austria-Restaurant-V1-Launch nicht:

- Platform Admin Warning Center,
- Recommendation Center,
- erweiterter Security Center,
- AI Risk Scoring,
- Shared Loyalty Network,
- Shared Branch Points,
- Pro-Katalog/Speisekarte,
- Gift Cards,
- POS,
- Premium,
- erweiterte Analytics,
- groessere neue Reward-Mechaniken,
- Deutschland und internationaler Rollout.

Vorhandene vorbereitete Architektur darf bestehen bleiben. Daraus entsteht
keine oeffentliche Freischaltung und kein Launch-Blocker.

## 12. i18n und Austria Launch

Die vorhandene Architektur fuer `de`, `en`, `fr`, `it`, `es`, `zh` und `ko`
bleibt erhalten. Der Austria-Launch verlangt eine vollstaendig belastbare
deutsche Oberflaeche und einen V1-tauglichen, nicht ueberlagernden
Sprachschalter. Eine noch offene Vollpruefung aller sechs weiteren Sprachen ist
kein Austria-Launch-Blocker, sofern unfertige Sprachen nicht als fertig
ausgegeben werden und keine deutsche Golden-Path-Funktion beeintraechtigt wird.

Rechtsraum und UI-Sprache bleiben getrennt. Rechtstexte werden niemals allein
aus der UI-Sprache gewaehlt.

## 13. Modell-Empfehlung fuer Codex-Loops

Jeder groessere Codex-Loop nennt das empfohlene Modell:

- kleiner UI- oder Git-Fix: `GPT-5.6 Sol - Medium/High`,
- normale Implementierung: `GPT-5.6 Sol - High`,
- kritische Architektur, Security oder Release: `GPT-6 Astra - High`, sofern verfuegbar.

Die Empfehlung aendert keine Sicherheits-, Freigabe- oder Testanforderung.

## 14. Status- und Nachweisregel

Dieses Dokument ist ab 2026-09-10 die Roadmap-Quelle fuer den Austria-Launch.
Es erteilt weder eine Production-Freigabe noch bestaetigt es unerledigte Gates.
Der naechste Status-Audit muss ausschliesslich diesen Master fuer Scope,
Reihenfolge und Post-V1-Zuordnung verwenden und den technischen Ist-Stand
separat nachweisen.
