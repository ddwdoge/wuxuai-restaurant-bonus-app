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
- Monatliches Einladungslimit: Default 5 neue Einladungen pro Gast und
  Restaurant, Owner-konfigurierbar von 1 bis 100.
- Der Kalendermonat wird in der Zeitzone des Restaurants berechnet.

## Einladung freischalten

- Ein Gast darf erst nach mindestens einer erfolgreichen positiven
  Punktebuchung bei demselben Restaurant eine Einladung erzeugen.
- Registrierung, Welcome-Gift-Zuteilung, Preview, Fehler und stornierte
  Vorgange reichen nicht aus.
- Vor der Freischaltung zeigt das Kundenportal einen gesperrten Hinweis.
- Jede neu erzeugte Einladung verbraucht einen Monatsplatz. Das erneute Teilen
  desselben bereits erzeugten Links verbraucht keinen weiteren Platz.
- Historische Einladungen vor Einfuehrung des Limits werden nicht
  rueckwirkend gezaehlt.

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
   Dabei wird genau wie bei direkter Registrierung hoechstens ein normales,
   zunaechst gesperrtes Willkommensgeschenk zugeteilt.
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
- Einladungstoken werden nur gehasht gespeichert. Eligibility und Monatslimit
  werden serverseitig unter einem restaurant- und monatsbezogenen Lock
  geprueft.
- Der Referral-Rueckweg ist auf `/r/<restaurant-slug>/<sicherer-token>`
  begrenzt. Restaurant und Token werden bei der Annahme erneut serverseitig
  validiert.
- Die persistente Zuordnung liegt nach der Annahme in `referrals` und
  `customer_account_memberships`, nicht nur im Browserzustand.

## Kundenkommunikation

- Der sichtbare Lebenszyklus stammt serverseitig aus Referral, Grant und Boost;
  Browserzustand ist keine Statusautoritaet.
- `waiting_registration`: Der Referrer sieht, dass sein Link bereit ist und die
  Registrierung des Freundes noch aussteht.
- `pending_qualification`: Der Referrer sieht `Freund erfolgreich eingeladen`;
  der Freund sieht `Einladung erfolgreich angenommen` und den ausstehenden
  ersten qualifizierten Besuch.
- `active`: Beide sehen 2x, den exakten Ablaufzeitpunkt in Europe/Vienna und
  eine Restzeit in Tagen beziehungsweise nahe am Ablauf in Stunden und Minuten.
- Aktive Texte unterscheiden `Dein Bonus` fuer den Referrer und `Dein
  Einladungsbonus` fuer den Freund. Die sichtbare volle beziehungsweise halbe
  Dauer stammt aus der aktuellen Restaurantkonfiguration.
- `expired`: Das Aktiv-Badge verschwindet; eine neue Einladung bleibt moeglich.
- Das Kundenportal zeigt `Einladungen diesen Monat: X von Y`.
- Mehrere erfolgreiche Einladungen zeigen das kombinierte serverseitige
  Enddatum; der Multiplikator bleibt 2x.
- Punkte bleiben immer restaurantbezogen.

## Owner-UI

Der Bereich `Bonusprogramm -> Freundschaftsbonus` bietet Aktivierung,
festen Multiplikator 2x und die Dauer 7/14/28/Custom. Die Vorschau zeigt beide
Beguenstigten getrennt. Ungueltige Werte werden client- und serverseitig
blockiert. Das monatliche Einladungslimit ist als ganze Zahl von 1 bis 100
restaurantbezogen konfigurierbar.

## Legacy

Default 30 Tage, gleiche Dauer fuer beide, Presets 14/30/60 oder
7/14/30/60/90 und Multiplikatoren ueber 2x sind superseded. Historische
Booster werden trotzdem nicht rueckwirkend umgeschrieben.
