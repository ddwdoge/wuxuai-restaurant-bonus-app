# Owner Portal V1 UI Audit und Standortbereinigung

Datum: 2026-08-28  
Branch: `codex/v1-canonical-recovery`  
Scope: Owner-UI, Standort, Branding und bestehende Finder-Medienintegration

## Ursache

Unter `Einstellungen -> Standort & Restaurantsuche` waren der rohe Wert
`Öffentliches Bild (HTTPS-Adresse)`, der Smart Media Editor und technische
Koordinaten sichtbar. Das vermischte Standortpflege mit Medienbearbeitung und
legte interne Werte offen. Zusätzlich waren ein bloßer Restaurant-Slug, ein
manueller Logo-Link im Onboarding und ein V1-fremder Filialwähler sichtbar.

## Umsetzung

- Das Restaurant-Titelbild wird nur noch unter
  `Einstellungen -> Branding -> Restaurantbild / Titelbild` verwaltet.
- Der bestehende Smart Media Editor bleibt der gemeinsame 16:9-Medienkern.
- Der neue Titelbild-Upload nutzt den bestehenden Bucket `restaurant-media`
  und speichert weiterhin die vorhandenen `public_cover_image_*`-Felder.
- Standort lädt und bewahrt bestehende Cover-URLs und Präsentationswerte,
  zeigt aber weder rohe URL, Editor noch Koordinaten.
- Der Finder erhält weiterhin Titelbild, Logo, Kurzbeschreibung und Adresse.
- Restaurant-Slug, manueller Onboarding-Logo-Link und Angebots-Filialwähler
  wurden nur aus der Owner-Oberfläche entfernt. Ihre Datenverträge bleiben
  unverändert.

## Audit-Tabelle

| Seite | Bereich | Aktueller Zweck | V1-Status | Aktion |
| --- | --- | --- | --- | --- |
| Dashboard | KPIs und nächster Schritt | Tagesbetrieb und offene Aufgabe | V1 REQUIRED | KEEP |
| Punkteeinlösung | Belohnungen, Wirtschaftlichkeit, Medien | Punkteprodukte verwalten | V1 REQUIRED | KEEP |
| Willkommensgeschenke | Geschenkpool und Medien | Onboarding-/Geburtstagsgeschenke verwalten | V1 REQUIRED | KEEP |
| Aktuelles & Angebote | Beitragseditor und Medien | Veröffentlichte Restaurantinformationen | V1 REQUIRED | KEEP |
| Aktuelles & Angebote | Restaurant/Filiale | Technische Branch-Zuordnung | V2 / INTERNAL | HIDE; Branch-ID intern beibehalten |
| Gäste | Liste, Suche, dokumentierter Support | Gästebetrieb | V1 REQUIRED | KEEP |
| QR Center | Gäste-, Staff-QR und Starter Kit | Druck- und Zugangsmedien | V1 REQUIRED | KEEP |
| Mitarbeiter | Teamstatus und Einladung | Staff-Verwaltung | V1 REQUIRED | KEEP |
| Berichte | Bonusaktivität | V1-Betriebsübersicht | V1 OPTIONAL | KEEP |
| Einstellungen | Bereichsnavigation | Aufgabenbezogener Einstieg | V1 REQUIRED | KEEP |
| Restaurantdaten | Restaurant-Link als Slug | Interner Routingwert | LEGACY / INTERNAL | HIDE |
| Branding | Logo und Farben | Markenauftritt | V1 REQUIRED | KEEP |
| Branding | Restaurantbild / Titelbild | Kanonische Cover-Verwaltung | V1 REQUIRED | MOVE HERE |
| Standort & Restaurantsuche | Adresse, PLZ, Ort, Land | Standortpflege | V1 REQUIRED | KEEP |
| Standort & Restaurantsuche | Karte und Standortstatus | Geocoding-Prüfung | V1 REQUIRED | KEEP |
| Standort & Restaurantsuche | Öffentliche Kurzbeschreibung | Finder-Inhalt | V1 OPTIONAL | KEEP |
| Standort & Restaurantsuche | Öffentliches Bild (HTTPS-Adresse) | Roher Medienwert | LEGACY / INTERNAL | HIDE |
| Standort & Restaurantsuche | Bild anpassen | Zweiter Cover-Editor | MISPLACED / DUPLICATED | HIDE |
| Standort & Restaurantsuche | Breiten-/Längengrad | Technische Geodaten | LEGACY / INTERNAL | HIDE |
| Bonusprogramm | Freunde einladen & 2× Bonus | V1 Referral-Konfiguration | V1 REQUIRED | KEEP |
| Bonusprogramm | Modus / Regel speichern / Aktive Regel | Frühere Regeloberfläche | LEGACY / INTERNAL | BEREITS HIDDEN; Regression geprüft |
| Onboarding | Manueller Logo-Link | Roher Medienwert neben Upload | LEGACY / INTERNAL | HIDE |

## Klassifikation

- Duplicate Cover-Medieneditoren vor Änderung: 1
- Duplicate Cover-Medieneditoren nach Änderung: 0
- Legacy/Internal Owner-UI gefunden und verborgen: 4
  - rohe öffentliche Titelbild-URL
  - sichtbare Koordinaten
  - Restaurant-Slug
  - manueller Onboarding-Logo-Link
- Falsch platzierte UI gefunden und korrigiert: 1
  - Titelbild-Editor im Standortbereich
- V2-UI gefunden und verborgen: 1
  - Restaurant-/Filialauswahl im Angebotsformular

## Was nicht geändert wurde

- keine Punkte-, Reward-, Referral-, Offer- oder Customer-Businesslogik
- keine Finder- oder Restaurantdetail-Ausgabe
- keine bestehenden Medienwerte oder Storage-Dateien
- keine Datenbankmigration, RLS-Policy, Grants oder RPCs
- keine Customer-, Staff- oder Platform-Admin-Route

## Tests

- Neuer Vertragstest: `tests/owner-portal-v1-ui-cleanup.test.mjs`
- Standort-Geocoding-Vertrag an die verborgenen Koordinaten angepasst
- Smart-Media- und Finder-Regression fokussiert: 21/21 PASS
- Vollständige Suite: 1067/1067 PASS
- Typecheck: PASS
- Lint: PASS
- Production Build: PASS
- `git diff --check`: PASS

## Risiken

- Der Titelbild-Upload und das Speichern wurden lokal gegen Typen und
  Vertragsprüfungen validiert, aber in diesem Task nicht gegen eine reale
  Staging-Owner-Session ausgeführt.
- Bestehende historische Cover-URLs bleiben absichtlich erhalten. Es findet
  keine automatische Storage-Bereinigung statt.

## Prüf-Export

`exports/2026-08-28_OWNER_PORTAL_V1_UI_AUDIT_LOCATION_CLEANUP_FULL_APP.zip`

Der Export enthält den vollständigen aktuellen App-Stand mit 927 Dateien und
schließt `.git`, `node_modules`, Umgebungsdateien, Build-Ausgaben, alte ZIPs und
Dumps aus.

Status: CODE LOCK nach vollständiger lokaler Qualitätsprüfung; kein FINAL LOCK
ohne echten Staging-Flow.
