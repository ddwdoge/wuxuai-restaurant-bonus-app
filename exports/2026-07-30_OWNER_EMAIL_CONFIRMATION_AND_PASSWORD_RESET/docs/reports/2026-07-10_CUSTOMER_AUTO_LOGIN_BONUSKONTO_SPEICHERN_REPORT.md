# WUXUAI Bonus V1

## Customer Auto-Login und Bonuskonto speichern

Datum: 2026-07-10

Status: LOCK

## Gelesene Bible-Dateien

- `AGENTS.md`
- `docs/00_START_HIER.md`
- `docs/05_CUSTOMER_PORTAL.md`
- `docs/09_FLOW_02_GAST_WERDEN.md`
- `docs/18_CODEX_REGELN.md`

Hinweis: `docs/21_CODEX_SELBSTKONTROLL_LOOP.md` wurde im Projekt nicht gefunden.

## Aufgabe

Kunden sollen sich nach der ersten Registrierung auf demselben Geraet nicht erneut registrieren muessen. Das Bonuskonto wird lokal ueber den Customer Token gemerkt und beim erneuten Oeffnen serverseitig validiert.

## Geaenderte Dateien

- `src/modules/customer/CustomerPortal.tsx`
- `src/modules/customer/ReferralLanding.tsx`
- `src/modules/customer/customerTokenStorage.ts`

## Auto-Login Logik

Beim Oeffnen von `/w/:restaurantSlug` oder `/customer/:restaurantSlug`:

1. Das System liest lokal gespeicherte Customer Tokens.
2. Wenn fuer den Restaurant-Slug ein Token vorhanden ist, wird er an `get_public_customer_portal` uebergeben.
3. Die RPC validiert den Token serverseitig.
4. Wenn der Token gueltig ist, wird direkt das Kundenkonto oder Punkte-sammeln angezeigt.
5. Wenn der Token ungueltig ist, wird er lokal geloescht und der Gast sieht den normalen Einstieg.

## localStorage Key

Neuer zentraler Key:

```text
wuxuai_customer_tokens
```

Struktur:

```json
{
  "restaurant-slug": {
    "customer_token": "...",
    "restaurant_id": null,
    "saved_at": "...",
    "customer_name": "..."
  }
}
```

Der bisherige Einzel-Key `wuxuai-customer-token:{restaurantSlug}` wird weiterhin als Fallback gelesen und beim Speichern parallel gesetzt, damit bestehende Kunden nicht ausgesperrt werden.

## Token-Validierung

Die Validierung bleibt serverseitig ueber:

```text
get_public_customer_portal(input_restaurant_slug, input_customer_token)
```

Wenn Supabase `customer token not valid` meldet:

- lokaler Token wird entfernt
- alter Fallback-Key wird entfernt
- Registrierung / normaler Einstieg bleibt moeglich
- keine Kundendaten werden lokal aus dem Token vertraut

## Kunden-UX

Nach erfolgreicher Registrierung:

- Titel: `Dein Bonuskonto ist gespeichert`
- Hinweis: `Du kannst deine Punkte jederzeit auf diesem Handy ansehen.`
- Hinweis: `Wenn du diesen Restaurant-QR später wieder scannst, wirst du automatisch erkannt.`
- Buttons: `Mein Bonus öffnen`, `Link kopieren`
- Hinweis zum Home-Bildschirm

Wenn `/customer/:slug` ohne gueltigen Token geoeffnet wird:

- Hinweis: `Du bist auf diesem Gerät noch nicht angemeldet.`
- Button: `Restaurant-QR scannen oder neu beitreten`

Beim Punkte sammeln mit erkanntem Token:

- Anzeige: `Willkommen zurück, [Vorname]`
- kein Registrierungsformular
- bestehender Punkte-sammeln-Flow bleibt unveraendert

## QR-Erklaerung

Der persoenliche Kunden-QR wird klarer beschrieben:

- `Dein persönlicher Bonus-QR`
- `Mit diesem QR kommst du jederzeit zurück zu deinem Bonuskonto.`
- `Speichere ihn oder öffne dein Bonuskonto direkt über diesen Link.`

Damit bleibt die Trennung erhalten:

- Persoenlicher Bonus-QR: eigenes Bonuskonto oeffnen
- Restaurant-Bonus-QR: Punkte nach dem Bezahlen sammeln

## Datenschutz-Hinweis

Es wird nicht behauptet, dass das System automatisch private Handy-Daten ausliest.

Verwendeter Hinweis:

```text
Dieses Gerät ist mit deinem Bonuskonto verbunden.
```

Es werden lokal nur gespeichert:

- Customer Token
- Restaurant-Slug als Schluessel
- Speicherzeitpunkt
- Kundenname fuer Hilfsanzeige
- `restaurant_id` bleibt `null`, weil diese ID im sicheren Public-Portal-Payload nicht benoetigt und nicht oeffentlich erforderlich ist.

## Build Ergebnis

`npm run build` wurde erfolgreich ausgefuehrt.

## Selbstpruefung

- Keine SMS eingebaut.
- Kein WhatsApp eingebaut.
- Kein Passwort eingebaut.
- Kein OTP eingebaut.
- Keine native App eingebaut.
- Keine Punkteberechnung geaendert.
- Keine Tages-PIN-Regel geaendert.
- Keine Reward-Einloesung geaendert.
- Keine Datenbank geaendert.
- Keine RPC geaendert.
- Sichtbare Texte sind Deutsch.

## Offene Risiken

- Kein echter Browser-Test mit leerem localStorage, Registrierung und erneutem QR-Scan wurde in diesem Durchlauf ausgefuehrt.
- Wenn ein Browser localStorage blockiert, funktioniert das Bonuskonto weiterhin ueber den Link, aber Auto-Login kann nicht gespeichert werden.

## Ergebnis

Status: LOCK
