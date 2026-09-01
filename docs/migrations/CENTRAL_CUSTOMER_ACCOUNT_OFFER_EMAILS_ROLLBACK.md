# Rollback: zentraler Kundenaccount und Angebots-E-Mails

Migrationen:

- `20260804002000_central_customer_account_offer_emails.sql`
- `20260804003000_central_customer_login_restaurant_context.sql`

## Sichere Feature-Deaktivierung

Die Angebots-E-Mails werden ohne Schemaänderung deaktiviert:

```sql
update public.customer_offer_email_delivery_settings
set delivery_enabled = false,
    provider_status = 'PAUSED',
    updated_at = now()
where id = true;
```

Der zentrale Kundenbereich kann im Frontend ausgeblendet werden, ohne
restaurantbezogene Kundenzugänge, Memberships, Punkte oder Rewards zu ändern.
Die Auth-basierten RPC-Grants können zusätzlich für `authenticated` entzogen
werden. Die vorhandenen restaurantbezogenen Kundenzugänge bleiben dabei
unverändert nutzbar.

## Vollständiger Schema-Rollback

Ein vollständiges Entfernen der neuen Tabellen und Funktionen ist destruktiv
und darf nicht ungeprüft erfolgen. Vorher müssen Einwilligungsnachweise,
Widerrufe, Delivery-Logs und gesetzliche Aufbewahrungspflichten bewertet und
gegebenenfalls exportiert werden. Historische Migrationen werden nicht geändert
oder gelöscht.

RLS, bestehende `customers`, `customer_qr_tokens`, Punkte-, Reward-, QR- und
Legal-Tabellen bleiben von der Migration unangetastet.

Auch die Auth-Verknüpfung (`auth_user_id`) und Profilspalten dürfen nicht
ungeprüft entfernt werden. Vor einem Schema-Rollback sind zentrale Accounts,
Membership-Verknüpfungen und bestehende Restauranttokens zu sichern. Ein
Rollback darf niemals Punkte, Rewards, Geschenke oder Einlösungen löschen oder
Konten allein anhand von Telefonnummern zusammenführen.
