# WUXUAI Bonus V1 – AT KYB-/Rechtstext-Matrix

Status: **TECHNISCHER ENTWURF / ANWALTLICHE PRÜFUNG OFFEN**
Stand: 27.09.2026

Diese Matrix trennt Plattformanbieter, Restaurantbetreiber und Endnutzer. Sie
legt keine neue gesetzliche Pflicht, keinen endgültigen Dokumentkatalog und
keine Aufbewahrungsfrist fest.

## Rollen

| Rolle | Technische Bedeutung | Öffentliche Darstellung |
|---|---|---|
| WUXUAI | Technischer Plattformanbieter; geplanter SaaS-Vertragspartner gemäß kanonischem Seller-Vertrag | Nur die bestätigte Plattform-/Sellerrolle; keine Restaurant-KYB-Dokumente |
| Restaurant | Betreiber des eigenen Bonusprogramms und Vertragspartner seiner Gäste, soweit anwaltlich bestätigt | Nur aus einem manuell freigegebenen, versionierten Betreiberprofil |
| Kunde | Endnutzer des restaurantbezogenen Bonusprogramms | Eigene Einwilligungen, Annahmen und Rechte; niemals interne KYB-Unterlagen |

## Feld-zu-Dokument-Matrix

`OFFEN` bedeutet: Die Zuordnung muss vor realem KYB beziehungsweise einer
öffentlichen Veröffentlichung anwaltlich entschieden werden.

| Kanonisches Feld | Einmalige Owner-Erfassung | Möglicher Nachweis | Owner-/SaaS-Vertrag | Öffentliche Betreiberangabe | Kundenseitige Rechtstexte | Status |
|---|---|---|---|---|---|---|
| Rechtlicher Unternehmensname | Pflicht | GISA-/Firmenbuchauszug je Fall | Vertragspartner | Betreibername/Impressum | Betreiber des Programms | Zuordnung fachlich plausibel, rechtlich prüfen |
| Rechtsform | Pflicht | Registerauszug je Fall | Parteibezeichnung | Impressum | Betreiberbezeichnung | Rechtlich prüfen |
| Geschäftsanschrift | Pflicht; Restaurantadresse nur nach ausdrücklicher Auswahl | Register-/Unternehmensnachweis je Fall | Zustell-/Vertragsanschrift | Impressum | Datenschutz-/Kontaktangabe | Rechtlich prüfen |
| Kontakt-E-Mail | Pflicht | Verifikation im Produkt, kein Registerbeweis | Vertragskontakt | Kontakt/Impressum | Datenschutz-/Beschwerdekontakt | Zweck und Veröffentlichung rechtlich prüfen |
| Telefon | Optional | Kein V1-Pflichtnachweis festgelegt | Optional | Optional | Optional | **OFFEN** |
| GISA-Zahl | AT-Abgleichsfeld | GISA-Auszug als vorgeschlagener manueller Nachweis | Derzeit keine feste Ausgabe | Nicht automatisch öffentlich | Nicht automatisch öffentlich | **OFFEN** |
| Firmenbuchnummer/-gericht | Nur bei anwendbarer Rechtsform/Eintragung | Firmenbuchauszug | Parteibezeichnung je Fall | Impressum je Fall | Betreiberangabe je Fall | **OFFEN** |
| UID | Optional | Noch kein V1-Prüfvertrag | Abrechnung künftig | Veröffentlichung nicht automatisch | Keine automatische Verwendung | **OFFEN** |
| Vertretungsberechtigte Person/Funktion | Pflicht für den technischen AT-Abgleich | Identitäts-/Vertretungsnachweis als Vorschlag, keine allgemeine Ausweiskopierpflicht behauptet | Zeichnungs-/Vertretungsbezug | Nicht automatisch öffentlich | Nicht automatisch öffentlich | **OFFEN** |
| Kammer/Aufsicht | Optional | Noch kein V1-Prüfvertrag | Keine feste Zuordnung | Mögliche Impressumsangabe | Keine automatische Verwendung | **OFFEN** |
| Beschwerdekontakt | Optional; Fallback Kontakt-E-Mail | Kein Registerbeweis | Keine feste Zuordnung | Kontaktangabe | Beschwerdeweg | **OFFEN** |
| Bonusregeln | Im Produkt konfiguriert, nicht KYB | Produktkonfiguration | Leistungsbeschreibung | Nicht Betreiberidentität | Teilnahmebedingungen | Inhalt rechtlich prüfen |

## Veröffentlichungsgate

- Upload, vollständige Felder oder ein Registertreffer aktivieren nichts.
- Eine künftige Veröffentlichung benötigt eine ausdrückliche, append-only
  protokollierte Platform-Admin-Entscheidung für genau eine unveränderbare
  `VERIFIED`-Profilrevision.
- Ändert der Owner ein verglichenes Betreiberfeld, ist die bisherige Freigabe
  für die aktuelle Fassung nicht mehr gültig; erneute Prüfung ist erforderlich.
- Solange Legal-, Privacy-, Dokumentkatalog- und Retention-Status nicht
  `VERIFIED` sind, bleibt die öffentliche Betreiberquelle fail-closed.
- Private KYB-Dokumente, Ausweise, Objektpfade, signierte URLs und interne
  Prüfnotizen gehören nie in Public-RPCs oder kundenseitige Rechtstexte.

## Vor realem KYB zu entscheiden

1. Verbindlicher Dokumentkatalog je Rechtsform und Ausnahmefall.
2. Zweck und Rechtsgrundlage je Daten-/Dokumentklasse.
3. Verantwortliche Stelle, Empfänger, Prüferrollen und Zugriffsprotokoll.
4. Aufbewahrung, Sperrung, Löschung und Nachweis nach Ablehnung/Beendigung.
5. Öffentliche Pflichtfelder je Betreiberform und konkretem Rechtstext.
6. Kriterien, Vier-Augen-Prinzip und Gültigkeitsdauer der manuellen Freigabe.
7. Nachforderung, erneute Prüfung und Umgang mit relevanten Stammdatenänderungen.
