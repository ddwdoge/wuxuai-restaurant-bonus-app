# Data Processing Roles

Status: Arbeitsgrundlage für externe Datenschutzprüfung.

## Restaurant

Das Restaurant entscheidet über Zweck und Ausgestaltung seines Bonusprogramms, Punktebedingungen, Punkteeinlösungen, Beschwerdebearbeitung und Kundenkommunikation. Es ist Betreiber des Bonusprogramms und Ansprechpartner für programmspezifische Rechte und Beschwerden.

## WUXUAI

WUXUAI stellt Hosting, Mandantentrennung, Kundenportal, Punkte- und Einlöseprozesse, Audit, technische Exporte und Sicherheitsfunktionen bereit. Die konkrete datenschutzrechtliche Rollenverteilung und ein erforderlicher Auftragsverarbeitungsvertrag müssen extern geprüft werden.

## Kunde

Kunden nutzen ein restaurantbezogenes Bonuskonto ohne allgemeine Wallet. Marketing- und Geburtstagsverarbeitung sind freiwillig. Kernnutzung und Marketingeinwilligung sind technisch getrennt.

## Datenminimierung

- Keine Service-Role im Frontend.
- Keine vollständigen IP-Adressen im Legal-Nachweis.
- Keine Tokens, PINs, Auth-Header oder Einlösecodes in Audit-Metadaten.
- Public-Zugriff nur über schmale RPCs.
- Exakter Kundenstandort wird durch die Restaurantsuche nicht gespeichert.
