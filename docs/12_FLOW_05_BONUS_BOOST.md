# WUXUAI Bonus V1 - Flow 05: Freundschaftsbonus

Status: **CURRENT LOCK**
Stand: 2026-08-24

## Ziel

Ein bestehender Gast laedt einen neuen Gast fuer genau dasselbe Restaurant ein.
Erst nach der ersten gueltigen Punktebuchung des neuen Gasts erhalten beide
einen zeitlich begrenzten 2x-Freundschaftsbonus.

## Restaurantregel

- Multiplikator: fest 2x.
- Defaultdauer fuer neue Restaurants: 14 Tage.
- Owner-Auswahl: 7 Tage, 14 Tage, 28 Tage oder eigener Wert.
- Eigener Wert: ganze Zahl von 1 bis 365 Tagen.
- Eine Aenderung gilt nur fuer kuenftige Qualifikationen.
- Bereits aktive und historische Booster bleiben unveraendert.

## Beguenstigte

- Einladender Gast: 100 Prozent der konfigurierten Dauer.
- Eingeladener Freund: exakt 50 Prozent der konfigurierten Dauer.
- Die Haelfte wird zeitgenau berechnet. Sieben konfigurierte Tage ergeben fuer
  den Freund 3,5 Tage beziehungsweise 84 Stunden.
- Beide erhalten 2x Punkte. Der Multiplikator darf niemals ueber 2x steigen.

## Qualifikation

1. Der bestehende Gast erzeugt einen nicht erratbaren Referral-Link oder QR.
2. Der neue Gast registriert sich mit dem sicheren Customer-Auth- und
   Legal-RPC-Flow beim richtigen Restaurant. Die Landingpage verwendet dabei
   keine vereinfachte Parallelregistrierung.
3. Registrierung allein qualifiziert nicht.
4. Die erste gueltige, serverseitige Punktebuchung aktiviert den Referral
   atomar.
5. Der Server schreibt genau einen Grant pro Referral, Kunde und Rolle.

## Verlaengerung

- Kein aktiver 2x-Boost: neuer Zeitraum ab Qualifikationszeitpunkt.
- Aktiver 2x-Boost: neue Dauer wird an das bestehende Enddatum angehaengt.
- Abgelaufener Boost: neuer Zeitraum ab der neuen Qualifikation.
- Weitere Referrals veraendern nur die Laufzeit, nicht den Multiplikator.
- Ein eingeladener Freund kann spaeter selbst Referrer sein und erhaelt dann
  fuer diese neue Rolle die volle konfigurierte Dauer.

## Sicherheit

- Keine Selbstempfehlung.
- Kein Referral fuer einen bereits bestehenden Gast desselben Restaurants.
- Keine restaurantuebergreifende Uebernahme.
- Qualifikation, Grants und Laufzeitverlaengerung sind serverseitig,
  mandantenbezogen, atomar und idempotent.
- Advisory Lock und Row Lock verhindern verlorene parallele Verlaengerungen.
- RLS bleibt aktiv; die Grant-Tabelle ist fuer Browser nicht beschreibbar.
- Token, Telefonnummer, PIN und Auth-Daten erscheinen nicht im Audit.
- Der Referral-Rueckweg ist auf `/r/<restaurant-slug>/<sicherer-token>`
  begrenzt. Restaurant und Token werden bei der Annahme erneut serverseitig
  validiert.
- Die persistente Zuordnung liegt nach der Annahme in `referrals` und
  `customer_account_memberships`, nicht nur im Browserzustand.

## Kundenkommunikation

- Noch nicht aktiv: Der einladende Gast sieht seine volle Dauer, der Freund die
  halbe Dauer.
- Eingeladener Freund aktiv: `Willkommen - 2x Punkte aktiv`.
- Einladender Gast aktiv: verbleibende Laufzeit und Hinweis, dass jede weitere
  erfolgreiche Einladung die volle Restaurantdauer addiert.
- Punkte bleiben immer restaurantbezogen.

## Owner-UI

Der Bereich `Bonusprogramm -> Freundschaftsbonus` bietet Aktivierung,
festen Multiplikator 2x und die Dauer 7/14/28/Custom. Die Vorschau zeigt beide
Beguenstigten getrennt. Ungueltige Werte werden client- und serverseitig
blockiert.

## Legacy

Default 30 Tage, gleiche Dauer fuer beide, Presets 14/30/60 oder
7/14/30/60/90 und Multiplikatoren ueber 2x sind superseded. Historische
Booster werden trotzdem nicht rueckwirkend umgeschrieben.
