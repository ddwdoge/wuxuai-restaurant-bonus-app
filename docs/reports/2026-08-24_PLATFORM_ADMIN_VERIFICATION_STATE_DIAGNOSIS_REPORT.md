# WUXUAI Bonus - Platform Admin Verification State Diagnosis

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Staging: `wuxuai-bonus-staging` (`bwhv...qaya`)  
Auth User: `office@wuxuaisbi.com`  
Auth User ID: `5ef968ee-5c8f-44c7-9c32-369e302e457b`

## Autoritativer Auth-Zustand

- Exakte Auth-Treffer: 1
- `created_at`: `2026-08-24T12:25:31.466572Z`
- `invited_at`: `2026-08-24T12:25:31.500586Z`
- `email_confirmed_at`: `2026-08-24T12:31:50.306088Z`
- `confirmation_sent_at`: leer nach abgeschlossener Bestaetigung
- `recovery_sent_at`: leer
- `last_sign_in_at`: `2026-08-24T12:40:58.372552Z`
- `updated_at`: `2026-08-24T12:40:59.423683Z`
- Account aktiv: Ja
- Gebannt oder geloescht: Nein
- Identity Provider: `email`
- Identity-E-Mail stimmt exakt ueberein: Ja
- Identity `email_verified`: Ja

Es wurden keine Token, Cookies, Passwoerter oder Secrets gelesen oder
dokumentiert.

## Ereigniszuordnung

Die Auth-Identitaet wurde mit dem Admin-Invite-Flow angelegt. `invited_at` ist
gesetzt und liegt vor `email_confirmed_at`. Damit ist die E-Mail-Bestaetigung
dem Invite zuzuordnen. Der spaetere Passwortvorgang ist nicht die autoritative
Quelle der Verifikation. `recovery_sent_at` ist im aktuellen Auth-Datensatz
nicht gesetzt.

## Plattformrolle

- Zuordnungen fuer die Auth-ID: 1
- Aktive Zuordnung `platform_admin`: 1
- Aktive Platform-Admins gesamt: 1
- Andere aktive Platform-Admins: 0
- Doppelter Auth-User: Nein

Die Rolle stammt weiterhin ausschliesslich aus `public.platform_admins`.
Client-Metadaten, Owner-, Staff- oder Customer-Rollen verleihen keinen
Plattformzugriff.

## Ursache des Warte-Status

Im aktiven Anwendungscode existiert kein Statusfeld und kein sichtbarer Text
`WAITING FOR VERIFICATION`. Der einzige aktuelle Treffer war der zuvor
erzeugte Korrekturbericht mit `WAITING FOR EMAIL CONFIRMATION`. Dieser Bericht
bildete den Snapshot unmittelbar nach dem Invite ab, als
`email_confirmed_at` noch leer war.

Die aktive Auth-Pruefung der Anwendung verwendet
`Boolean(user.email_confirmed_at)`. Mit dem aktuellen Supabase-Datensatz ergibt
diese Logik `true`. Falls das Supabase-Dashboard weiterhin einen Wartezustand
zeigt, ist diese Anzeige gegenueber dem autoritativen User-Endpunkt veraltet und
muss neu geladen werden; eine manuelle Bestaetigung oder Datenbankaenderung ist
nicht erforderlich.

## Login und Route

`last_sign_in_at` belegt einen erfolgreichen Auth-Anmeldevorgang nach der
E-Mail-Bestaetigung. Ein erneuter Passworttest wurde nicht automatisiert, weil
Codex das Benutzerpasswort weder anfordern noch verarbeiten soll. Die aktuelle
Codex-Browsersitzung enthaelt keine angemeldete App-Seite. Deshalb ist der reale
Aufruf von `/platform-admin` noch nicht beobachtet und bleibt ein separates
Gate.

Bei der Beziehungspruefung wurden ausserdem eine Restaurant-Ownership und eine
Restaurant-Membership fuer dieselbe Auth-ID gefunden. Diese Beziehungen
erteilen keine Plattformrolle und aendern die serverseitige
Plattformautorisierung nicht. Sie sind jedoch unerwartet fuer eine rein interne
Identitaet und muessen separat fachlich geprueft werden; in diesem Auftrag
wurden sie nicht veraendert.

## Migrationen und Sicherheit

- `20260824003000_platform_admin_foundation_hardening.sql`: angewendet
- `20260824004000_authenticated_referral_registration_bridge.sql`: nicht angewendet
- Manuelle E-Mail-Bestaetigung: nicht durchgefuehrt
- Neuer Auth-User: nicht angelegt
- Neue Platform-Admin-Zuordnung: nicht angelegt
- RLS-, Grant- und Plattform-Security-Logik: unveraendert
- Platform-Admin-Vertragstests: 9/9 PASS

## Finales Route-Update

Die reale bestaetigte Browser-Sitzung wurde anschliessend erfolgreich geprueft:

- `/platform-admin`: geladen, keine Umleitung, kein 403, keine Warnung
- Plattformrolle sichtbar: `Plattform Admin`
- Globaler geschuetzter Restaurant-Read: 8 Restaurants geladen
- `/admin/platform/audit`: globaler geschuetzter Audit-Read geladen
- Normaler `/admin`-Pfad: weiterhin ausschliesslich eigener Restaurantkontext
- Browserkonsole: keine Warnungen oder Fehler in den geprueften Flows

Die Mixed-Role-Beziehung ist technisch sicher getrennt. Die unbeabsichtigte
Owner-Beziehung bleibt wegen der unveraenderbaren, per Foreign Key an den
Tenant gebundenen Audit-Historie vorerst erhalten. Eine pauschale
Tenantloeschung wuerde Auditzeilen kaskadierend entfernen und ist deshalb in
diesem Auftrag unzulaessig.

Status: **PLATFORM ADMIN FOUNDATION READY**
