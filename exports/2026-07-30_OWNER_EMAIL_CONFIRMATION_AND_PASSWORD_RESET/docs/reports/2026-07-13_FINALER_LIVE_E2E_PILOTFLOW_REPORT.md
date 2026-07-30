# WUXUAI Bonus V1 - Finaler Live-E2E-Pilotflow Report

Datum: 2026-07-13  
Live-App: https://wuxuai-restaurant-bonus-os.dongdongwu4899.workers.dev  
Status: NOT READY

## Ursache

Der serverseitige Kernflow ist in mehreren Teilen funktionsfähig, aber der echte Live-Browserflow ist nicht pilotbereit.

Die Supabase-RPCs konnten ein neues Restaurant, einen Gast, ein gesperrtes Willkommensgeschenk, eine Punktebuchung mit Tages-PIN, die Freischaltung des Willkommensgeschenks und eine Punkteeinlösung ausführen. Die Live-Frontend-App zeigt jedoch an zentralen Stellen nicht den passenden Restaurant-/Kundenkontext.

## Testdaten

- Testrestaurant: Pilot Live Test 1783961344450-51722
- Slug: pilot-live-test-1783961344450-51722
- Testgast: Pilotgast
- Test-Punkteeinlösung: Gratis Dessert, 50 Punkte
- Test-Willkommensgeschenk: Gratis Kaffee

## Getestete Flows

### 1. Restaurant Portal

Ergebnis: Fehlgeschlagen.

Nach Login des frisch erzeugten Restaurant-Owners zeigte `/admin/settings` nicht das Testrestaurant. Die Seite enthielt weiterhin `Kai Sushi`. Damit ist der Live-Tenant-Kontext im Browser nicht korrekt gebunden.

Bewertung: KRITISCH.

### 2. Customer QR

Ergebnis: Fehlgeschlagen.

Die direkten Browserrouten:

- `/customer/pilot-live-test-1783961344450-51722`
- `/w/pilot-live-test-1783961344450-51722`

zeigten nur:

```text
Daten konnten gerade nicht geladen werden.
```

Der direkte RPC `get_public_customer_portal` hat denselben Slug korrekt geladen. Damit liegt der Blocker im Live-Frontend/Environment/Client-Kontext, nicht in der Datenbasis des Testrestaurants.

Bewertung: KRITISCH.

### 3. Registrierung

Ergebnis: Datenebene bestanden, Live-UI nicht bestanden.

RPC `register_restaurant_customer`:

- Customer erstellt
- Customer Token erstellt
- genau ein Willkommensgeschenk zugeteilt
- kein Campaign Offer
- kein Coupon
- keine alte Campaign Reward

Da die Live-Customer-Route im Browser nicht lädt, ist die echte QR-Registrierung für Gäste trotzdem blockiert.

Bewertung: KRITISCH.

### 4. Willkommensgeschenk locked

Ergebnis: Bestanden auf Datenebene.

Nach normaler Registrierung wurde das Willkommensgeschenk mit Status `locked` angezeigt.

### 5. Punkte sammeln mit Tages-PIN

Ergebnis: Bestanden auf Datenebene.

Geprüft:

- ohne Tages-PIN: blockiert
- falsche Tages-PIN: blockiert mit `Die Tages-PIN ist nicht korrekt.`
- richtige Tages-PIN: Punkte wurden gebucht
- `points_transactions` geschrieben
- Audit `public_bonus_points_collected` geschrieben

### 6. Willkommensgeschenk unlocked

Ergebnis: Bestanden auf Datenebene.

Nach erster erfolgreicher Punktebuchung wurde das Willkommensgeschenk freigeschaltet.

### 7. Punkteeinlösung

Ergebnis: Bestanden auf Datenebene.

Die aktive Punkteeinlösung `Gratis Dessert` war mit 50 Punkten sichtbar und einlösbar.

Wichtig: Die aktuelle Engineering Bible regelt, dass normale Punkteeinlösungen Katalogprodukte bleiben. Sie verschwinden nach Einlösung nicht dauerhaft. Das wurde so geprüft.

### 8. Einlösung

Ergebnis: Teilweise bestanden.

Normale Punkteeinlösung:

- 50 Punkte wurden abgezogen
- `reward_redemption_events` wurde geschrieben
- Produkt blieb sichtbar

Zusätzlicher kritischer Befund:

Ein freigeschaltetes Willkommensgeschenk konnte am selben Tag nach der ersten Punktebuchung eingelöst werden. Das widerspricht der Bible-Regel:

```text
Willkommensgeschenk wird nach erster Punktebuchung freigeschaltet,
aber erst beim nächsten Besuch eingelöst.
```

Bewertung: KRITISCH.

### 9. Staff Portal Statusprüfung

Ergebnis: Fehlgeschlagen in der Live-UI, Datenebene teilweise bestanden.

Datenebene:

- aktives Willkommensgeschenk war in `customer_rewards` sichtbar
- normale Punkteeinlösung wurde als `reward_redemption_events` gespeichert

Live-UI:

Aufruf von `/staff/pilot-live-test-1783961344450-51722` nach Owner-Login öffnete nicht die Staff-Ansicht, sondern den Onboarding-Wizard. Das zeigt denselben Tenant-/Setup-Gate-Blocker wie im Restaurant Portal.

Bewertung: KRITISCH.

### 10. RLS / Security

Ergebnis: Teilweise bestanden.

Geprüft:

- fremder Owner liest keine Kunden des Testrestaurants
- fremder Owner liest keine Rewards des Testrestaurants
- anon liest keine Tages-PIN-Daten direkt
- Service Role wurde im Frontend nicht verwendet

Nicht final bestanden, weil der Welcome-Gift-Same-Day-Redeem-Blocker gegen die dokumentierte Sicherheits-/Business-Regel verstößt.

### 11. Responsive

Ergebnis: Technisch bestanden für die getestete Customer-Route, aber nicht final aussagekräftig.

Geprüfte Breiten:

- 390px
- 430px
- 768px
- 1280px

Keine horizontale Scrollbar. Da die Live-Customer-Route aber nur eine Fehlermeldung zeigte, ist dies kein vollständiger UI-Erfolg.

### 12. Alte Logik

Ergebnis: Teilweise bestanden.

Bestanden:

- Registrierung erzeugte keine Campaigns
- Registrierung erzeugte keine Coupons
- Tages-PIN wurde serverseitig geprüft
- normale Punkteeinlösung nutzte keine Tages-PIN

Offen:

- Im aktiven Source-Code existieren weiterhin Demo-/Campaign-Module und Demo-Fallbacks. Der Live-Frontend-Befund `Kai Sushi` zeigt, dass Demo-/Fallback-Kontext im Browser weiterhin wirksam werden kann.

## Kritische Bugs

1. Live-Customer-Routen laden echten Slug im Browser nicht.
   - Flow: Customer QR, Registrierung
   - Persona: Gast
   - Befund: `/customer/:slug` und `/w/:slug` zeigen `Daten konnten gerade nicht geladen werden.`
   - Betroffene Stellen: Live-Frontend-Environment, `CustomerPortal`, `loyaltyService`, Supabase Client-Kontext

2. Restaurant Portal zeigt nach Login falschen Demo-/Tenant-Kontext.
   - Flow: Restaurant Portal
   - Persona: Restaurant Owner
   - Befund: `/admin/settings` enthält `Kai Sushi` statt Testrestaurant
   - Betroffene Stellen: `TenantProvider`, Auth-/Live-Environment-Konfiguration, Restaurant-Auswahl

3. Staff Portal öffnet nicht die Staff-Ansicht.
   - Flow: Staff Portal
   - Persona: Mitarbeiter / Restaurant Owner
   - Befund: `/staff/:slug` landet im Onboarding-Wizard
   - Betroffene Stellen: `RestaurantSetupGate`, `TenantProvider`, Staff-Routing

4. Willkommensgeschenk kann am selben Tag nach erster Punktebuchung eingelöst werden.
   - Flow: Willkommensgeschenk
   - Persona: Gast / Restaurant
   - Befund: `redeem_customer_reward` akzeptierte freigeschaltetes Willkommensgeschenk direkt am ersten Besuchstag
   - Betroffene Stellen: RPC `redeem_customer_reward`, Tabelle `customer_rewards`

## Mittlere Bugs

1. Staff-Statusmodell für normale Punkteeinlösungen ist nicht vollständig über UI validiert.
   - Normale Punkteeinlösungen laufen über `reward_redemption_events`, nicht als dauerhaft verbrauchte `customer_rewards`.
   - Das ist nach aktueller Bible korrekt, muss aber in der Staff-UI sauber dargestellt werden.

2. Responsive-Test konnte nur Fehlerzustände der Live-Customer-Route prüfen.
   - Kein horizontaler Scroll wurde gefunden, aber der echte Kundeninhalt wurde nicht geladen.

## Kleine Bugs

Keine kleinen Bugs isoliert. Die gefundenen Probleme sind flow-blockierend.

## Was wurde nicht geändert

- Keine Produktlogik geändert
- Keine UI geändert
- Keine Migration erstellt
- Keine RPC geändert
- Keine Datenbankstruktur geändert

## Build Ergebnis

`npm run build` erfolgreich.

## Migration

Keine Migration erstellt.

## RLS / Security

Teilweise geprüft:

- Fremder Owner konnte keine Kunden des Testrestaurants lesen.
- Fremder Owner konnte keine Rewards des Testrestaurants lesen.
- anon konnte Tages-PIN-Tabelle nicht direkt lesen.

Nicht final LOCK wegen Welcome-Gift-Same-Day-Redeem und Live-Frontend-Tenant-Blocker.

## Alte Logik geprüft

Teilweise.

Aktive Registrierung erzeugte keine Campaign-/Coupon-Daten. Die sichtbare Live-UI zeigte aber weiterhin Demo-/Tenant-Fallback-Verhalten.

## Offene Risiken

- Live-Worker-App scheint nicht zuverlässig mit echter Supabase-/Tenant-Konfiguration zu laufen.
- Neue Restaurant-Owner werden im Browser nicht stabil auf ihr eigenes Restaurant gebunden.
- Customer QR ist für echte Gäste aktuell nicht nutzbar.
- Staff Portal ist für den erzeugten Testkontext nicht erreichbar.
- Willkommensgeschenk-Einlösung muss serverseitig den nächsten Besuch erzwingen.

## Status

NOT READY
