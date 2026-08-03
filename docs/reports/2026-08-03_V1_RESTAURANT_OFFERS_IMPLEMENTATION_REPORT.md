# WUXUAI Bonus V1 – Aktuelles & Angebote

Datum: 2026-08-04  
Branch: `dev`  
Ausgangscommit: `f24eb7f195d9d196ade6997b638ed614e7741202`  
Status: **RESOLVED / ENGINEERING_BIBLE_UPDATED**

## Urspruenglicher Konflikt

Der aktuelle Auftrag definiert `Aktuelles & Angebote` als neues V1-Modul und
verlangt Owner-Verwaltung, Kundenflächen, Partnerlokal-Finder-Integration,
Analytics sowie ein additives Datenmodell.

Diese Entscheidung widerspricht der aktuell höherrangigen Engineering Bible:

- `AGENTS.md`, Abschnitt 9: Aktionen-Modul ist in V1 verboten.
- `docs/02_PRODUKTREGELN.md`: „Aktionen existieren in V1 nicht.“
- `docs/04_RESTAURANT_PORTAL.md`, Abschnitt 4.1: Das Modul Aktionen existiert in
  V1 nicht.
- `docs/04_RESTAURANT_PORTAL.md`, Abschnitt 14: Aktionen dürfen nicht wieder in
  V1 eingeführt werden.
- `docs/04_RESTAURANT_PORTAL.md`, LOCK-Kriterien: Aktionen müssen vollständig
  aus der UI entfernt sein.
- `docs/16_V2_MASTERPLAN.md`: Dynamische Promotionflächen sind V2 zugeordnet.

Nach `AGENTS.md` und `docs/18_CODEX_REGELN.md` gewann bei diesem Widerspruch die
Engineering Bible. Deshalb wurden in der damaligen Aufgabe keine Produkt-, UI-,
Service-, Datenbank-, RLS- oder Routingaenderungen vorgenommen.

## Aufloesung vom 2026-08-04

Die ausdrueckliche Produktentscheidung vom 2026-08-04 grenzt das neue Modul
fachlich von der weiterhin verbotenen Kampagnenarchitektur ab:

- `Aktuelles & Angebote` ist ein reines Informationsmodul in V1.
- Rewards, Punkte, Geschenke, Codes, Coupons und Einloesungen bleiben strikt
  getrennt.
- Pro Restaurant sind maximal fuenf gleichzeitig veroeffentlichte Beitraege
  erlaubt.
- V1-Auswertungen bleiben personenbezugsfrei und aggregiert.
- Marketingautomation, Push, Segmentierung, Personalisierung und Attribution
  bleiben V2.
- Die rechtliche Pruefung der Restaurantinhalte bleibt vor Production Pflicht.

Der Konflikt ist damit auf Dokumentationsebene aufgeloest. Die
Produktimplementierung ist nicht Bestandteil dieser Aktualisierung.

## Bestandsaudit

### Owner-Navigation

Die aktuelle Owner-Navigation enthält Dashboard, Punkteeinlösung,
Willkommensgeschenke, Gäste, QR Center, Mitarbeiter, Berichte und Einstellungen.
Ein Angebotsbereich existiert nicht.

### Historische Kampagnenarchitektur

Es existieren ältere Tabellen und Services für `campaigns`, `campaign_events`
und `campaign_customer_offers`. Diese Architektur ist fachlich nicht für den
neuen Auftrag geeignet:

- Kampagnen sind mit Reward oder Coupon verbunden.
- Kundenangebote verlangen `offer_source` mit `reward` oder `coupon`.
- Öffentliche Kampagnen können Starter-Rewards beziehungsweise Coupons ausgeben.
- Ereignisse bilden Scan, Registrierung und Starter-Reward ab.

Eine Wiederverwendung würde die geforderte strikte Trennung von Information,
Rewards, Geschenken, Punkten und Einlösungen verletzen. Eine parallele zweite
Kampagnenarchitektur darf ohne geklärte Produktentscheidung ebenfalls nicht
gebaut werden.

### Bild-Upload

Der bestehende Bucket `restaurant-media`, die tenantbezogenen Storage-Policies,
`OwnerRewardImageUploader` und `ownerRewardImageService` könnten technisch
wiederverwendet beziehungsweise eng erweitert werden. Es wurde nichts geändert.

### Kundenportal und Partnerlokal-Finder

Beide Oberflächen haben derzeit keine freigegebene V1-Angebotsquelle. Die
Finder-RPCs liefern begrenzte Partnerlokal-, Punkte- und Rewardinformationen.
Eine Angebotsintegration würde den öffentlichen Datenvertrag und die
Priorisierungslogik erweitern und benötigt eine explizit freigegebene V1-Bible.

### RLS und Tenant-Isolation

Eine spätere sichere Umsetzung bräuchte ein getrenntes, additives Objekt mit:

- tenantgebundenen Owner/Admin-Schreib-RPCs,
- Staff-Verbot,
- minimalem öffentlichen Read-RPC,
- serverseitiger Europe/Vienna-Gültigkeitsprüfung,
- unveränderter Reward-/Punkte-/Redemption-Logik,
- PII-freien Analytics-Ereignissen.

Diese Architektur wurde nur analysiert, nicht implementiert.

## Verbindliche Entscheidung

Die Entscheidung ist in
`docs/product/DECISION_2026-08-04_V1_RESTAURANT_OFFERS_MODULE.md` mit Status
`LOCKED` festgehalten. Die aktiven V1-Regeln wurden so eingegrenzt, dass das
generische Aktionen-/Kampagnenverbot bestehen bleibt und das klar begrenzte
Informationsmodul nicht mehr blockiert.

## Geaenderte Dokumentation

- `AGENTS.md`
- aktive Engineering-Bible-Dateien fuer Produkt, Owner-Portal, Kundenportal,
  Gast-Flow, V2-Abgrenzung, CTO-Entscheidungen und Codex-Regeln
- Legal-Review-Pruefliste
- Decision Record fuer das V1-Modul
- Changelog
- dieser Konflikt- und Bestandsauditbericht

## Nicht geändert

- Owner-Navigation und Owner-Seiten
- CustomerPortal
- PartnerRestaurantFinderPage
- Kampagnen-, Reward-, Punkte- und Redemption-Logik
- Datenbank, Migrationen, RLS und Grants
- Bild-Upload
- Analytics
- Produktcode und Laufzeitverhalten

## Prüfung

- `git diff --check`: erfolgreich
- Build (`npm run build`): erfolgreich
- Migration: keine erstellt oder angewendet
- Staging: nicht veraendert
- RLS und Security: nicht veraendert; die spaetere Implementierung muss den
  dokumentierten minimalen Public-Read-Vertrag und die Tenant-Isolation separat
  nachweisen
- Produkt-Flow-Test: nicht anwendbar, da dieser Auftrag ausdruecklich keine
  Laufzeitimplementierung enthaelt

## Risiken

Die spaetere Implementierung muss die dokumentierte Trennung technisch
erzwingen. Besonders zu pruefen sind Tenant-Isolation, die Grenze von fuenf
veroeffentlichten Beitraegen, der minimale oeffentliche Datenvertrag,
personenbezugsfreie Analytics und die vollstaendige Entkopplung von der alten
rewardgebundenen Kampagnenarchitektur. Die rechtliche Production-Freigabe ist
weiter offen.

## Status

**ENGINEERING_BIBLE_UPDATED / READY_FOR_OFFERS_IMPLEMENTATION**
