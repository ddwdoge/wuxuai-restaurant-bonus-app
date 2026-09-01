# Decision: Zentraler Kundenbereich und freiwillige Angebots-E-Mails

Datum: 2026-08-04  
Status: **TEILWEISE ERSETZT / V1 / DRAFT_LEGAL_REVIEW_REQUIRED**

Die spätere Entscheidung
`DECISION_2026-08-04_V1_CENTRAL_CUSTOMER_LOGIN_AND_RESTAURANT_CONTEXT.md`
ersetzt das tokenbasierte zentrale Login, die fünfteilige Navigation und den
global gemischten Angebotsfeed. Der restaurantbezogene DOI-/E-Mail-Vertrag
bleibt unverändert bestehen und weiterhin deaktiviert.

## Entscheidung

V1 erhält den zentralen Kundenbereich `Mein WUXUAI` unter `/customer`.
Er verbindet ausschließlich bereits serverseitig validierte, restaurantbezogene
Mitgliedschaften. Punkte, Besuche, Geschenke, Rewards und Angebote bleiben je
Restaurant getrennt; eine Gesamtpunktesumme ist verboten.

Der Restaurant-QR bleibt der verbindliche Einstieg für den ersten Beitritt und
den Vor-Ort-Kontext. Nach dem ersten Beitritt darf eine bestehende Mitgliedschaft
über den zentralen Zugang erneut geöffnet werden. Dabei wird serverseitig ein
neuer, ausschließlich an dieses Restaurant und diesen Kunden gebundener Zugang
ausgestellt. Es entsteht weder ein neuer Kunde noch eine neue Membership.

## Identität

- Die Source of Truth bleibt die restaurantbezogene `customers`-Zeile mit
  aktiver Membership und geheimem, gehasht gespeichertem Kundenzugang.
- Eine zentrale Account-ID darf mehrere validierte Memberships verknüpfen.
- Der zentrale Klartextzugang wird nur einmal an den Client zurückgegeben und
  serverseitig ausschließlich gehasht gespeichert.
- Telefonnummer, Geburtstag und `device_id` sind keine Login-Geheimnisse.
- Restauranttokens werden nicht im Browser zu einer globalen Identität
  zusammengeführt.
- Ohne gültigen zentralen Zugang werden keine Memberships oder Punktestände
  ausgegeben.

## Navigation

Die V1-Navigation enthält maximal fünf Ziele: `Start`, `Meine Lokale`,
`Aktuelles`, `Entdecken` und `Konto`.

## Angebots-E-Mails

Die frühere pauschale V1-Sperre für Angebots-E-Mails wird ausschließlich für
diesen eng begrenzten Vertrag ersetzt:

- pro Restaurant `Nie`, `Wöchentlich` oder `Monatlich`, Standard `Nie`
- freiwillige, restaurantbezogene Einwilligung
- bestätigte E-Mail und Double-Opt-in vor Aktivierung
- maximal ein Digest je Kalenderwoche beziehungsweise Kalendermonat
- keine Sofort-, Tages-, Push- oder SMS-Marketingnachricht
- sofortige restaurantbezogene Abmeldung ohne Punkte- oder Membershipverlust
- keine individuellen Öffnungsprofile oder Trackingpixel
- Owner sehen nur Aggregate, keine Empfängerlisten

## Versandfreigabe

Supabase Auth SMTP ist kein automatisch freigegebener Marketinganbieter. Ohne
geeigneten Provider mit DOI, Bounce-, Suppression-, Complaint-, SPF-, DKIM- und
DMARC-Vertrag bleibt `delivery_enabled = false`. Der derzeitige Produktstatus
für den Versand ist deshalb `BLOCKED_BY_PRODUCTION_EMAIL_INFRASTRUCTURE`.

## Sicherheit

Alle neuen Tabellen behalten RLS. Browserrollen erhalten keine direkten
Tabellenrechte. DOI und Abmeldung verwenden gehashte, zweckgebundene Tokens mit
Ablauf, Single Use und Rate Limit. Digest-Auswahl, Reservierung und Abschluss
sind ausschließlich für `service_role` ausführbar; die Service Role erscheint
nie im Browser.

## Legal

Einwilligungstext, Datenschutzrollen, Betreiber-AGB, Leistungsbeschreibung,
AVV, Subprozessoren, Trackinginformation und Abmeldebedingungen bleiben bis zur
externen Freigabe `DRAFT_LEGAL_REVIEW_REQUIRED`.
