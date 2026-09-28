-- PRO package/add-on hardening: a cancelled capacity add-on remains effective
-- only through a finite, explicit paid period. This migration does not create
-- purchases, provider state, entitlements or commercial releases.

begin;

alter table public.restaurant_capacity_addon_entitlements
  add constraint restaurant_capacity_addon_cancelled_period_required
  check (status <> 'CANCELLED' or effective_until is not null)
  not valid;

-- Validation is deliberately fail-closed. Existing malformed rows must be
-- investigated rather than rewritten or silently grandfathered.
alter table public.restaurant_capacity_addon_entitlements
  validate constraint restaurant_capacity_addon_cancelled_period_required;

comment on constraint restaurant_capacity_addon_cancelled_period_required
  on public.restaurant_capacity_addon_entitlements is
  'Cancelled add-on capacity remains effective only until an explicit exclusive period end.';

commit;
