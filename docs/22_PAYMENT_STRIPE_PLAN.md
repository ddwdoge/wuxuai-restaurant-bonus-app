
# 22_PAYMENT_STRIPE_PLAN.md

# WUXUAI Bonus V1 – Payment & Stripe Plan

Status: **LOCK**

Dieses Dokument beschreibt den offiziellen Zahlungs-, Testphasen- und Stripe-Plan für WUXUAI Bonus.

Die Zahlungslogik ist nicht nur eine technische Integration.  
Sie ist Teil des Geschäftsmodells.

WUXUAI Bonus soll für Restaurants leicht verständlich, risikofrei testbar und nach der Testphase einfach bezahlbar sein.

---

## 1. Zweck dieses Dokuments

Dieses Dokument legt fest:

- wie die 30-Tage-Testphase funktioniert,
- wann Restaurants zahlen,
- warum keine rückwirkende Zahlung verlangt wird,
- welche Preismodell-Entscheidung für V1 gilt,
- welche Datenbankfelder benötigt werden,
- wie Stripe später integriert wird,
- welche Webhooks relevant sind,
- wie Staging und Production getrennt werden,
- wie Abos, Kündigungen und Zahlungsstatus behandelt werden,
- welche Funktionen nicht in V1 eingebaut werden dürfen,
- wie V2 mit Filialen, Enterprise und Stripe erweitert werden kann.

Codex darf aus diesem Dokument keine sofortige Stripe-Integration bauen, wenn dies nicht ausdrücklich beauftragt wurde.  
Dieses Dokument ist eine Spezifikation und Go-Live-Vorbereitung.

---

## 2. Grundentscheidung: 30 Tage kostenlos

🟢 **FIX**

Jedes Restaurant erhält in V1 eine kostenlose Testphase.

Regel:

```text
30 Tage kostenlos
Keine Kreditkarte erforderlich
Keine Nachzahlung
Jederzeit kündbar
```

### Warum?

Restaurants sollen das System risikofrei testen.

Der Restaurantbesitzer soll denken:

> „Ich probiere es aus und sehe, ob es mir Gäste zurückbringt.“

Nicht:

> „Was kostet mich das sofort?“

---

## 3. Keine rückwirkende Zahlung

🟢 **FIX**

WUXUAI Bonus verlangt nach der Testphase keine rückwirkende Zahlung für die kostenlosen 30 Tage.

Verboten:

```text
30 Tage gratis
→ danach die letzten 30 Tage nachzahlen
```

### Warum?

Rückwirkende Zahlung erzeugt psychologischen Widerstand.

Beispiel:

```text
59 €/Monat
nach 30 Tagen plötzlich 59 € rückwirkend + 59 € neuer Monat
```

Das fühlt sich für Restaurants wie eine versteckte Rechnung an.

Stattdessen:

```text
30 Tage testen
→ Nutzen sehen
→ freiwillig Abo starten
```

---

## 4. Ein einfaches Paket in V1

🟢 **FIX**

V1 startet mit einem einfachen Paket.

Empfehlung:

```text
WUXUAI Bonus
59–69 € / Monat
30 Tage kostenlos
monatlich kündbar
```

Keine komplizierten Pakete in V1.

### Warum?

Der Gründer arbeitet allein.

Mehr Pakete bedeuten:

- mehr Support,
- mehr Abrechnungslogik,
- mehr Fragen,
- mehr Fehler,
- mehr UI-Komplexität.

V1 braucht zuerst Zahlungsbereitschaft, nicht Tarifkomplexität.

---

## 5. Preispsychologie

Das Preismodell muss für Restaurants leicht verständlich sein.

Verkaufslogik:

```text
Wenn WUXUAI Bonus nur einen zusätzlichen Stammgast pro Monat bringt,
hat sich die Monatsgebühr meistens bereits gelohnt.
```

Das Produkt wird nicht über Funktionen verkauft, sondern über Nutzen:

- neue Mitglieder,
- Wiederbesuche,
- Bonus Boost,
- eingelöste Belohnungen,
- Freunde-Einladungen,
- mehr Stammgäste.

---

## 6. Erfolgsbericht vor Testende

🟢 **FIX**

Vor Ablauf der Testphase soll das Restaurant einen Erfolgsbericht sehen.

Beispiel:

```text
Ihr Bonusprogramm hat in den letzten 30 Tagen erreicht:

👥 127 neue Mitglieder
🎁 81 eingelöste Belohnungen
🔥 18 Bonus Boosts aktiviert
📈 54 wiederkehrende Gäste
```

Danach:

```text
Möchten Sie weiterhin aus Gästen Stammgäste machen?
[Jetzt Abo starten]
```

### Warum?

Nicht über Preis verkaufen.

Über nachgewiesenen Nutzen verkaufen.

---

## 7. Trial-Status in der Datenbank

### 7.1 branch_subscriptions

V1 nutzt `branch_subscriptions` als technische Basis.

V1 Verhalten:

```text
1 Restaurant = 1 Branch = 1 Subscription
```

Wichtige Felder:

- id
- organization_id
- branch_id
- restaurant_id falls vorhanden
- status
- plan
- trial_started_at
- trial_ends_at
- current_period_start
- current_period_end
- stripe_customer_id später
- stripe_subscription_id später
- created_at
- updated_at

### 7.2 Statuswerte

V1/V2 Status:

```text
trialing
active
past_due
cancelled
expired
incomplete
```

V1 darf einfach beginnen mit:

- trialing
- active
- cancelled
- expired

Stripe kann später weitere Statuswerte ergänzen.

---

## 8. Trial-Start

### 8.1 Wann startet Trial?

Trial startet nach erfolgreicher Restaurant-Owner-Registrierung.

Ablauf:

```text
/register
→ Supabase Auth User
→ Restaurant
→ Organisation
→ Branch
→ restaurant_members role owner
→ branch_subscriptions status trialing
→ trial_ends_at = now + 30 Tage
```

### 8.2 RPC

Trial-Start erfolgt über sichere RPC:

```text
start_restaurant_owner_trial
```

### 8.3 Wichtige Regel

RPC muss sicherstellen:

- branch_subscriptions existiert,
- subscription_record ist niemals NULL,
- owner wird korrekt eingetragen,
- Audit wird geschrieben,
- keine doppelten Restaurants bei normalem Flow entstehen.

---

## 9. Nach Trial-Ende

### 9.1 V1 einfache Logik

Wenn Trial endet und kein Abo aktiv ist:

Restaurant Portal kann eingeschränkt werden.

Mögliche Anzeige:

```text
Deine Testphase ist abgelaufen.

Aktiviere dein Abo, um dein Bonusprogramm weiter zu nutzen.
```

### 9.2 Kundenportal bei abgelaufenem Trial

Kundenportal darf nicht technisch brechen.

Anzeige:

```text
Dieses Bonusprogramm ist derzeit nicht aktiv.
Bitte wende dich an das Restaurant.
```

### 9.3 Kein Datenverlust

Daten werden nicht sofort gelöscht.

Restaurantdaten bleiben erhalten, damit Restaurant später reaktivieren kann.

---

## 10. Kündigung

### 10.1 Während Trial

Restaurant kann während Trial kündigen.

V1 kann zunächst bedeuten:

```text
subscription_status = cancelled
```

### 10.2 Nach bezahltem Abo

Später mit Stripe:

- Kündigung zum Periodenende
- sofortige Kündigung nur falls ausdrücklich nötig
- Daten bleiben für definierte Zeit erhalten

### 10.3 UX

Kündigung darf nicht versteckt sein.

Aber V1 muss keine vollständige Self-Service Billing UI haben, bevor Stripe integriert ist.

---

## 11. Stripe-Integration – Grundsatz

🟡 **V2 / Go-Live relevant**

Stripe wird integriert, sobald:

- Pilotrestaurant validiert ist,
- Preismodell bestätigt ist,
- erste zahlende Restaurants realistisch sind,
- Production-Go-Live vorbereitet ist.

Stripe wird nicht vorzeitig gebaut, wenn noch der Produktkern instabil ist.

### Warum?

Zahlungsintegration ohne stabilen Produktnutzen bringt keinen Cashflow.

Erst Nutzen beweisen, dann Zahlung automatisieren.

---

## 12. Stripe-Testmodus

Stripe wird zuerst im Testmodus eingerichtet.

Regeln:

- Test-Product
- Test-Price
- Test-Checkout
- Test-Webhooks
- Test-Subscriptions
- Test-Customer

Erst wenn Testmodus vollständig funktioniert:

- Live Product
- Live Price
- Live Webhooks
- Live Checkout

---

## 13. Stripe Products und Prices

### 13.1 V1 Produkt

Stripe Product:

```text
WUXUAI Bonus
```

### 13.2 V1 Price

Beispiel:

```text
59 € / Monat
```

oder

```text
69 € / Monat
```

Finaler Preis wird durch Business-Entscheidung bestätigt.

### 13.3 Jahresabo später

V2 oder später:

```text
10 Monate zahlen
12 Monate nutzen
```

Beispiel:

```text
590 € / Jahr bei 59 €/Monat
```

Nicht V1 Pflicht.

---

## 14. Checkout Flow

### 14.1 Nach Trial

Restaurant klickt:

```text
Abo starten
```

System öffnet Stripe Checkout.

### 14.2 Daten an Stripe

Mitgeben:

- restaurant_id
- branch_id
- organization_id
- owner_id
- plan
- environment

Diese Werte als Metadata.

### 14.3 Nach Checkout

Stripe leitet zurück:

```text
/admin/settings/konto
```

oder

```text
/admin
```

mit Erfolgsmeldung:

```text
Dein Abo ist aktiv.
```

### 14.4 Abbruch

Wenn Checkout abgebrochen:

```text
Der Zahlungsvorgang wurde abgebrochen.
Du kannst dein Abo jederzeit erneut starten.
```

---

## 15. Stripe Customer

### 15.1 Zuordnung

Jede Organisation oder Branch bekommt einen Stripe Customer.

V1:

```text
1 Branch / Restaurant = 1 Stripe Customer
```

V2:

```text
1 Organization = 1 Stripe Customer
mehrere Branches darunter
```

### 15.2 Speicherung

Speichern in:

- branch_subscriptions.stripe_customer_id
- später organization_subscriptions falls eingeführt

---

## 16. Stripe Subscription

### 16.1 Speicherung

Speichern:

- stripe_subscription_id
- stripe_price_id
- status
- current_period_start
- current_period_end
- cancel_at_period_end
- trial_end falls Stripe Trial genutzt wird

### 16.2 Quelle der Wahrheit

Wenn Stripe aktiv integriert ist:

- Stripe ist Quelle für Zahlungsstatus
- Supabase speichert synchronisierten Status

Aber WUXUAI App muss robust sein, falls Webhook verzögert ist.

---

## 17. Webhooks

### 17.1 Grundregel

Stripe Webhooks müssen serverseitig verarbeitet werden.

Nicht im Frontend.

### 17.2 Wichtige Events

Später relevant:

- checkout.session.completed
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.paid
- invoice.payment_failed

### 17.3 Signaturprüfung

Webhook muss Stripe-Signatur prüfen.

Verboten:

- Webhook ohne Signaturprüfung
- Stripe Secret im Frontend
- Webhook-Logik im Browser

### 17.4 Idempotenz

Webhook-Verarbeitung muss idempotent sein.

Ein Event kann mehrfach kommen.

System darf nicht doppelt aktivieren oder doppelt buchen.

---

## 18. Abo-Status Mapping

Mögliche Stripe Status:

- trialing
- active
- past_due
- canceled
- incomplete
- unpaid

Mapping auf WUXUAI:

```text
trialing → Trial aktiv
active → Abo aktiv
past_due → Zahlungsproblem
canceled → gekündigt
unpaid → gesperrt / prüfen
incomplete → Zahlung nicht abgeschlossen
```

V1 UI sollte nur verständliche deutsche Texte zeigen.

---

## 19. Konto & Testphase UI

### 19.1 Bereich

Im Restaurant Portal unter:

```text
Einstellungen
→ Konto & Testphase
```

### 19.2 Anzeigen

V1 Anzeige:

- Testphase aktiv
- Enddatum
- verbleibende Tage
- Abo starten Button
- Preis
- Hinweis keine Nachzahlung

### 19.3 Nach Abo

Anzeigen:

- Abo aktiv
- aktueller Tarif
- nächster Abrechnungszeitraum
- Rechnung / Zahlungsportal später

### 19.4 Keine Überladung

Keine Stripe-Fachbegriffe:

Verboten:
- subscription_id
- payment_intent
- checkout session
- webhook
- invoice status raw

---

## 20. Customer Portal bei Zahlungsstatus

Kundenportal darf nicht plötzlich technische Fehler zeigen.

### 20.1 Trial aktiv

Normal nutzbar.

### 20.2 Abo aktiv

Normal nutzbar.

### 20.3 Trial abgelaufen ohne Abo

Freundliche Anzeige:

```text
Dieses Bonusprogramm ist derzeit nicht aktiv.
Bitte wende dich an das Restaurant.
```

### 20.4 Restaurant reaktiviert

Kundenportal funktioniert wieder.

---

## 21. Staff Portal bei Zahlungsstatus

Wenn Restaurant nicht aktiv:

Staff Portal kann anzeigen:

```text
Dieses Bonusprogramm ist derzeit nicht aktiv.
Bitte wende dich an den Restaurantbesitzer.
```

Keine technischen Fehler.

---

## 22. Datenhaltung nach Kündigung

V1/V2 Regel noch final zu entscheiden.

Empfohlene V1-Haltung:

- Daten nicht sofort löschen.
- Restaurant kann reaktivieren.
- Löschung später auf Anfrage / DSGVO-Prozess.

### Nicht automatisch löschen

Keine automatische sofortige Datenlöschung nach Trial-Ende.

---

## 23. Rechnungen

V2 mit Stripe:

- Stripe erzeugt Rechnungen.
- Restaurant kann über Billing Portal Rechnungen sehen.
- WUXUAI speichert Referenzen.

V1 vor vollständiger Stripe-Integration kann Rechnungen manuell oder gar nicht automatisiert behandeln.

---

## 24. Stripe Billing Portal

Später möglich:

Restaurant kann selbst:

- Zahlungsmethode ändern
- Rechnungen ansehen
- Abo kündigen
- Plan ändern

V1 nicht zwingend.

---

## 25. Plans und Limits

### 25.1 V1

Ein Paket.

### 25.2 V2

Mögliche Pakete:

```text
Solo
1 Filiale

Small Chain
bis 5 Filialen

Business Chain
bis 20 Filialen

Enterprise
individuell
```

### 25.3 Limits

Später speichern:

- max_branches
- max_staff
- max_customers optional
- branding_remove_allowed
- pos_integration_allowed

V1 nicht überfrachten.

---

## 26. Filialabrechnung

V1:

```text
1 Restaurant = 1 Zahlung
```

V2:

```text
Organisation = eine Rechnung
mehrere Filialen
```

### Warum vorbereiten?

Wenn mehrere Einzelrestaurants später zusammengeführt werden, soll Abrechnung sauber migrierbar sein.

---

## 27. Free Trial Abuse

### 27.1 Risiko

Ein Restaurant könnte mehrere Accounts erstellen, um Trial mehrfach zu nutzen.

### 27.2 V1 Schutz

- Owner E-Mail prüfen
- Restaurantname/Telefon optional prüfen
- WUXUAI Admin später
- Audit
- keine automatische harte Sperre zu früh

### 27.3 V2 Schutz

- Telefonnummer / Firmendaten
- UID/UID-like Firmendaten
- Zahlungsdaten
- Domain
- Admin Review

V1 bleibt einfach.

---

## 28. Steuer und Rechnungsdaten

V1 minimal:

- Restaurantname
- Besitzername
- E-Mail
- Telefonnummer optional

V2 später:

- Rechnungsadresse
- UID
- Land
- Steuerlogik
- Firmenname
- Rechnungsempfänger

Nicht alles im Onboarding verlangen.

---

## 29. Mehrwertsteuer

V2/Production braucht klare Entscheidung je nach Unternehmenssitz.

WUXUAI darf keine Steuerlogik raten.

Wenn Stripe Tax genutzt wird, eigene Spezifikation erstellen.

V1 Pilot kann ohne vollständige Steuerautomatisierung starten, solange keine Live-Zahlungen automatisiert werden.

---

## 30. Zahlungsfehler

Wenn Zahlung fehlschlägt:

Restaurant Portal zeigt:

```text
Bei deiner Zahlung gab es ein Problem.
Bitte aktualisiere deine Zahlungsmethode.
```

Nicht:

```text
invoice.payment_failed
```

### Grace Period

Später sinnvoll:

```text
7 Tage Kulanz
```

V1 noch nicht zwingend.

---

## 31. Manuelle Aktivierung für Pilot

Vor Stripe kann WUXUAI intern manuell setzen:

```text
subscription_status = active
```

für Pilotrestaurants.

Das muss auditierbar sein.

Nicht über öffentliche UI.

---

## 32. Sicherheit

### 32.1 Stripe Secrets

Niemals im Frontend.

### 32.2 Webhook Secret

Nur serverseitig.

### 32.3 Environment Variables

Cloudflare/Supabase Secrets getrennt.

### 32.4 Logs

Keine Karten- oder Zahlungsdaten in App-Logs speichern.

---

## 33. Staging vs Production Stripe

Stripe Test Keys nur in Staging.

Stripe Live Keys nur in Production.

Niemals mischen.

Wenn Staging versehentlich Live Keys nutzt:

Blocker.

Wenn Production Test Keys nutzt:

Blocker.

---

## 34. Go-Live Zahlungscheck

Vor Live-Zahlung prüfen:

- Stripe Product vorhanden
- Stripe Price vorhanden
- Checkout funktioniert
- Webhook Signatur geprüft
- Subscription Status synchronisiert
- Payment Failed getestet
- Cancel getestet
- Billing Portal falls vorhanden getestet
- branch_subscriptions aktualisiert
- Audit geschrieben
- keine Secrets im Frontend

---

## 35. Was ausdrücklich verboten ist

Verboten:

- rückwirkende Trial-Zahlung
- Kreditkarte vor Testphase verlangen
- mehrere Pakete in V1 erzwingen
- Stripe Secret im Frontend
- Webhook ohne Signaturprüfung
- Paymentstatus nur im Frontend setzen
- Abo aktivieren ohne serverseitige Bestätigung
- Production mit Test-Keys
- Staging mit Live-Keys
- technische Stripe-Texte in UI
- Rechnungsdaten im Onboarding überfrachten
- Zahlung vor Produktnutzen priorisieren

---

## 36. V2 Hinweise

V2 kann enthalten:

- Stripe Checkout vollständig
- Stripe Webhooks
- Billing Portal
- Jahresabo
- mehrere Pakete
- Filiallimits
- Enterprise Preis
- Branding entfernen
- Stripe Tax
- automatische Rechnungen
- Self-Service Kündigung
- Zahlungsfehler-Kulanz
- Coupon Codes
- Partnerprogramme

V1 bleibt:

```text
30 Tage kostenlos
ein Paket
kein rückwirkendes Zahlen
```

---

## 37. LOCK Kriterien

Payment & Stripe Plan gilt als LOCK, wenn:

- 30 Tage Trial klar definiert
- keine rückwirkende Zahlung klar definiert
- ein Paket V1 klar definiert
- branch_subscriptions Logik dokumentiert
- Stripe Checkout Plan dokumentiert
- Webhook-Regeln dokumentiert
- Staging/Production Trennung dokumentiert
- Security Regeln dokumentiert
- Konto & Testphase UI dokumentiert
- V2 Zahlungsfunktionen getrennt sind
- Codex klare Verbote kennt

---

## 38. Codex-Regeln

Wenn Codex an Payment/Stripe arbeitet:

1. Diese Datei zuerst lesen.
2. Keine rückwirkende Zahlung einbauen.
3. Keine Kreditkarte vor Trial verlangen.
4. Keine Stripe Secrets ins Frontend.
5. Webhooks nur serverseitig.
6. Kein Paymentstatus nur clientseitig setzen.
7. V1 nicht mit mehreren Paketen überladen.
8. Alle UI-Texte Deutsch.
9. Staging/Test Keys von Production/Live Keys trennen.
10. Bei Unsicherheit: NOT READY melden.

---

Endstatus: **LOCK**
