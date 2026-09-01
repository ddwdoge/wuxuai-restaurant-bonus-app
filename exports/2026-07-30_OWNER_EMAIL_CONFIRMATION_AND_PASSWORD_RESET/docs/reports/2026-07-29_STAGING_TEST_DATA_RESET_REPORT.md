# Staging-Testdatenreset und neuer Testbestand

Datum: 2026-07-29  
Branch: `codex/v13-legal-maps-hardening`  
Ausgangscommit: `b544b76b45f083ab9dd951446b0c468a0b207cfa`

## Verbindliche Nutzerentscheidung

Der Nutzer hat ausdrücklich bestätigt, dass das Projekt `wuxuai-bonus-staging`
ausschließlich Testdaten enthält. Alle 25 Restaurants und ihre tenantbezogenen
Daten durften gelöscht werden. Production war zu keinem Zeitpunkt verbunden.

## Umgebung

- Environment: Staging
- Projekt: `wuxuai-bonus-staging`
- Project-Ref maskiert: `bwhv…qaya`
- Region: `eu-west-1`
- Status: `ACTIVE_HEALTHY`
- Production: Nein
- Migrationshistorie gelöscht oder repariert: Nein
- RLS-Policies oder Buckets entfernt: Nein

## Anonymisierter Bestand vorher

| Bereich | Anzahl vorher |
| --- | ---: |
| Organisationen | 25 |
| Restaurants | 25 |
| Filialen | 25 |
| Restaurant-Mitgliedschaften | 25 |
| Mitarbeiter | 5 |
| Kunden | 35 |
| Kundentokens | 50 |
| Kundengeräte | 49 |
| Punktetransaktionen | 23 |
| Rewards | 33 |
| Customer Rewards | 26 |
| Referrals | 8 |
| Bonus-Boost-Zeiträume | 2 |
| Einlösecodes, beide Systeme | 4 |
| Reward-Redemption-Events | 4 |
| Auditzeilen | 559 |
| Consent Events | 40 |
| Marketing-Consents | 24 |
| Storage-Objekte in `restaurant-media` | 37 |
| Auth-Benutzer | 25 |

Das Bonus Activity Journal existierte vor dem Reset noch nicht, weil seine
Migration ausstand.

## Reset

Der tenantbezogene Datenreset wurde zuerst vollständig in einer
Rollback-Transaktion geprüft. Die Probe ergab null verbleibende Restaurants,
Filialen, Organisationen, Kunden, Rewards und tenantbezogene Auditzeilen bei
unverändert einem Plattform-Admin.

Anschließend wurde derselbe Reset dauerhaft ausgeführt. Die Löschung ermittelte
alle Tabellen mit `restaurant_id`, `organization_id` oder `branch_id` aus dem
Datenbankkatalog und entfernte ausschließlich Zeilen aus dem freigegebenen
Tenant-Scope. Globale Plattformkonten und Migrationsmetadaten wurden nicht
berührt.

### Auth

- Auth-Benutzer vorher: 25
- eindeutig tenantgebundene Test-Owner vor Reset: 23
- gelöschte Test-Owner: 23
- behaltene Auth-Benutzer: 2
- davon aktiver Plattform-Admin: 1
- zusätzlich behaltenes, nicht tenantklassifiziertes System-/Entwicklerkonto: 1
- verwaiste Auth-Identitäten: 0
- verwaiste Auth-Sessions: 0

Die Auth-Löschung wurde ebenfalls zuerst in einer Rollback-Transaktion geprüft.

### Storage

Alle 37 Objekte im Bucket `restaurant-media` besitzen einen Pfad, der einem der
25 gelöschten Restaurants zugeordnet war. Die physische Löschung wurde jedoch
nicht ausgeführt: Die Storage API benötigt dafür kurzzeitig den
Staging-Service-Role-Key. Der dafür notwendige Credential-Abruf wurde von der
Ausführungsumgebung ohne separate ausdrückliche Freigabe blockiert.

- Storage-Bucket gelöscht: Nein
- Storage-Policies geändert: Nein
- Storage-Objekte gelöscht: 0
- offene, eindeutig tenantbezogene Objekte: 37

Direktes Löschen aus `storage.objects` wurde bewusst nicht als Workaround
verwendet, da dadurch physische Objekte verwaisen könnten.

## Migrationen

Der Dry-Run bestätigte zunächst exakt diese fünf ausstehenden Migrationen:

1. `20260727001000_customer_identity_v1_no_sms.sql`
2. `20260728001000_v1_bonus_activity_journal.sql`
3. `20260728002000_referral_bonus_duration_settings.sql`
4. `20260729001000_customer_repeat_qr_access_hardening.sql`
5. `20260729002000_customer_phone_e164_hardening.sql`

Alle fünf wurden in dieser Reihenfolge erfolgreich auf Staging angewendet.

Die anschließende Live-Security-Verifikation fand zwei konkrete Fehler:

- Ein fremder Restauranttoken wurde wegen eines `SELECT INTO`-Nullfalls als
  inaktive Membership statt als ungültiger Token klassifiziert.
- Der Owner-Supportpfad schrieb den nicht erlaubten Audit-Akteurtyp
  `restaurant_user` und scheiterte am bestehenden Constraint.

Dafür wurde die additive Migration
`20260729003000_customer_identity_security_verification_fix.sql` erstellt,
per Dry-Run geprüft und auf Staging angewendet. Sie ändert keine Signatur und
keine RLS-Policy. Sie prüft `NOT FOUND` vor dem Membership-Status und verwendet
den bestehenden erlaubten Audit-Akteurtyp `admin`.

Lokale und Remote-Migrationshistorie sind bis `20260729003000` synchron.

## Security-Verifikation

Katalogprüfung:

- `normalized_phone` vorhanden und `NOT NULL`: Ja
- Unique Index je Restaurant und normalisierter Telefonnummer: Ja
- Customer Identity Guard Trigger aktiv: Ja
- RLS auf `customers`: Ja
- Bonus Activity Journal vorhanden: Ja
- RLS und Unveränderbarkeits-Trigger auf Journal: Ja
- SMS aktiviert: Nein
- anonymer Support-Update-Zugriff: Nein
- anonyme interne Tokenauflösung: Nein
- anonymer Reportzugriff: Nein
- Report-Execute für `authenticated`: Ja, interne Owner-/Admin-Prüfung bleibt aktiv
- öffentliches Device-only-Recovery-RPC: Nein
- strukturierte Tokenfehler: Ja

Rollback-sichere Live-Verhaltenstests:

- gültiger Restauranttoken lädt das richtige Portal: Ja
- fremder Restauranttoken wird neutral blockiert: Ja
- inaktive Membership wird blockiert: Ja
- direktes Ändern geschützter Identitätsdaten wird blockiert: Ja
- kontrollierter Owner-Supportpfad funktioniert: Ja
- nicht berechtigter Reportzugriff wird blockiert: Ja

Die temporär angelegten Testkunden, Tokens und Auditdaten wurden durch die
absichtlich ausgelöste Rollback-Exception vollständig zurückgerollt.

## Neuer minimaler Testbestand

Der Seed wurde zuerst rollback-sicher validiert und anschließend angelegt.
Bestehende automatische Onboarding-Erzeugungen für Filiale, Membership,
Subscription, Loyalty und Branding wurden wiederverwendet.

| Bereich | Bestand nach Seed |
| --- | ---: |
| Organisationen | 2 |
| Restaurants | 2 |
| Filialen | 2 |
| Owner-Membership-Zeilen | 2 |
| Mitarbeiter | 2 |
| Rewards | 5 |
| Willkommensgeschenke | 1 |
| Optionen im Geburtstagsgeschenk-Pool | 1 |
| Kunden | 0 |
| Kundentokens | 0 |
| Kundengeräte | 0 |
| Punktetransaktionen | 0 |
| Customer Rewards | 0 |
| Referrals | 0 |
| Bonus-Boost-Zeiträume | 0 |
| Einlösecodes | 0 |
| Redemption Events | 0 |
| Bonus Activity Journal | 0 |
| tenantbezogene Auditzeilen | 0 |
| ungültige Telefonnummern | 0 |
| Telefonnummerndubletten | 0 |

Restaurant A besitzt drei Rewards. Das aktive Willkommensgeschenk ist zugleich
eine freigegebene Option im bestehenden Geburtstagsgeschenk-Pool; es wurde kein
paralleles Geburtstagssystem angelegt. Restaurant B besitzt zwei Rewards.
Beide Restaurants verwenden den Referral-Standard `2×` für 30 Tage und haben
SMS-Verifizierung deaktiviert.

Es wurden keine Kunden vorab erzeugt. Neue Kunden müssen über den echten QR- und
Registrierungsflow entstehen.

## Qualität

- Typecheck: erfolgreich
- Lint: 0 Fehler, 7 bestehende Warnungen
- Tests: 265/265 erfolgreich
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Push: Nein
- Merge: Nein
- Cloudflare-Deployment: Nein
- Production-Migration: Nein

## Offene physische und funktionale Tests

- physischer iPhone-Safari-Test
- Scan über Apple Kamera-App
- installierte PWA
- Safari-/PWA-Speichertrennung
- vollständiger QR-Registrierungs-, Punkte-, Reward-, Welcome-, Birthday- und
  Referral-Testzyklus mit neu erzeugten Kunden
- physische Löschung der 37 freigegebenen Storage-Objekte nach separater
  Credential-Freigabe

## Entscheidung

Der Datenbank-, Auth-, Migrations-, Security- und Seed-Teil ist abgeschlossen.
Der vollständige Reset ist wegen der noch vorhandenen 37 physischen
Storage-Objekte noch nicht komplett.

Status: `CHANGES_REQUIRED`
