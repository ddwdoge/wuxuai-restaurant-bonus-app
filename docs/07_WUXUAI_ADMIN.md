# 07_WUXUAI_ADMIN.md

# WUXUAI Bonus V1 -- WUXUAI Admin Portal

Status: **LOCK**

Dieses Dokument beschreibt das **WUXUAI Admin Portal** als interne
Verwaltungsoberfläche für den Betreiber der SaaS-Plattform.\
Das WUXUAI Admin Portal ist **nicht** das Restaurant Portal, **nicht**
das Kundenportal und **nicht** das Staff Portal.

Es ist die interne Steuerzentrale für WUXUAI.

## 0.1 V1 Restaurant-Verwaltung

Status: **CODE LOCK / STAGING OFFEN**

Die interne Restaurant-Verwaltung ist als V1-Basis vorgesehen unter:

```text
/admin/platform
/admin/platform/restaurants/:id
```

Sie ist strikt vom Restaurant Portal getrennt und nur für Plattformrollen
gedacht:

- platform_owner
- platform_admin
- app_admin
- super_admin
- wuxuai_admin
- support
- billing_admin
- security_admin
- viewer

Schreibaktionen bleiben auf Schreibrollen begrenzt. Lesende Rollen sehen
Restaurantliste und Details, aber keine aktiven Schreibaktionen.

V1 zeigt:

- Restaurants gesamt
- aktive Restaurants
- aktive Testphasen
- bald ablaufende Testphasen
- gesperrte Restaurants
- neue Restaurants heute
- Restaurantliste mit Suche und Filter
- Restaurantdetails
- Trial-/Abo-Daten, falls vorhanden
- QR-/Portal-Links
- Statusverwaltung aktiv / pausiert / gesperrt
- Audit-Auszug

Alle globalen Restaurantdaten werden über sichere Plattform-RPCs geladen.
Normale Restaurantbesitzer dürfen diese globale Seite nicht sehen.

------------------------------------------------------------------------

## 1. Zweck dieses Dokuments

Diese Datei legt fest:

-   welche Rolle das WUXUAI Admin Portal im Gesamtsystem hat,
-   was in V1 vorbereitet wird,
-   was ausdrücklich nicht in das Restaurant Portal gehört,
-   welche SaaS-Verwaltungsfunktionen später intern benötigt werden,
-   welche Daten WUXUAI verwalten darf,
-   welche Daten Restaurants selbst verwalten,
-   welche Funktionen erst nach dem Pilotbetrieb gebaut werden.

Das Dokument dient Codex als verbindliche Grundlage.

Codex darf aus dieser Datei **keine neuen Restaurant-Funktionen
ableiten**, sondern nur erkennen, welche Funktionen intern für WUXUAI
vorgesehen sind.

------------------------------------------------------------------------

## 2. Grundentscheidung

🟢 **FIX**

WUXUAI Bonus besitzt langfristig vier getrennte Oberflächen:

``` text
WUXUAI Admin
Restaurant Portal
Staff Portal
Customer Portal
```

Das WUXUAI Admin Portal ist nur für WUXUAI.

Restaurantbesitzer dürfen diese Oberfläche niemals sehen.

Kunden dürfen diese Oberfläche niemals sehen.

Mitarbeiter dürfen diese Oberfläche niemals sehen.

------------------------------------------------------------------------

## 3. Ziel des WUXUAI Admin Portals

Das WUXUAI Admin Portal dient der Plattformverwaltung.

Es beantwortet interne Fragen wie:

-   Welche Restaurants nutzen die Plattform?
-   Welche Restaurants sind in der Testphase?
-   Welche Restaurants zahlen?
-   Welche Abos laufen aus?
-   Welche Restaurants haben technische Probleme?
-   Welche Restaurants nutzen das System aktiv?
-   Gibt es Missbrauch?
-   Gibt es ungewöhnliche Punktebuchungen?
-   Funktionieren QR-Flows, RPCs und Storage?
-   Welche Standardregeln verwendet die Smart Reward Engine?
-   Welche Feature Flags sind aktiv?
-   Welche Version der Plattform ist bei welchem Restaurant aktiv?

Das WUXUAI Admin Portal ist also kein Arbeitswerkzeug für Restaurants,
sondern ein Werkzeug für SaaS-Betrieb, Support, Abrechnung und
Qualitätssicherung.

------------------------------------------------------------------------

## 4. Abgrenzung zu anderen Portalen

### 4.1 Restaurant Portal

Das Restaurant Portal ist die Oberfläche für Restaurantbesitzer.

Dort geht es um:

-   Dashboard
-   Gäste
-   Belohnungen
-   Willkommensgeschenke
-   QR Center
-   Mitarbeiter
-   Einstellungen

Das Restaurant Portal hilft dem Restaurant, aus Gästen Stammgäste zu
machen.

### 4.2 Staff Portal

Das Staff Portal ist für Mitarbeiter/Kellner.

Dort geht es nur um:

-   Gast finden
-   QR prüfen
-   Belohnung einlösen
-   Punkte vergeben
-   Staff Session
-   Audit

Keine Verwaltung.

### 4.3 Customer Portal

Das Customer Portal ist für Gäste.

Dort geht es nur um:

-   Mein Bonus
-   QR
-   Punkte
-   Belohnungen
-   Bonus Boost
-   Willkommensgeschenk

### 4.4 WUXUAI Admin

Das WUXUAI Admin Portal ist für den Plattformbetreiber.

Dort geht es um:

-   SaaS-Kunden
-   Abos
-   Rechnungen
-   Logs
-   Support
-   Sicherheit
-   Feature Flags
-   Plattformmetriken
-   globale Standardwerte

------------------------------------------------------------------------

## 5. V1-Entscheidung

🟢 **FIX**

Das vollständige WUXUAI Admin Portal wird **nicht** vor dem ersten
Pilotrestaurant als komplexes Backoffice priorisiert.

Grund:

V1 Ziel ist nicht, ein internes Enterprise-Backoffice zu bauen.

V1 Ziel ist:

``` text
Ein Restaurant kann starten.
Gäste können sich registrieren.
Punkte funktionieren.
Belohnungen funktionieren.
Bonus Boost funktioniert.
Das Restaurant erkennt den Nutzen.
```

Das WUXUAI Admin Portal wird daher in V1 als schlanke interne Basis
umgesetzt.

V1-Basis:

- Restaurantliste
- Trial Status
- Abo-Status
- Zahlungsstatus
- manuelle Trial-Verlängerung
- manuelles Aktivieren / Pausieren
- Audit für jede interne Änderung
- getrennte Plattform- und Restaurantrollen

Nicht V1:

- Stripe Checkout
- Stripe Webhook-Automation
- Rechnungsarchiv
- komplexe Support-Workflows
- Feature-Flag-UI

Die Priorität liegt zuerst auf:

1.  Restaurant Portal
2.  Customer Portal
3.  Staff Portal
4.  Pilotbetrieb
5.  WUXUAI Admin Portal Basis

------------------------------------------------------------------------

## 6. Warum das WUXUAI Admin Portal trotzdem dokumentiert wird

Obwohl das vollständige Admin Portal nicht sofort gebaut wird, muss die
Architektur dafür vorbereitet sein.

Grund:

Sobald echte Restaurants aktiv sind, braucht WUXUAI interne Kontrolle
über:

-   Testphasen
-   Abos
-   Fehlermeldungen
-   Datenqualität
-   Missbrauch
-   Support
-   Plattformzustand

Wenn diese Funktionen später ohne Konzept eingebaut werden, entsteht
Chaos.

Deshalb wird das Portal jetzt konzeptionell festgelegt, aber nicht als
kompletter V1-Feature-Block gebaut.

------------------------------------------------------------------------

## 7. SaaS-Modell

🟢 **FIX**

### 7.1 Testphase

Jedes Restaurant erhält:

``` text
30 Tage kostenlos
Keine Kreditkarte erforderlich
Jederzeit kündbar
Kein rückwirkendes Nachzahlen
```

Nach 30 Tagen entscheidet das Restaurant, ob es weiter nutzen möchte.

### 7.2 Keine rückwirkende Zahlung

Es wird **niemals** rückwirkend für die kostenlose Testphase
abgerechnet.

Begründung:

Eine rückwirkende Rechnung nach 30 oder 90 Tagen erzeugt psychologische
Ablehnung.

Besser:

-   Restaurant testet risikofrei.
-   System zeigt erreichten Wert.
-   Restaurant entscheidet freiwillig.

### 7.3 Erfolgsbericht vor Ablauf

Vor Ablauf der Testphase soll das System dem Restaurant zeigen:

-   neue Mitglieder
-   wiederkehrende Gäste
-   eingelöste Belohnungen
-   aktive Bonus Boosts
-   Empfehlungen
-   gesammelte Punkte

Das Ziel ist:

``` text
Nicht verkaufen über Preis.
Sondern verkaufen über nachgewiesenen Nutzen.
```

### 7.4 V1 Preisstrategie

Für V1 gilt:

``` text
Ein einfaches Paket
monatlich kündbar
ca. 59 € bis 69 € pro Monat
```

Keine komplizierten Tarife in V1.

Später können Pakete folgen:

-   Solo
-   Small Chain
-   Business Chain
-   Enterprise

------------------------------------------------------------------------

## 8. Organisations- und Filialmodell

🟢 **FIX für Architektur**

V1 verhält sich einfach:

``` text
1 Restaurant
=
1 Organisation
=
1 Filiale
=
eigene Gäste
=
eigene Punkte
=
eigenes Abo
```

V2 vorbereitet:

``` text
Organisation
├── Filiale 1
├── Filiale 2
└── Filiale 3
```

Das WUXUAI Admin Portal muss später Organisationen und Filialen
verwalten können.

### 8.1 V1

In V1 keine Filial-Verwaltung im UI.

### 8.2 V2

Später:

-   einzelne Restaurants zu Organisation zusammenführen
-   Filialen verwalten
-   filialübergreifende Punkte optional
-   filialübergreifende Belohnungen optional
-   zentrale Rechnung für Organisationen

### 8.3 WUXUAI Admin Rolle

Nur WUXUAI Admin darf später systemweite Zusammenführungen durchführen.

Restaurants dürfen nicht selbst beliebig Datenstrukturen zusammenführen,
weil dabei Kundendaten, Punkte und Rechnungen betroffen sind.

------------------------------------------------------------------------

## 9. Kernbereiche des WUXUAI Admin Portals

Das vollständige WUXUAI Admin Portal besteht langfristig aus folgenden
Bereichen.

### 9.1 Übersicht

Zentrale Plattformübersicht.

Zeigt:

-   aktive Restaurants
-   Restaurants in Testphase
-   zahlende Restaurants
-   gekündigte Restaurants
-   neue Registrierungen
-   aktive Gäste
-   Punktebuchungen
-   eingelöste Belohnungen
-   aktive Bonus Boosts
-   technische Fehler
-   offene Supportfälle

### 9.2 Restaurants

Liste aller Restaurants.

Pro Restaurant:

-   Name
-   Slug
-   Besitzer
-   Status
-   Testphase
-   Abo-Status
-   letzter Login
-   Anzahl Gäste
-   Anzahl Punktebuchungen
-   Anzahl Belohnungen
-   QR-Nutzung
-   Onboarding-Status
-   Storage-Nutzung

### 9.3 Organisationen

V2 Bereich.

Verwaltet:

-   Organisationen
-   Filialen
-   Eigentümer
-   zentrale Abrechnung
-   Filiallimits
-   Zusammenführungen

In V1 vorbereitet, aber nicht priorisiert.

### 9.4 Abos & Rechnungen

Verwaltet:

-   Trial-Start
-   Trial-Ende
-   Status: trialing, active, cancelled, expired
-   Zahlungsstatus
-   Rechnungen
-   Stripe Kundennummern
-   Zahlungsausfälle
-   Upgrade/Downgrade
-   Kündigungen

### 9.5 Support

Interner Bereich für:

-   Restaurant suchen
-   Kundendaten anzeigen, soweit notwendig
-   Audit-Log prüfen
-   Probleme nachstellen
-   QR-Links testen
-   Fehlermeldungen dokumentieren

Support darf niemals unkontrolliert Kundendaten verändern.

### 9.6 Sicherheit & Missbrauch

Bereich für:

-   verdächtige Geräte
-   viele Registrierungen von gleicher Device ID
-   ungewöhnlich viele Empfehlungen
-   ungewöhnlich hohe Punktebuchungen
-   häufige Belohnungseinlösungen
-   A/B Referral-Zirkel
-   auffällige Staff-Aktivität

### 9.7 Logs

Zeigt:

-   Audit-Logs
-   RPC Fehler
-   Storage Fehler
-   Auth Fehler
-   Payment Events
-   Edge Function Events
-   Systemereignisse

### 9.8 Feature Flags

Verwaltet:

-   neue Funktionen pro Restaurant aktivieren
-   Beta-Funktionen
-   V2-Funktionen
-   Pilotgruppen
-   Rollback

### 9.9 Smart Engine Verwaltung

Nur WUXUAI intern.

Verwaltet globale Standardwerte für:

-   Smart Reward Engine
-   Willkommensgeschenk-Quoten
-   Tageslimits
-   Rentabilitätsfaktoren
-   Bonus Boost Standardwerte
-   zukünftige Empfehlungen

Restaurantbesitzer dürfen diese globalen Werte in V1 nicht bearbeiten.

------------------------------------------------------------------------

## 10. Wichtige Admin-Funktionen

### 10.1 Restaurant sperren

WUXUAI Admin kann ein Restaurant sperren, wenn:

-   Abo nicht bezahlt
-   Missbrauch
-   rechtliche Gründe
-   Pilot beendet
-   Datenschutzproblem

Sperrung darf Kundenportal nicht sofort zerstören, sondern muss einen
klaren Zustand anzeigen.

Beispiel:

``` text
Dieses Bonusprogramm ist derzeit nicht aktiv.
Bitte wende dich an das Restaurant.
```

In V1 ist **Pausieren** zunächst eine Abo-/Payment-Verwaltung.
Pausieren darf nicht automatisch `restaurants.status = suspended` setzen,
solange kein eigener Customer-/Staff-Lock mit verständlicher Meldung
gebaut und getestet ist.

### 10.2 Testphase verlängern

WUXUAI Admin kann eine Testphase manuell verlängern.

Beispiel:

-   Pilotrestaurant braucht mehr Zeit
-   technische Probleme während Testphase
-   Verhandlung läuft

### 10.3 Abo manuell aktivieren

Für frühe Pilotkunden kann WUXUAI Admin ein Abo manuell aktivieren,
bevor Stripe vollständig automatisiert ist.

Aktivieren setzt den Abo-Status, bestätigt aber nicht automatisch eine Zahlung.

### 10.4 Zahlungsstatus manuell setzen

🟢 **V1 BASIS**

Vor Stripe-Automation kann WUXUAI Admin den Zahlungsstatus manuell
setzen.

Erlaubte Status:

- nicht erforderlich
- offen
- bezahlt
- fehlgeschlagen
- manuell

Jede Änderung wird auditiert.

Zahlung manuell bestätigen ändert nicht automatisch:

- Abo-Status
- Restaurantstatus
- laufendes Periodenende

### 10.5 Daten prüfen

WUXUAI Admin darf systemweite Daten prüfen, aber Änderungen müssen
protokolliert werden.

Jede Admin-Aktion benötigt Audit.

------------------------------------------------------------------------

## 11. Datenschutz und Sicherheit

### 11.1 Grundregel

WUXUAI Admin hat mehr Rechte als Restaurants, aber diese Rechte müssen
streng protokolliert werden.

### 11.2 Kein unkontrollierter Datenzugriff

Auch WUXUAI Admin darf nicht ohne Grund alle Kundendaten durchsuchen.

V1 kann technisch einfacher sein, aber langfristig gilt:

-   Zugriff begründen
-   Zugriff protokollieren
-   sensible Daten minimieren

### 11.3 Audit für WUXUAI Admin

Jede interne Aktion wird protokolliert:

-   wer
-   wann
-   welches Restaurant
-   welche Aktion
-   welche Daten
-   Grund falls erforderlich

### 11.4 Service Role

Service Role darf niemals im Frontend verwendet werden.

Service Role nur:

-   Server
-   Edge Function
-   sichere Admin-Prozesse

------------------------------------------------------------------------

## 12. UI-Regeln für WUXUAI Admin

Das WUXUAI Admin Portal darf technischer sein als das Restaurant Portal.

Aber es muss trotzdem klar bleiben.

### 12.1 Sprache

V1 weiterhin Deutsch.

### 12.2 Keine Vermischung

WUXUAI Admin UI darf nicht in Restaurant Portal eingebaut werden.

### 12.3 Fokus

Jede Admin-Seite hat einen Zweck:

-   Restaurants
-   Abos
-   Support
-   Sicherheit
-   Logs
-   Feature Flags

Nicht alles auf einer Seite.

### 12.4 Suchfunktion

WUXUAI Admin braucht später starke Suche:

-   Restaurantname
-   E-Mail
-   Slug
-   Organisation
-   Kundencode
-   Rechnung
-   Stripe ID

------------------------------------------------------------------------

## 13. Technische Architektur

### 13.1 Eigene Route

Vorschlag für später:

``` text
/wuxuai-admin
```

oder

``` text
/platform-admin
```

Diese Route ist nicht `/admin`, weil `/admin` bereits Restaurant Portal
ist.

### 13.2 Rollen

WUXUAI Admin benötigt eigene Rollen:

-   platform_owner
-   platform_admin
-   support
-   billing_admin
-   security_admin
-   viewer

Diese Rollen sind nicht identisch mit Restaurantrollen.

Restaurantrollen:

-   owner
-   admin
-   manager
-   staff

dürfen niemals WUXUAI Admin-Zugriff geben.

Ein Nutzer darf gleichzeitig Restaurant Owner und Plattform Admin sein.

Technische Regel:

- Restaurant Portal prüft Restaurantrolle.
- WUXUAI Admin prüft Plattformrolle.
- Plattformrolle darf Restaurantrolle nicht überschreiben.

### 13.3 Berechtigungen

WUXUAI Admin Zugriff darf nicht aus `user_metadata` kommen.

Nur:

-   serverseitige Rollen
-   app_metadata
-   interne Admin-Tabelle
-   sichere RPCs

Read-only Plattformrollen dürfen keine Schreibbuttons sehen.

Read-only:

- support
- security_admin
- viewer

Schreibrollen:

- platform_owner
- platform_admin
- billing_admin

### 13.4 Multi-Branch-Fan-out vermeiden

Auch wenn die Architektur mehrere Filialen vorbereitet, darf die V1
Restaurantliste ein Restaurant nicht mehrfach anzeigen.

Regel:

- zuerst `primary_branch_id` verwenden
- sonst genau eine Branch per Fallback wählen
- niemals unkontrolliert `branches` joinen
- Summary-KPI dürfen nicht durch Branches doppelt zählen

### 13.5 Feature Flags

Feature Flags müssen tenantfähig sein:

-   global
-   pro Organisation
-   pro Restaurant/Filiale
-   pro Plan

------------------------------------------------------------------------

## 14. Was ausdrücklich verboten ist

Verboten:

-   WUXUAI Admin in Restaurant Portal einbauen
-   Restaurantbesitzer Zugriff auf Plattformdaten geben
-   Kunden Zugriff auf Admin-Funktionen geben
-   Service Role im Frontend
-   Adminrechte aus user_metadata ableiten
-   Plattform-Abo-Logik mit Restaurant-Bonuslogik vermischen
-   interne Warnungen im Restaurant Dashboard anzeigen
-   technische Logs im Kundenportal anzeigen
-   WUXUAI Admin vor Pilot überpriorisieren

------------------------------------------------------------------------

## 15. V1 Minimalanforderung

Für den frühen Pilotbetrieb muss nicht das komplette WUXUAI Admin Portal
existieren.

Minimal erforderlich:

-   Supabase Dashboard nutzbar
-   Logs über Supabase einsehbar
-   branch_subscriptions vorhanden
-   Trial Status in DB vorhanden
-   Audit Logs vorhanden
-   Restaurants über DB prüfbar

Das reicht für die ersten Tests.

Sobald zahlende Restaurants entstehen, wird ein internes WUXUAI Admin
Portal wichtiger.

------------------------------------------------------------------------

## 16. V2 Ausbau

V2 oder nach Pilot:

-   internes WUXUAI Admin Portal starten
-   Restaurants verwalten
-   Testphasen verwalten
-   Stripe verwalten
-   Abos verwalten
-   Supportfälle verwalten
-   Missbrauchserkennung anzeigen
-   Feature Flags

------------------------------------------------------------------------

## 17. LOCK Kriterien

Das WUXUAI Admin Konzept gilt als LOCK, wenn:

-   klar getrennt vom Restaurant Portal
-   klare Rolle als Plattformverwaltung
-   SaaS-Abrechnung dokumentiert
-   Testphase dokumentiert
-   Organisation/Filiale vorbereitet
-   Sicherheitsregeln dokumentiert
-   Feature Flags vorbereitet
-   nicht als V1-Blocker für Pilot missverstanden
-   keine Vermischung mit Restaurantfunktionen

------------------------------------------------------------------------

## 18. Codex-Regeln

Wenn Codex am WUXUAI Admin Portal arbeitet:

1.  Zuerst diese Datei lesen.
2.  Nicht `/admin` verwenden, wenn damit Restaurant Portal gemeint ist.
3.  Keine Restaurant-UI verändern.
4.  Keine Kundendaten ohne Audit ändern.
5.  Keine Service Role im Frontend.
6.  Plattformrollen getrennt von Restaurantrollen halten.
7.  Keine neue SaaS-Preislogik erfinden.
8.  Alle sichtbaren Texte Deutsch.
9.  Feature Flags vorbereiten, aber nicht überall aktivieren.
10. Bei Unsicherheit: NOT READY melden.

------------------------------------------------------------------------

Endstatus: **LOCK**
