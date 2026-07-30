# Decision: V1 Restaurant First, V2 Deferred

Datum: 2026-07-30
Status: LOCKED

## Entscheidung

V1 wird als restaurantfokussierte Verkaufsfassung unter der Positionierung
**WUXUAI Restaurant Bonus** fertiggestellt. Das Produkt ist ein digitales
Bonusprogramm fuer Restaurants und Cafes. Ziel sind Pilotfaehigkeit, erste
zahlende Restaurants und belastbares Marktfeedback.

Die branchenneutrale Produktfassung mit Branchenprofilen, neutraler
Terminologie und Bonusprogramm-Assistent wird als V2 archiviert. Sie wird bis
zu einer ausdruecklichen Freigabe des Product Owners weder in V1 gemischt noch
weiterentwickelt oder deployed.

## Technische Referenzen

- V1-Branch: `release/v1-restaurant-bonus`
- V1-Ausgangscommit: `b9b26475c76e0a9925288ea07096a15f713d4d38`
- Bevorzugte Referenz: `2026-07-30_FULL_STAGING_TEST_DATA_RESET.zip`
- Codegleiche Referenz: `2026-07-30_ONBOARDING_STATUS_CONSTRAINT_FIX.zip`
- V2-Archivbranch: `future/v2-business-neutral`
- V2-Snapshot: `c79a2b05b70328fa564f6e87cf4a1921e8f9f999`
- V2-Tag: `v2-business-neutral-snapshot-2026-07-30`

## V1-Regeln

- Restaurant- und Cafe-Sprache ist gewuenscht.
- Das Onboarding bleibt auf einen Standort und einen Restaurantbetrieb
  fokussiert.
- Willkommensgeschenke bleiben eine Mehrfachauswahl mit mindestens einem
  Geschenk; empfohlen sind drei bis fuenf. Die spaetere Zuteilung erfolgt
  serverseitig zufaellig.
- Die Punkteeinloesung verwendet den durchschnittlichen Bon, Besuche und die
  gesperrte Restaurant-V1-Berechnung mit Gastro-Kategorien.
- Branchenprofile, branchenspezifische Dropdowns und der
  Bonusprogramm-Assistent gehoeren nicht in V1.
- In V1 sind nur Bugfixes, Sicherheit, Stabilitaet, notwendige
  UX-Vereinfachung und Verkaufsreife zulaessig.

## Unveraenderte Sicherheitsbasis

Alle Migrationen und Sicherheitskorrekturen bis einschliesslich
`20260730001000_onboarding_status_allow_completed.sql` bleiben Teil von V1.
Historische Migrationen werden nicht geloescht oder zurueckgerollt. RLS,
Tenant-Isolation, Customer Identity ohne SMS, QR-Kontext, Legal Readiness,
Audit, Reward-Einloesung und Tages-PIN bleiben unveraendert.

## Freigaberegel fuer V2

V2 darf erst wieder aufgenommen werden, wenn erste zahlende V1-Kunden und
echtes Marktfeedback vorliegen und der Product Owner die Fortsetzung
ausdruecklich freigibt.
