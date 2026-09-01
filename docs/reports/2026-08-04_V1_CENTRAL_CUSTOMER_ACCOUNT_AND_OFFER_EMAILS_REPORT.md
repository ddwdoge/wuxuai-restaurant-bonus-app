# V1 Zentraler Kundenbereich und freiwillige Angebots-E-Mails

> Historischer Zwischenstand: Die globale Angebotsansicht aus diesem Bericht
> wurde durch die Produktentscheidung vom 04.08.2026 ersetzt. V1 zeigt
> Angebote ausschließlich im bewusst gewählten Restaurantkontext.

Datum: 2026-08-04  
Branch: `dev`  
Ausgangscommit: `6233fa6be5d378a965f62d5d80b1aa4100e5c5c5`

## Ursache und Bestand

Der bisherige Customer-Zugang war ausschließlich restaurantbezogen. Es gab
keinen globalen Customer-Datensatz und keinen globalen Kundentoken. Die Source
of Truth war je Restaurant die `customers`-Zeile mit aktiver Membership und
einem geheimen, gehasht gespeicherten `customer_qr_tokens`-Zugang.

Der Partnerfinder und die zentrale Seite `Aktuelles` konnten vorhandene lokale
Restauranttokens einlesen und einzeln serverseitig validieren. Das war für eine
Finder-Anreicherung sicherer als ein öffentlicher Customer-Select, stellte aber
keinen eigenständigen serverkontrollierten zentralen Account dar. Diese
Browser-Aggregation wurde aus Finder und `Aktuelles` entfernt.

Wiederverwendet wurden:

- restaurantbezogene Customers, Memberships und Kundentokens
- bestehende Reward-, Punkte-, Besuchs-, Öffnungszeiten- und Offer-Daten
- Partnerlokal-Finder und zentrale `Aktuelles`-Ansicht
- bestehende Premium-Komponenten und AppDrawer
- Owner-Angebotsverwaltung und aggregierte Offer-Metriken

## Kundenidentität

Die additive Migration führt einen technischen `customer_accounts`-Zugang ein.
Eine Membership wird erst verknüpft, nachdem der aktuelle Restaurant-Slug, der
geheime Restauranttoken, dessen Hash, Ablauf und aktive Membership serverseitig
validiert wurden. Telefonnummer, Geburtstag und `device_id` werden nicht zur
Authentifizierung verwendet.

Der zentrale Klartexttoken wird nur einmal an den Browser zurückgegeben und in
der Datenbank ausschließlich gehasht gespeichert. Das Öffnen einer Membership
prüft zentralen Account, Restaurant und Membership erneut und stellt einen neuen
restaurantbezogenen Kundenzugang aus. Bestehende Tokens werden nicht global
widerrufen. Es entsteht keine zweite Registrierung.

Ein bereits verknüpfter Account ohne gültigen lokalen Zentraltoken wird nicht
über Telefonnummer, Geburtstag, Geräte-ID oder einen Restauranttoken heimlich
wiederhergestellt. Dafür bleibt ein definierter Recovery-Prozess offen.

## Zentrale Navigation und Seiten

- `/customer`: `Mein WUXUAI`, letzte Lokale, Punkte pro Lokal, Geschenke und
  aktuelle Beiträge
- `/customer/locations`: alle eigenen Memberships mit Filtern, Öffnungsstatus,
  Punkten, Besuchen, nächster Belohnung, Geschenken, Angeboten und Route
- `/customer/offers`: zentrale Angebotsansicht; besuchte Lokale, eigener
  Punktestand und aktuelle Mittagsangebote werden deterministisch priorisiert
- `/customer/restaurants`: bestehender Finder, nun mit zentralen Membershipdaten
- `/customer/account`: maskierte Identität, Support-, Datenschutz- und
  E-Mail-Status

Die Navigation enthält genau `Start`, `Meine Lokale`, `Aktuelles`, `Entdecken`
und `Konto`. Es gibt keine restaurantübergreifende Gesamtpunktesumme.

## Angebots-E-Mails

Das Modell unterstützt pro Restaurant ausschließlich `Nie`, `Wöchentlich` und
`Monatlich`; Default ist `Nie`. Einwilligung und E-Mail bleiben getrennt vom
Bonuskonto. Eine Frequenzänderung erzeugt zunächst
`PENDING_CONFIRMATION`; erst der gültige zweckgebundene DOI-Link setzt `ACTIVE`.

DOI- und Abmeldetokens werden gehasht, zweckgebunden, ablaufend, einmalig und
rate-limitiert geführt. Die restaurantbezogene Abmeldung setzt sofort
`WITHDRAWN` und `Nie`, löscht jedoch weder Punkte noch Membership.

Die Kunden-UI zeigt die vorbereiteten Frequenzen, lässt sie aber deaktiviert,
solange kein freigegebener Provider vorhanden ist. Es wird nichts
vorausgewählt und kein Marketingversand simuliert.

## Versandjob

Die Migration enthält service-role-only Verträge für:

- fällige aktive und bestätigte Wochen-/Monats-Consents ermitteln
- nur Restaurants mit aktuell aktiven Angeboten berücksichtigen
- einen Digest je Consent, Frequenz und Periodenschlüssel reservieren
- Delivery als gesendet, zugestellt, Bounce, Fehler oder übersprungen abschließen

Perioden werden in `Europe/Vienna` erzeugt. Die Unique-Regel
`(consent_id, frequency, period_key)` verhindert doppelte Digests. Der Browser
besitzt kein EXECUTE auf diesen Jobs.

## Owner-Bereich

`Aktuelles & Angebote` zeigt ausschließlich Aggregate: Verfügbarkeit,
bestätigte Empfänger, Wochen-/Monatsfrequenz, Zustellungen und nächste Perioden.
Eine vollständige Empfängerliste wird nicht ausgegeben. Der Zugriff bleibt über
`is_restaurant_admin(restaurant_id)` tenantgebunden.

## Datenschutz, RLS und Legal

Alle neuen Tabellen haben RLS. `anon` und `authenticated` erhalten keine
direkten Tabellenrechte. Browser-RPCs validieren geheime Tokenhashes;
service-role-only Jobs bleiben außerhalb des Frontends. Audit-Metadaten enthalten
weder Klartexttoken noch E-Mail-Adresse, Telefonnummer oder Geburtstag.

Das Legal-Addendum, die Marketingeinwilligung, Rollenverteilung, AVV,
Subprozessoren, DOI-Nachweis, Tracking- und Abmeldebedingungen bleiben
`DRAFT_LEGAL_REVIEW_REQUIRED`.

## SMTP- und Providerstatus

Supabase Auth SMTP ist vorhanden, aber nicht als Marketing-/Bulk-Mail-Dienst mit
DOI-, Bounce-, Suppression- und Complaint-Vertrag freigegeben. Deshalb bleibt
`customer_offer_email_delivery_settings.delivery_enabled = false` und
`provider_status = NOT_CONFIGURED`.

Status des tatsächlichen Versands:
`BLOCKED_BY_PRODUCTION_EMAIL_INFRASTRUCTURE`.

## Migration

- Datei: `20260804002000_central_customer_account_offer_emails.sql`
- Art: additiv
- RLS: für alle neuen Tabellen aktiviert
- direkte Browserrechte: entzogen
- Staging-Dry-Run: erfolgreich; genau diese Migration würde angewendet
- Staging-Anwendung: **Nein**
- Production-Anwendung: **Nein**

## Tests und QA

- neue Vertrags-/Verhaltenstests: 18/18 erfolgreich
- vollständige Testsuite: 621/621 erfolgreich
- Typecheck: erfolgreich
- Lint: 0 Fehler, 6 bestehende Warnungen
- Build: erfolgreich
- `git diff --check`: erfolgreich
- Supabase `db push --dry-run`: erfolgreich, nichts angewendet

Vollständiger bereinigter Repository-Export:

- `exports/2026-08-04_V1_CENTRAL_CUSTOMER_ACCOUNT_AND_OFFER_EMAILS.zip`
- 673 Einträge, 4,8 MB
- ZIP-Integrität: erfolgreich geprüft
- ausgeschlossen: `.git`, `node_modules`, `.env*`, Build-Ausgaben, Logs,
  frühere Exporte und ZIP-Artefakte

Lokale Browserprüfung des sicheren leeren Accountzustands:

| Breite | Overflow | Touchziele unter 44 px | Navigation |
| ---: | ---: | ---: | ---: |
| 390 px | 0 | 0 | 5 Ziele |
| 430 px | 0 | 0 | 5 Ziele |
| 768 px | 0 | 0 | 5 Ziele |
| 1024 px | 0 | 0 | 5 Ziele |
| 1440 px | 0 | 0 | 5 Ziele |

Neue Console Errors: 0. Im Dev-Modus erschienen zwei bestehende React-Router-v7-
Hinweise. Ein physischer Mobile-Safari-, installierter-PWA- und 200-%-Zoom-Test
ist nicht erfolgt; die Struktur wurde über responsive Viewports, Safe Area,
Touchgrößen und sichtbare Fokusstyles geprüft.

## Was nicht geändert wurde

- keine Punkte-, Reward-, Redemption-, Tages-PIN- oder QR-Geschäftslogik
- keine automatische Registrierung oder Membership
- keine Gesamtpunktesumme
- keine direkte Customer-Tabelle im Browser
- keine Service Role im Browser
- kein aktiver Marketingversand
- keine Production-Migration, kein Deployment, kein Push und kein Merge

## Offene Production-Risiken

1. Migration auf Staging anwenden und SQL/RPC/RLS live prüfen.
2. Zwei-Restaurant-Staging-E2E mit realen Memberships und Cross-Tenant-Negativtest.
3. Freigegebenen Marketingprovider, DOI-Sender, SPF, DKIM, DMARC, Bounce,
   Suppression und Complaints einrichten.
4. Legal Review abschließen.
5. Zentralen Account-Recovery-Prozess für Gerätewechsel definieren.
6. Physischen Mobile-Safari-, installierten-PWA-, 200-%-Zoom- und
   Screenreader-Test durchführen.

## Status

- zentrale Kundenoberfläche: **CODE LOCK / READY_FOR_VISUAL_REVIEW**
- Migration: **READY_FOR_STAGING_E2E, nicht angewendet**
- E-Mail-Versand: **BLOCKED_BY_PRODUCTION_EMAIL_INFRASTRUCTURE**
- Gesamtstatus nach AGENTS-Regel: **NOT READY für FINAL LOCK**
