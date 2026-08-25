export const emptyPortalAccess = Object.freeze({
  authenticated: false,
  customer_access: false,
  owner_access: false,
  staff_access: false,
  platform_access: false,
  preferred_staff_slug: null,
});

function destination(path, label) {
  return { path, label };
}

export function portalDestination(portal, access) {
  if (portal !== "owner" && access.owner_access) return destination("/admin", "Zum Restaurantbereich");
  if (portal !== "staff" && access.staff_access) {
    const path = access.preferred_staff_slug
      ? `/staff/${encodeURIComponent(access.preferred_staff_slug)}`
      : "/staff";
    return destination(path, "Zum Mitarbeiterbereich");
  }
  if (portal !== "customer" && access.customer_access) return destination("/customer", "Zur Kundenansicht");
  if (portal !== "platform" && access.platform_access) return destination("/platform-admin", "Zum WUXUAI Admin");
  return null;
}

export function wrongPortalCopy(portal, access) {
  if (portal === "customer") {
    if (access.owner_access) return "Du bist mit einem Restaurantbetreiber-Konto angemeldet.";
    if (access.staff_access) return "Du bist mit einem Mitarbeiterkonto angemeldet.";
    if (access.platform_access) return "Du bist mit einem internen WUXUAI-Konto angemeldet.";
    return "Dieses Konto besitzt keinen Zugang zum Kundenbereich.";
  }
  if (portal === "owner") {
    if (access.staff_access && !access.owner_access) return "Dieses Konto ist als Mitarbeiter registriert und hat keinen Betreiberzugang.";
    if (access.customer_access) return "Dieses Konto hat keinen Restaurantbetreiber-Zugang.";
    if (access.platform_access) return "Dieses interne Konto hat keinen Restaurantbetreiber-Zugang.";
    return "Für dieses Konto ist kein Restaurantbetreiber-Zugang eingerichtet.";
  }
  if (portal === "staff") {
    return "Dieses Konto hat keinen Mitarbeiterzugang zu diesem Restaurant.";
  }
  return "Dieses Konto hat keinen Zugriff auf den WUXUAI Admin.";
}

export function portalLoginPath(portal, staffSlug = null) {
  if (portal === "customer") return "/customer/login";
  if (portal === "staff") return staffSlug
    ? `/staff/login?restaurant=${encodeURIComponent(staffSlug)}`
    : "/staff/login";
  return "/restaurant/login";
}
