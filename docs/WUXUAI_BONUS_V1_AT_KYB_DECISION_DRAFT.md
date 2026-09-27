# WUXUAI® Bonus V1 – Österreichischer KYB-Entscheidungsentwurf

Stand: 27.09.2026
Status: **ENTWURF ZUR FACHLICHEN UND ANWALTLICHEN PRÜFUNG – NICHT FREIGEGEBEN**

## 1. Zweck und Abgrenzung

Dieses Dokument schlägt einen möglichst schlanken V1-Vertrag zur manuellen
Prüfung österreichischer Restaurantbetriebe vor. Es ist keine Rechtsberatung,
keine Feststellung einer geldwäscherechtlichen Verpflichtung und keine
Freigabe für reales KYB.

`KYB` bezeichnet hier die produktinterne Prüfung, ob ein Betrieb existiert,
gewerblich plausibel ist und die handelnde Person ihn vertreten darf. Ob
WUXUAI in einem konkreten Geschäftsmodell zusätzlichen gesetzlichen
Identifizierungs- oder Sorgfaltspflichten unterliegt, muss der österreichische
Rechtsberater gesondert beurteilen.

Alle nachfolgend als **Vorschlag** gekennzeichneten Punkte sind
Produktentscheidungen, keine behaupteten gesetzlichen Mindestpflichten.
Insbesondere leitet dieser Entwurf **keine allgemeine gesetzliche Pflicht zur
Anfertigung oder Speicherung einer Ausweiskopie** ab.

## 2. Offizielle Ausgangspunkte

- Das GISA enthält zentrale Daten österreichischer Gewerbebetriebe, darunter
  Name/Firma, Standort und Wortlaut der Gewerbeberechtigung. Für nicht im
  Firmenbuch eingetragene Einzelunternehmen bezeichnet das USP das GISA als
  derzeit einzige authentische Informationsquelle. Öffentlich zugängliche
  gewerberechtliche Daten können kostenlos abgefragt werden
  ([USP – GISA-Auszug und Auskünfte](https://www.usp.gv.at/themen/betrieb-und-umwelt/betriebliches-standortmanagement/weitere-informationen-betriebliches-standortmanagement/gewerberechtliche-aenderungen-weitere-informationen/gisa-auszug-und-auskuenfte.html)).
- Das Firmenbuch ist ein öffentliches Verzeichnis. Es weist unter anderem
  Firmenbuchnummer, Firma, Rechtsform, Sitz/Geschäftsanschrift sowie Beginn und
  Art der Vertretungsbefugnis aus. Die Gewerbeberechtigung wird dadurch nicht
  ersetzt ([USP – Firmenbuch](https://www.usp.gv.at/themen/betrieb-und-umwelt/laufender-betrieb/firmenbuch.html)).
- WiEReG-Abfragen sind nicht als Standardprüfung vorgesehen. Der Zugriff und
  die Nutzung hängen unter anderem von der Eigenschaft als Verpflichteter oder
  einem nachgewiesenen berechtigten Interesse ab
  ([BMF – Register der wirtschaftlichen Eigentümer](https://www.bmf.gv.at/services/wiereg/wiereg-register.html),
  [BMF – Einsicht bei berechtigtem Interesse](https://www.bmf.gv.at/services/wiereg/berechtigtes-Interesse.html)).
- Personenbezogene Daten müssen zweckgebunden, auf das Erforderliche begrenzt,
  nicht länger als nötig gespeichert und angemessen geschützt werden. Die
  verantwortliche Stelle muss außerdem Rechtsgrundlage, Speicherdauer,
  Empfänger und Betroffenenrechte transparent machen
  ([Europäische Kommission – Grundsätze der DSGVO](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en),
  [Europäische Kommission – Rechtsgrundlagen](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data_en),
  [DSGVO, insbesondere Art. 5, 6, 13, 17 und 32](https://eur-lex.europa.eu/legal-content/DE/ALL/?uri=CELEX:32016R0679)).

## 3. Gemeinsamer V1-Grundvertrag – Vorschlag

1. Ein neuer Betrieb bleibt bis zur getrennten manuellen Aktivierung
   `PENDING_ACTIVATION`. Registrierung, Upload oder KYB-Prüfung starten weder
   Trial noch Entitlements, Billing oder Stripe.
2. Strukturierte Betriebsdaten werden im Onboarding genau einmal erfasst. Vor
   dem Upload wird eine Zusammenfassung angezeigt; Korrekturen führen zum
   passenden Stammdatenschritt zurück.
3. Registerdaten werden vor zusätzlichen Dokumenten genutzt. Dokumente werden
   nur verlangt, wenn Registerdaten den Prüfzweck nicht ausreichend erfüllen.
4. Upload und Registertreffer führen nie automatisch zu „verifiziert“ oder
   „aktiv“. Eine berechtigte Prüferin oder ein berechtigter Prüfer entscheidet
   anhand einer dokumentierten Checkliste.
5. Private Dokumente sind ausschließlich für den betroffenen Owner und
   AAL2-geschützte, berechtigte Prüfer sichtbar. Staff, Customer, andere Owner
   und anonyme Nutzer erhalten keinen Zugriff.
6. Nachforderungen müssen einen konkreten Grund, den benötigten Nachweis und
   eine Frist enthalten. Eine pauschale Sammlung „auf Vorrat“ ist ausgeschlossen.

## 4. Fall A – Einzelunternehmen

Dies umfasst nicht eingetragene Einzelunternehmen und – mit zusätzlicher
Firmenbuchprüfung – eingetragene Einzelunternehmen (`e.U.`).

| Prüfschritt | V1-Vorschlag |
|---|---|
| Minimale Onboarding-Angaben | Land, Rechtsform, vollständiger bürgerlicher Name der Inhaberin/des Inhabers, verwendete Geschäftsbezeichnung, Betriebs-/Zustellanschrift, GISA-Zahl bzw. eindeutig abgleichbare Gewerbeberechtigung, Kontaktadresse; Firmenbuchnummer nur bei `e.U.`; Name und Funktion der handelnden Person, falls sie nicht selbst Inhaberin/Inhaber ist. Erforderliche Felder werden mit `*` markiert. |
| Primärer Nachweis | Zuerst manuelle GISA-Abfrage. Ein hochgeladener GISA-Auszug ist nur vorzusehen, wenn die Abfrage nicht eindeutig dokumentiert werden kann oder der Rechtsberater ihn als erforderlichen Aktennachweis festlegt. Bei `e.U.` zusätzlich aktueller Firmenbuchabgleich. |
| Vertretungsberechtigung | Handelt die im Register erkennbare Inhaberin/der Inhaber selbst, genügt nach diesem Vorschlag der Registerabgleich plus abgesicherte Kontoinhaberschaft; eine Ausweiskopie ist nicht automatisch erforderlich. Handelt eine andere Person, wird eine konkrete Vollmacht oder sonstige belastbare Bevollmächtigung nachgefordert. |
| Mögliche manuelle Registerprüfung | Name/Geschäftsbezeichnung, Standort, Gewerbewortlaut und Status im GISA; bei `e.U.` zusätzlich Firma, Rechtsform, Sitz und Vertretungsdaten im Firmenbuch. Prüfzeitpunkt, Quelle und Ergebnis werden auditiert, nicht der gesamte Registerinhalt kopiert. |
| Gezielte Nachforderung | Kein eindeutiger GISA-Treffer; Abweichung bei Name, Standort oder Gewerbe; unklare oder ruhende/erloschene Berechtigung; handelnde Person ist nicht die Inhaberin/der Inhaber; widersprüchliche Anschriften; Mehrfachkonto-/Missbrauchssignal; nachträgliche wesentliche Registeränderung. |

**Ausweisregel – Vorschlag:** Ein Identitätsnachweis darf nur risikobezogen
nachgefordert werden, wenn Identität oder Vertretung nicht mit milderen Mitteln
geklärt werden kann. Vor Einsatz einer Ausweiskopie müssen Zweck,
Rechtsgrundlage, erforderliche Datenfelder, Schwärzungsmöglichkeiten, Zugriff
und Löschfrist anwaltlich freigegeben sein. Alternativen wie eine kontrollierte
Live-Prüfung oder ein Nachweis ohne dauerhafte Kopie sind vorrangig zu bewerten.

## 5. Fall B – eingetragene Gesellschaften

Dies umfasst insbesondere GmbH, FlexCo/FlexKapG, OG, KG und AG. Sonderformen
oder ausländische Rechtsträger benötigen eine eigene spätere Regel.

| Prüfschritt | V1-Vorschlag |
|---|---|
| Minimale Onboarding-Angaben | Land, vollständige Firma, Rechtsform, Firmenbuchnummer, Sitz und Geschäftsanschrift, GISA-Zahl/Gewerbeberechtigung und Betriebsstandort, Name und Funktion der handelnden Person sowie Art der behaupteten Vertretung. UID nur, wenn sie für einen getrennt festgelegten Steuer-/Rechnungsvertrag erforderlich ist, nicht pauschal als KYB-Pflichtfeld. |
| Primärer Nachweis | Manueller aktueller Firmenbuchabgleich plus GISA-Abgleich. Ein vom Betrieb hochgeladener Firmenbuch- oder GISA-Auszug ist nur nach konkreter Notwendigkeitsentscheidung zu verlangen. |
| Vertretungsberechtigung | Im Firmenbuch eingetragene Einzelvertretung kann unmittelbar abgeglichen werden. Bei Gesamtvertretung müssen die erforderlichen Mitwirkenden oder eine wirksame Einzelvollmacht nachgewiesen werden. Nicht eingetragene Mitarbeitende legen eine konkrete Vollmacht/Beauftragung vor. Eine Ausweiskopie ist auch hier keine automatische Standardpflicht. |
| Mögliche manuelle Registerprüfung | Firma, Rechtsform, Sitz, Geschäftsanschrift, vertretungsbefugte Personen sowie Beginn und Art der Vertretung im Firmenbuch; Gewerbe, Standort und Gewerbewortlaut im GISA. WiEReG nur als anwaltlich freigegebener Eskalationsweg bei bestehender Zugriffsberechtigung und dokumentierter Notwendigkeit. |
| Gezielte Nachforderung | Firma/Firmenbuchnummer nicht eindeutig; Gesellschaft in Auflösung oder Vertretung unklar; Gesamtvertretung nicht erfüllt; Person nicht eingetragen und keine belastbare Vollmacht; GISA- und Firmenbuchdaten widersprechen einander; Gewerbestandort passt nicht; jüngste Registeränderung; konkrete Missbrauchs- oder Dublettenindikation. |

## 6. Vorgeschlagener manueller Status- und Auditverlauf

Die Bezeichnungen sind **Produktvorschläge** und vor Umsetzung mit dem
bestehenden technischen Statusmodell abzugleichen:

```text
DRAFT
→ SUBMITTED
→ IN_REVIEW
→ NEEDS_INFORMATION → SUBMITTED
→ VERIFIED oder REJECTED
```

- Jeder Übergang enthält Zeitpunkt, berechtigten Actor, Begründungscode und
  eine Request-/Correlation-Referenz.
- Dokumentersatz erzeugt eine neue Version; alte Versionen werden nicht
  stillschweigend überschrieben.
- `VERIFIED` bedeutet nur „manuelle KYB-Prüfung bestanden“. Die kommerzielle
  Aktivierung bleibt ein separater, expliziter Schritt mit Country-, Legal-,
  Privacy-, Billing-, Provider- und gegebenenfalls Tax-Gates.
- Nachforderung, Ablehnung und erneute Prüfung verändern keine historischen
  Auditereignisse.

## 7. Offene Entscheidungsmatrix

| Entscheidung | V1-Vorschlag | Vor verbindlicher Freigabe zu entscheiden |
|---|---|---|
| Verantwortlicher | Die tatsächlich operativ vertragschließende und über Zwecke/Mittel entscheidende Gesellschaft wird in Datenschutzhinweisen und Verarbeitungsverzeichnis benannt. | Welche bestehende oder geplante Gesellschaft ist vor und nach Gründung der WUXUAI Digital & Trading GmbH Verantwortlicher? Übergangsdatum und Verantwortungswechsel. |
| Zweck | Existenz-, Gewerbe- und Vertretungsprüfung vor manueller SaaS-Aktivierung; Betrugs- und Missbrauchsprävention; nachvollziehbare Prüfentscheidung. | Zwecke abschließend trennen und verbotene Sekundärnutzung festlegen. |
| Rechtsgrundlage | Anwaltlich prüfen, ob und in welchem Umfang vorvertragliche/vertragliche Erforderlichkeit und/oder berechtigtes Interesse tragen. Bei berechtigtem Interesse dokumentierte Interessenabwägung. Einwilligung nicht stillschweigend als Standardbasis verwenden. | Rechtsgrundlage je Datenkategorie und Verarbeitungsschritt, besonders Identitätsdokument/Vollmacht/Registerdaten. |
| Datenumfang | Register-first und Datenminimierung. Keine Ausweiskopie als Standard. Nur entscheidungsrelevante Felder speichern. | Exakter Pflicht-/Optional-Katalog je Rechtsform; zulässige Schwärzungen; ob irgendein Fall eine Kopie erfordert. |
| Zugriff | Owner nur eigener Tenant; Prüfer nur mit Platform-Admin-Rolle und TOTP/AAL2; technischer Zugriff strikt need-to-know und auditiert. | Namentliche Prüferrollen, Stellvertretung, Supportzugriff, Vier-Augen-Fälle und Auftragsverarbeiter. |
| Aufbewahrung | Frist je Status/Evidenzklasse ab Ereignis definieren; Dokumentinhalt so kurz wie erforderlich, Auditmetadaten getrennt. | Konkrete Fristen für unvollständige, abgelehnte, verifizierte und beendete Fälle; Hemmung bei Rechtsansprüchen; gesetzliche Pflichten. |
| Löschung | Keine pauschale Sofortlöschung oder unbegrenzte Speicherung. Geregelte Sperr-/Löschläufe; Dokumente und Auditmetadaten getrennt behandeln. | Wer löst Löschung aus, welche Nachweise bleiben, Umgang mit Betroffenenersuchen, Backups und Legal Hold. |
| Nachforderung | Nur begründet, datensparsam und fallbezogen; benötigte Information, sichere Antwortmöglichkeit und Frist nennen. | Zulässige Gründe, Frist, Erinnerungen, maximale Schleifen und Folgen bei Nichtantwort. |
| Ablehnung | Strukturierter Grund, interne Begründung und sachliche Mitteilung; keine automatische Aktivierung oder Trialanlage. | Ablehnungsgründe, Anhörung/Korrekturmöglichkeit, Beschwerdeweg, Wiederantrag und diskriminierungsfreie Kriterien. |
| Erneute Prüfung | Ereignisbasiert bei wesentlicher Register-, Vertretungs-, Rechtsform-, Standort- oder Risikoveränderung. | Ob zusätzlich periodisch geprüft wird; Intervalle, Trigger, Grace Period und Auswirkung auf aktive Betriebe. |
| Manuelle Aktivierung | Separater Platform-Admin-Schritt erst nach `VERIFIED` und allen übrigen Release-Gates; fail-closed; vollständig auditiert. | Ein-/Vier-Augen-Prinzip, Freigabekompetenz, Checkliste, Widerruf/Suspendierung und Kommunikation. |
| Registerabruf | GISA/Firmenbuch als Standard; nur notwendige Prüfergebnisse dokumentieren. | Bezahlter/beglaubigter Firmenbuchauszug wann nötig; WiEReG-Zugriffsberechtigung und Zweck ausdrücklich prüfen. |
| Informationspflichten | Vor Erhebung klare Datenschutzhinweise zu Verantwortlichem, Zweck, Rechtsgrundlage, Datenarten, Empfängern, Drittlandbezug, Dauer und Rechten. | Finaler Hinweistext, Auftragsverarbeiter, Transfermechanismen, Kontakt und Beschwerdestelle. |

## 8. Synthetischer Staging-Flow versus reales KYB

| Bereich | Synthetischer Staging-Nachweis | Reales KYB |
|---|---|---|
| Zweck | Technische Prüfung von Upload, privatem Download, Versionierung, Tenant-Isolation, AAL2-Adminansicht und Auditspur. | Fachliche Prüfung eines echten österreichischen Betriebs. |
| Daten | Eindeutig synthetischer `TEST_ONLY`-Tenant und harmlose Testdokumente. | Echte Unternehmens- und gegebenenfalls Personendaten. |
| Nachweisstand | Technischer Owner-/Admin-Flow ist auf Staging belegt. | **Nicht freigegeben und nicht durchgeführt.** |
| Wirkung | Restaurant und Subscription bleiben `PENDING_ACTIVATION`; keine Trial-, Entitlement-, Grant-, Billing- oder Stripe-Writes. | Muss dieselben Aktivierungsgrenzen behalten; reale Aktivierung erst nach gesonderter Freigabe. |
| Aussagekraft | Belegt Funktion und Sicherheitsmechanik, nicht rechtliche Zulässigkeit, Dokumentvollständigkeit oder materielle Echtheit. | Erfordert zuvor verbindliche Entscheidungen aus Abschnitt 7 und anwaltlich freigegebene Texte/Prozesse. |

Synthetische Testartefakte dürfen nicht als echte KYB-Evidenz umgedeutet
werden. In diesem Entscheidungsloop werden keine realen Dokumente gesammelt,
keine Freigabe erteilt und kein Trial gestartet.

## 9. Fragen für die anwaltliche Freigabe

1. Wer ist in der Gründungs-/Übergangsphase und danach datenschutzrechtlich
   Verantwortlicher?
2. Welche Rechtsgrundlage trägt jeden Verarbeitungsschritt und ist eine
   dokumentierte Interessenabwägung erforderlich?
3. Reichen GISA-/Firmenbuchabgleich und Vollmacht in den beschriebenen Fällen;
   wann wäre ein zusätzlicher Identitätsnachweis wirklich erforderlich?
4. Falls Identitätsprüfung nötig ist: Genügt eine Prüfung ohne dauerhafte
   Ausweiskopie oder mit geschwärzten Daten?
5. Welche Dokumenttypen sind je Rechtsform Pflicht, optional oder unzulässig?
6. Welche konkreten Aufbewahrungs-, Sperr- und Löschfristen gelten je Status?
7. Darf und soll WUXUAI WiEReG-Daten abrufen; auf welcher Zugriffs- und
   Rechtsgrundlage?
8. Welche Nachforderungs-, Ablehnungs-, Wiederantrags- und Beschwerderegeln
   gelten?
9. Welche Änderungen lösen eine erneute Prüfung aus?
10. Genügt eine berechtigte AAL2-Prüferperson oder ist für bestimmte Schritte
    ein Vier-Augen-Prinzip erforderlich?

## 10. Freigabekriterium für eine verbindliche V1-Regel

Reales KYB darf erst geöffnet werden, wenn die Entscheidungsmatrix vollständig
entschieden, anwaltlich geprüft, in Datenschutzhinweisen und internen
Prüfanweisungen umgesetzt und technisch erneut getestet wurde. Die Freigabe
muss den finalen Dokumentkatalog, die Rechtsgrundlagen, Zugriffskompetenzen,
Fristen und den separaten Aktivierungsvertrag ausdrücklich benennen.
