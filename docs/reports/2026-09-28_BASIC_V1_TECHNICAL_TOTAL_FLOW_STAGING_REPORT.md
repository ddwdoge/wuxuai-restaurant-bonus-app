# BASIC V1 – technischer Gesamtflow und Staging-Abnahme

Datum: 28. September 2026
Branch: `codex/v1-release-integration`
Geprüfter und ausgerollter Commit: `c9398a7a2c6db32827400bd33c236bf6efd1d6ae`
Staging-Projekt: `wuxuai-bonus-staging` (Projekt-Ref im operativen Nachweis geprüft)
Staging-Worker: `wuxuai-restaurant-bonus-app-staging`
Aktive Worker-Version nach dem engen Fix: `8f10d737-cddd-4c59-bd3e-686c078547d9`
Staging-Migrationsstand: 183/183

## Ursache und enger Produktfix

Der physische Punkteflow reproduzierte einen Fehler ausschließlich im manuellen
Ersatzcode des persönlichen Punkte-QR. Ein achtstelliger Ziffernstring ist
gültiges JSON und wurde als Zahl geparst. Der bisherige Fallback für den
manuellen Code wurde deshalb nicht erreicht.

Der Fix lässt nach einem nicht passenden JSON-Payload zusätzlich die bereits
bestehende achtstellige Fallbackprüfung laufen. QR-Payload, Gültigkeitsdauer,
Single-Use, Tages-PIN, Rollen-, Tenant- und Servergrenzen wurden nicht geändert.

Geänderte Produktdateien:

- `src/modules/loyalty/customerPointsQr.mjs`
- `tests/staff-mobile-customer-qr-scanner.test.mjs`

Commit: `c9398a7a2c6db32827400bd33c236bf6efd1d6ae`

## Source-, Deployment- und Schemaparität

- Frischer Git-Fetch nach Push: PASS.
- Lokaler und Remote-HEAD: identisch, 0/0.
- Push: normaler Fast-forward; kein Force-Push, Merge oder Rebase.
- Der Cloudflare-Git-Trigger lud eine Version hoch, schaltete sie aber nicht
  aktiv. Deshalb wurde derselbe geprüfte Commit gezielt nur auf den bestehenden
  Staging-Worker ausgerollt.
- Aktives Staging-Staff-Asset und lokales Build-Asset:
  `StaffTablet-CJQQcdfH.js` – identisch.
- HTTP-App und Auth-Hydration nach hartem Reload: PASS.
- Supabase-Migrationsliste lokal/remote vollständig gleich bis
  `20260928002000`; fachlicher Stand 183/183.
- Keine Migration, Edge Function oder Datenbereinigung wurde in diesem Fix
  ausgeführt.
- Production und Stripe LIVE: unverändert.

## Lokale technische Gates

- QR-Regressionstest: 5/5 PASS.
- Vollständige Suite: 2.097/2.097 PASS.
- Ein erster Sandbox-Lauf hatte ausschließlich drei `127.0.0.1`-Bindefehler
  (`EPERM`). Derselbe unveränderte Stand bestand außerhalb dieser
  Netzwerksandbox vollständig; kein Produkttest blieb rot.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 8 bekannte Warnungen.
- Build mit geschützter öffentlicher Staging-Bindung: PASS, 2.157 Module.
- Frühere Migration-/SQL-Nachweise desselben Source-Standes:
  Fresh 183/183, Upgrade/Repeat und DB-Lint PASS; Trial-, Post-Trial-,
  Reaktivierungs-, Capacity- und Redemption-Verträge PASS.
- Secret Scan und Diff Checks: PASS.

## Physischer synthetischer Staging-Flow

### Owner und Trial

- Autorisierter TEST_ONLY-Owner und bestehender BASIC-Trial sichtbar: PASS.
- Keine Zahlungsmethode, Stripe-ID oder automatische Belastung sichtbar: PASS.
- Der aktuelle Tenant belegt die bestehende Trial-Darstellung. Die erneute
  physische Aktivierung eines Einmonats-Trials wurde nicht vorgenommen;
  Ein-/Dreimonatsgrenzen und Parallelität sind lokal serverseitig geprüft.

### Platform Admin und Aktivierungsgates

- AAL2-geschützte Platform-Ansicht: PASS.
- Der noch nicht aktivierbare synthetische Betrieb blieb blockiert: PASS.
- Beobachtete Blocker: nicht freigegebene Policy-/Legal-/Privacy-/Tax-,
  Übersetzungs-, Technik- und Dokumentversionen, unvollständige KYB- und
  Betreiberangaben sowie fehlender Kassa-Nachweis.
- Keine Aktivierung und keine Gate-Umgehung ausgeführt.
- Falscher Portalbereich (Platform Admin auf Staff-Route): serverseitig
  blockiert.

### Staff/Gast Punkteflow

- Getrennte legitime Staff- und Gast-Sitzungen: PASS.
- Persönlicher fünf Minuten gültiger Punkte-QR und manueller Ersatzcode:
  nach Fix erkannt.
- Serverseitige Vorschau: bestehend 1 Punkt, geplant +61 Punkte.
- Staff-Bestätigung mit Tages-PIN: genau einmal erfolgreich.
- Gast nach Reload: 62 Punkte und „Gratis Getränk ist jetzt einlösbar“.
- Wiederverwendung desselben Punkte-QR: serverseitig abgewiesen; keine zweite
  Gutschrift.
- Ein vorheriger Versuch über den älteren manuellen Gast-Auswahlpfad scheiterte
  mit einer generischen Fehlermeldung und änderte den sichtbaren Punktestand
  nicht. Dieser Befund wird nicht als erfolgreicher Produktwrite umgedeutet.

### Belohnung und Einlösung

- Gast startete genau einen 15-Minuten-Einlöseantrag.
- Staff-Queue zeigte genau einen tenantgebundenen Antrag mit korrekter
  Belohnung und Gastdarstellung.
- Staff bestätigte genau einmal; Queue danach 0.
- Gast-Polling zeigte „Eingelöst“ und „serverseitig bestätigt“.
- Gast nach Reload: 0 Punkte; die 62-Punkte-Belohnung wieder gesperrt.
- Kein doppelter Punkteabzug und keine zweite Finalisierung beobachtet.
- 24-fache Parallelitäts-/Replay-Sicherheit ist zusätzlich lokal durch die
  bestehenden SQL- und Security-Tests belegt; sie wurde nicht durch 24
  zusätzliche Staging-Businesswrites wiederholt.

## Trialende, 60-Tage-Fenster und BASIC-Zahlung

Getrennte Bewertung:

- Ein-/Dreimonats-Trialgrenzen: LOCAL DETERMINISTIC PASS.
- Trialende ohne Folgeauftrag: LOCAL DETERMINISTIC PASS.
- 60-Tage-Einlösefenster mit exklusivem Endzeitpunkt in Europe/Vienna:
  LOCAL DETERMINISTIC PASS; physischer Zeitablauf auf Staging OPEN.
- Sperre neuer Beitritte, Punkte, QR-Vorgänge und Angebote nach Trialende:
  LOCAL DETERMINISTIC PASS; physischer Zeitablauf OPEN.
- Ausdrückliche BASIC-Annahme und Reaktivierung als neuer Vertrag:
  LOCAL DETERMINISTIC PASS.
- Stripe-TEST-Checkout, Rechnung, Zahlungsausfall, Kündigung und Reaktivierung:
  BLOCKED durch Seller-/Tax-Readiness und finale Zahlungsfreigabe; kein
  positives Stripe-Ereignis wurde erfunden.
- Stripe LIVE und automatische Belastung aus Trialablauf: nicht ausgeführt und
  weiterhin gesperrt.

## Erwartete und beobachtete Writes

Im autorisierten TEST_ONLY-Alltagsflow wurden ausschließlich folgende
fachliche Wirkungen ausgelöst:

1. kurzlebige persönliche Punkte-QR-Referenzen;
2. eine erfolgreiche Punktegutschrift über 61 Punkte;
3. ein abgewiesener Wiederverwendungsversuch ohne zweite Gutschrift;
4. ein Einlöseantrag;
5. eine Staff-Finalisierung;
6. ein einmaliger Punkteabzug von 62 Punkten und der zugehörige append-only
   Audit-/Aktivitätsnachweis.

Es wurden keine Trial-, Subscription-, Entitlement-, Grant-, KYB-, Country-,
Seller-, Tax-, Stripe- oder Production-Writes ausgeführt. Der LEGACY-Tenant
blieb unverändert. Der Customer-Mail-Scheduler blieb deaktiviert.

## Production-Runbook

`docs/21_PRODUCTION_GO_LIVE_PLAN.md` enthält nun den technischen Ablauf ab
Migration 183 mit:

- Migrations- und Deployreihenfolge;
- Konfigurationsnamen ohne Werte;
- Backup-/Fingerprintvertrag;
- Edge-/App-Reihenfolge;
- Rollen- und Smoke-Matrix;
- Monitoring, Rollback und Stop-Kriterien;
- Verantwortlichkeiten und verbotenen Mischzuständen.

## Release-Matrix

| Bereich | Status | Nachweis / Blocker |
|---|---|---|
| Kernbuild und Tests | TECHNISCH PASS | 2.097/2.097, Typecheck, Lint, Build |
| Staging-App/Schema | PHYSISCH PASS | Commit/Asset-Parität, Migration 183/183 |
| Owner/Staff/Gast-Alltagsflow | PHYSISCH PASS | Punkte, Single-Use, Reward, Staff-Finalisierung |
| Trial 1/3 Monate | LOKAL PASS | Server-, Rollen-, Parallelitäts- und Zeitgrenzen |
| Trialende/60 Tage | LOKAL PASS / STAGING OPEN | realer Zeitablauf nicht beschleunigt |
| Recht, Datenschutz, KYB, Betreiberangaben, Kassa | RECHTLICH/FACHLICH OFFEN | beobachtete Gates bleiben fail-closed |
| Seller/Tax/Stripe TEST positiv | BLOCKED | Seller PLANNED, Tax Readiness offen |
| Gesellschaftsgründung | OFFEN | organisatorisch/extern |
| Production | OPEN / NICHT FREIGEGEBEN | kein Production-Write, kein Stripe LIVE |

## Offene Risiken und Entscheidungen

- Finale Rechts-, Datenschutz-, Dokumentkatalog-, Betreiberangaben- und
  Kassa-Freigabe für reale Betriebe.
- Steuerliche Einordnung des kostenlosen Piloten und finale Tax-Konfiguration.
- Verifizierter Seller nach Gesellschaftsgründung.
- Positiver Stripe-TEST-Gesamtflow erst nach Seller-/Tax-Freigabe.
- Physischer Langzeitnachweis des Trialendes und des 60-Tage-Fensters bleibt
  naturgemäß offen; die deterministischen Zeitgrenzen sind technisch geprüft.
- Rechtlich ungeprüfter Punkte-/Belohnungsverfall und physische Löschung bleiben
  gesperrt.

## Status

`BASIC V1 TECHNICAL CORE AND STAGING DAILY FLOW PASS / LEGAL, TAX, SELLER,
STRIPE TEST POSITIVE AND PRODUCTION GATES OPEN / NOT READY FOR PRODUCTION`
