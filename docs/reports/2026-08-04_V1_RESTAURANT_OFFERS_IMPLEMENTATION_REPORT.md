# WUXUAI Bonus V1 – Aktuelles & Angebote Implementierung

Datum: 2026-08-04  
Branch: `dev`  
Ausgangscommit: `f24eb7f195d9d196ade6997b638ed614e7741202`

## Ursache

Das durch den Decision Record
`DECISION_2026-08-04_V1_RESTAURANT_OFFERS_MODULE.md` freigegebene
Informationsmodul war technisch noch nicht vorhanden. Die historische
Kampagnenstruktur ist an Rewards und Coupons gekoppelt und wurde deshalb nicht
wiederverwendet.

## Geaenderte Dateien

- additive Migration `20260804001000_restaurant_offers_v1.sql`
- Angebotsservice und reine Verhaltenshelfer
- Owner-Seite, Navigation, Route und responsive Styles
- CustomerPortal, zentrale Kundenseite und Angebotskarten
- Partnerlokal-Finder-Hinweis und PII-freie Ereigniszaehler
- bestehender sicherer Owner-Bildupload um Ordner `offers` erweitert
- Modul-, Security- und Regressionstests
- Engineering-Bible-, Legal-, Rollback- und Changelog-Dokumentation

## Was wurde geaendert

### Datenmodell und Sicherheit

`restaurant_offers` ist ein eigenstaendiges Tenantobjekt ohne Reward-,
Punkte-, Coupon-, Campaign- oder Redemption-Beziehung. RLS ist aktiv. Direkte
Schreibrechte fuer Browserrollen wurden entzogen; Owner-Aktionen laufen ueber
eng begrenzte `SECURITY DEFINER`-RPCs mit festem `search_path`, Rollen- und
Restaurantpruefung.

Die Fuenfergrenze wird im Trigger serverseitig mit einem restaurantbezogenen
Advisory-Lock und einer Zeitfenster-Ueberlappungspruefung erzwungen. Parallele
Publish-Requests koennen dadurch keinen sechsten gleichzeitig aktiven Beitrag
erzeugen.

### Owner Portal

Die neue Seite bietet Entwurf, Bearbeitung, Vorschau, Veroeffentlichung,
Deaktivierung, Duplizierung, Archivierung und das Loeschen von Entwuerfen.
Pflichtfelder, Mittagsmenue-Zeitfenster, Preisangaben und Restaurantstandort
werden im Client und nochmals serverseitig geprueft. Der bestehende
tenantbezogene Bild-Upload wird wiederverwendet.

### Customer Portal und Finder

Das restaurantbezogene Kundenportal zeigt bis zu drei aktuell sichtbare
Beitraege. Die zentrale Seite `Aktuelles` priorisiert vorhandene
Restaurantmitgliedschaften und Punktestaende ohne personenbezogene
Angebotsprofile. Der Finder zeigt einen kompakten Badge und den wichtigsten
Beitrag. Kein Klick registriert einen Kunden, setzt einen Restauranttoken,
veraendert Punkte oder startet eine Einloesung.

### Analytics

Aufrufe, CTA-, Route- und Bonus-oeffnen-Klicks werden nur als Tageszaehler pro
Angebot gespeichert. Es werden keine Kunden-, Geraete-, Token-, Standort- oder
IP-Daten gespeichert.

## Was wurde nicht geaendert

- Reward-, Punkte-, Geschenk-, Coupon- und Einloeselogik
- QR- und Kundentoken-Prioritaet
- Customer Identity
- Staff Portal und Plattformportal
- bestehende RLS-Policies
- Production-Datenbank und Deployment

## Migration und Staging

Der Dry-Run wurde gegen das eindeutig verknuepfte Projekt
`wuxuai-bonus-staging` (`bwhv…qaya`) ausgefuehrt. Es wurde keine Migration
angewendet. Der Plan enthaelt vor der Angebotsmigration noch die lokal offenen
Migrationen `20260803004000` bis `20260803008000`. Die Reihenfolge ist korrekt,
muss aber vor einem Angebots-E2E kontrolliert auf Staging angewendet werden.

## Tests und Qualitaet

- 21 neue Angebots-Verhaltens- und Securitytests
- Entwurf, Pflichtfelder, Preis und Mittagsmenue validiert
- Sichtbarkeit fuer geplant, aktiv, abgelaufen, deaktiviert sowie Wiener
  Wochentag und Zeitfenster validiert
- Fuenfergrenze und zeitlich angrenzende Beitraege validiert
- RLS, Grants, Tenantpruefung, Advisory-Lock und Public-Payload geprueft
- strikte Trennung von Reward-, Punkte- und Redemption-Logik geprueft
- Owner-, Customer- und Finder-Integration statisch abgesichert
- Mobile Grid, Touchhoehen und Tastatur-Basics geprueft
- Gesamttests: 603/603 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bereits bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich

## Responsive-Pruefung

Die Layoutregeln fuer 390, 430, 768, 1024 und 1440 px wurden im Code und in
den automatisierten Regressionstests geprueft. Die lokale Fehleransicht wurde
in allen fuenf Breiten im Browser vermessen: `scrollWidth` entsprach jeweils
`innerWidth`, der Zurueck-Button war 44 x 44 px und die Wiederholen-Aktion 50 px
hoch. Es gab keine React-Fehler; sichtbar waren nur zwei bereits bestehende
React-Router-Zukunftswarnungen. Die echte visuelle Abnahme mit Angebotskarten
bleibt bis zur Staging-Migration offen; deshalb wird bewusst kein visueller oder
finaler Lock behauptet.

## Rechtlicher Status

Preiswerbung, Streichpreise, Verfuegbarkeit, Bildrechte,
Produktinformationen, Allergene und Veranstaltungsangaben bleiben
`LEGAL_REVIEW_REQUIRED`. Es erfolgte keine juristische Freigabe.

## Risiken

- Migration ist noch nicht auf Staging angewendet; daher kein echter
  Supabase-E2E und kein `FINAL LOCK`.
- Visuelle Browserabnahme mit echten Angebotsdaten, physischer
  Mobile-Safari-Test und Screenreader-Test stehen aus.
- Oeffentliche Ereigniszaehler sind absichtlich PII-frei, benoetigen vor
  Production aber noch ein infrastrukturelles Missbrauchs-/Rate-Limit.

## Pruefartefakt

Vollstaendiger Repository-Export ohne `.git`, Abhaengigkeiten, Builds,
Umgebungsdateien, Secrets oder alte Exportarchive:
`exports/2026-08-04_V1_RESTAURANT_OFFERS_IMPLEMENTATION.zip`.

## Status

**CODE LOCK / READY_FOR_VISUAL_REVIEW**
