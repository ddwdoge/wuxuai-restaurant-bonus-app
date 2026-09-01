# Customer Repeat QR Account Recognition Fix

Datum: 28.07.2026

Branch: `codex/v13-legal-maps-hardening`

Ausgangscommit: `8053eb9`

## Ursache

Der Kundenzugang wurde nach der Registrierung zwar in `localStorage`
geschrieben, aber beim erneuten QR-Aufruf erst in einem React-Effekt gelesen.
Der Portal-Loader konnte deshalb im ersten Render bereits ohne Token starten
und die Registrierung anzeigen. Zusätzlich hat der alte Speicher-Helper alle
Schreibfehler verschluckt. Die Oberfläche meldete damit auch dann einen
gespeicherten Zugang, wenn Safari ihn nicht dauerhaft geschrieben hatte.

## Audit des bisherigen Zugangs

| Frage | Ergebnis vor dem Fix |
| --- | --- |
| Speicherort | `localStorage` |
| Hauptschlüssel | `wuxuai_customer_tokens` |
| Legacy-Schlüssel | `wuxuai-customer-token:<restaurantSlug>` |
| Restaurantbezogen | Im Objekt beziehungsweise Legacy-Key ja |
| Sofort gespeichert | Aufgerufen, Erfolg aber nicht geprüft |
| Nach Reload gelesen | Ja, jedoch erst nach dem ersten Render |
| Vor Registrierung geprüft | Nicht zuverlässig; Race mit anonymem Load |
| URL-Token entfernt | Nein |
| Sichere lokale Sitzung | Server validierte Token, lokale Speicherung war ungeprüft |
| Fehlender URL-Token | Lokaler Token konnte zu spät eintreffen |
| Race Condition | Ja: Storage-Effekt gegen Portal-Load-Effekt |
| Zu breites Löschen | Logout war restaurantbezogen; ungültiger URL-Token konnte aber lokalen Scope mitlöschen |
| Safari-BFCache | Route wurde remountet, lokal restaurierte Tokens wurden bei Fokus aber nicht erneut geprüft |

Es gibt keine separate öffentliche `membership_id` im V1-Kundenvertrag. Die
Kundenzeile ist bereits restaurantgebunden; die serverseitige Kombination aus
Restaurant-Slug und Token validiert diese Mitgliedschaft. Interne IDs werden
nicht zusätzlich im öffentlichen Portal offengelegt oder erfunden.

## Umsetzung

- Neuer Schlüssel: `wuxuai_customer_access:v1:<restaurantSlug>`.
- Gespeicherte Metadaten: Version, Restaurant-Slug, optional vorhandene interne
  Referenzen, Kundenzugang, Gerätekennung, Erstell- und Letztnutzungszeit.
- Der Server speichert weiterhin nur den Token-Hash und bleibt Autorität für
  Restaurant, Kunde, Gültigkeit, Punkte und Rewards.
- Legacy-Zugänge werden nur innerhalb desselben Restaurant-Slugs migriert.
- Der Zugang wird synchron im initialen React-State gelesen. Ein anonymer
  Erstrequest kann den gespeicherten Token nicht mehr überholen.
- Nach erfolgreicher Servervalidierung und verifizierter lokaler Speicherung
  wird ein URL-Token per `replace` aus der Adresse entfernt.
- Ein ungültiger URL-Token löscht keinen abweichenden gültigen lokalen Zugang.
- Registrierungsresultate aktivieren den Portal-Token erst nach erfolgreicher,
  rückgelesener Persistierung. Bei Fehler erscheint `Erneut speichern`; der
  Registrierungs-RPC wird dabei nicht wiederholt.
- Logout entfernt weiterhin nur den Zugang des aktuellen Restaurants.
- `pageshow` mit BFCache, Fokus und sichtbarer Tab-Rückkehr validieren auch
  lokal restaurierte Zugänge erneut.
- Die Gerätekennung bleibt bei blockiertem Safari-Speicher wenigstens für die
  aktuelle Tab-Sitzung stabil.
- Die geforderten `CUSTOMER_ACCESS_*`-Diagnoseevents werden als sichere
  Browser-Ereignisse nur mit Restaurant-Slug und Zeitpunkt ausgegeben. Tokens,
  Telefonnummern, Geburtstage und Auth-Daten sind ausgeschlossen. Die
  bestehende serverseitige Login-Auditierung bleibt die persistente Autorität.

## Serverseitige Duplikatsperre

Die vorhandene Migration
`20260727001000_customer_identity_v1_no_sms.sql` sperrt Duplikate über
`restaurant_id + normalized_phone` und einen transaktionalen Advisory Lock.
Sie erzeugt bei einem bekannten Konto keinen neuen Token. Diese Migration
wurde in diesem Auftrag nicht verändert und nicht auf Production angewendet.

## Tests

- Gleiches Restaurant stellt denselben lokalen Zugang wieder her.
- Restaurant A und B besitzen getrennte Schlüssel und Tokens.
- Logout A lässt Zugang B bestehen.
- Blockierter Safari-Speicher gilt nicht als erfolgreiche Persistierung.
- Legacy-Zugang wird restaurantbezogen migriert.
- Storage wird synchron vor dem ersten Portal-Load gelesen.
- Persistierungsfehler führt in den Speicher-Retry, nicht in eine zweite Registrierung.
- BFCache und Fokus lösen eine erneute Validierung aus.
- Bestehende DB-Dublettensperre bleibt nachweisbar.
- Gesamtsuite: 246/246 erfolgreich.
- Lokaler Browser bei 390 px: Restaurant geladen, `scrollWidth = innerWidth = 390`.
- Console: keine neuen App-Fehler; zwei bereits vorhandene React-Router-v7-Hinweise.
- Unerwartete Netzwerkfehler im lokalen Test: 0.

## Nicht geändert

- Keine Migration erstellt oder angewendet.
- Keine RLS-, RPC-, Punkte-, Reward-, Tages-PIN-, Owner-, Staff- oder
  Plattformlogik geändert.
- Keine Production-Änderung, kein Push, kein Merge, kein Deployment.

## Offene Risiken

- Ein physischer erneuter Scan über Apple Kamera und Mobile Safari ist noch
  auszuführen.
- Installierte PWA und Safari besitzen je nach iOS-Konfiguration getrennte
  Browser-Speicher. Ohne persönlichen Token-Link kann ein Zugang nicht sicher
  zwischen getrennten Browsercontainern übertragen werden.
- Private Safari-Sitzungen können lokalen Speicher beim Schließen verwerfen;
  der neue Fehlerzustand verhindert eine falsche Erfolgsmeldung, ersetzt aber
  keine dauerhafte Browserpersistenz.
- Die bereits vorhandene Identity-Migration benötigt weiterhin ihre separat
  dokumentierte Staging-Datenbereinigung und wurde hier nicht erneut geprüft
  oder angewendet.

## Status

`READY_FOR_PHYSICAL_QR_TEST`
