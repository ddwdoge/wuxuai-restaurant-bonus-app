# Zentraler Kundenbereich und Angebots-E-Mails V1.0

Status: **DRAFT_LEGAL_REVIEW_REQUIRED**

Dieses Addendum ist keine Rechtsberatung und nicht als anwaltlich geprüft zu
kennzeichnen. Vor Production sind mindestens folgende Punkte zu prüfen:

- gemeinsame zentrale Kundenansicht bei weiterhin restaurantbezogenen
  Bonusprogrammen und Verantwortlichkeiten
- Rechtsgrundlage und Transparenz der technischen Membership-Verknüpfung
- restaurantbezogener Einwilligungstext für wöchentliche und monatliche Digests
- Double-Opt-in-Nachweis, Aufbewahrung und Widerruf
- Rollen Restaurant/WUXUAI sowie AVV und Marketing-Subprozessor
- SPF, DKIM, DMARC, Bounce-, Suppression- und Complaint-Verarbeitung
- Pflichtinformationen und Abmeldelink in jeder Angebots-E-Mail
- Cookie-/Trackinginformation; V1 verwendet standardmäßig keine individuellen
  Öffnungsprofile und keine verdeckten Trackingpixel
- Datenexport, Accountlöschung und Folgen für einzelne Memberships

Technische V1-Grenzen:

- Standardfrequenz `Nie`
- kein Versand vor bestätigtem Double-Opt-in
- Abmeldung löscht weder Punkte noch Membership
- keine E-Mail-Adresse, Telefonnummer, Geburtstag oder Tokens in Analytics
- Owner erhalten keine vollständige Empfängerliste
- Versand bleibt ohne freigegebene Production-Infrastruktur deaktiviert

