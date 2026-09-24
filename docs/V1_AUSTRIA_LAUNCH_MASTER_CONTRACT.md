# WUXUAI Bonus - V1 Austria Launch Master Contract

Status: **CURRENT FOUNDER-APPROVED MASTER CONTRACT**
Stand: **2026-09-23 (kanonische Preis-/Capacity-Reconciliation)**
Markt: **Oesterreich / Restaurant V1**

**Aktueller Vorrang (23.09.2026):** Fuer Preise, Capacity, Trial,
Pending-Aktivierung, Seller und Country Gate gilt
`V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`. Die 2026-09-12-Roadmap unten ist
historische Planung, keine heutige Commercial-/Production-Freigabe. 99 EUR
PRO, unbegrenzte Angebote, Trial bei Registrierung und die Schweiz als Teil
des EU-Rollouts sind **SUPERSEDED**. AT + PRO bleiben LOCKED. Siehe
`V1_CURRENT_IMPLEMENTATION_STATUS.md` fuer den tatsaechlichen Phasenstand.

Founder-Entscheidung vom 2026-09-12: **FOUNDER PRODUCT ROADMAP LOCK**.
Basic, Pro und Catalog werden vor dem Launch technisch fertiggestellt;
kommerziell startet ausschliesslich Austria Basic. Catalog ist ein separat
bezahltes Add-on, kein Bestandteil von Pro. Dieser Roadmap-Lock ist keine
Behauptung eines technischen Final Locks oder einer Commercial-/Live-Freigabe.

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

Vor Production werden geschlossen:

- P0- und P1-Fehler,
- notwendige Legal-Gates,
- notwendige Billing-/Stripe-Gates,
- notwendige Core-UX-Gates,
- die abschliessende Golden-Path- und Release-Pruefung.
- die jetzt ausdruecklich freigegebenen technischen Pro- und Catalog-Gates
  aus Phase 7 und 8 sowie die gemeinsame Stripe-Testintegration aus Phase 9.

**SUPERSEDED (2026-09-12):** Pro/Catalog sind nicht mehr pauschal optionale
Post-V1-Implementierungen. Ihre technische Fertigstellung ist Launch-Voraussetzung;
Kauf und Nutzung bleiben beim kommerziellen Erststart serverseitig gesperrt.
Die bisherige Aussage, Catalog sei im Pro-Paket enthalten, ist ersetzt.

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

### First-Login Setup Drawer - V1 REQUIRED

- Nach dem ersten erfolgreichen Kundenlogin oeffnet sich einmalig ein kompakter
  Setup-Drawer.
- Die Einrichtung ist optional und blockiert den Kundenbereich nicht.
- `Spaeter` schliesst den Drawer; solange relevante Schritte offen sind, bleibt
  auf der Startseite nur eine kompakte Erinnerung sichtbar.
- Nach Abschluss aller auf dem Geraet relevanten Schritte verschwinden Drawer-
  Automatik und Home-Erinnerung.
- `Nicht mehr automatisch erinnern` deaktiviert nur das automatische Oeffnen und
  keine Funktion.
- `App & Benachrichtigungen` bleibt im Konto jederzeit manuell erreichbar.
- Push-Berechtigungen werden niemals beim Oeffnen des Drawers, sondern erst nach
  einer ausdruecklichen Nutzeraktion angefragt.
- Installation und Push werden ausschliesslich aus dem aktuellen Browser- und
  Plattformstatus abgeleitet. Ein lokaler Darstellungswert darf keine
  abgeschlossene Installation vortaeuschen.
- E-Mail-Bestaetigung, Browserinstallation und Push-Bereitschaft bleiben getrennte
  Zustaende.

## 4. Globale Passwortsichtbarkeit

Implementierungsstatus: **STAGING READY FOR PHYSICAL FINAL LOCK**

Der gemeinsame UI-Vertrag ist implementiert, automatisch vollstaendig und auf
den oeffentlich erreichbaren Staging-Auth-Routen physisch geprueft. Der
tokengebundene Passwort-Reset-/Aenderungsweg bleibt Teil des finalen
Founder-kontrollierten Golden-Path-Nachweises.

Jedes Passwortfeld braucht fuer V1:

- eine Anzeigen-/Ausblenden-Funktion,
- standardmaessig verborgene Eingabe,
- eine barrierearme Beschriftung und Bedienung,
- ein Touch-Ziel von mindestens 44 Pixeln,
- unveraendertes Auth- und Sicherheitsverhalten.

## 5. UI/UX Consistency Gate

Implementierungsstatus: **STAGING FINAL LOCK**

Der aktive Staging-Stand verwendet den gemeinsamen UI-Vertrag ueber Customer-,
Owner-, Staff- und Platform-Admin-Oberflaechen. Der Sprachschalter ist in die
jeweilige Kopf- oder Menuezeile integriert, der kanonische Info-Trigger besitzt
eine 44-Pixel-Bedienflaeche, und sichtbare deutsche Rollenbegriffe entsprechen
dem unten festgelegten Vertrag. Die gepruefte Responsive-Matrix umfasst 320 bis
1280 Pixel sowie alle sieben vorhandenen UI-Sprachen.

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

### 5.4 Phase 6 – Image-first Mobile Cards (Founder-Ergaenzung 2026-09-12)

**FOUNDER-NACHTRAG 2026-09-20 – VERBINDLICHER GEMEINSAMER BILDVERTRAG:**
Die zwischenzeitliche mobile Sonderdarstellung mit `3:2`, `object-fit: cover`
und einer nur auf den gespeicherten Zoom verkürzten Transform-Berechnung ist
aufgehoben. Owner-Liste, Owner-Editor/Vorschau und Customer-Karten verwenden
für Punkteeinlösungen, bildtragende Willkommensgeschenke und Angebote denselben
vorhandenen Medienvertrag: `aspect-ratio: 16 / 9`, `object-fit: contain`,
identische Bild-URL und Fokusposition sowie gespeicherter Zoom multipliziert
mit der vollständigen Render-Skalierung. Text darf die Karte in der Höhe
wachsen lassen; die reservierte Medienfläche bleibt davon unabhängig stabil.
Der Single-Image-Editor, gespeicherte Crop-Daten, Upload-/Speicherlogik,
Drawer-/Keyboard-, Business-, Security- und Entitlement-Verträge bleiben
unverändert.

**VERBINDLICHER ZIELVERTRAG; NOCH KEIN IMPLEMENTIERUNGS-/VISUAL-PASS.**
Gaeste sollen auf Mobile zuerst das Bild wahrnehmen, dann den Text lesen.
Die Referenz `IMG_2794.PNG` gilt gemaess anschliessender ausdruecklicher
Founder-Klarstellung ausschliesslich fuer die einzelne Kartenvorschau:
grosses Bild oben und kurze Text-/Statusflaeche darunter. Die WUXUAI-Karten
wechseln weiterhin horizontal nach links/rechts, nicht als vertikaler Stapel.
Die Referenz ist weder WUXUAI-Asset noch Abnahmenachweis.
Diese Ergaenzung ersetzt fuer die unten genannten Marketingkarten die
frueheren Phase-6-Vorgaben zu zweispaltigen Vorteile-Kacheln und kleinen
horizontalen Reward-/Offer-Karten. Informations- und Sicherheitskarten sind
ausdruecklich ausgenommen. Die uebrigen Phase-6-Gates bleiben bestehen.

**Geltungsbereich und Hierarchie**

- Image-first: Angebote, Vorteile, Belohnungen, Willkommensgeschenk,
  Geburtstagsgeschenk, Bonus Boost sowie Catalog-/Menuevorschauen.
- Information-first, weiterhin kompakt: Punkteguthaben, Transaktionen,
  Kontoeinstellungen und KPI-Karten.
- QR und PIN: Sicherheit, Scanbarkeit und Bedienbarkeit zuerst; kein neuer
  Ablauf und keine Bildinszenierung auf Kosten von Eingabe oder Bestaetigung.
- Reihenfolge innerhalb der Marketingkarte: grosses Bild; kurzer emotionaler
  Titel; Reward-/Punkte-/Gueltigkeitsstatus; Aktion oder Detailzugang.
  Ausfuehrliche Beschreibung gehoert in die bestehende Detailansicht/den Drawer.
- Im ersten mobilen Viewport muss ein attraktives relevantes Bild Prioritaet
  erhalten. Wichtige Zustaende bleiben ohne Oeffnen von Details sichtbar.
  Das erfindet weder dynamisches Ranking noch Eligibility oder neue Inhalte.

**Mobile Kartenvertrag**

- Eine grosse Kartenvorschau nahezu ueber die volle Inhaltsbreite;
  weitere Karten horizontal nach links/rechts wischbar. Kein vertikaler
  Gesamtstapel und kein zweispaltiges Marketingkarten-Raster.
  Bildflaeche als visuelles Ziel etwa 65–75 Prozent der Karte.
- Verbindliches Bildformat `aspect-ratio: 16 / 9`, feste reservierte Bildflaeche
  auch beim Laden und bei Fehlern; keine Verzerrung oder Layoutspruenge.
- `object-fit: contain`; Owner sollen den Bildfokus steuern koennen. Bestehende
  Fokus-/Crop-Daten und Editor-Wege wiederverwenden, nicht durch ein neues
  Persistenzmodell oder eine Phase-6-Migration ersetzen. Motivausschnitt pruefen.
- Titel unter dem Bild, maximal zwei Zeilen. DE/EN/FR/IT/ES/ZH/KO duerfen
  weder ueberlappen noch abgeschnitten werden. Keine verdeckten Volltitel
  durch Ellipsis, Line-Clamp, kleinere Pflichtschrift oder einen nur fuer
  Screenreader verfuegbaren Ersatz als PASS ausgeben.
- Beschreibung auf Home standardmaessig verborgen oder kurz; keine langen
  Textbloecke. Vollstaendiger Inhalt im bestehenden Detail/Drawer erreichbar.
- Status, erforderliche Punkte, Gueltigkeit und Hauptaktion bleiben sichtbar,
  mit einer kompakten Zeile als Ziel. Keine erforderlichen Informationen
  zugunsten des Bildanteils entfernen oder hinter den Detailzugang verlagern.
- Die ganze Karte kann den bestehenden Detailzugang ausloesen, statt von einem
  kleinen Button abzuhaengen. Semantischer Link/Button, Tastaturbedienung,
  Fokus und mindestens 44 × 44 px bleiben Pflicht. Keine verschachtelten
  interaktiven Elemente; Kartenklick ist niemals automatische Einloesung,
  Punktebuchung, Einladung, Aktivierung oder Consent.
- Ohne Bild: vorhandene hochwertige neutrale WUXUAI-Platzhaltergrafik verwenden;
  kein Emoji-Ersatz und keine erfundenen Produktfotos. Fehlende geeignete
  Assets sind ein expliziter offener Gate, keine behauptete vorhandene Ressource.
- Komprimierte, fuer Mobile passend dimensionierte Bilder und Lazy Loading;
  keine ungepruefte Auslieferung uebergrosser Originale. Tatsächlich geladene
  Bildgroessen und Ladeverhalten messen; CSS-Verkleinerung reicht nicht.
- WUXUAI® Bonus bleibt eigenstaendig: warmer Creme-Hintergrund, weisse Karten,
  goldene Statusakzente, dunkler Text, konsistente Radien und leichte Schatten.
  Von McDonald's ausschliesslich die Bild-vor-Text-Hierarchie als Referenz;
  weder Branding noch Farben oder Navigation uebernehmen.
- Kein CSS `zoom` und kein gesamthaftes `transform: scale()` fuer Seiten,
  Bereiche oder Karten. Bestehende Bildausschnitt-Werkzeuge nicht als
  technische Skalierung des UI missbrauchen.

**Abgrenzung, ersetzte Regeln und offene Nachweise**

- Der Founder-Nachtrag vom 20.09.2026 ersetzt ausschliesslich die mobile
  `3:2`-/`cover`-Sonderdarstellung. Die Kartenbreite, Image-first-Hierarchie,
  Carousel-Navigation und alle Owner-, Desktop-, Logo-, QR- und
  Druckdarstellungen bleiben unveraendert.
- Vollstaendiger Reward-/Gift-/Offer-Katalog, Geschenkprioritaet, gespeicherte
  Crop-Daten, bestehende Swipe-/Detail-/Einloesesicherheit und Final Locks
  bleiben geschuetzt. Bestehenden horizontalen Carousel-Baustein, nativen
  Swipe, Scroll Snap, Einzelschritt-Pfeile und echte Positionsanzeige erhalten.
  Alle Karten bleiben erreichbar; Swipe/Pfeile starten keine Einloesung.
  Einzelkarte bleibt ohne kuenstliche Carousel-Steuerung vollbreit.
  Die ausdrueckliche Founder-Klarstellung ersetzt die zwischenzeitliche
  Interpretation der Referenz als vertikalen Marketing-Feed.
- Zwei Titelzeilen, vollstaendige lange Uebersetzungen, kompakte Statuszeile,
  Bildanteil und Mindest-Touchflaechen muessen gemeinsam physisch bestehen.
  Falls sie in einer Pflichtgroesse nicht zusammenpassen: Konflikt dokumentieren
  und Founder-Entscheidung einholen; keine eigenmaechtige Abschwaechung.
- Punktekarte bei 390 px bis 232 px, Fortschritt/Status im ersten Viewport,
  zwei beginnende Vorteile/Schnellzugriffe und Hoehenziel 2650 statt 3028 px
  sind nicht durch diese Dokumentation bestanden oder still gestrichen.
  Ein Konflikt mit grossen einspaltigen Bildern wird gemessen und offengelegt.
  Vergleiche brauchen denselben Inhalt/Zustand; Datenabweichungen benennen.
- Catalog bleibt ein eigenstaendiges, kommerziell gesperrtes Phase-8-Modul.
  Diese visuelle Norm startet in Phase 6 keinen Catalog-Upload, Menuebereich,
  Kaufweg, neuen API-Vertrag oder Entitlement-Bypass.
- Alle sieben Sprachen, 320/360/375/390/430/768 plus Desktop, Drawer-Vertrag,
  Keyboard/Safe Area, Barrierefreiheit, automatische Gates und gueltige
  Vorher-/Nachher-Evidenz bleiben Pflicht. Keine Business-/Security-/DB-
  Aenderung, kein Deployment und kein neuer Final Lock durch diesen Nachtrag.

### 5.5 Customer Custom-Surprise-Terminologie – Founder 2026-09-13

Reservierter **Presentation-Systemtitel**, keine behauptete Titelherkunft:
Nur wenn die kanonische Kategorie nach Trim exakt `Eigene Überraschung` ist,
wird der nach Trim exakt gleiche Titel in der Customer-Darstellung als
Systemtitel behandelt, auch nach manueller Owner-Eingabe. Ein leerer Titel
derselben Kategorie verwendet ebenfalls den Customer-Fallback.
Keine Teilstring-/Case-/Aehnlichkeitsheuristik und keine Typableitung nur aus
Titel oder Produktgruppe. Andere individuelle Titel bleiben bytegleich und
werden nicht vom DOM-Uebersetzer umgeschrieben. Derselbe Titel in einer anderen
oder unbekannten Kategorie bleibt unveraendert. Owner/Admin und gespeicherte
Daten behalten die interne Bezeichnung.

| Locale | Customer-Kategorie | Customer-Fallback-Titel |
| --- | --- | --- |
| DE | Überraschung des Hauses | Eine Überraschung für dich |
| EN | A surprise from the restaurant | A surprise for you |
| FR | Surprise de la maison | Une surprise pour toi |
| IT | Sorpresa della casa | Una sorpresa per te |
| ES | Sorpresa de la casa | Una sorpresa para ti |
| ZH | 店家惊喜 | 给你的惊喜 |
| KO | 매장에서 준비한 깜짝 선물 | 당신을 위한 깜짝 선물 |

Kategorie und generischer Titel sind getrennt. Bestehende Customer-I18n- und
ARIA-Leaks werden nur im freigegebenen Darstellungsumfang korrigiert.
Keine neue Reward-/Eligibility-/Einloesungs-/Auth-/RLS-/DB-Logik, Migration
oder Aenderung des Phase-6B-Layouts, Swipe-/Keyboard-Verhaltens und Hit-Area.
Dieser Zielvertrag allein ist kein Implementierungs- oder Staging-Final-Lock.

### 5.6 Customer-Sprachwahl im Restaurantkopf – Founder 2026-09-13

Phase 6C darf die separate Sprachzeile im restaurantbezogenen Customer-Portal
durch genau einen vorhandenen Sprachwaehler im gemeinsamen Restaurantkopf
ersetzen. Reihenfolge: Restaurantauswahl, aktive Sprache, Info. Sprache als
DE/EN/FR/IT/ES/ZH/KO ohne Flaggen; Sprache und Info jeweils mindestens 44 × 44 px,
sichtbarer Fokus, lokalisierter ARIA-Name inklusive aktueller Sprache.
Native vorhandene Auswahl und Speicherung bleiben unveraendert; kein zweiter
Sprachdialog, keine neue Persistenz und keine Aenderung von Info/Restaurantwechsel.

Explizite begrenzte Ausnahme zum Phase-6B-Home-Layout-Lock: Die Sprachzeile darf
entfallen, der Restaurantname darf im Kopf kontrolliert mit Ellipse enden;
min-width: 0 und feste Touchflaechen verhindern Ueberlappung bei 320 px.
Carousel, Gesten, Bildkarten, Titelvertrag und Business-/Security-Vertraege
bleiben unangetastet. Dieselbe Kopfkomponente darf auf Desktop verwendet
werden, sofern der Regressionstest besteht. Screens ohne Restaurantkopf
behalten vorerst ihren bestehenden Sprachwaehler.

320/360/390/430/768 und sieben Sprachen physisch pruefen, realen Hoehengewinn
messen statt 50–60 px vorweg als PASS zu behaupten. Lokale gruenen Gates,
exakter Checkpoint und Staging-Abnahme erforderlich; kein Production-Deployment
und kein Gesamt-Phase-6C-Final-Lock allein durch diesen Teilfix.

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

**SUPERSEDED (2026-09-12):** Die vorherige Nummerierung mit Stripe als Gate 6
ist historisch. Verbindlich ist ab jetzt diese Reihenfolge; die bestehenden
Country-, PRO-Phase-1-, Password-, Phase-4- und Phase-5-Final-Locks bleiben erhalten.

| Phase | Verbindlicher Umfang | Abschlussgrenze |
| --- | --- | --- |
| 6 | Compact Mobile UI fuer Customer, Staff, Owner, Auth und Platform Admin; alle Drawer/Bottom Sheets | Mobile Final Lock; keinerlei Business-, Security-, QR-, PIN-, Rechte- oder Datenbankaenderung |
| 7 | PRO und zentrale Capacity: 15 Angebote und 15.000 aktive eindeutige Kunden in 365 Tagen; Warnungen, Owner-Plananzeige und sicherer Downgrade | Staging-Vertraege vorhanden; AT + PRO LOCKED, kein oeffentlicher Kauf |
| 8 | Catalog Add-on: sichere Uploads, Quoten, Publikation, Customer-Anzeige, Deaktivierung mit Datenerhalt, eigene Platform-Steuerung | Technisch fertig; Server Gate geschlossen, kein oeffentlicher Kauf |
| 9 | Stripe-Testintegration und versionierte BASIC-/PRO-/Offer-/Customer-Add-on-Bindungen, Checkout, Webhooks und Entitlement-Synchronisierung | Vier TEST-Price-Bindungen VERIFIED, LIVE UNBOUND; Tax PENDING_CONFIGURATION. Negativer technischer Checkout-/Webhook-Vertrag auf Staging gelockt; positiver Stripe-Checkout und echte Webhook-Aktivierung offen. LIVE bleibt bis Legal, Seller und formaler Billing-Freigabe gesperrt. |
| 10 | Austria Basic Launch Gate: AT aktuell LOCKED; Basic 59 EUR netto/Monat erst nach gesonderter Freigabe; weitere EU-Laender vorbereitet und gesperrt | Legal/Readiness, Golden Path und Release-Nachweise; Production und kommerzieller Start nur nach finaler Founder-Freigabe |

Phase 6 umfasst insbesondere inhaltsgetriebene Drawer-Hoehen, keinen
unproduktiven Leerraum, eindeutige primaere/sekundaere Aktionen,
Keyboard-Anpassung, Safe Area, Scroll Lock, Focus Management und kontrolliertes
Schliessen kritischer Dialoge. Der ausfuehrliche bereits freigegebene
Phase-6B–6F-Mobile-/Drawer-Vertrag bleibt unverkuerzt verbindlich.

Austria Legal Preparation/Professional Review bleibt erforderlich;
die neue Phasenfolge erteilt keine Rechts-, Steuer- oder Zahlungsfreigabe.
Ein spaeterer Phase-Auftrag startet nicht automatisch mit dieser Dokumentation.

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
-> EU
```

Die Schweiz ist nicht Bestandteil dieses EU-Launchumfangs und bedarf einer
gesonderten spaeteren Entscheidung.

Es gibt genau einen Core. Separate geklonte Apps je Branche sind nicht erlaubt.

## 11. Post-V1 Non-Launch-Blocker

Diese Themen blockieren den Austria-Restaurant-V1-Launch nicht:

- Platform Admin Warning Center,
- Recommendation Center,
- erweiterter Security Center,
- AI Risk Scoring,
- Shared Loyalty Network,
- Shared Branch Points,
- Gift Cards,
- POS,
- Premium,
- erweiterte Analytics,
- groessere neue Reward-Mechaniken,
- Deutschland und internationaler Rollout.

Vorhandene vorbereitete Architektur darf bestehen bleiben. Daraus entsteht
keine oeffentliche Freischaltung und kein Launch-Blocker.

Ausnahme gemaess Founder-Entscheidung 2026-09-12: Catalog ist als eigenstaendiges
Add-on technisch vor Launch fertigzustellen (Phase 8), nicht im Pro-Paket.
Das bereits vorhandene Phase-5-Operations-&-Health-Center bleibt geschuetzt;
diese Liste verlangt keinen zweiten Warning-Center-Neubau.
Premium/Business, Gift Cards, POS/Kassa Integration, Shared Points / Shared
Loyalty Network, Enterprise Integration, Onlinebestellung/-zahlung und eine
komplexe Usage Credit Engine ohne reale Datengrundlage sind ausdruecklich
aus diesem Durchlauf ausgeschlossen und duerfen Basic Austria nicht verzoegern.

## 12. i18n und Austria Launch

Die vorhandene Architektur fuer `de`, `en`, `fr`, `it`, `es`, `zh` und `ko`
bleibt erhalten. **SUPERSEDED (2026-09-12):** Die fruehere Ausnahme, dass eine
offene Vollpruefung der sechs nichtdeutschen Sprachen den Launch nicht blockiert,
gilt fuer die neue Phase-6–10-Abnahme nicht mehr. Alle sieben Sprachen muessen
im betroffenen Umfang bestehen. Deutsch bleibt Austria-Launch-Sprache;
der Sprachschalter darf keinen Inhalt oder Bedienweg ueberlagern.

Rechtsraum und UI-Sprache bleiben getrennt. Rechtstexte werden niemals allein
aus der UI-Sprache gewaehlt.

## 13. Modell-Empfehlung fuer Codex-Loops

Jeder groessere Codex-Loop nennt das empfohlene Modell:

- kleiner UI- oder Git-Fix: `GPT-5.6 Sol - Medium/High`,
- normale Implementierung: `GPT-5.6 Sol - High`,
- kritische Architektur, Security oder Release: `GPT-6 Astra - High`, sofern verfuegbar.

Die Empfehlung aendert keine Sicherheits-, Freigabe- oder Testanforderung.

## 14. Status- und Nachweisregel

Dieses Dokument ist seit 2026-09-10, aktualisiert am 2026-09-12, die
Roadmap-Quelle fuer den Austria-Launch.
Es erteilt weder eine Production-Freigabe noch bestaetigt es unerledigte Gates.
Der naechste Status-Audit muss ausschliesslich diesen Master fuer Scope,
Reihenfolge und Post-V1-Zuordnung verwenden und den technischen Ist-Stand
separat nachweisen.

## 15. Basic, Pro und eigenstaendige Add-ons – Founder-Zielvertrag

Die Anwendung bleibt `app.bonus.wuxuaisbi.com`. Der erste kommerzielle Release
soll AT zuerst freigeben; aktuell bleibt AT LOCKED. DE, FR, IT und ES bleiben
technisch vorbereitet und oeffentlich gesperrt; Oeffnung pro Land erst nach
dessen eigener Legal-/Readiness-Abnahme. Die Schweiz gehoert nicht zum
EU-Launchumfang. UI-Sprache ist keine Laenderfreigabe.

| Produkt | Preisziel | Kommerzieller Erststart | Funktionsziel |
| --- | --- | --- | --- |
| Basic | 59 EUR netto/Monat | AT derzeit LOCKED | 5 Angebote; 3.000 aktive eindeutige Kunden innerhalb der jeweils zurueckliegenden 365 Tage |
| Pro | 149 EUR netto/Monat | AT + PRO derzeit LOCKED | 15 Angebote; 15.000 aktive eindeutige Kunden innerhalb der jeweils zurueckliegenden 365 Tage; nicht unbegrenzt |
| Offer Add-on | 19 EUR netto/Monat je Einheit | Keine automatische Aktivierung | +5 Angebote je Einheit; mehrere Einheiten moeglich |
| Customer Add-on | 29 EUR netto/Monat je Einheit | Keine automatische Aktivierung | +5.000 Kunden je Einheit; mehrere Einheiten moeglich |
| Catalog/Premium | Preis und Freigabe spaeter gesondert zu entscheiden | Nicht als aktueller Billing-Katalog verkaufen | Historische Roadmap-Idee, keine aktive Price-Bindung |

Grundlegende UX-, Sicherheits- und Performanceverbesserungen bleiben in
bestehenden Paketen enthalten. Nur Module mit eigenstaendigem Wert oder
zusaetzlichen Kosten werden Add-ons; nicht jede neue Funktion ist ein Add-on.
Kuenftige Bundles beseitigen die separate Kaufbarkeit reifer Add-ons nicht.

### 15.1 Basic

- Maximal fuenf gleichzeitig aktive Angebote.
- Offer Notifications und Reward-Reached Notifications deaktiviert.
- Catalog deaktiviert, ausser nach einer zukuenftig freigegebenen separaten
  Catalog-Berechtigung; Pro allein autorisiert Catalog niemals.
- Kundenkapazitaet: 3.000 aktive eindeutige Kunden im serverzeitgebundenen,
  halboffenen 365-Tage-Fenster. Neue kapazitaetssteigernde Aktionen werden
  serverseitig blockiert, sobald das wirksame Limit erreicht ist. Bestehende
  Daten bleiben erhalten; Downgrade und Add-on-Ende loeschen nichts.

### 15.2 Pro

- 15 Active Offers und 15.000 aktive eindeutige Kunden im 365-Tage-Fenster;
  weitere Kapazitaet nur durch wirksame Add-on-Einheiten.
- Kunden-Consent und Abmeldung bleiben fuer Notifications verpflichtend.
- Owner sehen aktuellen effektiven Plan, Funktionen, Beginn und Ablauf klar.
- Platform Admin schaltet die vollstaendige Pro-Entitlement-Gruppe mit einem
  eindeutigen Schalter ein oder aus. Bestehende Bestaetigungs-/Auditpflichten
  duerfen nicht zugunsten einer unkontrollierten Ein-Klick-Mutation entfallen.
- Aktivierung erfasst Beginn, Ende, Grund, Akteur und Audit Log.
- Ablauf oder Downgrade stellt Basic-Grenzen wieder her. Keine Loeschung von
  Angeboten, Kunden, Statistiken oder anderen Geschaeftsdaten; nur Pro-Faehigkeiten
  werden deaktiviert. Catalog bleibt davon als eigenstaendiges Add-on getrennt.
- Keine neuen unbenannten Marketingmodule aus der Formulierung
  `hoehere Marketingfaehigkeit` ableiten.

## 16. Catalog Add-on – eigenstaendiger V1-Zielumfang

**Historische Roadmap, nicht aktueller Billing-Katalog:** Preis, Umsetzung
und kommerzielle Freigabe des Catalog-Moduls sind gesondert zu entscheiden.
Die bereits implementierten Capacity-Add-ons sind Offer +5 und Customer
+5.000; siehe den aktuellen kanonischen Produktvertrag.

- PDF, JPG, JPEG und PNG; maximal 10 MB pro Datei.
- Vorlaeufig 50 MB Gesamtspeicher pro Standort, als konfigurierbares Entitlement.
- Private Object Storage; Datenbank speichert nur Metadaten und Referenzen.
- Serverseitige Validierung von Dateigroesse, MIME-Typ und tatsaechlichem
  Dateiheader; Dateiendung oder Frontendpruefung reicht nicht.
- Owner koennen hochladen, ersetzen, Vorschau ansehen, publizieren und
  Publikation zuruecknehmen. Customer lesen nur publizierte Inhalte mit
  wirksamer Catalog-Berechtigung.
- Nach Add-on-Ende bleiben Originaldateien und Metadaten erhalten, aber
  oeffentliche Anzeige und neue Uploads sind gesperrt. Reaktivierung ermoeglicht
  Wiederherstellung ohne Neuregistrierung.
- Kein Onlinebestellen, Onlinebezahlen oder POS-/Kassa-Anschluss.
- Gleiches WUXUAI-Konto und gleicher Stripe Customer; Catalog wird ein eigener
  Subscription Item in der bestehenden Stripe Subscription.
- Platform Admin kann Catalog unabhaengig von Pro aktivieren, deaktivieren
  oder befristen, jeweils mit Grund und Audit. Pro-Schalter und Catalog-Schalter
  muessen vollstaendig getrennt sein.

## 17. Einheitliche serverseitige Entitlement-Architektur – Ziel

```text
Effective Access =
Plan Entitlements
+ Active Stripe Add-ons
+ Valid Platform Admin Overrides
```

- Plans: `basic`, `pro`, `premium` reserviert; Add-ons: `catalog` und spaetere
  eigenstaendige Module. Premium-Reservierung ist kein Implementierungsauftrag.
- Konfigurierbare Feature Keys und Limits. Preise, Multiplikatoren und Quoten
  nicht in verteilter Businesslogik hardcoden; bestehende zentrale Vertraege
  bleiben bis zu ihrer separat geprueften Erweiterung erhalten.
- Stripe-Customer-, Subscription- und Subscription-Item-Zuordnungen.
- Webhook-Signaturpruefung, Idempotenz, Replay-Schutz und Statussynchronisierung.
- Aktivierung, Verlaengerung, Zahlungsfehler, Kuendigung, Ablauf und Wiederherstellung.
- Platform Overrides mit Beginn, Ende, Grund, Akteur, Ziel-Organization/Location
  und Audit. Owner lesen nur den effektiven Plan-/Add-on-Zustand; sie duerfen
  Subscription-Daten nicht direkt veraendern.
- Frontend-Verbergen ersetzt keine Autorisierung. Umgehungsrequests muessen
  serverseitig abgewiesen werden; RLS, Tenantgrenzen und bestehende Security
  bleiben wirksam.
- Die Zusammenfuehrung von Entitlements ist keine Umgehung des kommerziellen
  Launch Gates: Erststart bleibt Basic-only, Pro und Catalog bleiben oeffentlich
  weder kaufbar noch nutzbar. Administrative technische Tests sind keine
  kommerzielle Freigabe.

## 18. Historischer Drei-Monats-Beobachtungsplan nach Launch

Die folgenden Punkte sind eine datierte Roadmap-Idee, nicht der aktuelle
Preis-, Capacity- oder Trial-Vertrag. PRO-Kapazitaet und Capacity-Add-on-
Preise sind inzwischen kanonisch festgelegt; Catalog bleibt gesondert.

1. Etwa drei Monate reale Restaurantnutzung, Speicher-, Notification-, Angebots-
   und Supportkosten auswerten.
2. Historisch geplante Pro-Kapazitaet und Upgrade-Regeln; heute durch den
   kanonischen 15-Angebote-/15.000-Kunden-Vertrag ersetzt.
3. Catalog-Endpreis anhand dieser Daten bestimmen: 5 EUR, 9 EUR oder anderer
   Betrag; die 5-EUR-Planung ist kein bereits angelegter Live-Preis.
4. Pro und Catalog nach bewusster Entscheidung ueber Stripe und Platform-
   Konfiguration freigeben, ohne neue Konten oder Neuentwicklung des Kern-
   Paketsystems. Kein automatisches Freischalten nach Kalenderablauf.
5. Naechste Add-ons anhand echten Bedarfs waehlen; bei 3–5 reifen Add-ons
   Premium-/Business-Bundles entwerfen und Einzelkauf erhalten.

Dieser Beobachtungszeitraum ist nicht mit dem neuen einmonatigen BASIC-/PRO-
Trial nach bestaetigter Provideraktivierung zu verwechseln. Historische
Drei-Kalendermonats-Trials bleiben unveraendert.

## 19. Pflichtabnahme je Phase 6–10

- Country, PRO Phase 1, Global Password Visibility, Phase 4 UI/UX Consistency
  und Phase 5 Operations & Health Center: bestehende Final Locks erhalten.
- Country Gate: AT derzeit LOCKED; weitere EU-Laender Prepared and Blocked. Technische
  Country-Aktivierung ist keine automatische Production-/Commercial-Freigabe.
- DE/EN/FR/IT/ES/ZH/KO und 320/360/375/390/430/768 px plus Desktop bestehen.
- Business-/Security-Vertraege, RLS und Cross-Tenant-Isolation erhalten;
  Phase 6 aendert ausdruecklich keine dieser Logiken.
- Typecheck, Lint, fokussierte Tests, Full Tests, Build, Secret Scan und
  `git diff --check` bestehen. Physische Evidenz nicht durch statische Tests ersetzen.
- Falls eine spaetere Phase Migrationen benoetigt: nur Forward Migration,
  zuerst lokal validieren, Staging-Anwendung erst nach Freigabe; Production
  niemals automatisch aendern. Phase 6 bleibt migrationsfrei.
- Taskeigene Hintergrundprozesse kontrolliert beenden; 0 unnoetige Prozesse
  behalten. Keine fremden Prozesse beenden.

## 20. Zielzustand versus heutiger Nachweis

**Historischer Snapshot vom 2026-09-12.** Aktueller Staging-Stand und
offene Restgates stehen in `V1_CURRENT_IMPLEMENTATION_STATUS.md`.

Ziel: Basic, Pro und Catalog technisch bereit; kommerziell ausschliesslich
Austria Basic; spaetere Freigabe der beiden Upgrades nach realen Daten ueber
Konfiguration statt Neuregistrierung oder Neubau des Kernsystems.

Dieser Dokumentationsschritt aktualisiert keinen Runtime-Preis, keine
Entitlement-Zeile, keinen Stripe Product/Price/Customer/Subscription Item,
keine Country Policy und kein Deployment. Der gesicherte Phase-1–5-Stand und
der noch nicht physisch abgenommene Phase-6-Entwurf bleiben bestehen.
Die technische Vollstaendigkeit der Phasen 7–10 ist damit **NICHT NACHGEWIESEN**.

## 21. Phase 7B.4C – lokaler Test-Tenant-Vertrag, 2026-09-15

Status: **LOCAL CODE LOCK / NOT READY FOR STAGING**.
Dieser Nachtrag betrifft ausschliesslich die lokale Migration 03000.
Frühere Final Locks und angewendete Migrationen bleiben unverändert.

- Der Cleanup-Read behält `eligible`, `restaurant_name` und die vollständige
  flache numerische `inventory` sowie alle bisherigen Isolationsprüfungen.
- Der additive `marking_preflight` prüft den Zustand vor der Erstmarkierung.
  Nur dort ist eine fehlende Markierung erwartbar. Cleanup verlangt weiterhin
  eine vorhandene Markierung. Andere Sicherheits-, Daten-, Storage-, Audit-
  oder Receipt-Sperren werden nicht ausgenommen.
- Platform Admin, Recent Auth höchstens zehn Minuten, Ziel-/Operationssperre
  und Request-Replay-Prüfung gehen dem Preflight voraus. Registry, Audit und
  Receipt werden atomar gespeichert. Persistierte Receipts blockieren spätere
  Cleanup-Preflights, nicht ihren eigenen noch ungeschriebenen Erstrequest.
- Receipts verwenden `target_restaurant_ref` statt `restaurant_id`, behalten
  UUID-Snapshots und sind von generischer Cleanup-Erkennung ausgenommen.
- Jeder zugeordnete `branch_subscriptions`-Eintrag blockiert, auch Trial oder
  unbekannter Zustand. Nicht prüfbares Schema blockiert ebenfalls. Ein leerer
  kanonischer lokaler Billingzustand kann bestehen; dies attestiert keine
  unbekannten externen Stripe-Rechnungen.
- Platform-/Commercial-Audit-Historie bleibt erhalten und blockierend.
  Keine Datenbereinigung oder automatische Testkunden-Markierung.

Nachweis: `reports/2026-09-15_PHASE_7B_4C_LOCAL_COMPLETION_REPORT.md`.
Fresh/Upgrade/Repeat und Parallelität wurden in synthetischen lokalen
PostgreSQL-Abhängigkeitsschemas geprüft, nicht durch Replay sämtlicher
historischer Migrationen oder gegen Staging. Full Tests: 1849/1849 PASS.

Kein Commit, Push, Staging-Zugriff, Deployment, Pro-Grant oder Stripe-/
Production-Schreibvorgang. Eine spätere Staging-Anwendung und Anpassung des
bisherigen vierargumentigen Markierungs-UI-Aufrufs brauchen separate Freigabe;
das alte unsichere RPC-Overload bleibt gesperrt.
