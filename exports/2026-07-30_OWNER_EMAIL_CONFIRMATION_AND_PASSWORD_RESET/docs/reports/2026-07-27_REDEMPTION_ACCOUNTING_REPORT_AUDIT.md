# WUXUAI Bonus - Audit Steuer- und Einloesungsberichte

Datum: 28.07.2026
Repository: `wuxuai-restaurant-bonus-os`
Branch: `codex/v13-legal-maps-hardening`
Ausgangscommit: `3b3878a54ac58f7140ab7120107f25984ed0507c`

## Ergebnis

Der bestehende Stand ist **nicht** ausreichend fuer ein unveraenderbares Einloesungsjournal, belastbare Monats-/Jahresberichte oder einen Steuerberaterexport.

Es existieren bereits sichere Einloesungspfade, Audit-Events und ein technischer CSV-Export. Der Export liest jedoch aktuelle Reward-Stammdaten statt historischer Snapshots und deckt die geforderten fachlichen sowie steuerlichen Felder nicht ab. Eine Erweiterung ohne vorherige CTO- und Steuerberaterfreigabe koennte fachlich falsche Berichte erzeugen.

Status: `CHANGES_REQUIRED`

## Verbindliche Abgrenzung

WUXUAI ist nicht mit einer Registrierkasse verbunden. Der vorhandene und jeder kuenftige Export ist ausschliesslich eine interne Bonus-, Reward- und Abgabedokumentation.

Rechtlich zu pruefender Platzhalter:

> Dieser Bericht dokumentiert Bonus- und Reward-Einloesungen im WUXUAI Bonus System. Er ersetzt keinen gesetzlich vorgeschriebenen Kassenbeleg, keine Registrierkasse und keine steuerliche oder buchhalterische Pruefung.

## Bible-Konflikt

Die aktuelle Engineering Bible schliesst fuer V1 komplexe Reports, Filial-UI und Buchhaltungs-/Steuerlogik aus:

- `AGENTS.md`: keine komplexen Reports und keine Filial-UI in V1.
- `docs/13_SMART_REWARD_ENGINE.md`: keine Buchhaltung, keine echte Wareneinsatzrechnung und keine Steuerberatung.
- `docs/17_CTO_ENTSCHEIDUNGEN.md`: Cashflow First, keine komplexe Abrechnung vor dem Pilot.

Der aktuelle Founder-Auftrag ist damit eine neue Produktentscheidung, die vor einer Implementierung als CTO-Ausnahme dokumentiert werden muss. Ohne diese Freigabe darf der Code nicht gegen die Bible erweitert werden.

## Bestehende Datenstruktur

### `rewards`

Vorhanden:

- `restaurant_id`, vorbereiteter Branch-Scope
- Titel und Beschreibung
- `required_points`, `required_stamps`
- `reward_type` mit den technischen Werten `reward` und `coupon`
- Kategorie
- `product_price`
- `expires_at`
- Aktivstatus
- Kennzeichnung fuer Starter-/Willkommensgeschenke und Birthday-Pool

Nicht vorhanden:

- `retail_price_gross`
- `vat_rate`
- `cost_value`
- `accounting_category`
- `pos_article_reference`
- separates `valid_from`

`product_price` ist ein aktueller Produktpreis. Es ist nicht dokumentiert, dass dieser Wert steuerlich als historischer Brutto-Verkaufspreis verwendet werden darf.

### `redemption_codes`

Vorhanden:

- Restaurant-, Organisations-, Branch-, Customer- und Reward-Bezug
- `redemption_type` mit `points_redemption`, `welcome_gift`, `birthday_gift`
- Status, Aktivierung, Ablauf und Einloesezeit
- gehashter Code und Idempotenz-ID
- technische Metadaten

Nicht vorhanden:

- unveraenderbare Reward-/Preis-/USt-/Kosten-Snapshots
- `redeemed_by` und `actor_role` als eigene Snapshotfelder
- Stornogrund, Stornoakteur und Storno-Audit-Referenz

### `reward_redemption_events`

Vorhanden:

- Restaurant, Branch, Customer und Reward
- Punkte- und Stempelverbrauch
- Start-/Einloesezeit und Status
- Referenz zum Einloesecode

Risiko:

- `reward_id` verwendet historisch `ON DELETE CASCADE`.
- `customer_id` und `restaurant_id` verwenden ebenfalls kaskadierende Loeschregeln.
- Die Tabelle ist daher kein unabhaengiges, unveraenderbares Journal.

### `customer_rewards`

Dokumentiert Welcome- und Birthday-Zuteilungen mit Status und Einloesezeit. Die Tabelle besitzt jedoch eine Admin-`FOR ALL`-Policy und kaskadierende Fremdschluessel. Sie ist kein unveraenderbares Journal.

### `points_transactions`

Dokumentiert Punktebewegungen inklusive negativer Punkte bei Reservierung einer Punkteeinloesung. Die Punkte werden beim Start des Codes reserviert/abgezogen, nicht erst beim finalen Consume. Fuer abgelaufene, nicht verbrauchte Codes ist laut Flow-Dokument keine Rueckbuchungsregel beschlossen.

### `audit_log`

Audit-Events sind vorhanden und Restaurant-Admins koennen sie lesen. Browserrollen besitzen keine Update-/Delete-Policy. Der Datensatz haengt jedoch mit `ON DELETE CASCADE` am Restaurant und ersetzt kein fachliches Journal mit Preis-/USt-Snapshots.

## Aktueller Einloesungsablauf

1. `start_customer_redemption` prueft Kundenzugang, Restaurant, Branch, Reward und Punktestand.
2. Punkterewards erzeugen ein `reward_redemption_events`-Event mit `points_spent`.
3. Es wird ein 15 Minuten gueltiger `redemption_codes`-Datensatz angelegt.
4. `consume_redemption_code` setzt Code und Quellobjekt auf `redeemed` und schreibt Audit.
5. Ein bereits verbrauchter Code wird blockiert und separat auditiert.

Der Prozess ist gegen Mehrfachverwendung gehaertet, schreibt aber keinen einheitlichen, unveraenderbaren Accounting-Snapshot.

## Antworten auf das Bestandssaudit

| Frage | Ergebnis | Begruendung |
| --- | --- | --- |
| Wird jede Einloesung dauerhaft gespeichert? | Teilweise | Erfolgreiche Code-Flows werden gespeichert, aber verteilt und nicht loeschfest. |
| Sind Rewardtypen unterscheidbar? | Teilweise | Punkte, Welcome und Birthday sind unterscheidbar; Referral, Promotion und manuelle Kompensation fehlen. |
| Werden damaliger Rewardname und Punktepreis gespeichert? | Nein | Titel liegt teilweise in Code-Metadaten, der Export nutzt aber den aktuellen Rewardtitel. Punkte liegen im Event, nicht verlaesslich im Exportdatensatz. |
| Wird ein Preis-/Wert-Snapshot gespeichert? | Nein | Der Export joint den aktuellen `rewards.product_price`. |
| Koennen Daten geloescht oder ueberschrieben werden? | Ja | Reward-/Customer-Reward-Admin-Policies erlauben `FOR ALL`; Fremdschluessel verwenden teilweise Cascade. |
| Gibt es Storno statt Loeschung? | Teilweise | Status `cancelled` existiert technisch, aber kein vollstaendiger Stornovertrag mit Grund, Akteur, Audit und Rueckbuchungsregel. |
| Gibt es Monatsberichte? | Nein | Nur frei waehlbarer technischer CSV-Zeitraum. |
| Gibt es Jahresberichte? | Nein | Keine Monatsaggregation oder Jahresvergleichslogik. |
| Gibt es Steuerberaterexporte? | Teilweise | CSV-Grundlage vorhanden, aber nicht snapshotfest oder steuerlich belastbar. |

## Bestehender Accounting-Export

Migration `20260724001000_legal_compliance_layer.sql` stellt `get_reward_accounting_export(...)` bereit. Der RPC:

- ist nur fuer `authenticated` ausfuehrbar,
- prueft serverseitig `is_restaurant_admin`,
- blockiert normale Staff-Sessions,
- filtert nach Restaurant und Zeitraum,
- schreibt ein Export-Audit,
- liefert keine Customer-Tokens oder Telefonnummern.

Die UI unter `Rechtliches & Datenschutz` kann daraus eine CSV der letzten zwoelf Monate erzeugen.

### Kritische Exportmaengel

1. Rewardname, Kategorie und Produktpreis werden aus dem **aktuellen** Reward gelesen. Spaetere Bearbeitung veraendert historische Exporte.
2. `points_consumed` liest `redemption_codes.metadata.points_spent`. `start_customer_redemption` schreibt dort derzeit keinen `points_spent`-Wert; Punkteeinloesungen koennen daher als `0` exportiert werden.
3. Der Zeitraum filtert nach `redemption_codes.created_at`, nicht nach der finalen `redeemed_at`-Zeit.
4. Ohne Statusfilter enthaelt der Export auch aktive, abgelaufene oder stornierte Codes und ist damit kein reiner Einloesungsbericht.
5. Branch wird weder gefiltert noch als Detailspalte ausgegeben.
6. USt-Satz, Kostenwert, Waehung, Akteurrolle, Stornogrund und Kundenpseudonym fehlen.
7. `receipt_reference`, `tax_category`, `reversal_reference` sind immer `null`.
8. Der Audit-Lateral-Join nimmt nur das neueste Audit zum Code; er garantiert keine bestimmte fachliche Auditaktion.
9. Es gibt nur CSV, keine PDF-Zusammenfassung und keine XLSX-Architektur.
10. Monatsgrenzen werden nicht serverseitig in `Europe/Vienna` gebildet; der Client uebergibt rohe Timestamps.

### Verbindlicher Uebergangsvertrag fuer den bestehenden RPC

`get_reward_accounting_export` darf nicht entfernt oder durch einen inkompatiblen Parallelendpunkt ersetzt werden. Nach Freigabe der Journalarchitektur soll der bestehende RPC auf das kanonische, unveraenderbare Einloesungsjournal umgestellt werden. Seine bestehende Aufrufsignatur bleibt dabei nach Moeglichkeit kompatibel; notwendige neue Filter oder Metadaten muessen additiv eingefuehrt werden.

Fuer die Uebergangsphase gelten folgende Regeln:

- Neue Einloesungen werden ausschliesslich aus unveraenderbaren Journal-Snapshots exportiert.
- Historische Alt-Datensaetze bleiben exportierbar, werden aber niemals mit heutigen Reward-Stammdaten als vermeintlich historische Wahrheit angereichert.
- Fehlende historische Werte bleiben `null` beziehungsweise leer und erhalten die sichtbare Kennzeichnung `Historischer Wert nicht vorhanden`.
- Jeder Exportdatensatz enthaelt einen maschinenlesbaren Datenstatus:
  - `complete`: alle fuer den Bericht benoetigten historischen Snapshotwerte sind vorhanden.
  - `partial_legacy`: der Vorgang ist historisch belegt, aber mindestens ein Snapshotwert fehlt.
  - `missing_value_data`: historische Preis-, USt- oder Wertdaten fehlen vollstaendig.
- Der Bericht darf aktuelle Rewardtitel, Verkaufspreise, USt-Saetze oder Kostenwerte nicht rueckwirkend in Alt-Datensaetze einsetzen.
- Testkunden werden standardmaessig ausgeschlossen. Eine ausdrueckliche, berechtigte Einbeziehung muss im Bericht sichtbar sein und darf den Standard nicht still veraendern.
- Stornierte Vorgange werden nur nach explizitem Reportparameter einbezogen; der Bericht weist diese Entscheidung sichtbar aus.

Jeder Monats-, Jahres- und Detailbericht zeigt mindestens:

- `Testdaten ausgeschlossen: Ja/Nein`
- `Stornierte Vorgange enthalten: Ja/Nein`
- `Vollstaendige Snapshots: <Anzahl>`
- `Unvollstaendige historische Datensaetze: <Anzahl>`

### Verbindliche Zeitraumlogik

Alle fachlichen Zeitraeume werden serverseitig in `Europe/Vienna` gebildet. Fuer einen Monatsbericht gilt das halboffene Intervall:

```text
[1. Tag des Monats 00:00 Europe/Vienna,
 1. Tag des Folgemonats 00:00 Europe/Vienna)
```

Damit werden Sommer-/Winterzeit und lokale Kalendertage korrekt behandelt. UTC-Zeitstempel bleiben das Speicherformat, duerfen aber nicht direkt als UTC-Monatsgrenzen verwendet werden. Die Jahresaggregation verwendet entsprechend den 1. Januar 00:00 `Europe/Vienna` bis zum 1. Januar des Folgejahres 00:00 `Europe/Vienna`.

## Rewardtypen

Heute sicher unterscheidbar:

- `POINT_REWARD` aus `points_redemption`
- `WELCOME_GIFT` aus `welcome_gift`
- `BIRTHDAY_GIFT` aus `birthday_gift`

Nicht als Einloesungsart implementiert:

- `REFERRAL_REWARD` - Referral aktiviert derzeit Bonus Boost statt einer Reward-Einloesung.
- `PROMOTIONAL_GIFT` - ein Promotions-/Aktionsmodul ist in V1 explizit entfernt.
- `MANUAL_COMPENSATION` - keine Produkt- oder Berechtigungslogik vorhanden.

Diese Kategorien duerfen nicht nur fuer einen Bericht erfunden werden. Zuerst ist eine Produktentscheidung notwendig.

## Rollen und Tenant Isolation

Positiv:

- Der vorhandene Export prueft `restaurant_id` serverseitig.
- `is_restaurant_admin` umfasst Owner, Admin und Manager.
- Normale Staff-Rollen erhalten keinen Exportzugriff.
- `anon` wurde der Execute-Zugriff explizit entzogen.

Offen:

- Ein eigenes Filialadmin-Rollenmodell existiert in V1 nicht.
- Der Export besitzt keinen Branch-Filter und keine serverseitige Liste erlaubter Filialen.
- Plattformsupport-Sonderzugriff ist fuer diesen Export nicht definiert.

## Fehlende Stornologik

Ein belastbarer Stornopfad benoetigt mindestens:

- eindeutige Berechtigung,
- `cancelled_at`, `cancelled_by`, Rolle und Pflichtgrund,
- Referenz zum Originaljournal,
- unveraenderbares Storno-Audit,
- klare Entscheidung ueber Punkte-Rueckbuchung,
- klare Behandlung bereits ausgegebener Ware,
- Idempotenz und Schutz vor Doppelstorno.

Diese Regeln sind derzeit nicht vollstaendig definiert. Ein einfaches Statusupdate waere fachlich unzureichend.

## Offene CTO- und Steuerberaterfragen

Vor Implementierung verbindlich entscheiden:

1. Gilt eine Abgabe beim Kunden-Start oder erst beim finalen Staff-Consume als berichtet?
2. Ist `product_price` fachlich der regulaere Brutto-Verkaufspreis?
3. Welche USt-Saetze sind erlaubt und wer pflegt sie?
4. Wie werden gemischte Produkte, Menues, Gutscheine und Null-Euro-Geschenke behandelt?
5. Ist der Kostenwert optionaler Wareneinsatz, Einkaufspreis netto oder ein anderer interner Wert?
6. Welche Accounting-Kategorien werden verbindlich verwendet?
7. Fuehrt ein Storno zu einer Punkte-Rueckbuchung, und wenn ja, unter welchen Bedingungen?
8. Wie werden Referral-Rewards, Promotionen und manuelle Kompensationen produktseitig erzeugt?
9. Welche Rollen duerfen Monats-, Jahres- und Detaildaten sehen bzw. exportieren?
10. Wie lange muessen Journal und Exporte aufbewahrt werden?
11. Welche stabile Pseudonymisierung der Customer-ID ist fuer Exporte zulaessig?
12. Muss PDF/A, digitale Signatur oder eine fortlaufende Exportnummer verwendet werden?
13. Welche exakte USt-/Eigenverbrauchsbehandlung gilt in Oesterreich je Rewardtyp?

## Empfohlene sichere Implementierungsreihenfolge

Nach dokumentierter Freigabe:

1. Additive, kanonische Tabelle `redemption_journal` mit unveraenderbaren Snapshots erstellen.
2. Write-only Serverhelper in denselben Transaktionen wie finalen Consume integrieren.
3. Update/Delete technisch sperren; Storno ausschliesslich ueber atomare RPC mit Audit erlauben.
4. Historischen Backfill separat analysieren. Fehlende damalige Werte nicht aus heutigen Stammdaten als historische Wahrheit ausgeben.
5. `get_reward_accounting_export` kompatibel auf das neue Journal umstellen und Legacy-Zeilen mit `snapshot_completeness` kennzeichnen; den bestehenden RPC nicht entfernen.
6. Owner-/Admin-RPCs fuer Journal, Monats- und Jahresaggregation mit serverseitigen, halb offenen `Europe/Vienna`-Grenzen erstellen.
7. Testkunden standardmaessig ausschliessen und Testdaten-/Storno-/Snapshot-Kennzahlen in jedem Bericht ausweisen.
8. Branch-Berechtigung serverseitig modellieren, bevor ein Branchfilter angeboten wird.
9. CSV-Detailjournal und PDF-Zusammenfassungen aus demselben serverseitigen Reportvertrag erzeugen.
10. XLSX nur einfuehren, wenn eine gepruefte Exportbibliothek und ein klarer Bedarf vorliegen.
11. Alle geforderten Rollen-, Snapshot-, Legacy-, Zeitraum-, Export- und Tenant-Tests ergaenzen.
12. Migration und echte Rollenflows zuerst auf Staging pruefen.

## In diesem Auftrag nicht geaendert

- keine Datenbankmigration
- keine RPC
- keine RLS-/Policy-Aenderung
- keine Owner-Navigation
- keine Report-UI
- keine Punkte-, Reward-, Referral- oder Stornologik
- keine Production-Migration
- kein Push oder Merge

## Schlussentscheidung

Die bestehende CSV-Funktion ist eine technische Vorstufe, aber kein unveraenderbares Einloesungsjournal und kein Monats-/Jahres-Steuerbericht. Eine Umsetzung wird bis zur CTO-Ausnahme von der Engineering Bible und zur Klaerung der oben genannten Steuer-/Stornofragen bewusst nicht begonnen.

Status: `CHANGES_REQUIRED`
