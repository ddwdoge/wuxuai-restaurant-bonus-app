# PRO-Benachrichtigungen – Consent-, Widerrufs- und Retention-Entwurf

Status: **DRAFT FUER ANWALTLICHE UND FACHLICHE PRUEFUNG**
Stand: 28.09.2026

Dieses Dokument ist keine Rechtsfreigabe und aktiviert keinen Versand, keine
reale In-App-Sichtbarkeit und keinen Customer-Mail-Scheduler.

## 1. Technisch nachgewiesener Ist-Stand

| Kanal / Ereignis | Technischer Stand | Reale Aktivierung |
| --- | --- | --- |
| In-App / neues Angebot | Tenant- und customergebundene Inbox, Deduplizierung, gelesen/ungelesen, erneute PRO-Pruefung beim Abruf | Nur synthetische Customer in exakt markierten TEST_ONLY-Tenants auf STAGING |
| In-App / Belohnung erstmals erreicht | Wie oben; Ereignis nur bei erstmaligem Schwellenuebergang | Nur synthetische Customer in exakt markierten TEST_ONLY-Tenants auf STAGING |
| E-Mail / neues Angebot | Restaurantbezogener, versionierter Einwilligungs- und Widerrufspfad vorhanden; Dispatcher bleibt deaktiviert | Keine reale Zustellung in diesem Gate |
| E-Mail / Belohnung erreicht | Kein freigegebener eigener Einwilligungsvertrag | Fail-closed, kein Versand |

Downgrade, Ablauf oder Widerruf der PRO-Berechtigung blendet bestehende
PRO-Inboxeintraege serverseitig aus und verhindert neue Eintraege. Bestehende
Eintraege werden dadurch nicht pauschal geloescht.

## 2. Entscheidungsvorschlag – noch nicht freigegeben

| Frage | Technischer Vorschlag | Entscheidung erforderlich |
| --- | --- | --- |
| Angebots-E-Mail | Ausdrueckliche, freiwillige, restaurant- und kanalbezogene Einwilligung mit Version und Zeitstempel | Rechtsgrundlage, Inhalt der Einwilligung, Nachweisumfang |
| Reward-E-Mail | Eigener, vom Angebots-Consent getrennter Vertrag; bis dahin immer blockiert | Einordnung als Serviceinformation oder Werbung; Opt-in-Erfordernis |
| Angebots-In-App | Eigene restaurantbezogene Praeferenz; bis zur Entscheidung nur TEST_ONLY | Einwilligung/Rechtsgrundlage, Standardzustand, Widerrufswirkung |
| Reward-In-App | Keine automatische Gleichsetzung mit Angebotswerbung | Rechtliche Einordnung und erforderliche Nutzersteuerung |
| Widerruf | Wirkung vor jeder Reservierung und unmittelbar vor jeder Zustellung beziehungsweise Sichtbarkeit pruefen | Wirkung auf bereits erzeugte Eintraege und Auditnachweis |
| Downgrade | Sofort keine Sichtbarkeit und keine neue Erzeugung; Historie bleibt intern bis zur Retention-Entscheidung | Auskunfts-/Exportumfang nach Downgrade |
| Aufbewahrung | Ereignisse, Lesestatus und Consent-Nachweise getrennt behandeln | Konkrete Fristen, Loeschung oder Anonymisierung, Sperrfristen |
| Restaurantbeendigung | Keine weitere Zustellung; Zugriff und Historie fail-closed | Export, Loeschung, Aufbewahrung und Verantwortlichkeiten |

## 3. Mindestanforderungen fuer einen spaeteren Realbetrieb

- Einwilligungen duerfen nicht aus bestaetigter E-Mail-Adresse, Mitgliedschaft
  oder PRO-Status abgeleitet werden.
- Consent ist pro Restaurant, Kanal und Ereignisklasse versioniert und
  widerrufbar.
- Der aktuelle Consent und das aktuelle PRO-Entitlement werden unmittelbar vor
  einer Zustellung beziehungsweise sichtbaren Ausgabe serverseitig geprueft.
- Widerruf, Downgrade und Restaurantbeendigung sind fail-closed und duerfen
  keine weitere Nachricht erzeugen.
- Deduplizierung, Retry und Audit speichern keine Nachrichtentexte, Tokens oder
  andere Credentials.
- Retention wird erst nach festgelegter Frist und dokumentierter Loesch- oder
  Anonymisierungsregel implementiert.

## 4. Offene Freigaben

1. Rechtliche Einordnung jeder der vier Kanal-/Ereigniskombinationen.
2. Wortlaut, Versionierung und Nachweis der jeweiligen Einwilligung.
3. Exakte Widerrufswirkung auf bereits erzeugte In-App-Eintraege.
4. Aufbewahrungs-, Export-, Loesch- und Anonymisierungsfristen.
5. Verantwortlichkeiten von Plattform, Restaurant und Customer.

Bis zu diesen Entscheidungen bleiben reale Customer, Production, E-Mail-
Dispatcher und allgemeine PRO-Freigabe gesperrt.
