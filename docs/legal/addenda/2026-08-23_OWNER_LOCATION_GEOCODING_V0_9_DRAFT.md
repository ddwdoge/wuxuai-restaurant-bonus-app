# Ergänzung: Kartendarstellung und Geocodierung

Status: `DRAFT_LEGAL_REVIEW_REQUIRED`
Bezugsbasis: WUXUAI Legal-Paket V0.9
Stand: 23.08.2026

Dieses Addendum dokumentiert die technische Standort-Geocodierung, ohne die
unveränderte Referenzfassung des Legal-Pakets V0.9 still zu überschreiben. Die
endgültige Einordnung in Betreiber-Datenschutz, AGB und
Subprozessoren-/Empfängerliste muss vor Production rechtlich geprüft werden.

## Betreiber-Datenschutz

WUXUAI verwendet OpenStreetMap/Nominatim zur Standortbestimmung von Betrieben.
Wenn ein Betreiber ausdrücklich „Adresse auf Karte anzeigen“ auswählt, wird
ausschließlich die eingegebene geschäftliche Adresse mit Straße,
Postleitzahl, Ort und Land serverseitig an Nominatim übermittelt.

Es werden keine Kunden-, Login-, Zahlungs-, Owner-, Kontakt- oder sonstigen
Accountdaten zusammen mit der Anfrage übertragen. Der externe Dienst kann
technisch die IP-Adresse des aufrufenden Supabase-Servers und Informationen zur
Anfrage verarbeiten. Die ermittelten Koordinaten werden bei WUXUAI gespeichert;
Suchergebnisse werden zeitlich begrenzt zwischengespeichert, damit nicht bei
jedem Kartenaufruf erneut geocodiert wird.

Weitere Informationen:
[Datenschutzerklärung der OpenStreetMap Foundation](https://osmfoundation.org/wiki/Privacy_Policy)

## Kurzer AGB-Hinweis

Zur Bereitstellung einzelner Karten- und Standortfunktionen können externe
technische Dienste wie OpenStreetMap eingesetzt werden. Einzelheiten zur
Datenverarbeitung sind in der Datenschutzerklärung beschrieben.

Dieser Hinweis ergänzt den bereits bestehenden allgemeinen
Drittanbieter-Hinweis; eine doppelte vollständige Datenschutzerklärung in den
AGB ist nicht vorgesehen.

## Empfänger-/Subprozessorenprüfung

| Anbieter | Zweck | Datenkategorien | Region/Transfer | Status |
|---|---|---|---|---|
| OpenStreetMap Foundation / Nominatim | Serverseitige Geocodierung nach ausdrücklicher Betreiberaktion | Geschäftliche Betriebsadresse, technische Server-IP | Rolle und Region rechtlich prüfen | Entwurf |

## Consent und Versionierung

- Es wird keine zusätzliche Checkbox eingeführt.
- Kundendaten werden nicht verarbeitet; daher wird keine neue kundenseitige
  Pflichtannahme automatisch ausgelöst.
- Bereits veröffentlichte restaurantbezogene Dokumentversionen bleiben
  unverändert.
- Vor Production ist zu entscheiden, ob dieses Addendum in eine neue geprüfte
  Betreiber-Datenschutz-/AGB-Version und die Empfängerliste übernommen wird.
