# PHASE 7C.1 – PRO-/BASIC-/CAPACITY-IST-AUDIT UND IMPLEMENTIERUNGSPLAN

Datum: 2026-09-21
Branch: `codex/v1-release-integration`
Audit-HEAD / Remote: `f28a15495ffbbe9788513eba6c84a74f4e743080`
Referenziertes aktives Staging-Deployment: `a56d9dba-7b37-4c7c-974e-156d7a1f11f8`
Modus: read-only Produkt-/Schema-/Code-/Test-/Dokumentationsaudit; nur dieser Bericht und das Prüf-ZIP wurden neu erzeugt.

## 1. Ergebnis

Das vorhandene System besitzt eine belastbare, serverseitige Grundlage für Planauflösung, Commercial Country Lock, Subscription-Lifecycle, zeitlich begrenzte Pilot-/TEST_ONLY-Zugänge, zwei Notification-Entitlements und ein parallelitätssicheres Angebotslimit. Es besitzt jedoch **noch keinen Capacity-Vertrag gemäß Phase 7C.1**.

Die wesentlichen Abweichungen zum neuen Founder-Vertrag sind:

1. PRO ist in `commercial_plan_catalog` weiterhin als `offer_limit = NULL` und damit als unbegrenzt modelliert.
2. Die historische Migration setzt PRO auf 99 EUR; der aktuelle Founder-Vertrag verlangt 149 EUR. Es gibt noch keine spätere Migration, die den Katalogwert korrigiert.
3. Das Datenmodell begrenzt numerische Angebotslimits und Overrides auf 1 bis 7. PRO 15 und Add-on-Grenzen 20/25/... sind nicht darstellbar.
4. Customer Capacity, rollierende 12-Monats-Nutzung und Customer-Add-on-Einheiten existieren nicht.
5. Es gibt keine Billing-/Entitlement-Quelle für aktive Offer- oder Customer-Add-ons.
6. Der Owner zeigt nur Angebotsnutzung an; Customer Capacity, Add-ons, Over-Limit und Warnungen fehlen.
7. Der aktuelle Offer-Usage-Read und das DB-Enforcement verwenden nicht exakt dieselbe Zählregel für geplante Angebote.
8. Die alte Platform-Plan-Override-UI zeigt weiterhin Unlimited und bietet eine PRO-Aktivierung an. Der v5-Resolver akzeptiert einen Plan-Override nicht mehr als eigenständige effektive PRO-Quelle. Diese Oberfläche ist daher teilweise veraltet.
9. Catalog und Bonus-Aktivitätsberichte sind aktuell keine PRO-Features: Catalog ist ein separates künftiges Add-on; bestehende Berichte sind rollen-, nicht planbasiert geschützt.

Folge: **Phase 7C.1 Audit vollständig, Implementierung noch nicht freigegeben und fachlich noch nicht entscheidungsreif.** AT + PRO bleibt LOCKED.

Die fokussierten statischen Bestandsprüfungen liefen `41/41 PASS`. Dieses PASS bestätigt den heutigen Codevertrag, nicht den neuen Capacity-Vertrag: Mehrere Tests verlangen ausdrücklich weiterhin `NULL = unlimited`, Overrides 1–7 und „PRO unlimited“ und müssen in der Implementierungsphase ersetzt werden.

## 2. Quellen und Priorität

Geprüft wurden insbesondere:

- `AGENTS.md`, Guardrails und Canonical Product Contract;
- Austria Launch Master Contract, wobei dessen ältere 99-EUR-/Unlimited-Abschnitte durch den späteren Canonical Founder Contract superseded sind;
- Datenbank-, RPC-, Security- und Stripe-Plan;
- Migrationen `20260905004000`, `20260910001000`, `20260910002000`, `20260911001000` bis `20260911007000` sowie `20260915001000` bis `20260915003000`;
- Owner-, Platform-Admin- und Offer-Komponenten;
- PRO-, Commercial-Lock-, Subscription-, Override- und Offer-Tests;
- Customer-, Membership-, Points-, Redemption- und Activity-Tabellen.

Historische Reports und doppelte `* 2.md`-Dateien wurden nur als Evidenz behandelt.

## 3. Ist-Datenfluss und Planpriorität

### 3.1 Gespeicherte Quellen

| Quelle | Ist-Zweck | Autorität |
| --- | --- | --- |
| `commercial_plan_catalog` | BASIC/PRO/PREMIUM, Preis, Offer-Limit, zwei Notification-Flags | serverseitiger Plan-Katalog |
| `branch_subscriptions` | gespeicherter Plan, Status, Payment-Status, Trial, Periodenende, Stripe-Referenzen | server-owned; Browser-DML entzogen |
| `branch_entitlement_overrides` | historischer Plan-/Feature-Override mit Zeitfenster | privat, triggergeschützt |
| `restaurant_entitlement_safety_blocks` | fail-closed globale/tenantbezogene Sperren | serverseitige Obergrenze |
| `commercial_plan_release_policy` | Land + PRO = LOCKED/RELEASED | private Release-Autorität |
| `commercial_pro_access_grants` | echter Pilot oder INTERNAL_TEST_ONLY | zeitlich begrenzt, tenantgebunden |
| `platform_test_tenant_registry` | exakte TEST_ONLY-Identität | Voraussetzung für Pre-Release-Ausnahme |
| `platform_admin_operations` / Commercial Audit | unveränderbare Vorgangs- und Idempotenzbelege | Audit, keine Entitlement-Quelle |

### 3.2 Effektive Priorität des v5-Resolvers

```text
1. Restaurant/Primary Branch/Organization serverseitig auflösen
2. PRO-Länderpolicy fail-closed auflösen
3. Subscription-Lifecycle aus gespeicherten Zuständen berechnen
4. Pilot- und TEST_ONLY-Zeitfenster prüfen
5. Safety Blocks anwenden
6. Effektives PRO nur wenn:
   INTERNAL_TEST_ONLY
   ODER (Land RELEASED UND (gültige PRO-Subscription/Trial ODER echter Pilot))
7. Sonst BASIC
8. Feature-Overrides nur innerhalb eines wirksamen PRO-Vertrags anwenden
9. Bei fehlender PRO-Berechtigung Offer-Limit auf BASIC klemmen und Notifications ausschalten
```

Die Commercial-Policy sperrt Subscription, Trial, URL, Locale, Frontendzustand und alte Overrides. TEST_ONLY ist die einzige bewusst definierte Ausnahme vom Country Lock und verlangt den exakten aktiven Registry-Marker.

### 3.3 Subscription-Lifecycle

| Zustand | Aktuell eligible | Wirkung |
| --- | --- | --- |
| `active` + `paid/manual` + zukünftiges Periodenende | ja | bezahlter Plan bis Periodenende |
| `trialing` + `not_required` + gültiges Trial-Ende | ja | Trial bis Trial-Ende |
| `past_due` + `pending/failed` | maximal 7 Tage | Grace Period; danach BASIC |
| `cancelled` + bezahlt/manuell + zukünftiges Periodenende | ja | Restlaufzeit bleibt wirksam |
| `unpaid`, `paused`, unbekannt, abgelaufen | nein | BASIC-Fallback |
| PREMIUM | nein | explizit nicht freigegeben |

Payment-Status und Perioden sind vorbereitet, aber Stripe ist nicht integriert. Es gibt keine Webhook-Eventtabelle, keine Subscription-Item-Synchronisierung und keine belastbare Add-on-Billing-Quelle.

### 3.4 Admin-/Feature-Override-Befund

- Direkte Browser-DML ist gesperrt; RPCs verlangen Rolle, Grund, Bestätigung und Request-ID.
- PRO-erhöhende Writes werden bei geschlossenem Country Lock durch Trigger blockiert.
- Die alte `PlatformPlanEntitlementsPanel`-UI kann weiterhin „PRO aktivieren“ und „Unbegrenzt“ darstellen.
- Im aktuellen v5-Resolver ist ein Plan-Override allein keine effektive PRO-Quelle mehr. Der UI-/RPC-Pfad kann daher bei später RELEASED Land einen gespeicherten Override erzeugen, ohne dass dieser allein PRO wirksam macht.
- Feature-Overrides sind ebenfalls keine eigenständige PRO-Berechtigung; außerhalb effektiven PRO werden sie auf BASIC geklemmt.

Status: Sicherheit fail-closed, aber Oberfläche und semantischer Override-Vertrag **teilweise veraltet**.

## 4. PRO-Funktionsinventar

| Funktion | BASIC heute | PRO heute | Server-/RPC-Guard | UI-Guard | Country Gate | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Angebotskapazität | 5 | `NULL = unlimited` | Trigger auf `restaurant_offers`, Advisory Lock, Resolver | Zähler vorhanden | ja | vorhanden | teilweise; neuer Vertrag fehlt |
| Customer Capacity | unbegrenzt/ungezählt | unbegrenzt/ungezählt | keiner | keine Anzeige | nein | keine | fehlt |
| Offer Notifications | aus | an | `restaurant_entitlement_enabled`; enqueue nur bei aktivem Flag | Consent-/Providerstatus sichtbar | ja | vorhanden | technisch vorhanden, Versandprovider nicht aktiv |
| Reward-Reached Notifications | aus | an | serverseitiger Threshold-Trigger + Entitlement | keine vollständige Plansteuerung im Owner | ja | vorhanden | technisch vorhanden, Versandprovider nicht aktiv |
| Catalog/Speisekarte | kein Capacity-Vertrag | nicht Bestandteil von PRO | kein PRO-Entitlement | kein PRO-Guard | nein | keine PRO-Matrix | korrekt separat/deferred |
| Bonus-Aktivitätsberichte | verfügbar für Owner/Admin | identisch | Rollen-/Tenant-RPC, kein Planguard | Rollen-Guard | nein | Rollen-/Reporttests | Basic-Funktion, nicht PRO |
| Marketing-/Kundenanalyse, Wochen-/Monats-/Jahresdiagramme | nicht als PRO-Vertrag | nicht vollständig vorhanden | keiner | keine vollständige PRO-Fläche | nein | keine | fehlt/teilweise historische Reports |
| Bonus Boost/Empfehlungen | bestehende Kernfunktion | keine belegte PRO-Differenz | bestehende Business-RPCs, kein PRO-Guard | kein PRO-Guard | nein | Flowtests | aktuell Basic/Kernfunktion |
| echter Pilot | kein PRO | PRO nur bei RELEASED Land | Commercial RPC, Recent Auth, Audit, Zeitfenster | Control Center | ja | vollständig | vollständig |
| INTERNAL_TEST_ONLY | kein PRO | PRO mit exaktem Marker | Registry + Commercial RPC + Audit | getrennte Control-Center-Fläche | bewusste Ausnahme | vollständig | vollständig |

Klassifikation: **10 Funktionen geprüft; 2 vollständig, 3 teilweise, 3 fehlend, 2 bewusst nicht PRO.**

## 5. Unlimited-Inventar

### 5.1 Zwingend zu entfernen oder zu migrieren

1. `commercial_plan_catalog.PRO.offer_limit = NULL` in Migration `20260905004000` – echte Produktlogik.
2. `offer_limit_unlimited` in `branch_entitlement_overrides` – echte Produktlogik und Altvertrag.
3. `NULL`-Interpretation als Unlimited in Resolvern `20260905004000`, `20260910001000`, `20260911001000`, `20260915001000` – echte Produktlogik.
4. PRO-/Override-Schreibpfade für `offer_limit_unlimited` – echte Produktlogik.
5. Owner Offer UI „Unbegrenzt“ in `RestaurantOffersPage.tsx` – sichtbare Produktbehauptung.
6. Platform Admin „Unbegrenzt/Unlimited/...“ in `PlatformPlanEntitlementsPanel.tsx` und `planOverrideMessages.mjs` – sichtbare Produktbehauptung in sieben Sprachen.
7. Generierter i18n-Katalog für diese Claims – abgeleitete Übersetzungen.
8. Tests, die `NULL = unlimited` und PRO unlimited ausdrücklich verlangen – veraltete Vertragsfixtures.

### 5.2 Historisch oder nur als Beleg zu markieren

- Canonical-/Master-/Admin-/DB-/RPC-Dokumente enthalten ältere Unlimited-Verträge und spätere Superseded-Hinweise. Sie müssen bei der Implementierung konsistent bereinigt bzw. klar historisiert werden.
- Historische Migrationen werden nicht umgeschrieben; eine neue additive Migration ersetzt den wirksamen Zustand.

### 5.3 Ungefährliche technische Treffer

- `Number.POSITIVE_INFINITY` in Sortier-/Fallbacklogik für fehlende Entfernung, Reward-Distanz, Ablauf oder PDF-Zeilen.
- PostgreSQL `-infinity` als interner Zeitstempel-Fallback in Legal-Readiness-Berechnungen.
- `infinity` in Negativtests, die unendliche Override-Enden ausdrücklich ablehnen.

Diese Werte sind keine kommerziellen Unlimited-Claims.

## 6. Angebotskapazität

### 6.1 Welche Objekte zählen heute?

Nur `restaurant_offers`. Rewards, Welcome Gifts, Birthday Gifts, Customer Rewards, Coupon-/Einlösungsobjekte zählen nicht.

Der Trigger prüft bei `status = PUBLISHED`, `is_active = true` und `valid_to > now()` die maximale Anzahl zeitlich überlappender veröffentlichter Angebote. Er serialisiert pro Restaurant mit Advisory Lock. Entwürfe, deaktivierte, archivierte und abgelaufene Angebote zählen nicht. Duplikate zählen erst nach Veröffentlichung/Aktivierung; die Kopie entsteht als Entwurf.

Geplante veröffentlichte Angebote reservieren heute Kapazität in ihrem Überschneidungszeitraum. Dadurch kann paralleles Publizieren oder eine Direktmutation die Grenze nicht umgehen.

### 6.2 Inkonsistenz

`get_restaurant_entitlements.active_offer_count` zählt alle veröffentlichten, aktiven Angebote mit `valid_to > now()`, prüft aber `valid_from <= now()` nicht. Damit kann die Owner-Anzeige zukünftige Angebote als aktuell aktiv zählen, während das Enforcement die maximale zeitliche Überschneidung bewertet.

### 6.3 Empfohlener kanonischer Vertrag

- Capacity-Einheit: gleichzeitig veröffentlichte und aktive `restaurant_offers` je Restaurant.
- Enforcement: maximale Intervallüberschneidung `[valid_from, valid_to)` beibehalten; Publish/Reaktivierung/Terminänderung atomar und advisory-locked prüfen.
- Usage-Anzeige: `current_offer_usage` nur `valid_from <= now() < valid_to`; zusätzlich `scheduled_offer_count` separat anzeigen.
- Entwürfe, deaktivierte, archivierte und abgelaufene Angebote zählen nicht.
- Keine automatische Deaktivierung bei Downgrade; nur weitere kapazitätssteigernde Aktionen sperren.

**Founder-Entscheidung erforderlich:** Soll ein geplantes veröffentlichtes Angebot Kapazität für seinen zukünftigen Zeitraum reservieren? Empfehlung: Ja, weil dies dem bestehenden parallelitätssicheren DB-Vertrag entspricht und ein planbares Überbuchen verhindert.

## 7. Customer Capacity

### 7.1 Vorhandene Daten

- `customers`: restaurantbezogene Mitgliedschaft/Identität mit `created_at` und Membership-Status.
- `customer_accounts` + `customer_account_memberships`: optional verknüpftes zentrales Konto, `linked_at`, `last_opened_at`, `last_seen_at`.
- `points_transactions`: serverbestätigte Punkteaktionen mit Tenant, Customer und Zeit.
- `reward_redemption_events` sowie kanonisches `redemption_activity_journal`: bestätigte Einlösungen und Geschenktypen.
- Welcome-/Birthday-Zuweisungen und Präsentationen: Zuweisung allein ist keine sichere aktive Kundenhandlung.
- Portalöffnungen/`last_opened_at`: leicht durch wiederholte Reads beeinflussbar und kein belastbarer wirtschaftlicher Aktivitätsnachweis.

### 7.2 Bewertung möglicher Definitionen

| Definition | zuverlässig/manipulationssicher | rückwirkend | Datenschutz/Performance | Bewertung |
| --- | --- | --- | --- | --- |
| Registrierung oder `customers.created_at` | mittel; Self-Service/Spam möglich | ja | einfach | Alternative, aber nicht echte Aktivität |
| aktive Membership oder Account-Link | mittel; Status ist Zustand, nicht Nutzung | ja | einfach | Alternative, kann dauerhaft zählen |
| Portalöffnung/`last_opened_at` | niedrig | teilweise | Tracking-/Manipulationsrisiko | nicht empfohlen |
| bestätigte Punktebuchung | hoch; serverseitig, tenantgebunden, auditiert | ja | gut indexierbar | empfohlen |
| bestätigte Einlösung | hoch; serverseitig, tenantgebunden, auditiert | ja | gut indexierbar | empfohlen |
| Welcome-/Birthday-Zuweisung | niedrig bis mittel; systemgeneriert | ja | gut | nicht als Aktivität; erst Einlösung zählt |

### 7.3 Bevorzugte Definition

Pro Restaurant wird ein `customer_id` genau einmal gezählt, wenn innerhalb des halboffenen rollierenden Fensters `[as_of - 12 Monate, as_of)` mindestens eine serverseitig bestätigte Punktegutschrift oder eine abgeschlossene, nicht stornierte Einlösung existiert. Zuweisungen, Portalreads, fehlgeschlagene Vorgänge und Testevents zählen nicht. Einlöser werden primär aus dem kanonischen Activity Journal genommen; Punkte aus den autoritativen Points Transactions. Die Abfrage bildet eine `UNION` der Customer-IDs und zählt `DISTINCT`.

Vorteile: tenantisoliert, auditierbar, rückwirkend berechenbar, wenig manipulierbar und datenschutzarm, weil Capacity nur UUID/Aggregat benötigt. Offene Punkte: Legacy-Zeilen ohne Customer-ID und historische Testdaten müssen vor einer harten Durchsetzung quantifiziert werden.

### 7.4 Alternativen für Founder

1. **Membership-Modell:** Jede nicht beendete Restaurant-Membership zählt, sobald sie innerhalb der letzten 12 Monate erstellt oder geöffnet wurde. Einfacher, aber stärker manipulierbar.
2. **Breites Interaktionsmodell:** Registrierung, bestätigte Punkte, bestätigte Einlösung oder explizit authentifizierte Portalnutzung zählt. Produktnäher, aber Tracking-, Consent- und Manipulationsrisiko höher.

**Founder-Entscheidung erforderlich:** Bevorzugte Definition bestätigen oder Alternative wählen. Vorher darf kein Customer-Limit implementiert werden.

## 8. Zielarchitektur der zentralen Capacity-Schicht

Keine verteilten `if BASIC/PRO`-Zweige. Empfohlener Vertrag:

```text
plan_capacity_rules
  plan_key + metric_key -> base_limit, unit_size, version, effective window

commercial_addon_catalog
  addon_key -> metric_key, unit_size, price contract, billing lookup metadata

branch_capacity_entitlements
  subscription_id + addon_key -> units, lifecycle, source, effective window,
  external item/event references, request id

resolve_restaurant_capacity_internal(restaurant_id, as_of)
  -> base_offer_limit
  -> base_customer_limit
  -> offer_addon_units
  -> customer_addon_units
  -> effective_offer_limit
  -> effective_customer_limit
  -> current_offer_usage
  -> current_customer_usage
  -> over_limit_state
  -> entitlement_source/effective_from/effective_until
  -> billing_status/country_release_status
```

Verbindliche Berechnung:

```text
effective_offer_limit = base_offer_limit + active_offer_addon_units * 5
effective_customer_limit = base_customer_limit + active_customer_addon_units * 5000
```

Basiswerte: BASIC 5/3.000, PRO 15/15.000. Add-on-Einheiten zählen nur bei aktivem, serververifiziertem Billing-/Entitlement-Lifecycle. Resolverfehler, unbekannter Status, fehlende Bindung oder Country Lock fallen geschlossen zurück und aktivieren keine zusätzliche Kapazität.

Der bestehende Entitlement-Resolver sollte Plan-/Release-/Pilot-Provenienz liefern. Ein zentraler Capacity-Resolver konsumiert diesen Output, statt ihn zu duplizieren. Spätere Enterprise-Regeln entstehen als Datenzeilen/versionierte Regeln, nicht als Sonderzweige.

## 9. Add-on-Lifecycle-Zielvertrag

- Bestellung erzeugt noch keine Kapazität; erst serverbestätigter aktiver Entitlement-Zustand.
- Mehrere Einheiten sind positive Integer; negative oder implizit unbegrenzte Werte verboten.
- Globale Provider-Event-ID und normalisierter Payload-Fingerprint sichern Idempotenz.
- Doppelte Events liefern denselben Receipt; gleicher Key mit anderem Payload wird abgewiesen.
- Out-of-order Events werden über Provider-Eventzeit, Subscription-Item-Version und monotone Revision ignoriert oder in Review gestellt.
- Upgrade aktiviert erst nach bestätigtem Status/effective_at.
- Downgrade/Kündigung zum Periodenende bleibt bis `effective_until` aktiv.
- Sofortige Beendigung setzt ein serverseitiges Endfenster; Daten bleiben erhalten.
- Payment Failure folgt expliziter Grace-Policy; nach Ablauf fällt nur Zusatzkapazität weg.
- Reaktivierung ist eine neue monotone Revision, keine Wiederverwendung alter Events.
- Plan- und Add-on-Wechsel werden unter demselben tenantbezogenen Advisory/Row Lock atomar neu aufgelöst.
- Refund/Chargeback erzeugt keinen Datenlöschvorgang; Billing-Status und Review-/Grace-Entscheidung bestimmen nur zukünftige Kapazität.

Aktuell fehlt diese gesamte Subscription-Item-/Webhook-Schicht. Der Stripe-Plan enthält nur konzeptionelle Felder und Events.

## 10. Over-Limit-Vertrag

### Angebote

- Bestehende Angebote nie löschen oder automatisch deaktivieren.
- Ist `current/reserved usage >= limit`, Publish, Reaktivierung oder kapazitätssteigernde Terminänderung serverseitig blockieren.
- Bearbeitung ohne zusätzliche Kapazität bleibt möglich.
- Bei Downgrade über Limit bleiben Bestandsangebote sichtbar; neue Aktivierung erst nach Deaktivierung/Ablauf oder Kapazitätserhöhung.
- DB-Trigger/RPC müssen denselben tenantbezogenen Lock verwenden.

### Kunden

- Keine Konten, Punkte, Memberships, Ledger oder historische Einlösungen löschen oder sperren.
- Bestehende Kunden behalten Zugriff und können vorhandene Punkte/Benefits verwenden.
- Nur die Aktion, die nach bestätigter Founder-Definition einen **neuen kapazitätszählenden Kunden** erzeugt, darf bei erreichtem Limit blockiert werden.
- Bereits gezählte Kundeninteraktionen bleiben erlaubt.
- Atomare Prüfung muss unmittelbar vor der ersten zählenden Aktivität erfolgen; UI-Vorprüfung allein reicht nicht.

**Founder-Entscheidung erforderlich:** Welche erste Aktion wird bei Customer Capacity blockiert – Registrierung, erste bestätigte Punktebuchung oder eine andere bestätigte Interaktion? Empfehlung entsprechend bevorzugter Definition: nicht Registrierung, sondern die erste bestätigte zählende Interaktion; hierfür ist ein klarer Customer-UX-Vertrag nötig.

## 11. Warnungsvertrag

Der Bestand besitzt keine belastbare Sieben-Tage-Prognose, keine täglichen Capacity-Snapshots und keine Owner-Capacity-Notification-Deduplizierung. Eine seriöse Prognose ist daher heute nicht möglich.

Empfohlener zweistufiger Vertrag:

1. Sofort belastbare feste Schwellen: 80 %, 90 %, 100 % und Over-Limit; idempotent je Metric, Schwelle, Entitlement-Revision und Warnfenster.
2. Sieben-Tage-Prognose erst nach ausreichend täglichen Snapshots, definierter Mindesthistorie und Founder-Freigabe eines transparenten Modells. Keine Prognose bei zu wenig Daten oder nichtpositivem Trend.

App-Warnungen können als serverseitige Owner-Notification mit Deep Link gespeichert werden. E-Mail muss als transaktionale Kapazitäts-/Vertragsinformation rechtlich geprüft, dedupliziert, rate-limitiert, mehrsprachig und auditiert sein. Downgrade/Add-on-Ende erhält zusätzlich Vorwarnungen relativ zu `effective_until`.

**Founder-Entscheidung erforderlich:** feste Schwellen bestätigen; Mindesthistorie und Prognosemodell separat entscheiden. „Sieben Tage“ allein reicht technisch nicht als Formel.

## 12. Owner-UI-Impact

Erforderliche zentrale Capacity-Fläche:

- aktueller effektiver Tarif und Provenienz;
- Basislimit Angebote/Kunden;
- aktive Add-on-Einheiten und Zusatzkapazität;
- Gesamtkapazität, aktuelle Nutzung, verbleibend;
- Over-Limit und nächste zulässige Aktion;
- Billing-/Payment-/Grace-Status ohne technische Rohwerte;
- Kündigungs-/Ablaufdatum;
- feste Schwellen- und spätere Prognosewarnungen;
- klare, nicht täuschende Upgrade-/Add-on-Hinweise erst bei freigegebenem Kaufpfad.

Der vorhandene Offer-Zähler kann als Verbraucher des neuen Resolvers erhalten bleiben, muss aber Unlimited entfernen und `current` versus `scheduled/reserved` sauber benennen. Eine Customer-Capacity-Fläche existiert nicht.

## 13. Legal-/Preisimpact

Später anzupassen und juristisch zu prüfen:

- B2B-SaaS-AGB und Leistungsbeschreibung;
- Preisübersicht/Marketingcopy;
- Checkout-Zusammenfassung und Vertragsbestätigung;
- Rechnung/Subscription-Item-Beschreibung;
- Kündigungs-, Downgrade-, Grace- und Over-Limit-Hinweise;
- Datenschutzinformation zur rollierenden Aktivitätsmessung und Warn-E-Mail;
- Länder-Legal-Packs und lokalisierte Vertragsfassungen.

Der Code zeigt derzeit nur Basic 59 EUR zentral. PRO 149 EUR und beide Add-on-Preise sind noch nicht in Checkout, Rechnung oder Billing integriert. Keine juristische oder steuerliche Freigabe wird behauptet.

## 14. Sicherheit und Isolation

Zu bewahren/erweitern:

- Capacity-Tabellen mit RLS und ohne Browser-DML;
- resolverinterne Funktionen ohne Public/anon/authenticated EXECUTE;
- schmale authenticated RPCs mit serverseitiger Owner-/Platform-Rollen- und Tenantprüfung;
- Organization, Restaurant und Primary Branch müssen konsistent gebunden sein;
- Country Commercial Lock bleibt zwingende Obergrenze für PRO und PRO-basierte Add-ons;
- TEST_ONLY bleibt getrennt und darf keine reale Billingkapazität vortäuschen;
- Add-on-Events brauchen globale Idempotenz, monotone Revisionen, Row/Advisory Locks und Audit;
- Direct DML, parallele Requests, URL, Locale, UI-State, Trial oder gespeicherter Stripe-String dürfen kein Limit erhöhen;
- anonyme/Customer/Staff-Rollen erhalten nur das für ihren Flow erforderliche Ergebnis, keine Billing- oder Tenant-Metadaten.

## 15. Migrations- und Implementierungsplan

### 7C.2 – zentrale Capacity-Daten-/RPC-Schicht lokal

1. Founder-Entscheidungen schließen.
2. Additive Migration für versionierte Plan-Capacity-Regeln und Add-on-Entitlements.
3. PRO-Preis 149 und numerisches PRO-Offer-Limit 15 additiv korrigieren; historische Migration unverändert lassen.
4. Unlimited-Spalten nur kompatibel lesen, aber keine neue Unlimited-Aktivierung zulassen; kontrollierter späterer Abbau.
5. zentralen read-only Capacity-Resolver mit vollständiger Provenienz bauen.
6. Customer-Usage-Abfrage/Indexierung anhand freigegebener Definition; Legacy-/Testdaten-Preflight.
7. RLS, Grants, Tenant-, Rollen-, Country-, Lifecycle-, Idempotenz- und Parallelitätstests.

### 7C.3 – Offer Capacity Enforcement

1. Trigger und Offer-RPC auf denselben zentralen Resolver umstellen.
2. Current/Scheduled/Reserved-Zählung konsistent machen.
3. Testmatrix 5/6, 10/11, 15/16, 25/26; Parallelpublizierung und Direct DML.
4. Downgrade/Over-Limit ohne Deaktivierung oder Löschung.

### 7C.4 – Customer Capacity Enforcement

1. freigegebene Aktivitätsdefinition implementieren.
2. erste kapazitätssteigernde Aktion atomar schützen.
3. 3.000/3.001, 8.000/8.001, 15.000/15.001, 25.000/25.001 testen.
4. bestehende Kunden, Punkte, Einlösungen und Ledger im Over-Limit weiterhin nutzbar.

### 7C.5 – Owner Capacity UI und Warnungen

1. gemeinsame Capacity-Karte und präzise Statuscopy in sieben Sprachen.
2. feste Schwellenwarnungen, Deduplizierung, Audit und Rate Limit.
3. E-Mail erst nach Legal-/Providerfreigabe; Prognose erst nach belastbarer Historie.
4. 320/375/390/430/767/768/Desktop und Chrome/Safari/WebKit.

### 7C.6 – Staging Gate und physische QA

Fresh-/Upgrade-/Repeat-Replay, DB-Lint, RLS/RPC/Direct-DML/Cross-Tenant/Parallelität, vollständige Matrix, echte read-only Usage-Parität, sieben Sprachen, responsive UI, Full Tests, Typecheck, Lint, Build, Secret Scan und unveränderte Businessdaten. Stripe Sandbox folgt erst danach mit separater Freigabe.

## 16. Verbindliche spätere Testmatrix

- BASIC Offers: 5 erlaubt, 6 blockiert.
- BASIC +1 Offer Add-on: 10 erlaubt, 11 blockiert.
- PRO Offers: 15 erlaubt, 16 blockiert.
- PRO +2 Offer Add-ons: 25 erlaubt, 26 blockiert.
- BASIC Customers: 3.000 erlaubt; erster neuer zählender Kunde über Limit blockiert.
- BASIC +1 Customer Add-on: 8.000.
- PRO Customers: 15.000.
- PRO +2 Customer Add-ons: 25.000.
- Basic→Pro, Pro→Basic, Add-on-Ablauf, Payment Failure/Grace, Kündigung zum Periodenende und sofortige Beendigung.
- Over-Limit ohne Löschung/Deaktivierung; vorhandene Customer-Flows bleiben nutzbar.
- doppelte, verspätete und out-of-order Billingevents.
- parallele Offer- und Customer-Erstaktivitäten.
- Tenant-/Organization-/Branch-Isolation; Owner, Staff, Customer, anon und Platform-Rollen.
- Country Gate, Pilot, TEST_ONLY, sieben Sprachen und responsive UI.

## 17. Founder-Entscheidungsliste

**Status 2026-09-21: Entscheidungen 1–8 durch den Founder bestaetigt.** Der
vollstaendige verbindliche Vertrag steht im Abschnitt `Founder Phase 7C
Basic-/Pro-/Capacity-Vertrag` des kanonischen Produktvertrags. Die nachfolgende
Liste bleibt als Auditspur erhalten und ist nicht mehr offen.

1. Customer-Aktivitätsdefinition: bevorzugtes bestätigtes Interaktionsmodell oder Alternative.
2. Exakte erste blockierte Customer-Aktion bei erreichtem Limit.
3. Geplante veröffentlichte Angebote reservieren zukünftige Kapazität: empfohlen Ja.
4. Feste Warnschwellen 80/90/100 % bestätigen.
5. Mindesthistorie und Formel für eine spätere Sieben-Tage-Prognose.
6. Payment-Failure-/Chargeback-Verhalten der Add-ons nach eventueller Grace Period.
7. Umgang mit bestehenden Unlimited-Overrides beim späteren Country Release: auf numerisches PRO-/Add-on-Limit migrieren oder vor Freigabe einzeln bereinigen; keine automatische unbegrenzte Fortgeltung.
8. Veralteten Platform-Plan-Override-Pfad entfernen, nur zur Beendigung behalten oder in den Commercial-Pilotvertrag integrieren.

## 18. Nicht geändert

- kein Produktcode;
- keine bestehende Migration;
- keine Datenbank oder Staging-Daten;
- keine Policy, kein Grant, kein TEST_ONLY-Marker;
- keine Stripe-Konfiguration, Produkte, Preise oder Webhooks;
- kein Deployment und keine Production-Ressource.

## 19. Abschlussmatrix

```text
BASIC/PRO INVENTORY: PASS
PRO FEATURES CLASSIFIED: 10/10
UNLIMITED CLAIMS FOUND: 8 produktrelevante Gruppen + historische/technische Treffer
OFFER COUNTING CONTRACT: DECISION REQUIRED
ACTIVE CUSTOMER CONTRACT: DECISION REQUIRED
CENTRAL CAPACITY ARCHITECTURE: COMPLETE
ADD-ON LIFECYCLE: COMPLETE
OVER-LIMIT CONTRACT: DECISION REQUIRED
WARNING CONTRACT: DECISION REQUIRED
OWNER UI IMPACT: COMPLETE
LEGAL DOCUMENT IMPACT: COMPLETE
SECURITY IMPACT: COMPLETE
MIGRATION PLAN: COMPLETE
PRODUCT CODE CHANGED: NO
MIGRATION CREATED/APPLIED: NO
STAGING CHANGED: NO
STRIPE CHANGED: NO
PRODUCTION CHANGED: NO
AT + PRO: LOCKED
EXISTING FINAL LOCKS: PRESERVED
STATUS: PHASE 7C.1 AUDIT COMPLETE / NOT READY FOR IMPLEMENTATION
```
