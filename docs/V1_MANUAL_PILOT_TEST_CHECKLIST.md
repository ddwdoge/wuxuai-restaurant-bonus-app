# WUXUAI Restaurant Bonus V1 - Manuelle Pilot-Checkliste

Diese Liste enthält nur Prüfungen, die ein Mensch mit echtem Postfach oder
echtem Gerät durchführen muss. Keine Zugangsdaten, Codes oder Kundendaten in
Screenshots oder Notizen aufnehmen.

## A. Echte E-Mail-Bestätigung

[ ] Mit einer neuen Staging-Testadresse ein Kundenkonto erstellen.  
Erwartetes Ergebnis: Eine Bestätigungs-E-Mail kommt an und zeigt den richtigen Absender.  
Fehler gefunden:  
Notiz:

[ ] Den Bestätigungslink einmal öffnen.  
Erwartetes Ergebnis: Die Seite öffnet `bonus.wuxuaisbi.com`, bestätigt das Konto und führt zum richtigen Restaurant zurück.  
Fehler gefunden:  
Notiz:

[ ] Den Link ein zweites Mal sowie nach Ablauf öffnen.  
Erwartetes Ergebnis: Ein verständlicher Hinweis erscheint; es entsteht kein zweites Konto.  
Fehler gefunden:  
Notiz:

[ ] Abmelden und mit E-Mail und Passwort erneut anmelden.  
Erwartetes Ergebnis: Anmeldung und Abmeldung funktionieren ohne Fehlerschleife.  
Fehler gefunden:  
Notiz:

## B. iPhone Safari

[ ] Restaurant-QR in einer frischen Safari-Sitzung öffnen und anmelden.  
Erwartetes Ergebnis: Das richtige Restaurant und nur dessen Punkte und Geschenke erscheinen.  
Fehler gefunden:  
Notiz:

[ ] Ein verfügbares Geschenk öffnen und die Einlösung bestätigen.  
Erwartetes Ergebnis: Die Live-Einlösung startet einmal und zeigt 15:00 Minuten.  
Fehler gefunden:  
Notiz:

[ ] Während der Live-Einlösung neu laden.  
Erwartetes Ergebnis: Dieselbe Einlösung und dieselbe serverseitige Ablaufzeit bleiben erhalten.  
Fehler gefunden:  
Notiz:

[ ] Safari schließen, erneut öffnen und vor Ablauf zum Geschenk zurückkehren.  
Erwartetes Ergebnis: Die laufende Einlösung wird wiederhergestellt und nicht neu gestartet.  
Fehler gefunden:  
Notiz:

## C. Installierte PWA

[ ] Die App über „Zum Home-Bildschirm“ installieren und öffnen.  
Erwartetes Ergebnis: Kundenkonto und Restaurantkontext laden ohne leere oder veraltete Seite.  
Fehler gefunden:  
Notiz:

[ ] Eine Live-Einlösung starten, App schließen und wieder öffnen.  
Erwartetes Ergebnis: Die Serverzeit bleibt maßgeblich; der Countdown wird nicht zurückgesetzt.  
Fehler gefunden:  
Notiz:

[ ] Zwischen Safari und PWA vergleichen.  
Erwartetes Ergebnis: Getrennte Sitzungen werden verständlich behandelt; kein fremder Restaurantzustand erscheint.  
Fehler gefunden:  
Notiz:

## D. Screenshot-Schutz

[ ] Während einer Live-Einlösung einen Screenshot erstellen.  
Erwartetes Ergebnis: Der Screenshot ist erkennbar statisch; in der echten Ansicht bewegen sich Sekundenzeit, Countdown und Live-Merkmal weiter.  
Fehler gefunden:  
Notiz:

[ ] Den Screenshot später einem Mitarbeiter zeigen.  
Erwartetes Ergebnis: Er wird nicht mit der zu diesem Zeitpunkt laufenden Live-Ansicht verwechselt.  
Fehler gefunden:  
Notiz:

## E. Kellner-Test

[ ] Einem Mitarbeiter die echte Live-Einlösung nur ein bis zwei Sekunden zeigen.  
Erwartetes Ergebnis: Restaurant, Geschenkname, Gültigkeit und Live-Status werden sofort verstanden.  
Fehler gefunden:  
Notiz:

[ ] Dieselbe Einlösung auf einem zweiten Gerät öffnen.  
Erwartetes Ergebnis: Es entsteht keine zweite Einlösung und die Ablaufzeit ist identisch.  
Fehler gefunden:  
Notiz:

## F. Echte Geburtstags-E-Mail

[ ] Einen kontrollierten Staging-Geburtstag 14 Tage im Voraus auslösen.  
Erwartetes Ergebnis: Genau ein Geschenk und genau eine E-Mail entstehen.  
Fehler gefunden:  
Notiz:

[ ] E-Mail auf Desktop und Mobilgerät öffnen.  
Erwartetes Ergebnis: Restaurantname, Geschenkname und „Geschenk ansehen“ sind lesbar; der Button führt nach Anmeldung zum richtigen Restaurant.  
Fehler gefunden:  
Notiz:

[ ] Den Birthday-Cron erneut ausführen.  
Erwartetes Ergebnis: Kein zweites Geschenk und keine zweite Zuteilungs-E-Mail entstehen.  
Fehler gefunden:  
Notiz:

[ ] Drei Tage vor Ablauf den Reminder prüfen.  
Erwartetes Ergebnis: Genau eine Erinnerung kommt nur für ein noch aktives Geschenk.  
Fehler gefunden:  
Notiz:

## G. Echte Punkte-E-Mail

[ ] Punktestand von unterhalb auf genau die benötigte Schwelle erhöhen.  
Erwartetes Ergebnis: Genau eine E-Mail nennt Restaurant und Belohnung und führt zum richtigen Bonuskonto.  
Fehler gefunden:  
Notiz:

[ ] Weitere Punkte oberhalb derselben Schwelle sammeln.  
Erwartetes Ergebnis: Keine weitere E-Mail für dieselbe Schwellenphase.  
Fehler gefunden:  
Notiz:

[ ] Punkte unter die Schwelle bringen und später erneut überschreiten.  
Erwartetes Ergebnis: Eine neue E-Mail darf jetzt wieder entstehen.  
Fehler gefunden:  
Notiz:

## H. Geräteabschluss

[ ] Android Chrome: Login, QR, Geschenk und Live-Einlösung prüfen.  
Erwartetes Ergebnis: Keine abgeschnittenen Inhalte, alle Aktionen erreichbar.  
Fehler gefunden:  
Notiz:

[ ] Desktop Safari und Desktop Chrome prüfen.  
Erwartetes Ergebnis: Login, E-Mail-Link und Live-Einlösung funktionieren ohne Konsolenfehler.  
Fehler gefunden:  
Notiz:

[ ] Bildschirm sperren, App fortsetzen, drehen und Browser-Zurück verwenden.  
Erwartetes Ergebnis: Kein Timer-Neustart, kein falscher Restaurantkontext und kein horizontaler Überlauf.  
Fehler gefunden:  
Notiz:
