const STAFF_RESTAURANT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeStaffRestaurantSlug(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized.length <= 160 && STAFF_RESTAURANT_SLUG.test(normalized) ? normalized : null;
}

export function buildStaffLoginPath(restaurantSlug) {
  const slug = normalizeStaffRestaurantSlug(restaurantSlug);
  return slug ? `/staff/login?restaurant=${encodeURIComponent(slug)}` : "/staff/login";
}

export function staffSlugFromLegacyPath(pathname) {
  const match = /^\/staff\/([^/?#]+)\/?$/.exec(typeof pathname === "string" ? pathname : "");
  if (!match || match[1] === "login") return null;
  try {
    return normalizeStaffRestaurantSlug(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

export function isIndividualStaffRole(role) {
  return role === "staff" || role === "supervisor";
}
