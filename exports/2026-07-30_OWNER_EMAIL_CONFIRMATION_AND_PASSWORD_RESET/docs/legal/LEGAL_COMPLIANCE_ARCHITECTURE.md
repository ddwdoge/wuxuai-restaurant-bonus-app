# Legal Compliance Architecture

Status: Technische Grundlage zur externen Rechtsprüfung, keine Production-Freigabe.

## Produktpositionierung

- Das jeweilige Restaurant betreibt sein Bonusprogramm, vergibt Punkte und schuldet die angebotenen Punkteeinlösungen.
- WUXUAI stellt die technische SaaS-Plattform bereit und hält keine Kundengelder.
- Punkte sind kein Geld, Bankguthaben, E-Wallet oder allgemeines Zahlungsmittel.
- Punkte sind nicht auszahlbar, verkäuflich oder zwischen Kunden beziehungsweise Restaurants übertragbar.
- Konten, Punkte, Einwilligungen und Dokumentannahmen bleiben restaurantbezogen.

## Technische Schichten

1. `restaurant_legal_profiles` speichert Betreiber-, Impressums- und Beschwerdeangaben.
2. `legal_documents` hält die Dokumentidentität je Restaurant.
3. `legal_document_versions` ist unveränderlich. Änderungen erzeugen eine neue Version mit SHA-256-Hash.
4. `customer_legal_acceptances` bindet Annahme, Version und Hash an genau einen Kunden und ein Restaurant.
5. `customer_consents` hält den aktuellen Status; `consent_events` bleibt als zeitlicher Nachweis erhalten.
6. Öffentliche Inhalte und Kundenvorgänge laufen ausschließlich über begrenzte RPCs.
7. Owner-Zugriffe prüfen `is_restaurant_admin(restaurant_id)` serverseitig.

## Registrierung

Die öffentlichen Alt-RPCs verlieren `anon`/`authenticated`-Ausführung. Neue Wrapper verlangen Teilnahmebedingungen und Datenschutzhinweis, bevor die bestehende Registrierung aufgerufen wird. Marketing ist getrennt, standardmäßig aus und keine Voraussetzung für das Bonuskonto.

Verlangt eine neue veröffentlichte Version eine erneute Annahme, zeigt das Legal Center dies nur dem tokenvalidierten Kunden. `accept_current_legal_documents` speichert ausschließlich die aktuell veröffentlichten Teilnahme- und Datenschutzversionen. Wiederholte Aufrufe bleiben durch den eindeutigen Versionsschlüssel idempotent.

## Readiness

Neue öffentliche Sichtbarkeit in der Partnerrestaurantsuche ist nur erlaubt, wenn `operational_ready`, `legal_ready` und `security_ready` wahr sind. Bereits sichtbare Testrestaurants werden durch die additive Migration nicht automatisch deaktiviert. Nach Veröffentlichung einer geprüften Legal-Konfiguration endet die Übergangsausnahme.

## Nachrichten

- `TRANSACTIONAL`: notwendige Vorgangsnachrichten.
- `PROGRAM_SERVICE`: Hinweise zum aktiv genutzten Bonusprogramm, etwa Ablaufhinweise.
- `MARKETING`: nur nach gültiger kanalspezifischer Einwilligung.

`authorize_customer_message` ist nicht öffentlich ausführbar. Ein Marketingversuch ohne Einwilligung wird blockiert und als `MARKETING_MESSAGE_BLOCKED_NO_CONSENT` auditiert.

## Datenschutzrechte

Kunden können Export, Berichtigung, Einschränkung, Löschung, Mitgliedschaftsbeendigung oder Beschwerde restaurantbezogen anfordern. Owner sehen offene Anfragen pseudonymisiert und nur für ihr Restaurant. Löschung ist bewusst ein geprüfter Workflow und kein unkontrolliertes Sofortlöschen. Eine beantragte Mitgliedschaftsbeendigung wird nicht vorzeitig als abgeschlossen auditiert.

## Grenzen

Punkteverfall wird in den Teilnahmebedingungen und im Legal Center transparent beschrieben. Eine rückwirkende technische Verkürzung bestehender Punkte findet nicht statt. Für historische Salden wird kein konkretes Ablaufdatum behauptet, solange eine verlässliche Zuordnung verbrauchter und verbleibender Punkte fehlt. Eine vollständige automatische Verfallsbuchung benötigt eine gesonderte fachliche und rechtliche Freigabe.

## Datenbank-Rollout

Die additive Migration `20260724001000_legal_compliance_layer.sql` ist im Repository vorbereitet. Der Dry-Run gegen das verknüpfte Staging-Projekt listet nur diese Migration als ausstehend. Sie wird in diesem Auftrag weder auf Staging noch auf Production angewendet.
