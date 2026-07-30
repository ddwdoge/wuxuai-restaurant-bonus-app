# WUXUAI Bonus V1 – Staff Portal QR-Scanner Button Fix

Status: **LOCK**

## Gelesene Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/06_STAFF_PORTAL.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` existiert in diesem Workspace nicht.

## Ursache

Der Button „QR scannen“ im Staff Portal hatte zwar ein `onClick`, wechselte aber nur in die Suche:

```text
setView("search")
```

Es wurde kein Scanner-State aktiviert, keine Kamera geöffnet, keine Scanner-Komponente gerendert und kein Fehler sichtbar angezeigt.

## Geänderte Dateien

- `src/modules/staff/StaffTablet.tsx`
- `src/styles.css`
- `docs/reports/2026-07-11_STAFF_PORTAL_QR_SCANNER_BUTTON_FIX_REPORT.md`

## Fix

Beim Klick auf „QR scannen“ passiert jetzt sichtbar:

- Scanner-Panel wird geöffnet.
- Kamera-Zugriff wird über `navigator.mediaDevices.getUserMedia` angefragt.
- Wenn der Browser `BarcodeDetector` unterstützt, wird QR automatisch gelesen.
- Wenn `BarcodeDetector` nicht verfügbar ist, bleibt die Kamera sichtbar geöffnet und eine deutsche Fallback-Meldung erscheint.
- Wenn Kamera-Zugriff nicht möglich ist, erscheint eine klare deutsche Fehlermeldung.
- Manuelle Eingabe von QR-Code, Telefon, Name oder Gästecode ist im Scanner-Panel möglich.
- Scanner lässt sich schließen.

## Keine Produktlogik geändert

Nicht geändert:

- Punkte-Logik
- Tages-PIN-Logik
- RPCs
- Datenbank
- RLS
- Reward-Logik
- Business-Regeln

## Sichtbare UI-Texte

Alle neu eingefügten sichtbaren Texte sind Deutsch:

- „Kamera öffnen“
- „QR scannen“
- „Kamera wird geöffnet...“
- „QR-Code vor die Kamera halten.“
- „Kamera-Zugriff wurde abgelehnt. Bitte erlaube die Kamera oder suche den Gast manuell.“
- „Keine Kamera gefunden. Bitte suche den Gast manuell.“
- „QR-Code manuell eingeben“
- „Scanner schließen“

## Validierung

Codeprüfung:

- Button „QR scannen“ ruft jetzt `startQrScanner()` auf.
- Scanner-State wird gesetzt.
- Kamera-Permission wird angefragt.
- Fehlerfälle werden sichtbar angezeigt.
- Keine stillen Fehler.

Build:

```text
npm run build
erfolgreich
```

Nicht live geprüft:

- Echte Kamera-Permission im Browser mit physischer Kamera.
- Automatisches QR-Decoding über `BarcodeDetector` auf einem konkreten Gerät.

## Offene Risiken

- Nicht jeder Browser unterstützt `BarcodeDetector`. Dafür ist ein sichtbarer Fallback vorhanden.
- Kamera-Zugriff hängt von Browser, HTTPS/Localhost und Geräteberechtigung ab.

## Status

**LOCK**
