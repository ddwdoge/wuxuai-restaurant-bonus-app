# Reward Accounting Export

Der Owner-Export enthält, soweit technisch vorhanden:

- Restaurant- und Reward-ID
- Name, Kategorie und optional regulären Verkaufspreis
- verbrauchte Punkte
- Einlösezeitpunkt und Status
- Mitarbeiterbestätigung als technischer Status
- maskierte Einlösereferenz statt vollständigem sechsstelligen Code
- optionale Beleg- und Steuerkategorie
- Storno-/Korrekturreferenz
- Audit-Event-ID

Filter der RPC: Zeitraum, Reward und Status. Die V1-Oberfläche exportiert standardmäßig die letzten zwölf Monate als CSV. Mitarbeiterfilter ist nur möglich, wenn ein belastbarer Mitarbeiterbezug in den Einlösedaten vorhanden ist; dieser fehlt in einzelnen historischen Datensätzen.

Hinweis: Die steuerliche und kassentechnische Behandlung von Punkteeinlösungen ist mit der Buchhaltung oder Steuerberatung des Restaurants abzustimmen. WUXUAI stellt technische Aufzeichnungen bereit und erteilt keine Steuerberatung.
