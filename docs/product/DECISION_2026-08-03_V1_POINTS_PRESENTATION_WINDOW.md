# Decision 2026-08-03: V1 Punkte-Präsentationsfenster

Status: **LOCKED**

## Entscheidung

Normale Punktebelohnungen werden nach ausdrücklicher Kundenbestätigung
serverseitig sofort und endgültig belastet. Der Kunde erhält danach ein
15-minütiges Präsentationsfenster, das das Restaurantpersonal ausschließlich
visuell kontrolliert.

Der bisherige sechsstellige Staff-Code entfällt nur für normale
Punktebelohnungen. Willkommens- und Geburtstagsgeschenke behalten ihren
bestehenden sechsstelligen, serverseitig verbrauchten Code.

## Serververtrag

- Punkte, Reward-Status, Journal und Audit werden atomar geschrieben.
- `activated_at` und `expires_at` stammen vom Server.
- Statusfolge: `REDEEMED_ACTIVE` zu `REDEEMED_COMPLETED`.
- Reload, Browserwechsel und mehrere Tabs starten kein neues Zeitfenster.
- Idempotenz ist je Restaurant, Kunde und Bestätigungs-ID erzwungen.
- Pro Kunde und Punktebelohnung existiert höchstens ein aktives Fenster.
- Der visuelle Sicherheitswert wechselt serverseitig alle zehn Sekunden und ist
  kein Authentifizierungsmerkmal.

## Storno

Nur Restaurant-Owner oder dokumentierter Plattform-Support dürfen stornieren.
Eine Stornierung verlangt eine Begründung und schreibt Audit, Journalstatus und
Punkterückbuchung atomar. Der Kunde kann nicht selbst stornieren.

## Abgrenzung

- keine Bonnummer
- keine POS- oder Kassenintegration
- keine Mitarbeiter-PIN
- kein QR-Scan für die Einlösung
- keine Änderung des Geschenk-Einlösecodes

## Legal

Die neue Teilnahmebedingungs-Vorlage bleibt
`DRAFT_LEGAL_REVIEW_REQUIRED`. Vor Production ist eine unabhängige
österreichische Rechtsprüfung erforderlich.
