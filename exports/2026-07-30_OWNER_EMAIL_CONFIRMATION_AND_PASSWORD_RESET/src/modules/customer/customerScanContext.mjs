const customerRoutePattern = /^\/(customer|w)\/([^/?#]+)\/?$/;
const restaurantSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reservedCustomerPaths = new Set(["restaurants"]);

export function readCustomerScanContext(pathname) {
  if (typeof pathname !== "string") return null;

  const match = customerRoutePattern.exec(pathname);
  if (!match) return null;

  let restaurantSlug;
  try {
    restaurantSlug = decodeURIComponent(match[2]).trim().toLowerCase();
  } catch {
    return null;
  }

  if (!restaurantSlugPattern.test(restaurantSlug)
    || (match[1] === "customer" && reservedCustomerPaths.has(restaurantSlug))) return null;

  return {
    restaurantSlug,
    routeKind: match[1] === "w" ? "collect" : "portal",
  };
}

export function customerPortalInstanceKey(context, customerToken, historyRevision = 0) {
  return `${context.routeKind}:${context.restaurantSlug}:${customerToken ?? ""}:${historyRevision}`;
}
