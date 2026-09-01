# Staging Single Test Account Reset

Datum: 30.07.2026  
Projekt: `wuxuai-bonus-staging`  
Project Ref: `bwhv...qaya`  
Branch: `release/v1-restaurant-bonus`  
Ausgangscommit: `0f318c2`

## Ergebnis

Nach der ausdrücklichen Bestätigung von Option 3 wurden die Datenbankanteile
beider unabhängigen Testtenants transaktional entfernt. Der vorherige
Rollback-Probelauf war erfolgreich; danach wurde dieselbe durch harte IDs,
E-Mail-Matches, Ownerrollen und Tenantzuordnungen geschützte Transaktion
committed.

Nach erneuter Anmeldung im Supabase-Dashboard wurden außerdem die beiden exakt
zugeordneten Storagepfade und die beiden bestätigten Auth-Benutzer über die
vorgesehenen Supabase-Adminoberflächen gelöscht. Beide Löschvorgänge wurden im
Dashboard als erfolgreich bestätigt. Eine serverseitige Nachprüfung bestätigt
für beide Zieltenants vollständigen Nullbestand.

Die anschließende absolute Staging-Prüfung hat jedoch drei weitere vollständige
Tenant-Sets gefunden, die nicht Teil der ausdrücklichen Löschfreigabe waren.
Diese Datensätze wurden nicht verändert. Deshalb ist der projektweite
Nullbestand noch nicht erreicht.

## Exakte Auth-Vorprüfung

Die E-Mail-Adressen wurden ausschließlich mit `lower(trim(email)) = <Wert>`
verglichen. Es wurde weder `LIKE` noch eine Teilstringsuche verwendet.

| Eingabe | Auth-Treffer | Auth-User-ID | Tenant |
| --- | ---: | --- | --- |
| `do***@hotmail.com` | 0 | - | - |
| `do***@gmail.com` | 0 | - | - |
| `of***@wuxugroup.com` | 1 | `c58219b3-992c-4de1-9e19-545a25757071` | Zum goldenen panda |
| `im***@wuxugroup.com` | 1 | `840ddcf3-41d1-4f9b-9ab7-327d0d5ce113` | Akakiko Hietzing |
| `do***@gmail.com` | 0 | - | - |

Beide vorhandenen Auth-Adressen haben jeweils genau einen Treffer. Zusammen
bilden sie jedoch zwei verschiedene Owner-Tenant-Sets.

## Tenant 1

- maskierte E-Mail: `of***@wuxugroup.com`
- Restaurant-ID: `35e5264c-384f-4ec6-b390-7bd55f14edc7`
- Restaurant: `Zum goldenen panda`
- Slug: `zum-golden-panda`
- Branch-ID: `e6c35472-7480-4d5c-acce-615ffba27dbd`
- Organization-ID: `94ae6f5e-4e11-454f-96b2-380c7dd032ee`
- Status: `active`
- Onboarding: `completed`
- Owner: 1
- Mitglieder: 1
- Filialen: 1
- Abos: 1
- Legal-Dokumente / Versionen: 5 / 5
- Rewards: 7
- Staff: 1
- Customers: 0
- Punktebuchungen: 0
- Redemptions / Journal: 0 / 0
- Referrals: 0
- Audit-Events: 22
- Onboarding-Drafts: 1
- eindeutig tenantbezogene Storage-Objekte: 1

## Tenant 2

- maskierte E-Mail: `im***@wuxugroup.com`
- Restaurant-ID: `03648956-69af-4f1f-9250-dfff41994a1a`
- Restaurant: `Akakiko Hietzing`
- Slug: `akakiko`
- Branch-ID: `5cba741f-6509-4862-880f-a4e22acdb340`
- Organization-ID: `3498ff41-71cd-4684-8365-ce65387f355a`
- Status: `active`
- Onboarding: `completed`
- Owner: 1
- Mitglieder: 1
- Filialen: 1
- Abos: 1
- Legal-Dokumente / Versionen: 5 / 5
- Rewards: 5
- Staff: 1
- Customers: 0
- Punktebuchungen: 0
- Redemptions / Journal: 0 / 0
- Referrals: 0
- Audit-Events: 23
- Onboarding-Drafts: 1
- eindeutig tenantbezogene Storage-Objekte: 1

## Sicherheitsprüfung

- Supabase-Projekt eindeutig bestätigt: `wuxuai-bonus-staging`
- Production-Verbindung verwendet: Nein
- Schema und Foreign Keys read-only geprüft: Ja
- Löschreihenfolge geraten: Nein
- Tenantdatenbankdaten gelöscht: Ja
- Ziel-Restaurants / Branches / Memberships / Profile verbleibend: 0 / 0 / 0 / 0
- Ziel-Storageobjekte verbleibend: 0
- Ziel-Auth-Benutzer verbleibend: 0
- Ziel-Slugs verbleibend: 0
- Tenanttabellen der beiden bestätigten Restaurants: jeweils 0
- Geprüfte einspaltige Public-Foreign-Keys: 183
- Verwaiste Foreign-Key-Referenzen: 0
- globale Legal-Mastertemplates verändert: Nein
- globale Legal-Mastertemplates vorhanden: 5
- Public-Tabellen ohne aktiviertes RLS: 0
- lokale und Remote-Migrationen synchron: Ja
- `supabase db push --dry-run`: aktuell, keine ausstehenden Migrationen
- Migration erstellt oder ausgeführt: Nein
- RLS, Policies, Trigger oder Funktionen verändert: Nein
- Push, Merge oder Deployment: Nein

## Absolute Staging-Prüfung

| Bereich | Gesamtbestand nach der Ziel-Löschung |
| --- | ---: |
| Auth-Benutzer | 3 |
| Restaurants | 3 |
| Branches | 3 |
| Memberships | 3 |
| Profiles | 3 |
| Organizations | 3 |
| Subscriptions | 3 |
| Rewards | 6 |
| Staff | 1 |
| Audit-Events | 30 |
| Onboarding-Drafts | 3 |
| tenantbezogene Legal-Dokumente / Versionen | 5 / 5 |
| Storageobjekte | 2 |

Die verbliebenen Datensätze gehören zu drei anderen Tenant-Sets:

| Maskierte E-Mail | Restaurant | Slug | Storageobjekte |
| --- | --- | --- | ---: |
| `do***@gmail.om` | Akakiko Hietzing | `akakiko-hietzing` | 1 |
| `do***@hotmail.om` | L.F.S Restaurantbetriebs gmbh | `l-f-s-restaurantbetriebs-gmbh` | 1 |
| `st***@example.com` | WUXUAI Reset Smoke a69342 | `wuxuai-reset-smoke-a69342` | 0 |

Diese drei Auth-Benutzer und Tenants waren nicht die zwei im Auftrag konkret
freigegebenen Zielkonten. Eine Löschung ohne zusätzliche eindeutige Freigabe
wäre eine Scope-Erweiterung und wurde deshalb nicht durchgeführt.

## Nullbestand und erneute Registrierung

Für `Zum goldenen panda` und den bestätigten Tenant `Akakiko Hietzing` ist der
vollständige Nullbestand bestätigt. Der absolute Nullbestand des gesamten
Staging-Projekts ist wegen der drei zusätzlichen Tenant-Sets nicht bestätigt.
Eine erneute Registrierung wurde in diesem Schritt nicht durchgeführt.
Browser-, Local-Storage-, Session-Storage- und PWA-Daten wurden nicht verändert.

## Verbleibender Schritt

Vor einem projektweiten Reset ist eine ausdrückliche Löschfreigabe für die drei
oben anonymisiert aufgeführten Tenant-Sets erforderlich. Danach müssen dieselben
Tenant-, Auth-, Storage-, Foreign-Key-, Migrations- und RLS-Prüfungen erneut
ausgeführt werden.

## Status

`BLOCKED_BY_UNAPPROVED_REMAINING_TENANTS`
