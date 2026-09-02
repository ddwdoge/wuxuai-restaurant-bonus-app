# WUXUAI® Bonus Auth email templates

These source-controlled templates cover the active hosted Supabase Auth flows:

- `confirmation.html`: signup confirmation and resend confirmation
- `recovery.html`: password recovery
- `invite.html`: new Staff account invitation
- `magic-link.html`: existing-account Staff continuation

Language is selected from `user_metadata` in this order:
`preferred_language`, `account_language`, `app_language`,
`browser_language`, then English. Supported values are `de`, `en`, `fr`,
`it`, `es`, `zh`, and `ko`.

Hosted Supabase does not load these files automatically. They must be reviewed
and copied to the matching Production Auth template fields in a separate
Founder-approved configuration step. The secure `ConfirmationURL` remains the
CTA target. No token or URL is reconstructed in template code.

Subject templates use the same language expression. Until the hosted template
configuration is applied and verified, Auth localization is a documented
deployment limitation rather than a live Production PASS.

The reviewed localized subject catalog is stored in
`authTemplateSubjects.mjs`. Hosted Supabase requires those subject values and
the matching HTML to be configured in the dashboard; repository files alone
do not mutate the hosted Auth service.
