import type { CustomerAccountMembership } from "./customerAccountService";

export function customerSwitcherMemberships(
  memberships: CustomerAccountMembership[],
  currentSlug: string,
  query?: string,
): CustomerAccountMembership[];
