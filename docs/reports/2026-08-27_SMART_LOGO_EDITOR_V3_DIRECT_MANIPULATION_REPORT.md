# Smart Logo Editor V3 - Direct Manipulation

## Ursache

Der kompakte V2-Editor war technisch korrekt, verlangte aber weiterhin drei
separate Steuergruppen fuer Skalierung und Position. Auf mobilen Geraeten war
die Beziehung zwischen Fingerbewegung und Logoergebnis dadurch weniger direkt
als noetig. V3 verlagert die Hauptinteraktion deshalb in die Live-Vorschau.

## Geaenderte Dateien

- `src/modules/admin/pages/SettingsPage.tsx`
- `src/shared/components/AppDrawer.tsx`
- `src/shared/logoPresentation.mjs`
- `src/shared/logoPresentation.d.mts`
- `src/styles.css`
- `tests/owner-smart-logo-presentation.test.mjs`
- `docs/19_CHANGELOG.md`
- `design-qa.md`

## Was wurde geaendert

- Ein-Pointer-Ziehen aktualisiert die bestehenden Positionswerte X/Y.
- Zwei-Pointer-Gesten zoomen innerhalb der bestehenden Skalierungsgrenzen.
- Mausrad beziehungsweise Trackpad zoomen nur innerhalb der Logo-Buehne.
- Pfeiltasten positionieren das Logo; mit Umschalttaste erfolgt ein groesserer
  Schritt.
- Kompakte Plus-/Minus-Aktionen bleiben als barrierefreie Alternative erhalten.
- Automatisch einpassen, Zuruecksetzen und Doppelklick auf die Vorschau bleiben
  klar getrennte Aktionen.
- Der grosse Bereich `2. Anpassungen` wurde entfernt.
- Vier reale Kontextvorschauen sind horizontal durchsuchbar und verwenden
  dieselben Praesentationswerte wie die Hauptvorschau.
- Der Logo-Drawer ist auf Desktop auf maximal 680 Pixel Hoehe begrenzt.

## Was wurde nicht geaendert

- Smart-Logo-Erkennung, Auto-Fit-Algorithmus und Grenzwerte.
- Logo-Datei, Storage-Vertrag oder Upload.
- Persistenzfelder, Datenbank, RLS oder Rollen.
- QR-Payloads, Punkte-, Reward-, Referral- oder sonstige Bonuslogik.
- Production und Stripe.

## Staging

- Finaler Deployment-Stand: `b962b6f8-09fa-4ec3-9578-944456f8f5d2`.
- Autoritativer Commit: `406c926ebf55737069db4c73a5597cdd83db5e3f`.
- Ein erster V3-Build (`450e2056-...`) wurde ohne exportierte
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` erzeugt und zeigte deshalb keine
  Live-Daten. Der Fehler wurde unmittelbar erkannt; der finale Build wurde mit
  der bestaetigten Staging-Konfiguration neu gebaut und live verifiziert.
- Owner-Seite und Editor laden im finalen Build authentifiziert.
- Plus/Minus, Tastaturpositionierung sowie identische Aktualisierung aller
  Vorschauen wurden live geprueft.
- Eine sichere Testanpassung wurde gespeichert, nach Reload exakt wieder
  geladen und anschliessend auf den urspruenglichen Zustand zurueckgesetzt.

## Responsive und Accessibility

- 390, 430, 768, 1024 und 1366 x 768 ohne globales horizontales Ueberlaufen.
- Kein Drawer-Ueberlaufen; Desktop-Drawerhoehe 680 Pixel.
- Der mobile Kontextstreifen ist per Touch horizontal bedienbar und zeigt
  keinen nativen Browser-Scrollbar.
- Safe Area, Fokuszustand, Tastatursteuerung und beschriftete 44-Pixel-Aktionen
  bleiben vorhanden.

## Qualitaet

- Tests: 1044/1044 PASS.
- Typecheck: PASS.
- Lint: PASS, 0 Fehler und 7 bestehende Warnungen ausserhalb dieses Scopes.
- Build: PASS.
- `git diff --check`: PASS.
- Secret-Pruefung der Aenderungen: PASS.
- Migration: keine.

## Offene Risiken

Die Browser- und Codepruefung kann keine echte Zwei-Finger-Geste auf einem
physischen iPhone ersetzen. Drag und Pinch sind implementiert und die
Umrechnungs-/Grenzlogik ist automatisiert getestet; fuer `FINAL LOCK` fehlt
noch der reale iPhone-Safari-Test fuer Drag, Pinch und Save/Reload.

Status: CODE LOCK
