# V1-/V2-Diff-Matrix

Datum: 2026-07-30

Verglichen wurden V1 `b9b2647` und der vollstaendige V2-Snapshot `c79a2b0`.
Die Matrix bewertet fachliche Bereiche; technische Legacy-Namen bleiben
unveraendert, solange sie keinen sichtbaren V2-Flow aktivieren.

| Datei/Bereich | Funktion | V1 | Nur V2 | Gemeinsamer Bugfix | Entscheidung | Begruendung |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `src/modules/admin/pages/RestaurantOnboarding.tsx` | Restaurant-Onboarding | Ja | Teilweise | Ja | V1-Stand behalten | Mehrfachgeschenke und Bon-/Besuchslogik bleiben; Branchenassistent wird zurueckgestellt. |
| `src/config/businessProfiles.*` | Branchenprofile und Vorschlaege | Nein | Ja | Nein | Zurueckstellen | V2-Produktlogik, in der V1-Referenz nicht vorhanden. |
| `src/config/productTerminology.ts` | neutrale Produktterminologie | Nein | Ja | Nein | Zurueckstellen | V1 bleibt restaurantfokussiert. |
| Willkommensgeschenk-Auswahl | Mehrfachauswahl und Zufallspool | Ja | Nein | Ja | Uebernehmen | Mindestens ein Geschenk, Empfehlung 3-5, serverseitige Zufallszuteilung. |
| Punkteeinloesung im Onboarding | Bon, Besuche, Gastro-Kategorien | Ja | Nein | Ja | Uebernehmen | Gesperrte einfache Restaurant-V1. |
| Bonusprogramm-Assistent | Branchen-/Ziel-/Grosszuegigkeitsautomatik | Nein | Ja | Nein | Zurueckstellen | Nicht Bestandteil der validierten V1-Basis. |
| `AGENTS.md`, `docs/00_*`, `docs/01_*`, `docs/17_*`, `docs/18_*` | Engineering Bible | Ja | V2-Neufassung | Ja | V1-Bible behalten | V1 ist Restaurant First; neutrale Bible bleibt im V2-Archiv. |
| `index.html`, Public/Auth UI | sichtbares Branding | Ja | neutrale Texte | Ja | V1-Baseline behalten | Visuelle Detailfreigabe erfolgt separat; keine neutrale Phase-1-Mischung. |
| `src/modules/customer/CustomerPortal.tsx` | Kundenportal | Ja | nur Textanpassungen | Ja | V1-Baseline behalten | QR-, Token-, Punkte- und Redemption-Sicherheit bleiben erhalten. |
| `src/modules/legal/*` | Legal Center | Ja | nur neutrale Texte | Ja | V1-Baseline behalten | Legal-Migrationen und Tenant-Sicherheit sind gemeinsame V1-Bugfixes. |
| `tests/business-profiles-onboarding.test.mjs` | Branchenprofile | Nein | Ja | Nein | Zurueckstellen | Testet ausschliesslich V2-Profile und Assistent. |
| `tests/neutral-branding-phase1.test.mjs` | neutrale Terminologie | Nein | Ja | Nein | Zurueckstellen | Neutraler Produktstandard ist archivierte V2. |
| sonstige bestehende Tests | V1-Sicherheit und Flows | Ja | Nein | Ja | Uebernehmen | Identitaet, QR, Legal, Audit, Punkte und Einloesung bleiben unveraendert. |
| `supabase/migrations/*` | Datenbankhistorie | Ja | Nein | Ja | Vollstaendig behalten | V2 Phase 1/2 fuegte keine Migration hinzu; kein Schema-Rollback erforderlich. |
| Partnerrestaurant-Finder | optionale Restaurantkarte | Ja | Nein | Ja | Behalten | Bereits vor V2 vorhanden und weiterhin restaurantbezogen. |
| Legal-, Audit- und Aktivitaetsberichte | Sicherheit/Nachweis | Ja | Nein | Ja | Behalten | Spaetere V1-Hardening-Fixes, keine Branchenneutralisierung. |

## Gepruefte gemeinsame V1-Bugfixes

- Restaurant-Slug-Duplikat-Fix und idempotente Aktivierung
- `onboarding_status = completed`
- Legal-Migrationen `20260729004000`, `05000`, `06000`
- Public-Auth-Refresh-Hardening
- Customer Identity V1 ohne SMS und E.164-Normalisierung
- restaurant- und tokenbezogener QR-/Redemption-State
- Referral-Dauer und Bonus-Aktivitaetsjournal
- kompakter Onboarding-Header
- Entfernung des verfruehten Kunden-QR-Tests

## Ergebnis

Die Git-Grenze ist eindeutig: `b9b2647` ist die verifizierte V1-Referenz;
`fcb2625` beginnt den neutralen Umbau. Es wurden keine V2-Dateien selektiv in
V1 kopiert und keine V1-Migration entfernt.
