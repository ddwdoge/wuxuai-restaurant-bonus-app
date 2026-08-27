# WUXUAI Bonus - Owner-Bonusprogramm V1

Datum: 2026-08-28  
Branch: `codex/v1-canonical-recovery`  
Ausgangscommit: `1116319b1cb2acb597137ec12966651e2d1916bb`

## Ursache

Die Owner-Seite `Bonusprogramm` renderte neben dem freigegebenen
Freundschaftsbonus noch historische Modus-, Einlösequoten-, Stempel-,
Bonstufen- und Regel-Editoren. Diese technische Konfiguration widersprach der
V1-Regel, nach der Restaurantbesitzer nur den Referral-/2x-Vertrag verwalten.

## Geänderte Dateien

- `src/modules/admin/pages/LoyaltyPage.tsx`
- `tests/owner-bonusprogramm-v1-ui.test.mjs`
- `tests/redemption-rate-dropdown.test.mjs`
- `docs/04_RESTAURANT_PORTAL.md`
- `docs/19_CHANGELOG.md`

## Was wurde geändert

- Technischen Modusstatus im Seitenkopf entfernt.
- Modusformular einschließlich Bonusmodus, Euro pro Punkt, Einlösequote,
  Stempelziel und Speichern entfernt.
- Regelanlage, Bonstufen-Vorlagen und Liste aktiver Regeln entfernt.
- Referral-Bereich direkt unter Titel und kurzer Owner-Einführung platziert.
- Aktivierung, fester Multiplikator 2x, 7/14/28/eigene Dauer, Monatslimit,
  Vorschau, Validierung und bestehender Save-RPC unverändert beibehalten.
- Die Seite lädt keine `loyalty_rules` mehr und bietet keinen Legacy-Schreibweg
  mehr an.

## Was wurde nicht geändert

- Keine Punkteberechnung, Einlösung, Tages-PIN, Reward-, Referral- oder
  Customer-Boost-Logik geändert.
- Keine Tabelle, RPC, Migration oder historische Funktion gelöscht.
- Keine RLS-Policy und kein Grant geändert.
- Kein Push, Merge, Staging- oder Production-Deployment.

## Legacy-Backend und Sicherheit

`loyalty_settings` und `loyalty_rules` bleiben für bestehende V1-Verträge und
historische Kompatibilität erhalten. Die alten Servicefunktionen bleiben im
Code, werden von der Owner-Seite aber nicht mehr importiert oder aufgerufen.

Owner und Restaurantadmins besitzen aufgrund der bestehenden tenantgebundenen
RLS-Policy weiterhin direkte Schreibrechte auf die eigenen
`loyalty_settings`- und `loyalty_rules`-Zeilen. Staff, Customer und Anon erhalten
diese Rechte nicht. Das ist bestehender interner technischer Schuldenstand; im
Rahmen dieser reinen UI-Aufgabe wurden Berechtigungen bewusst nicht verändert.

## Prüfungen

- Owner-UI-Vertrag und Referral-Vertrag: PASS
- Legacy-Backend-Erhalt: PASS
- Fokus-Tests: 9/9 PASS
- Autoritative Tests: 1061/1061 PASS
- Typecheck: PASS
- Lint: PASS, 0 Fehler; 7 bereits bestehende Warnungen außerhalb des Scopes
- Production Build: PASS
- `git diff --check`: PASS
- Desktop/Tablet/Mobile: responsive Vertrag statisch geprüft; echtes
  Staging-Visual-Gate bleibt ohne Deployment offen

## Risiken

- Direkte tenantgebundene Legacy-Tabellenrechte für Owner/Admin bleiben
  technisch erreichbar, obwohl die V1-Oberfläche sie nicht mehr anbietet.
- Ein echtes visuelles Staging-Gate ist vor `FINAL LOCK` erforderlich.

## Prüf-Export

- Vollständiger App-Stand: `exports/2026-08-28_OWNER_BONUSPROGRAMM_V1_LEGACY_UI_REMOVAL_FULL_APP.zip`
- Umfang: vollständiger aktueller App-Stand mit 1484 Archiveinträgen
- Ausgeschlossen: `.git`, `node_modules`, Umgebungsdateien, Build-/Coverage-Ausgaben,
  Datenbank-Dumps und alte ZIP-Exporte

## Status

**CODE LOCK**. Der Code- und Responsive-Vertrag ist geprüft; ein Deployment und
echter visueller Staging-Flow wurden in dieser Aufgabe nicht durchgeführt.
