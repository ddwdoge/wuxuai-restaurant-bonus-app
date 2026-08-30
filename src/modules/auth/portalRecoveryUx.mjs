import { buildStaffLoginPath, normalizeStaffRestaurantSlug } from "./staffLoginFlow.mjs";

const PUBLIC_PORTALS = new Set(["customer", "staff", "owner"]);

export function normalizePublicPortal(value) {
  return PUBLIC_PORTALS.has(value) ? value : "owner";
}

export function buildPasswordRecoveryPath(portal, staffSlug = null) {
  const normalizedPortal = normalizePublicPortal(portal);
  const search = new globalThis.URLSearchParams({ portal: normalizedPortal });
  const normalizedStaffSlug = normalizedPortal === "staff"
    ? normalizeStaffRestaurantSlug(staffSlug)
    : null;
  if (normalizedStaffSlug) search.set("restaurant", normalizedStaffSlug);
  return `/auth/forgot-password?${search.toString()}`;
}

export function readPasswordRecoveryContext(searchLike) {
  const search = new globalThis.URLSearchParams(
    typeof searchLike === "string" ? searchLike.replace(/^\?/, "") : searchLike,
  );
  const portal = normalizePublicPortal(search.get("portal"));
  return {
    portal,
    staffSlug: portal === "staff" ? normalizeStaffRestaurantSlug(search.get("restaurant")) : null,
  };
}

export function recoveryLoginPath(context) {
  if (context?.portal === "customer") return "/customer/login";
  if (context?.portal === "staff") return buildStaffLoginPath(context.staffSlug);
  return "/restaurant/login";
}

export function portalLoginLinks(currentPortal) {
  const links = [
    { portal: "customer", label: "Kundenbereich", path: "/customer/login" },
    { portal: "staff", label: "Mitarbeiterbereich", path: "/staff/login" },
    { portal: "owner", label: "Restaurant-Portal", path: "/restaurant/login" },
  ];
  return links.filter((link) => link.portal !== normalizePublicPortal(currentPortal));
}
