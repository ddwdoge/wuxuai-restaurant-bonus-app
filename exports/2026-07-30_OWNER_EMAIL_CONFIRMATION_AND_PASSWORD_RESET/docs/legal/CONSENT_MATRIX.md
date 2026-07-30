# Consent Matrix

| Vorgang | Kategorie | Voraussetzung | Widerruf |
| --- | --- | --- | --- |
| Punktebuchungsbestätigung | TRANSACTIONAL | Aktive Mitgliedschaft / Vorgang | Nicht als Marketingeinwilligung geführt |
| Ablaufhinweis | PROGRAM_SERVICE | Aktives Bonusprogramm; Push zusätzlich aktiv vom Kunden eingerichtet | Push-Subscription deaktivierbar |
| Marketing-Push | MARKETING | `marketing_push = granted` | Sofort für künftige Nachrichten |
| Marketing-SMS | MARKETING | `marketing_sms = granted` | Sofort für künftige Nachrichten |
| Marketing-E-Mail | MARKETING | `marketing_email = granted` | Sofort für künftige Nachrichten |
| Personalisierte Empfehlungen | optional | `personalized_recommendations = granted` | Sofort |
| Geburtstag | optional | `birthday_processing = granted` | Künftige Verarbeitung stoppen; bestehende Nachweise geprüft behandeln |

Unbekannt, `denied` und `withdrawn` gelten nicht als Marketingfreigabe. Die Bestandskundenausnahme wird nicht automatisch aktiviert.
