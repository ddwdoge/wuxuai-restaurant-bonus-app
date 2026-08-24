# WUXUAI Bonus - Platform Admin Authorized Email Correction

Datum: 2026-08-24  
Branch: `codex/v1-canonical-recovery`  
Staging: `wuxuai-bonus-staging` (`bwhv...qaya`)  
Korrekte Identitaet: `office@wuxuaisbi.com`

## Ursache

Die zuerst freigegebene Adresse `office@wuxusbi.com` enthielt einen Tippfehler:
In der Domain fehlte `ai`. Fuer diese falsche Adresse waren ein unbestaetigter
Supabase-Auth-User und eine aktive `platform_admins`-Zuordnung angelegt worden.

## Sichere Vorpruefung

Der falsche Auth-User wurde vor der Bereinigung eindeutig geprueft:

- Auth User ID: `a6927f7a-a781-4160-83b4-9b0fb8a9c4c0`
- E-Mail bestaetigt: Nein
- Letzter Login: keiner
- Profil: keiner
- Restaurant-Ownership: keine
- Restaurant-Membership: keine
- Customer-Verknuepfung: keine
- Customer-Account-Verknuepfung: keine
- Punktebuchungsversuche als Auth-Actor: keine
- Public-Audit-Eintraege als Actor: keine
- Aktive Platform-Admin-Zuordnung: genau eine

Die bestehenden Auth-Invite-Auditspuren wurden nicht geloescht oder
manipuliert.

## Bereinigung der falschen Identitaet

Die `platform_admins`-Zuordnung wurde zuerst deaktiviert. Anschliessend wurde
der nachweislich unbestaetigte und unbenutzte Auth-User ueber die privilegierte
Supabase-Admin-API entfernt. Der Foreign Key mit `on delete cascade` entfernte
die bereits deaktivierte Zuordnungszeile. Danach bestanden weder Auth-User noch
Platform-Admin-Zuordnung fuer die Tippfehler-Adresse.

## Korrekte Einladung

Vor der Einladung existierte kein Auth-User mit der exakten Adresse
`office@wuxuaisbi.com`. Ueber den internen Supabase-Admin-Invite-Flow wurde
genau ein neuer User angelegt:

- Auth User ID: `5ef968ee-5c8f-44c7-9c32-369e302e457b`
- Einladung API-Status: HTTP 200
- `confirmation_sent_at`: gesetzt
- E-Mail bestaetigt: Nein
- Redirect nach erfolgreicher Auth-Bestaetigung:
  `https://bonus.wuxuaisbi.com/platform-admin`

Der Invite-Endpunkt und die Supabase-Mail-Pipeline haben den Auftrag ohne
Fehler angenommen. Das beweist nicht den Eingang im Postfach. Die tatsaechliche
Zustellung und Bestaetigung muessen durch den Inhaber des Postfachs erfolgen.

## Autoritative Zuordnung

- Aktive Platform-Admins gesamt: 1
- Aktive Zuordnung fuer `office@wuxuaisbi.com`: 1
- Aktive Zuordnung fuer `office@wuxusbi.com`: 0
- Andere aktive Platform-Admins: 0
- Rolle: `platform_admin`

Die Rollenautoritaet bleibt ausschliesslich der aktive serverseitige Eintrag in
`public.platform_admins`. Restaurant-Ownership, Staff-/Customer-Rollen,
Client-Metadaten und lokale Browserdaten koennen keine Plattformrolle erzeugen.

## Security und Migrationen

- Plattformrollen-Vertragstest: 9/9 PASS.
- Owner-, Staff-, Customer- und Anon-Selbstbefoerderung bleiben blockiert.
- Client-Metadaten werden nicht als Plattformrollenquelle ausgewertet.
- Migration `20260824003000_platform_admin_foundation_hardening.sql` ist auf
  Staging angewendet.
- Migration `20260824004000_authenticated_referral_registration_bridge.sql`
  ist lokal vorhanden und auf Staging weiterhin nicht angewendet.
- Keine RLS-, Grant-, RPC- oder Produktlogik wurde in diesem Lauf geaendert.
- Production blieb gesperrt; Stripe blieb zurueckgestellt.

## Offenes Gate

Der Inhaber von `office@wuxuaisbi.com` muss die Einladung tatsaechlich
empfangen, oeffnen und die Auth-Bestaetigung abschliessen. Erst danach duerfen
der reale Login und `/platform-admin` geprueft werden. Bis diese beiden Schritte
erfolgreich sind, bleibt die Platform-Admin-Foundation nicht freigegeben und
Migration `04000` gesperrt.

## Verifikationsupdate 2026-08-24

Die spaetere autoritative Auth-Pruefung hat das bisherige Warte-Gate aufgehoben:

- `email_confirmed_at`: `2026-08-24T12:31:50.306088Z`
- E-Mail-Identity `email_verified`: Ja
- `last_sign_in_at`: `2026-08-24T12:40:58.372552Z`
- Konto aktiv, nicht gesperrt und nicht geloescht

Der fruehere Status `WAITING FOR EMAIL CONFIRMATION` war ein statischer
Berichtsstand aus der Zeit vor Annahme der Einladung. Er war kein separates
Anwendungs- oder Datenbankfeld. Der reale `/platform-admin`-Routentest bleibt
als eigenes Gate offen, bis er mit der bestehenden Benutzersitzung beobachtet
wurde.

Status: **AUTH VERIFIED - PLATFORM ROUTE TEST PENDING**
