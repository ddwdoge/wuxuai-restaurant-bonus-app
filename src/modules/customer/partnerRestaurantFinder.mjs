function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("de-AT")
    .trim();
}

export function filterPartnerRestaurants(locations, query) {
  const needle = normalizeSearchText(query);
  if (!needle) return [...locations];

  return locations.filter((location) => normalizeSearchText([
    location.name,
    location.address,
    location.postal_code,
    location.city,
  ].filter(Boolean).join(" ")).includes(needle));
}

export function distanceInKilometers(origin, destination) {
  const toRadians = (value) => value * (Math.PI / 180);
  const earthRadius = 6371;
  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function sortPartnerRestaurants(locations) {
  return [...locations].sort((left, right) => {
    const leftMembership = left.membership;
    const rightMembership = right.membership;
    const leftAvailable = leftMembership?.available_rewards?.length ?? 0;
    const rightAvailable = rightMembership?.available_rewards?.length ?? 0;
    if (Boolean(leftAvailable) !== Boolean(rightAvailable)) return rightAvailable - leftAvailable;

    const leftExpiry = leftMembership?.available_rewards
      ?.map((reward) => reward.expires_at ? Date.parse(reward.expires_at) : Number.POSITIVE_INFINITY)
      .reduce((earliest, value) => Math.min(earliest, value), Number.POSITIVE_INFINITY) ?? Number.POSITIVE_INFINITY;
    const rightExpiry = rightMembership?.available_rewards
      ?.map((reward) => reward.expires_at ? Date.parse(reward.expires_at) : Number.POSITIVE_INFINITY)
      .reduce((earliest, value) => Math.min(earliest, value), Number.POSITIVE_INFINITY) ?? Number.POSITIVE_INFINITY;
    if (leftExpiry !== rightExpiry) return leftExpiry - rightExpiry;

    const leftMissing = leftMembership?.next_reward?.missing_points ?? Number.POSITIVE_INFINITY;
    const rightMissing = rightMembership?.next_reward?.missing_points ?? Number.POSITIVE_INFINITY;
    if (leftMissing !== rightMissing) return leftMissing - rightMissing;

    const leftVisit = leftMembership?.last_visit_at ? Date.parse(leftMembership.last_visit_at) : 0;
    const rightVisit = rightMembership?.last_visit_at ? Date.parse(rightMembership.last_visit_at) : 0;
    if (leftVisit !== rightVisit) return rightVisit - leftVisit;

    const leftDistance = left.distance_km ?? Number.POSITIVE_INFINITY;
    const rightDistance = right.distance_km ?? Number.POSITIVE_INFINITY;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;

    return left.name.localeCompare(right.name, "de-AT");
  });
}

export function googleMapsUrl(location, mode = "search") {
  const coordinates = `${location.latitude},${location.longitude}`;
  const url = new globalThis.URL(mode === "directions"
    ? "https://www.google.com/maps/dir/"
    : "https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set(mode === "directions" ? "destination" : "query", coordinates);
  return url.toString();
}

export function markerStatus(location) {
  const membership = location.membership;
  if (!membership?.registered) return "partner";
  if ((membership.available_rewards?.length ?? 0) > 0) return "reward";
  if ((membership.next_reward?.missing_points ?? Number.POSITIVE_INFINITY) <= 20) return "near";
  if ((membership.points_balance ?? 0) > 0) return "member";
  return "registered";
}
