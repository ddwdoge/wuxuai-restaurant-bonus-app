export function customerSwitcherMemberships(memberships, currentSlug, query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("de");
  return memberships
    .filter((membership) => membership.membership_status === "active")
    .filter((membership) => {
      if (!normalizedQuery || membership.slug === currentSlug) return true;
      return [membership.name, membership.city, membership.postal_code]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("de").includes(normalizedQuery));
    })
    .sort((left, right) => {
      if (left.slug === currentSlug) return -1;
      if (right.slug === currentSlug) return 1;
      return left.name.localeCompare(right.name, "de");
    });
}
