# WUXUAI Bonus - Terminology Matrix

Datum: 2026-07-30  
Status: IMPLEMENTED_IN_PHASE_1

Diese Matrix dokumentiert die durch den Product Owner freigegebene und in
Phase 1 umgesetzte sichtbare Terminologie. Die Engineering Bible und der
Produktcode verwenden denselben Stand.

| Bestehende sichtbare Bezeichnung | Umgesetzte Bezeichnung | Status |
| --- | --- | --- |
| WUXUAI Restaurant Bonus | WUXUAI Bonus | A - neutralisiert |
| Restaurant | Unternehmen oder Geschäft, kontextabhängig | A - neutralisiert |
| Restaurantbesitzer / Owner | Betreiber | A - neutralisiert |
| Restaurantname | Unternehmensname | A - neutralisiert |
| Restaurantdaten | Unternehmensdaten | A - neutralisiert |
| Restaurant starten | Unternehmen aktivieren | A - neutralisiert |
| Restaurant-Login | Betreiber-Login | A - neutralisiert |
| Restaurant-Einstellungen | Unternehmenseinstellungen | A - neutralisiert |
| Restaurant-QR | Unternehmens-QR | A - neutralisiert |
| Restaurant-Mitarbeiter | Teammitglied | A - neutralisiert |
| Restauranttyp | Branche | A - neutralisiert |
| Restaurant Starter Kit | Starter Kit | A - neutralisiert |

## Zentrale Quelle

Die verbindlichen UI-Begriffe liegen in
`src/config/productTerminology.ts`. Öffentliche Einstiege, Login,
Registrierung, Owner-Shell, Onboarding und Unternehmenselector verwenden diese
Quelle dort, wo gemeinsame Begriffe dargestellt werden.

## Trefferklassifikation

- A - sichtbar und neutralisiert: Public Home, Auth, Onboarding, Owner,
  Customer, Staff, Legal Center, QR Center, Berichte und Plattform-UI.
- B - intern und bewusst beibehalten: Komponenten-, Typ-, Service-,
  Tabellen-, RPC-, RLS-, URL- und Variablennamen mit `restaurant`.
- C - juristisch sensibel: Mastertemplates und veröffentlichte
  Dokumentinhalte wurden nicht mechanisch verändert.
- D - echte branchenspezifische Bezeichnung: Branchenoption `Restaurant`
  sowie konkrete Rewardinhalte wie Kaffee, Dessert, Menü oder Getränk.
- E - offen: keine bestätigten sichtbaren Altbegriffe im geprüften Scope.

## Interne Bezeichnungen

Technische Namen wie `restaurants`, `restaurant_id`, `restaurant_type`,
bestehende RPC-Namen, RLS-Policies und URL-Verträge bleiben nach der neuen
Spezifikation unverändert.

Kennzeichnung: `INTERNAL_LEGACY_NAMING_ACCEPTED`

## Rechtliche Inhalte

Rechtliche Dokumentinhalte dürfen nicht durch eine mechanische Wortersetzung
verändert werden. Betroffene Vorlagen und veröffentlichte Versionen benötigen
eine gesonderte rechtliche Prüfung.

Kennzeichnung: `LEGAL_REVIEW_REQUIRED`
