# Decision: Zentraler Kundenlogin und Restaurantkontext

Datum: 2026-08-04  
Status: **LOCKED / V1**

## Entscheidung

V1 verwendet ein zentrales Kundenkonto mit Supabase Auth. E-Mail, Passwort und
E-Mail-Bestätigung ersetzen die frühere passwortlose Gastanmeldung. WUXUAI
speichert kein eigenes Passwort.

Ein Restaurant-QR setzt ausschließlich den Restaurantkontext. Nach Anmeldung
bleibt der gescannte Slug erhalten. Eine Membership wird nur nach ausdrücklicher
Bestätigung, aktueller Legal Readiness und serverseitiger Tenantprüfung erstellt.

## Identität und Memberships

- `customer_accounts` bleibt die einzige zentrale Customer Identity.
- `auth_user_id` bindet sie eindeutig an `auth.users`.
- Restaurantbezogene `customers`-Zeilen bleiben Source of Truth für Punkte,
  Rewards, Geschenke, Besuche und Einlösungen.
- Bestehende Memberships werden nur mit gültigem geheimem Restauranttoken
  verknüpft. Telefonnummer, Geburtstag und Gerätekennung genügen nicht.
- Beitritt und erneutes Öffnen sind idempotent und restaurantgebunden.

## Navigation und Angebote

Die zentrale Navigation besteht aus `Start`, `Meine Lokale`, `Entdecken` und
`Konto`. Es gibt keinen global gemischten Angebotsfeed. Angebotsbadges dürfen in
`Meine Lokale` erscheinen; die vollständige Liste wird erst im ausgewählten
Restaurantkontext geladen.

## Sicherheit

Konto- und Membership-RPCs verlangen `authenticated`, prüfen `auth.uid()` und
besitzen einen festen `search_path`. Direkte Tabellenrechte bleiben entzogen.
Restauranttokens, Auth-Tokens und Passwörter erscheinen nicht in Logs, Audit,
Analytics oder URLs.

## Ersetzte Regeln

Diese Entscheidung ersetzt für Kunden die bisherigen LOCKS `kein Passwort`,
`keine E-Mail-Pflicht`, `kein Supabase Auth` sowie die zentrale Navigation mit
`Aktuelles`. Die Sperren für SMS, WhatsApp, globale Punktesummen und
restaurantübergreifende Daten bleiben bestehen.
