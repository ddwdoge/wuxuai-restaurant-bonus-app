# WUXUAI Bonus – Customer „Aktuelles & Angebote“ Cross-Restaurant Live-Diagnose

Datum: 25.08.2026  
Umgebung: Supabase Staging `bwhvfjuwixgwduoeqaya`  
Diagnosezeitpunkt: `2026-08-25 23:57:38.317466 Europe/Vienna` (`2026-08-25T21:57:38.317466Z`)

## Ursache

Es liegt kein Cross-Restaurant-Leak und kein Client-Filterfehler vor. Die öffentlichen Angebote werden serverseitig mit `get_public_restaurant_offers` nach Restaurant-Slug, Veröffentlichungsstatus, Aktivstatus, Gültigkeitszeitraum, Wochentag und Tageszeit gefiltert. Alle Tageszeitregeln werden in `Europe/Vienna` ausgewertet.

Das Restaurant `Kaffee Konditorei bäckerei` und die im Finder sichtbare Bezeichnung `WU und XU Group GmbH` sind kein getrenntes Restaurantpaar. `WU und XU Group GmbH` ist die aktive Filiale desselben Restaurants. Beide verwenden den Slug `wu-und-xu-group-gmbh` und erhalten daher dasselbe öffentliche RPC-Ergebnis.

Zum Diagnosezeitpunkt waren die zwei veröffentlichten und aktiven Kaffee-Angebote außerhalb ihres Tageszeitfensters. Zwei weitere Angebote waren deaktiviert. Deshalb lieferte die öffentliche RPC für Kaffee/WU und XU korrekt null Angebote.

## Restaurant- und Filialbindung

| Anzeige | Restaurant-ID | Restaurant-Slug | Filial-ID | Filialname | Filialstatus | Zeitzone |
|---|---|---|---|---|---|---|
| Akakiko hietzing | `83b0edb8-5156-45b1-9770-e60f3eb0d8a0` | `akakiko-hietzing-85951d` | `f7217a51-561a-4bde-a9c7-f6a333e1497f` | Akakiko Hietzing | aktiv, öffentlich auffindbar | Europe/Vienna |
| Akakiko Hietzing (separater Datensatz) | `4c1ae633-9c8e-4ea2-a85e-e9fc183de1bb` | `akakiko-hietzing` | `ef21dc88-54b4-4e8a-9054-c214c27f2997` | Akakiko Hietzing | aktiv, nicht öffentlich auffindbar | Europe/Vienna |
| Kaffee Konditorei bäckerei | `1dbd4d83-cd4f-441e-9d3f-71a34febfed2` | `wu-und-xu-group-gmbh` | `df7e7649-229d-4a07-a4a0-4288182bbc9a` | WU und XU Group GmbH | aktiv, öffentlich auffindbar | Europe/Vienna |

Der auf dem Kundengerät sichtbare Akakiko-Datensatz ist eindeutig `akakiko-hietzing-85951d`: Nur dieser Datensatz besitzt das von der RPC zurückgegebene Angebot. Der ähnlich benannte Datensatz `akakiko-hietzing` besitzt keine Angebote.

## Öffentliche RPC-Ergebnisse

Alle Aufrufe wurden am identischen Datenbankzeitpunkt ausgewertet.

| Slug | Öffentliche Angebote |
|---|---:|
| `akakiko-hietzing-85951d` | 1 |
| `akakiko-hietzing` | 0 |
| `wu-und-xu-group-gmbh` | 0 |

`WU und XU Group GmbH` hat keinen eigenen dritten Slug. Der Wert ist deshalb ebenfalls 0 und entspricht dem Kaffee-Restaurant.

## Angebotsprüfung

### Akakiko hietzing

| Angebot | Status | Aktiv | Datum | Wochentag | Uhrzeit | Öffentlich |
|---|---|---:|---:|---:|---:|---:|
| `menü` (`48d457cd-69bc-43d7-8452-4ce1608c1364`) | DRAFT | Nein | Ja | Ja | Ja | Nein |
| `test` (`654fbab3-1b77-45aa-9c47-d68093d12a61`) | PUBLISHED | Ja | Ja | Ja | Ja | Ja |

`test` ist bis 28.08.2026, 23:00 Europe/Vienna sichtbar. `menü` wird wegen Entwurfsstatus und fehlendem Aktivstatus ausgeschlossen.

### Kaffee Konditorei bäckerei / WU und XU Group GmbH

| Angebot | Status | Aktiv | Zeitfenster Europe/Vienna | Datum | Wochentag | Uhrzeit | Exakter Ausschlussgrund |
|---|---|---:|---|---:|---:|---:|---|
| `Kopie von Kopie von testte` (`d7973fe1-ec86-4da9-be69-cf12604165e7`) | DISABLED | Nein | 09:37–22:37 | Ja | Ja | Nein | INACTIVE; zusätzlich außerhalb des Zeitfensters |
| `Kopie von testte` (`d3561762-06a1-4189-bea5-6c61ffd3aa3c`) | PUBLISHED | Ja | 09:37–22:37 | Ja | Ja | Nein | OUTSIDE_TIME_WINDOW |
| `test` (`d5852a1c-6dab-490e-a6e7-5fd5c945191c`) | PUBLISHED | Ja | 10:45–20:45 | Ja | Ja | Nein | OUTSIDE_TIME_WINDOW |
| `testte` (`ecb1cf8f-b18d-4cae-aa67-5d03061f7acc`) | DISABLED | Nein | Mo/Di 09:37–16:37 | Ja | Ja | Nein | INACTIVE; zusätzlich außerhalb des Zeitfensters |

Die Prüfung ergab keine falsche Restaurant- oder Filialbindung und keinen Tenant-Mismatch.

## Kontrollierte Zeitfensterprüfung

Die RPC besitzt keinen Testzeitparameter und verwendet absichtlich `now()`. Deshalb wurde die identische serverseitige Sichtbarkeitsbedingung read-only mit dem kontrollierten Zeitpunkt `2026-08-26 12:00 Europe/Vienna` ausgewertet.

Ergebnis:

- `Kopie von testte`: sichtbar
- `test`: sichtbar
- beide deaktivierten Angebote: weiterhin nicht sichtbar

Damit ist belegt, dass die aktuelle Nullmenge durch Zeitfenster und Aktivstatus entsteht. Es wurden keine Angebotsdaten oder Zeitpläne verändert.

## Client- und Cacheprüfung

- `CustomerPortal` ruft `loadPublicRestaurantOffers(restaurantSlug, 5)` auf.
- Die Angebotsseite ruft `loadPublicRestaurantOffers(slug, 100)` auf.
- Der Service sendet exakt `input_restaurant_slug` und `input_limit` an `get_public_restaurant_offers`.
- Der Client führt keine zusätzliche Datum-, Wochentag- oder Zeitfilterung aus.
- Beim Slugwechsel ändert sich der React-Key um `routeKind`, `restaurantSlug`, Token und BFCache-Revision. Die Restaurantportalinstanz wird damit neu aufgebaut.
- Angebotszustand ist komponentenlokal und der Ladeeffekt hängt vom aktuellen Restaurant-Slug ab.
- Es existiert kein persistenter globaler Angebotscache in Local Storage oder Session Storage.
- Der Partner-Finder lädt den öffentlichen Gesamtfeed und bindet Einträge anschließend ausschließlich über die jeweilige `branch_id` an ein Lokal.
- Restaurantbezogene Kundentokens bleiben getrennt gespeichert; sie steuern die öffentliche Angebotsfilterung nicht.

## Owner-Statusanzeige

Die Owner-Seite unterscheidet derzeit nur Entwurf, deaktiviert, geplant, abgelaufen und veröffentlicht. Wochentage und Tageszeitfenster werden für die sichtbare Kennzeichnung `Veröffentlicht` beziehungsweise die Zählung `aktuell aktiv` nicht ausgewertet.

Daher fehlen aktuell:

- `Jetzt sichtbar`
- `Derzeit nicht sichtbar`
- der nächste Sichtbarkeitszeitraum

Dies ist kein Fehler der öffentlichen RPC, aber eine bestätigte Owner-UX-Lücke: Ein veröffentlichtes Angebot kann außerhalb seines Tageszeitfensters als `Veröffentlicht` und `aktuell aktiv` erscheinen. Diese Lücke wurde in diesem Diagnoseauftrag bewusst nicht geändert.

Nächste öffentliche Zeitfenster der aktiven Kaffee-Angebote nach dem Diagnosezeitpunkt:

- `Kopie von testte`: 26.08.2026, 09:37–22:37 Europe/Vienna
- `test`: 26.08.2026, 10:45–20:45 Europe/Vienna

## Geänderte Dateien

- Nur dieser Diagnosebericht.

## Was nicht geändert wurde

- keine UI
- keine Angebotsdaten oder Zeitpläne
- keine Restaurant-, Filial- oder Kundenzuordnung
- keine RPC, RLS oder Grants
- keine Migration
- keine Production-Aktion

## Risiken und Folgeaufgabe

Die doppelte Akakiko-Namensgebung kann bei manuellen Prüfungen zu einer falschen Tenant-Auswahl führen. Die Datensätze wurden nicht verändert. Als getrennte Folgeaufgabe sollte die Owner-Anzeige Zeitfenster servergleich auswerten und `Jetzt sichtbar`, `Derzeit nicht sichtbar` sowie das nächste Fenster anzeigen.

## Status

Die öffentliche Angebotslogik ist fachlich konsistent. Für die aktuelle Beobachtung ist kein Business-Logic-Fix erforderlich. Die Owner-Statuskommunikation benötigt eine spätere, separat freizugebende UX-Verbesserung.
