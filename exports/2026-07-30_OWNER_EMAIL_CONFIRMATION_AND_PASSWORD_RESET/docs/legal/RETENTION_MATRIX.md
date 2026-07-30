# Retention Matrix

Status: Konfigurierbare technische Kategorien; Fristen vor Production rechtlich prüfen.

| Kategorie | Technischer Startwert | Zweck | Ausführung |
| --- | ---: | --- | --- |
| Aktive Mitgliedschaft | ohne automatische Frist | Laufendes Bonuskonto | Keine automatische Löschung |
| Inaktive Mitgliedschaft | 24 Monate | Reaktivierung / Rechteprüfung | Nur Dry-Run |
| Einlösungen | 84 Monate | Nachweis / Buchhaltung | Nur Dry-Run |
| Audit-Logs | 36 Monate | Sicherheit / Nachvollziehbarkeit | Nur Dry-Run |
| Consent-Nachweise | 84 Monate | Einwilligungsnachweis | Nur Dry-Run |
| Push-Subscriptions | 12 Monate inaktiv | Zustellfähigkeit | Nur Dry-Run |
| Testdaten | 1 Monat | Staging-Qualität | Nur Dry-Run |
| Supportfälle | 24 Monate | Beschwerdebearbeitung | Nur Dry-Run |

`preview_retention_cleanup` zählt ausschließlich Kandidaten. Die Funktion löscht oder anonymisiert keine Daten. Konkrete Fristen und Sperr-/Anonymisierungsregeln benötigen externe Freigabe.
