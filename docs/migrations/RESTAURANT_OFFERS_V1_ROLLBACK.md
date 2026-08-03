# Restaurant Offers V1 – Rollback

Migration: `20260804001000_restaurant_offers_v1.sql`  
Status: lokal erstellt, nicht angewendet

## Sichere Deaktivierung

Die Funktion kann ohne Schema-Loeschung deaktiviert werden:

1. Owner-Route und Navigation ausblenden.
2. Public-RPC-Grants fuer `get_public_restaurant_offers` und
   `record_public_restaurant_offer_event` entziehen.
3. Alle Beitraege kontrolliert auf `DISABLED` und `is_active = false` setzen.

Damit bleiben Inhalte und Audit-Nachweise erhalten, waehrend keine Beitraege
mehr oeffentlich ausgeliefert werden.

## Neue Objekte

- Tabelle `public.restaurant_offers`
- Tabelle `public.restaurant_offer_metrics`
- Triggerfunktion und Trigger `validate_restaurant_offer_row`
- Owner-RPCs zum Lesen, Speichern, Statuswechsel, Duplizieren und Loeschen von
  Entwuerfen
- Public-RPCs zum Lesen sichtbarer Beitraege und Erhoehen aggregierter Zaehler
- RLS-Policies fuer Owner-/Admin-Lesezugriff
- Indizes fuer Owner-Liste, oeffentliche Zeitabfrage und Kennzahlen

## Vollstaendiger Schema-Rollback

Ein vollstaendiger Rollback darf erst erfolgen, wenn geklaert ist, ob Inhalte
oder Audit-Nachweise aufbewahrt werden muessen. Tabellen und historische Daten
duerfen nicht ungeprueft geloescht werden. Bei einer freigegebenen Ruecknahme
werden zuerst Grants, RPCs und Trigger entfernt und erst danach die beiden
Tabellen in Foreign-Key-sicherer Reihenfolge.

Die Migration veraendert keine Reward-, Punkte-, Coupon-, Redemption- oder
Campaign-Tabelle und lockert keine bestehende RLS-Policy.

