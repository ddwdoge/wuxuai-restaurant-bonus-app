export type CustomerScanContext = {
  restaurantSlug: string;
  routeKind: "collect" | "portal";
};

export function readCustomerScanContext(pathname: unknown): CustomerScanContext | null;
export function customerPortalInstanceKey(
  context: CustomerScanContext,
  customerToken: string | null | undefined,
  historyRevision?: number,
): string;
