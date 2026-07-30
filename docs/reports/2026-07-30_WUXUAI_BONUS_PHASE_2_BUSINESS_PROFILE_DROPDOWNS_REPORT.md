# WUXUAI Bonus – Phase 2 Branchenprofile und Bonusprogramm-Assistent

Datum: 30.07.2026  
Branch: `codex/v13-legal-maps-hardening`  
Ausgangscommit: `b9b26475c76e0a9925288ea07096a15f713d4d38`

## Ursache und Ausgangszustand

Das Onboarding verwendete bisher eine gastronomisch geprägte, lokal in der
Komponente gepflegte Auswahl. Branche, Willkommensgeschenke und
Belohnungskategorien waren nicht über einen gemeinsamen Produktvertrag
verbunden. Die Einlösequote war bereits als Dropdown vorhanden, die gemeinsame
Punkteberechnung zog `points_per_euro` jedoch fälschlich ab, statt damit zu
multiplizieren.

`public.restaurants.restaurant_type` besteht bereits als freies Textfeld. Im
Repository ist dafür weder ein Enum noch ein CHECK-Constraint vorhanden. Die elf
freigegebenen Branchen lassen sich deshalb kompatibel speichern; eine Migration
ist nicht erforderlich.

## Zentrale Branchenkonfiguration

`src/config/businessProfiles.mjs` ist die einzige Laufzeitquelle für:

- elf Branchenprofile und sichtbare Labels,
- branchenspezifische Willkommensgeschenke,
- branchenspezifische Belohnungskategorien,
- vier Einlösearten,
- vier Großzügigkeitsstufen,
- deterministische Standardvorschläge,
- Mapping alter und unbekannter `restaurant_type`-Werte,
- kontrollierte Abstimmung bei Branchenwechseln.

Die TypeScript-Deklaration liegt in `businessProfiles.d.mts`; der angeforderte
Einstieg `businessProfiles.ts` exportiert denselben Vertrag. Es gibt keine
zweite Optionsliste in einer UI-Komponente.

## Onboarding und Dropdowns

Schritt „Unternehmen“ verlangt nun die Branche über ein natives, vollständig
beschriftetes Select mit 48 Pixel Touchhöhe. Unbekannte Bestandswerte bleiben
als „Bestehende Branche“ sichtbar und werden für Vorschläge sicher dem Profil
„Sonstiges“ zugeordnet.

Schritt „Punkteeinlösung“ verwendet Dropdowns für:

- Großzügigkeit,
- Art der Punkteeinlösung,
- branchenspezifische Belohnungskategorie,
- Einlösequote von exakt 1 bis 10 Prozent.

Schritt „Willkommensgeschenke“ zeigt nur Optionen des aktiven Profils. „Eigene
Auswahl“ öffnet ein kompaktes Formular für Bezeichnung, Beschreibung,
optionalen Wert und optionales Bild. Das Bild verwendet den bestehenden
tenantgebundenen Owner-Upload; es wurde keine zweite Uploadarchitektur gebaut.

## Bonusprogramm-Assistent

Der Assistent berücksichtigt Branche, Großzügigkeit, durchschnittlichen
Einkaufswert, Punkte pro Euro und Einlöseart. Er zeigt Geschenk, erste
Belohnung, Kategorie, Wert, benötigte Punkte und wirtschaftliche Einordnung.

V1-Defaults:

- Punkte pro Euro: `10`,
- Einlösequote: `3 %`,
- Sparsam: `3 %` mit kleinerem vorgeschlagenem Gegenwert,
- Standard: `3 %` als empfohlener Ausgangspunkt,
- Großzügig: `8 %`,
- Premium: `10 %`.

Die verbindliche gemeinsame Formel lautet:

```text
required_points = ceil(product_price / (redemption_rate / 100) * points_per_euro)
```

Der Vorschlag wird nicht automatisch endgültig gespeichert. Der Betreiber muss
„Vorschlag übernehmen“ oder angepasste Werte über „Einstellungen bestätigen“
bestätigen. Die bestehende Reward-Engine und die spätere Owner-Verwaltung
bleiben die Autorität für veröffentlichte Belohnungen.

## Branchenwechsel und Bestandsdaten

Bei einem Branchenwechsel werden die abhängigen Optionslisten sofort neu
geladen. Gültige Profilwerte bleiben bestehen. Ungültige Profilwerte werden
zurückgesetzt und der verbindliche Prüfhinweis wird angezeigt.

Individuelle Bestandswerte werden anhand der zentral bekannten Profilkennungen
erkannt und erhalten. Unbekannte oder individuelle Reward-Kennungen werden
nicht gelöscht. Veröffentlichte Rewards werden vom Onboarding nicht geladen,
umgerechnet oder verändert. Alte Einlösequoten werden nicht still neu
berechnet.

## Accessibility und Responsive

- native Selects unterstützen Tastatur, Pfeiltasten, Enter und Escape,
- jedes Select besitzt ein sichtbares Label,
- Profilwechsel und Vorschlagskarte verwenden Status-/Live-Regionen,
- Auswahlzustände werden zusätzlich durch Text und Haken vermittelt,
- Touchflächen sind mindestens 48 Pixel hoch,
- Assistent und eigenes Geschenk wechseln unter 700 Pixel auf eine Spalte,
- keine feste Kartenbreite und kein absichtlicher horizontaler Overflow.

Die automatisierten Strukturprüfungen decken 390/430 Pixel sowie Desktopregeln
ab. Die lokale Route `/admin/onboarding` leitete ohne vorhandene Owner-Sitzung
korrekt zum Login. Eine authentifizierte visuelle Abnahme bei 390, 430, 1280,
1440 Pixel und 200 Prozent Zoom wurde deshalb nicht vorgetäuscht und bleibt das
nächste Review-Gate. Ein physischer Mobile-Safari-Test wurde nicht durchgeführt.

## Tests und Qualität

- neue Profil-/Onboardingtests: 9/9 erfolgreich,
- gezielte Profil- und Einlösequotentests: 14/14 erfolgreich,
- vollständige Testsuite: 350/350 erfolgreich,
- Typecheck: erfolgreich,
- Lint: 0 Fehler, 6 bereits bestehende Warnungen,
- Build: erfolgreich,
- `git diff --check`: erfolgreich,
- Secret-Scan im Phase-2-Diff: keine Treffer.

## Nicht geändert

- keine Migration,
- keine RLS- oder Policy-Änderung,
- keine neue Reward-Engine,
- keine Kassen-, Buchungs- oder Warenwirtschaftsfunktion,
- keine Customer-, Staff- oder Plattformlogik,
- kein Push, Merge oder Deployment.

## Offene Risiken

1. Die geschützten Onboarding-Schritte benötigen eine authentifizierte visuelle
   Abnahme in den geforderten Viewports und bei 200 Prozent Zoom.
2. Mobile Safari muss physisch geprüft werden; native Select-Darstellung kann
   nicht vollständig durch statische Tests ersetzt werden.
3. Wird ein neues Bild vor dem abschließenden Onboarding-Request hochgeladen und
   schlägt erst der nachfolgende Abschluss fehl, kann ein unreferenziertes
   Storage-Objekt verbleiben. Bestehende Bilder und Datensätze werden dabei
   nicht überschrieben.

## Status

`READY_FOR_VISUAL_REVIEW`
