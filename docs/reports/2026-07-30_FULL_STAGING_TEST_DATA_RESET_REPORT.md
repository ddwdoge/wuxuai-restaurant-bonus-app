# Vollständiger Staging-Testdaten-Reset

Datum: 2026-07-30  
Repository: `/Users/dongdongwu/Documents/GitHub/wuxuai-restaurant-bonus-os`  
Branch: `codex/v13-legal-maps-hardening`  
Ausgangscommit: `5beceb7bf77d061915446949bebacdd369ba92c8`  
Supabase-Projekt: `wuxuai-bonus-staging` (`bwhv...qaya`, EU, `ACTIVE_HEALTHY`)

## Sicherheitsgrenze

Die CLI zeigte genau ein sichtbares und verknüpftes Projekt: `wuxuai-bonus-staging`.
Es wurde keine Production-Verbindung, Migration, Policy-, Funktions- oder
Schemaänderung ausgeführt. Der lokale und der Remote-Migrationsstand waren vor und
nach dem Reset mit 72 Versionen vollständig synchron.

## Bestand vor dem Reset

| Bereich | Anzahl |
| --- | ---: |
| Auth-Benutzer | 5 |
| Auth-Identitäten | 4 |
| Auth-Sessions | 3 |
| Auth-Refresh-Tokens | 11 |
| Restaurants | 5 |
| Organisationen | 5 |
| Branches | 5 |
| Restaurant-Memberships | 5 |
| Branch-Subscriptions | 5 |
| Customers | 0 |
| Staff Members | 5 |
| Rewards | 23 |
| Legal Documents | 15 |
| Legal Document Versions | 20 |
| Legal Mastertemplates | 5 |
| Customer Legal Acceptances | 0 |
| Audit Events | 80 |
| Redemption Attempts | 6 |
| Loyalty Rules | 9 |
| Loyalty Settings | 5 |
| Branding-Datensätze | 5 |
| Tages-PIN-Datensätze | 1 |
| Retention Policies | 24 |
| Storage-Testobjekte | 42 |

Die fünf Auth-IDs, fünf Restaurant-IDs, fünf Branch-IDs, Slugs und Owner-Zuordnungen
wurden vor der Löschung erfasst. E-Mail-Adressen wurden ausschließlich maskiert
ausgegeben. Tokens, Hashes, Passwörter und Auth-Header wurden nicht ausgegeben.

## Abhängigkeitsanalyse

Die Löschreihenfolge wurde aus den echten PostgreSQL-Foreign-Keys abgeleitet.
Restaurant-, Branch-, Customer-, Reward-, Legal-, Staff-, Audit-, Journal-, Referral-
und Subscription-Tabellen sind über `ON DELETE`/FK-Beziehungen verbunden. Wegen der
zyklischen Restaurant-/Primary-Branch-Beziehung wurde der Reset als kontrolliertes
`TRUNCATE ... RESTART IDENTITY CASCADE` der Tenant-Wurzeln ausgeführt.

Vor dem Commit wurde derselbe Reset vollständig in einer Transaktion ausgeführt und
mit `ROLLBACK` zurückgenommen. Der Dry-Run bestätigte Nullbestand bei unveränderten
Mastertemplates und Migrationseinträgen.

## Durchgeführter Reset

- Alle restaurant- und tenantbezogenen Tabellen geleert
- Audit-, Journal-, History- und Acceptance-Testdaten geleert
- Customers, Memberships, Rewards, Staff und Sessions geleert
- Legal-Kopien, Legal-Versionen, Drafts und Restaurantprofile geleert
- Restaurants, Branches, Organisationen, Memberships und Subscriptions geleert
- Profile und Test-Plattformrollen geleert
- 42 Testmedien über die Supabase Storage API entfernt
- 5 Auth-Testbenutzer zuletzt entfernt

Die installierte Supabase CLI besitzt keinen Auth-User-Adminbefehl. Der alternative
Admin-API-Weg hätte einen Secret-Key in einen Shell-Prozess offenlegen müssen und wurde
deshalb verworfen. Nach erfolgreichem transaktionalem Dry-Run wurden die Testbenutzer
als letzter Schritt mit einem kontrollierten `DELETE FROM auth.users` entfernt. Die
vorhandenen Auth-FKs löschten Identitäten und Sessions per `ON DELETE CASCADE`; Hashes
oder Tokens wurden nicht direkt bearbeitet.

## Bewusst behaltene Systemdaten

- 5 aktive globale Legal-Mastertemplates
- 1 Storage-Bucket ohne Objekte
- 72 Migrationseinträge
- Tabellen, Indizes, Constraints, Funktionen und Trigger
- sämtliche RLS-Policies

## Verifikation direkt nach dem Reset

- Auth Users / Identities / Sessions / Refresh Tokens: 0
- Tenanttabellen mit Datensätzen: keine
- Restaurants / Branches / Members / Customers / Staff / Rewards: 0
- Tenantbezogene Legal-Dokumente und Acceptances: 0
- Points / Journal / Audit / Activity: 0
- Storage-Objekte: 0
- verwaiste Primary-Branch-Referenzen: 0
- verwaiste Memberships: 0
- verwaiste Subscriptions: 0
- RLS-deaktivierte Public-Tabellen: keine
- Aktivitätsnummer-Sequenz: auf Startzustand zurückgesetzt (`last_value = null`)
- lokale/Remote-Migrationen: synchron

## Neuer Registrierungs-Smoke-Test

Der Test wurde über die echte öffentliche Owner-Registrierungsseite der lokalen App
gegen die bestätigte Staging-Datenbank durchgeführt. Einmalige Zugangsdaten wurden nur
im Arbeitsspeicher gehalten und weder ausgegeben noch gespeichert oder committed.

Ergebnis:

- neuer Auth-Benutzer: genau 1
- neues Restaurant: genau 1
- neue Organisation: genau 1
- neue Branch: genau 1
- Owner-Membership: genau 1
- Pilot-Subscription: genau 1 (`trialing`)
- Onboarding-Draft: genau 1
- Onboarding startet bei Schritt 1
- alte Customers und alte Tenantdaten geladen: Nein
- Slug eindeutig: Ja
- Restaurant-ID nach Reload stabil: Ja
- Slug nach Reload stabil: Ja
- Duplicate-Key-Fehler: Nein
- HTTP-400 im sauberen Wiederholungslauf: Nein beobachtet
- Browserfehler im sauberen Login-/Reload-Lauf: 0

Der frische Smoke-Datensatz bleibt bewusst als neuer Ausgangspunkt für den nächsten
Onboarding-Test bestehen. Im Report werden weder E-Mail noch Passwort dokumentiert.

## Browser-Reset

Nach dem serverseitigen Reset wurde die lokale Staging-Sitzung abgemeldet. Ein erster
Reload mit zuvor gelöschter Server-Session meldete erwartbar einen veralteten lokalen
Refresh-Token, stellte den neuen Datensatz danach aber korrekt wieder her. Anschließend
wurde ausdrücklich abgemeldet, frisch angemeldet und erneut geladen. Dieser saubere
Wiederholungslauf zeigte Onboarding Schritt 1 und null Browserfehler. Abschließend wurde
erneut abgemeldet und die lokale Testseite geschlossen.

Es wurden keine Browserdaten anderer Domains verändert. Ein installierter PWA-Container
auf einem physischen Gerät war nicht Teil dieses automatisierten Laufs.

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Tests: 336/336 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich

## Nicht durchgeführt

- Keine Production-Aktion
- Keine Migration oder Schemaänderung
- Keine RLS-/Policy-Änderung
- Kein Push
- Kein Merge
- Kein Deployment

## Offene Risiken

- Der frische Smoke-Testdatensatz ist absichtlich vorhanden und muss bei einem späteren
  erneuten Nullreset berücksichtigt werden.
- Installierte PWA und physisches Safari besitzen eigene Speicherbereiche und wurden
  nicht gerätephysisch bereinigt.

## Status

`STAGING_RESET_COMPLETE`
