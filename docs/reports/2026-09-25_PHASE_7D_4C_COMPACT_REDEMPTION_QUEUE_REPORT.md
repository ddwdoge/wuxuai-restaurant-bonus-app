# Phase 7D.4C – kompakte Staff-/Owner-Einlöse-Queue

Stand: 25.09.2026. Ausschließlich lokaler Code Lock im Worktree `/private/tmp/wuxuai-7c5d.8Ablo7/repo`; kein Commit, Push, Staging- oder Production-Zugriff.

## Ursache und Änderung

Die bisherige Queue renderte alle offenen Anträge untereinander mit großen 16:9-Bildern. Dadurch wuchs die Staff-Startseite mit jeder Anfrage und verdrängte Hauptaktionen. Die Darstellung wurde ausschließlich in `SecureRedemptionQueue.tsx`, `staff-premium.css` und der reinen Ordnungsfunktion `secureRedemptionQueuePresentation.ts` geändert.

- Abschnittstitel „Offene Einlösungen · N“; Queue-Track mit fester Höhe von 242 CSS-px, 72–80-px-Quadrat-Thumbnail und `object-fit: cover`.
- Mobil und Tablet eine Karte, ab 920 CSS-px zwei Karten nebeneinander; internes horizontales Scroll-Snap, manuelles Scrollen, 44×44-px-Pfeile, Positionsanzeige und bei mehr als zwei Anträgen ein „Alle anzeigen“-Dialog. Keine automatische Rotation.
- Erste Antwort nach frühestem Ablauf sortiert; spätere Antworten behalten die Reihenfolge vorhandener Request-IDs und hängen neue Anträge am Ende an. Doppelte IDs werden nur einmal gezeigt. Die ausgewählte Karte bleibt per ID stabil; nach Entfernung rückt die nächste Karte kontrolliert nach und erhält den Tastaturfokus.
- Verfallene Karten zeigen den Ablaufstatus und erlauben keine Bestätigung. Confirm/Reject verwendet weiterhin die Request-ID und Correlation-ID der konkreten serverseitig gelieferten Karte; ein synchroner UI-In-Flight-Schutz verhindert Doppelklicks. Backend, Redemption-State-Machine und Pollingintervall blieben unverändert.
- Vor jeder Anzeige gilt unverändert die serverseitige Queue-Antwort `STAFF` oder `OWNER` für den aktuellen Restaurant-Slug. Portalzugang von `ADMIN`/`MANAGER` allein zeigt keine Queue. Verspätete Antworten für einen alten Slug werden durch den bestehenden Generation-/Sequenzschutz ignoriert.
- DE/EN/FR/IT/ES/ZH/KO, ARIA-Labels, Tastaturbedienung, Fokus-Rückgabe nach Dialogschluss und Reduced-Motion-Verhalten sind berücksichtigt.

Neue lokale Tests: `phase-7d4c-queue-presentation.test.mjs` sowie ein isolierter Chromium-/WebKit-Harness mit synthetischen Antworten. Die Browser-Mocks dienen ausschließlich der UI-Prüfung; sie sind kein echter authentifizierter Staging-Flow.

## Nachweise

| Gate | Ergebnis |
| --- | --- |
| Queue 0/1/2/5/10 | PASS; Pfeile nur bei mehr als einer Karte, „Alle anzeigen“ ab drei Karten |
| 24 neue Anträge / 24 gleichzeitige Poll-Antworten | PASS; keine Duplikate, aktive Karte und bestehende Reihenfolge stabil |
| Ablauf / Confirm / Reject | PASS im lokalen UI-Harness; eine aufgezeichnete Aktion je bewusstem Klick, abgelaufene Karte blockiert |
| Slug-/Tenant-Wechsel und verspätete Antwort | PASS; keine alte Queue unter neuem Slug |
| Rollen | Owner/Staff Queue sichtbar nach Serverantwort; Admin/Manager-Portal erhalten, Queue verborgen; Customer/Anonymous kein Portal |
| Dialog und Navigation | Abbrechen/X/Escape, Pfeile, Tastaturfokus, manuelles horizontales Scrollen; 0 Mutationsaufrufe aus reiner Navigation |
| Browser/Sprachen/Breiten | 274 Chromium-/WebKit-Checks; DE/EN/FR/IT/ES/ZH/KO und 320/375/390/430/767/768/1024/1440 CSS-px PASS |
| Layout | Track-Höhe 242 CSS-px, 72–80-px-Thumbnails, Touchziele ≥44 CSS-px, kein horizontaler Seitenoverflow |
| Fokussierte Tests | 20/20 PASS einschließlich Staff-PIN-CSS-Regression; neue Queue-Helfertests 5/5 PASS |
| Full Tests | 2.001/2.001 PASS |
| Typecheck / Lint / Build | PASS / 0 Fehler, 8 vorbestehende Warnungen / PASS |
| Secret Scan / Diff-Checks | PASS / PASS |

Der Build verwendete ausschließlich lokale, nicht-geheime Platzhalter für öffentliche Browserbindungen und wurde nicht deployed. Browser-Mock-Aktionszähler sind keine Datenbankwrites; die serverseitige Exactly-once-Finalisierung ist in diesem Auftrag unverändert geblieben und wird hier nicht neu als physisch geprüft behauptet.

## Unverändert und offene Gates

Der Customer-Einlösungsdrawer, PIN, Swipe, Countdown, Recovery, Redemption-RPCs, Edge-Funktion, Rollen-/Tenant-Autorisierung, Geschäftsdaten und alle Migrationen blieben unverändert. Migration 172 SHA-256 vor/nachher: `a58900bea614382673da57a70b5def1ae719c2807d2a10a0fe06ad1a2e1b0929`. Keine neue Migration. Keine Staging-/Stripe-/Production-Aktion, kein Commit und kein Push. Vorbestehende 7D.4B-Arbeit und fremde Worktree-Dateien wurden nicht in den 7D.4C-Scope übernommen.

Offen bleiben Staging-Migration 172, kontrollierte historische Token-Reconciliation und ein separat autorisierter physischer Staging-Resttest mit legitimen Rollen. Es wird kein FINAL LOCK behauptet.

Status: **PHASE 7D.4C COMPACT REDEMPTION QUEUE LOCAL CODE LOCK / MIGRATION 172 UNCHANGED / STAGING MIGRATION, TOKEN RECONCILIATION AND PHYSICAL RESTGATE OPEN**.
