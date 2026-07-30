# WUXUAI Premium Design Migration

Stand: 20.07.2026

## Ziel

Das Kundenportal wurde als warme, ruhige und mobile Premium-Oberfläche neu
strukturiert. Datenquellen, Authentifizierung, Kundentoken, Punkteberechnung,
Tages-PIN, Bonus Boost und Einlösung wurden nicht verändert.

## Umgebaute Bereiche

- Restaurant-QR-Einstieg und Registrierung
- Freunde-Einladung
- Kunden-Startansicht
- Punktekarte und Fortschritt
- Vorschau und Übersicht der Punkteeinlösungen
- Willkommens- und Geburtstagsgeschenke
- Einlösebestätigung und Einlösecode im Drawer
- Punkte sammeln mit Rechnungsbetrag und Tages-PIN
- Kundenkonto mit persönlichem QR und Speicherhilfe
- Lade-, Fehler- und Leerzustände

## Wiederverwendbare Komponenten

Unter `src/modules/customer/components/PremiumCustomerUi.tsx`:

- `AppShell`
- `CustomerHeader`
- `BottomNavigation`
- `PageContainer`
- `SectionHeader`
- `PremiumCard`
- `PointsCard`
- `RewardCard`
- `PrimaryButton`
- `SecondaryButton`
- `StatusBadge`
- `ProgressBar`
- `EmptyState`
- `LoadingState`
- `ErrorState`
- `PremiumDrawer`
- `ConfirmationDialog`
- `RestaurantLogo`
- `RewardImage`

## Design-Tokens

Die isolierten Kunden-Tokens stehen in
`src/modules/customer/customer-premium.css`.

- Hintergrund: `#f8f5ef`
- Oberfläche: `#ffffff`
- Primärakzent: `#b88a3b`
- Primärtext: `#1f1f1f`
- Sekundärtext: `#6f6a63`
- Erfolg: `#4f7a5b`
- Warnung: `#a87527`
- Fehler: `#a94c4c`

Gold wird nur für Hauptaktionen, Fortschritt, aktive Navigation und wichtige
Statushinweise verwendet.

## Navigation

Registrierte Gäste erhalten vier deutsche Hauptpunkte:

1. Start
2. Einlösen
3. Sammeln
4. Konto

`Sammeln` öffnet den bestehenden `/w/:slug`-Flow. Es wurde kein neuer
Punkteweg angelegt.

## Drawer

`So funktioniert's`, die Einlösebestätigung und der aktive Einlösecode nutzen
den gemeinsamen `AppDrawer`. Dieser unterstützt Overlay-Klick, Schließen-
Button, Escape, Fokus-Trap, Fokus-Rückgabe, Scroll-Lock und mobile Vollbreite.

## Nicht umgebaut

- Restaurant Portal
- Staff Portal
- WUXUAI Admin
- Datenbank, RPCs, RLS und Migrationen
- Authentifizierung und Kundentoken-Speicherung
- Bonus-, Punkte-, PIN-, Referral- und Einlöselogik

## Prüfung

- Typecheck: erfolgreich
- Tests: 43/43 erfolgreich
- Build: erfolgreich
- Lint: 0 Fehler; 9 bereits vorhandene Warnungen außerhalb dieses Scopes
- Responsive geprüft: 390 px, 768 px und 1440 px
- Kein horizontaler Überlauf auf den geprüften Breiten
- Info-Drawer mobil geöffnet und per Escape geschlossen
- Fokus-Rückgabe und Hintergrund-Scroll-Lock geprüft

## Staging-End-to-End-Prüfung

Am 20.07.2026 wurde über den vorgesehenen Registrierungs- und Onboarding-Flow
ein synthetisches Staging-Testrestaurant mit einem synthetischen Testgast
angelegt. Verwendet wurden weder Produktionskunden noch echte personenbezogene
Daten. Token, Telefonnummer, Tages-PIN und Einlösecode werden nicht
dokumentiert.

Geprüft wurden:

- registrierter Kundenflow mit echtem Customer Token
- Punktebuchung für die Bon-Stufe `20–30 €`: `0 → 20 Punkte`
- Punktestand nach Reload: `20 Punkte`
- Punkteeinlösung `Gratis Kaffee`: `20 → 0 Punkte`
- echter sechsstelliger Einlösecode, im Bericht nur als `*** ***` dargestellt
- erfolgreicher einmaliger Verbrauch im Staff-Portal
- erneute Codeverwendung serverseitig blockiert
- Info- und Einlösedrawer im echten Kundenflow
- 390 px, 768 px und 1440 px ohne horizontalen Überlauf

## KPI- und Einlösestatus-Korrektur

Die fünf Korrekturen aus der KPI-Referenz wurden am 20.07.2026 selektiv in den
Premium- und Audit-Stand übernommen. Veraltete ZIP-Dateien wurden nicht über
aktuelle Dateien kopiert.

- Ein gespeicherter Einlösecode wird nach Reload nur nach positiver,
  kundentokengebundener Serverprüfung wieder angezeigt.
- `redemption_started` bleibt ein aktiver Vorzeigestatus und wird nicht als
  verbraucht interpretiert.
- Verbrauchte, abgelaufene, deaktivierte oder stornierte Codes werden entfernt.
- Das Dashboard zeigt `Kunden gesamt`, `Neue Kunden heute`, `Neue Kunden diese
  Woche`, `Heute aktiv` und `Einlösungen heute`.
- Zeitgrenzen werden serverseitig anhand der Restaurant-Zeitzone berechnet;
  Standard für österreichische Pilotrestaurants ist `Europe/Vienna`.
- Produktive KPI-Quellen schließen markierte Testkunden aus.
- Einlösungen zählen nur finale Welcome-/Birthday-Gifts,
  Punkte-Einlöseereignisse und Coupons.

Migration `20260720003000_dashboard_kpis_and_redemption_status.sql` wurde auf
Staging angewendet. Die anonyme Status-RPC wurde live geprüft. Ein erneuter
vollständiger Testkunden- und Owner-Dashboard-Lauf bleibt für die finale
Gesamtfreigabe erforderlich.
