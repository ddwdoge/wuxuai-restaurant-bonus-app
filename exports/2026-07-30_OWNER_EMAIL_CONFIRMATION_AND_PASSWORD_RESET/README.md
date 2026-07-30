# WUXUAI Restaurant Growth OS

Multi-tenant SaaS foundation for restaurants with three separated interfaces:

- Admin Portal for owners and managers
- Staff Tablet Mode for QR/customer actions with staff PIN confirmation
- Customer Portal for white-label loyalty, coupons, QR code, and referrals

MVP exclusions: no AI, no POS/cashier integration, no inventory, no ERP.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Apply the Supabase migration in `supabase/migrations` before connecting a real project.
