# WUXUAI Bonus V1 – Engineering Bible Tages-PIN LOCK Report

Datum: 2026-07-09  
Status: **LOCK**

---

## Aufgabe

Die CTO-Entscheidung zur Tages-PIN für Punkte sammeln und zur PIN-losen
Belohnungseinlösung wurde in die Engineering Bible übernommen.

Scope war ausschließlich Dokumentation.

Nicht geändert:

- keine UI
- keine Datenbank
- keine Migration
- keine RPC
- keine Produktlogik im Code

---

## Aktualisierte Dateien

- `docs/06_STAFF_PORTAL.md`
- `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- `docs/11_FLOW_04_PUNKTE_SAMMELN.md`
- `docs/13_SMART_REWARD_ENGINE.md`
- `docs/17_CTO_ENTSCHEIDUNGEN.md`
- `docs/19_CHANGELOG.md`

Hinweis:

Der Auftrag nennt `docs/10_FLOW_03_PUNKTE_SAMMELN.md`.
Diese Datei existiert in der aktuellen Bible-Struktur nicht.
Die echte Zuordnung ist:

- Flow 03: `docs/10_FLOW_03_BELOHNUNG_EINLOESEN.md`
- Flow 04 Punkte sammeln: `docs/11_FLOW_04_PUNKTE_SAMMELN.md`

Beide relevanten Dateien wurden aktualisiert.

---

## Neue LOCK-Regel

### Punkte sammeln

Punkte sammeln braucht in V1 immer eine automatisch erzeugte Tages-PIN.

Regel:

- 4-stellig
- pro Restaurant / Filiale täglich neu
- gültig bis 23:59
- serverseitig gespeichert
- serverseitig geprüft
- sichtbar nur in der Mitarbeiteransicht
- keine manuelle PIN-Verwaltung durch Restaurantbesitzer

Keine Punktebuchung darf ohne korrekte Tages-PIN erfolgen.

### Belohnung einlösen

Belohnung einlösen braucht in V1 keine PIN.

Regel:

- Gast öffnet freigeschaltete Belohnung
- Gast bestätigt final
- nach Bestätigung ist die Belohnung verbraucht
- Belohnung ist nicht erneut einlösbar
- Server prüft Restaurant, Gast, Belohnung, Status und Einmalverwendung
- Audit Log wird geschrieben

Verboten:

- persönliche Kellner-PIN auf dem Kundenhandy
- manuelle PIN-Verwaltung durch Restaurantbesitzer
- Tages-PIN für Belohnungseinlösung verwenden

---

## Sicherheitsbewertung

Die neue Regel trennt zwei Sicherheitsfälle klar:

- Punkte sammeln ist missbrauchsanfällig und wird durch die Tages-PIN geschützt.
- Belohnung einlösen ist final und wird durch Bestätigung, Serverprüfung und Einmalverwendung geschützt.

Die Tages-PIN bleibt im Mitarbeiterkontext.
Der Gast sieht keine persönliche Kellner-PIN.

---

## Build

Nicht ausgeführt.

Grund:

Der Auftrag war ausdrücklich dokumentations-only und verlangte keinen Build,
außer das Projekt verlangt ihn automatisch.

---

## Offene Risiken

- Der bestehende Code kann noch ältere Staff-PIN-, Redemption-Code- oder
  Staff-Session-Logik enthalten.
- Diese Aufgabe hat nur die Engineering Bible aktualisiert.
- Eine spätere Implementierungsaufgabe muss den Code explizit gegen diese
  neue LOCK-Regel abgleichen.

---

## Ergebnis

Engineering Bible aktualisiert.

Status: **LOCK**
