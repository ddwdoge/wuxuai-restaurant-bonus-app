# WUXUAI Bonus V1 - Daily PIN, Buchungslimit, Geschenke und Einloesecode

Datum: 2026-07-14  
Status: **NOT READY**

## Ursache und Ziel

Die vorhandene V1-Architektur enthielt bereits Tages-PIN, Fehlversuchsschutz,
Willkommensgeschenke und ein Tageslimit. Es fehlten jedoch durchgaengige
Idempotenz fuer Punktebuchungen, das jaehrliche Geburtstagsgeschenk sowie ein
gemeinsames, 15 Minuten gueltiges Einloesecodesystem fuer Geschenke und
Punkteeinloesungen. Alte Einloese-RPCs boten ausserdem parallele Wege.

## Vor der Aenderung analysierter Bestand

Weiterverwendet werden:

- `restaurants`, `branches`, `restaurant_members` und `staff_sessions`
- `customers`, `customer_qr_tokens` und `customer_rewards`
- `rewards`, `points_transactions` und `reward_redemption_events`
- `restaurant_daily_pins`, `daily_pin_attempts` und `audit_log`
- bestehende sichere Punkte-RPCs als fachliche Basis

Keine zweite Kunden-, Punkte- oder Geschenkarchitektur wurde angelegt.

## Geaenderte Dateien

- `supabase/migrations/20260714002000_daily_pin_booking_gifts_redemption_v1.sql`
- `src/modules/loyalty/loyaltyService.ts`
- `src/modules/rewards/rewardService.ts`
- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/staff/StaffTablet.tsx`
- `src/modules/onboarding/pilotOnboardingService.ts`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/admin/pages/WelcomeGiftsPage.tsx`
- `src/styles.css`
- `tests/v1-daily-pin-gifts-redemption.test.mjs`
- `eslint.config.js`
- `package.json`, `package-lock.json`
- Engineering-Bible-Dateien `05`, `06`, `09`, `10`, `11`, `13`, `14`, `17`,
  `19`, `23` und `24`

Die bereits vorhandenen, nicht zu dieser Aufgabe gehoerenden Aenderungen in
`AdminLayout.tsx` und die unversionierte Migration `20260713003000...` wurden
nicht zurueckgesetzt oder inhaltlich veraendert.

## Migration

Neue Migration:

`20260714002000_daily_pin_booking_gifts_redemption_v1.sql`

Sie ergaenzt:

- Restaurant-Zeitzone mit V1-Standard `Europe/Vienna`
- idempotente Buchungsanfragen und Idempotenzschluessel
- Geschenktyp, Geburtstagsjahr und Gueltigkeitszeitraum auf Zuteilungen
- protokollierte, nicht destruktive Bereinigung alter doppelter
  Willkommenszuteilungen vor Aktivierung des Unique-Index
- harte Eindeutigkeit fuer ein Willkommensgeschenk sowie ein
  Geburtstagsgeschenk pro Jahr
- taeglichen idempotenten Geburtstagsjob mit Behandlung von 29. Februar und
  Jahreswechsel
- gemeinsame gehasht gespeicherte sechsstellige Codes mit 15 Minuten Laufzeit
- atomare Reservierung, Punkteabzug und einmaligen Codeverbrauch
- Ablaufjob fuer Codes
- Revoke alter Punkte- und Einloese-RPCs

## Tages-PIN

- exakt vier Ziffern und serverseitig idempotent erzeugt
- Restaurant-/Filial- und lokaler Tagesbezug
- Anzeige nur ueber berechtigte Owner-/Staff-RPCs
- keine anonyme Leseberechtigung
- maximal fuenf falsche Versuche mit Sperre und Audit aus bestehender
  Sicherheitsmigration

Die PIN bleibt in `restaurant_daily_pins.pin_code` lesbar gespeichert, weil sie
Ownern und berechtigten Mitarbeitern angezeigt werden muss. RLS und die
berechtigte RPC sind daher die Schutzgrenze. Eine echte verschluesselte
Anzeige-Loesung mit serverseitigem Schluessel ist noch nicht live validiert.

## Zwei Punktebuchungen pro Tag

- bestehende Kundenzeilensperre serialisiert parallele Buchungen
- serverseitiger Zaehler blockiert die dritte erfolgreiche Buchung
- neuer Idempotenzschluessel verhindert Doppelklick-/Retry-Doppelbuchungen
- alte direkt aufrufbare Punktewege werden entzogen
- genaue deutsche Sperrmeldung ist hinterlegt

Der aktive Alt-Kern verwendet fuer diese Tagesgrenze fest `Europe/Vienna`.
Das entspricht dem aktuellen Oesterreich-V1-Scope. Eine beliebige Restaurant-
Zeitzone fuer diesen inneren Zaehler ist noch nicht live umgesetzt und bleibt
vor einer Internationalisierung offen.

## Willkommensgeschenk

- genau eine Zuteilung pro Restaurant/Filiale/Gast durch partiellen Unique-Index
- bestehende Dubletten werden protokolliert; nur die erste Zuteilung bleibt
  fachlich erhalten, weitere aktive Dubletten werden storniert und als Legacy
  markiert, aber nicht geloescht
- Reload, erneuter Scan und parallele Anlage koennen danach keine zweite
  Zuteilung erzeugen
- einmalige Einloesung wird durch Zuteilungsstatus und Codezustand abgesichert

## Geburtstagsgeschenk

- kein eigener Editor; Auswahl nur aus aktiven Willkommensgeschenk-Vorlagen
- serverseitige kryptografisch zufaellige Auswahl
- Ausgabe im Fenster von heute bis 14 Tage vor dem Geburtstag
- genau eine Zuteilung pro Restaurant/Filiale/Gast/Jahr
- deaktivierte/abgelaufene Vorlagen werden ausgeschlossen
- fehlende aktive Vorlage wird protokolliert und verursacht keinen Jobfehler
- 29. Februar wird in Nicht-Schaltjahren am 28. Februar behandelt
- Gueltigkeit endet am Ende des Geburtstags im Restaurant-Zeitraum

## Gemeinsamer Einloesecode

- Code erst nach „Jetzt verbindlich einloesen“
- sechs Ziffern aus kryptografischen Zufallsbytes
- nur SHA-256-Hash in der Datenbank
- Rohcode nur in der direkten RPC-Antwort und im lokalen Sitzungsspeicher
- exakt 15 Minuten gueltig
- hoechstens ein aktiver Code je konkrete Zuteilung/Punkteeinloesung
- Code wird nach Ablauf oder Verbrauch dauerhaft deaktiviert
- alter Screenshot wird durch `expired`/`redeemed` serverseitig abgelehnt
- Punkteeinloesung zieht Punkte bei verbindlicher Reservierung genau einmal ab
- abgelaufene Reservierung wird nicht automatisch erstattet oder reaktiviert
- konkrete `customer_reward_id` verhindert Verwechslung, wenn Geburtstags- und
  Willkommensgeschenk dieselbe Vorlage verwenden

## UI

- Punkteeinloesung und Geschenke sind sichtbar getrennt
- Tages-PIN bleibt ausschliesslich beim Punktesammeln
- Staff Tablet prueft den sechsstelligen Code ohne Einloese-PIN
- Geburtstagsgeschenk besitzt eigene Karte und Gueltigkeitsanzeige
- sichtbare Alttexte „Willkommens-Belohnung“ wurden entfernt
- Customer-Einstiegs- und Fehleransicht bei 390 px und 1440 px ohne horizontalen
  Ueberlauf geprueft

## Tests und Build

- `npm install`: erfolgreich, 0 bekannte Schwachstellen
- `npm run lint`: erfolgreich, 0 Fehler, 13 bestehende Warnungen
- `npm run typecheck`: erfolgreich
- `npm test`: erfolgreich, 5/5 Vertragspruefungen
- `npm run build`: erfolgreich
- Mobile 390 px: geprueft
- Desktop 1440 px: geprueft
- lokaler Supabase-DB-Lint: nicht verfuegbar, da keine lokale Datenbankinstanz
  erreichbar war

Die automatisierten Tests pruefen die Migrations- und UI-Vertraege statisch.
Sie ersetzen keinen echten PostgreSQL-/Staging-Integrationstest.

## RLS und Sicherheit

Im Code geprueft:

- neue Tabellen haben RLS
- anonyme Direktabfragen sind nicht erlaubt
- Kundenzugriff erfolgt ueber gehashten Customer-Token in Security-Definer-RPCs
- Codes werden nur gehasht gespeichert
- restaurant_id, branch_id und customer_id werden serverseitig aus Token oder
  berechtigtem Kontext bestimmt
- Service Role wird nicht im Frontend verwendet
- alte Einloese- und Punkte-Bypaesse werden entzogen
- Audit wird fuer PIN, Geschenkausgabe, Einloesestart und Codeverbrauch geschrieben

## Staging-Ergebnis

`npx supabase migration list` wurde ausgefuehrt, aber Supabase antwortete mit
HTTP 403:

`Your account does not have the necessary privileges to access this endpoint.`

Deshalb wurden nicht bestaetigt:

- Migration auf Staging angewendet
- SQL und `pg_cron` auf dem echten Projekt erfolgreich
- RPCs durch PostgREST erreichbar
- RLS/Grants live wirksam
- parallele Punktebuchungen live atomar
- Geburtstagsjob live idempotent
- Codeablauf und Wiederverwendung live blockiert

## Offene Risiken

1. Kritisch: Migration ist nicht auf Staging angewendet und nicht live getestet.
2. Kritisch: PostgreSQL-Syntax, Grants, Cron und RLS sind nur statisch geprueft.
3. Mittel: Punkte-Tagesgrenze ist fuer den Oesterreich-V1-Scope fest auf
   `Europe/Vienna`; weitere Zeitzonen brauchen einen eigenen Patch.
4. Mittel: Tages-PIN ist wegen notwendiger Anzeige nicht gehasht; Schutz erfolgt
   ueber RLS/RPC statt Verschluesselung.
5. Klein: Lint meldet 13 bereits vorhandene Warnungen ausserhalb des Kernscopes.

## Entscheidung

Der lokale Code ist bereit fuer den naechsten Staging-Integrationslauf. Die App
ist noch nicht fuer einen verbindlichen internen End-to-End-Workflow-Test
freigegeben, weil Migration, RPCs, Cron und RLS nicht gegen Staging bestaetigt
wurden.

Status: **NOT READY**
