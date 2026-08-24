# WUXUAI Bonus V1 - QR Center Flow Audit und Legacy-Kassa-Bereinigung

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `5be0207df8b04c7ea3e3d4de653e08795fddc2f4`

## Aufgabe

Alle aktiven QR-Zwecke inventarisieren, den doppelten Kassa-Aufsteller aus dem
V1-Produkt entfernen und QR Center sowie Onboarding auf die zwei primaeren
Zwecke Neue Gaeste und Mitarbeiter fokussieren, ohne bestehende Sammelwege oder
historische Daten zu brechen.

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/08_FLOW_01_ONBOARDING.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`

## Ursache

Das QR Center zeigte vier Karten, obwohl der Kassa-Aufsteller keine eigene
Technik besass. `Kassa QR` und `Kassa-Aufsteller` renderten beide exakt
`/w/:slug`; es gab fuer den Aufsteller weder eigenen Token noch Route,
Datenbanktyp, RPC, Validierung oder Reportingquelle.

Der Kassa-QR selbst ist dagegen noch nicht rein historisch. Drei aktive
Staging-Restaurants verwenden `customer_initiated_only`; sechs verwenden
`restaurant_controlled_only`. Die Route `/w/:slug`, die oeffentliche
Modusabfrage, der kundeninitiierte Customer-Flow, Tages-PIN und
`collect_bonus_points_v1` sind weiterhin ein zusammenhaengender aktiver
Kompatibilitaetsvertrag. Deshalb waere seine vollstaendige Entfernung entgegen
dem Auftrag nicht sicher.

## QR-Inventar

| QR-Typ | Aktive UI | Route | Aktiver RPC | Business-Flow | Legacy |
| --- | --- | --- | --- | --- | --- |
| Neue Gaeste QR | Ja, primaer | `/customer/:slug` | aktive Legal-/Registrierungs- und Customer-Access-RPCs | Restaurantkontext, Login/Registrierung, Welcome Gift, Customer Home | Nein |
| Mitarbeiter QR | Ja, primaer | `/staff/:slug` | bestehende Staff-, Tages-PIN-, QR-Preview- und Punkte-RPCs nach Auth | Team-Login, Kunden-QR scannen, Punkteflow | Nein |
| Kassa QR | Nur bei `customer_initiated_only` oder `both` | `/w/:slug` | `get_public_points_collection_mode`, `collect_bonus_points_v1` und gemeinsame Punkte-Engine | bestehender kundeninitiierter Sammelweg mit Tages-PIN | Teilweise; aktiver Kompatibilitaetsweg |
| Kassa-Aufsteller | Nein | keine eigene; war ebenfalls `/w/:slug` | keine eigene | nur zweite Druckdarstellung des Kassa-QR | Ja, V1-inaktiv |
| Persoenlicher Kunden-QR | Im Kundenportal, nicht im Owner-QR-Center | kurzlebige Referenz im Kundenportal | serverseitige QR-Erzeugung, Preview und atomare Buchung | restaurantgesteuerter Punkteflow | Nein |

## Abhaengigkeiten

### Kassa QR

Aktive Abhaengigkeiten: **5 Vertragsgruppen**

1. Kompatibilitaetsroute `/w/:slug` und URL-basierter Restaurantkontext.
2. Restaurantmodus `customer_initiated_only` beziehungsweise `both`.
3. Oeffentliche Modusauflosung `get_public_points_collection_mode`.
4. Customer-Sammeloberflaeche mit Tages-PIN.
5. `collect_bonus_points_v1` und die gemeinsame serverseitige Punkte-Engine.

Die Route wird nicht entfernt. Im QR Center erscheint sie nur, wenn der
serverseitige Restaurantmodus sie benoetigt. Schlaegt die Modusabfrage fehl,
wird aus Kompatibilitaetsgruenden fail-safe der bestehende Sammelweg gezeigt.

### Kassa-Aufsteller

Aktive Abhaengigkeiten: **0**  
Technisch eindeutig: **Nein**

Die Karte, der PNG-Download und die doppelte PDF-Seite wurden entfernt. Fuer
Aufsteller, Tisch, Kassa, Rechnung, Flyer oder Werbung wird derselbe
Neue-Gaeste-QR verwendet.

## Geaenderte Dateien

- `src/modules/admin/pages/QrCenterPage.tsx`
- `src/modules/admin/pages/RestaurantOnboarding.tsx`
- `src/modules/admin/qrCenterFlow.mjs`
- `src/modules/admin/qrCenterFlow.d.mts`
- `src/styles.css`
- `tests/v1-qr-center-flow.test.mjs`
- `tests/onboarding-customer-qr-preview-removal.test.mjs`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/08_FLOW_01_ONBOARDING.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`
- `docs/19_CHANGELOG.md`
- `docs/V1_CURRENT_CANONICAL_PRODUCT_CONTRACT.md`

## Was wurde geaendert

- QR Center zeigt Neue Gaeste und Mitarbeiter als zwei primaere Karten.
- Beide Karten bieten Oeffnen und PNG-Download.
- Der Kassa-QR wird nur fuer einen aktiven kundeninitiierten Modus in einem
  separaten Kompatibilitaetsabschnitt gerendert.
- Kassa-Aufsteller und doppelter QR-Canvas wurden entfernt.
- Das Onboarding-Starter-Kit enthaelt zwei Druckvarianten derselben
  Neue-Gaeste-URL und einen Staff-QR.
- PDF-Erzeugung wartet auf den Restaurantmodus, damit ein benoetigter
  Kompatibilitaetsweg nicht versehentlich fehlt.
- Die QR-Regel ist in den autoritativen Dokumenten superseding dokumentiert.

## Was wurde nicht geaendert

- Keine Datenbankmigration und keine historischen Migrationsaenderungen.
- Keine QR-, Token-, Audit- oder Reportingdaten geloescht.
- `/w/:slug` und `collect_bonus_points_v1` nicht entfernt.
- Keine Aenderung an Registrierung, Login, Welcome Gift, Referral, Punkte,
  Tages-PIN, Redemption oder Staff-Autorisierung.
- Keine Production-Aktion und kein Deployment.

## Security

- Der Neue-Gaeste-QR enthaelt nur die oeffentliche Restaurant-URL.
- Der Staff-QR erteilt keine Berechtigung; `/staff/:slug` bleibt durch
  `ProtectedRoute` und serverseitige Restaurantrollen geschuetzt.
- Keine Service-Role, Staff-PIN, Customer-Token oder andere Geheimnisse wurden
  in QR-URLs aufgenommen.
- RLS, Grants und RPC-Vertraege wurden nicht veraendert.

## UI-Pruefung

Per Chromium-Layoutpruefung getestet: 390, 430, 768, 1024 und 1440 Pixel.

- horizontaler Overflow: 0 bei allen Breiten
- Aktionsflaechen: mindestens 44 Pixel
- 390/430: Starter Kit und QR-Karten einspaltig
- 768: QR-Karten einspaltig
- 1024/1440: zwei gleich breite Primaerkarten
- Desktop, Tablet und Mobile: PASS

Die Pruefung verwendete den echten Stylesheet-Vertrag und die neue
Komponentenstruktur. Ein authentifizierter Staging-UI-Test des noch nicht
deployten Codes wurde nicht durchgefuehrt.

## Qualitaet

- Tests: **861/861 PASS**
- Typecheck: **PASS**
- Lint: **PASS, 0 Fehler, 7 bestehende Warnungen**
- Build: **PASS**
- `git diff --check`: **PASS**
- Secret Scan der Aenderungen: **PASS**

## Migration und Staging

- Migration erstellt: Nein
- Migration auf Staging angewendet: Nein, nicht erforderlich
- RLS geaendert: Nein
- RPC geaendert: Nein
- Neuer Staging-Flow getestet: Nein; kein Deployment beauftragt

## Risiken

- Der Kassa-QR kann erst vollstaendig als V1-inaktiv markiert werden, wenn alle
  Restaurants kontrolliert auf `restaurant_controlled_only` migriert wurden.
  Ein stilles Umschreiben bestehender Modi oder gedruckter URLs war nicht Teil
  dieses Auftrags.
- Bei einem temporaeren Fehler der Modusabfrage bleibt der Kassa-QR absichtlich
  sichtbar. Das ist ein konservativer Kompatibilitaets-Fallback, kein neuer
  Produktstandard.
- Die aktualisierte UI ist ohne Deployment nicht authentifiziert auf Staging
  sichtbar pruefbar.

## Ergebnis

- Kassa QR aktiv erforderlich: **Ja, fuer bestehende kundeninitiierte Modi**
- Kassa-Aufsteller aktiv erforderlich: **Nein**
- Neue Gaeste QR: **PASS**
- Staff QR: **PASS**
- Starter Kit: **PASS**
- Legacy-Daten geloescht: **Nein**
- V1 QR Center Code: **LOCK**
- Finaler Status: **CODE LOCK**, nicht FINAL LOCK

## Pruef-Export

Vollstaendiger aktueller Repository-Stand ohne `.git`, `node_modules`, lokale
Environment-Dateien, Build-Ausgaben, Supabase-CLI-Tempdaten oder fruehere
Exporte:

`exports/2026-08-24_V1_QR_CENTER_FLOW_AUDIT_LEGACY_KASSA_CLEANUP.zip`
