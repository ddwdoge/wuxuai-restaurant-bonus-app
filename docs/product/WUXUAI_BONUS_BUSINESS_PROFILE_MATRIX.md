# WUXUAI Bonus – Branchenprofil-Matrix V1

Status: Phase 2, zentrale Produktkonfiguration

Die Quelle der Wahrheit im Code ist `src/config/businessProfiles.mjs`. Die Matrix
dokumentiert die sichtbaren V1-Auswahlen; sie führt keine zweite Laufzeitlogik ein.

| Branche | Willkommensgeschenke | Belohnungskategorien | empfohlener Standard | Sparsam | Standard | Großzügig | Premium | eigene Auswahl möglich | Status |
|---|---|---|---|---|---|---|---|---|---|
| Restaurant | Gratis Getränk; Gratis Dessert; Gratis Vorspeise; Rabatt auf eine Hauptspeise; Gratis Menü | Getränk; Dessert; Vorspeise; Hauptspeise; Menü | Gratis Getränk + Gratis Dessert | Gratis Getränk | Gratis Dessert | Gratis Vorspeise | Gratis Hauptspeise | Ja | Aktiv |
| Café | Gratis Kaffee; Gratis Tee; Gratis Heißgetränk; Gratis Gebäck; Rabatt auf Frühstück | Kaffee; Heißgetränk; Kaltgetränk; Gebäck; Frühstück | Gratis Kaffee + Gratis Gebäck | Gratis Kaffee | Gratis Gebäck | Gratis Kaltgetränk | Gratis Gebäck | Ja | Aktiv |
| Bäckerei | Gratis Gebäck; Gratis Brot; Gratis Snack; Gratis Getränk; Rabatt auf den nächsten Einkauf | Brot; Gebäck; Snack; Getränk; Gutschein | Gratis Gebäck | Gratis Brot | Gratis Gebäck | Gratis Snack | Gratis Getränk | Ja | Aktiv |
| Bubble Tea | Gratis Topping; Gratis Getränk; Größen-Upgrade; Rabatt auf den nächsten Kauf | Getränk; Topping; Größen-Upgrade; Gutschein | Gratis Topping + Gratis Getränk | Gratis Getränk | Gratis Getränk | Gratis Größen-Upgrade | Gratis Gutschein | Ja | Aktiv |
| Eisdiele | Gratis Kugel; Gratis Topping; Größen-Upgrade; Rabatt auf den nächsten Besuch | Kugel; Becher; Topping; Größen-Upgrade | Gratis Kugel | Gratis Kugel | Gratis Kugel | Gratis Topping | Gratis Größen-Upgrade | Ja | Aktiv |
| Einzelhandel | 5 % Rabatt; 10 % Rabatt; Einkaufsgutschein; Gratis Probe; Gratis Produkt | Produkt; Produktkategorie; Einkaufsgutschein; Prozent-Rabatt; Gratisprobe | 5 % Rabatt + 5 € Einkaufsgutschein | Gratis Produkt | 5 € Einkaufsgutschein | Gratis Einkaufsgutschein | Gratis Prozent-Rabatt | Ja | Aktiv |
| Friseursalon | Rabatt auf den nächsten Termin; Pflegeprodukt gratis; Gratis Zusatzleistung; Gutschein | Haarschnitt; Zusatzleistung; Pflegeprodukt; Gutschein; Prozent-Rabatt | Rabatt + Gratis Zusatzleistung | Gratis Haarschnitt | Gratis Zusatzleistung | Gratis Pflegeprodukt | Gratis Gutschein | Ja | Aktiv |
| Kosmetikstudio | Gratis Zusatzbehandlung; Rabatt auf den nächsten Termin; Pflegeprobe; Gutschein | Behandlung; Zusatzbehandlung; Pflegeprodukt; Gutschein; Prozent-Rabatt | Gratis Zusatzbehandlung | Gratis Behandlung | Gratis Zusatzbehandlung | Gratis Pflegeprodukt | Gratis Gutschein | Ja | Aktiv |
| Fitnessstudio | Gratis Probetraining; Gratis Getränk; Rabatt auf Zusatzleistung; Gratis Tagespass | Training; Tagespass; Getränk; Zusatzleistung; Gutschein | Gratis Probetraining + Gratis Tagespass | Gratis Training | Gratis Tagespass | Gratis Getränk | Gratis Zusatzleistung | Ja | Aktiv |
| Dienstleistung | Prozent-Rabatt; Gutschein; Gratis Zusatzleistung; Rabatt auf den nächsten Auftrag | Leistung; Produkt; Gutschein; Prozent-Rabatt | Prozent-Rabatt + 5 € Gutschein | Gratis Leistung | 5 € Gutschein | Gratis Gutschein | Gratis Prozent-Rabatt | Ja | Aktiv |
| Sonstiges | Prozent-Rabatt; Gutschein; Gratis Produkt; Gratis Leistung | Leistung; Produkt; Gutschein; Prozent-Rabatt | Prozent-Rabatt + 5 € Gutschein | Gratis Leistung | 5 € Gutschein | Gratis Gutschein | Gratis Prozent-Rabatt | Ja | Aktiv |

## Gemeinsame Regeln

- Jede Profilzeile enthält zusätzlich `Eigene Auswahl` beziehungsweise
  `Eigene Belohnung`.
- Sparsam und Standard verwenden in V1 beide 3 Prozent Einlösequote, aber
  unterschiedliche vorgeschlagene Gegenwerte oder Kategorien.
- Großzügig verwendet 8 Prozent, Premium 10 Prozent.
- Vorschläge werden erst nach ausdrücklicher Bestätigung übernommen.
- Veröffentliche oder individuell gespeicherte Bestandswerte werden nicht
  automatisch umgerechnet, überschrieben oder gelöscht.
- Die Punkteformel lautet:
  `ceil(Produktwert / (Einlösequote / 100) * Punkte pro Euro)`.
